-- the haemato pack (spec §5.7) and the Blood bank on the laboratory pack: the INR clinic's own types (the plan, the week) beside the
-- base's INR result with no order; the transfusion programme; its actions everyday where the pack is ticked, refused elsewhere; the clinic's
-- dosing table as a setting; the Blood bank from its setup (the products, their steps, the result that issues the units), /blood's order
-- carrying the Blood bank's words (written with write:order from any department), refused when its words are not the Blood bank's
\set im   '00000000-0000-0000-0000-0000000000d1'
\set hc   '00000000-0000-0000-0000-0000000000e7'
\set bb   '00000000-0000-0000-0000-0000000000e8'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set ola  '11111111-0000-0000-0000-0000000000e7'
\set bt   '11111111-0000-0000-0000-0000000000e8'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["haemato","lis"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'haemato.clinic', 'department_id', :'hc', 'name', 'Haematology clinic', 'apply', true)) is not null as made;
select public.setup(jsonb_build_object('setup', 'lis.blood_bank', 'department_id', :'bb', 'name', 'Blood bank', 'apply', true)) is not null as made;
reset role;
select core.setup_id(:'bb', 'service', 'rbc') as rbc_svc \gset
set role authenticated;
select t.as(:'ow');
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e7', 'name', 'Dr Ola', 'login_id', :'ola', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e701', 'department_id', :'hc')))) ->> 'id' as haematologist;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e8', 'name', 'Blood bank tech', 'login_id', :'bt', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cf01', 'department_id', :'bb')))) ->> 'id' as tech;

\echo '── the INR clinic: the plan, the base''s INR with no order, the week; its actions only where the pack is ticked'
select t.as(:'ola');
select t.landed(t.w(t.e('haemato.plan', :'pt', :'hc', '{"reason":"AF with rheumatic mitral stenosis","target":{"low":2,"high":3},"medicine":"warfarin","tablet_mg":5,"status":"active"}')), 'the plan');
select t.landed(t.w(jsonb_build_array(t.e('result', :'pt', :'hc', '{"status":"final","code":{"text":"INR · finger prick","codings":[{"system":"loinc","code":"6301-6"}]},
    "analytes":[{"key":"inr","name":"INR","code":{"system":"loinc","code":"6301-6"},"value":{"value":"1.7"},"interpretation":"L","range":{"low":{"value":"2"},"high":{"value":"3"}}}]}'),
  t.e('haemato.week', :'pt', :'hc', '{"days":[5,5,5,5,5,2.5,5],"was":30,"inr":1.7,"missed":"none","food":"more greens","bleeding":"none","suggested":32.5,"used_suggestion":true,"next_inr":"2026-10-15"}'))),
  'today''s INR and the new week, one set');
select t.refused(t.w(t.e('haemato.week', :'pt', :'hc', '{"days":[5,5,5,5,5,5]}')), 'bad_shape', 'a week has seven days');
reset role;
select t.ok((select v.value from base.values v where v.patient_id = :'pt'::uuid and v.code = 'loinc:6301-6' order by v.at desc limit 1) = 1.7, 'the INR a value');
set role authenticated;
select t.as(:'ola');
select t.as(:'dr');
select t.refused(t.w(t.e('haemato.week', :'pt', :'im', '{"days":[5,5,5,5,5,2.5,5]}')), 'not_allowed', 'Internal Medicine does not tick the pack');
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000e7', 'write:haemato.week', :'hc') and core.may('00000000-0000-0000-0000-0000000000e7', 'write:result', :'hc'),
  'the haematologist: the week, and the result (built on Doctor)');
select t.ok(exists (select 1 from core.codes where system = 'icd10' and code = 'D56.1') and exists (select 1 from core.codes where system = 'atc' and code = 'V03AC03'), 'thalassaemia major and deferasirox known');
select t.ok(jsonb_array_length((select k.shape -> 'properties' -> 'table' -> 'default' from core.setting_keys k where k.key = 'haemato.inr')) = 6, 'the dosing table: six bands to start');
set role authenticated;

\echo '── the programme: every 3 weeks, the Hb before, what the red cells need'
select t.as(:'ola');
select t.landed(t.w(t.e('haemato.programme', :'pt', :'hc', '{"condition":"β-thalassaemia major","every_weeks":3,"hb":{"low":9.5,"high":10.5},"needs":["leucodepleted","Rh and Kell matched"],"status":"active"}')), 'a programme');
select t.refused(t.w(t.e('haemato.programme', :'pt', :'hc', '{"every_weeks":3,"hb":{"low":9.5,"high":10.5},"needs":["fresh"]}')), 'bad_shape', 'what red cells need, from the list');

