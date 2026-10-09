-- A newborn's record made inside a write set (spec §3.9 step 3b, the owner's Q10, 2026-10-08): the new patient, its number, snapshot and
-- "mother of"; its entries beside the mother's; twins; all or nothing; who may; a retry; the reads.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set desk  '00000000-0000-0000-0000-0000000000d4'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set f1    '00000000-0000-0000-0000-0000000000f1'
\set pt    '00000000-0000-0000-0000-0000000000f2'
\set stay  '00000000-0000-0000-0000-00000000e901'
\set b1    '00000000-0000-0000-0000-00000000e911'
\set b2    '00000000-0000-0000-0000-00000000e912'
\set b3    '00000000-0000-0000-0000-00000000e913'
\set b4    '00000000-0000-0000-0000-00000000e914'
\set s1    '00000000-0000-0000-0000-00000000e921'
\set s2    '00000000-0000-0000-0000-00000000e922'
\set s3    '00000000-0000-0000-0000-00000000e923'
\set s4    '00000000-0000-0000-0000-00000000e924'
\set n1    '00000000-0000-0000-0000-00000000e931'
\set set1  '00000000-0000-0000-0000-00000000e941'
\set set2  '00000000-0000-0000-0000-00000000e942'
\set set3  '00000000-0000-0000-0000-00000000e943'
\set set4  '00000000-0000-0000-0000-00000000e944'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set bed1  '00000000-0000-0000-0000-000000000001'
\set bed2  '00000000-0000-0000-0000-000000000002'
\set bed3  '00000000-0000-0000-0000-000000000003'
\set bed4  '00000000-0000-0000-0000-000000000004'
select t.fixture();

-- one set through the one door, with the newborns it makes
create function pg_temp.born(p_set uuid, p_entries jsonb, p_patients jsonb, p_confirmed jsonb default '[]') returns jsonb language sql as $$
  select public.write(jsonb_build_object('set_id', p_set, 'made_at', clock_timestamp(), 'entries', p_entries, 'confirmed', p_confirmed, 'seen', '{}'::jsonb,
    'patients', p_patients))
$$;
-- one newborn as the set names it (born today, in the clinic's day, on the ward)
create function pg_temp.np(p_id uuid, p_name text, p_gender text default 'female', p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'mother', '00000000-0000-0000-0000-0000000000f2', 'full_name', p_name, 'gender', p_gender,
    'birth_date', ((now() at time zone 'Africa/Cairo')::date)::text, 'department_id', '00000000-0000-0000-0000-0000000000d6') || p_extra
$$;
-- a refusal with its code and its detail (t.refused checks the code only)
create function pg_temp.refused(r jsonb, p_code text, p_detail text, p_what text) returns text language sql as $$
  select t.ok(r ->> 'outcome' = 'refused' and r -> 'findings' -> 0 ->> 'code' = p_code and r -> 'findings' -> 0 ->> 'detail' is not distinct from p_detail,
    p_what || ': ' || p_code || coalesce(' ' || p_detail, '') || case when r ->> 'outcome' = 'refused' and r -> 'findings' -> 0 ->> 'code' = p_code
      and r -> 'findings' -> 0 ->> 'detail' is not distinct from p_detail then '' else ' (got ' || coalesce(r::text, 'null') || ')' end)
$$;
-- a newborn's opening stay on the ward: its own visit (the entry's id), in a bed or none
create function pg_temp.admit(p_patient uuid, p_bed uuid default null) returns jsonb language sql as $$
  select t.e('admitted', p_patient, '00000000-0000-0000-0000-0000000000d6', jsonb_strip_nulls(jsonb_build_object('admit_source', 'born', 'place_id', p_bed)), p_patient, p_patient)
$$;
-- a note of the mother in her stay
create function pg_temp.note(p_text text, p_id uuid default null) returns jsonb language sql as $$
  select t.e('note', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d6', jsonb_build_object('text', p_text), p_id, '00000000-0000-0000-0000-00000000e901')
$$;

set role authenticated;
\echo '── set up: the mother registered at the desk and admitted to the ward, bed 1'
select t.as(:'rec');
select t.ok((public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'pt', 'full_name', 'Mona Fathy', 'gender', 'female',
  'birth_date', (current_date - interval '28 years')::date))) ->> 'created')::boolean, 'the mother is registered');
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', jsonb_build_object('admit_source', 'outp', 'place_id', :'bed1'), :'stay', :'stay')), 'the mother is admitted in bed 1');
reset role;
select value + 1 as n from core.counters where organization_id = :'org' and key = 'record_number' \gset
set role authenticated;

