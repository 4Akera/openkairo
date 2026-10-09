-- The theatre pack's day (spec/openCare.md §5.1 rule 9, §5.8; the pictures #theatre-list, #theatre-checklist). Its own patients, each
-- operation asked by Dr. Ali Hassan from General Practice (the surgeon named on it): Ghada Sharaf (45, gallstones; Theatre 1's first
-- case, a laparoscopic cholecystectomy: sent for, arrived, Sign in and Time out signed, operating; Sign out to say), Amr Nassar (36, a
-- right inguinal hernia; Theatre 1's second case: arrived, Sign in signed, under a spinal), Aya Shehata (29, gallstones, urgent: To
-- schedule) and Ziad Hafez (23, appendicitis: an emergency not yet in a room). Times relative to the load; ids in the pack's namespace;
-- a reload erases these patients first.
select demo.layer('theatre');

create or replace function pg_temp.op(p_code text, p_name text) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', core.setup_id(demo.id('theatre', 'department'), 'service', p_code), 'code', p_code, 'name', p_name)
$$;
create or replace function pg_temp.ask(p_op jsonb, p_min int, p_id uuid, p_words jsonb, p_priority text default 'routine') returns jsonb language sql as $$
  select jsonb_build_array(demo.e('theatre.op', demo.base('gp'), null, demo.ago(p_min), jsonb_build_object('service', p_op, 'department_id', demo.id('theatre', 'department'),
    'priority', p_priority, 'status', 'active', 'theatre', p_words), p_id))
$$;
-- the Theatre's step on an operation: the first answers it, a later one changes the one before; the room and time carried on
create or replace function pg_temp.step(p_op uuid, p_after uuid, p_rel text, p_min int, p_step text, p_room text, p_starts timestamptz, p_pos int, p_id uuid) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('theatre.step', demo.id('theatre', 'department'), null, demo.ago(p_min), jsonb_build_object('status', 'in-progress', 'step', p_step,
    'theatre', jsonb_build_object('op', p_op, 'room', p_room, 'starts', p_starts, 'position', p_pos)), p_id, p_after, p_rel))
$$;
-- a part of the checklist, every item said (the WHO 2009 list), by who said it
create or replace function pg_temp.part(p_op uuid, p_min int, p_part text, p_items jsonb, p_by text[]) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('theatre.check', demo.id('theatre', 'department'), null, demo.ago(p_min), jsonb_build_object('op', p_op, 'part', p_part, 'items', p_items, 'by', to_jsonb(p_by)),
    null, p_op, 'about'))
$$;

do $$
declare dr uuid := demo.base('doctor'); nurse uuid := demo.id('theatre', 'nurse'); day int := 60 * 24; t1 text := 'Theatre 1';
  g uuid := gen_random_uuid(); a uuid := gen_random_uuid(); y uuid := gen_random_uuid(); z uuid := gen_random_uuid();
  g1 uuid := gen_random_uuid(); g2 uuid := gen_random_uuid(); g3 uuid := gen_random_uuid(); g4 uuid := gen_random_uuid(); g5 uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid(); a4 uuid := gen_random_uuid();
  hesham text := 'Dr. Hesham Abdelaal'; mona text := 'Dr. Mona Tawfik'; iman text := 'Iman Zidan'; sherine text := 'Dr. Sherine Rashad';
  gstart timestamptz := demo.ago(120); astart timestamptz := demo.ago(25);
