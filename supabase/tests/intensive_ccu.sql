-- Critical care (spec §5.6), piece I3: the CCU, the pack's second starter setup, and the cardiac rows a department switches on: the
-- pack's open code system for rhythm, ectopics and ST (the base's observations), chest pain as the vitals' pain, their lines and values;
-- the board's latest rhythm; the reperfusion record (the pack's own type: its times in order, lysis with its drug, one a stay, its line
-- and FHIR); the unit's heparin table by aPTT and its check.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set stay  '00000000-0000-0000-0000-00000000e901'
\set rh    '00000000-0000-0000-0000-00000000e902'
\set st    '00000000-0000-0000-0000-00000000e903'
\set fall  '00000000-0000-0000-0000-00000000e904'
\set rep   '00000000-0000-0000-0000-00000000e905'
\set rep2  '00000000-0000-0000-0000-00000000e906'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["intensive"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["intensive"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'intensive.cardiac', 'owner_id', :'ward', 'data', '{"on":true}'::jsonb)) ->> 'key' as cardiac;

\echo '── the new declarations: the open code system, the reperfusion record, its action, the cardiac rows'' and the heparin''s settings'
select t.ok(s.layer = 'intensive' and not s.closed and s.kind = 'code' and s.uri = '{canon}/CodeSystem/intensive-cardiac',
  'intensive.cardiac: the pack''s own open code system') from core.systems s where s.key = 'intensive.cardiac';
select t.ok(y.resources = array['Observation'] and y.base_type is null and y.to_fhir is not null and cardinality(y.checks) = 1,
  'intensive.reperfusion: an Observation of its own, its FHIR and its check') from core.types y where y.key = 'intensive.reperfusion';
select t.ok(a.everyday, 'write:intensive.reperfusion is everyday') from core.actions a where a.key = 'write:intensive.reperfusion';
select t.ok(count(*) = 2 and bool_and(k.owner_kind = 'department' and k.form = 'department'),
  'intensive.cardiac and intensive.heparin: a department''s settings, on its own form') from core.setting_keys k where k.key in ('intensive.cardiac', 'intensive.heparin');

\echo '── the CCU''s starter setup'
select t.ok(s.work = 'stays' and s.packs = array['intensive'] and s.settings -> 'department.encounter_class' ->> 'class' = 'IMP'
  and (select array_agg(p ->> 'key' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n)) = array['ccu_1', 'ccu_2', 'ccu_3', 'ccu_4']
  and (select array_agg(p ->> 'name' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n)) = array['CCU 1', 'CCU 2', 'CCU 3', 'CCU 4']
  and s.screens = '{"screens":["base.beds","intensive.chart","intensive.round"],"opens":"base.beds"}'::jsonb,
  'intensive.ccu: stays, four CCU beds, inpatient, the bed board, the ICU chart and the Round') from core.setups s where s.key = 'intensive.ccu';
select t.ok((s.settings -> 'intensive.cardiac' ->> 'on')::boolean
  and jsonb_array_length(s.settings -> 'intensive.heparin' -> 'steps') = 6
  and (select array_agg(i ->> 'key') from jsonb_array_elements(s.settings -> 'intensive.unit' -> 'infusions') i) @> array['heparin', 'gtn', 'amiodarone'],
  'its settings: the cardiac rows on; a heparin table of six steps; the unit''s infusions hold heparin, GTN and amiodarone') from core.setups s where s.key = 'intensive.ccu';
select public.setup(jsonb_build_object('setup', 'intensive.ccu', 'department_id', :'new', 'name', 'CCU', 'apply', true)) is not null as made;
select t.ok(core.department_uses(:'org', :'new', 'intensive') and core.setting_at(:'org', 'department.setup', :'new') ->> 'setup' = 'intensive.ccu'
  and (core.setting_at(:'org', 'intensive.cardiac', :'new') ->> 'on')::boolean, 'a CCU made from it uses Critical care, keeps its setup, its cardiac rows on');

\echo '── the heparin table: a target low below high, steps that touch'
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'intensive.heparin', 'owner_id', %L, 'data',
  '{"low":70,"high":50,"steps":[]}'::jsonb))$q$, :'ward'), 'bad_target');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'intensive.heparin', 'owner_id', %L, 'data',
  '{"low":50,"high":70,"steps":[{"max":39,"change":200,"next":6},{"min":40,"max":49,"change":100,"next":6},{"min":45,"max":60,"change":0,"next":24}]}'::jsonb))$q$, :'ward'), 'steps_overlap');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'intensive.heparin', 'owner_id', %L, 'data',
  '{"low":50,"high":70,"steps":[{"max":39,"change":200,"next":6},{"min":40,"max":49,"change":100,"next":6},{"min":55,"max":60,"change":0,"next":24}]}'::jsonb))$q$, :'ward'), 'steps_gap');
