-- The shared journey (spec/openCare.md §5.1 rule 9): the one patient every layer writes on, its steps in order, each layer's step in
-- its own file here (supabase/demo/journey/<n>-<layer>.sql, loaded in that order after every layer's day; a pack's skipped while it
-- is off). Mahmoud Abdelsalam came to General Practice three days ago with pneumonia and was admitted to the ward (this file), had
-- his medicines for home from the pharmacy (2-pharmacy.sql), and went home an hour ago with a follow-up booked (9-base.sql). Times
-- relative to the load; a reload erases him first (demo.patient). The later files find him and his stay by demo.kept.

do $$
declare
  gp uuid := demo.base('gp'); ward uuid := demo.base('ward'); doctor uuid := demo.base('doctor'); nurse uuid := demo.base('nurse');
  today timestamptz := demo.midnight();
  t0 timestamptz := today - interval '3 days' + interval '10 hours'; d1 timestamptz := today - interval '3 days'; d2 timestamptz := today - interval '2 days';
  d3 timestamptz := today - interval '1 day';
  v uuid := gen_random_uuid(); c uuid := gen_random_uuid(); s uuid := demo.keep('journey_stay', gen_random_uuid());
  cef uuid := demo.keep('journey_iv', gen_random_uuid()); o uuid := gen_random_uuid();
begin
  perform demo.keep('journey_patient', demo.patient(demo.id('journey', 'patient:mahmoud'), array['Mahmoud', 'Saad'], 'Abdelsalam', 'male', demo.born(67, 88), '+201002267734'));

  -- General Practice, three days ago: pneumonia, admitted
  perform demo.w(demo.base('reception'), jsonb_build_array(demo.e('checked_in', demo.base('desk'), v, t0, jsonb_build_object('department_id', gp, 'reason', 'fever and cough for four days'), v)));
  perform demo.w(doctor, jsonb_build_array(
    demo.move('called', gp, v, t0 + interval '20 minutes', v, '{}', c),
    demo.e('vitals', gp, v, t0 + interval '25 minutes', demo.vitals(132, 78, 106, 38.9, 91, 24, 74)),
    demo.e('problem', gp, v, t0 + interval '30 minutes', demo.problem('J18.9', 'Community-acquired pneumonia', '{"category":"encounter-diagnosis"}')),
    demo.e('list_review', gp, v, t0 + interval '30 minutes', '{"list":"allergies","outcome":"none_known"}'),
    demo.e('note', gp, v, t0 + interval '35 minutes', demo.note('progress', 'Four days of fever and a productive cough; crackles at the left base, saturation 91%. Admit for IV antibiotics.')),
    demo.move('done', gp, v, t0 + interval '40 minutes', c, '{"wait":false}')));
  perform demo.w_bed(doctor, jsonb_build_array(demo.e('admitted', ward, s, t0 + interval '90 minutes', jsonb_build_object('department_id', ward, 'admit_source', 'outp',
    'reason', 'community-acquired pneumonia'), s, v, 'about')), 4);

  -- the ward: IV antibiotics, a blood count, better each day; this morning's round decides he goes home
  perform demo.w(doctor, jsonb_build_array(
    demo.e('note', ward, s, d1 + interval '13 hours', demo.note('history_physical', 'hx: retired driver, non-smoker; no allergies
ex: crackles left base; alert
plan: ceftriaxone IV, oxygen to 94%, blood count')),
    demo.e('medication', ward, s, d1 + interval '13 hours', demo.med('Ceftriaxone', 'J01DD04', 1, 'g', 'OD', '{"duration_days":5}')
      || '{"dosage":{"dose":{"value":"1","unit":"g","ucum":"g"},"timing":{"code":"OD"},"route":"intravenous"}}', cef),
    demo.lab_order('cbc', ward, s, d1 + interval '13 hours', o)));
  perform demo.lab(o, d1 + interval '14 hours', demo.cbc(false, 13.9, 15.8, 322));
  perform demo.w(nurse, jsonb_build_array(
    demo.e('given', ward, s, d1 + interval '15 hours', jsonb_build_object('medication', cef, 'drug', demo.concept('atc', 'J01DD04', 'Ceftriaxone'),
      'dose', demo.q(1, 'g', 'g'), 'route', 'intravenous', 'status', 'completed')),
    demo.e('vitals', ward, s, d1 + interval '18 hours', demo.vitals(128, 76, 98, 38.2, 94, 20))));
  perform demo.w(nurse, jsonb_build_array(demo.e('vitals', ward, s, d2 + interval '9 hours', demo.vitals(124, 74, 88, 37.4, 96, 18))));
  perform demo.w(nurse, jsonb_build_array(demo.e('vitals', ward, s, d3 + interval '9 hours', demo.vitals(122, 72, 80, 36.9, 97, 16))));
  perform demo.w(doctor, jsonb_build_array(demo.e('note', ward, s, demo.ago(200), demo.note('progress',
    'No fever for two days, eating, walking the corridor. Home today on oral antibiotics; clinic in a week.'))));
end $$;
