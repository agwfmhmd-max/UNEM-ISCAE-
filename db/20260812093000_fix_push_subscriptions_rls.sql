-- =====================================================================
--  إصلاح جذري: تسجيل اشتراكات الإشعارات لأي زائر (وليس المشرف فقط)
--  ⚠️ نفّذ هذا الملف في: Supabase → SQL Editor
--  السبب: سياسات RLS الحالية تمنع الزوار غير المسجّلين من إضافة اشتراكهم،
--  لذلك كان جدول push_subscriptions يحتوي على المشرف فقط.
-- =====================================================================

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

-- الصلاحيات على مستوى Data API
grant select, insert, update, delete on public.push_subscriptions to anon, authenticated;
grant all on public.push_subscriptions to service_role;

alter table public.push_subscriptions enable row level security;

-- Direct writes are performed only through the secure RPC migration
-- 20260812094500_fix_push_subscription_rpc.sql.
revoke insert, update, delete on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

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
