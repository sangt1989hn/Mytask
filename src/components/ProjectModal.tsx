import { useState } from 'react';
import type { Project, ProjectStatus } from '../types';
import { COLORS } from '../types';
import { createProject, updateProject, deleteProject } from '../supabase';

interface Props {
  project: Project | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}

export function ProjectModal({ project, onClose, onSaved, onDeleted }: Props) {
  const isNew = !project;
  const [form, setForm] = useState({
    name: project?.name || '',
    description: project?.description || '',
    status: (project?.status || 'active') as ProjectStatus,
    due_date: project?.due_date || '',
    color: project?.color || COLORS[0]
  });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm({ ...form, [k]: v }); }

  async function save() {
    if (!form.name.trim()) { alert('Vui lòng nhập tên dự án'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        status: form.status,
        due_date: form.due_date || null,
        color: form.color
      };
      if (isNew) {
        const p = await createProject(payload);
        onSaved(p.id);
      } else {
        await updateProject(project!.id, payload);
        onSaved(project!.id);
      }
    } catch (e: any) { alert('Lỗi: ' + e.message); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!project) return;
    if (!confirm(`Xóa dự án "${project.name}"? Tất cả công việc, ảnh, tài liệu, ghi chú sẽ bị xóa.`)) return;
    setSaving(true);
    try {
      await deleteProject(project.id);
      onDeleted();
    } catch (e: any) { alert('Lỗi xóa: ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title">{isNew ? 'Dự án mới' : 'Chỉnh sửa dự án'}</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Tên dự án *</label>
            <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="vd: Triển khai NIC" />
          </div>
          <div className="form-group">
            <label className="form-label">Mô tả</label>
            <textarea className="form-textarea" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Mục tiêu, phạm vi..." />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Hạn hoàn thành</label>
              <input type="date" className="form-input" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select className="form-select" value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
                <option value="active">Đang hoạt động</option>
                <option value="paused">Tạm dừng</option>
                <option value="archived">Lưu trữ</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Màu sắc</label>
            <div className="color-picker">
              {COLORS.map(c => (
                <div key={c} className={`color-swatch ${c === form.color ? 'selected' : ''}`}
                  style={{ background: c }} onClick={() => set('color', c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {!isNew ? <button className="btn btn-danger" onClick={remove} disabled={saving}>Xóa dự án</button> : <span />}
          <div className="modal-footer-right">
            <button className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
