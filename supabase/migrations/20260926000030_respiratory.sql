-- 30 · the respiratory pack (spec/openCare.md §5.7; the picture /pictures.html#chest-spiro). It adds no record type: spirometry is the
-- base's result (FEV1, FVC and FEV1/FVC before and after the bronchodilator, each an analyte; the predicted, LLN and z worked out by the
-- server from GLI-2012), CAT, mMRC, ACT and the GOLD group are declared scores, the inhaler technique, the smoking, a flare and the action
-- plan are the base's observations in the pack's terms. Its own: its terms, the GLI-2012 reference list (here a demo sample, marked so:
-- the full list is loaded by import script), the operation that works out the predicted values, its starter setup and its role.

set client_min_messages = warning;

select core.declare_pack('respiratory', 1, '{}', '{"en":"Respiratory","ar":"الأمراض الصدرية"}', role_block => 'e6');
select core.create_pack('respiratory');

insert into core.codes (system, code, labels, props) select 'loinc', c, jsonb_build_object('en', l), p::jsonb from (values
  ('20150-9', 'FEV1', '{"ucum":"L"}'), ('19870-5', 'FVC', '{"ucum":"L"}'), ('19926-5', 'FEV1/FVC', '{"ucum":"{ratio}"}'), ('711-2', 'Eosinophils', '{"ucum":"/uL"}')
) v(c, l, p) on conflict do nothing;
-- the vaccines its section reads, beside the base's ATC subset
insert into core.codes (system, code, labels) values ('atc', 'J07BB02', '{"en":"Influenza vaccine (inactivated, split or subunit)"}'),
  ('atc', 'J07AL02', '{"en":"Pneumococcal conjugate vaccine"}'), ('atc', 'J07AL01', '{"en":"Pneumococcal polysaccharide vaccine"}') on conflict do nothing;
select core.declare_system('respiratory.terms', 'respiratory', 'code', '{canon}/CodeSystem/respiratory', null, false, null, 'openCare', '{"en":"Respiratory terms"}');

-- GLI-2012 (Quanjer PH et al., Eur Respir J 2012;40:1324–1343): each code a cell, sex:age:height, its props each measure's M (predicted),
-- L and S. The demo carries a sample: the cells of its own patients, as the GLI-2012 calculator gives them, never the full list; the
-- full tables come in by import script (scripts/import-codes.sh respiratory.gli2012 …), and a cell outside it is said, never guessed
select core.declare_system('respiratory.gli2012', 'respiratory', 'code', 'https://www.ers-education.org/guidelines/global-lung-function-initiative', '2012', true, null,
  'GLI-2012, ERS Global Lung Function Initiative: free to use with attribution', '{"en":"GLI-2012 spirometry reference"}');
insert into core.codes (system, code, labels, props) values
  ('respiratory.gli2012', 'male:61:170', '{"en":"Male · 61 years · 170 cm"}',
   '{"fev1":{"m":3.05,"l":1.0,"s":0.1495},"fvc":{"m":3.98,"l":1.0,"s":0.1390},"ratio":{"m":0.77,"l":1.0,"s":0.0948}}'),
  ('respiratory.gli2012', 'female:34:160', '{"en":"Female · 34 years · 160 cm"}',
   '{"fev1":{"m":2.95,"l":1.0,"s":0.1210},"fvc":{"m":3.47,"l":1.0,"s":0.1170},"ratio":{"m":0.85,"l":1.0,"s":0.0560}}')
on conflict do nothing;
select core.record_import('respiratory.gli2012', '2012', 'demo sample: the cells of the demo''s patients only', true);

