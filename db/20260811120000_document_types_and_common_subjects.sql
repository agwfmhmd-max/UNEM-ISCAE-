-- =====================================================================
--  UNEM ISCAE — أنواع الملفات الديناميكية + المواد المشتركة
--  آمن تماماً على قاعدة بيانات تحتوي بيانات:
--   * لا يحذف أي جدول ولا أي عمود ولا أي سجل.
--   * لا يفقد: github_url / github_path / cloudinary_* / source / storage_path
--   * قابل لإعادة التنفيذ (idempotent)
--  ينفَّذ في: Supabase → SQL Editor  (بعد ملفات supabase/migrations السابقة)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) جدول أنواع الملفات (ديناميكي بالكامل — يديره المشرف الرئيسي)
-- ---------------------------------------------------------------------
create table if not exists public.document_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists document_types_active_idx on public.document_types (is_active, sort_order);

grant select                         on public.document_types to anon;
grant select, insert, update, delete on public.document_types to authenticated;
grant all                            on public.document_types to service_role;

alter table public.document_types enable row level security;

drop policy if exists "read active document types" on public.document_types;
drop policy if exists "admins manage document types" on public.document_types;

-- الجميع يقرأ الأنواع المفعّلة (المشرف الرئيسي يرى كل شيء)
create policy "read active document types"
on public.document_types for select to anon, authenticated
using (is_active or public.has_role(auth.uid(), 'admin'));

-- الإنشاء/التعديل/الحذف: المشرف الرئيسي فقط (على مستوى قاعدة البيانات)
create policy "admins manage document types"
on public.document_types for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists document_types_touch_updated_at on public.document_types;
create trigger document_types_touch_updated_at
before update on public.document_types
for each row execute function public.touch_updated_at();

-- الأنواع القديمة تُنشأ تلقائياً حتى لا يفقد أي ملف قديم تصنيفه
insert into public.document_types (name, slug, sort_order) values
  ('Cours',   'cours',  10),
  ('TD / TP', 'td_tp',  20),
  ('Devoir',  'devoir', 30),
  ('Examen',  'examen', 40)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2) جدول المواد المشتركة (مادة واحدة لكل التخصصات)
-- ---------------------------------------------------------------------
create table if not exists public.common_subjects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  subject_code text not null unique,
  level        text not null check (level in ('L1','L2','L3')),
  semester     text not null check (semester in ('S1','S2','S3','S4','S5','S6')),
  module       text,
  credits      numeric,
  sort_order   integer not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

create index if not exists common_subjects_scope_idx
  on public.common_subjects (level, semester, is_active, sort_order);

grant select                         on public.common_subjects to anon;
grant select, insert, update, delete on public.common_subjects to authenticated;
grant all                            on public.common_subjects to service_role;

alter table public.common_subjects enable row level security;

drop policy if exists "read active common subjects" on public.common_subjects;
drop policy if exists "admins manage common subjects" on public.common_subjects;

create policy "read active common subjects"
on public.common_subjects for select to anon, authenticated
using (is_active or public.has_role(auth.uid(), 'admin'));

create policy "admins manage common subjects"
on public.common_subjects for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists common_subjects_touch_updated_at on public.common_subjects;
create trigger common_subjects_touch_updated_at
before update on public.common_subjects
for each row execute function public.touch_updated_at();

-- المادتان المطلوبتان (والمشرف الرئيسي يضيف غيرهما متى شاء — لا شيء hard-coded)
insert into public.common_subjects (name, subject_code, level, semester, module, sort_order) values
  ('Rapport de stage de la 2ème année', 'rapport_de_stage_de_la_2eme_annee', 'L3', 'S5', 'Stage',                  10),
  ('Mémoire de fin d''études',          'memoire_de_fin_d_etudes',           'L3', 'S6', 'Projet de fin d''étude', 10)
on conflict (subject_code) do nothing;

-- ---------------------------------------------------------------------
-- 3) توسيع جدول documents (بدون أي فقدان للبيانات)
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists file_type_id uuid references public.document_types(id) on delete restrict;
alter table public.documents add column if not exists scope_type   text not null default 'specialization';

-- سماح specialization بالقيمة COMMON مع الحفاظ على القيم القديمة
do $$
begin
  alter table public.documents drop constraint if exists documents_specialization_check;
  alter table public.documents
    add constraint documents_specialization_check
    check (specialization in ('BA','FC','TCM','GRH','SAE','IG','COMMON'));
end
$$;

do $$
begin
  alter table public.documents drop constraint if exists documents_scope_type_check;
  alter table public.documents
    add constraint documents_scope_type_check
    check (scope_type in ('specialization','common'));
end
$$;

-- إزالة الاعتماد على الأنواع الثابتة (العمود النصي يبقى للتوافق الخلفي فقط)
alter table public.documents drop constraint if exists documents_file_type_check;
alter table public.documents alter column file_type drop not null;

-- ---------------------------------------------------------------------
-- 4) ربط كل الملفات القديمة بأنواعها الجديدة (لا يُفقد أي ملف)
-- ---------------------------------------------------------------------
update public.documents d
set file_type_id = t.id
from public.document_types t
where d.file_type_id is null
  and t.slug = lower(regexp_replace(coalesce(d.file_type, 'cours'), '[^A-Za-z0-9]+', '_', 'g'));

-- أي سجل بقي بلا نوع (قيمة غير معروفة) يُربط بـ Cours حتى لا يختفي من الواجهة
update public.documents d
set file_type_id = (select id from public.document_types where slug = 'cours')
where d.file_type_id is null;

-- سجلات المواد المشتركة القديمة (رُفعت تحت تخصص معيّن) تُرقَّى إلى النطاق المشترك
update public.documents d
set scope_type = 'common', specialization = 'COMMON'
from public.common_subjects c
where d.scope_type <> 'common'
  and lower(d.subject_code) = lower(c.subject_code);

-- ---------------------------------------------------------------------
-- 5) مزامنة تلقائية: file_type النصي + اتساق النطاق المشترك
-- ---------------------------------------------------------------------
create or replace function public.documents_normalize()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _type_name text;
begin
  -- النوع: المرجع هو file_type_id، والنص يُحدَّث تلقائياً
  if new.file_type_id is not null then
    select name into _type_name from public.document_types where id = new.file_type_id;
    if _type_name is not null then new.file_type := _type_name; end if;
  elsif new.file_type is not null then
    select id, name into new.file_type_id, _type_name
    from public.document_types
    where slug = lower(regexp_replace(new.file_type, '[^A-Za-z0-9]+', '_', 'g'))
    limit 1;
  end if;

  -- المادة المشتركة تُخزَّن دائماً في النطاق المشترك
  if exists (select 1 from public.common_subjects c where lower(c.subject_code) = lower(new.subject_code)) then
    new.scope_type := 'common';
    new.specialization := 'COMMON';
  elsif new.scope_type = 'common' then
    new.specialization := 'COMMON';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_normalize_trg on public.documents;
create trigger documents_normalize_trg
before insert or update on public.documents
for each row execute function public.documents_normalize();

-- ---------------------------------------------------------------------
-- 6) فهارس الاستعلام الموحّد
-- ---------------------------------------------------------------------
create index if not exists documents_scope_type_idx
  on public.documents (scope_type, semester, subject_code, status);
create index if not exists documents_file_type_id_idx on public.documents (file_type_id);
