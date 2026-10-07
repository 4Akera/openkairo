-- The base's day (spec/openCare.md §5.1 rule 9) for the Demo Clinic (supabase/seeds/dev.sql), written through the doors as the
-- clinic's own people. Every time is relative to the moment it loads, so the queue and the ward look like a working day whenever
-- it is loaded: General Practice has patients waiting (the longest 40 minutes, a feverish four-year-old urgent), one in consult, the
-- morning's done (a pregnant woman, a breastfeeding mother and her baby, a sample on its way, a result back); two were admitted to
-- the ward; one was seen in Psychiatry (a private note); and Nadia Kamel has a full chart: two past visits, a third that admitted
-- her, three days on the ward, a critical result waiting. Alerts: DNR, fall risk, isolation for HBV. Values fit each patient's age
-- and sex. Today's minutes are demo.ago's, all after midnight however early it loads; a stay takes its bed when it is free
-- (demo.w_bed). Run by npm run db:demo (supabase/demo/load.sql); a reload erases these patients first (demo.patient).

select demo.layer('base');

create or replace function pg_temp.pid(p_name text) returns uuid language sql immutable as $$ select demo.id('base', 'patient:' || p_name) $$;

-- ── General Practice today: waiting, in consult ──
do $$
declare v uuid;
begin
  perform demo.patient(pg_temp.pid('youssef'), array['Youssef', 'Adel'], 'Nabil', 'male', demo.born(34, 61), '+201001184420');
  v := demo.arrive('cough for a week', 40);
  perform demo.triage(v, 33, demo.vitals(124, 80, 88, 37.6, 97, 18, 78));
  perform demo.patient(pg_temp.pid('heba'), array['Heba', 'Samir'], 'Gamal', 'female', demo.born(45, 200), '+201112093317');
  perform demo.arrive('headaches, worse in the mornings', 34);
  perform demo.patient(pg_temp.pid('khaled'), array['Khaled', 'Mostafa'], 'Zaki', 'male', demo.born(58, 12), '+201224470915');
  v := demo.arrive('diabetes follow-up', 26);
  perform demo.triage(v, 20, demo.vitals(138, 86, 76, 36.7, 98, null, 92, null, 182));
  perform demo.patient(pg_temp.pid('mariam'), array['Mariam', 'Ibrahim'], 'Helmy', 'female', demo.born(23, 95), '+201550318842');
  perform demo.arrive('sore throat', 18);
  -- a feverish four-year-old, urgent: a child's vitals (no blood pressure taken)
  perform demo.patient(pg_temp.pid('adam'), array['Adam', 'Tarek'], 'Fouda', 'male', demo.born(4, 130), '+201007741206');
  v := demo.arrive('fever since last night', 12, null, 'urgent');
  perform demo.triage(v, 8, demo.vitals(null, null, 128, 38.6, 98, 28, 16.4));
  perform demo.patient(pg_temp.pid('sherif'), array['Sherif', 'Fathy'], 'Mansour', 'male', demo.born(67, 300), '+201143355780');
  perform demo.arrive('low back pain', 5);
  -- in consult: hepatitis B known since a visit three months ago (isolation alert), called 8 minutes ago
  perform demo.patient(pg_temp.pid('gamal'), array['Gamal', 'Ahmed'], 'Eid', 'male', demo.born(47, 18), '+201006620193');
  v := demo.arrive('hepatitis B follow-up', 91 * 24 * 60);
  perform demo.consult(v, 91 * 24 * 60 - 10, jsonb_build_array(
    demo.gp('problem', v, 91 * 24 * 60 - 15, demo.problem('B18.1', 'Chronic viral hepatitis B')),
    demo.gp('alert', v, 91 * 24 * 60 - 15, jsonb_build_object('concept', demo.concept('local.alert', 'isolation_hbv', 'Isolation · HBV'), 'status', 'active',
      'period', jsonb_build_object('start', demo.ago(91 * 24 * 60 - 15)), 'note', 'blood and body fluid precautions')),
    demo.gp('medication', v, 91 * 24 * 60 - 20, demo.med('Tenofovir disoproxil', 'J05AF07', 300, 'mg', 'OD', '{"duration_days":90}'))), 91 * 24 * 60 - 30);
  v := demo.arrive('hepatitis B follow-up', 52);
  perform demo.triage(v, 45, demo.vitals(128, 82, 74, 36.6, 98, 16, 84));
  perform demo.consult(v, 8, '[]');
