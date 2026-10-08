-- 35 · the theatre pack (spec/openCare.md §5.7; the pictures /pictures.html#surg-clinic, #theatre-list, #theatre-checklist). The
-- operation is the base's order to the Theatre, extended by the pack (Q41, drawn): the side (asked big), the anaesthesia wanted, a day
-- case or admitted, the surgeon, the usual time and the risks told, through the order door of §5.5 (a); /op is offered wherever the
-- Theatre works for the department and searches only its operations (each with its usual time, whether it has a side, the risks to
-- tell: a setting). The Theatre answers each with its own steps (scheduled, sent for, arrived, anaesthesia, operating, recovery,
-- back), each the pack's step extending the base's step, the schedule's room and time on it. The theatre list is the pack's own
-- screen and the Theatre's only one (Q42): rooms and their sessions (a setting), today's cases by room in the order put, emergencies on
-- top until a room takes them, To schedule by priority then weeks waiting. The WHO checklist's three parts (Q44, drawn) are each the
-- pack's own entry, signed by who said it when it is said: the counts, the implants with their lot, the specimen as a /lab order.

set client_min_messages = warning;

select core.declare_pack('theatre', 1, '{}', '{"en":"Theatre","ar":"العمليات"}', role_block => 'ea');
select core.create_pack('theatre');

-- the ICD-10 and ATC codes its demo and its regimens write, beside the demo subset (seeds/codes.sql); an installation's full import has them
insert into core.codes (system, code, labels) values
  ('icd10', 'K40.9', '{"en":"Inguinal hernia, unilateral, without obstruction or gangrene"}'), ('icd10', 'K35.8', '{"en":"Acute appendicitis"}'),
  ('icd10', 'K42.9', '{"en":"Umbilical hernia without obstruction or gangrene"}'), ('icd10', 'N83.2', '{"en":"Other ovarian cysts"}'),
  ('icd10', 'S42.4', '{"en":"Fracture of lower end of humerus"}'), ('icd10', 'S52.5', '{"en":"Fracture of lower end of radius"}'),
  ('atc', 'J01DB04', '{"en":"Cefazolin"}'), ('atc', 'N01AX10', '{"en":"Propofol"}'), ('atc', 'N01AH01', '{"en":"Fentanyl"}'), ('atc', 'M03AC09', '{"en":"Rocuronium"}'),
  ('atc', 'C01CA26', '{"en":"Ephedrine"}'), ('atc', 'N07AA01', '{"en":"Neostigmine"}'), ('atc', 'A03BA01', '{"en":"Atropine"}'), ('atc', 'N01BB01', '{"en":"Bupivacaine"}'),
  ('atc', 'N01AB08', '{"en":"Sevoflurane"}'), ('atc', 'B05BB01', '{"en":"Ringer''s lactate"}')
on conflict do nothing;

set role pack_theatre;

-- ── the operations asked for (its order type's data.theatre): the list's rows ──
create table theatre.cases (
  organization_id uuid not null,
  item          uuid not null,             -- the operation's order item
  patient_id    uuid not null,
  from_department_id uuid,
  to_department_id uuid,                   -- the Theatre
  service_code  text,
  name          text,                      -- the operation, as the Theatre names it
  side          text,                      -- left · right · both · none
  technique     text,                      -- the anaesthetic wanted: general · spinal · local · anaesthetist (the anaesthetist decides)
  stay          text,                      -- day · admitted
  surgeon       text,
  usual_min     int,
  risks         int,                       -- how many risks were told
  priority      text,
  status        text,
  ordered_at    timestamptz,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
-- ── where each stands: the Theatre's step on it, the room and time it was put in ──
create table theatre.slots (
  organization_id uuid not null,
  item          uuid not null,             -- the step's item (each step changes the one before: one item per operation)
  op            uuid not null,             -- the operation's order item
  patient_id    uuid not null,
  step          text,
  status        text,
  room          text,
  starts        timestamptz,
  position      int,
  at            timestamptz,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
-- ── the checklist's parts said on each ──
create table theatre.checks (
  organization_id uuid not null,
  item          uuid not null,
  op            uuid not null,
  patient_id    uuid not null,
  part          text not null,             -- sign_in · time_out · sign_out
  at            timestamptz,
  missed        int not null default 0,    -- items not done (each says why)
  source_entries uuid[] not null,
  primary key (organization_id, item)
);

create function theatre.cases_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from theatre.cases where organization_id = p_org and item = any (p_items);
  insert into theatre.cases
  select p_org, l.item, core.survivor(p_org, l.patient_id), l.department_id, (l.data ->> 'department_id')::uuid, l.data -> 'service' ->> 'code', l.data -> 'service' ->> 'name',
         w ->> 'side', w ->> 'technique', w ->> 'stay', w ->> 'surgeon', (w ->> 'usual_min')::int, jsonb_array_length(coalesce(w -> 'risks', '[]')),
         l.data ->> 'priority', l.data ->> 'status', f.at,
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and x.type = 'theatre.op' order by x.item, x.item_version desc) l
    cross join lateral (select l.data -> 'theatre' as w) ww
    cross join lateral (select min(y.occurred_at) at from core.pack_entries(p_org, array[l.item]) y where y.item = l.item and y.item_version = 1) f;
end $$;
create function theatre.slots_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from theatre.slots where organization_id = p_org and item = any (p_items);
  insert into theatre.slots
  select p_org, l.item, (l.data -> 'theatre' ->> 'op')::uuid, core.survivor(p_org, l.patient_id), l.data ->> 'step', l.data ->> 'status',
         l.data -> 'theatre' ->> 'room', (l.data -> 'theatre' ->> 'starts')::timestamptz, (l.data -> 'theatre' ->> 'position')::int, l.occurred_at,
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and x.type = 'theatre.step' order by x.item, x.item_version desc) l;
end $$;
create function theatre.checks_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from theatre.checks where organization_id = p_org and item = any (p_items);
  insert into theatre.checks
  select p_org, l.item, (l.data ->> 'op')::uuid, core.survivor(p_org, l.patient_id), l.data ->> 'part', l.occurred_at,
         (select count(*) from jsonb_array_elements(coalesce(l.data -> 'items', '[]')) i where not coalesce((i ->> 'done')::boolean, false)),
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and x.type = 'theatre.check' order by x.item, x.item_version desc) l;
end $$;

-- the operation's line: the base's words with the side, the stay ("Inguinal hernia repair, open mesh · right · day case")
create function theatre.op_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'revoked' then 'Cancelled: ' when 'on-hold' then 'On hold: ' else '' end ||
    coalesce(e -> 'data' -> 'service' ->> 'name', 'Operation') ||
    case when e -> 'data' -> 'theatre' ->> 'side' in ('left', 'right', 'both') then ' · ' || (e -> 'data' -> 'theatre' ->> 'side') else '' end ||
    case when coalesce(e -> 'data' ->> 'priority', 'routine') <> 'routine' then ' · ' || case e -> 'data' ->> 'priority' when 'stat' then 'emergency' else e -> 'data' ->> 'priority' end else '' end ||
    case e -> 'data' -> 'theatre' ->> 'stay' when 'day' then ' · day case' when 'admitted' then ' · admitted' else '' end ||
    coalesce(' · ' || nullif(e -> 'data' -> 'theatre' ->> 'surgeon', ''), '')
$$;
create function theatre.step_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'step' when 'scheduled' then 'Scheduled' when 'sent_for' then 'Sent for' when 'arrived' then 'Arrived in theatre'
    when 'anaesthetic' then 'Anaesthetic' when 'operating' then 'Operating' when 'recovery' then 'In recovery' when 'back' then 'Back to the ward'
    else coalesce(e -> 'data' ->> 'step', 'Step') end ||
    coalesce(' · ' || (e -> 'data' -> 'theatre' ->> 'room'), '') ||
    coalesce(' · ' || to_char((e -> 'data' -> 'theatre' ->> 'starts')::timestamptz at time zone 'Africa/Cairo', 'Dy DD Mon HH24:MI'), '') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;
create function theatre.check_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'part' when 'sign_in' then 'Sign in' when 'time_out' then 'Time out' when 'sign_out' then 'Sign out' else 'Checklist' end ||
    ' · ' || (select count(*) filter (where coalesce((i ->> 'done')::boolean, false)) || ' of ' || count(*) from jsonb_array_elements(coalesce(e -> 'data' -> 'items', '[]')) i) ||
    coalesce(' · ' || nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(e -> 'data' -> 'by', '[]'))), ', '), ''), '')
