-- Ward nursing's drug round (spec §5.6, piece 3): its declarations and its rule on a fixed day, the round, the sheet and the board
-- through the pack's doors; Give, Not given and their refusals; the dose's line and FHIR; the ward's own late time; off, the dose is
-- refused and the base's given lands. The fixed day D is 2026-03-10 in Africa/Cairo (UTC+2; no summer time in March).
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set desk  '00000000-0000-0000-0000-0000000000d4'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set stay  '00000000-0000-0000-0000-00000000e701'
\set stay2 '00000000-0000-0000-0000-00000000e702'
\set m1    '00000000-0000-0000-0000-00000000e711'
\set m2    '00000000-0000-0000-0000-00000000e712'
\set m3    '00000000-0000-0000-0000-00000000e713'
\set m4    '00000000-0000-0000-0000-00000000e714'
\set m5    '00000000-0000-0000-0000-00000000e715'
\set m6    '00000000-0000-0000-0000-00000000e716'
\set m7    '00000000-0000-0000-0000-00000000e717'
\set m8    '00000000-0000-0000-0000-00000000e718'
\set m9    '00000000-0000-0000-0000-00000000e719'
\set m10   '00000000-0000-0000-0000-00000000e720'
\set m1b   '00000000-0000-0000-0000-00000000e741'
\set m2b   '00000000-0000-0000-0000-00000000e742'
\set m7b   '00000000-0000-0000-0000-00000000e743'
\set x1    '00000000-0000-0000-0000-00000000e744'
\set d1    '00000000-0000-0000-0000-00000000e721'
\set d2    '00000000-0000-0000-0000-00000000e722'
\set d3    '00000000-0000-0000-0000-00000000e723'
\set d4    '00000000-0000-0000-0000-00000000e724'
\set d5    '00000000-0000-0000-0000-00000000e725'
\set d6    '00000000-0000-0000-0000-00000000e726'
\set d7    '00000000-0000-0000-0000-00000000e727'
\set d8    '00000000-0000-0000-0000-00000000e728'
\set d9    '00000000-0000-0000-0000-00000000e729'
\set d10   '00000000-0000-0000-0000-00000000e730'
\set d11   '00000000-0000-0000-0000-00000000e731'
\set d12   '00000000-0000-0000-0000-00000000e732'
\set d13   '00000000-0000-0000-0000-00000000e733'
\set d14   '00000000-0000-0000-0000-00000000e734'
\set d15   '00000000-0000-0000-0000-00000000e735'
\set m8b   '00000000-0000-0000-0000-00000000e745'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set rec   '11111111-0000-0000-0000-0000000000b4'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["bedside"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked;

\echo '── (a) its declarations: the dose, its action, the ward''s times, the tab, the two ops, the setup''s line'
select t.ok(t.version = 1 and t.layer = 'bedside' and t.base_type = 'given' and t.resources = array['MedicationAdministration'] and t.to_fhir is not null
  and cardinality(t.checks) = 1, 'bedside.dose v1: Ward nursing''s, extends the base''s given, a MedicationAdministration, its own FHIR and one check')
  from core.types t where t.key = 'bedside.dose';
select t.ok(a.layer = 'bedside' and a.everyday, 'write:bedside.dose: Ward nursing''s, everyday') from core.actions a where a.key = 'write:bedside.dose';
select t.ok(k.owner_kind = 'department' and k.form = 'department' and k.check_fn = 'bedside.round_check(jsonb,jsonb)'::regprocedure,
  'bedside.round: a department''s, on its card, checked') from core.setting_keys k where k.key = 'bedside.round';
select t.ok(s.work = 'stays' and s.action = 'read:record' and s.replaces = '{}', 'the Drug round tab: stays, read:record, replaces nothing') from core.screens s where s.key = 'bedside.round';
select t.ok(count(*) = 2 and bool_and(o.action = 'read:record' and o.patients), 'bedside.round and bedside.sheet: read:record, naming patients')
  from core.ops o where o.key in ('bedside.round', 'bedside.sheet');
select t.ok(o.patients, 'bedside.board names patients') from core.ops o where o.key = 'bedside.board';
select t.ok(s.screens = '{"screens":["base.beds","bedside.round"],"opens":"base.beds"}'::jsonb, 'bedside.ward: Beds and the Drug round, opening on Beds')
  from core.setups s where s.key = 'bedside.ward';
select t.ok(bedside.round_of(:'org', :'ward') = jsonb_build_object('times', k.shape #> '{properties,times,default}', 'late_after', (k.shape #>> '{properties,late_after,default}')::int,
  'night', k.shape #>> '{properties,night,default}'), 'unset, the round''s times are the setting''s own defaults') from core.setting_keys k where k.key = 'bedside.round';
select t.ok(bedside.timing('od') = 'OD' and bedside.timing('BID') = 'BD' and bedside.timing('tid') = 'TDS' and bedside.timing('QID') = 'QDS' and bedside.timing('Q6H') = 'q6h'
  and bedside.timing('stat') = 'stat' and bedside.timing('weekly') = 'weekly' and bedside.timing(null) is null, 'the timings: the composer''s codes and HL7''s alike');
select t.ok(bedside.cover('OD') = interval '12 hours' and bedside.cover('BD') = interval '9 hours' and bedside.cover('q12h') = interval '9 hours'
  and bedside.cover('TDS') = interval '6 hours' and bedside.cover('q8h') = interval '6 hours' and bedside.cover('QDS') = interval '4 hours 30 minutes'
  and bedside.cover('q6h') = interval '4 hours 30 minutes' and bedside.cover('q4h') = interval '3 hours' and bedside.cover('stat') = interval '0',
  'the first dose''s cover: three quarters of the interval, once a day half a day');
select t.ok(bedside.per_day('OD') = 1 and bedside.per_day('BD') = 2 and bedside.per_day('q12h') = 2 and bedside.per_day('TDS') = 3 and bedside.per_day('q8h') = 3
  and bedside.per_day('QDS') = 4 and bedside.per_day('q6h') = 4 and bedside.per_day('q4h') = 6 and bedside.per_day('weekly') is null, 'doses a day of each timing');

\echo '── (b) the ward''s times as a ward sets them: refused, under the field'
create function pg_temp.round_set(p jsonb) returns text language sql as $$
  select format('select public.write_setting(%L::jsonb)', jsonb_build_object('key', 'bedside.round', 'owner_id', '00000000-0000-0000-0000-0000000000d6', 'data', p))
$$;
select t.refuses(pg_temp.round_set('{"times":[{"timing":"TDS","at":"06:00 14:00"}],"late_after":60}'), 'wrong_count');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"q8h","at":"06:00 14:00 20:00"}],"late_after":60}'), 'not_every');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"OD","at":"08:00"},{"timing":"OD","at":"09:00"}],"late_after":60}'), 'duplicate');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"BD","at":"08:00 08:00"}],"late_after":60}'), 'duplicate');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"BD","at":"8:00 20:00"}],"late_after":60}'), 'bad_shape');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"BD","at":"08:00 20:00"}],"late_after":20}'), 'bad_shape');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"q12h","at":"08:00 21:00"}],"late_after":60}'), 'not_every');
select t.refuses(pg_temp.round_set('{"times":[{"timing":"q4h","at":"02:00 06:00 10:00 14:00 18:00 23:00"}],"late_after":60}'), 'not_every');
select t.ok(core.setting_at(:'org', 'bedside.round', :'ward') is null, 'nothing is written: the round keeps its defaults');

