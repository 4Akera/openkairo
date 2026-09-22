-- 0001 · foundation: schemas, roles, enums, helpers (specs 01, 02)
-- Tables live in schema core. public holds only callable functions. Packs get their own schema.
create extension if not exists pgcrypto      with schema extensions;
create extension if not exists pg_trgm       with schema extensions;
create extension if not exists unaccent      with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;   -- dmetaphone (spec 03 search)

create schema if not exists core;
revoke all on schema public from public;
revoke all on schema core from public;
grant usage on schema public to authenticated, anon, service_role;
grant usage on schema core to authenticated, service_role;   -- functions only; no table grants ever
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema core   revoke execute on functions from public;

-- the runner's role (spec 02): runs after_write outside the clinical transaction
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pack_runner') then
    create role pack_runner nologin;
  end if;
end $$;
grant usage on schema core to pack_runner;

-- ── enums (declaration order is meaningful: stat first, critical last) ──
create type core.user_kind        as enum ('staff','machine','pack','patient','proxy','importer');
create type core.entry_source     as enum ('staff','patient','machine','outside','import');
create type core.request_priority as enum ('stat','urgent','routine');
create type core.request_step     as enum ('sent','held','started','replied','done','cancelled','reopened');
create type core.request_status   as enum ('open','done','cancelled');
create type core.value_flag       as enum ('normal','low','high','abnormal','critical');
create type core.visit_status     as enum ('waiting','in_consult','pending','done','left','lapsed','cancelled');
create type core.sex              as enum ('female','male','other');
create type core.list_kind        as enum ('medications','problems','allergies');

-- ── helpers ──
-- partial ISO date: '1968', '1968-03', '1968-03-14'
create domain core.partial_date as text
  check (value ~ '^\d{4}(-\d{2}(-\d{2})?)?$');

create or replace function core.age_on(born core.partial_date, at_date date) returns int
language sql immutable strict as $$
  select extract(year from age(at_date,
    make_date(substr(born,1,4)::int,
              coalesce(nullif(substr(born,6,2),'')::int, 7),
              coalesce(nullif(substr(born,9,2),'')::int, 1))))::int
$$;

-- unaccent is STABLE; an index needs IMMUTABLE. Wrapping it with a fixed dictionary is the standard idiom.
create or replace function core.fold(t text) returns text
language sql immutable strict parallel safe as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, t))
$$;

-- the caller's auth id, or NULL outside a request
create or replace function core.auth_uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function core.auth_aal() returns text
language sql stable as $$ select coalesce(current_setting('request.jwt.claim.aal', true), 'aal1') $$;

-- one error shape for every refusal: raise core.refuse('patient_merged', 'survivor=…')
create or replace function core.refuse(code text, detail text default null) returns void
language plpgsql as $$
begin
  raise exception using message = code, detail = coalesce(detail, ''), errcode = 'P0001';
end $$;
