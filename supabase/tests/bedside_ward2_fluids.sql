-- Ward nursing's fluid balance (spec §5.6, W2): the department setting bedside.shifts (08:00 14:00 20:00 by default), the pack's own type
-- bedside.fluid_chart with its write action and its line (the balance aim always signed), and the op bedside.fluids on a ward's stays:
-- each stay with a fluid chart on, the chart's start and aim (carried forward until a stop), and the stay's in and out — the base's own
-- observations with LOINC 9103-3, 9187-6 and 9257-7 in mL — in time order, from a time on. Measures land with or without a chart, from
-- 0 mL up; a crossed-out measure is not counted, and none can be made private; another stay's or department's is left out; the read is logged; silent
-- where the department's line has no Obs due; refused where the pack is not used or the role may not read the record.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set desk  '00000000-0000-0000-0000-0000000000d4'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set stay  '00000000-0000-0000-0000-00000000e801'
\set stay2 '00000000-0000-0000-0000-00000000e802'
\set visit '00000000-0000-0000-0000-00000000e803'
\set iv    '00000000-0000-0000-0000-00000000e811'
\set urine '00000000-0000-0000-0000-00000000e812'
\set ch    '00000000-0000-0000-0000-00000000e813'
\set drain '00000000-0000-0000-0000-00000000e814'
\set plus  '00000000-0000-0000-0000-00000000e815'
\set none  '00000000-0000-0000-0000-00000000e816'
\set priv  '00000000-0000-0000-0000-00000000e817'
\set zero  '00000000-0000-0000-0000-00000000e818'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["bedside"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked;
-- the ward's line holds the Obs due tab: the op answers only there
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'ward', 'data', '{"screens":["base.beds","bedside.obs"],"opens":"base.beds"}'::jsonb)) ->> 'key' as line;

\echo '── what W2 declares: the shifts, the fluid chart and its action, the op'
select t.ok(k.layer = 'bedside' and k.owner_kind = 'department' and k.form = 'department' and not k.many and k.labels ->> 'en' = 'Shifts'
  and (select array_agg(f ->> 'key') from jsonb_array_elements(k.fields) f) = array['starts'] and k.shape -> 'properties' -> 'starts' ->> 'default' = '08:00 14:00 20:00',
  'bedside.shifts: Ward nursing''s, one per department, on its card, "Shifts", one field, 08:00 14:00 20:00 by default') from core.setting_keys k where k.key = 'bedside.shifts';
select t.ok(y.layer = 'bedside' and y.version = 1 and y.resources = '{}' and y.to_fhir is null and y.labels ->> 'en' = 'Fluid chart',
  'bedside.fluid_chart: Ward nursing''s type, version 1, no resources, not exported') from core.types y where y.key = 'bedside.fluid_chart';
select t.ok(a.layer = 'bedside' and a.everyday, 'write:bedside.fluid_chart: Ward nursing''s, everyday') from core.actions a where a.key = 'write:bedside.fluid_chart';
select t.ok(o.layer = 'bedside' and o.action = 'read:record' and o.patients, 'bedside.fluids: Ward nursing''s op, for whoever may read the record, naming its patients')
  from core.ops o where o.key = 'bedside.fluids';

set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'stay', :'stay')), 'admitted to the ward');
select t.as(:'nurse');
create function pg_temp.fl(p_dept uuid, p_from timestamptz default null) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'bedside.fluids', 'department_id', p_dept, 'args', jsonb_strip_nulls(jsonb_build_object('from', p_from)), 'purpose', 'TREAT'))
$$;
-- one measure, as /in and /out build it (fluids.ts), taken p_min minutes ago
create function pg_temp.obs(p_stay uuid, p_min int, p_code text, p_text text, p_ml text, p_method text default null, p_id uuid default null,
  p_patient uuid default '00000000-0000-0000-0000-0000000000f1', p_dept uuid default '00000000-0000-0000-0000-0000000000d6') returns jsonb language sql as $$
  select t.w(t.e('observation', p_patient, p_dept, jsonb_strip_nulls(jsonb_build_object('code', jsonb_build_object('text', p_text, 'codings', jsonb_build_array(jsonb_build_object(
    'system', 'loinc', 'code', p_code, 'display', case p_code when '9103-3' then 'Fluid intake total Measured' when '9187-6' then 'Urine output' else 'Fluid output total Measured' end))),
    'value', jsonb_build_object('quantity', jsonb_build_object('value', p_ml, 'unit', 'mL', 'ucum', 'mL')), 'method', p_method)), p_id, p_stay,
    null, null, null, jsonb_build_object('occurred_at', now() - make_interval(mins => p_min))))
