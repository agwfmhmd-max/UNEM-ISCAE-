-- =====================================================================
--  UNEM ISCAE — تأمين قسم النتائج (Résultats) + بيانات وصفية للملفات
--  ⚠️ نفّذ هذا الملف يدوياً في: Supabase → SQL Editor
--  آمن لإعادة التنفيذ (idempotent) — لا يحذف أي بيانات موجودة
-- =====================================================================

-- ---------- 1) جدول بيانات النتائج (ينشأ فقط إن لم يكن موجوداً) ----------
create table if not exists public.results_metadata (
  id            uuid primary key default gen_random_uuid(),
  academic_year text,
  major         text,
  level         text,
  semester      text,
  details_url   text,
  ranking_url   text,
  created_at    timestamptz not null default now()
);

-- ---------- 2) أعمدة البيانات الوصفية للملفات المدعومة ----------
alter table public.results_metadata add column if not exists original_name  text;
alter table public.results_metadata add column if not exists file_extension text;
alter table public.results_metadata add column if not exists mime_type      text;
alter table public.results_metadata add column if not exists file_size      bigint;
alter table public.results_metadata add column if not exists file_kind      text;   -- pdf | word | powerpoint | excel | image
alter table public.results_metadata add column if not exists resource_type  text;   -- raw | image
alter table public.results_metadata add column if not exists is_signed      boolean not null default false;
alter table public.results_metadata add column if not exists uploaded_by    uuid references auth.users(id) on delete set null;

-- نفس البيانات الوصفية لجدول الملفات العام
alter table public.documents add column if not exists file_extension text;
alter table public.documents add column if not exists file_kind      text;
alter table public.documents add column if not exists is_signed      boolean not null default false;

-- ---------- 3) الصلاحيات (Data API) ----------
grant select                         on public.results_metadata to anon;
grant select, insert, update, delete on public.results_metadata to authenticated;
grant all                            on public.results_metadata to service_role;

alter table public.results_metadata enable row level security;

-- ---------- 4) سياسات RLS ----------
-- القراءة عمومية: كل زائر يرى النتائج المنشورة
drop policy if exists "results_public_read" on public.results_metadata;
create policy "results_public_read"
  on public.results_metadata for select using (true);

-- الكتابة: المشرف الرئيسي (admin) والمشرفون (uploader) فقط
drop policy if exists "results_staff_insert" on public.results_metadata;
create policy "results_staff_insert"
  on public.results_metadata for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'uploader'));

drop policy if exists "results_staff_update" on public.results_metadata;
create policy "results_staff_update"
  on public.results_metadata for update to authenticated
  using       (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'uploader'))
  with check  (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'uploader'));

-- الحذف: المشرف الرئيسي فقط
drop policy if exists "results_admin_delete" on public.results_metadata;
create policy "results_admin_delete"
  on public.results_metadata for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ---------- 5) منح دور admin للمشرف الرئيسي تلقائياً ----------
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where lower(u.email) = 'agwfmhmd@gmail.com'
on conflict (user_id, role) do nothing;
