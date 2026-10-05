-- =====================================================================================================
-- Solar PAYG — SÉCURITÉ + HYPOTHÈSES + JOURNAL D'ACTIVITÉ (Supabase)
-- À exécuter UNE FOIS (et à ré-exécuter sans risque si vous modifiez la liste des superviseurs) :
--   Supabase > SQL Editor > New query > coller tout ce fichier > Run.
--
-- AVANT de l'exécuter : créez les 4 comptes dans Authentication > Users > Add user > « Create new user »
-- (cochez « Auto Confirm User » et choisissez un mot de passe pour chacun) avec EXACTEMENT ces e-mails :
--     agwfmhmd@gmail.com             → MDA        (SUPERVISEUR PRINCIPAL)
--     elhousseinainina58@gmail.com   → ELHOUSSEIN
--     toutoukhatri443@gmail.com      → TOUTOU
--     mahmoudneine594@gmail.com      → Neine
--
-- Ce que fait ce script :
--  1. Seuls ces 4 comptes (connectés) peuvent lire / enregistrer les hypothèses : l'accès anonyme est retiré.
--  2. Seul MDA (superviseur principal) peut SUPPRIMER un jeu d'hypothèses. Pour les autres, la suppression est
--     refusée par la base elle-même (un jeu absent d'un enregistrement est automatiquement conservé).
--  3. Chaque connexion d'un superviseur et chaque ajout / remplacement / suppression d'un jeu d'hypothèses est
--     journalisé avec la date et l'heure (table payg_activity). Seul MDA peut lire ce journal (onglet Statistiques).
--  4. Les tables de l'enquête (surveys, survey_questions, public_survey_results, team_members…) ne sont PAS modifiées :
--     la plateforme d'enquête continue de fonctionner exactement comme avant.
-- =====================================================================================================

-- ---------- 0. Table des hypothèses (créée si elle n'existe pas encore) ----------
create table if not exists public.payg_hypotheses (
  project_key    text primary key,                 -- = SURVEY_SLUG de index.html (ex. solar-payg-mauritanie-2027)
  state          jsonb,                            -- hypothèses communes + 3 scénarios (prudent / central / dynamique)
  profiles       jsonb not null default '{"list":[],"active":null}'::jsonb,  -- jeux d'hypothèses nommés
  schema_version integer not null default 3,
  updated_at     timestamptz not null default now()
);

-- ---------- 1. Liste des superviseurs autorisés ----------
create table if not exists public.payg_supervisors (
  email    text primary key,                       -- en minuscules
  name     text not null,
  is_admin boolean not null default false
);
alter table public.payg_supervisors enable row level security;
revoke all on public.payg_supervisors from anon, authenticated;   -- aucune lecture directe : seules les fonctions ci-dessous l'utilisent

insert into public.payg_supervisors (email, name, is_admin) values
  ('agwfmhmd@gmail.com',           'MDA',        true),
  ('elhousseinainina58@gmail.com', 'ELHOUSSEIN', false),
  ('toutoukhatri443@gmail.com',    'TOUTOU',     false),
  ('mahmoudneine594@gmail.com',    'Neine',      false)
on conflict (email) do update set name = excluded.name, is_admin = excluded.is_admin;

delete from public.payg_supervisors
 where email not in ('agwfmhmd@gmail.com','elhousseinainina58@gmail.com','toutoukhatri443@gmail.com','mahmoudneine594@gmail.com');

-- ---------- 2. Fonctions d'identité (basées sur l'e-mail du compte connecté) ----------
create or replace function public.payg_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.payg_is_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payg_supervisors s where s.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function public.payg_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payg_supervisors s where s.email = lower(coalesce(auth.jwt() ->> 'email', '')) and s.is_admin)
$$;

create or replace function public.payg_name() returns text
language sql stable security definer set search_path = public as $$
  select s.name from public.payg_supervisors s where s.email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

revoke all on function public.payg_email(), public.payg_is_supervisor(), public.payg_is_admin(), public.payg_name() from public, anon;
grant execute on function public.payg_email(), public.payg_is_supervisor(), public.payg_is_admin(), public.payg_name() to authenticated;

-- ---------- 3. Journal d'activité ----------
create table if not exists public.payg_activity (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_email text not null,
  user_name  text,
  event      text not null check (event in ('login', 'hypothesis_add', 'hypothesis_update', 'hypothesis_delete')),
  details    jsonb not null default '{}'::jsonb
);
create index if not exists payg_activity_at_idx on public.payg_activity (at desc);
alter table public.payg_activity enable row level security;

drop policy if exists "payg_activity_select_admin" on public.payg_activity;
create policy "payg_activity_select_admin" on public.payg_activity for select to authenticated using (public.payg_is_admin());
revoke all on public.payg_activity from anon, authenticated;
grant select on public.payg_activity to authenticated;      -- lecture réservée à MDA par la politique ci-dessus ; aucune écriture directe possible

