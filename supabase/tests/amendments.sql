-- the amendments of 2026-09-23 (spec/amendments-2026-09-23.md): waiting for results, which results need review,
-- ranges by sex and age, registered reply types — through the public functions
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set rec  '00000000-0000-0000-0000-0000000000d4'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set rc   '00000000-0000-0000-0000-0000000000b4'
\set lt   '00000000-0000-0000-0000-0000000000b2'
\set ow   '00000000-0000-0000-0000-0000000000b9'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set xr   '00000000-0000-0000-0000-0000000000c2'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jrc  '11111111-0000-0000-0000-0000000000b4'
\set jlt  '11111111-0000-0000-0000-0000000000b2'
\set jow  '11111111-0000-0000-0000-0000000000b9'
\set her  '00000000-0000-0000-0000-0000000000f1'
\set him  '00000000-0000-0000-0000-0000000000f2'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'rc', :'org', 'staff', 'Reception', :'jrc'), (:'lt', :'org', 'staff', 'Lab Tech', :'jlt'), (:'ow', :'org', 'staff', 'Owner', :'jow');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine'), (:'labd', :'org', 'ancillary', 'Lab'), (:'rec', :'org', 'reception', 'Front desk');
insert into core.served_departments (department_id, served_department_id) values (:'rec', null), (:'labd', null);
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'im'),
  (:'org', :'rc', '00000000-0000-0000-0000-00000000c004', :'rec'), (:'org', :'lt', '00000000-0000-0000-0000-00000000c005', :'labd'), (:'org', :'ow', '00000000-0000-0000-0000-00000000c001', null);
insert into core.codes (code, name, kind, unit) values ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL') on conflict do nothing;
set role authenticated;

\echo '── owner: a CBC with ranges by sex; an X-ray answered by a note; a reply type no pack provides is refused'
select set_config('request.jwt.claim.sub', :'jow', false);
select name from public.save_service(:'cbc', :'org', :'labd', 'cbc', 'CBC', 'result', fields := '[{"code":"loinc:718-7","name":"Hb","unit":"g/dL","reference_low":12,"reference_high":16,"critical_low":7,"critical_high":20}]',
  ranges := '[{"position":1,"sex":"female","reference_low":12,"reference_high":15},{"position":1,"sex":"male","reference_low":13,"reference_high":17}]');
select name from public.save_service(:'xr', :'org', :'labd', 'cxr', 'Chest X-ray', 'note');
select public.save_service('00000000-0000-0000-0000-0000000000c3', :'org', :'labd', 'disp', 'Dispensing', 'pharmacy_dispense');
select case when jsonb_array_length(public.read_ranges(:'org')) = 2 then 'ok ranges saved' else 'FAIL ranges' end;
reset role;
select case when review_results = 'critical' and patients_wait then 'ok default: critical only, patients wait' else 'FAIL default rules' end from core.departments where id = :'im';
set role authenticated;
select set_config('request.jwt.claim.sub', :'jow', false);

