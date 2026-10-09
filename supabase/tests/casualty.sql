-- Emergency (spec §5.6), its key casualty: the pack, its two triage scales as code systems, the triage type on the base's observation,
-- its action and the triage nurse, the clinic's scale, the Patients screen and the starter setup (two resus bays, six cubicles, EMER);
-- in a department made from it: Arrived (the base's admitted with no place), the triage set (the vitals, the triage, the base's urgent
-- for a level 1 or 2, a move to a bay), retriage as a new entry, Arrived and triage in one Done, the pack's refusals, the record's line,
-- the board's read (each stay's latest triage, and when a doctor first wrote in it), the export; Where to (piece E3: the decision and its
-- refusals, the leaving in one Done, to the ward through E1's pass, home, died, the free beds, the police case); the clinic's scale, and
-- the pack off.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set desk  '00000000-0000-0000-0000-0000000000d4'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set er    '00000000-0000-0000-0000-0000000000d7'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set p2    '00000000-0000-0000-0000-0000000000f2'
\set kid   '00000000-0000-0000-0000-0000000000f9'
\set unk   '00000000-0000-0000-0000-0000000000f8'
\set s1    '00000000-0000-0000-0000-00000000e201'
\set s2    '00000000-0000-0000-0000-00000000e202'
\set s3    '00000000-0000-0000-0000-00000000e203'
\set s4    '00000000-0000-0000-0000-00000000e204'
\set tr1   '00000000-0000-0000-0000-00000000e211'
\set tr2   '00000000-0000-0000-0000-00000000e212'
\set v1    '00000000-0000-0000-0000-00000000e221'
\set u1    '00000000-0000-0000-0000-00000000e231'
\set m1    '00000000-0000-0000-0000-00000000e241'
\set p4    '00000000-0000-0000-0000-0000000000fa'
\set p5    '00000000-0000-0000-0000-0000000000fb'
\set p6    '00000000-0000-0000-0000-0000000000fc'
\set p7    '00000000-0000-0000-0000-0000000000fd'
\set s5    '00000000-0000-0000-0000-00000000e205'
\set s6    '00000000-0000-0000-0000-00000000e206'
\set s7    '00000000-0000-0000-0000-00000000e207'
\set s8    '00000000-0000-0000-0000-00000000e208'
\set d1    '00000000-0000-0000-0000-00000000e261'
\set d2    '00000000-0000-0000-0000-00000000e262'
\set n5    '00000000-0000-0000-0000-00000000e263'
\set a5    '00000000-0000-0000-0000-00000000e264'
\set note5 '00000000-0000-0000-0000-00000000e265'
\set er2   '00000000-0000-0000-0000-0000000000d8'
\set bed4  '00000000-0000-0000-0000-000000000004'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set rc    '11111111-0000-0000-0000-0000000000b4'
\set tn    '11111111-0000-0000-0000-0000000000be'

-- a triage's data as the card writes it: the level's words and its coding on the scale given (the system and code may be forced wrong)
create function pg_temp.tri(p_level int, p_scale text default 'ats', p_more jsonb default '{}', p_note text default null, p_code text default null, p_system text default null)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'code', jsonb_build_object('text', 'Triage level (' || case p_scale when 'mts' then 'Manchester' else 'Australasian' end || ' scale)'),
    'value', jsonb_build_object('concept', jsonb_build_object('text', p_level || ' · ' || w,
      'codings', jsonb_build_array(jsonb_build_object('system', coalesce(p_system, 'casualty.' || p_scale), 'code', coalesce(p_code, p_level::text), 'display', w)))),
    'note', p_note,
    'casualty', jsonb_build_object('scale', p_scale, 'scale_version', case p_scale when 'mts' then '3' else 'P06' end, 'level', p_level) || p_more))
  from (select case p_level when 1 then 'Immediate' when 2 then 'Very urgent' when 3 then 'Urgent' when 4 then 'Standard' else 'Non-urgent' end w) x
$$;

select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["casualty"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'casualty.er', 'department_id', :'er', 'name', 'Emergency', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000be', 'name', 'Triage Nurse Heba', 'login_id', :'tn', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000d101', 'department_id', :'er')))) is not null as tn;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'er')))) is not null as dr;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b3', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'er')))) is not null as nurse;
select core.setup_id(:'er', 'place', 'resus_1') as r1, core.setup_id(:'er', 'place', 'resus_2') as r2, core.setup_id(:'er', 'place', 'cubicle_1') as c1 \gset

