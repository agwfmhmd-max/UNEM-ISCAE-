-- =====================================================================
-- UNEM ISCAE — Push subscriptions: secure RPCs
-- Execute in Supabase SQL Editor.
-- This migration keeps direct INSERT/UPDATE/DELETE blocked by RLS and
-- lets the public website save/remove only through controlled functions.
-- =====================================================================

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if p_endpoint is null or trim(p_endpoint) = '' then
    raise exception 'Push endpoint is required';
  end if;

  if p_p256dh is null or trim(p_p256dh) = '' then
    raise exception 'Push p256dh key is required';
  end if;

  if p_auth is null or trim(p_auth) = '' then
    raise exception 'Push auth key is required';
  end if;

  insert into public.push_subscriptions (
    endpoint,
    p256dh,
    auth,
    user_agent,
    user_id,
    created_at,
    last_seen_at
  )
  values (
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    v_user_id,
    now(),
    now()
  )
  on conflict (endpoint)
  do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    user_id = case
      when v_user_id is not null then v_user_id
      else public.push_subscriptions.user_id
    end,
    last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.remove_push_subscription(
  p_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_endpoint is null or trim(p_endpoint) = '' then
    return false;
  end if;

  delete from public.push_subscriptions
  where endpoint = p_endpoint;

  return found;
end;
$$;

-- The website uses these RPCs for both anon and authenticated visitors.
revoke all on function public.save_push_subscription(text, text, text, text)
from public, anon, authenticated;

revoke all on function public.remove_push_subscription(text)
from public, anon, authenticated;

grant execute on function public.save_push_subscription(text, text, text, text)
to anon, authenticated;

grant execute on function public.remove_push_subscription(text)
to anon, authenticated;


-- Direct Data API writes are intentionally blocked.
revoke insert, update, delete
on public.push_subscriptions
from anon, authenticated;

grant select
on public.push_subscriptions
to authenticated;

grant all
on public.push_subscriptions
to service_role;


alter table public.push_subscriptions
enable row level security;


-- Rebuild only the relevant policies to guarantee the final state.
drop policy if exists "push_subscriptions_public_insert"
on public.push_subscriptions;

drop policy if exists "push_subscriptions_public_update"
on public.push_subscriptions;

drop policy if exists "push_subscriptions_public_delete"
on public.push_subscriptions;

drop policy if exists "push_subscriptions_admin_select"
on public.push_subscriptions;

drop policy if exists "push_subscriptions_admin_update"
on public.push_subscriptions;

drop policy if exists "push_subscriptions_admin_delete"
on public.push_subscriptions;


create policy "push_subscriptions_admin_select"
on public.push_subscriptions
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

create policy "push_subscriptions_admin_update"
on public.push_subscriptions
for update
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

create policy "push_subscriptions_admin_delete"
on public.push_subscriptions
for delete
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role)
);