\echo '── her: waits for a CBC; Hb 15.5 is high for a woman; she is here, so it does not need review'
select set_config('request.jwt.claim.sub', :'jrc', false);
select given_name from public.register_patient(:'her', :'org', 'Mona', 'Saleh', 'female', '1980');
select given_name from public.register_patient(:'him', :'org', 'Omar', 'Khaled', 'male', '1960');
select status from public.open_visit('00000000-0000-0000-0000-0000000000a1', :'her', :'im');
select set_config('request.jwt.claim.sub', :'jdr', false);
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a1', 'waiting', 'in_consult');
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e1', :'her', '00000000-0000-0000-0000-0000000000a1', :'im', service_id := :'cbc');
select case when status = 'pending' then 'ok Done waits for results' else 'FAIL ' || status end from public.mark_visit('00000000-0000-0000-0000-0000000000a1', 'in_consult', 'done');
select set_config('request.jwt.claim.sub', :'jlt', false);
select display_line from public.write_result('00000000-0000-0000-0000-0000000000e2', :'her', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e1', "values" := '[{"code":"loinc:718-7","value_number":15.5}]');
reset role;
select case when reply_flag = 'high' and review_needed_at is null then 'ok high for her range, no review while she waits' else 'FAIL flag=' || reply_flag || ' review=' || coalesce(review_reason, '-') end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e2'::uuid or entry_id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;

\echo '── she leaves before being seen again: reception marks her gone → the result goes to review as not seen'
select set_config('request.jwt.claim.sub', :'jrc', false);
select present_at is null as gone from public.mark_present('00000000-0000-0000-0000-0000000000a1', false);
reset role;
select case when review_reason = 'not seen' then 'ok not seen → review' else 'FAIL ' || coalesce(review_reason, 'no review') end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;

\echo '── him: Done, not waiting → the visit closes although the CBC is out; his normal result later goes to review as not seen'
select set_config('request.jwt.claim.sub', :'jrc', false);
select status from public.open_visit('00000000-0000-0000-0000-0000000000a2', :'him', :'im');
select set_config('request.jwt.claim.sub', :'jdr', false);
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a2', 'waiting', 'in_consult');
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e3', :'him', '00000000-0000-0000-0000-0000000000a2', :'im', service_id := :'cbc');
select case when status = 'done' then 'ok not waiting → done' else 'FAIL ' || status end from public.mark_visit('00000000-0000-0000-0000-0000000000a2', 'in_consult', 'done', wait := false);
select set_config('request.jwt.claim.sub', :'jlt', false);
select display_line from public.write_result('00000000-0000-0000-0000-0000000000e4', :'him', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e3', "values" := '[{"code":"loinc:718-7","value_number":16.5}]');
reset role;
select case when reply_flag = 'normal' and review_reason = 'not seen' then 'ok 16.5 normal for him; not seen → review' else 'FAIL flag=' || reply_flag || ' reason=' || coalesce(review_reason, '-') end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e3';
set role authenticated;

\echo '── him again: waits; a critical Hb; he comes BACK, is seen, Done → the critical still needs its review'
select set_config('request.jwt.claim.sub', :'jrc', false);
select status from public.open_visit('00000000-0000-0000-0000-0000000000a3', :'him', :'im');
select set_config('request.jwt.claim.sub', :'jdr', false);
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a3', 'waiting', 'in_consult');
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e5', :'him', '00000000-0000-0000-0000-0000000000a3', :'im', service_id := :'cbc');
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a3', 'in_consult', 'done');
select set_config('request.jwt.claim.sub', :'jlt', false);
select display_line from public.write_result('00000000-0000-0000-0000-0000000000e6', :'him', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e5', "values" := '[{"code":"loinc:718-7","value_number":5.1}]');
select set_config('request.jwt.claim.sub', :'jdr', false);
select r->>'band' as band from jsonb_array_elements(public.read_visit_queue(:'im')->'rows') r;
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a3', 'pending', 'in_consult');
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a3', 'in_consult', 'done');
reset role;
select case when review_reason = 'critical' and review_needed_at is not null then 'ok critical survives Done' else 'FAIL critical cleared' end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e5';
set role authenticated;

\echo '── the lab corrects it: a corrected result always goes back to review'
select set_config('request.jwt.claim.sub', :'jlt', false);
select display_line from public.write_result('00000000-0000-0000-0000-0000000000e7', :'him', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e5', replaces_id := '00000000-0000-0000-0000-0000000000e6',
  "values" := '[{"code":"loinc:718-7","value_number":15.1}]');
reset role;
select case when review_reason = 'corrected' then 'ok corrected → review' else 'FAIL ' || coalesce(review_reason, 'no review') end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e5';
select case when jsonb_array_length(public.read_queue(:'labd')->'recent') >= 3 then 'ok the day''s released results are in the queue' else 'FAIL recent' end;
set role authenticated;

\echo '── a note cannot answer a CBC; a result cannot answer an X-ray'
select set_config('request.jwt.claim.sub', :'jdr', false);
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e8', :'him', null, :'im', service_id := :'xr');
select set_config('request.jwt.claim.sub', :'jlt', false);
select public.write_note('00000000-0000-0000-0000-0000000000e9', :'him', null, :'labd', text := 'looks fine', reply_to_id := '00000000-0000-0000-0000-0000000000e5');
select public.write_result('00000000-0000-0000-0000-0000000000ea', :'him', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e8', text := 'clear lungs');
select set_config('request.jwt.claim.sub', :'jow', false);
select case when display_line like '%Clear lungs%' then 'ok a note answers the X-ray' else 'FAIL ' || display_line end from public.write_note('00000000-0000-0000-0000-0000000000eb', :'him', null, :'labd', kind := 'consult_reply', text := 'Clear lungs', reply_to_id := '00000000-0000-0000-0000-0000000000e8');

\echo '── Internal Medicine switches to "abnormal"; she comes back within 14 days (Here reuses her open visit); a high result needs review'
select set_config('request.jwt.claim.sub', :'jow', false);
select review_results as setting from public.save_department(:'im', :'org', 'clinic', 'Internal Medicine', review_results := 'abnormal');
select set_config('request.jwt.claim.sub', :'jrc', false);
select case when id = '00000000-0000-0000-0000-0000000000a1' then 'ok Here reopens the same visit' else 'FAIL new visit' end from public.open_visit('00000000-0000-0000-0000-0000000000a4', :'her', :'im');
select set_config('request.jwt.claim.sub', :'jdr', false);
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a1', 'pending', 'in_consult');
select display_line from public.write_request('00000000-0000-0000-0000-0000000000ec', :'her', '00000000-0000-0000-0000-0000000000a1', :'im', service_id := :'cbc');
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a1', 'in_consult', 'done');
select set_config('request.jwt.claim.sub', :'jlt', false);
select display_line from public.write_result('00000000-0000-0000-0000-0000000000ed', :'her', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000ec', "values" := '[{"code":"loinc:718-7","value_number":15.8}]');
reset role;
select case when review_reason = 'abnormal' then 'ok abnormal → review under the new setting' else 'FAIL ' || coalesce(review_reason, 'no review') end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000ec';