$$;
-- its FHIR beside the base's ServiceRequest: the side as the bodySite, the anaesthetic wanted and the stay as orderDetail
create function theatre.op_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'ServiceRequest', 'id', p -> 'entries' -> 0 ->> 'item',
      'bodySite', case when w ->> 'side' in ('left', 'right', 'both') then jsonb_build_array(jsonb_build_object('text', w ->> 'side')) end,
      'orderDetail', nullif(coalesce((select jsonb_agg(jsonb_build_object('text', t)) from unnest(array[
        case when w ? 'technique' then 'Anaesthetic: ' || (w ->> 'technique') end,
        case when w ? 'stay' then case w ->> 'stay' when 'day' then 'Day case' else 'Admitted' end end,
        case when w ? 'usual_min' then 'Usual time ' || (w ->> 'usual_min') || ' min' end]) t where t is not null), '[]'), '[]'))))
    from (select e -> 'data' -> 'theatre' w from jsonb_array_elements(p -> 'entries') with ordinality x(e, k)
           where e ->> 'type' <> 'crossed_out' and e -> 'data' ? 'theatre' order by k desc limit 1) q where w <> '{}'::jsonb), '[]')
$$;

reset role;

grant select, delete on theatre.cases, theatre.slots, theatre.checks to core_eraser;
grant execute on function theatre.cases_refresh(uuid, uuid[]), theatre.slots_refresh(uuid, uuid[]), theatre.checks_refresh(uuid, uuid[]) to core_eraser;

