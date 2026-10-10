-- Ward nursing's day (spec/openCare.md §5.6): three of the pack's own patients on the Medical Ward. Each set of obs is the base's
-- vitals, ACVPU and air or oxygen among them, and NEWS2 (the base's score, bedside.news2 or, for a target of 88–92 %, bedside.news2_s2) in one set, by Nour Adel, the
-- ward's nurse, with the totals the server adds up. Samira (pneumonia, day 3) climbs from NEWS2 2 to 6, medium; Abdelmoneim (COPD,
-- type 2 respiratory failure, day 3) is on SpO₂ scale 2 and settles from 8 to 3; Tahany arrived 90 minutes ago, has no bed yet, and
-- her first obs (NEWS2 4, a 3 in systolic) are now overdue. Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
-- Only Samira takes a bed (7, else the next free): the Medical Ward's eight are shared with the base's three, the Blood bank's one,
-- the journey's one and, at demo.sql's third load, the app's two, while a reload still holds the last load's stays until each layer
-- erases its own; so Abdelmoneim waits on the ward with no bed yet, as Tahany does.
-- The drug round (piece 3): Dr. Ali Hassan's medicines in each stay, and Nour has given every dose since they came but two: Samira's
-- latest paracetamol is late, and Abdelmoneim's amoxicillin + clavulanic acid yesterday at 08:00 was not given (vomiting); Tahany's
-- ceftriaxone waits as her first dose and her insulin has no times.
select demo.layer('bedside');

