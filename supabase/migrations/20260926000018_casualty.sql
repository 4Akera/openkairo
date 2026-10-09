-- 18 · Emergency (spec/openCare.md §5.6), piece E2: arrivals and triage. Its key is casualty; a person always reads "Emergency" (the
-- word emergency is the core's and the base's own, so the lint would refuse it as a key). An ER patient is a short stay in a place: on
-- arrival the base's admitted with no place (the board's no-bed list is the waiting chairs), class EMER; the resus bays and cubicles
-- are the base's places. Triage is the pack's own type on the base's observation: five levels, each with a time to the doctor, on the
-- clinic's scale (the Australasian by default, the Manchester the other); levels 1 and 2 also write the base's urgent. The board's tiles
-- say each stay's level and time through the pack's own read (the owner's C1). Its triage nurse is built on the base's Nurse. Chosen by
-- Claude at the owner's request, awaiting the owner.

set client_min_messages = warning;

-- ── the pack, and its two scales as code systems: open, with no rows, so the export names a level with a coding ──
select core.declare_pack('casualty', 1, '{}', '{"en":"Emergency","ar":"الطوارئ"}', role_block => 'd1');
select core.create_pack('casualty');
select core.declare_system('casualty.ats', 'casualty', 'code', '{canon}/CodeSystem/triage-ats', 'P06', false, null,
  'Australasian College for Emergency Medicine: Policy on the Australasian Triage Scale (P06)', '{"en":"Australasian Triage Scale"}');
select core.declare_system('casualty.mts', 'casualty', 'code', '{canon}/CodeSystem/triage-mts', '3', false, null,
  'Manchester Triage Group: the five categories and their target times only; the flowcharts are not used', '{"en":"Manchester Triage System"}');

set role pack_casualty;

-- a triage in words: "Triage 2 · Very urgent · motorbike vs microbus, …"
create function casualty.triage_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Triage ' || coalesce(e -> 'data' -> 'value' -> 'concept' ->> 'text', e -> 'data' -> 'casualty' ->> 'level') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'note', ''), '')
$$;

-- a triage is for a patient in this department's beds (a stay admitted here, or opened by this department in the same Done), and its
-- level is said one way: one coding, its scale's and its level's, and the same level in its words and the scale's name in its code
create function casualty.triage_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; v_visit uuid := (p_entry ->> 'visit_id')::uuid; d jsonb := p_entry -> 'data';
        cs jsonb := p_entry -> 'data' -> 'value' -> 'concept' -> 'codings'; c jsonb := cs -> 0; v_stay jsonb;
        w text := case d -> 'casualty' ->> 'level' when '1' then 'Immediate' when '2' then 'Very urgent' when '3' then 'Urgent' when '4' then 'Standard'
                    when '5' then 'Non-urgent' end;
        v_code text := 'Triage level (' || case d -> 'casualty' ->> 'scale' when 'mts' then 'Manchester' else 'Australasian' end || ' scale)';
begin
  if c is null or jsonb_typeof(cs) <> 'array' or jsonb_array_length(cs) <> 1 or w is null
     or c ->> 'system' is distinct from 'casualty.' || (d -> 'casualty' ->> 'scale') or c ->> 'code' is distinct from d -> 'casualty' ->> 'level'
     or c ->> 'display' is distinct from w or d -> 'value' -> 'concept' ->> 'text' is distinct from (d -> 'casualty' ->> 'level') || ' · ' || w
     or d -> 'code' ->> 'text' is distinct from v_code then
    return jsonb_build_array(jsonb_build_object('code', 'triage_mismatch', 'level', 'refuse'));
  end if;
  if v_visit is null then return jsonb_build_array(jsonb_build_object('code', 'not_in_stay', 'level', 'refuse')); end if;
  select r into v_stay from core.pack_rows(v_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('item', v_visit))) r limit 1;
  if v_stay is not null then
    if v_stay ->> 'kind' = 'stay' and v_stay ->> 'state' = 'admitted' and (v_stay ->> 'department_id')::uuid = (p_entry ->> 'department_id')::uuid then
      return '[]';
    end if;
  elsif exists (select 1 from jsonb_array_elements(p_set) x where (x ->> 'id')::uuid = v_visit and core.base_of(x ->> 'type') = 'admitted'
                  and coalesce((x -> 'data' ->> 'department_id')::uuid, (x ->> 'department_id')::uuid) = (p_entry ->> 'department_id')::uuid) then
    return '[]';
  end if;
  return jsonb_build_array(jsonb_build_object('code', 'not_in_stay', 'level', 'refuse'));
end $$;

-- the board's words (the owner's C1, 2026-10-08): each stay admitted here, its latest triage (the level, its scale, when) and when a
-- doctor first wrote in it (someone who may discharge here: a Take, a note, an order), as the reader may see them (the doors mask; a
-- hidden entry comes back with no author and is passed over). An entry crossed out never counts; a correction counts from when it was
-- written, not from the time it corrects. This department's stays only, read here, never ids from the client; each patient it names is
-- read-logged by the door
create function casualty.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; t record; v_tri jsonb; v_seen timestamptz; v_ids uuid[] := '{}'; v_out jsonb := '{}';
begin
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_ids := v_ids || (s ->> 'patient_id')::uuid;
    select x.data, x.occurred_at into t from core.pack_kind(p_org, (s ->> 'patient_id')::uuid, 'casualty.triage', '{"current":true}'::jsonb) x
     where x.visit_id = (s ->> 'item')::uuid and x.author_id is not null order by x.occurred_at desc, x.recorded_at desc, x.id desc limit 1;
    v_tri := case when found then jsonb_build_object('level', (t.data -> 'casualty' ->> 'level')::int, 'scale', t.data -> 'casualty' ->> 'scale', 'at', t.occurred_at) end;
    with v as (select x.item, x.replaces, x.occurred_at, x.recorded_at from core.pack_visit(p_org, (s ->> 'item')::uuid) x
                where x.type not in ('admitted', 'crossed_out') and x.author_id is not null and core.may(x.author_id, 'write:discharged', p_department)),
         gone as (select y.item from core.pack_entries(p_org, array(select distinct v.item from v)) y where y.type = 'crossed_out')
    select min(case when v.replaces is null then v.occurred_at else v.recorded_at end) into v_seen from v where v.item not in (select gone.item from gone);
    v_out := v_out || jsonb_build_object(s ->> 'item', jsonb_strip_nulls(jsonb_build_object('triage', v_tri, 'seen_at', v_seen)));
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'stays', v_out);
end $$;
reset role;

