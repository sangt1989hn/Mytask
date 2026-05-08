import { useEffect, useState, useMemo } from 'react';
import type { Project, Task, Status, Priority } from '../types';
import { STATUS_LABELS, STATUS_ORDER, PRIORITY_LABELS } from '../types';
import { createTask, updateTask, deleteTask } from '../supabase';

function isOverdue(t: Task) {
  if (!t.due_date || t.status === 'done') return false;
  return t.due_date < new Date().toISOString().slice(0,10);
}
function formatDate(s: string | null) {
  if (!s) return '';
  const d = new Date(s); return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' });
}
function statusDot(s: Status) {
  const c = { todo:'#94a3b8', inprogress:'#3b82f6', waiting:'#f59e0b', done:'#10b981' }[s];
  return <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:c }} />;
}
const todayStr = () => new Date().toISOString().slice(0,10);

interface Props {
  projectId: string | null;       // null = all tasks
  tasks: Task[];                  // already filtered by project (or all)
  allProjects: Project[];
  view: 'board' | 'list';
  onChange: () => void;
  search: string;
  groupByProject: boolean;
}

export function TaskViews({ projectId, tasks, allProjects, view, onChange, search, groupByProject }: Props) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<{ status?: Status; project_id?: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedProj, setCollapsedProj] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.description||'').toLowerCase().includes(q) ||
      (t.tags||[]).some(tag => tag.toLowerCase().includes(q))
    );
  }, [tasks, search]);

  function toggleSubs(id: string) {
    const s = new Set(collapsed); s.has(id) ? s.delete(id) : s.add(id); setCollapsed(s);
  }
  function toggleProj(id: string) {
    const s = new Set(collapsedProj); s.has(id) ? s.delete(id) : s.add(id); setCollapsedProj(s);
  }

  async function toggleDone(t: Task) {
    const newStatus: Status = t.status === 'done' ? 'todo' : 'done';
    await updateTask(t.id, { status: newStatus, progress: newStatus === 'done' ? 100 : t.progress });
    onChange();
  }

  if (filtered.length === 0 && !projectId && allProjects.length === 0) {
    return <div className="empty-state"><div className="empty-emoji">📁</div><h3>Chưa có dự án</h3><p>Tạo dự án đầu tiên ở thanh bên trái.</p></div>;
  }

  return (
    <>
      {view === 'board' ? (
        <BoardView tasks={filtered} allProjects={allProjects} projectId={projectId}
          collapsed={collapsed} onToggleSubs={toggleSubs}
          onCreate={(status: Status) => setCreating({ status, project_id: projectId || allProjects[0]?.id })}
          onEdit={setEditing} onToggleDone={toggleDone} />
      ) : (
        <ListView tasks={filtered} allProjects={allProjects} projectId={projectId}
          groupByProject={groupByProject && projectId === null}
          collapsed={collapsed} collapsedProj={collapsedProj}
          onToggleSubs={toggleSubs} onToggleProj={toggleProj}
          onEdit={setEditing} onToggleDone={toggleDone} />
      )}
      {(editing || creating) && (
        <TaskModal
          task={editing}
          defaults={creating || undefined}
          allProjects={allProjects}
          allTasks={tasks}
          currentProjectId={projectId}
          onClose={() => { setEditing(null); setCreating(null); }}
          onSaved={() => { setEditing(null); setCreating(null); onChange(); }}
          onDeleted={() => { setEditing(null); onChange(); }}
        />
      )}
    </>
  );
}