-- one set of obs, as /v signs it on the ward: the vitals (ACVPU and air or oxygen, with the oxygen's device, flow and FiO₂ when given)
-- and NEWS2 at the same time, its two answers the vitals' own; NEWS2 on scale 2 when its saturation choice is given
create or replace function pg_temp.obs(p_stay uuid, p_at timestamptz, sys int, dia int, hr int, t numeric, spo2 int, rr int, p_air text, p_acvpu text, p_s2 text default null,
  p_device text default null, p_flow numeric default null, p_fio2 int default null)
returns void language sql as $$
  select demo.w(demo.id('bedside', 'nurse'), jsonb_build_array(
    demo.e('vitals', demo.base('ward'), p_stay, p_at, demo.vitals(sys, dia, hr, t, spo2, rr) || jsonb_build_object('consciousness', p_acvpu,
      'oxygen', jsonb_strip_nulls(jsonb_build_object('on', p_air, 'device', p_device, 'flow', case when p_flow is not null then demo.q(p_flow, 'L/min', 'L/min') end,
        'fio2', case when p_fio2 is not null then demo.q(p_fio2, '%', '%') end)))),
    demo.e('score', demo.base('ward'), p_stay, p_at, demo.score(case when p_s2 is null then 'bedside.news2' else 'bedside.news2_s2' end,
      jsonb_strip_nulls(jsonb_build_object('rr', rr::text, 'spo2', case when p_s2 is null then spo2::text end, 'spo2_s2', p_s2, 'oxygen', p_air,
        'sbp', sys::text, 'pulse', hr::text, 'consciousness', p_acvpu, 'temp', t::text))))));
$$;

-- a medication as /rx signs it: prescribed, its drug coded (ATC), its dose when one is given, its timing as the composer writes it, its
-- route; a p_more naming dosage replaces it whole
create or replace function pg_temp.rx(p_drug text, p_atc text, p_dose numeric, p_unit text, p_ucum text, p_timing text, p_route text, p_more jsonb default '{}')
returns jsonb language sql immutable as $$
  select jsonb_build_object('basis', 'prescribed', 'drug', demo.concept('atc', p_atc, p_drug),
    'dosage', jsonb_strip_nulls(jsonb_build_object('dose', case when p_dose is not null then demo.q(p_dose, p_unit, p_ucum) end,
      'timing', case p_timing when 'OD' then '{"code":"OD","frequency":1,"period":1,"period_unit":"d"}'::jsonb
        when 'BD' then '{"code":"BD","frequency":2,"period":1,"period_unit":"d"}'::jsonb
        when 'q6h' then '{"code":"q6h","frequency":1,"period":6,"period_unit":"h"}'::jsonb end, 'route', p_route)),
    'status', 'active') || p_more
$$;

-- one dose as the round writes it, by Nour: Ward nursing's dose naming the time it is for; not given, with its reason (vomiting)
create or replace function pg_temp.dose(p_stay uuid, p_med jsonb, p_slot jsonb, p_at timestamptz, p_why text default null)
returns void language sql as $$
  select demo.w(demo.id('bedside', 'nurse'), jsonb_build_array(demo.e('bedside.dose', demo.base('ward'), p_stay, p_at, jsonb_strip_nulls(jsonb_build_object(
    'medication', p_med ->> 'medication', 'drug', p_med -> 'drug', 'dose', case when p_why is null then p_med -> 'dose' end, 'route', p_med ->> 'route',
    'site', case when p_why is null and p_med ->> 'route' = 'sc' then 'abdomen' end, 'status', case when p_why is null then 'completed' else 'not-done' end,
    'reason', case when p_why is not null then 'Vomiting' end, 'bedside', jsonb_strip_nulls(jsonb_build_object('due', p_slot ->> 'due', 'not_given', p_why)))))));
$$;

-- the rounds so far, as Nour reads the stay's sheet through the pack's door (so the demo gives exactly the round's times, at any hour
-- it loads): every time late or missed given, and those due when p_give_due; but the latest late time of p_late is left late, and the
-- time p_not_at of p_not is written not given (vomiting). Each 5, 10 or 15 minutes after its time, never after the load
create or replace function pg_temp.round(p_stay uuid, p_give_due boolean, p_late uuid default null, p_not uuid default null, p_not_at timestamptz default null)
returns void language plpgsql as $$
declare r jsonb; m jsonb; x jsonb; v_skip timestamptz; k int := 0;
begin
  perform demo.as(demo.id('bedside', 'nurse'));
  r := public.pack_op(jsonb_build_object('op', 'bedside.sheet', 'department_id', demo.base('ward'), 'purpose', 'TREAT',
    'args', jsonb_build_object('stay', p_stay, 'day', 'stay', 'now', demo.now())));
  perform demo.use((r -> 'patient_ids' ->> 0)::uuid);
  for m in select y from jsonb_array_elements(r -> 'medicines') y loop
    v_skip := case when (m ->> 'medication')::uuid = p_late then
      (select max((z ->> 'due')::timestamptz) from jsonb_array_elements(m -> 'slots') z where z ->> 'state' = 'late') end;
    for x in select z from jsonb_array_elements(m -> 'slots') z order by (z ->> 'due')::timestamptz loop
      continue when not (x ->> 'state' in ('late', 'missed') or (p_give_due and x ->> 'state' = 'due'));
      continue when (x ->> 'due')::timestamptz = v_skip;
      k := k + 1;
      perform pg_temp.dose(p_stay, m, x, least((x ->> 'due')::timestamptz + (5 + 5 * (k % 3)) * interval '1 minute', demo.now() - interval '1 minute'),
        case when (m ->> 'medication')::uuid = p_not and (x ->> 'due')::timestamptz = p_not_at then 'vomiting' end);
    end loop;
  end loop;
end $$;

do $$
declare ward uuid := demo.base('ward'); doctor uuid := demo.base('doctor'); d2 timestamptz := demo.midnight() - interval '2 days';
  d1 timestamptz := demo.midnight() - interval '1 day'; s uuid; ss uuid; sa uuid; st uuid;
begin
  -- Samira, 63: community-acquired pneumonia, day 3; on air and alert, her NEWS2 2, 2, 3, 4, then 6 (medium) 50 minutes ago
  perform demo.patient(demo.id('bedside', 'patient:samira'), array['Samira', 'Fawzy'], 'Abdelaal', 'female', demo.born(63, 140), '+201006645512');
  s := gen_random_uuid(); ss := s;
  perform demo.w_bed(doctor, jsonb_build_array(demo.e('admitted', ward, s, d2 + interval '10 hours', jsonb_build_object('department_id', ward,
    'admit_source', 'emd', 'reason', 'community-acquired pneumonia'), s)), 7);
  perform demo.w(doctor, jsonb_build_array(demo.e('note', ward, s, d2 + interval '10 hours 20 minutes', demo.note('history_physical',
    E'hx: cough and fever for five days, breathless since yesterday\nex: crackles at the right base; alert\nplan: IV antibiotics, fluids, obs with NEWS2'))));
  perform pg_temp.obs(s, d2 + interval '10 hours 30 minutes', 128, 78, 96, 38.0, 95, 20, 'air', 'a');   -- 2
  perform pg_temp.obs(s, d1 + interval '8 hours', 124, 76, 92, 37.6, 95, 18, 'air', 'a');               -- 2
  perform pg_temp.obs(s, d1 + interval '20 hours', 118, 72, 98, 38.2, 94, 20, 'air', 'a');              -- 3
  perform pg_temp.obs(s, demo.ago(240), 108, 68, 100, 38.1, 94, 20, 'air', 'a');                        -- 4
  perform pg_temp.obs(s, demo.ago(50), 105, 68, 104, 38.4, 94, 22, 'air', 'a');                         -- 6, medium

  -- Abdelmoneim, 72: COPD exacerbation with type 2 respiratory failure, day 3; his doctor set a target of 88–92 %, so NEWS2 is on
  -- SpO₂ scale 2; on oxygen and alert, 8 (high) on arrival, then 5, 3 and 3 (on scale 1 the last would read 6): a Venturi mask at
  -- 4 L/min (28 %), down to 2 L/min (24 %), then nasal cannula at 1 L/min
  perform demo.patient(demo.id('bedside', 'patient:abdelmoneim'), array['Abdelmoneim', 'Hassan'], 'Shahin', 'male', demo.born(72, 30), '+201227760394');
  s := gen_random_uuid(); sa := s;
  -- on the ward with no bed yet (the ward's beds are full at demo.sql's third load: see the top)
  perform demo.w(doctor, jsonb_build_array(demo.e('admitted', ward, s, d2 + interval '21 hours', jsonb_build_object('department_id', ward,
    'admit_source', 'emd', 'reason', 'COPD exacerbation, type 2 respiratory failure'), s)));
  perform demo.w(doctor, jsonb_build_array(demo.e('note', ward, s, d2 + interval '21 hours 15 minutes', demo.note('history_physical',
    E'hx: COPD, oxygen at home at night, worse for three days\nex: wheeze both sides; alert; blood gas pCO₂ 58 mmHg\nplan: nebulisers, steroids, controlled oxygen: target SpO₂ 88–92 % (NEWS2 on SpO₂ scale 2)'))));
  perform pg_temp.obs(s, d2 + interval '21 hours 30 minutes', 146, 88, 112, 37.8, 86, 26, 'oxygen', 'a', '86_87', 'venturi_mask', 4, 28);   -- 8, high
  perform pg_temp.obs(s, d1 + interval '6 hours', 138, 84, 104, 37.4, 88, 22, 'oxygen', 'a', '88_92', 'venturi_mask', 4, 28);     -- 5
  perform pg_temp.obs(s, d1 + interval '18 hours', 134, 80, 98, 37.2, 90, 20, 'oxygen', 'a', '88_92', 'venturi_mask', 2, 24);     -- 3
  perform pg_temp.obs(s, demo.ago(120), 132, 80, 96, 37.1, 91, 20, 'oxygen', 'a', '88_92', 'nasal_cannula', 1);                  -- 3

  -- Tahany, 58: just arrived with pyelonephritis, no bed yet; her first obs 80 minutes ago
  perform demo.patient(demo.id('bedside', 'patient:tahany'), array['Tahany', 'Ibrahim'], 'Gaafar', 'female', demo.born(58, 200), '+201114428863');
  s := gen_random_uuid(); st := s;
  perform demo.w(doctor, jsonb_build_array(demo.e('admitted', ward, s, demo.ago(90), jsonb_build_object('department_id', ward,
    'admit_source', 'emd', 'reason', 'pyelonephritis; diabetes'), s)));
  -- her first obs, ten minutes after she arrived: NEWS2 4, low, but a 3 in one sign (systolic 88), so RCP 2017 asks for hourly obs and
  -- the doctor caring for her to be told; nobody has repeated them, so the board and Obs due say "obs overdue 20 min" (W1)
  perform pg_temp.obs(st, demo.ago(80), 88, 54, 98, 38.0, 96, 18, 'air', 'a');   -- 4, low; 3 in sbp

  -- their medicines, by Dr. Ali Hassan, one set each, written in the stay. Samira: ceftriaxone and azithromycin for the pneumonia,
  -- paracetamol every 6 hours, enoxaparin under the skin
  perform demo.use(demo.id('bedside', 'patient:samira'));
  perform demo.w(doctor, jsonb_build_array(
    demo.e('medication', ward, ss, d2 + interval '10 hours 25 minutes', pg_temp.rx('Ceftriaxone', 'J01DD04', 2, 'g', 'g', 'OD', 'iv', '{"duration_days":7}'), demo.id('bedside', 'med:samira ceftriaxone')),
    demo.e('medication', ward, ss, d2 + interval '10 hours 25 minutes', pg_temp.rx('Azithromycin', 'J01FA10', 500, 'mg', 'mg', 'OD', 'oral', '{"duration_days":5}'), demo.id('bedside', 'med:samira azithromycin')),
    demo.e('medication', ward, ss, d2 + interval '10 hours 25 minutes', pg_temp.rx('Paracetamol', 'N02BE01', 1, 'g', 'g', 'q6h', 'iv'), demo.id('bedside', 'med:samira paracetamol')),
    demo.e('medication', ward, ss, d2 + interval '10 hours 25 minutes', pg_temp.rx('Enoxaparin', 'B01AB05', 40, 'mg', 'mg', 'OD', 'sc'), demo.id('bedside', 'med:samira enoxaparin'))));
  -- Abdelmoneim: nebulised salbutamol every 6 hours, prednisolone for 5 days, amoxicillin + clavulanic acid for 7
  perform demo.use(demo.id('bedside', 'patient:abdelmoneim'));
  perform demo.w(doctor, jsonb_build_array(
    demo.e('medication', ward, sa, d2 + interval '21 hours 20 minutes', pg_temp.rx('Salbutamol (nebulised)', 'R03AC02', 5, 'mg', 'mg', 'q6h', 'inhaled'), demo.id('bedside', 'med:abdelmoneim salbutamol')),
    demo.e('medication', ward, sa, d2 + interval '21 hours 20 minutes', pg_temp.rx('Prednisolone', 'H02AB06', 40, 'mg', 'mg', 'OD', 'oral', '{"duration_days":5}'), demo.id('bedside', 'med:abdelmoneim prednisolone')),
    demo.e('medication', ward, sa, d2 + interval '21 hours 20 minutes', pg_temp.rx('Amoxicillin + clavulanic acid', 'J01CR02', 1, 'g', 'g', 'BD', 'oral', '{"duration_days":7}'), demo.id('bedside', 'med:abdelmoneim amoxicillin'))));
  -- Tahany: ceftriaxone, its first dose waiting; soluble insulin by the sliding scale, with no dose and no times
  perform demo.use(demo.id('bedside', 'patient:tahany'));
  perform demo.w(doctor, jsonb_build_array(
    demo.e('medication', ward, st, demo.ago(25), pg_temp.rx('Ceftriaxone', 'J01DD04', 2, 'g', 'g', 'OD', 'iv', '{"duration_days":7}'), demo.id('bedside', 'med:tahany ceftriaxone')),
    demo.e('medication', ward, st, demo.ago(25), pg_temp.rx('Soluble insulin (human)', 'A10AB01', null, null, null, null, 'sc',
      '{"dosage":{"text":"by the sliding scale","route":"sc"},"instructions":"before meals, by the glucose"}'), demo.id('bedside', 'med:tahany insulin'))));

  -- the rounds so far: Samira's every dose but her latest paracetamol (late); Abdelmoneim's every dose, due ones too, but his amoxicillin
  -- + clavulanic acid yesterday at 08:00 (not given, vomiting); Tahany nothing yet
  perform pg_temp.round(ss, false, demo.id('bedside', 'med:samira paracetamol'));
  perform pg_temp.round(sa, true, null, demo.id('bedside', 'med:abdelmoneim amoxicillin'), d1 + interval '8 hours');
end $$;

-- W2 · fluid balance (spec/openCare.md §5.6): Samira has had a fluid chart since yesterday 08:30 (Dr. Ali Hassan, no balance aim),
-- weighed on admission (68 kg); IV fluids, drinks and urine through yesterday and this morning, her last urine only 60 mL (0.4 mL/kg/h,
-- low). Tahany's chart started on arrival, a balance aim of +1 000 mL for today; IV fluids running, a first urine; no weight yet.
-- Abdelmoneim keeps no chart. Each measure is the base's observation (LOINC 9103-3 in, 9187-6 urine, 9257-7 other output; mL) signed
-- by Nour Adel; a chart is the pack's bedside.fluid_chart. Each stay is found from its admission, so piece 1's block is not touched.
create or replace function pg_temp.fl(p_stay uuid, p_at timestamptz, p_code text, p_text text, p_ml int, p_method text default null, p_note text default null)
returns void language sql as $$
  select demo.w(demo.id('bedside', 'nurse'), jsonb_build_array(demo.e('observation', demo.base('ward'), p_stay, p_at, jsonb_strip_nulls(jsonb_build_object(
    'code', jsonb_build_object('text', p_text, 'codings', jsonb_build_array(jsonb_build_object('system', 'loinc', 'code', p_code, 'display',
      case p_code when '9103-3' then 'Fluid intake total Measured' when '9187-6' then 'Urine output' else 'Fluid output total Measured' end))),
    'value', jsonb_build_object('quantity', demo.q(p_ml, 'mL', 'mL')), 'method', p_method, 'note', p_note)))));
$$;

do $$
declare ward uuid := demo.base('ward'); doctor uuid := demo.base('doctor'); d1 timestamptz := demo.midnight() - interval '1 day';
  d2 timestamptz := demo.midnight() - interval '2 days';
  ss uuid := (select e.visit_id from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:samira')
    and e.type = 'admitted' order by e.recorded_at desc limit 1);
  st uuid := (select e.visit_id from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:tahany')
    and e.type = 'admitted' order by e.recorded_at desc limit 1);
begin
  if ss is null or st is null then raise exception 'bedside W2: Samira''s or Tahany''s stay is not found'; end if;
  perform demo.use(demo.id('bedside', 'patient:samira'));
  perform demo.w(demo.id('bedside', 'nurse'), jsonb_build_array(demo.e('vitals', ward, ss, d2 + interval '10 hours 40 minutes', jsonb_build_object('weight', demo.q(68, 'kg', 'kg')))));
  perform demo.w(doctor, jsonb_build_array(demo.e('bedside.fluid_chart', ward, ss, d1 + interval '8 hours 30 minutes',
    '{"status":"active","note":"pneumonia with fever: watch the urine"}'::jsonb)));
  perform pg_temp.fl(ss, d1 + interval '9 hours', '9103-3', 'Fluid in · IV', 1000, 'iv', 'NS 0.9%');
  perform pg_temp.fl(ss, d1 + interval '11 hours', '9187-6', 'Urine', 350);
  perform pg_temp.fl(ss, d1 + interval '13 hours', '9103-3', 'Fluid in · by mouth', 300, 'oral');
  perform pg_temp.fl(ss, d1 + interval '17 hours', '9187-6', 'Urine', 400);
  perform pg_temp.fl(ss, d1 + interval '21 hours', '9103-3', 'Fluid in · IV', 1000, 'iv', 'NS 0.9%');
  perform pg_temp.fl(ss, d1 + interval '23 hours', '9187-6', 'Urine', 300);
  perform pg_temp.fl(ss, demo.ago(150), '9103-3', 'Fluid in · IV', 500, 'iv', 'NS 0.9%');
  perform pg_temp.fl(ss, demo.ago(140), '9187-6', 'Urine', 250);
  perform pg_temp.fl(ss, demo.ago(60), '9103-3', 'Fluid in · by mouth', 200, 'oral');
  perform pg_temp.fl(ss, demo.ago(20), '9187-6', 'Urine', 60);
  perform demo.use(demo.id('bedside', 'patient:tahany'));
  perform demo.w(doctor, jsonb_build_array(demo.e('bedside.fluid_chart', ward, st, demo.ago(85),
    '{"status":"active","target":{"value":"+1000","unit":"mL","ucum":"mL"},"note":"pyelonephritis: rehydrate"}'::jsonb)));
  perform pg_temp.fl(st, demo.ago(60), '9103-3', 'Fluid in · IV', 500, 'iv', 'NS 0.9%');
  perform pg_temp.fl(st, demo.ago(25), '9187-6', 'Urine', 200);
end $$;

-- W3 · handover and going home (spec/openCare.md §5.6): the last shift's handover for Samira and Abdelmoneim, signed by Nour Adel ten
-- minutes before this shift began (the ward's default shifts, 08:00 14:00 20:00), so the Handover tab shows what it asked and, from 30
-- minutes into the shift (the handover's grace), both wait to be handed over; Tahany has none yet. Abdelmoneim, nearly ready for home,
-- has a fall-risk alert (W3a); his problem, COPD with acute exacerbation, and his own two inhalers (reported) by Dr. Ali Hassan (W3b).
-- The ward's three medicines for him are the drug round's (its block above).
-- The notes carry the two boxes only; the app adds the facts line when it signs. Each stay is found from its admission.
do $$
declare ward uuid := demo.base('ward'); doctor uuid := demo.base('doctor'); nurse uuid := demo.id('bedside', 'nurse'); d2 timestamptz := demo.midnight() - interval '2 days';
  -- the shift now began at the latest of yesterday 20:00 and today's 08:00, 14:00, 20:00 not after the load
  v_start timestamptz := (select max(t) from unnest(array[demo.midnight() - interval '4 hours', demo.midnight() + interval '8 hours',
    demo.midnight() + interval '14 hours', demo.midnight() + interval '20 hours']) t where t <= demo.now());
  v_head text;
  ss uuid := (select e.visit_id from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:samira')
    and e.type = 'admitted' order by e.recorded_at desc limit 1);
  sa uuid := (select e.visit_id from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:abdelmoneim')
    and e.type = 'admitted' order by e.recorded_at desc limit 1);
begin
  if ss is null or sa is null then raise exception 'demo: W3 found no stay for Samira or Abdelmoneim'; end if;
  v_head := 'Handover ' || case extract(hour from v_start at time zone 'Africa/Cairo')::int when 8 then '20–08 → 08–14' when 14 then '08–14 → 14–20' else '14–20 → 20–08' end;
  perform demo.use(demo.id('bedside', 'patient:samira'));
  perform demo.w(nurse, jsonb_build_array(demo.e('note', ward, ss, v_start - interval '10 minutes', jsonb_build_object('kind', 'handover', 'heading', v_head,
    'text', E'This shift: febrile, more breathless towards the end; IV antibiotics on time; drinking a little\nFor the next shift: obs at least hourly and tell Dr. Ali at once if NEWS2 reaches 5 or any single sign scores 3; blood cultures sent, result awaited; she asked us to call her son'))));
  perform demo.use(demo.id('bedside', 'patient:abdelmoneim'));
  perform demo.w(nurse, jsonb_build_array(demo.e('alert', ward, sa, d2 + interval '22 hours', jsonb_build_object('concept', demo.concept('local.alert', 'fall_risk', 'Fall risk'), 'status', 'active'))));
  perform demo.w(nurse, jsonb_build_array(demo.e('note', ward, sa, v_start - interval '10 minutes', jsonb_build_object('kind', 'handover', 'heading', v_head,
    'text', E'This shift: oxygen being weaned, SpO₂ within his 88–92 % target; comfortable; on steroids\nFor the next shift: keep SpO₂ 88–92 %, no higher; wean the oxygen further if he stays in range; physio to walk him; Dr. Ali may send him home tomorrow'))));
  -- W3b: his problem, and his own two inhalers (reported: the drug round leaves them out)
  perform demo.w(doctor, jsonb_build_array(demo.e('problem', ward, sa, d2 + interval '21 hours 15 minutes', demo.problem('J44.1', 'COPD with acute exacerbation'))));
  perform demo.w(doctor, jsonb_build_array(
    demo.e('medication', ward, sa, d2 + interval '21 hours 20 minutes', demo.med('Tiotropium', 'R03BB04', 18, 'mcg', 'OD',
      '{"basis":"reported","dosage":{"dose":{"value":"18","unit":"mcg","ucum":"ug"},"timing":{"code":"OD"},"route":"inhaled"}}')),
    demo.e('medication', ward, sa, d2 + interval '21 hours 20 minutes', demo.med('Salbutamol inhaler', 'R03AC02', 200, 'mcg', 'PRN',
      '{"basis":"reported","dosage":{"dose":{"value":"200","unit":"mcg","ucum":"ug"},"as_needed":true,"as_needed_for":"wheeze","route":"inhaled"}}'))));
end $$;
