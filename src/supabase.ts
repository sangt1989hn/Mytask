import { createClient } from '@supabase/supabase-js';
import type {
  Project, Task, ProjectUpdate, ProjectImage, ProjectDocument
} from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ----------------------------------------------------------------
// PROJECTS
// ----------------------------------------------------------------
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects').select('*')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createProject(p: Partial<Project>): Promise<Project> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('projects')
    .insert({ ...p, user_id: user.id })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, patch: Partial<Project>) {
  const { error } = await supabase.from('projects').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id: string) {
  // images / documents in storage are NOT auto-deleted by DB cascade.
  // Fetch and remove them from storage first.
  const [{ data: imgs }, { data: docs }] = await Promise.all([
    supabase.from('project_images').select('storage_path').eq('project_id', id),
    supabase.from('project_documents').select('storage_path').eq('project_id', id)
  ]);
  if (imgs?.length) await supabase.storage.from('project-images').remove(imgs.map(i => i.storage_path));
  if (docs?.length) await supabase.storage.from('project-documents').remove(docs.map(d => d.storage_path));
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// TASKS
// ----------------------------------------------------------------
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks').select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTask(t: Partial<Task>): Promise<Task> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('tasks')
    .insert({ ...t, user_id: user.id })
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const { error } = await supabase.from('tasks').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// PROJECT UPDATES (notes feed)
// ----------------------------------------------------------------
export async function fetchUpdates(projectId: string): Promise<ProjectUpdate[]> {
  const { data, error } = await supabase
    .from('project_updates').select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function createUpdate(projectId: string, content: string): Promise<ProjectUpdate> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase.from('project_updates')
    .insert({ project_id: projectId, user_id: user.id, content })
    .select().single();
  if (error) throw error;
  return data;
}
export async function deleteUpdate(id: string) {
  const { error } = await supabase.from('project_updates').delete().eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// PROJECT IMAGES — public bucket, returns public URL
// ----------------------------------------------------------------
export async function fetchImages(projectId: string): Promise<ProjectImage[]> {
  const { data, error } = await supabase
    .from('project_images').select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadImage(projectId: string, file: File, caption = ''): Promise<ProjectImage> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${projectId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('project-images').upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('project_images').insert({
    project_id: projectId, user_id: user.id,
    storage_path: path, file_name: file.name, caption,
    size_bytes: file.size, mime_type: file.type
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateImageCaption(id: string, caption: string) {
  const { error } = await supabase.from('project_images').update({ caption }).eq('id', id);
  if (error) throw error;
}

export async function deleteImage(image: ProjectImage) {
  await supabase.storage.from('project-images').remove([image.storage_path]);
  const { error } = await supabase.from('project_images').delete().eq('id', image.id);
  if (error) throw error;
}

export function imagePublicUrl(storagePath: string): string {
  const { data } = supabase.storage.from('project-images').getPublicUrl(storagePath);
  return data.publicUrl;
}

// ----------------------------------------------------------------
// PROJECT DOCUMENTS — private bucket, returns signed URL
// ----------------------------------------------------------------
export async function fetchDocuments(projectId: string): Promise<ProjectDocument[]> {
  const { data, error } = await supabase
    .from('project_documents').select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function uploadDocument(projectId: string, file: File): Promise<ProjectDocument> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${user.id}/${projectId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('project-documents').upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('project_documents').insert({
    project_id: projectId, user_id: user.id,
    storage_path: path, file_name: file.name,
    size_bytes: file.size, mime_type: file.type
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDocument(doc: ProjectDocument) {
  await supabase.storage.from('project-documents').remove([doc.storage_path]);
  const { error } = await supabase.from('project_documents').delete().eq('id', doc.id);
  if (error) throw error;
}

export async function getDocumentSignedUrl(storagePath: string, expiresIn = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from('project-documents').createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