begin
  -- ── Ghada: Theatre 1, case 1 · laparoscopic cholecystectomy, decided five weeks ago; operating now, Sign out to say ──
  perform demo.patient(demo.id('theatre', 'patient:ghada'), array['Ghada'], 'Sharaf', 'female', demo.born(45, 120), '+201006614587');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', demo.base('gp'), null, demo.ago(36 * day), demo.problem('K80.2', 'Gallstones with biliary colic'))));
  perform demo.w(dr, jsonb_build_array(demo.e('vitals', demo.base('gp'), null, demo.ago(36 * day), demo.vitals(124, 78, 76, 36.7, 98, null, 78, 165))));
  perform demo.w(dr, pg_temp.ask(pg_temp.op('lapchole', 'Laparoscopic cholecystectomy'), 35 * day, g, jsonb_build_object('side', 'none', 'technique', 'general', 'stay', 'admitted',
    'surgeon', hesham, 'usual_min', 75, 'risks', '["bleeding","wound infection · about 1 in 50","bile leak · about 1 in 200","injury to the bile duct · about 1 in 500","converted to open · about 1 in 20","shoulder-tip pain for a day or two"]'::jsonb)));
  perform demo.w(nurse, pg_temp.step(g, g, 'answers', 14 * day, 'scheduled', t1, gstart, 0, g1));
  perform demo.w(nurse, pg_temp.step(g, g1, 'changes', 135, 'sent_for', t1, gstart, 0, g2));
  perform demo.w(nurse, pg_temp.step(g, g2, 'changes', 122, 'arrived', t1, gstart, 0, g3));
  perform demo.w(nurse, pg_temp.part(g, 115, 'sign_in', jsonb_build_array(
      jsonb_build_object('key', 'identity', 'text', 'Name, birth date, operation and consent confirmed with the patient', 'done', true, 'who', iman),
      jsonb_build_object('key', 'site', 'text', 'Site marked: no side', 'done', true, 'who', iman),
      jsonb_build_object('key', 'machine', 'text', 'Anaesthesia machine and drugs checked', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'oximeter', 'text', 'Pulse oximeter on and working', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'allergy', 'text', 'Allergy: none known', 'done', true, 'who', iman),
      jsonb_build_object('key', 'airway', 'text', 'Difficult airway or aspiration risk: no · Mallampati II', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'blood', 'text', 'Blood loss over 500 mL expected: no · group and save done', 'done', true, 'who', sherine)), array[iman, sherine])
    || pg_temp.step(g, g3, 'changes', 115, 'anaesthetic', t1, gstart, 0, g4));
  perform demo.w(nurse, pg_temp.part(g, 98, 'time_out', jsonb_build_array(
      jsonb_build_object('key', 'team', 'text', 'Everyone said their name and role', 'done', true, 'who', 'all three'),
      jsonb_build_object('key', 'confirm', 'text', 'Patient, operation, where the cut will be', 'done', true, 'who', hesham),
      jsonb_build_object('key', 'antibiotic', 'text', 'Antibiotic in the last 60 min: cefazolin 2 g', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'surgeon', 'text', 'Surgeon: the critical steps, about 45 min, little blood loss', 'done', true, 'who', hesham),
      jsonb_build_object('key', 'anaesthetist', 'text', 'Anaesthetist: no concerns', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'sterility', 'text', 'Sterility indicators checked · camera and insufflator ready', 'done', true, 'who', iman),
      jsonb_build_object('key', 'imaging', 'text', 'Imaging on the screen', 'done', false, 'who', hesham, 'not', 'the ultrasound is a paper report in her file')), array[hesham, sherine, iman])
    || pg_temp.step(g, g4, 'changes', 98, 'operating', t1, gstart, 0, g5));

  -- ── Amr: Theatre 1, case 2 · right inguinal hernia, open mesh; arrived, Sign in signed, under a spinal ──
  perform demo.patient(demo.id('theatre', 'patient:amr'), array['Amr'], 'Nassar', 'male', demo.born(36, 75), '+201117728406');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', demo.base('gp'), null, demo.ago(45 * day), demo.problem('K40.9', 'Right inguinal hernia'))));
  perform demo.w(dr, pg_temp.ask(pg_temp.op('ihr_mesh', 'Inguinal hernia repair, open mesh (Lichtenstein)'), 44 * day, a, jsonb_build_object('side', 'right', 'technique', 'spinal', 'stay', 'day',
    'surgeon', mona, 'usual_min', 60, 'risks', '["bleeding, bruising","wound infection · about 1 in 50","the hernia comes back · about 1 in 100","groin pain for months · about 1 in 10","numbness by the scar","harm to the testis · rare","trouble passing urine"]'::jsonb)));
  perform demo.w(nurse, pg_temp.step(a, a, 'answers', 10 * day, 'scheduled', t1, astart, 1, a1));
  perform demo.w(nurse, pg_temp.step(a, a1, 'changes', 40, 'sent_for', t1, astart, 1, a2));
  perform demo.w(nurse, pg_temp.step(a, a2, 'changes', 24, 'arrived', t1, astart, 1, a3));
  perform demo.w(nurse, pg_temp.part(a, 16, 'sign_in', jsonb_build_array(
      jsonb_build_object('key', 'identity', 'text', 'Name, birth date, operation and consent confirmed with the patient', 'done', true, 'who', iman),
      jsonb_build_object('key', 'site', 'text', 'Site marked: right groin', 'done', true, 'who', iman),
      jsonb_build_object('key', 'machine', 'text', 'Anaesthesia machine and drugs checked', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'oximeter', 'text', 'Pulse oximeter on and working', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'allergy', 'text', 'Allergy: none known', 'done', true, 'who', iman),
      jsonb_build_object('key', 'airway', 'text', 'Difficult airway or aspiration risk: no', 'done', true, 'who', sherine),
      jsonb_build_object('key', 'blood', 'text', 'Blood loss over 500 mL expected: no', 'done', true, 'who', sherine)), array[iman, sherine])
    || pg_temp.step(a, a3, 'changes', 16, 'anaesthetic', t1, astart, 1, a4));

  -- ── Aya: gallstones, urgent after two attacks this week; To schedule ──
  perform demo.patient(demo.id('theatre', 'patient:aya'), array['Aya'], 'Shehata', 'female', demo.born(29, 200), '+201550942217');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', demo.base('gp'), null, demo.ago(8 * day), demo.problem('K80.2', 'Gallstones, two attacks this week'))));
  perform demo.w(dr, pg_temp.ask(pg_temp.op('lapchole', 'Laparoscopic cholecystectomy'), 7 * day, y, jsonb_build_object('side', 'none', 'technique', 'general', 'stay', 'admitted',
    'surgeon', hesham, 'usual_min', 75), 'urgent'));

  -- ── Ziad: appendicitis, an emergency asked for 40 minutes ago; not yet in a room ──
  perform demo.patient(demo.id('theatre', 'patient:ziad'), array['Ziad'], 'Hafez', 'male', demo.born(23, 30), '+201009917725');
  perform demo.w(dr, jsonb_build_array(demo.e('problem', demo.base('gp'), null, demo.ago(45), demo.problem('K35.8', 'Acute appendicitis'))));
  perform demo.w(dr, pg_temp.ask(pg_temp.op('lapappx', 'Laparoscopic appendicectomy'), 40, z, jsonb_build_object('side', 'none', 'technique', 'general', 'stay', 'admitted',
    'surgeon', mona, 'usual_min', 45), 'stat'));
end $$;
