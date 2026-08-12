-- =====================================================================
--  UNEM ISCAE — توحيد جدول documents مع مصدرَي GitHub و Cloudinary
--  آمن تماماً: لا يحذف أي عمود ولا أي سجل (ADD COLUMN IF NOT EXISTS فقط)
-- =====================================================================

-- 1) أعمدة GitHub للملفات القديمة
alter table public.documents add column if not exists github_url  text;
alter table public.documents add column if not exists github_path text;

-- 2) أعمدة Cloudinary الإضافية
alter table public.documents add column if not exists cloudinary_version text;

-- 3) السماح بالمصادر الثلاثة في قيد source (مع الحفاظ على البيانات الحالية)
do $$
begin
  alter table public.documents drop constraint if exists documents_source_check;
  alter table public.documents
    add constraint documents_source_check
    check (source in ('cloudinary', 'supabase', 'github'));
end
$$;

-- 4) منع التكرار على مستوى Cloudinary public_id (بدون حذف أي بيانات موجودة)
create unique index if not exists documents_cloudinary_public_id_uidx
  on public.documents (cloudinary_public_id)
  where cloudinary_public_id is not null and cloudinary_public_id <> '';

-- 5) فهرس للبحث عن ملفات GitHub
create index if not exists documents_github_path_idx
  on public.documents (github_path)
  where github_path is not null;

-- 6) فهرس المصدر (الفلترة تعتمد على source وليس على وجود رابط)
create index if not exists documents_source_idx on public.documents (source);