\echo '── the pack: Emergency, its role ids in block d1, nothing of its own callable'
select t.ok(l.role_block = 'd1' and l.is_pack and l.labels ->> 'en' = 'Emergency', 'casualty reads "Emergency", its role ids in its block, d1')
  from core.layers l where l.key = 'casualty';
select t.ok(not has_schema_privilege('authenticated', 'casualty', 'USAGE'), 'the API cannot reach its schema');

\echo '── its declarations'
select t.ok(y.base_type = 'observation' and y.resources = array['Observation'] and y.in_record and not y.may_be_private
  and y.line = 'casualty.triage_line(jsonb)'::regprocedure and y.checks = array['casualty.triage_check(jsonb,jsonb)']::regprocedure[],
  'casualty.triage v1: on the base''s observation, an Observation, in the record, never private, its line and its check')
  from core.types y where y.key = 'casualty.triage' and y.version = 1;
select t.ok(a.layer = 'casualty' and a.scope = 'department' and a.everyday, 'write:casualty.triage: the pack''s, per department, everyday')
  from core.actions a where a.key = 'write:casualty.triage';
select t.ok(r.key = 'casualty.triage_nurse' and r.built_on = '00000000-0000-0000-0000-00000000c003'
  and (select array_agg(ra.action order by ra.action) from core.role_actions ra where ra.role_id = r.id) = array['manage:patients', 'write:admitted'],
  'the triage nurse: built on the Nurse, her own actions Arrived and registering patients') from core.roles r where r.id = '00000000-0000-0000-0000-00000000d101';
select t.ok(core.gives(:'org', '00000000-0000-0000-0000-00000000d101', 'write:casualty.triage', :'er'), 'she triages in Emergency, through the Nurse''s everyday');
select t.ok(not core.gives(:'org', '00000000-0000-0000-0000-00000000d101', 'write:discharged', :'er'), 'she does not discharge');
select t.ok(count(*) = 2 and bool_and(s.layer = 'casualty' and not s.closed)
  and bool_or(s.key = 'casualty.ats' and s.uri like '%/CodeSystem/triage-ats') and bool_or(s.key = 'casualty.mts' and s.uri like '%/CodeSystem/triage-mts'),
  'the two scales are the pack''s open code systems') from core.systems s where s.key in ('casualty.ats', 'casualty.mts');
select t.ok(k.owner_kind = 'organization' and k.form = 'pack' and k.shape -> 'properties' -> 'scale' ->> 'default' = 'ats',
  'casualty.scale: the clinic''s, on the pack''s page, Australasian by default') from core.setting_keys k where k.key = 'casualty.scale';
select t.ok(s.work = 'stays' and s.action = 'read:queue' and s.replaces = '{}', 'casualty.patients: a screen of stays, for whoever reads the queue, replacing nothing')
  from core.screens s where s.key = 'casualty.patients';
select t.ok(s.work = 'stays' and s.packs = array['casualty'] and jsonb_array_length(s.places) = 8
  and (select count(*) from jsonb_array_elements(s.places) p where p ->> 'label' = 'bed') = 2 and (select count(*) from jsonb_array_elements(s.places) p where p ->> 'label' = 'cubicle') = 6
  and s.settings -> 'department.encounter_class' ->> 'class' = 'EMER' and s.screens = '{"screens":["base.beds","casualty.patients"],"opens":"base.beds"}'::jsonb,
  'casualty.er: stays, ticks casualty, two resus beds and six cubicles, emergency encounters, the board then Patients') from core.setups s where s.key = 'casualty.er';
select t.ok(o.action = 'read:record' and o.patients, 'casualty.board: read as the record is, naming patients') from core.ops o where o.key = 'casualty.board';
select t.ok(core.department_uses(:'org', :'er', 'casualty') and (select count(*) from core.places p where p.department_id = :'er' and p.retired_at is null) = 8
  and core.setting_at(:'org', 'department.encounter_class', :'er') ->> 'class' = 'EMER' and core.setting_at(:'org', 'department.setup', :'er') ->> 'setup' = 'casualty.er',
  'the Emergency made from it uses the pack, has its eight places, is EMER, and keeps its setup');

set role authenticated;
select t.as(:'rc');
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p2', 'given', jsonb_build_array('Mona'),
  'family', 'Adly', 'gender', 'female', 'birth_date', '1990-02-11'))) is not null as registered;
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'kid', 'given', jsonb_build_array('Omar'),
  'family', 'Tamer', 'gender', 'male', 'birth_date', (current_date - interval '8 years')::date::text))) is not null as registered;