set role pack_respiratory;
-- the predicted values for an age, a height and a sex, from the loaded list: the cell of this sex nearest in age (within 2 years) and height
-- (within 3 cm); a cell not loaded says so (missing), never a guess. Pure: reads the list through the codes door
create function respiratory.predicted(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_sex text := p_args ->> 'sex'; v_age int := round((p_args ->> 'age')::numeric); v_ht int := round((p_args ->> 'height')::numeric); c record;
begin
  if v_sex is null or v_sex not in ('male', 'female') or v_age is null or v_ht is null then return jsonb_build_object('missing', 'age, height and sex'); end if;
  select x.code, x.props into c
    from core.pack_codes('respiratory.gli2012', array(select v_sex || ':' || a || ':' || h from generate_series(v_age - 2, v_age + 2) a, generate_series(v_ht - 3, v_ht + 3) h)) x
   where not x.retired order by abs(split_part(x.code, ':', 2)::int - v_age), abs(split_part(x.code, ':', 3)::int - v_ht) limit 1;
  if c.code is null then return jsonb_build_object('missing', 'not in the loaded GLI-2012 list'); end if;
  return jsonb_build_object('cell', c.code, 'fev1', c.props -> 'fev1', 'fvc', c.props -> 'fvc', 'ratio', c.props -> 'ratio', 'source', 'GLI-2012');
end $$;
reset role;
select core.declare_op('respiratory.predicted', 'respiratory', 'respiratory.predicted(uuid,uuid,uuid,jsonb)', 'write:result');

-- the scores (rule 8): the server adds them up; each offered where the department uses the pack, by its alias
select core.declare_score('respiratory.cat', 'respiratory', '2009', 'Jones PW, Harding G, Berry P, Wiklund I, Chen WH, Kline Leidy N. Development and first validation of the COPD Assessment Test. Eur Respir J 2009;34:648–654',
  (select jsonb_agg(jsonb_build_object('key', k, 'labels', jsonb_build_object('en', l), 'input', 'choice', 'choices',
     (select jsonb_agg(jsonb_build_object('value', n::text, 'points', n, 'labels', jsonb_build_object('en', case n when 0 then lo when 5 then hi else n::text end)) order by n) from generate_series(0, 5) n)) order by i)
   from (values (1, 'cough', 'Cough', 'I never cough', 'I cough all the time'), (2, 'phlegm', 'Phlegm', 'No phlegm at all', 'My chest is full of phlegm'),
     (3, 'tight', 'Chest tightness', 'Not tight at all', 'Very tight'), (4, 'breath', 'Breathless on a hill or a flight of stairs', 'Not breathless', 'Very breathless'),
     (5, 'home', 'Activities at home', 'Not limited', 'Very limited'), (6, 'confidence', 'Confident leaving home', 'Confident', 'Not at all confident'),
     (7, 'sleep', 'Sleep', 'Sleep soundly', 'Do not sleep soundly'), (8, 'energy', 'Energy', 'Lots of energy', 'No energy at all')) x(i, k, l, lo, hi)),
  '[{"key":"low","labels":{"en":"Low impact"},"min":0,"max":9,"tone":null},{"key":"medium","labels":{"en":"Medium impact"},"min":10,"max":20,"tone":"warn"},
    {"key":"high","labels":{"en":"High impact"},"min":21,"max":30,"tone":"warn"},{"key":"very_high","labels":{"en":"Very high impact"},"min":31,"max":40,"tone":"danger"}]',
  '{"en":"COPD Assessment Test","ar":"اختبار تقييم الانسداد الرئوي"}', 'CAT', 'cat');
select core.declare_score('respiratory.mmrc', 'respiratory', '1999', 'Bestall JC, Paul EA, Garrod R, Garnham R, Jones PW, Wedzicha JA. Usefulness of the Medical Research Council (MRC) dyspnoea scale. Thorax 1999;54:581–586',
  '[{"key":"grade","labels":{"en":"Breathless"},"input":"choice","choices":[{"value":"0","points":0,"labels":{"en":"0 · only with strenuous exercise"}},
    {"value":"1","points":1,"labels":{"en":"1 · hurrying on the level or up a slight hill"}},{"value":"2","points":2,"labels":{"en":"2 · slower than others of the same age, or stops for breath on the level"}},
    {"value":"3","points":3,"labels":{"en":"3 · stops after about 100 m or a few minutes on the level"}},{"value":"4","points":4,"labels":{"en":"4 · too breathless to leave the house, or dressing"}}]}]',
  '[{"key":"less","labels":{"en":"Less breathless"},"min":0,"max":1,"tone":null},{"key":"more","labels":{"en":"More breathless"},"min":2,"max":4,"tone":"warn"}]',
  '{"en":"mMRC dyspnoea scale"}', 'mMRC', 'mmrc');
