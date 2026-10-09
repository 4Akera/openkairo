-- Critical care's day (spec/openCare.md §5.6): two of the pack's own patients in the ICU, charted hour by hour by Mariam Saad, the ICU's
-- nurse: one set an hour, with the base's vitals and observations (MAP, CVP, fluid in, urine) and only what changed of the ventilator's
-- settings and the infusions' rates. Nabil (septic shock from pneumonia, day 3) is on the ventilator, his noradrenaline titrated up to 0.25, then
-- weaned to 0.15 µg/kg/min; Samy (diabetic ketoacidosis with kidney injury, day 3) is on air, on an insulin infusion, with little urine. The last
-- six whole hours are charted; the one now is left to type. Times relative to the load; ids in the pack's namespace; a reload erases these
-- patients first. Piece I2: Nabil's three lines, his SOFAs (13 on admission, 12 at the round the ICU day before, 11 at today's round, signed
-- with the daily goals in one set) and this morning's bloods by the Laboratory; Samy's SOFA 4 on admission and no round yet this ICU day.
-- Piece I3: the CCU's Maher (anterior STEMI after tenecteplase, admitted today in CCU 2), on heparin and GTN, his hours charted with the
-- cardiac rows: sinus rhythm and the ST resolving, then AF with chest pain, the amiodarone bolus, its infusion an hour later, the GTN stopped; his
-- troponin, potassium, magnesium and an aPTT the heparin has not been changed for yet.
select demo.layer('intensive');

-- a set whose first entry takes an ICU bed: the bed named, else the next free by position (a patient admitted in the app since keeps
-- theirs, so a reload never stops on bed_taken). Returns the bed
create or replace function pg_temp.icu_admit(p_user uuid, p_entries jsonb, p_bed text) returns uuid language plpgsql as $$
declare d uuid := (p_entries -> 0 -> 'data' ->> 'department_id')::uuid; b uuid; r jsonb;
begin
  for b in select x.id from core.places x where x.organization_id = demo.base('clinic') and x.department_id = d and x.retired_at is null
              order by x.id = demo.thing(d, 'place', p_bed) desc, x.position loop
    r := demo.send(p_user, jsonb_set(p_entries, '{0,data,place_id}', to_jsonb(b)));
    continue when r ->> 'outcome' <> 'landed' and jsonb_path_exists(coalesce(r -> 'findings', '[]'), '$[*] ? (@.code == "bed_taken")');
    perform demo.landed(r, p_entries);
    return b;
  end loop;
  raise exception 'demo: no free bed in the ICU';
end $$;
-- the whole hour k hours before the hour of the load
create or replace function pg_temp.icu_hour(k int) returns timestamptz language sql stable as $$
  select date_trunc('hour', demo.now()) - k * interval '1 hour'
$$;
-- the vitals the chart writes, each only when given
create or replace function pg_temp.icu_vit(hr int, sys int, dia int, spo2 int, rr int default null, t numeric default null, glu int default null, wt numeric default null)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('hr', case when hr is not null then demo.q(hr, 'bpm', '/min') end,
    'bp', case when sys is not null then jsonb_build_object('sys', demo.q(sys, 'mmHg', 'mm[Hg]'), 'dia', demo.q(dia, 'mmHg', 'mm[Hg]')) end,
    'spo2', case when spo2 is not null then demo.q(spo2, '%', '%') end, 'rr', case when rr is not null then demo.q(rr, '/min', '/min') end,
    'temp', case when t is not null then demo.q(t, '°C', 'Cel') end, 'glucose', case when glu is not null then demo.q(glu, 'mg/dL', 'mg/dL') end,
    'weight', case when wt is not null then demo.q(wt, 'kg', 'kg') end))
$$;
-- an observation with its LOINC code
create or replace function pg_temp.icu_obs(p_code text, p_label text, v numeric, unit text, ucum text) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', demo.concept('loinc', p_code, p_label), 'value', jsonb_build_object('quantity', demo.q(v, unit, ucum)))
$$;
-- a prescription for an infusion: no dose, so no dose warning
create or replace function pg_temp.icu_rx(p_drug jsonb, p_text text) returns jsonb language sql immutable as $$
  select jsonb_build_object('basis', 'prescribed', 'drug', p_drug, 'dosage', jsonb_build_object('text', p_text, 'route', 'iv'), 'status', 'active')