\echo '── the triage nurse: an unknown patient, Arrived, the triage set'
select t.as(:'tn');
select t.ok((public.save_patient(jsonb_build_object('department_id', :'er', 'patient', jsonb_build_object('id', :'unk', 'anonymous', true, 'full_name', 'Unknown man',
  'gender', 'male', 'birth_date', '1985-01-01', 'birth_precision', 'year', 'birth_estimated', true))) ->> 'created')::boolean, 'an unknown man registered in Emergency');
select t.ok(public.read('{"shape":"patients","q":"Unknown"}') -> 'patients' @> jsonb_build_array(jsonb_build_object('id', :'unk')), 'found as "Unknown"');
select t.landed(t.w(t.e('admitted', :'pt', :'er', '{"admit_source":"other","reason":"road accident"}', :'s1', :'s1')), 'Arrived: the base''s admitted, no place');
select t.ok(count(*) = 1 and bool_and(r ->> 'kind' = 'stay' and r ->> 'place_id' is null and r ->> 'department_id' = :'er'), 'a stay in Emergency, on the chairs')
  from t.rows('base.presence', :'er', jsonb_build_object('item', :'s1')) r;
select t.landed(t.w(jsonb_build_array(
  t.e('vitals', :'pt', :'er', '{"bp":{"sys":{"value":"96","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"60","unit":"mmHg","ucum":"mm[Hg]"}},"hr":{"value":"124","unit":"bpm","ucum":"/min"},"rr":{"value":"28","unit":"/min","ucum":"/min"},"temp":{"value":"36.8","unit":"°C","ucum":"Cel"},"spo2":{"value":"92","unit":"%","ucum":"%"},"consciousness":"a","oxygen":{"on":"air"}}',
    :'v1', :'s1'),
  t.e('casualty.triage', :'pt', :'er', pg_temp.tri(2, 'ats', '{"arrival":"ambulance","arrival_ref":"4471","complaint":"injury_road","danger":["severe_pain"],"suggested":{"level":2,"signs":["rr","severe_pain"]}}',
    'motorbike vs microbus'), :'tr1', :'s1'),
  t.e('urgent', :'pt', :'er', '{"urgent":true}', :'u1', :'s1', :'s1', 'changes'),
  t.e('moved', :'pt', :'er', jsonb_build_object('place_id', :'r1'), :'m1', :'s1', :'u1', 'changes'))), 'the triage set: vitals, level 2, urgent, to Resus 1');
select t.ok(count(*) = 1 and bool_and((r ->> 'urgent')::boolean and r ->> 'place_id' = :'r1' and (r ->> 'has_vitals')::boolean), 'the stay: urgent, in Resus 1, with vitals')
  from t.rows('base.presence', :'er', jsonb_build_object('item', :'s1')) r;
select t.ok(t.entry(t.record(:'pt', :'er'), :'tr1') ->> 'line' = 'Triage 2 · Very urgent · motorbike vs microbus', 'its line: Triage 2 · Very urgent · motorbike vs microbus');

\echo '── retriage is a new entry; Arrived and triage in one Done'
select t.landed(t.w(jsonb_build_array(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(3), :'tr2', :'s1'),
  t.e('urgent', :'pt', :'er', '{"urgent":false}', null, :'s1', :'m1', 'changes'))), 'a retriage to 3, no longer urgent');
select t.ok(count(*) = 1 and not bool_and((r ->> 'urgent')::boolean), 'the stay is not urgent') from t.rows('base.presence', :'er', jsonb_build_object('item', :'s1')) r;
reset role;
select t.ok(count(distinct item) = 2, 'two triage items in the stay') from core.entries where visit_id = :'s1' and type = 'casualty.triage';
set role authenticated;
select t.landed(t.w(jsonb_build_array(
  t.e('admitted', :'unk', :'er', jsonb_build_object('admit_source', 'other', 'place_id', :'r2'), :'s4', :'s4'),
  t.e('casualty.triage', :'unk', :'er', pg_temp.tri(1), null, :'s4'),
  t.e('urgent', :'unk', :'er', '{"urgent":true}', null, :'s4', :'s4', 'changes'))), 'Arrived and a level-1 triage in one Done, straight to Resus 2');
select t.ok(count(*) = 1 and bool_and((r ->> 'urgent')::boolean and r ->> 'place_id' = :'r2'), 'the unknown man: in Resus 2, urgent')
  from t.rows('base.presence', :'er', jsonb_build_object('item', :'s4')) r;

