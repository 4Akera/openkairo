-- Dialysis's day (spec/openCare.md §5.6): six of the pack's own patients in the Dialysis unit. Five come on today's days (Sat/Mon/Wed or
-- Sun/Tue/Thu, whichever today is; on a Friday, Saturday's, each moved one-off a day early) at the shift on now; Magdy comes on the
-- other days, in the HBV chair. Said, Nadia and Mohamed (HCV, in the HCV chair) are on dialysis, each started by Rasha Mounir as the
-- base's admitted into the chair with the session begun and the blood pressure at the start, in one set; Hassan (who missed a session
-- a week ago) and Shaimaa are due, not started. The shift is the one that was on when today's three began. Each of the five had a
-- session on their last pattern day (two days ago; three on a Saturday or a Sunday). The schedule is written through the pack's
-- door as the nurse; times relative to the load; ids in the pack's namespace; a reload erases these patients first (their slots with
-- them).
select demo.layer('haemodialysis');

-- the unit's chair named, when free, else its first free one (a patient the app started since keeps theirs)
create or replace function pg_temp.chair(p_key text) returns uuid language sql as $$
  select x.id from core.places x where x.organization_id = demo.base('clinic') and x.department_id = demo.id('haemodialysis', 'department') and x.retired_at is null
     and not exists (select 1 from base.presence p where p.organization_id = x.organization_id and p.place_id = x.id and p.kind = 'stay' and p.state = 'admitted')
   order by x.id = core.setup_id(demo.id('haemodialysis', 'department'), 'place', p_key) desc, x.position limit 1
$$;
create or replace function pg_temp.hd() returns jsonb language sql immutable as $$
  select '{"text":"Haemodialysis","codings":[{"system":"local.procedure","code":"haemodialysis","display":"Haemodialysis"}]}'::jsonb
$$;
-- the pack's door as the nurse
create or replace function pg_temp.plan(p_args jsonb) returns uuid language plpgsql as $$
begin
  perform demo.as(demo.id('haemodialysis', 'nurse'));
  return (public.pack_op(jsonb_build_object('op', 'haemodialysis.plan', 'department_id', demo.id('haemodialysis', 'department'), 'args', p_args)) ->> 'id')::uuid;
end $$;
-- a session done on p_on, begun at p_start, four hours: admitted into its chair, the session begun and the start's vitals, then the
-- session completed, the end's vitals and the base's discharge, one set (as the nurse would sign it, here at once)
create or replace function pg_temp.past(p_on date, p_start timestamptz, p_key text, p_shift int, p_slot uuid, p_pre jsonb, p_post jsonb) returns void language plpgsql as $$
declare hd uuid := demo.id('haemodialysis', 'department'); s uuid := gen_random_uuid(); h uuid := gen_random_uuid(); ends timestamptz := p_start + interval '4 hours';
  d jsonb := jsonb_build_object('on', p_on, 'shift', p_shift, 'chair', core.setup_id(hd, 'place', p_key), 'slot', p_slot, 'hours', 4);
begin
  perform demo.w(demo.id('haemodialysis', 'nurse'), jsonb_build_array(
    demo.e('admitted', hd, s, p_start, jsonb_build_object('department_id', hd, 'admit_source', 'outp', 'place_id', pg_temp.chair(p_key), 'reason', 'Haemodialysis'), s),
    demo.e('haemodialysis.session', hd, s, p_start, jsonb_build_object('concept', pg_temp.hd(), 'status', 'in-progress',
      'performed', jsonb_build_object('value', p_start, 'precision', 'minute'), 'haemodialysis', d), h),
    demo.e('vitals', hd, s, p_start, p_pre),
    demo.e('haemodialysis.session', hd, s, ends, jsonb_build_object('concept', pg_temp.hd(), 'status', 'completed',
      'performed', jsonb_build_object('value', p_start, 'precision', 'minute'), 'haemodialysis', d || jsonb_build_object('ended', ends)), null, h, 'changes'),
    demo.e('vitals', hd, s, ends, p_post),
    demo.move('discharged', hd, s, ends, s, '{"disposition":"home"}')));