select core.declare_table('theatre.cases', 'theatre', 'theatre.cases_refresh(uuid,uuid[])', 'read:bench');
select core.declare_table('theatre.slots', 'theatre', 'theatre.slots_refresh(uuid,uuid[])', 'read:bench');
select core.declare_table('theatre.checks', 'theatre', 'theatre.checks_refresh(uuid,uuid[])', 'read:bench');

-- the operation: the base's order to the Theatre with theatre's words beside it (write:order wherever the surgeon orders from)
select core.declare_type('theatre.op', 1, 'theatre',
  jsonb_set((select t.shape from core.types t where t.key = 'order' order by t.version desc limit 1), '{properties,theatre}',
    '{"type":"object","additionalProperties":false,"properties":{"side":{"enum":["left","right","both","none"]},
      "technique":{"enum":["general","spinal","local","anaesthetist"]},"stay":{"enum":["day","admitted"]},"surgeon":{"type":"string"},
      "usual_min":{"type":"integer","minimum":1},"risks":{"type":"array","items":{"type":"string"}}}}'),
  'theatre.op_line(jsonb)', array['ServiceRequest'], base_type => 'order', feeds => array['theatre.cases'], to_fhir => 'theatre.op_fhir(jsonb)',
  labels => '{"en":"Operation","ar":"عملية"}');
-- the Theatre's step on it: the base's step with the room and time it was put in, and the operation it moves
select core.declare_type('theatre.step', 1, 'theatre',
  jsonb_set((select t.shape from core.types t where t.key = 'step' order by t.version desc limit 1), '{properties,theatre}',
    '{"type":"object","additionalProperties":false,"required":["op"],"properties":{"op":{"type":"string","format":"uuid"},
      "room":{"type":"string"},"starts":{"$ref":"#/$defs/datetime"},"position":{"type":"integer","minimum":0}}}'),
  'theatre.step_line(jsonb)', array['Task'], base_type => 'step', feeds => array['theatre.slots'], labels => '{"en":"Theatre step"}');
-- a part of the WHO Surgical Safety Checklist (2009), signed by who said it when it was said: its items (each done or why not, who
-- said it), and at Sign out the counts, the implants with their lot, the specimen sent
select core.declare_type('theatre.check', 1, 'theatre',
  '{"type":"object","additionalProperties":false,"required":["op","part","items"],"properties":{
    "op":{"type":"string","format":"uuid"},"part":{"enum":["sign_in","time_out","sign_out"]},
    "items":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["key","text","done"],"properties":{
      "key":{"type":"string"},"text":{"type":"string"},"done":{"type":"boolean"},"who":{"type":"string"},"not":{"type":"string"}}}},
    "counts":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["what"],"properties":{
      "what":{"type":"string"},"before":{"type":"integer","minimum":0},"added":{"type":"integer","minimum":0},"after":{"type":"integer","minimum":0}}}},
    "implants":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["what"],"properties":{
      "what":{"type":"string"},"lot":{"type":"string"},"left_in":{"type":"integer","minimum":0},"used":{"type":"integer","minimum":0}}}},
    "specimen":{"type":"string"},"by":{"type":"array","items":{"type":"string"}},"note":{"type":"string"}}}'::jsonb,
  'theatre.check_line(jsonb)', '{}', feeds => array['theatre.checks'], labels => '{"en":"WHO checklist"}');