set role authenticated;
create function pg_temp.at(p text) returns timestamptz language sql immutable as $$ select p::timestamp at time zone 'Africa/Cairo' $$;
create function pg_temp.iso(p text) returns text language sql immutable as $$ select to_jsonb(pg_temp.at(p)) #>> '{}' $$;
create function pg_temp.op(p_op text, p_dept uuid, p_args jsonb) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', p_op, 'department_id', p_dept, 'args', p_args, 'purpose', 'TREAT'))
$$;
create function pg_temp.med(r jsonb, p uuid) returns jsonb language sql immutable as $$
  select m from (select m from jsonb_array_elements(coalesce(r -> 'medicines', '[]')) m
                 union all select m from jsonb_array_elements(coalesce(r -> 'stays', '[]')) s, jsonb_array_elements(s -> 'medicines') m) x
   where m ->> 'medication' = p::text limit 1
$$;
create function pg_temp.states(m jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(to_char((x ->> 'due')::timestamptz at time zone 'Africa/Cairo', 'HH24:MI') || ' ' || (x ->> 'state')
    || case when (x ->> 'first')::boolean then ' first' else '' end order by (x ->> 'due')::timestamptz), '{}')
  from jsonb_array_elements(coalesce(m -> 'slots', '[]')) x
$$;
create function pg_temp.rx(drug text, dose text, unit text, timing text, route text, more jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('basis', 'prescribed', 'drug', jsonb_build_object('text', drug), 'dosage', jsonb_strip_nulls(jsonb_build_object(
    'dose', case when dose is not null then jsonb_build_object('value', dose, 'unit', unit, 'ucum', unit) end,
    'timing', case when timing is not null then jsonb_build_object('code', timing) end, 'route', route)), 'status', 'active') || more
$$;
create function pg_temp.dose(med uuid, drug text, dose text, unit text, route text, due text, why text default null) returns jsonb language sql immutable as $$
  select case when why is null then jsonb_strip_nulls(jsonb_build_object('medication', med, 'drug', jsonb_build_object('text', drug),
      'dose', jsonb_build_object('value', dose, 'unit', unit, 'ucum', unit), 'route', route, 'status', 'completed',
      'bedside', case when due is not null then jsonb_build_object('due', pg_temp.iso(due)) end))
    else jsonb_strip_nulls(jsonb_build_object('medication', med, 'drug', jsonb_build_object('text', drug), 'route', route, 'status', 'not-done', 'reason', initcap(why),
      'bedside', jsonb_strip_nulls(jsonb_build_object('due', case when due is not null then pg_temp.iso(due) end, 'not_given', why)))) end
$$;
-- one entry at its clinical time
create function pg_temp.e(p_type text, p_patient uuid, p_dept uuid, p_data jsonb, p_id uuid, p_visit uuid, p_at text, p_refers uuid default null) returns jsonb language sql as $$
  select t.e(p_type, p_patient, p_dept, p_data, p_id, p_visit, p_refers, case when p_refers is not null then 'changes' end, null,
    jsonb_build_object('occurred_at', pg_temp.at(p_at)))
$$;

\echo '── (c) the shared case: Ahmed on the ward, his medicines, Sara''s doses'
select t.as(:'dr');
select t.landed(t.w(pg_temp.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'stay', :'stay', '2026-03-09 09:00')), 'Ahmed admitted to the ward with no bed');
select t.landed(t.w(jsonb_build_array(
  pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Ceftriaxone', '1', 'g', 'OD', 'iv', '{"duration_days":7}'), :'m1', :'stay', '2026-03-09 09:30'),
  pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Paracetamol', '1', 'g', 'q6h', 'iv'), :'m2', :'stay', '2026-03-09 09:30'),
  pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Omeprazole', '40', 'mg', 'OD', 'oral', '{"instructions":"at night"}'), :'m3', :'stay', '2026-03-09 09:30'),
  pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Salbutamol', '5', 'mg', 'q4h', 'inhaled'), :'m4', :'stay', '2026-03-09 09:30'),
  pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Ondansetron', '4', 'mg', null, 'iv') || '{"dosage":{"dose":{"value":"4","unit":"mg","ucum":"mg"},"route":"iv","as_needed":true,"as_needed_for":"nausea"}}',
    :'m5', :'stay', '2026-03-09 09:30'))), 'Dr Ali''s five medicines in the stay');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Metronidazole', '500', 'mg', 'TDS', 'iv', '{"duration_days":5}'), :'m6', :'stay', '2026-03-10 13:50')), 'metronidazole TDS for 5 days');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Furosemide', '40', 'mg', 'stat', 'iv'), :'m8', :'stay', '2026-03-10 12:00')), 'furosemide once, now');
