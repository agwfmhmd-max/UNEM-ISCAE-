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

-- حذف كل السياسات القديمة مهما كانت أسماؤها (هي سبب المشكلة)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
  loop
    execute format('drop policy %I on public.push_subscriptions', pol.policyname);
  end loop;
end $$;

-- أي زائر يستطيع تسجيل اشتراك جهازه (مطلوب لوصول الإشعارات للطلاب غير المسجّلين)
create policy "push_subscriptions_public_insert"
  on public.push_subscriptions for insert to anon, authenticated
  with check (true);

-- تحديث الاشتراك (تجديد المفاتيح / آخر ظهور) — يحتاج معرفة الـ endpoint السري
create policy "push_subscriptions_public_update"
  on public.push_subscriptions for update to anon, authenticated
  using (true) with check (true);

-- إلغاء الاشتراك
create policy "push_subscriptions_public_delete"
  on public.push_subscriptions for delete to anon, authenticated
  using (true);

-- قراءة القائمة: للمشرف الرئيسي فقط
create policy "push_subscriptions_admin_select"
  on public.push_subscriptions for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
