-- The laboratory pack's day (spec/openCare.md §5.1 rule 9, §5.3): its own two patients, walk-ins started at the lab, each with an
-- earlier result (so the change check has something to compare) and samples collected this morning, waiting on Results: Rania (her CBC
-- ten days ago; today's CBC and TSH, from an outside doctor) and Osama (his kidney function four days ago, creatinine 1.0; today's kidney
-- function and electrolytes) and Nabil (a lipid profile collected two and a half hours ago: past chemistry's two-hour target where the
-- laboratory sets turnaround targets); and two walk-ins waiting to be collected (Dina, Omar stat: what collection chairs call). Times
-- relative to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('lis');

-- a test of the laboratory's, by its code (its id from the setup)
create or replace function pg_temp.svc(p_code text, p_name text) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', core.setup_id(demo.base('lab'), 'service', p_code), 'code', p_code, 'name', p_name)
$$;
-- a walk-in started at the lab, its sample collected, and (an earlier day) its result — as Collect and Results write them
create or replace function pg_temp.walk(p_svc jsonb, p_min int, p_asked text, p_id uuid, p_priority text default 'routine') returns jsonb language sql as $$
  select jsonb_build_array(demo.e('order', demo.base('lab'), null, demo.ago(p_min), jsonb_strip_nulls(jsonb_build_object('service', p_svc,
    'department_id', demo.base('lab'), 'priority', p_priority, 'status', 'active', 'asked_by', p_asked)), p_id))
$$;
create or replace function pg_temp.collected(p_order uuid, p_min int, p_sample text) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('step', demo.base('lab'), null, demo.ago(p_min), jsonb_build_object('status', 'in-progress', 'step', 'collected', 'specimen', p_sample), null, p_order, 'answers'))
$$;
-- today's sample number for these orders, from the laboratory's own counter (lis.sample), as Collect takes it: never one written twice
create or replace function pg_temp.sample(p_orders uuid[]) returns text language sql as $$
  select demo.as(demo.base('tech'));
  select public.pack_op(jsonb_build_object('op', 'lis.sample', 'department_id', demo.base('lab'), 'args', jsonb_build_object('items', to_jsonb(p_orders)))) ->> 'sample'
$$;
create or replace function pg_temp.result(p_order uuid, p_min int, p_svc jsonb, p_analytes jsonb) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('result', demo.base('lab'), null, demo.ago(p_min), jsonb_build_object('status', 'final', 'service', p_svc - 'code', 'analytes', p_analytes), null, p_order, 'answers'))
$$;

do $$
declare tech uuid := demo.base('tech'); day int := 60 * 24;
  cbc jsonb := pg_temp.svc('cbc', 'Complete blood count'); tsh jsonb := pg_temp.svc('tsh', 'TSH'); kft jsonb := pg_temp.svc('kft', 'Kidney function'); lytes jsonb := pg_temp.svc('lytes', 'Electrolytes');
  lipids jsonb := pg_temp.svc('lipids', 'Lipid profile'); hba1c jsonb := pg_temp.svc('hba1c', 'HbA1c'); fbs jsonb := pg_temp.svc('fbs', 'Fasting glucose');
  o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid(); o5 uuid := gen_random_uuid(); o6 uuid := gen_random_uuid();
  o7 uuid := gen_random_uuid(); n text;