end $$;

-- ── General Practice today: seen this morning ──
do $$
declare v uuid; o uuid;
begin
  -- pregnant, 24 weeks by her last period
  perform demo.patient(pg_temp.pid('rana'), array['Rana', 'Abdelaziz'], 'Kamal', 'female', demo.born(29, 40), '+201014456021');
  v := demo.arrive('antenatal check', 190); o := gen_random_uuid();
  perform demo.consult(v, 170, jsonb_build_array(
    demo.gp('vitals', v, 166, demo.vitals(112, 70, 86, 36.8, 99, 16, 68)),
    demo.gp('pregnancy', v, 165, jsonb_build_object('status', 'current', 'pregnant', true,
      'lmp', jsonb_build_object('value', to_char((demo.now() at time zone 'Africa/Cairo')::date - 168, 'YYYY-MM-DD'), 'precision', 'day'))),
    demo.gp('medication', v, 160, demo.med('Folic acid', 'B03BB01', 400, 'mcg', 'OD', '{"duration_days":90}')),
    demo.gp('note', v, 158, demo.note('progress', 'Well; baby moving. Fundal height fits 24 weeks. Blood count today; back in four weeks.')),
    demo.lab_order('cbc', demo.base('gp'), v, demo.ago(158), o)), 150);
  perform demo.lab(o, demo.ago(145), demo.cbc(true, 11.2, 8.9, 241));
  -- a breastfeeding mother, tired (iron deficiency), and her three-month-old daughter's weight check: a baby's vitals
  perform demo.patient(pg_temp.pid('doaa'), array['Doaa', 'Saber'], 'Hamed', 'female', demo.born(27, 220), '+201227793304');
  v := demo.arrive('tired all the time', 150);
  perform demo.consult(v, 135, jsonb_build_array(
    demo.gp('vitals', v, 132, demo.vitals(108, 68, 92, 36.7, 99, 16, 61)),
    demo.gp('breastfeeding', v, 130, '{"status":"current","breastfeeding":true}'),
    demo.gp('problem', v, 130, demo.problem('D50.9', 'Iron deficiency anaemia')),
    demo.gp('medication', v, 128, demo.med('Ferrous sulfate', 'B03AA07', 200, 'mg', 'OD', '{"duration_days":60}')),
    demo.gp('note', v, 127, demo.note('progress', 'Three months after delivery, breastfeeding. Pale. Iron for two months; safe while breastfeeding.'))), 120);
  perform demo.patient(pg_temp.pid('yara'), array['Yara', 'Mostafa'], 'Hamdan', 'female', demo.born(0, 95), '+201227793304');
  v := demo.arrive('weight check', 148);
  perform demo.consult(v, 118, jsonb_build_array(
    demo.gp('vitals', v, 116, demo.vitals(null, null, 136, 36.8, 99, 40, 5.9, 60, null, 40.5)),
    demo.gp('note', v, 114, demo.note('progress', 'Exclusively breastfed, feeding well. Gaining weight along her line. Vaccines up to date.'))), 110);
  -- diabetes and blood pressure: HbA1c sent; the sample is still on its way, so he waits for it
  perform demo.patient(pg_temp.pid('ahmed'), array['Ahmed', 'Mahmoud'], 'Hassan', 'male', demo.born(61, 77), '+201091134562');
  v := demo.arrive('diabetes and blood pressure review', 130); o := gen_random_uuid();
  perform demo.consult(v, 110, jsonb_build_array(
    demo.gp('vitals', v, 108, demo.vitals(152, 94, 80, 36.9, 97, 16, 96, 172, 214)),
    demo.gp('problem', v, 106, demo.problem('E11.9', 'Type 2 diabetes mellitus')),
    demo.gp('problem', v, 106, demo.problem('I10', 'Essential hypertension')),
    demo.gp('medication', v, 104, demo.med('Metformin', 'A10BA02', 500, 'mg', 'BD', '{"duration_days":30}')),
    demo.gp('medication', v, 104, demo.med('Amlodipine', 'C08CA01', 5, 'mg', 'OD', '{"duration_days":30}')),
    demo.lab_order('hba1c', demo.base('gp'), v, demo.ago(102), o)), 95, true);
  perform demo.lab(o, demo.ago(90), null);
  -- hypothyroid, lipids sent and back an hour later: she waits to be seen again
  perform demo.patient(pg_temp.pid('salma'), array['Salma', 'Ali'], 'Saleh', 'female', demo.born(52, 151), '+201146620077');
  v := demo.arrive('thyroid follow-up', 170); o := gen_random_uuid();
  perform demo.consult(v, 150, jsonb_build_array(
    demo.gp('vitals', v, 148, demo.vitals(130, 84, 66, 36.5, 98, 14, 74)),
    demo.gp('problem', v, 146, demo.problem('E03.9', 'Hypothyroidism')),
    demo.gp('medication', v, 145, demo.med('Levothyroxine', 'H03AA01', 75, 'mcg', 'OD', '{"duration_days":90}')),
    demo.lab_order('lipids', demo.base('gp'), v, demo.ago(144), o)), 140, true);
  perform demo.lab(o, demo.ago(100), demo.lipids(232, 148, 46, 172));
  perform demo.patient(pg_temp.pid('omar'), array['Omar', 'Hassan'], 'Farouk', 'male', demo.born(39, 8), '+201271180034');
  v := demo.arrive('wheeze at night', 110);
  perform demo.consult(v, 95, jsonb_build_array(
    demo.gp('vitals', v, 93, demo.vitals(122, 78, 90, 36.8, 96, 20, 81)),
    demo.gp('problem', v, 91, demo.problem('J45.9', 'Asthma')),
    demo.gp('medication', v, 90, demo.med('Salbutamol', 'R03AC02', 100, 'mcg', 'PRN', '{"duration_days":30}'))), 85);
  perform demo.patient(pg_temp.pid('nour'), array['Nour', 'Khaled'], 'Ibrahim', 'female', demo.born(31, 33), '+201003398710');
  v := demo.arrive('burning on passing urine', 100);
  perform demo.consult(v, 80, jsonb_build_array(
    demo.gp('vitals', v, 78, demo.vitals(116, 74, 84, 37.3, 99, 16, 63)),
    demo.gp('problem', v, 76, demo.problem('N39.0', 'Urinary tract infection', '{"category":"encounter-diagnosis"}')),
    demo.gp('medication', v, 75, demo.med('Nitrofurantoin', 'J01XE01', 100, 'mg', 'BID', '{"duration_days":5}'))), 70);
  perform demo.patient(pg_temp.pid('hany'), array['Hany', 'Abdallah'], 'Saeed', 'male', demo.born(72, 260), '+201119904413');
  v := demo.arrive('heartburn', 95); o := gen_random_uuid();
  perform demo.consult(v, 70, jsonb_build_array(
    demo.gp('vitals', v, 68, demo.vitals(136, 80, 72, 36.6, 97, 16, 77)),
    demo.gp('problem', v, 66, demo.problem('K21.9', 'Gastro-oesophageal reflux disease')),
    demo.gp('medication', v, 65, demo.med('Omeprazole', 'A02BC01', 20, 'mg', 'OD', '{"duration_days":30}')),
    demo.lab_order('creat', demo.base('gp'), v, demo.ago(64), o)), 60);
  perform demo.lab(o, demo.ago(58), demo.creat(1.1));
  perform demo.patient(pg_temp.pid('laila'), array['Laila', 'Fathy'], 'Mahmoud', 'female', demo.born(66, 45), '+201505521976');
  v := demo.arrive('blood pressure check', 80); o := gen_random_uuid();
  perform demo.consult(v, 55, jsonb_build_array(
    demo.gp('vitals', v, 53, demo.vitals(148, 90, 78, 36.7, 97, 16, 70)),
    demo.gp('problem', v, 51, demo.problem('I10', 'Essential hypertension')),
    demo.gp('medication', v, 50, demo.med('Amlodipine', 'C08CA01', 5, 'mg', 'OD', '{"duration_days":30}')),
    demo.lab_order('cbc', demo.base('gp'), v, demo.ago(49), o)), 45);
  perform demo.lab(o, demo.ago(44), demo.cbc(true, 12.8, 6.4, 255));
