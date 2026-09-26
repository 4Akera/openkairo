-- spec 07: private notes (the story hidden, the facts shown), open anyway, one read log, department rules, the views (spec 08 K26)
-- expects:
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set psy  '00000000-0000-0000-0000-0000000000d3'
\set rec  '00000000-0000-0000-0000-0000000000d4'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set d2   '00000000-0000-0000-0000-0000000000b2'
\set ps   '00000000-0000-0000-0000-0000000000b3'
\set rc   '00000000-0000-0000-0000-0000000000b4'
\set ps2  '00000000-0000-0000-0000-0000000000b5'
\set ck   '00000000-0000-0000-0000-0000000000b6'
\set mc   '00000000-0000-0000-0000-0000000000b7'
\set ow   '00000000-0000-0000-0000-0000000000b9'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jd2  '11111111-0000-0000-0000-0000000000b2'
\set jps  '11111111-0000-0000-0000-0000000000b3'
\set jrc  '11111111-0000-0000-0000-0000000000b4'
\set jps2 '11111111-0000-0000-0000-0000000000b5'
\set jck  '11111111-0000-0000-0000-0000000000b6'
\set jmc  '11111111-0000-0000-0000-0000000000b7'
\set jow  '11111111-0000-0000-0000-0000000000b9'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set pv   '00000000-0000-0000-0000-0000000000a1'
\set iv   '00000000-0000-0000-0000-0000000000a2'
\set pv2  '00000000-0000-0000-0000-0000000000a3'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'d2', :'org', 'staff', 'Dr Omar', :'jd2'),
  (:'ps', :'org', 'staff', 'Dr Salma', :'jps'), (:'ps2', :'org', 'staff', 'Dr Hany', :'jps2'), (:'rc', :'org', 'staff', 'Reception', :'jrc'),
  (:'ck', :'org', 'staff', 'Psych clerk', :'jck'), (:'mc', :'org', 'machine', 'Kiosk', :'jmc'), (:'ow', :'org', 'staff', 'Owner', :'jow');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine'), (:'labd', :'org', 'ancillary', 'Lab'),
  (:'psy', :'org', 'clinic', 'Psychiatry'), (:'rec', :'org', 'reception', 'Front desk');
insert into core.served_departments (department_id, served_department_id) values (:'rec', null), (:'labd', null);
-- a clerk at Psychiatry whose role there does not read the record (Nurse everywhere does), and a machine user holding Doctor there
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000e006', :'org', 'psych_desk', 'Psych desk');
insert into core.role_actions (role_id, action) values ('00000000-0000-0000-0000-00000000e006', 'read:queue'), ('00000000-0000-0000-0000-00000000e006', 'read:organization');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values
  (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'im'), (:'org', :'d2', '00000000-0000-0000-0000-00000000c002', :'im'),
  (:'org', :'ps', '00000000-0000-0000-0000-00000000c002', :'psy'), (:'org', :'ps2', '00000000-0000-0000-0000-00000000c002', :'psy'),
  (:'org', :'rc', '00000000-0000-0000-0000-00000000c004', :'rec'), (:'org', :'ow', '00000000-0000-0000-0000-00000000c001', null),
  (:'org', :'ck', '00000000-0000-0000-0000-00000000e006', :'psy'), (:'org', :'ck', '00000000-0000-0000-0000-00000000c003', null),
  (:'org', :'mc', '00000000-0000-0000-0000-00000000c002', :'psy');
insert into core.codes (code, name, kind, unit) values ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL') on conflict do nothing;

\echo '── what privacy on the visit used to need is gone'
select t.ok(to_regprocedure('public.read_private_visits(uuid)') is null, 'read_private_visits is gone');
select t.ok(to_regprocedure('public.mark_visit_private(uuid,boolean,text)') is null, 'mark_visit_private is gone');
select t.ok(to_regprocedure('core.sees_department(uuid,uuid,uuid)') is null and to_regprocedure('core.visit_hidden(uuid,uuid)') is null, 'sees_department and visit_hidden are gone');
select t.ok(not exists (select 1 from information_schema.columns where table_schema = 'core' and table_name = 'visits' and column_name = 'is_private'), 'visits.is_private is gone');
set role authenticated;

