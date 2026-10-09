-- 36 · the anaesthesia pack (spec/openCare.md §5.8; the pictures /pictures.html#anaes-preop, #anaes-record, #theatre-recovery). The
-- pre-op is the pack's own entry (what matters from the history, the airway, ASA — a class the anaesthetist chooses, not a score — the
-- plan, fit or not yet, the medicines to stop from the clinic's list: shown, never a stop, Q43 drawn); RCRI, STOP-BANG and Aldrete are
-- declared scores the server adds up (rule 8). The anaesthetic record is one set signed by the anaesthetist at the end (Q45, drawn): each
-- 5-minute column the pack's type extending the base's vitals (heart rate, BP, SpO₂ and temperature the base's keys; EtCO₂, the agent
-- and FiO₂ the pack's), each drug the base's given at its time, and the record itself (the events, airway, breathing, fluids, the
-- times that move the case on the theatre list), about the operation. Recovery is a department of places (Q48, drawn): bays on the
-- base's board, the pack's line (minutes in, Aldrete first → last, pain, ready for the ward at 9 or more) and its two buttons.

set client_min_messages = warning;

select core.declare_pack('anaesthesia', 1, '{}', '{"en":"Anaesthesia","ar":"التخدير"}', role_block => 'eb');
select core.create_pack('anaesthesia');

set role pack_anaesthesia;
-- ── recovery's numbers: each Aldrete and each pain score, by patient, for the bays' line (from the base's score and vitals) ──
create table anaesthesia.recovery (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  kind          text not null,             -- aldrete · pain
  value         numeric not null,
  at            timestamptz not null,
  source_entries uuid[] not null,
  primary key (organization_id, item, kind)
);
create function anaesthesia.recovery_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from anaesthesia.recovery where organization_id = p_org and item = any (p_items);
  insert into anaesthesia.recovery
  select p_org, l.item, core.survivor(p_org, l.patient_id), k.kind, k.value, l.occurred_at, array[l.id]
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and core.base_of(x.type) in ('score', 'vitals') order by x.item, x.item_version desc) l
    cross join lateral (select 'aldrete' kind, (l.data ->> 'total')::numeric value where l.type = 'score' and l.data ->> 'score' = 'anaesthesia.aldrete'
                        union all select 'pain', (l.data -> 'pain' ->> 'value')::numeric where core.base_of(l.type) = 'vitals' and l.data ? 'pain') k
   where l.type <> 'crossed_out';
end $$;

-- ── the pre-ops, by patient, for a list's row (its ASA and verdict, the one about the row's operation first) ──
create table anaesthesia.preops (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  op            uuid,                      -- the operation it assessed for, when the card knew it
  operation     text,
  asa           text not null,
  emergency     boolean not null default false,
  verdict       text not null,             -- fit · not_yet
  plan          text,
  mallampati    text,
  stop          jsonb,
  at            timestamptz not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create function anaesthesia.preops_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from anaesthesia.preops where organization_id = p_org and item = any (p_items);
  insert into anaesthesia.preops
  select p_org, l.item, core.survivor(p_org, l.patient_id), (l.data ->> 'op')::uuid, l.data ->> 'operation', l.data ->> 'asa', coalesce((l.data ->> 'emergency')::boolean, false),
         l.data ->> 'verdict', l.data ->> 'plan', l.data -> 'airway' ->> 'mallampati', l.data -> 'stop', l.occurred_at,
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and x.type = 'anaesthesia.preop' order by x.item, x.item_version desc) l;
end $$;

create function anaesthesia.preop_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Pre-op assessment' || coalesce(' · ' || nullif(e -> 'data' ->> 'operation', ''), '') ||
    coalesce(' · ASA ' || (e -> 'data' ->> 'asa') || case when (e -> 'data' ->> 'emergency')::boolean then ' E' else '' end, '') ||
    coalesce(' · Mallampati ' || (e -> 'data' -> 'airway' ->> 'mallampati'), '') ||
    case e -> 'data' ->> 'verdict' when 'fit' then ' · fit' when 'not_yet' then ' · not yet' else '' end ||
    coalesce(' · ' || case e -> 'data' ->> 'plan' when 'general_lma' then 'general, LMA' when 'general_tube' then 'general, tube' when 'spinal' then 'spinal planned'
      when 'local_sedation' then 'local and sedation' end, '')
$$;
create function anaesthesia.record_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Anaesthetic record' || coalesce(' · ' || nullif(e -> 'data' ->> 'operation', ''), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'technique', ''), '') ||
    coalesce(' · ' || (e -> 'data' -> 'times' ->> 'start') || '–' || (e -> 'data' -> 'times' ->> 'end'), '')
$$;
create function anaesthesia.column_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Anaesthetic record',
    case when e -> 'data' ? 'hr' then 'HR ' || (e -> 'data' -> 'hr' ->> 'value') end,
    case when e -> 'data' ? 'bp' then 'BP ' || (e -> 'data' -> 'bp' -> 'sys' ->> 'value') || '/' || (e -> 'data' -> 'bp' -> 'dia' ->> 'value') end,
    case when e -> 'data' ? 'spo2' then 'SpO₂ ' || (e -> 'data' -> 'spo2' ->> 'value') end,
    case when e -> 'data' -> 'anaesthesia' ? 'etco2' then 'EtCO₂ ' || (e -> 'data' -> 'anaesthesia' ->> 'etco2') end)
