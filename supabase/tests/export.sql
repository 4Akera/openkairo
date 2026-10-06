-- a pack's export (spec §5.2 Export, §6.4): a pack type always maps as its base type, and the pack's own mapping only adds beside it —
-- new resources, or elements on the base's resource, never overwriting a value the base set; the result is valid R4 (a choice element
-- holds one value); a mapping that fails refuses the export (never a silent drop). Pharmacy proves it: its dispense exports as the
-- base's Task plus a MedicationDispense for each thing given, and the Task names them
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set disp '00000000-0000-0000-0000-0000000000c3'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set pm   '11111111-0000-0000-0000-0000000000b6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;

\echo '── a prescription sent to the pharmacy: one given, one not'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Lithium","codings":[{"system":"atc","code":"N05AN01"}]},"dosage":{"dose":{"value":"400","unit":"mg","ucum":"mg"},"timing":{"code":"BD"}},"status":"active"}',
    '00000000-0000-0000-0000-0000000000e1'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine', 'status', 'active'),
    '00000000-0000-0000-0000-0000000000e2', null, '00000000-0000-0000-0000-0000000000e1', 'about'),
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin","codings":[{"system":"atc","code":"A10BA02"}]},"status":"active"}', '00000000-0000-0000-0000-0000000000e5'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine', 'status', 'active'),
    '00000000-0000-0000-0000-0000000000e6', null, '00000000-0000-0000-0000-0000000000e5', 'about'))), 'two medicines sent');
select t.as(:'pm');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"in-progress","step":"prepared"}', '00000000-0000-0000-0000-0000000000e3', null, '00000000-0000-0000-0000-0000000000e2', 'answers')), 'prepared');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Lithium 400 mg"},"dose":{"value":"400","unit":"mg","ucum":"mg"},"quantity":{"value":"60","unit":"tablets","ucum":"{tbl}"}}]}}',
  '00000000-0000-0000-0000-0000000000e4', null, '00000000-0000-0000-0000-0000000000e3', 'changes')), 'given');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"cancelled","reason":"Out of stock"}', '00000000-0000-0000-0000-0000000000e7', null, '00000000-0000-0000-0000-0000000000e6', 'answers')), 'not given');