select t.landed(t.w(t.e('medication', :'pt', :'im', pg_temp.rx('Amlodipine', '5', 'mg', 'OD', 'oral'), :'m7', null, null, null, null, jsonb_build_object('occurred_at', pg_temp.at('2026-03-01 10:00')))),
  'amlodipine prescribed in Internal Medicine, no visit');
select t.as(:'rec');
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'pt2', 'given', jsonb_build_array('Mona'),
  'family', 'Saleh', 'gender', 'female', 'birth_date', '1975-06-02'))) is not null as registered;
select t.as(:'dr');
select t.landed(t.w(t.e('medication', :'pt2', :'im', pg_temp.rx('Aspirin', '75', 'mg', 'OD', 'oral'), :'m9')), 'Mona''s aspirin');
select t.as(:'nurse');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m1', 'Ceftriaxone', '1', 'g', 'iv', '2026-03-09 09:30'), :'d1', :'stay', '2026-03-09 09:40')), 'd1: ceftriaxone''s first dose');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m1', 'Ceftriaxone', '1', 'g', 'iv', '2026-03-10 08:00'), :'d2', :'stay', '2026-03-10 08:10')), 'd2: ceftriaxone 08:00');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '1', 'g', 'iv', '2026-03-09 09:30'), :'d3', :'stay', '2026-03-09 09:45')), 'd3: paracetamol''s first dose');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '1', 'g', 'iv', '2026-03-09 14:00'), :'d4', :'stay', '2026-03-09 14:05')), 'd4: paracetamol 14:00');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', null, null, 'iv', '2026-03-09 20:00', 'refused'), :'d5', :'stay', '2026-03-09 20:10')), 'd5: paracetamol 20:00 refused');
select t.landed(t.w(pg_temp.e('given', :'pt', :'ward', jsonb_build_object('medication', :'m2', 'drug', jsonb_build_object('text', 'Paracetamol'), 'dose', '{"value":"1","unit":"g","ucum":"g"}'::jsonb,
  'route', 'iv', 'status', 'completed'), :'d6', :'stay', '2026-03-10 02:20')), 'd6: a plain base given of paracetamol, naming no time');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m3', 'Omeprazole', '40', 'mg', 'oral', '2026-03-09 09:30'), :'d7', :'stay', '2026-03-09 09:50')), 'd7: omeprazole naming 09:30');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m3', 'Omeprazole', '40', 'mg', 'oral', '2026-03-09 22:00'), :'d8', :'stay', '2026-03-09 22:05')), 'd8: omeprazole 22:00');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m5', 'Ondansetron', '4', 'mg', 'iv', null), :'d9', :'stay', '2026-03-10 03:10')), 'd9: ondansetron as needed');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m5', 'Ondansetron', '4', 'mg', 'iv', null), :'d10', :'stay', '2026-03-10 13:30')), 'd10: ondansetron again');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'d4') ->> 'line' = 'Given: Paracetamol 1 g iv · the 14:00 dose', 'd4''s line: ' || (t.entry(t.record(:'pt', :'ward'), :'d4') ->> 'line'));
