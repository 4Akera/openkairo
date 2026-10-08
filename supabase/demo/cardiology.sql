-- The cardiology pack's day (spec/openCare.md §5.1 rule 9, §5.7): its own patients. Kamal Abdelrahman (64, hypertension on amlodipine,
-- palpitations for three weeks) is in consult at the Cardiology clinic; his ECG seven months ago was sinus 78; his echo was ordered from
-- the clinic 25 minutes ago and the Echo room has started it. Zeinab Abou Zeid (72, heart failure with EF 30 % at the Echo room three
-- months ago, AF on apixaban, diabetes) waits in consult: NYHA III five weeks ago, her dry weight set then at 70 kg, 71.4 kg today; on
-- sacubitril/valsartan and bisoprolol at half the target, dapagliflozin at target, no MRA; K 4.9, creatinine 1.2, eGFR 48 26 days ago;
-- CHA₂DS₂-VASc 5. Heba Abdelwahab (31, pregnant 24 weeks) has an echo asked by General Practice for a murmur, to do. Times relative to the
-- load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('cardiology');

create or replace function pg_temp.echo_svc() returns jsonb language sql stable as $$
  select jsonb_build_object('id', core.setup_id(demo.id('cardiology', 'echo'), 'service', 'echo'), 'code', 'echo', 'name', 'Echo · transthoracic')
$$;
create or replace function pg_temp.echo_order(p_from uuid, p_visit uuid, p_min int, p_id uuid, p_question text) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('order', p_from, p_visit, demo.ago(p_min), jsonb_build_object('service', pg_temp.echo_svc(),
    'department_id', demo.id('cardiology', 'echo'), 'priority', 'routine', 'status', 'active', 'question', p_question), p_id))
$$;
-- a measure of the echo, as the bench writes it (its range copied in, the interpretation from it)
create or replace function pg_temp.m(k text, nm text, v numeric, unit text, ucum text, lo numeric, hi numeric, code text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('key', k, 'name', nm, 'code', case when code is not null then jsonb_build_object('system', 'loinc', 'code', code, 'display', nm) end,
    'value', demo.q(v, unit, ucum), 'interpretation', case when v < lo then 'L' when v > hi then 'H' else 'N' end,
    'range', jsonb_strip_nulls(jsonb_build_object('low', case when lo is not null then demo.q(lo, unit, ucum) end, 'high', case when hi is not null then demo.q(hi, unit, ucum) end))))
$$;
-- an ECG read in the clinic: the base's result with no order
create or replace function pg_temp.ecg(rhythm text, rate int, pr int, qrs int, qtc int, axis int, st text, conclusion text) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'final', 'code', demo.concept('loinc', '11524-6', 'ECG study') || '{"text":"ECG · 12 leads"}', 'conclusion', conclusion, 'analytes', jsonb_build_array(
    jsonb_build_object('key', 'rhythm', 'name', 'Rhythm', 'text', rhythm),
    pg_temp.m('rate', 'Rate', rate, '/min', '/min', 60, 100, '8867-4'), pg_temp.m('pr', 'PR', pr, 'ms', 'ms', 120, 200, '8625-6'),
    pg_temp.m('qrs', 'QRS', qrs, 'ms', 'ms', null, 120, '8633-0'), pg_temp.m('qtc', 'QTc', qtc, 'ms', 'ms', null, 450, '8636-3'),
    pg_temp.m('axis', 'Axis', axis, '°', 'deg', -30, 90, '8632-2'), jsonb_build_object('key', 'st', 'name', 'ST and T', 'text', st)))