\echo '── the owner makes Psychiatry a private department'
select set_config('request.jwt.claim.sub', :'jow', false);
select t.ok(is_private, 'Psychiatry is a private department') from public.save_department(:'psy', :'org', 'clinic', 'Psychiatry', is_private := true);

\echo '── reception checks the patient into Psychiatry; the IM doctor''s search shows the real department'
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.ok(given_name = 'Mona', 'registered') from public.register_patient(:'pt', :'org', 'Mona', 'Saleh', 'female', '1980');
select t.ok(status = 'waiting', 'the visit opens as any visit') from public.open_visit(:'pv', :'pt', :'psy');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(h->'open_visits'->0->>'department_name' = 'Psychiatry' and h->'open_visits'->0->>'department_id' = :'psy', 'search shows the department to everyone')
  from jsonb_array_elements(public.read_patients(:'org', 'mona')) h;

\echo '── the psychiatrist writes a note (the story) and lithium, a problem and a request (the facts)'
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(jsonb_typeof(public.read_record(:'pt', :'psy')) = 'object', 'the psychiatrist opens the record');
select t.ok(status = 'in_consult', 'seen') from public.mark_visit(:'pv', 'waiting', 'in_consult');
select t.ok(display_line like '%Hears voices%', 'note written') from public.write_note('00000000-0000-0000-0000-0000000000e1', :'pt', :'pv', :'psy', text := 'Hears voices at night; low mood');
select t.ok(display_line like 'Lithium%', 'lithium prescribed') from public.write_prescription('00000000-0000-0000-0000-0000000000e2', :'pt', :'pv', :'psy', drug := '{"name":"Lithium"}', dose_number := 400, dose_unit := 'mg', frequency := 'BD');
select t.ok(display_line like '%Bipolar%', 'problem written') from public.write_problem('00000000-0000-0000-0000-0000000000e3', :'pt', :'pv', :'psy', name := 'Bipolar disorder');
select t.ok(display_line like '%Lithium level%', 'request written') from public.write_request('00000000-0000-0000-0000-0000000000e5', :'pt', :'pv', :'psy', to_department_id := :'labd', question_text := 'Lithium level');
select t.ok(display_line like '%Plan reviewed%', 'a note for which the IM doctor is responsible')
  from public.write_note('00000000-0000-0000-0000-0000000000e8', :'pt', :'pv', :'psy', text := 'Plan reviewed with IM', responsible_id := :'dr');
select t.ok(status = 'done', 'done, the patient goes home (the lithium level is still out)') from public.mark_visit(:'pv', 'in_consult', 'done', wait := false);
select t.ok(display_line like '%Phoned%', 'a Psychiatry note with no visit') from public.write_note('00000000-0000-0000-0000-0000000000e9', :'pt', null, :'psy', text := 'Phoned: sleeping better');
reset role;
insert into core.entry_files (entry_id, position, path, mime, name) values ('00000000-0000-0000-0000-0000000000e1', 1, 'records/letter.pdf', 'application/pdf', 'letter');
select t.ok(count(*) = 3, 'every note signed in Psychiatry got its private row, the visitless one included')
  from core.note_privacy where entry_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e8', '00000000-0000-0000-0000-0000000000e9') and is_private;
set role authenticated;

\echo '── the IM doctor reads: the note is "Private note" with Psychiatry''s name; the facts show in full'
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(c->>'display_line' = 'Private note' and c->>'author_name' is null and c->>'department_name' = 'Psychiatry' and (c->>'is_hidden')::boolean, 'the note is hidden, its department named')
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e1';
select t.ok(c->>'display_line' like 'Lithium%' and c->>'author_name' = 'Dr Salma' and c->>'department_name' = 'Psychiatry', 'the lithium shows in full')
  from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'type' = 'prescription';
