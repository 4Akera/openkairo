-- Ward nursing's day (spec/openCare.md §5.6): three of the pack's own patients on the Medical Ward. Each set of obs is the base's
-- vitals, ACVPU and air or oxygen among them, and NEWS2 (the base's score, bedside.news2 or, for a target of 88–92 %, bedside.news2_s2) in one set, by Nour Adel, the
-- ward's nurse, with the totals the server adds up. Samira (pneumonia, day 3) climbs from NEWS2 2 to 6, medium; Abdelmoneim (COPD,
-- type 2 respiratory failure, day 3) is on SpO₂ scale 2 and settles from 8 to 3; Tahany arrived 90 minutes ago, has no bed yet and no
-- obs, so her tile says "no obs yet". Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
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

  -- Tahany, 58: just arrived with pyelonephritis, no bed yet and no obs
  perform demo.patient(demo.id('bedside', 'patient:tahany'), array['Tahany', 'Ibrahim'], 'Gaafar', 'female', demo.born(58, 200), '+201114428863');
  s := gen_random_uuid();
  perform demo.w(doctor, jsonb_build_array(demo.e('admitted', ward, s, demo.ago(90), jsonb_build_object('department_id', ward,
    'admit_source', 'emd', 'reason', 'pyelonephritis; diabetes'), s)));
end $$;