\echo '── refused'
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(2, p_code => '3'), null, :'s1')), 'triage_mismatch', 'level 2 coded 3');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(2, p_system => 'casualty.mts'), null, :'s1')), 'triage_mismatch', 'the Australasian scale coded as Manchester');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', jsonb_set(pg_temp.tri(1), '{value,concept,text}', '"5 · Non-urgent"'), null, :'s1')), 'triage_mismatch',
  'level 1 in its code, 5 in its words');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', jsonb_set(pg_temp.tri(1), '{value,concept,codings}', pg_temp.tri(1) -> 'value' -> 'concept' -> 'codings'
  || jsonb_build_array(jsonb_build_object('system', 'casualty.ats', 'code', '5', 'display', 'Non-urgent'))), null, :'s1')), 'triage_mismatch', 'two codings, two levels');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', jsonb_set(pg_temp.tri(2), '{code,text}', '"Triage level (Manchester scale)"'), null, :'s1')), 'triage_mismatch',
  'the Australasian scale named Manchester');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(2))), 'not_in_stay', 'no stay');
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'p2', :'ward', jsonb_build_object('department_id', :'ward', 'admit_source', 'other', 'reason', 'observation'), :'s2', :'s2')), 'Mona admitted to the ward, no bed');
select t.as(:'tn');
select t.refused(t.w(t.e('casualty.triage', :'p2', :'er', pg_temp.tri(3), null, :'s2')), 'not_in_stay', 'a stay on the ward');
select t.as(:'dr');
select t.refused(t.w(jsonb_build_array(
  t.e('admitted', :'kid', :'ward', jsonb_build_object('department_id', :'ward', 'admit_source', 'other'), '00000000-0000-0000-0000-00000000e205', '00000000-0000-0000-0000-00000000e205'),
  t.e('casualty.triage', :'kid', :'er', pg_temp.tri(3), null, '00000000-0000-0000-0000-00000000e205'))), 'not_in_stay', 'opened in the same Done, but on the ward');
select t.as(:'tn');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(6), null, :'s1')), 'bad_shape', 'level 6');
select t.as(:'rc');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(3), null, :'s1')), 'not_allowed', 'reception does not triage');
select t.as(:'dr');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'im', pg_temp.tri(3))), 'not_allowed', 'Internal Medicine does not use Emergency');

\echo '── everyday: the base''s Nurse in Emergency triages; a child is triaged as the nurse chooses'
select t.as(:'nurse');
select t.landed(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(3), null, :'s1')), 'Nurse Sara retriages Ahmed: 3, no urgent entry');
select t.as(:'tn');
select t.landed(t.w(t.e('admitted', :'kid', :'er', '{"admit_source":"other","reason":"fall"}', :'s3', :'s3')), 'Omar, eight, arrives');
select t.landed(t.w(t.e('casualty.triage', :'kid', :'er', pg_temp.tri(3, 'ats', '{"complaint":"fall"}'), null, :'s3')), 'a level-3 triage with no suggestion lands');