select t.ok(t.entry(t.record(:'pt', :'ward'), :'d5') ->> 'line' = 'Not given: Paracetamol iv · Refused · the 20:00 dose', 'd5''s line: ' || (t.entry(t.record(:'pt', :'ward'), :'d5') ->> 'line'));
select t.refused(t.w(t.e('bedside.dose', :'pt', :'ward', jsonb_build_object('medication', :'m2', 'route', 'iv', 'status', 'not-done'), null, :'stay')), 'reason_missing', 'not given with no reason');
select t.refused(t.w(t.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m9', 'Aspirin', '75', 'mg', 'oral', null), null, :'stay')), 'not_a_medicine', 'Mona''s medicine');
select t.refused(t.w(t.e('bedside.dose', :'pt', :'ward', pg_temp.dose(gen_random_uuid(), 'Aspirin', '75', 'mg', 'oral', null), null, :'stay')), 'not_a_medicine', 'no medicine at all');
select t.refused(t.w(t.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '1', 'g', 'iv', null) || '{"bedside":{"not_given":"refused"}}', null, :'stay')),
  'reason_on_given', 'a dose given with a reason for not giving');
select t.refused(t.w(t.e('bedside.dose', :'pt', :'im', pg_temp.dose(:'m2', 'Paracetamol', '1', 'g', 'iv', null))), 'not_allowed', 'Internal Medicine does not use Ward nursing');

\echo '── (d) the sheet at 14:06'
create temp table sh as select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:06'))) today,
  pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'yesterday', 'now', pg_temp.iso('2026-03-10 14:06'))) yesterday,
  pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'stay', 'now', pg_temp.iso('2026-03-10 14:06'))) whole,
  pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'stay', 'now', pg_temp.iso('2026-03-20 12:00'))) later;
select t.ok(pg_temp.states(pg_temp.med(today, :'m1')) = array['08:00 given'], 'today ceftriaxone: ' || pg_temp.states(pg_temp.med(today, :'m1'))::text) from sh;
select t.ok(pg_temp.states(pg_temp.med(today, :'m2')) = array['02:00 given', '08:00 late', '14:00 due', '20:00 upcoming'],
  'today paracetamol, 02:00 the plain given''s: ' || pg_temp.states(pg_temp.med(today, :'m2'))::text) from sh;
select t.ok(pg_temp.states(pg_temp.med(today, :'m3')) = array['22:00 upcoming'], 'today omeprazole at night: ' || pg_temp.states(pg_temp.med(today, :'m3'))::text) from sh;
select t.ok(pg_temp.states(pg_temp.med(today, :'m4')) = '{}' and (pg_temp.med(today, :'m4') ->> 'unset')::boolean, 'salbutamol every 4 hours: no ward times, unset') from sh;
select t.ok(pg_temp.states(pg_temp.med(today, :'m5')) = '{}' and (pg_temp.med(today, :'m5') ->> 'prn')::boolean
  and (select array_agg(to_char((x ->> 'at')::timestamptz at time zone 'Africa/Cairo', 'HH24:MI') order by x ->> 'at') from jsonb_array_elements(pg_temp.med(today, :'m5') -> 'extra') x) = array['03:10', '13:30'],
  'ondansetron as needed: no times, its two doses extra') from sh;
select t.ok(pg_temp.states(pg_temp.med(today, :'m6')) = array['13:50 due first', '22:00 upcoming'], 'metronidazole: the first dose, 14:00 under it: ' || pg_temp.states(pg_temp.med(today, :'m6'))::text) from sh;
select t.ok(pg_temp.states(pg_temp.med(today, :'m8')) = array['12:00 late first'], 'furosemide once: ' || pg_temp.states(pg_temp.med(today, :'m8'))::text) from sh;
select t.ok((pg_temp.med(today, :'m7') ->> 'elsewhere')::boolean and pg_temp.states(pg_temp.med(today, :'m7')) = '{}' and not (pg_temp.med(today, :'m7') ? 'unset'),
  'amlodipine: not prescribed in this stay, no times') from sh;
