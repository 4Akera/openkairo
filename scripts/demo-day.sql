-- A realistic clinic morning for the Demo Clinic, written through the doors as real users (never into tables):
-- reception registers and checks in :n patients to General Practice; the doctor sees most of them (vitals, a problem, a medicine, labs for
-- every third, a medicine sent to the pharmacy for every fourth); the lab collects, receives and answers; the pharmacy prepares and
-- dispenses; two are admitted to the ward;
-- one is seen in Psychiatry (a private note);
-- and one, Nadia Kamel, has a full chart: two past visits, a third that admitted her, and three days on the ward (the chart's demo).
-- Run:  npm run db:demo      (after npm run db:reset)
\set n 30
select set_config('opencare.demo_n', :'n', false);
do $$
declare
  org uuid := '00000000-0000-0000-0000-00000000a001'; desk uuid := '00000000-0000-0000-0000-00000000d001'; gp uuid := '00000000-0000-0000-0000-00000000d002';
  lab uuid := '00000000-0000-0000-0000-00000000d003'; pharm uuid := '00000000-0000-0000-0000-00000000d004'; psy uuid := '00000000-0000-0000-0000-00000000d005';
  ward uuid := '00000000-0000-0000-0000-00000000d006';
  reception text := '00000000-0000-0000-0000-000000000107'; doctor text := '00000000-0000-0000-0000-000000000102'; tech text := '00000000-0000-0000-0000-000000000105';
  pharmacist text := '00000000-0000-0000-0000-000000000109'; psychiatrist text := '00000000-0000-0000-0000-000000000108';
  given text[] := array['Ahmed','Mona','Omar','Salma','Karim','Nour','Hany','Laila','Youssef','Dina','Tarek','Rania','Mostafa','Heba','Amr','Yasmin','Khaled','Mariam','Sherif','Aya'];
  father text[] := array['Mohamed','Mahmoud','Ali','Hassan','Ibrahim','Mostafa','Abdallah','Samir','Adel','Fathy'];
  family text[] := array['Hassan','Saleh','Khaled','Fathy','Nabil','Adel','Saeed','Mahmoud','Ibrahim','Farouk','Mansour','Samir','Gamal','Helmy','Zaki'];
  women text[] := array['Mona','Salma','Nour','Laila','Dina','Rania','Heba','Yasmin','Mariam','Aya'];
  problems jsonb := '[{"text":"Type 2 diabetes mellitus","code":"E11.9"},{"text":"Essential hypertension","code":"I10"},{"text":"Asthma","code":"J45.9"},{"text":"Hypothyroidism","code":"E03.9"},{"text":"Gastro-oesophageal reflux disease","code":"K21.9"}]';
  drugs jsonb := '[{"text":"Metformin","atc":"A10BA02","dose":"500","timing":"BD"},{"text":"Amlodipine","atc":"C08CA01","dose":"5","timing":"OD"},{"text":"Salbutamol","atc":"R03AC02","dose":"100","timing":"PRN"},{"text":"Levothyroxine","atc":"H03AA01","dose":"50","timing":"OD"},{"text":"Omeprazole","atc":"A02BC01","dose":"20","timing":"OD"}]';
  services uuid[] := array['00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000c004'];
  n int := current_setting('opencare.demo_n')::int; i int; pid uuid; vid uuid; called uuid; ord uuid; med uuid; p jsonb; d jsonb; g text; r jsonb; st uuid; bed int := 0;
  hb numeric;
begin
  for i in 1..n loop
    pid := gen_random_uuid(); vid := gen_random_uuid(); called := gen_random_uuid();
    g := given[1 + i % array_length(given, 1)];
    -- the desk: register, check in to General Practice
    perform set_config('request.jwt.claim.sub', reception, true);
    perform public.save_patient(jsonb_build_object('department_id', desk, 'patient', jsonb_build_object('id', pid,
      'given', jsonb_build_array(g, father[1 + (i * 3) % array_length(father, 1)]), 'family', family[1 + (i * 7) % array_length(family, 1)],
      'gender', case when g = any (women) then 'female' else 'male' end, 'birth_date', make_date(1945 + (i * 13) % 60, 1 + i % 12, 1 + i % 28),
      'telecom', jsonb_build_array(jsonb_build_object('system', 'phone', 'value', '+2010' || lpad((i * 7919 % 100000000)::text, 8, '0'))))));
    r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', vid, 'type', 'checked_in', 'patient_id', pid,
      'department_id', desk, 'visit_id', vid, 'data', jsonb_build_object('department_id', gp, 'reason', (array['cough', 'follow-up', 'fever', 'back pain', 'refill'])[1 + i % 5],
        'priority', case when i % 11 = 0 then 'urgent' else 'routine' end)))));
    continue when i > n * 2 / 3;   -- the last third still wait
    -- the doctor: called, vitals, a problem and a medicine, Done (labs for every third, a medicine sent to the pharmacy for every fourth)
    perform set_config('request.jwt.claim.sub', doctor, true);
    p := problems -> (i % 5); d := drugs -> (i % 5); med := gen_random_uuid(); ord := gen_random_uuid();
    r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries',
      jsonb_build_array(
        jsonb_build_object('id', called, 'type', 'called', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'refers_to', vid, 'relation', 'changes', 'data', '{}'::jsonb),
        jsonb_build_object('id', gen_random_uuid(), 'type', 'vitals', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'data', jsonb_build_object(
          'bp', jsonb_build_object('sys', jsonb_build_object('value', (110 + i * 7 % 50)::text, 'unit', 'mmHg', 'ucum', 'mm[Hg]'), 'dia', jsonb_build_object('value', (70 + i * 3 % 25)::text, 'unit', 'mmHg', 'ucum', 'mm[Hg]')),
          'hr', jsonb_build_object('value', (62 + i * 5 % 40)::text, 'ucum', '/min'), 'temp', jsonb_build_object('value', (36.5 + (i % 4) * 0.4)::text, 'ucum', 'Cel'),
          'weight', jsonb_build_object('value', (58 + i * 11 % 45)::text, 'unit', 'kg', 'ucum', 'kg'))),
        jsonb_build_object('id', gen_random_uuid(), 'type', 'problem', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'data', jsonb_build_object(
          'concept', jsonb_build_object('text', p ->> 'text', 'codings', jsonb_build_array(jsonb_build_object('system', 'icd10', 'code', p ->> 'code', 'display', p ->> 'text'))),
          'clinical_status', 'active', 'verification', 'confirmed')),
        jsonb_build_object('id', med, 'type', 'medication', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'data', jsonb_build_object('basis', 'prescribed',
          'drug', jsonb_build_object('text', d ->> 'text', 'codings', jsonb_build_array(jsonb_build_object('system', 'atc', 'code', d ->> 'atc'))),
          'dosage', jsonb_build_object('dose', jsonb_build_object('value', d ->> 'dose', 'unit', case when d ->> 'text' = 'Salbutamol' then 'mcg' else 'mg' end, 'ucum', case when d ->> 'text' = 'Salbutamol' then 'ug' else 'mg' end),
            'timing', jsonb_build_object('code', d ->> 'timing')), 'duration_days', 30, 'status', 'active')),
        jsonb_build_object('id', gen_random_uuid(), 'type', 'note', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'data', jsonb_build_object('kind', 'plan',
          'text', 'Continue ' || lower(d ->> 'text') || '. Review in 3 months.')))
      || case when i % 3 = 0 then jsonb_build_array(jsonb_build_object('id', ord, 'type', 'order', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'data', jsonb_build_object(
            'service', jsonb_build_object('id', services[1 + i % 4], 'code', (array['cbc', 'hba1c', 'creat', 'lipids'])[1 + i % 4], 'name', (array['Complete blood count', 'HbA1c', 'Creatinine', 'Lipid panel'])[1 + i % 4]),
            'department_id', lab, 'priority', case when i % 9 = 0 then 'urgent' else 'routine' end, 'status', 'active'))) else '[]'::jsonb end
      || case when i % 4 = 0 then jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'order', 'patient_id', pid, 'department_id', gp, 'visit_id', vid,
            'refers_to', med, 'relation', 'about', 'data', jsonb_build_object('service', jsonb_build_object('id', '00000000-0000-0000-0000-00000000c007', 'code', 'dispense', 'name', 'Dispensing'),
            'department_id', pharm, 'priority', 'routine', 'status', 'active'))) else '[]'::jsonb end
      || jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'done', 'patient_id', pid, 'department_id', gp, 'visit_id', vid, 'refers_to', called, 'relation', 'changes',
            'data', jsonb_build_object('wait', i % 6 = 0))),
      'confirmed', '["allergy_clash","allergy_caution","duplicate_medication","duplicate_class","already_on_list"]'::jsonb));
    if r ->> 'outcome' <> 'landed' then raise notice 'visit % did not land: %', i, r; end if;
    -- the lab walks each order through its service's steps (collected, received) and answers with a first value; the last sample
    -- is still on its way, so its patient waits
    if i % 3 = 0 then
      perform set_config('request.jwt.claim.sub', tech, true);
      st := gen_random_uuid();
      r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', st, 'type', 'step', 'patient_id', pid,
        'department_id', lab, 'refers_to', ord, 'relation', 'answers', 'data', jsonb_build_object('status', 'in-progress', 'step', 'collected', 'specimen', 'L-' || i)))));
      if r ->> 'outcome' <> 'landed' then raise notice 'collected % did not land: %', i, r; end if;
      continue when i = 18;
      r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'step', 'patient_id', pid,
        'department_id', lab, 'refers_to', st, 'relation', 'changes', 'data', jsonb_build_object('status', 'in-progress', 'step', 'received', 'specimen', 'L-' || i)))));
      if r ->> 'outcome' <> 'landed' then raise notice 'received % did not land: %', i, r; end if;
      hb := case when i % 12 = 0 then 6.8 else 11 + (i % 7) end;
      r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'result', 'patient_id', pid,
        'department_id', lab, 'refers_to', ord, 'relation', 'answers', 'data', jsonb_build_object('status', 'final',
          'service', jsonb_build_object('id', services[1 + i % 4], 'name', (array['Complete blood count', 'HbA1c', 'Creatinine', 'Lipid panel'])[1 + i % 4]),
          'analytes', jsonb_build_array(case 1 + i % 4
            when 1 then jsonb_build_object('key', 'hb', 'name', 'Haemoglobin', 'code', jsonb_build_object('system', 'loinc', 'code', '718-7'),
              'value', jsonb_build_object('value', hb::text, 'unit', 'g/dL', 'ucum', 'g/dL'), 'interpretation', case when hb < 7 then 'LL' when hb < 12 then 'L' else 'N' end)
            when 2 then jsonb_build_object('key', 'hba1c', 'name', 'HbA1c', 'code', jsonb_build_object('system', 'loinc', 'code', '4548-4'),
              'value', jsonb_build_object('value', (5 + i % 5)::text, 'unit', '%', 'ucum', '%'), 'interpretation', case when 5 + i % 5 > 5.6 then 'H' else 'N' end)
            when 3 then jsonb_build_object('key', 'creat', 'name', 'Creatinine', 'code', jsonb_build_object('system', 'loinc', 'code', '2160-0'),
              'value', jsonb_build_object('value', (0.7 + (i % 5) * 0.2)::text, 'unit', 'mg/dL', 'ucum', 'mg/dL'), 'interpretation', case when 0.7 + (i % 5) * 0.2 > 1.2 then 'H' else 'N' end)
            else jsonb_build_object('key', 'ldl', 'name', 'LDL', 'code', jsonb_build_object('system', 'loinc', 'code', '2089-1'),
              'value', jsonb_build_object('value', (90 + i * 3 % 80)::text, 'unit', 'mg/dL', 'ucum', 'mg/dL'), 'interpretation', case when 90 + i * 3 % 80 > 100 then 'H' else 'N' end) end))))));
    end if;
  end loop;
