-- Critical care (spec §5.6), piece I2: SOFA (1996) as a declared score table and its totals; the daily goals (intensive.goals, a
-- CarePlan), signed with the SOFA in one set, their line, checks and FHIR; the lines (central, arterial) as the base's procedures, one
-- removed by a version that changes it; the ICU's setup, its Round screen and the unit's SOFA drugs; the board's SOFA and goals.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set stay  '00000000-0000-0000-0000-00000000e801'
\set cvc   '00000000-0000-0000-0000-00000000e802'
\set art   '00000000-0000-0000-0000-00000000e803'
\set sofa  '00000000-0000-0000-0000-00000000e804'
\set goals '00000000-0000-0000-0000-00000000e805'
\set rm    '00000000-0000-0000-0000-00000000e806'
\set goals2 '00000000-0000-0000-0000-00000000e807'
\set vent  '00000000-0000-0000-0000-00000000e808'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["intensive"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["intensive"]}'::jsonb)) ->> 'key' as ticked;
select t.as(null);

\echo '── SOFA (1996): a declared table, six items of five choices, one band over 0–24'
select t.ok(s.layer = 'intensive' and s.version = '1996' and s.short = 'SOFA' and s.alias = 'sofa' and s.source like 'Vincent JL%' and s.coding is null
  and s.labels ->> 'en' = 'SOFA (1996)', 'intensive.sofa 1996: SOFA, /sofa, Vincent 1996, no coding') from core.scores s where s.key = 'intensive.sofa';
select t.ok((select array_agg(i ->> 'key' order by n) from jsonb_array_elements(s.items) with ordinality x(i, n)) = array['resp', 'coag', 'liver', 'cardio', 'cns', 'renal']
  and (select bool_and(i ->> 'input' = 'choice' and (select array_agg(c ->> 'value' order by m) from jsonb_array_elements(i -> 'choices') with ordinality y(c, m)) = array['0', '1', '2', '3', '4']
        and (select bool_and((c ->> 'points')::int = (c ->> 'value')::int) from jsonb_array_elements(i -> 'choices') c)) from jsonb_array_elements(s.items) i),
  'its items resp, coag, liver, cardio, cns, renal: each five choices ''0''…''4'', the points their value') from core.scores s where s.key = 'intensive.sofa';
select t.ok(jsonb_array_length(s.bands) = 1 and s.bands -> 0 ->> 'key' = 'sofa' and (s.bands -> 0 ->> 'min')::int = 0 and (s.bands -> 0 ->> 'max')::int = 24
  and coalesce(s.bands -> 0 ->> 'tone', 'none') = 'none' and s.bands -> 0 -> 'labels' ->> 'en' = 'of 24', 'one band 0–24, no tone: "of 24"') from core.scores s where s.key = 'intensive.sofa';

\echo '── its totals, as the server adds them up'
select t.ok((core.score('intensive.sofa', '1996', '{"resp":"0","coag":"0","liver":"0","cardio":"0","cns":"0","renal":"0"}') ->> 'total')::int = 0, 'all 0: 0');
select t.ok((core.score('intensive.sofa', '1996', '{"resp":"4","coag":"4","liver":"4","cardio":"4","cns":"4","renal":"4"}') ->> 'total')::int = 24, 'all 4: 24');
select t.ok((r ->> 'total')::int = 11 and r -> 'band' ->> 'key' = 'sofa', '3 2 1 4 0 1: 11, band sofa')
  from (select core.score('intensive.sofa', '1996', '{"resp":"3","coag":"2","liver":"1","cardio":"4","cns":"0","renal":"1"}') r) x;
select t.ok(not (r ->> 'complete')::boolean and r -> 'missing' = '["renal"]'::jsonb, 'no kidney: not complete, renal missing')
  from (select core.score('intensive.sofa', '1996', '{"resp":"3","coag":"2","liver":"1","cardio":"4","cns":"0"}') r) x;
select t.ok(r -> 'problems' @> '[{"item":"coag","code":"unknown_choice"}]', 'platelets ''5'': unknown_choice')
  from (select core.score('intensive.sofa', '1996', '{"resp":"3","coag":"5","liver":"1","cardio":"4","cns":"0","renal":"1"}') r) x;

\echo '── the daily goals, their action and screen; the ICU''s setup and the unit''s SOFA drugs'
select t.ok(y.resources = array['CarePlan'] and y.base_type is null and y.to_fhir is not null and cardinality(y.checks) = 1,
  'intensive.goals: a CarePlan of its own, its FHIR and one check') from core.types y where y.key = 'intensive.goals';
select t.ok(a.everyday, 'write:intensive.goals is everyday') from core.actions a where a.key = 'write:intensive.goals';
select t.ok(c.work = 'stays' and c.action = 'read:record', 'intensive.round: a stays screen for whoever reads the record') from core.screens c where c.key = 'intensive.round';
select t.ok(s.screens = '{"screens":["base.beds","intensive.chart","intensive.round"],"opens":"base.beds"}'::jsonb
  and (select array_agg(i ->> 'sofa' order by n) from jsonb_array_elements(s.settings -> 'intensive.unit' -> 'infusions') with ordinality x(i, n) where i ? 'sofa')
    = array['noradrenaline', 'adrenaline', 'dopamine', 'dobutamine']
  and (select bool_and(i ->> 'sofa' = i ->> 'key') from jsonb_array_elements(s.settings -> 'intensive.unit' -> 'infusions') i where i ? 'sofa'),
  'intensive.icu: the board, the ICU chart and the Round; SOFA counts noradrenaline, adrenaline, dopamine, dobutamine') from core.setups s where s.key = 'intensive.icu';