select t.ok(pg_temp.med(today, :'m9') is null and today -> 'patient_ids' = jsonb_build_array(:'pt') and today ->> 'stay' = :'stay', 'Mona''s aspirin is not there; the stay and its patient') from sh;
select t.ok(pg_temp.states(pg_temp.med(yesterday, :'m1')) = array['09:30 given first'], 'yesterday ceftriaxone: the first dose stands until 21:30') from sh;
select t.ok(pg_temp.states(pg_temp.med(yesterday, :'m2')) = array['09:30 given first', '20:00 not_given']
  and (select array_agg(x ->> 'dose') from jsonb_array_elements(pg_temp.med(yesterday, :'m2') -> 'extra') x) = array[:'d4'],
  'yesterday paracetamol: 14:00 stands under the first dose, d4 extra: ' || pg_temp.states(pg_temp.med(yesterday, :'m2'))::text) from sh;
select t.ok(pg_temp.states(pg_temp.med(yesterday, :'m3')) = array['22:00 given']
  and (select array_agg(x ->> 'dose') from jsonb_array_elements(pg_temp.med(yesterday, :'m3') -> 'extra') x) = array[:'d7'],
  'yesterday omeprazole: no first dose at night, d7 extra') from sh;
select t.ok(jsonb_array_length(pg_temp.med(whole, :'m2') -> 'slots') = 6, 'the whole stay: paracetamol''s 6 times') from sh;
select t.ok(jsonb_array_length(pg_temp.med(later, :'m1') -> 'slots') = 7
  and to_char((pg_temp.med(later, :'m1') -> 'slots' -> 6 ->> 'due')::timestamptz at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') = '2026-03-15 08:00',
  'ceftriaxone for 7 days: 7 times, the last on the 15th at 08:00') from sh;
select t.ok(jsonb_array_length(pg_temp.med(later, :'m6') -> 'slots') = 15
  and to_char((pg_temp.med(later, :'m6') -> 'slots' -> 14 ->> 'due')::timestamptz at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') = '2026-03-15 06:00',
  'metronidazole TDS for 5 days: 15 times, the last on the 15th at 06:00') from sh;
select t.ok(to_char((pg_temp.med(later, :'m2') -> 'slots' -> -1 ->> 'due')::timestamptz at time zone 'Africa/Cairo', 'YYYY-MM-DD') = '2026-03-20', 'paracetamol, no course, goes on') from sh;
select t.ok((select bool_and(x ->> 'dose' is not null and x ? 'at' and x ->> 'by' = '00000000-0000-0000-0000-0000000000b3') from jsonb_array_elements(pg_temp.med(whole, :'m2') -> 'slots') x
  where x ->> 'state' in ('given', 'not_given')) and (select x ->> 'not_given' from jsonb_array_elements(pg_temp.med(whole, :'m2') -> 'slots') x where x ->> 'dose' = :'d5') = 'refused',
  'each time with a dose names it, when and by whom; d5 says refused') from sh;

\echo '── (e) the round at 14:06'
create temp table rd as select pg_temp.op('bedside.round', :'ward', jsonb_build_object('now', pg_temp.iso('2026-03-10 14:06'))) r;
select t.ok((r ->> 'round_at')::timestamptz = pg_temp.at('2026-03-10 14:00') and (r ->> 'opens_at')::timestamptz = pg_temp.at('2026-03-10 13:00') and (r ->> 'late_after')::int = 60
  and jsonb_array_length(r -> 'stays') = 1 and r -> 'patient_ids' = jsonb_build_array(:'pt'), 'the 14:00 round, opened at 13:00, one stay') from rd;
select t.ok(count(*) filter (where x ->> 'state' = 'due') = 2 and count(*) filter (where x ->> 'state' = 'late') = 2, 'due 2 (paracetamol 14:00, metronidazole''s first), late 2 (paracetamol 08:00, furosemide)')
  from rd, jsonb_array_elements(r -> 'stays' -> 0 -> 'medicines') m, jsonb_array_elements(m -> 'slots') x;
select t.ok((pg_temp.med(r, :'m5') ->> 'prn')::boolean and (pg_temp.med(r, :'m4') ->> 'unset')::boolean and (pg_temp.med(r, :'m7') ->> 'elsewhere')::boolean
  and jsonb_array_length(pg_temp.med(r, :'m7') -> 'slots') = 0, 'ondansetron as needed, salbutamol unset, amlodipine elsewhere') from rd;
select t.ok(exists (select 1 from jsonb_array_elements(pg_temp.med(r, :'m5') -> 'extra') x where (x ->> 'at')::timestamptz >= (r ->> 'opens_at')::timestamptz),
  'the 13:30 ondansetron is since the round opened') from rd;
select t.ok(exists (select 1 from jsonb_array_elements(pg_temp.med(r, :'m2') -> 'slots') x where x ->> 'dose' = :'d6' and (x ->> 'at')::timestamptz = pg_temp.at('2026-03-10 02:20')),
  'the last dose comes from the read: paracetamol''s 02:00 by d6 at 02:20') from rd;
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'bedside.round'), 'the round''s read is logged for Ahmed');
set role authenticated;

