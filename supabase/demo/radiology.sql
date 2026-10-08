-- The radiology pack's day (spec/openCare.md §5.1 rule 9, §5.5): its own patients, ordered from General Practice by Dr. Ali Hassan or
-- walked in at Radiology. To scan: Samia (a CT abdomen and pelvis with contrast, urgent; on metformin, her creatinine 2.6 three days
-- ago: eGFR under 30, the radiologist decides), Nour (a walk-in knee X-ray, left, from an outside doctor: pregnant asked at the door),
-- Mona (a walk-in abdominal ultrasound: fasting 6 hours) and Tamer (an MRI lumbar spine). To report: Adel (a CT brain, stat, scanned 20
-- minutes ago) and Wael (an abdominal ultrasound scanned half an hour ago; his ultrasound five months ago is the one before). Film only:
-- Laila's chest X-ray, scanned an hour ago with no report asked, waits on Dr. Ali's To review for his reading. Times relative to the load;
-- ids in the pack's namespace; a reload erases these patients first.
select demo.layer('radiology');

-- an exam of Radiology's, by its code (its id from the setup)
create or replace function pg_temp.exam(p_code text, p_name text) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', core.setup_id(demo.id('radiology', 'department'), 'service', p_code), 'code', p_code, 'name', p_name)
$$;
-- an order to Radiology with radiology's words (its own order type: the side, portable, a report asked)
create or replace function pg_temp.req(p_exam jsonb, p_from uuid, p_min int, p_id uuid, p_priority text default 'routine', p_question text default null,
  p_words jsonb default '{}', p_asked text default null) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('radiology.request', p_from, null, demo.ago(p_min), jsonb_strip_nulls(jsonb_build_object('service', p_exam,
    'department_id', demo.id('radiology', 'department'), 'priority', p_priority, 'status', 'active', 'question', p_question, 'asked_by', p_asked)) || jsonb_build_object('radiology', p_words), p_id))
$$;
create or replace function pg_temp.scanned(p_order uuid, p_min int, p_status text default 'in-progress', p_note text default null) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('step', demo.id('radiology', 'department'), null, demo.ago(p_min),
    jsonb_strip_nulls(jsonb_build_object('status', p_status, 'step', 'scanned', 'note', p_note)), null, p_order, 'answers'))
$$;
create or replace function pg_temp.report(p_order uuid, p_min int, p_exam jsonb, p_findings text, p_impression text) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('result', demo.id('radiology', 'department'), null, demo.ago(p_min), jsonb_build_object('status', 'final', 'service', p_exam - 'code',
    'conclusion', p_impression, 'analytes', jsonb_build_array(
      jsonb_build_object('key', 'impression', 'name', 'Impression', 'code', jsonb_build_object('system', 'loinc', 'code', '19005-8', 'display', 'Impression'), 'text', p_impression),
      jsonb_build_object('key', 'findings', 'name', 'Findings', 'code', jsonb_build_object('system', 'loinc', 'code', '18782-3', 'display', 'Findings'), 'text', p_findings))),
    null, p_order, 'answers'))
$$;

do $$
declare gp uuid := demo.base('gp'); rad uuid := demo.id('radiology', 'department'); dr uuid := demo.base('doctor');
  xr uuid := demo.id('radiology', 'radiographer'); mai uuid := demo.id('radiology', 'radiologist'); day int := 60 * 24;
  o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid(); o5 uuid := gen_random_uuid();
  o6 uuid := gen_random_uuid(); o7 uuid := gen_random_uuid(); o8 uuid := gen_random_uuid(); cr uuid := gen_random_uuid();