begin
  -- Nabil: a lipid profile, fasting, collected two and a half hours ago and not yet typed (the day's first sample)
  perform demo.patient(demo.id('lis', 'patient:nabil'), array['Nabil'], 'Hosny', 'male', demo.born(52, 210), '+201224451903');
  perform demo.w(tech, pg_temp.walk(lipids, 160, null, o7));
  n := pg_temp.sample(array[o7]); perform demo.w(tech, pg_temp.collected(o7, 150, n));

  -- Rania: a CBC ten days ago (Hb 12.9); today a CBC and a TSH from an outside doctor, collected 35 minutes ago
  perform demo.patient(demo.id('lis', 'patient:rania'), array['Rania'], 'Samir', 'female', demo.born(26, 140), '+201007788120');
  perform demo.w(tech, pg_temp.walk(cbc, 10 * day, null, o1) || pg_temp.collected(o1, 10 * day - 5, 'S-0927-0012'));
  perform demo.w(tech, pg_temp.result(o1, 10 * day - 60, cbc, jsonb_build_array(demo.analyte('hb', 'Haemoglobin', '718-7', 12.9, 'g/dL', 'g/dL', 12, 15.5, 7, 20),
    demo.analyte('wbc', 'WBC', '6690-2', 6.8, '10^9/L', '10*3/uL', 4, 11, 2, 30), demo.analyte('plt', 'Platelets', '777-3', 260, '10^9/L', '10*3/uL', 150, 400, 20, 1000))));
  perform demo.w(tech, pg_temp.walk(cbc, 40, 'Dr. Hany Saleh · outside', o2) || pg_temp.walk(tsh, 40, 'Dr. Hany Saleh · outside', o3));
  n := pg_temp.sample(array[o2, o3]); perform demo.w(tech, pg_temp.collected(o2, 35, n) || pg_temp.collected(o3, 35, n));

  -- Osama: kidney function four days ago (creatinine 1.0); today kidney function and electrolytes, collected 20 minutes ago
  perform demo.patient(demo.id('lis', 'patient:osama'), array['Osama'], 'Fathy', 'male', demo.born(61, 75), '+201118842267');
  perform demo.w(tech, pg_temp.walk(kft, 4 * day, null, o4) || pg_temp.collected(o4, 4 * day - 5, 'S-1003-0021'));
  perform demo.w(tech, pg_temp.result(o4, 4 * day - 90, kft, jsonb_build_array(demo.analyte('urea', 'Urea', '22664-7', 34, 'mg/dL', 'mg/dL', 15, 45),
    demo.analyte('creat', 'Creatinine', '2160-0', 1.0, 'mg/dL', 'mg/dL', 0.7, 1.3))));
  perform demo.w(tech, pg_temp.walk(kft, 25, null, o5) || pg_temp.walk(lytes, 25, null, o6));
  n := pg_temp.sample(array[o5, o6]); perform demo.w(tech, pg_temp.collected(o5, 20, n) || pg_temp.collected(o6, 20, n));

  -- two walk-ins waiting to be collected: Dina (CBC, lipids, HbA1c, fasting glucose, 14 minutes) and Omar (kidney function and
  -- electrolytes, stat, 7 minutes)
  perform demo.patient(demo.id('lis', 'patient:dina'), array['Dina'], 'Raafat', 'female', demo.born(34, 95), '+201006631784');
  perform demo.w(tech, pg_temp.walk(cbc, 14, null, null) || pg_temp.walk(lipids, 14, null, null) || pg_temp.walk(hba1c, 14, null, null) || pg_temp.walk(fbs, 14, null, null));
  perform demo.patient(demo.id('lis', 'patient:omar'), array['Omar'], 'Saeed', 'male', demo.born(61, 280), '+201117735290');
  perform demo.w(tech, pg_temp.walk(kft, 7, 'Dr. Ashraf Kamel · outside', null, 'stat') || pg_temp.walk(lytes, 7, 'Dr. Ashraf Kamel · outside', null, 'stat'));
end $$;

-- The Blood bank's day (spec/openCare.md §5.1 rule 9, §5.7, Q35, Q36), the laboratory pack's: Nabila Farag (44, iron deficiency, Hb 6.9 at
-- General Practice) has one unit of red cells asked this morning, its sample received; Soad Mahrous (66, melaena, Hb 6.8 this morning) on the
-- Medical Ward: two units asked urgently, grouped A Rh positive and crossmatched, issued as 26-118437 and 26-118452; the first given with no
-- reaction; the second started and stopped for hives, mild, not restarted (each unit the bedside record, /transfuse's type extending the base's given: the unit its lot). Times relative to
-- the load; a reload erases these patients first.

create or replace function pg_temp.bb_svc(p_code text, p_name text) returns jsonb language sql stable as $$
  select jsonb_build_object('id', core.setup_id(demo.id('lis', 'blood_bank'), 'service', p_code), 'code', p_code, 'name', p_name)
$$;
create or replace function pg_temp.bb_blood(p_from uuid, p_min int, p_id uuid, p_priority text, p_words jsonb, p_why text) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('lis.blood', p_from, null, demo.ago(p_min), jsonb_build_object('service', pg_temp.bb_svc('rbc', 'Red cells'), 'department_id', demo.id('lis', 'blood_bank'),
    'priority', p_priority, 'status', 'active', 'question', p_why, 'lis', p_words), p_id))