end $$;

-- ── the ward: two admitted this morning from the clinic; Psychiatry: a private note ──
do $$
declare v uuid; s uuid; o uuid;
begin
  perform demo.patient(pg_temp.pid('ibrahim'), array['Ibrahim', 'Samir'], 'Nassar', 'male', demo.born(71, 99), '+201066615548');
  v := demo.arrive('breathless, worse for three days', 240);
  perform demo.consult(v, 225, jsonb_build_array(
    demo.gp('vitals', v, 222, demo.vitals(146, 88, 108, 37.9, 89, 26, 64)),
    demo.gp('problem', v, 220, demo.problem('J44.1', 'COPD with acute exacerbation', '{"category":"encounter-diagnosis"}')),
    demo.gp('note', v, 218, demo.note('progress', 'Exacerbation of COPD, saturation 89% on air. Admit for nebulisers and steroids.'))), 210);
  s := demo.admit(v, 1, 200, 'COPD exacerbation');
  perform demo.w(demo.base('doctor'), jsonb_build_array(
    demo.e('note', demo.base('ward'), s, demo.ago(180), demo.note('history_physical', 'hx: smoker for forty years, two admissions last winter\nex: wheeze both sides\nplan: prednisolone, salbutamol, oxygen to 92%')),
    demo.e('medication', demo.base('ward'), s, demo.ago(178), demo.med('Prednisolone', 'H02AB06', 40, 'mg', 'OD', '{"duration_days":5}')),
    demo.e('medication', demo.base('ward'), s, demo.ago(178), demo.med('Salbutamol', 'R03AC02', 100, 'mcg', 'QID', '{"duration_days":5}'))));
  perform demo.w(demo.base('nurse'), jsonb_build_array(demo.e('vitals', demo.base('ward'), s, demo.ago(60), demo.vitals(138, 84, 96, 37.4, 93, 20))));

  -- confused with a urine infection, 82: a fall risk on the ward
  perform demo.patient(pg_temp.pid('fathiya'), array['Fathiya', 'Mohamed'], 'Morsi', 'female', demo.born(82, 150), '+201283346601');
  v := demo.arrive('confused since yesterday', 200);
  perform demo.consult(v, 185, jsonb_build_array(
    demo.gp('vitals', v, 182, demo.vitals(104, 62, 102, 38.3, 95, 22, 58)),
    demo.gp('problem', v, 180, demo.problem('N39.0', 'Urinary tract infection', '{"category":"encounter-diagnosis"}')),
    demo.gp('note', v, 178, demo.note('progress', 'New confusion, fever, dipstick positive. Lives alone. Admit for antibiotics and fluids.'))), 170);
  s := demo.admit(v, 2, 160, 'urine infection with confusion'); o := gen_random_uuid();
  perform demo.w(demo.base('nurse'), jsonb_build_array(
    demo.e('alert', demo.base('ward'), s, demo.ago(150), jsonb_build_object('concept', demo.concept('local.alert', 'fall_risk', 'Fall risk'), 'status', 'active',
      'period', jsonb_build_object('start', demo.ago(150)), 'note', 'confused; bed low, call bell in reach')),
    demo.e('vitals', demo.base('ward'), s, demo.ago(148), demo.vitals(110, 66, 96, 37.9, 96, 20))));
  perform demo.w(demo.base('doctor'), jsonb_build_array(
    demo.e('medication', demo.base('ward'), s, demo.ago(145), demo.med('Ceftriaxone', 'J01DD04', 1000, 'mg', 'OD', '{"duration_days":5}') || '{"dosage":{"dose":{"value":"1","unit":"g","ucum":"g"},"timing":{"code":"OD"},"route":"intravenous"}}'),
    demo.lab_order('cbc', demo.base('ward'), s, demo.ago(145), o)));
  perform demo.lab(o, demo.ago(140), demo.cbc(true, 11.9, 13.4, 288));

  perform demo.patient(pg_temp.pid('tarek'), array['Tarek', 'Adel'], 'Soliman', 'male', demo.born(36, 210), '+201555407718');
  v := demo.arrive('low mood', 90, demo.base('psychiatry'));
  perform demo.consult(v, 75, jsonb_build_array(demo.e('note', demo.base('psychiatry'), v, demo.ago(70), demo.note('history_physical',
    'Low mood for two months since losing his job; sleeping poorly. No thoughts of self-harm. Talking therapy offered; back in two weeks.'))),
    55, false, demo.base('psychiatry'), demo.base('psychiatrist'));