end $$;

-- the ward and the pharmacy, as their own users, after the morning (a second block keeps the first readable)
do $$
declare org uuid := '00000000-0000-0000-0000-00000000a001'; pharm uuid := '00000000-0000-0000-0000-00000000d004'; ward uuid := '00000000-0000-0000-0000-00000000d006';
        desk uuid := '00000000-0000-0000-0000-00000000d001'; psy uuid := '00000000-0000-0000-0000-00000000d005';
        o record; r jsonb; pid uuid; vid uuid; called uuid; bed int := 0; w record;
begin
  -- the pharmacist dispenses half of what was sent, prepares the next one (the dispensing service's step) and leaves the last to give
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000109', true);
  for o in select item, patient_id from base.orders where organization_id = org and to_department_id = pharm and status = 'active' order by ordered_at limit 3 loop
    r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'pharmacy.dispense',
      'patient_id', o.patient_id, 'department_id', pharm, 'refers_to', o.item, 'relation', 'answers', 'data', jsonb_build_object('status', 'completed',
        'pharmacy', jsonb_build_object('items', jsonb_build_array(jsonb_build_object('drug', jsonb_build_object('text', 'as prescribed'),
          'quantity', jsonb_build_object('value', '30', 'unit', 'tablets', 'ucum', '{tbl}')))))))));
  end loop;
  for o in select item, patient_id from base.orders where organization_id = org and to_department_id = pharm and status = 'active' order by ordered_at limit 1 loop
    r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'pharmacy.dispense',
      'patient_id', o.patient_id, 'department_id', pharm, 'refers_to', o.item, 'relation', 'answers', 'data', '{"status":"in-progress","step":"prepared"}'::jsonb))));
    if r ->> 'outcome' <> 'landed' then raise notice 'prepared did not land: %', r; end if;
  end loop;
  -- two admissions to the ward, from waiting patients
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
  for w in select patient_id, item from base.presence where organization_id = org and state = 'done' order by checked_in_at limit 2 loop
    bed := bed + 1; vid := gen_random_uuid();
    r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', vid, 'type', 'admitted',
      'patient_id', w.patient_id, 'department_id', ward, 'refers_to', w.item, 'relation', 'about', 'visit_id', vid,
      'data', jsonb_build_object('department_id', ward, 'admit_source', 'outp', 'reason', 'observation',
        'place_id', ('00000000-0000-0000-0000-0000000b0' || lpad(bed::text, 3, '0'))::uuid)))));
  end loop;
  -- one patient seen in Psychiatry: a private note
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000107', true);
  select p.id into pid from core.patients p where p.organization_id = org order by p.number limit 1;
  vid := gen_random_uuid(); called := gen_random_uuid();
  r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(jsonb_build_object('id', vid, 'type', 'checked_in', 'patient_id', pid,
    'department_id', desk, 'visit_id', vid, 'data', jsonb_build_object('department_id', psy, 'reason', 'low mood')))));
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000108', true);
  r := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', jsonb_build_array(
    jsonb_build_object('id', called, 'type', 'called', 'patient_id', pid, 'department_id', psy, 'visit_id', vid, 'refers_to', vid, 'relation', 'changes', 'data', '{}'::jsonb),
    jsonb_build_object('id', gen_random_uuid(), 'type', 'note', 'patient_id', pid, 'department_id', psy, 'visit_id', vid, 'data', jsonb_build_object('kind', 'history_physical',
      'text', 'Low mood for two months; sleeping poorly. No thoughts of self-harm.')),
    jsonb_build_object('id', gen_random_uuid(), 'type', 'done', 'patient_id', pid, 'department_id', psy, 'visit_id', vid, 'refers_to', called, 'relation', 'changes', 'data', '{"wait":false}'::jsonb))));