$$;
-- one fluid chart entry, p_min minutes ago
create function pg_temp.chart(p_stay uuid, p_min int, p_data jsonb, p_id uuid default null, p_patient uuid default '00000000-0000-0000-0000-0000000000f1',
  p_dept uuid default '00000000-0000-0000-0000-0000000000d6') returns jsonb language sql as $$
  select t.w(t.e('bedside.fluid_chart', p_patient, p_dept, p_data, p_id, p_stay, null, null, null, jsonb_build_object('occurred_at', now() - make_interval(mins => p_min))))
$$;
create function pg_temp.stay(p_dept uuid, p_from timestamptz default null) returns jsonb language sql as $$
  select pg_temp.fl(p_dept, p_from) -> 'stays' -> '00000000-0000-0000-0000-00000000e801'
$$;

\echo '── nothing yet: no stay in the answer, the patient named'
select t.ok(d -> 'stays' = '{}'::jsonb and d -> 'patient_ids' ? :'pt', 'no chart: no stay, the patient named for the read log') from (select pg_temp.fl(:'ward') d) x;

\echo '── measures land with no chart: a measure is a fact; the chart decides where the balance is spoken'
select t.ok(r ->> 'outcome' = 'landed' and r -> 'findings' = '[]'::jsonb, 'IV 500 mL, NS, 180 min ago: lands, no finding')
  from (select pg_temp.obs(:'stay', 180, '9103-3', 'Fluid in · IV', '500', 'iv', :'iv') r) x;
select t.ok(r ->> 'outcome' = 'landed' and r -> 'findings' = '[]'::jsonb, 'urine 300 mL, 120 min ago: lands, no finding')
  from (select pg_temp.obs(:'stay', 120, '9187-6', 'Urine', '300', null, :'urine') r) x;
select t.ok(pg_temp.fl(:'ward') -> 'stays' = '{}'::jsonb, 'still no stay in the answer: no chart is on');

\echo '── the chart: started with a balance aim; its line always signed'
select t.as(:'dr');
select t.landed(pg_temp.chart(:'stay', 240, '{"status":"active","target":{"value":"-1000","unit":"mL","ucum":"mL"}}', :'ch'), 'a fluid chart, aim −1 000 mL a day, 240 min ago');
select t.landed(pg_temp.chart(null, 0, '{"status":"active","target":{"value":"+1000","unit":"mL","ucum":"mL"}}', :'plus'), 'a chart with +1000, outside any stay');
select t.landed(pg_temp.chart(null, 0, '{"status":"active","no_target":true}', :'none'), 'a chart with no aim, outside any stay');
select t.ok(t.entry(r, :'ch') ->> 'line' = 'Fluid chart · balance aim −1' || chr(160) || '000 mL a day'
  and t.entry(r, :'plus') ->> 'line' = 'Fluid chart · balance aim +1' || chr(160) || '000 mL a day'
  and t.entry(r, :'none') ->> 'line' = 'Fluid chart · no balance aim' and t.entry(r, :'urine') ->> 'line' = 'Urine: 300 mL',
  'the lines: "balance aim −1 000 mL a day", "+1 000", "no balance aim" (a minus sign, a no-break space); the urine''s "Urine: 300 mL"')
  from (select t.record(:'pt', :'ward') r) x;
select t.as(:'nurse');
select t.ok((s -> 'chart' ->> 'target')::int = -1000 and (s -> 'chart' ->> 'at')::timestamptz = now() - interval '240 minutes' and jsonb_array_length(s -> 'measures') = 2
  and s -> 'measures' -> 0 = jsonb_build_object('at', s -> 'measures' -> 0 -> 'at', 'code', '9103-3', 'ml', 500, 'method', 'iv')
  and s -> 'measures' -> 1 = jsonb_build_object('at', s -> 'measures' -> 1 -> 'at', 'code', '9187-6', 'ml', 300)
  and (s -> 'measures' -> 0 ->> 'at')::timestamptz = now() - interval '180 minutes',
  'the stay: aim −1000 since 240 min ago; IV 500 (method iv), then urine 300 (no method), in time order') from (select pg_temp.stay(:'ward') s) x;