// ============================================================
function BoardView(props: any) {
  const { tasks, allProjects, projectId, collapsed, onToggleSubs, onCreate, onEdit, onToggleDone } = props;
  const parents: Task[] = tasks.filter((t: Task) => !t.parent_id);
  const subs: Task[] = tasks.filter((t: Task) => t.parent_id);

  const byStatus: Record<Status, { task: Task; isSub: boolean; subCount?: number }[]> = {
    todo: [], inprogress: [], waiting: [], done: []
  };
  parents.forEach((p) => {
    const mySubs = subs.filter((s) => s.parent_id === p.id);
    byStatus[p.status].push({ task: p, isSub: false, subCount: mySubs.length });
    if (!collapsed.has(p.id)) {
      mySubs.forEach((s) => byStatus[s.status].push({ task: s, isSub: true }));
    }
  });
  subs.forEach((s) => {
    if (!parents.find((p) => p.id === s.parent_id)) {
      byStatus[s.status].push({ task: s, isSub: true });
    }
  });

  return (
    <div className="board">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="board-col">
          <div className="board-col-header">
            {statusDot(status)} {STATUS_LABELS[status]}
            <span className="board-col-count">{byStatus[status].length}</span>
          </div>
          <div className="board-col-body">
            {byStatus[status].map(({ task, isSub, subCount }) => (
              <TaskCard key={task.id} task={task} isSub={isSub} subCount={subCount}
                allProjects={allProjects} allTasks={tasks} projectId={projectId}
                collapsed={collapsed.has(task.id)}
                onToggleSubs={() => onToggleSubs(task.id)}
                onEdit={() => onEdit(task)} onToggleDone={() => onToggleDone(task)}
              />
            ))}
            <button className="board-col-add" onClick={() => onCreate(status)}>+ Thêm công việc</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskCard({ task, isSub, subCount, allProjects, allTasks, projectId, collapsed, onToggleSubs, onEdit, onToggleDone }: any) {
  const t: Task = task;
  const proj = allProjects.find((p: Project) => p.id === t.project_id);
  const overdue = isOverdue(t);
  const isToday = t.due_date === todayStr();
  const dueClass = overdue ? 'overdue' : (isToday ? 'today' : '');
  const isDone = t.status === 'done';
  const parent = isSub && t.parent_id ? allTasks.find((x: Task) => x.id === t.parent_id) : null;
  const doneSubs = !isSub ? allTasks.filter((s: Task) => s.parent_id === t.id && s.status === 'done').length : 0;
  const cardClasses = ['task-card'];
  if (isSub) cardClasses.push('subtask');
  if (!isSub && (subCount||0) > 0) cardClasses.push('has-subs');

  return (
    <div className={cardClasses.join(' ')} onClick={onEdit}>
      <div className="task-card-header">
        <input type="checkbox" className="task-card-checkbox" checked={isDone} onChange={onToggleDone} onClick={(e) => e.stopPropagation()} />
        <div className="task-card-content">
          {parent && <div className="parent-ref">↳ thuộc: {parent.title}</div>}
          <div className={`task-card-title ${isDone ? 'done' : ''}`}>
            {!isSub && (subCount||0) > 0 && (
              <button className="toggle-subs" onClick={(e) => { e.stopPropagation(); onToggleSubs(); }}>{collapsed ? '▶' : '▼'}</button>
            )}
            {t.title}
            {!isSub && (subCount||0) > 0 && <span className="sub-count-pill">{doneSubs}/{subCount}</span>}
          </div>
          {t.description && <div className="task-card-desc">{t.description}</div>}
          {t.progress > 0 && t.progress < 100 && (
            <div className="progress-bar"><div className="progress-fill" style={{ width: t.progress + '%' }} /></div>
          )}
          <div className="task-card-meta">
            <span className={`badge badge-priority-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
            {!projectId && proj && (
              <span className="badge" style={{ background: proj.color + '22', color: proj.color }}>{proj.name}</span>
            )}
            {t.due_date && <span className={`badge badge-due ${dueClass}`}>📅 {formatDate(t.due_date)}</span>}
            {(t.tags||[]).slice(0,3).map((tag: string) => <span key={tag} className="badge badge-tag">{tag}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
function ListView(props: any) {
  const { tasks, allProjects, projectId, groupByProject, collapsed, collapsedProj, onToggleSubs, onToggleProj, onEdit, onToggleDone } = props;

  if (groupByProject && projectId === null) {
    const byProj = new Map<string, Task[]>();
    allProjects.forEach((p: Project) => byProj.set(p.id, []));
    tasks.forEach((t: Task) => {
      if (byProj.has(t.project_id)) byProj.get(t.project_id)!.push(t);
    });
    return (
      <div className="list-view">
        <ListHeader />
        {allProjects.map((p: Project) => {
          const projTasks = byProj.get(p.id) || [];
          const isCollapsed = collapsedProj.has(p.id);
          const done = projTasks.filter((t: Task) => t.status === 'done').length;
          const inP = projTasks.filter((t: Task) => t.status === 'inprogress').length;
          const overdue = projTasks.filter((t: Task) => isOverdue(t)).length;
          return (
            <div key={p.id} className="project-group">
              <div className="project-group-header" style={{ borderLeftColor: p.color }} onClick={() => onToggleProj(p.id)}>
                <span className="project-group-toggle">{isCollapsed ? '▶' : '▼'}</span>
                <span className="project-dot" style={{ background: p.color }} />
                <span className="project-group-name">{p.name}</span>
                <span className="project-group-stats">
                  <span className="pill">{projTasks.length} công việc</span>
                  {done > 0 && <span className="pill success">{done} xong</span>}
                  {inP > 0 && <span className="pill warning">{inP} đang làm</span>}
                  {overdue > 0 && <span className="pill danger">{overdue} quá hạn</span>}
                </span>
                <span className="project-group-spacer" />
              </div>
              {!isCollapsed && (
                projTasks.length === 0
                  ? <div className="project-group-empty">Chưa có công việc nào.</div>
                  : <TaskRows tasks={projTasks} allProjects={allProjects} projectId={p.id}
                      collapsed={collapsed} onToggleSubs={onToggleSubs}
                      onEdit={onEdit} onToggleDone={onToggleDone} hideProjectLabel />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="list-view">
      <ListHeader />
      <TaskRows tasks={tasks} allProjects={allProjects} projectId={projectId}
        collapsed={collapsed} onToggleSubs={onToggleSubs}
        onEdit={onEdit} onToggleDone={onToggleDone} />
    </div>
  );
}

function ListHeader() {
  return (
    <div className="list-header">
      <div></div><div></div>
      <div>Tên công việc</div>
      <div>Trạng thái</div>
      <div>Hạn chót</div>
      <div>Ưu tiên</div>
      <div>Tiến độ</div>
      <div></div>
    </div>
  );
}

function TaskRows({ tasks, allProjects, projectId, collapsed, onToggleSubs, onEdit, onToggleDone, hideProjectLabel }: any) {
  const parents: Task[] = tasks.filter((t: Task) => !t.parent_id);
  const subs: Task[] = tasks.filter((t: Task) => t.parent_id);
  const ordered: { t: Task; isSub: boolean; subCount?: number }[] = [];
  parents.forEach((p) => {
    const mySubs = subs.filter((s) => s.parent_id === p.id);
    ordered.push({ t: p, isSub: false, subCount: mySubs.length });
    if (!collapsed.has(p.id)) mySubs.forEach((s) => ordered.push({ t: s, isSub: true }));
  });
  subs.forEach((s) => {
    if (!parents.find((p) => p.id === s.parent_id)) ordered.push({ t: s, isSub: true });
  });

  return <>{ordered.map(({ t, isSub, subCount }) => {
    const proj = allProjects.find((p: Project) => p.id === t.project_id);
    const overdue = isOverdue(t);
    const isToday = t.due_date === todayStr();
    const dueClass = overdue ? 'overdue' : (isToday ? 'today' : '');
    return (
      <div key={t.id} className={`list-row ${isSub ? 'subtask-row' : ''}`} onClick={() => onEdit(t)}>
        <div className="toggle-cell" onClick={(e) => { if (subCount) { e.stopPropagation(); onToggleSubs(t.id); }}}>
          {!isSub && (subCount||0) > 0 ? (collapsed.has(t.id) ? '▶' : '▼') : ''}
        </div>
        <input type="checkbox" className="task-card-checkbox" checked={t.status==='done'} onChange={() => onToggleDone(t)} onClick={(e) => e.stopPropagation()} />
        <div className="row-title-wrap"><span className={`row-title ${t.status==='done' ? 'done' : ''}`}>
          {t.title}
          {!isSub && (subCount||0) > 0 && <span className="sub-count-pill">{subCount}</span>}
          {!hideProjectLabel && !projectId && proj && <span style={{ color: proj.color, fontSize:11, marginLeft:6 }}>· {proj.name}</span>}
        </span></div>
        <div>{statusDot(t.status)} <span style={{ fontSize:12 }}>{STATUS_LABELS[t.status]}</span></div>
        <div>{t.due_date ? <span className={`badge badge-due ${dueClass}`}>{formatDate(t.due_date)}</span> : <span style={{ color:'var(--text-muted)', fontSize:12 }}>—</span>}</div>
        <div><span className={`badge badge-priority-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span></div>
        <div style={{ fontSize:12, color:'var(--text-muted)' }}>{t.progress}%</div>
        <div style={{ textAlign:'right' }}><button className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(t); }}>✎</button></div>
      </div>
    );
  })}</>;
}

