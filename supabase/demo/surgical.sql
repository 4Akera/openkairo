-- The surgical pack's day (spec/openCare.md §5.1 rule 9, §5.7; the pictures #surg-clinic, #surg-opnote). Its own patients: Reda
-- Abdelhady (58; a right inguinal hernia for eight months, a stent in 2022, diabetes; in consult with Dr. Hesham now, his history and
-- examination signed: the decision to operate is typed live, /op lichtenstein right) and Kamal Fouda (47; haemorrhoids; an operation
-- decided 14 weeks ago: the clinic's day puts it on the Theatre's To schedule). Times relative to the load; ids in the pack's namespace;
-- a reload erases these patients first.
select demo.layer('surgical');

do $$
declare sc uuid := demo.id('surgical', 'clinic'); dr uuid := demo.id('surgical', 'surgeon'); day int := 60 * 24; v uuid;
begin
  perform demo.patient(demo.id('surgical', 'patient:reda'), array['Reda'], 'Abdelhady', 'male', demo.born(58, 140), '+201006672013');
  perform demo.w(dr, jsonb_build_array(
    demo.e('problem', sc, null, demo.ago(4000 * 60), demo.problem('E11.9', 'Type 2 diabetes', jsonb_build_object('onset', jsonb_build_object('value', to_char(demo.now() - interval '11 years', 'YYYY'), 'precision', 'year')))),
    demo.e('problem', sc, null, demo.ago(4000 * 60), demo.problem('I10', 'Hypertension', jsonb_build_object('onset', jsonb_build_object('value', to_char(demo.now() - interval '14 years', 'YYYY'), 'precision', 'year')))),
    demo.e('problem', sc, null, demo.ago(4000 * 60), demo.problem('I25.9', 'Coronary artery disease, a stent to the LAD', jsonb_build_object('onset', jsonb_build_object('value', to_char(demo.now() - interval '4 years', 'YYYY'), 'precision', 'year')))),
    demo.e('medication', sc, null, demo.ago(4000 * 60), demo.med('Aspirin', 'B01AC06', 75, 'mg', 'OD')),
    demo.e('medication', sc, null, demo.ago(4000 * 60), demo.med('Metformin', 'A10BA02', 1000, 'mg', 'BD')),
    demo.e('medication', sc, null, demo.ago(4000 * 60), demo.med('Empagliflozin', 'A10BK03', 10, 'mg', 'OD')),
    demo.e('medication', sc, null, demo.ago(4000 * 60), demo.med('Valsartan', 'C09CA03', 160, 'mg', 'OD')),
    demo.e('medication', sc, null, demo.ago(4000 * 60), demo.med('Amlodipine', 'C08CA01', 5, 'mg', 'OD')),
    demo.e('medication', sc, null, demo.ago(4000 * 60), demo.med('Atorvastatin', 'C10AA05', 40, 'mg', 'OD'))));
  v := demo.arrive('right groin swelling', 30, sc);
  perform demo.consult(v, 11, jsonb_build_array(
    demo.e('vitals', sc, v, demo.ago(10), demo.vitals(136, 84, 74, 36.6, 98, null, 98, 175)),
    demo.e('problem', sc, v, demo.ago(5), demo.problem('K40.9', 'Right inguinal hernia, reducible')),
    demo.e('note', sc, v, demo.ago(4), jsonb_build_object('kind', 'history_physical', 'heading', 'History and examination', 'text',
      E'Right groin swelling for 8 months, bigger on standing, aches after work; never stuck, no vomiting.\nReducible right inguinal swelling with a cough impulse, not into the scrotum; the left side and both testes normal.\nBefore: open appendicectomy 1989 · a general anaesthetic, no problems he knows of.'))), null, false, sc, dr);

  -- Kamal: haemorrhoids, decided 14 weeks ago; To schedule, where the Theatre is on
  perform demo.patient(demo.id('surgical', 'patient:kamal'), array['Kamal'], 'Fouda', 'male', demo.born(47, 60), '+201114470928');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', sc, null, demo.ago(98 * day), demo.problem('K64.9', 'Haemorrhoids, third degree'))));
end $$;