select t.ok(c->>'display_line' like '%Bipolar%', 'the problem shows') from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e3';
select t.ok(c->>'display_line' like '%Lithium level%', 'the request shows') from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e5';
select t.ok(exists (select 1 from jsonb_array_elements(public.read_record(:'pt', :'im')->'medications') m where m->>'drug_name' = 'Lithium'), 'lithium is on the medication list');
select t.ok(e->'data' = '{}'::jsonb and e->>'display_line' = 'Private note', 'read_entry hides it') from public.read_entry('00000000-0000-0000-0000-0000000000e1') e;
select t.refuses($$select public.read_entry_file('00000000-0000-0000-0000-0000000000e1', 1::smallint)$$, 'private_note');
select t.ok(v->>'department_name' = 'Psychiatry' and (v->>'is_hidden')::boolean and v->>'first_line' like '%Plan reviewed%', 'the visit card: real department, a hidden note, the first readable note')
  from jsonb_array_elements(public.read_visits(:'pt')->'visits') v where v->>'id' = :'pv';
select t.ok(e->>'display_line' like '%Plan reviewed%', 'the responsible clinician reads the note he is responsible for') from public.read_entry('00000000-0000-0000-0000-0000000000e8') e;
select t.ok(e->>'display_line' = 'Private note', 'the visitless Psychiatry note is private too') from public.read_entry('00000000-0000-0000-0000-0000000000e9') e;
select t.ok(r->'hidden_departments'->0->>'department_name' = 'Psychiatry' and (r->'hidden_departments'->0->>'notes')::int = 2, 'the record says where private notes are hidden')
  from public.read_record(:'pt', :'im') r;

