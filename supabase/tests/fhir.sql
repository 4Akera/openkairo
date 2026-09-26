-- permanent test 6 · FHIR (spec §6.4, §8): a patient with every kind of entry exports as an R4 Bundle and an International Patient
-- Summary whose resources pass the structural checks: ids, required elements, references that resolve, codings with systems, UCUM units
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
select t.fixture();
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b4');
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'pt', 'identifiers', jsonb_build_array(jsonb_build_object('system', 'eg-national-id', 'value', '26803140100011')),
  'address', jsonb_build_object('text', '12 Tahrir St', 'city', 'Cairo', 'governorate', 'EG-C')))) ->> 'created') as identity_changed;
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a1', :'pt', :'desk', :'im', '{"reason":"cough"}'), 'checked in');
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(t.w(jsonb_build_array(
  t.move('called', '00000000-0000-0000-0000-0000000000a1', :'im', '{}', '00000000-0000-0000-0000-0000000000c0'),
  t.e('vitals', :'pt', :'im', '{"bp":{"sys":{"value":"148","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"92","unit":"mmHg","ucum":"mm[Hg]"}},"hr":{"value":"78","ucum":"/min"},"temp":{"value":"37.2","ucum":"Cel"},"weight":{"value":"84","unit":"kg","ucum":"kg"}}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('problem', :'pt', :'im', '{"concept":{"text":"Type 2 diabetes mellitus","codings":[{"system":"icd10","code":"E11.9","display":"Type 2 diabetes mellitus"}]},"clinical_status":"active","verification":"confirmed","onset":{"value":"2019","precision":"year"}}', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1'),
  t.e('allergy', :'pt', :'im', '{"concept":{"text":"Penicillins","codings":[{"system":"local.allergen","code":"penicillins"}]},"type":"allergy","category":["medication"],"criticality":"high","clinical_status":"active","verification":"confirmed","reactions":[{"manifestation":{"text":"Rash","codings":[{"system":"local.reaction","code":"rash"}]},"severity":"moderate"}]}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin","codings":[{"system":"atc","code":"A10BA02"}]},"dosage":{"dose":{"value":"500","unit":"mg","ucum":"mg"},"timing":{"code":"BD","frequency":2,"period":1,"period_unit":"d"},"route":"oral"},"duration_days":30,"reasons":[{"to":"item","id":"00000000-0000-0000-0000-0000000000e2"}],"status":"active"}', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a1'),
  t.e('medication', :'pt', :'im', '{"basis":"reported","drug":{"text":"Omeprazole","codings":[{"system":"atc","code":"A02BC01"}]},"status":"active"}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('list_review', :'pt', :'im', '{"list":"problems","outcome":"reviewed"}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count', 'coding', jsonb_build_object('system', 'loinc', 'code', '58410-2')),
    'department_id', :'labd', 'priority', 'routine', 'status', 'active', 'question', 'anaemia?'), '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000a1'),
  t.e('procedure', :'pt', :'im', '{"concept":{"text":"Wound dressing","codings":[{"system":"local.procedure","code":"dressing"}]},"status":"completed"}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('alert', :'pt', :'im', '{"concept":{"text":"Fall risk","codings":[{"system":"local.alert","code":"fall_risk"}]},"status":"active"}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('given', :'pt', :'im', '{"drug":{"text":"Paracetamol","codings":[{"system":"atc","code":"N02BE01"}]},"dose":{"value":"1","unit":"g","ucum":"g"},"route":"oral","status":"completed"}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('observation', :'pt', :'im', '{"code":{"text":"Tobacco smoking status","codings":[{"system":"loinc","code":"72166-2"}]},"value":{"text":"Never smoker"}}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('note', :'pt', :'im', '{"kind":"plan","text":"Start metformin.\nCBC today."}', null, '00000000-0000-0000-0000-0000000000a1'),
  t.e('done', :'pt', :'im', '{"wait":false}', null, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c0', 'changes'))), 'a full visit');
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin","codings":[{"system":"atc","code":"A10BA02"}]},"dosage":{"dose":{"value":"1000","unit":"mg","ucum":"mg"},"timing":{"code":"BD"}},"status":"active"}',
  null, null, '00000000-0000-0000-0000-0000000000e3', 'changes')), 'a dose change');
select t.as('11111111-0000-0000-0000-0000000000b2');
select t.landed(t.w(t.e('step', :'pt', :'labd', '{"status":"accepted"}', null, null, '00000000-0000-0000-0000-0000000000e4', 'answers')), 'accepted');
select t.landed(t.w(t.e('result', :'pt', :'labd', '{"status":"final","code":{"text":"CBC","codings":[{"system":"loinc","code":"58410-2"}]},"analytes":[{"key":"hb","name":"Haemoglobin","code":{"system":"loinc","code":"718-7"},"value":{"value":"11.2","unit":"g/dL","ucum":"g/dL"},"interpretation":"L","range":{"low":{"value":"13","ucum":"g/dL"},"high":{"value":"17","ucum":"g/dL"}}}]}',
  null, null, '00000000-0000-0000-0000-0000000000e4', 'answers')), 'a result');
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"outp","place_id":"00000000-0000-0000-0000-000000000002","reason":"hyperglycaemia"}', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b0',
  '00000000-0000-0000-0000-0000000000a1', 'about')), 'admitted from the visit');