end $$;
-- the full chart (chart-plan §7 step 3): one patient with a history and a three-day stay, so every part of the patient screen has data.
-- Written through the doors as the demo users like the morning above. The writer records every entry now, so the past is clinical time:
-- each entry's occurred_at (a visit's and the stay's opening entry too, so the chart dates them and counts the stay's days from it).
create function pg_temp.as_user(p text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p, true) $$;
create function pg_temp.e(p_type text, p_dept uuid, p_visit uuid, p_at timestamptz, p_data jsonb, p_id uuid default null, refers uuid default null, relation text default null,
  replaces uuid default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('id', coalesce(p_id, gen_random_uuid()), 'type', p_type, 'patient_id', '00000000-0000-0000-0000-0000000fc001', 'department_id', p_dept,
    'visit_id', p_visit, 'occurred_at', p_at, 'data', p_data, 'refers_to', refers, 'relation', relation, 'replaces', replaces))
$$;
-- one set; the warnings a clinician would confirm are confirmed (the demo's Sign anyway)
create function pg_temp.w(p_entries jsonb) returns jsonb language plpgsql as $$
declare r jsonb := public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', p_entries,
  'confirmed', '["allergy_clash","allergy_caution","duplicate_medication","duplicate_class","already_on_list"]'::jsonb));
