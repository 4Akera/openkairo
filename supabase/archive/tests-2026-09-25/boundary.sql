-- needs: reset
-- the pack boundary (spec 06 tests 1–9), with a hostile fixture pack. Run as postgres after db reset.
-- expects:
\set org '00000000-0000-0000-0000-0000000000a1'
\set dr  '00000000-0000-0000-0000-0000000000b1'
\set im  '00000000-0000-0000-0000-0000000000d1'
\set pt  '00000000-0000-0000-0000-0000000000f1'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name) values (:'dr', :'org', 'staff', 'Dr Ali');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'IM');
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values (:'pt', :'org', 1, 'Ahmed', 'Hassan', 'male', '1968');

-- ── the hostile pack: its own schema and role, exactly the grants spec 06 allows ──
do $$ begin if not exists (select 1 from pg_roles where rolname = 'pack_hostile') then create role pack_hostile nologin; end if; end $$;
grant pack_hostile to postgres;   -- the migration runner is not a superuser; it must be allowed to SET ROLE
create schema hostile authorization pack_hostile;
grant usage on schema core to pack_hostile;
grant execute on function core.write_entry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,core.entry_source,text,timestamptz,text,uuid,jsonb,text,uuid,boolean,uuid,uuid,jsonb,boolean) to pack_hostile;
grant execute on function core.change_request(uuid,core.request_step,core.request_step,uuid,text,jsonb,timestamptz), core.require_access(uuid,text,uuid,uuid), core.require_pack(uuid,text) to pack_hostile;
insert into core.packs (key, name, is_called_after_write) values ('hostile', 'Hostile fixture', true);
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000c0ff', null, 'pack:hostile', 'Hostile pack');
insert into core.organization_packs (organization_id, pack) values (:'org', 'hostile');
insert into core.users (id, organization_id, kind, name) values ('00000000-0000-0000-0000-0000000000ff', :'org', 'pack', 'hostile');
insert into core.user_roles (organization_id, user_id, role_id) values (:'org', '00000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000c0ff');
set role pack_hostile;
create table hostile.mode (m text);  insert into hostile.mode values ('ok');
create table hostile.log (entry_id uuid, at timestamptz default clock_timestamp());
create function hostile.after_write(e core.entries) returns void language plpgsql security definer set search_path = '' as $$
declare m text; begin
  select mode.m into m from hostile.mode limit 1;
  if m = 'sleep' then perform pg_catalog.pg_sleep(6);
  elsif m = 'raise' then raise exception 'hostile raise';
  elsif m = 'write_core' then insert into core.entries select * from core.entries limit 0; insert into core.record_reads (organization_id, user_id, patient_id) values (e.organization_id, e.author_id, e.patient_id);
  else insert into hostile.log (entry_id) values (e.id); end if;
end $$;
reset role;

