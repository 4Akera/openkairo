-- 31 · the haematology pack (spec/openCare.md §5.7; the pictures /pictures.html#haem-blood, #haem-inr). The INR is the base's result,
-- warfarin the base's medication, each unit of blood the base's given (written at the bedside through the Blood bank's /transfuse, on the
-- laboratory pack); the ferritin a result, the chelation a medication. Its own types, for what the base lacks: the INR clinic's plan (the
-- reason, the target, the medicine), the INR clinic's week (each day's dose, what changed, the next INR) and the transfusion programme
-- (thalassaemia: every how many weeks, the Hb before, what the red cells need). Its settings: the targets by reason and the clinic's dosing
-- table (it suggests the week, never applies it); its starter setup and its role.

set client_min_messages = warning;

select core.declare_pack('haematology', 1, '{}', '{"en":"Haematology","ar":"أمراض الدم"}', role_block => 'e7');
select core.create_pack('haematology');

insert into core.codes (system, code, labels) values ('loinc', '890-4', '{"en":"Blood group antibody screen"}') on conflict do nothing;
-- the iron chelators, beside the base's ATC subset
insert into core.codes (system, code, labels) values ('atc', 'V03AC01', '{"en":"Deferoxamine"}'), ('atc', 'V03AC02', '{"en":"Deferiprone"}'),
  ('atc', 'V03AC03', '{"en":"Deferasirox"}') on conflict do nothing;
-- the ICD-10 code of the programme's patients, beside the base's committed subset (the trait is there, the major is not)
insert into core.codes (system, code, labels, props) values ('icd10', 'D56.1', '{"en":"Beta thalassaemia (major)"}', '{"chronic": true}') on conflict do nothing;

set role pack_haematology;
create function haematology.plan_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'INR clinic · ' || coalesce(e -> 'data' ->> 'reason', '') || ' · target ' || coalesce(e -> 'data' -> 'target' ->> 'low', '?') || '–' || coalesce(e -> 'data' -> 'target' ->> 'high', '?')
    || coalesce(' · ' || (e -> 'data' ->> 'medicine'), '')
$$;
create function haematology.week_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Warfarin · ' || trim(to_char((select sum(x::numeric) from jsonb_array_elements_text(e -> 'data' -> 'days') x), 'FM9990.0')) || ' mg a week'
    || coalesce(', was ' || trim(to_char((e -> 'data' ->> 'was')::numeric, 'FM9990.0')), '') || coalesce(' · next INR ' || (e -> 'data' ->> 'next_inr'), '')
$$;
create function haematology.programme_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Transfusion programme · every ' || coalesce(e -> 'data' ->> 'every_weeks', '?') || ' weeks · Hb before ' || coalesce(e -> 'data' -> 'hb' ->> 'low', '?') || '–'
    || coalesce(e -> 'data' -> 'hb' ->> 'high', '?') || coalesce(' · ' || (select string_agg(x, ', ') from jsonb_array_elements_text(e -> 'data' -> 'needs') x), '')
$$;
reset role;

select core.declare_action('write:haematology.plan', 'haematology', 'department', '{"en":"Set the INR clinic''s reason and target"}', everyday => true);
select core.declare_action('write:haematology.week', 'haematology', 'department', '{"en":"Write the INR clinic''s week"}', everyday => true);
select core.declare_action('write:haematology.programme', 'haematology', 'department', '{"en":"Set a transfusion programme"}', everyday => true);
select core.declare_type('haematology.plan', 1, 'haematology', '{"type":"object","additionalProperties":false,"required":["reason","target"],
    "properties":{"reason":{"type":"string","minLength":1},"target":{"type":"object","additionalProperties":false,"required":["low","high"],
      "properties":{"low":{"type":"number","minimum":1,"maximum":5},"high":{"type":"number","minimum":1,"maximum":5}}},
      "medicine":{"type":"string"},"tablet_mg":{"type":"number","exclusiveMinimum":0,"maximum":20},"status":{"enum":["active","stopped"]},"note":{"type":"string"}}}'::jsonb,
  'haematology.plan_line(jsonb)', labels => '{"en":"INR clinic plan","ar":"خطة عيادة السيولة"}');
select core.declare_type('haematology.week', 1, 'haematology', '{"type":"object","additionalProperties":false,"required":["days"],
    "properties":{"days":{"type":"array","minItems":7,"maxItems":7,"items":{"type":"number","minimum":0,"maximum":30}},"was":{"type":"number","minimum":0},
      "inr":{"type":"number","minimum":0.5,"maximum":15},"missed":{"enum":["none","one","two or more"]},"food":{"enum":["as usual","more greens","fewer greens"]},
      "bleeding":{"enum":["none","minor","major"]},"suggested":{"type":"number","minimum":0},"used_suggestion":{"type":"boolean"},
      "next_inr":{"type":"string","format":"date"},"note":{"type":"string"}}}'::jsonb,
  'haematology.week_line(jsonb)', labels => '{"en":"INR clinic week","ar":"جدول الوارفارين"}');