\echo '── (a) one newborn: its record, number, snapshot and "mother of", its stay in bed 2 and its vitals beside the mother''s note'
select t.as(:'ow');
create temp table a_out as select pg_temp.born(:'set1', jsonb_build_array(pg_temp.note('born 08:12', '00000000-0000-0000-0000-00000000e951'), pg_temp.admit(:'b1', :'bed2'),
  t.e('vitals', :'b1', :'ward', '{"weight":{"value":"3.2","unit":"kg","ucum":"kg"}}', :'s1', :'b1')),
  jsonb_build_array(pg_temp.np(:'b1', 'Baby of Mona Fathy'))) r;
select t.landed(r, 'the set lands') from a_out;
select t.ok(r -> 'patients' = jsonb_build_array(jsonb_build_object('id', :'b1', 'number', :n)), 'the outcome names the newborn and its record number ' || :n) from a_out;
reset role;
select t.ok(p.number = :n and p.full_name = 'Baby of Mona Fathy' and p.folded = core.fold('Baby of Mona Fathy') and p.gender = 'female'
  and p.birth_date = (now() at time zone 'Africa/Cairo')::date and p.birth_precision = 'day' and not p.birth_estimated and not p.anonymous
  and p.given = '{}' and p.family is null and p.created_by = '00000000-0000-0000-0000-0000000000b9', 'the record as the desk makes one, made by the owner')
  from core.patients p where p.organization_id = :'org' and p.id = :'b1';
select t.ok(count(*) = 1 and bool_and(c.reason = 'born' and c.data ->> 'full_name' = 'Baby of Mona Fathy'), 'one full snapshot, reason born')
  from core.patient_changes c where c.organization_id = :'org' and c.patient_id = :'b1';
select t.ok(count(*) = 1 and bool_and(r.patient_id = :'pt' and r.relation = 'mother_of' and r.author_id = '00000000-0000-0000-0000-0000000000b9'),
  'the mother is "mother of" the newborn, written by the owner') from core.patient_relations r where r.organization_id = :'org' and r.other_id = :'b1';
select t.ok(count(*) = 0, 'no identifier') from core.patient_identifiers where organization_id = :'org' and patient_id = :'b1';
select t.ok(state = 'admitted' and place_id = :'bed2', 'the newborn''s own stay, in bed 2') from base.presence where organization_id = :'org' and patient_id = :'b1';
select t.ok(count(*) = 3, 'three entries in one set') from core.entries where organization_id = :'org' and set_id = :'set1';
set role authenticated;

\echo '── (b) the reads'
select t.as(:'dr');
select t.ok(public.read(jsonb_build_object('shape', 'patient', 'patient_id', :'b1', 'department_id', :'ward')) -> 'relations'
  = jsonb_build_array(jsonb_build_object('relation', 'mother_of', 'patient_id', :'pt', 'other_id', :'b1')), 'the newborn''s read: its mother');
select t.ok(public.read(jsonb_build_object('shape', 'patient', 'patient_id', :'pt', 'department_id', :'ward')) -> 'relations'
  @> jsonb_build_array(jsonb_build_object('relation', 'mother_of', 'patient_id', :'pt', 'other_id', :'b1')), 'the mother''s read: the same row');
select t.ok(t.entry(t.record(:'b1', :'ward'), :'s1') ->> 'type' = 'vitals', 'the newborn''s record has its vitals');
create temp table b_res as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'b1', 'department_id', :'ward')) -> 'entry') e;
select t.ok(r ->> 'gender' = 'female' and r ->> 'birthDate' = ((now() at time zone 'Africa/Cairo')::date)::text, 'FHIR: the Patient, female, born today')
  from b_res where r ->> 'resourceType' = 'Patient';