select t.as(:'dr');
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'im')) b;
create temp table res as select e -> 'resource' r from bundle, jsonb_array_elements(b -> 'entry') e;
-- what the base alone maps for the given dispense (the reader's rows, as the export hands them)
create temp table base_task as select r from (select base.step_fhir(jsonb_build_object('org', '00000000-0000-0000-0000-0000000000a1', 'patient', :'pt', 'private', false,
  'entries', (select jsonb_agg(core.entry_out(e, false) order by e.item_version) from core.entries e where e.item = '00000000-0000-0000-0000-0000000000e3'))) -> 0 r) x;

\echo '── the base''s Task, as the base maps it, with what pharmacy adds'
select t.ok(r @> (select b.r from base_task b), 'the exported Task holds every element the base set, unchanged') from res where r ->> 'resourceType' = 'Task' and r ->> 'id' = '00000000-0000-0000-0000-0000000000e3';
select t.ok(r ->> 'status' = 'completed' and r -> 'basedOn' -> 0 ->> 'reference' = 'ServiceRequest/00000000-0000-0000-0000-0000000000e2',
  'the Task: completed, fulfilling the order') from res where r ->> 'resourceType' = 'Task' and r ->> 'id' = '00000000-0000-0000-0000-0000000000e3';
select t.ok(r -> 'output' = '[{"type":{"text":"Dispensed"},"valueReference":{"reference":"MedicationDispense/00000000-0000-0000-0000-0000000000e3-d1"}}]',
  'and an output naming its MedicationDispense (an element the base did not set)') from res where r ->> 'resourceType' = 'Task' and r ->> 'id' = '00000000-0000-0000-0000-0000000000e3';
select t.ok(count(*) = 1 and bool_and(r ->> 'status' = 'completed' and r -> 'medicationCodeableConcept' ->> 'text' = 'Lithium 400 mg'
  and r -> 'quantity' @> '{"value":60,"code":"{tbl}","system":"http://unitsofmeasure.org"}' and r ? 'whenHandedOver'
  and r -> 'authorizingPrescription' -> 0 ->> 'reference' = 'MedicationRequest/00000000-0000-0000-0000-0000000000e1' and r -> 'subject' ->> 'reference' = 'Patient/' || :'pt'),
  'a MedicationDispense beside it: what was given, how much, when, on which prescription') from res where r ->> 'resourceType' = 'MedicationDispense' and r ->> 'id' like '%e3-d1';
select t.ok(r ->> 'status' = 'declined' and r -> 'statusReasonCodeableConcept' ->> 'text' = 'Out of stock' and r -> 'medicationCodeableConcept' ->> 'text' = 'Metformin',
  'not given: the medicine prescribed, declined, and why') from res where r ->> 'resourceType' = 'MedicationDispense' and r ->> 'id' = '00000000-0000-0000-0000-0000000000e7-d1';
select t.ok(r ->> 'status' = 'cancelled' and r -> 'output' -> 0 -> 'valueReference' ->> 'reference' = 'MedicationDispense/00000000-0000-0000-0000-0000000000e7-d1',
  'its Task maps as the base''s (cancelled), naming it')
  from res where r ->> 'resourceType' = 'Task' and r ->> 'id' = '00000000-0000-0000-0000-0000000000e7';

\echo '── valid R4'
create temp table ips as select e -> 'resource' r, e ->> 'fullUrl' u from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'kind', 'ips', 'patient_id', :'pt', 'department_id', :'im')) -> 'entry') e;
select t.ok(count(*) > 0 and bool_and(u ~ '^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') and count(distinct u) = count(*)
  and bool_or(r ->> 'resourceType' = 'MedicationDispense'),
  'the IPS: every fullUrl a plain urn:uuid, unique, the MedicationDispenses'' too (' || count(*) || ' entries)') from ips;