$$;
reset role;

grant select, delete on anaesthesia.recovery, anaesthesia.preops to core_eraser;
grant execute on function anaesthesia.recovery_refresh(uuid, uuid[]), anaesthesia.preops_refresh(uuid, uuid[]) to core_eraser;
select core.declare_table('anaesthesia.preops', 'anaesthesia', 'anaesthesia.preops_refresh(uuid,uuid[])', 'read:queue', entries => false);
select core.declare_table('anaesthesia.recovery', 'anaesthesia', 'anaesthesia.recovery_refresh(uuid,uuid[])', 'read:queue', entries => false);
select core.declare_listener('anaesthesia', array['score', 'vitals', 'crossed_out'], 'anaesthesia.recovery_refresh(uuid,uuid[])');

-- the pre-op assessment
select core.declare_type('anaesthesia.preop', 1, 'anaesthesia',
  '{"type":"object","additionalProperties":false,"required":["asa","verdict"],"properties":{
    "op":{"type":"string","format":"uuid"},"operation":{"type":"string"},
    "history":{"type":"object","additionalProperties":false,"properties":{"heart":{"type":"string"},"lungs":{"type":"string"},"sleep":{"type":"string"},
      "diabetes":{"type":"string"},"bleeding":{"type":"string"},"teeth":{"type":"string"},"before":{"type":"string"}}},
    "airway":{"type":"object","additionalProperties":false,"properties":{"mallampati":{"enum":["I","II","III","IV"]},"mouth_cm":{"type":"number"},"tm_cm":{"type":"number"},
      "neck_cm":{"type":"number"},"neck_moves":{"type":"boolean"}}},
    "asa":{"enum":["I","II","III","IV","V","VI"]},"emergency":{"type":"boolean"},
    "plan":{"enum":["general_lma","general_tube","spinal","local_sedation"]},"plan_note":{"type":"string"},
    "verdict":{"enum":["fit","not_yet"]},"verdict_note":{"type":"string"},
    "stop":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["medicine","what"],"properties":{
      "medicine":{"type":"string"},"what":{"type":"string"},"rule":{"type":"string"},"days":{"type":"integer","minimum":0}}}},
    "consent":{"type":"array","items":{"type":"string"}},"note":{"type":"string"}}}'::jsonb,
  'anaesthesia.preop_line(jsonb)', array['Observation'], feeds => array['anaesthesia.preops'], labels => '{"en":"Pre-op assessment","ar":"تقييم ما قبل العملية"}');
-- a 5-minute column of the anaesthetic record: the base's vitals, with what anaesthesia adds (EtCO₂, the agent, FiO₂)
select core.declare_type('anaesthesia.column', 1, 'anaesthesia',
  jsonb_set((select t.shape from core.types t where t.key = 'vitals' order by t.version desc limit 1), '{properties,anaesthesia}',
    '{"type":"object","additionalProperties":false,"properties":{"etco2":{"type":"number"},"agent":{"type":"string"},"agent_pct":{"type":"number"},"fio2":{"type":"number"},
      "events":{"type":"array","items":{"type":"integer","minimum":1}}}}'),
  'anaesthesia.column_line(jsonb)', array['Observation'], base_type => 'vitals', feeds => array['base.values'], labels => '{"en":"Anaesthetic record column"}');
-- the record itself: about the operation; its times move the case on the theatre list
select core.declare_type('anaesthesia.record', 1, 'anaesthesia',
  '{"type":"object","additionalProperties":false,"required":["times"],"properties":{
    "op":{"type":"string","format":"uuid"},"operation":{"type":"string"},"technique":{"type":"string"},"asa":{"type":"string"},"anaesthetist":{"type":"string"},
    "times":{"type":"object","additionalProperties":false,"properties":{"in":{"type":"string"},"start":{"type":"string"},"knife":{"type":"string"},"end":{"type":"string"},"out":{"type":"string"}}},
    "events":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["at","text"],"properties":{"at":{"type":"string"},"text":{"type":"string"}}}},
    "airway":{"type":"string"},"breathing":{"type":"string"},"agent":{"type":"string"},"warming":{"type":"string"},
    "fluids":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["what","ml"],"properties":{"what":{"type":"string"},"ml":{"type":"integer","minimum":0}}}},
    "blood_loss":{"type":"integer","minimum":0},"urine":{"type":"string"},"weight":{"type":"number"},"note":{"type":"string"}}}'::jsonb,
  'anaesthesia.record_line(jsonb)', array['Procedure'], labels => '{"en":"Anaesthetic record","ar":"سجل التخدير"}');