\echo '── the Blood bank: /blood from Internal Medicine (the pack not ticked there), its words on the order; its steps; the units issued as its result'
select t.as(:'dr');
select t.landed(t.w(t.e('lis.blood', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'rbc_svc', 'code', 'rbc', 'name', 'Red cells'),
  'department_id', :'bb', 'priority', 'urgent', 'status', 'active', 'question', 'melaena, Hb 6.8',
  'lis', '{"product":"rbc","needs":["leucodepleted"],"units":2,"why":"bleeding","consent":"signed today","sample":"taken here"}'::jsonb), '00000000-0000-0000-0000-00000000e8b1')), 'red cells × 2, urgent');
select t.refused(t.w(t.e('lis.blood', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'rbc_svc', 'code', 'rbc', 'name', 'Red cells'),
  'department_id', :'bb', 'priority', 'routine', 'status', 'active', 'lis', '{"product":"whole blood","units":2}'::jsonb))), 'bad_shape', 'a product of the Blood bank''s');
select t.as(:'bt');
select t.ok(exists (select 1 from t.rows('base.orders', :'bb', jsonb_build_object('to_department_id', :'bb')) r where r ->> 'item' = '00000000-0000-0000-0000-00000000e8b1'), 'on the Blood bank''s list');
select t.landed(t.w(t.e('step', :'pt', :'bb', '{"status":"in-progress","step":"received"}', '00000000-0000-0000-0000-00000000e8b2', null, '00000000-0000-0000-0000-00000000e8b1', 'answers')), 'the sample received');
select t.landed(t.w(t.e('step', :'pt', :'bb', '{"status":"in-progress","step":"grouped"}', '00000000-0000-0000-0000-00000000e8b3', null, '00000000-0000-0000-0000-00000000e8b2', 'changes')), 'grouped and screened');
select t.refused(t.w(t.e('step', :'pt', :'bb', '{"status":"in-progress","step":"thawed"}', null, null, '00000000-0000-0000-0000-00000000e8b3', 'changes')), 'unknown_step', 'only its steps');
select t.landed(t.w(t.e('result', :'pt', :'bb', '{"status":"final","conclusion":"A Rh positive · screen negative · 2 units compatible, issued: 26-118437, 26-118452","analytes":[
  {"key":"group","name":"ABO and Rh","code":{"system":"loinc","code":"882-1"},"text":"A Rh positive"},{"key":"screen","name":"Antibody screen","code":{"system":"loinc","code":"890-4"},"text":"negative"},
  {"key":"crossmatch","name":"Crossmatch","text":"compatible"},{"key":"units","name":"Units issued","text":"26-118437 · 26-118452"}]}', null, null,
  (select t.latest('00000000-0000-0000-0000-00000000e8b1')), 'answers')), 'issued: the units by number');
select t.as(:'dr');
select t.ok((select r ->> 'status' from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000e8b1')) r) = 'completed', 'the order answered, on the doctor''s list');

\echo '── /transfuse on the ward (which ticks no laboratory pack): the bedside record written with the base''s write:given where the Blood bank works for it (C3)'
select t.as('11111111-0000-0000-0000-0000000000b3');
select t.landed(t.w(t.e('lis.transfusion', :'pt', '00000000-0000-0000-0000-0000000000d6', jsonb_build_object('status', 'completed', 'drug', jsonb_build_object('text', 'Red cells · A Rh+'),
  'lot', '26-118452', 'route', 'iv', 'dose', jsonb_build_object('value', '60', 'unit', 'mL', 'ucum', 'mL'), 'note', 'about 60 mL · stopped: hives, itch, mild',
  'lis', jsonb_build_object('unit', '26-118452', 'product', 'rbc', 'second', 'Marwa Gaber', 'checks', '["Name and birth date: wristband = label"]'::jsonb,
    'signs', '[{"when":"before","temp":36.8,"sys":128,"dia":76,"pulse":88}]'::jsonb, 'reaction', '{"what":["hives, itch"],"severity":"mild"}'::jsonb)))), 'a unit at the bedside, stopped');
select t.refused(t.w(t.e('lis.transfusion', :'pt', '00000000-0000-0000-0000-0000000000d6', jsonb_build_object('status', 'completed', 'drug', jsonb_build_object('text', 'Red cells'),
  'lis', jsonb_build_object('unit', '26-118452')))), 'bad_shape', 'a second checker is named');
reset role;
select t.ok(core.write_action('lis.transfusion') = 'write:given', 'written with the base''s given action (served)');
