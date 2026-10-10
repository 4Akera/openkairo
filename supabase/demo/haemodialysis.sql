-- Dialysis's day (spec/openCare.md §5.6): six of the pack's own patients in the Dialysis unit. Five come on today's days (Sat/Mon/Wed or
-- Sun/Tue/Thu, whichever today is; on a Friday, Saturday's, each moved one-off a day early) at the shift on now; Magdy comes on the
-- other days, in the HBV chair. Said, Nadia and Mohamed (HCV, in the HCV chair) are on dialysis, each started by Rasha Mounir as the
-- base's admitted into the chair with the session begun and the blood pressure at the start, in one set; Hassan (who missed a session
-- a week ago) and Shaimaa are due, not started. The shift is the one that was on when today's three began. Each of the five had a
-- session on their last pattern day (two days ago; three on a Saturday or a Sunday). The schedule is written through the pack's
-- door as the nurse; times relative to the load; ids in the pack's namespace; a reload erases these patients first (their slots with
-- them). D2: each of the six has a standing prescription by Dr. Walid Hamza (a month ago, before the slots: it sets the due rows'
-- hours, Shaimaa's 3.5); each past session ended with its prescription, the fluid to take off and taken off, the access and the
-- needles; today's three had Before five minutes in (the prescription copied, the fluid to take off, the access) and a machine reading
-- every 30 minutes from ten minutes in (Nadia's last, 20 minutes before the load, with her event: low BP and cramps, saline 200 mL);
-- Said's Epoetin alfa (IV, twice a week) given today.
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
-- a standing prescription's data (heparin none when no bolus)
create or replace function pg_temp.rx(p_hours numeric, p_bf int, p_k numeric, p_ca numeric, p_hco3 numeric, p_bolus int, p_rate int, p_dry numeric, p_kind text,
  p_site text, p_dialyser text) returns jsonb language sql immutable as $$
  select jsonb_build_object('hours', p_hours, 'blood_flow', demo.q(p_bf, 'mL/min', 'mL/min'), 'dialysate_flow', demo.q(500, 'mL/min', 'mL/min'), 'dialyser', p_dialyser,
    'bath', jsonb_build_object('k', p_k, 'ca', p_ca, 'hco3', p_hco3),
    'heparin', case when p_bolus is null then '{"none":true}'::jsonb
      else jsonb_build_object('bolus', demo.q(p_bolus, 'units', '[iU]'), 'rate', jsonb_build_object('value', p_rate::text, 'unit', 'units/h')) end,
    'dry_weight', jsonb_build_object('value', to_char(p_dry, 'FM990.0'), 'unit', 'kg', 'ucum', 'kg'), 'access', jsonb_build_object('kind', p_kind, 'site', p_site))
$$;
-- the patient's standing prescription, by the unit's doctor, a month ago, in the unit (no visit)
create or replace function pg_temp.prescribe(p_rx jsonb) returns void language sql as $$
  select demo.w(demo.id('haemodialysis', 'doctor'), jsonb_build_array(demo.e('haemodialysis.prescription', demo.id('haemodialysis', 'department'), null, demo.ago(43200), p_rx)));
$$;
-- the fluid to take off: (the weight before − the dry weight) × 1000 + 300 given back − 400 left above dry, to 100 mL, never under 0
create or replace function pg_temp.target(p_pre numeric, p_rx jsonb) returns jsonb language sql immutable as $$
  select demo.q(greatest(0, round(((p_pre - (p_rx -> 'dry_weight' ->> 'value')::numeric) * 1000 + 300 - 400) / 100) * 100), 'mL', 'mL')
$$;
-- what Before adds to the session: the prescription copied, the fluid to take off, the access (fine)
create or replace function pg_temp.before(p_pre jsonb, p_rx jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('prescription', p_rx, 'target', pg_temp.target((p_pre -> 'weight' ->> 'value')::numeric, p_rx),
    'access', jsonb_build_object('kind', p_rx -> 'access' ->> 'kind', 'site', p_rx -> 'access' ->> 'site', 'ok', true))
$$;
-- the pack's door as the nurse
create or replace function pg_temp.plan(p_args jsonb) returns uuid language plpgsql as $$
begin
  perform demo.as(demo.id('haemodialysis', 'nurse'));
  return (public.pack_op(jsonb_build_object('op', 'haemodialysis.plan', 'department_id', demo.id('haemodialysis', 'department'), 'args', p_args)) ->> 'id')::uuid;
end $$;
-- a session done on p_on, begun at p_start, for the prescription's hours: admitted into its chair, the session begun and the start's
-- vitals, one set; then the session completed (with Before's words, the fluid taken off: the weight lost and the 300 mL given back,
-- the needles), the end's vitals and the base's discharge, a second set (as the nurse would sign them)
create or replace function pg_temp.past(p_on date, p_start timestamptz, p_key text, p_shift int, p_slot uuid, p_pre jsonb, p_post jsonb, p_rx jsonb) returns void language plpgsql as $$
declare hd uuid := demo.id('haemodialysis', 'department'); s uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  ends timestamptz := p_start + make_interval(mins => ((p_rx ->> 'hours')::numeric * 60)::int);
  d jsonb := jsonb_build_object('on', p_on, 'shift', p_shift, 'chair', core.setup_id(hd, 'place', p_key), 'slot', p_slot, 'hours', (p_rx ->> 'hours')::numeric);
begin
  perform demo.w(demo.id('haemodialysis', 'nurse'), jsonb_build_array(
    demo.e('admitted', hd, s, p_start, jsonb_build_object('department_id', hd, 'admit_source', 'outp', 'place_id', pg_temp.chair(p_key), 'reason', 'Haemodialysis'), s),
    demo.e('haemodialysis.session', hd, s, p_start, jsonb_build_object('concept', pg_temp.hd(), 'status', 'in-progress',
      'performed', jsonb_build_object('value', p_start, 'precision', 'minute'), 'haemodialysis', d), h),
    demo.e('vitals', hd, s, p_start, p_pre)));
  -- the end in a set of its own: one set that both opens and discharges a stay reads as a stay passed on (the base's E1, Q3)
  perform demo.w(demo.id('haemodialysis', 'nurse'), jsonb_build_array(
    demo.e('haemodialysis.session', hd, s, ends, jsonb_build_object('concept', pg_temp.hd(), 'status', 'completed',
      'performed', jsonb_build_object('value', p_start, 'precision', 'minute'), 'haemodialysis', d || pg_temp.before(p_pre, p_rx) || jsonb_build_object('ended', ends,
        'removed', demo.q(round(((p_pre -> 'weight' ->> 'value')::numeric - (p_post -> 'weight' ->> 'value')::numeric) * 1000 + 300), 'mL', 'mL'),
        'needles', 'Dry, no bleeding')), null, h, 'changes'),
    demo.e('vitals', hd, s, ends, p_post),
    demo.move('discharged', hd, s, ends, s, '{"disposition":"home"}')));
end $$;
-- a session begun p_min minutes ago: admitted into its chair, the session begun and the start's vitals, one set; then Before five
-- minutes in (the session changed: the prescription copied, the fluid to take off, the access); returns the stay
create or replace function pg_temp.start(p_min int, p_key text, p_shift int, p_slot uuid, p_pre jsonb, p_rx jsonb) returns uuid language plpgsql as $$
declare hd uuid := demo.id('haemodialysis', 'department'); s uuid := gen_random_uuid(); h uuid := gen_random_uuid(); v_at timestamptz := demo.ago(p_min);
  d jsonb := jsonb_build_object('concept', pg_temp.hd(), 'status', 'in-progress', 'performed', jsonb_build_object('value', v_at, 'precision', 'minute'),
    'haemodialysis', jsonb_build_object('on', (demo.now() at time zone 'Africa/Cairo')::date, 'shift', p_shift, 'chair', core.setup_id(hd, 'place', p_key), 'slot', p_slot, 'hours', 4));
begin
  perform demo.w(demo.id('haemodialysis', 'nurse'), jsonb_build_array(
    demo.e('admitted', hd, s, v_at, jsonb_build_object('department_id', hd, 'admit_source', 'outp', 'place_id', pg_temp.chair(p_key), 'reason', 'Haemodialysis'), s),
    demo.e('haemodialysis.session', hd, s, v_at, d, h),
    demo.e('vitals', hd, s, v_at, p_pre)));
  perform demo.w(demo.id('haemodialysis', 'nurse'), jsonb_build_array(demo.e('haemodialysis.session', hd, s, demo.after(v_at, 5),
    jsonb_set(d, '{haemodialysis}', (d -> 'haemodialysis') || pg_temp.before(p_pre, p_rx)), null, h, 'changes')));
  return s;
end $$;
-- a machine reading in the stay at p_at, by whoever writes it (heparin left out when none)
create or replace function pg_temp.reading(p_stay uuid, p_at timestamptz, p_sys int, p_dia int, p_hr int, p_bf int, p_ap int, p_vp int, p_tmp int, p_uf int,
  p_heparin int default null) returns jsonb language sql as $$
  select demo.e('haemodialysis.reading', demo.id('haemodialysis', 'department'), p_stay, p_at, jsonb_build_object(
    'bp', jsonb_build_object('sys', demo.q(p_sys, 'mmHg', 'mm[Hg]'), 'dia', demo.q(p_dia, 'mmHg', 'mm[Hg]')), 'hr', demo.q(p_hr, 'bpm', '/min'),
    'haemodialysis', jsonb_strip_nulls(jsonb_build_object('blood_flow', demo.q(p_bf, 'mL/min', 'mL/min'), 'arterial', demo.q(p_ap, 'mmHg', 'mm[Hg]'),
      'venous', demo.q(p_vp, 'mmHg', 'mm[Hg]'), 'tmp', demo.q(p_tmp, 'mmHg', 'mm[Hg]'), 'uf', demo.q(p_uf, 'mL', 'mL'),
      'heparin', case when p_heparin is not null then jsonb_build_object('value', p_heparin::text, 'unit', 'units/h') end))))
$$;
-- the stay's start (its admission's time)
create or replace function pg_temp.began(p_stay uuid) returns timestamptz language sql stable as $$
  select checked_in_at from base.presence where item = p_stay
$$;

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
  -- the six standing prescriptions (D2)
  rx_said jsonb := pg_temp.rx(4, 300, 2, 1.5, 32, 2000, 1000, 72.0, 'fistula', 'left forearm', 'FX80');
  rx_nadia jsonb := pg_temp.rx(4, 250, 2, 1.5, 32, null, null, 56.0, 'catheter', 'right internal jugular, tunnelled', 'FX60');
  rx_mohamed jsonb := pg_temp.rx(4, 300, 3, 1.25, 32, 1500, 750, 78.5, 'graft', 'left upper arm', 'FX80');
  rx_hassan jsonb := pg_temp.rx(4, 300, 2, 1.5, 32, 2000, 1000, 66.5, 'fistula', 'right forearm', 'FX80');
  rx_shaimaa jsonb := pg_temp.rx(3.5, 300, 2, 1.5, 32, 1500, 750, 58.0, 'fistula', 'left forearm', 'FX60');
  rx_magdy jsonb := pg_temp.rx(4, 300, 2, 1.5, 32, 2000, 1000, 70.0, 'fistula', 'left forearm', 'FX80');
  s_said uuid; s_nadia uuid; s_mohamed uuid; v_at timestamptz; epo uuid := gen_random_uuid();
  epo_data jsonb := jsonb_build_object('basis', 'prescribed', 'drug', demo.concept('atc', 'B03XA01', 'Epoetin alfa'),
    'dosage', jsonb_build_object('dose', demo.q(4000, 'IU', '[iU]'), 'timing', jsonb_build_object('frequency', 2, 'period', 1, 'period_unit', 'wk', 'text', 'twice a week, with dialysis'),
      'route', 'iv'), 'status', 'active');
begin
  -- 1. the six patients, each with their own entries right after them (demo.e writes for the current patient)
  -- Said, 56: Sat/Mon/Wed or Sun/Tue/Thu in Chair 1; on dialysis since 150 minutes ago
  perform demo.patient(demo.id('haemodialysis', 'patient:said'), array['Said', 'Ahmed'], 'Abdelaziz', 'male', demo.born(56, 120), '+201006612345');
  perform pg_temp.prescribe(rx_said);
  said := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:said'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_1'), 'starts_on', since));
  -- Nadia, 63: Chair 2; on dialysis since 160 minutes ago
  perform demo.patient(demo.id('haemodialysis', 'patient:nadia'), array['Nadia', 'Mahmoud'], 'Sobhy', 'female', demo.born(63, 45), '+201114429087');
  perform pg_temp.prescribe(rx_nadia);
  nadia := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:nadia'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_2'), 'starts_on', since));
  -- Mohamed, 52: HCV, in the HCV chair; on dialysis since 140 minutes ago
  perform demo.patient(demo.id('haemodialysis', 'patient:mohamed'), array['Mohamed', 'Ali'], 'Rady', 'male', demo.born(52, 200), '+201227731456');
  perform demo.w(doctor, jsonb_build_array(demo.e('alert', hd, null, demo.ago(216000), jsonb_build_object('concept', demo.concept('local.alert', 'isolation_hcv', 'Isolation · HCV'),
    'status', 'active'))));
  perform pg_temp.prescribe(rx_mohamed);
  mohamed := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:mohamed'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'hcv_chair_7'), 'starts_on', since));
  -- Hassan, 66: Chair 4; due, not started (he missed a session a week ago)
  perform demo.patient(demo.id('haemodialysis', 'patient:hassan'), array['Hassan', 'Fathy'], 'Morsy', 'male', demo.born(66, 15), '+201008874213');
  perform pg_temp.prescribe(rx_hassan);
  hassan := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:hassan'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_4'), 'starts_on', since));
  -- Shaimaa, 38: Chair 6; due, not started
  perform demo.patient(demo.id('haemodialysis', 'patient:shaimaa'), array['Shaimaa', 'Adel'], 'Lotfy', 'female', demo.born(38, 300), '+201550913377');
  perform pg_temp.prescribe(rx_shaimaa);
  shaimaa := pg_temp.plan(jsonb_build_object('do', 'add', 'patient_id', demo.id('haemodialysis', 'patient:shaimaa'), 'days', days, 'shift', shift,
    'place_id', core.setup_id(hd, 'place', 'chair_6'), 'starts_on', since));
  -- Magdy, 59: HBV, in the HBV chair on the other days, shift 2
  perform demo.patient(demo.id('haemodialysis', 'patient:magdy'), array['Magdy', 'Samir'], 'Fahmy', 'male', demo.born(59, 75), '+201016648820');
  perform demo.w(doctor, jsonb_build_array(demo.e('alert', hd, null, demo.ago(216000), jsonb_build_object('concept', demo.concept('local.alert', 'isolation_hbv', 'Isolation · HBV'),
    'status', 'active'))));
  perform pg_temp.prescribe(rx_magdy);
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

  -- 3. each of the five: a session done on their last pattern day, from ten minutes into the shift, for their prescription's hours
  perform demo.use(demo.id('haemodialysis', 'patient:said'));
  perform pg_temp.past(past, begins, 'chair_1', shift, said, demo.vitals(150, 86, 80, 36.7, null, null, 74.6), demo.vitals(128, 78, 84, 36.6, null, null, 72.4), rx_said);
  perform demo.use(demo.id('haemodialysis', 'patient:nadia'));
  perform pg_temp.past(past, begins, 'chair_2', shift, nadia, demo.vitals(138, 80, 88, 36.9, null, null, 58.0), demo.vitals(112, 70, 90, 36.7, null, null, 56.3), rx_nadia);
  perform demo.use(demo.id('haemodialysis', 'patient:mohamed'));
  perform pg_temp.past(past, begins, 'hcv_chair_7', shift, mohamed, demo.vitals(160, 92, 76, 36.6, null, null, 81.0), demo.vitals(140, 84, 78, 36.5, null, null, 78.6), rx_mohamed);
  perform demo.use(demo.id('haemodialysis', 'patient:hassan'));
  perform pg_temp.past(past, begins, 'chair_4', shift, hassan, demo.vitals(148, 88, 74, 36.8, null, null, 69.2), demo.vitals(130, 80, 76, 36.6, null, null, 67.0), rx_hassan);
  perform demo.use(demo.id('haemodialysis', 'patient:shaimaa'));
  perform pg_temp.past(past, begins, 'chair_6', shift, shaimaa, demo.vitals(124, 76, 92, 36.9, null, null, 60.4), demo.vitals(108, 68, 96, 36.7, null, null, 58.6), rx_shaimaa);

  -- 4. Hassan's session a week ago, missed: he did not come (no stay)
  perform demo.use(demo.id('haemodialysis', 'patient:hassan'));
  perform demo.w(nurse, jsonb_build_array(demo.e('haemodialysis.session', hd, null, demo.midnight() - make_interval(days => today - missed) + interval '13 hours',
    jsonb_build_object('concept', pg_temp.hd(), 'status', 'not-done', 'performed', jsonb_build_object('value', missed, 'precision', 'day'), 'reason', 'Did not come',
      'haemodialysis', jsonb_build_object('on', missed, 'shift', shift, 'chair', core.setup_id(hd, 'place', 'chair_4'), 'slot', hassan, 'hours', 4, 'missed', 'not_came')))));

  -- 5. today's three, begun: each admitted into their chair with the session begun and the blood pressure at the start; Before five
  -- minutes in (Said 2.8 L to take off, Nadia 2.5, Mohamed 2.7)
  perform demo.use(demo.id('haemodialysis', 'patient:said'));
  s_said := pg_temp.start(150, 'chair_1', shift, said, demo.vitals(146, 84, 82, 36.8, null, null, 74.9), rx_said);
  perform demo.use(demo.id('haemodialysis', 'patient:nadia'));
  s_nadia := pg_temp.start(160, 'chair_2', shift, nadia, demo.vitals(142, 82, 86, 36.8, null, null, 58.6), rx_nadia);
  perform demo.use(demo.id('haemodialysis', 'patient:mohamed'));
  s_mohamed := pg_temp.start(140, 'hcv_chair_7', shift, mohamed, demo.vitals(158, 90, 78, 36.7, null, null, 81.3), rx_mohamed);

  -- 6. the machine readings, by Rasha, every 30 minutes from ten minutes in
  perform demo.use(demo.id('haemodialysis', 'patient:said'));
  v_at := pg_temp.began(s_said);
  perform demo.w(nurse, jsonb_build_array(r)) from (values
    (pg_temp.reading(s_said, demo.after(v_at, 10), 146, 84, 82, 300, -180, 140, 60, 0, 1000)),
    (pg_temp.reading(s_said, demo.after(v_at, 40), 138, 80, 80, 300, -190, 150, 70, 400, 1000)),
    (pg_temp.reading(s_said, demo.after(v_at, 70), 128, 76, 84, 300, -190, 150, 80, 900, 1000)),
    (pg_temp.reading(s_said, demo.after(v_at, 100), 120, 74, 86, 300, -190, 150, 70, 1200, 1000)),
    (pg_temp.reading(s_said, demo.after(v_at, 130), 112, 70, 88, 300, -190, 150, 70, 1400, 1000))) x(r);
  -- Said's Epoetin alfa (IV, twice a week, with dialysis): Dr. Walid's a month ago, given today twenty minutes in
  perform demo.w(doctor, jsonb_build_array(demo.e('medication', hd, null, demo.ago(43200), epo_data, epo)));
  perform demo.w(nurse, jsonb_build_array(demo.e('given', hd, s_said, demo.after(v_at, 20), jsonb_build_object('medication', epo,
    'drug', epo_data -> 'drug', 'dose', epo_data -> 'dosage' -> 'dose', 'route', 'iv', 'status', 'completed'))));
  perform demo.use(demo.id('haemodialysis', 'patient:nadia'));
  v_at := pg_temp.began(s_nadia);
  perform demo.w(nurse, jsonb_build_array(r)) from (values
    (pg_temp.reading(s_nadia, demo.after(v_at, 10), 142, 82, 86, 250, -160, 130, 50, 0)),
    (pg_temp.reading(s_nadia, demo.after(v_at, 40), 130, 78, 88, 250, -170, 140, 60, 500)),
    (pg_temp.reading(s_nadia, demo.after(v_at, 70), 118, 72, 92, 250, -170, 140, 60, 900)),
    (pg_temp.reading(s_nadia, demo.after(v_at, 100), 108, 66, 96, 250, -170, 140, 60, 1100))) x(r);
  -- Nadia's event, twenty minutes before the load, one set: the reading, the note, the saline given
  perform demo.w(nurse, jsonb_build_array(
    pg_temp.reading(s_nadia, demo.after(v_at, 140), 88, 54, 104, 250, -150, 120, 40, 1100),
    demo.e('note', hd, s_nadia, demo.after(v_at, 140), jsonb_build_object('kind', 'dialysis_event', 'heading', 'Low BP · Cramps',
      'text', 'Saline 200 mL, taking off paused 10 min')),
    demo.e('given', hd, s_nadia, demo.after(v_at, 140), jsonb_build_object('drug', jsonb_build_object('text', 'Sodium chloride 0.9 %'),
      'dose', demo.q(200, 'mL', 'mL'), 'route', 'IV', 'status', 'completed'))));
  perform demo.use(demo.id('haemodialysis', 'patient:mohamed'));
  v_at := pg_temp.began(s_mohamed);
  perform demo.w(nurse, jsonb_build_array(r)) from (values
    (pg_temp.reading(s_mohamed, demo.after(v_at, 10), 158, 90, 78, 300, -190, 150, 70, 0, 750)),
    (pg_temp.reading(s_mohamed, demo.after(v_at, 40), 150, 88, 80, 300, -200, 160, 80, 500, 750)),
    (pg_temp.reading(s_mohamed, demo.after(v_at, 70), 144, 84, 80, 300, -200, 160, 80, 1000, 750)),
    (pg_temp.reading(s_mohamed, demo.after(v_at, 100), 140, 82, 82, 300, -200, 160, 80, 1400, 750))) x(r);
end $$;