\echo '── other output; other codes are not measures'
select t.landed(pg_temp.obs(:'stay', 60, '9257-7', 'Fluid out · drain', '50', 'drain', :'drain'), 'drain 50 mL, 60 min ago');
select t.landed(t.w(t.e('observation', :'pt', :'ward', '{"code":{"text":"MAP","codings":[{"system":"loinc","code":"8478-0"}]},"value":{"quantity":{"value":"80","unit":"mmHg","ucum":"mm[Hg]"}}}',
  null, :'stay')), 'a mean arterial pressure, 80 mmHg');
select t.landed(t.w(t.e('vitals', :'pt', :'ward', '{"hr":{"value":"80","unit":"bpm","ucum":"/min"}}', null, :'stay')), 'plain vitals');
select t.ok(jsonb_array_length(s -> 'measures') = 3 and s -> 'measures' -> 2 ->> 'code' = '9257-7' and (s -> 'measures' -> 2 ->> 'ml')::numeric = 50
  and s -> 'measures' -> 2 ->> 'method' = 'drain', 'the drain is the third measure; the MAP and the vitals are not measures') from (select pg_temp.stay(:'ward') s) x;

\echo '── from: the measures from then on'
select t.ok((select array_agg(m ->> 'code') from jsonb_array_elements(s -> 'measures') m) = array['9187-6', '9257-7'], 'from 150 min ago: the urine and the drain')
  from (select pg_temp.stay(:'ward', now() - interval '150 minutes') s) x;

\echo '── crossed out, a measure is gone'
select t.landed(t.w(t.e('crossed_out', :'pt', :'ward', '{"reason":"wrong_value"}', null, :'stay', null, null, :'urine')), 'the urine crossed out');
select t.ok((select array_agg(m ->> 'code') from jsonb_array_elements(s -> 'measures') m) = array['9103-3', '9257-7'], 'the IV and the drain are left')
  from (select pg_temp.stay(:'ward') s) x;

\echo '── the chart''s state: its latest entry; the aim carried forward until a stop; since the run''s first entry'
select t.landed(pg_temp.chart(:'stay', 200, '{"status":"active"}'), 'the nurse "restarts" the chart, 200 min ago');
select t.ok((s -> 'chart' ->> 'target')::int = -1000 and (s -> 'chart' ->> 'at')::timestamptz = now() - interval '240 minutes',
  'the doctor''s aim is kept, and the chart is still since 240 min ago') from (select pg_temp.stay(:'ward') s) x;
select t.as(:'dr');
select t.landed(pg_temp.chart(:'stay', 190, '{"status":"active","no_target":true}'), 'no aim, 190 min ago');
select t.ok(not (s -> 'chart' ? 'target'), 'the aim cleared: no target') from (select pg_temp.stay(:'ward') s) x;
select t.landed(pg_temp.chart(:'stay', 180, '{"status":"active","target":{"value":"+500","unit":"mL","ucum":"mL"}}'), 'aim +500, 180 min ago');
select t.ok((s -> 'chart' ->> 'target')::int = 500, 'the aim: +500') from (select pg_temp.stay(:'ward') s) x;
select t.as(:'nurse');
select t.landed(pg_temp.chart(:'stay', 30, '{"status":"stopped"}'), 'the chart stopped, 30 min ago');
select t.ok(pg_temp.fl(:'ward') -> 'stays' = '{}'::jsonb, 'stopped: the stay leaves the answer');
select t.as(:'dr');
select t.landed(pg_temp.chart(:'stay', 10, '{"status":"active"}'), 'started again, 10 min ago');
select t.ok(not (s -> 'chart' ? 'target') and (s -> 'chart' ->> 'at')::timestamptz = now() - interval '10 minutes',
  'back, with no aim (a stop ends it), since 10 min ago') from (select pg_temp.stay(:'ward') s) x;