select t.ok(not exists (select 1 from res, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle'), 'no resource has a problem: ids, resourceType, one value per choice element');
with refs as (select distinct v #>> '{}' ref from res, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('export', 'unresolved reference ' || ref) from refs where not exists (select 1 from res where (r ->> 'resourceType') || '/' || (r ->> 'id') = ref);
select t.ok(true, 'every reference resolves inside the bundle');
select t.ok(count(*) = count(distinct (r ->> 'resourceType') || '/' || (r ->> 'id')), 'resource ids are unique') from res;
select t.ok(exists (select 1 from res where r ->> 'resourceType' = 'Provenance' and r -> 'target' @> '[{"reference":"MedicationDispense/00000000-0000-0000-0000-0000000000e3-d1"}]'),
  'the set''s Provenance names the MedicationDispense too');

\echo '── beside, never instead: the merge and the checks'
select t.ok(core.fhir_beside('[{"resourceType":"Task","id":"a","status":"completed","note":[{"text":"x"}]}]',
  '[{"resourceType":"Task","id":"a","status":"completed","note":[{"text":"y"}],"focus":{"reference":"Patient/p"}},{"resourceType":"MedicationDispense","id":"a-d1","status":"completed"}]')
  = '[{"resourceType":"Task","id":"a","status":"completed","note":[{"text":"x"},{"text":"y"}],"focus":{"reference":"Patient/p"}},{"resourceType":"MedicationDispense","id":"a-d1","status":"completed"}]',
  'an element added, a list added to, the same value let through, a new resource beside');
select t.refuses($q$select core.fhir_beside('[{"resourceType":"Task","id":"a","status":"completed"}]', '[{"resourceType":"Task","id":"a","status":"cancelled"}]')$q$, 'overwrites Task.status');
select t.refuses($q$select core.fhir_beside('[{"resourceType":"Observation","id":"a","valueQuantity":{"value":1}}]', '[{"resourceType":"Observation","id":"a","valueString":"one"}]')$q$, 'a second value for Observation.value[x]');
select t.ok(core.fhir_problems('{"resourceType":"Observation","id":"a","component":[{"code":{"text":"c"},"valueQuantity":{"value":1},"valueString":"1"}]}') = array['Observation.component.value[x] holds 2 values'],
  'a choice element with two values, deep inside, by path');
select t.ok(core.fhir_problems('{"resourceType":"Observation","id":"a b"}') = array['Observation has a bad id a b'] and core.fhir_problems('{"id":"a"}') <> '{}', 'a bad id; no resourceType');
select t.ok(core.fhir_problems('{"resourceType":"MedicationRequest","id":"a","reasonCode":[{"text":"x"}],"reasonReference":[{"reference":"Condition/c"}]}') = '{}',
  'two elements that are not one choice (reasonCode and reasonReference) are fine');

\echo '── a mapping that fails refuses the export; one that overwrites the base, or breaks R4, too'
select core.declare_pack('probe', 1, '{}', '{"en":"Probe"}');
select core.create_pack('probe');
set role pack_probe;
create function probe.memo_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select 'Memo' $$;
-- by what the memo says: raise, overwrite the base's status, give its own Observation two values, or add well
create function probe.memo_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w text := p -> 'entries' -> 0 -> 'data' ->> 'text'; v_item text := p -> 'entries' -> 0 ->> 'item';
begin
  if w = 'boom' then raise exception 'probe mapping broke'; end if;
  if w = 'overwrite' then return jsonb_build_array(jsonb_build_object('resourceType', 'DocumentReference', 'id', v_item, 'status', 'superseded')); end if;
  if w = 'gender' then return '[{"patch":"Patient","gender":"other"}]'::jsonb; end if;
  if w = 'dead' then return '[{"patch":"Patient","deceasedBoolean":true}]'::jsonb; end if;
  if w = 'extend' then return '[{"patch":"Patient","extension":[{"url":"https://opencare.example/probe","valueString":"memo"}]}]'::jsonb; end if;
  if w = 'two' then return jsonb_build_array(jsonb_build_object('resourceType', 'Observation', 'id', v_item || '-o', 'status', 'final', 'code', jsonb_build_object('text', 'x'),
    'valueString', 'one', 'valueBoolean', true)); end if;
  return jsonb_build_array(jsonb_build_object('resourceType', 'DocumentReference', 'id', v_item, 'description', 'a memo'));
end $$;
reset role;
select core.declare_action('write:probe.memo', 'probe');
select core.declare_type('probe.memo', 1, 'probe', '{"type":"object","additionalProperties":false,"required":["text"],"properties":{"text":{"type":"string"}}}', 'probe.memo_line(jsonb)',
  array['DocumentReference', 'Observation'], base_type => 'note', to_fhir => 'probe.memo_fhir(jsonb)', labels => '{"en":"Memo"}');
select core.lock_pack('probe');
insert into core.role_actions (role_id, action) values ('00000000-0000-0000-0000-00000000c002', 'write:probe.memo');
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as probe_on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["probe"]}'::jsonb)) ->> 'key' as ticked_im;
select t.as('11111111-0000-0000-0000-0000000000b4');
select (public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000f' || n, 'given', jsonb_build_array('P' || n), 'gender', 'female'))) ->> 'created')
  from generate_series(2, 8) n;
select t.as(:'dr');
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f2', :'im', '{"text":"fine"}', '00000000-0000-0000-0000-0000000002e2')), 'a memo that maps well');
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f3', :'im', '{"text":"boom"}')), 'a memo whose mapping raises');
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f4', :'im', '{"text":"overwrite"}')), 'a memo whose mapping overwrites the base');
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f5', :'im', '{"text":"two"}')), 'a memo whose mapping breaks R4');
select t.ok(r ->> 'status' = 'current' and r ->> 'description' = 'a memo' and r ? 'content', 'a memo maps as the base''s note (DocumentReference) with its description beside')
  from jsonb_array_elements(public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1"}') -> 'entry') e,
  lateral (select e -> 'resource' r) x where r ->> 'id' = '00000000-0000-0000-0000-0000000002e2';
select t.refuses($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f3","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'fhir_failed');
create function pg_temp.detail(q text) returns text language plpgsql as $$
declare d text;
begin
  execute q; return null;
exception when others then get stacked diagnostics d = pg_exception_detail; return d;
end $$;
select t.ok(d = 'probe.memo: probe.memo_fhir(jsonb)', 'the refusal names the type and its mapping, never the data nor the error: ' || coalesce(d, 'null'))
  from pg_temp.detail($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f3","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$) d;
select t.refuses($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f4","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'fhir_failed');
select t.refuses($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f5","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'fhir_invalid');
select t.refuses($q$select public.read('{"shape":"fhir","kind":"ips","patient_id":"00000000-0000-0000-0000-0000000000f3","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'fhir_failed');

\echo '── the base''s mapping that raises is the one named, never the pack''s'
create function base.probe_boom_fhir(p jsonb) returns jsonb language plpgsql stable as $$ begin raise exception 'base mapping broke'; end $$;
update core.types set to_fhir = 'base.probe_boom_fhir(jsonb)' where key = 'note';
select t.ok(d = 'probe.memo: base.probe_boom_fhir(jsonb)', 'a pack type whose base mapping raises: the base''s mapping named: ' || coalesce(d, 'null'))
  from pg_temp.detail($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f2","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$) d;
update core.types set to_fhir = 'base.note_fhir(jsonb)' where key = 'note';

\echo '── a pack''s patch of the Patient goes beside the base''s, never over it'
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f6', :'im', '{"text":"gender"}')), 'a memo whose mapping changes the Patient''s gender');
select t.landed(t.w(t.e('died', '00000000-0000-0000-0000-0000000000f7', :'im', '{"note":"at home"}')), 'a death: the base sets Patient.deceasedDateTime');
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f7', :'im', '{"text":"dead"}')), 'a memo whose mapping adds Patient.deceasedBoolean');
select t.landed(t.w(t.e('probe.memo', '00000000-0000-0000-0000-0000000000f8', :'im', '{"text":"extend"}')), 'a memo whose mapping adds an extension to the Patient');
select t.refuses($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f6","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'fhir_failed');
select t.ok(d = 'probe.memo: probe.memo_fhir(jsonb)', 'overwriting the base''s Patient.gender is refused, naming the mapping: ' || coalesce(d, 'null'))
  from pg_temp.detail($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f6","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$) d;
select t.ok(r ~ 'fhir_(failed|invalid)', 'a second value for Patient.deceased[x] is refused, whichever maps first: ' || r)
  from t.try($q$select public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f7","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$) r;
select t.ok(core.fhir_problems('{"resourceType":"Patient","id":"p","deceasedBoolean":true,"deceasedDateTime":"2026"}') = array['Patient.deceased[x] holds 2 values'],
  'the Patient is checked like any resource');
select t.ok(r -> 'extension' @> '[{"url":"https://opencare.example/probe","valueString":"memo"}]' and r ->> 'gender' = 'female' and cardinality(core.fhir_problems(r)) = 0,
  'an element the base did not set is added to the Patient, the rest as the base set it')
  from jsonb_array_elements(public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f8","department_id":"00000000-0000-0000-0000-0000000000d1"}') -> 'entry') e,
  lateral (select e -> 'resource' r) x where r ->> 'resourceType' = 'Patient';

\echo '── an analyte key too long for {item}-{key}: its Observation id is uuid v5(item, key), and its set''s Provenance names it'
select t.as('11111111-0000-0000-0000-0000000000b2');
select t.landed(t.w(t.e('result', '00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000d2',
  '{"status":"final","code":{"text":"HbA1c"},"analytes":[{"key":"hemoglobin_a1c_ifcc_mmol_mol_x","name":"HbA1c","value":{"value":"48","unit":"mmol/mol","ucum":"mmol/mol"}}]}',
  '00000000-0000-0000-0000-0000000003e1')), 'an outside result with a 30-character analyte key');
select t.as(:'dr');
create temp table long_res as select e -> 'resource' r from jsonb_array_elements(public.read('{"shape":"fhir","patient_id":"00000000-0000-0000-0000-0000000000f8","department_id":"00000000-0000-0000-0000-0000000000d1"}') -> 'entry') e;
select t.ok(count(*) = 1 and bool_and(r ->> 'id' = core.uuid5('00000000-0000-0000-0000-0000000003e1', 'hemoglobin_a1c_ifcc_mmol_mol_x')::text),
  'the analyte''s Observation: id uuid v5(item, key)') from long_res where r ->> 'resourceType' = 'Observation';
select t.ok(not exists (select 1 from long_res, unnest(core.fhir_problems(r)) q), 'and the bundle is valid R4');
select t.ok(exists (select 1 from long_res d, long_res o where d.r ->> 'resourceType' = 'DiagnosticReport' and o.r ->> 'resourceType' = 'Observation'
  and d.r -> 'result' @> jsonb_build_array(jsonb_build_object('reference', 'Observation/' || (o.r ->> 'id'))))
  and exists (select 1 from long_res p, long_res o where p.r ->> 'resourceType' = 'Provenance' and o.r ->> 'resourceType' = 'Observation'
  and p.r -> 'target' @> jsonb_build_array(jsonb_build_object('reference', 'Observation/' || (o.r ->> 'id'))) and p.r -> 'target' @> '[{"reference":"DiagnosticReport/00000000-0000-0000-0000-0000000003e1"}]'),
  'its report names it, and so does its set''s Provenance');

\echo '── every demo patient exports as valid R4 (a mapping that fails stops this suite); the journey''s dispense beside its Task'
-- include: supabase/demo/load.sql
select core.drain() as drained;
create temp table demo_res as
  select x.id patient, e -> 'resource' r from core.patients x, lateral jsonb_array_elements(core.read_fhir(
    (select u from core.users u where u.organization_id = demo.base('clinic') and exists (select 1 from core.holdings h where h.organization_id = u.organization_id and h.user_id = u.id
       and h.role_id = '00000000-0000-0000-0000-00000000c001' and h.department_id is null) limit 1),
    jsonb_build_object('patient_id', x.id, 'department_id', (select d.id from core.departments d where d.organization_id = demo.base('clinic') order by d.position, d.name limit 1))) -> 'entry') e
  where x.organization_id = demo.base('clinic') and x.merged_into is null;
select t.ok(count(distinct patient) = (select count(*) from core.patients where organization_id = demo.base('clinic') and merged_into is null),
  'every demo patient exported: ' || count(distinct patient) || ' patients, ' || count(*) || ' resources') from demo_res;
select t.report('export', (r ->> 'resourceType') || '/' || (r ->> 'id') || ': ' || q) from demo_res, unnest(core.fhir_problems(r)) q;
select t.ok(true, 'no demo resource has a problem');
with refs as (select distinct patient, v #>> '{}' ref from demo_res, lateral jsonb_path_query(r, 'strict $.**.reference') v)
select t.report('export', 'unresolved reference ' || ref) from refs f where not exists (select 1 from demo_res x where x.patient = f.patient and (x.r ->> 'resourceType') || '/' || (x.r ->> 'id') = f.ref);
select t.ok(true, 'every demo reference resolves in its bundle');
select t.ok(count(*) > 0 and bool_and(exists (select 1 from demo_res t2 where t2.patient = d.patient and t2.r ->> 'resourceType' = 'Task' and t2.r -> 'output' @> jsonb_build_array(jsonb_build_object(
    'valueReference', jsonb_build_object('reference', 'MedicationDispense/' || (d.r ->> 'id')))))),
  'the demo''s MedicationDispenses (' || count(*) || '), each named by its Task') from demo_res d where r ->> 'resourceType' = 'MedicationDispense';
select t.ok(exists (select 1 from demo_res where patient = demo.id('journey', 'patient:mahmoud') and r ->> 'resourceType' = 'MedicationDispense'), 'the journey''s medicines for home among them');
