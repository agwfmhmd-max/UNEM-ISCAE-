-- UNEM ISCAE: صلاحية «عرض القاعات الفارغة» للمشرفين (يمنحها المشرف الرئيسي)
alter table public.supervisor_permissions
  add column if not exists view_free_rooms boolean not null default false;