\echo '── (f) the board at 14:06'
select t.ok(b -> 'doses' -> :'stay' = '{"late":2,"due":2,"unset":1}'::jsonb, 'the board: 2 late, 2 due, 1 unset: ' || (b -> 'doses')::text)
  from (select pg_temp.op('bedside.board', :'ward', jsonb_build_object('now', pg_temp.iso('2026-03-10 14:06'))) b) x;

\echo '── (g) refused'
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.round','department_id',%L))$q$, :'im'), 'not_used_here');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.sheet','department_id',%L,'args',jsonb_build_object('stay',%L,'day','month')))$q$, :'ward', :'stay'), 'unknown_day');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.sheet','department_id',%L,'args',jsonb_build_object('stay','x')))$q$, :'ward'), 'unknown_stay');
select t.ok(r -> 'stay' = 'null'::jsonb and r -> 'patient_ids' = '[]'::jsonb, 'a stay that is not this ward''s answers nothing')
  from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', gen_random_uuid())) r) x;
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.round','department_id',%L))$q$, :'ward'), 'not_allowed');

\echo '── (h) changes, then again at 14:06'
select t.as(:'dr');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Amlodipine', '5', 'mg', 'OD', 'oral'), :'m7b', :'stay', '2026-03-10 09:00', :'m7')), 'amlodipine continued in the stay');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Ceftriaxone', '1', 'g', 'OD', 'iv', '{"duration_days":7,"status":"stopped"}'), :'m1b', :'stay', '2026-03-10 10:00', :'m1')), 'ceftriaxone stopped');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Paracetamol', '500', 'mg', 'q6h', 'iv'), :'m2b', :'stay', '2026-03-10 10:30', :'m2')), 'paracetamol changed to 500 mg');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Zopiclone', '7.5', 'mg', null, 'oral', '{"instructions":"at night"}'), :'m10', :'stay', '2026-03-10 11:00')), 'zopiclone at night, no timing');
select t.as(:'nurse');
select t.landed(t.w(t.e('crossed_out', :'pt', :'ward', '{"reason":"wrong_value"}', :'x1', :'stay', null, null, :'d3')), 'd3 crossed out');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '500', 'mg', 'iv', '2026-03-10 14:00'), :'d11', :'stay', '2026-03-10 14:05')), 'd11: paracetamol 14:00');
create temp table ch as select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:06'))) today,
  pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'yesterday', 'now', pg_temp.iso('2026-03-10 14:06'))) yesterday,
  pg_temp.op('bedside.round', :'ward', jsonb_build_object('now', pg_temp.iso('2026-03-10 14:06'))) r,
  pg_temp.op('bedside.board', :'ward', jsonb_build_object('now', pg_temp.iso('2026-03-10 14:06'))) b;
select t.ok(pg_temp.states(pg_temp.med(today, :'m7')) = '{}' and not (pg_temp.med(today, :'m7') ? 'elsewhere') and not coalesce((pg_temp.med(today, :'m7') ->> 'new')::boolean, false),
  'amlodipine continued here: listed, no time today, no first dose') from ch;
select t.ok(pg_temp.states(pg_temp.med(today, :'m1')) = array['08:00 given'] and pg_temp.med(today, :'m1') ->> 'status' = 'stopped', 'ceftriaxone stopped: its 08:00 kept') from ch;
select t.ok(pg_temp.med(today, :'m2') -> 'dose' ->> 'value' = '500' and pg_temp.states(pg_temp.med(today, :'m2')) = array['02:00 given', '08:00 late', '14:00 given', '20:00 upcoming'],
  'paracetamol 500 mg: ' || pg_temp.states(pg_temp.med(today, :'m2'))::text) from ch;
select t.ok((pg_temp.med(today, :'m10') ->> 'unset')::boolean and pg_temp.states(pg_temp.med(today, :'m10')) = '{}', 'zopiclone at night with no timing: times not set, listed') from ch;
select t.ok(pg_temp.states(pg_temp.med(yesterday, :'m2')) = array['09:30 missed first', '20:00 not_given']
  and (select array_agg(x ->> 'dose') from jsonb_array_elements(pg_temp.med(yesterday, :'m2') -> 'extra') x) = array[:'d4'],
  'd3 crossed out: yesterday''s first dose reads missed, never late; d4 stays extra') from ch;
