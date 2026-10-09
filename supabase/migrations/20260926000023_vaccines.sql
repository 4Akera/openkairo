-- 23 · the vaccines pack (spec/openCare.md §5.8; the owner 2026-10-08, Q25, Q26: drawn; the pictures /pictures.html#vax-chart, #vax-room).
-- A shared pack, ticked by paediatrics, family medicine, the vaccination room and ObGyn (tetanus in pregnancy). Each dose is the base's
-- given, extended by the pack's dose (the vaccine and which dose of its series, given here or copied from the card, or not given with its
-- reason): FHIR Immunization beside the base's MedicationAdministration. Due and overdue are worked out from the birth date, the doses and
-- the schedule, never typed: the schedule's national rows are a reference list (the MOHP's, Dec 2024; the demo loads a sample, read-only),
-- the optional rows the clinic's own setting. The vaccination room's own screen (Due today, This week, Overdue · to call, Given today)
-- stands in for the queue there; its table of doses feeds the room's lists and the queue's marks.

set client_min_messages = warning;

select core.declare_pack('vaccines', 1, '{}', '{"en":"Vaccines","ar":"التطعيمات"}', role_block => 'e0');
select core.create_pack('vaccines');

set role pack_vaccines;

-- ── the doses, one row per dose item (its latest version), for the room's lists and the marks ──
create table vaccines.doses (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  department_id uuid not null,
  vaccine       text not null,             -- the series' key in the schedule (mmr, opv, penta, …)
  dose          int,                       -- which dose of the series (0 for OPV 0)
  status        text not null,             -- completed · not-done
  source        text not null,             -- here · card
  given_at      timestamptz not null,      -- the dose's clinical time, or the card's date for a copy (data.vaccines.given_on)
  reason        text,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index doses_patient on vaccines.doses (organization_id, patient_id);
create function vaccines.doses_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from vaccines.doses where organization_id = p_org and item = any (p_items);
  insert into vaccines.doses
  select p_org, l.item, core.survivor(p_org, l.patient_id), l.department_id, l.data -> 'vaccines' ->> 'vaccine', (l.data -> 'vaccines' ->> 'dose')::int,
         coalesce(l.data ->> 'status', 'completed'), coalesce(l.data -> 'vaccines' ->> 'source', 'here'),
         coalesce((l.data -> 'vaccines' ->> 'given_on')::date::timestamptz, l.occurred_at), nullif(l.data ->> 'reason', ''),
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) order by x.item, x.item_version desc) l
   where l.type = 'vaccines.dose';
end $$;

-- the dose's line: "Vaccine · MMR dose 1 · lot 4K21M07 · exp 03/27 · right arm, under the skin", or "Not given · MMR dose 1 · fever 39.2 °C",
-- a copy from the card "· from the card"
create function vaccines.dose_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'not-done' then 'Not given · ' else 'Vaccine · ' end ||
    coalesce(e -> 'data' -> 'drug' ->> 'text', 'vaccine') || coalesce(' dose ' || (e -> 'data' -> 'vaccines' ->> 'dose'), '') ||
    coalesce(' · lot ' || nullif(e -> 'data' ->> 'lot', ''), '') || coalesce(' · exp ' || nullif(e -> 'data' ->> 'expiry', ''), '') ||
    case when e -> 'data' ->> 'status' = 'not-done' then '' else coalesce(' · ' || nullif(concat_ws(', ', nullif(e -> 'data' ->> 'site', ''),
      case e -> 'data' ->> 'route' when 'im' then 'into the muscle' when 'sc' then 'under the skin' when 'id' then 'into the skin' when 'oral' then 'by mouth'
        else nullif(e -> 'data' ->> 'route', '') end), ''), '') end ||
    case when e -> 'data' -> 'vaccines' ->> 'source' = 'card' then ' · from the card' else '' end ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;

