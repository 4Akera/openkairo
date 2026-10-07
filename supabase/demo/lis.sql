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