-- who writes them: the Theatre's steps and the checklist are everyday where a department ticks theatre (its doctors and nurses say
-- them: the surgeon, the anaesthetist, the scrub nurse); the theatre nurse runs the list
select core.declare_action('write:theatre.step', 'theatre', 'department', '{"en":"Move a case on the theatre list"}', everyday => true);
select core.declare_action('write:theatre.check', 'theatre', 'department', '{"en":"Sign a part of the WHO checklist"}', everyday => true);
select core.declare_role('00000000-0000-0000-0000-00000000ea01', 'theatre.nurse', 'theatre', 'Theatre nurse', array['read:bench', 'write:theatre.step',
  'write:theatre.check', 'write:order', 'write:step'], '{"en":"Theatre nurse"}', built_on => '00000000-0000-0000-0000-00000000c003');

-- its screen, in place of the bench: the theatre list (rooms, today's cases, emergencies on top, To schedule)
select core.declare_screen('theatre.list', 'theatre', 'bench', '{"en":"Theatre list"}', 'read:bench', array['base.bench']);

-- its operations (by the service's code): the usual time, whether it has a side, the risks to tell; and its rooms and their sessions
select core.declare_setting('theatre.operations', 'theatre', 'department',
  '{"type":"object","additionalProperties":false,"required":["operations"],"properties":{"operations":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["code"],"properties":{"code":{"type":"string","minLength":1},"usual_min":{"type":"integer","minimum":5},"side":{"type":"boolean","default":false},
      "risks":{"type":"array","items":{"type":"string"}}}}}}}',
  labels => '{"en":"Operations"}', form => 'department',
  fields => '[{"key":"operations","labels":{"en":"Operations"},"help":{"en":"Each operation by its service code: its usual time (the list is put in order by it), whether a side is asked, and the risks told before consent."}},
    {"key":"operations.code","labels":{"en":"Code"}},{"key":"operations.usual_min","labels":{"en":"Usual time"},"unit":"min"},{"key":"operations.side","labels":{"en":"Asks a side"}},
    {"key":"operations.risks","labels":{"en":"Risks to tell"}}]');
select core.declare_setting('theatre.rooms', 'theatre', 'department',
  '{"type":"object","additionalProperties":false,"required":["rooms"],"properties":{
    "rooms":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["name"],"properties":{"name":{"type":"string","minLength":1},"specialty":{"type":"string"}}}},
    "sessions":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["room","weekday","from","to"],"properties":{
      "room":{"type":"string"},"weekday":{"enum":["sat","sun","mon","tue","wed","thu","fri"]},"from":{"type":"string","pattern":"^[0-2][0-9]:[0-5][0-9]$"},
      "to":{"type":"string","pattern":"^[0-2][0-9]:[0-5][0-9]$"},"surgeon":{"type":"string"}}}}}}',
  labels => '{"en":"Rooms and sessions"}', form => 'department',
  fields => '[{"key":"rooms","labels":{"en":"Rooms"}},{"key":"rooms.name","labels":{"en":"Name"}},{"key":"rooms.specialty","labels":{"en":"Specialty"}},
    {"key":"sessions","labels":{"en":"Sessions"},"help":{"en":"A surgeon''s list on a day of the week, in a room, from and to."}},{"key":"sessions.room","labels":{"en":"Room"}},
    {"key":"sessions.weekday","labels":{"en":"Day"},"choices":{"sat":{"en":"Saturday"},"sun":{"en":"Sunday"},"mon":{"en":"Monday"},"tue":{"en":"Tuesday"},"wed":{"en":"Wednesday"},"thu":{"en":"Thursday"},"fri":{"en":"Friday"}}},
    {"key":"sessions.from","labels":{"en":"From"}},{"key":"sessions.to","labels":{"en":"To"}},{"key":"sessions.surgeon","labels":{"en":"Surgeon"}}]');