select t.ok(exists (select 1 from core.shape_nodes((select shape from core.setting_keys where key = 'intensive.unit')) n where n.path = 'infusions.sofa'),
  'the unit''s setting names infusions.sofa');

-- an entry of the ward's stay; p_extra its time
create function pg_temp.e(p_type text, p_data jsonb, p_id uuid default null, p_refers uuid default null, p_relation text default null,
  p_dept uuid default '00000000-0000-0000-0000-0000000000d6', p_extra jsonb default '{}') returns jsonb language sql as $$
  select t.e(p_type, '00000000-0000-0000-0000-0000000000f1', p_dept, p_data, p_id, '00000000-0000-0000-0000-00000000e801'::uuid, p_refers, p_relation, null, p_extra)
$$;
create function pg_temp.line(p_code text, p_words text, p_site text default null, p_status text default 'in-progress', p_outcome text default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('concept', jsonb_build_object('text', p_words, 'codings', jsonb_build_array(jsonb_build_object('system', 'local.procedure', 'code', p_code, 'display', p_words))),
    'status', p_status, 'outcome', p_outcome, 'performed', jsonb_build_object('value', date_trunc('hour', now()) - interval '1 day', 'precision', 'minute'),
    'body_site', case when p_site is not null then jsonb_build_object('text', p_site) end))
$$;
create function pg_temp.sofa(p_total int, p_dept uuid default '00000000-0000-0000-0000-0000000000d6', p_id uuid default null) returns jsonb language sql as $$
  select pg_temp.e('score', jsonb_build_object('score', 'intensive.sofa', 'version', '1996',
    'inputs', '{"resp":"3","coag":"2","liver":"1","cardio":"4","cns":"0","renal":"1"}'::jsonb, 'total', p_total, 'band', 'sofa'), p_id, null, null, p_dept)
$$;
create function pg_temp.goals(p_lines jsonb, p_id uuid default null) returns jsonb language sql as $$
  select pg_temp.e('intensive.goals', jsonb_build_object('feeding', 'enteral', 'head_up', true, 'lines', p_lines,
    'map_target', jsonb_build_object('value', '65', 'unit', 'mmHg', 'ucum', 'mm[Hg]'), 'balance_target', jsonb_build_object('value', '-500', 'unit', 'mL', 'ucum', 'mL'),
    'text', 'MAP ≥ 65'), p_id, null, null, '00000000-0000-0000-0000-0000000000d6', jsonb_build_object('occurred_at', now() - interval '1 hour'))
$$;

set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"septic shock"}', :'stay', :'stay')), 'admitted to the ward');
select t.as(:'nurse');
select t.landed(t.w(jsonb_build_array(pg_temp.e('procedure', pg_temp.line('central_line', 'Central venous catheter', 'right internal jugular'), :'cvc'),
  pg_temp.e('procedure', pg_temp.line('arterial_line', 'Arterial line', 'left radial'), :'art'))), 'two lines, in progress: central (right internal jugular) and arterial');

\echo '── the round, one set: the SOFA and the daily goals'
select t.as(:'dr');
create temp table round1 as select t.w(jsonb_build_array(pg_temp.sofa(11, :'ward', :'sofa'),
  pg_temp.goals(jsonb_build_array(jsonb_build_object('item', :'cvc', 'decision', 'keep'), jsonb_build_object('item', :'art', 'decision', 'remove')), :'goals'))) r;
select t.landed(r, 'the round lands in one set') from round1;
select t.ok(r -> 'findings' = '[]'::jsonb, 'with no finding') from round1;
create temp table rec1 as select t.record(:'pt', :'ward') r;
select t.ok(t.entry(r, :'sofa') ->> 'line' = 'SOFA 11, 1996 · of 24', 'the SOFA''s line: ' || coalesce(t.entry(r, :'sofa') ->> 'line', '–')) from rec1;
select t.ok(t.entry(r, :'goals') ->> 'line' like 'Daily goals · MAP ≥ 65 mmHg · balance -500 mL · 1 line to remove%', 'the goals'' line: ' || coalesce(t.entry(r, :'goals') ->> 'line', '–')) from rec1;

\echo '── refused: SOFA where the pack is not used, a total the server does not add up to; goals on an unknown line, a line twice, nothing'
select t.refused(t.w(pg_temp.sofa(11, :'im')), 'pack_not_used', 'SOFA in Internal Medicine');
select t.refused(t.w(pg_temp.sofa(12)), 'score_mismatch', 'a total of 12 for 11''s inputs');
select t.refused(t.w(pg_temp.goals(jsonb_build_array(jsonb_build_object('item', gen_random_uuid(), 'decision', 'keep')))), 'unknown_line', 'a line that is no procedure of his');
select t.refused(t.w(pg_temp.goals(jsonb_build_array(jsonb_build_object('item', :'cvc', 'decision', 'keep'), jsonb_build_object('item', :'cvc', 'decision', 'remove')))),
  'duplicate', 'the central line decided twice');