\echo '── B4 grants: the pack role holds nothing on any core table'
select t.ok(bool_and(not has_table_privilege('pack_hostile', 'core.' || tablename, 'SELECT,INSERT,UPDATE,DELETE')), 'B4 the pack role holds nothing on any core table') from pg_tables where schemaname = 'core';
\echo '── B3 ownership and definer: every hostile function is definer and owned by its role'
select t.ok(bool_and(p.prosecdef and r.rolname = 'pack_hostile'), 'B3 every hostile function is definer and owned by its role') from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'hostile';
\echo '── B1 a sleeping pack delays no write: write_entry under 300 ms while the pack would sleep 6 s'
update hostile.mode set m = 'sleep';
create temp table b1 (ms numeric);
do $$ declare t0 timestamptz := clock_timestamp(); begin
  perform core.write_entry('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"x"}', 'Progress · x', null, true, null, null, null);
  insert into b1 values (extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
select t.ok(ms < 300, 'B1 write_entry did not wait for the sleeping pack') from b1;
select t.ok(count(*) = 1 and bool_and(tries = 0), 'B1 the call waits in pack_calls, untried') from core.pack_calls where pack = 'hostile';
\echo '── B2 the runner survives the sleeper (it finishes in its own time; the write was never delayed) and clears the row'
call core.run_pack_calls();
select t.ok(count(*) = 0, 'B2 the runner survived the sleeper and cleared the row') from core.pack_calls;
\echo '── B5 a raising pack: its error is recorded, retried, parked after five tries'
update hostile.mode set m = 'raise';
select t.ok((core.write_entry('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"y"}', 'Progress · y', null, true, null, null, null)).id is not null, 'B5 the write lands although the pack raises');
call core.run_pack_calls();
select t.ok(count(*) = 1 and bool_and(tries = 1 and error_text like 'hostile raise%'), 'B5 the error is recorded after one try') from core.pack_calls;
update core.pack_calls set tries = 4, tried_at = null;
call core.run_pack_calls();
select t.ok(count(*) = 1 and bool_and(tries >= 5), 'B5 parked after five tries') from core.pack_calls;
delete from core.pack_calls;
\echo '── B6 a pack writing a core table is refused by Postgres, not by review'
update hostile.mode set m = 'write_core';
select t.ok((core.write_entry('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"z"}', 'Progress · z', null, true, null, null, null)).id is not null, 'B6 the write lands');
call core.run_pack_calls();
select t.ok(bool_and(error_text like 'permission denied%'), 'B6 the pack''s write to a core table was refused by Postgres') from core.pack_calls;
select t.ok(count(*) = 0, 'B6 nothing reached core.record_reads') from core.record_reads;
delete from core.pack_calls;
\echo '── B7 a well-behaved pack reacts once and the row is gone'
update hostile.mode set m = 'ok';
select t.ok((core.write_entry('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"w"}', 'Progress · w', null, true, null, null, null)).id is not null, 'B7 the write lands');
call core.run_pack_calls();
call core.run_pack_calls();
select t.ok(count(*) = 0, 'B7 no call left pending') from core.pack_calls;
select t.ok(count(*) = 1, 'B7 the pack reacted exactly once') from hostile.log;
\echo '── B8 the funnel gates a pack caller: as the pack user it cannot write a type its role lacks, nor write as a doctor'
select set_config('opencare.acting_user_id', '00000000-0000-0000-0000-0000000000ff', false) is not null as acting;
set role pack_hostile;
select t.refuses($q$select core.write_entry('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000ff', null, 'staff', null, null, 'prescription', null, '{}', 'x', null, true, null, null, null)$q$, 'not_allowed');
select t.refuses($q$select core.write_entry('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', null, 'staff', null, null, 'note', null, '{}', 'x', null, true, null, null, null)$q$, 'author_mismatch');
reset role; select set_config('opencare.acting_user_id', '', false) is not null as cleared;
select t.ok(count(*) = 0, 'B8 the pack user wrote nothing') from core.entries where author_id = '00000000-0000-0000-0000-0000000000ff';
\echo '── B9 advisory locks: the host grants them to PUBLIC and we cannot revoke that; the runner timeout is the fallback'
select case when not has_function_privilege('pack_hostile', p.oid, 'EXECUTE') then 'ok B9 the pack role cannot take advisory locks'
            when t.host_granted(p.proacl, p.proowner, 'f', 'EXECUTE', (select oid from pg_roles where rolname = 'pack_hostile')) then 'host limit B9: the pack role can take advisory locks'
            else 'FAIL B9 the pack role can take advisory locks through a grant we made' end
  from pg_proc p where p.oid = 'pg_catalog.pg_advisory_xact_lock(bigint)'::regprocedure;
\echo '── B10 rebuild with a hostile updater leaves core lists rebuilt (no pack list here: counts only)'
select t.ok(core.rebuild_record('00000000-0000-0000-0000-0000000000f1') ? 'values', 'B10 rebuild_record rebuilds the core lists');
