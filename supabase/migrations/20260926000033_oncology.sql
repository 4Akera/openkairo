-- 33 · the oncology pack (spec/openCare.md §5.8; the pictures /pictures.html#onc-plan, #onc-cycle, #onc-unit). The cancer is the base's
-- problem extended by the pack (where, the morphology, grade, side, the TNM with its edition, the stage group, the markers, the intent,
-- the plan and the regimen chosen); ECOG is the base's observation (LOINC 89247-1); the tumour board's decision the base's note. Each
-- cycle is the pack's order to the Chemotherapy day unit (it extends the base's order, core change (a) of §5.5): the regimen and cycle,
-- the height and weight it used, the BSA (Mosteller), each dose worked out and rounded, the checks shown, Give · Delay · Reduce; each
-- drug goes to the Pharmacy as the base's medication sent on; each toxicity is the base's observation coded with CTCAE v5 (a code
-- system this pack brings). The regimens are a clinic setting any oncologist changes (Q39, drawn), its history kept. The day unit is a
-- department of places (chairs on the base's board); its rows of today's cycles not in a chair yet read this pack's table.

set client_min_messages = warning;

select core.declare_pack('oncology', 1, '{}', '{"en":"Oncology","ar":"الأورام"}', role_block => 'e8');
select core.create_pack('oncology');

-- the codes it writes: ECOG in the base's committed LOINC subset; CTCAE v5 (NCI, public domain) and ICD-O-3 morphology (WHO: loaded
-- per installation) as its own systems, open (a term not loaded lands unflagged)
insert into core.codes (system, code, labels, props) values ('loinc', '89247-1', '{"en":"ECOG performance status score"}', '{"ucum":"{score}"}'),
  ('loinc', '751-8', '{"en":"Neutrophils (absolute count)"}', '{"ucum":"10*3/uL","allowed":["10*3/uL","10*9/L"]}'), ('loinc', '10230-1', '{"en":"Left ventricular ejection fraction"}', '{"ucum":"%"}')
on conflict do nothing;
select core.declare_system('oncology.ctcae', 'oncology', 'code', 'https://ctep.cancer.gov/protocoldevelopment/electronic_applications/ctc.htm', '5.0', false, null,
  'NCI Common Terminology Criteria for Adverse Events v5.0 (2017): a US government work, free to use', '{"en":"CTCAE v5"}');
select core.declare_system('oncology.icdo3', 'oncology', 'code', 'http://terminology.hl7.org/CodeSystem/icd-o-3', '3.2', false, null,
  'WHO ICD-O-3.2 morphology: loaded per installation (licensed by WHO); the codes a doctor types are kept as written', '{"en":"ICD-O-3 morphology"}');

-- the ICD-10 and ATC codes its demo and its regimens write, beside the demo subset (seeds/codes.sql); an installation's full import has them
insert into core.codes (system, code, labels) values
  ('icd10', 'C50.4', '{"en":"Malignant neoplasm of upper-outer quadrant of breast"}'), ('icd10', 'C18.7', '{"en":"Malignant neoplasm of sigmoid colon"}'),
  ('icd10', 'D70.1', '{"en":"Agranulocytosis secondary to cancer chemotherapy"}'),
  ('atc', 'L01DB01', '{"en":"Doxorubicin"}'), ('atc', 'L01AA01', '{"en":"Cyclophosphamide"}'), ('atc', 'L01CD01', '{"en":"Paclitaxel"}'),
  ('atc', 'L01XA03', '{"en":"Oxaliplatin"}'), ('atc', 'L01BC02', '{"en":"Fluorouracil"}'), ('atc', 'V03AF03', '{"en":"Calcium folinate"}'),
  ('atc', 'L01CE02', '{"en":"Irinotecan"}'), ('atc', 'L01XA02', '{"en":"Carboplatin"}'), ('atc', 'L01BC05', '{"en":"Gemcitabine"}'),
  ('atc', 'L01FA01', '{"en":"Rituximab"}'), ('atc', 'L01FD01', '{"en":"Trastuzumab"}'), ('atc', 'L01CA02', '{"en":"Vincristine"}'),
  ('atc', 'L01CD02', '{"en":"Docetaxel"}'), ('atc', 'H02AB07', '{"en":"Prednisone"}'), ('atc', 'A04AD12', '{"en":"Aprepitant"}'),
  ('atc', 'A04AA02', '{"en":"Granisetron"}'), ('atc', 'L03AA13', '{"en":"Pegfilgrastim"}')