end $$;

-- ── the full chart: Nadia Kamel. Two past visits (six and three months ago), a third two days ago that admitted her, three days on
-- the ward; her clinical times are each entry's occurred_at, so the chart dates them and counts the stay's days from them ──
do $$
declare
  desk uuid := demo.base('desk'); gp uuid := demo.base('gp'); ward uuid := demo.base('ward'); lab uuid := demo.base('lab');
  doctor uuid := demo.base('doctor'); nurse uuid := demo.base('nurse'); reception uuid := demo.base('reception'); tech uuid := demo.base('tech');
  today timestamptz := demo.midnight();
  ta timestamptz := today - interval '182 days' + interval '10 hours'; tb timestamptz := today - interval '91 days' + interval '10 hours 30 minutes';
  tc timestamptz := today - interval '2 days' + interval '9 hours 30 minutes'; d1 timestamptz := today - interval '2 days'; d2 timestamptz := today - interval '1 day';
  years text := to_char(demo.now() at time zone 'Africa/Cairo', 'YYYY');
  va uuid := gen_random_uuid(); ca uuid := gen_random_uuid(); vb uuid := gen_random_uuid(); cb uuid := gen_random_uuid(); vc uuid := gen_random_uuid(); cc uuid := gen_random_uuid();
  st uuid := gen_random_uuid(); pn uuid := gen_random_uuid(); met uuid := gen_random_uuid(); gli uuid := gen_random_uuid(); sul uuid := gen_random_uuid();
  o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid(); o5 uuid := gen_random_uuid(); o6 uuid := gen_random_uuid();
  o7 uuid := gen_random_uuid(); cons uuid := gen_random_uuid(); wrong uuid := gen_random_uuid(); rb uuid; r1 uuid; r2 uuid; fixed uuid := gen_random_uuid();
  reply uuid := gen_random_uuid(); first uuid;