-- Enregistre une connexion (appelée par le site juste après une connexion réussie ; l'identité vient du jeton, pas du navigateur)
create or replace function public.payg_log_login() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.payg_is_supervisor() then
    raise exception 'Compte non autorisé' using errcode = '42501';
  end if;
  insert into public.payg_activity (user_email, user_name, event) values (public.payg_email(), public.payg_name(), 'login');
end $$;
revoke all on function public.payg_log_login() from public, anon;
grant execute on function public.payg_log_login() to authenticated;

-- ---------- 4. Hypothèses : accès réservé aux superviseurs connectés ----------
alter table public.payg_hypotheses enable row level security;
drop policy if exists "payg_hyp_select" on public.payg_hypotheses;
drop policy if exists "payg_hyp_insert" on public.payg_hypotheses;
drop policy if exists "payg_hyp_update" on public.payg_hypotheses;
drop policy if exists "payg_hyp_delete" on public.payg_hypotheses;

create policy "payg_hyp_select" on public.payg_hypotheses for select to authenticated using (public.payg_is_supervisor());
create policy "payg_hyp_insert" on public.payg_hypotheses for insert to authenticated with check (public.payg_is_supervisor());
create policy "payg_hyp_update" on public.payg_hypotheses for update to authenticated using (public.payg_is_supervisor()) with check (public.payg_is_supervisor());
-- aucune politique DELETE : la ligne du projet ne peut être supprimée par personne via l'API

revoke all on public.payg_hypotheses from anon, authenticated;
grant select, insert, update on public.payg_hypotheses to authenticated;

-- Garde : (a) personne ne retire un jeu d'hypothèses par un simple enregistrement (un jeu manquant est remis) ;
--         (b) chaque ajout / remplacement de jeu est inscrit au journal avec le compte réel (jeton), date et heure.
create or replace function public.payg_hyp_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_list jsonb := '[]'::jsonb;
  new_list jsonb := '[]'::jsonb;
  missing  jsonb;
  e        jsonb;
  o        jsonb;
  deleting boolean := coalesce(current_setting('payg.allow_delete', true), '') = 'on';
begin
  -- Un « upsert » du site déclenche d'abord l'INSERT puis, si la ligne existe, l'UPDATE : on ne traite que le second pour ne rien compter deux fois.
  if tg_op = 'INSERT' and exists (select 1 from public.payg_hypotheses h where h.project_key = new.project_key) then
    return new;
  end if;
  if tg_op = 'UPDATE' then old_list := coalesce(old.profiles -> 'list', '[]'::jsonb); end if;
  new_list := coalesce(new.profiles -> 'list', '[]'::jsonb);
  if jsonb_typeof(old_list) <> 'array' then old_list := '[]'::jsonb; end if;
  if jsonb_typeof(new_list) <> 'array' then new_list := '[]'::jsonb; end if;

  if not deleting then
    select coalesce(jsonb_agg(t.x), '[]'::jsonb) into missing
      from jsonb_array_elements(old_list) as t(x)
     where not exists (select 1 from jsonb_array_elements(new_list) as n(y) where n.y ->> 'name' = t.x ->> 'name');
    if jsonb_array_length(missing) > 0 then
      new.profiles := jsonb_set(coalesce(new.profiles, '{}'::jsonb), '{list}', new_list || missing);
      new_list := new_list || missing;
    end if;
  end if;

  for e in select t.v from jsonb_array_elements(new_list) as t(v) loop
    select t.v into o from jsonb_array_elements(old_list) as t(v) where t.v ->> 'name' = e ->> 'name' limit 1;
    if o is null then
      insert into public.payg_activity (user_email, user_name, event, details)
      values (public.payg_email(), public.payg_name(), 'hypothesis_add', jsonb_build_object('name', e ->> 'name'));
    elsif o is distinct from e then
      insert into public.payg_activity (user_email, user_name, event, details)
      values (public.payg_email(), public.payg_name(), 'hypothesis_update', jsonb_build_object('name', e ->> 'name'));
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists payg_hyp_guard_trg on public.payg_hypotheses;
create trigger payg_hyp_guard_trg before insert or update on public.payg_hypotheses
  for each row execute function public.payg_hyp_guard();

-- Suppression d'un jeu d'hypothèses : RÉSERVÉE À MDA (superviseur principal) ; journalisée.
create or replace function public.payg_delete_profile(p_name text, p_project text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.payg_hypotheses;
begin
  if not public.payg_is_admin() then
    raise exception 'Seul le superviseur principal peut supprimer un jeu d''hypothèses' using errcode = '42501';
  end if;
  perform set_config('payg.allow_delete', 'on', true);
  update public.payg_hypotheses h
     set profiles = jsonb_build_object(
           'list', coalesce((select jsonb_agg(t.x) from jsonb_array_elements(coalesce(h.profiles -> 'list', '[]'::jsonb)) as t(x) where t.x ->> 'name' <> p_name), '[]'::jsonb),
           'active', case when h.profiles ->> 'active' = p_name then null else h.profiles -> 'active' end),
         updated_at = now()
   where (p_project is null or h.project_key = p_project)
  returning h.* into r;
  insert into public.payg_activity (user_email, user_name, event, details)
  values (public.payg_email(), public.payg_name(), 'hypothesis_delete', jsonb_build_object('name', p_name));
  return r.profiles;
end $$;
revoke all on function public.payg_delete_profile(text, text) from public, anon;
grant execute on function public.payg_delete_profile(text, text) to authenticated;

-- ---------- 5. Vérifications facultatives (à lancer à part, en retirant les « -- ») ----------
-- select email, name, is_admin from public.payg_supervisors;                       -- les 4 superviseurs
-- select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by 1, 2;   -- politiques en place
-- select at, user_name, event, details from public.payg_activity order by at desc limit 20;              -- journal (en tant que propriétaire)
