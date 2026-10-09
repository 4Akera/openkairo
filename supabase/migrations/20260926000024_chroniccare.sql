-- 24 · the chronic care pack (spec/openCare.md §5.7; the owner 2026-10-08, Q28, Q29, Q30: drawn; the pictures /pictures.html#chronic-visit,
-- #chronic-list). A shared pack: registers worked out from the problem list's codes (a problem with one of a condition's codes puts the
-- patient on it, resolved takes them off; nobody enrols by hand), each condition's targets and checks set once for the clinic, a patient's
-- own target beside them (the pack's one type: a target with its reason, written in the chart by the doctor, which wins over the
-- clinic's). The measures are the base's latest results and vitals by code; the yearly review writes the base's observations (feet,
-- eyes); the tests and the referral are the base's orders. A check is done when an entry with one of its codes is written: the pack keeps
-- the coded observations and procedures it reads that from (the base keeps numbers only), and its targets, for its list.

set client_min_messages = warning;

select core.declare_pack('chroniccare', 1, '{}', '{"en":"Chronic care","ar":"الأمراض المزمنة"}', role_block => 'e1');
select core.create_pack('chroniccare');

set role pack_chroniccare;

-- ── a patient's own targets (the pack's type), each its latest version, for the list ──
create table chroniccare.targets (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  condition     text not null,
  measure       text not null,
  op            text not null,
  value         numeric not null,
  value2        numeric,                   -- a pressure's diastolic (150/90)
  reason        text,
  at            timestamptz not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create function chroniccare.targets_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from chroniccare.targets where organization_id = p_org and item = any (p_items);
  insert into chroniccare.targets
  select p_org, l.item, core.survivor(p_org, l.patient_id), l.data ->> 'condition', l.data ->> 'measure', l.data ->> 'op', (l.data ->> 'value')::numeric,
         (l.data ->> 'value2')::numeric, l.data ->> 'reason', l.occurred_at,
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x where x.item = any (p_items) order by x.item, x.item_version desc) l
   where l.type = 'chroniccare.target' and coalesce(l.data ->> 'status', 'active') = 'active';
end $$;

-- ── the coded observations and procedures (feet, eyes, inhaler technique, spirometry): when each check was last done ──
create table chroniccare.checks (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  codes         text[] not null,
  text          text,                      -- what it found, in words
  at            timestamptz not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index checks_patient on chroniccare.checks (organization_id, patient_id);
create function chroniccare.checks_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from chroniccare.checks where organization_id = p_org and item = any (p_items);
  insert into chroniccare.checks
  select p_org, l.item, core.survivor(p_org, l.patient_id), l.codes, coalesce(l.data -> 'value' ->> 'text', l.data -> 'value' -> 'concept' ->> 'text', l.data ->> 'note'), l.occurred_at,
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x where x.item = any (p_items) order by x.item, x.item_version desc) l
   where (l.type = any (core.kinds('observation')) or l.type = any (core.kinds('procedure'))) and cardinality(l.codes) > 0;
end $$;