on conflict do nothing;

set role pack_oncology;

-- ── the cycles on their way to the day unit (its order type's data.oncology): today's, for the rows under the board and the tile line ──
create table oncology.cycles (
  organization_id uuid not null,
  item          uuid not null,             -- the cycle's order item
  patient_id    uuid not null,
  to_department_id uuid,                   -- the day unit
  from_department_id uuid,                 -- the clinic that ordered it
  regimen       text,                      -- its key in the clinic's list
  name          text,                      -- "AC", as the list names it
  cycle         int,
  of_cycles     int,
  day           int,
  decision      text,                      -- give · delay · reduce
  percent       int,
  due           date,                      -- the day it is given (the order's due)
  status        text,                      -- the order's status as it stands
  ordered_at    timestamptz,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create function oncology.cycles_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from oncology.cycles where organization_id = p_org and item = any (p_items);
  insert into oncology.cycles
  select p_org, l.item, core.survivor(p_org, l.patient_id), (l.data ->> 'department_id')::uuid, l.department_id, w ->> 'regimen', w ->> 'name',
         (w ->> 'cycle')::int, (w ->> 'of')::int, (w ->> 'day')::int, w ->> 'decision', (w ->> 'percent')::int,
         (coalesce((l.data ->> 'due')::timestamptz, l.occurred_at, l.recorded_at) at time zone tz.zone)::date, l.data ->> 'status', f.occurred_at,
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and x.type = 'oncology.cycle' order by x.item, x.item_version desc) l
    cross join lateral (select l.data -> 'oncology' as w) ww
    -- the day it is given is the clinic's day, in its own time zone
    cross join lateral (select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo') as zone) tz
    cross join lateral (select coalesce(min(y.occurred_at), min(y.recorded_at)) occurred_at from core.pack_entries(p_org, array[l.item]) y where y.item = l.item and y.item_version = 1) f
   where l.data ->> 'status' is not null;
end $$;

-- the cancer's line: what and where, the stage group, the intent ("Breast cancer, left · IIB · curative")
create function oncology.cancer_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(e -> 'data' -> 'concept' ->> 'text', 'Cancer') ||
    coalesce(' · ' || nullif(e -> 'data' -> 'oncology' ->> 'stage', ''), '') ||
    coalesce(' · ' || nullif(e -> 'data' -> 'oncology' ->> 'intent', ''), '') ||
    case when e -> 'data' ->> 'clinical_status' not in ('active', 'recurrence', 'relapse') then ' · ' || (e -> 'data' ->> 'clinical_status') else '' end
$$;
-- the cycle's line: the regimen and cycle, the BSA, the dose and the decision ("AC · cycle 3 of 4 · day 1 · BSA 1.78 · 100 % · give")
create function oncology.cycle_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'revoked' then 'Cancelled: ' when 'on-hold' then 'On hold: ' else '' end ||
    coalesce(e -> 'data' -> 'oncology' ->> 'name', e -> 'data' -> 'service' ->> 'name', 'Cycle') ||
    coalesce(' · cycle ' || (e -> 'data' -> 'oncology' ->> 'cycle') || coalesce(' of ' || (e -> 'data' -> 'oncology' ->> 'of'), ''), '') ||
    coalesce(' · day ' || (e -> 'data' -> 'oncology' ->> 'day'), '') ||
    coalesce(' · BSA ' || (e -> 'data' -> 'oncology' ->> 'bsa'), '') ||
    coalesce(' · ' || (e -> 'data' -> 'oncology' ->> 'percent') || ' %', '') ||
    coalesce(' · ' || (e -> 'data' -> 'oncology' ->> 'decision'), '')
$$;
-- its FHIR beside the base's (§5.2 Export: it only adds). The cancer: the stage group with the TNM and its edition as the Condition's
-- stage, the morphology as an evidence detail. The cycle: the regimen, cycle, BSA and decision as the ServiceRequest's orderDetail
create function oncology.cancer_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'Condition', 'id', p -> 'entries' -> 0 ->> 'item',
      'stage', case when w ->> 'stage' is not null then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'summary', jsonb_build_object('text', w ->> 'stage'),
        'type', case when w -> 'tnm' ? 'edition' then jsonb_build_object('text', 'TNM · ' || (w -> 'tnm' ->> 'edition')) end))) end,
      'note', case when w -> 'tnm' is not null or w -> 'markers' is not null then jsonb_build_array(jsonb_build_object('text', concat_ws(' · ',
        nullif(concat_ws(' ', w -> 'tnm' ->> 't', w -> 'tnm' ->> 'n', w -> 'tnm' ->> 'm'), ''),
        (select string_agg((m ->> 'name') || ' ' || (m ->> 'value'), ' · ') from jsonb_array_elements(coalesce(w -> 'markers', '[]')) m)))) end)))
    from (select e -> 'data' -> 'oncology' w from jsonb_array_elements(p -> 'entries') with ordinality x(e, k)
           where e ->> 'type' <> 'crossed_out' and e -> 'data' ? 'oncology' order by k desc limit 1) q where w <> '{}'::jsonb), '[]')