select t.landed(t.w(t.e('note', :'pt', :'im', '{"text":"a mistake"}', '00000000-0000-0000-0000-0000000000e8')), 'a mistaken note');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"wrong_patient"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e8')), 'crossed out');

create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'im')) b;
create temp table ips as select public.read(jsonb_build_object('shape', 'fhir', 'kind', 'ips', 'patient_id', :'pt', 'department_id', :'im')) b;
reset role;
create temp table res as select e -> 'resource' r from bundle, jsonb_array_elements(b -> 'entry') e;

\echo '── the Bundle'
select t.ok(b ->> 'resourceType' = 'Bundle' and b ->> 'type' = 'collection' and jsonb_array_length(b -> 'entry') > 20, 'a collection of ' || jsonb_array_length(b -> 'entry') || ' resources') from bundle;
select t.ok(string_agg(distinct r ->> 'resourceType', ',' order by r ->> 'resourceType') =
  'AllergyIntolerance,Condition,DiagnosticReport,DocumentReference,Encounter,Flag,List,Location,MedicationAdministration,MedicationRequest,MedicationStatement,Observation,Organization,Patient,PractitionerRole,Procedure,Provenance,ServiceRequest,Task',
  'every kind: ' || string_agg(distinct r ->> 'resourceType', ',' order by r ->> 'resourceType')) from res;
select t.report('fhir', (r ->> 'resourceType') || ' has a bad id ' || coalesce(r ->> 'id', 'null')) from res where coalesce(r ->> 'id', '') !~ '^[A-Za-z0-9.-]{1,64}$';
select t.ok(count(*) = count(distinct (r ->> 'resourceType') || '/' || (r ->> 'id')), 'resource ids are unique') from res;

\echo '── required elements (R4) of each resource'
with req(rt, path) as (values
  ('Patient', 'name'), ('Encounter', 'status'), ('Encounter', 'class'), ('Encounter', 'subject'), ('Condition', 'subject'), ('Condition', 'code'),
  ('AllergyIntolerance', 'patient'), ('MedicationRequest', 'status'), ('MedicationRequest', 'intent'), ('MedicationRequest', 'medicationCodeableConcept'), ('MedicationRequest', 'subject'),
  ('MedicationStatement', 'status'), ('MedicationStatement', 'medicationCodeableConcept'), ('MedicationStatement', 'subject'),
  ('MedicationAdministration', 'status'), ('MedicationAdministration', 'medicationCodeableConcept'), ('MedicationAdministration', 'subject'), ('MedicationAdministration', 'effectiveDateTime'),
  ('Observation', 'status'), ('Observation', 'code'), ('DiagnosticReport', 'status'), ('DiagnosticReport', 'code'), ('ServiceRequest', 'status'), ('ServiceRequest', 'intent'), ('ServiceRequest', 'subject'),
  ('Task', 'status'), ('Task', 'intent'), ('Procedure', 'status'), ('Procedure', 'subject'), ('DocumentReference', 'status'), ('DocumentReference', 'content'),
  ('Flag', 'status'), ('Flag', 'code'), ('Flag', 'subject'), ('List', 'status'), ('List', 'mode'), ('Provenance', 'target'), ('Provenance', 'recorded'), ('Provenance', 'agent'),
  ('Location', 'name'), ('Organization', 'name'))
select t.report('fhir', rt || '/' || (r ->> 'id') || ' lacks ' || path) from req join res on r ->> 'resourceType' = rt where not (r ? path) or r -> path = 'null'::jsonb;
select t.ok(true, 'required elements checked');