\echo '── the board''s read: each stay''s latest triage, and when a doctor first wrote in it'
create function pg_temp.board(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'casualty.board', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;
select t.as(:'dr');
select t.ok((b -> 'stays' -> :'s1' -> 'triage' ->> 'level')::int = 3 and b -> 'stays' -> :'s1' -> 'triage' ->> 'scale' = 'ats' and b -> 'stays' -> :'s1' -> 'triage' ? 'at'
  and not (b -> 'stays' -> :'s1' ? 'seen_at') and b -> 'patient_ids' @> jsonb_build_array(:'pt', :'unk', :'kid')
  and not (b -> 'patient_ids' @> jsonb_build_array(:'p2')) and not (b -> 'stays' ? :'s2'),
  'Ahmed''s stay: level 3 (Sara''s retriage is the latest), not seen; the three patients named, never the ward''s') from (select pg_temp.board(:'er') b) x;
select t.landed(t.w(t.e('assigned', :'pt', :'er', '{"user_id":"00000000-0000-0000-0000-0000000000b1"}', null, :'s1', t.latest(:'s1'), 'changes')), 'Dr Ali takes Ahmed');
reset role;
select max(occurred_at) as took from core.entries where visit_id = :'s1' and type = 'assigned' \gset
set role authenticated;
select t.ok((b -> 'stays' -> :'s1' ->> 'seen_at')::timestamptz = :'took'::timestamptz, 'seen from the Take') from (select pg_temp.board(:'er') b) x;
select t.as(:'nurse');
select t.landed(t.w(t.e('note', :'kid', :'er', '{"kind":"progress","text":"settled, mother with him"}', null, :'s3')), 'a nurse''s note in Omar''s stay');
select t.as(:'dr');
select t.ok(not (b -> 'stays' -> :'s3' ? 'seen_at') and b -> 'stays' -> :'s3' ? 'triage', 'a nurse''s note does not make it seen') from (select pg_temp.board(:'er') b) x;
select t.landed(t.w(t.e('note', :'kid', :'er', '{"kind":"progress","text":"chest clear"}', '00000000-0000-0000-0000-00000000e251', :'s3')), 'Dr Ali writes in Omar''s stay by mistake');
select t.ok(b -> 'stays' -> :'s3' ? 'seen_at', 'his note makes it seen') from (select pg_temp.board(:'er') b) x;
select t.landed(t.w(t.e('crossed_out', :'kid', :'er', '{"reason":"wrong_patient"}', null, :'s3', null, null, '00000000-0000-0000-0000-00000000e251')), 'and crosses it out');
select t.ok(not (b -> 'stays' -> :'s3' ? 'seen_at'), 'a doctor''s crossed-out note does not make it seen') from (select pg_temp.board(:'er') b) x;
reset role;
select t.ok(count(*) = 1 and bool_and((data -> 'casualty' ->> 'level')::int = 3 and not (data -> 'casualty' ? 'suggested')),
  'Omar''s triage: level 3 as the nurse chose, no suggestion kept') from core.entries where visit_id = :'s3' and type = 'casualty.triage';
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'casualty.board'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;
select t.refuses(format($q$select pg_temp.board(%L)$q$, :'im'), 'not_used_here');
select t.as(:'rc');
select t.refuses(format($q$select pg_temp.board(%L)$q$, :'er'), 'not_allowed');

\echo '── the export: the base''s Observation, coded on the scale; the stay an emergency Encounter'
select t.as(:'dr');
create temp table res as select e -> 'resource' r
  from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'er')) -> 'entry') e;
reset role;
select t.ok(r -> 'code' ->> 'text' = 'Triage level (Australasian scale)' and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'system' like '%/CodeSystem/triage-ats'
  and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'code' = '2' and r -> 'encounter' ->> 'reference' = 'Encounter/' || :'s1',
  'the triage: an Observation, its level coded on the Australasian scale, in the stay') from res where r ->> 'resourceType' = 'Observation' and r ->> 'id' = :'tr1';
select t.ok(r -> 'class' ->> 'code' = 'EMER', 'the stay: an emergency Encounter') from res where r ->> 'resourceType' = 'Encounter' and r ->> 'id' = :'s1';
select t.ok(not exists (select 1 from res, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle'), 'no resource has a problem');
set role authenticated;

\echo '── Where to: the decision, the leaving, one Done to a ward, the free beds'
reset role;
select t.ok(y.layer = 'casualty' and y.base_type is null and y.resources = '{}' and y.in_record and y.line = 'casualty.disposition_line(jsonb)'::regprocedure
  and y.checks = array['casualty.disposition_check(jsonb,jsonb)']::regprocedure[],
  'casualty.disposition v1: the pack''s own, no base type, nothing exported, in the record, its line and its check')
  from core.types y where y.key = 'casualty.disposition' and y.version = 1;
select t.ok(a.layer = 'casualty' and a.scope = 'department' and a.everyday, 'write:casualty.disposition: the pack''s, per department, everyday')
  from core.actions a where a.key = 'write:casualty.disposition';
select t.ok(o.action = 'read:queue' and not o.patients, 'casualty.beds: read as the queue is, naming no patient') from core.ops o where o.key = 'casualty.beds';
select t.ok(y.shape #> '{properties,casualty,properties,police}' is not null, 'the triage asks police case') from core.types y where y.key = 'casualty.triage' and y.version = 1;
select t.ok(array_agg(casualty.disposition_line(jsonb_build_object('organization_id', :'org', 'data', d)) order by n) = array['Where to: home',
    'Where to: the operating room, then Ward · police report 2214/2026', 'Where to: Al Salam Hospital', 'Left before being seen',
    'Left against advice · signed by his brother Ahmed', 'Died in the ER', 'Brought in dead'],
  'the decision''s lines: home, the operating room then a ward with the report number, a facility, left unseen, against advice, died, brought in dead')
  from jsonb_array_elements(jsonb_build_array('{"to":"home"}'::jsonb, jsonb_build_object('to', 'operating_room', 'department_id', :'ward', 'police_report', '2214/2026'),
    '{"to":"other_facility","facility":"Al Salam Hospital"}'::jsonb, '{"to":"left_unseen"}'::jsonb, '{"to":"against_advice","signed_by":"his brother Ahmed"}'::jsonb,
    '{"to":"died","brought_in_dead":false}'::jsonb, '{"to":"died","brought_in_dead":true}'::jsonb)) with ordinality x(d, n);
select t.as(:'ow');
select public.save('department', jsonb_build_object('id', :'er2', 'name', 'Emergency 2', 'work', 'stays')) ->> 'id' as er2;
select public.write_setting(jsonb_build_object('key', 'department.encounter_class', 'owner_id', :'er2', 'data', '{"class":"EMER"}'::jsonb)) ->> 'key' as er2_emer;
set role authenticated;
select t.as(:'rc');
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', x.id, 'given', jsonb_build_array(x.given),
  'family', x.family, 'gender', x.gender, 'birth_date', x.born))) is not null as registered
  from (values (:'p4'::uuid, 'Samy', 'Fahmy', 'male', '1960-03-03'), (:'p5'::uuid, 'Rasha', 'Nour', 'female', '1992-07-07'),
               (:'p6'::uuid, 'Lotfy', 'Amin', 'male', '1948-09-09'), (:'p7'::uuid, 'Hala', 'Sami', 'female', '1999-01-15')) x(id, given, family, gender, born);