select core.declare_score('respiratory.act', 'respiratory', '2004', 'Nathan RA, Sorkness CA, Kosinski M, et al. Development of the Asthma Control Test. J Allergy Clin Immunol 2004;113:59–65',
  (select jsonb_agg(jsonb_build_object('key', k, 'labels', jsonb_build_object('en', l), 'input', 'choice', 'choices',
     (select jsonb_agg(jsonb_build_object('value', n::text, 'points', n, 'labels', jsonb_build_object('en', (string_to_array(w, '|'))[n])) order by n) from generate_series(1, 5) n)) order by i)
   from (values (1, 'work', 'Kept from getting things done (4 weeks)', 'All of the time|Most of the time|Some of the time|A little of the time|None of the time'),
     (2, 'breath', 'Short of breath (4 weeks)', 'More than once a day|Once a day|3 to 6 times a week|Once or twice a week|Not at all'),
     (3, 'night', 'Woken at night or early (4 weeks)', '4 or more nights a week|2 or 3 nights a week|Once a week|Once or twice|Not at all'),
     (4, 'reliever', 'Reliever used (4 weeks)', '3 or more times a day|1 or 2 times a day|2 or 3 times a week|Once a week or less|Not at all'),
     (5, 'control', 'Your asthma control (4 weeks)', 'Not controlled at all|Poorly controlled|Somewhat controlled|Well controlled|Completely controlled')) x(i, k, l, w)),
  '[{"key":"very_poor","labels":{"en":"Very poorly controlled"},"min":5,"max":15,"tone":"danger"},{"key":"not_well","labels":{"en":"Not well controlled"},"min":16,"max":19,"tone":"warn"},
    {"key":"well","labels":{"en":"Well controlled"},"min":20,"max":25,"tone":"ok"}]',
  '{"en":"Asthma Control Test","ar":"اختبار السيطرة على الربو"}', 'ACT', 'act');
select core.declare_score('respiratory.gold', 'respiratory', '2023', 'Global Initiative for Chronic Obstructive Lung Disease. Global strategy for the diagnosis, management and prevention of COPD, 2023 report: the ABE assessment',
  '[{"key":"symptoms","labels":{"en":"Symptoms"},"input":"choice","choices":[{"value":"fewer","points":0,"labels":{"en":"mMRC 0–1 and CAT under 10"}},{"value":"more","points":1,"labels":{"en":"mMRC 2 or more, or CAT 10 or more"}}]},
    {"key":"flares","labels":{"en":"Flares in the last year"},"input":"choice","choices":[{"value":"few","points":0,"labels":{"en":"0 or 1 moderate, none in hospital"}},{"value":"many","points":2,"labels":{"en":"2 or more moderate, or 1 in hospital"}}]}]',
  '[{"key":"a","labels":{"en":"A"},"min":0,"max":0,"tone":null},{"key":"b","labels":{"en":"B"},"min":1,"max":1,"tone":"info"},{"key":"e","labels":{"en":"E"},"min":2,"max":3,"tone":"warn"}]',
  '{"en":"GOLD group (ABE)"}', 'GOLD group', 'gold');

-- its starter setup (§5.2): the Chest clinic, the base's queue, the pack ticked
select core.declare_setup('respiratory.clinic', 'respiratory', 'visits', '{"en":"Chest clinic"}', packs => array['respiratory'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  help => '{"en":"Asthma and COPD: spirometry worked out against GLI-2012 (/spiro), CAT, mMRC, ACT and the GOLD group, the inhaler technique, the action plan in Arabic."}');
select core.declare_role('00000000-0000-0000-0000-00000000e601', 'respiratory.chest_physician', 'respiratory', 'Chest physician', '{}', '{"en":"Chest physician"}',
  built_on => '00000000-0000-0000-0000-00000000c002');