// ============================================================
// TASK MODAL
// ============================================================
interface ModalProps {
  task: Task | null;
  defaults?: { status?: Status; project_id?: string };
  allProjects: Project[];
  allTasks: Task[];
  currentProjectId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function TaskModal({ task, defaults, allProjects, allTasks, currentProjectId, onClose, onSaved, onDeleted }: ModalProps) {
  const isNew = !task;
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    project_id: task?.project_id || defaults?.project_id || currentProjectId || allProjects[0]?.id || '',
    parent_id: task?.parent_id || '',
    status: (task?.status || defaults?.status || 'todo') as Status,
    priority: (task?.priority || 'medium') as Priority,
    progress: task?.progress || 0,
    start_date: task?.start_date || '',
    due_date: task?.due_date || '',
    estimated_hours: task?.estimated_hours || 0,
    actual_hours: task?.actual_hours || 0,
    tags: (task?.tags || []).join(', '),
    notes: task?.notes || ''
  });
  const [saving, setSaving] = useState(false);

  const parentCandidates = allTasks.filter(t => t.project_id === form.project_id && !t.parent_id && t.id !== task?.id);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm({ ...form, [k]: v }); }

  async function save() {
    if (!form.title.trim()) { alert('Vui lòng nhập tên công việc'); return; }
    setSaving(true);
    try {
      const payload: Partial<Task> = {
        title: form.title.trim(),
        description: form.description,
        project_id: form.project_id,
        parent_id: form.parent_id || null,
        status: form.status,
        priority: form.priority,
        progress: form.status === 'done' ? 100 : Number(form.progress) || 0,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        estimated_hours: Number(form.estimated_hours) || 0,
        actual_hours: Number(form.actual_hours) || 0,
        tags: form.tags.split(',').map(s => s.trim()).filter(Boolean),
        notes: form.notes
      };
      if (isNew) await createTask(payload);
      else await updateTask(task!.id, payload);
      onSaved();
    } catch (e: any) { alert('Lỗi: ' + e.message); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!task) return;
    const subCount = allTasks.filter(s => s.parent_id === task.id).length;
    const msg = subCount > 0 ? `Xóa luôn ${subCount} task con. Tiếp tục?` : 'Xóa công việc này?';
    if (!confirm(msg)) return;
    await deleteTask(task.id); onDeleted();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'Công việc mới' : 'Chỉnh sửa công việc'}</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Tên công việc *</label>
            <input className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea className="form-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Dự án *</label>
              <select className="form-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Task cha</label>
              <select className="form-select" value={form.parent_id} onChange={(e) => set('parent_id', e.target.value)}>
                <option value="">— Không có (task gốc) —</option>
                {parentCandidates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select className="form-select" value={form.status} onChange={(e) => set('status', e.target.value as Status)}>
                {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Mức độ</label>
              <select className="form-select" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tiến độ %</label>
              <input type="number" className="form-input" min={0} max={100} step={5} value={form.progress} onChange={(e) => set('progress', Number(e.target.value))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ngày bắt đầu</label>
              <input type="date" className="form-input" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hạn chót</label>
              <input type="date" className="form-input" value={form.due_date || ''} onChange={(e) => set('due_date', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Giờ dự kiến</label>
              <input type="number" className="form-input" step={0.5} min={0} value={form.estimated_hours} onChange={(e) => set('estimated_hours', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Giờ thực tế</label>
              <input type="number" className="form-input" step={0.5} min={0} value={form.actual_hours} onChange={(e) => set('actual_hours', Number(e.target.value))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Tags (cách nhau dấu phẩy)</label>
            <input className="form-input" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Ghi chú</label>
            <textarea className="form-textarea" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          {!isNew ? <button className="btn btn-danger" onClick={remove}>Xóa</button> : <span />}
          <div className="modal-footer-right">
            <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
