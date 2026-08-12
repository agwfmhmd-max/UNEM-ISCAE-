-- =====================================================================
--  UNEM ISCAE — إشعارات Push حقيقية (تصل للمستخدم حتى خارج المنصة)
--  ⚠️ نفّذ هذا الملف يدوياً في: Supabase → SQL Editor
--  آمن لإعادة التنفيذ (idempotent) — لا يحذف أي بيانات موجودة
-- =====================================================================

-- ---------- 1) جدول اشتراكات المتصفح (Web Push Subscriptions) ----------
-- كل زائر (مسجّل أو غير مسجّل) يحصل على اشتراك واحد لكل متصفح/جهاز.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  user_id      uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_created_idx on public.push_subscriptions(created_at desc);

-- ---------- 2) سجل الإشعارات المُرسَلة (لعرضها في لوحة الإدارة) ----------
create table if not exists public.push_notifications_log (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  link_url     text,
  sent_by      uuid references auth.users(id) on delete set null,
  recipients   integer not null default 0,
  delivered    integer not null default 0,
  failed       integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists push_notifications_log_created_idx on public.push_notifications_log(created_at desc);

-- ---------- 3) الصلاحيات (Data API) ----------
grant select, insert, update, delete on public.push_subscriptions   to anon, authenticated;
grant all                            on public.push_subscriptions   to service_role;

grant select, insert               on public.push_notifications_log to authenticated;
grant all                          on public.push_notifications_log to service_role;

alter table public.push_subscriptions   enable row level security;
alter table public.push_notifications_log enable row level security;

-- ---------- 4) سياسات RLS: push_subscriptions ----------
-- الاشتراك متاح لأي زائر (يحتاجه الطالب حتى دون تسجيل دخول ليستقبل الإشعارات)
drop policy if exists "push_subscriptions_public_insert" on public.push_subscriptions;
create policy "push_subscriptions_public_insert"
  on public.push_subscriptions for insert
  with check (true);

-- تحديث الاشتراك (تجديد المفاتيح / آخر ظهور) متاح لصاحب نفس الـ endpoint
drop policy if exists "push_subscriptions_public_update" on public.push_subscriptions;
create policy "push_subscriptions_public_update"
  on public.push_subscriptions for update
  using (true) with check (true);

-- إلغاء الاشتراك (حذف) متاح للجميع (يحتاج معرفة الـ endpoint الدقيق، وهو رابط سري غير قابل للتخمين)
drop policy if exists "push_subscriptions_public_delete" on public.push_subscriptions;
create policy "push_subscriptions_public_delete"
  on public.push_subscriptions for delete
  using (true);

-- قراءة قائمة الاشتراكات: للمشرف الرئيسي فقط (حتى لا يطّلع أي زائر على بيانات الآخرين)
drop policy if exists "push_subscriptions_admin_select" on public.push_subscriptions;
create policy "push_subscriptions_admin_select"
  on public.push_subscriptions for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- ---------- 5) سياسات RLS: push_notifications_log ----------
drop policy if exists "push_log_admin_select" on public.push_notifications_log;
create policy "push_log_admin_select"
  on public.push_notifications_log for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "push_log_admin_insert" on public.push_notifications_log;
create policy "push_log_admin_insert"
  on public.push_notifications_log for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