select t.as(:'tn');
select t.landed(t.w(t.e('admitted', x.p, :'er', '{"admit_source":"other","reason":"breathless"}', x.s, x.s)), 'arrived: ' || x.s)
  from (values (:'p4'::uuid, :'s5'::uuid), (:'p5'::uuid, :'s6'::uuid), (:'p6'::uuid, :'s7'::uuid), (:'p7'::uuid, :'s8'::uuid)) x(p, s);

select t.as(:'dr');
select t.as(:'tn');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"home"}', null, :'s5')), 'not_allowed', 'the triage nurse may not decide where a patient goes');
select t.as(:'dr');
select t.landed(t.w(t.e('casualty.disposition', :'p4', :'er', jsonb_build_object('to', 'ward', 'department_id', :'ward'), :'d1', :'s5')), 'Samy: decided for the ward');
select t.ok(t.entry(t.record(:'p4', :'er'), :'d1') ->> 'line' = 'Where to: admit to Ward', 'its line: Where to: admit to Ward');
select t.ok(b -> 'stays' -> :'s5' -> 'decided' ->> 'to' = 'ward' and b -> 'stays' -> :'s5' -> 'decided' ->> 'department_id' = :'ward'
  and b -> 'stays' -> :'s5' -> 'decided' ->> 'entry' = :'d1' and b -> 'stays' -> :'s5' -> 'decided' ? 'at', 'the board reads the decision: to the ward, its entry, when')
  from (select pg_temp.board(:'er') b) x;
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"ward"}', null, :'s5')), 'unknown_destination', 'an admission with no department');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', jsonb_build_object('to', 'ward', 'department_id', :'er'), null, :'s5')), 'unknown_destination', 'to the ER itself');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', jsonb_build_object('to', 'ward', 'department_id', :'desk'), null, :'s5')), 'unknown_destination', 'to the front desk');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', jsonb_build_object('to', 'icu', 'department_id', :'er2'), null, :'s5')), 'unknown_destination',
  'to another department of stays whose encounters are EMER');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', jsonb_build_object('to', 'home', 'department_id', :'ward'), null, :'s5')), 'unknown_destination',
  'home, naming a department');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"other_facility","facility":" "}', null, :'s5')), 'facility_missing', 'another facility, unnamed');
