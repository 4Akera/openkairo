-- spec 07: private visits (the story hidden, the facts shown), open anyway, one read log, corrections stay put, department rules, the views
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set psy  '00000000-0000-0000-0000-0000000000d3'
\set rec  '00000000-0000-0000-0000-0000000000d4'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set ps   '00000000-0000-0000-0000-0000000000b3'
\set rc   '00000000-0000-0000-0000-0000000000b4'
\set ow   '00000000-0000-0000-0000-0000000000b9'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jps  '11111111-0000-0000-0000-0000000000b3'
\set jrc  '11111111-0000-0000-0000-0000000000b4'
\set jow  '11111111-0000-0000-0000-0000000000b9'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set pv   '00000000-0000-0000-0000-0000000000a1'
\set iv   '00000000-0000-0000-0000-0000000000a2'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'ps', :'org', 'staff', 'Dr Salma', :'jps'),
  (:'rc', :'org', 'staff', 'Reception', :'jrc'), (:'ow', :'org', 'staff', 'Owner', :'jow');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine'), (:'labd', :'org', 'ancillary', 'Lab'),
  (:'psy', :'org', 'clinic', 'Psychiatry'), (:'rec', :'org', 'reception', 'Front desk');
insert into core.served_departments (department_id, served_department_id) values (:'rec', null), (:'labd', null);
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'im'),
  (:'org', :'ps', '00000000-0000-0000-0000-00000000c002', :'psy'), (:'org', :'rc', '00000000-0000-0000-0000-00000000c004', :'rec'), (:'org', :'ow', '00000000-0000-0000-0000-00000000c001', null);
set role authenticated;

\echo '── the owner makes Psychiatry keep its visits private'
select set_config('request.jwt.claim.sub', :'jow', false);
select case when private_visits then 'ok Psychiatry: visits private' else 'FAIL' end from public.save_department(:'psy', :'org', 'clinic', 'Psychiatry', private_visits := true);

\echo '── reception checks the patient into Psychiatry: the visit starts private; reception (serving it) sees the department in search'
select set_config('request.jwt.claim.sub', :'jrc', false);
select given_name from public.register_patient(:'pt', :'org', 'Mona', 'Saleh', 'female', '1980');
select case when is_private then 'ok private from the start' else 'FAIL not private' end from public.open_visit(:'pv', :'pt', :'psy');
select case when h->'open_visits'->0->>'department_name' = 'Psychiatry' then 'ok reception sees Psychiatry' else 'FAIL ' || (h->'open_visits'->0->>'department_name') end
  from jsonb_array_elements(public.read_patients(:'org', 'mona')) h;

\echo '── the internal-medicine doctor searches: "Private visit", no department'
select set_config('request.jwt.claim.sub', :'jdr', false);
select case when h->'open_visits'->0->>'department_name' = 'Private visit' and h->'open_visits'->0->>'department_id' is null then 'ok search hides the department' else 'FAIL ' || (h->'open_visits'->0)::text end
  from jsonb_array_elements(public.read_patients(:'org', 'mona')) h;

\echo '── the psychiatrist: a note (the story) and lithium (a fact) in the private visit'
select set_config('request.jwt.claim.sub', :'jps', false);
select case when jsonb_typeof(public.read_record(:'pt', :'psy')) = 'object' then 'ok opened' end;
select status from public.mark_visit(:'pv', 'waiting', 'in_consult');
select display_line from public.write_note('00000000-0000-0000-0000-0000000000e1', :'pt', :'pv', :'psy', text := 'Hears voices at night; low mood');
select display_line from public.write_prescription('00000000-0000-0000-0000-0000000000e2', :'pt', :'pv', :'psy', drug := '{"name":"Lithium"}', dose_number := 400, dose_unit := 'mg', frequency := 'BD');
select status from public.mark_visit(:'pv', 'in_consult', 'done');

\echo '── the internal-medicine doctor opens the record: the note is "Private note", the lithium shows with its author'
select set_config('request.jwt.claim.sub', :'jdr', false);
select case when c->>'display_line' = 'Private note' and c->>'author_name' is null and c->>'department_name' = 'Private visit' then 'ok the note is hidden' else 'FAIL ' || c::text end
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'type' = 'note';
select case when c->>'display_line' like 'Lithium%' and c->>'author_name' = 'Dr Salma' and c->>'department_name' = 'Private visit' then 'ok the lithium shows, department hidden' else 'FAIL ' || c::text end
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'type' = 'prescription';
select case when m->>'drug_name' = 'Lithium' then 'ok lithium is on the medication list' else 'FAIL' end from jsonb_array_elements(public.read_record(:'pt', :'im')->'medications') m;
select case when e->'data' = '{}'::jsonb and e->>'display_line' = 'Private note' then 'ok read_entry hides it too' else 'FAIL ' || e::text end from public.read_entry('00000000-0000-0000-0000-0000000000e1') e;
select case when v->>'department_name' = 'Private visit' and (v->>'is_hidden')::boolean and v->>'first_line' is null then 'ok read_visits: Private visit' else 'FAIL ' || v::text end
  from jsonb_array_elements(public.read_visits(:'pt')->'visits') v;

