-- The nephrology pack's day (spec/openCare.md §5.1 rule 9, §5.8): its own patients at the Nephrology clinic. Saeed El-Gammal (67, diabetic
-- kidney disease) is in consult: his eGFR has fallen from 48 two years ago to 28 five days ago, his urine ACR from 260 a year ago to 420
-- (G4 A3, very high; G3b A2 a year before); the CKD panel five days ago (Hb 9.6 with ferritin 85 and TSAT 16, phosphate 5.1, PTH 188,
-- bicarbonate 19, potassium 5.3 on losartan); he still takes metformin. Hoda Fathy (54, hypertension and CKD G3a A2) waits. Times
-- relative to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('nephrology');

-- a kidney result: creatinine and the laboratory's eGFR (CKD-EPI 2021), with the urine ACR when given, d days ago, ordered from p_dept
create or replace function pg_temp.kidney(p_dept uuid, p_by uuid, d int, creat numeric, egfr int, acr int default null, p_more jsonb default '[]') returns void language plpgsql as $$
declare o uuid := gen_random_uuid(); day int := 60 * 24;
begin
  perform demo.w(p_by, jsonb_build_array(demo.lab_order('creat', p_dept, null, demo.ago(d * day + 90), o)));
  perform demo.lab(o, demo.ago(d * day + 80), jsonb_build_object('status', 'final', 'service', demo.service('creat') - 'code', 'analytes', jsonb_build_array(
    demo.analyte('creat', 'Creatinine', '2160-0', creat, 'mg/dL', 'mg/dL', 0.7, 1.3, null, 5),
    demo.analyte('egfr', 'eGFR (CKD-EPI 2021)', '98979-8', egfr, 'mL/min/1.73m²', 'mL/min/{1.73_m2}', 60, null))
    || case when acr is not null then jsonb_build_array(demo.analyte('acr', 'Urine albumin/creatinine ratio', '14959-1', acr, 'mg/g', 'mg/g', null, 30)) else '[]' end || p_more));
end $$;

do $$
declare nc uuid := demo.id('nephrology', 'clinic'); md uuid := demo.id('nephrology', 'nephrologist'); day int := 60 * 24; v uuid;
begin
  -- Saeed: diabetes since 2008, CKD from 2021; the eGFR falling, the ACR rising; metformin still on his list
  perform demo.patient(demo.id('nephrology', 'patient:saeed'), array['Saeed'], 'El-Gammal', 'male', demo.born(67, 40), '+201006643921');
  perform demo.w(md, jsonb_build_array(
    demo.e('problem', nc, null, demo.ago(730 * day), demo.problem('E11.9', 'Type 2 diabetes')),
    demo.e('problem', nc, null, demo.ago(730 * day), demo.problem('I10', 'Hypertension')),
    demo.e('problem', nc, null, demo.ago(730 * day), demo.problem('N18.3', 'CKD stage 3 · diabetic kidney disease')),
    demo.e('medication', nc, null, demo.ago(400 * day), demo.med('Cidophage (metformin)', 'A10BA02', 500, 'mg', 'BID')),
    demo.e('medication', nc, null, demo.ago(400 * day), demo.med('Insulin glargine', 'A10AE04', 20, 'U', 'OD', '{"instructions":"at night"}') #- '{dosage,route}'),
    demo.e('medication', nc, null, demo.ago(400 * day), demo.med('Losartan', 'C09CA01', 100, 'mg', 'OD')),
    demo.e('medication', nc, null, demo.ago(400 * day), demo.med('Amlodipine', 'C08CA01', 10, 'mg', 'OD')),
    demo.e('medication', nc, null, demo.ago(300 * day), demo.med('Forxiga (dapagliflozin)', 'A10BK01', 10, 'mg', 'OD')),
    demo.e('medication', nc, null, demo.ago(400 * day), demo.med('Ator (atorvastatin)', 'C10AA05', 20, 'mg', 'OD', '{"instructions":"at night"}'))));
  perform pg_temp.kidney(nc, md, 730, 1.55, 48);
  perform pg_temp.kidney(nc, md, 545, 1.66, 44);
  perform pg_temp.kidney(nc, md, 368, 1.78, 41, 260);
  perform pg_temp.kidney(nc, md, 240, 1.98, 36);
  perform pg_temp.kidney(nc, md, 120, 2.25, 31);
  perform pg_temp.kidney(nc, md, 5, 2.45, 28, 420, jsonb_build_array(
    demo.analyte('hb', 'Haemoglobin', '718-7', 9.6, 'g/dL', 'g/dL', 13.5, 17.5, 7, 20), demo.analyte('ferritin', 'Ferritin', '2276-4', 85, 'ng/mL', 'ng/mL', 30, 400),
    demo.analyte('tsat', 'Iron saturation (TSAT)', '2502-3', 16, '%', '%', 20, 50), demo.analyte('ca', 'Calcium', '17861-6', 8.9, 'mg/dL', 'mg/dL', 8.5, 10.5),
    demo.analyte('alb', 'Albumin', '1751-7', 3.8, 'g/dL', 'g/dL', 3.5, 5), demo.analyte('phos', 'Phosphate', '2777-1', 5.1, 'mg/dL', 'mg/dL', 2.5, 4.5),
    demo.analyte('pth', 'PTH', '2731-8', 188, 'pg/mL', 'pg/mL', 15, 65), demo.analyte('bicarb', 'Bicarbonate', '1963-8', 19, 'mmol/L', 'mmol/L', 22, 29),
    demo.analyte('k', 'Potassium', '2823-3', 5.3, 'mmol/L', 'mmol/L', 3.5, 5.0)));
  v := demo.arrive('CKD follow-up', 30, nc);
  perform demo.w(md, jsonb_build_array(demo.e('vitals', nc, v, demo.ago(22), demo.vitals(142, 86, 78, 36.7, 97, 16, 81))));
  perform demo.consult(v, 14, '[]'::jsonb, null, false, nc, md);

  -- Hoda: hypertension with CKD G3a A2, on ramipril; waiting
  perform demo.patient(demo.id('nephrology', 'patient:hoda'), array['Hoda'], 'Fathy', 'female', demo.born(54, 210), '+201224458190');
  perform demo.w(md, jsonb_build_array(
    demo.e('problem', nc, null, demo.ago(500 * day), demo.problem('I10', 'Hypertension')),
    demo.e('problem', nc, null, demo.ago(500 * day), demo.problem('N18.3', 'CKD stage 3a')),
    demo.e('medication', nc, null, demo.ago(500 * day), demo.med('Tritace (ramipril)', 'C09AA05', 10, 'mg', 'OD'))));
  perform pg_temp.kidney(nc, md, 380, 1.08, 58, 140);
  perform pg_temp.kidney(nc, md, 12, 1.18, 52, 120);
  v := demo.arrive('CKD follow-up', 12, nc);
end $$;
