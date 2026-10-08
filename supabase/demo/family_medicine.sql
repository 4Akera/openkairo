-- The family pack's day (spec/openCare.md §5.1 rule 9, §5.7; pictures #family-folder, #family-day): one household, file 1182 at
-- Al-Gomhoria St, Mit Ghamr — Ayman Abdelrahman (39, the head), his wife Basma Hegazy (34, in consult now with Dr. Hazem Ouda: BMI 31,
-- her fasting sugar four years ago and never screened for cervical cancer, so two checks due), his mother Zeinab Hamouda (68, diabetes: her
-- HbA1c five months old and high; waiting with knee pain), their son Yassin (6, waiting with ear pain) and daughter Malak (14 months).
-- The file is the pack's own table, written through its door; times relative to the load; a reload erases these patients first.
select demo.layer('family_medicine');

-- a problem's onset, years before the load
create or replace function pg_temp.since(p_years int) returns jsonb language sql stable as $$
  select jsonb_build_object('onset', jsonb_build_object('value', (extract(year from demo.now()) - p_years)::int::text, 'precision', 'year'))
$$;

do $$
declare fm uuid := demo.id('family_medicine', 'department'); hz uuid := demo.id('family_medicine', 'doctor'); day int := 60 * 24; v uuid; o uuid;
  ayman uuid := demo.id('family_medicine', 'patient:ayman'); basma uuid := demo.id('family_medicine', 'patient:basma'); zeinab uuid := demo.id('family_medicine', 'patient:zeinab');
  yassin uuid := demo.id('family_medicine', 'patient:yassin'); malak uuid := demo.id('family_medicine', 'patient:malak'); f uuid := demo.id('family_medicine', 'file:1182');
begin
  perform demo.patient(ayman, array['Ayman'], 'Abdelrahman', 'male', demo.born(39, 80), '+201022147781');
  v := demo.arrive('headache', 200 * day, fm);
  perform demo.w(hz, jsonb_build_array(demo.e('vitals', fm, v, demo.ago(200 * day - 5), demo.vitals(148, 94, 80, 36.9))));
  perform demo.consult(v, 200 * day - 10, '[]', 200 * day - 20, false, fm, hz);

  perform demo.patient(basma, array['Basma'], 'Hegazy', 'female', demo.born(34, 120), '+201022147781');
  perform demo.w(hz, jsonb_build_array(demo.e('result', fm, null, demo.ago(1400 * day), jsonb_build_object('status', 'final', 'service', jsonb_build_object('name', 'Outside result'),
    'analytes', jsonb_build_array(demo.analyte('fbs', 'Fasting glucose', '1558-6', 96, 'mg/dL', 'mg/dL', 70, 100))))));
  perform demo.w(hz, jsonb_build_array(demo.e('result', fm, null, demo.ago(2500 * day), jsonb_build_object('status', 'final', 'service', jsonb_build_object('name', 'Outside result'),
    'analytes', jsonb_build_array(demo.analyte('hcv', 'HCV antibody (index)', '16128-1', 0.1, 'index', '{index}', null, 1))))));
  v := demo.arrive('family planning visit', 15, fm);
  perform demo.w(hz, jsonb_build_array(demo.e('vitals', fm, v, demo.ago(12), demo.vitals(124, 80, 76, 36.7, null, null, 80, 160) || jsonb_build_object('bmi', demo.q(31.3, 'kg/m2', 'kg/m2')))));
  perform demo.consult(v, 6, '[]', null, false, fm, hz);

  perform demo.patient(zeinab, array['Zeinab'], 'Hamouda', 'female', demo.born(68, 10), '+201022147781');
  v := demo.arrive('diabetes follow-up', 157 * day + 60, fm);
  perform demo.consult(v, 157 * day + 50, jsonb_build_array(demo.e('problem', fm, v, demo.ago(157 * day + 45), demo.problem('E11.9', 'Type 2 diabetes mellitus', pg_temp.since(15)))),
    157 * day + 40, false, fm, hz);
  o := gen_random_uuid();
  perform demo.w(hz, jsonb_build_array(demo.lab_order('hba1c', fm, null, demo.ago(157 * day), o)));
  perform demo.lab(o, demo.ago(157 * day - 30), demo.a1c(8.4));
  v := demo.arrive('knee pain', 9, fm);

  perform demo.patient(yassin, array['Yassin'], 'Ayman', 'male', demo.born(6, 40), '+201022147781');
  v := demo.arrive('ear pain', 2, fm);
  perform demo.patient(malak, array['Malak'], 'Ayman', 'female', demo.born(1, 60), '+201022147781');

  -- the household's file, through the pack's door (the owner, as the desk would)
  perform demo.as(demo.base('owner'));
  perform public.pack_op(jsonb_build_object('op', 'family_medicine.start', 'department_id', fm, 'args', jsonb_build_object('id', f, 'number', 1182, 'patient_id', ayman,
    'address', 'Al-Gomhoria St, Mit Ghamr', 'phone', '010 2214 7781 (Ayman)')));
  perform public.pack_op(jsonb_build_object('op', 'family_medicine.join', 'department_id', fm, 'args', jsonb_build_object('household_id', f, 'patient_id', basma, 'relation', 'wife')));
  perform public.pack_op(jsonb_build_object('op', 'family_medicine.join', 'department_id', fm, 'args', jsonb_build_object('household_id', f, 'patient_id', zeinab, 'relation', 'mother')));
  perform public.pack_op(jsonb_build_object('op', 'family_medicine.join', 'department_id', fm, 'args', jsonb_build_object('household_id', f, 'patient_id', yassin, 'relation', 'son')));
  perform public.pack_op(jsonb_build_object('op', 'family_medicine.join', 'department_id', fm, 'args', jsonb_build_object('household_id', f, 'patient_id', malak, 'relation', 'daughter')));
end $$;