-- its FHIR, beside the base's MedicationAdministration (§5.2 Export: it only adds): an Immunization of the latest version
create function vaccines.dose_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'Immunization', 'id', o ->> 'item',
      'status', case when o -> 'data' ->> 'status' = 'not-done' then 'not-done' else 'completed' end,
      'statusReason', case when o -> 'data' ->> 'status' = 'not-done' and o -> 'data' ? 'reason' then jsonb_build_object('text', o -> 'data' ->> 'reason') end,
      'vaccineCode', coalesce(core.fhir_concept(o -> 'data' -> 'drug', (p ->> 'org')::uuid), jsonb_build_object('text', 'vaccine')),
      'patient', jsonb_build_object('reference', 'Patient/' || (p ->> 'patient')),
      'occurrenceDateTime', coalesce(o -> 'data' -> 'vaccines' ->> 'given_on', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid)),
      'primarySource', coalesce(o -> 'data' -> 'vaccines' ->> 'source', 'here') = 'here',
      'lotNumber', nullif(o -> 'data' ->> 'lot', ''),
      'site', case when nullif(o -> 'data' ->> 'site', '') is not null then jsonb_build_object('text', o -> 'data' ->> 'site') end,
      'route', case when nullif(o -> 'data' ->> 'route', '') is not null then jsonb_build_object('text', o -> 'data' ->> 'route') end,
      'protocolApplied', case when (o -> 'data' -> 'vaccines' ->> 'dose')::int > 0 then jsonb_build_array(jsonb_build_object('doseNumberPositiveInt', (o -> 'data' -> 'vaccines' ->> 'dose')::int)) end)))
    from (select e o from jsonb_array_elements(p -> 'entries') with ordinality x(e, k) where e ->> 'type' <> 'crossed_out' order by k desc limit 1) q
    where not coalesce((select (e ->> 'redacted')::boolean from jsonb_array_elements(p -> 'entries') with ordinality x(e, k) order by k desc limit 1), false)
      and (select e ->> 'type' from jsonb_array_elements(p -> 'entries') with ordinality x(e, k) order by k desc limit 1) <> 'crossed_out'), '[]')
$$;

reset role;

grant select, delete on vaccines.doses to core_eraser;
grant execute on function vaccines.doses_refresh(uuid, uuid[]) to core_eraser;

-- the vaccine's code: CDC's CVX, open (a code the list does not hold lands as typed)
select core.declare_system('vaccines.cvx', 'vaccines', 'code', 'http://hl7.org/fhir/sid/cvx', null, false, null, 'CDC CVX vaccine codes, free', '{"en":"CVX (vaccines)"}');

-- its action: a dose is given (or copied from the card) by whoever works where the department ticks the pack: everyday (§5.2)
select core.declare_action('write:vaccines.dose', 'vaccines', 'department', '{"en":"Give a vaccine (/vax)"}', everyday => true);
select core.declare_table('vaccines.doses', 'vaccines', 'vaccines.doses_refresh(uuid,uuid[])', 'read:queue');
select core.declare_type('vaccines.dose', 1, 'vaccines',
  jsonb_set((select t.shape from core.types t where t.key = 'given' order by t.version desc limit 1), '{properties,vaccines}',
    '{"type":"object","additionalProperties":false,"required":["vaccine"],"properties":{"vaccine":{"type":"string","minLength":1},"dose":{"type":"integer","minimum":0,"maximum":20},
      "source":{"enum":["here","card"]},"given_on":{"type":"string","format":"date"},"given_by":{"type":"string"}}}'),
  'vaccines.dose_line(jsonb)', array['MedicationAdministration', 'Immunization'], base_type => 'given', feeds => array['vaccines.doses'],
  to_fhir => 'vaccines.dose_fhir(jsonb)', labels => '{"en":"Vaccine","ar":"تطعيم"}');

-- the room's own list (rule 4: a list of work that is not places): the Vaccination room's line is this list alone (its setup); in a
-- clinic using the pack it is a tab beside the queue, as drawn for family medicine, so it declares no base screen it stands in for
select core.declare_screen('vaccines.room', 'vaccines', 'visits', '{"en":"Vaccines"}', 'write:vaccines.dose');

