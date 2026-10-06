-- a pack's background work (spec §5.2 Off, Setup and guards; §3.9 step 9), proven with a test-only probe pack: off, its tables are not
-- rebuilt and its listeners do not run; on again, it catches up in the background (the outbox, never one long transaction) and read
-- 'me' shows how far ("catching up · k of n patients"); a failed refresh or listener, and parked work, show with their counts and Retry
-- (a door that queues it again) clears them once it succeeds; a table that reads age or sex says so, and only those tables are
-- refreshed when a patient's identity changes
\set im  '00000000-0000-0000-0000-0000000000d1'
\set ph  '00000000-0000-0000-0000-0000000000d3'
\set f1  '00000000-0000-0000-0000-0000000000f1'
\set f2  '00000000-0000-0000-0000-0000000000f2'
\set f3  '00000000-0000-0000-0000-0000000000f3'
\set dr  '11111111-0000-0000-0000-0000000000b1'
\set rc  '11111111-0000-0000-0000-0000000000b4'
\set ow  '11111111-0000-0000-0000-0000000000b9'
\set nu  '11111111-0000-0000-0000-0000000000b3'
select t.fixture();

\echo '── the probe pack: its notes (a listener on the base''s notes, and its own type inline), a table that reads age, one that reads sex'
select core.declare_pack('probe', 1, '{}', '{"en":"Probe"}');
select core.create_pack('probe');
set role pack_probe;
create table probe.mode (m text); insert into probe.mode values ('ok');
create table probe.notes (organization_id uuid, patient_id uuid, item uuid, source_entries uuid[]);
create table probe.ages (organization_id uuid, patient_id uuid, item uuid, years int, source_entries uuid[]);
create table probe.sexes (organization_id uuid, patient_id uuid, item uuid, sex text, source_entries uuid[]);
create function probe.behave() returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select x.m from probe.mode x limit 1) = 'raise' then raise exception 'probe raise'; end if;
end $$;
create function probe.notes_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform probe.behave();
  delete from probe.notes x where x.organization_id = p_org and x.item = any (p_items);
  insert into probe.notes select p_org, e.patient_id, e.item, array_agg(e.id) from core.pack_entries(p_org, p_items) e
   where e.item = any (p_items) and e.type in ('note', 'probe.ping') group by e.patient_id, e.item;
end $$;
create function probe.ages_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from probe.ages x where x.organization_id = p_org and x.item = any (p_items);
  insert into probe.ages select p_org, e.patient_id, e.item, (base.pack_identity(p_org, e.patient_id, null) ->> 'age_years')::int, array_agg(e.id)
    from core.pack_entries(p_org, p_items) e where e.item = any (p_items) and e.type = 'note' group by e.patient_id, e.item;
end $$;
create function probe.sexes_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from probe.sexes x where x.organization_id = p_org and x.item = any (p_items);
  insert into probe.sexes select p_org, e.patient_id, e.item, base.pack_identity(p_org, e.patient_id, null) ->> 'sex', array_agg(e.id)
    from core.pack_entries(p_org, p_items) e where e.item = any (p_items) and e.type = 'note' group by e.patient_id, e.item;
end $$;
-- reading identity through helpers: one the declaration's scan sees, one built at run time that only the door itself can catch
create function probe.age_of(p_org uuid, p_patient uuid) returns int language sql stable security definer set search_path = '' as $$
  select (base.pack_identity(p_org, p_patient, null) ->> 'age_years')::int
$$;
create function probe.via_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform probe.age_of(p_org, e.patient_id) from core.pack_entries(p_org, p_items) e;
end $$;
create function probe.hidden_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  execute 'select probe.age' || '_of($1, $2)' using p_org, (select e.patient_id from core.pack_entries(p_org, p_items) e limit 1);
end $$;
create function probe.ping_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select 'Ping' $$;
reset role;
select core.declare_action('write:probe.ping', 'probe');
select core.declare_action('read:probe.notes', 'probe');
select t.ok(t.try($q$select core.declare_table('probe.ages', 'probe', 'probe.ages_refresh(uuid,uuid[])', 'read:probe.notes', '{weight}')$q$) like '%unknown_read%',
  'a table reads age or sex of a patient''s identity, nothing else');
select t.ok(t.try($q$select core.declare_table('probe.ages', 'probe', 'probe.ages_refresh(uuid,uuid[])', 'read:probe.notes')$q$) like '%identity_undeclared%',
  'a refresh calling the identity door must declare what it reads');
