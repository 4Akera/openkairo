-- 28 · the cardio pack (spec/openCare.md §5.8; the pictures /pictures.html#cardio-ecg, #cardio-echo, #cardio-hf). It adds no record type:
-- the ECG read in the clinic is the base's result with no order (LOINC 11524-6, each measure an analyte), the echo is the base's result
-- answering /echo at the Echo room (a bench department from this pack's starter setup, each measure with its range), NYHA and the dry
-- weight are the base's observations, the weight its vitals, CHA₂DS₂-VASc a declared score. Its own: the four heart failure medicine
-- groups with each medicine's target dose (a setting for the clinic, starting from ESC 2021), its terms, its two starter setups.

set client_min_messages = warning;

select core.declare_pack('cardio', 1, '{}', '{"en":"Cardiology","ar":"أمراض القلب"}', role_block => 'e4');
select core.create_pack('cardio');

-- the LOINC codes and units its entries carry, added to the base's committed subset (as radiology's were); a code already there stays
insert into core.codes (system, code, labels, props) select 'loinc', c, jsonb_build_object('en', l), p::jsonb from (values
  ('8625-6', 'P-R interval', '{"ucum":"ms"}'), ('8633-0', 'QRS duration', '{"ucum":"ms"}'), ('8636-3', 'Q-T interval corrected', '{"ucum":"ms"}'),
  ('8632-2', 'QRS axis', '{"ucum":"deg"}'), ('10230-1', 'Left ventricular ejection fraction', '{"ucum":"%"}')
) v(c, l, p) on conflict do nothing;
insert into core.codes (system, code, labels) values ('ucum', 'ms', '{"en":"millisecond"}'), ('ucum', 'deg', '{"en":"degree"}'), ('ucum', 'mL/m2', '{"en":"mL/m²"}')
  on conflict do nothing;
-- its own words for what LOINC does not name plainly: the NYHA class and the dry weight the doctor sets
select core.declare_system('cardio.terms', 'cardio', 'code', '{canon}/CodeSystem/cardio', null, false, null, 'openCare', '{"en":"Cardiology terms"}');

-- CHA₂DS₂-VASc (rule 8): the server adds it up; /chadsvasc, offered where the department uses the pack
select core.declare_score('cardio.chadsvasc', 'cardio', '2010',
  'Lip GYH, Nieuwlaat R, Pisters R, Lane DA, Crijns HJGM. Refining clinical risk stratification for predicting stroke and thromboembolism in atrial fibrillation using a novel risk factor-based approach: the Euro Heart Survey on Atrial Fibrillation. Chest 2010;137(2):263–272',
  '[{"key":"chf","labels":{"en":"Heart failure or LV dysfunction"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"htn","labels":{"en":"Hypertension"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"age","labels":{"en":"Age"},"input":"choice","choices":[{"value":"lt65","points":0,"labels":{"en":"Under 65"}},
      {"value":"65to74","points":1,"labels":{"en":"65–74"}},{"value":"ge75","points":2,"labels":{"en":"75 or over"}}]},
    {"key":"dm","labels":{"en":"Diabetes"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"stroke","labels":{"en":"Stroke, TIA or thromboembolism"},"input":"yes_no","points":{"yes":2,"no":0}},
    {"key":"vascular","labels":{"en":"Vascular disease (MI, PAD, aortic plaque)"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"female","labels":{"en":"Female"},"input":"yes_no","points":{"yes":1,"no":0}}]',
  '[{"key":"low","labels":{"en":"Low"},"min":0,"max":0,"tone":null},{"key":"intermediate","labels":{"en":"Intermediate"},"min":1,"max":1,"tone":"info"},
    {"key":"high","labels":{"en":"High: anticoagulation advised"},"min":2,"max":9,"tone":"warn"}]',
  '{"en":"CHA₂DS₂-VASc","ar":"مقياس CHA₂DS₂-VASc"}', 'CHA₂DS₂-VASc', 'chadsvasc');