select t.as(null);

\echo '── one hour with the cardiac rows: the pain on the vitals, rhythm, ectopics, ST and its fall as the base''s observations'
-- an entry of the ward's stay, at the hour
create function pg_temp.e(p_type text, p_data jsonb, p_id uuid default null) returns jsonb language sql as $$
  select t.e(p_type, '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d6', p_data, p_id, '00000000-0000-0000-0000-00000000e901'::uuid,
    null, null, null, jsonb_build_object('occurred_at', date_trunc('hour', now())))
$$;
-- a cardiac row: its code and its value, each in the pack's system
create function pg_temp.card(p_code text, p_words text, p_value jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', jsonb_build_object('text', p_words, 'codings', jsonb_build_array(jsonb_build_object('system', 'intensive.cardiac', 'code', p_code, 'display', p_words))),
    'value', p_value)
$$;
create function pg_temp.word(p_code text, p_words text) returns jsonb language sql immutable as $$
  select jsonb_build_object('concept', jsonb_build_object('text', p_words, 'codings', jsonb_build_array(jsonb_build_object('system', 'intensive.cardiac', 'code', p_code, 'display', p_words))))
$$;
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"anterior STEMI"}', :'stay', :'stay')), 'admitted to the ward');
select t.as(:'nurse');
create temp table hour1 as select t.w(jsonb_build_array(
  pg_temp.e('vitals', '{"hr":{"value":"128","unit":"bpm","ucum":"/min"},"pain":{"value":"3","unit":"/10","ucum":"{score}"}}'),
  pg_temp.e('observation', pg_temp.card('rhythm', 'Heart rhythm', pg_temp.word('af', 'Atrial fibrillation')), :'rh'),
  pg_temp.e('observation', pg_temp.card('ectopics', 'Ectopic beats', pg_temp.word('ves', 'Ventricular ectopics'))),
  pg_temp.e('observation', pg_temp.card('st', 'ST segment', pg_temp.word('resolving', 'Resolving')), :'st'),
  pg_temp.e('observation', pg_temp.card('st_fall', 'ST elevation fall', '{"quantity":{"value":"60","unit":"%","ucum":"%"}}'), :'fall'))) r;
select t.landed(r, 'the hour lands in one set') from hour1;
select t.ok(r -> 'findings' = '[]'::jsonb, 'with no finding: an open system lands any of its codes') from hour1;
create temp table rec1 as select t.record(:'pt', :'ward') r;
select t.ok(t.entry(r, :'rh') ->> 'line' = 'Heart rhythm: Atrial fibrillation', 'the rhythm''s line: ' || coalesce(t.entry(r, :'rh') ->> 'line', '–')) from rec1;
select t.ok(t.entry(r, :'fall') ->> 'line' = 'ST elevation fall: 60 %', 'the ST fall''s line: ' || coalesce(t.entry(r, :'fall') ->> 'line', '–')) from rec1;
select t.ok(exists (select 1 from t.rows('base.values', :'ward', jsonb_build_object('patient_id', :'pt')) v
    where v ->> 'code' = 'intensive.cardiac:st_fall' and (v ->> 'value')::numeric = 60 and v ->> 'ucum' = '%'),
  'base.values holds the ST fall: intensive.cardiac:st_fall = 60 %');
select t.ok(exists (select 1 from t.rows('base.values', :'ward', jsonb_build_object('patient_id', :'pt')) v
    where v ->> 'code' = 'loinc:72514-3' and (v ->> 'value')::numeric = 3), 'and the chest pain, the vitals'' pain: 3');

\echo '── the reperfusion record: its line; its times in order, lysis with its drug, one a stay; a change continues it'
-- the reperfusion times, door to needle 28 minutes, each relative to now
create function pg_temp.rep(p_data jsonb, p_id uuid default null, p_refers uuid default null, p_relation text default null) returns jsonb language sql as $$
  select t.e('intensive.reperfusion', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d6',
    jsonb_build_object('diagnosis', 'stemi_anterior', 'pain_at', date_trunc('minute', now()) - interval '200 minutes', 'door_at', date_trunc('minute', now()) - interval '120 minutes',
      'ecg_at', date_trunc('minute', now()) - interval '114 minutes', 'reperfusion', 'lysis', 'lytic', jsonb_build_object('text', 'Tenecteplase'),
      'needle_at', date_trunc('minute', now()) - interval '92 minutes', 'killip', 'i') || p_data,
    p_id, '00000000-0000-0000-0000-00000000e901'::uuid, p_refers, p_relation)