reset role;
select t.ok(not exists (select 1 from b_res, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle'), 'FHIR: no resource has a problem');
set role authenticated;

\echo '── (c) a retry: the same outcome, nothing made again; the same set id with another name is set_changed'
select t.as(:'ow');
select t.ok(r ->> 'outcome' = 'landed' and (r ->> 'repeat')::boolean and r -> 'patients' = jsonb_build_array(jsonb_build_object('id', :'b1', 'number', :n)), 'the retry returns the same newborn')
  from (select pg_temp.born(:'set1', jsonb_build_array(pg_temp.note('born 08:12', '00000000-0000-0000-0000-00000000e951'), pg_temp.admit(:'b1', :'bed2'),
    t.e('vitals', :'b1', :'ward', '{"weight":{"value":"3.2","unit":"kg","ucum":"kg"}}', :'s1', :'b1')),
    jsonb_build_array(pg_temp.np(:'b1', 'Baby of Mona Fathy'))) r) x;
select t.refused(pg_temp.born(:'set1', jsonb_build_array(pg_temp.note('born 08:12', '00000000-0000-0000-0000-00000000e951'), pg_temp.admit(:'b1', :'bed2'),
    t.e('vitals', :'b1', :'ward', '{"weight":{"value":"3.2","unit":"kg","ucum":"kg"}}', :'s1', :'b1')),
    jsonb_build_array(pg_temp.np(:'b1', 'Baby Fathy'))), 'set_changed', 'another name under the same set id');
reset role;
select t.ok((select count(*) from core.patients where organization_id = :'org' and id = :'b1') = 1
  and (select count(*) from core.patient_relations where organization_id = :'org' and other_id = :'b1') = 1, 'still one newborn, one relation');
set role authenticated;

\echo '── (d) all or nothing: a refused set leaves no record, and the counter does not move'
select t.as(:'ow');
select t.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('b4'), pg_temp.admit(:'b4', :'bed2')), jsonb_build_array(pg_temp.np(:'b4', 'Baby of Mona Fathy'))),
  'bed_taken', 'bed 2 is the first newborn''s');
reset role;
select t.ok(not exists (select 1 from core.patients where id = :'b4') and not exists (select 1 from core.patient_relations where other_id = :'b4')
  and not exists (select 1 from core.patient_changes where patient_id = :'b4'), 'no record, relation or snapshot left');
set role authenticated;
select t.as(:'ow');
select t.ok(r ->> 'outcome' = 'landed' and r -> 'patients' = jsonb_build_array(jsonb_build_object('id', :'b4', 'number', :n + 1)), 'the same id lands in bed 3, numbered ' || (:n + 1))
  from (select pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('b4 again'), pg_temp.admit(:'b4', :'bed3')), jsonb_build_array(pg_temp.np(:'b4', 'Baby of Mona Fathy'))) r) x;

\echo '── (e) twins: two records in one set, numbered in turn'
create temp table e_out as select pg_temp.born(:'set2', jsonb_build_array(pg_temp.note('twins'), pg_temp.admit(:'b2', :'bed4'), pg_temp.admit(:'b3')),
  jsonb_build_array(pg_temp.np(:'b2', 'Baby 1 of Mona Fathy', 'male'), pg_temp.np(:'b3', 'Baby 2 of Mona Fathy', 'female'))) r;
select t.landed(r, 'the twins'' set lands') from e_out;
select t.ok(r -> 'patients' = jsonb_build_array(jsonb_build_object('id', :'b2', 'number', :n + 2), jsonb_build_object('id', :'b3', 'number', :n + 3)), 'numbered in the set''s order')
  from e_out;
reset role;
select t.ok(count(*) = 4, 'four mother_of rows: b1, b4 and the twins') from core.patient_relations where organization_id = :'org' and patient_id = :'pt' and relation = 'mother_of';
select t.ok((select gender from core.patients where id = :'b2') = 'male' and (select place_id from base.presence where patient_id = :'b3') is null, 'twin 1 male; twin 2 in a stay with no bed');
set role authenticated;

