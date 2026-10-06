-- The shared journey's last step (spec/openCare.md §5.1 rule 9; the journey: supabase/demo/journey/1-base.sql): home an hour ago,
-- after every pack's step, the IV antibiotic stopped and a follow-up booked at the clinic in a week.

do $$
declare ward uuid := demo.base('ward'); s uuid := demo.kept('journey_stay');
begin
  perform demo.use(demo.kept('journey_patient'));
  perform demo.w(demo.base('doctor'), jsonb_build_array(
    demo.e('medication', ward, s, demo.ago(60), demo.med('Ceftriaxone', 'J01DD04', 1, 'g', 'OD', '{"status":"stopped","status_reason":"switched to tablets"}')
      || '{"dosage":{"dose":{"value":"1","unit":"g","ucum":"g"},"timing":{"code":"OD"},"route":"intravenous"}}', null, demo.kept('journey_iv'), 'changes'),
    demo.e('order', ward, s, demo.ago(60), jsonb_build_object('service', '{"name":"Follow-up visit","answer":"note"}'::jsonb, 'department_id', demo.base('gp'),
      'priority', 'routine', 'status', 'active', 'question', 'Pneumonia treated on the ward; please check his chest and the blood count again.',
      'due', demo.midnight() + interval '7 days' + interval '10 hours')),
    demo.move('discharged', ward, s, demo.ago(60), s, '{"disposition":"home","note":"home with his daughter; clinic in a week"}')));
end $$;