$$;
-- an infusion running at a rate, its dose the one that rate gives, with its bag and the weight it was worked out with
create or replace function pg_temp.icu_drip(p_drug jsonb, p_med uuid, p_key text, p_rate numeric, p_dose numeric, p_unit text, p_words text, p_ucum text,
  p_amount numeric, p_amount_words text, p_amount_ucum text, p_volume numeric, p_kg numeric default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('drug', p_drug, 'medication', p_med, 'key', p_key, 'status', 'running', 'rate', demo.q(p_rate, 'mL/h', 'mL/h'),
    'dose', jsonb_build_object('value', p_dose::text, 'unit', p_words, 'ucum', p_ucum), 'dose_unit', p_unit,
    'amount', demo.q(p_amount, p_amount_words, p_amount_ucum), 'volume', demo.q(p_volume, 'mL', 'mL'),
    'weight', case when p_kg is not null then demo.q(p_kg, 'kg', 'kg') end))
$$;
-- the ventilator's settings, volume control
create or replace function pg_temp.icu_vent(fio2 int, peep int, vt int default 420, rate int default 18) returns jsonb language sql immutable as $$
  select jsonb_build_object('mode', 'vc', 'fio2', demo.q(fio2, '%', '%'), 'peep', demo.q(peep, 'cmH₂O', 'cm[H2O]'), 'vt', demo.q(vt, 'mL', 'mL'),
    'rate', demo.q(rate, '/min', '/min'))
$$;
-- the hour's observations, each only when given: MAP, CVP, fluid in and urine
create or replace function pg_temp.icu_fluids(p_map numeric, p_cvp numeric, p_in numeric, p_urine numeric) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(o order by n), '[]') from (values
    (1, case when p_map is not null then pg_temp.icu_obs('8478-0', 'Mean blood pressure', p_map, 'mmHg', 'mm[Hg]') end),
    (2, case when p_cvp is not null then pg_temp.icu_obs('60985-9', 'Central venous pressure (CVP)', p_cvp, 'cmH₂O', 'cm[H2O]') end),
    (3, case when p_in is not null then pg_temp.icu_obs('9103-3', 'Fluid intake total Measured', p_in, 'mL', 'mL') end),
    (4, case when p_urine is not null then pg_temp.icu_obs('9188-4', 'Urine output 1 hour', p_urine, 'mL/h', 'mL/h') end)) x(n, o) where o is not null
$$;
-- one charted hour, one set by the ICU's nurse: the vitals, an observation each, and what changed
create or replace function pg_temp.icu_hour_set(p_stay uuid, p_at timestamptz, p_vit jsonb, p_obs jsonb, p_more jsonb default '[]') returns void language sql as $$
  select demo.w(demo.id('intensive', 'nurse'), jsonb_build_array(demo.e('vitals', demo.id('intensive', 'icu'), p_stay, p_at, p_vit))
    || coalesce((select jsonb_agg(demo.e('observation', demo.id('intensive', 'icu'), p_stay, p_at, o) order by n) from jsonb_array_elements(p_obs) with ordinality x(o, n)), '[]')
    || p_more);
$$;
-- a cardiac row (piece I3): the base's observation, coded in the pack's own system, its value a concept of the same system
create or replace function pg_temp.ccu_obs(p_code text, p_words text, p_value text, p_value_words text) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', demo.concept('intensive.cardiac', p_code, p_words),
    'value', jsonb_build_object('concept', demo.concept('intensive.cardiac', p_value, p_value_words)))
$$;
-- an outside result (no order), one analyte with its LOINC code
create or replace function pg_temp.ccu_result(p_name text, p_analyte jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'final', 'code', demo.concept('loinc', p_analyte -> 'code' ->> 'code', p_name), 'analytes', jsonb_build_array(p_analyte))
$$;
-- the ICU day the load falls in: from the setup's 08:00
create or replace function pg_temp.icu_day() returns timestamptz language sql stable as $$
  select case when demo.now() >= demo.midnight() + interval '8 hours' then demo.midnight() + interval '8 hours' else demo.midnight() - interval '16 hours' end
