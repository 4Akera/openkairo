-- The lungs pack's day (spec/openCare.md §5.1 rule 9, §5.7): its own patients at the Chest clinic. Abdelhamid Mansy (61, 170 cm,
-- COPD, an ex-smoker of 40 pack-years) is in consult: GOLD E five weeks ago (CAT 18, mMRC 2; two flares this year, one admitted four
-- days), his spirometry a year ago (FEV1 1.78 L after salbutamol, 58 %), Ultibro and Farcolin, his Breezhaler technique wrong last time,
-- eosinophils 180, flu vaccine this season, pneumococcal never; his action plan in Arabic. Nermeen Saleh (34, 160 cm, asthma, ACT 17
-- two months ago, on Symbicort) waits. Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('lungs');

create or replace function pg_temp.term(code text, display text) returns jsonb language sql immutable as $$ select demo.concept('lungs.terms', code, display) $$;
create or replace function pg_temp.obs(code text, display text, txt text, note text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('code', pg_temp.term(code, display), 'value', jsonb_build_object('text', txt), 'note', note))
$$;
create or replace function pg_temp.l(k text, nm text, v numeric, lo numeric, loinc text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('key', k, 'name', nm, 'code', case when loinc is not null then jsonb_build_object('system', 'loinc', 'code', loinc, 'display', nm) end,
    'value', case when k like 'ratio%' then jsonb_build_object('value', v::text, 'unit', '', 'ucum', '{ratio}') else demo.q(v, 'L', 'L') end,
    'interpretation', case when v < lo then 'L' else 'N' end,
    'range', jsonb_build_object('low', case when k like 'ratio%' then jsonb_build_object('value', lo::text, 'unit', '', 'ucum', '{ratio}') else demo.q(lo, 'L', 'L') end)))
$$;

-- an inhaled medicine: its dose in its own unit (a capsule, a puff), no route by mouth
create or replace function pg_temp.inh(drug text, atc text, n numeric, unit text, ucum text, timing text, instructions text, prn boolean default false) returns jsonb language sql immutable as $$
  select jsonb_build_object('basis', 'prescribed', 'drug', demo.concept('atc', atc, drug), 'status', 'active', 'instructions', instructions,
    'dosage', jsonb_strip_nulls(jsonb_build_object('dose', demo.q(n, unit, ucum), 'route', 'inhaled', 'timing', case when timing is not null then jsonb_build_object('code', timing) end,
      'as_needed', case when prn then true end, 'as_needed_for', case when prn then 'breathlessness' end)))
$$;