\echo '── who reads it: its author and a Doctor at Psychiatry do; the owner, a clerk there without read:record and a machine user do not'
select set_config('request.jwt.claim.sub', :'jps2', false);
select t.ok(jsonb_typeof(public.read_record(:'pt', :'psy')) = 'object', 'a second psychiatrist opens the record');
select t.ok(e->>'display_line' like '%Hears voices%', 'a Doctor at Psychiatry reads it') from public.read_entry('00000000-0000-0000-0000-0000000000e1') e;
select set_config('request.jwt.claim.sub', :'jow', false);
select t.ok(c->>'display_line' = 'Private note', 'the owner (a role held everywhere) does not') from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claim.sub', :'jck', false);
select t.ok(c->>'display_line' = 'Private note', 'a clerk at Psychiatry whose role there does not read the record does not') from jsonb_array_elements(public.read_record(:'pt', :'psy')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e1';
select set_config('request.jwt.claim.sub', :'jmc', false);
select t.ok(c->>'display_line' = 'Private note', 'a machine user holding Doctor at Psychiatry does not') from jsonb_array_elements(public.read_record(:'pt', :'psy')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e1';
select t.refuses($$select public.mark_note_private('00000000-0000-0000-0000-0000000000e1', false, 'test')$$, 'not_allowed');
select t.refuses(format($$select public.read_record(%L, %L, open_department_id := %L, reason := 'Admin')$$, :'pt', :'psy', :'psy'), 'not_allowed');

\echo '── open anyway: a reason, then Psychiatry''s private notes of this patient open to him for 12 hours; logged'
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.refuses(format($$select public.read_record(%L, %L, open_department_id := %L)$$, :'pt', :'im', :'psy'), 'reason_missing');
select t.ok(jsonb_array_length(r->'hidden_departments') = 0, 'opened anyway') from public.read_record(:'pt', :'im', open_department_id := :'psy', reason := 'Emergency') r;
select t.ok(e->>'display_line' like '%Hears voices%', 'the note reads after open anyway') from public.read_entry('00000000-0000-0000-0000-0000000000e1') e;
select t.refuses($$select public.write_note('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f1', null, '00000000-0000-0000-0000-0000000000d1', text := 'edited', replaces_id := '00000000-0000-0000-0000-0000000000e1')$$, 'not_allowed');
reset role;
select t.ok(basis = 'anyway' and opened_department_id = :'psy' and reason_text = 'Emergency', 'the read log says anyway, which department, and why')
  from core.record_reads where user_id = :'dr' and basis = 'anyway';
set role authenticated;

\echo '── making a note private or not: its author or its department; not private needs a reason; every change is listed'
select set_config('request.jwt.claim.sub', :'jd2', false);
select t.ok(jsonb_typeof(public.read_record(:'pt', :'im')) = 'object', 'the second IM doctor opens the record');
select t.refuses($$select public.mark_note_private('00000000-0000-0000-0000-0000000000e1', false, 'curious')$$, 'not_allowed');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.refuses($$select public.mark_note_private('00000000-0000-0000-0000-0000000000e2', true)$$, 'not_a_note');
select t.refuses($$select public.mark_note_private('00000000-0000-0000-0000-0000000000e8', false)$$, 'reason_missing');
select t.ok((public.mark_note_private('00000000-0000-0000-0000-0000000000e8', false, 'agreed with the patient')->>'is_private')::boolean = false, 'its author makes it not private');
select set_config('request.jwt.claim.sub', :'jd2', false);
select t.ok(e->>'display_line' like '%Plan reviewed%', 'now everyone reads it') from public.read_entry('00000000-0000-0000-0000-0000000000e8') e;
select set_config('request.jwt.claim.sub', :'jps2', false);
select t.ok((public.mark_note_private('00000000-0000-0000-0000-0000000000e8', true)->>'is_private')::boolean, 'a Doctor at Psychiatry makes it private again');
select set_config('request.jwt.claim.sub', :'jow', false);
select t.ok(exists (select 1 from jsonb_array_elements(public.read_opened_anyway(:'org')) x where x->>'kind' = 'made_not_private' and x->>'reason_text' = 'agreed with the patient'), 'made not private is listed for review');
select t.ok(exists (select 1 from jsonb_array_elements(public.read_opened_anyway(:'org')) x where x->>'kind' = 'opened' and x->>'reason_text' = 'Emergency' and x->>'opened_department' = 'Psychiatry'), 'opened anyway is listed for review');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.refuses(format($$select public.read_record_reads(%L)$$, :'pt'), 'not_allowed');

\echo '── one private note anywhere: the IM doctor makes his own note private; the psychiatrist cannot read it'
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.ok(status = 'waiting', 'an IM visit') from public.open_visit(:'iv', :'pt', :'im');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(status = 'in_consult', 'seen') from public.mark_visit(:'iv', 'waiting', 'in_consult');
select t.ok(display_line like '%home situation%', 'an IM note') from public.write_note('00000000-0000-0000-0000-0000000000e4', :'pt', :'iv', :'im', text := 'Discussed home situation');
select t.ok((public.mark_note_private('00000000-0000-0000-0000-0000000000e4', true)->>'is_private')::boolean, 'its author makes it private');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(c->>'display_line' = 'Private note' and c->>'department_name' = 'Internal Medicine', 'the psychiatrist sees "Private note" from Internal Medicine')
  from jsonb_array_elements(public.read_record(:'pt', :'psy')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e4';

\echo '── a corrected note keeps its privacy in every version; a struck note can be made private'
select t.ok(replaces_id = '00000000-0000-0000-0000-0000000000e1', 'the psychiatrist corrects her note')
  from public.write_note('00000000-0000-0000-0000-0000000000eb', :'pt', :'pv', :'psy', text := 'Hears voices at night; low mood; no plan', replaces_id := '00000000-0000-0000-0000-0000000000e1');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(display_line like '%Discussed%', 'an IM note') from public.write_note('00000000-0000-0000-0000-0000000000ec', :'pt', :'iv', :'im', text := 'Discussed family conflict');
select t.ok(type = 'entered_in_error', 'struck') from public.write_entered_in_error('00000000-0000-0000-0000-0000000000ed', '00000000-0000-0000-0000-0000000000ec', :'im', 'wrong patient');
select t.ok((public.mark_note_private('00000000-0000-0000-0000-0000000000ed', true)->>'is_private')::boolean, 'a struck note can be made private');
select set_config('request.jwt.claim.sub', :'jd2', false);
select t.ok(e->>'display_line' = 'Private note' and not exists (select 1 from jsonb_array_elements(e->'versions') x where x->>'display_line' <> 'Private note'), 'the correction and its earlier version are both hidden')
  from public.read_entry('00000000-0000-0000-0000-0000000000eb') e;
select t.refuses($$select public.read_entry_file('00000000-0000-0000-0000-0000000000e1', 1::smallint)$$, 'private_note');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(e->>'display_line' = 'Private note', 'the struck IM note''s first version is hidden from Psychiatry') from public.read_entry('00000000-0000-0000-0000-0000000000ec') e;

\echo '── a consult reply is for whoever asked: the requester and his department read it; anyone else sees "Private reply"'
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(display_line like '%lithium%', 'IM asks Psychiatry') from public.write_request('00000000-0000-0000-0000-0000000000e6', :'pt', :'iv', :'im', to_department_id := :'psy', question_text := 'Is lithium still needed?');
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.ok(status = 'waiting', 'the consult visit') from public.open_visit(:'pv2', :'pt', :'psy', request_id := '00000000-0000-0000-0000-0000000000e6');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(display_line like '%continue lithium%', 'the psychiatrist answers, with a value')
  from public.write_note('00000000-0000-0000-0000-0000000000e7', :'pt', :'pv2', :'psy', kind := 'consult_reply', text := 'Yes, continue lithium; level in 3 months',
    reply_to_id := '00000000-0000-0000-0000-0000000000e6', fields := '{"values":[{"code":"loinc:718-7","name":"Hb","value_number":9.9,"unit":"g/dL"}]}');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(c->'request'->>'reply_line' like '%continue lithium%', 'the requester reads the reply') from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e6';
select set_config('request.jwt.claim.sub', :'jd2', false);
select t.ok(c->'request'->>'reply_line' like '%continue lithium%', 'a doctor of the asking department reads it') from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e6';
select set_config('request.jwt.claim.sub', :'jow', false);
select t.ok(c->'request'->>'reply_line' = 'Private reply', 'the owner sees "Private reply"') from jsonb_array_elements(public.read_record(:'pt', :'im')->'entries') c where c->>'id' = '00000000-0000-0000-0000-0000000000e6';
select t.ok((r->'reply'->>'is_hidden')::boolean and r->'reply'->'data' = '{}'::jsonb, 'the queue''s released list hides it from the owner') from jsonb_array_elements(public.read_queue(:'psy')->'recent') r where r->>'id' = '00000000-0000-0000-0000-0000000000e6';
select t.ok(jsonb_typeof(public.read_values(:'pt', array['loinc:718-7'])->'loinc:718-7') is distinct from 'array', 'the reply''s value is not in the owner''s trend');
select t.ok(not (public.read_results_table(:'pt')::text like '%9.9%'), 'nor in the owner''s results over time');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(jsonb_array_length(public.read_values(:'pt', array['loinc:718-7'])->'loinc:718-7') = 1, 'the psychiatrist sees the value');

\echo '── the lists: the department name is real everywhere; Psychiatry''s desk sees its queue; a visit cancelled with nothing written is left out'
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.ok(given_name = 'Hala', 'a second patient') from public.register_patient('00000000-0000-0000-0000-0000000000f9', :'org', 'Hala', 'Nour', 'female', '1990');
select t.ok(status = 'waiting', 'checked into Psychiatry') from public.open_visit('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000f9', :'psy');
select t.ok(exists (select 1 from jsonb_array_elements(public.read_visit_queue(:'psy')->'rows') r where r->>'id' = '00000000-0000-0000-0000-0000000000a9'), 'the desk sees her in Psychiatry''s queue');
select set_config('request.jwt.claim.sub', :'jck', false);
select t.ok(exists (select 1 from jsonb_array_elements(public.read_visit_queue(:'psy')->'rows') r where r->>'id' = '00000000-0000-0000-0000-0000000000a9'), 'Psychiatry''s desk sees its queue');
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.ok(status = 'cancelled', 'checked in by mistake') from public.mark_visit('00000000-0000-0000-0000-0000000000a9', 'waiting', 'cancelled', 'checked in by mistake');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(jsonb_typeof(public.read_record('00000000-0000-0000-0000-0000000000f9', :'psy')) = 'object', 'opened');
select t.ok(jsonb_array_length(public.read_visits('00000000-0000-0000-0000-0000000000f9')->'visits') = 0, 'a visit cancelled with nothing written is not in the record');
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.refuses(format($$select public.read_to_review(%L)$$, :'psy'), 'not_allowed');

\echo '── the read log: a reason is recorded for every open'
reset role;
select t.ok(basis = 'visit', 'the psychiatrist''s first read had a reason: an open visit') from core.record_reads where user_id = :'ps' order by read_at limit 1;
select t.ok(basis = 'none', 'the IM doctor''s first read had none') from core.record_reads where user_id = :'dr' order by read_at limit 1;
select t.ok(basis = 'pack', 'the machine user''s read is logged as such') from core.record_reads where user_id = :'mc' order by read_at limit 1;

-- ════ the K26 review: each finding closed ════
set role authenticated;
\echo '── a request row returned by marking or routing masks a hidden reply'
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(display_line like '%dose%', 'IM asks Psychiatry again') from public.write_request('00000000-0000-0000-0000-0000000000ea', :'pt', :'iv', :'im', to_department_id := :'psy', question_text := 'Which dose?');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(display_line like '%400 mg%', 'a preliminary reply: the request stays open')
  from public.write_note('00000000-0000-0000-0000-0000000000ee', :'pt', null, :'psy', kind := 'consult_reply', text := 'SECRET 400 mg for now', reply_to_id := '00000000-0000-0000-0000-0000000000ea', is_final := false);
select set_config('request.jwt.claim.sub', :'jow', false);
select t.ok(reply_line = 'Private reply' and reply_flag is null, 'the owner''s mark_routing returns "Private reply"') from public.mark_routing('00000000-0000-0000-0000-0000000000ea');
reset role;
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('core', 'public', 'pharmacy') and p.prosrc ~* '\mreply_line\M'
  and p.oid not in ('core.entry_card(core.entries)'::regprocedure, 'core.entry_card(core.entries,uuid[])'::regprocedure, 'core.refold_request(uuid,boolean)'::regprocedure, 'core.masked_request(core.requests,uuid)'::regprocedure)),
  'only entry_card, refold_request and masked_request read requests.reply_line');
select t.ok(coalesce(bool_and(p.prosrc ~ 'core\.masked_request'), true), 'every public function returning a request row masks it')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prorettype = 'core.requests'::regtype;

\echo '── search and the patient read carry no consult question and no visits'
set role authenticated;
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(not (h::text like '%question_text%'), 'search carries no consult question') from jsonb_array_elements(public.read_patients(:'org', 'mona')) h;
select t.ok(not (public.read_patient(:'pt') ? 'visits'), 'read_patient returns no visits');
select t.ok(coalesce(bool_and(x->'compare' = '[]'::jsonb), true), 'the owner''s review comparison shows no value of a hidden reply') from jsonb_array_elements(public.read_to_review(:'im')) x where x->>'id' = '00000000-0000-0000-0000-0000000000e6';

\echo '── the live record channel needs an opened record'
select t.ok(core.may_listen('record:' || :'pt'), 'the IM doctor, who opened Mona''s record, may listen to it');
select t.ok(not core.may_listen('record:00000000-0000-0000-0000-0000000000f9'), 'he may not listen to a record he never opened');
select t.ok(core.may_listen('queue:' || :'im'), 'his own queue channel');

\echo '── only the authors of a note''s own versions or its department change its privacy: a striker does not'
select t.ok(display_line like '%family conflict%', 'an IM note') from public.write_note('00000000-0000-0000-0000-0000000000c1', :'pt', :'iv', :'im', text := 'SECRET family conflict');
select set_config('request.jwt.claim.sub', :'jow', false);
select t.ok(type = 'entered_in_error', 'the owner strikes it') from public.write_entered_in_error('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', :'im', 'wrong patient');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok((public.mark_note_private('00000000-0000-0000-0000-0000000000c1', true)->>'is_private')::boolean, 'its author makes it private');
select set_config('request.jwt.claim.sub', :'jow', false);
select t.refuses($$select public.mark_note_private('00000000-0000-0000-0000-0000000000c1', false, 'audit')$$, 'not_allowed');

\echo '── a correction written under the survivor after a merge stays private'
select set_config('request.jwt.claim.sub', :'jrc', false);
select t.ok(given_name = 'Lina', 'a patient registered twice') from public.register_patient('00000000-0000-0000-0000-0000000000f2', :'org', 'Lina', 'Adel', 'female', '1985');
select t.ok(given_name = 'Lina', 'the second record') from public.register_patient('00000000-0000-0000-0000-0000000000f3', :'org', 'Lina', 'Adel', 'female', '1985');
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(jsonb_typeof(public.read_record('00000000-0000-0000-0000-0000000000f2', :'psy')) = 'object', 'the psychiatrist opens the first record');
select t.ok(display_line like '%first%', 'a private note on the first record') from public.write_note('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-0000000000f2', null, :'psy', text := 'SECRET first version');
reset role;
update core.patients set merged_into_id = '00000000-0000-0000-0000-0000000000f3' where id = '00000000-0000-0000-0000-0000000000f2';
set role authenticated;
select set_config('request.jwt.claim.sub', :'jps', false);
select t.ok(jsonb_typeof(public.read_record('00000000-0000-0000-0000-0000000000f3', :'psy')) = 'object', 'the psychiatrist opens the surviving record');
select t.ok(replaces_id = '00000000-0000-0000-0000-0000000000a7', 'she corrects the note from the survivor')
  from public.write_note('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000000f3', null, :'psy', text := 'SECRET second version', replaces_id := '00000000-0000-0000-0000-0000000000a7');
select set_config('request.jwt.claim.sub', :'jdr', false);
select t.ok(jsonb_typeof(public.read_record('00000000-0000-0000-0000-0000000000f3', :'im')) = 'object', 'the IM doctor opens the surviving record');
select t.ok(e->>'display_line' = 'Private note' and e->'data' = '{}'::jsonb, 'the correction is hidden') from public.read_entry('00000000-0000-0000-0000-0000000000a8') e;
select t.ok(not (public.read_record('00000000-0000-0000-0000-0000000000f3', :'im')::text like '%SECRET%'), 'nothing of it shows in the record');

\echo '── another organization can neither turn Psychiatry''s privacy off nor change its users'
reset role;
insert into core.organizations (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'Other clinic');
insert into core.users (id, organization_id, kind, name, login_id) values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000a2', 'staff', 'Other owner', '11111111-0000-0000-0000-0000000000bb');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-00000000c001', null);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000bb', false);
select t.refuses(format($$select public.save_department(%L, '00000000-0000-0000-0000-0000000000a2', 'clinic', 'Taken over', is_private := false)$$, :'psy'), 'not_found');
select t.refuses(format($$select public.save_user(%L, '00000000-0000-0000-0000-0000000000a2', 'staff', 'Taken over')$$, :'dr'), 'not_found');
reset role;
select t.ok(is_private and name = 'Psychiatry', 'Psychiatry is unchanged') from core.departments where id = :'psy';
select t.ok(name = 'Dr Ali', 'Dr Ali is unchanged') from core.users where id = :'dr';