create table probe.via (organization_id uuid, patient_id uuid, item uuid, source_entries uuid[]);
create table probe.hidden (organization_id uuid, patient_id uuid, item uuid, source_entries uuid[]);
select t.ok(t.try($q$select core.declare_table('probe.via', 'probe', 'probe.via_refresh(uuid,uuid[])', 'read:probe.notes')$q$) like '%identity_undeclared%',
  'a refresh reading identity through a helper of its own pack must declare it too');
select core.declare_table('probe.hidden', 'probe', 'probe.hidden_refresh(uuid,uuid[])', 'read:probe.notes');
select core.declare_table('probe.notes', 'probe', 'probe.notes_refresh(uuid,uuid[])', 'read:probe.notes');
select core.declare_table('probe.ages', 'probe', 'probe.ages_refresh(uuid,uuid[])', 'read:probe.notes', '{age}');
select core.declare_table('probe.sexes', 'probe', 'probe.sexes_refresh(uuid,uuid[])', 'read:probe.notes', '{sex}');
select t.ok((select array_agg(key || ':' || array_to_string(reads, ',') order by key) from core.derived where layer = 'probe') = array['probe.ages:age', 'probe.hidden:', 'probe.notes:', 'probe.sexes:sex'],
  'what each table reads is kept with it');
select t.refuses($q$select core.run_refresh('probe.hidden_refresh(uuid,uuid[])'::regprocedure, '00000000-0000-0000-0000-0000000000a1', array['00000000-0000-0000-0000-0000000000e1'::uuid])$q$,
  'identity_undeclared');
select t.ok(true, 'a call the scan cannot see is refused when it runs: the identity door asks what the running refresh''s table declared');
select t.ok(t.try($q$select core.run_refresh('probe.ages_refresh(uuid,uuid[])'::regprocedure, '00000000-0000-0000-0000-0000000000a1', array['00000000-0000-0000-0000-0000000000e1'::uuid])$q$) = 'ok'
  and not exists (select 1 from core.unmasked), 'a table that declares it reads runs (and the mark goes when it returns)');
select t.as(:'dr');
select t.ok((base.pack_identity('00000000-0000-0000-0000-0000000000a1', :'f1') ->> 'sex') is not null, 'outside a refresh, the door reads masked as before');
select t.as(null);
delete from core.derived where key = 'probe.hidden';
select core.declare_type('probe.ping', 1, 'probe', '{"type":"object","additionalProperties":false,"properties":{"text":{"type":"string"}}}', 'probe.ping_line(jsonb)',
  feeds => array['probe.notes'], labels => '{"en":"Ping"}');
select core.declare_listener('probe', array['note'], 'probe.notes_refresh(uuid,uuid[])');
select core.declare_listener('probe', array['note'], 'probe.ages_refresh(uuid,uuid[])');
select core.declare_listener('probe', array['note'], 'probe.sexes_refresh(uuid,uuid[])');
select core.lock_pack('probe');
-- whoever writes in Internal Medicine may ping where it ticks the probe
insert into core.role_actions (role_id, action) values ('00000000-0000-0000-0000-00000000c002', 'write:probe.ping');
create function pg_temp.packs() returns jsonb language sql as $$ select public.read('{"shape":"me"}') -> 'registry' -> 'packs' $$;
create function pg_temp.probe() returns jsonb language sql as $$ select p from jsonb_array_elements(pg_temp.packs()) p where p ->> 'key' = 'probe' $$;

\echo '── three patients with notes, written while the probe is off: nothing of the probe runs'
select t.as(:'rc');
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'f2', 'given', jsonb_build_array('Mona'), 'family', 'Adel', 'gender', 'female', 'birth_date', '1990-05-01')))) ->> 'created' as f2;
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'f3', 'given', jsonb_build_array('Omar'), 'family', 'Saleh', 'gender', 'male', 'birth_date', '2001-01-20')))) ->> 'created' as f3;
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'f1', :'im', '{"text":"one"}', '00000000-0000-0000-0000-0000000001e1')), 'a note for Ahmed');
select t.landed(t.w(t.e('note', :'f2', :'im', '{"text":"two"}', '00000000-0000-0000-0000-0000000001e2')), 'a note for Mona');
select t.landed(t.w(t.e('note', :'f3', :'im', '{"text":"three"}', '00000000-0000-0000-0000-0000000001e3')), 'a note for Omar');
select t.ok(not exists (select 1 from core.outbox where layer = 'probe') and not exists (select 1 from probe.notes), 'off: no listener row, no table row');

\echo '── on: it catches up in the background, one row per patient and refresh; read me shows the progress'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as probe_on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["probe"]}'::jsonb)) ->> 'key' as ticked;
select t.ok(not exists (select 1 from probe.notes) and not exists (select 1 from probe.ages), 'turning it on refreshed nothing in its own transaction');
select t.ok(count(*) = 9 and count(distinct patient_id) = 3 and bool_and(kind = 'catch_up' and tries = 0), 'queued: ' || count(*) || ' rows for ' || count(distinct patient_id) || ' patients')
  from core.outbox where layer = 'probe';