-- its starter setup (§5.2): the Theatre, its list in place of the bench, the operations asked for most in Egypt by specialty (each
-- answered by the Theatre's own steps), three rooms with their week of sessions
select core.declare_setup('theatre.department', 'theatre', 'bench', '{"en":"Theatre"}', packs => array['theatre'],
  screens => '{"screens":["theatre.list"],"opens":"theatre.list"}',
  help => '{"en":"The theatre list: rooms and sessions, today''s cases in order, emergencies on top, To schedule; the WHO checklist on each case."}',
  settings => jsonb_build_object('department.works_for', '{"all":true}'::jsonb,
    'theatre.rooms', $j${"rooms":[{"name":"Theatre 1","specialty":"General surgery"},{"name":"Theatre 2","specialty":"Orthopaedics"},{"name":"Theatre 3","specialty":"Gynaecology"}],
      "sessions":[{"room":"Theatre 1","weekday":"sat","from":"08:30","to":"14:30"},{"room":"Theatre 1","weekday":"mon","from":"08:30","to":"14:30"},
        {"room":"Theatre 1","weekday":"thu","from":"08:30","to":"14:30"},{"room":"Theatre 2","weekday":"sun","from":"08:30","to":"14:30"},
        {"room":"Theatre 2","weekday":"thu","from":"08:30","to":"14:30"},{"room":"Theatre 3","weekday":"tue","from":"08:30","to":"14:30"},
        {"room":"Theatre 3","weekday":"thu","from":"08:30","to":"14:30"}]}$j$::jsonb,
    'theatre.operations', jsonb_build_object('operations', $j$[
      {"code":"lapchole","usual_min":75,"risks":["bleeding","wound infection · about 1 in 50","bile leak · about 1 in 200","injury to the bile duct · about 1 in 500","converted to open · about 1 in 20","shoulder-tip pain for a day or two"]},
      {"code":"ihr_mesh","usual_min":60,"side":true,"risks":["bleeding, bruising","wound infection · about 1 in 50","the hernia comes back · about 1 in 100","groin pain for months · about 1 in 10","numbness by the scar","harm to the testis · rare","trouble passing urine"]},
      {"code":"uhr_mesh","usual_min":45,"risks":["bleeding","wound infection · about 1 in 30","the hernia comes back · about 1 in 20","fluid under the wound"]},
      {"code":"haemorrhoid","usual_min":40,"risks":["pain for two weeks","bleeding · about 1 in 50","trouble passing urine","narrowing · rare","leaking wind or stool · rare"]},
      {"code":"lapappx","usual_min":45,"risks":["wound infection","an abscess inside · about 1 in 30","converted to open"]},
      {"code":"breastlump","usual_min":40,"side":true,"risks":["bleeding, a bruise","wound infection","a dent or change of shape","another operation if the edges are not clear"]},
      {"code":"thyroidectomy","usual_min":120,"risks":["bleeding in the neck · about 1 in 100","a hoarse voice · about 1 in 50 for a while","low calcium · tablets for life if lasting","thyroxine for life"]},
      {"code":"kwires_elbow","usual_min":45,"side":true,"risks":["the wires loosen or get infected","stiffness","nerve injury · usually recovers","a crooked elbow"]},
      {"code":"orif_radius","usual_min":75,"side":true,"risks":["wound infection","stiffness","the plate may need removing","tendon irritation"]},
      {"code":"tkr","usual_min":120,"side":true,"risks":["blood clots","infection · about 1 in 100","stiffness","the knee wears out · after 15–20 years","nerve or vessel injury · rare"]},
      {"code":"lapcyst","usual_min":60,"side":true,"risks":["bleeding","injury to bowel or bladder · rare","the ovary may be removed","converted to open"]},
      {"code":"tah","usual_min":120,"risks":["bleeding, a transfusion","infection","injury to bowel, bladder or ureter","blood clots"]},
      {"code":"dnc","usual_min":20,"risks":["bleeding","infection","a hole in the womb · rare"]}
    ]$j$::jsonb)),
  services => (select jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'section', x.kind, 'answer', 'theatre.step',
      'steps', '["scheduled","sent_for","arrived","anaesthetic","operating","recovery","back"]'::jsonb) order by x.n)
    from (values
      (1, 'lapchole', 'Laparoscopic cholecystectomy', 'General surgery'), (2, 'ihr_mesh', 'Inguinal hernia repair, open mesh', 'General surgery'),
      (3, 'uhr_mesh', 'Umbilical hernia repair, mesh', 'General surgery'), (4, 'haemorrhoid', 'Haemorrhoidectomy', 'General surgery'),
      (5, 'lapappx', 'Laparoscopic appendicectomy', 'General surgery'), (6, 'breastlump', 'Excision of breast lump', 'General surgery'),
      (7, 'thyroidectomy', 'Total thyroidectomy', 'General surgery'),
      (10, 'kwires_elbow', 'Closed reduction and K-wires, supracondylar fracture', 'Orthopaedics'), (11, 'orif_radius', 'Plate fixation, distal radius fracture', 'Orthopaedics'),
      (12, 'tkr', 'Total knee replacement', 'Orthopaedics'),
      (20, 'lapcyst', 'Laparoscopic ovarian cystectomy', 'Gynaecology'), (21, 'tah', 'Total abdominal hysterectomy', 'Gynaecology'), (22, 'dnc', 'Dilatation and curettage', 'Gynaecology')
    ) x(n, code, name, kind)));