-- a target's line: "Own target · BP < 150/90 · hypertension · 81, falls"
create function chroniccare.target_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'ended' then 'Own target ended · ' else 'Own target · ' end ||
    upper(case e -> 'data' ->> 'measure' when 'hba1c' then 'HbA1c' when 'ldl' then 'LDL' when 'bp' then 'BP' when 'egfr' then 'eGFR' else e -> 'data' ->> 'measure' end) ||
    ' ' || (e -> 'data' ->> 'op') || ' ' || (e -> 'data' ->> 'value') || coalesce('/' || (e -> 'data' ->> 'value2'), '') ||
    coalesce(' · ' || (e -> 'data' ->> 'condition'), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;

reset role;

grant select, delete on chroniccare.targets, chroniccare.checks to core_eraser;
grant execute on function chroniccare.targets_refresh(uuid, uuid[]), chroniccare.checks_refresh(uuid, uuid[]) to core_eraser;

-- the checks' own codes: what the yearly review writes as the base's observations (feet, eyes, inhaler technique)
select core.declare_system('chroniccare.check', 'chroniccare', 'code', '{canon}/CodeSystem/chronic-check', null, false, null, 'openCare', '{"en":"Chronic care checks"}');

-- its one type (Q30): a patient's own target, with its reason; written by the doctor (everyday where the department ticks the pack)
select core.declare_action('write:chroniccare.target', 'chroniccare', 'department', '{"en":"Set a patient''s own target"}', everyday => true);
select core.declare_action('read:chroniccare.list', 'chroniccare', 'department', '{"en":"Read the chronic care list"}', everyday => true);
select core.declare_table('chroniccare.targets', 'chroniccare', 'chroniccare.targets_refresh(uuid,uuid[])', 'read:chroniccare.list');
select core.declare_table('chroniccare.checks', 'chroniccare', 'chroniccare.checks_refresh(uuid,uuid[])', 'read:chroniccare.list');
select core.declare_type('chroniccare.target', 1, 'chroniccare',
  '{"type":"object","additionalProperties":false,"required":["condition","measure","op","value"],"properties":{"condition":{"type":"string","minLength":1},
    "measure":{"type":"string","minLength":1},"op":{"enum":["<","<=",">",">="]},"value":{"type":"number"},"value2":{"type":"number"},"reason":{"type":"string"},
    "status":{"enum":["active","ended"]}}}',
  'chroniccare.target_line(jsonb)', '{}', feeds => array['chroniccare.targets'], labels => '{"en":"Own target","ar":"هدف خاص"}');
select core.declare_listener('chroniccare', array['observation', 'procedure'], 'chroniccare.checks_refresh(uuid,uuid[])');

-- the list (Q29): a Chronic care tab in each department that ticks the pack
select core.declare_screen('chroniccare.list', 'chroniccare', 'visits', '{"en":"Chronic care"}', 'read:chroniccare.list');

