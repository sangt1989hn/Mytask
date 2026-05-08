import { useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, fetchProjects, fetchTasks } from './supabase';
import type { Project, Task } from './types';
import { ProjectDetail } from './components/ProjectDetail';
import { ProjectModal } from './components/ProjectModal';
import { TaskViews } from './components/TaskViews';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (authLoading) return <div className="login-screen"><div className="login-card">Đang kiểm tra phiên đăng nhập...</div></div>;
  if (!session) return <Login />;
  return <Dashboard session={session} />;
}

// ============================================================
function Login() {
  const [mode, setMode] = useState<'magic' | 'password' | 'signup'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind:'success'|'error'; text:string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        setMsg({ kind:'success', text:'Đã gửi link đăng nhập đến email của bạn. Vui lòng kiểm tra hộp thư.' });
      } else if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        setMsg({ kind:'success', text:'Đăng ký thành công! Kiểm tra email để xác minh tài khoản.' });
      }
    } catch (err: any) {
      setMsg({ kind:'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={go}>
        <h1 className="login-title">📋 Quản lý công việc</h1>
        <p className="login-subtitle">
          {mode === 'magic' ? 'Đăng nhập bằng link gửi qua email — không cần mật khẩu.' :
           mode === 'password' ? 'Đăng nhập bằng email và mật khẩu.' :
           'Tạo tài khoản mới.'}
        </p>
        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="ban@example.com" />
        </div>
        {mode !== 'magic' && (
          <div className="form-group">
            <label className="form-label">Mật khẩu</label>
            <input type="password" className="form-input" required value={password} minLength={6}
              onChange={(e) => setPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width:'100%', justifyContent:'center', marginTop: 4 }}>
          {busy ? 'Đang xử lý...' : (mode === 'magic' ? 'Gửi link đăng nhập' : mode === 'password' ? 'Đăng nhập' : 'Đăng ký')}
        </button>
        {msg && <div className={`login-message ${msg.kind}`}>{msg.text}</div>}
        <div style={{ marginTop: 16, fontSize: 12, color:'var(--text-muted)', textAlign:'center' }}>
          {mode === 'magic' && <>Đã có mật khẩu? <a href="#" onClick={(e) => { e.preventDefault(); setMode('password'); }}>Đăng nhập bằng mật khẩu</a></>}
          {mode === 'password' && <>
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('magic'); }}>Dùng magic link</a> ·
            <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); }}> Đăng ký mới</a>
          </>}
          {mode === 'signup' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('password'); }}>Đã có tài khoản? Đăng nhập</a>}
        </div>
      </form>
    </div>
  );
}

// ============================================================
function Dashboard({ session }: { session: Session }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, ts] = await Promise.all([fetchProjects(), fetchTasks()]);
      setProjects(ps); setTasks(ts);
      // Auto-select first project on first load
      setCurrentProjectId((cur) => {
        if (cur && ps.find(p => p.id === cur)) return cur;
        return ps[0]?.id || null;
      });
    } catch (e: any) { alert('Lỗi tải dữ liệu: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const currentProject = projects.find(p => p.id === currentProjectId) || null;
  const projectTasks = currentProjectId
    ? tasks.filter(t => t.project_id === currentProjectId)
    : tasks;

  const total = projectTasks.length;
  const done = projectTasks.filter(t => t.status === 'done').length;

  async function logout() { await supabase.auth.signOut(); }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header"><div className="brand">📋 Quản lý công việc</div></div>

        <div className="sidebar-section">
          <span>Dự án</span>
          <button className="icon-btn" onClick={() => setCreatingProject(true)} title="Thêm dự án">+</button>
        </div>

        <div className="project-list">
          <div className={`project-item ${currentProjectId === null ? 'active' : ''}`} onClick={() => setCurrentProjectId(null)}>
            <span className="project-dot" style={{ background:'#94a3b8' }} />
            <span className="project-name">Tất cả công việc</span>
            <span className="project-count">{tasks.length}</span>
          </div>
          {projects.map(p => (
            <div key={p.id} className={`project-item ${currentProjectId === p.id ? 'active' : ''}`} onClick={() => setCurrentProjectId(p.id)}>
              <span className="project-dot" style={{ background: p.color }} />
              <span className="project-name">{p.name}</span>
              <button className="project-edit-btn" title="Sửa" onClick={(e) => { e.stopPropagation(); setEditingProject(p); }}>✎</button>
              <span className="project-count">{tasks.filter(t => t.project_id === p.id).length}</span>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-email">👤 {session.user.email}</div>
          <button onClick={logout} title="Đăng xuất" style={{ flex:1 }}>↪ Đăng xuất</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="topbar-title">{currentProject ? currentProject.name : 'Tất cả công việc'}</div>
            <div className="topbar-meta">{total} công việc · {done} đã xong</div>
          </div>
          <div className="topbar-spacer" />
          <input type="search" className="search-input" placeholder="Tìm kiếm..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="view-tabs">
            <button className={`view-tab ${view==='board' ? 'active' : ''}`} onClick={() => setView('board')}>Bảng</button>
            <button className={`view-tab ${view==='list' ? 'active' : ''}`} onClick={() => setView('list')}>Danh sách</button>
          </div>
        </div>

        <div className="content">
          {loading ? (
            <div className="empty-state"><div className="empty-emoji">⏳</div><p>Đang tải dữ liệu từ Supabase...</p></div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-emoji">📁</div>
              <h3>Bắt đầu với một dự án</h3>
              <p>Tạo dự án đầu tiên để quản lý công việc.</p>
              <button className="btn btn-primary" style={{ marginTop:12 }} onClick={() => setCreatingProject(true)}>+ Tạo dự án</button>
            </div>
          ) : currentProject ? (
            <ProjectDetail
              project={currentProject}
              tasks={projectTasks}
              allProjects={projects}
              view={view}
              search={search}
              onEditProject={(id) => setEditingProject(projects.find(p => p.id === id) || null)}
              onTaskChange={loadAll}
            />
          ) : (
            <TaskViews
              projectId={null}
              tasks={projectTasks}
              allProjects={projects}
              view={view}
              onChange={loadAll}
              search={search}
              groupByProject={true}
            />
          )}
        </div>
      </main>

      {(editingProject || creatingProject) && (
        <ProjectModal
          project={editingProject}
          onClose={() => { setEditingProject(null); setCreatingProject(false); }}
          onSaved={(id) => { setEditingProject(null); setCreatingProject(false); setCurrentProjectId(id); loadAll(); }}
          onDeleted={() => { setEditingProject(null); setCurrentProjectId(null); loadAll(); }}
        />
      )}
    </div>
  );
}
