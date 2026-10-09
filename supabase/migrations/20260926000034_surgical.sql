-- 34 · the surgical pack (spec/openCare.md §5.8; the pictures /pictures.html#surg-clinic, #surg-opnote). Ticked where a surgeon's work
-- is done — the Surgery clinic, the Theatre, the surgical ward (Q47, drawn): the chart's Surgery section and its banner words ("for op",
-- "op today"), and the operation note. The operation is the base's procedure (what, when, why, done); the note is the pack's operation
-- note extending the base's note (surgeon, assistant, anaesthetist, the times, why, findings, steps, closure, blood loss, drain,
-- complications; the specimen and the implants read from Sign out). The template is the surgeon's own for each operation (a clinic
-- setting); the post-op orders are the base's presets the surgeon signs with the note, in theatre (Q46, drawn).

set client_min_messages = warning;

select core.declare_pack('surgical', 1, '{}', '{"en":"Surgery","ar":"الجراحة"}', role_block => 'e9');
select core.create_pack('surgical');
insert into core.codes (system, code, labels, props) values ('loinc', '11504-8', '{"en":"Surgical operation note"}', '{"note":"operation"}') on conflict do nothing;

set role pack_surgical;
-- the operation note's line: the operation, the times, blood loss, drain, complications ("Laparoscopic cholecystectomy · 08:55–09:40 · 30 mL · no drain")
create function surgical.opnote_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Operation note · ' || coalesce(e -> 'data' -> 'surgical' ->> 'operation', e -> 'data' ->> 'heading', 'operation') ||
    coalesce(' · ' || (e -> 'data' -> 'surgical' -> 'times' ->> 'from') || '–' || (e -> 'data' -> 'surgical' -> 'times' ->> 'to'), '') ||
    coalesce(' · blood loss ' || (e -> 'data' -> 'surgical' ->> 'blood_loss') || ' mL', '') ||
    coalesce(' · ' || case when coalesce(e -> 'data' -> 'surgical' ->> 'drain', 'none') = 'none' then 'no drain' else e -> 'data' -> 'surgical' ->> 'drain' end, '') ||
    case when jsonb_array_length(coalesce(e -> 'data' -> 'surgical' -> 'complications', '[]')) = 0 then ' · no complications'
      else ' · ' || array_to_string(array(select jsonb_array_elements_text(e -> 'data' -> 'surgical' -> 'complications')), ', ') end
$$;
reset role;

select core.declare_type('surgical.opnote', 1, 'surgical',
  jsonb_set((select t.shape from core.types t where t.key = 'note' order by t.version desc limit 1), '{properties,surgical}',
    '{"type":"object","additionalProperties":false,"required":["operation"],"properties":{
      "op":{"type":"string","format":"uuid"},"operation":{"type":"string","minLength":1},"surgeon":{"type":"string"},"assistant":{"type":"string"},"anaesthetist":{"type":"string"},
      "technique":{"type":"string"},"times":{"type":"object","additionalProperties":false,"properties":{"from":{"type":"string"},"to":{"type":"string"}}},
      "why":{"type":"string"},"findings":{"type":"string"},"steps":{"type":"string"},"closure":{"type":"string"},
      "blood_loss":{"type":"integer","minimum":0},"drain":{"type":"string"},"complications":{"type":"array","items":{"type":"string"}},
      "specimen":{"type":"string"},"implants":{"type":"string"}}}'),
  'surgical.opnote_line(jsonb)', array['DocumentReference'], base_type => 'note', labels => '{"en":"Operation note","ar":"تقرير العملية"}');

select core.declare_action('write:surgical.opnote', 'surgical', 'department', '{"en":"Write the operation note"}');
-- the surgeon's templates (a clinic setting): for each surgeon and operation, the why, findings, steps and closure the note starts from
select core.declare_setting('surgical.templates', 'surgical', 'organization',
  '{"type":"object","additionalProperties":false,"required":["templates"],"properties":{"templates":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["operation"],"properties":{"surgeon":{"type":"string"},"operation":{"type":"string","minLength":1},"why":{"type":"string"},"findings":{"type":"string"},
      "steps":{"type":"string"},"closure":{"type":"string"},"postop":{"type":"string"}}}}}}',
  labels => '{"en":"Operation note templates"}', form => 'pack',
  fields => '[{"key":"templates","labels":{"en":"Templates"},"help":{"en":"Each surgeon''s own for an operation (its code on the Theatre''s list): the note starts from it, every line editable. Post-op: the preset''s shortcut it offers."}},
    {"key":"templates.surgeon","labels":{"en":"Surgeon"}},{"key":"templates.operation","labels":{"en":"Operation code"}},{"key":"templates.why","labels":{"en":"Why"}},
    {"key":"templates.findings","labels":{"en":"Findings"}},{"key":"templates.steps","labels":{"en":"Steps"}},{"key":"templates.closure","labels":{"en":"Closure"}},
    {"key":"templates.postop","labels":{"en":"Post-op preset"}}]');

-- its person (§5.2): the surgeon, a doctor who writes the operation note
select core.declare_role('00000000-0000-0000-0000-00000000e901', 'surgical.surgeon', 'surgical', 'Surgeon', array['write:surgical.opnote'], '{"en":"Surgeon"}',
  built_on => '00000000-0000-0000-0000-00000000c002');

-- its starter setup: the Surgery clinic (the queue, ticks surgical)
select core.declare_setup('surgical.clinic', 'surgical', 'visits', '{"en":"Surgery clinic"}', packs => array['surgical'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  help => '{"en":"The decision to operate (/op, where the Theatre works for the clinic), the Surgery section, the operation note."}');
