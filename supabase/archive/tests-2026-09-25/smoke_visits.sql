-- reception → queue → consult → results → BACK, through the public functions (spec 03)
-- expects: not_allowed
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set rec  '00000000-0000-0000-0000-0000000000d4'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set rc   '00000000-0000-0000-0000-0000000000b4'
\set lt   '00000000-0000-0000-0000-0000000000b2'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jrc  '11111111-0000-0000-0000-0000000000b4'
\set jlt  '11111111-0000-0000-0000-0000000000b2'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'rc', :'org', 'staff', 'Reception', :'jrc'), (:'lt', :'org', 'staff', 'Lab Tech', :'jlt');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine'), (:'labd', :'org', 'ancillary', 'Lab'), (:'rec', :'org', 'reception', 'Front desk');
insert into core.served_departments (department_id, served_department_id) values (:'rec', null), (:'labd', null);
insert into core.user_roles (organization_id, user_id, role_id, department_id) values
  (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'im'), (:'org', :'rc', '00000000-0000-0000-0000-00000000c004', :'rec'), (:'org', :'lt', '00000000-0000-0000-0000-00000000c005', :'labd');
insert into core.codes (code, name, kind, unit) values ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL') on conflict do nothing;
insert into core.services (id, organization_id, department_id, code, name) values (:'cbc', :'org', :'labd', 'cbc', 'Complete blood count');
set role authenticated;
\echo '── reception registers Ahmed and a lookalike; searches; opens a visit in IM (served)'
select set_config('request.jwt.claim.sub', :'jrc', false);
select record_number, given_name from public.register_patient('00000000-0000-0000-0000-0000000000f1', :'org', 'Ahmed', 'Hassan', 'male', '1968-03-14', phone_text := '0791 000 001');
select record_number, given_name from public.register_patient('00000000-0000-0000-0000-0000000000f2', :'org', 'Ahmad', 'Hasan', 'male', '1970', phone_text := '0791000002');
select h->>'given_name' as hit, h->>'record_number' as no from jsonb_array_elements(public.read_patients(:'org', 'ahmed')) h;
select h->>'given_name' as by_phone from jsonb_array_elements(public.read_patients(:'org', '000001')) h;
select status, is_first, present_at is not null as present from public.open_visit('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000000f1', :'im', 'urgent');
\echo '── Here again → the same visit, no duplicate'
select id = '00000000-0000-0000-0000-0000000000a0' as same from public.open_visit('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000f1', :'im');
\echo '── reception cannot take into consult'
select public.mark_visit('00000000-0000-0000-0000-0000000000a0', 'waiting', 'in_consult');
\echo '── doctor queue: WAITING urgent; opens → in_consult; orders CBC; Done → pending (something out)'
select set_config('request.jwt.claim.sub', :'jdr', false);
select r->>'band' as band, r->>'priority' as priority, r->'patient'->>'given_name' as who from jsonb_array_elements(public.read_visit_queue(:'im')->'rows') r;
select status, seen_at is not null as seen from public.mark_visit('00000000-0000-0000-0000-0000000000a0', 'waiting', 'in_consult');
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a0', :'im', service_id := :'cbc');
select status as after_done from public.mark_visit('00000000-0000-0000-0000-0000000000a0', 'in_consult', 'done');
select r->>'band' as band, r->'requests'->0->>'service_name' as waiting_for from jsonb_array_elements(public.read_visit_queue(:'im')->'rows') r;
\echo '── lab results it → the queue shows BACK without any visit write'
select set_config('request.jwt.claim.sub', :'jlt', false);
select display_line from public.write_result('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1', null, :'labd', request_id := '00000000-0000-0000-0000-0000000000e1',
  "values" := '[{"code":"loinc:718-7","name":"Hb","value_number":13.1,"unit":"g/dL","reference_low":12,"reference_high":16}]');
select set_config('request.jwt.claim.sub', :'jdr', false);
select r->>'band' as band, r->>'status' as status from jsonb_array_elements(public.read_visit_queue(:'im')->'rows') r;
\echo '── doctor finishes: pending → done; queue empty; done_today 1'
select status from public.mark_visit('00000000-0000-0000-0000-0000000000a0', 'pending', 'done');
select jsonb_array_length(q->'rows') as rows, q->>'done_today' as done_today from public.read_visit_queue(:'im') q;
\echo '── second visit next week is a follow-up'
select set_config('request.jwt.claim.sub', :'jrc', false);
select is_first from public.open_visit('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', :'im');
\echo '── visit history'
reset role;
select position, status, actor_id is null as by_sweep, changes from core.visit_steps where visit_id = '00000000-0000-0000-0000-0000000000a0' order by position;