select t.ok(b -> 'doses' -> :'stay' = '{"late":2,"due":1,"unset":2}'::jsonb, 'the board: still 2 late, 1 due, 2 unset: ' || (b -> 'doses')::text) from ch;
select t.ok(count(*) filter (where x ->> 'state' = 'due') = 1, 'the round''s due is 1') from ch, jsonb_array_elements(r -> 'stays' -> 0 -> 'medicines') m, jsonb_array_elements(m -> 'slots') x;
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', null, null, 'iv', '2026-03-10 08:00', 'refused'), :'d12', :'stay', '2026-03-10 14:07')), 'd12: 08:00 refused');
select t.ok(pg_temp.states(pg_temp.med(s, :'m2')) @> array['08:00 not_given'], 'the 08:00 not given') from (select pg_temp.op('bedside.sheet', :'ward',
  jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:10'))) s) x;
select t.ok(count(*) filter (where x ->> 'state' = 'late') = 1, 'late 1: furosemide') from (select pg_temp.op('bedside.round', :'ward', jsonb_build_object('now', pg_temp.iso('2026-03-10 14:10'))) r) y,
  jsonb_array_elements(r -> 'stays' -> 0 -> 'medicines') m, jsonb_array_elements(m -> 'slots') x;
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '500', 'mg', 'iv', '2026-03-10 08:00'), :'d13', :'stay', '2026-03-10 14:08')), 'd13: 08:00 given after all');
select t.ok((select x ->> 'state' = 'given' and x ->> 'dose' = :'d13' from jsonb_array_elements(pg_temp.med(s, :'m2') -> 'slots') x
    where (x ->> 'due')::timestamptz = pg_temp.at('2026-03-10 08:00'))
  and exists (select 1 from jsonb_array_elements(pg_temp.med(s, :'m2') -> 'extra') x where x ->> 'dose' = :'d12' and x ->> 'status' = 'not-done'),
  'a dose given outranks a refusal naming the same time: d13 takes 08:00, d12 is extra')
  from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:10'))) s) x;
-- an outranked dose naming a time is extra, never matched to the next free time by nearness: d14 gives the 20:00 at 20:05; d15, a second
-- dose naming 20:00 at 23:10, would otherwise take tomorrow's 02:00 (2 h 50 min away, within half the interval)
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '500', 'mg', 'iv', '2026-03-10 20:00'), :'d14', :'stay', '2026-03-10 20:05')), 'd14: paracetamol 20:00');
select t.landed(t.w(pg_temp.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '500', 'mg', 'iv', '2026-03-10 20:00'), :'d15', :'stay', '2026-03-10 23:10')), 'd15: a second dose naming 20:00');
select t.ok(exists (select 1 from jsonb_array_elements(pg_temp.med(s, :'m2') -> 'extra') x where x ->> 'dose' = :'d15')
  and (select x ->> 'dose' = :'d14' from jsonb_array_elements(pg_temp.med(s, :'m2') -> 'slots') x where (x ->> 'due')::timestamptz = pg_temp.at('2026-03-10 20:00')),
  'a second dose naming 20:00 is extra: d14 takes 20:00, d15 never takes tomorrow''s 02:00')
  from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 23:30'))) s) x;
select t.ok((select x ->> 'state' from jsonb_array_elements(pg_temp.med(s, :'m2') -> 'slots') x where (x ->> 'due')::timestamptz = pg_temp.at('2026-03-11 02:00')) = 'due',
  'tomorrow''s 02:00 is still due at 02:10')
  from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-11 02:10'))) s) x;
-- a medicine stopped with a time unrecorded: that time is missed, never due or late (the round never offers a stopped medicine)
select t.as(:'dr');
select t.landed(t.w(pg_temp.e('medication', :'pt', :'ward', pg_temp.rx('Furosemide', '40', 'mg', 'stat', 'iv', '{"status":"stopped"}'), :'m8b', :'stay', '2026-03-10 14:11', :'m8')), 'furosemide stopped');
select t.as(:'nurse');
select t.ok(pg_temp.states(pg_temp.med(s, :'m8')) = array['12:00 missed first'] and b -> 'doses' -> :'stay' ->> 'late' = '0',
  'furosemide stopped: its unrecorded 12:00 reads missed, and the board counts no dose late: ' || pg_temp.states(pg_temp.med(s, :'m8'))::text || ' ' || coalesce((b -> 'doses')::text, ''))
  from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:12'))) s,
               pg_temp.op('bedside.board', :'ward', jsonb_build_object('now', pg_temp.iso('2026-03-10 14:12'))) b) x;

\echo '── (i) FHIR: each dose names the prescription it was given on'
select t.as(:'dr');
create temp table fx as select e -> 'resource' r from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'ward')) -> 'entry') e;
reset role;
select t.ok(r -> 'request' ->> 'reference' = 'MedicationRequest/' || :'m2b', 'd11 on the 500 mg version: ' || coalesce(r -> 'request' ->> 'reference', 'none'))
  from fx where r ->> 'resourceType' = 'MedicationAdministration' and r ->> 'id' = (select item::text from core.entries where id = :'d11');