-- the national schedule (Q26 a): the MOHP's rows, loaded read-only with their date and source and replaced by an import when the ministry
-- changes them (the action that writes it, import:vaccines.national, is held by no role: the import writes it). The demo loads a sample,
-- said to be one. Each row: its key, the series and dose, its name, the age in words, the earliest age and the interval after the last
-- dose of its series in days, how it is given, its route and site, its CVX code
select core.declare_action('import:vaccines.national', 'vaccines', 'organization', '{"en":"Load the national immunisation schedule (an import)"}');
select core.declare_setting('vaccines.national', 'vaccines', 'organization',
  '{"type":"object","additionalProperties":false,"required":["rows"],"properties":{"version":{"type":"string"},"source":{"type":"string"},"sample":{"type":"boolean","default":false},
    "rows":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["key","vaccine","name","dose","age","earliest_days"],
    "properties":{"key":{"type":"string","minLength":1},"vaccine":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"dose":{"type":"integer","minimum":0,"maximum":20},
      "age":{"type":"string"},"earliest_days":{"type":"integer","minimum":0},"interval_days":{"type":"integer","minimum":0},"latest_days":{"type":"integer","minimum":0},
      "how":{"type":"string"},"route":{"type":"string"},"site":{"type":"string"},"cvx":{"type":"string"}}}}}}',
  labels => '{"en":"National schedule (MOHP)"}', form => 'pack', action => 'import:vaccines.national',
  fields => '[{"key":"version","labels":{"en":"Version"}},{"key":"source","labels":{"en":"Source"}},{"key":"sample","labels":{"en":"A demo sample, not the full list"}},
    {"key":"rows","labels":{"en":"National rows"},"help":{"en":"Loaded read-only from the ministry''s schedule; an import replaces them when the ministry changes them."}},
    {"key":"rows.key","labels":{"en":"Key"}},{"key":"rows.vaccine","labels":{"en":"Series"}},{"key":"rows.name","labels":{"en":"Vaccine"}},{"key":"rows.dose","labels":{"en":"Dose"}},
    {"key":"rows.age","labels":{"en":"Age"}},{"key":"rows.earliest_days","labels":{"en":"Earliest (days)"}},{"key":"rows.interval_days","labels":{"en":"After the last (days)"}},
    {"key":"rows.latest_days","labels":{"en":"Latest (days)"}},{"key":"rows.how","labels":{"en":"How"}},{"key":"rows.route","labels":{"en":"Route"}},{"key":"rows.site","labels":{"en":"Site"}},{"key":"rows.cvx","labels":{"en":"CVX"}}]');

