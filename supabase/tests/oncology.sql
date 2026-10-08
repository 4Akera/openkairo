-- the oncology pack (spec §5.7): the cancer, the base's problem extended (the oncologist's write), its shape; the cycle, its own type on
-- the base's order to the day unit (the base's write:order, core change (a)), kept in its table for the day unit's rows and tiles,
-- answered by the unit's note; its FHIR beside the base's; the regimens changed by any oncologist (Q39), not by the day unit's nurse; the
-- nurse starts the day in a chair and ends it (the base's admit and discharge); off, no new cycle
\set im   '00000000-0000-0000-0000-0000000000d1'
\set onc  '00000000-0000-0000-0000-0000000000e1'
\set unit '00000000-0000-0000-0000-0000000000e2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set on   '11111111-0000-0000-0000-0000000000e1'
\set nu   '11111111-0000-0000-0000-0000000000e2'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["oncology"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'oncology.clinic', 'department_id', :'onc', 'name', 'Oncology clinic', 'apply', true)) is not null as clinic;
select public.setup(jsonb_build_object('setup', 'oncology.day_unit', 'department_id', :'unit', 'name', 'Chemotherapy day unit', 'apply', true)) is not null as unit;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e1', 'name', 'Dr Hesham', 'login_id', :'on', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e801', 'department_id', :'onc')))) ->> 'id' as oncologist;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e2', 'name', 'Asmaa', 'login_id', :'nu', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e802', 'department_id', :'unit')))) ->> 'id' as nurse;
create function pg_temp.cancer(p_stage text, p_intent text default 'curative') returns jsonb language sql as $$
  select t.e('oncology.cancer', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', jsonb_build_object('concept', jsonb_build_object('text', 'Breast cancer, left', 'codings', '[]'::jsonb),
    'category', 'problem-list-item', 'clinical_status', 'active', 'verification', 'confirmed', 'oncology', jsonb_build_object('site', 'breast', 'side', 'left', 'stage', p_stage,
    'tnm', '{"t":"pT2","n":"pN1a","m":"M0","edition":"AJCC 8th"}'::jsonb, 'intent', p_intent, 'regimen', 'AC → paclitaxel weekly')), '00000000-0000-0000-0000-0000000000ca')
$$;
create temp table svc as select core.setup_id(:'unit', 'service', 'chemo') id;
grant select on svc to authenticated;
create function pg_temp.cycle(p_id uuid, p_decision text default 'give', p_from uuid default '00000000-0000-0000-0000-0000000000e1') returns jsonb language sql as $$
  select t.e('oncology.cycle', '00000000-0000-0000-0000-0000000000f1', p_from, jsonb_build_object('service', jsonb_build_object('id', (select id from svc),
    'code', 'chemo', 'name', 'Chemotherapy cycle'), 'department_id', '00000000-0000-0000-0000-0000000000e2', 'priority', 'routine', 'status', 'active',
    'oncology', jsonb_build_object('regimen', 'ac', 'name', 'AC', 'cycle', 3, 'of', 4, 'day', 1, 'height', 158, 'weight', 72, 'bsa', 1.78, 'percent', 100, 'decision', p_decision,
      'doses', '[{"drug":"Doxorubicin","per":60,"basis":"m2","worked":106.8,"dose":107,"unit":"mg"}]'::jsonb)), p_id)
$$;
select core.setup_id(:'unit', 'place', 'chair_1') as chair1 \gset
set role authenticated;

\echo '── the cancer: the oncologist writes it; its shape is checked; a doctor without the pack''s action does not'
select t.as(:'on');
select t.landed(t.w(pg_temp.cancer('IIB')), 'the cancer, IIB, curative');
select t.refused(t.w(pg_temp.cancer('IIB', 'hopeful')), 'bad_shape', 'intent is curative or palliative');
select t.ok((select count(*) from t.rows('base.lists', :'onc', jsonb_build_object('patient_id', :'pt', 'list', 'problems')) r where r ->> 'item' = '00000000-0000-0000-0000-0000000000ca') = 1,
  'on the problem list (the base''s problem, extended)');
select t.as(:'dr');
select t.refused(t.w(t.e('oncology.cancer', :'pt', :'im', '{"concept":{"text":"x","codings":[]},"clinical_status":"active","verification":"confirmed"}')), 'not_allowed', 'not where the pack is not used');