\echo '── (f) refusals: nothing made by any'
select t.as(:'ow');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')), '{"id":"x"}'), 'bad_set', 'patients', 'patients not an array');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')), '[]'), 'bad_set', 'patients', 'no patients');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  (select jsonb_agg(pg_temp.np(gen_random_uuid(), 'Baby ' || i)) from generate_series(1, 9) i)), 'bad_set', 'patients', 'nine patients');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A'), pg_temp.np(:'s2', 'B'))), 'bad_set', 'patients', 'two with one id');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', '{"family":"Fathy"}'))), 'bad_set', 'patients', 'an extra key');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'girl'))), 'bad_set', 'patients', 'gender girl');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', '{"birth_date":"today"}'))), 'bad_set', 'patients', 'birth date not a date');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', '  '))), 'name_missing', :'s2', 'a blank name');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', jsonb_build_object('mother', :'f1')))), 'wrong_patient', 'mother', 'the mother is not the first entry''s patient');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.admit(:'s2'), pg_temp.note('x')), jsonb_build_array(pg_temp.np(:'s2', 'A'))),
  'wrong_patient', 'mother', 'the newborn''s entry first: its mother does not exist yet');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'pt')),
  jsonb_build_array(pg_temp.np(:'pt', 'A'))), 'patient_exists', :'pt', 'an existing patient''s id');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A'), pg_temp.np(:'s3', 'B'))), 'patient_unused', :'s3', 'a newborn no entry names (after its twin was made)');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', '{"department_id":"00000000-0000-0000-0000-0000000000dd"}'))), 'not_found', 'department', 'no such department');
select t.as(:'nurse');
select t.ok(r ->> 'outcome' = 'refused' and r -> 'findings' -> 0 ->> 'code' = 'not_allowed' and r -> 'findings' -> 0 ->> 'detail' = 'manage:patients', 'the nurse may not register: not_allowed manage:patients')
  from (select pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')), jsonb_build_array(pg_temp.np(:'s2', 'A'))) r) x;
select t.as(:'ow');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', jsonb_build_object('birth_date', ((now() at time zone 'Africa/Cairo')::date + 1)::text)))), 'bad_set', 'patients', 'born tomorrow');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', jsonb_build_object('birth_date', ((now() at time zone 'Africa/Cairo')::date - 29)::text)))), 'bad_set', 'patients', 'born 29 days ago');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A', 'female', '{"birth_date":"1990-01-01"}'))), 'bad_set', 'patients', 'an adult''s birth date');
select pg_temp.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x') || '{"source_system":"test","source_id":"n-1"}', pg_temp.admit(:'s2')),
  jsonb_build_array(pg_temp.np(:'s2', 'A'))), 'bad_set', 'patients', 'never in an imported set');
select t.refused(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s2'), t.e('note', :'f1', :'ward', '{"text":"x"}')),
  jsonb_build_array(pg_temp.np(:'s2', 'A'))), 'two_patients', 'a third, existing patient beside them');
select t.refused(t.w(jsonb_build_array(pg_temp.note('x'), t.e('note', :'f1', :'ward', '{"text":"x"}'))), 'two_patients', 'no patients: one family, as before');
reset role;
select t.ok(not exists (select 1 from core.patients where id in (:'s2', :'s3')) and not exists (select 1 from core.patient_relations where other_id in (:'s2', :'s3'))
  and not exists (select 1 from core.patient_changes where patient_id in (:'s2', :'s3')), 'no refused set left a record, relation or snapshot');
select t.ok(value = :n + 3, 'and no record number was used') from core.counters where organization_id = :'org' and key = 'record_number';
set role authenticated;
select t.as(:'ow');
select t.landed(pg_temp.born(gen_random_uuid(), jsonb_build_array(pg_temp.note('x'), pg_temp.admit(:'s3')),
  jsonb_build_array(pg_temp.np(:'s3', 'A', 'female', jsonb_build_object('birth_date', ((now() at time zone 'Africa/Cairo')::date - 28)::text)))), 'born 28 days ago lands');
select t.landed(t.w(jsonb_build_array(pg_temp.note('imported') || '{"source_system":"test","source_id":"n-1"}'), :'set3'), 'the import alone lands');
select t.ok(r ->> 'outcome' = 'landed' and (r ->> 'repeat')::boolean, 'sent again: a repeat')
  from (select t.w(jsonb_build_array(pg_temp.note('imported') || '{"source_system":"test","source_id":"n-1"}')) r) x;
reset role;
select t.ok(value = :n + 4, 'and no record made: the counter is where the 28-day newborn left it') from core.counters where organization_id = :'org' and key = 'record_number';
set role authenticated;

