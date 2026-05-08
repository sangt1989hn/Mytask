-- ============================================================
-- TASK MANAGER v2 — SUPABASE SCHEMA
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  description text default '',
  color text default '#4f46e5',
  status text default 'active' check (status in ('active','paused','archived')),
  due_date date,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists projects_user_id_idx on projects(user_id);

create table if not exists tasks (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  parent_id uuid references tasks(id) on delete cascade,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text default '',
  status text default 'todo' check (status in ('todo','inprogress','waiting','done')),
  priority text default 'medium' check (priority in ('low','medium','high','urgent')),
  progress int default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  due_date date,
  estimated_hours numeric default 0,
  actual_hours numeric default 0,
  tags text[] default '{}',
  notes text default '',
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tasks_project_id_idx on tasks(project_id);
create index if not exists tasks_parent_id_idx on tasks(parent_id);
create index if not exists tasks_user_id_idx on tasks(user_id);

create table if not exists project_updates (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);
create index if not exists project_updates_project_id_idx on project_updates(project_id);

-- Product photos / images
create table if not exists project_images (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  storage_path text not null,
  file_name text not null,
  caption text default '',
  size_bytes bigint default 0,
  mime_type text,
  created_at timestamptz default now()
);
create index if not exists project_images_project_id_idx on project_images(project_id);

-- Documents (PDFs, specs, contracts, etc.)
create table if not exists project_documents (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint default 0,
  created_at timestamptz default now()
);
create index if not exists project_documents_project_id_idx on project_documents(project_id);

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at before update on projects
  for each row execute procedure public.handle_updated_at();

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks
  for each row execute procedure public.handle_updated_at();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table profiles enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table project_updates enable row level security;
alter table project_images enable row level security;
alter table project_documents enable row level security;

drop policy if exists "Users see own profile" on profiles;
create policy "Users see own profile" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users manage own projects" on projects;
create policy "Users manage own projects" on projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own tasks" on tasks;
create policy "Users manage own tasks" on tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own updates" on project_updates;
create policy "Users manage own updates" on project_updates for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own images" on project_images;
create policy "Users manage own images" on project_images for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own documents" on project_documents;
create policy "Users manage own documents" on project_documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- STORAGE BUCKETS
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('project-images', 'project-images', true),
  ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

-- Image bucket: public read, owner write/delete (images are organized in folders by user_id)
drop policy if exists "Image upload by owner" on storage.objects;
create policy "Image upload by owner" on storage.objects for insert
  with check (bucket_id = 'project-images' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Image read public" on storage.objects;
create policy "Image read public" on storage.objects for select
  using (bucket_id = 'project-images');

drop policy if exists "Image delete by owner" on storage.objects;
create policy "Image delete by owner" on storage.objects for delete
  using (bucket_id = 'project-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Document bucket: private — only owner can read/write/delete
drop policy if exists "Doc upload by owner" on storage.objects;
create policy "Doc upload by owner" on storage.objects for insert
  with check (bucket_id = 'project-documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Doc read by owner" on storage.objects;
create policy "Doc read by owner" on storage.objects for select
  using (bucket_id = 'project-documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Doc delete by owner" on storage.objects;
create policy "Doc delete by owner" on storage.objects for delete
  using (bucket_id = 'project-documents' and auth.uid()::text = (storage.foldername(name))[1]);
