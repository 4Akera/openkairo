-- privacy (spec §4.3), ported from privacy: hide the story, never the fact. A private department's notes and results are private; who
-- reads them; opened anyway; privacy per item across corrections and cross-outs; consult replies; hidden values; merge; tenancy; erase
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set psy  '00000000-0000-0000-0000-0000000000d5'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set ps   '11111111-0000-0000-0000-0000000000b8'
\set rc   '11111111-0000-0000-0000-0000000000b4'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set ck   '11111111-0000-0000-0000-0000000000b7'
\set mc   '11111111-0000-0000-0000-0000000000bb'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set pv   '00000000-0000-0000-0000-0000000000a5'
select t.fixture();
-- a second psychiatrist and a second internist
select t.as(:'ow');
select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000be","name":"Dr Nour","login_id":"11111111-0000-0000-0000-0000000000be","holdings":[{"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-0000000000d5"}]}') ->> 'id';
select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000bf","name":"Dr Karim","login_id":"11111111-0000-0000-0000-0000000000bf","holdings":[{"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-0000000000d1"}]}') ->> 'id';
set role authenticated;

create or replace function pg_temp.seen_as(p_login uuid, p_dept uuid, p_id uuid) returns jsonb language sql as $$
  select t.as(p_login); select e from jsonb_array_elements(t.record('00000000-0000-0000-0000-0000000000f1', p_dept, '{"limit":500}') -> 'entries') e where (e ->> 'id')::uuid = p_id
$$;

\echo '── reception checks Mona''s namesake into Psychiatry; everyone''s search shows the real department'
select t.as(:'rc');
select t.landed(t.check_in(:'pv', :'pt', :'desk', :'psy'), 'checked in to Psychiatry');
select t.as(:'dr');
select t.ok(r ->> 'department_id' = :'psy', 'the IM doctor''s search shows Psychiatry') from jsonb_array_elements(public.read(jsonb_build_object('shape', 'patients', 'q', 'ahmed',
  'department_id', :'im', 'include', jsonb_build_object('base.presence', jsonb_build_object('state', 'waiting')))) -> 'tables' -> 'base.presence' -> 'rows') r;

\echo '── the psychiatrist: a note (the story); lithium, a problem, an order (the facts); the IM doctor is assigned; a phone note with no visit'
select t.as(:'ps');
select t.landed(t.w(t.move('called', :'pv', :'psy')), 'called');
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', :'psy', '{"kind":"history_physical","text":"SECRET hears voices at night; low mood"}', '00000000-0000-0000-0000-0000000000e1', :'pv'),
  t.e('medication', :'pt', :'psy', '{"basis":"prescribed","drug":{"text":"Lithium","codings":[{"system":"atc","code":"N05AN01"}]},"dosage":{"dose":{"value":"400","unit":"mg","ucum":"mg"},"timing":{"code":"BD"}},"status":"active"}', '00000000-0000-0000-0000-0000000000e2', :'pv'),
  t.e('problem', :'pt', :'psy', '{"concept":{"text":"Bipolar disorder","codings":[{"system":"icd10","code":"F31.9"}]},"clinical_status":"active","verification":"confirmed"}', '00000000-0000-0000-0000-0000000000e3', :'pv'),
  t.e('order', :'pt', :'psy', '{"service":{"id":"00000000-0000-0000-0000-0000000000c1","code":"cbc","name":"Lithium level"},"department_id":"00000000-0000-0000-0000-0000000000d2","priority":"routine","status":"active"}', '00000000-0000-0000-0000-0000000000e5', :'pv'),
  t.move('assigned', :'pv', :'psy', '{"user_id":"00000000-0000-0000-0000-0000000000b1"}'))), 'the story and the facts, one set');
