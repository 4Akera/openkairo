-- permanent test 8 · the pack contract (spec §5, §8), ported from boundary (B1–B10) with a hostile fixture pack: prefixes and grants of every
-- pack; a listener runs after commit (a slow or broken pack never delays or refuses a write); a raising refresh marks the pack stale; a pack
-- cannot write a core table; off refuses its new entries and keeps its rules; on again catches up
\set im '00000000-0000-0000-0000-0000000000d1'
\set pt '00000000-0000-0000-0000-0000000000f1'
select t.fixture();

\echo '── every pack: its keys inside its prefix; no privilege on any core table'
select t.ok(not exists (select 1 from core.types t join core.layers l on l.key = t.layer where l.is_pack and position(l.key || '.' in t.key) <> 1)
  and not exists (select 1 from core.actions a join core.layers l on l.key = a.layer where l.is_pack and position(l.key || '.' in split_part(a.key, ':', 2)) <> 1)
  and not exists (select 1 from core.setting_keys k join core.layers l on l.key = k.layer where l.is_pack and position(l.key || '.' in k.key) <> 1)
  and not exists (select 1 from core.derived d join core.layers l on l.key = d.layer where l.is_pack and position(l.key || '.' in d.key) <> 1), 'every pack key sits inside its prefix');
select t.ok(not exists (select 1 from core.systems x join core.layers l on l.key = x.layer where l.is_pack and position(l.key || '.' in x.key) <> 1)
  and not exists (select 1 from core.setups x join core.layers l on l.key = x.layer where l.is_pack and position(l.key || '.' in x.key) <> 1)
  and not exists (select 1 from core.roles r join core.layers l on l.key = r.layer where r.organization_id is null
                    and ((l.is_pack and position(l.key || '.' in r.key) <> 1) or r.id::text !~ ('^00000000-0000-0000-0000-00000000' || l.role_block || '[0-9a-f]{2}$'))),
  'its code systems, setups and roles too: each role''s id in its layer''s reserved block (§5.2)');

\echo '── the hostile pack: a table fed by its own type (inline) and a listener on the base''s notes (after commit); a mode switch'
select core.declare_pack('hostile', 1, '{}', '{"en":"Hostile fixture"}');
select core.create_pack('hostile');
select core.lock_pack('hostile');
set role pack_hostile;
create table hostile.mode (m text); insert into hostile.mode values ('ok');
create table hostile.log (organization_id uuid, patient_id uuid, item uuid, source_entries uuid[]);   -- nothing entries do not hold
create function hostile.behave() returns void language plpgsql security definer set search_path = '' as $$
declare m text;
begin
  select x.m into m from hostile.mode x limit 1;
  if m = 'raise' then raise exception 'hostile raise'; end if;
  if m = 'write_core' then insert into core.read_log (organization_id, user_id, purpose) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'TREAT'); end if;
  if m = 'sleep' then perform pg_catalog.pg_sleep(0.6); end if;
end $$;
create function hostile.log_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hostile.behave();
  delete from hostile.log l where l.organization_id = p_org and l.item = any (p_items);
  insert into hostile.log (organization_id, patient_id, item, source_entries)
    select p_org, e.patient_id, e.item, array_agg(e.id) from core.pack_entries(p_org, p_items) e where e.item = any (p_items) group by e.patient_id, e.item;