\echo '── he cannot correct the psychiatrist''s note: a correction stays in its department'
select public.write_note('00000000-0000-0000-0000-0000000000e3', :'pt', null, :'im', text := 'edited', replaces_id := '00000000-0000-0000-0000-0000000000e1');

\echo '── he opens it anyway: a reason is required; then he reads it for 12 hours'
select public.read_record(:'pt', :'im', open_visit_id := :'pv');
select case when jsonb_array_length(r->'hidden_visits') = 0 then 'ok opened anyway' else 'FAIL still hidden' end from public.read_record(:'pt', :'im', open_visit_id := :'pv', reason := 'Emergency') r;
select case when e->>'display_line' like '%Hears voices%' then 'ok the note reads after open anyway' else 'FAIL ' || (e->>'display_line') end from public.read_entry('00000000-0000-0000-0000-0000000000e1') e;

\echo '── the owner: no private visit by role; reviews the log instead'
select set_config('request.jwt.claim.sub', :'jow', false);
select case when c->>'display_line' = 'Private note' then 'ok the owner sees "Private note"' else 'FAIL owner reads it' end
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'type' = 'note';
select case when jsonb_array_length(public.read_opened_anyway(:'org')) = 1 and public.read_opened_anyway(:'org')->0->>'reason_text' = 'Emergency' then 'ok one open-anyway, with its reason' else 'FAIL ' || public.read_opened_anyway(:'org')::text end;
select string_agg(r->>'user_name' || ':' || (r->>'basis'), ', ' order by r->>'read_at') as log from jsonb_array_elements(public.read_record_reads(:'pt')) r;
\echo '── (a doctor may not read the log: not_allowed)'
select set_config('request.jwt.claim.sub', :'jdr', false);
select public.read_record_reads(:'pt');

