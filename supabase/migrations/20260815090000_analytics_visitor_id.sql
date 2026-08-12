-- إضافة معرّف الزائر لجدول التحليلات لاحتساب الزوار الفريدين بدقة
alter table public.analytics
  add column if not exists visitor_id text;

create index if not exists analytics_visitor_idx on public.analytics (visitor_id);
create index if not exists analytics_type_idx    on public.analytics (action_type);
