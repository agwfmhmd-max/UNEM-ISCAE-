-- UNEM ISCAE — FCM tokens for the native Android wrapper
-- Execute in Supabase SQL Editor. This migration is safe to run more than once.

create table if not exists public.fcm_tokens (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  platform     text not null default 'android',
  app_id       text not null default 'mr.unem.iscae',
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists fcm_tokens_created_idx
  on public.fcm_tokens(created_at desc);

create index if not exists fcm_tokens_platform_app_idx
  on public.fcm_tokens(platform, app_id);

alter table public.fcm_tokens enable row level security;

revoke all on table public.fcm_tokens from anon, authenticated;
grant all on table public.fcm_tokens to service_role;
grant select on table public.fcm_tokens to authenticated;

drop policy if exists "fcm_tokens_admin_select" on public.fcm_tokens;
create policy "fcm_tokens_admin_select"
  on public.fcm_tokens for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "fcm_tokens_admin_delete" on public.fcm_tokens;
create policy "fcm_tokens_admin_delete"
  on public.fcm_tokens for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create or replace function public.save_fcm_token(
  p_token text,
  p_platform text default 'android',
  p_app_id text default 'mr.unem.iscae',
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_token is null or length(trim(p_token)) = 0 or length(p_token) > 4096 then
    raise exception 'FCM token is invalid';
  end if;

  if coalesce(lower(trim(p_platform)), '') <> 'android' then
    raise exception 'FCM platform is invalid';
  end if;

  if coalesce(trim(p_app_id), '') <> 'mr.unem.iscae' then
    raise exception 'FCM app id is invalid';
  end if;

  insert into public.fcm_tokens (
    token,
    platform,
    app_id,
    user_agent,
    created_at,
    last_seen_at
  )
  values (
    trim(p_token),
    'android',
    'mr.unem.iscae',
    nullif(trim(p_user_agent), ''),
    now(),
    now()
  )
  on conflict (token)
  do update set
    platform = excluded.platform,
    app_id = excluded.app_id,
    user_agent = excluded.user_agent,
    last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.save_fcm_token(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_fcm_token(text, text, text, text)
  to anon, authenticated;