\echo '── (g) a warned set takes its newborn back too, and lands once confirmed'
select t.as(:'dr');
select t.landed(t.w(t.e('problem', :'pt', :'ward', '{"concept":{"text":"Gestational diabetes","codings":[]},"clinical_status":"active","verification":"confirmed"}')), 'the mother''s problem');
select t.as(:'ow');
select t.warned(pg_temp.born(:'set4', jsonb_build_array(t.e('problem', :'pt', :'ward', '{"concept":{"text":"Gestational diabetes","codings":[]},"clinical_status":"active","verification":"confirmed"}', :'s4'),
  pg_temp.admit(:'n1')), jsonb_build_array(pg_temp.np(:'n1', 'Baby of Mona Fathy'))), 'already_on_list', 'the outcome comes back, not null');
reset role;
select t.ok(not exists (select 1 from core.patients where id = :'n1') and not exists (select 1 from core.patient_relations where other_id = :'n1'), 'no record left by the warning');
set role authenticated;
select t.as(:'ow');
select t.landed(pg_temp.born(:'set4', jsonb_build_array(t.e('problem', :'pt', :'ward', '{"concept":{"text":"Gestational diabetes","codings":[]},"clinical_status":"active","verification":"confirmed"}', :'s4'),
  pg_temp.admit(:'n1')), jsonb_build_array(pg_temp.np(:'n1', 'Baby of Mona Fathy')), '["already_on_list"]'), 'confirmed, the same set id lands');
reset role;
select t.ok(exists (select 1 from core.patients where id = :'n1'), 'the newborn is made');
set role authenticated;

\echo '── (h) an ordinary set''s ledger is unchanged: sent twice, a repeat'
select t.as(:'dr');
select t.landed(t.w(pg_temp.note('plain', '00000000-0000-0000-0000-00000000e952'), '00000000-0000-0000-0000-00000000e945'), 'a plain set');
select t.ok((r ->> 'repeat')::boolean and not (r ? 'patients'), 'its retry is a repeat, with no newborns') from (select t.w(pg_temp.note('plain', '00000000-0000-0000-0000-00000000e952'), '00000000-0000-0000-0000-00000000e945') r) x;

\echo '── (i) erase: the mother goes, the newborn stays with no relation; then the newborn'
select t.as(:'ow');
select t.ok((public.erase_patient(jsonb_build_object('patient_id', :'pt', 'reason', 'test')) ->> 'erased')::boolean, 'the mother is erased');
reset role;
select t.ok(exists (select 1 from core.patients where id = :'b1') and not exists (select 1 from core.patient_relations where :'pt' in (patient_id, other_id)), 'the newborn stays; no relation names the mother');
set role authenticated;
select t.as(:'ow');
select t.ok((public.erase_patient(jsonb_build_object('patient_id', :'b1', 'reason', 'test')) ->> 'erased')::boolean, 'the newborn is erased');
reset role;

\echo '── (j) a merged mother: the set names her merged record; her survivor is the one written as mother of'
\set m2 '00000000-0000-0000-0000-00000000e902'
\set b5 '00000000-0000-0000-0000-00000000e915'
set role authenticated;
select t.as(:'rec');
select t.ok((public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'m2', 'full_name', 'Huda Salem', 'gender', 'female',
  'birth_date', (current_date - interval '30 years')::date))) ->> 'created')::boolean, 'a second record of the fixture''s patient');
select t.as(:'ow');
select t.ok(public.merge_patients(jsonb_build_object('department_id', :'desk', 'from', :'m2', 'into', :'f1', 'reason', 'registered twice')) ->> 'survivor' = :'f1', 'merged into f1');
select t.landed(pg_temp.born(gen_random_uuid(), jsonb_build_array(t.e('problem', :'m2', :'ward', '{"concept":{"text":"Anaemia","codings":[]},"clinical_status":"active","verification":"confirmed"}'),
  pg_temp.admit(:'b5')), jsonb_build_array(pg_temp.np(:'b5', 'Baby of Huda Salem', 'male', jsonb_build_object('mother', :'m2')))), 'the set naming the merged record lands');
reset role;
select t.ok(count(*) = 1 and bool_and(r.patient_id = :'f1'), 'the survivor is mother of the newborn') from core.patient_relations r
  where r.organization_id = :'org' and r.relation = 'mother_of' and r.other_id = :'b5';
