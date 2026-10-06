-- the base facts on the banner (spec §5.1 rule 3, §4.1): pregnant and breastfeeding as base types with their shapes and checks, each
-- current until a version ends it (once); alerts written and ended the same way, never naming HIV; their lines and their FHIR
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set mona '00000000-0000-0000-0000-0000000000f5'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b4');
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'mona', 'given', jsonb_build_array('Mona'),
  'family', 'Fathy', 'gender', 'female', 'birth_date', '1994-05-02'))) ->> 'created') is not null as registered;
select t.as(:'dr');

\echo '── declared in the base: shapes, checks, lines, FHIR; doctors and nurses write them'
reset role;
select t.ok(count(*) = 2 and bool_and(layer = 'base' and to_fhir is not null and line is not null and cardinality(checks) = 1 and resources = array['Observation']),
  'pregnancy and breastfeeding: base types with a line, a check and an Observation') from core.types where key in ('pregnancy', 'breastfeeding');
select t.ok((select checks[1]::text from core.types where key = 'alert') = 'base.fact_check(jsonb,jsonb)', 'the alert has the facts'' check');
select t.ok(count(*) = 6, 'the Doctor and the Nurse write them') from core.role_actions a
 where a.role_id in ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003') and a.action in ('write:pregnancy', 'write:breastfeeding', 'write:alert');
set role authenticated;
select t.as(:'dr');

\echo '── the shapes'
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"pregnant":true}')), 'bad_shape', 'no status');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":"yes"}')), 'bad_shape', 'pregnant is yes or no');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":true,"weeks":50}')), 'bad_shape', 'weeks above 45');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":true,"edd":"2027-01-01"}')), 'bad_shape', 'no key the shape lacks');
select t.refused(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"over","breastfeeding":true}')), 'bad_shape', 'status current or ended');

\echo '── the checks'
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":false,"weeks":12}')), 'dates_not_pregnant');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', jsonb_build_object('status', 'current', 'pregnant', true, 'weeks', 12,
  'lmp', jsonb_build_object('value', to_char(current_date - 84, 'YYYY-MM-DD'), 'precision', 'day')))), 'lmp_or_weeks');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', jsonb_build_object('status', 'current', 'pregnant', true,
  'lmp', jsonb_build_object('value', to_char(current_date + 20, 'YYYY-MM-DD'), 'precision', 'day')))), 'lmp_future');
select t.warned(t.w(t.e('pregnancy', :'mona', :'im', jsonb_build_object('status', 'current', 'pregnant', true,
  'lmp', jsonb_build_object('value', to_char(current_date - 400, 'YYYY-MM-DD'), 'precision', 'day')))), 'lmp_long_ago');
select t.warned(t.w(t.e('pregnancy', :'pt', :'im', '{"status":"current","pregnant":true}')), 'sex_male', 'a man recorded pregnant asks first');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"ended","pregnant":true}')), 'nothing_to_end', 'an end changes a fact');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation · HIV"},"status":"active"}')), 'names_hiv');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation","codings":[{"system":"local.alert","code":"isolation","display":"HIV positive"}]},"status":"active"}')), 'names_hiv', 'nor in a coding');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation AIDS"},"status":"active"}')), 'names_hiv', 'nor AIDS');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation - human immunodeficiency virus"},"status":"active"}')), 'names_hiv', 'nor spelled out');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation","codings":[{"system":"icd10","code":"B20"}]},"status":"active"}')), 'names_hiv', 'nor its ICD-10 code, with no display');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation HIV1"},"status":"active"}')), 'names_hiv', 'HIV1: a digit after it');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation","codings":[{"system":"local.alert","code":"isolation_hiv"}]},"status":"active"}')), 'names_hiv', 'a code isolation_hiv');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation"},"note":"HIV positive","status":"active"}')), 'names_hiv', 'nor in the note');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation · HIV"},"status":"inactive"}')), 'names_hiv', 'in no version, an inactive one too');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":true,"lmp":{"value":"2025-02-30","precision":"day"}}')), 'bad_lmp', 'an LMP that is not a day is refused, never raised');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":true,"lmp":{"value":"2025-13","precision":"month"}}')), 'bad_lmp', 'nor a month 13');

\echo '── pregnant with an LMP, then breastfeeding; their lines'
select t.landed(t.w(t.e('pregnancy', :'mona', :'im', jsonb_build_object('status', 'current', 'pregnant', true,
  'lmp', jsonb_build_object('value', to_char(current_date - 70, 'YYYY-MM-DD'), 'precision', 'day')), '00000000-0000-0000-0000-0000000000e1')), 'pregnant, LMP 10 weeks ago');
select t.landed(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"current","breastfeeding":true}', '00000000-0000-0000-0000-0000000000e2')), 'breastfeeding');
select t.ok(t.entry(r, '00000000-0000-0000-0000-0000000000e1') ->> 'line' = 'Pregnant · LMP ' || to_char(current_date - 70, 'YYYY-MM-DD')
  and t.entry(r, '00000000-0000-0000-0000-0000000000e2') ->> 'line' = 'Breastfeeding', 'their lines') from t.record(:'mona', :'im', '{"types":["pregnancy","breastfeeding"]}') r;
select t.as(:'nurse');
select t.landed(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":true,"weeks":11}', '00000000-0000-0000-0000-0000000000e3', null,
  '00000000-0000-0000-0000-0000000000e1', 'changes')), 'the nurse changes it: 11 weeks by scan');

\echo '── ending a fact: once; a correction still lands'
select t.landed(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"ended","breastfeeding":true}', '00000000-0000-0000-0000-0000000000e4', null,
  '00000000-0000-0000-0000-0000000000e2', 'changes')), 'breastfeeding ended');
