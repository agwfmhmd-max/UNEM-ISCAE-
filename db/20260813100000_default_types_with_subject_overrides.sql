-- =====================================================================
--  UNEM ISCAE — الأنواع الافتراضية + التخصيص على مستوى المادة (Override)
--  آمن تماماً على قاعدة بيانات إنتاج:
--   * لا يحذف أي جدول / عمود / سجل / ملف / Cloudinary ID / GitHub URL.
--   * لا يعدّل أي Migration قديمة.
--   * قابل لإعادة التنفيذ (idempotent).
--  ينفَّذ في: Supabase → SQL Editor بعد:
--    db/20260812090000_subject_scoped_document_types.sql
--
--  الفكرة:
--   1) document_types يحتوي الأنواع الافتراضية (is_default = true):
--      Cours / TD / TP / Devoir / Examen  → تظهر تلقائياً لكل المواد.
--   2) subject_document_types يصبح «طبقة تخصيص» للمادة الواحدة فقط:
--      display_name / description / sort_order / is_active
--      ولا يُعدَّل الاسم العام في document_types أبداً عند تخصيص مادة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) توسيع document_types: وصف + علامة النوع الافتراضي
-- ---------------------------------------------------------------------
alter table public.document_types add column if not exists description text;
alter table public.document_types add column if not exists is_default boolean not null default false;

-- الأنواع الافتراضية الأربعة (تُنشأ إن لم تكن موجودة — بدون تكرار)
insert into public.document_types (name, slug, sort_order, description) values
  ('Cours',   'cours',  10, 'الدروس والملخصات'),
  ('TD / TP', 'td_tp',  20, 'أعمال موجهة وتطبيقية'),
  ('Devoir',  'devoir', 30, 'الاختبارات والواجبات'),
  ('Examen',  'examen', 40, 'الامتحانات والأرشيف')
on conflict (slug) do nothing;

-- تعليم الأنواع الافتراضية + ضبط الوصف والترتيب الافتراضي (لا يُغيَّر أي اسم)
update public.document_types set is_default = true, is_active = true,
       description = coalesce(nullif(btrim(description), ''), 'الدروس والملخصات'),
       sort_order = 10
 where slug = 'cours';
update public.document_types set is_default = true, is_active = true,
       description = coalesce(nullif(btrim(description), ''), 'أعمال موجهة وتطبيقية'),
       sort_order = 20
 where slug = 'td_tp';
update public.document_types set is_default = true, is_active = true,
       description = coalesce(nullif(btrim(description), ''), 'الاختبارات والواجبات'),
       sort_order = 30
 where slug = 'devoir';
update public.document_types set is_default = true, is_active = true,
       description = coalesce(nullif(btrim(description), ''), 'الامتحانات والأرشيف'),
       sort_order = 40
 where slug = 'examen';

create index if not exists document_types_default_idx
  on public.document_types (is_default, is_active, sort_order);

-- ---------------------------------------------------------------------
-- 2) توسيع subject_document_types: طبقة التخصيص لكل مادة
-- ---------------------------------------------------------------------
alter table public.subject_document_types add column if not exists display_name text;
alter table public.subject_document_types add column if not exists description  text;
alter table public.subject_document_types add column if not exists subject_name text;

-- منع تكرار نفس الاسم المخصص داخل نفس المادة (لا يمنع استعماله في مادة أخرى)
create unique index if not exists subject_document_types_display_name_unique_idx
  on public.subject_document_types
     (scope_type, specialization, level, semester, subject_code, lower(btrim(display_name)))
  where display_name is not null and btrim(display_name) <> '';

-- ---------------------------------------------------------------------
-- 3) الدالة المركزية: الأنواع الفعّالة لمادة واحدة
--    = الأنواع الافتراضية (مع تخصيصات المادة) + الأنواع المخصصة للمادة
--    وتُرجع كذلك الأنواع المعطّلة مع is_active=false (لتظهر للمشرف فقط)
-- ---------------------------------------------------------------------
create or replace function public.effective_document_types_for_subject(
  _scope    text,
  _spec     text,
  _level    text,
  _semester text,
  _code     text
)
returns table (
  type_id       uuid,
  link_id       uuid,
  slug          text,
  base_name     text,
  name          text,
  description   text,
  sort_order    integer,
  is_default    boolean,
  is_overridden boolean,
  is_active     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select lower(coalesce(_scope, 'specialization')) as sc,
           upper(coalesce(_spec, ''))                as sp,
           upper(coalesce(_level, ''))               as lv,
           upper(coalesce(_semester, ''))            as sm,
           lower(coalesce(_code, ''))                as cd
  ),
  links as (
    select l.*
    from public.subject_document_types l, s
    where l.scope_type     = s.sc
      and l.specialization = s.sp
      and l.level          = s.lv
      and l.semester       = s.sm
      and l.subject_code   = s.cd
  )
  -- (أ) الأنواع الافتراضية: تظهر لكل المواد، ويمكن تخصيصها أو تعطيلها للمادة فقط
  select t.id,
         l.id,
         t.slug,
         t.name,
         coalesce(nullif(btrim(l.display_name), ''), t.name),
         coalesce(nullif(btrim(l.description), ''), t.description),
         coalesce(l.sort_order, t.sort_order),
         true,
         (l.id is not null and (
            nullif(btrim(l.display_name), '') is not null or
            nullif(btrim(l.description), '')  is not null
         )),
         coalesce(l.is_active, true) and t.is_active
  from public.document_types t
  left join links l on l.document_type_id = t.id
  where t.is_default and t.is_active

  union all

  -- (ب) الأنواع المخصصة لهذه المادة فقط
  select t.id,
         l.id,
         t.slug,
         t.name,
         coalesce(nullif(btrim(l.display_name), ''), t.name),
         coalesce(nullif(btrim(l.description), ''), t.description),
         l.sort_order,
         false,
         true,
         l.is_active and t.is_active
  from links l
  join public.document_types t on t.id = l.document_type_id
  where not t.is_default

  order by 7 asc, 5 asc;
$$;

grant execute on function public.effective_document_types_for_subject(text, text, text, text, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) إعادة تعريف دالة التحقق لتعتمد على الأنواع الفعّالة
--    (الافتراضي مسموح تلقائياً ما لم يعطّله المشرف لهذه المادة)
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
    from public.effective_document_types_for_subject(_scope, _spec, _level, _semester, _code) e
    where e.type_id = _type_id
      and e.is_active
  );
$$;

grant execute on function public.document_type_allowed_for_subject(uuid, text, text, text, text, text)
  to anon, authenticated, service_role;
