-- =====================================================================
--  UNEM ISCAE — نظام الأدوار + جدول الملفات (Cloudinary)
--  قابل للتنفيذ مباشرة في: Supabase → SQL Editor
--  آمن لإعادة التنفيذ (idempotent)
-- =====================================================================

-- ---------- 1) نوع الأدوار ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'uploader', 'user');
  end if;
end
$$;

-- ---------- 2) جدول الأدوار ----------
create table if not exists public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles(user_id);

grant select on public.user_roles to authenticated;
grant all    on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- ---------- 3) دوال الصلاحيات (SECURITY DEFINER لتفادي التكرار في RLS) ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when bool_or(role = 'admin')    then 'admin'
              when bool_or(role = 'uploader') then 'uploader'
              else 'user'
            end
     from public.user_roles where user_id = auth.uid()),
    'user'
  );
$$;

create or replace function public.can_upload(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_user_id, 'admin') or public.has_role(_user_id, 'uploader');
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.can_upload(uuid) to authenticated;

-- ---------- 4) سياسات جدول الأدوار ----------
drop policy if exists "read own roles"      on public.user_roles;
drop policy if exists "admins read roles"   on public.user_roles;
drop policy if exists "admins manage roles" on public.user_roles;

create policy "read own roles"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

create policy "admins read roles"
on public.user_roles for select to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- منع تصعيد الصلاحيات: الإدراج/التعديل/الحذف للمشرف الرئيسي فقط
create policy "admins manage roles"
on public.user_roles for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- ---------- 5) جدول الملفات ----------
create table if not exists public.documents (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  original_name            text not null,
  source                   text not null default 'cloudinary'
                             check (source in ('cloudinary', 'supabase', 'github')),
  cloudinary_url           text,
  cloudinary_public_id     text,
  cloudinary_resource_type text not null default 'raw',
  folder                   text,
  storage_path             text,
  specialization           text not null check (specialization in ('BA','FC','TCM','GRH','SAE','IG')),
  level                    text not null check (level in ('L1','L2','L3')),
  semester                 text not null check (semester in ('S1','S2','S3','S4','S5','S6')),
  subject                  text not null,
  subject_code             text not null,
  file_type                text not null check (file_type in ('Cours','TD_TP','Devoir','Examen')),
  mime_type                text not null default 'application/pdf',
  file_size                bigint,
  status                   text not null default 'active' check (status in ('active','hidden','deleted')),
  uploaded_by              uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- فهارس الأداء (الاستعلام يتم دائماً بالتخصص/المستوى/الفصل/المادة)
create index if not exists documents_scope_idx
  on public.documents (specialization, level, semester, subject_code, status);
create index if not exists documents_type_idx    on public.documents (file_type);
create index if not exists documents_created_idx on public.documents (created_at desc);
create index if not exists documents_uploader_idx on public.documents (uploaded_by);
create index if not exists documents_name_trgm_idx on public.documents (lower(name));

grant select                         on public.documents to anon;
grant select, insert, update, delete on public.documents to authenticated;
grant all                            on public.documents to service_role;

alter table public.documents enable row level security;

-- ---------- 6) سياسات الملفات ----------
drop policy if exists "public read documents"   on public.documents;
drop policy if exists "uploaders insert"        on public.documents;
drop policy if exists "admins update documents" on public.documents;
drop policy if exists "admins delete documents" on public.documents;

-- الجميع (بما فيهم الزوار) يقرؤون الملفات النشطة فقط
create policy "public read documents"
on public.documents for select to anon, authenticated
using (status = 'active' or public.has_role(auth.uid(), 'admin'));

-- الرفع: admin أو uploader فقط، ويجب أن يكون uploaded_by هو نفسه صاحب الجلسة
create policy "uploaders insert"
on public.documents for insert to authenticated
with check (public.can_upload(auth.uid()) and uploaded_by = auth.uid());

-- التعديل والحذف: admin فقط
create policy "admins update documents"
on public.documents for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "admins delete documents"
on public.documents for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- ---------- 7) تحديث updated_at تلقائياً ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at
before update on public.documents
for each row execute function public.touch_updated_at();

-- ---------- 8) تعيين الأدوار حسب البريد (عند إنشاء الحساب) ----------
create or replace function public.assign_default_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _role public.app_role;
begin
  if lower(new.email) = 'agwfmhmd@gmail.com' then
    _role := 'admin';
  elsif lower(new.email) = 'unem-iscae@gmail.com' then
    _role := 'uploader';
  else
    _role := 'user';
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, _role)
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_assign_role on auth.users;
create trigger on_auth_user_created_assign_role
after insert on auth.users
for each row execute function public.assign_default_role();

-- ---------- 9) تعيين أدوار الحسابات الموجودة مسبقاً ----------
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users
where lower(email) = 'agwfmhmd@gmail.com'
on conflict (user_id, role) do nothing;

insert into public.user_roles (user_id, role)
select id, 'uploader'::public.app_role from auth.users
where lower(email) = 'unem-iscae@gmail.com'
on conflict (user_id, role) do nothing;

-- كل الحسابات الأخرى تصبح user
insert into public.user_roles (user_id, role)
select u.id, 'user'::public.app_role
from auth.users u
where lower(u.email) not in ('agwfmhmd@gmail.com', 'unem-iscae@gmail.com')
  and not exists (select 1 from public.user_roles r where r.user_id = u.id)
on conflict (user_id, role) do nothing;

-- ---------- 10) جدول التحليلات (إن لم يكن موجوداً) ----------
create table if not exists public.analytics (
  id            bigint generated by default as identity primary key,
  action_type   text not null,
  action_detail text,
  created_at    timestamptz not null default now()
);
create index if not exists analytics_created_idx on public.analytics (created_at desc);

grant insert on public.analytics to anon, authenticated;
grant select on public.analytics to authenticated;
grant all    on public.analytics to service_role;
grant usage, select on all sequences in schema public to anon, authenticated;

alter table public.analytics enable row level security;

drop policy if exists "anyone can log analytics" on public.analytics;
drop policy if exists "admins read analytics"    on public.analytics;

create policy "anyone can log analytics"
on public.analytics for insert to anon, authenticated
with check (true);

create policy "admins read analytics"
on public.analytics for select to authenticated
using (public.has_role(auth.uid(), 'admin'));
