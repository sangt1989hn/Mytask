export type Status = 'todo' | 'inprogress' | 'waiting' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
  due_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  user_id: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number;
  actual_hours: number;
  tags: string[];
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface ProjectImage {
  id: string;
  project_id: string;
  user_id: string;
  storage_path: string;
  file_name: string;
  caption: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  user_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
}

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'Cần làm',
  inprogress: 'Đang làm',
  waiting: 'Đang chờ',
  done: 'Hoàn thành'
};
export const STATUS_ORDER: Status[] = ['todo', 'inprogress', 'waiting', 'done'];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp'
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Đang hoạt động',
  paused: 'Tạm dừng',
  archived: 'Lưu trữ'
};

export const COLORS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'
];