select t.refused(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"ended","breastfeeding":true}', null, null, '00000000-0000-0000-0000-0000000000e4', 'changes')), 'already_ended');
select t.refused(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"current","breastfeeding":true}', null, null, '00000000-0000-0000-0000-0000000000e4', 'changes')),
  'already_ended', 'an ended fact is over: a new one starts its own item');
select t.landed(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"ended","breastfeeding":true,"note":"weaned"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e4')),
  'a correction of the end lands');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"ended","pregnant":true}', null, null, '00000000-0000-0000-0000-0000000000e2', 'changes')),
  'wrong_target', 'a pregnancy cannot end the breastfeeding');
select t.ok((r -> 'entries' -> 0 ->> 'item_version')::int = 3 and r -> 'entries' -> 0 -> 'data' ->> 'status' = 'ended',
  'the item: version 3, ended') from t.record(:'mona', :'im', '{"types":["breastfeeding"],"limit":1}') r;

\echo '── an alert: written, then ended'
select t.landed(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation · HBV","codings":[{"system":"local.alert","code":"isolation_hbv","display":"Isolation · HBV"}]},"status":"active"}',
  '00000000-0000-0000-0000-0000000000e5')), 'isolation for HBV');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation · HBV"},"status":"inactive"}')), 'nothing_to_end');
select t.landed(t.w(t.e('alert', :'mona', :'im', jsonb_build_object('concept', '{"text":"Isolation · HBV"}'::jsonb, 'status', 'inactive', 'period', jsonb_build_object('end', now())),
  '00000000-0000-0000-0000-0000000000e6', null, '00000000-0000-0000-0000-0000000000e5', 'changes')), 'ended');
select t.refused(t.w(t.e('alert', :'mona', :'im', '{"concept":{"text":"Isolation · HBV"},"status":"inactive"}', null, null, '00000000-0000-0000-0000-0000000000e6', 'changes')), 'already_ended');

\echo '── FHIR: one Observation each, valid R4 choices, codes that resolve'
select t.landed(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"ended","pregnant":true,"weeks":11,"reason":"delivered"}', '00000000-0000-0000-0000-0000000000e7', null,
  '00000000-0000-0000-0000-0000000000e3', 'changes')), 'the pregnancy ended: delivered');
select t.as(:'dr');
create temp table res as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'mona', 'department_id', :'im')) -> 'entry') e;
reset role;
select t.ok(r -> 'code' -> 'coding' -> 0 ->> 'code' = '82810-3' and r -> 'valueCodeableConcept' -> 'coding' -> 0 ->> 'code' = 'LA15173-0'
  and r -> 'component' -> 0 -> 'valueQuantity' ->> 'code' = 'wk' and r ? 'effectivePeriod' and not r ? 'effectiveDateTime' and r ->> 'status' = 'amended',
  'the pregnancy: 82810-3, Pregnant, weeks in wk, ended as a period') from res where r ->> 'id' = '00000000-0000-0000-0000-0000000000e1';
select t.ok(r -> 'code' -> 'coding' -> 0 ->> 'code' = '63895-7' and (r ->> 'valueBoolean')::boolean and r ? 'effectivePeriod', 'breastfeeding: 63895-7, yes, a period')
  from res where r ->> 'id' = '00000000-0000-0000-0000-0000000000e2';
select t.ok(not exists (select 1 from res, lateral jsonb_path_query(r, 'strict $.**.coding[*]') c
  where c ->> 'system' = 'http://loinc.org' and not exists (select 1 from core.codes x where x.system = 'loinc' and x.code = c ->> 'code')), 'every LOINC coding is a known code');
select t.ok(r ->> 'status' = 'inactive' and r -> 'code' ->> 'text' = 'Isolation · HBV', 'the ended alert: an inactive Flag') from res where r ->> 'id' = '00000000-0000-0000-0000-0000000000e5';

\echo '── one current fact at a time; an end long after the LMP needs no warning'
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('pregnancy', :'mona', :'im', jsonb_build_object('status', 'current', 'pregnant', true,
  'lmp', jsonb_build_object('value', to_char(current_date - 46 * 7, 'YYYY-MM-DD'), 'precision', 'day')), '00000000-0000-0000-0000-0000000000e8', null, null, null, null,
  jsonb_build_object('occurred_at', now() - interval '20 weeks'))), 'a pregnancy written 20 weeks ago, at 26 weeks by the LMP');
select t.refused(t.w(t.e('pregnancy', :'mona', :'im', '{"status":"current","pregnant":true,"weeks":20}')), 'already_recorded', 'a second current pregnancy: change the one recorded');
select t.landed(t.w(t.e('pregnancy', :'mona', :'im', jsonb_build_object('status', 'ended', 'pregnant', true, 'reason', 'delivered',
  'lmp', jsonb_build_object('value', to_char(current_date - 46 * 7, 'YYYY-MM-DD'), 'precision', 'day')), null, null, '00000000-0000-0000-0000-0000000000e8', 'changes')),
  'ended at the postnatal visit, 46 weeks after the LMP: no lmp_long_ago');
select t.landed(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"current","breastfeeding":true}', '00000000-0000-0000-0000-0000000000e9')), 'breastfeeding again: a new item, the old one ended');
select t.refused(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"current","breastfeeding":false}')), 'already_recorded', 'nor two current breastfeeding facts');
select t.landed(t.w(t.e('breastfeeding', :'mona', :'im', '{"status":"current","breastfeeding":false}', null, null, '00000000-0000-0000-0000-0000000000e9', 'changes')), 'the standing one changed');