begin
  perform demo.patient(pg_temp.pid('nadia'), array['Nadia', 'Fouad'], 'Kamel', 'female', demo.born(55, 147), '+201001234567');
  perform demo.w(reception, jsonb_build_array(demo.e('checked_in', desk, va, ta, jsonb_build_object('department_id', gp, 'reason', 'diabetes follow-up'), va)));

  -- visit A, six months ago: the lists begin; HbA1c and a blood count, answered while she waits
  perform demo.w(doctor, jsonb_build_array(
    demo.move('called', gp, va, ta + interval '5 minutes', va, '{}', ca),
    demo.e('vitals', gp, va, ta + interval '10 minutes', demo.vitals(138, 86, 84, 36.8, 98, null, 81, 162)),
    demo.e('problem', gp, va, ta + interval '15 minutes', demo.problem('E11.9', 'Type 2 diabetes mellitus',
      jsonb_build_object('onset', jsonb_build_object('value', (years::int - 7)::text, 'precision', 'year')))),
    demo.e('problem', gp, va, ta + interval '15 minutes', demo.problem('J18.9', 'Community-acquired pneumonia',
      jsonb_build_object('onset', jsonb_build_object('value', to_char(ta at time zone 'Africa/Cairo', 'YYYY-MM-DD'), 'precision', 'day'))), pn),
    demo.e('medication', gp, va, ta + interval '20 minutes', demo.med('Metformin', 'A10BA02', 500, 'mg', 'BD', '{"duration_days":90}'), met),
    demo.e('medication', gp, va, ta + interval '20 minutes', demo.med('Gliclazide', 'A10BB09', 80, 'mg', 'OD', '{"duration_days":90,"instructions":"with breakfast"}'), gli),
    demo.e('allergy', gp, va, ta + interval '20 minutes', '{"concept":{"text":"Penicillins","codings":[{"system":"local.allergen","code":"penicillins","display":"Penicillins"}]},"type":"allergy",
      "category":["medication"],"criticality":"high","clinical_status":"active","verification":"confirmed","reactions":[{"manifestation":{"text":"Rash"},"severity":"severe"},{"manifestation":{"text":"Wheeze"}}]}'),
    demo.e('allergy', gp, va, ta + interval '20 minutes', '{"concept":{"text":"Sulfonamide antibiotics","codings":[{"system":"local.allergen","code":"sulfonamide_antibiotics","display":"Sulfonamide antibiotics"}]},
      "type":"allergy","category":["medication"],"clinical_status":"active","verification":"unconfirmed","reactions":[{"manifestation":{"text":"Itching"},"severity":"mild"}]}', sul),
    demo.lab_order('hba1c', gp, va, ta + interval '25 minutes', o1), demo.lab_order('cbc', gp, va, ta + interval '25 minutes', o2),
    demo.e('note', gp, va, ta + interval '30 minutes', demo.note('history_physical', 'hx: diabetes for seven years on diet alone; cough and fever for five days
ex: crackles at the right base; BMI 30.9
plan: amoxicillin was refused (penicillin allergy); start metformin and gliclazide; HbA1c and a blood count today'))));
  perform demo.lab(o1, ta + interval '35 minutes', demo.a1c(7.4));
  perform demo.lab(o2, ta + interval '35 minutes', demo.cbc(true, 12.6, 11.8, 260));
  perform demo.w(doctor, jsonb_build_array(demo.move('done', gp, va, ta + interval '2 hours', ca, '{"wait":false}')));

  -- visit B, three months ago: pneumonia resolved, gliclazide stopped, metformin up, the sulfonamide allergy ruled out, aspirin she
  -- takes on her own; a note in the wrong record (crossed out) and a platelet count typed wrong (corrected)
  perform demo.w(reception, jsonb_build_array(demo.e('checked_in', desk, vb, tb, jsonb_build_object('department_id', gp, 'reason', 'follow-up; low sugars'), vb)));
  perform demo.w(doctor, jsonb_build_array(
    demo.move('called', gp, vb, tb + interval '5 minutes', vb, '{}', cb),
    demo.e('vitals', gp, vb, tb + interval '10 minutes', demo.vitals(142, 88, 80, 36.7, 98, 16, 80)),
    demo.e('problem', gp, vb, tb + interval '15 minutes', demo.problem('J18.9', 'Community-acquired pneumonia', jsonb_build_object('clinical_status', 'resolved',
      'abatement', jsonb_build_object('value', to_char((ta + interval '14 days') at time zone 'Africa/Cairo', 'YYYY-MM'), 'precision', 'month'))), null, pn, 'changes'),
    demo.e('medication', gp, vb, tb + interval '20 minutes', demo.med('Metformin', 'A10BA02', 1000, 'mg', 'BD', '{"duration_days":90}'), null, met, 'changes'),
    demo.e('medication', gp, vb, tb + interval '20 minutes', demo.med('Gliclazide', 'A10BB09', 80, 'mg', 'OD', '{"status":"stopped","status_reason":"hypoglycaemia twice this month"}'), null, gli, 'changes'),
    demo.e('medication', gp, vb, tb + interval '20 minutes', demo.med('Aspirin', 'B01AC06', 75, 'mg', 'OD', '{"basis":"reported","instructions":"bought over the counter"}')),
    demo.e('allergy', gp, vb, tb + interval '20 minutes', '{"concept":{"text":"Sulfonamide antibiotics","codings":[{"system":"local.allergen","code":"sulfonamide_antibiotics","display":"Sulfonamide antibiotics"}]},
      "type":"allergy","category":["medication"],"clinical_status":"inactive","verification":"refuted","note":"took co-trimoxazole two years ago without a reaction"}', null, sul, 'changes'),
    demo.e('list_review', gp, vb, tb + interval '25 minutes', '{"list":"medications","outcome":"reviewed"}'),
    demo.e('list_review', gp, vb, tb + interval '25 minutes', '{"list":"allergies","outcome":"reviewed"}'),
    demo.lab_order('hba1c', gp, vb, tb + interval '25 minutes', o3), demo.lab_order('cbc', gp, vb, tb + interval '25 minutes', o4),
    demo.e('note', gp, vb, tb + interval '30 minutes', demo.note('progress', 'S: two hypos this month, both before lunch
O: chest clear
A: pneumonia resolved; diabetes not at target
P: stop gliclazide; metformin 1 g twice a day; repeat HbA1c in three months')),
    demo.e('note', gp, vb, tb + interval '31 minutes', demo.note('progress', 'Chest pain on effort for two weeks; refer to cardiology.'), wrong)));
  perform demo.lab(o3, tb + interval '35 minutes', demo.a1c(7.9));
  rb := demo.lab(o4, tb + interval '35 minutes', demo.cbc(true, 11.4, 6.8, 45));
  perform demo.w(doctor, jsonb_build_array(demo.move('done', gp, vb, tb + interval '2 hours', cb, '{"wait":false}')));
  perform demo.w(doctor, jsonb_build_array(demo.e('crossed_out', gp, vb, null, '{"reason":"wrong_patient","text":"written in the wrong record"}', null, null, null, wrong)));
  -- the lab corrects the platelets it typed wrong; the doctor has seen the correction
  perform demo.w(tech, jsonb_build_array(demo.e('result', lab, null, tb + interval '75 minutes',
    demo.cbc(true, 11.4, 6.8, 245, 'corrected') || '{"conclusion":"Platelets corrected: 45 was a typing error."}', fixed, null, null, rb)));
  perform demo.w(doctor, jsonb_build_array(demo.e('reviewed', gp, null, null, '{}', null, fixed, 'about')));

  -- visit C, two days ago: pale and breathless; anaemia to explain; admitted to the ward (Bed 3 when it is free)
  perform demo.w(reception, jsonb_build_array(demo.e('checked_in', desk, vc, tc, jsonb_build_object('department_id', gp, 'reason', 'tired and breathless for a week'), vc)));
  perform demo.w(doctor, jsonb_build_array(
    demo.move('called', gp, vc, tc + interval '5 minutes', vc, '{}', cc),
    demo.e('vitals', gp, vc, tc + interval '10 minutes', demo.vitals(150, 95, 104, 37.8, 95, 20, 79)),
    demo.e('problem', gp, vc, tc + interval '15 minutes', demo.problem('D64.9', 'Anaemia, unspecified', '{"category":"encounter-diagnosis","verification":"provisional"}')),
    demo.e('note', gp, vc, tc + interval '20 minutes', demo.note('progress', 'Pale, heart rate 104, breathless on the stairs. Admit for work-up of the anaemia.')),
    demo.move('done', gp, vc, tc + interval '30 minutes', cc, '{"wait":false}')));
  first := demo.w_bed(doctor, jsonb_build_array(demo.e('admitted', ward, st, d1 + interval '14 hours', jsonb_build_object('department_id', ward, 'admit_source', 'outp',
    'reason', 'symptomatic anaemia; diabetes not at target'), st, vc, 'about')), 3);

  -- stay day 1: the admission clerking with her history, an alert, the labs; the nurse's first vitals; the doctor sees the results
  perform demo.w(doctor, jsonb_build_array(
    demo.e('note', ward, st, d1 + interval '16 hours', demo.note('history_physical', 'hx: a week of tiredness and breathlessness; black stools twice
ex: pale; heart rate 100; abdomen soft
plan: blood count and HbA1c; transfuse if Hb under 7; ask the GP about her diabetes')),
    demo.e('alert', ward, st, d1 + interval '16 hours', jsonb_build_object('concept', demo.concept('local.alert', 'dnr', 'Do not resuscitate'),
      'status', 'active', 'period', jsonb_build_object('start', d1 + interval '16 hours'), 'note', 'decided with her and her husband')),
    demo.e('procedure', ward, st, d1 + interval '16 hours', jsonb_build_object('concept', demo.concept('local.procedure', 'appendicectomy', 'Appendicectomy'), 'status', 'completed',
      'performed', jsonb_build_object('value', (years::int - 16)::text, 'precision', 'year'), 'outcome', 'uncomplicated')),
    demo.e('observation', ward, st, d1 + interval '16 hours', jsonb_build_object('code', demo.concept('loinc', '72166-2', 'Tobacco smoking status'),
      'value', '{"concept":{"text":"Former smoker"}}'::jsonb, 'note', 'stopped eleven years ago')),
    demo.e('observation', ward, st, d1 + interval '16 hours', jsonb_build_object('code', demo.concept('loinc', '11331-6', 'History of alcohol use'), 'value', '{"text":"none"}'::jsonb)),
    demo.e('observation', ward, st, d1 + interval '16 hours', jsonb_build_object('code', demo.concept('loinc', '11341-5', 'History of occupation'), 'value', '{"text":"primary school teacher"}'::jsonb)),
    demo.e('observation', ward, st, d1 + interval '16 hours', jsonb_build_object('code', demo.concept('loinc', '71802-3', 'Housing status'),
      'value', '{"text":"lives with her husband and daughter; second floor, no lift"}'::jsonb)),
    demo.e('observation', ward, st, d1 + interval '16 hours', jsonb_build_object('code', demo.concept('loinc', '10157-6', 'History of family member diseases'),
      'value', '{"text":"father: type 2 diabetes, heart attack at 62; mother: hypertension"}'::jsonb)),
    demo.lab_order('cbc', ward, st, d1 + interval '16 hours', o5), demo.lab_order('hba1c', ward, st, d1 + interval '16 hours', o6)));
  perform demo.w(nurse, jsonb_build_array(demo.e('vitals', ward, st, d1 + interval '18 hours', demo.vitals(146, 92, 98, 37.6, 96, 18)),
    demo.e('score', ward, st, d1 + interval '18 hours', demo.score('gcs', '{"eye":"4","verbal":"5","motor":"6"}'))));
  r1 := demo.lab(o5, d1 + interval '17 hours', demo.cbc(true, 8.2, 7.9, 231));
  r2 := demo.lab(o6, d1 + interval '17 hours', demo.a1c(8.1));
  perform demo.w(doctor, jsonb_build_array(demo.e('reviewed', ward, null, d1 + interval '19 hours', '{}', null, r1, 'about'), demo.e('reviewed', ward, null, d1 + interval '19 hours', '{}', null, r2, 'about')));

  -- day 2: vitals morning and evening, a bed move, paracetamol given, a repeat count, a question to the GP answered, an outside ECG on file
  perform demo.w(nurse, jsonb_build_array(demo.e('vitals', ward, st, d2 + interval '8 hours', demo.vitals(138, 88, 92, 37.2, 97, 16, null, null, 186))));
  perform demo.w_bed(nurse, jsonb_build_array(demo.move('moved', ward, st, d2 + interval '11 hours', st, '{"reason":"closer to the nursing station"}')), 5, first);
  perform demo.w(nurse, jsonb_build_array(demo.e('given', ward, st, d2 + interval '14 hours', '{"drug":{"text":"Paracetamol","codings":[{"system":"atc","code":"N02BE01","display":"Paracetamol"}]},"dose":{"value":"1","unit":"g","ucum":"g"},"route":"oral","status":"completed","note":"for a headache"}')));
  perform demo.w(doctor, jsonb_build_array(
    demo.e('note', ward, st, d2 + interval '10 hours', demo.note('progress', 'Two units of blood overnight; feels better. Stools still dark.
plan: repeat the blood count tomorrow; ask the GP about her diabetes')),
    demo.lab_order('cbc', ward, st, d2 + interval '10 hours', o7),
    demo.e('order', ward, st, d2 + interval '10 hours', jsonb_build_object('service', '{"name":"Consult","answer":"note"}'::jsonb, 'department_id', gp, 'priority', 'routine', 'status', 'active',
      'question', 'HbA1c 8.1 on metformin alone; gliclazide stopped for hypos. What next before she goes home?'), cons),
    demo.e('note', ward, st, d2 + interval '12 hours', ('{"kind":"letter","heading":"Outside ECG","text":"ECG from her own cardiologist, three weeks ago.","attachments":[{"name":"outside-ecg.pdf","mime":"application/pdf","size":182344,"sha256":"'
      || encode(sha256('opencare demo outside-ecg.pdf'::bytea), 'hex') || '"}]}')::jsonb)));
  perform demo.w(doctor, jsonb_build_array(demo.e('note', gp, null, d2 + interval '15 hours', demo.note('consult', 'Agree gliclazide stays stopped. Add sitagliptin 100 mg once a day at discharge; HbA1c again in three months at the clinic.'), reply, cons, 'answers')));
  perform demo.w(doctor, jsonb_build_array(demo.e('reviewed', ward, null, d2 + interval '16 hours', '{}', null, reply, 'about')));
  perform demo.w(nurse, jsonb_build_array(demo.e('vitals', ward, st, d2 + interval '20 hours', demo.vitals(134, 86, 90, 37.0, 97, 16))));

  -- day 3, today: the morning vitals, and the repeat count is critical (left for the doctor to review)
  perform demo.w(nurse, jsonb_build_array(demo.e('vitals', ward, st, demo.ago(120), demo.vitals(132, 84, 88, 36.9, 98, 16))));
  perform demo.lab(o7, demo.ago(50), demo.cbc(true, 6.6, 8.4, 212));
end $$;

-- a walk-in at the lab (spec §5.3): Hany brings his cardiologist's paper request; the lab started it twenty minutes ago, from the bench
do $$
declare lab uuid := demo.base('lab'); tech uuid := demo.base('tech');
  asked jsonb := '{"department_id":null,"priority":"routine","status":"active","asked_by":"Dr. Samir Fouad · Nasr City clinic"}';
begin
  perform set_config('demo.patient', pg_temp.pid('hany')::text, false);
  perform demo.w(tech, jsonb_build_array(
    demo.e('order', lab, null, demo.ago(20), asked || jsonb_build_object('service', demo.service('lipids'), 'department_id', lab)),
    demo.e('order', lab, null, demo.ago(20), asked || jsonb_build_object('service', demo.service('hba1c'), 'department_id', lab))));
end $$;
