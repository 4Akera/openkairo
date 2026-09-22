-- smoke test of the spine, run as postgres after db reset (spec 01)
\set org  '00000000-0000-0000-0000-0000000000a1'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set lab  '00000000-0000-0000-0000-0000000000b2'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name) values (:'dr', :'org', 'staff', 'Dr Ali'), (:'lab', :'org', 'staff', 'Lab Tech');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine'), (:'labd', :'org', 'ancillary', 'Lab');
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values (:'pt', :'org', 1, 'Ahmed', 'Hassan', 'male', '1968-03-14');
insert into core.codes (code, name, kind, unit) values ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL'), ('loinc:6690-2', 'WBC', 'number', '10^9/L') on conflict do nothing;
insert into core.services (id, organization_id, department_id, code, name) values (:'cbc', :'org', :'labd', 'cbc', 'Complete blood count');
\echo '── 1. request with a destination'
select type, display_line from core.write_entry('00000000-0000-0000-0000-0000000000e1', :'org', :'pt', null, :'im', :'dr', null, 'staff', null, null,
  'request', :'cbc', '{"service":{"name":"CBC"}}', 'CBC', null, true, null, null, jsonb_build_object('to_department_id', :'labd', 'priority', 'routine'));
select step, status, to_department_id = :'labd' as routed, requester_id = :'dr' as requester from core.requests;
\echo '── 2. retry same id: no new row'
select (core.write_entry('00000000-0000-0000-0000-0000000000e1', :'org', :'pt', null, :'im', :'dr', null, 'staff', null, null, 'request', :'cbc', '{}', 'CBC', null, true, null, null, null)).id is not null as returned;
select count(*) as entries from core.entries;
\echo '── 3. lab starts, then a result reply with a low Hb'
select step from core.change_request('00000000-0000-0000-0000-0000000000e1', 'sent', 'started', :'lab');
select flag, display_line from core.write_entry('00000000-0000-0000-0000-0000000000e2', :'org', :'pt', null, :'labd', :'lab', null, 'staff', 'analyser:msg-1', null,
  'result', :'cbc', '{"values":[{"code":"loinc:718-7","name":"Hb","value_number":9.2,"unit":"g/dL","reference_low":12,"reference_high":16,"critical_low":7},{"code":"loinc:6690-2","name":"WBC","value_number":14.1,"unit":"10^9/L","reference_low":4,"reference_high":11}]}',
  'CBC · Hb 9.2 ↓ · WBC 14.1 ↑', '00000000-0000-0000-0000-0000000000e1', true, null, null, null);
select step, status, reply_line, reply_flag, review_needed_at is not null as to_review from core.requests;
select code, value_number, unit, flag from core.entry_values order by position;
select position, step from core.request_steps order by position;
\echo '── 4. same analyser message again → ignored'
select (core.write_entry('00000000-0000-0000-0000-0000000000e9', :'org', :'pt', null, :'labd', :'lab', null, 'staff', 'analyser:msg-1', null, 'result', :'cbc', '{}', 'dup', '00000000-0000-0000-0000-0000000000e1', true, null, null, null)).id is not null;
select count(*) as entries from core.entries;
\echo '── 5. permanence (three refusals expected)'
update core.entries set display_line = 'x' where id = '00000000-0000-0000-0000-0000000000e2';
delete from core.entries where id = '00000000-0000-0000-0000-0000000000e2';
update core.requests set step = 'done';
\echo '── 6. correction replaces the old result'
select replaces_id is not null as corrects from core.write_entry('00000000-0000-0000-0000-0000000000e3', :'org', :'pt', null, :'labd', :'lab', null, 'staff', null, null,
  'result', :'cbc', '{"values":[{"code":"loinc:718-7","name":"Hb","value_number":9.4,"unit":"g/dL","reference_low":12,"reference_high":16}]}',
  'Corrected: CBC · Hb 9.4 ↓', null, true, '00000000-0000-0000-0000-0000000000e2', null, null);
select replaced_by_id is not null as old_marked from core.entries where id = '00000000-0000-0000-0000-0000000000e2';
select entry_id, value_number from core.entry_values order by entry_id;
select step, reply_line from core.requests;
\echo '── 7. second correction of the same entry → refused'
select core.write_entry('00000000-0000-0000-0000-0000000000e4', :'org', :'pt', null, :'labd', :'lab', null, 'staff', null, null, 'result', :'cbc', '{}', 'x', null, true, '00000000-0000-0000-0000-0000000000e2', null, null);
\echo '── 8. strike a request with live replies → refused'
select core.write_entry('00000000-0000-0000-0000-0000000000e5', :'org', :'pt', null, :'im', :'dr', null, 'staff', null, null, 'entered_in_error', null, '{}', 'Struck', null, true, '00000000-0000-0000-0000-0000000000e1', null, null);
\echo '── 9. clock'
select count(*) = count(distinct recorded_at) as monotonic, bool_and(occurred_at <= recorded_at) as sane from core.entries;
