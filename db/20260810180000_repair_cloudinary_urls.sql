-- =====================================================================
--  UNEM ISCAE — إصلاح روابط Cloudinary المعطوبة (JSON pointer / Supabase)
--  نفّذه في: Supabase → SQL Editor
--  آمن: لا يحذف أي سجل، فقط يعيد بناء الرابط المباشر من public_id
-- =====================================================================

-- 1) عرض تشخيصي: حالة رابط كل ملف
create or replace view public.cloudinary_url_audit as
select
  id,
  original_name,
  source,
  cloudinary_public_id,
  cloudinary_resource_type,
  cloudinary_url,
  case
    when cloudinary_url is null or cloudinary_url = '' then 'empty'
    when cloudinary_url like '%supabase.co%'
      or cloudinary_url like '%UNEM_CLOUDINARY_POINTER%'
      or cloudinary_url like '/api/%'                       then 'pointer'
    when cloudinary_url ~ '^https://res\.cloudinary\.com/[^/]+/(raw|image|video)/upload/' then 'valid'
    else 'invalid'
  end as url_status
from public.documents
where source = 'cloudinary';

grant select on public.cloudinary_url_audit to authenticated;
grant all    on public.cloudinary_url_audit to service_role;

-- 2) دالة الإصلاح: تعيد بناء cloudinary_url من cloudinary_public_id
--    الاستعمال:  select * from public.repair_cloudinary_urls('YOUR_CLOUD_NAME');
create or replace function public.repair_cloudinary_urls(_cloud_name text)
returns table (fixed_id uuid, fixed_name text, new_url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'غير مصرح: هذه العملية للمشرف فقط.';
  end if;

  return query
  update public.documents d
     set cloudinary_url = 'https://res.cloudinary.com/' || _cloud_name || '/'
           || coalesce(nullif(d.cloudinary_resource_type, ''), 'raw')
           || '/upload/' || d.cloudinary_public_id,
         updated_at = now()
   where d.source = 'cloudinary'
     and d.cloudinary_public_id is not null
     and d.cloudinary_public_id <> ''
     and (
       d.cloudinary_url is null
       or d.cloudinary_url = ''
       or d.cloudinary_url like '%supabase.co%'
       or d.cloudinary_url like '%UNEM_CLOUDINARY_POINTER%'
       or d.cloudinary_url like '/api/%'
       or d.cloudinary_url !~ '^https://res\.cloudinary\.com/[^/]+/(raw|image|video)/upload/'
     )
  returning d.id, d.original_name, d.cloudinary_url;
end;
$$;

grant execute on function public.repair_cloudinary_urls(text) to authenticated;