select t.as(:'dr');
select t.ok(t.try($q$select 1$q$) = 'ok', 'the IM doctor is assigned to the Psychiatry visit');
select t.as(:'ps');
select t.landed(t.w(t.e('note', :'pt', :'psy', '{"kind":"progress","text":"SECRET phoned: sleeping better"}', '00000000-0000-0000-0000-0000000000e9')), 'a Psychiatry note with no visit');
select t.landed(t.w(t.move('done', :'pv', :'psy', '{"wait":false}')), 'done, the level still out');

\echo '── the IM doctor reads: the story is "Private note" with Psychiatry''s name; the facts show in full'
select t.ok(e ->> 'line' = 'Private note' and (e ->> 'hidden')::boolean and e ->> 'author_id' is null and e -> 'data' is null and e ->> 'department_id' = :'psy', 'the note is a placeholder, its department named')
  from pg_temp.seen_as(:'dr', :'im', '00000000-0000-0000-0000-0000000000e9') e;
select t.ok(e ->> 'line' like 'Lithium%' and e ->> 'author_id' = '00000000-0000-0000-0000-0000000000b8', 'the lithium shows in full') from pg_temp.seen_as(:'dr', :'im', '00000000-0000-0000-0000-0000000000e2') e;
select t.ok(e ->> 'line' like 'Bipolar%', 'the problem shows') from pg_temp.seen_as(:'dr', :'im', '00000000-0000-0000-0000-0000000000e3') e;
select t.ok(e ->> 'line' like 'Lithium level%', 'the order shows') from pg_temp.seen_as(:'dr', :'im', '00000000-0000-0000-0000-0000000000e5') e;
select t.ok(exists (select 1 from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.lists' -> 'rows') r where r ->> 'code' = 'atc:N05AN01'), 'lithium is on the medication list');
select t.ok(r -> 'hidden' -> 0 ->> 'department_id' = :'psy' and (r -> 'hidden' -> 0 ->> 'items')::int = 1, 'the record says where private items are: one in Psychiatry') from t.record(:'pt', :'im') r;
select t.ok(not (t.record(:'pt', :'im')::text like '%phoned%'), 'nothing of the phone note anywhere in his record');
select t.ok(e ->> 'line' like '%hears voices%', 'the assigned clinician reads the visit''s note') from pg_temp.seen_as(:'dr', :'im', '00000000-0000-0000-0000-0000000000e1') e;

\echo '── who reads it: its author and a doctor at Psychiatry; not the owner (held everywhere), a clerk there, a machine user there'
select t.ok(e ->> 'line' like '%phoned%', 'a second psychiatrist reads it') from pg_temp.seen_as('11111111-0000-0000-0000-0000000000be', :'psy', '00000000-0000-0000-0000-0000000000e9') e;
select t.ok(e ->> 'line' = 'Private note', 'the owner does not') from pg_temp.seen_as(:'ow', :'im', '00000000-0000-0000-0000-0000000000e9') e;
select t.as(:'ck');
select t.refuses($q$select public.read('{"shape":"record","patient_id":"00000000-0000-0000-0000-0000000000f1","department_id":"00000000-0000-0000-0000-0000000000d5"}')$q$, 'not_allowed');
select t.ok(e ->> 'line' = 'Private note', 'a machine user holding Doctor at Psychiatry does not') from pg_temp.seen_as(:'mc', :'psy', '00000000-0000-0000-0000-0000000000e9') e;
select t.as(:'ow');
select t.refused(t.w(t.e('not_private', :'pt', :'im', '{"reason":"curious"}', null, null, '00000000-0000-0000-0000-0000000000e9', 'about')), 'not_found', 'the owner cannot even address it');

\echo '── open anyway: a reason, then Psychiatry''s private items open to him for 12 hours; flagged and logged'
select t.as('11111111-0000-0000-0000-0000000000bf');
select t.ok(e ->> 'line' = 'Private note', 'a second internist does not read it') from pg_temp.seen_as('11111111-0000-0000-0000-0000000000bf', :'im', '00000000-0000-0000-0000-0000000000e9') e;
select t.refused(t.w(t.e('opened_anyway', :'pt', :'im', jsonb_build_object('department_id', :'psy', 'reason', 'other', 'text', 'x'))), 'reason_missing');
select t.flagged(t.w(t.e('opened_anyway', :'pt', :'im', jsonb_build_object('department_id', :'psy', 'reason', 'ETREAT'))), 'opened_anyway', 'opened anyway (emergency)');
select t.ok(e ->> 'line' like '%phoned%', 'the note reads after open anyway')
  from jsonb_array_elements(t.record(:'pt', :'im', '{"purpose":"BTG","reason":"Emergency"}') -> 'entries') e where e ->> 'id' = '00000000-0000-0000-0000-0000000000e9';
select t.refused(t.w(t.e('note', :'pt', :'im', '{"text":"edited"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e9')), 'not_allowed', 'opening is not writing: no correction');
reset role;
select t.ok(exists (select 1 from core.read_log where user_id = '00000000-0000-0000-0000-0000000000bf' and purpose = 'BTG' and reason = 'Emergency'), 'the read log says BTG and why');
set role authenticated;
select t.as(:'dr');
select t.ok(exists (select 1 from t.rows('base.review', :'im', '{"why":"flag"}') r where r ->> 'level' = 'opened_anyway'), 'opened anyway waits for review in his department');

\echo '── private or not: its author or its department; not private needs a reason; the story shows when not private'
select t.as('11111111-0000-0000-0000-0000000000bf');
select t.refused(t.w(t.e('not_private', :'pt', :'im', '{"reason":"curious"}', null, null, '00000000-0000-0000-0000-0000000000e9', 'about')), 'not_allowed', 'a reader who opened anyway');
select t.as(:'ps');
select t.refused(t.w(t.e('private', :'pt', :'psy', '{}', null, null, '00000000-0000-0000-0000-0000000000e2', 'about')), 'never_private', 'the lithium');
select t.refused(t.w(t.e('not_private', :'pt', :'psy', '{"reason":""}', null, null, '00000000-0000-0000-0000-0000000000e9', 'about')), 'reason_missing');
select t.flagged(t.w(t.e('not_private', :'pt', :'psy', '{"reason":"agreed with the patient"}', null, null, '00000000-0000-0000-0000-0000000000e9', 'about')), 'made_not_private');
select t.ok(e ->> 'line' like '%phoned%', 'now the owner reads it') from pg_temp.seen_as(:'ow', :'im', '00000000-0000-0000-0000-0000000000e9') e;
select t.as(:'ps');
select t.landed(t.w(t.e('private', :'pt', :'psy', '{}', null, null, '00000000-0000-0000-0000-0000000000e9', 'about')), 'private again');
select t.ok(e ->> 'line' = 'Private note', 'hidden again') from pg_temp.seen_as(:'ow', :'im', '00000000-0000-0000-0000-0000000000e9') e;

\echo '── one private note anywhere: the IM doctor makes his own note private; the psychiatrist cannot read it'
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a6', :'pt', :'desk', :'im'), 'an IM visit');
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(t.move('called', '00000000-0000-0000-0000-0000000000a6', :'im'),
  t.e('note', :'pt', :'im', '{"text":"SECRET discussed home situation"}', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000a6'),
  t.e('private', :'pt', :'im', '{}', null, null, '00000000-0000-0000-0000-0000000000e4', 'about'))), '! at the start of a line: the note and its privacy in one set');
select t.ok(e ->> 'line' = 'Private note' and e ->> 'department_id' = :'im', 'the psychiatrist sees "Private note" from Internal Medicine')
  from pg_temp.seen_as(:'ps', :'psy', '00000000-0000-0000-0000-0000000000e4') e;

\echo '── a corrected private note keeps its privacy in every version; a crossed-out note can be made private'
select t.as(:'ps');
select t.ok(r -> 'entries' -> 0 ->> 'item' = '00000000-0000-0000-0000-0000000000e1', 'the psychiatrist corrects her note')
  from t.w(t.e('note', :'pt', :'psy', '{"text":"SECRET hears voices (corrected)"}', '00000000-0000-0000-0000-0000000000e6', :'pv', null, null, '00000000-0000-0000-0000-0000000000e1')) r;
select t.ok(not exists (select 1 from jsonb_array_elements(public.read(jsonb_build_object('shape', 'item', 'item', '00000000-0000-0000-0000-0000000000e1', 'department_id', :'im')) -> 'entries') x
  where x -> 'data' is not null and x ->> 'type' = 'note'), 'both versions are hidden from the owner') from (select t.as(:'ow')) a;
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'pt', :'im', '{"text":"SECRET family conflict"}', '00000000-0000-0000-0000-0000000000ec', '00000000-0000-0000-0000-0000000000a6')), 'an IM note');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"wrong_patient"}', '00000000-0000-0000-0000-0000000000ed', null, null, null, '00000000-0000-0000-0000-0000000000ec')), 'crossed out');
select t.landed(t.w(t.e('private', :'pt', :'im', '{}', null, null, '00000000-0000-0000-0000-0000000000ed', 'about')), 'a crossed-out note can be made private');
select t.ok(e ->> 'line' = 'Private note', 'its first version is hidden from Psychiatry') from pg_temp.seen_as(:'ps', :'psy', '00000000-0000-0000-0000-0000000000ec') e;