end $$;
-- a session begun p_min minutes ago: admitted into its chair, the session begun and the start's vitals, one set; returns the stay
create or replace function pg_temp.start(p_min int, p_key text, p_shift int, p_slot uuid, p_pre jsonb) returns uuid language plpgsql as $$
declare hd uuid := demo.id('haemodialysis', 'department'); s uuid := gen_random_uuid(); v_at timestamptz := demo.ago(p_min);
begin
  perform demo.w(demo.id('haemodialysis', 'nurse'), jsonb_build_array(
    demo.e('admitted', hd, s, v_at, jsonb_build_object('department_id', hd, 'admit_source', 'outp', 'place_id', pg_temp.chair(p_key), 'reason', 'Haemodialysis'), s),
    demo.e('haemodialysis.session', hd, s, v_at, jsonb_build_object('concept', pg_temp.hd(), 'status', 'in-progress',
      'performed', jsonb_build_object('value', v_at, 'precision', 'minute'), 'haemodialysis', jsonb_build_object('on', (demo.now() at time zone 'Africa/Cairo')::date,
        'shift', p_shift, 'chair', core.setup_id(hd, 'place', p_key), 'slot', p_slot, 'hours', 4))),
    demo.e('vitals', hd, s, v_at, p_pre)));
  return s;
end $$;

do $$
declare hd uuid := demo.id('haemodialysis', 'department'); nurse uuid := demo.id('haemodialysis', 'nurse'); doctor uuid := demo.id('haemodialysis', 'doctor');
  today date := (demo.now() at time zone 'Africa/Cairo')::date; dow int := extract(dow from (demo.now() at time zone 'Africa/Cairo')::date)::int;
  days text := case when dow in (0, 2, 4) then 'sun_tue_thu' else 'sat_mon_wed' end;
  other text := case when dow in (0, 2, 4) then 'sat_mon_wed' else 'sun_tue_thu' end;
  -- the shift on when today's first session began (Nadia's, demo.ago(160)): every start of today's three falls in it, never before it
  -- (a load before 09:40 Cairo begins them before 07:00 and still says shift 1)
  clock time := (demo.ago(160) at time zone 'Africa/Cairo')::time;
  shift int := case when clock < time '11:30' then 1 when clock < time '16:00' then 2 else 3 end;
  -- the last pattern day before today: two days back, three on a Saturday or a Sunday (two back would be a Thursday or a Friday, off the
  -- pattern); on a Friday, two back is the Wednesday of the sat_mon_wed pattern the five are moved from
  back int := case when dow in (6, 0) then 3 else 2 end;
  past date := today - back;
  begins timestamptz := demo.midnight() - make_interval(days => back) + ((array[time '07:10', time '11:40', time '16:10'])[shift] - time '00:00');
  since date := today - 120;
  -- the day Hassan missed: a week ago, on his own pattern's day (on a Friday, a week ago is a Friday, in neither pattern: the Saturday
  -- six days back)
  missed date := today - case when dow = 5 then 6 else 7 end;
  said uuid; nadia uuid; mohamed uuid; hassan uuid; shaimaa uuid;