begin
  -- Samia: diabetic on metformin; creatinine 2.6 three days ago (eGFR about 22, worked out); a CT abdomen and pelvis with contrast, urgent
  perform demo.patient(demo.id('radiology', 'patient:samia'), array['Samia'], 'Ibrahim', 'female', demo.born(46, 120), '+201006612390');
  perform demo.w(dr, jsonb_build_array(demo.e('medication', gp, null, demo.ago(200 * day), demo.med('Metformin', 'A10BA02', 1000, 'mg', 'BID'))));
  perform demo.w(dr, jsonb_build_array(demo.lab_order('creat', gp, null, demo.ago(3 * day + 60), cr)));
  perform demo.lab(cr, demo.ago(3 * day + 50), demo.creat(2.6));
  perform demo.w(dr, pg_temp.req(pg_temp.exam('ctapc', 'CT abdomen & pelvis with contrast'), gp, 25, o1, 'urgent', 'appendicitis'));

  -- Nour: a walk-in, an outside doctor's paper: X-ray of the left knee, 9 minutes ago
  perform demo.patient(demo.id('radiology', 'patient:nour'), array['Nour'], 'Hany', 'female', demo.born(27, 160), '+201227740913');
  perform demo.w(xr, pg_temp.req(pg_temp.exam('xrknee', 'X-ray knee'), rad, 9, o2, 'routine', 'pain after a fall', '{"side":"left"}', 'Dr. Karim Adel · outside'));

  -- Mona: a walk-in abdominal ultrasound, 4 minutes ago
  perform demo.patient(demo.id('radiology', 'patient:mona'), array['Mona'], 'Ezz', 'female', demo.born(34, 40), '+201145529017');
  perform demo.w(xr, pg_temp.req(pg_temp.exam('usabd', 'US abdomen'), rad, 4, o3, 'routine', 'right upper pain', '{}', 'Dr. Samir Fouad · Nasr City clinic'));

  -- Tamer: an MRI of the lumbar spine, 15 minutes ago
  perform demo.patient(demo.id('radiology', 'patient:tamer'), array['Tamer'], 'Fouad', 'male', demo.born(52, 200), '+201002281746');
  perform demo.w(dr, pg_temp.req(pg_temp.exam('mrlspine', 'MRI lumbar spine'), gp, 15, o4, 'routine', 'disc prolapse'));

  -- Adel: a CT brain, stat, scanned 20 minutes ago: first on To report
  perform demo.patient(demo.id('radiology', 'patient:adel'), array['Adel'], 'Shawky', 'male', demo.born(61, 15), '+201118830265');
  perform demo.w(dr, pg_temp.req(pg_temp.exam('ctbrain', 'CT brain'), gp, 40, o5, 'stat', 'fell this morning, drowsy'));
  perform demo.w(xr, pg_temp.scanned(o5, 20));

  -- Wael: an abdominal ultrasound five months ago (reported), and today's, scanned half an hour ago
  perform demo.patient(demo.id('radiology', 'patient:wael'), array['Wael'], 'Nasr', 'male', demo.born(47, 300), '+201009934418');
  perform demo.w(dr, pg_temp.req(pg_temp.exam('usabd', 'US abdomen'), gp, 150 * day, o6, 'routine', 'right loin pain'));
  perform demo.w(xr, pg_temp.scanned(o6, 150 * day - 30));
  perform demo.w(mai, pg_temp.report(o6, 150 * day - 40, pg_temp.exam('usabd', 'US abdomen'),
    E'Liver normal in size and echotexture. Gallbladder normal, no stones.\nRight kidney: a 6 mm stone in the lower calyx with mild hydronephrosis.\nLeft kidney normal. No free fluid.',
    'Right renal stone 6 mm, mild hydronephrosis.'));
  perform demo.w(dr, pg_temp.req(pg_temp.exam('usabd', 'US abdomen'), gp, 70, o7, 'routine', 'right loin pain again, blood in urine'));
  perform demo.w(xr, pg_temp.scanned(o7, 30));

  -- Laila: a chest X-ray, no report asked (the X-ray is reported only when asked): scanned an hour ago, film only, for Dr. Ali to read
  perform demo.patient(demo.id('radiology', 'patient:laila'), array['Laila'], 'Saad', 'female', demo.born(70, 45), '+201062217734');
  perform demo.w(dr, pg_temp.req(pg_temp.exam('xrchest', 'X-ray chest'), gp, 90, o8, 'routine', 'cough and fever, pneumonia?'));
  perform demo.w(xr, pg_temp.scanned(o8, 60, 'completed'));
end $$;