$$;
select t.as(:'dr');
select t.landed(t.w(pg_temp.rep('{}', :'rep')), 'the reperfusion times: lysis with tenecteplase, door to needle 28 minutes');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'rep') ->> 'line' = 'Anterior STEMI · lysis (tenecteplase) · door to needle 28 min · Killip I',
  'its line: ' || coalesce(t.entry(t.record(:'pt', :'ward'), :'rep') ->> 'line', '–'));
select t.refused(t.w(pg_temp.rep(jsonb_build_object('ecg_at', date_trunc('minute', now()) - interval '125 minutes'))), 'times_out_of_order', 'the first ECG before the door');
select t.refused(t.w(pg_temp.rep('{}') #- '{data,lytic}'), 'lytic_missing', 'lysis with no lytic');
select t.refused(t.w(pg_temp.rep('{}') #- '{data,needle_at}'), 'lytic_missing', 'lysis with no needle time');
select t.refused(t.w(pg_temp.rep(jsonb_build_object('needle_at', date_trunc('minute', now()) - interval '116 minutes'))), 'times_out_of_order', 'the needle before the first ECG');
select t.refused(t.w(pg_temp.rep(jsonb_build_object('needle_at', date_trunc('minute', now()) + interval '2 hours'))), 'time_in_future', 'a needle time still to come');
select t.refused(t.w(pg_temp.rep('{}')), 'already_recorded', 'a second record in the stay');
reset role;
select t.ok(intensive.reperfusion_line(jsonb_build_object('data', jsonb_build_object('diagnosis', 'stemi_inferior', 'reperfusion', 'primary_pci', 'killip', 'i',
    'door_at', date_trunc('minute', now()) - interval '62 minutes', 'needle_at', date_trunc('minute', now())))) = 'Inferior STEMI · primary PCI · door to balloon 62 min · Killip I',
  'a primary PCI''s line reads door to balloon');
select t.ok(intensive.reperfusion_line(jsonb_build_object('data', jsonb_build_object('diagnosis', 'stemi_anterior', 'reperfusion', 'none', 'killip', 'i',
    'door_at', date_trunc('minute', now()) - interval '62 minutes', 'needle_at', date_trunc('minute', now())))) = 'Anterior STEMI · no reperfusion · Killip I',
  'no reperfusion: no door to needle');
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(pg_temp.rep(jsonb_build_object('killip', 'ii', 'angiography', 'within_24h', 'angiography_by', date_trunc('minute', now()) + interval '22 hours'), :'rep2', :'rep', 'changes'), null, '{}', jsonb_build_object(:'rep', 1)), 'a change of the record: Killip II');

\echo '── FHIR: the reperfusion an Observation with its times and Killip as components; the rhythm coded in the pack''s system'
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) b;
create temp table res as select e -> 'resource' r from bundle, jsonb_array_elements(b -> 'entry') e;
select t.ok((select count(*) from jsonb_array_elements(r -> 'component') c where c -> 'code' ->> 'text' in ('Pain began', 'At the door', 'First ECG', 'Lysis or balloon')
      and c ->> 'valueDateTime' is not null) = 4
  and r -> 'component' @> '[{"code":{"text":"Killip class"},"valueString":"II"}]'
  and (select c ->> 'valueDateTime' from jsonb_array_elements(r -> 'component') c where c -> 'code' ->> 'text' = 'Angiography by') is not null,
  'the reperfusion''s Observation: the four times, Killip II, angiography by')
  from res where r ->> 'resourceType' = 'Observation' and r ->> 'id' = :'rep';
select t.ok(r -> 'code' -> 'coding' -> 0 ->> 'system' like '%/CodeSystem/intensive-cardiac', 'the rhythm''s code in the pack''s system: ' || coalesce(r -> 'code' -> 'coding' -> 0 ->> 'system', '–'))
  from res where r ->> 'resourceType' = 'Observation' and r ->> 'id' = :'rh';
reset role;
select t.report('intensive_ccu', (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || q) from res, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle';
select t.ok(true, 'no resource has a FHIR problem');
with refs as (select distinct v #>> '{}' ref from res, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('intensive_ccu', 'unresolved reference ' || ref) from refs where not exists (select 1 from res where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'every reference resolves inside the bundle');
set role authenticated;

\echo '── the board: the stay''s latest rhythm'
select t.as(:'nurse');
select t.ok(w -> 'rhythm' ->> 'code' = 'af' and w -> 'rhythm' ->> 'at' is not null, 'the board as the nurse: rhythm af: ' || coalesce((w -> 'rhythm')::text, 'none'))
  from (select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', :'ward', 'args', '{}'::jsonb, 'purpose', 'TREAT')) -> 'stays' -> :'stay' w) x;
select t.as(null);
