-- The oncology pack's day (spec/openCare.md §5.1 rule 9, §5.7; the pictures #onc-plan, #onc-cycle, #onc-unit). Its own patients:
-- Wafaa Shaker (47, left breast cancer IIB after a mastectomy; AC 1 and AC 2 given, febrile neutropenia after AC 2; in consult with Dr.
-- Hesham now for AC 3, today's height, weight and blood counts in), Samir Tolba (61, sigmoid colon cancer; FOLFOX cycle 5 signed for
-- today, in Chair 2 for 40 minutes) and Nesma Sabry (39, breast cancer; weekly paclitaxel 3 signed for today, here and weighed, not in a
-- chair yet: a row under the board). Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('oncology');

create or replace function pg_temp.cycle_svc() returns jsonb language sql immutable as $$
  select jsonb_build_object('id', core.setup_id(demo.id('oncology', 'day_unit'), 'service', 'chemo'), 'code', 'chemo', 'name', 'Chemotherapy cycle')
$$;
-- a cycle to the day unit, due on a day, with oncology's words
create or replace function pg_temp.cycle(p_min int, p_due int, p_words jsonb, p_id uuid) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('oncology.cycle', demo.id('oncology', 'clinic'), null, demo.ago(p_min), jsonb_build_object('service', pg_temp.cycle_svc(),
    'department_id', demo.id('oncology', 'day_unit'), 'priority', 'routine', 'status', 'active', 'due', demo.ago(p_due), 'oncology', p_words), p_id))
$$;
-- the day unit's note that answers a cycle given
create or replace function pg_temp.given(p_order uuid, p_min int, p_text text) returns jsonb language sql as $$
  select jsonb_build_array(demo.e('note', demo.id('oncology', 'day_unit'), null, demo.ago(p_min), demo.note('nursing', p_text), null, p_order, 'answers'))