select t.refused(t.w(pg_temp.e('intensive.goals', '{}')), 'bad_shape', 'goals with nothing in them');
select t.landed(t.w(pg_temp.e('procedure', pg_temp.line('invasive_ventilation', 'Invasive ventilation'), :'vent')), 'a ventilation, a procedure that is no line');
select t.refused(t.w(pg_temp.goals(jsonb_build_array(jsonb_build_object('item', :'vent', 'decision', 'keep')))), 'unknown_line', 'a procedure that is not a line');
select t.refused(t.w(pg_temp.e('intensive.goals', '{"map_target":{"value":"8.7","unit":"kPa","ucum":"kPa"}}')), 'target_unit', 'a MAP target in kPa');
select t.refused(t.w(pg_temp.e('intensive.goals', '{"map_target":{"value":"0","unit":"mmHg","ucum":"mm[Hg]"}}')), 'target_unit', 'a MAP target of 0');
select t.refused(t.w(pg_temp.e('intensive.goals', '{"balance_target":{"value":"-1","unit":"L","ucum":"L"}}')), 'target_unit', 'a balance target in litres');

\echo '── removed: a version of the arterial line, completed'
select t.as(:'nurse');
select t.landed(t.w(pg_temp.e('procedure', pg_temp.line('arterial_line', 'Arterial line', 'left radial', 'completed', 'removed'), :'rm', :'art', 'changes'),
  null, '{}', jsonb_build_object(:'art', 1)), 'the arterial line removed');
select t.ok(e -> 'data' ->> 'status' = 'completed' and e -> 'data' ->> 'outcome' = 'removed', 'the arterial line''s item now ends completed, removed')
  from jsonb_array_elements(t.record(:'pt', :'ward') -> 'entries') e where e ->> 'item' = :'art' order by (e ->> 'item_version')::int desc limit 1;

\echo '── FHIR: the goals a CarePlan naming the lines; a later round completes them; the SOFA an Observation with six components'
select t.as(:'dr');
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) b;
create temp table res as select e -> 'resource' r from bundle, jsonb_array_elements(b -> 'entry') e;
select t.ok(r ->> 'status' = 'active' and r ->> 'intent' = 'plan'
  and r -> 'supportingInfo' @> jsonb_build_array(jsonb_build_object('reference', 'Procedure/' || :'cvc'), jsonb_build_object('reference', 'Procedure/' || :'art'))
  and not jsonb_path_exists(r, '$.activity[*].outcomeReference')
  and r -> 'activity' @> '[{"detail":{"description":"Central venous catheter: keep","status":"in-progress"}}]'
  and r -> 'activity' @> '[{"detail":{"description":"Arterial line: remove","status":"scheduled"}}]',
  'the CarePlan: active, a plan, the lines in supportingInfo, keep in progress, remove scheduled') from res where r ->> 'resourceType' = 'CarePlan' and r ->> 'id' = :'goals';
select t.ok(jsonb_array_length(r -> 'component') = 6, 'the SOFA''s Observation: six components') from res where r ->> 'resourceType' = 'Observation' and r ->> 'id' = :'sofa';
select t.landed(t.w(pg_temp.e('intensive.goals', '{"feeding":"enteral"}', :'goals2')), 'a later round''s goals, a new item');
create temp table bundle2 as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) b;
create temp table res2 as select e -> 'resource' r from bundle2, jsonb_array_elements(b -> 'entry') e;
select t.ok((select r ->> 'status' from res2 where r ->> 'resourceType' = 'CarePlan' and r ->> 'id' = :'goals') = 'completed'
  and (select r ->> 'status' from res2 where r ->> 'resourceType' = 'CarePlan' and r ->> 'id' = :'goals2') = 'active', 'the earlier goals completed, the later active');
select t.ok(not jsonb_path_exists(r, '$.activity[*].detail ? (@.status != "completed")'), 'the completed goals'' activities are completed too')
  from res2 where r ->> 'resourceType' = 'CarePlan' and r ->> 'id' = :'goals';
reset role;
select t.report('intensive_round', (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || q) from res2, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle';
select t.ok(true, 'no resource has a FHIR problem');
with refs as (select distinct v #>> '{}' ref from res2, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('intensive_round', 'unresolved reference ' || ref) from refs where not exists (select 1 from res2 where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'every reference resolves inside the bundle');
set role authenticated;

\echo '── the board: the stay''s latest SOFA and when its goals were signed'
select t.as(:'nurse');
select t.ok((w -> 'sofa' ->> 'total')::int = 11 and w ->> 'goals_at' is not null, 'the board: SOFA 11, goals signed: ' || w::text)
  from (select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', :'ward', 'args', '{}'::jsonb, 'purpose', 'TREAT')) -> 'stays' -> :'stay' w) x;
select t.as(null);