select t.landed(pg_temp.chart(:'stay', 300, '{"status":"stopped"}'), 'a stop written now, taken 300 min ago');
select t.ok(s is not null and (s -> 'chart' ->> 'at')::timestamptz = now() - interval '10 minutes', 'by when it was taken: the chart is still on since 10 min ago')
  from (select pg_temp.stay(:'ward') s) x;

\echo '── the values: one row per measure'
reset role;
select t.ok(count(*) = 1 and min(v.value) = 50 and min(v.ucum) = 'mL' and bool_and(v.visit_id = :'stay') and min(v.key) = 'value',
  'base.values: the drain as loinc:9257-7, 50 mL, in the stay') from base.values v where v.entry_id = :'drain' and v.code = 'loinc:9257-7';

\echo '── the read is logged for each patient it names'
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'bedside.fluids'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;

\echo '── this department''s stays only; silent where the line has no Obs due'
select t.as(:'ow');
select public.setup(jsonb_build_object('setup', 'bedside.ward', 'department_id', :'new', 'name', 'Surgical Ward', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'new')))) is not null as dr;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b3', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'new')))) is not null as nurse;
select t.as(:'rec');
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'pt2', 'given', jsonb_build_array('Mona'),
  'family', 'Saleh', 'gender', 'female', 'birth_date', '1975-06-02'))) is not null as registered;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt2', :'new', '{"admit_source":"emd","reason":"cellulitis"}', :'stay2', :'stay2')), 'another patient admitted to the Surgical Ward');
select t.landed(pg_temp.chart(:'stay2', 30, '{"status":"active"}', null, :'pt2', :'new'), 'a chart there');
select t.landed(pg_temp.obs(:'stay2', 20, '9103-3', 'Fluid in · IV', '1000', 'iv', null, :'pt2', :'new'), 'IV 1000 mL there');
select t.as(:'nurse');
select t.ok(not (d -> 'stays' ? :'stay2') and not (d -> 'patient_ids' ? :'pt2') and d -> 'stays' ? :'stay', 'the ward''s answer leaves out the Surgical Ward''s stay and patient')
  from (select pg_temp.fl(:'ward') d) x;
select t.ok((select array_agg(k) from jsonb_object_keys(d -> 'stays') k) = array[:'stay2'] and jsonb_array_length(d -> 'stays' -> :'stay2' -> 'measures') = 1,
  'the Surgical Ward''s answer: its own stay, its one measure') from (select pg_temp.fl(:'new') d) x;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'new', 'data', '{"screens":["base.beds"],"opens":"base.beds"}'::jsonb)) ->> 'key' as no_tab;
select t.as(:'nurse');
select t.ok(d = '{"patient_ids":[],"stays":{}}'::jsonb, 'a department whose line has no Obs due (an ICU, an ER): an empty answer, though its stay has a chart')
  from (select pg_temp.fl(:'new') d) x;

\echo '── refused: a chart out of shape, a role that may not write it, a department without the pack, a role that may not read; the shifts out of shape'
select t.as(:'dr');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"paused"}'), 'bad_shape', 'paused is not a state');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"active","target":{"value":"lots"}}'), 'bad_shape', 'an aim in words');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"active","target":{"value":"1.5","unit":"L","ucum":"L"}}'), 'bad_shape', 'an aim in litres with a decimal: whole signed mL only');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"active","no_target":false}'), 'bad_shape', 'no_target false');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"active","target":{"value":"99999999999","unit":"mL","ucum":"mL"}}'), 'bad_shape',
  'an aim past five digits never lands (the op''s ::int would overflow for the whole ward)');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"active","target":{"value":"999999","unit":"mL","ucum":"mL"}}'), 'bad_shape', 'six digits');
select t.as(:'rec');
select t.refused(pg_temp.chart(:'stay', 5, '{"status":"active"}'), 'not_allowed', 'reception starts no fluid chart');
select t.as(:'nurse');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.fluids','department_id',%L))$q$, :'im'), 'not_used_here');
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.fluids','department_id',%L))$q$, :'ward'), 'not_allowed');
select t.as(:'ow');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.shifts','owner_id',%L,'data',%L::jsonb))$q$, :'ward', '{"starts":"8:00"}'), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.shifts','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"starts":"08:00 09:00 10:00 11:00 12:00 13:00 14:00"}'), 'bad_shape');
select t.ok(public.write_setting(jsonb_build_object('key', 'bedside.shifts', 'owner_id', :'ward', 'data', '{"starts":"07:00 19:00"}'::jsonb)) ->> 'key' = 'bedside.shifts',
  'two shifts, 07:00 19:00: saved');