-- the four groups of heart failure medicines and each medicine's target dose a day (Q32): the clinic's small table, from ESC 2021
-- (McDonagh TA et al., Eur Heart J 2021;42:3599–3726, Table 6); a medicine is matched by its ATC code, the group by its class
select core.declare_setting('cardio.hf_targets', 'cardio', 'organization',
  $j${"type":"object","additionalProperties":false,"required":["targets"],"properties":{"targets":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["group","name","atc","mg_a_day"],"properties":{"group":{"enum":["ras","bb","mra","sglt2"]},"name":{"type":"string","minLength":1},
      "atc":{"type":"string","pattern":"^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$"},"mg_a_day":{"type":"number","exclusiveMinimum":0,"maximum":2000}}},
    "default":[
      {"group":"ras","name":"Sacubitril/valsartan 97/103 mg twice","atc":"C09DX04","mg_a_day":194},{"group":"ras","name":"Ramipril 5 mg twice","atc":"C09AA05","mg_a_day":10},
      {"group":"ras","name":"Enalapril 10–20 mg twice","atc":"C09AA02","mg_a_day":40},{"group":"ras","name":"Lisinopril 20–35 mg once","atc":"C09AA03","mg_a_day":35},
      {"group":"ras","name":"Captopril 50 mg three times","atc":"C09AA01","mg_a_day":150},{"group":"ras","name":"Candesartan 32 mg once","atc":"C09CA06","mg_a_day":32},
      {"group":"ras","name":"Losartan 150 mg once","atc":"C09CA01","mg_a_day":150},{"group":"ras","name":"Valsartan 160 mg twice","atc":"C09CA03","mg_a_day":320},
      {"group":"bb","name":"Bisoprolol 10 mg once","atc":"C07AB07","mg_a_day":10},{"group":"bb","name":"Carvedilol 25 mg twice","atc":"C07AG02","mg_a_day":50},
      {"group":"bb","name":"Metoprolol succinate 200 mg once","atc":"C07AB02","mg_a_day":200},{"group":"bb","name":"Nebivolol 10 mg once","atc":"C07AB12","mg_a_day":10},
      {"group":"mra","name":"Spironolactone 50 mg once","atc":"C03DA01","mg_a_day":50},{"group":"mra","name":"Eplerenone 50 mg once","atc":"C03DA04","mg_a_day":50},
      {"group":"sglt2","name":"Dapagliflozin 10 mg once","atc":"A10BK01","mg_a_day":10},{"group":"sglt2","name":"Empagliflozin 10 mg once","atc":"A10BK03","mg_a_day":10}]}}}$j$,
  labels => '{"en":"Heart failure: target doses"}', form => 'pack',
  fields => '[{"key":"targets","labels":{"en":"Target doses"},"help":{"en":"Each medicine of the four groups by its ATC code, with its target dose a day (ESC 2021). The Heart failure section says half, at target or not on."}},
    {"key":"targets.group","labels":{"en":"Group"},"choices":{"ras":{"en":"ACEi · ARB · ARNI"},"bb":{"en":"Beta-blocker"},"mra":{"en":"MRA"},"sglt2":{"en":"SGLT2 inhibitor"}}},
    {"key":"targets.name","labels":{"en":"Medicine and target"}},{"key":"targets.atc","labels":{"en":"ATC"}},{"key":"targets.mg_a_day","labels":{"en":"mg a day"},"unit":"mg"}]');