$$;
create function oncology.cycle_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(jsonb_build_object('resourceType', 'ServiceRequest', 'id', p -> 'entries' -> 0 ->> 'item',
      'orderDetail', (select jsonb_agg(jsonb_build_object('text', t)) from unnest(array[
        concat_ws(' · ', w ->> 'name', 'cycle ' || (w ->> 'cycle'), 'day ' || (w ->> 'day')),
        case when w ? 'bsa' then 'BSA ' || (w ->> 'bsa') || ' m2 (Mosteller)' end,
        case when w ? 'percent' then 'Dose ' || (w ->> 'percent') || ' %' end,
        case when w ? 'decision' then 'Decision: ' || (w ->> 'decision') end]) t where t is not null)))
    from (select e -> 'data' -> 'oncology' w from jsonb_array_elements(p -> 'entries') with ordinality x(e, k)
           where e ->> 'type' <> 'crossed_out' and e -> 'data' ? 'oncology' order by k desc limit 1) q where w <> '{}'::jsonb), '[]')
$$;

reset role;

grant select, delete on oncology.cycles to core_eraser;
grant execute on function oncology.cycles_refresh(uuid, uuid[]) to core_eraser;

select core.declare_table('oncology.cycles', 'oncology', 'oncology.cycles_refresh(uuid,uuid[])', 'read:queue');

-- the cancer: the base's problem with oncology's words beside it (base_type: the base's list, checks and FHIR apply)
select core.declare_type('oncology.cancer', 1, 'oncology',
  jsonb_set((select t.shape from core.types t where t.key = 'problem' order by t.version desc limit 1), '{properties,oncology}',
    '{"type":"object","additionalProperties":false,"properties":{
      "site":{"type":"string"},"side":{"enum":["left","right","both"]},
      "morphology":{"$ref":"#/$defs/concept"},"grade":{"enum":["1","2","3","4","X"]},
      "tnm":{"type":"object","additionalProperties":false,"properties":{"t":{"type":"string"},"n":{"type":"string"},"m":{"type":"string"},"edition":{"type":"string"}}},
      "stage":{"type":"string"},
      "markers":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","value"],"properties":{"name":{"type":"string"},"value":{"type":"string"}}}},
      "intent":{"enum":["curative","palliative"]},
      "plan":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["step","status"],"properties":{
        "step":{"enum":["operation","chemotherapy","radiotherapy","endocrine","targeted","immunotherapy"]},"status":{"enum":["done","now","todo"]},"text":{"type":"string"}}}},
      "regimen":{"type":"string"}}}'),
  'oncology.cancer_line(jsonb)', array['Condition'], base_type => 'problem', to_fhir => 'oncology.cancer_fhir(jsonb)',
  labels => '{"en":"Cancer","ar":"ورم"}');