do $$
declare cc uuid := demo.id('lungs', 'clinic'); dd uuid := demo.id('lungs', 'physician'); day int := 60 * 24; v uuid; o uuid;
begin
  perform demo.patient(demo.id('lungs', 'patient:abdelhamid'), array['Abdelhamid'], 'Mansy', 'male', demo.born(61, 100), '+201005528841');
  perform demo.w(dd, jsonb_build_array(
    demo.e('problem', cc, null, demo.ago(400 * day), demo.problem('J44.9', 'COPD')),
    demo.e('observation', cc, null, demo.ago(400 * day), jsonb_build_object('code', demo.concept('loinc', '72166-2', 'Tobacco smoking status'), 'value', jsonb_build_object('text', 'ex-smoker'),
      'note', '40 pack-years · stopped 2023')),
    demo.e('medication', cc, null, demo.ago(330 * day), pg_temp.inh('Ultibro Breezhaler (indacaterol/glycopyrronium)', 'R03AL04', 1, 'capsule', '{cap}', 'OD', '1 capsule each morning')),
    demo.e('medication', cc, null, demo.ago(330 * day), pg_temp.inh('Farcolin (salbutamol) inhaler', 'R03AC02', 2, 'puffs', '{puff}', null, '2 puffs when needed, about 3 times a week', true))));
  -- his spirometry a year ago
  perform demo.w(dd, jsonb_build_array(demo.e('vitals', cc, null, demo.ago(365 * day), demo.vitals(132, 80, 84, 36.8, 94, 18, 76, 170)),
    demo.e('result', cc, null, demo.ago(365 * day), jsonb_build_object('status', 'final', 'code', pg_temp.term('spirometry', 'Spirometry') || '{"text":"Spirometry · before and after salbutamol"}',
      'conclusion', 'obstruction: FEV1/FVC 0.59 under the LLN 0.65 · not reversible: +80 mL, +5 % · GOLD 2: FEV1 58 % of predicted · GLI-2012',
      'analytes', jsonb_build_array(pg_temp.l('fev1', 'FEV1 before', 1.70, 2.30, '20150-9'), pg_temp.l('fvc', 'FVC before', 2.95, 3.07, '19870-5'), pg_temp.l('ratio', 'FEV1/FVC before', 0.58, 0.65, '19926-5'),
        pg_temp.l('fev1_post', 'FEV1 after', 1.78, 2.30), pg_temp.l('fvc_post', 'FVC after', 3.02, 3.07), pg_temp.l('ratio_post', 'FEV1/FVC after', 0.59, 0.65),
        jsonb_build_object('key', 'fev1_pct', 'name', 'FEV1 % predicted', 'value', demo.q(58, '%', '%')), jsonb_build_object('key', 'quality', 'name', 'Quality', 'text', 'A'),
        jsonb_build_object('key', 'height', 'name', 'Height', 'value', demo.q(170, 'cm', 'cm')))))));
  -- two flares this year: one at home, one admitted
  perform demo.w(dd, jsonb_build_array(demo.e('observation', cc, null, demo.ago(330 * day), pg_temp.obs('flare', 'Flare', 'prednisolone 5 days', 'at home'))));
  perform demo.w(dd, jsonb_build_array(demo.e('observation', cc, null, demo.ago(240 * day), pg_temp.obs('flare', 'Flare', 'prednisolone · Augmentin', 'admitted 4 days'))));
  -- five weeks ago: the scores, the technique wrong, his action plan
  perform demo.w(dd, jsonb_build_array(
    demo.e('score', cc, null, demo.ago(36 * day), demo.score('lungs.cat', '{"cough":"3","phlegm":"3","tight":"2","breath":"4","home":"2","confidence":"1","sleep":"1","energy":"2"}')),
    demo.e('score', cc, null, demo.ago(36 * day), demo.score('lungs.mmrc', '{"grade":"2"}')),
    demo.e('score', cc, null, demo.ago(36 * day), demo.score('lungs.gold', '{"symptoms":"more","flares":"many"}')),
    demo.e('observation', cc, null, demo.ago(36 * day), pg_temp.obs('inhaler_technique', 'Inhaler technique', 'Breezhaler: breathed out into it · shown again')),
    demo.e('observation', cc, null, demo.ago(36 * day), pg_temp.obs('action_plan', 'Action plan',
      E'every day: كل يوم: ألتيبرو كبسولة واحدة الصبح، وفاركولين بختين لما تنهج\nworse: لو النهجان زاد أو البلغم كتر أو لونه اتغيّر: فاركولين بختين كل ٤ ساعات، وابدأ بريدنيزولون ٤٠ مجم الصبح ٥ أيام، وكلّم العيادة\nemergency: لو مش قادر تتكلم من النهجان، أو شفايفك زرقا، أو مش قادر تنام: روح الطوارئ على طول'))));
  -- eosinophils 26 days ago; the flu vaccine this season
  o := gen_random_uuid();
  perform demo.w(dd, jsonb_build_array(demo.lab_order('cbc', cc, null, demo.ago(26 * day + 60), o)));
  perform demo.lab(o, demo.ago(26 * day + 50), jsonb_build_object('status', 'final', 'service', demo.service('cbc') - 'code', 'analytes', jsonb_build_array(
    demo.analyte('hb', 'Haemoglobin', '718-7', 14.6, 'g/dL', 'g/dL', 13.5, 17.5, 7, 20), demo.analyte('wbc', 'WBC', '6690-2', 8.1, '10^9/L', '10*3/uL', 4, 11, 1, 30),
    demo.analyte('eos', 'Eosinophils', '711-2', 180, '/µL', '/uL', 0, 500))));
  perform demo.w(dd, jsonb_build_array(demo.e('given', cc, null, demo.ago(17 * day), jsonb_build_object('status', 'completed', 'drug', demo.concept('atc', 'J07BB02', 'Influenza vaccine'),
    'dose', demo.q(0.5, 'mL', 'mL'), 'route', 'im', 'site', 'left deltoid'))));
  v := demo.arrive('COPD follow-up', 25, cc);
  perform demo.w(dd, jsonb_build_array(demo.e('vitals', cc, v, demo.ago(18), demo.vitals(134, 82, 88, 36.9, 94, 20, 75, 170))));
  perform demo.consult(v, 12, '[]'::jsonb, null, false, cc, dd);

  -- Nermeen: asthma since her teens, ACT 17 two months ago, on Symbicort; waiting
  perform demo.patient(demo.id('lungs', 'patient:nermeen'), array['Nermeen'], 'Saleh', 'female', demo.born(34, 60), '+201117730452');
  perform demo.w(dd, jsonb_build_array(
    demo.e('problem', cc, null, demo.ago(700 * day), demo.problem('J45.9', 'Asthma')),
    demo.e('medication', cc, null, demo.ago(300 * day), pg_temp.inh('Symbicort Turbuhaler 160/4.5', 'R03AK07', 1, 'puff', '{puff}', 'BID', '1 puff twice a day, and 1 when needed')),
    demo.e('vitals', cc, null, demo.ago(60 * day), demo.vitals(118, 74, 80, 36.8, 98, 16, 63, 160)),
    demo.e('score', cc, null, demo.ago(60 * day), demo.score('lungs.act', '{"work":"4","breath":"3","night":"3","reliever":"3","control":"4"}'))));
  v := demo.arrive('Asthma follow-up', 9, cc);
end $$;
