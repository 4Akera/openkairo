-- needs: reset
-- permanent test 4 · concurrency (spec §8): real second sessions (dblink). Two call one visit, two admit to one bed, two correct one
-- item: one of each wins, the other waits for the lock (busy) and is then refused; a late copy lands flagged.
create extension if not exists dblink with schema extensions;
select t.fixture();
select t.as('11111111-0000-0000-0000-0000000000b4');
select (public.save_patient('{"department_id":"00000000-0000-0000-0000-0000000000d4","patient":{"id":"00000000-0000-0000-0000-0000000000f2","given":["Omar"],"family":"Zaki","gender":"male"}}') -> 'patient' ->> 'number') as omar;
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d1'), 'Ahmed waits in IM');
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(t.w(t.e('note', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{"text":"first"}', '00000000-0000-0000-0000-0000000000e1')), 'a note to correct');
select extensions.dblink_connect('a', format('host=%s port=5432 dbname=postgres user=postgres password=postgres', :'dbhost'));
select extensions.dblink_connect('b', format('host=%s port=5432 dbname=postgres user=postgres password=postgres', :'dbhost'));
select * from extensions.dblink('a', $$select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000b1', false)$$) as x(v text);
select * from extensions.dblink('b', $$select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000bf', false)$$) as x(v text);
select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000bf","name":"Dr Karim","login_id":"11111111-0000-0000-0000-0000000000bf","holdings":[{"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-0000000000d1"},{"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-0000000000d6"}]}') from (select t.as('11111111-0000-0000-0000-0000000000b9')) q;

-- one move in a session left open: the lock is held until it commits
create or replace function pg_temp.remote(p_conn text, p_set jsonb) returns jsonb language sql as $$
  select r::jsonb from extensions.dblink(p_conn, format('select public.write(%L)::text', p_set)) as x(r text)
$$;
create or replace function pg_temp.set_of(p_entries jsonb, p_made_at timestamptz default null) returns jsonb language sql as $$
  select jsonb_build_object('set_id', gen_random_uuid(), 'made_at', coalesce(p_made_at, clock_timestamp()), 'entries', p_entries)
$$;

\echo '── two doctors call one visit at once: the first holds the patient; the second waits, is busy, then is refused'
select extensions.dblink_exec('a', 'begin');
select t.landed(pg_temp.remote('a', pg_temp.set_of(jsonb_build_array(t.move('called', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1')))), 'A calls (not yet committed)');
select t.ok(r ->> 'outcome' = 'busy', 'B waits for the lock and is told busy') from pg_temp.remote('b', pg_temp.set_of(jsonb_build_array(t.move('called', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1')))) r;
select extensions.dblink_exec('a', 'commit');
select t.ok(r ->> 'outcome' = 'refused' and r::text like '%already_called%', 'B retries and is refused: already called') from pg_temp.remote('b', pg_temp.set_of(jsonb_build_array(
  t.e('called', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{}', null, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'changes')))) r;
select t.ok(count(*) = 1, 'one call landed') from core.entries where item = '00000000-0000-0000-0000-0000000000a1' and type = 'called';

\echo '── two admissions to one bed: the bed is claimed; the second waits, then the bed is taken'
select extensions.dblink_exec('a', 'begin');
select t.landed(pg_temp.remote('a', pg_temp.set_of(jsonb_build_array(t.e('admitted', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d6',
  '{"admit_source":"emd","place_id":"00000000-0000-0000-0000-000000000001"}', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b0')))), 'A admits Ahmed to bed 1');
select t.ok(r ->> 'outcome' = 'busy', 'B admitting Omar to bed 1 waits and is busy') from pg_temp.remote('b', pg_temp.set_of(jsonb_build_array(t.e('admitted', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d6',
  '{"admit_source":"emd","place_id":"00000000-0000-0000-0000-000000000001"}', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1')))) r;
select extensions.dblink_exec('a', 'commit');
select t.ok(r::text like '%bed_taken%', 'B retries: bed taken') from pg_temp.remote('b', pg_temp.set_of(jsonb_build_array(t.e('admitted', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d6',
  '{"admit_source":"emd","place_id":"00000000-0000-0000-0000-000000000001"}', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1')))) r;
select t.ok(count(*) = 1, 'one patient in bed 1') from base.presence where place_id = '00000000-0000-0000-0000-000000000001' and state = 'admitted';

\echo '── two corrections of one item: the first wins; the second is stale; a late copy lands flagged'
select extensions.dblink_exec('a', 'begin');
select t.landed(pg_temp.remote('a', pg_temp.set_of(jsonb_build_array(t.e('note', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{"text":"first, corrected by A"}',
  null, null, null, null, '00000000-0000-0000-0000-0000000000e1')))), 'A corrects');
select extensions.dblink_exec('a', 'commit');
select * from extensions.dblink('b', $$select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000b1', false)$$) as x(v text);
select t.ok(r::text like '%changed_since_opened%', 'B''s correction of the same version is stale') from pg_temp.remote('b', pg_temp.set_of(jsonb_build_array(
  t.e('note', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{"text":"first, corrected by B"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e1')))) r;
select t.ok(r ->> 'outcome' = 'landed' and r::text like '%changed_since_opened%' and r::text like '%"late": true%', 'the same from an offline device (late) lands flagged')
  from pg_temp.remote('b', pg_temp.set_of(jsonb_build_array(t.e('note', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '{"text":"first, corrected offline"}',
    null, null, null, null, '00000000-0000-0000-0000-0000000000e1')), clock_timestamp() - interval '2 hours')) r;
select t.ok(array_agg(item_version order by item_version) = array[1, 2, 3], 'the item has three versions, in the order they landed') from core.entries where item = '00000000-0000-0000-0000-0000000000e1';

\echo '── the same Done sent twice at once lands once'
select extensions.dblink_exec('a', 'begin');
select t.landed(pg_temp.remote('a', '{"set_id":"00000000-0000-0000-0000-00000000dd01","entries":[{"id":"00000000-0000-0000-0000-0000000000e9","type":"note","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1","data":{"text":"once"}}]}'), 'A sends');
select t.ok(r ->> 'outcome' = 'busy', 'B sends the same set: waits on the set') from pg_temp.remote('b', '{"set_id":"00000000-0000-0000-0000-00000000dd01","entries":[{"id":"00000000-0000-0000-0000-0000000000e9","type":"note","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1","data":{"text":"once"}}]}') r;
select extensions.dblink_exec('a', 'commit');
select t.ok((r ->> 'repeat')::boolean, 'B''s retry returns the stored outcome') from pg_temp.remote('b', '{"set_id":"00000000-0000-0000-0000-00000000dd01","entries":[{"id":"00000000-0000-0000-0000-0000000000e9","type":"note","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1","data":{"text":"once"}}]}') r;

\echo '── two sets making newborns at once (§3.9 step 3b): the second waits for the record number, is busy, and leaves nothing'
select * from extensions.dblink('a', $$select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000b9', false)$$) as x(v text);
select * from extensions.dblink('b', $$select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000b9', false)$$) as x(v text);
create or replace function pg_temp.born_set(p_set uuid, p_mother uuid, p_newborn uuid) returns jsonb language sql as $$
  select jsonb_build_object('set_id', p_set, 'made_at', clock_timestamp(), 'entries', jsonb_build_array(
      t.e('note', p_mother, '00000000-0000-0000-0000-0000000000d1', '{"text":"a birth"}'),
      t.e('admitted', p_newborn, '00000000-0000-0000-0000-0000000000d6', '{"admit_source":"born"}', p_newborn, p_newborn)),
    'patients', jsonb_build_array(jsonb_build_object('id', p_newborn, 'mother', p_mother, 'full_name', 'Newborn', 'gender', 'unknown',
      'birth_date', ((now() at time zone 'Africa/Cairo')::date)::text, 'department_id', '00000000-0000-0000-0000-0000000000d6')))
$$;
select value as nb_before from core.counters where organization_id = '00000000-0000-0000-0000-0000000000a1' and key = 'record_number' \gset
select extensions.dblink_exec('a', 'begin');
select t.landed(pg_temp.remote('a', pg_temp.born_set('00000000-0000-0000-0000-00000000dd11', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000ee01')),
  'A makes a newborn of Ahmed''s (not yet committed)');
select t.ok(r ->> 'outcome' = 'busy', 'B making a newborn of Omar''s waits for the record number and is told busy')
  from pg_temp.remote('b', pg_temp.born_set('00000000-0000-0000-0000-00000000dd12', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000ee02')) r;
select extensions.dblink_exec('a', 'commit');
select t.ok(not exists (select 1 from core.patients where id = '00000000-0000-0000-0000-00000000ee02') and not exists (select 1 from core.sets where id = '00000000-0000-0000-0000-00000000dd12')
  and (select value from core.counters where organization_id = '00000000-0000-0000-0000-0000000000a1' and key = 'record_number') = :nb_before + 1, 'B''s busy set left no record, ledger row or number');
select t.ok(r ->> 'outcome' = 'landed' and r -> 'patients' -> 0 ->> 'number' = (:nb_before + 2)::text, 'B retries the same set: it lands, numbered next')
  from pg_temp.remote('b', pg_temp.born_set('00000000-0000-0000-0000-00000000dd12', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000ee02')) r;
select extensions.dblink_disconnect('a');
select extensions.dblink_disconnect('b');
select t.ok(core.rebuild_check() = '[]'::jsonb, 'rebuild = live after the races');
