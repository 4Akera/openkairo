-- permanent test 2 · the boundary scan (spec §8): only the writer (and what it calls), the reader (and what it calls), refreshes and the
-- eraser name entries or a derived table; nothing is reachable from the API but the doors; only owners write derived tables
\echo '── who names core.entries: the writer and its checks, the reader and its rules and mappings, refreshes, the eraser, a few doors'
with registered as (
  select unnest(checks)::oid f from core.types union select line from core.types union select to_fhir from core.types where to_fhir is not null
  union select claims from core.types where claims is not null union select refresh from core.derived union select hidden from core.rules union select refresh from core.listeners),
allowed(name) as (values
  -- the writer, the reader, the eraser and the guard
  ('core.writer'), ('core.hidden'), ('core.read_record'), ('core.read_item'), ('core.read_file'), ('core.read_fhir'), ('core.rows_out'), ('core.may_read_file'),
  ('core.erase'), ('core.redact'), ('core.rebuild_check'), ('core.refresh_patients'),
  -- the doors that ask "was it ever used" or catch a pack up, and a pack's reading door
  ('core.save_place_row'), ('public.remove'), ('public.write_setting'), ('core.pack_entries'),
  -- a pack's reading doors, masked by default (§5.2)
  ('core.pack_masked'), ('core.pack_kind'), ('core.pack_visit'), ('core.pack_rows'),
  -- helpers of the base's checks and refreshes
  ('base.entry'), ('base.latest'), ('base.orders_of'), ('base.answers_of'), ('base.same_kind'))
select t.report('boundary', n.nspname || '.' || p.proname || ' names core.entries')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname not in ('t', 'pg_catalog', 'information_schema') and p.prosrc ~ 'core\.entries\M'
   and p.oid not in (select f from registered) and n.nspname || '.' || p.proname not in (select name from allowed);
select t.ok(true, 'every function naming core.entries is the writer''s, the reader''s, a refresh, a check, a rule, the eraser''s or a listed door');

\echo '── who names a derived table: refreshes, checks and mappings (reads), and the base''s identity door for packs; the reader reaches them only through the registry'
with registered as (
  select unnest(checks)::oid f from core.types union select to_fhir from core.types where to_fhir is not null union select refresh from core.derived union select refresh from core.listeners
  union select 'base.pack_identity(uuid,uuid,timestamptz)'::regprocedure)
select t.report('boundary', n.nspname || '.' || p.proname || ' names a derived table')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace, core.derived d
 where n.nspname not in ('t', 'pg_catalog', 'information_schema') and p.prosrc ~ (replace(d.key, '.', '\.') || '\M') and p.oid not in (select f from registered);
select t.ok(true, 'every function naming a derived table is registered, or the identity door');

\echo '── grants: the API holds no table; only the doors are callable'
select t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('core', 'base', 'pharmacy') and c.relkind in ('r', 'v', 'm')
  and (has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))), 'authenticated and anon hold no table in core, base or a pack');
select t.ok(coalesce(string_agg(p.proname, ', ' order by p.proname), '') = 'choose_user, create_organization, erase_patient, merge_patients, my_users, read, redact, remove, save, save_patient, setup, write, write_setting',
  'the public doors: ' || coalesce(string_agg(p.proname, ', ' order by p.proname), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'EXECUTE');
select t.ok(coalesce(string_agg(p.proname, ', ' order by p.proname), '') = 'may_listen, may_read_file, may_upload_file', 'core functions the API may call: ' || coalesce(string_agg(p.proname, ', ' order by p.proname), ''))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'core' and has_function_privilege('authenticated', p.oid, 'EXECUTE');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('base', 'pharmacy') and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'no base or pack function is callable from the API');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('core', 'base', 'pharmacy', 'public') and p.prokind = 'f'
  and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false)), 'every definer function pins search_path empty');

\echo '── only the owners write derived tables (the eraser deletes); the spine is written by the writer only'
select t.ok(not exists (select 1 from core.derived d, pg_roles r where r.rolname not in ('postgres', 'supabase_admin') and r.rolname !~ '^pg_' and not r.rolsuper
  and r.rolname <> (select l.role_name from core.layers l where l.key = d.layer) and has_table_privilege(r.oid, d.relation, 'INSERT,UPDATE')), 'no one but its layer writes a derived table');
select t.ok(not exists (select 1 from pg_roles r where r.rolname not in ('postgres', 'supabase_admin', 'core_eraser') and r.rolname !~ '^pg_' and not r.rolsuper and has_table_privilege(r.oid, 'core.entries', 'INSERT,UPDATE,DELETE')),
  'only the migration owner (the writer) and the eraser write entries');
select t.ok(bool_and(not has_table_privilege(l.role_name, 'core.' || c.relname, 'SELECT,INSERT,UPDATE,DELETE')), 'packs hold no core table')
  from core.layers l, pg_class c join pg_namespace n on n.oid = c.relnamespace where l.is_pack and n.nspname = 'core' and c.relkind = 'r';
select case when not exists (select 1 from pg_namespace where nspname = 'net') then 'ok no net schema'
            when bool_and(not has_schema_privilege(l.role_name, 'net', 'USAGE')) then 'ok packs cannot reach the network (no USAGE on net)'
            when bool_and(t.host_granted(n.nspacl, n.nspowner, 'n', 'USAGE', (select oid from pg_roles where rolname = l.role_name))) then 'host limit: the host grants USAGE on net to PUBLIC; packs must not call it (review)'
            else 'FAIL a pack can reach the network through a grant we made' end
  from core.layers l, pg_namespace n where l.is_pack and n.nspname = 'net';