$$;
-- a SOFA as the server adds it up
create or replace function pg_temp.icu_sofa(resp text, coag text, liver text, cardio text, cns text, renal text) returns jsonb language sql as $$
  select demo.score('intensive.sofa', jsonb_build_object('resp', resp, 'coag', coag, 'liver', liver, 'cardio', cardio, 'cns', cns, 'renal', renal))
$$;
-- a line (central, arterial, urinary) as the base's procedure, in progress since it went in
create or replace function pg_temp.icu_line(p_code text, p_words text, p_at timestamptz, p_site text default null) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object('concept', demo.concept('local.procedure', p_code, p_words), 'status', 'in-progress',
    'performed', jsonb_build_object('value', to_jsonb(p_at), 'precision', 'minute'), 'body_site', case when p_site is not null then jsonb_build_object('text', p_site) end))
$$;

do $$
declare icu uuid := demo.id('intensive', 'icu'); dr uuid := demo.id('intensive', 'doctor'); rn uuid := demo.id('intensive', 'nurse');
  d2 timestamptz := demo.midnight() - interval '2 days'; d1 timestamptz := demo.midnight() - interval '1 day'; s uuid; at timestamptz;
  nor_rx uuid := gen_random_uuid(); pro_rx uuid := gen_random_uuid(); fen_rx uuid := gen_random_uuid(); ins_rx uuid := gen_random_uuid();
  vent uuid := gen_random_uuid(); nor uuid := gen_random_uuid(); pro uuid := gen_random_uuid(); fen uuid := gen_random_uuid(); ins uuid := gen_random_uuid();
  v2 uuid; n2 uuid; p2 uuid; cvc uuid := gen_random_uuid(); art uuid := gen_random_uuid(); uc uuid := gen_random_uuid(); o1 uuid := gen_random_uuid();
  o2 uuid := gen_random_uuid(); b timestamptz;
  nor_d jsonb := '{"text":"Noradrenaline"}'; pro_d jsonb := '{"text":"Propofol"}'; fen_d jsonb := '{"text":"Fentanyl"}';
  ins_d jsonb := demo.concept('atc', 'A10AB01', 'Soluble insulin (human)');
  air jsonb := '{"consciousness":"a","oxygen":{"on":"air"}}';