select t.ok(r -> 'request' ->> 'reference' = 'MedicationRequest/' || :'m2', 'd4 on the first version: ' || coalesce(r -> 'request' ->> 'reference', 'none'))
  from fx where r ->> 'resourceType' = 'MedicationAdministration' and r ->> 'id' = (select item::text from core.entries where id = :'d4');
select t.ok(r ->> 'status' = 'not-done' and r -> 'statusReason' = '[{"text":"Refused"}]'::jsonb, 'd5 not done, refused: ' || coalesce((r -> 'statusReason')::text, 'none'))
  from fx where r ->> 'resourceType' = 'MedicationAdministration' and r ->> 'id' = (select item::text from core.entries where id = :'d5');
select t.report('drug_round fhir', r ->> 'id' || ': ' || array_to_string(core.fhir_problems(r), '; ')) from fx where r ->> 'resourceType' = 'MedicationAdministration' and cardinality(core.fhir_problems(r)) > 0;
select t.ok(count(*) >= 10, count(*) || ' MedicationAdministrations, none with a problem') from fx where r ->> 'resourceType' = 'MedicationAdministration' and cardinality(core.fhir_problems(r)) = 0;
set role authenticated;

\echo '── (j) the ward''s own late time: 30 minutes'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'bedside.round', 'owner_id', :'ward', 'data', '{"times":[{"timing":"q6h","at":"02:00 08:00 14:00 20:00"},{"timing":"TDS","at":"06:00 14:00 22:00"},{"timing":"OD","at":"08:00"}],"late_after":30}'::jsonb)) ->> 'key' as set;
select t.as(:'nurse');
select t.ok(pg_temp.states(pg_temp.med(a, :'m6')) @> array['13:50 due first'] and pg_temp.states(pg_temp.med(b, :'m6')) @> array['13:50 late first']
  and (pg_temp.med(a, :'m4') ->> 'unset')::boolean and (pg_temp.med(a, :'m10') ->> 'unset')::boolean and pg_temp.states(pg_temp.med(a, :'m3')) = array['22:00 upcoming'],
  'late after 30: the first dose due at 14:15, late at 14:25; unset stays unset; at night still 22:00')
  from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:15'))) a,
               pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay', 'day', 'today', 'now', pg_temp.iso('2026-03-10 14:25'))) b) x;

\echo '── (k) only this ward''s admitted stays'
select t.as(:'ow');
select public.setup(jsonb_build_object('setup', 'bedside.ward', 'department_id', :'new', 'name', 'Second Ward', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'new')))) is not null as dr;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b3', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'new')))) is not null as nurse;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt2', :'new', '{"admit_source":"emd","reason":"cellulitis"}', :'stay2', :'stay2')), 'Mona admitted to the Second Ward');
select t.as(:'nurse');
select t.ok(not (r -> 'patient_ids' ? :'pt2') and not exists (select 1 from jsonb_array_elements(r -> 'stays') s where s ->> 'stay' = :'stay2'), 'the ward''s round leaves out the Second Ward''s stay')
  from (select pg_temp.op('bedside.round', :'ward', '{}') r) x;
select t.ok(r -> 'patient_ids' = jsonb_build_array(:'pt2') and jsonb_array_length(r -> 'stays') = 1 and r -> 'stays' -> 0 ->> 'stay' = :'stay2', 'the Second Ward''s round: its stay only')
  from (select pg_temp.op('bedside.round', :'new', '{}') r) x;
select t.ok(r -> 'stay' = 'null'::jsonb, 'the ward''s sheet of the Second Ward''s stay answers nothing') from (select pg_temp.op('bedside.sheet', :'ward', jsonb_build_object('stay', :'stay2')) r) x;
select t.as(:'dr');
select t.landed(t.w(t.move('discharged', :'stay', :'ward', '{"disposition":"home"}')), 'Ahmed discharged home');
select t.as(:'nurse');
select t.ok(r -> 'stays' = '[]'::jsonb and r -> 'patient_ids' = '[]'::jsonb, 'the round has no stays') from (select pg_temp.op('bedside.round', :'ward', '{}') r) x;
select t.ok(b -> 'doses' = '{}'::jsonb, 'the board''s doses are none') from (select pg_temp.op('bedside.board', :'ward', '{}') b) x;

\echo '── (l) off: the dose is refused, the base''s given lands'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'nurse');
select t.refused(t.w(t.e('bedside.dose', :'pt', :'ward', pg_temp.dose(:'m2', 'Paracetamol', '1', 'g', 'iv', null), null, :'stay')), 'pack_off', 'the clinic no longer uses Ward nursing');
select t.landed(t.w(t.e('given', :'pt', :'ward', jsonb_build_object('medication', :'m2', 'route', 'iv', 'status', 'completed'), null, :'stay')), 'a plain base given still lands');
select t.as(null);