begin
  if r ->> 'outcome' <> 'landed' then raise notice 'full chart: a % set did not land: %', p_entries -> 0 ->> 'type', r; end if;
  return r;
end $$;
create function pg_temp.q(v numeric, unit text, ucum text) returns jsonb language sql as $$ select jsonb_build_object('value', v::text, 'unit', unit, 'ucum', ucum) $$;
-- an analyte as the bench writes it: its value, the interpretation from the range, and the range copied in
create function pg_temp.analyte(k text, nm text, code text, v numeric, unit text, ucum text, lo numeric, hi numeric, clo numeric default null, chi numeric default null)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('key', k, 'name', nm, 'code', jsonb_build_object('system', 'loinc', 'code', code, 'display', nm), 'value', pg_temp.q(v, unit, ucum),
    'interpretation', case when v < clo then 'LL' when v > chi then 'HH' when v < lo then 'L' when v > hi then 'H' else 'N' end,
    'range', jsonb_strip_nulls(jsonb_build_object('low', case when lo is not null then pg_temp.q(lo, unit, ucum) end, 'high', case when hi is not null then pg_temp.q(hi, unit, ucum) end)),
    'critical', case when clo is not null or chi is not null then jsonb_strip_nulls(jsonb_build_object('low', case when clo is not null then pg_temp.q(clo, unit, ucum) end,
      'high', case when chi is not null then pg_temp.q(chi, unit, ucum) end)) end))
$$;
create function pg_temp.cbc(hb numeric, wbc numeric, plt numeric, status text default 'final') returns jsonb language sql as $$
  select jsonb_build_object('status', status, 'service', jsonb_build_object('id', '00000000-0000-0000-0000-00000000c001', 'name', 'Complete blood count'), 'specimen', 'L-' || (hb * 10)::int,
    'analytes', jsonb_build_array(pg_temp.analyte('hb', 'Haemoglobin', '718-7', hb, 'g/dL', 'g/dL', 12, 15.5, 7, 20), pg_temp.analyte('wbc', 'WBC', '6690-2', wbc, '10^9/L', '10*3/uL', 4, 11, 1, 30),
      pg_temp.analyte('plt', 'Platelets', '777-3', plt, '10^9/L', '10*3/uL', 150, 400, 50)))
$$;
create function pg_temp.a1c(v numeric) returns jsonb language sql as $$
  select jsonb_build_object('status', 'final', 'service', jsonb_build_object('id', '00000000-0000-0000-0000-00000000c002', 'name', 'HbA1c'),
    'analytes', jsonb_build_array(pg_temp.analyte('hba1c', 'HbA1c', '4548-4', v, '%', '%', 4, 5.6)))
$$;
create function pg_temp.lab_order(svc text, nm text, dept uuid, visit uuid, at timestamptz, id uuid) returns jsonb language sql as $$
  select pg_temp.e('order', dept, visit, at, jsonb_build_object('service', jsonb_build_object('id', ('00000000-0000-0000-0000-00000000' || svc)::uuid, 'name', nm),
    'department_id', '00000000-0000-0000-0000-00000000d003', 'priority', 'routine', 'status', 'active'), id)
$$;
-- the lab walks an order through its steps and answers it (the bench writes no visit_id); returns the result's id
create function pg_temp.lab(p_order uuid, p_at timestamptz, p_result jsonb) returns uuid language plpgsql as $$
declare lab uuid := '00000000-0000-0000-0000-00000000d003'; st uuid := gen_random_uuid(); rs uuid := gen_random_uuid();
begin
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000105');
  -- never later than now: a clinical time in the future is refused
  perform pg_temp.w(jsonb_build_array(pg_temp.e('step', lab, null, least(p_at, now()), '{"status":"in-progress","step":"collected"}', st, p_order, 'answers')));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('step', lab, null, least(p_at + interval '10 minutes', now()), '{"status":"in-progress","step":"received"}', null, st, 'changes')));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('result', lab, null, least(p_at + interval '40 minutes', now()), p_result, rs, p_order, 'answers')));
  return rs;
