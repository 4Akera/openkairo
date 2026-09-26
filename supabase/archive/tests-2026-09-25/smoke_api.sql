-- a clinic day through the PUBLIC functions, as the users the JWT names (specs 02–04)
-- expects: not_allowed, not_allowed, problem_not_found
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set phar '00000000-0000-0000-0000-0000000000d3'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set rn   '00000000-0000-0000-0000-0000000000b3'
\set lt   '00000000-0000-0000-0000-0000000000b2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set disp '00000000-0000-0000-0000-0000000000c2'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jrn  '11111111-0000-0000-0000-0000000000b3'
\set jlt  '11111111-0000-0000-0000-0000000000b2'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'rn', :'org', 'staff', 'Nurse Sara', :'jrn'), (:'lt', :'org', 'staff', 'Lab Tech', :'jlt');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine'), (:'labd', :'org', 'ancillary', 'Lab'), (:'phar', :'org', 'ancillary', 'Pharmacy');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values
  (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', null), (:'org', :'rn', '00000000-0000-0000-0000-00000000c003', :'im'), (:'org', :'lt', '00000000-0000-0000-0000-00000000c005', :'labd');
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values (:'pt', :'org', 1, 'Ahmed', 'Hassan', 'male', '1968-03-14');
insert into core.codes (code, name, kind, unit) values ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL'), ('loinc:4548-4', 'HbA1c', 'number', '%') on conflict do nothing;
insert into core.services (id, organization_id, department_id, section_name, code, name) values (:'cbc', :'org', :'labd', 'Haematology', 'cbc', 'Complete blood count');
insert into core.services (id, organization_id, department_id, code, name, reply_type) values (:'disp', :'org', :'phar', 'dispense', 'Dispensing', 'dispense');
insert into core.service_fields (service_id, position, code, name, kind, unit, reference_low, reference_high, critical_low) values (:'cbc', 1, 'loinc:718-7', 'Haemoglobin', 'number', 'g/dL', 12, 16, 7);

-- become the doctor (what PostgREST does from the JWT)
select set_config('request.jwt.claim.sub', :'jdr', false);
set role authenticated;
\echo '── nurse cannot prescribe (gate)'
select set_config('request.jwt.claim.sub', :'jrn', false);
select public.write_prescription('00000000-0000-0000-0000-0000000000e0', :'pt', null, :'im', drug := '{"name":"Metformin"}', dose_number := 500, dose_unit := 'mg', frequency := 'BD');
\echo '── nurse writes vitals'
select display_line, flag from public.write_vitals('00000000-0000-0000-0000-0000000000e1', :'pt', null, :'im', systolic := 148, diastolic := 92, pulse := 78, weight := 84, height := 175);
\echo '── doctor: one Done = problem + prescription + request + note + list review, all-or-nothing'
select set_config('request.jwt.claim.sub', :'jdr', false);
select type, display_line, written_with_id = '00000000-0000-0000-0000-0000000000e2' as in_set from public.write_set(:'im', jsonb_build_array(
  jsonb_build_object('function','write_problem',      'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e2','patient_id',:'pt','code','icd10:E11','name','Type 2 diabetes mellitus','onset_on','2019')),
  jsonb_build_object('function','write_prescription', 'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e3','patient_id',:'pt','drug',jsonb_build_object('code','atc:A10BA02','name','Metformin'),'dose_number',500,'dose_unit','mg','route','oral','frequency','BD','problems',jsonb_build_array(jsonb_build_object('id','00000000-0000-0000-0000-0000000000e2')))),
  jsonb_build_object('function','write_request',      'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e4','patient_id',:'pt','service_id',:'cbc','priority','urgent')),
  jsonb_build_object('function','write_note',         'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e5','patient_id',:'pt','kind','plan','text','Start metformin. CBC today. RTC 12 weeks.')),
  jsonb_build_object('function','write_list_review',  'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e6','patient_id',:'pt','list','allergies','outcome','none_known'))
));
reset role;
\echo '── the lists'
select drug_name, dose_number, dose_unit, frequency, status from core.patient_medications;
select name, code, status from core.patient_problems;
select list, reviewed_by_id = :'dr' as by_doctor from core.patient_list_reviews;
\echo '── two requests: CBC → Lab, prescription → Pharmacy'
select e.type, e.display_line, d.name as to_dept, r.step, r.priority from core.requests r join core.entries e on e.id = r.entry_id join core.departments d on d.id = r.to_department_id order by e.recorded_at;
set role authenticated;
\echo '── a set with a bad item writes nothing'
select count(*) from public.write_set(:'im', jsonb_build_array(
  jsonb_build_object('function','write_note',    'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e7','patient_id',:'pt','kind','progress','text','x')),
  jsonb_build_object('function','write_problem', 'params', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e8','patient_id',:'pt','action','resolve','problem_id','00000000-0000-0000-0000-000000000099'))));
reset role; select count(*) as entries_after_failed_set from core.entries; set role authenticated;
\echo '── lab: queue, start, result with a critical Hb'
select set_config('request.jwt.claim.sub', :'jlt', false);
select jsonb_array_length(read_queue->'requests') as in_queue, read_queue->'requests'->0->>'service_name' as first from public.read_queue(:'labd');
select step from public.mark_step('00000000-0000-0000-0000-0000000000e4', 'sent', 'started');
select display_line, flag from public.write_result('00000000-0000-0000-0000-0000000000e9', :'pt', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e4',
  "values" := '[{"code":"loinc:718-7","name":"Hb","value_number":6.4,"unit":"g/dL","reference_low":12,"reference_high":16,"critical_low":7}]');
reset role; select step, reply_flag, review_needed_at is not null as to_review from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e4'; set role authenticated;
\echo '── doctor: my results (critical first), then bulk reviewed; read_record'
select set_config('request.jwt.claim.sub', :'jdr', false);
select r->>'display_line' as line, r->'request'->>'reply_flag' as flag from jsonb_array_elements(public.read_to_review()) r;
select public.mark_reviewed(array['00000000-0000-0000-0000-0000000000e4']::uuid[]) as reviewed;
select jsonb_array_length(public.read_to_review()) as left_to_review;
select rec->'patient'->>'age' as age, jsonb_array_length(rec->'medications') as meds, jsonb_array_length(rec->'problems') as problems,
       rec->'allergy_review'->>'list' as allergy_review, jsonb_array_length(rec->'entries') as cards, rec->'entries'->0->>'display_line' as newest
from public.read_record(:'pt', :'im') rec;
\echo '── the CBC card carries its reply'
select c->>'display_line' as request, c->'request'->>'reply_line' as reply, c->'request'->>'status' as status from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'type' = 'request' and c->>'display_line' like 'Complete%';
\echo '── trend'
select public.read_values(:'pt', array['loinc:718-7','loinc:8480-6']);
\echo '── lab tech cannot read the record without opening it; doctor can'
select set_config('request.jwt.claim.sub', :'jlt', false);
select public.read_entries(:'pt');
