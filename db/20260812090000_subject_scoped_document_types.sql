-- =====================================================================
--  UNEM ISCAE — أنواع الملفات مرتبطة بالمادة (Scope → Level → Semester → Subject)
--  آمن تماماً على قاعدة بيانات إنتاج:
--   * لا يحذف أي جدول / عمود / سجل.
--   * لا يمسّ: documents / document_types / common_subjects / cloudinary_* / github_*
--   * قابل لإعادة التنفيذ (idempotent).
--  ينفَّذ في: Supabase → SQL Editor بعد:
--    db/20260811120000_document_types_and_common_subjects.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) جدول الربط: نوع الملف ↔ نطاق المادة
-- ---------------------------------------------------------------------
create table if not exists public.subject_document_types (
  id               uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references public.document_types(id) on delete cascade,
  scope_type       text not null default 'specialization',
  specialization   text not null,
  level            text not null,
  semester         text not null,
  subject_code     text not null,
  sort_order       integer not null default 100,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references auth.users(id) on delete set null
);

-- قيود السلامة (تُضاف مرة واحدة فقط)
do $$
begin
  alter table public.subject_document_types
    drop constraint if exists sdt_scope_type_check;
  alter table public.subject_document_types
    add constraint sdt_scope_type_check check (scope_type in ('specialization','common'));

  alter table public.subject_document_types
    drop constraint if exists sdt_specialization_check;
  alter table public.subject_document_types
    add constraint sdt_specialization_check
    check (specialization in ('BA','FC','TCM','GRH','SAE','IG','COMMON'));

  alter table public.subject_document_types
    drop constraint if exists sdt_level_check;
  alter table public.subject_document_types
    add constraint sdt_level_check check (level in ('L1','L2','L3'));

  alter table public.subject_document_types
    drop constraint if exists sdt_semester_check;
  alter table public.subject_document_types
    add constraint sdt_semester_check
    check (semester in ('S1','S2','S3','S4','S5','S6'));

  -- الفصل يجب أن ينتمي إلى المستوى
  alter table public.subject_document_types
    drop constraint if exists sdt_level_semester_check;
  alter table public.subject_document_types
    add constraint sdt_level_semester_check check (
      (level = 'L1' and semester in ('S1','S2')) or
      (level = 'L2' and semester in ('S3','S4')) or
      (level = 'L3' and semester in ('S5','S6'))
    );

  -- النطاق المشترك يُخزَّن دائماً بـ COMMON
  alter table public.subject_document_types
    drop constraint if exists sdt_common_scope_check;
  alter table public.subject_document_types
    add constraint sdt_common_scope_check check (
      (scope_type = 'common' and specialization = 'COMMON') or
      (scope_type = 'specialization' and specialization <> 'COMMON')
    );
end
$$;

-- منع تكرار نفس النوع لنفس المادة (uniqueness على مستوى المادة + النوع فقط)
create unique index if not exists subject_document_types_unique_idx
  on public.subject_document_types (scope_type, specialization, level, semester, subject_code, document_type_id);

-- فهارس الاستعلام السريع حسب نطاق المادة
create index if not exists subject_document_types_scope_idx
  on public.subject_document_types (scope_type, specialization, level, semester, subject_code, is_active, sort_order);
create index if not exists subject_document_types_type_idx
  on public.subject_document_types (document_type_id);

grant select                         on public.subject_document_types to anon;
grant select, insert, update, delete on public.subject_document_types to authenticated;
grant all                            on public.subject_document_types to service_role;

alter table public.subject_document_types enable row level security;

drop policy if exists "read subject document types"   on public.subject_document_types;
drop policy if exists "admins manage subject document types" on public.subject_document_types;

-- الجميع يقرأ الروابط المفعّلة، والمشرف الرئيسي يرى كل شيء
create policy "read subject document types"
on public.subject_document_types for select to anon, authenticated
using (is_active or public.has_role(auth.uid(), 'admin'));