end $$;
create function pg_temp.vitals(sys int, dia int, hr int, t numeric, spo2 int default null, rr int default null, wt numeric default null, ht int default null, glu int default null)
returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('bp', jsonb_build_object('sys', pg_temp.q(sys, 'mmHg', 'mm[Hg]'), 'dia', pg_temp.q(dia, 'mmHg', 'mm[Hg]')), 'hr', pg_temp.q(hr, 'bpm', '/min'),
    'temp', pg_temp.q(t, '°C', 'Cel'), 'spo2', case when spo2 is not null then pg_temp.q(spo2, '%', '%') end, 'rr', case when rr is not null then pg_temp.q(rr, '/min', '/min') end,
    'weight', case when wt is not null then pg_temp.q(wt, 'kg', 'kg') end, 'height', case when ht is not null then pg_temp.q(ht, 'cm', 'cm') end,
    'glucose', case when glu is not null then pg_temp.q(glu, 'mg/dL', 'mg/dL') end))
$$;
create function pg_temp.med(drug text, atc text, dose numeric, timing text, more jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('basis', 'prescribed', 'drug', jsonb_build_object('text', drug, 'codings', jsonb_build_array(jsonb_build_object('system', 'atc', 'code', atc, 'display', drug))),
    'dosage', jsonb_build_object('dose', pg_temp.q(dose, 'mg', 'mg'), 'timing', jsonb_build_object('code', timing), 'route', 'oral'), 'status', 'active') || more
$$;
create function pg_temp.obs(code text, label text, value jsonb) returns jsonb language sql as $$
  select jsonb_build_object('code', jsonb_build_object('text', label, 'codings', jsonb_build_array(jsonb_build_object('system', 'loinc', 'code', code, 'display', label))), 'value', value)
$$;

do $$
declare
  desk uuid := '00000000-0000-0000-0000-00000000d001'; gp uuid := '00000000-0000-0000-0000-00000000d002'; ph uuid := '00000000-0000-0000-0000-00000000d004';
  ward uuid := '00000000-0000-0000-0000-00000000d006'; pt uuid := '00000000-0000-0000-0000-0000000fc001';
  reception text := '00000000-0000-0000-0000-000000000107'; doctor text := '00000000-0000-0000-0000-000000000102'; nurse text := '00000000-0000-0000-0000-000000000104';
  -- clinical times: two past visits (six and three months ago) and a stay admitted two days ago from a third; today's entries are written now
  today timestamptz := date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  ta timestamptz := today - interval '182 days' + interval '10 hours'; tb timestamptz := today - interval '91 days' + interval '10 hours 30 minutes';
  tc timestamptz := today - interval '2 days' + interval '9 hours 30 minutes'; d1 timestamptz := today - interval '2 days'; d2 timestamptz := today - interval '1 day';
  va uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); vb uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); vc uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  st uuid := gen_random_uuid(); pn uuid := gen_random_uuid(); met uuid := gen_random_uuid(); met2 uuid := gen_random_uuid(); gli uuid := gen_random_uuid(); sul uuid := gen_random_uuid();
  o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid(); o5 uuid := gen_random_uuid(); o6 uuid := gen_random_uuid();
  o7 uuid := gen_random_uuid(); rx uuid := gen_random_uuid(); cons uuid := gen_random_uuid(); wrong uuid := gen_random_uuid(); rb uuid; r1 uuid; r2 uuid; fixed uuid := gen_random_uuid();
  reply uuid := gen_random_uuid();