\echo '── Internal Medicine sends patients home without waiting; a visit made private hides its notes from Psychiatry'
select set_config('request.jwt.claim.sub', :'jow', false);
select patients_wait from public.save_department(:'im', :'org', 'clinic', 'Internal Medicine', patients_wait := false);
reset role;
insert into core.codes (code, name, kind, unit) values ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', :'jow', false);
select name from public.save_service('00000000-0000-0000-0000-0000000000c1', :'org', :'labd', 'cbc', 'CBC', 'result', fields := '[{"code":"loinc:718-7","name":"Hb","unit":"g/dL","reference_low":12,"reference_high":16}]');
select set_config('request.jwt.claim.sub', :'jrc', false);
select status from public.open_visit(:'iv', :'pt', :'im');
select set_config('request.jwt.claim.sub', :'jdr', false);
select status from public.mark_visit(:'iv', 'waiting', 'in_consult');
select display_line from public.write_note('00000000-0000-0000-0000-0000000000e4', :'pt', :'iv', :'im', text := 'Discussed home situation');
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e5', :'pt', :'iv', :'im', service_id := '00000000-0000-0000-0000-0000000000c1');
select case when is_private then 'ok the doctor made the visit private' else 'FAIL' end from public.mark_visit_private(:'iv', true, 'patient asked');
select case when status = 'done' then 'ok the rule: not waiting → done' else 'FAIL ' || status end from public.mark_visit(:'iv', 'in_consult', 'done');
select set_config('request.jwt.claim.sub', :'jps', false);
select case when c->>'display_line' = 'Private note' then 'ok Psychiatry cannot read the IM private visit' else 'FAIL ' || (c->>'display_line') end
  from jsonb_array_elements(public.read_record(:'pt', :'psy')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e4';
select case when c->>'display_line' like '%Hears voices%' then 'ok the psychiatrist reads their own visit' else 'FAIL' end
  from jsonb_array_elements(public.read_record(:'pt', :'psy')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e1';
reset role;
select case when changes->>'is_private' = 'true' and actor_id = :'dr' then 'ok the visit history records who made it private' else 'FAIL' end
  from core.visit_steps where visit_id = :'iv' and changes ? 'is_private';
select case when basis = 'visit' then 'ok the psychiatrist''s read had a reason: an open visit' else 'FAIL ' || coalesce(basis, '-') end from core.record_reads where user_id = :'ps' order by read_at limit 1;
select case when basis = 'none' then 'ok the IM doctor''s first read had none' else 'FAIL ' || coalesce(basis, '-') end from core.record_reads where user_id = :'dr' order by read_at limit 1;

-- ════ the leaks the adversarial review found (0024): each one closed ════
\set d2  '00000000-0000-0000-0000-0000000000b2'
\set jd2 '11111111-0000-0000-0000-0000000000b2'
\set lt  '00000000-0000-0000-0000-0000000000b5'
\set jlt '11111111-0000-0000-0000-0000000000b5'
\set pv2 '00000000-0000-0000-0000-0000000000a3'
insert into core.users (id, organization_id, kind, name, login_id) values (:'d2', :'org', 'staff', 'Dr Omar', :'jd2'), (:'lt', :'org', 'staff', 'Lab Tech', :'jlt');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'d2', '00000000-0000-0000-0000-00000000c002', :'im'), (:'org', :'lt', '00000000-0000-0000-0000-00000000c005', :'labd');
insert into core.entry_files (entry_id, position, path, mime, name) values ('00000000-0000-0000-0000-0000000000e1', 1, 'records/letter.pdf', 'application/pdf', 'letter');
set role authenticated;

\echo '── a second IM doctor replays the hidden note''s id through write_note and write_set: refused, nothing returned'
select set_config('request.jwt.claim.sub', :'jd2', false);
select case when jsonb_typeof(public.read_record(:'pt', :'im')) = 'object' then 'ok opened' end;
select public.write_note('00000000-0000-0000-0000-0000000000e1', :'pt', null, :'im', text := 'x');
select public.write_set(:'im', '[{"function":"write_note","params":{"id":"00000000-0000-0000-0000-0000000000e1","patient_id":"00000000-0000-0000-0000-0000000000f1","text":"x"}}]');
\echo '── … the hidden note''s file: refused'
select public.read_entry_file('00000000-0000-0000-0000-0000000000e1', 1::smallint);
\echo '── … replaying the private visit''s id through open_visit: refused'
select public.open_visit(:'pv', :'pt', :'im');

\echo '── the owner (a role everywhere) cannot make the private visit not private'
select set_config('request.jwt.claim.sub', :'jow', false);
select public.mark_visit_private(:'pv', false);

\echo '── IM asks Psychiatry a question; the psychiatrist answers inside a private visit, with a value in the note'
select set_config('request.jwt.claim.sub', :'jdr', false);
select display_line from public.write_request('00000000-0000-0000-0000-0000000000e6', :'pt', null, :'im', to_department_id := :'psy', question_text := 'Is lithium still needed?');
select set_config('request.jwt.claim.sub', :'jrc', false);
select case when is_private then 'ok the consult visit is private' else 'FAIL' end from public.open_visit(:'pv2', :'pt', :'psy', request_id := '00000000-0000-0000-0000-0000000000e6');
select set_config('request.jwt.claim.sub', :'jps', false);
select case when jsonb_typeof(public.read_record(:'pt', :'psy')) = 'object' then 'ok opened' end;
select display_line from public.write_note('00000000-0000-0000-0000-0000000000e7', :'pt', :'pv2', :'psy', kind := 'consult_reply', text := 'Yes, continue lithium; level in 3 months',
  reply_to_id := '00000000-0000-0000-0000-0000000000e6', fields := '{"values":[{"code":"loinc:718-7","name":"Hb","value_number":9.9,"unit":"g/dL"}]}');

\echo '── the requesting department reads the answer; anyone else sees "Private reply"'
select set_config('request.jwt.claim.sub', :'jd2', false);
select case when c->'request'->>'reply_line' like '%continue lithium%' then 'ok IM (who asked) reads the reply' else 'FAIL ' || coalesce(c->'request'->>'reply_line', '-') end
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e6';
select set_config('request.jwt.claim.sub', :'jow', false);
select case when c->'request'->>'reply_line' = 'Private reply' then 'ok the owner sees "Private reply" on the request' else 'FAIL ' || coalesce(c->'request'->>'reply_line', '-') end
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e6';
select case when (r->'reply'->>'is_hidden')::boolean and r->'reply'->'data' = '{}'::jsonb then 'ok the queue''s released list hides it too' else 'FAIL ' || coalesce((r->'reply')::text, '-') end
  from jsonb_array_elements(public.read_queue(:'psy')->'recent') r where r->>'id' = '00000000-0000-0000-0000-0000000000e6';
select case when jsonb_typeof(public.read_values(:'pt', array['loinc:718-7'])->'loinc:718-7') is distinct from 'array' then 'ok the note''s value is not in the owner''s trend' else 'FAIL' end;
select case when not (public.read_results_table(:'pt')::text like '%9.9%') then 'ok nor in results over time' else 'FAIL' end;
select set_config('request.jwt.claim.sub', :'jps', false);
select case when jsonb_typeof(public.read_values(:'pt', array['loinc:718-7'])->'loinc:718-7') = 'array' and jsonb_array_length(public.read_values(:'pt', array['loinc:718-7'])->'loinc:718-7') = 1 then 'ok the psychiatrist sees the value' else 'FAIL' end;

\echo '── search: the lab tech (a lab serving every department) sees "Private visit"; reception serving Psychiatry sees Psychiatry'
select set_config('request.jwt.claim.sub', :'jlt', false);
select case when h->'open_visits'->0->>'department_name' = 'Private visit' and h->'open_visits'->0->>'assignee_id' is null then 'ok the lab tech sees "Private visit"' else 'FAIL ' || (h->'open_visits')::text end
  from jsonb_array_elements(public.read_patients(:'org', 'mona')) h;
select set_config('request.jwt.claim.sub', :'jrc', false);
select case when h->'open_visits'->0->>'department_name' = 'Psychiatry' then 'ok reception sees Psychiatry' else 'FAIL' end from jsonb_array_elements(public.read_patients(:'org', 'mona')) h;

\echo '── 0034: reception lists a private visit apart, as "Private visit" — never under its department'
select set_config('request.jwt.claim.sub', :'jrc', false);
select given_name from public.register_patient('00000000-0000-0000-0000-0000000000f9', :'org', 'Hala', 'Nour', 'female', '1990');
select case when is_private then 'ok the new Psychiatry visit is private' else 'FAIL not private' end from public.open_visit('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000f9', :'psy');
select case when not exists (select 1 from jsonb_array_elements(public.read_visit_queue(:'psy')->'rows') r where r->>'id' = '00000000-0000-0000-0000-0000000000a9')
  then 'ok reception does not see it under Psychiatry' else 'FAIL listed under Psychiatry at reception' end;
select case when exists (select 1 from jsonb_array_elements(public.read_private_visits(:'rec')) r where r->>'id' = '00000000-0000-0000-0000-0000000000a9' and not (r ? 'department_id') and not (r ? 'department_name'))
  then 'ok reception''s private list has it, without its department' else 'FAIL private list' end;
select set_config('request.jwt.claim.sub', :'jps', false);
select case when exists (select 1 from jsonb_array_elements(public.read_visit_queue(:'psy')->'rows') r where r->>'id' = '00000000-0000-0000-0000-0000000000a9')
  then 'ok Psychiatry sees its own patient' else 'FAIL Psychiatry lost its patient' end;

\echo '── 0035: a department''s review list is for those who review there — not for a desk or a bench that serves it'
select set_config('request.jwt.claim.sub', :'jrc', false);
do $$ begin perform public.read_to_review('00000000-0000-0000-0000-0000000000d3'); raise notice 'FAIL reception read Psychiatry''s review list';
  exception when others then raise notice '%', case when sqlerrm = 'not_allowed' then 'ok refused: reception reading Psychiatry''s review list' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── 0035: Psychiatry''s own desk (a role there without read:record) still sees its queue'
reset role;
insert into core.users (id, organization_id, kind, name, login_id) values ('00000000-0000-0000-0000-0000000000b6', :'org', 'staff', 'Psych desk', '11111111-0000-0000-0000-0000000000b6');
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000e006', :'org', 'psych_desk', 'Psych desk');
insert into core.role_actions (role_id, action) values ('00000000-0000-0000-0000-00000000e006', 'read:queue'), ('00000000-0000-0000-0000-00000000e006', 'read:organization');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', '00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-00000000e006', :'psy');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000b6', false);
select case when exists (select 1 from jsonb_array_elements(public.read_visit_queue(:'psy')->'rows') r where r->>'id' = '00000000-0000-0000-0000-0000000000a9')
  then 'ok Psychiatry''s desk sees its own queue' else 'FAIL Psychiatry''s desk sees an empty queue' end;
