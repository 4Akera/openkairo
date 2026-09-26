-- a clinic day through write and read, as the users the JWT names (ported from smoke_api)
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set rn   '11111111-0000-0000-0000-0000000000b3'
\set lt   '11111111-0000-0000-0000-0000000000b2'
select t.fixture();
set role authenticated;

\echo '── the nurse cannot prescribe; she writes vitals'
select t.as(:'rn');
select t.refused(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin"},"status":"active"}')), 'not_allowed', 'the nurse prescribes');
select t.landed(t.w(t.e('vitals', :'pt', :'im', '{"bp":{"sys":{"value":"148","ucum":"mm[Hg]"},"dia":{"value":"92","ucum":"mm[Hg]"}},"hr":{"value":"78","ucum":"/min"},"weight":{"value":"84","unit":"kg","ucum":"kg"},"height":{"value":"175","ucum":"cm"}}')), 'vitals');

\echo '── the doctor: one Done = problem + medication + order + note + list review, all or nothing'
select t.as(:'dr');
select t.ok(r ->> 'outcome' = 'landed' and jsonb_array_length(r -> 'entries') = 5 and (select count(distinct e ->> 'item') from jsonb_array_elements(r -> 'entries') e) = 5, 'five entries, five items, one set')
  from t.w(jsonb_build_array(
    t.e('problem', :'pt', :'im', '{"concept":{"text":"Type 2 diabetes mellitus","codings":[{"system":"icd10","code":"E11.9"}]},"clinical_status":"active","verification":"confirmed","onset":{"value":"2019","precision":"year"}}', '00000000-0000-0000-0000-0000000000e2'),
    t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin","codings":[{"system":"atc","code":"A10BA02"}]},"dosage":{"dose":{"value":"500","unit":"mg","ucum":"mg"},"timing":{"code":"BD","frequency":2,"period":1,"period_unit":"d"},"route":"oral"},"reasons":[{"to":"item","id":"00000000-0000-0000-0000-0000000000e2"}],"status":"active"}', '00000000-0000-0000-0000-0000000000e3'),
    t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'), 'department_id', :'labd', 'priority', 'urgent', 'status', 'active'), '00000000-0000-0000-0000-0000000000e4'),
    t.e('note', :'pt', :'im', '{"kind":"plan","text":"Start metformin. CBC today. RTC 12 weeks."}', '00000000-0000-0000-0000-0000000000e5'),
    t.e('list_review', :'pt', :'im', '{"list":"allergies","outcome":"none_known"}', '00000000-0000-0000-0000-0000000000e6'))) r;
select t.ok(string_agg(r ->> 'list' || ':' || (r ->> 'status'), ' ' order by r ->> 'list') = 'medications:active problems:active reviews:allergies', 'the lists: '
  || string_agg(r ->> 'list' || ':' || (r ->> 'status'), ' ' order by r ->> 'list')) from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.lists' -> 'rows') r;
select t.ok(e ->> 'line' = 'Metformin 500 mg BD', 'the medication line: ' || (e ->> 'line')) from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') e where e ->> 'id' = '00000000-0000-0000-0000-0000000000e3';
select t.ok(r ->> 'priority' = 'urgent' and r ->> 'to_department_id' = :'labd' and r ->> 'status' = 'active', 'the CBC to the lab, urgent') from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e4')) r;

\echo '── a set with a bad entry writes nothing'
select t.refused(t.w(jsonb_build_array(
  t.e('note', :'pt', :'im', '{"kind":"progress","text":"x"}', '00000000-0000-0000-0000-0000000000e7'),
  t.e('problem', :'pt', :'im', '{"concept":{"text":"x"},"clinical_status":"resolved","verification":"confirmed"}', '00000000-0000-0000-0000-0000000000e8', null, null, null, '00000000-0000-0000-0000-000000000099'))), 'not_found', 'a correction of nothing');
reset role;
select t.ok(not exists (select 1 from core.entries where id = '00000000-0000-0000-0000-0000000000e7'), 'the note of the refused set was not written');
set role authenticated;

\echo '── the lab: its bench, a step, a critical haemoglobin'
select t.as(:'lt');
select t.ok(count(*) = 1 and min(r ->> 'service_name') = 'Complete blood count', 'the bench shows the CBC') from t.rows('base.orders', :'labd', jsonb_build_object('to_department_id', :'labd', 'status', jsonb_build_array('active', 'in-progress'))) r;
select t.landed(t.w(t.e('step', :'pt', :'labd', '{"status":"in-progress","specimen":"L-1"}', '00000000-0000-0000-0000-0000000000e9', null, '00000000-0000-0000-0000-0000000000e4', 'answers')), 'started');
select t.ok(r ->> 'status' = 'in-progress' and r ->> 'step' = 'in-progress', 'in progress') from t.rows('base.orders', :'labd', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e4')) r;
select t.landed(t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'final', 'service', jsonb_build_object('id', :'cbc', 'name', 'CBC'), 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'hb', 'name', 'Hb', 'code', jsonb_build_object('system', 'loinc', 'code', '718-7'), 'value', jsonb_build_object('value', '6.4', 'unit', 'g/dL', 'ucum', 'g/dL'), 'interpretation', 'LL'))),
  '00000000-0000-0000-0000-0000000000ea', null, '00000000-0000-0000-0000-0000000000e4', 'answers')), 'a critical Hb');