end $$;
create function hostile.hear(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform hostile.log_refresh(p_org, p_items);
end $$;
create function hostile.ping_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select 'Ping' $$;
create function hostile.hide(p_reader uuid, p_ids uuid[]) returns uuid[] language sql stable security definer set search_path = '' as $$
  select case when p_reader = '00000000-0000-0000-0000-0000000000b1' then '{}'::uuid[] else p_ids end   -- only its writer reads a ping
$$;
reset role;
select core.declare_action('write:hostile.ping', 'hostile');
select core.declare_action('read:hostile.log', 'hostile');
select core.declare_table('hostile.log', 'hostile', 'hostile.log_refresh(uuid,uuid[])', 'read:hostile.log');
select core.declare_type('hostile.ping', 1, 'hostile', '{"type":"object","additionalProperties":false,"properties":{"text":{"type":"string"}}}', 'hostile.ping_line(jsonb)',
  may_be_private => true, feeds => array['hostile.log'], labels => '{"en":"Ping"}');
select core.declare_listener('hostile', array['note'], 'hostile.hear(uuid,uuid[])');
select core.declare_rule('hostile.hide', 'hostile', 'hostile.hide(uuid,uuid[])');
select core.lock_pack('hostile');
select t.as('11111111-0000-0000-0000-0000000000b9');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","hostile"]}}') ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["hostile"]}'::jsonb)) ->> 'key' as ticked;   -- its actions count where it is used
reset role;
select t.ok(bool_and(not has_table_privilege('pack_hostile', 'core.' || tablename, 'SELECT,INSERT,UPDATE,DELETE')), 'B4 the pack role holds nothing on any core table') from pg_tables where schemaname = 'core';
select t.ok(bool_and(p.prosecdef and r.rolname = 'pack_hostile'), 'B3 every hostile function is definer and its own') from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'hostile';
select t.ok(not has_function_privilege('authenticated', 'hostile.log_refresh(uuid,uuid[])', 'EXECUTE'), 'its functions are not callable from the API');

\echo '── B1 a sleeping listener delays no write: the write returns before the pack runs'
update hostile.mode set m = 'sleep';
insert into core.holdings (organization_id, user_id, role_id, department_id) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000c001', :'im');
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b1');
create temp table b1 (ms numeric);
grant all on b1 to public;
do $$ declare t0 timestamptz := clock_timestamp(); r jsonb; begin
  r := t.w(t.e('note', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{"text":"heard later"}', '00000000-0000-0000-0000-0000000000e1'));
  insert into b1 values (extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
select t.ok(ms < 500, 'B1 the note landed in ' || round(ms) || ' ms although the pack would sleep 600') from b1;
reset role;
select t.ok(count(*) = 1 and bool_and(tries = 0), 'B1 the call waits in the outbox, untried') from core.outbox where layer = 'hostile';

\echo '── B5 a raising listener: its error is recorded, the pack marked stale for the patient; the write stood'
update hostile.mode set m = 'raise';
select core.drain() as drained;
select t.ok(count(*) = 1 and bool_and(tries = 1 and error like 'hostile raise%'), 'B5 the error is recorded after one try') from core.outbox where layer = 'hostile';
select t.ok(exists (select 1 from core.stale where layer = 'hostile' and patient_id = :'pt'), 'B5 the pack is stale for the patient');
select t.ok(exists (select 1 from core.entries where id = '00000000-0000-0000-0000-0000000000e1'), 'B5 the note stands');
update core.outbox set tries = 4 where layer = 'hostile';
select core.drain() as drained;
select t.ok(count(*) = 1 and bool_and(tries >= 5), 'B5 parked after five tries') from core.outbox where layer = 'hostile';
select t.ok(core.drain() = 0, 'a parked call is not retried');

\echo '── B6 a pack writing a core table is refused by Postgres, not by review'
update core.outbox set tries = 0 where layer = 'hostile';
update hostile.mode set m = 'write_core';
select core.drain() as drained;
select t.ok(bool_and(error like 'permission denied%'), 'B6 permission denied') from core.outbox where layer = 'hostile';
select t.ok(not exists (select 1 from core.read_log where user_id = '00000000-0000-0000-0000-0000000000b1' and patient_id is null and what = '{}'), 'B6 nothing reached core.read_log');

\echo '── B7 a well-behaved pack reacts once and the row is gone'
update hostile.mode set m = 'ok';
select t.ok(core.drain() = 1, 'B7 drained');
select t.ok(not exists (select 1 from core.outbox where layer = 'hostile'), 'B7 nothing left');
select t.ok(count(*) = 1, 'B7 the pack reacted exactly once') from hostile.log where item = '00000000-0000-0000-0000-0000000000e1';

\echo '── its own type refreshes inline: a raising refresh marks it stale and never refuses; its rule hides only its own type'
update hostile.mode set m = 'raise';
insert into core.holdings (organization_id, user_id, role_id, department_id) select organization_id, id, '00000000-0000-0000-0000-00000000c001', null from core.users where id = '00000000-0000-0000-0000-0000000000b8';
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(t.w(t.e('hostile.ping', :'pt', :'im', '{"text":"x"}', '00000000-0000-0000-0000-0000000000e2')), 'a ping lands although its refresh raises');
reset role;
select t.ok(exists (select 1 from core.stale where layer = 'hostile' and error like 'hostile raise%'), 'stale, with the error');
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b9');
select t.ok(e ->> 'line' = 'Private ping' and exists (select 1 from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') x where x ->> 'id' = '00000000-0000-0000-0000-0000000000e1' and x ->> 'line' like '%heard later%'),
  'the pack''s rule hides its own ping from others and never the base''s note') from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') e where e ->> 'id' = '00000000-0000-0000-0000-0000000000e2';

\echo '── B8 the writer gates a pack''s type like any other: a user without its action cannot write it'
select t.as('11111111-0000-0000-0000-0000000000b3');
select t.refused(t.w(t.e('hostile.ping', :'pt', :'im', '{"text":"y"}')), 'not_allowed', 'the nurse');

\echo '── off: new entries refused, corrections allowed, its rule still applies; on again: its table catches up'
select t.as('11111111-0000-0000-0000-0000000000b9');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.refused(t.w(t.e('hostile.ping', :'pt', :'im', '{"text":"z"}')), 'pack_off', 'a new ping');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"typo"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e2')), 'a cross-out of its entry still lands');
select t.as('11111111-0000-0000-0000-0000000000b9');
select t.ok(e ->> 'line' = 'Private ping', 'its rule still applies while off') from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') e where e ->> 'id' = '00000000-0000-0000-0000-0000000000e2';
reset role;
update hostile.mode set m = 'ok';
delete from hostile.log;
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b9');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","hostile"]}}') ->> 'key' as on_again;
reset role;
select t.ok(exists (select 1 from hostile.log where item = '00000000-0000-0000-0000-0000000000e1') and not exists (select 1 from core.stale where layer = 'hostile'), 'on again: caught up, no longer stale');

\echo '── the row rule (§3.10): a pack row copies data only from its own item; from other items only facts that are never private'
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b8');
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', '00000000-0000-0000-0000-0000000000d5', '{"kind":"progress","text":"ROWRULE-93 the story"}', '00000000-0000-0000-0000-0000000000e7'),
  t.e('result', :'pt', '00000000-0000-0000-0000-0000000000d5', '{"status":"final","conclusion":"ROWRULE-93","analytes":[{"key":"k","name":"ROWRULE-93","value":{"value":"93.93","ucum":"mmol/L"}}]}'),
  t.e('medication', :'pt', '00000000-0000-0000-0000-0000000000d5', '{"basis":"prescribed","drug":{"text":"Lithium"},"status":"active"}', '00000000-0000-0000-0000-0000000000e8'),
  t.e('order', :'pt', '00000000-0000-0000-0000-0000000000d5', '{"service":{"id":"00000000-0000-0000-0000-0000000000c3","code":"dispense","name":"Dispensing"},"department_id":"00000000-0000-0000-0000-0000000000d3","priority":"routine","status":"active"}',
    null, null, '00000000-0000-0000-0000-0000000000e8', 'about'))),
  'a private note and a private result in Psychiatry, each with a marker; a medicine sent to the pharmacy (never private: the queue may copy it)');
reset role;
select core.drain() as drained;
select t.ok(not exists (select 1 from core.entries e where e.id = '00000000-0000-0000-0000-0000000000e7' and not (core.hidden(e.organization_id, '00000000-0000-0000-0000-0000000000b1', array[e.id]) @> array[e.id])),
  'the note is private (Dr Ali may not read it)');
create temp table pack_rows_now (tbl text, item uuid, sources uuid[], body text);
do $$ declare d record; begin
  for d in select x.key, x.relation from core.derived x join core.layers l on l.key = x.layer where l.is_pack loop
    execute format('insert into pack_rows_now select %L, x.item, x.source_entries, to_jsonb(x)::text from %s x', d.key, d.relation);
  end loop;
end $$;
select t.ok(count(distinct tbl) = (select count(*) from core.derived x join core.layers l on l.key = x.layer where l.is_pack), 'every pack table scanned: ' || string_agg(distinct tbl, ', '))
  from pack_rows_now;
select t.ok(exists (select 1 from pack_rows_now where tbl = 'pharmacy.queue' and body like '%Lithium%'), 'what is never private is copied (the queue names the medicine)');
select t.ok(not exists (select 1 from pack_rows_now where body like '%ROWRULE-93%' or body like '%93.93%'), 'no private value of another item lands in a pack table');
select t.ok(not exists (select 1 from pack_rows_now r, unnest(r.sources) s join core.entries e on e.id = s join core.types y on y.key = e.type and y.version = e.type_version
                         where y.may_be_private and e.item <> r.item),
  'a row''s source entries from other items are all of types that may never be private');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'refresh = rebuild for every pack table');
select t.ok((select command from cron.job where jobname = 'opencare_outbox') ~ '^\s*call core\.drain_outbox\(\)\s*;?\s*$',
  'the outbox job is a lone CALL, so drain_outbox may commit each batch (two statements would run as one block and refuse the COMMIT)');