begin
  -- 1. the six patients, each with their own entries right after them (demo.e writes for the current patient)
  -- Said, 56: Sat/Mon/Wed or Sun/Tue/Thu in Chair 1; on dialysis since 150 minutes ago
  perform demo.patient(demo.id('haemodialysis', 'patient:said'), array['Said', 'Ahmed'], 'Abdelaziz', 'male', demo.born(56, 120), '+201006612345');
  said := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:said'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_1'), 'starts_on', since));
  -- Nadia, 63: Chair 2; on dialysis since 160 minutes ago
  perform demo.patient(demo.id('haemodialysis', 'patient:nadia'), array['Nadia', 'Mahmoud'], 'Sobhy', 'female', demo.born(63, 45), '+201114429087');
  nadia := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:nadia'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_2'), 'starts_on', since));
  -- Mohamed, 52: HCV, in the HCV chair; on dialysis since 140 minutes ago
  perform demo.patient(demo.id('haemodialysis', 'patient:mohamed'), array['Mohamed', 'Ali'], 'Rady', 'male', demo.born(52, 200), '+201227731456');
  perform demo.w(doctor, jsonb_build_array(demo.e('alert', hd, null, demo.ago(216000), jsonb_build_object('concept', demo.concept('local.alert', 'isolation_hcv', 'Isolation · HCV'),
    'status', 'active'))));
  mohamed := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:mohamed'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'hcv_chair_7'), 'starts_on', since));
  -- Hassan, 66: Chair 4; due, not started (he missed a session a week ago)
  perform demo.patient(demo.id('haemodialysis', 'patient:hassan'), array['Hassan', 'Fathy'], 'Morsy', 'male', demo.born(66, 15), '+201008874213');
  hassan := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:hassan'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_4'), 'starts_on', since));
  -- Shaimaa, 38: Chair 6; due, not started
  perform demo.patient(demo.id('haemodialysis', 'patient:shaimaa'), array['Shaimaa', 'Adel'], 'Lotfy', 'female', demo.born(38, 300), '+201550913377');
  shaimaa := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:shaimaa'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_6'), 'starts_on', since));
  -- Magdy, 59: HBV, in the HBV chair on the other days, shift 2
  perform demo.patient(demo.id('haemodialysis', 'patient:magdy'), array['Magdy', 'Samir'], 'Fahmy', 'male', demo.born(59, 75), '+201016648820');
  perform demo.w(doctor, jsonb_build_array(demo.e('alert', hd, null, demo.ago(216000), jsonb_build_object('concept', demo.concept('local.alert', 'isolation_hbv', 'Isolation · HBV'),
    'status', 'active'))));
  perform pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:magdy'), 'days', other, 'shift', 2,
    'place_id', core.setup_id(hd, 'place', 'hbv_chair_8'), 'starts_on', since));

  -- 2. on a Friday (in neither pattern), each of the five comes a day early: tomorrow's (a Saturday's) session moved one-off to today
  if dow = 5 then
    perform pg_temp.plan(jsonb_build_object('do', 'move', 'slot_id', x.slot, 'patient_id', x.patient, 'from_on', today + 1, 'to_on', today, 'shift', shift,
        'place_id', core.setup_id(hd, 'place', x.chair), 'reason', 'This week only: a day early'))
      from (values (said, demo.id('haemodialysis', 'patient:said'), 'chair_1'), (nadia, demo.id('haemodialysis', 'patient:nadia'), 'chair_2'),
                   (mohamed, demo.id('haemodialysis', 'patient:mohamed'), 'hcv_chair_7'), (hassan, demo.id('haemodialysis', 'patient:hassan'), 'chair_4'),
                   (shaimaa, demo.id('haemodialysis', 'patient:shaimaa'), 'chair_6')) x(slot, patient, chair);
  end if;

  -- 3. each of the five: a session done on their last pattern day, four hours from ten minutes into the shift
  perform demo.use(demo.id('haemodialysis', 'patient:said'));
  perform pg_temp.past(past, begins, 'chair_1', shift, said, demo.vitals(150, 86, 80, 36.7, null, null, 74.6), demo.vitals(128, 78, 84, 36.6, null, null, 72.4));
  perform demo.use(demo.id('haemodialysis', 'patient:nadia'));
  perform pg_temp.past(past, begins, 'chair_2', shift, nadia, demo.vitals(138, 80, 88, 36.9, null, null, 58.0), demo.vitals(112, 70, 90, 36.7, null, null, 56.3));
  perform demo.use(demo.id('haemodialysis', 'patient:mohamed'));
  perform pg_temp.past(past, begins, 'hcv_chair_7', shift, mohamed, demo.vitals(160, 92, 76, 36.6, null, null, 81.0), demo.vitals(140, 84, 78, 36.5, null, null, 78.6));
  perform demo.use(demo.id('haemodialysis', 'patient:hassan'));
  perform pg_temp.past(past, begins, 'chair_4', shift, hassan, demo.vitals(148, 88, 74, 36.8, null, null, 69.2), demo.vitals(130, 80, 76, 36.6, null, null, 67.0));
  perform demo.use(demo.id('haemodialysis', 'patient:shaimaa'));
  perform pg_temp.past(past, begins, 'chair_6', shift, shaimaa, demo.vitals(124, 76, 92, 36.9, null, null, 60.4), demo.vitals(108, 68, 96, 36.7, null, null, 58.6));

  -- 4. Hassan's session a week ago, missed: he did not come (no stay)
  perform demo.use(demo.id('haemodialysis', 'patient:hassan'));
  perform demo.w(nurse, jsonb_build_array(demo.e('haemodialysis.session', hd, null, demo.midnight() - make_interval(days => today - missed) + interval '13 hours',
    jsonb_build_object('concept', pg_temp.hd(), 'status', 'not-done', 'performed', jsonb_build_object('value', missed, 'precision', 'day'), 'reason', 'Did not come',
      'haemodialysis', jsonb_build_object('on', missed, 'shift', shift, 'chair', core.setup_id(hd, 'place', 'chair_4'), 'slot', hassan, 'hours', 4, 'missed', 'not_came')))));

  -- 5. today's three, begun: each admitted into their chair with the session begun and the blood pressure at the start
  perform demo.use(demo.id('haemodialysis', 'patient:said'));
  perform pg_temp.start(150, 'chair_1', shift, said, demo.vitals(146, 84, 82, 36.8, null, null, 74.9));
  perform demo.use(demo.id('haemodialysis', 'patient:nadia'));
  perform pg_temp.start(160, 'chair_2', shift, nadia, demo.vitals(142, 82, 86, 36.8, null, null, 58.6));
  perform demo.use(demo.id('haemodialysis', 'patient:mohamed'));
  perform pg_temp.start(140, 'hcv_chair_7', shift, mohamed, demo.vitals(158, 90, 78, 36.7, null, null, 81.3));
end $$;
