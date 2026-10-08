-- The chronic care pack's day (spec/openCare.md §5.1 rule 9, §5.7; pictures #chronic-visit, #chronic-list): its own patients in the
-- Diabetes clinic with Dr. Iman Sherif. Ashraf Mokhtar, in consult now: type 2 diabetes for twelve years, hypertension for ten, CKD 3a for
-- two on his problem list; HbA1c 8.2 (and rising), LDL 112, BP 146/90 today; eyes and feet last reviewed 14 months ago, his urine ACR 15
-- months ago: three checks due. Fawzia Darwish, 81: her own target BP < 150/90 (falls), still above it. Wafaa Abdelmoneim: diabetes and
-- asthma, HbA1c 7.3, her inhaler technique never checked. Times relative to the load; ids in the pack's namespace; a reload erases them.
select demo.layer('chronic_care');

-- a result the clinic writes with no order (an outside paper): K and eGFR, or a urine ACR
create or replace function pg_temp.outside(p_dept uuid, p_at timestamptz, p_analytes jsonb) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('result', p_dept, null, p_at, jsonb_build_object('status', 'final', 'service', jsonb_build_object('name', 'Outside result'), 'analytes', p_analytes)))
$$;
-- the yearly review's observations: the feet, the eyes (the pack's check codes)
create or replace function pg_temp.review(p_dept uuid, p_at timestamptz, p_feet text, p_eyes text) returns jsonb language sql as $$
  select jsonb_build_array(
    demo.e('observation', p_dept, null, p_at, jsonb_build_object('code', demo.concept('chronic_care.check', 'feet', 'Feet'), 'value', jsonb_build_object('text', p_feet))),
    demo.e('observation', p_dept, null, p_at, jsonb_build_object('code', demo.concept('chronic_care.check', 'eyes', 'Eyes'), 'value', jsonb_build_object('text', p_eyes))))
$$;
create or replace function pg_temp.labs(p_dept uuid, p_visit uuid, p_min int, p_code text, p_result jsonb) returns void language plpgsql as $$
declare o uuid := gen_random_uuid();
begin
  perform demo.w(demo.id('chronic_care', 'doctor'), jsonb_build_array(demo.lab_order(p_code, p_dept, p_visit, demo.ago(p_min), o)));
  perform demo.lab(o, demo.ago(p_min - 30), p_result);
end $$;

-- a problem's onset, years before the load
create or replace function pg_temp.since(p_years int) returns jsonb language sql stable as $$
  select jsonb_build_object('onset', jsonb_build_object('value', (extract(year from demo.now()) - p_years)::int::text, 'precision', 'year'))
$$;

