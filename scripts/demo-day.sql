-- A realistic clinic morning for the Demo Clinic, written through the doors as real users (never into tables):
-- reception registers and checks in :n patients to General Practice; the doctor sees most of them (vitals, a problem, a medicine, labs for
-- every third, a medicine sent to the pharmacy for every fourth); the lab collects, receives and answers; the pharmacy prepares and
-- dispenses; two are admitted to the ward;
-- one is seen in Psychiatry (a private note).
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
select (select count(*) from base.presence where organization_id = '00000000-0000-0000-0000-00000000a001' and state not in ('done', 'left', 'discharged')) as open_visits,
       (select count(*) from base.orders where organization_id = '00000000-0000-0000-0000-00000000a001' and status in ('active', 'in-progress')) as open_orders,
       (select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') as entries;