-- ── the triage: the pack's own type on the base's observation (its kind check, record line rules, privacy, values, presence and
-- FHIR mapping apply; the export is the base's Observation). Retriage is a new item; the latest by occurred_at is the level now ──
select core.declare_type('casualty.triage', 1, 'casualty', $j${"type":"object","additionalProperties":false,"required":["code","value","casualty"],
  "properties":{
    "code":{"$ref":"#/$defs/concept"},
    "value":{"type":"object","additionalProperties":false,"required":["concept"],"properties":{"concept":{"$ref":"#/$defs/concept"}}},
    "note":{"type":"string"},
    "casualty":{"type":"object","additionalProperties":false,"required":["scale","level"],"properties":{
      "scale":{"enum":["ats","mts"]},
      "level":{"type":"integer","minimum":1,"maximum":5},
      "scale_version":{"type":"string"},
      "arrival":{"enum":["walked_in","ambulance","family","police","referred","other_hospital"]},
      "arrival_ref":{"type":"string","maxLength":40},
      "complaint":{"enum":["chest_pain","breath","injury_road","fall","abdominal_pain","fever","poisoning","sting_bite","burn","fits","weakness_one_side","bleeding_pregnancy","wound"]},
      "danger":{"type":"array","uniqueItems":true,"items":{"enum":["airway","breathing","fitting","bleeding","chest_cardiac","stroke","severe_pain","violent"]}},
      "suggested":{"type":"object","additionalProperties":false,"required":["level","signs"],"properties":{
        "level":{"type":"integer","minimum":1,"maximum":5},
        "signs":{"type":"array","items":{"enum":["rr","spo2","sbp","pulse","temp","acvpu","oxygen","airway","breathing","fitting","bleeding","chest_cardiac","stroke","severe_pain","violent"]}}}},
      "why":{"type":"string","maxLength":200}}}}}$j$::jsonb,
  'casualty.triage_line(jsonb)', array['Observation'], base_type => 'observation',
  checks => array['casualty.triage_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Triage","ar":"الفرز"}');

-- ── the action (everyday: the base's Doctors and Nurses hold it where the pack is used) and the triage nurse, on the base's Nurse,
-- who also arrives patients and registers them ──
select core.declare_action('write:casualty.triage', 'casualty', 'department', '{"en":"Triage a patient","ar":"فرز مريض"}', everyday => true);

select core.declare_role('00000000-0000-0000-0000-00000000d101', 'casualty.triage_nurse', 'casualty', 'Triage nurse', array['write:admitted', 'manage:patients'],
  '{"en":"Triage nurse","ar":"ممرض الفرز"}', built_on => '00000000-0000-0000-0000-00000000c003');

select core.declare_op('casualty.board', 'casualty', 'casualty.board(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- ── the clinic's scale: a triage keeps the scale it was made on; changing it changes only new triages ──
select core.declare_setting('casualty.scale', 'casualty', 'organization',
  '{"type":"object","additionalProperties":false,"required":["scale"],"properties":{"scale":{"enum":["ats","mts"],"default":"ats"}}}',
  labels => '{"en":"Triage scale"}', form => 'pack',
  fields => '[{"key":"scale","labels":{"en":"Triage scale"},"help":{"en":"Five levels, each with a time to the doctor. Australasian: now, 10, 30, 60 and 120 minutes. Manchester: now, 10, 60, 120 and 240 minutes. A triage keeps the scale it was made on."},
    "choices":{"ats":{"en":"Australasian"},"mts":{"en":"Manchester"}}}]');

select core.declare_screen('casualty.patients', 'casualty', 'stays', '{"en":"Patients","ar":"المرضى"}', 'read:queue');

-- ── its starter setup (§5.2): two resus bays and six cubicles on the base's board; a patient with no place is in the waiting chairs ──
select core.declare_setup('casualty.er', 'casualty', 'stays', '{"en":"Emergency","ar":"الطوارئ"}', packs => array['casualty'],
  screens => '{"screens":["base.beds","casualty.patients"],"opens":"base.beds"}',
  settings => '{"department.encounter_class":{"class":"EMER"},"department.review_results":{"level":"critical"}}',
  places => '[{"key":"resus_1","name":"Resus 1","label":"bed"},{"key":"resus_2","name":"Resus 2","label":"bed"},
    {"key":"cubicle_1","name":"Cubicle 1","label":"cubicle"},{"key":"cubicle_2","name":"Cubicle 2","label":"cubicle"},
    {"key":"cubicle_3","name":"Cubicle 3","label":"cubicle"},{"key":"cubicle_4","name":"Cubicle 4","label":"cubicle"},
    {"key":"cubicle_5","name":"Cubicle 5","label":"cubicle"},{"key":"cubicle_6","name":"Cubicle 6","label":"cubicle"}]',
  help => '{"en":"Two resus bays and six cubicles on the board; its patients with no bed are the waiting chairs. Arrived, triage with a time to the doctor, emergency stays."}');

select core.lock_pack('casualty');
