-- The anaesthesia pack's day (spec/openCare.md §5.1 rule 9, §5.8; the pictures #anaes-preop, #theatre-recovery). Its own patients: Hamed
-- Sakr (70; a left inguinal hernia, its operation asked 11 weeks ago in the clinic's day; Hb 9.8 last week; in consult in the Pre-op clinic with Dr. Sherine now, the
-- assessment typed live), and in Recovery Marwa Shalaby (33; a laparoscopic ovarian cystectomy; in Bay 2 for 5 minutes, Aldrete 6,
-- oxygen on) and Yara Abdelsalam (7, 23 kg; K-wires to the left elbow; in Bay 3 for 45 minutes, Aldrete 7 → 9, pain 4). Times relative
-- to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('anaesthesia');

do $$
declare pre uuid := demo.id('anaesthesia', 'preop'); rec uuid := demo.id('anaesthesia', 'recovery'); dr uuid := demo.id('anaesthesia', 'anaesthetist');
  nurse uuid := demo.id('anaesthesia', 'nurse'); day int := 60 * 24; v uuid; s uuid; l uuid := gen_random_uuid();
begin
  -- ── Hamed: pre-op today ──
  perform demo.patient(demo.id('anaesthesia', 'patient:hamed'), array['Hamed'], 'Sakr', 'male', demo.born(70, 50), '+201228840631');
  perform demo.w(dr, jsonb_build_array(
    demo.e('problem', pre, null, demo.ago(80 * day), demo.problem('K40.9', 'Left inguinal hernia')),
    demo.e('problem', pre, null, demo.ago(80 * day), demo.problem('I10', 'Hypertension')),
    demo.e('medication', pre, null, demo.ago(80 * day), demo.med('Amlodipine', 'C08CA01', 10, 'mg', 'OD')),
    demo.e('medication', pre, null, demo.ago(80 * day), demo.med('Aspirin', 'B01AC06', 75, 'mg', 'OD'))));
  perform demo.w(dr, jsonb_build_array(demo.lab_order('cbc', pre, null, demo.ago(7 * day + 60), l)));
  perform demo.lab(l, demo.ago(7 * day + 50), demo.cbc(false, 9.8, 6.2, 244));
  v := demo.arrive('pre-op assessment', 40, pre);
  perform demo.consult(v, 16, jsonb_build_array(demo.e('vitals', pre, v, demo.ago(15), demo.vitals(142, 84, 78, 36.6, 97, 16, 81, 170))), null, false, pre, dr);

  -- ── Recovery: Marwa in Bay 2 for 5 minutes, Aldrete 6 ──
  perform demo.patient(demo.id('anaesthesia', 'patient:marwa'), array['Marwa'], 'Shalaby', 'female', demo.born(33, 210), '+201117745129');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', rec, null, demo.ago(30 * day), demo.problem('N83.2', 'Right ovarian cyst'))));
  s := gen_random_uuid();
  perform demo.w(nurse, jsonb_build_array(demo.e('admitted', rec, s, demo.ago(5), jsonb_build_object('department_id', rec, 'admit_source', 'other',
    'place_id', core.setup_id(rec, 'place', 'bay_2'), 'reason', 'laparoscopic ovarian cystectomy, right'), s)));
  perform demo.w(nurse, jsonb_build_array(
    demo.e('vitals', rec, s, demo.ago(4), demo.vitals(112, 68, 92, 36.4, 95, 14) || jsonb_build_object('pain', demo.q(3, '/10', '{score}'), 'note', 'oxygen 4 L/min by mask; drowsy')),
    demo.e('score', rec, s, demo.ago(4), demo.score('anaesthesia.aldrete', '{"activity":"1","breathing":"2","circulation":"2","conscious":"1","spo2":"0"}'))));

  -- ── Recovery: Yara in Bay 3 for 45 minutes, Aldrete 7 → 9, pain 4 ──
  perform demo.patient(demo.id('anaesthesia', 'patient:yara'), array['Yara'], 'Abdelsalam', 'female', demo.born(7, 90), '+201007760344');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', rec, null, demo.ago(1 * day), demo.problem('S42.4', 'Supracondylar fracture, left elbow'))));
  s := gen_random_uuid();
  perform demo.w(nurse, jsonb_build_array(demo.e('admitted', rec, s, demo.ago(45), jsonb_build_object('department_id', rec, 'admit_source', 'other',
    'place_id', core.setup_id(rec, 'place', 'bay_3'), 'reason', 'K-wires, left elbow'), s)));
  perform demo.w(nurse, jsonb_build_array(demo.e('score', rec, s, demo.ago(43), demo.score('anaesthesia.aldrete', '{"activity":"1","breathing":"2","circulation":"2","conscious":"1","spo2":"1"}'))));
  perform demo.w(nurse, jsonb_build_array(
    demo.e('vitals', rec, s, demo.ago(10), demo.vitals(null, null, 104, 36.8, 98, 22, 23) || jsonb_build_object('pain', demo.q(4, '/10', '{score}'))),
    demo.e('note', rec, s, demo.ago(10), demo.note('nursing', 'Vomited once; ondansetron given as charted.')),
    demo.e('score', rec, s, demo.ago(10), demo.score('anaesthesia.aldrete', '{"activity":"2","breathing":"2","circulation":"2","conscious":"2","spo2":"1"}'))));
end $$;