\echo '── a striker is not an author: the owner crosses out an IM note; the owner cannot make it not private'
select t.as(:'dr');
select t.landed(t.w(t.e('note', :'pt', :'im', '{"text":"SECRET another"}', '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000a6')), 'an IM note');
select t.as(:'ow');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"other","text":"audit"}', null, null, null, null, '00000000-0000-0000-0000-0000000000c7')), 'the owner crosses it out');
select t.as(:'dr');
select t.landed(t.w(t.e('private', :'pt', :'im', '{}', null, null, '00000000-0000-0000-0000-0000000000c7', 'about')), 'its author makes it private');
select t.as(:'ow');
select t.refused(t.w(t.e('not_private', :'pt', :'im', '{"reason":"audit"}', null, null, '00000000-0000-0000-0000-0000000000c7', 'about')), 'not_found', 'the striker cannot');

\echo '── a consult reply is for whoever asked: the requester and his department read it; anyone else sees "Private note"'
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'pt', :'im', '{"service":{"id":"00000000-0000-0000-0000-0000000000c5","code":"psych","name":"Psychiatry consult"},"department_id":"00000000-0000-0000-0000-0000000000d5","priority":"routine","status":"active","question":"Is lithium still needed?"}',
  '00000000-0000-0000-0000-0000000000f6')), 'IM asks Psychiatry');