-- its starter setups (§5.2): the Cardiology clinic (the base's queue; the pack ticked) and the Echo room (a bench answering /echo: the echo
-- as the base's result, each measure an analyte with its range by sex (ASE/EACVI 2015), the valves and wall motion as choices)
select core.declare_setup('cardio.clinic', 'cardio', 'visits', '{"en":"Cardiology clinic"}', packs => array['cardio'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  presets => '[{"name":"Heart failure visit","shortcut":"hfvisit","lines":["Since the last visit:","Examination:","Plan:"]}]',
  help => '{"en":"The cardiologist''s clinic: the ECG read here (/ecg), the echo ordered from the Echo room (/echo), heart failure visits (/hf)."}');
select core.declare_setup('cardio.echo_room', 'cardio', 'bench', '{"en":"Echo room"}', packs => array['cardio'],
  screens => '{"screens":["base.bench"],"opens":"base.bench"}',
  settings => '{"department.works_for":{"all":true},"department.review_results":{"level":"critical"}}',
  services => $j$[{"code":"echo","name":"Echo · transthoracic","section":"Echo","answer":"result","fields":[
    {"key":"lvedd","name":"LV end-diastolic diameter","kind":"number","unit":"mm","ucum":"mm","low":42,"high":58,"ranges":[{"gender":"female","low":38,"high":52},{"gender":"male","low":42,"high":58}]},
    {"key":"lvesd","name":"LV end-systolic diameter","kind":"number","unit":"mm","ucum":"mm","low":25,"high":40,"ranges":[{"gender":"female","low":22,"high":35},{"gender":"male","low":25,"high":40}]},
    {"key":"ivsd","name":"Septum (IVSd)","kind":"number","unit":"mm","ucum":"mm","low":6,"high":10,"ranges":[{"gender":"female","low":6,"high":9},{"gender":"male","low":6,"high":10}]},
    {"key":"pwd","name":"Posterior wall","kind":"number","unit":"mm","ucum":"mm","low":6,"high":10,"ranges":[{"gender":"female","low":6,"high":9},{"gender":"male","low":6,"high":10}]},
    {"key":"ef","name":"Ejection fraction (biplane)","coding":{"system":"loinc","code":"10230-1"},"kind":"number","unit":"%","ucum":"%","low":52,"high":72,"critical_low":20,
     "ranges":[{"gender":"female","low":54,"high":74,"critical_low":20},{"gender":"male","low":52,"high":72,"critical_low":20}]},
    {"key":"lavi","name":"LA volume index","kind":"number","unit":"mL/m²","ucum":"mL/m2","high":34},
    {"key":"tapse","name":"TAPSE","kind":"number","unit":"mm","ucum":"mm","low":17},
    {"key":"ee","name":"E/e′ average","kind":"number","ucum":"{ratio}","high":14},
    {"key":"pasp","name":"PASP","kind":"number","unit":"mmHg","ucum":"mm[Hg]","high":35},
    {"key":"wall","name":"Wall motion","kind":"choice","choices":["normal","global hypokinesia","regional"]},
    {"key":"mitral","name":"Mitral","kind":"choice","choices":["normal","mild MR","moderate MR","severe MR","stenosis"]},
    {"key":"aortic","name":"Aortic","kind":"choice","choices":["normal","sclerosis","stenosis","regurgitation"]},
    {"key":"tricuspid","name":"Tricuspid","kind":"choice","choices":["normal","mild TR","moderate TR","severe TR"]},
    {"key":"pericardium","name":"Pericardium","kind":"choice","choices":["no effusion","small","moderate","large"]},
    {"key":"rhythm","name":"Rhythm","kind":"text"}]}]$j$,
  help => '{"en":"Echo done for the clinics and wards that order it (/echo): the measures with their ranges, the valves, the conclusion; Sign sends it to the doctor."}');

-- its people (§5.2): the cardiologist is a doctor; the echo doctor a doctor at a bench, so the base's bench steps too (start, done)
select core.declare_role('00000000-0000-0000-0000-00000000e401', 'cardio.cardiologist', 'cardio', 'Cardiologist', '{}', '{"en":"Cardiologist"}',
  built_on => '00000000-0000-0000-0000-00000000c002');
select core.declare_role('00000000-0000-0000-0000-00000000e402', 'cardio.echo_doctor', 'cardio', 'Echo doctor', array['read:bench', 'write:step', 'write:checked_in', 'write:called'],
  '{"en":"Echo doctor"}', built_on => '00000000-0000-0000-0000-00000000c002');