select t.refused(t.w(t.e('casualty.disposition', :'p2', :'er', '{"to":"home"}', null, :'s2')), 'not_in_stay', 'a stay on the ward');
select t.landed(t.w(t.e('note', :'p4', :'er', '{"kind":"progress","text":"nebulised"}', :'n5', :'s5')), 'a note in Samy''s stay');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"home"}', null, :'s5', :'n5', 'changes')), 'wrong_target', 'a decision that changes a note');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"home"}', null, :'s5')), 'wrong_target', 'a second decision in the stay, not changing the standing one');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"died"}', null, :'s5')), 'not_leaving', 'died, with no leaving in the same Done');
select t.refused(t.w(t.e('casualty.disposition', :'p4', :'er', '{"to":"left_unseen"}', null, :'s5')), 'not_leaving', 'left before being seen, alone');
select t.landed(t.w(t.e('casualty.disposition', :'p4', :'er', jsonb_build_object('to', 'ward', 'department_id', :'ward', 'police_report', '2214/2026'), :'d2', :'s5',
  :'d1', 'changes')), 'the decision changed: the police report number has come');
select t.ok(b -> 'stays' -> :'s5' -> 'decided' ->> 'police_report' = '2214/2026' and b -> 'stays' -> :'s5' -> 'decided' ->> 'entry' = :'d2',
  'the board reads the standing decision, with its report number') from (select pg_temp.board(:'er') b) x;
select t.ok((b -> 'stays' -> :'s5' -> 'decided' ->> 'at')::timestamptz = (t.entry(t.record(:'p4', :'er'), :'d1') ->> 'occurred_at')::timestamptz
  and (t.entry(t.record(:'p4', :'er'), :'d1') ->> 'occurred_at')::timestamptz < (t.entry(t.record(:'p4', :'er'), :'d2') ->> 'occurred_at')::timestamptz,
  'a report number added keeps when it was decided (boarding does not restart)') from (select pg_temp.board(:'er') b) x;
select t.ok(t.entry(t.record(:'p4', :'er'), :'d2') ->> 'line' = 'Where to: admit to Ward · police report 2214/2026', 'its line names the report');

select t.landed(t.w(jsonb_build_array(
  t.e('discharged', :'p4', :'er', '{"disposition":"oth","note":"to Ward"}', null, :'s5', t.latest(:'s5'), 'changes'),
  t.e('admitted', :'p4', :'er', jsonb_build_object('department_id', :'ward', 'place_id', '00000000-0000-0000-0000-000000000001', 'admit_source', 'emd', 'reason', 'COPD exacerbation'), :'a5', :'a5', :'s5', 'about'),
  t.e('note', :'p4', :'er', '{"kind":"emergency","text":"For the ward: nebulisers every four hours."}', :'note5', :'a5'))),
  'the leaving, one Done: the ER''s discharge, the ward''s stay about it, the ER''s note in it');
select t.ok(count(*) = 2 and bool_and(coalesce(case r ->> 'item'
    when :'s5' then r ->> 'state' = 'discharged'
    when :'a5' then r ->> 'state' = 'admitted' and r ->> 'department_id' = :'ward' and r ->> 'came_from' = :'s5' and r ->> 'place_id' = '00000000-0000-0000-0000-000000000001' end, false)),
  'the ER stay discharged; the ward stay admitted, from it, in Bed 1')
  from t.rows('base.presence', :'ward', jsonb_build_object('patient_id', :'p4')) r;
select t.ok(t.entry(t.record(:'p4', :'ward'), :'note5') ->> 'visit_id' = :'a5', 'the ER''s note is in the ward''s stay');
select t.landed(t.w(jsonb_build_array(t.e('casualty.disposition', :'p5', :'er', '{"to":"home"}', null, :'s6'),
  t.e('discharged', :'p5', :'er', '{"disposition":"home"}', null, :'s6', t.latest(:'s6'), 'changes'))), 'Rasha: home, in one Done');
select t.ok(count(*) = 1 and bool_and(r ->> 'state' = 'discharged'), 'her stay is discharged') from t.rows('base.presence', :'er', jsonb_build_object('item', :'s6')) r;
select t.landed(t.w(jsonb_build_array(t.e('casualty.disposition', :'p6', :'er', '{"to":"died","brought_in_dead":false}', null, :'s7'),
  t.e('died', :'p6', :'er', '{"cause":{"text":"cardiac arrest"}}', null, :'s7'),
  t.e('discharged', :'p6', :'er', '{"disposition":"exp"}', null, :'s7', t.latest(:'s7'), 'changes'))), 'Lotfy died in the ER: the decision, died, discharged');