select t.as(:'ps');
select t.landed(t.w(t.e('note', :'pt', :'psy', '{"kind":"consult","text":"SECRET continue lithium, level 0.8"}', '00000000-0000-0000-0000-0000000000f7', null, '00000000-0000-0000-0000-0000000000f6', 'answers')), 'the psychiatrist answers');
select t.ok(e ->> 'line' like '%continue lithium%', 'the requester reads the reply') from pg_temp.seen_as(:'dr', :'im', '00000000-0000-0000-0000-0000000000f7') e;
select t.ok(e ->> 'line' like '%continue lithium%', 'a doctor of the asking department reads it') from pg_temp.seen_as('11111111-0000-0000-0000-0000000000bf', :'im', '00000000-0000-0000-0000-0000000000f7') e;
select t.ok(e ->> 'line' = 'Private note', 'the owner does not') from pg_temp.seen_as(:'ow', :'im', '00000000-0000-0000-0000-0000000000f7') e;
select t.as(:'ow');
select t.ok(o -> 'answers' ->> 0 = '00000000-0000-0000-0000-0000000000f7' and (r -> 'tables' -> 'base.orders' -> 'entries' -> '00000000-0000-0000-0000-0000000000f7' ->> 'hidden')::boolean,
  'the order shows answered; its answer is a placeholder') from t.record(:'pt', :'im') r, jsonb_array_elements(r -> 'tables' -> 'base.orders' -> 'rows') o where o ->> 'item' = '00000000-0000-0000-0000-0000000000f6';

