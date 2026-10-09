-- the anaesthesia pack (spec §5.7): the pre-op (the anaesthetist's; ASA a class, not a score); RCRI, STOP-BANG and Aldrete as declared
-- tables the server adds up (rule 8); the record's column (the base's vitals extended), each dose the base's given, the record about the
-- operation; recovery's bays (the nurse admits and discharges) and its table of Aldrete and pain from the base's score and vitals (a
-- listener); off, no new pre-op
\set pre  '00000000-0000-0000-0000-0000000000e5'
\set rec  '00000000-0000-0000-0000-0000000000e6'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set an   '11111111-0000-0000-0000-0000000000e5'
\set rn   '11111111-0000-0000-0000-0000000000e6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["anaesthesia"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'anaesthesia.preop_clinic', 'department_id', :'pre', 'name', 'Pre-op clinic', 'apply', true)) is not null as preop;
select public.setup(jsonb_build_object('setup', 'anaesthesia.recovery', 'department_id', :'rec', 'name', 'Recovery', 'apply', true)) is not null as recovery;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e5', 'name', 'Dr Sherine', 'login_id', :'an', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000eb01', 'department_id', :'pre'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000eb01', 'department_id', :'rec')))) ->> 'id' as anaesthetist;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e6', 'name', 'Rehab', 'login_id', :'rn', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000eb02', 'department_id', :'rec')))) ->> 'id' as nurse;
select core.setup_id(:'rec', 'place', 'bay_1') as bay1 \gset
set role authenticated;

\echo '── the pre-op: the anaesthetist''s; ASA a class from I to VI'
select t.as(:'an');
select t.landed(t.w(t.e('anaesthesia.preop', :'pt', :'pre', '{"operation":"Inguinal hernia repair, left","asa":"III","airway":{"mallampati":"III","neck_cm":43},"plan":"spinal","verdict":"fit","stop":[{"medicine":"Empagliflozin 10 mg","what":"stop 3 days before","days":3}]}')),
  'ASA III, Mallampati III, spinal, fit');
select t.refused(t.w(t.e('anaesthesia.preop', :'pt', :'pre', '{"asa":"VII","verdict":"fit"}')), 'bad_shape', 'ASA VII is no class');

\echo '── the scores (rule 8): the server adds them up'
reset role;
select t.ok((core.score('anaesthesia.rcri', '1999', '{"high_risk":false,"ihd":true,"hf":false,"cvd":false,"insulin":false,"creat":false}') ->> 'total')::int = 1, 'RCRI 1 (class II)');
select t.ok(core.score('anaesthesia.stopbang', '2008', '{"snore":true,"tired":false,"observed":false,"pressure":true,"bmi":false,"age":true,"neck":true,"male":true}') -> 'band' ->> 'key' = 'high', 'STOP-BANG 5: high risk');
select t.ok(core.score('anaesthesia.aldrete', '1995', '{"activity":"2","breathing":"2","circulation":"2","conscious":"2","spo2":"1"}') -> 'band' ->> 'key' = 'ready', 'Aldrete 9: ready for the ward');
set role authenticated;

\echo '── recovery: into a bay, Aldrete and pain kept for the bay''s line (a listener on the base''s score and vitals)'
select t.as(:'rn');
select t.landed(t.w(t.e('admitted', :'pt', :'rec', jsonb_build_object('department_id', :'rec', 'admit_source', 'other', 'place_id', :'bay1'),
  '00000000-0000-0000-0000-00000000b611', '00000000-0000-0000-0000-00000000b611')), 'into Bay 1');
select t.landed(t.w(jsonb_build_array(t.e('score', :'pt', :'rec', jsonb_build_object('score', 'anaesthesia.aldrete', 'version', '1995',
  'inputs', '{"activity":"2","breathing":"2","circulation":"2","conscious":"1","spo2":"1"}'::jsonb, 'total', 8, 'band', 'not_yet'), null, '00000000-0000-0000-0000-00000000b611'),
  t.e('vitals', :'pt', :'rec', '{"pain":{"value":"2","unit":"/10","ucum":"{score}"}}', null, '00000000-0000-0000-0000-00000000b611'))), 'Aldrete 8, pain 2');
reset role;
select core.drain() as drained;
set role authenticated;
select t.ok((select string_agg(r ->> 'kind' || ' ' || (r ->> 'value')::numeric::int, ', ' order by r ->> 'kind') from t.rows('anaesthesia.recovery', :'rec', jsonb_build_object('patient_id', :'pt')) r) = 'aldrete 8, pain 2',
  'recovery''s table: Aldrete 8, pain 2');
select t.landed(t.w(t.move('discharged', '00000000-0000-0000-0000-00000000b611', :'rec', '{"disposition":"home"}')), 'home from recovery (a day case)');

\echo '── the record: a column (the base''s vitals extended), a dose given, the record about the operation'
select t.as(:'an');
select t.landed(t.w(jsonb_build_array(
  t.e('anaesthesia.column', :'pt', :'rec', '{"hr":{"value":"84","unit":"bpm","ucum":"/min"},"anaesthesia":{"etco2":35,"agent":"sevoflurane","agent_pct":2.0,"fio2":0.5}}'),
  t.e('given', :'pt', :'rec', '{"drug":{"text":"Propofol","codings":[]},"dose":{"value":"150","unit":"mg","ucum":"mg"},"route":"iv","status":"completed"}'),
  t.e('anaesthesia.record', :'pt', :'rec', '{"operation":"Laparoscopic cholecystectomy","technique":"general, tube","times":{"start":"08:38","knife":"08:55","end":"09:40"},"events":[{"at":"08:41","text":"induction"}]}'))),
  'one set: a column, a dose, the record');
select t.refused(t.w(t.e('anaesthesia.column', :'pt', :'rec', '{"anaesthesia":{"etco2":"high"}}')), 'bad_shape', 'EtCO₂ a number');

\echo '── its people; off, no new pre-op'
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000e5', 'write:anaesthesia.record', :'rec') and core.may('00000000-0000-0000-0000-0000000000e5', 'write:result', :'rec'), 'the anaesthetist is built on Doctor');
select t.ok(core.may('00000000-0000-0000-0000-0000000000e6', 'write:admitted', :'rec') and not core.may('00000000-0000-0000-0000-0000000000e6', 'write:anaesthesia.preop', :'rec'), 'recovery''s nurse admits, writes no pre-op');
set role authenticated;
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'an');
select t.refused(t.w(t.e('anaesthesia.preop', :'pt', :'pre', '{"asa":"II","verdict":"fit"}')), 'pack_off', 'anaesthesia off');