-- the clinic's optional rows, its own (Q26 a): the parents' choice (pneumococcal, rotavirus, varicella, hepatitis A, influenza,
-- meningococcal) and, for ObGyn, tetanus in pregnancy; each a series and dose with its age, earliest, interval and how it is given
-- (the rows a clinic usually offers are the shape's default, read until the clinic saves its own)
select core.declare_setting('vaccines.optional', 'vaccines', 'organization',
  jsonb_set('{"type":"object","additionalProperties":false,"required":["rows"],"properties":{"rows":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["vaccine","name","dose"],
    "properties":{"vaccine":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"dose":{"type":"integer","minimum":0,"maximum":20},"age":{"type":"string"},
      "earliest_days":{"type":"integer","minimum":0},"interval_days":{"type":"integer","minimum":0},"latest_days":{"type":"integer","minimum":0},
      "how":{"type":"string"},"route":{"type":"string"},"site":{"type":"string"},"cvx":{"type":"string"},"pregnancy":{"type":"boolean","default":false}}}}}}'::jsonb, '{properties,rows,default}', $j$[
    {"vaccine":"pcv","name":"Pneumococcal","dose":1,"age":"2 mo","earliest_days":42,"how":"IM","route":"im","site":"left thigh","cvx":"133"},
    {"vaccine":"pcv","name":"Pneumococcal","dose":2,"age":"4 mo","earliest_days":70,"interval_days":28,"how":"IM","route":"im","site":"left thigh","cvx":"133"},
    {"vaccine":"pcv","name":"Pneumococcal","dose":3,"age":"6 mo","earliest_days":98,"interval_days":28,"how":"IM","route":"im","site":"left thigh","cvx":"133"},
    {"vaccine":"pcv","name":"Pneumococcal","dose":4,"age":"12–15 mo","earliest_days":365,"interval_days":56,"how":"IM, the booster","route":"im","site":"left thigh","cvx":"133"},
    {"vaccine":"rota","name":"Rotavirus","dose":1,"age":"2 mo","earliest_days":42,"latest_days":105,"how":"by mouth","route":"oral","cvx":"119"},
    {"vaccine":"rota","name":"Rotavirus","dose":2,"age":"4 mo","earliest_days":70,"interval_days":28,"latest_days":240,"how":"by mouth","route":"oral","cvx":"119"},
    {"vaccine":"var","name":"Varicella","dose":1,"age":"12 mo","earliest_days":365,"how":"under the skin","route":"sc","site":"left arm","cvx":"21"},
    {"vaccine":"hepa","name":"Hepatitis A","dose":1,"age":"12 mo","earliest_days":365,"how":"IM","route":"im","site":"left thigh","cvx":"83"},
    {"vaccine":"flu","name":"Influenza","dose":1,"age":"each autumn from 6 mo","earliest_days":183,"how":"IM","route":"im","cvx":"150"},
    {"vaccine":"tt","name":"Tetanus (pregnancy)","dose":1,"age":"in pregnancy","how":"IM, left upper arm","route":"im","site":"left arm","cvx":"35","pregnancy":true},
    {"vaccine":"tt","name":"Tetanus (pregnancy)","dose":2,"age":"4 weeks after the first","interval_days":28,"how":"IM, left upper arm","route":"im","site":"left arm","cvx":"35","pregnancy":true}
  ]$j$::jsonb),
  labels => '{"en":"Optional vaccines"}', form => 'pack',
  fields => '[{"key":"rows","labels":{"en":"Optional rows"},"help":{"en":"The parents'' choice and the clinic''s own (tetanus in pregnancy): each a series and dose, its age, the earliest age and the interval after the last dose in days. The national rows are the MOHP''s list, read-only (Settings → Reference lists)."}},
    {"key":"rows.vaccine","labels":{"en":"Series"}},{"key":"rows.name","labels":{"en":"Vaccine"}},{"key":"rows.dose","labels":{"en":"Dose"}},{"key":"rows.age","labels":{"en":"Age"}},
    {"key":"rows.earliest_days","labels":{"en":"Earliest (days)"}},{"key":"rows.interval_days","labels":{"en":"After the last (days)"}},{"key":"rows.latest_days","labels":{"en":"Latest (days)"}},
    {"key":"rows.how","labels":{"en":"How"}},{"key":"rows.route","labels":{"en":"Route"}},{"key":"rows.site","labels":{"en":"Site"}},{"key":"rows.cvx","labels":{"en":"CVX"}},
    {"key":"rows.pregnancy","labels":{"en":"In pregnancy"}}]');

-- its starter setup (§5.2): the Vaccination room, a clinic whose own list stands in for the queue
select core.declare_setup('vaccines.room', 'vaccines', 'visits', '{"en":"Vaccination room"}', packs => array['vaccines'],
  screens => '{"screens":["vaccines.room"],"opens":"vaccines.room"}',
  help => '{"en":"Who is due today, this week and overdue by the schedule; a walk-in with the mother''s card; each dose given with its lot and site."}');

-- its person (§5.2): the vaccinator runs the room — a nurse who also checks a walk-in in, registers a new child (the desk's card,
-- here), gives the doses and finishes the visit
select core.declare_role('00000000-0000-0000-0000-00000000e0a1', 'vaccines.vaccinator', 'vaccines', 'Vaccinator',
  array['write:vaccines.dose', 'write:checked_in', 'manage:patients', 'write:seen', 'write:done', 'write:left'], '{"en":"Vaccinator"}',
  built_on => '00000000-0000-0000-0000-00000000c003');
