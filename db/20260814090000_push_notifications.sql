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
-- Direct writes to push_subscriptions are blocked. The website uses RPCs.
revoke insert, update, delete on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

grant select, insert on public.push_notifications_log to authenticated;
grant all on public.push_notifications_log to service_role;

alter table public.push_subscriptions enable row level security;
alter table public.push_notifications_log enable row level security;

-- ---------- 4) سياسات RLS: push_subscriptions ----------
drop policy if exists "push_subscriptions_public_insert" on public.push_subscriptions;
drop policy if exists "push_subscriptions_public_update" on public.push_subscriptions;
drop policy if exists "push_subscriptions_public_delete" on public.push_subscriptions;
drop policy if exists "push_subscriptions_admin_select" on public.push_subscriptions;
drop policy if exists "push_subscriptions_admin_update" on public.push_subscriptions;
drop policy if exists "push_subscriptions_admin_delete" on public.push_subscriptions;

create policy "push_subscriptions_admin_select"
  on public.push_subscriptions for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "push_subscriptions_admin_update"
  on public.push_subscriptions for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "push_subscriptions_admin_delete"
  on public.push_subscriptions for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ---------- 5) سياسات RLS: push_notifications_log ----------
drop policy if exists "push_log_admin_select" on public.push_notifications_log;
create policy "push_log_admin_select"
  on public.push_notifications_log for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "push_log_admin_insert" on public.push_notifications_log;
create policy "push_log_admin_insert"
  on public.push_notifications_log for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));
