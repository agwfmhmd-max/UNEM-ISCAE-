-- جدول التفوق الدراسي: جلسات مراجعة بتاريخ محدد (صورة ملصق و/أو جدول يدوي لكل تخصص)،
-- تُحذف تلقائياً بعد انتهاء تاريخها. التاريخ بتوقيت موريتانيا (UTC).
create or replace function public.unem_today() returns date
language sql stable as $$ select (now() at time zone 'UTC')::date $$;

create table if not exists public.excellence_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  subtitle text check (subtitle is null or char_length(subtitle) <= 200),
  session_date date not null,
  image_path text,
  image_url text,
  groups jsonb not null default '[]'::jsonb check (jsonb_typeof(groups) = 'array' and jsonb_array_length(groups) <= 20),
  is_active boolean not null default true,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (image_path is not null or jsonb_array_length(groups) > 0)
);
create index if not exists excellence_sessions_date_idx on public.excellence_sessions(session_date);

alter table public.excellence_sessions enable row level security;
drop policy if exists "excellence public read" on public.excellence_sessions;
create policy "excellence public read" on public.excellence_sessions for select to anon, authenticated
  using ((is_active and session_date >= public.unem_today()) or public.has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "excellence admin insert" on public.excellence_sessions;
create policy "excellence admin insert" on public.excellence_sessions for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'::app_role) and uploaded_by = auth.uid());
drop policy if exists "excellence admin update" on public.excellence_sessions;
create policy "excellence admin update" on public.excellence_sessions for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role)) with check (public.has_role(auth.uid(), 'admin'::app_role));
drop policy if exists "excellence admin delete" on public.excellence_sessions;
create policy "excellence admin delete" on public.excellence_sessions for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));
grant select on public.excellence_sessions to anon, authenticated;
grant insert, update, delete on public.excellence_sessions to authenticated;

create or replace function public.excellence_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists excellence_touch_trg on public.excellence_sessions;
create trigger excellence_touch_trg before update on public.excellence_sessions for each row execute function public.excellence_touch();

-- حذف ملف الصورة من التخزين مع حذف الجلسة (يتجاوز حماية storage.protect_delete داخل المعاملة فقط)
create or replace function public.unem_storage_delete_object(p_bucket text, p_path text) returns void
language plpgsql security definer set search_path = public, storage as $$
begin
  if p_bucket is null or p_path is null or btrim(p_path) = '' then return; end if;
  perform set_config('storage.allow_delete_query','true', true);
  delete from storage.objects where bucket_id = p_bucket and name = p_path;
  perform set_config('storage.allow_delete_query','false', true);
end $$;
revoke all on function public.unem_storage_delete_object(text,text) from public, anon, authenticated;

create or replace function public.excellence_media_cleanup() returns trigger
language plpgsql security definer set search_path = public, storage as $$
begin
  if old.image_path is not null then
    begin perform public.unem_storage_delete_object('pdf-files', old.image_path);
    exception when others then raise warning 'excellence media cleanup failed: %', sqlerrm; end;
  end if;
  return old;
end $$;
drop trigger if exists excellence_media_cleanup_trg on public.excellence_sessions;
create trigger excellence_media_cleanup_trg before delete on public.excellence_sessions for each row execute function public.excellence_media_cleanup();

-- حذف الجلسات المنتهية (تاريخها قبل اليوم). تُستدعى تلقائياً عند كل عرض ويمكن استدعاؤها يدوياً.
create or replace function public.excellence_purge() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from excellence_sessions where session_date < public.unem_today();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.excellence_purge() from public;
grant execute on function public.excellence_purge() to anon, authenticated;

-- قائمة الجلسات القادمة للطلاب (بعد حذف المنتهية)
create or replace function public.excellence_list() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.excellence_purge();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'subtitle', s.subtitle, 'session_date', s.session_date,
      'image_url', s.image_url, 'groups', s.groups) order by s.session_date, s.created_at)
    from excellence_sessions s where s.is_active and s.session_date >= public.unem_today()), '[]'::jsonb);
end $$;
revoke all on function public.excellence_list() from public;
grant execute on function public.excellence_list() to anon, authenticated;
notify pgrst, 'reload schema';