select core.declare_type('haematology.programme', 1, 'haematology', '{"type":"object","additionalProperties":false,"required":["every_weeks","hb"],
    "properties":{"condition":{"type":"string"},"every_weeks":{"type":"integer","minimum":1,"maximum":12},"hb":{"type":"object","additionalProperties":false,"required":["low","high"],
      "properties":{"low":{"type":"number","minimum":5,"maximum":15},"high":{"type":"number","minimum":5,"maximum":16}}},
      "needs":{"type":"array","items":{"enum":["leucodepleted","Rh and Kell matched","irradiated","washed"]}},"status":{"enum":["active","stopped"]},"note":{"type":"string"}}}'::jsonb,
  'haematology.programme_line(jsonb)', labels => '{"en":"Transfusion programme","ar":"برنامج نقل الدم"}');

-- the targets by reason (the clinic's table, ESC/ACCP practice) and the dosing table (Q38): an INR band, the change to the week, the next INR
select core.declare_setting('haematology.inr', 'haematology', 'organization',
  $j${"type":"object","additionalProperties":false,"required":["targets","table"],"properties":{
    "targets":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["reason","low","high"],"properties":{"reason":{"type":"string","minLength":1},
      "low":{"type":"number","minimum":1,"maximum":5},"high":{"type":"number","minimum":1,"maximum":5}}},
      "default":[{"reason":"AF","low":2,"high":3},{"reason":"AF with rheumatic mitral stenosis","low":2,"high":3},{"reason":"DVT or PE","low":2,"high":3},
        {"reason":"Mechanical mitral valve","low":2.5,"high":3.5},{"reason":"Mechanical aortic valve","low":2,"high":3}]},
    "table":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["from","to","change","next_days","says"],"properties":{
      "from":{"type":"number","minimum":0,"maximum":20},"to":{"type":"number","minimum":0,"maximum":20},"change":{"type":"number","minimum":-50,"maximum":50},
      "next_days":{"type":"integer","minimum":1,"maximum":90},"says":{"type":"string","minLength":1}}},
      "default":[{"from":0,"to":1.49,"change":15,"next_days":7,"says":"the week up 10–20 %"},{"from":1.5,"to":1.99,"change":7.5,"next_days":7,"says":"the week up 5–10 %"},
        {"from":2,"to":3,"change":0,"next_days":28,"says":"no change"},{"from":3.01,"to":3.99,"change":-7.5,"next_days":7,"says":"the week down 5–10 %"},
        {"from":4,"to":4.99,"change":-10,"next_days":7,"says":"hold one dose, then the week down 10 %"},
        {"from":5,"to":20,"change":-15,"next_days":2,"says":"hold, see the doctor today: vitamin K by the protocol"}]}}}$j$,
  labels => '{"en":"INR clinic: targets and the dosing table"}', form => 'pack',
  fields => '[{"key":"targets","labels":{"en":"Targets by reason"}},{"key":"targets.reason","labels":{"en":"Reason"}},{"key":"targets.low","labels":{"en":"From"}},{"key":"targets.high","labels":{"en":"To"}},
    {"key":"table","labels":{"en":"Dosing table (target 2–3)"},"help":{"en":"An INR band, the change to the week it suggests (shown, never applied: the doctor uses it or writes another) and when the next INR is."}},
    {"key":"table.from","labels":{"en":"INR from"}},{"key":"table.to","labels":{"en":"to"}},{"key":"table.change","labels":{"en":"Change"},"unit":"%"},{"key":"table.next_days","labels":{"en":"Next INR"},"unit":"days"},
    {"key":"table.says","labels":{"en":"Says"}}]');

-- its starter setup (§5.2): the Haematology clinic, the base's queue, the pack ticked
select core.declare_setup('haematology.clinic', 'haematology', 'visits', '{"en":"Haematology clinic"}', packs => array['haematology'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  help => '{"en":"Blood disorders and the INR clinic: the transfusion programme and iron, warfarin by the week (/inr), blood ordered from the Blood bank (/blood)."}');
select core.declare_role('00000000-0000-0000-0000-00000000e701', 'haematology.haematologist', 'haematology', 'Haematologist', array['write:haematology.plan', 'write:haematology.week', 'write:haematology.programme'],
  '{"en":"Haematologist"}', built_on => '00000000-0000-0000-0000-00000000c002');