\echo '── only this stay''s measures; a measure is never private; 0 mL, a decimal and a large one land; a from that is not a time is none'
select t.as(:'rec');
select t.landed(t.check_in(:'visit', :'pt', :'desk', :'im'), 'the same patient''s visit to Internal Medicine');
select t.as(:'dr');
select t.landed(pg_temp.obs(:'visit', 600, '9187-6', 'Urine', '500', null, null, :'pt', :'im'), 'urine 500 mL in that visit');
select t.ok(not exists (select 1 from jsonb_array_elements(s -> 'measures') m where (m ->> 'ml')::numeric = 500 and m ->> 'code' = '9187-6'),
  'the ward stay''s answer does not hold the other visit''s urine') from (select pg_temp.stay(:'ward') s) x;
select t.as(:'nurse');
select t.landed(pg_temp.obs(:'stay', 5, '9257-7', 'Fluid out · vomit', '120', 'vomit', :'priv'), 'vomit 120 mL, 5 min ago');
-- a measure cannot be made private (the base's observation never is), so the op never meets a masked one of its own ward; one it might
-- (another department's private entry) pack_kind drops when it filters by codes
select t.refused(t.w(t.e('private', :'pt', :'ward', '{}', null, null, :'priv', 'about')), 'never_private', 'a fluid measure is never private');
select t.ok(exists (select 1 from jsonb_array_elements(s -> 'measures') m where m ->> 'method' = 'vomit'), 'so the vomit is counted') from (select pg_temp.stay(:'ward') s) x;
select t.ok(r ->> 'outcome' = 'landed' and r -> 'findings' = '[]'::jsonb, 'urine 0 mL (none passed): lands, no finding')
  from (select pg_temp.obs(:'stay', 4, '9187-6', 'Urine', '0', null, :'zero') r) x;
select t.landed(pg_temp.obs(:'stay', 3, '9103-3', 'Fluid in · IV', '2.5', 'iv'), 'IV 2.5 mL (an infant''s)');
select t.landed(pg_temp.obs(:'stay', 2, '9257-7', 'Fluid out · drain', '6500', 'drain'), 'drain 6500 mL (a large ascitic drain)');
select t.ok(exists (select 1 from jsonb_array_elements(s -> 'measures') m where m ->> 'code' = '9187-6' and (m ->> 'ml')::numeric = 0)
  and exists (select 1 from jsonb_array_elements(s -> 'measures') m where (m ->> 'ml')::numeric = 2.5)
  and exists (select 1 from jsonb_array_elements(s -> 'measures') m where (m ->> 'ml')::numeric = 6500),
  'measured as typed: urine 0, IV 2.5, drain 6500') from (select pg_temp.stay(:'ward') s) x;
select t.ok(public.pack_op(jsonb_build_object('op', 'bedside.fluids', 'department_id', :'ward', 'args', '{"from":"yesterday"}'::jsonb, 'purpose', 'TREAT')) = pg_temp.fl(:'ward')
  and public.pack_op(jsonb_build_object('op', 'bedside.fluids', 'department_id', :'ward', 'args', '{"from":"2026-13-45T99:00"}'::jsonb, 'purpose', 'TREAT')) = pg_temp.fl(:'ward'),
  'a from that is not a time ("yesterday", month 13) reads as none: every measure, never an error');

\echo '── discharged, the stay leaves the answer'
select t.as(:'dr');
select t.landed(t.w(t.move('discharged', :'stay', :'ward', '{"disposition":"home"}')), 'the ward''s stay discharged home');
select t.as(:'nurse');
select t.ok(d -> 'stays' = '{}'::jsonb and d -> 'patient_ids' = '[]'::jsonb, 'no stay, no patient') from (select pg_temp.fl(:'ward') d) x;
select t.as(null);