-- الإضافة/التعديل/الحذف: المشرف الرئيسي فقط (على مستوى قاعدة البيانات وليس الواجهة)
create policy "admins manage subject document types"
on public.subject_document_types for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists subject_document_types_touch_updated_at on public.subject_document_types;
create trigger subject_document_types_touch_updated_at
before update on public.subject_document_types
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2) ترحيل آمن: كل ملف موجود يحصل على رابط نوع ↔ مادته
--    (حتى لا يختفي أي ملف قديم ولا ينكسر أي رابط Cloudinary/GitHub)
-- ---------------------------------------------------------------------
insert into public.subject_document_types
  (document_type_id, scope_type, specialization, level, semester, subject_code, sort_order)
select distinct
  d.file_type_id,
  case when coalesce(d.scope_type, 'specialization') = 'common' then 'common' else 'specialization' end,
  case when coalesce(d.scope_type, 'specialization') = 'common' then 'COMMON' else upper(d.specialization) end,
  upper(d.level),
  upper(d.semester),
  lower(d.subject_code),
  coalesce(t.sort_order, 100)
from public.documents d
join public.document_types t on t.id = d.file_type_id
where d.file_type_id is not null
  and coalesce(d.subject_code, '') <> ''
  and upper(coalesce(d.specialization, '')) in ('BA','FC','TCM','GRH','SAE','IG','COMMON')
  and upper(coalesce(d.level, '')) in ('L1','L2','L3')
  and (
    (upper(d.level) = 'L1' and upper(d.semester) in ('S1','S2')) or
    (upper(d.level) = 'L2' and upper(d.semester) in ('S3','S4')) or
    (upper(d.level) = 'L3' and upper(d.semester) in ('S5','S6'))
  )
  and (
    coalesce(d.scope_type, 'specialization') = 'common'
    or upper(coalesce(d.specialization, '')) <> 'COMMON'
  )
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3) دالة التحقق: هل هذا النوع مسموح لهذه المادة؟ (تُستخدم من الخادم والقاعدة)
-- ---------------------------------------------------------------------
create or replace function public.document_type_allowed_for_subject(
  _type_id  uuid,
  _scope    text,
  _spec     text,
  _level    text,
  _semester text,
  _code     text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subject_document_types l
    join public.document_types t on t.id = l.document_type_id
    where l.document_type_id = _type_id
      and l.is_active
      and t.is_active
      and l.scope_type     = lower(coalesce(_scope, 'specialization'))
      and l.specialization = upper(_spec)
      and l.level          = upper(_level)
      and l.semester       = upper(_semester)
      and l.subject_code   = lower(_code)
  );
$$;

grant execute on function public.document_type_allowed_for_subject(uuid, text, text, text, text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) تنفيذ القاعدة على مستوى قاعدة البيانات (لا نثق بالواجهة أبداً)
--    يمنع ربط ملف جديد بنوع لا يخص المادة المحددة.
--    السجلات القديمة لا تُمَس (التحقق عند الإدراج أو عند تغيير النوع/المادة فقط).
-- ---------------------------------------------------------------------
create or replace function public.documents_validate_file_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.file_type_id is null then
    raise exception 'نوع الملف مطلوب (file_type_id).';
  end if;

  if tg_op = 'UPDATE'
     and new.file_type_id is not distinct from old.file_type_id
     and new.subject_code is not distinct from old.subject_code
     and new.scope_type   is not distinct from old.scope_type
     and new.specialization is not distinct from old.specialization
     and new.level        is not distinct from old.level
     and new.semester     is not distinct from old.semester then
    return new;
  end if;

  if not public.document_type_allowed_for_subject(
       new.file_type_id,
       coalesce(new.scope_type, 'specialization'),
       new.specialization,
       new.level,
       new.semester,
       new.subject_code
     ) then
    raise exception 'نوع الملف المحدد غير مرتبط بهذه المادة (%/%/%/%).',
      new.specialization, new.level, new.semester, new.subject_code;
  end if;

  return new;
end;
$$;

-- الاسم يبدأ بـ z حتى يُنفَّذ بعد documents_normalize_trg (ترتيب أبجدي)
drop trigger if exists zz_documents_validate_file_type_trg on public.documents;
create trigger zz_documents_validate_file_type_trg
before insert or update on public.documents
for each row execute function public.documents_validate_file_type();
