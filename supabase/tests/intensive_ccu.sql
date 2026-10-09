-- Critical care (spec §5.6), piece I3: the CCU, the pack's second starter setup, and the cardiac rows a department switches on: the
-- pack's open code system for rhythm, ectopics and ST (the base's observations), chest pain as the vitals' pain, their lines and values;
-- the board's latest rhythm.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set stay  '00000000-0000-0000-0000-00000000e901'
\set rh    '00000000-0000-0000-0000-00000000e902'
\set st    '00000000-0000-0000-0000-00000000e903'
\set fall  '00000000-0000-0000-0000-00000000e904'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["intensive"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["intensive"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'intensive.cardiac', 'owner_id', :'ward', 'data', '{"on":true}'::jsonb)) ->> 'key' as cardiac;

\echo '── the new declarations: the open code system, the cardiac rows'' setting'
select t.ok(s.layer = 'intensive' and not s.closed and s.kind = 'code' and s.uri = '{canon}/CodeSystem/intensive-cardiac',
  'intensive.cardiac: the pack''s own open code system') from core.systems s where s.key = 'intensive.cardiac';
select t.ok(k.owner_kind = 'department' and k.form = 'department', 'intensive.cardiac: a department''s setting, on its own form')
  from core.setting_keys k where k.key = 'intensive.cardiac';

\echo '── the CCU''s starter setup'
select t.ok(s.work = 'stays' and s.packs = array['intensive'] and s.settings -> 'department.encounter_class' ->> 'class' = 'IMP'
  and (select array_agg(p ->> 'key' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n)) = array['ccu_1', 'ccu_2', 'ccu_3', 'ccu_4']
  and (select array_agg(p ->> 'name' order by n) from jsonb_array_elements(s.places) with ordinality x(p, n)) = array['CCU 1', 'CCU 2', 'CCU 3', 'CCU 4']
  and s.screens = '{"screens":["base.beds","intensive.chart","intensive.round"],"opens":"base.beds"}'::jsonb,
  'intensive.ccu: stays, four CCU beds, inpatient, the bed board, the ICU chart and the Round') from core.setups s where s.key = 'intensive.ccu';
select t.ok((s.settings -> 'intensive.cardiac' ->> 'on')::boolean
  and (select array_agg(i ->> 'key') from jsonb_array_elements(s.settings -> 'intensive.unit' -> 'infusions') i) @> array['heparin', 'gtn', 'amiodarone'],
  'its settings: the cardiac rows on; the unit''s infusions hold heparin, GTN and amiodarone') from core.setups s where s.key = 'intensive.ccu';
select public.setup(jsonb_build_object('setup', 'intensive.ccu', 'department_id', :'new', 'name', 'CCU', 'apply', true)) is not null as made;
select t.ok(core.department_uses(:'org', :'new', 'intensive') and core.setting_at(:'org', 'department.setup', :'new') ->> 'setup' = 'intensive.ccu'
  and (core.setting_at(:'org', 'intensive.cardiac', :'new') ->> 'on')::boolean, 'a CCU made from it uses Critical care, keeps its setup, its cardiac rows on');
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

\echo '── the board: the stay''s latest rhythm'
select t.ok(w -> 'rhythm' ->> 'code' = 'af' and w -> 'rhythm' ->> 'at' is not null, 'the board as the nurse: rhythm af: ' || coalesce((w -> 'rhythm')::text, 'none'))
  from (select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', :'ward', 'args', '{}'::jsonb, 'purpose', 'TREAT')) -> 'stays' -> :'stay' w) x;
select t.as(null);