-- the conditions, their targets and checks, once for the clinic (Q30): a condition's codes are the register (ICD-10, by its start);
-- a target a measure, a sign and a value (a pressure's two); a check the codes that do it and how often, more often while off target
select core.declare_setting('chroniccare.conditions', 'chroniccare', 'organization',
  jsonb_set('{"type":"object","additionalProperties":false,"required":["conditions"],"properties":{"window_months":{"type":"integer","minimum":1,"maximum":120,"default":18},
    "conditions":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["key","name","codes"],
    "properties":{"key":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"codes":{"type":"array","items":{"type":"string"}},
      "targets":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["measure","op","value"],"properties":{"measure":{"type":"string"},"op":{"enum":["<","<=",">",">="]},"value":{"type":"number"},"value2":{"type":"number"}}}},
      "checks":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name","codes","every_months"],"properties":{"key":{"type":"string"},"name":{"type":"string"},
        "codes":{"type":"array","items":{"type":"string"}},"every_months":{"type":"integer","minimum":1},"off_target_months":{"type":"integer","minimum":1}}}}}}}}}'::jsonb, '{properties,conditions,default}', $j$[
    {"key":"dm","name":"Diabetes","codes":["E10","E11","E12","E13","E14"],
      "targets":[{"measure":"hba1c","op":"<","value":7},{"measure":"bp","op":"<","value":130,"value2":80},{"measure":"ldl","op":"<","value":70}],
      "checks":[{"key":"hba1c","name":"HbA1c","codes":["loinc:4548-4"],"every_months":6,"off_target_months":3},{"key":"eyes","name":"Eyes","codes":["chroniccare.check:eyes"],"every_months":12},
        {"key":"feet","name":"Feet","codes":["chroniccare.check:feet"],"every_months":12},{"key":"acr","name":"Urine ACR","codes":["loinc:9318-7","loinc:14959-1"],"every_months":12},
        {"key":"lipids","name":"Lipids","codes":["loinc:2089-1","loinc:2093-3"],"every_months":12},{"key":"kidney","name":"Kidney function","codes":["loinc:2160-0"],"every_months":12}]},
    {"key":"htn","name":"Hypertension","codes":["I10","I11","I12","I13","I15"],"targets":[{"measure":"bp","op":"<","value":130,"value2":80}],
      "checks":[{"key":"kcreat","name":"K and creatinine","codes":["loinc:2823-3","loinc:2160-0"],"every_months":12},{"key":"lipids","name":"Lipids","codes":["loinc:2089-1","loinc:2093-3"],"every_months":12}]},
    {"key":"ckd","name":"CKD","codes":["N18"],"targets":[{"measure":"bp","op":"<","value":130,"value2":80}],
      "checks":[{"key":"egfr","name":"eGFR and K","codes":["loinc:33914-3","loinc:62238-1","loinc:98979-8","loinc:2823-3"],"every_months":6},{"key":"acr","name":"Urine ACR","codes":["loinc:9318-7","loinc:14959-1"],"every_months":12},
        {"key":"hb","name":"Hb","codes":["loinc:718-7"],"every_months":12}]},
    {"key":"hf","name":"Heart failure","codes":["I50"],"targets":[],"checks":[{"key":"kcreat","name":"K and creatinine","codes":["loinc:2823-3","loinc:2160-0"],"every_months":6}]},
    {"key":"asthma","name":"Asthma","codes":["J45"],"targets":[],"checks":[{"key":"inhaler","name":"Inhaler technique","codes":["chroniccare.check:inhaler"],"every_months":12}]},
    {"key":"copd","name":"COPD","codes":["J44"],"targets":[],"checks":[{"key":"spiro","name":"Spirometry","codes":["chroniccare.check:spirometry","loinc:19926-5"],"every_months":12},
      {"key":"inhaler","name":"Inhaler technique","codes":["chroniccare.check:inhaler"],"every_months":12}]}
  ]$j$::jsonb),
  labels => '{"en":"Chronic care · the conditions, their targets and checks"}', form => 'pack',
  fields => '[{"key":"window_months","labels":{"en":"The list''s window"},"unit":"months","help":{"en":"Patients seen in the department within this many months."}},
    {"key":"conditions","labels":{"en":"Conditions"},"help":{"en":"The codes are the register: a problem with one of them puts the patient on it. A change counts from the moment it is saved."}},
    {"key":"conditions.key","labels":{"en":"Key"}},{"key":"conditions.name","labels":{"en":"Condition"}},{"key":"conditions.codes","labels":{"en":"From the problem list"}},
    {"key":"conditions.targets","labels":{"en":"Targets"}},{"key":"conditions.targets.measure","labels":{"en":"Measure"}},{"key":"conditions.targets.op","labels":{"en":"Sign"}},
    {"key":"conditions.targets.value","labels":{"en":"Value"}},{"key":"conditions.targets.value2","labels":{"en":"Second value"}},
    {"key":"conditions.checks","labels":{"en":"Checks"}},{"key":"conditions.checks.key","labels":{"en":"Key"}},{"key":"conditions.checks.name","labels":{"en":"Check"}},{"key":"conditions.checks.codes","labels":{"en":"Done by"}},
    {"key":"conditions.checks.every_months","labels":{"en":"Every"},"unit":"months"},{"key":"conditions.checks.off_target_months","labels":{"en":"While off target"},"unit":"months"}]');

-- its starter setup (§5.2): a Diabetes clinic — a clinic that ticks chronic care, its queue and the Chronic care list; the clinic's
-- conditions are the setting's default until the clinic saves its own
select core.declare_setup('chroniccare.clinic', 'chroniccare', 'visits', '{"en":"Diabetes clinic"}', packs => array['chroniccare'],
  screens => '{"screens":["base.queue","chroniccare.list"],"opens":"base.queue"}',
  help => '{"en":"A clinic for chronic conditions: each condition from the problem list, its targets and checks; the yearly review; who is off target or overdue."}');
