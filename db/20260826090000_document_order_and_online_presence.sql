-- UNEM ISCAE: ترتيب الملفات + إعداد عداد المتواجدين الآن
-- آمن: لا يحذف أي بيانات ولا يغيّر محتوى الملفات الحالية.

alter table public.documents
  add column if not exists sort_order integer;

-- الحفاظ على ترتيب قريب من العرض الحالي للملفات القديمة.
with ranked as (
  select id,
         row_number() over (
           partition by coalesce(specialization,''), coalesce(level,''), coalesce(semester,''), coalesce(subject_code,''), coalesce(file_type_id::text,'')
           order by created_at desc nulls last, id
         ) as rn
  from public.documents
  where sort_order is null
)
update public.documents d
set sort_order = r.rn * 10
from ranked r
where d.id = r.id;

update public.documents
set sort_order = 100000
where sort_order is null;

alter table public.documents
  alter column sort_order set default 100000;

alter table public.documents
  alter column sort_order set not null;

create index if not exists documents_order_idx
  on public.documents (specialization, level, semester, subject_code, file_type_id, sort_order, created_at);

-- ترتيب مجموعة ملفات: للمشرف الرئيسي فقط.
create or replace function public.reorder_documents(p_document_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  if p_document_ids is null or cardinality(p_document_ids) = 0 then
    return;
  end if;

  for i in 1..cardinality(p_document_ids) loop
    update public.documents
       set sort_order = i * 10
     where id = p_document_ids[i];
  end loop;
end;
$$;

revoke all on function public.reorder_documents(uuid[]) from public;
grant execute on function public.reorder_documents(uuid[]) to authenticated;

-- إعداد عام بسيط: هل يظهر عداد المتواجدين الآن للطلاب؟
create table if not exists public.platform_settings (
  key text primary key,
  value_boolean boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists "public can read online counter setting" on public.platform_settings;
create policy "public can read online counter setting"
on public.platform_settings
for select to anon, authenticated
using (key = 'show_online_count');

insert into public.platform_settings(key, value_boolean)
values ('show_online_count', false)
on conflict (key) do nothing;

create or replace function public.set_public_online_count(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'not authorized';
  end if;

  insert into public.platform_settings(key, value_boolean, updated_at)
  values ('show_online_count', coalesce(p_enabled,false), now())
  on conflict (key) do update
    set value_boolean = excluded.value_boolean,
        updated_at = now();

  select value_boolean into v_enabled
  from public.platform_settings
  where key = 'show_online_count';

  return coalesce(v_enabled,false);
end;
$$;

revoke all on function public.set_public_online_count(boolean) from public;
grant execute on function public.set_public_online_count(boolean) to authenticated;
