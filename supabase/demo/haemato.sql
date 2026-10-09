-- The haemato pack's day (spec/openCare.md §5.1 rule 9, §5.8): its own patients at the Haematology clinic. Mariam Tawfik (19, 48 kg,
-- β-thalassaemia major) is in consult at day care: her programme every 3 weeks with the Hb before 9.5–10.5 and red cells leucodepleted,
-- Rh and Kell matched; two units each 9, 6 and 3 weeks ago; her Hb 8.9 this morning, under her 9.5; ferritin falling from 3 850 to 2 610 on
-- deferasirox 1 260 mg (26 mg/kg); grouped O Rh positive, antibody screen negative 3 weeks ago (from her Blood bank card). Ensaf Rizk
-- (52, rheumatic mitral stenosis with AF) is in consult at the INR clinic: warfarin since March 2021, target 2.0–3.0; her INRs over six
-- months, the last 3.6 three weeks ago on azithromycin, when the week went from 32.5 to 30 mg; today's INR is the doctor's to type. Times
-- relative to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('haemato');

create or replace function pg_temp.hb(p_dept uuid, p_by uuid, p_min int, hb numeric, more jsonb default '[]') returns void language plpgsql as $$
declare o uuid := gen_random_uuid();
begin
  perform demo.w(p_by, jsonb_build_array(demo.lab_order('cbc', p_dept, null, demo.ago(p_min + 60), o)));
  perform demo.lab(o, demo.ago(p_min + 50), jsonb_build_object('status', 'final', 'service', demo.service('cbc') - 'code', 'analytes', jsonb_build_array(
    demo.analyte('hb', 'Haemoglobin', '718-7', hb, 'g/dL', 'g/dL', 12, 15.5, 7, 20), demo.analyte('plt', 'Platelets', '777-3', 312, '10^9/L', '10*3/uL', 150, 400, 50)) || more));
end $$;
-- a unit given in the clinic's day care: the base's given, the unit number its lot, the volume its dose
create or replace function pg_temp.unit(p_dept uuid, p_min int, p_unit text) returns jsonb language sql as $$
  select demo.e('given', p_dept, null, demo.ago(p_min), jsonb_build_object('status', 'completed', 'drug', jsonb_build_object('text', 'Red cells · O Rh+'), 'lot', p_unit,
    'route', 'iv', 'dose', demo.q(290, 'mL', 'mL'), 'note', 'no reaction'))
$$;
create or replace function pg_temp.week(d numeric[], was numeric, inr numeric, next_days int) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('days', to_jsonb(d), 'was', was, 'inr', inr, 'missed', 'none', 'food', 'as usual', 'bleeding', 'none',
    'next_inr', to_char(demo.now() + make_interval(days => next_days), 'YYYY-MM-DD')))
$$;
create or replace function pg_temp.inr(v numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'final', 'code', demo.concept('loinc', '6301-6', 'INR') || '{"text":"INR · finger prick"}', 'analytes', jsonb_build_array(jsonb_build_object(
    'key', 'inr', 'name', 'INR', 'code', jsonb_build_object('system', 'loinc', 'code', '6301-6', 'display', 'INR'), 'value', jsonb_build_object('value', v::text), 'method', 'finger prick',
    'interpretation', case when v < 2 then 'L' when v > 3 then 'H' else 'N' end, 'range', jsonb_build_object('low', jsonb_build_object('value', '2'), 'high', jsonb_build_object('value', '3')))))
$$;