-- the cycle: the base's order to the day unit with oncology's words beside it (write:order wherever the doctor orders from)
select core.declare_type('oncology.cycle', 1, 'oncology',
  jsonb_set((select t.shape from core.types t where t.key = 'order' order by t.version desc limit 1), '{properties,oncology}',
    '{"type":"object","additionalProperties":false,"required":["regimen","cycle","day","decision"],"properties":{
      "regimen":{"type":"string","minLength":1},"name":{"type":"string"},"cycle":{"type":"integer","minimum":1},"of":{"type":"integer","minimum":1},"day":{"type":"integer","minimum":1},
      "height":{"type":"number","exclusiveMinimum":0},"weight":{"type":"number","exclusiveMinimum":0},"bsa":{"type":"number","exclusiveMinimum":0},
      "percent":{"type":"integer","minimum":1,"maximum":100},"decision":{"enum":["give","delay","reduce"]},"delay_days":{"type":"integer","minimum":1},
      "doses":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["drug","dose","unit"],"properties":{
        "drug":{"type":"string"},"per":{"type":"number"},"basis":{"enum":["m2","auc","kg","flat"]},"worked":{"type":"number"},"dose":{"type":"number"},"unit":{"type":"string"},"how":{"type":"string"}}}},
      "checks":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["text"],"properties":{"text":{"type":"string"},"ok":{"type":"boolean"}}}},
      "toxicity":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["term","grade"],"properties":{"term":{"type":"string"},"grade":{"type":"integer","minimum":0,"maximum":5}}}},
      "premeds":{"type":"array","items":{"type":"string"}},"added":{"type":"array","items":{"type":"string"}}}}'),
  'oncology.cycle_line(jsonb)', array['ServiceRequest'], base_type => 'order', feeds => array['oncology.cycles'], to_fhir => 'oncology.cycle_fhir(jsonb)',
  labels => '{"en":"Chemotherapy cycle","ar":"دورة علاج كيماوي"}');

-- the regimens (Q39, drawn): a clinic setting any oncologist changes, its history kept with who and when (the setting's own audit)
select core.declare_action('edit:oncology.regimens', 'oncology', 'organization', '{"en":"Change the chemotherapy regimens"}');
select core.declare_setting('oncology.regimens', 'oncology', 'organization',
  '{"type":"object","additionalProperties":false,"required":["regimens"],"properties":{"regimens":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["key","name"],"properties":{"key":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"site":{"type":"string"},
      "every_days":{"type":"integer","minimum":1},"cycles":{"type":"integer","minimum":1},
      "drugs":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["drug","per","basis"],"properties":{
        "drug":{"type":"string"},"atc":{"type":"string"},"per":{"type":"number","exclusiveMinimum":0},"basis":{"enum":["m2","auc","kg","flat"]},
        "round":{"type":"number","exclusiveMinimum":0},"how":{"type":"string"},"watch":{"type":"boolean"}}}},
      "premeds":{"type":"array","items":{"type":"string"}},
      "checks":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["test"],"properties":{
        "test":{"enum":["anc","plt","hb","creat","egfr","bili","alt","ef"]},"min":{"type":"number"},"max":{"type":"number"}}}}}}},
    "plans":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","regimens"],"properties":{
      "name":{"type":"string","minLength":1},"site":{"type":"string"},"regimens":{"type":"array","items":{"type":"string"}}}}}}}',
  labels => '{"en":"Chemotherapy regimens"}', form => 'pack', action => 'edit:oncology.regimens',
  fields => '[{"key":"regimens","labels":{"en":"Regimens"},"help":{"en":"Each regimen: its drugs (mg/m², AUC by Calvert, mg/kg or a flat dose, and the rounding), days between cycles, how many cycles, the medicines before, and the checks with their limits. Shown before each cycle, never a stop."}},
    {"key":"regimens.key","labels":{"en":"Key"}},{"key":"regimens.name","labels":{"en":"Name"}},{"key":"regimens.site","labels":{"en":"Cancer"}},
    {"key":"regimens.every_days","labels":{"en":"Every"},"unit":"days"},{"key":"regimens.cycles","labels":{"en":"Cycles"}},
    {"key":"regimens.drugs","labels":{"en":"Drugs"}},{"key":"regimens.drugs.drug","labels":{"en":"Drug"}},{"key":"regimens.drugs.atc","labels":{"en":"ATC"}},
    {"key":"regimens.drugs.per","labels":{"en":"Dose"}},{"key":"regimens.drugs.basis","labels":{"en":"Per"},"choices":{"m2":{"en":"mg/m²"},"auc":{"en":"AUC (Calvert)"},"kg":{"en":"mg/kg"},"flat":{"en":"flat mg"}}},
    {"key":"regimens.drugs.round","labels":{"en":"Rounded to"},"unit":"mg"},{"key":"regimens.drugs.how","labels":{"en":"How"}},{"key":"regimens.drugs.watch","labels":{"en":"Reaction watch"}},
    {"key":"regimens.premeds","labels":{"en":"Before it"}},{"key":"regimens.checks","labels":{"en":"Checks before a cycle"}},
    {"key":"regimens.checks.test","labels":{"en":"Test"},"choices":{"anc":{"en":"ANC"},"plt":{"en":"Platelets"},"hb":{"en":"Hb"},"creat":{"en":"Creatinine"},"egfr":{"en":"eGFR"},"bili":{"en":"Bilirubin"},"alt":{"en":"ALT"},"ef":{"en":"EF"}}},
    {"key":"regimens.checks.min","labels":{"en":"At least"}},{"key":"regimens.checks.max","labels":{"en":"At most"}},
    {"key":"plans","labels":{"en":"Plans"},"help":{"en":"A plan is regimens one after another (AC → paclitaxel weekly): the cancer’s record names one, /chemo offers its regimens."}},
    {"key":"plans.name","labels":{"en":"Name"}},{"key":"plans.site","labels":{"en":"Cancer"}},{"key":"plans.regimens","labels":{"en":"Regimens, in order"}}]');