select t.ok(r ->> 'status' = 'completed', 'the order is completed') from t.rows('base.orders', :'labd', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e4')) r;

\echo '── the doctor: my results, critical first; reviewed clears it; the record'
select t.as(:'dr');
select t.ok(r ->> 'why' in ('not_seen', 'critical') and (r ->> 'critical')::boolean and r ->> 'for_user' = '00000000-0000-0000-0000-0000000000b1', 'the critical result waits for its requester')
  from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r;
select t.landed(t.w(t.e('reviewed', :'pt', :'im', '{}', null, null, '00000000-0000-0000-0000-0000000000ea', 'about')), 'reviewed');
select t.ok(count(*) = 0, 'nothing left to review') from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r;
select t.ok(r -> 'patient' ->> 'full_name' = 'Ahmed Hassan' and jsonb_array_length(r -> 'entries') >= 6 and r -> 'entries' -> 0 ->> 'type' = 'result', 'the record: newest first')
  from t.record(:'pt', :'im') r;
select t.ok(o -> 'answers' ->> 0 = '00000000-0000-0000-0000-0000000000ea' and (t.record(:'pt', :'im') -> 'tables' -> 'base.orders' -> 'entries' -> '00000000-0000-0000-0000-0000000000ea' ->> 'line') like 'CBC%',
  'the CBC order carries its answer') from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.orders' -> 'rows') o;

\echo '── trends: the values over time'
select t.ok(count(*) = 1, 'Hb in the trend') from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.values' -> 'rows') v where v ->> 'code' = 'loinc:718-7';
select t.ok(count(*) = 2, 'BP systolic and diastolic in the trend') from jsonb_array_elements(t.record(:'pt', :'im') -> 'tables' -> 'base.values' -> 'rows') v where v ->> 'key' like 'bp.%';

\echo '── the lab technician may not read the record; the read log keeps every read'
select t.as(:'lt');
select t.refuses($q$select public.read('{"shape":"record","patient_id":"00000000-0000-0000-0000-0000000000f1","department_id":"00000000-0000-0000-0000-0000000000d2"}')$q$, 'not_allowed');
reset role;
select t.ok(count(*) >= 1 and bool_and(purpose = 'TREAT'), 'the doctor''s reads are logged') from core.read_log where user_id = '00000000-0000-0000-0000-0000000000b1' and patient_id = :'pt';