$$;
-- the NYHA class and the dry weight, the base's observations in the pack's terms
create or replace function pg_temp.nyha(cls text, note text) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', demo.concept('cardiology.terms', 'nyha', 'NYHA class'), 'value', jsonb_build_object('text', cls), 'note', note)
$$;
create or replace function pg_temp.dry(kg numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', demo.concept('cardiology.terms', 'dry_weight', 'Dry weight'), 'value', jsonb_build_object('quantity', demo.q(kg, 'kg', 'kg')))
$$;

do $$
declare cc uuid := demo.id('cardiology', 'clinic'); er uuid := demo.id('cardiology', 'echo'); wael uuid := demo.id('cardiology', 'cardiologist');
  rasha uuid := demo.id('cardiology', 'echo_doctor'); gp uuid := demo.base('gp'); dr uuid := demo.base('doctor'); day int := 60 * 24;
  v uuid; o uuid; lab uuid;
begin
  -- Kamal: hypertension on amlodipine; an ECG seven months ago, sinus 78; in consult today, his echo ordered and started
  perform demo.patient(demo.id('cardiology', 'patient:kamal'), array['Kamal'], 'Abdelrahman', 'male', demo.born(64, 80), '+201001736452');
  perform demo.w(wael, jsonb_build_array(demo.e('problem', cc, null, demo.ago(210 * day), demo.problem('I10', 'Hypertension')),
    demo.e('medication', cc, null, demo.ago(210 * day), demo.med('Amlodipine', 'C08CA01', 5, 'mg', 'OD')),
    demo.e('result', cc, null, demo.ago(210 * day), pg_temp.ecg('sinus', 78, 164, 92, 418, 30, 'no acute change', 'Sinus rhythm, rate 78. No acute ST change.'))));
  v := demo.arrive('Palpitations for 3 weeks, breathless on stairs · from General Practice', 40, cc);
  perform demo.w(wael, jsonb_build_array(demo.e('vitals', cc, v, demo.ago(32), demo.vitals(138, 86, 108, 36.8, 97, 18, 84, 172))));
  perform demo.consult(v, 11, '[]'::jsonb, null, false, cc, wael);
  o := gen_random_uuid();
  perform demo.w(wael, pg_temp.echo_order(cc, v, 25, o, 'LV function, new AF'));
  perform demo.w(rasha, jsonb_build_array(demo.e('step', er, null, demo.ago(4), '{"status":"in-progress"}', null, o, 'answers')));

  -- Zeinab: heart failure with EF 30 %, AF on apixaban, diabetes, hypertension; NYHA III and her dry weight five weeks ago; here today
  perform demo.patient(demo.id('cardiology', 'patient:zeinab'), array['Zeinab'], 'Abou Zeid', 'female', demo.born(72, 150), '+201228840317');
  perform demo.w(wael, jsonb_build_array(
    demo.e('problem', cc, null, demo.ago(700 * day), demo.problem('I50.9', 'Heart failure, EF 30 %')),
    demo.e('problem', cc, null, demo.ago(700 * day), demo.problem('I48.9', 'Atrial fibrillation')),
    demo.e('problem', cc, null, demo.ago(700 * day), demo.problem('I10', 'Hypertension')), demo.e('problem', cc, null, demo.ago(700 * day), demo.problem('E11.9', 'Type 2 diabetes')),
    demo.e('medication', cc, null, demo.ago(120 * day), demo.med('Entresto (sacubitril/valsartan) 49/51', 'C09DX04', 49, 'mg', 'BID')),
    demo.e('medication', cc, null, demo.ago(120 * day), demo.med('Concor (bisoprolol)', 'C07AB07', 5, 'mg', 'OD')),
    demo.e('medication', cc, null, demo.ago(120 * day), demo.med('Forxiga (dapagliflozin)', 'A10BK01', 10, 'mg', 'OD')),
    demo.e('medication', cc, null, demo.ago(120 * day), demo.med('Lasix (furosemide)', 'C03CA01', 40, 'mg', 'OD', '{"instructions":"each morning"}')),
    demo.e('medication', cc, null, demo.ago(400 * day), demo.med('Eliquis (apixaban)', 'B01AF02', 5, 'mg', 'BID'))));
  perform demo.w(wael, jsonb_build_array(demo.e('vitals', cc, null, demo.ago(120 * day), demo.vitals(112, 70, 80, 36.7, null, null, 73.8))));
  perform demo.w(wael, jsonb_build_array(demo.e('vitals', cc, null, demo.ago(70 * day), demo.vitals(110, 68, 76, 36.6, null, null, 70.6))));
  -- the echo three months ago, at the Echo room
  o := gen_random_uuid();
  perform demo.w(wael, pg_temp.echo_order(cc, null, 93 * day, o, 'LV function'));
  perform demo.w(rasha, jsonb_build_array(demo.e('result', er, null, demo.ago(93 * day - 90), jsonb_build_object('status', 'final', 'service', pg_temp.echo_svc() - 'code',
    'conclusion', E'1. Dilated left ventricle, global hypokinesia, EF 30 % (biplane).\n2. Moderate functional mitral regurgitation.\n3. PASP 38 mmHg. No pericardial effusion.',
    'analytes', jsonb_build_array(pg_temp.m('lvedd', 'LV end-diastolic diameter', 63, 'mm', 'mm', 38, 52), pg_temp.m('lvesd', 'LV end-systolic diameter', 54, 'mm', 'mm', 22, 35),
      pg_temp.m('ef', 'Ejection fraction (biplane)', 30, '%', '%', 54, 74, '10230-1'), pg_temp.m('pasp', 'PASP', 38, 'mmHg', 'mm[Hg]', null, 35),
      jsonb_build_object('key', 'wall', 'name', 'Wall motion', 'text', 'global hypokinesia'), jsonb_build_object('key', 'mitral', 'name', 'Mitral', 'text', 'moderate MR'))),
    null, o, 'answers')));
  -- five weeks ago: NYHA III, weighed 70.2, the dry weight set at 70, CHA₂DS₂-VASc 5
  perform demo.w(wael, jsonb_build_array(demo.e('observation', cc, null, demo.ago(36 * day), pg_temp.nyha('III', 'oedema: to the knees · lying flat: 2 pillows or more')),
    demo.e('vitals', cc, null, demo.ago(36 * day), demo.vitals(104, 64, 78, 36.7, null, null, 70.2)), demo.e('observation', cc, null, demo.ago(36 * day), pg_temp.dry(70)),
    demo.e('score', cc, null, demo.ago(36 * day), demo.score('cardiology.chadsvasc', '{"chf":true,"htn":true,"age":"65to74","dm":true,"stroke":false,"vascular":false,"female":true}'))));
  -- 26 days ago: K, creatinine and eGFR from the laboratory
  lab := gen_random_uuid();
  perform demo.w(wael, jsonb_build_array(demo.lab_order('creat', cc, null, demo.ago(26 * day + 60), lab)));
  perform demo.lab(lab, demo.ago(26 * day + 50), jsonb_build_object('status', 'final', 'service', demo.service('creat') - 'code', 'analytes', jsonb_build_array(
    demo.analyte('creat', 'Creatinine', '2160-0', 1.2, 'mg/dL', 'mg/dL', 0.5, 1.1), demo.analyte('k', 'Potassium', '2823-3', 4.9, 'mmol/L', 'mmol/L', 3.5, 5.0),
    demo.analyte('egfr', 'eGFR (CKD-EPI 2021)', '98979-8', 48, 'mL/min/1.73m²', 'mL/min/{1.73_m2}', 60, null))));
  v := demo.arrive('Heart failure follow-up', 20, cc);
  perform demo.w(wael, jsonb_build_array(demo.e('vitals', cc, v, demo.ago(14), demo.vitals(108, 66, 72, 36.6, 96, 16, 71.4))));
  perform demo.consult(v, 8, '[]'::jsonb, null, false, cc, wael);

  -- Heba: pregnant 24 weeks, a murmur heard at General Practice: an echo asked, to do
  perform demo.patient(demo.id('cardiology', 'patient:heba'), array['Heba'], 'Abdelwahab', 'female', demo.born(31, 200), '+201147729508');
  perform demo.w(dr, jsonb_build_array(demo.e('pregnancy', gp, null, demo.ago(30), jsonb_build_object('status', 'current', 'pregnant', true, 'weeks', 24))));
  perform demo.w(dr, pg_temp.echo_order(gp, null, 12, gen_random_uuid(), 'murmur · pregnant 24 w'));
end $$;