\echo '── the backfill: notes of private visits, and notes written while a department''s rule was on, unless in its own visit made not private'
select set_config('request.jwt.claim.sub', '', false);
insert into core.departments (id, organization_id, type, name) values ('00000000-0000-0000-0000-0000000000d5', :'org', 'clinic', 'Sexual health');
insert into core.settings_changes (id, organization_id, user_id, table_name, row_id, changes, recorded_at)
  values (gen_random_uuid(), :'org', :'ow', 'departments', '00000000-0000-0000-0000-0000000000d5', '{"private_visits": true}', clock_timestamp() - interval '1 hour');
insert into core.visits (id, organization_id, patient_id, department_id, is_first, status, ended_at) values
  ('00000000-0000-0000-0000-0000000000a4', :'org', '00000000-0000-0000-0000-0000000000f9', :'im', false, 'done', clock_timestamp());   -- an IM visit that was private
insert into core.visits (id, organization_id, patient_id, department_id, is_first) values
  ('00000000-0000-0000-0000-0000000000a5', :'org', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000d5', false),   -- a Sexual health visit made not private by hand
  ('00000000-0000-0000-0000-0000000000a6', :'org', '00000000-0000-0000-0000-0000000000f9', :'im', false);                                   -- an IM visit toggled by hand
insert into core.visit_steps (organization_id, visit_id, position, status, actor_id, changes) values
  (:'org', '00000000-0000-0000-0000-0000000000a5', 1, 'waiting', :'ow', '{"is_private": false}'),
  (:'org', '00000000-0000-0000-0000-0000000000a6', 1, 'waiting', :'ow', '{"is_private": false}');
select (core.write_entry('00000000-0000-0000-0000-0000000000b0', :'org', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000a4', :'im', :'dr', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"in a private visit"}', 'Progress · in a private visit', null, true, null, null, null)).id is not null as written;
select (core.write_entry('00000000-0000-0000-0000-0000000000b8', :'org', '00000000-0000-0000-0000-0000000000f9', null, '00000000-0000-0000-0000-0000000000d5', :'dr', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"no visit"}', 'Progress · no visit', null, true, null, null, null)).id is not null as written;
select (core.write_entry('00000000-0000-0000-0000-0000000000ba', :'org', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000d5', :'dr', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"in an IM visit"}', 'Progress · in an IM visit', null, true, null, null, null)).id is not null as written;
select (core.write_entry('00000000-0000-0000-0000-0000000000bc', :'org', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000d5', :'dr', null, 'staff', null, null, 'note', null, '{"kind":"progress","text":"made not private"}', 'Progress · made not private', null, true, null, null, null)).id is not null as written;
select t.ok(exists (select 1 from core.note_privacy_backfill(array['00000000-0000-0000-0000-0000000000a4'::uuid]) b where b.entry_id = '00000000-0000-0000-0000-0000000000b0' and b.department_id = :'im'), 'a note of a private visit, in its own department');
select t.ok(exists (select 1 from core.note_privacy_backfill('{}') b where b.entry_id = '00000000-0000-0000-0000-0000000000b8'), 'a note of the private department with no visit');
select t.ok(exists (select 1 from core.note_privacy_backfill('{}') b where b.entry_id = '00000000-0000-0000-0000-0000000000ba'), 'its note in another department''s visit, even one toggled by hand there');
select t.ok(not exists (select 1 from core.note_privacy_backfill('{}') b where b.entry_id = '00000000-0000-0000-0000-0000000000bc'), 'not its note in its own visit made not private by hand');

\echo '── erasing a patient with private notes works and leaves no privacy rows'
select public.erase_patient('00000000-0000-0000-0000-0000000000f3', 'duplicate test record');
select t.ok(not exists (select 1 from core.note_privacy where patient_id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3')), 'erased with its private-note rows');
select public.erase_patient(:'pt', 'test');
select t.ok(not exists (select 1 from core.entries where patient_id = :'pt'), 'a patient with consult replies can be erased too');