$$;
-- a toxicity, CTCAE v5 graded (the base's observation)
create or replace function pg_temp.tox(p_min int, p_code text, p_term text, p_grade int, p_note text default null) returns jsonb language sql as $$
  select demo.e('observation', demo.id('oncology', 'clinic'), null, demo.ago(p_min), jsonb_strip_nulls(jsonb_build_object('code', demo.concept('oncology.ctcae', p_code, p_term),
    'value', jsonb_build_object('quantity', demo.q(p_grade, 'grade', '{score}')), 'method', 'CTCAE v5', 'note', p_note)))
$$;
create or replace function pg_temp.ecog(p_min int, p_v int) returns jsonb language sql as $$
  select demo.e('observation', demo.id('oncology', 'clinic'), null, demo.ago(p_min), jsonb_build_object('code', demo.concept('loinc', '89247-1', 'ECOG performance status'),
    'value', jsonb_build_object('quantity', demo.q(p_v, 'score', '{score}'))))
$$;
-- a blood count with its neutrophils, from the Laboratory (the bench's own steps), and the chemistry
create or replace function pg_temp.counts(female boolean, hb numeric, wbc numeric, anc numeric, plt numeric) returns jsonb language sql immutable as $$
  select demo.cbc(female, hb, wbc, plt) || jsonb_build_object('analytes', (demo.cbc(female, hb, wbc, plt) -> 'analytes')
    || jsonb_build_array(demo.analyte('anc', 'Neutrophils', '751-8', anc, '10^9/L', '10*3/uL', 2, 7.5, 0.5)))
$$;

do $$
declare onc uuid := demo.id('oncology', 'clinic'); unit uuid := demo.id('oncology', 'day_unit'); dr uuid := demo.id('oncology', 'oncologist');
  nurse uuid := demo.id('oncology', 'nurse'); day int := 60 * 24; v uuid; s uuid; c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid(); l1 uuid := gen_random_uuid(); l2 uuid := gen_random_uuid(); l3 uuid := gen_random_uuid(); l4 uuid := gen_random_uuid();
  ac jsonb := '[{"drug":"Doxorubicin","per":60,"basis":"m2","unit":"mg","how":"IV push over 10 min, into running saline"},{"drug":"Cyclophosphamide","per":600,"basis":"m2","unit":"mg","how":"IV in 500 mL saline over 60 min"}]';
begin
  -- ── Wafaa: the cancer's record (26 Aug), the tumour board's decision, AC 1 and AC 2, febrile neutropenia after AC 2; today in consult ──
  perform demo.patient(demo.id('oncology', 'patient:wafaa'), array['Wafaa'], 'Shaker', 'female', demo.born(47, 210), '+201006637120');
  perform demo.w(dr, jsonb_build_array(demo.e('note', onc, null, demo.ago(49 * day), demo.note('plan',
    E'Tumour board · the decision (Dr. Ayman Sobhi · Dr. Hesham Abdallah · Dr. Hanan Bayoumi · Dr. Mostafa Ragheb · Dr. Rehab Anwar)\n'
    'Left breast, invasive carcinoma NST, grade 3 · pT2 pN1a (2 of 14) M0 · ER 90 % PR 60 % HER2 negative · Ki-67 35 %. CT and bone scan clear.\n'
    'Adjuvant AC × 4 then weekly paclitaxel × 12, then chest wall and nodal radiotherapy, then tamoxifen. Echo before the first cycle.'))));
  perform demo.w(dr, jsonb_build_array(demo.e('observation', onc, null, demo.ago(49 * day), jsonb_build_object('code', demo.concept('loinc', '10230-1', 'Left ventricular ejection fraction'),
    'value', jsonb_build_object('quantity', demo.q(64, '%', '%')), 'method', 'echocardiography', 'note', 'echo before the first cycle'))));
  perform demo.w(dr, jsonb_build_array(
    demo.e('oncology.cancer', onc, null, demo.ago(43 * day), demo.problem('C50.4', 'Breast cancer, left, upper outer') || jsonb_build_object('laterality', 'left',
      'onset', jsonb_build_object('value', to_char((demo.now() at time zone 'Africa/Cairo')::date - 75, 'YYYY-MM'), 'precision', 'month'),
      'oncology', jsonb_build_object('site', 'breast', 'side', 'left',
        'morphology', demo.concept('oncology.icdo3', '8500/3', 'Invasive carcinoma of no special type'), 'grade', '3',
        'tnm', jsonb_build_object('t', 'pT2 (3.2 cm)', 'n', 'pN1a (2 of 14 nodes)', 'm', 'M0', 'edition', 'AJCC 8th'), 'stage', 'IIB',
        'markers', '[{"name":"ER","value":"90 %"},{"name":"PR","value":"60 %"},{"name":"HER2","value":"1+ (negative)"},{"name":"Ki-67","value":"35 %"}]'::jsonb,
        'intent', 'curative', 'regimen', 'AC → paclitaxel weekly',
        'plan', jsonb_build_array(jsonb_build_object('step', 'operation', 'status', 'done', 'text', 'left mastectomy and axillary clearance · ' || to_char((demo.now() at time zone 'Africa/Cairo')::date - 64, 'DD Mon') || ' · Dr. Ayman Sobhi'),
          '{"step":"chemotherapy","status":"now","text":"AC × 4 every 21 days, then paclitaxel weekly × 12"}'::jsonb,
          '{"step":"radiotherapy","status":"todo","text":"chest wall and nodes · 4 weeks after the last paclitaxel"}'::jsonb,
          '{"step":"endocrine","status":"todo","text":"tamoxifen · 5 years at least"}'::jsonb)))),
    pg_temp.ecog(43 * day, 0)));
  -- AC 1, 42 days ago (74 kg), and AC 2, 21 days ago (73 kg): given in the day unit
  perform demo.w(dr, pg_temp.cycle(42 * day + 120, 42 * day, jsonb_build_object('regimen', 'ac', 'name', 'AC', 'cycle', 1, 'of', 4, 'day', 1, 'height', 158, 'weight', 74,
    'bsa', 1.80, 'percent', 100, 'decision', 'give', 'doses', '[{"drug":"Doxorubicin","per":60,"basis":"m2","worked":108,"dose":108,"unit":"mg"},{"drug":"Cyclophosphamide","per":600,"basis":"m2","worked":1080,"dose":1080,"unit":"mg"}]'::jsonb), c1));
  perform demo.w(nurse, pg_temp.given(c1, 42 * day - 240, 'AC 1 given in Chair 3: doxorubicin 108 mg, cyclophosphamide 1 080 mg; no reaction.'));
  perform demo.w(dr, jsonb_build_array(pg_temp.tox(21 * day + 130, '10028813', 'Nausea', 2, 'ate less for 4 days')));
  perform demo.w(dr, pg_temp.cycle(21 * day + 120, 21 * day, jsonb_build_object('regimen', 'ac', 'name', 'AC', 'cycle', 2, 'of', 4, 'day', 1, 'height', 158, 'weight', 73,
    'bsa', 1.79, 'percent', 100, 'decision', 'give', 'toxicity', '[{"term":"Nausea","grade":2}]'::jsonb,
    'doses', '[{"drug":"Doxorubicin","per":60,"basis":"m2","worked":107.4,"dose":107,"unit":"mg"},{"drug":"Cyclophosphamide","per":600,"basis":"m2","worked":1074,"dose":1070,"unit":"mg"}]'::jsonb), c2));
  perform demo.w(nurse, pg_temp.given(c2, 21 * day - 240, 'AC 2 given in Chair 5: doxorubicin 107 mg, cyclophosphamide 1 070 mg; no reaction.'));
  -- febrile neutropenia after AC 2 (admitted 23–26 Sep elsewhere in the hospital)
  perform demo.w(dr, jsonb_build_array(demo.e('problem', onc, null, demo.ago(15 * day), demo.problem('D70.1', 'Febrile neutropenia after AC 2', '{"note":"admitted for 3 days · ANC 0.3 · 38.6 °C"}'))));
  -- today: blood counts and chemistry at 08:10, then the visit
  perform demo.w(dr, jsonb_build_array(demo.lab_order('cbc', onc, null, demo.ago(200), l1), demo.lab_order('creat', onc, null, demo.ago(200), l2), demo.e('order', onc, null, demo.ago(200), jsonb_build_object('service', jsonb_build_object('id', core.setup_id(demo.base('lab'), 'service', 'lft'), 'code', 'lft', 'name', 'Liver function'), 'department_id', demo.base('lab'), 'priority', 'routine', 'status', 'active'), l3)));
  perform demo.lab(l1, demo.ago(190), pg_temp.counts(true, 11.2, 4.6, 2.1, 168));
  perform demo.lab(l2, demo.ago(190), demo.creat(0.8));
  perform demo.lab(l3, demo.ago(190), jsonb_build_object('status', 'final', 'service', jsonb_build_object('name', 'Liver function'), 'analytes', jsonb_build_array(
    demo.analyte('alt', 'ALT', '1742-6', 24, 'U/L', 'U/L', 7, 56), demo.analyte('tbil', 'Total bilirubin', '1975-2', 0.6, 'mg/dL', 'mg/dL', 0.1, 1.2))));
  v := demo.arrive('AC cycle 3', 45, onc);
  perform demo.consult(v, 14, jsonb_build_array(demo.e('vitals', onc, v, demo.ago(12), demo.vitals(118, 72, 84, 36.7, 98, null, 72, 158))), null, false, onc, dr);

  -- ── Samir: sigmoid colon cancer, FOLFOX 5 signed this morning for today, in Chair 2 for 40 minutes ──
  perform demo.patient(demo.id('oncology', 'patient:samir'), array['Samir'], 'Tolba', 'male', demo.born(61, 80), '+201224418306');
  perform demo.w(dr, jsonb_build_array(demo.e('oncology.cancer', onc, null, demo.ago(80 * day), demo.problem('C18.7', 'Sigmoid colon cancer') || jsonb_build_object(
    'oncology', '{"site":"colon","morphology":{"text":"Adenocarcinoma","codings":[{"system":"oncology.icdo3","code":"8140/3","display":"Adenocarcinoma"}]},"grade":"2",
      "tnm":{"t":"pT3","n":"pN1b (3 of 18)","m":"M0","edition":"AJCC 8th"},"stage":"IIIB","intent":"curative","regimen":"FOLFOX × 12",
      "plan":[{"step":"operation","status":"done","text":"sigmoid colectomy"},{"step":"chemotherapy","status":"now","text":"FOLFOX every 14 days × 12"}]}'::jsonb)), pg_temp.ecog(80 * day, 1)));
  perform demo.w(dr, jsonb_build_array(demo.lab_order('cbc', onc, null, demo.ago(1 * day + 100), l4)));
  perform demo.lab(l4, demo.ago(1 * day + 90), pg_temp.counts(false, 12.8, 5.9, 3.4, 212));
  perform demo.w(dr, pg_temp.cycle(1 * day, 60, jsonb_build_object('regimen', 'folfox', 'name', 'FOLFOX', 'cycle', 5, 'of', 12, 'day', 1, 'height', 172, 'weight', 81, 'bsa', 1.97,
    'percent', 100, 'decision', 'give', 'toxicity', '[{"term":"Peripheral sensory neuropathy","grade":1}]'::jsonb,
    'doses', '[{"drug":"Oxaliplatin","per":85,"basis":"m2","worked":167.5,"dose":170,"unit":"mg"},{"drug":"Calcium folinate","per":400,"basis":"m2","worked":788,"dose":790,"unit":"mg"},{"drug":"Fluorouracil","per":400,"basis":"m2","worked":788,"dose":790,"unit":"mg"},{"drug":"Fluorouracil","per":2400,"basis":"m2","worked":4728,"dose":4750,"unit":"mg","how":"by pump over 46 h"}]'::jsonb), c3));
  s := gen_random_uuid();
  perform demo.w(nurse, jsonb_build_array(demo.e('admitted', unit, s, demo.ago(40), jsonb_build_object('department_id', unit, 'admit_source', 'outp',
    'place_id', core.setup_id(unit, 'place', 'chair_2'), 'reason', 'colon cancer'), s)));

  -- ── Nesma: breast cancer on weekly paclitaxel; week 3 signed for today; here at 12:30, weighed, not in a chair yet ──
  perform demo.patient(demo.id('oncology', 'patient:nesma'), array['Nesma'], 'Sabry', 'female', demo.born(39, 300), '+201117730452');
  perform demo.w(dr, jsonb_build_array(demo.e('oncology.cancer', onc, null, demo.ago(120 * day), demo.problem('C50.4', 'Breast cancer, right') || jsonb_build_object('laterality', 'right',
    'oncology', '{"site":"breast","side":"right","morphology":{"text":"Invasive carcinoma of no special type","codings":[{"system":"oncology.icdo3","code":"8500/3","display":"Invasive carcinoma of no special type"}]},"grade":"2",
      "tnm":{"t":"pT1c","n":"pN1a (1 of 12)","m":"M0","edition":"AJCC 8th"},"stage":"IIA","markers":[{"name":"ER","value":"80 %"},{"name":"PR","value":"40 %"},{"name":"HER2","value":"0"}],
      "intent":"curative","regimen":"AC → paclitaxel weekly",
      "plan":[{"step":"operation","status":"done","text":"wide local excision and sentinel nodes"},{"step":"chemotherapy","status":"now","text":"AC × 4 done; paclitaxel weekly × 12"},{"step":"radiotherapy","status":"todo","text":"breast and nodes"}]}'::jsonb)), pg_temp.ecog(120 * day, 0)));
  perform demo.w(dr, pg_temp.cycle(1 * day + 30, 15, jsonb_build_object('regimen', 'pacw', 'name', 'Paclitaxel weekly', 'cycle', 3, 'of', 12, 'day', 1, 'height', 163, 'weight', 64, 'bsa', 1.70,
    'percent', 100, 'decision', 'give', 'doses', '[{"drug":"Paclitaxel","per":80,"basis":"m2","worked":136,"dose":136,"unit":"mg"}]'::jsonb), c4));
end $$;