\echo '── the cycle: the base''s order to the day unit with oncology''s words; in its table; on the unit''s list'
select t.as(:'on');
select t.landed(t.w(pg_temp.cycle('00000000-0000-0000-0000-00000000c301')), 'AC 3, give');
select t.refused(t.w(pg_temp.cycle(null, 'maybe')), 'bad_shape', 'Give, Delay or Reduce');
select t.ok((select r ->> 'regimen' = 'ac' and (r ->> 'cycle')::int = 3 and r ->> 'decision' = 'give' and (r ->> 'due')::date = current_date
  from t.rows('oncology.cycles', :'onc', jsonb_build_object('item', '00000000-0000-0000-0000-00000000c301')) r), 'kept for the day unit: AC 3, due today');
select t.ok(exists (select 1 from t.rows('base.orders', :'onc', jsonb_build_object('to_department_id', :'unit')) r where r ->> 'item' = '00000000-0000-0000-0000-00000000c301' and r ->> 'status' = 'active'),
  'on the unit''s orders, open');
select t.as(:'nu');
select t.ok(exists (select 1 from t.rows('oncology.cycles', :'unit', jsonb_build_object('to_department_id', :'unit', 'due', current_date)) r), 'the unit''s nurse reads today''s cycles');

\echo '── the chair: the nurse starts the day (the base''s Admit here) and ends it; the cycle answered by the unit''s note'
select t.landed(t.w(t.e('admitted', :'pt', :'unit', jsonb_build_object('department_id', :'unit', 'admit_source', 'outp', 'place_id', :'chair1'),
  '00000000-0000-0000-0000-00000000c311', '00000000-0000-0000-0000-00000000c311')), 'into Chair 1');
select t.landed(t.w(t.e('note', :'pt', :'unit', '{"kind":"nursing","text":"AC 3 given: doxorubicin 107 mg, cyclophosphamide 1 070 mg; no reaction."}', null, null,
  (select t.latest('00000000-0000-0000-0000-00000000c301')), 'answers')), 'given: the note answers the cycle');
select t.as(:'on');
select t.ok((select r ->> 'status' from t.rows('base.orders', :'onc', jsonb_build_object('item', '00000000-0000-0000-0000-00000000c301')) r) = 'completed', 'the cycle done');
select t.as(:'nu');
select t.landed(t.w(t.move('discharged', '00000000-0000-0000-0000-00000000c311', :'unit', '{"disposition":"home"}')), 'home: the chair frees');

\echo '── its FHIR adds the stage beside the base''s Condition and the cycle''s words beside the ServiceRequest'
select t.as(:'on');
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'onc')) b;
grant select on bundle to authenticated;
select t.ok((select e -> 'resource' -> 'stage' -> 0 -> 'summary' ->> 'text' from bundle, jsonb_array_elements(b -> 'entry') e
  where e -> 'resource' ->> 'resourceType' = 'Condition' and e -> 'resource' ->> 'id' = '00000000-0000-0000-0000-0000000000ca') = 'IIB', 'the Condition''s stage: IIB');
select t.ok((select count(*) from bundle, jsonb_array_elements(b -> 'entry') e, jsonb_array_elements(e -> 'resource' -> 'orderDetail') d
  where e -> 'resource' ->> 'id' = '00000000-0000-0000-0000-00000000c301' and d ->> 'text' like 'BSA 1.78%') = 1, 'the ServiceRequest says the BSA');

\echo '── the regimens: any oncologist changes them (Q39); the unit''s nurse does not'
reset role;
select t.ok(core.may_somewhere('00000000-0000-0000-0000-0000000000e1', 'edit:oncology.regimens'), 'the oncologist may change the regimens (a clinic key: held in a department that uses the pack)');
select t.ok(not core.may_somewhere('00000000-0000-0000-0000-0000000000e2', 'edit:oncology.regimens'), 'the nurse may not');
select t.ok(core.may('00000000-0000-0000-0000-0000000000e2', 'write:admitted', :'unit') and core.may('00000000-0000-0000-0000-0000000000e2', 'write:discharged', :'unit'),
  'the nurse admits into a chair and discharges');
set role authenticated;
select t.as(:'on');
select public.write_setting('{"key":"oncology.regimens","data":{"regimens":[{"key":"ac","name":"AC","every_days":21,"cycles":4,"drugs":[{"drug":"Doxorubicin","per":60,"basis":"m2","round":1}],"checks":[{"test":"anc","min":1.5}]}],"plans":[]}}') ->> 'key' as regimens;
reset role;
select t.ok((select s.data -> 'regimens' -> 0 ->> 'key' from core.settings s where s.key = 'oncology.regimens' order by s.recorded_at desc limit 1) = 'ac', 'the oncologist''s regimens saved');
set role authenticated;

\echo '── off for the clinic: no new cycle'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'on');
select t.refused(t.w(pg_temp.cycle(null)), 'pack_off', 'oncology off');
