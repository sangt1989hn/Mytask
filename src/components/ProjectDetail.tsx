import { useEffect, useState, useRef, useCallback } from 'react';
import type {
  Project, Task, ProjectUpdate, ProjectImage, ProjectDocument
} from '../types';
import { PROJECT_STATUS_LABELS } from '../types';
import {
  fetchUpdates, createUpdate, deleteUpdate,
  fetchImages, uploadImage, deleteImage, updateImageCaption, imagePublicUrl,
  fetchDocuments, uploadDocument, deleteDocument, getDocumentSignedUrl
} from '../supabase';
import { TaskViews } from './TaskViews';

function relativeTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} ngày trước`;
  return d.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1024/1024).toFixed(1)} MB`;
}
function formatDate(s: string | null) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function isOverdue(t: Task) {
  if (!t.due_date || t.status === 'done') return false;
  return t.due_date < new Date().toISOString().slice(0,10);
}

interface Props {
  project: Project;
  tasks: Task[];
  allProjects: Project[];
  view: 'board' | 'list';
  onEditProject: (id: string) => void;
  onTaskChange: () => void;
  search: string;
}

export function ProjectDetail({ project, tasks, allProjects, view, onEditProject, onTaskChange, search }: Props) {
  return (
    <div className="project-detail">
      <aside className="project-info-panel">
        <ProjectInfoCard project={project} tasks={tasks} onEdit={onEditProject} />
        <ProjectStats tasks={tasks} />
        <UpdatesSection projectId={project.id} />
        <ImageGallery projectId={project.id} />
        <DocumentList projectId={project.id} />
      </aside>
      <main className="project-tasks-panel">
        <TaskViews
          projectId={project.id}
          tasks={tasks}
          allProjects={allProjects}
          view={view}
          onChange={onTaskChange}
          search={search}
          groupByProject={false}
        />
      </main>
    </div>
  );
}

// ----------------------------------------------------------------
function ProjectInfoCard({ project, tasks, onEdit }: { project: Project; tasks: Task[]; onEdit: (id:string)=>void }) {
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return (
    <div className="pip-header" style={{ borderLeftColor: project.color }}>
      <div className="pip-status-row">
        <span className="project-dot" style={{ background: project.color }} />
        <span className={`pip-status ${project.status}`}>{PROJECT_STATUS_LABELS[project.status]}</span>
      </div>
      <h2 className="pip-name">{project.name}</h2>
      {project.description ? (
        <div className="pip-desc">{project.description}</div>
      ) : (
        <div className="pip-desc" style={{ fontStyle:'italic', opacity:.7 }}>Chưa có mô tả — bấm "Sửa" để thêm.</div>
      )}
      <div className="pip-meta-row">
        <span>📅 {project.due_date ? `Hạn: ${formatDate(project.due_date)}` : 'Chưa có hạn'}</span>
        <span>·</span>
        <span>{pct}% hoàn thành</span>
        <button className="pip-edit-btn" onClick={() => onEdit(project.id)}>✎ Sửa thông tin</button>
      </div>
    </div>
  );
}