select t.ok(pg_temp.probe() -> 'catch_up' = '{"patients":3,"left":3}', 'read me: catching up, 3 of 3 patients left: ' || (pg_temp.probe() -> 'catch_up')::text);
select t.ok((pg_temp.probe() ->> 'waiting')::int = 9 and (pg_temp.probe() ->> 'parked')::int = 0, 'nine rows waiting, none parked');
select t.ok(core.drain(4) = 4, 'the drain takes a batch');
select t.ok(pg_temp.probe() -> 'catch_up' = '{"patients":3,"left":2}', 'one patient done, two left (catching up · 1 of 3): ' || (pg_temp.probe() -> 'catch_up')::text);
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'f1', :'im', '{"text":"live"}', '00000000-0000-0000-0000-0000000001e4')), 'a note written while it catches up');
select t.ok(core.drain(3) = 3, 'three rows drained');
select t.ok(exists (select 1 from probe.notes where item = '00000000-0000-0000-0000-0000000001e4'), 'live work goes before the catch-up');
select t.ok(core.drain() >= 1, 'drained the rest');
select t.as(:'ow');
select t.ok(pg_temp.probe() -> 'catch_up' = 'null' and not exists (select 1 from core.catch_ups where layer = 'probe') and not exists (select 1 from core.outbox where layer = 'probe'),
  'caught up: no progress shown, nothing left');
select t.ok((select count(*) from probe.notes) = 4 and (select count(*) from probe.ages where years > 0) = 4 and (select count(*) from probe.sexes where sex is not null) = 4,
  'every table holds every note, with the age and sex it read');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');

\echo '── off: its pending work goes, its tables are not rebuilt, its listeners do not run'
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'f2', :'im', '{"text":"pending"}', '00000000-0000-0000-0000-0000000001e5')), 'a note: a listener row waits');
select t.ok(count(*) = 3, 'three listener rows') from core.outbox where layer = 'probe';
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as probe_off;
select t.ok(not exists (select 1 from core.outbox where layer = 'probe'), 'turned off: its pending work is dropped');
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'f3', :'im', '{"text":"while off"}', '00000000-0000-0000-0000-0000000001e6')), 'a note while it is off');
select t.ok(not exists (select 1 from core.outbox where layer = 'probe') and not exists (select 1 from probe.notes where item in ('00000000-0000-0000-0000-0000000001e5', '00000000-0000-0000-0000-0000000001e6')),
  'no listener row; its table never heard of either note');
insert into core.outbox (organization_id, layer, refresh, patient_id, items) values ('00000000-0000-0000-0000-0000000000a1', 'probe', 'probe.notes_refresh(uuid,uuid[])', :'f3', array['00000000-0000-0000-0000-0000000001e6'::uuid]);
select t.ok(core.drain() = 0, 'nothing ran');
select t.ok(not exists (select 1 from core.outbox where layer = 'probe') and not exists (select 1 from probe.notes where item = '00000000-0000-0000-0000-0000000001e6'),
  'a row of a pack off is dropped by the drain, never run');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live: a pack off is not rebuilt');
select core.refresh_patients('00000000-0000-0000-0000-0000000000a1', array[:'f3'::uuid]);
select t.ok(not exists (select 1 from probe.notes where item = '00000000-0000-0000-0000-0000000001e6'), 'nor by a patient''s refresh (a merge)');

\echo '── on again: the notes written while off are caught up in the background'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as probe_on_again;
select t.ok(pg_temp.probe() -> 'catch_up' = '{"patients":3,"left":3}', 'catching up again: ' || (pg_temp.probe() -> 'catch_up')::text);
select t.ok(core.drain() = 9, 'nine rows drained');
select t.ok((select count(*) from probe.notes) = 6, 'caught up: six notes');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live after catching up');

\echo '── no silent failures: a failed listener and a failed inline refresh show with their counts; parked work; Retry'
update probe.mode set m = 'raise';
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'f1', :'im', '{"text":"heard badly"}', '00000000-0000-0000-0000-0000000001e7')), 'a note: its listeners will fail');
select t.landed(t.w(t.e('probe.ping', :'f2', :'im', '{"text":"x"}', '00000000-0000-0000-0000-0000000001e8')), 'a ping lands though its inline refresh fails');
select t.ok(exists (select 1 from core.outbox where layer = 'probe' and kind = 'refresh' and patient_id = :'f2' and tries = 1 and error like 'probe raise%'),
  'the failed inline refresh waits in the outbox with its error (tried once)');