$$;
create or replace function pg_temp.bb_step(p_order uuid, p_after uuid, p_min int, p_key text, p_id uuid) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('step', demo.id('lis', 'blood_bank'), null, demo.ago(p_min), jsonb_build_object('status', 'in-progress', 'step', p_key), p_id,
    coalesce(p_after, p_order), case when p_after is null then 'answers' else 'changes' end))
$$;

do $$
declare bb uuid := demo.id('lis', 'blood_bank'); tech uuid := demo.id('lis', 'blood_tech'); day int := 60 * 24; o uuid; s1 uuid; s2 uuid; s3 uuid; stay uuid; lab uuid; v uuid;
begin
  -- Nabila: iron-deficiency anaemia, Hb 6.9 at General Practice: one unit of red cells asked this morning, the sample received
  perform demo.patient(demo.id('lis', 'patient:nabila'), array['Nabila'], 'Farag', 'female', demo.born(44, 70), '+201224417650');
  lab := gen_random_uuid();
  perform demo.w(demo.base('doctor'), jsonb_build_array(demo.lab_order('cbc', demo.base('gp'), null, demo.ago(180), lab)));
  perform demo.lab(lab, demo.ago(170), demo.cbc(true, 6.9, 7.1, 388));
  o := gen_random_uuid(); s1 := gen_random_uuid();
  perform demo.w(demo.base('doctor'), pg_temp.bb_blood(demo.base('gp'), 50, o, 'routine', '{"product":"rbc","needs":[],"units":1,"why":"Hb under 7","consent":"signed today","sample":"taken here"}', 'iron deficiency, Hb 6.9, breathless'));
  perform demo.w(tech, pg_temp.bb_step(o, null, 20, 'received', s1));

  -- Soad: melaena, admitted last night; two units asked at 07:15, crossmatched and issued; the second stopped for hives
  perform demo.patient(demo.id('lis', 'patient:soad'), array['Soad'], 'Mahrous', 'female', demo.born(66, 300), '+201006671284');
  v := demo.arrive('Black stools since yesterday, dizzy', 298);
  perform demo.consult(v, 296, '[]'::jsonb, 290);
  stay := demo.admit(v, 6, 285, 'Upper GI bleeding: melaena, Hb 6.8');
  perform demo.w(demo.base('doctor'), jsonb_build_array(demo.e('problem', demo.base('ward'), stay, demo.ago(284), demo.problem('K92.2', 'Melaena · upper GI bleeding'))));
  lab := gen_random_uuid();
  perform demo.w(demo.base('doctor'), jsonb_build_array(demo.lab_order('cbc', demo.base('ward'), null, demo.ago(282), lab)));
  perform demo.lab(lab, demo.ago(280), demo.cbc(true, 6.8, 9.2, 241));
  o := gen_random_uuid(); s1 := gen_random_uuid(); s2 := gen_random_uuid(); s3 := gen_random_uuid();
  perform demo.w(demo.base('doctor'), pg_temp.bb_blood(demo.base('ward'), 230, o, 'urgent', '{"product":"rbc","needs":[],"units":2,"why":"bleeding","consent":"signed today","sample":"taken here"}', 'melaena, Hb 6.8'));
  perform demo.w(tech, pg_temp.bb_step(o, null, 225, 'received', s1));
  perform demo.w(tech, pg_temp.bb_step(o, s1, 215, 'grouped', s2));
  perform demo.w(tech, pg_temp.bb_step(o, s2, 195, 'crossmatched', s3));
  perform demo.w(tech, jsonb_build_array(demo.e('result', bb, null, demo.ago(190), jsonb_build_object('status', 'final', 'service', pg_temp.bb_svc('rbc', 'Red cells') - 'code',
    'conclusion', 'A Rh positive · antibody screen negative · 2 units crossmatched compatible, issued: 26-118437, 26-118452',
    'analytes', jsonb_build_array(jsonb_build_object('key', 'group', 'name', 'ABO and Rh', 'code', jsonb_build_object('system', 'loinc', 'code', '882-1', 'display', 'ABO and Rh group'), 'text', 'A Rh positive'),
      jsonb_build_object('key', 'screen', 'name', 'Antibody screen', 'code', jsonb_build_object('system', 'loinc', 'code', '890-4', 'display', 'Antibody screen'), 'text', 'negative'),
      jsonb_build_object('key', 'crossmatch', 'name', 'Crossmatch', 'text', 'compatible'), jsonb_build_object('key', 'units', 'name', 'Units issued', 'text', '26-118437 · 26-118452'))),
    null, (select x.id from core.entries x where x.item = o order by x.item_version desc limit 1), 'answers')));
  -- at the bedside: unit 1 given with no reaction, unit 2 stopped at 11:51 for hives (the base's given, the unit its lot)
  perform demo.w(demo.base('nurse'), jsonb_build_array(demo.e('lis.transfusion', demo.base('ward'), stay, demo.ago(165), jsonb_build_object('status', 'completed', 'drug', jsonb_build_object('text', 'Red cells · A Rh+'),
    'lot', '26-118437', 'route', 'iv', 'dose', demo.q(290, 'mL', 'mL'), 'note', 'checked by two at the bedside · no reaction',
    'lis', jsonb_build_object('unit', '26-118437', 'product', 'rbc', 'group', 'A Rh+', 'second', 'Marwa Gaber', 'checks', '["Name and birth date: wristband = label","Record number = the label","Unit number on the bag = the label","The unit''s group fits the patient''s","In date · the bag whole, no clots","Started within 30 minutes of issue"]'::jsonb,
      'signs', '[{"when":"before","temp":36.7,"sys":122,"dia":74,"pulse":96,"rr":16,"spo2":97},{"when":"15 min","temp":36.8,"sys":124,"dia":74,"pulse":92,"rr":16,"spo2":97},{"when":"end","temp":36.8,"sys":126,"dia":76,"pulse":88,"rr":16,"spo2":97}]'::jsonb)))));
  perform demo.w(demo.base('nurse'), jsonb_build_array(demo.e('lis.transfusion', demo.base('ward'), stay, demo.ago(60), jsonb_build_object('status', 'completed', 'drug', jsonb_build_object('text', 'Red cells · A Rh+'),
    'lot', '26-118452', 'route', 'iv', 'dose', demo.q(60, 'mL', 'mL'), 'note', 'about 60 mL · stopped: hives, itch, mild · do not restart · return the unit',
    'lis', jsonb_build_object('unit', '26-118452', 'product', 'rbc', 'group', 'A Rh+', 'second', 'Marwa Gaber', 'checks', '["Name and birth date: wristband = label","Record number = the label","Unit number on the bag = the label","The unit''s group fits the patient''s","In date · the bag whole, no clots","Started within 30 minutes of issue"]'::jsonb,
      'signs', '[{"when":"before","temp":36.8,"sys":128,"dia":76,"pulse":88,"rr":16,"spo2":97},{"when":"15 min","temp":36.9,"sys":130,"dia":78,"pulse":90,"rr":16,"spo2":97},{"when":"reaction","temp":36.9,"sys":132,"dia":78,"pulse":94,"rr":18,"spo2":97}]'::jsonb,
      'reaction', '{"what":["hives, itch"],"severity":"mild","doctor":"do not restart · return the unit"}'::jsonb))),
    demo.e('vitals', demo.base('ward'), stay, demo.ago(41), demo.vitals(132, 78, 94, 36.9, 97, 18))));
end $$;
-- the pack's background work so far, drained in the load (core.drain takes 500 at a time): the cashier's lines after it count on it
select core.drain() as drained;