-- its scores (rule 8): declared tables the server adds up
select core.declare_score('anaesthesia.rcri', 'anaesthesia', '1999', 'Lee TH et al. Derivation and prospective validation of a simple index for prediction of cardiac risk of major noncardiac surgery. Circulation 1999;100:1043–1049',
  '[{"key":"high_risk","labels":{"en":"High-risk surgery (intraperitoneal, intrathoracic, suprainguinal vascular)"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"ihd","labels":{"en":"Ischaemic heart disease"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"hf","labels":{"en":"Heart failure"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"cvd","labels":{"en":"Stroke or TIA"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"insulin","labels":{"en":"Diabetes on insulin"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"creat","labels":{"en":"Creatinine over 2 mg/dL"},"input":"yes_no","points":{"yes":1,"no":0}}]',
  '[{"key":"class_1","labels":{"en":"Class I · about 1 in 250"},"min":0,"max":0,"tone":null},{"key":"class_2","labels":{"en":"Class II · about 1 in 100"},"min":1,"max":1,"tone":null},
    {"key":"class_3","labels":{"en":"Class III · about 1 in 15"},"min":2,"max":2,"tone":"warn"},{"key":"class_4","labels":{"en":"Class IV · about 1 in 9"},"min":3,"max":6,"tone":"danger"}]',
  '{"en":"Revised Cardiac Risk Index"}', 'RCRI', 'rcri');
select core.declare_score('anaesthesia.stopbang', 'anaesthesia', '2008', 'Chung F et al. STOP questionnaire: a tool to screen patients for obstructive sleep apnea. Anesthesiology 2008;108:812–821',
  '[{"key":"snore","labels":{"en":"Snores loudly"},"input":"yes_no","points":{"yes":1,"no":0}},{"key":"tired","labels":{"en":"Tired by day"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"observed","labels":{"en":"Seen to stop breathing"},"input":"yes_no","points":{"yes":1,"no":0}},{"key":"pressure","labels":{"en":"High blood pressure"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"bmi","labels":{"en":"BMI over 35"},"input":"yes_no","points":{"yes":1,"no":0}},{"key":"age","labels":{"en":"Over 50"},"input":"yes_no","points":{"yes":1,"no":0}},
    {"key":"neck","labels":{"en":"Neck over 40 cm"},"input":"yes_no","points":{"yes":1,"no":0}},{"key":"male","labels":{"en":"Male"},"input":"yes_no","points":{"yes":1,"no":0}}]',
  '[{"key":"low","labels":{"en":"Low risk"},"min":0,"max":2,"tone":null},{"key":"intermediate","labels":{"en":"Intermediate risk"},"min":3,"max":4,"tone":"info"},
    {"key":"high","labels":{"en":"High risk"},"min":5,"max":8,"tone":"warn"}]',
  '{"en":"STOP-BANG"}', 'STOP-BANG', 'stopbang');
select core.declare_score('anaesthesia.aldrete', 'anaesthesia', '1995', 'Aldrete JA. The post-anesthesia recovery score revisited. J Clin Anesth 1995;7:89–91',
  '[{"key":"activity","labels":{"en":"Activity"},"input":"choice","choices":[{"value":"2","points":2,"labels":{"en":"Moves all four limbs"}},{"value":"1","points":1,"labels":{"en":"Moves two limbs"}},{"value":"0","points":0,"labels":{"en":"Moves none"}}]},
    {"key":"breathing","labels":{"en":"Breathing"},"input":"choice","choices":[{"value":"2","points":2,"labels":{"en":"Breathes deeply, coughs"}},{"value":"1","points":1,"labels":{"en":"Short of breath, shallow"}},{"value":"0","points":0,"labels":{"en":"Apnoeic"}}]},
    {"key":"circulation","labels":{"en":"Circulation"},"input":"choice","choices":[{"value":"2","points":2,"labels":{"en":"BP within 20 of before"}},{"value":"1","points":1,"labels":{"en":"BP within 20–50 of before"}},{"value":"0","points":0,"labels":{"en":"BP more than 50 from before"}}]},
    {"key":"conscious","labels":{"en":"Consciousness"},"input":"choice","choices":[{"value":"2","points":2,"labels":{"en":"Fully awake"}},{"value":"1","points":1,"labels":{"en":"Rousable when called"}},{"value":"0","points":0,"labels":{"en":"Not responding"}}]},
    {"key":"spo2","labels":{"en":"Oxygen saturation"},"input":"choice","choices":[{"value":"2","points":2,"labels":{"en":"Over 92 % on air"}},{"value":"1","points":1,"labels":{"en":"Needs oxygen to stay over 90 %"}},{"value":"0","points":0,"labels":{"en":"Under 90 % with oxygen"}}]}]',
  '[{"key":"not_yet","labels":{"en":"Not ready for the ward"},"min":0,"max":8,"tone":"warn"},{"key":"ready","labels":{"en":"Ready for the ward"},"min":9,"max":10,"tone":"ok"}]',
  '{"en":"Aldrete (modified)"}', 'Aldrete', 'aldrete');