select core.drain() as drained;
select t.as(:'ow');
select t.ok((pg_temp.probe() ->> 'stale')::int = 2 and (pg_temp.probe() ->> 'failing')::int = 2 and (pg_temp.probe() ->> 'parked')::int = 0,
  'read me: stale for 2 patients, 2 rows failing (' || pg_temp.probe()::text || ')');
create temp table hints as select count(*) n from realtime.messages where topic = 'organization:00000000-0000-0000-0000-0000000000a1';
update core.outbox set tries = 4 where layer = 'probe';
select core.drain() as drained;
select t.ok((select count(*) from realtime.messages where topic = 'organization:00000000-0000-0000-0000-0000000000a1') = (select n from hints) + 1,
  'a drain whose rows failed sends the clinic one hint, so Settings → Packs reads again');
select t.ok((pg_temp.probe() ->> 'parked')::int = 2 and (pg_temp.probe() ->> 'failing')::int = 0, 'parked after five tries');
select t.ok(core.drain() = 0, 'parked work is not tried again by itself');
select t.as(:'nu');
select t.refuses($q$select public.retry_pack('{"pack":"probe"}')$q$, 'not_allowed');
select t.as(:'ow');
select t.refuses($q$select public.retry_pack('{"pack":"nothing"}')$q$, 'unknown_pack');
select t.ok((public.retry_pack('{"pack":"probe"}') ->> 'requeued')::int = 2 and (pg_temp.probe() ->> 'parked')::int = 0, 'Retry queues the parked work again');
select t.ok(core.drain() = 0, 'it fails again');
select t.ok((pg_temp.probe() ->> 'stale')::int = 2, 'still failing: still stale, nothing hidden');
update probe.mode set m = 'ok';
select t.ok((public.retry_pack('{"pack":"probe"}') ->> 'requeued')::int = 2, 'Retry again');
select t.ok(core.drain() = 2, 'it succeeds');
select t.ok((pg_temp.probe() ->> 'stale')::int = 0 and (pg_temp.probe() ->> 'failing')::int = 0 and (pg_temp.probe() ->> 'parked')::int = 0
  and not exists (select 1 from core.stale where layer = 'probe'), 'the stale marks clear');
select t.ok(exists (select 1 from probe.notes where item = '00000000-0000-0000-0000-0000000001e7') and exists (select 1 from probe.notes where item = '00000000-0000-0000-0000-0000000001e8'),
  'the note and the ping are in its table');
select t.ok(exists (select 1 from core.audit where what = 'pack:probe' and action = 'retry'), 'each Retry is an audit row');
-- a patient it is stale for with no work waiting: Retry queues that patient's refresh again
insert into core.stale (organization_id, layer, patient_id, error) values ('00000000-0000-0000-0000-0000000000a1', 'probe', :'f3', 'lost');
select t.ok((public.retry_pack('{"pack":"probe"}') ->> 'requeued')::int = 3, 'a stale mark with nothing waiting: its refresh queued again');
select t.ok(core.drain() = 3, 'it runs');
select t.ok(not exists (select 1 from core.stale where layer = 'probe'), 'then the mark clears');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');

\echo '── identity: only the tables that read what changed are refreshed'
select t.as(:'rc');
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'f1', 'gender', 'female')))) ->> 'created' as sex_changed;
select t.ok((select array_agg(refresh::text) from core.outbox where layer = 'probe') = array['probe.sexes_refresh(uuid,uuid[])'] and bool_and(kind = 'identity' and patient_id = :'f1'),
  'sex: probe.sexes only (not its notes, ages, nor pharmacy''s queue)') from core.outbox where layer = 'probe';
select t.ok(not exists (select 1 from core.outbox where layer = 'pharmacy'), 'pharmacy reads no identity: nothing queued');
select t.ok(core.drain() = 1, 'one row drained');
select t.ok((select bool_and(sex = 'female') from probe.sexes where patient_id = :'f1'), 'Ahmed reads female');
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'f1', 'birth_date', '1998-03-14')))) ->> 'created' as born_changed;
select t.ok((select array_agg(refresh::text) from core.outbox where layer = 'probe') = array['probe.ages_refresh(uuid,uuid[])'], 'birth date: probe.ages only');
select t.ok(core.drain() = 1, 'one row drained');
select t.ok((select bool_and(years between 27 and 29) from probe.ages where patient_id = :'f1'), 'the age follows');
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'f1',
  'telecom', '[{"system":"phone","value":"+201000000009"}]')))) ->> 'created' as phone_changed;
select t.ok(not exists (select 1 from core.outbox), 'a new phone refreshes nothing');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');
