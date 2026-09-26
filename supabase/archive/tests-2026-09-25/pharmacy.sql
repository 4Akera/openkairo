-- the pharmacy pack (spec 06): a prescription becomes a request to Pharmacy; prepared; dispensed in Done's write set; the boundary
-- expects: pack_off, pack_off, wrong_reply_type
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ph   '00000000-0000-0000-0000-0000000000d6'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set pm   '00000000-0000-0000-0000-0000000000b6'
\set ow   '00000000-0000-0000-0000-0000000000b9'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jpm  '11111111-0000-0000-0000-0000000000b6'
\set jow  '11111111-0000-0000-0000-0000000000b9'
\set pt   '00000000-0000-0000-0000-0000000000f1'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'pm', :'org', 'staff', 'Pharmacist', :'jpm'), (:'ow', :'org', 'staff', 'Owner', :'jow');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'im'), (:'org', :'ow', '00000000-0000-0000-0000-00000000c001', null);
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values (:'pt', :'org', 1, 'Mona', 'Saleh', 'female', '1980');

\echo '── the boundary: the pack role holds nothing on any core table; its functions are its own and definer'
select case when bool_and(not has_table_privilege('pack_pharmacy', 'core.' || tablename, 'SELECT,INSERT,UPDATE,DELETE')) then 'ok pack_pharmacy holds no core table' else 'FAIL' end from pg_tables where schemaname = 'core';
select case when bool_and(p.prosecdef and r.rolname = 'pack_pharmacy') then 'ok its functions are its own, definer' else 'FAIL' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'pharmacy';
set role authenticated;

\echo '── before the pack is on: a Pharmacy department and a dispensing service are refused; a prescription is a paper script'
select set_config('request.jwt.claim.sub', :'jow', false);
select public.save_department(:'ph', :'org', 'pharmacy', 'Pharmacy');
select set_config('request.jwt.claim.sub', :'jdr', false);
select case when not exists (select 1 from public.write_prescription('00000000-0000-0000-0000-0000000000e1', :'pt', null, :'im', drug := '{"name":"Metformin"}', dose_number := 500, dose_unit := 'mg', frequency := 'BD') where service_id is not null)
  then 'ok no pack, no request' else 'FAIL' end;

\echo '── the owner enables the pack; makes Pharmacy and its Dispensing service; gives the pharmacist the role'
select set_config('request.jwt.claim.sub', :'jow', false);
select public.save_organization_pack(:'org', 'pharmacy');
select type from public.save_department(:'ph', :'org', 'pharmacy', 'Pharmacy');
select reply_type from public.save_service('00000000-0000-0000-0000-0000000000c9', :'org', :'ph', 'dispense', 'Dispensing', 'pharmacy_dispense');
reset role;
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'pm', '00000000-0000-0000-0000-00000000ca01', :'ph');
set role authenticated;

\echo '── 0039: a prescription not sent stays on the medication list only; one the doctor sends is a request to Pharmacy'
select set_config('request.jwt.claim.sub', :'jdr', false);
select case when service_id is null then 'ok not sent: no request' else 'FAIL sent without Send' end
  from public.write_prescription('00000000-0000-0000-0000-0000000000e3', :'pt', null, :'im', drug := '{"name":"Amlodipine"}', dose_number := 5, dose_unit := 'mg', frequency := 'OD');
select case when service_id is not null then 'ok the prescription is a request to Pharmacy' else 'FAIL no service' end
  from public.write_prescription('00000000-0000-0000-0000-0000000000e2', :'pt', null, :'im', drug := '{"name":"Lithium"}', dose_number := 400, dose_unit := 'mg', frequency := 'BD', duration_days := 30, send := true);
select set_config('request.jwt.claim.sub', :'jpm', false);
select case when q->'requests'->0->'details'->'drug'->>'name' = 'Lithium' and (q->'requests'->0->'details'->>'duration_days')::int = 30 then 'ok the queue carries what to give' else 'FAIL ' || (q->'requests'->0)::text end from public.read_queue(:'ph') q;

\echo '── the pharmacist: prepared (a pack step); a result cannot answer it; the dispense in a write set closes it'
select step from public.mark_step('00000000-0000-0000-0000-0000000000e2', 'sent', 'prepared');
select public.write_result('00000000-0000-0000-0000-0000000000e3', :'pt', null, :'ph', request_id := '00000000-0000-0000-0000-0000000000e2', text := 'given');
select display_line from public.write_set(:'ph', '[{"function":"pharmacy_write_dispense","params":{"id":"00000000-0000-0000-0000-0000000000e4","patient_id":"00000000-0000-0000-0000-0000000000f1",
  "request_id":"00000000-0000-0000-0000-0000000000e2","items":[{"name":"Lithium","dose_number":400,"dose_unit":"mg","quantity":60}]}}]');
reset role;
select case when status = 'done' and review_needed_at is null then 'ok dispensed: done, nothing to review' else 'FAIL ' || status end from core.requests where entry_id = '00000000-0000-0000-0000-0000000000e2';
select case when string_agg(step::text, ' > ' order by position) = 'sent > prepared > done' then 'ok steps: sent > prepared > done' else 'FAIL ' || string_agg(step::text, ' > ' order by position) end from core.request_steps where request_id = '00000000-0000-0000-0000-0000000000e2';
set role authenticated;

\echo '── pack off: a new dispense is refused; the old one still reads'
select set_config('request.jwt.claim.sub', :'jow', false);
select public.retire_organization_pack(:'org', 'pharmacy');
select set_config('request.jwt.claim.sub', :'jpm', false);
select public.pharmacy_write_dispense('00000000-0000-0000-0000-0000000000e5', :'pt', null, :'ph', request_id := '00000000-0000-0000-0000-0000000000e2', items := '[{"name":"x","quantity":1}]');
select set_config('request.jwt.claim.sub', :'jow', false);
select case when (public.read_record(:'pt', :'im')->'entries') @> '[{"type":"prescription"}]' then 'ok the record still reads' else 'FAIL' end;