-- its people (§5.2): the oncologist, a doctor who may change the regimens; the day unit's nurse, a nurse who starts the day in a chair
-- (the base's Admit here) and ends it (the base's Discharge)
select core.declare_action('write:oncology.cancer', 'oncology', 'department', '{"en":"Write the cancer''s record"}');
select core.declare_role('00000000-0000-0000-0000-00000000e801', 'oncology.oncologist', 'oncology', 'Oncologist', array['edit:oncology.regimens', 'write:oncology.cancer'], '{"en":"Oncologist"}',
  built_on => '00000000-0000-0000-0000-00000000c002');
select core.declare_role('00000000-0000-0000-0000-00000000e802', 'oncology.chemo_nurse', 'oncology', 'Chemotherapy nurse', array['write:admitted', 'write:discharged'],
  '{"en":"Chemotherapy nurse"}', built_on => '00000000-0000-0000-0000-00000000c003');

-- its starter setups (§5.2): the Oncology clinic (the queue, ticks oncology), and the Chemotherapy day unit (eight chairs on the base's
-- board; its one service, the cycle, which /chemo orders; it works for every clinic until the admin names them)
select core.declare_setup('oncology.clinic', 'oncology', 'visits', '{"en":"Oncology clinic"}', packs => array['oncology'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  help => '{"en":"The cancer''s record and its plan, each cycle worked out from today''s height and weight, the checks shown, toxicity graded."}');
select core.declare_setup('oncology.day_unit', 'oncology', 'stays', '{"en":"Chemotherapy day unit"}', packs => array['oncology'],
  screens => '{"screens":["base.beds"],"opens":"base.beds"}',
  places => (select jsonb_agg(jsonb_build_object('key', 'chair_' || n, 'name', 'Chair ' || n, 'label', 'chair') order by n) from generate_series(1, 8) n),
  services => '[{"code":"chemo","name":"Chemotherapy cycle","section":"Chemotherapy","answer":"note","steps":["in_chair"]}]',
  settings => '{"department.works_for":{"all":true},"department.review_results":{"level":"critical"}}',
  help => '{"en":"Chairs on the board: the regimen and where the cycle is on each; today''s cycles not in a chair yet under it."}');
