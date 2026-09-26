-- the pack contract, for every row of core.packs (spec 06 tests 3, 4, 5 and the registry; spec 08 K1). A control pack proves every
-- check can fail, and that the known list hides nothing planted. Violations already on the plan print as `known … (K2)` until that
-- kit row fixes them; grants the host made and we cannot revoke print as `host limit …` and do not fail.
-- expects:

-- what a pack role may execute in core; K2 moves this list to core.pack_may_execute()
create or replace function t.pack_may_execute() returns text[] language sql immutable as $$
  select array['write_entry', 'change_request', 'record_settings_change', 'begin_write', 'require_access', 'require_pack', 'refuse', 'short']
$$;

create or replace function t.violations(pkey text) returns table (test text, what text) language plpgsql stable as $$
declare
  r name := 'pack_' || pkey;
  roid oid := (select oid from pg_roles where rolname = 'pack_' || pkey);
  core_tables text := (select string_agg(c.relname, '|') from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'core' and c.relkind in ('r', 'v', 'm', 'p', 'f'));
begin
  if roid is null then return query select 'test 3', 'no role ' || r; return; end if;

  -- test 3 · ownership and definer: the pack's schema and every object in it belong to its role; its functions are definer, set
  -- only search_path='' and are not open to PUBLIC or anon; its public doors pin search_path and run as the caller (or the pack);
  -- its tables are granted to nobody outside
  return query select 'test 3', format('schema %s is owned by %s, not %s', pkey, o.rolname, r)
    from pg_namespace n join pg_roles o on o.oid = n.nspowner where n.nspname = pkey and o.rolname <> r;
  return query select 'test 3', format('%s.%s is owned by %s, not %s', pkey, c.relname, o.rolname, r)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_roles o on o.oid = c.relowner
    where n.nspname = pkey and c.relkind in ('r', 'v', 'm', 'S', 'f', 'p') and o.rolname <> r;
  return query select 'test 3', format('type %s is owned by %s, not %s', ty.oid::regtype, o.rolname, r)
    from pg_type ty join pg_namespace n on n.oid = ty.typnamespace join pg_roles o on o.oid = ty.typowner
    where n.nspname = pkey and ty.typrelid = 0 and ty.typelem = 0 and o.rolname <> r;
  return query select 'test 3', format('%s is owned by %s, not %s', p.oid::regprocedure, o.rolname, r)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles o on o.oid = p.proowner where n.nspname = pkey and o.rolname <> r;
  return query select 'test 3', format('%s is not security definer', p.oid::regprocedure)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = pkey and not p.prosecdef;
  return query select 'test 3', format('%s has no pinned search_path', p.oid::regprocedure)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = pkey or (n.nspname = 'public' and p.proname like pkey || '\_%'))
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  return query select 'test 3', format('%s sets %s; only search_path='''' may be set', p.oid::regprocedure, c)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join lateral unnest(p.proconfig) c
    where (n.nspname = pkey or (n.nspname = 'public' and p.proname like pkey || '\_%')) and c <> 'search_path=""';
  return query select 'test 3', format('%s is executable by %s', p.oid::regprocedure, case a.grantee when 0 then 'PUBLIC' else g.rolname end)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles g on g.oid = a.grantee
    where (n.nspname = pkey or (n.nspname = 'public' and p.proname like pkey || '\_%'))
      and a.privilege_type = 'EXECUTE' and (a.grantee = 0 or g.rolname = 'anon');
  return query select 'test 3', format('%s runs as %s', p.oid::regprocedure, o.rolname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles o on o.oid = p.proowner
    where n.nspname = 'public' and p.proname like pkey || '\_%' and p.prosecdef and o.rolname <> r;
  return query select 'test 3', format('%s.%s grants %s to %s', pkey, c.relname, a.privilege_type, case a.grantee when 0 then 'PUBLIC' else g.rolname end)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(c.relacl) a left join pg_roles g on g.oid = a.grantee
    where n.nspname = pkey and (a.grantee = 0 or g.rolname in ('anon', 'authenticated'));

  -- test 4 · grants: EXECUTE in core is exactly the allow-list; in public only reads, marks and its own doors; nothing on any core
  -- relation (columns included); no other schema, no CREATE anywhere but its own schema, no TEMP; no advisory-lock or file
  -- functions; no default privileges from others; a plain NOLOGIN role that is a member of nothing
  return query select 'test 4', format('executes %s beyond the allow-list%s', p.oid::regprocedure,
      case when has_function_privilege('public', p.oid, 'EXECUTE') and not exists (select 1 from aclexplode(p.proacl) a
        where a.privilege_type = 'EXECUTE' and a.grantee <> 0 and pg_has_role(roid, a.grantee, 'USAGE')) then ' (via PUBLIC)' else '' end)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core' and p.proname <> all (t.pack_may_execute()) and has_function_privilege(roid, p.oid, 'EXECUTE');
  return query select 'test 4', format('cannot execute core.%s from the allow-list', a)
    from unnest(t.pack_may_execute()) a
    where not exists (select 1 from pg_proc p where p.pronamespace = 'core'::regnamespace and p.proname = a and has_function_privilege(roid, p.oid, 'EXECUTE'));
  return query select 'test 4', format('executes %s, which is not a read, a mark or its own door', p.oid::regprocedure)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname !~ ('^(read_|mark_|' || pkey || '_)') and has_function_privilege(roid, p.oid, 'EXECUTE');
  return query select 'test 4', format('holds a privilege on core.%s', c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and ((c.relkind in ('r', 'v', 'm', 'p', 'f')
            and (has_table_privilege(roid, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                 or has_any_column_privilege(roid, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
         or (c.relkind = 'S' and has_sequence_privilege(roid, c.oid, 'USAGE,SELECT,UPDATE')));
  return query select case when t.host_granted(n.nspacl, n.nspowner, 'n', 'USAGE', roid) then 'host limit' else 'test 4' end,
      format('has USAGE on schema %s', n.nspname)
    from pg_namespace n where n.nspname not in ('core', 'pg_catalog', 'information_schema', 't') and n.nspname <> pkey
      and n.nspname not like 'pg\_toast%' and n.nspname not like 'pg\_temp%' and has_schema_privilege(roid, n.oid, 'USAGE');
  return query select 'test 4', format('has CREATE on schema %s', n.nspname)
    from pg_namespace n where n.nspname <> pkey and n.nspname not like 'pg\_toast%' and n.nspname not like 'pg\_temp%'
      and has_schema_privilege(roid, n.oid, 'CREATE');
  return query select 'test 4', 'has CREATE on the database' where has_database_privilege(roid, current_database(), 'CREATE');
  return query select 'test 4', 'has TEMP on the database' where has_database_privilege(roid, current_database(), 'TEMP');
  return query select case when t.host_granted(p.proacl, p.proowner, 'f', 'EXECUTE', roid) then 'host limit' else 'test 4' end,
      format('can run %s', p.oid::regprocedure)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pg_catalog' and (p.proname like 'pg\_advisory%' or p.proname like 'pg\_try\_advisory%'
      or p.proname in ('pg_read_file', 'pg_read_binary_file', 'pg_ls_dir', 'pg_stat_file', 'lo_import', 'lo_export'))
      and has_function_privilege(roid, p.oid, 'EXECUTE');
  return query select 'test 4', format('default privileges give it %s on new objects in %s', a.privilege_type, coalesce(n.nspname, 'every schema'))
    from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a
    where a.grantee = roid and d.defaclrole <> roid;
  return query select 'test 4', format('%s is not a plain NOLOGIN role', r)
    from pg_roles where oid = roid and (rolcanlogin or rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls);
  return query select 'test 4', format('is a member of %s', g.rolname)
    from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = roid;

  -- test 5 · static scan of every body the pack wrote (plpgsql and SQL-standard bodies, and views), after unquoting and joining
  -- "a" . "b" into a.b, so quoting and spacing hide nothing
  return query
    with bodies (name, src) as (
      select p.oid::regprocedure::text, coalesce(nullif(p.prosrc, ''), pg_get_function_sqlbody(p.oid), '')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = pkey or (n.nspname = 'public' and p.proname like pkey || '\_%')
      union all
      select format('view %s.%s', pkey, c.relname), pg_get_viewdef(c.oid)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = pkey and c.relkind in ('v', 'm')),
    norm as (select b.name, regexp_replace(replace(b.src, '"', ''), '\s*\.\s*', '.', 'g') as src from bodies b)
    select 'test 5', format('%s mentions %s', b.name, (regexp_match(b.src, x.pattern, 'i'))[1])
    from norm b cross join (values ('\m(core\.(' || core_tables || '))\M'), ('(pg_(try_)?advisory\w*)'),
                                   ('\m(set\s+(local\s+|session\s+)?(role|session\s+authorization))\M'), ('\m(set_config)\M'),
                                   ('(opencare\.\w+)'), ('\m(pg_sleep\w*)'),
                                   ('\m((statement|lock|idle_in_transaction_session|idle_session|transaction)_timeout)\M'),
                                   ('\m(cron\.\w+)'), ('\m(net\.\w+)'), ('\m(execute)\M'),
                                   ('\m((query|cursor|table|schema|database)_to_xml\w*|ts_stat)\M')) x(pattern)
    where b.src ~* x.pattern;

  -- registry · every row named for the pack carries it; the owner role holds every pack action; declared reactions exist
  return query select 'registry', format('entry type %s does not carry pack = %s', e.key, pkey)
    from core.entry_types e where (e.key = pkey or e.key like pkey || '\_%') and e.pack is distinct from pkey;
  return query select 'registry', format('department type %s does not carry pack = %s', d.key, pkey)
    from core.department_types d where (d.key = pkey or d.key like pkey || '\_%') and d.pack is distinct from pkey;
  return query select 'registry', format('action %s does not carry pack = %s', a.key, pkey)
    from core.actions a where (a.key like '%:' || pkey or a.key like '%:' || pkey || '\_%') and a.pack is distinct from pkey;
  return query select 'registry', format('the owner role lacks %s', a.key)
    from core.actions a join core.roles o on o.organization_id is null and o.key = 'owner'
    where a.pack = pkey and not exists (select 1 from core.role_actions ra where ra.role_id = o.id and ra.action = a.key);
  return query select 'registry', format('entry type %s keeps list %s but %s.update_%s is missing', e.key, e.pack_list, pkey, e.pack_list)
    from core.entry_types e where e.pack = pkey and e.pack_list is not null
      and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = pkey and p.proname = 'update_' || e.pack_list);
  return query select 'registry', format('%s is called after writes but %s.after_write is missing', pkey, pkey)
    from core.packs k where k.key = pkey and k.is_called_after_write
      and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = pkey and p.proname = 'after_write');
end $$;

-- one line per new violation; known ones grouped with their count; host limits listed; 'ok' when nothing new
create or replace function t.contract(pkey text) returns setof text language sql stable as $$
  with v as (select v.test, v.what, (select k.what || ' (' || k.fixed_by || ')' from t.known_list k
                                      where k.test = v.test and v.what like k.what limit 1) as known
             from t.violations(pkey) v)
  select 'FAIL ' || pkey || ' ' || test || ': ' || what from v where known is null and test <> 'host limit'
  union all
  select 'known ' || pkey || ' ' || test || ': ' || known || ' ×' || count(*) from v where known is not null group by test, known
  union all
  select 'host limit ' || pkey || ': ' || what from v where test = 'host limit'
  union all
  select 'ok ' || pkey || ': no new violation of the pack contract' where not exists (select 1 from v where known is null and test <> 'host limit')
$$;

\echo '── violations on the plan (K2 closes the boundary; K9 moves pharmacy onto the kit)'
do $$ begin
  perform t.known('test 3', 'pharmacy.write_dispense(%) is executable by PUBLIC', 'K2');
  perform t.known('test 3', 'pharmacy_write_dispense(%) is executable by PUBLIC', 'K2');
  perform t.known('test 4', 'executes core.% beyond the allow-list (via PUBLIC)', 'K2');
  perform t.known('test 4', 'executes %, which is not a read, a mark or its own door', 'K2');
  perform t.known('test 4', 'has TEMP on the database', 'K2');
end $$;

\echo '── the control: a pack that breaks every rule is caught, and one clean function is not (built and rolled back)'
savepoint control;
create role pack_badpack nologin;
grant pack_badpack to postgres;
create schema badpack authorization pack_badpack;
grant usage on schema core to pack_badpack;   -- as every pack has
grant select on core.entries to pack_badpack;
grant select (id) on core.patients to pack_badpack;
grant usage on schema extensions to pack_badpack;
grant authenticated to pack_badpack;
insert into core.packs (key, name, is_called_after_write) values ('badpack', 'Control', true);
insert into core.entry_types (key, name, pack) values ('badpack_thing', 'Thing', null);
insert into core.actions (key, pack) values ('write:badpack_x', null);
set role pack_badpack;
create function badpack.peek() returns bigint language sql stable as $f$ select count(*) from "core" . "entries" $f$;
create function badpack.lock() returns void language plpgsql security definer set search_path = '' as $f$
begin perform pg_catalog.pg_advisory_xact_lock(1); execute 'select 1'; end $f$;
create function badpack.atomic() returns bigint language sql security definer set search_path = '' begin atomic select count(*) from core.entries; end;
create function badpack.all_patterns() returns void language plpgsql security definer set search_path = '' as $f$
begin
  set role postgres; perform pg_catalog.set_config('x.y', '1', true); perform pg_catalog.current_setting('opencare.acting_user_id');
  perform pg_catalog.pg_sleep(0); set local statement_timeout = 0; perform cron.schedule('a', 'b', 'c'); perform net.http_get('u');
  perform pg_catalog.query_to_xml('select 1', true, true, '');
end $f$;
create function badpack.loose() returns void language plpgsql security definer set search_path = core as $f$ begin null; end $f$;
create function badpack.clean() returns int language sql security definer set search_path = '' as $f$ select 1 $f$;
revoke execute on function badpack.clean() from public;
create table badpack.rows (x int);
grant select on badpack.rows to authenticated;
reset role;
create function badpack.not_owned() returns int language sql security definer set search_path = '' as $f$ select 1 $f$;
create function public.badpack_door() returns int language sql security definer set search_path = '' as $f$ select 1 $f$;

select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what like '%peek() is not security definer'), 'control: test 3 catches a function that is not definer');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what like '%peek() has no pinned search_path'), 'control: test 3 catches an unpinned search_path');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what like '%loose() sets search_path=core%'), 'control: test 3 catches a search_path other than empty');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what like '%peek() is executable by PUBLIC'), 'control: test 3 catches PUBLIC EXECUTE');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what like '%not_owned() is owned by postgres%'), 'control: test 3 catches an object the pack does not own');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what like 'badpack_door() runs as postgres'), 'control: test 3 catches a door that runs as another role');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 3' and v.what = 'badpack.rows grants SELECT to authenticated'), 'control: test 3 catches a pack table granted outside');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 4' and v.what = 'holds a privilege on core.entries'), 'control: test 4 catches a grant on a core table');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 4' and v.what = 'holds a privilege on core.patients'), 'control: test 4 catches a column grant on a core table');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 4' and v.what = 'has USAGE on schema extensions'), 'control: test 4 catches USAGE on another schema');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 4' and v.what = 'is a member of authenticated'), 'control: test 4 catches role membership');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 5' and v.what like '%peek() mentions core.entries'), 'control: test 5 catches a quoted, spaced core table name');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 5' and v.what like '%atomic() mentions core.entries'), 'control: test 5 scans SQL-standard bodies');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 5' and v.what like '%lock() mentions pg_advisory%'), 'control: test 5 catches an advisory lock');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 5' and v.what like '%lock() mentions execute'), 'control: test 5 catches dynamic execute');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'test 5' and v.what like '%all_patterns() mentions ' || m || '%'), 'control: test 5 catches ' || m)
  from unnest(array['set role', 'set_config', 'opencare.acting_user_id', 'pg_sleep', 'statement_timeout', 'cron.schedule', 'net.http_get', 'query_to_xml']) m;
select t.ok(not exists (select 1 from t.violations('badpack') v where v.what like '%clean()%'), 'control: a clean function raises nothing');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'registry' and v.what like 'entry type badpack_thing%'), 'control: the registry check catches an untagged type');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'registry' and v.what like 'action write:badpack_x%'), 'control: the registry check catches an untagged action');
select t.ok(exists (select 1 from t.violations('badpack') v where v.test = 'registry' and v.what like '%after_write is missing'), 'control: the registry check catches a missing after_write');
select t.ok(exists (select 1 from t.violations('nosuchpack') v where v.what = 'no role pack_nosuchpack'), 'control: a pack with no role is caught');
select t.ok(exists (select 1 from t.contract('badpack') l where l = 'FAIL badpack test 4: holds a privilege on core.entries'), 'control: the known list hides no planted violation');
rollback to savepoint control;
select t.ok(not exists (select 1 from pg_roles where rolname = 'pack_badpack'), 'control: rolled back');

\echo '── every pack'
select t.contract(key) from core.packs order by key;
