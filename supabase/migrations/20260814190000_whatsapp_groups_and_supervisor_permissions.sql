-- UNEM ISCAE: dynamic WhatsApp groups + granular supervisor UI permissions
create extension if not exists pgcrypto;

create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  specialization text not null,
  level text not null check (upper(level) in ('L1','L2','L3')),
  name text not null default 'مجموعة WhatsApp',
  url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_groups_scope_idx on public.whatsapp_groups (academic_year,specialization,level,is_active);
alter table public.whatsapp_groups enable row level security;
drop policy if exists "whatsapp public active read" on public.whatsapp_groups;
create policy "whatsapp public active read" on public.whatsapp_groups for select using (is_active or public.has_role(auth.uid(),'admin'));
drop policy if exists "whatsapp admin write" on public.whatsapp_groups;
create policy "whatsapp admin write" on public.whatsapp_groups for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table if not exists public.supervisor_permissions (
  email text primary key,
  upload_files boolean not null default true,
  delete_files boolean not null default false,
  manage_whatsapp boolean not null default false,
  manage_announcements boolean not null default false,
  send_notifications boolean not null default false,
  view_analytics boolean not null default false,
  manage_document_types boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.supervisor_permissions enable row level security;
drop policy if exists "supervisor perms admin all" on public.supervisor_permissions;
create policy "supervisor perms admin all" on public.supervisor_permissions for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
drop policy if exists "supervisor perms own read" on public.supervisor_permissions;
create policy "supervisor perms own read" on public.supervisor_permissions for select using (lower(email)=lower(coalesce(auth.jwt()->>'email','')));

-- Ensure existing admin/uploader role model remains unchanged.