begin
  -- the desk registers Nadia Kamel; each visit is checked in there
  perform pg_temp.as_user(reception);
  perform public.save_patient(jsonb_build_object('department_id', desk, 'patient', jsonb_build_object('id', pt, 'given', jsonb_build_array('Nadia', 'Fouad'), 'family', 'Kamel',
    'gender', 'female', 'birth_date', '1971-05-12', 'telecom', jsonb_build_array(jsonb_build_object('system', 'phone', 'value', '+201001234567')))));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('checked_in', desk, va, ta, jsonb_build_object('department_id', gp, 'reason', 'diabetes follow-up'), va)));

  -- visit A, six months ago: the lists begin; HbA1c and a blood count, answered while she waits
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(
    pg_temp.e('called', gp, va, ta + interval '5 minutes', '{}', ca, va, 'changes'),
    pg_temp.e('vitals', gp, va, ta + interval '10 minutes', pg_temp.vitals(138, 86, 84, 36.8, 98, null, 81, 162)),
    pg_temp.e('problem', gp, va, ta + interval '15 minutes', '{"concept":{"text":"Type 2 diabetes mellitus","codings":[{"system":"icd10","code":"E11.9","display":"Type 2 diabetes mellitus"}]},
      "category":"problem-list-item","clinical_status":"active","verification":"confirmed","onset":{"value":"2019","precision":"year"}}'),
    pg_temp.e('problem', gp, va, ta + interval '15 minutes', jsonb_build_object('concept', '{"text":"Community-acquired pneumonia","codings":[{"system":"icd10","code":"J18.9","display":"Community-acquired pneumonia"}]}'::jsonb,
      'category', 'problem-list-item', 'clinical_status', 'active', 'verification', 'confirmed', 'onset', jsonb_build_object('value', to_char(ta at time zone 'Africa/Cairo', 'YYYY-MM-DD'), 'precision', 'day')), pn),
    pg_temp.e('medication', gp, va, ta + interval '20 minutes', pg_temp.med('Metformin', 'A10BA02', 500, 'BD', '{"duration_days":90}'), met),
    pg_temp.e('medication', gp, va, ta + interval '20 minutes', pg_temp.med('Gliclazide', 'A10BB09', 80, 'OD', '{"duration_days":90,"instructions":"with breakfast"}'), gli),
    pg_temp.e('allergy', gp, va, ta + interval '20 minutes', '{"concept":{"text":"Penicillins","codings":[{"system":"local.allergen","code":"penicillins","display":"Penicillins"}]},"type":"allergy",
      "category":["medication"],"criticality":"high","clinical_status":"active","verification":"confirmed","reactions":[{"manifestation":{"text":"Rash"},"severity":"severe"},{"manifestation":{"text":"Wheeze"}}]}'),
    pg_temp.e('allergy', gp, va, ta + interval '20 minutes', '{"concept":{"text":"Sulfonamide antibiotics","codings":[{"system":"local.allergen","code":"sulfonamide_antibiotics","display":"Sulfonamide antibiotics"}]},
      "type":"allergy","category":["medication"],"clinical_status":"active","verification":"unconfirmed","reactions":[{"manifestation":{"text":"Itching"},"severity":"mild"}]}', sul),
    pg_temp.lab_order('c002', 'HbA1c', gp, va, ta + interval '25 minutes', o1), pg_temp.lab_order('c001', 'Complete blood count', gp, va, ta + interval '25 minutes', o2),
    pg_temp.e('note', gp, va, ta + interval '30 minutes', '{"kind":"history_physical","text":"hx: diabetes since 2019 on diet alone; cough and fever for five days\nex: crackles at the right base; BMI 30.9\nplan: amoxicillin was refused (penicillin allergy); start metformin and gliclazide; HbA1c and a blood count today"}')));
  perform pg_temp.lab(o1, ta + interval '35 minutes', pg_temp.a1c(7.4));
  perform pg_temp.lab(o2, ta + interval '35 minutes', pg_temp.cbc(12.6, 11.8, 260));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('done', gp, va, ta + interval '2 hours', '{"wait":false}', null, ca, 'changes')));

  -- visit B, three months ago: pneumonia resolved, gliclazide stopped, metformin up and sent to the pharmacy, the sulfonamide allergy ruled
  -- out, aspirin she takes on her own; a note in the wrong record (crossed out) and a platelet count typed wrong (corrected)
  perform pg_temp.as_user(reception);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('checked_in', desk, vb, tb, jsonb_build_object('department_id', gp, 'reason', 'follow-up; low sugars'), vb)));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(
    pg_temp.e('called', gp, vb, tb + interval '5 minutes', '{}', cb, vb, 'changes'),
    pg_temp.e('vitals', gp, vb, tb + interval '10 minutes', pg_temp.vitals(142, 88, 80, 36.7, 98, 16, 80)),
    pg_temp.e('problem', gp, vb, tb + interval '15 minutes', jsonb_build_object('concept', '{"text":"Community-acquired pneumonia","codings":[{"system":"icd10","code":"J18.9","display":"Community-acquired pneumonia"}]}'::jsonb,
      'category', 'problem-list-item', 'clinical_status', 'resolved', 'verification', 'confirmed', 'abatement', jsonb_build_object('value', to_char((ta + interval '14 days') at time zone 'Africa/Cairo', 'YYYY-MM'), 'precision', 'month')), null, pn, 'changes'),
    pg_temp.e('medication', gp, vb, tb + interval '20 minutes', pg_temp.med('Metformin', 'A10BA02', 1000, 'BD', '{"duration_days":90}'), met2, met, 'changes'),
    pg_temp.e('order', gp, vb, tb + interval '20 minutes', '{"service":{"id":"00000000-0000-0000-0000-00000000c007","code":"dispense","name":"Dispensing"},"department_id":"00000000-0000-0000-0000-00000000d004","priority":"routine","status":"active"}', rx, met2, 'about'),
    pg_temp.e('medication', gp, vb, tb + interval '20 minutes', pg_temp.med('Gliclazide', 'A10BB09', 80, 'OD', '{"status":"stopped","status_reason":"hypoglycaemia twice this month"}'), null, gli, 'changes'),
    pg_temp.e('medication', gp, vb, tb + interval '20 minutes', pg_temp.med('Aspirin', 'B01AC06', 75, 'OD', '{"basis":"reported","instructions":"bought over the counter"}')),
    pg_temp.e('allergy', gp, vb, tb + interval '20 minutes', '{"concept":{"text":"Sulfonamide antibiotics","codings":[{"system":"local.allergen","code":"sulfonamide_antibiotics","display":"Sulfonamide antibiotics"}]},
      "type":"allergy","category":["medication"],"clinical_status":"inactive","verification":"refuted","note":"took co-trimoxazole in 2024 without a reaction"}', null, sul, 'changes'),
    pg_temp.e('list_review', gp, vb, tb + interval '25 minutes', '{"list":"medications","outcome":"reviewed"}'),
    pg_temp.e('list_review', gp, vb, tb + interval '25 minutes', '{"list":"allergies","outcome":"reviewed"}'),
    pg_temp.lab_order('c002', 'HbA1c', gp, vb, tb + interval '25 minutes', o3), pg_temp.lab_order('c001', 'Complete blood count', gp, vb, tb + interval '25 minutes', o4),
    pg_temp.e('note', gp, vb, tb + interval '30 minutes', '{"kind":"progress","text":"S: two hypos this month, both before lunch\nO: chest clear\nA: pneumonia resolved; diabetes not at target\nP: stop gliclazide; metformin 1 g twice a day; repeat HbA1c in three months"}'),
    pg_temp.e('note', gp, vb, tb + interval '31 minutes', '{"kind":"progress","text":"Chest pain on effort for two weeks; refer to cardiology."}', wrong)));
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000109');   -- the pharmacist gives the new dose
  perform pg_temp.w(jsonb_build_array(pg_temp.e('pharmacy.dispense', ph, null, tb + interval '1 hour', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Metformin 1 g"},"quantity":{"value":"60","unit":"tablets","ucum":"{tbl}"}}]}}', null, rx, 'answers')));
  perform pg_temp.lab(o3, tb + interval '35 minutes', pg_temp.a1c(7.9));
  rb := pg_temp.lab(o4, tb + interval '35 minutes', pg_temp.cbc(11.4, 6.8, 45));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('done', gp, vb, tb + interval '2 hours', '{"wait":false}', null, cb, 'changes')));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('crossed_out', gp, vb, null, '{"reason":"wrong_patient","text":"written in the wrong record"}', null, null, null, wrong)));
  perform pg_temp.as_user('00000000-0000-0000-0000-000000000105');   -- the lab corrects the platelets it typed wrong; the doctor has seen the correction
  perform pg_temp.w(jsonb_build_array(pg_temp.e('result', '00000000-0000-0000-0000-00000000d003', null, tb + interval '75 minutes', pg_temp.cbc(11.4, 6.8, 245, 'corrected') || '{"conclusion":"Platelets corrected: 45 was a typing error."}', fixed, null, null, rb)));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('reviewed', gp, null, null, '{}', null, fixed, 'about')));

  -- visit C, two days ago: pale and breathless; anaemia to explain; admitted to the ward (Bed 3)
  perform pg_temp.as_user(reception);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('checked_in', desk, vc, tc, jsonb_build_object('department_id', gp, 'reason', 'tired and breathless for a week'), vc)));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(
    pg_temp.e('called', gp, vc, tc + interval '5 minutes', '{}', cc, vc, 'changes'),
    pg_temp.e('vitals', gp, vc, tc + interval '10 minutes', pg_temp.vitals(150, 95, 104, 37.8, 95, 20, 79)),
    pg_temp.e('problem', gp, vc, tc + interval '15 minutes', '{"concept":{"text":"Anaemia, unspecified","codings":[{"system":"icd10","code":"D64.9","display":"Anaemia, unspecified"}]},"category":"encounter-diagnosis","clinical_status":"active","verification":"provisional"}'),
    pg_temp.e('note', gp, vc, tc + interval '20 minutes', '{"kind":"progress","text":"Pale, heart rate 104, breathless on the stairs. Admit for work-up of the anaemia."}'),
    pg_temp.e('done', gp, vc, tc + interval '30 minutes', '{"wait":false}', null, cc, 'changes')));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('admitted', ward, st, d1 + interval '14 hours', jsonb_build_object('department_id', ward, 'admit_source', 'outp',
    'reason', 'symptomatic anaemia; diabetes not at target', 'place_id', '00000000-0000-0000-0000-0000000b0003'), st, vc, 'about')));

  -- stay day 1: the admission clerking with her history, an alert, the labs; the nurse's first vitals; the doctor sees the results
  perform pg_temp.w(jsonb_build_array(
    pg_temp.e('note', ward, st, d1 + interval '16 hours', '{"kind":"history_physical","text":"hx: a week of tiredness and breathlessness; black stools twice\nex: pale; heart rate 100; abdomen soft\nplan: blood count and HbA1c; transfuse if Hb under 7; ask the GP about her diabetes"}'),
    pg_temp.e('alert', ward, st, d1 + interval '16 hours', jsonb_build_object('concept', '{"text":"Do not resuscitate","codings":[{"system":"local.alert","code":"dnr","display":"Do not resuscitate"}]}'::jsonb,
      'status', 'active', 'period', jsonb_build_object('start', d1 + interval '16 hours'), 'note', 'decided with her and her husband')),
    pg_temp.e('procedure', ward, st, d1 + interval '16 hours', '{"concept":{"text":"Appendicectomy","codings":[{"system":"local.procedure","code":"appendicectomy","display":"Appendicectomy"}]},"status":"completed","performed":{"value":"2010","precision":"year"},"outcome":"uncomplicated"}'),
    pg_temp.e('observation', ward, st, d1 + interval '16 hours', pg_temp.obs('72166-2', 'Tobacco smoking status', '{"concept":{"text":"Former smoker"}}') || '{"note":"stopped in 2015"}'),
    pg_temp.e('observation', ward, st, d1 + interval '16 hours', pg_temp.obs('11331-6', 'History of alcohol use', '{"text":"none"}')),
    pg_temp.e('observation', ward, st, d1 + interval '16 hours', pg_temp.obs('11341-5', 'History of occupation', '{"text":"primary school teacher"}')),
    pg_temp.e('observation', ward, st, d1 + interval '16 hours', pg_temp.obs('71802-3', 'Housing status', '{"text":"lives with her husband and daughter; second floor, no lift"}')),
    pg_temp.e('observation', ward, st, d1 + interval '16 hours', pg_temp.obs('10157-6', 'History of family member diseases', '{"text":"father: type 2 diabetes, heart attack at 62; mother: hypertension"}')),
    pg_temp.lab_order('c001', 'Complete blood count', ward, st, d1 + interval '16 hours', o5), pg_temp.lab_order('c002', 'HbA1c', ward, st, d1 + interval '16 hours', o6)));
  perform pg_temp.as_user(nurse);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('vitals', ward, st, d1 + interval '18 hours', pg_temp.vitals(146, 92, 98, 37.6, 96, 18))));
  r1 := pg_temp.lab(o5, d1 + interval '17 hours', pg_temp.cbc(8.2, 7.9, 231));
  r2 := pg_temp.lab(o6, d1 + interval '17 hours', pg_temp.a1c(8.1));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('reviewed', ward, null, d1 + interval '19 hours', '{}', null, r1, 'about'), pg_temp.e('reviewed', ward, null, d1 + interval '19 hours', '{}', null, r2, 'about')));

  -- day 2: vitals morning and evening, a bed move, paracetamol given, a repeat count, a question to the GP answered, an outside ECG on file
  perform pg_temp.as_user(nurse);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('vitals', ward, st, d2 + interval '8 hours', pg_temp.vitals(138, 88, 92, 37.2, 97, 16, null, null, 186))));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('moved', ward, st, d2 + interval '11 hours', '{"place_id":"00000000-0000-0000-0000-0000000b0005","reason":"closer to the nursing station"}', null, st, 'changes')));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('given', ward, st, d2 + interval '14 hours', '{"drug":{"text":"Paracetamol","codings":[{"system":"atc","code":"N02BE01","display":"Paracetamol"}]},"dose":{"value":"1","unit":"g","ucum":"g"},"route":"oral","status":"completed","note":"for a headache"}')));
  perform pg_temp.as_user(doctor);
  perform pg_temp.w(jsonb_build_array(
    pg_temp.e('note', ward, st, d2 + interval '10 hours', '{"kind":"progress","text":"Two units of blood overnight; feels better. Stools still dark.\nplan: repeat the blood count tomorrow; ask the GP about her diabetes"}'),
    pg_temp.lab_order('c001', 'Complete blood count', ward, st, d2 + interval '10 hours', o7),
    pg_temp.e('order', ward, st, d2 + interval '10 hours', jsonb_build_object('service', '{"name":"Consult","answer":"note"}'::jsonb, 'department_id', gp, 'priority', 'routine', 'status', 'active',
      'question', 'HbA1c 8.1 on metformin alone; gliclazide stopped for hypos. What next before she goes home?'), cons),
    pg_temp.e('note', ward, st, d2 + interval '12 hours', ('{"kind":"letter","heading":"Outside ECG","text":"ECG from her own cardiologist, three weeks ago.","attachments":[{"name":"outside-ecg.pdf","mime":"application/pdf","size":182344,"sha256":"'
      || encode(sha256('opencare demo outside-ecg.pdf'::bytea), 'hex') || '"}]}')::jsonb)));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('note', gp, null, d2 + interval '15 hours', '{"kind":"consult","text":"Agree gliclazide stays stopped. Add sitagliptin 100 mg once a day at discharge; HbA1c again in three months at the clinic."}', reply, cons, 'answers')));
  perform pg_temp.w(jsonb_build_array(pg_temp.e('reviewed', ward, null, d2 + interval '16 hours', '{}', null, reply, 'about')));
  perform pg_temp.as_user(nurse);
  perform pg_temp.w(jsonb_build_array(pg_temp.e('vitals', ward, st, d2 + interval '20 hours', pg_temp.vitals(134, 86, 90, 37.0, 97, 16))));

  -- day 3, today: the morning vitals, and the repeat count is critical (left for the doctor to review)
  perform pg_temp.w(jsonb_build_array(pg_temp.e('vitals', ward, st, null, pg_temp.vitals(132, 84, 88, 36.9, 98, 16))));
  perform pg_temp.lab(o7, greatest(now() - interval '50 minutes', today), pg_temp.cbc(6.6, 8.4, 212));
end $$;

select (select count(*) from base.presence where organization_id = '00000000-0000-0000-0000-00000000a001' and state not in ('done', 'left', 'discharged')) as open_visits,
       (select count(*) from base.orders where organization_id = '00000000-0000-0000-0000-00000000a001' and status in ('active', 'in-progress')) as open_orders,
       (select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') as entries;
