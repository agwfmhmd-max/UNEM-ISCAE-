-- =====================================================================
--  UNEM ISCAE — مواد مشتركة بين تخصصات محددة (Shared Subject Groups)
--
--  الفكرة: المشرف الرئيسي يربط مادة (أو أكثر) في تخصصات محددة
--  (مثال: Droit des assurances في BA/S4 مع TCM/S4)، فيرى طلاب كل تخصص
--  في المجموعة نفس الملفات في تلك المادة — حتى لو رُفع الملف على تخصص واحد فقط.
--
--  آمن تماماً على قاعدة بيانات تحتوي بيانات:
--   * جدولان جديدان فقط (روابط). لا يُنسخ ولا يُنقل ولا يُعدَّل أي ملف.
--   * لا يمسّ documents / document_types / common_subjects / subject_document_types.
--   * حذف مجموعة = حذف الرابط فقط؛ الملفات تبقى في أماكنها كما هي.
--   * قابل لإعادة التنفيذ (idempotent).
--  ينفَّذ في: Supabase → SQL Editor (بعد الملفات السابقة في مجلد db).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) المجموعات
-- ---------------------------------------------------------------------
create table if not exists public.shared_subject_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 100,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- 2) أعضاء المجموعة: (تخصص + مستوى + فصل + مادة)
--    اسم المادة قد يختلف بين التخصصات وكذلك الفصل، لذلك يُخزَّن لكل عضو.
-- ---------------------------------------------------------------------
create table if not exists public.shared_subject_members (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.shared_subject_groups(id) on delete cascade,
  specialization text not null,
  level          text not null,
  semester       text not null,
  subject_name   text not null,
  subject_code   text not null,
  created_at     timestamptz not null default now()
);

do $$
begin
  alter table public.shared_subject_members drop constraint if exists ssm_specialization_check;
  alter table public.shared_subject_members
    add constraint ssm_specialization_check
    check (specialization in ('BA','FC','TCM','GRH','SAE','IG'));

  alter table public.shared_subject_members drop constraint if exists ssm_level_semester_check;
  alter table public.shared_subject_members
    add constraint ssm_level_semester_check check (
      (level = 'L1' and semester in ('S1','S2')) or
      (level = 'L2' and semester in ('S3','S4')) or
      (level = 'L3' and semester in ('S5','S6'))
    );
end
$$;

-- المادة الواحدة (تخصص + فصل + رمز) تنتمي إلى مجموعة واحدة فقط (لا غموض ولا تعارض)
create unique index if not exists shared_subject_members_unique_subject_idx
  on public.shared_subject_members (specialization, semester, subject_code);
create index if not exists shared_subject_members_group_idx
  on public.shared_subject_members (group_id);

-- ---------------------------------------------------------------------
-- 3) الصلاحيات: الجميع يقرأ، المشرف الرئيسي فقط يدير (على مستوى قاعدة البيانات)
-- ---------------------------------------------------------------------
grant select                         on public.shared_subject_groups  to anon;
grant select                         on public.shared_subject_members to anon;
grant select, insert, update, delete on public.shared_subject_groups  to authenticated;
grant select, insert, update, delete on public.shared_subject_members to authenticated;
grant all                            on public.shared_subject_groups  to service_role;
grant all                            on public.shared_subject_members to service_role;

alter table public.shared_subject_groups  enable row level security;
alter table public.shared_subject_members enable row level security;

drop policy if exists "read shared subject groups"          on public.shared_subject_groups;
drop policy if exists "admins manage shared subject groups" on public.shared_subject_groups;
drop policy if exists "read shared subject members"          on public.shared_subject_members;
drop policy if exists "admins manage shared subject members" on public.shared_subject_members;

create policy "read shared subject groups"
on public.shared_subject_groups for select to anon, authenticated
using (is_active or public.has_role(auth.uid(), 'admin'));

create policy "admins manage shared subject groups"
on public.shared_subject_groups for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create policy "read shared subject members"
on public.shared_subject_members for select to anon, authenticated
using (true);

create policy "admins manage shared subject members"
on public.shared_subject_members for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists shared_subject_groups_touch_updated_at on public.shared_subject_groups;
create trigger shared_subject_groups_touch_updated_at
before update on public.shared_subject_groups
for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4) تحديث كاش PostgREST ليظهر الجدولان فوراً
-- ---------------------------------------------------------------------
notify pgrst, 'reload schema';