do $$
declare hc uuid := demo.id('haemato', 'clinic'); ola uuid := demo.id('haemato', 'haematologist'); day int := 60 * 24; v uuid; o uuid;
begin
  -- Mariam: β-thalassaemia major on a three-weekly programme
  perform demo.patient(demo.id('haemato', 'patient:mariam'), array['Mariam'], 'Tawfik', 'female', demo.born(19, 120), '+201015524380');
  perform demo.w(ola, jsonb_build_array(
    demo.e('problem', hc, null, demo.ago(300 * day), demo.problem('D56.1', 'β-thalassaemia major')),
    demo.e('haemato.programme', hc, null, demo.ago(270 * day), jsonb_build_object('condition', 'β-thalassaemia major', 'every_weeks', 3, 'hb', jsonb_build_object('low', 9.5, 'high', 10.5),
      'needs', jsonb_build_array('leucodepleted', 'Rh and Kell matched'), 'status', 'active')),
    demo.e('medication', hc, null, demo.ago(270 * day), demo.med('Deferasirox film-coated (Jadenu)', 'V03AC03', 1260, 'mg', 'OD'))));
  -- her group and screen from her Blood bank card (the National Blood Transfusion Centre), written in by her haematologist
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(21 * day + 200), jsonb_build_object('status', 'final', 'code', jsonb_build_object('text', 'Group and screen · her Blood bank card'),
    'analytes', jsonb_build_array(jsonb_build_object('key', 'group', 'name', 'ABO and Rh', 'code', jsonb_build_object('system', 'loinc', 'code', '882-1', 'display', 'ABO and Rh group'), 'text', 'O Rh positive'),
      jsonb_build_object('key', 'phenotype', 'name', 'Phenotype', 'text', 'R1r (C+ c+ E− e+) · Kell negative'),
      jsonb_build_object('key', 'screen', 'name', 'Antibody screen', 'code', jsonb_build_object('system', 'loinc', 'code', '890-4', 'display', 'Antibody screen'), 'text', 'negative'))))));
  perform pg_temp.hb(hc, ola, 270 * day, 8.6, jsonb_build_array(demo.analyte('ferritin', 'Ferritin', '2276-4', 3850, 'ng/mL', 'ng/mL', 13, 150)));
  perform pg_temp.hb(hc, ola, 180 * day, 9.1, jsonb_build_array(demo.analyte('ferritin', 'Ferritin', '2276-4', 3420, 'ng/mL', 'ng/mL', 13, 150)));
  perform pg_temp.hb(hc, ola, 90 * day, 9.4, jsonb_build_array(demo.analyte('ferritin', 'Ferritin', '2276-4', 2960, 'ng/mL', 'ng/mL', 13, 150)));
  -- three transfusions, each with the Hb that morning and her weight
  perform pg_temp.hb(hc, ola, 63 * day + 180, 9.8);
  perform demo.w(ola, jsonb_build_array(demo.e('vitals', hc, null, demo.ago(63 * day + 150), demo.vitals(110, 70, 84, 36.7, 98, null, 47.5)), pg_temp.unit(hc, 63 * day + 120, '26-104412'), pg_temp.unit(hc, 63 * day, '26-104419')));
  perform pg_temp.hb(hc, ola, 42 * day + 180, 9.6);
  perform demo.w(ola, jsonb_build_array(demo.e('vitals', hc, null, demo.ago(42 * day + 150), demo.vitals(108, 68, 86, 36.8, 98, null, 47.8)), pg_temp.unit(hc, 42 * day + 120, '26-109934'), pg_temp.unit(hc, 42 * day, '26-109940')));
  perform pg_temp.hb(hc, ola, 21 * day + 180, 9.3, jsonb_build_array(demo.analyte('creat', 'Creatinine', '2160-0', 0.6, 'mg/dL', 'mg/dL', 0.5, 1.1), demo.analyte('alt', 'ALT', '1742-6', 31, 'U/L', 'U/L', 0, 35)));
  perform demo.w(ola, jsonb_build_array(demo.e('vitals', hc, null, demo.ago(21 * day + 150), demo.vitals(112, 70, 82, 36.6, 98, null, 48)), pg_temp.unit(hc, 21 * day + 120, '26-113377'), pg_temp.unit(hc, 21 * day, '26-113381')));
  -- this morning: Hb 8.9, ferritin 2 610; in consult at day care
  perform pg_temp.hb(hc, ola, 90, 8.9, jsonb_build_array(demo.analyte('ferritin', 'Ferritin', '2276-4', 2610, 'ng/mL', 'ng/mL', 13, 150)));
  v := demo.arrive('Thalassaemia day care · transfusion', 30, hc);
  perform demo.w(ola, jsonb_build_array(demo.e('vitals', hc, v, demo.ago(20), demo.vitals(108, 66, 88, 36.7, 98, 16, 48))));
  perform demo.consult(v, 6, '[]'::jsonb, null, false, hc, ola);
  perform demo.keep('mariam_visit', v);

  -- Ensaf: rheumatic mitral stenosis with AF, warfarin since March 2021, target 2–3; six months of INRs and two weeks set
  perform demo.patient(demo.id('haemato', 'patient:ensaf'), array['Ensaf'], 'Rizk', 'female', demo.born(52, 230), '+201228810946');
  perform demo.w(ola, jsonb_build_array(
    demo.e('problem', hc, null, demo.ago(2000 * day), demo.problem('I05.0', 'Rheumatic mitral stenosis')),
    demo.e('problem', hc, null, demo.ago(2000 * day), demo.problem('I48.9', 'Atrial fibrillation')),
    demo.e('haemato.plan', hc, null, demo.ago(2000 * day), jsonb_build_object('reason', 'AF with rheumatic mitral stenosis (moderate): warfarin, not a DOAC',
      'target', jsonb_build_object('low', 2, 'high', 3), 'medicine', 'warfarin (Marevan)', 'tablet_mg', 5, 'status', 'active')),
    demo.e('medication', hc, null, demo.ago(2000 * day), demo.med('Warfarin (Marevan) 5 mg', 'B01AA03', 5, 'mg', 'OD', '{"instructions":"by the week''s table"}')),
    demo.e('medication', hc, null, demo.ago(900 * day), demo.med('Digoxin', 'C01AA05', 0.25, 'mg', 'OD')),
    demo.e('medication', hc, null, demo.ago(900 * day), demo.med('Bisoprolol', 'C07AB07', 5, 'mg', 'OD'))));
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(182 * day), pg_temp.inr(2.3)), demo.e('haemato.week', hc, null, demo.ago(182 * day),
    pg_temp.week(array[5, 5, 5, 5, 5, 2.5, 5], 32.5, 2.3, -154))));
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(154 * day), pg_temp.inr(1.9))));
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(126 * day), pg_temp.inr(2.4))));
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(98 * day), pg_temp.inr(2.6))));
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(63 * day), pg_temp.inr(2.2))));
  -- three weeks ago: 3.6 on azithromycin from the GP; the week down to 30
  perform demo.w(demo.base('doctor'), jsonb_build_array(demo.e('medication', demo.base('gp'), null, demo.ago(26 * day), demo.med('Azithromycin', 'J01FA10', 500, 'mg', 'OD', '{"duration_days":3}'))));
  perform demo.w(ola, jsonb_build_array(demo.e('result', hc, null, demo.ago(21 * day), pg_temp.inr(3.6)), demo.e('haemato.week', hc, null, demo.ago(21 * day),
    pg_temp.week(array[5, 5, 2.5, 5, 5, 2.5, 5], 32.5, 3.6, 0))));
  v := demo.arrive('INR clinic', 12, hc);
  perform demo.consult(v, 4, '[]'::jsonb, null, false, hc, ola);
end $$;