reset role;
select t.ok(exists (select 1 from base.deceased d where d.patient_id = :'p6'), 'he is deceased');
select t.ok(state = 'discharged', 'his stay is discharged') from base.presence where item = :'s7';
set role authenticated;
select t.as(:'tn');
select t.refused(t.w(jsonb_build_array(t.e('casualty.disposition', :'p7', :'er', '{"to":"left_unseen"}', null, :'s8'),
  t.e('discharged', :'p7', :'er', '{"disposition":"oth","note":"left before being seen"}', null, :'s8', t.latest(:'s8'), 'changes'))), 'not_allowed',
  'the triage nurse may not record a leaving');
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(t.e('casualty.disposition', :'p7', :'er', '{"to":"left_unseen"}', null, :'s8'),
  t.e('discharged', :'p7', :'er', '{"disposition":"oth","note":"left before being seen"}', null, :'s8', t.latest(:'s8'), 'changes'))), 'the doctor does: left before being seen');

create function pg_temp.beds() returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'casualty.beds', 'department_id', '00000000-0000-0000-0000-0000000000d7',
    'args', jsonb_build_object('departments', jsonb_build_array('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000d7',
      '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d8'))))
$$;
select t.ok(jsonb_array_length(b -> 'departments') = 1 and b -> 'departments' -> 0 ->> 'id' = :'ward'
  and (select array_agg(f ->> 'name' order by n) from jsonb_array_elements(b -> 'departments' -> 0 -> 'free') with ordinality f(f, n)) = array['Bed 2', 'Bed 3', 'Bed 4'],
  'the free beds: the ward alone (never the ER, a clinic, the desk or another EMER), in order; a bed an admitted stay holds is not free') from (select pg_temp.beds() b) x;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'place.closed', 'owner_id', :'bed4', 'data', '{"closed":true,"reason":"cleaning"}'::jsonb)) ->> 'key' as closed;
select t.as(:'dr');
select t.ok((select array_agg(f ->> 'name' order by n) from jsonb_array_elements(b -> 'departments' -> 0 -> 'free') with ordinality f(f, n)) = array['Bed 2', 'Bed 3'],
  'a closed bed is not free') from (select pg_temp.beds() b) x;
select t.ok(jsonb_array_length(public.pack_op(jsonb_build_object('op', 'casualty.beds', 'department_id', :'er',
    'args', '{"departments":["------------------------------------","00000000-0000-0000-0000-0000000000d6x"]}'::jsonb)) -> 'departments') = 0
  and jsonb_array_length(public.pack_op(jsonb_build_object('op', 'casualty.beds', 'department_id', :'er', 'args', '{"departments":"x"}'::jsonb)) -> 'departments') = 0,
  'ids that are not ids, or no list, are passed over');
select t.as(:'rc');
select t.refuses('select pg_temp.beds()', 'not_allowed');

select t.as(:'tn');
select t.landed(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(3, 'ats', '{"police":{"case":true,"why":"assault"}}'), null, :'s1')), 'a retriage: a police case, an assault');
select t.as(:'dr');
select t.ok((b -> 'stays' -> :'s1' ->> 'police')::boolean and not (b -> 'stays' -> :'s4' ? 'police'), 'the board: Ahmed a police case; the unknown man unanswered')
  from (select pg_temp.board(:'er') b) x;

\echo '── the clinic''s scale'
select t.as(:'ow');
select t.ok(public.write_setting('{"key":"casualty.scale","data":{"scale":"mts"}}') ->> 'key' = 'casualty.scale', 'the owner chooses the Manchester scale');
reset role;
select t.ok((select version from core.systems where key = 'casualty.ats') = 'P06' and (select version from core.systems where key = 'casualty.mts') = '3',
  'the scales'' versions are those the client writes: P06 and 3');
set role authenticated;
select t.refuses($$select public.write_setting('{"key":"casualty.scale","data":{"scale":"esi"}}')$$, 'bad_shape');
select t.as(:'tn');
select t.landed(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(4, 'mts'), null, :'s1')), 'a triage on the Manchester scale lands');

\echo '── the clinic turns the pack off: a triage is refused, plain vitals still land'
select t.as(:'ow');
reset role;
select ((select s.data -> 'packs' from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) - 'casualty')::text as packs_off \gset
set role authenticated;
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs', :'packs_off'::jsonb))) ->> 'key' as off;
select t.as(:'tn');
select t.refused(t.w(t.e('casualty.triage', :'pt', :'er', pg_temp.tri(3), null, :'s1')), 'pack_off', 'the clinic no longer uses Emergency');
select t.landed(t.w(t.e('vitals', :'pt', :'er', '{"hr":{"value":"90","unit":"bpm","ucum":"/min"}}', null, :'s1')), 'a plain vitals entry still lands');
select t.as(null);