begin
  -- Nabil, 62: septic shock from pneumonia, day 3, on the ventilator in ICU 1
  perform demo.patient(demo.id('intensive', 'patient:nabil'), array['Nabil', 'Farag'], 'Darwish', 'male', demo.born(62, 75), '+201006218834');
  s := gen_random_uuid();
  perform pg_temp.icu_admit(dr, jsonb_build_array(demo.e('admitted', icu, s, d2 + interval '5 hours', jsonb_build_object('department_id', icu,
    'admit_source', 'emd', 'reason', 'septic shock, pneumonia'), s)), 'icu_1');
  perform demo.w(dr, jsonb_build_array(
    demo.e('vitals', icu, s, d2 + interval '5 hours 10 minutes', pg_temp.icu_vit(128, 78, 40, 84, 34, 39.1, null, 78)
      || jsonb_build_object('consciousness', 'v', 'oxygen', jsonb_build_object('on', 'oxygen', 'device', 'reservoir_mask', 'flow', demo.q(15, 'L/min', 'L/min')))),
    demo.e('note', icu, s, d2 + interval '5 hours 10 minutes', demo.note('history_physical',
      E'hx: fever and cough for a week, confused and breathless since last night, brought up from the ER\nex: responds to voice, GCS 11; BP 78/40 after two litres of fluid, SpO₂ 84 % on a reservoir mask, crackles at both bases\nplan: intubate; noradrenaline to MAP ≥ 65; antibiotics after cultures; central and arterial lines'))));
  perform demo.w(dr, jsonb_build_array(
    demo.e('medication', icu, s, d2 + interval '5 hours 20 minutes', pg_temp.icu_rx(nor_d, 'infusion: titrate to MAP ≥ 65 mmHg'), nor_rx),
    demo.e('medication', icu, s, d2 + interval '5 hours 20 minutes', pg_temp.icu_rx(pro_d, 'infusion for sedation: RASS −2 to 0'), pro_rx),
    demo.e('medication', icu, s, d2 + interval '5 hours 20 minutes', pg_temp.icu_rx(fen_d, 'infusion for pain on the ventilator'), fen_rx)));
  at := d2 + interval '5 hours 30 minutes';
  perform demo.w(dr, jsonb_build_array(
    demo.e('procedure', icu, s, at, jsonb_build_object('concept', demo.concept('local.procedure', 'invasive_ventilation', 'Invasive ventilation'), 'status', 'in-progress',
      'performed', jsonb_build_object('value', to_jsonb(at), 'precision', 'minute'), 'note', 'endotracheal tube 7.5, 22 cm at the lips')),
    demo.e('intensive.vent', icu, s, at, pg_temp.icu_vent(80, 10), vent)));
  at := d2 + interval '5 hours 40 minutes';
  perform demo.w(rn, jsonb_build_array(
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(nor_d, nor_rx, 'noradrenaline', 11.7, 0.2, 'ug/kg/min', 'µg/kg/min', 'ug/kg/min', 4, 'mg', 'mg', 50, 78), nor),
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(pro_d, pro_rx, 'propofol', 12.0, 120, 'mg/h', 'mg/h', 'mg/h', 500, 'mg', 'mg', 50), pro),
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(fen_d, fen_rx, 'fentanyl', 1.5, 75, 'ug/h', 'µg/h', null, 2500, 'µg', 'ug', 50), fen)));

  -- his six charted hours: the noradrenaline up while the MAP is under 65 (0.25), down only once it is above (0.2, then 0.15)
  at := pg_temp.icu_hour(6); v2 := gen_random_uuid(); n2 := gen_random_uuid();
  perform pg_temp.icu_hour_set(s, at, pg_temp.icu_vit(112, 96, 42, 93, null, 38.6, 212), pg_temp.icu_fluids(58, 8, 145, 20), jsonb_build_array(
    demo.e('intensive.vent', icu, s, at, pg_temp.icu_vent(60, 10), v2, vent, 'changes'),
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(nor_d, nor_rx, 'noradrenaline', 14.6, 0.25, 'ug/kg/min', 'µg/kg/min', 'ug/kg/min', 4, 'mg', 'mg', 50, 78), n2, nor, 'changes')));
  vent := v2; nor := n2;
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(5), pg_temp.icu_vit(108, 98, 44, 94), pg_temp.icu_fluids(61, null, 145, 25));
  at := pg_temp.icu_hour(4); v2 := gen_random_uuid(); n2 := gen_random_uuid();
  perform pg_temp.icu_hour_set(s, at, pg_temp.icu_vit(110, 102, 48, 95), pg_temp.icu_fluids(66, null, 140, 40), jsonb_build_array(
    demo.e('intensive.vent', icu, s, at, pg_temp.icu_vent(50, 10), v2, vent, 'changes'),
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(nor_d, nor_rx, 'noradrenaline', 11.7, 0.2, 'ug/kg/min', 'µg/kg/min', 'ug/kg/min', 4, 'mg', 'mg', 50, 78), n2, nor, 'changes')));
  vent := v2; nor := n2;
  at := pg_temp.icu_hour(3); p2 := gen_random_uuid();
  perform pg_temp.icu_hour_set(s, at, pg_temp.icu_vit(104, 104, 50, 95, null, 38.1, 186), pg_temp.icu_fluids(68, 10, 140, 45), jsonb_build_array(
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(pro_d, pro_rx, 'propofol', 10.0, 100, 'mg/h', 'mg/h', 'mg/h', 500, 'mg', 'mg', 50), p2, pro, 'changes')));
  pro := p2;
  at := pg_temp.icu_hour(2); v2 := gen_random_uuid(); n2 := gen_random_uuid();
  perform pg_temp.icu_hour_set(s, at, pg_temp.icu_vit(98, 106, 52, 96), pg_temp.icu_fluids(70, null, 210, 50), jsonb_build_array(
    demo.e('intensive.vent', icu, s, at, pg_temp.icu_vent(45, 8), v2, vent, 'changes'),
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(nor_d, nor_rx, 'noradrenaline', 8.8, 0.15, 'ug/kg/min', 'µg/kg/min', 'ug/kg/min', 4, 'mg', 'mg', 50, 78), n2, nor, 'changes')));
  vent := v2; nor := n2;
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(1), pg_temp.icu_vit(96, 104, 50, 95), pg_temp.icu_fluids(67, null, 140, 55));

  -- his lines, put in after the tube, one set: central (right internal jugular), arterial (left radial), urinary catheter
  at := d2 + interval '5 hours 45 minutes';
  perform demo.w(dr, jsonb_build_array(
    demo.e('procedure', icu, s, at, pg_temp.icu_line('central_line', 'Central venous catheter', at, 'right internal jugular'), cvc),
    demo.e('procedure', icu, s, at, pg_temp.icu_line('arterial_line', 'Arterial line', at, 'left radial'), art),
    demo.e('procedure', icu, s, at, pg_temp.icu_line('urinary_catheter', 'Urinary catheter', at), uc)));
  -- his SOFA on admission (13) and at the round of the ICU day before (12, that day's 09:30: always after his admission)
  perform demo.w(dr, jsonb_build_array(demo.e('score', icu, s, d2 + interval '6 hours', pg_temp.icu_sofa('3', '1', '1', '4', '2', '2'))));
  perform demo.w(dr, jsonb_build_array(demo.e('score', icu, s, pg_temp.icu_day() - interval '22 hours 30 minutes', pg_temp.icu_sofa('3', '2', '1', '4', '0', '2'))));
  -- this morning's bloods, ordered three hours before the round: platelets 96, creatinine 1.6 (abnormal, not critical)
  b := least(pg_temp.icu_day() + interval '90 minutes', demo.now()) - interval '3 hours';
  perform demo.w(dr, jsonb_build_array(demo.lab_order('cbc', icu, s, b, o1), demo.lab_order('creat', icu, s, b, o2)));
  perform demo.lab(o1, b, demo.cbc(false, 11.2, 14.6, 96));
  perform demo.lab(o2, b, demo.creat(1.6));
  -- today's round, one set: SOFA 11 and the daily goals (each line kept)
  at := least(pg_temp.icu_day() + interval '90 minutes', demo.now());
  perform demo.w(dr, jsonb_build_array(
    demo.e('score', icu, s, at, pg_temp.icu_sofa('3', '2', '1', '4', '0', '1')),
    demo.e('intensive.goals', icu, s, at, jsonb_build_object('feeding', 'enteral', 'analgesia', 'controlled', 'sedation', 'light', 'thrombo', 'heparin', 'head_up', true,
      'ulcer', 'yes', 'glucose', 'on_target', 'bowels', 'not_opened', 'antibiotics', 'narrow', 'wean', 'not_today',
      'lines', jsonb_build_array(jsonb_build_object('item', cvc, 'decision', 'keep'), jsonb_build_object('item', art, 'decision', 'keep'),
        jsonb_build_object('item', uc, 'decision', 'keep')),
      'map_target', demo.q(65, 'mmHg', 'mm[Hg]'), 'balance_target', demo.q(-500, 'mL', 'mL'),
      'text', 'Goals today: MAP ≥ 65 off noradrenaline by tonight; negative 500 mL; chase the sputum culture; family meeting at 17:00.'))));

  -- Samy, 47: diabetic ketoacidosis with acute kidney injury, day 3, on air in ICU 3, on an insulin infusion, with little urine
  perform demo.patient(demo.id('intensive', 'patient:samy'), array['Samy', 'Ragab'], 'Hegazy', 'male', demo.born(47, 160), '+201123359071');
  s := gen_random_uuid();
  perform pg_temp.icu_admit(dr, jsonb_build_array(demo.e('admitted', icu, s, d2 + interval '23 hours', jsonb_build_object('department_id', icu,
    'admit_source', 'emd', 'reason', 'diabetic ketoacidosis, acute kidney injury'), s)), 'icu_3');
  perform demo.w(dr, jsonb_build_array(
    demo.e('vitals', icu, s, d2 + interval '23 hours 10 minutes', pg_temp.icu_vit(118, 102, 60, 97, 28, 37.4, 512, 72)
      || '{"consciousness":"c","oxygen":{"on":"air"}}'::jsonb),
    demo.e('note', icu, s, d2 + interval '23 hours 10 minutes', demo.note('history_physical',
      E'hx: type 1 diabetes, vomiting for two days, missed his insulin\nex: dry, Kussmaul breathing, drowsy and confused, GCS 14; glucose 512 mg/dL, ketones high, creatinine 3.6\nplan: fluids, insulin infusion by the DKA protocol, potassium, hourly glucose and urine'))));
  -- his SOFA on admission: GCS 14 (confused), creatinine 3.6, on air with a normal BP → 4; no round yet this ICU day
  perform demo.w(dr, jsonb_build_array(demo.e('score', icu, s, d2 + interval '23 hours 40 minutes', pg_temp.icu_sofa('0', '0', '0', '0', '1', '3'))));
  perform demo.w(dr, jsonb_build_array(demo.e('medication', icu, s, d2 + interval '23 hours 20 minutes',
    pg_temp.icu_rx(ins_d, 'infusion by the DKA protocol: 0.1 units/kg/h, then by the glucose'), ins_rx)));
  perform demo.w(rn, jsonb_build_array(demo.e('intensive.infusion', icu, s, d2 + interval '23 hours 30 minutes',
    pg_temp.icu_drip(ins_d, ins_rx, 'insulin', 7.0, 7, 'units/h', 'units/h', null, 50, 'units', '[iU]', 50), ins)));
  n2 := gen_random_uuid();
  perform demo.w(rn, jsonb_build_array(demo.e('intensive.infusion', icu, s, d1 + interval '8 hours',
    pg_temp.icu_drip(ins_d, ins_rx, 'insulin', 5.0, 5, 'units/h', 'units/h', null, 50, 'units', '[iU]', 50), n2, ins, 'changes')));
  ins := n2;
  -- his six charted hours, on air and alert; the last five hours' urine 137 mL against 72 kg: 0.38 mL/kg/h
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(6), pg_temp.icu_vit(98, 116, 68, 98, 24, 37.2, 248) || air, pg_temp.icu_fluids(null, null, 150, 30));
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(5), pg_temp.icu_vit(96, 118, 70, 98, 22) || air, pg_temp.icu_fluids(null, null, 150, 28));
  at := pg_temp.icu_hour(4); n2 := gen_random_uuid();
  perform pg_temp.icu_hour_set(s, at, pg_temp.icu_vit(96, 118, 68, 98, 22, null, 214) || air, pg_temp.icu_fluids(null, null, 150, 25), jsonb_build_array(
    demo.e('intensive.infusion', icu, s, at, pg_temp.icu_drip(ins_d, ins_rx, 'insulin', 4.0, 4, 'units/h', 'units/h', null, 50, 'units', '[iU]', 50), n2, ins, 'changes')));
  ins := n2;
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(3), pg_temp.icu_vit(94, 120, 70, 98, 20) || air, pg_temp.icu_fluids(null, null, 150, 30));
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(2), pg_temp.icu_vit(92, 118, 70, 98, 20, 37.0, 196) || air, pg_temp.icu_fluids(null, null, 150, 28));
  perform pg_temp.icu_hour_set(s, pg_temp.icu_hour(1), pg_temp.icu_vit(92, 120, 72, 99, 20) || air, pg_temp.icu_fluids(null, null, 150, 26));