function ProjectStats({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  const inProgress = tasks.filter(t => t.status === 'inprogress').length;
  const done = tasks.filter(t => t.status === 'done').length;
  const overdue = tasks.filter(t => isOverdue(t)).length;
  return (
    <div className="pip-stats">
      <div className="pip-stat"><div className="pip-stat-label">Tổng</div><div className="pip-stat-value">{total}</div></div>
      <div className="pip-stat"><div className="pip-stat-label">Đang làm</div><div className="pip-stat-value warning">{inProgress}</div></div>
      <div className="pip-stat"><div className="pip-stat-label">Hoàn thành</div><div className="pip-stat-value success">{done}</div></div>
      <div className="pip-stat"><div className="pip-stat-label">Quá hạn</div><div className="pip-stat-value danger">{overdue}</div></div>
    </div>
  );
}

// ----------------------------------------------------------------
function UpdatesSection({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProjectUpdate[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setItems(await fetchUpdates(projectId));
  }, [projectId]);

  useEffect(() => { setOpen(false); setDraft(''); load(); }, [projectId, load]);
  useEffect(() => { if (open) taRef.current?.focus(); }, [open]);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    await createUpdate(projectId, text);
    setDraft(''); setOpen(false);
    load();
  }
  async function remove(id: string) {
    if (!confirm('Xóa cập nhật này?')) return;
    await deleteUpdate(id); load();
  }

  return (
    <div className="pip-section">
      <div className="pip-section-header">
        <h3>Cập nhật / Ghi chú dự án</h3>
        <span className="pip-section-count">{items.length}</span>
        <button className={`pip-section-add ${open ? 'cancel' : ''}`} onClick={() => { setOpen(!open); if (open) setDraft(''); }}>
          {open ? '✕ Đóng' : '+ Thêm'}
        </button>
      </div>
      {open && (
        <div className="update-input-area">
          <textarea
            ref={taRef}
            className="update-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); add(); }
              else if (e.key === 'Escape') { setOpen(false); setDraft(''); }
            }}
            placeholder="Ví dụ: Dự án tạm dừng do khách hàng yêu cầu... / Phát sinh vấn đề..."
          />
          <div className="update-input-actions">
            <span className="update-hint">Ctrl+Enter để lưu, Esc để đóng</span>
            <button className="btn btn-primary" onClick={add} style={{ fontSize:12, padding:'5px 12px' }}>+ Lưu</button>
          </div>
        </div>
      )}
      <div className="updates-list">
        {items.length === 0 ? (
          <div className="section-empty">Chưa có cập nhật nào.<br/>Bấm <strong>+ Thêm</strong> để ghi chú đầu tiên.</div>
        ) : items.map(u => (
          <div key={u.id} className="update-item">
            <div className="update-item-time">{relativeTime(u.created_at)}</div>
            <div className="update-item-content">{u.content}</div>
            <button className="update-delete-btn" onClick={() => remove(u.id)} title="Xóa">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
function ImageGallery({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProjectImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ProjectImage | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setItems(await fetchImages(projectId)), [projectId]);
  useEffect(() => { setPreview(null); load(); }, [projectId, load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) {
          alert(`"${f.name}" không phải ảnh — bỏ qua.`); continue;
        }
        if (f.size > 10 * 1024 * 1024) {
          alert(`"${f.name}" quá 10MB — bỏ qua.`); continue;
        }
        await uploadImage(projectId, f);
      }
      await load();
    } catch (e: any) {
      alert('Lỗi upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function remove(img: ProjectImage) {
    if (!confirm(`Xóa ảnh "${img.file_name}"?`)) return;
    await deleteImage(img); load();
  }

  async function editCaption(img: ProjectImage) {
    const c = prompt('Chú thích cho ảnh:', img.caption || '');
    if (c === null) return;
    await updateImageCaption(img.id, c); load();
  }

  return (
    <div className="pip-section">
      <div className="pip-section-header">
        <h3>📷 Ảnh sản phẩm</h3>
        <span className="pip-section-count">{items.length}</span>
        <button className="pip-section-add" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? '⏳ Đang tải...' : '+ Thêm ảnh'}
        </button>
        <input
          ref={inputRef} type="file" multiple accept="image/*"
          style={{ display:'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <div
        className={`upload-dropzone ${dragOver ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        Kéo thả ảnh vào đây hoặc click để chọn (tối đa 10MB / ảnh)
      </div>
      {items.length > 0 && (
        <div className="image-grid">
          {items.map(img => (
            <div key={img.id} className="image-tile" onClick={() => setPreview(img)}>
              <img src={imagePublicUrl(img.storage_path)} alt={img.file_name} loading="lazy" />
              {img.caption && <div className="image-tile-caption">{img.caption}</div>}
              <button
                className="image-tile-delete"
                onClick={(e) => { e.stopPropagation(); remove(img); }}
                title="Xóa ảnh"
              >×</button>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div className="image-preview-overlay" onClick={() => setPreview(null)}>
          <img src={imagePublicUrl(preview.storage_path)} alt={preview.file_name} onClick={(e) => e.stopPropagation()} />
          <button className="image-preview-close" onClick={() => setPreview(null)}>×</button>
          <div className="image-preview-caption" onClick={(e) => { e.stopPropagation(); editCaption(preview); }}>
            {preview.caption || 'Click để thêm chú thích...'} · {preview.file_name}
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
function fileExt(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toUpperCase() : 'FILE';
}

function DocumentList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProjectDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => setItems(await fetchDocuments(projectId)), [projectId]);
  useEffect(() => { load(); }, [projectId, load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > 50 * 1024 * 1024) {
          alert(`"${f.name}" quá 50MB — bỏ qua.`); continue;
        }
        await uploadDocument(projectId, f);
      }
      await load();
    } catch (e: any) {
      alert('Lỗi upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function open(d: ProjectDocument) {
    try {
      const url = await getDocumentSignedUrl(d.storage_path, 60);
      window.open(url, '_blank');
    } catch (e: any) {
      alert('Không mở được: ' + e.message);
    }
  }
  async function remove(d: ProjectDocument) {
    if (!confirm(`Xóa tài liệu "${d.file_name}"?`)) return;
    await deleteDocument(d); load();
  }

  return (
    <div className="pip-section">
      <div className="pip-section-header">
        <h3>📎 Tài liệu</h3>
        <span className="pip-section-count">{items.length}</span>
        <button className="pip-section-add" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? '⏳ Đang tải...' : '+ Thêm tài liệu'}
        </button>
        <input
          ref={inputRef} type="file" multiple
          style={{ display:'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <div
        className={`upload-dropzone ${dragOver ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        Kéo thả file vào đây hoặc click để chọn (PDF, DOCX, XLSX... tối đa 50MB)
      </div>
      {items.length === 0 ? (
        <div className="section-empty">Chưa có tài liệu nào.</div>
      ) : (
        <div className="doc-list">
          {items.map(d => (
            <div key={d.id} className="doc-item">
              <div className="doc-icon">{fileExt(d.file_name).slice(0,4)}</div>
              <div className="doc-info">
                <div className="doc-name" onClick={() => open(d)} title="Click để mở">{d.file_name}</div>
                <div className="doc-meta">{formatBytes(d.size_bytes)} · {relativeTime(d.created_at)}</div>
              </div>
              <button className="doc-delete" onClick={() => remove(d)} title="Xóa">🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