\echo '── a private result: its values vanish from the others'' trends'
select t.as(:'ps');
select t.landed(t.w(t.e('result', :'pt', :'psy', '{"status":"final","code":{"text":"Lithium level"},"analytes":[{"key":"li","name":"Lithium","code":{"system":"loinc","code":"14334-7"},"value":{"value":"9.9","ucum":"mmol/L"},"interpretation":"HH"}]}',
  '00000000-0000-0000-0000-0000000000f8')), 'an outside lithium level, recorded in Psychiatry');
select t.as(:'ow');
select t.ok(not exists (select 1 from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.values' -> 'rows') v where v ->> 'value' = '9.9'), 'not in the owner''s trend');
select t.ok(not (t.record(:'pt', :'im')::text like '%9.9%'), 'nowhere in the owner''s record');
select t.as(:'ps');
select t.ok(exists (select 1 from jsonb_array_elements(t.record(:'pt', :'psy') -> 'tables' -> 'base.values' -> 'rows') v where v ->> 'value' = '9.9'), 'the psychiatrist sees the value');

\echo '── lists and queues: department names are real everywhere; Psychiatry''s desk sees its queue; the review list is its reviewers'''
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a9', :'pt', :'desk', :'psy'), 'back in Psychiatry');
select t.as(:'ck');
select t.ok(exists (select 1 from t.rows('base.presence', :'psy', jsonb_build_object('department_id', :'psy')) r where r ->> 'item' = '00000000-0000-0000-0000-0000000000a9'), 'Psychiatry''s clerk sees its queue');
select t.refuses($q$select public.read('{"shape":"table","table":"base.review","department_id":"00000000-0000-0000-0000-0000000000d5"}')$q$, 'not_allowed');
select t.as(:'rc');
select t.landed(t.w(t.e('crossed_out', :'pt', :'desk', '{"reason":"typo"}', null, null, null, null, '00000000-0000-0000-0000-0000000000a9')), 'checked in by mistake: crossed out');
select t.ok(not exists (select 1 from t.rows('base.presence', :'desk', '{}') r where r ->> 'item' = '00000000-0000-0000-0000-0000000000a9'), 'a crossed-out visit is gone');

\echo '── the read log: every read, with its purpose; the machine user''s read too'
reset role;
select t.ok(count(*) >= 1, 'the psychiatrist''s reads are logged (TREAT)') from core.read_log where user_id = '00000000-0000-0000-0000-0000000000b8' and purpose = 'TREAT';
select t.ok(count(*) >= 1, 'the machine user''s read is logged') from core.read_log where user_id = '00000000-0000-0000-0000-0000000000bb';
set role authenticated;
select t.as(:'dr');
select t.refuses($q$select public.read('{"shape":"log"}')$q$, 'not_allowed');
select t.as(:'ow');
select t.ok(jsonb_array_length(public.read('{"shape":"log","patient_id":"00000000-0000-0000-0000-0000000000f1"}') -> 'reads') >= 3, 'the owner reads the read log');

\echo '── the live record channel needs a recent read; the organization channel is everyone''s'
select t.as(:'dr');
select t.ok(core.may_listen('record:' || :'pt'), 'he read Ahmed''s record: he may listen');
select t.ok(not core.may_listen('record:00000000-0000-0000-0000-000000000099'), 'not to a record he never read');
select t.ok(core.may_listen('organization:00000000-0000-0000-0000-0000000000a1') and not core.may_listen('organization:00000000-0000-0000-0000-0000000000a2'), 'his organization''s channel only');

\echo '── a correction written under the survivor after a merge stays private'
select t.as(:'rc');
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000f2', 'given', jsonb_build_array('Lina'), 'family', 'Adel', 'gender', 'female'))) -> 'patient' ->> 'number') as lina;
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000f3', 'given', jsonb_build_array('Lina'), 'family', 'Adel', 'gender', 'female'))) -> 'patient' ->> 'number') as lina_again;
select t.as(:'ps');
select t.landed(t.w(t.e('note', '00000000-0000-0000-0000-0000000000f2', :'psy', '{"text":"SECRET first version"}', '00000000-0000-0000-0000-0000000000a7')), 'a private note on the first record');
select t.as(:'rc');
select t.ok(public.merge_patients(jsonb_build_object('department_id', :'desk', 'from', '00000000-0000-0000-0000-0000000000f2', 'into', '00000000-0000-0000-0000-0000000000f3', 'reason', 'registered twice')) ->> 'survivor'
  = '00000000-0000-0000-0000-0000000000f3', 'merged into the second record');
select t.as(:'ps');
select t.ok(r -> 'entries' -> 0 ->> 'item' = '00000000-0000-0000-0000-0000000000a7', 'she corrects the note from the survivor')
  from t.w(t.e('note', '00000000-0000-0000-0000-0000000000f3', :'psy', '{"text":"SECRET second version"}', '00000000-0000-0000-0000-0000000000a8', null, null, null, '00000000-0000-0000-0000-0000000000a7')) r;
select t.as(:'dr');
select t.ok(not (public.read('{"shape":"record","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1"}')::text like '%SECRET%'), 'nothing of it shows from either record');
select t.ok(public.read('{"shape":"record","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1"}') -> 'patient' ->> 'id' = '00000000-0000-0000-0000-0000000000f3', 'the merged record reads as its survivor');

\echo '── another organization can neither change Psychiatry nor its people'
reset role;
insert into core.organizations (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'Other');
insert into core.users (organization_id, id, login_id, kind, name) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c9', '11111111-0000-0000-0000-0000000000c9', 'staff', 'Their owner');
insert into core.holdings (organization_id, user_id, role_id, department_id) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-00000000c001', null);
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000c9');
select t.refuses(format($q$select public.save('department', '{"id":"%s","name":"Taken over","work":"visits"}')$q$, :'psy'), 'not_found');
select t.refuses($q$select public.write_setting('{"key":"department.private","owner_id":"00000000-0000-0000-0000-0000000000d5","data":{"private":false}}')$q$, 'not_found');
select t.refuses($q$select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b1","name":"Taken over"}')$q$, 'not_found');
select t.ok(jsonb_array_length(public.read('{"shape":"patients","q":"ahmed"}') -> 'patients') = 0, 'their search finds none of ours');
reset role;
select t.ok((core.setting_at('00000000-0000-0000-0000-0000000000a1', 'department.private', :'psy') ->> 'private')::boolean and (select name from core.departments where id = :'psy') = 'Psychiatry', 'Psychiatry is unchanged');

\echo '── erasing a patient with private notes and consult replies works and leaves nothing'
update core.server_settings set value = 'off' where key = 'require_mfa';
set role authenticated;
select t.as(:'ow');
select t.ok((public.erase_patient(jsonb_build_object('patient_id', :'pt', 'reason', 'the law')) ->> 'rows')::int > 0, 'erased');
reset role;
select t.ok(not exists (select 1 from core.entries where patient_id = :'pt') and not exists (select 1 from base.values where patient_id = :'pt')
  and not exists (select 1 from core.read_log where patient_id = :'pt') and not exists (select 1 from core.patients where id = :'pt'), 'nothing of him is left');
select t.ok(exists (select 1 from core.erasures where reason = 'the law' and rows_removed > 0), 'the log keeps only the fact');
