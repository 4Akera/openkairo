-- Ward nursing's day (spec/openCare.md §5.6): three of the pack's own patients on the Medical Ward. Each set of obs is the base's
-- vitals, ACVPU and air or oxygen among them, and NEWS2 (the base's score, bedside.news2 or, for a target of 88–92 %, bedside.news2_s2) in one set, by Nour Adel, the
-- ward's nurse, with the totals the server adds up. Samira (pneumonia, day 3) climbs from NEWS2 2 to 6, medium; Abdelmoneim (COPD,
-- type 2 respiratory failure, day 3) is on SpO₂ scale 2 and settles from 8 to 3; Tahany arrived 90 minutes ago, has no bed yet, and
-- her first obs (NEWS2 4, a 3 in systolic) are now overdue. Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
-- Only Samira takes a bed (7, else the next free): the Medical Ward's eight are shared with the base's three, the Blood bank's one,
-- the journey's one and, at demo.sql's third load, the app's two, while a reload still holds the last load's stays until each layer
-- erases its own; so Abdelmoneim waits on the ward with no bed yet, as Tahany does.
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

do $$
declare ward uuid := demo.base('ward'); doctor uuid := demo.base('doctor'); d2 timestamptz := demo.midnight() - interval '2 days';
  d1 timestamptz := demo.midnight() - interval '1 day'; s uuid;
begin
  -- Samira, 63: community-acquired pneumonia, day 3; on air and alert, her NEWS2 2, 2, 3, 4, then 6 (medium) 50 minutes ago
  perform demo.patient(demo.id('bedside', 'patient:samira'), array['Samira', 'Fawzy'], 'Abdelaal', 'female', demo.born(63, 140), '+201006645512');
  s := gen_random_uuid();
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
  s := gen_random_uuid();
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
  s := gen_random_uuid();
  perform demo.w(doctor, jsonb_build_array(demo.e('admitted', ward, s, demo.ago(90), jsonb_build_object('department_id', ward,
    'admit_source', 'emd', 'reason', 'pyelonephritis; diabetes'), s)));
  -- her first obs, ten minutes after she arrived: NEWS2 4, low, but a 3 in one sign (systolic 88), so RCP 2017 asks for hourly obs and
  -- the doctor caring for her to be told; nobody has repeated them, so the board and Obs due say "obs overdue 20 min" (W1)
  perform pg_temp.obs(s, demo.ago(80), 88, 54, 98, 38.0, 96, 18, 'air', 'a');   -- 4, low; 3 in sbp
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

-- W3 · handover (spec/openCare.md §5.6): the last shift's handover for Samira and Abdelmoneim, signed by Nour Adel ten minutes before this
-- shift began (the ward's default shifts, 08:00 14:00 20:00), so the Handover tab shows what it asked and, from 30 minutes into the shift
-- (the handover's grace), both wait to be handed over; Tahany has none yet. Abdelmoneim has a fall-risk alert. The notes carry the two
-- boxes only; the app adds the facts line when it signs. Each stay is found from its admission.
do $$
declare ward uuid := demo.base('ward'); nurse uuid := demo.id('bedside', 'nurse'); d2 timestamptz := demo.midnight() - interval '2 days';
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
end $$;
