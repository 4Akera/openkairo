-- 29 · the nephrology pack (spec/openCare.md §5.7; the picture /pictures.html#renal-ckd). It adds no record type: the kidney's stage is
-- worked out from the base's latest eGFR and urine ACR (KDIGO 2012), the panel read from the base's results, the BP from its vitals. Its
-- own: the clinic's renal list (a medicine by ingredient or ATC class, the eGFR under which it speaks, what it says), which speaks on one
-- line under the base's /rx card (core change C1, a notice, never a stop), its starter setup and its role.

set client_min_messages = warning;

select core.declare_pack('nephrology', 1, '{}', '{"en":"Nephrology","ar":"أمراض الكلى"}', role_block => 'e5');
select core.create_pack('nephrology');

-- the CKD panel's codes not yet in the base's committed subset
insert into core.codes (system, code, labels, props) select 'loinc', c, jsonb_build_object('en', l), p::jsonb from (values
  ('2502-3', 'Iron saturation (TSAT)', '{"ucum":"%"}'), ('2777-1', 'Phosphate', '{"ucum":"mg/dL"}'), ('2731-8', 'Parathyroid hormone, intact', '{"ucum":"pg/mL"}')
) v(c, l, p) on conflict do nothing;

-- the renal list (Q33): clinic-wide, on the pack's page. A starter list for the clinic's nephrologist to confirm and change (from the
-- product information and KDIGO 2022 diabetes in CKD); the line under /rx reads it, the doctor decides
select core.declare_setting('nephrology.renal_list', 'nephrology', 'organization',
  $j${"type":"object","additionalProperties":false,"required":["rules"],"properties":{"rules":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["medicine","under","says"],"properties":{"medicine":{"type":"string","minLength":1},"atc":{"type":"string","pattern":"^([A-Z]([0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?)?)?$"},
      "under":{"type":"integer","minimum":5,"maximum":120},"says":{"type":"string","minLength":1}}},
    "default":[
      {"medicine":"metformin","atc":"A10BA02","under":45,"says":"halve the dose (at most 1 g a day)"},{"medicine":"metformin","atc":"A10BA02","under":30,"says":"stop"},
      {"medicine":"sitagliptin","atc":"A10BH01","under":45,"says":"50 mg a day"},{"medicine":"sitagliptin","atc":"A10BH01","under":30,"says":"25 mg a day"},
      {"medicine":"gliclazide","atc":"A10BB09","under":30,"says":"start low, watch for hypoglycaemia"},
      {"medicine":"spironolactone","atc":"C03DA01","under":30,"says":"avoid: potassium"},
      {"medicine":"NSAID","atc":"M01A","under":30,"says":"avoid"},{"medicine":"nitrofurantoin","atc":"J01XE01","under":45,"says":"avoid"},
      {"medicine":"gabapentin","atc":"N03AX12","under":60,"says":"lower the dose"},{"medicine":"enoxaparin","atc":"B01AB05","under":30,"says":"1 mg/kg once a day"},
      {"medicine":"allopurinol","atc":"M04AA01","under":60,"says":"start at 100 mg a day or less"},{"medicine":"digoxin","atc":"C01AA05","under":50,"says":"lower the dose, check the level"}]}}}$j$,
  labels => '{"en":"The renal list"}', form => 'pack',
  fields => '[{"key":"rules","labels":{"en":"Renal list"},"help":{"en":"A medicine by its ingredient (its name) or its ATC class, the eGFR under which it speaks, and what it says. Shown under the prescription as it is typed: a notice, never a stop."}},
    {"key":"rules.medicine","labels":{"en":"Medicine"}},{"key":"rules.atc","labels":{"en":"ATC"}},{"key":"rules.under","labels":{"en":"eGFR under"},"unit":"mL/min"},{"key":"rules.says","labels":{"en":"Says"}}]');

-- its starter setup (§5.2): the Nephrology clinic, the base's queue, the pack ticked
select core.declare_setup('nephrology.clinic', 'nephrology', 'visits', '{"en":"Nephrology clinic"}', packs => array['nephrology'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  presets => '[{"name":"CKD follow-up","shortcut":"ckd","lines":["Since the last visit:","Examination:","Plan:"]}]',
  help => '{"en":"The kidney clinic: the KDIGO square and the CKD panel in each chart; the renal list under each prescription."}');

-- its people (§5.2): the nephrologist is a doctor
select core.declare_role('00000000-0000-0000-0000-00000000e501', 'nephrology.nephrologist', 'nephrology', 'Nephrologist', '{}', '{"en":"Nephrologist"}',
  built_on => '00000000-0000-0000-0000-00000000c002');