-- the medicines to stop before an operation (Q43, drawn): the clinic's list, shown on the pre-op and never a stop
select core.declare_setting('anaesthesia.stop_list', 'anaesthesia', 'organization',
  '{"type":"object","additionalProperties":false,"required":["rules"],"properties":{"rules":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["match","what"],"properties":{"match":{"type":"string","minLength":1},"what":{"type":"string","minLength":1},"days":{"type":"integer","minimum":0},
      "rule":{"type":"string"},"warn":{"type":"boolean","default":false}}}}}}',
  labels => '{"en":"Medicines before an operation"}', form => 'pack',
  fields => '[{"key":"rules","labels":{"en":"Rules"},"help":{"en":"Each rule: the medicines it matches (names or ATC codes, comma-separated), what to do, how many days before. Shown on the pre-op; the anaesthetist changes any line."}},
    {"key":"rules.match","labels":{"en":"Matches"}},{"key":"rules.what","labels":{"en":"What to do"}},{"key":"rules.days","labels":{"en":"Days before"},"unit":"days"},
    {"key":"rules.rule","labels":{"en":"The rule, in words"}},{"key":"rules.warn","labels":{"en":"Said in amber"}}]');

select core.declare_action('write:anaesthesia.preop', 'anaesthesia', 'department', '{"en":"Write the pre-op assessment"}');
select core.declare_action('write:anaesthesia.record', 'anaesthesia', 'department', '{"en":"Write and sign the anaesthetic record"}');
select core.declare_action('write:anaesthesia.column', 'anaesthesia', 'department', '{"en":"Write the anaesthetic record''s columns"}');
-- its people (§5.2): the anaesthetist, a doctor who assesses, gives and signs the record; recovery's nurse, a nurse who takes a patient
-- into a bay (the base's Admit here) and sends them back (the base's Discharge)
select core.declare_role('00000000-0000-0000-0000-00000000eb01', 'anaesthesia.anaesthetist', 'anaesthesia', 'Anaesthetist',
  array['write:anaesthesia.preop', 'write:anaesthesia.record', 'write:anaesthesia.column'], '{"en":"Anaesthetist"}', built_on => '00000000-0000-0000-0000-00000000c002');
select core.declare_role('00000000-0000-0000-0000-00000000eb02', 'anaesthesia.recovery_nurse', 'anaesthesia', 'Recovery nurse', array['write:admitted', 'write:discharged'],
  '{"en":"Recovery nurse"}', built_on => '00000000-0000-0000-0000-00000000c003');

-- the anaesthetic record: a tab of the Theatre's for whoever gives anaesthesia there
select core.declare_screen('anaesthesia.record', 'anaesthesia', 'bench', '{"en":"Anaesthetic record"}', 'write:anaesthesia.record');

-- its starter setups: the Pre-op clinic (the queue) and Recovery (five bays on the base's board)
select core.declare_setup('anaesthesia.preop_clinic', 'anaesthesia', 'visits', '{"en":"Pre-op clinic"}', packs => array['anaesthesia'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  help => '{"en":"The pre-op assessment: the history that matters, the airway, ASA, RCRI and STOP-BANG, the medicines to stop, the plan, fit or not yet."}');
select core.declare_setup('anaesthesia.recovery', 'anaesthesia', 'stays', '{"en":"Recovery"}', packs => array['anaesthesia'],
  screens => '{"screens":["base.beds"],"opens":"base.beds"}',
  places => (select jsonb_agg(jsonb_build_object('key', 'bay_' || n, 'name', 'Bay ' || n, 'label', 'cubicle') order by n) from generate_series(1, 5) n),
  settings => '{"department.review_results":{"level":"critical"}}',
  help => '{"en":"Bays on the board: minutes in, Aldrete, pain, ready for the ward at 9 or more; Discharge back to the ward or home."}');