\echo '── references resolve inside the bundle; codings have systems; units are UCUM'
with refs as (select distinct v #>> '{}' ref from res, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('fhir', 'unresolved reference ' || ref) from refs where not exists (select 1 from res where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'references checked');
with codings as (select c from res, lateral jsonb_path_query(r, 'strict $.**.coding[*]') c)
select t.report('fhir', 'a coding without a proper system: ' || c::text) from codings where coalesce(c ->> 'system', '') !~ '^(https?|urn):' or c ->> 'system' like '%{%' or coalesce(c ->> 'code', '') = '';
select t.ok(true, 'codings checked');
with q as (select v from res, lateral jsonb_path_query(r, 'strict $.**.valueQuantity') v union all select v from res, lateral jsonb_path_query(r, 'strict $.**.doseQuantity') v)
select t.report('fhir', 'a quantity with a non-UCUM code: ' || v::text) from q where v ->> 'system' = 'http://unitsofmeasure.org' and not exists (select 1 from core.codes c where c.system = 'ucum' and c.code = v ->> 'code');
select t.ok(count(*) > 5, count(*) || ' quantities carry UCUM codes') from res, lateral jsonb_path_query(r, 'strict $.**.valueQuantity') v where v ->> 'system' = 'http://unitsofmeasure.org';

\echo '── what the mapping says'
select t.ok(r -> 'identifier' @> '[{"system":"https://opencare.example/sid/eg-national-id","value":"26803140100011"}]' and r -> 'address' -> 0 ->> 'state' = 'EG-C', 'the Patient: national ID and governorate') from res where r ->> 'resourceType' = 'Patient';
select t.ok(count(*) = 2 and bool_or(r -> 'priorPrescription' is not null) and bool_or(r ->> 'status' = 'stopped'), 'a dose change: two MedicationRequests, the first superseded') from res where r ->> 'resourceType' = 'MedicationRequest';
select t.ok(r ->> 'status' = 'finished' and r -> 'class' ->> 'code' = 'AMB', 'the visit: a finished ambulatory Encounter') from res where r ->> 'resourceType' = 'Encounter' and r ->> 'id' = '00000000-0000-0000-0000-0000000000a1';
select t.ok(r -> 'class' ->> 'code' = 'IMP' and r -> 'hospitalization' -> 'admitSource' -> 'coding' -> 0 ->> 'code' = 'outp' and r -> 'partOf' ->> 'reference' = 'Encounter/00000000-0000-0000-0000-0000000000a1',
  'the stay: IMP, admit source, part of the visit') from res where r ->> 'resourceType' = 'Encounter' and r ->> 'id' = '00000000-0000-0000-0000-0000000000b0';
select t.ok(r ->> 'status' = 'entered-in-error', 'a crossed-out note is entered-in-error') from res where r ->> 'id' = '00000000-0000-0000-0000-0000000000e8';
select t.ok(bool_and(r -> 'meta' -> 'security' -> 0 ->> 'code' = 'N'), 'nothing here is private: security N') from res where r ? 'meta' and r -> 'meta' ? 'security';
select t.ok(count(*) >= 5, 'Observations for the vitals keys and the analyte') from res where r ->> 'resourceType' = 'Observation';
select t.ok(bool_and(r -> 'target' is not null and jsonb_array_length(r -> 'target') > 0), 'every Provenance names what it wrote') from res where r ->> 'resourceType' = 'Provenance';
select t.ok(exists (select 1 from res where r ->> 'resourceType' = 'Provenance' and r -> 'activity' -> 'coding' -> 0 ->> 'code' = 'NULLIFY'), 'the cross-out''s Provenance is NULLIFY');

\echo '── the International Patient Summary'
select t.ok(b ->> 'type' = 'document' and b -> 'entry' -> 0 -> 'resource' ->> 'resourceType' = 'Composition' and b -> 'entry' -> 0 -> 'resource' -> 'type' -> 'coding' -> 0 ->> 'code' = '60591-5',
  'a document that opens with its Composition') from ips;
select t.ok(jsonb_array_length(b -> 'entry' -> 0 -> 'resource' -> 'section') = 6, 'six sections') from ips;
select t.ok(s -> 'entry' is not null, 'section ' || (s ->> 'title') || ' lists its entries') from ips, jsonb_array_elements(b -> 'entry' -> 0 -> 'resource' -> 'section') s
 where s ->> 'title' in ('Active problems', 'Medication summary', 'Allergies and intolerances', 'Results', 'History of procedures');
select t.ok(s -> 'emptyReason' is not null, 'no immunizations: an empty reason, not an empty list') from ips, jsonb_array_elements(b -> 'entry' -> 0 -> 'resource' -> 'section') s where s ->> 'title' = 'Immunizations';
select t.ok(bool_and(e ->> 'fullUrl' like 'urn:uuid:%'), 'document entries carry urn:uuid fullUrls') from ips, jsonb_array_elements(b -> 'entry') e;

\echo '── none known is exported as absent-unknown, never an empty list'
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b4');
select (public.save_patient('{"department_id":"00000000-0000-0000-0000-0000000000d4","patient":{"id":"00000000-0000-0000-0000-0000000000f2","given":["Omar"],"gender":"male"}}') ->> 'created') as omar;
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(t.w(t.e('list_review', '00000000-0000-0000-0000-0000000000f2', :'im', '{"list":"allergies","outcome":"none_known"}')), 'no known allergies');
select t.ok(exists (select 1 from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'kind', 'ips', 'patient_id', '00000000-0000-0000-0000-0000000000f2', 'department_id', :'im')) -> 'entry') e
  where e -> 'resource' ->> 'resourceType' = 'AllergyIntolerance' and e -> 'resource' -> 'code' -> 'coding' -> 0 ->> 'code' = 'no-known-allergies'), 'AllergyIntolerance: no-known-allergies');
select t.as('11111111-0000-0000-0000-0000000000b2');
select t.refuses($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f1","department_id":"00000000-0000-0000-0000-0000000000d2"}')$q$, 'not_allowed');