end $$;

-- Maher, 58: anterior STEMI after tenecteplase in the ER, admitted to CCU 2 today (within the five hours the kit squeezes before 05:00,
-- so his stay is today's at any load). Each charted hour is a whole hour after his admission and before the load; an hour before it
-- is skipped, with everything that belongs to it
do $$
declare ccu uuid := demo.id('intensive', 'ccu'); tn uuid := demo.id('intensive', 'ccu doctor'); rn uuid := demo.id('intensive', 'nurse');
  v_admit timestamptz := demo.ago(280); s uuid := gen_random_uuid(); at timestamptz; k int;
  hep_rx uuid := gen_random_uuid(); gtn_rx uuid := gen_random_uuid(); amio_rx uuid := gen_random_uuid();
  hep uuid := gen_random_uuid(); gtn uuid := gen_random_uuid(); g2 uuid;
  hep_d jsonb := demo.concept('atc', 'B01AB01', 'Heparin'); gtn_d jsonb := demo.concept('atc', 'C01DA02', 'Glyceryl trinitrate');
  amio_d jsonb := demo.concept('atc', 'C01BD01', 'Amiodarone');
  vit jsonb; more jsonb; amio boolean := false;
begin
  perform demo.patient(demo.id('intensive', 'patient:maher'), array['Maher', 'Shokry'], 'Qandil', 'male', demo.born(58, 120), '+201015546620');
  perform pg_temp.icu_admit(tn, jsonb_build_array(demo.e('admitted', ccu, s, v_admit, jsonb_build_object('department_id', ccu,
    'admit_source', 'emd', 'reason', 'anterior STEMI, after tenecteplase'), s)), 'ccu_2');
  -- on arrival, one set: his vitals, the history, the ER's troponin, the two infusions prescribed
  at := demo.after(v_admit, 5);
  perform demo.w(tn, jsonb_build_array(
    demo.e('vitals', ccu, s, at, pg_temp.icu_vit(78, 128, 74, 97, 16, 36.8, null, 84)
      || jsonb_build_object('pain', demo.q(2, '/10', '{score}'), 'consciousness', 'a', 'oxygen', jsonb_build_object('on', 'air'))),
    demo.e('note', ccu, s, at, demo.note('history_physical',
      E'hx: central chest pain from early morning, anterior STEMI on the first ECG; tenecteplase in the ER\nex: pain 2/10, no crackles, Killip I\nplan: heparin by aPTT, GTN for pain, angiography within 24 h of lysis')),
    demo.e('result', ccu, s, at, pg_temp.ccu_result('Troponin I', demo.analyte('trop', 'Troponin I', '10839-9', 1.84, 'ng/mL', 'ng/mL', null, 0.04))),
    demo.e('medication', ccu, s, at, pg_temp.icu_rx(hep_d, 'infusion by aPTT, the unit''s table'), hep_rx),
    demo.e('medication', ccu, s, at, pg_temp.icu_rx(gtn_d, 'infusion for chest pain; keep the systolic above 100'), gtn_rx)));
  -- the two infusions started by the nurse, linked to their prescriptions: heparin 1 000 units/h, GTN 20 µg/min
  at := demo.after(v_admit, 10);
  perform demo.w(rn, jsonb_build_array(
    demo.e('intensive.infusion', ccu, s, at, pg_temp.icu_drip(hep_d, hep_rx, 'heparin', 2.0, 1000, 'units/h', 'units/h', null, 25000, 'units', '[iU]', 50), hep),
    demo.e('intensive.infusion', ccu, s, at, pg_temp.icu_drip(gtn_d, gtn_rx, 'gtn', 1.2, 20, 'ug/min', 'µg/min', null, 50, 'mg', 'mg', 50), gtn)));

  -- his hours, one set each by the nurse: the vitals with the chest pain, the cardiac rows, then what changed
  for k in reverse 4 .. 1 loop
    at := pg_temp.icu_hour(k);
    continue when at <= demo.after(v_admit, 10);
    more := '[]';
    if k = 4 then
      vit := pg_temp.icu_vit(82, 122, 70, 97) || jsonb_build_object('pain', demo.q(0, '/10', '{score}'));
      more := jsonb_build_array(demo.e('observation', ccu, s, at, pg_temp.ccu_obs('rhythm', 'Heart rhythm', 'sr', 'Sinus rhythm')),
        demo.e('observation', ccu, s, at, pg_temp.ccu_obs('st', 'ST segment', 'resolving', 'Resolving')),
        demo.e('observation', ccu, s, at, jsonb_build_object('code', demo.concept('intensive.cardiac', 'st_fall', 'ST elevation fall'),
          'value', jsonb_build_object('quantity', demo.q(60, '%', '%')))));
    elsif k = 3 then
      vit := pg_temp.icu_vit(84, 118, 72, 97) || jsonb_build_object('pain', demo.q(0, '/10', '{score}'));
      more := jsonb_build_array(demo.e('observation', ccu, s, at, pg_temp.ccu_obs('rhythm', 'Heart rhythm', 'sr', 'Sinus rhythm')),
        demo.e('observation', ccu, s, at, pg_temp.ccu_obs('ectopics', 'Ectopic beats', 'ves', 'Ventricular ectopics')));
    elsif k = 2 then
      -- AF with chest pain: amiodarone prescribed and its bolus given over this hour; the GTN down to 10 µg/min
      perform demo.w(tn, jsonb_build_array(demo.e('medication', ccu, s, at - interval '5 minutes',
        pg_temp.icu_rx(amio_d, 'AF: 300 mg IV over 1 hour, then 900 mg over 24 hours by pump'), amio_rx)));
      vit := pg_temp.icu_vit(128, 98, 60, 96) || jsonb_build_object('pain', demo.q(3, '/10', '{score}'));
      g2 := gen_random_uuid();
      more := jsonb_build_array(demo.e('observation', ccu, s, at, pg_temp.ccu_obs('rhythm', 'Heart rhythm', 'af', 'Atrial fibrillation')),
        demo.e('given', ccu, s, at, jsonb_build_object('drug', amio_d, 'dose', demo.q(300, 'mg', 'mg'), 'route', 'iv', 'status', 'completed', 'note', 'over 1 hour')),
        demo.e('intensive.infusion', ccu, s, at, pg_temp.icu_drip(gtn_d, gtn_rx, 'gtn', 0.6, 10, 'ug/min', 'µg/min', null, 50, 'mg', 'mg', 50), g2, gtn, 'changes'));
      gtn := g2; amio := true;
    else
      vit := pg_temp.icu_vit(104, 110, 66, 97) || jsonb_build_object('pain', demo.q(0, '/10', '{score}'));
      more := jsonb_build_array(demo.e('observation', ccu, s, at, pg_temp.ccu_obs('rhythm', 'Heart rhythm', 'af', 'Atrial fibrillation')),
        demo.e('observation', ccu, s, at, pg_temp.ccu_obs('st', 'ST segment', 'no_new_change', 'No new change')),
        demo.e('intensive.infusion', ccu, s, at, (pg_temp.icu_drip(gtn_d, gtn_rx, 'gtn', 0.6, 10, 'ug/min', 'µg/min', null, 50, 'mg', 'mg', 50) - 'rate' - 'dose')
          || '{"status":"stopped"}'::jsonb, null, gtn, 'changes'));
      -- the bolus over, its 24-hour infusion starts (as prescribed: 300 mg over 1 hour, then 900 mg over 24 hours)
      if amio then
        more := more || jsonb_build_array(demo.e('intensive.infusion', ccu, s, at,
          pg_temp.icu_drip(amio_d, amio_rx, 'amiodarone', 20.8, 37.4, 'mg/h', 'mg/h', 'mg/h', 900, 'mg', 'mg', 500)));
      end if;
    end if;
    perform demo.w(rn, jsonb_build_array(demo.e('vitals', ccu, s, at, vit)) || more);
  end loop;

  -- his bloods, each its own set by the doctor, only once he is here: potassium and magnesium after the AF; an aPTT on the heparin,
  -- whose rate is not changed after it (the chart then suggests the unit's next rate)
  at := pg_temp.icu_hour(2) + interval '15 minutes';
  if at > v_admit then
    perform demo.w(tn, jsonb_build_array(demo.e('result', ccu, s, at, pg_temp.ccu_result('Potassium', demo.analyte('k', 'Potassium', '2823-3', 3.6, 'mmol/L', 'mmol/L', 3.5, 5.1)))));
    perform demo.w(tn, jsonb_build_array(demo.e('result', ccu, s, at, pg_temp.ccu_result('Magnesium', demo.analyte('mg', 'Magnesium', '19123-9', 0.8, 'mmol/L', 'mmol/L', 0.7, 1.0)))));
  end if;
  at := pg_temp.icu_hour(1) - interval '20 minutes';
  if at > demo.after(v_admit, 10) then
    perform demo.w(tn, jsonb_build_array(demo.e('result', ccu, s, at, pg_temp.ccu_result('APTT', demo.analyte('aptt', 'APTT', '3173-2', 44, 's', 's', 25, 35)))));
  end if;
end $$;