do $$
declare dm uuid := demo.id('chronic_care', 'clinic'); iman uuid := demo.id('chronic_care', 'doctor'); day int := 60 * 24; v uuid;
begin
  -- Ashraf Mokhtar, 58: in consult now
  perform demo.patient(demo.id('chronic_care', 'patient:ashraf'), array['Ashraf'], 'Mokhtar', 'male', demo.born(58, 70), '+201001184523');
  v := demo.arrive('diabetes follow-up', 300 * day, dm);
  perform demo.consult(v, 300 * day - 10, jsonb_build_array(
    demo.e('problem', dm, v, demo.ago(300 * day - 15), demo.problem('E11.9', 'Type 2 diabetes mellitus', pg_temp.since(12))),
    demo.e('problem', dm, v, demo.ago(300 * day - 15), demo.problem('I10', 'Essential hypertension', pg_temp.since(10))),
    demo.e('problem', dm, v, demo.ago(300 * day - 15), demo.problem('N18.3', 'Chronic kidney disease, stage 3a', pg_temp.since(2))),
    demo.e('medication', dm, v, demo.ago(300 * day - 14), demo.med('Metformin', 'A10BA02', 1000, 'mg', 'BD')),
    demo.e('medication', dm, v, demo.ago(300 * day - 14), demo.med('Gliclazide', 'A10BB09', 60, 'mg', 'OD')),
    demo.e('medication', dm, v, demo.ago(300 * day - 14), demo.med('Lisinopril', 'C09AA03', 10, 'mg', 'OD'))), 300 * day - 20, false, dm, iman);
  perform pg_temp.labs(dm, null, 280 * day, 'hba1c', demo.a1c(7.6));
  perform pg_temp.labs(dm, null, 160 * day, 'hba1c', demo.a1c(7.9));
  perform demo.w(iman, pg_temp.outside(dm, demo.ago(446 * day), jsonb_build_array(demo.analyte('acr', 'Urine albumin/creatinine', '14959-1', 24, 'mg/g', 'mg/g', null, 30))));
  perform demo.w(iman, pg_temp.review(dm, demo.ago(432 * day), 'low risk', 'no retinopathy'));
  perform demo.w(iman, pg_temp.outside(dm, demo.ago(400 * day), jsonb_build_array(demo.analyte('egfr', 'eGFR', '98979-8', 58, 'mL/min/1.73m2', 'mL/min/{1.73_m2}', 60, null))));
  perform pg_temp.labs(dm, null, 57 * day, 'hba1c', demo.a1c(8.2));
  perform pg_temp.labs(dm, null, 57 * day, 'lipids', demo.lipids(190, 112, 40, 160));
  perform pg_temp.labs(dm, null, 57 * day, 'creat', demo.creat(1.55));
  perform demo.w(iman, pg_temp.outside(dm, demo.ago(57 * day - 40), jsonb_build_array(demo.analyte('k', 'Potassium', '2823-3', 4.7, 'mmol/L', 'mmol/L', 3.5, 5.1),
    demo.analyte('egfr', 'eGFR', '98979-8', 52, 'mL/min/1.73m2', 'mL/min/{1.73_m2}', 60, null))));
  -- today: here 25 minutes ago, his pressure taken, with Dr. Iman for 9 minutes
  v := demo.arrive('diabetes follow-up', 25, dm);
  perform demo.w(iman, jsonb_build_array(demo.e('vitals', dm, v, demo.ago(20), demo.vitals(146, 90, 82, 36.8, 98, null, 91))));
  perform demo.consult(v, 9, '[]', null, false, dm, iman);

  -- Fawzia Darwish, 81: diabetes and hypertension; her own target BP < 150/90 (falls), 156/88 ten days ago
  perform demo.patient(demo.id('chronic_care', 'patient:fawzia'), array['Fawzia'], 'Darwish', 'female', demo.born(81, 30), '+201225539061');
  v := demo.arrive('diabetes follow-up', 200 * day, dm);
  perform demo.consult(v, 200 * day - 10, jsonb_build_array(
    demo.e('problem', dm, v, demo.ago(200 * day - 15), demo.problem('E11.9', 'Type 2 diabetes mellitus', pg_temp.since(17))),
    demo.e('problem', dm, v, demo.ago(200 * day - 15), demo.problem('I10', 'Essential hypertension', pg_temp.since(21))),
    demo.e('chronic_care.target', dm, v, demo.ago(200 * day - 15), '{"condition":"htn","measure":"bp","op":"<","value":150,"value2":90,"reason":"81, falls","status":"active"}')),
    200 * day - 20, false, dm, iman);
  perform pg_temp.labs(dm, null, 40 * day, 'hba1c', demo.a1c(6.9));
  perform pg_temp.labs(dm, null, 40 * day, 'lipids', demo.lipids(160, 65, 52, 120));
  perform pg_temp.labs(dm, null, 40 * day, 'creat', demo.creat(1.0));
  perform demo.w(iman, pg_temp.outside(dm, demo.ago(40 * day - 40), jsonb_build_array(demo.analyte('k', 'Potassium', '2823-3', 4.4, 'mmol/L', 'mmol/L', 3.5, 5.1),
    demo.analyte('acr', 'Urine albumin/creatinine', '14959-1', 18, 'mg/g', 'mg/g', null, 30))));
  perform demo.w(iman, pg_temp.review(dm, demo.ago(40 * day), 'moderate risk', 'no retinopathy'));
  v := demo.arrive('diabetes follow-up', 10 * day, dm);
  perform demo.w(iman, jsonb_build_array(demo.e('vitals', dm, v, demo.ago(10 * day - 5), demo.vitals(156, 88, 76, 36.6))));
  perform demo.consult(v, 10 * day - 10, '[]', 10 * day - 25, false, dm, iman);

  -- Wafaa Abdelmoneim, 60: diabetes and asthma; HbA1c 7.3; her inhaler technique never checked
  perform demo.patient(demo.id('chronic_care', 'patient:wafaa'), array['Wafaa'], 'Abdelmoneim', 'female', demo.born(60, 200), '+201114420877');
  v := demo.arrive('diabetes follow-up', 51 * day, dm);
  perform demo.consult(v, 51 * day - 10, jsonb_build_array(
    demo.e('problem', dm, v, demo.ago(51 * day - 15), demo.problem('E11.9', 'Type 2 diabetes mellitus', pg_temp.since(7))),
    demo.e('problem', dm, v, demo.ago(51 * day - 15), demo.problem('J45.9', 'Asthma', pg_temp.since(36)))), 51 * day - 25, false, dm, iman);
  perform pg_temp.labs(dm, null, 51 * day, 'hba1c', demo.a1c(7.3));
  perform pg_temp.labs(dm, null, 51 * day, 'lipids', demo.lipids(170, 64, 55, 110));
  perform pg_temp.labs(dm, null, 51 * day, 'creat', demo.creat(0.8));
  perform demo.w(iman, pg_temp.outside(dm, demo.ago(51 * day - 40), jsonb_build_array(demo.analyte('acr', 'Urine albumin/creatinine', '14959-1', 12, 'mg/g', 'mg/g', null, 30))));
  perform demo.w(iman, pg_temp.review(dm, demo.ago(90 * day), 'low risk', 'no retinopathy'));
end $$;
