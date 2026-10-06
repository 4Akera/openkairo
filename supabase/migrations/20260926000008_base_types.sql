-- 08 · base: the 36 types (spec/openCare.md §4.1–§4.4): shapes, one-line summaries, checks, claims; the privacy rule; the actions,
-- settings keys, built-in roles and default screens. Checks return findings {code, level: refuse | warn | flag} and never raise.

set client_min_messages = warning;
set role base_role;

-- ── helpers for lines and checks ──
create function base.q(p jsonb) returns text language sql immutable as $$
  select case when p is null or p ->> 'value' is null then null
              else coalesce(p ->> 'comparator', '') || (p ->> 'value') || coalesce(' ' || nullif(coalesce(p ->> 'unit', p ->> 'ucum'), ''), '') end
$$;
create function base.words(p_key text) returns text language sql immutable as $$
  select upper(left(replace(coalesce(p_key, ''), '_', ' '), 1)) || substr(replace(coalesce(p_key, ''), '_', ' '), 2)
$$;
create function base.find(code text, level text default 'refuse', detail text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('code', code, 'level', level, 'detail', detail))
$$;
-- an entry of the set or of the record, by id
create function base.entry(p_org uuid, p_id uuid, p_set jsonb) returns core.entries language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select e from core.entries e where e.organization_id = p_org and e.id = p_id),
    (select jsonb_populate_record(null::core.entries, x) from jsonb_array_elements(p_set) x where (x ->> 'id')::uuid = p_id limit 1))
$$;
-- the target of a correction or a reference, and its base type
create function base.target(p_entry jsonb, p_set jsonb) returns core.entries language sql stable security definer set search_path = '' as $$
  select base.entry((p_entry ->> 'organization_id')::uuid, coalesce((p_entry ->> 'replaces')::uuid, (p_entry ->> 'refers_to')::uuid), p_set)
$$;
-- a correction or a change continues only its own kind
create function base.same_kind(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t core.entries;
begin
  if p_entry ->> 'replaces' is null and coalesce(p_entry ->> 'relation', '') <> 'changes' then return '[]'; end if;
  t := base.target(p_entry, p_set);
  if t.id is null or core.base_of(t.type) <> core.base_of(p_entry ->> 'type') then return jsonb_build_array(base.find('wrong_target')); end if;
  -- a correction is its authors' or a writer of that type in its department (a reader who opened it anyway is neither)
  if p_entry ->> 'replaces' is not null
     and not exists (select 1 from core.entries x where x.organization_id = t.organization_id and x.item = t.item and x.author_id = (p_entry ->> 'author_id')::uuid)
     and not core.may((p_entry ->> 'author_id')::uuid, 'write:' || t.type,
                      (select x.department_id from core.entries x where x.organization_id = t.organization_id and x.item = t.item and x.item_version = 1)) then
    return jsonb_build_array(base.find('not_allowed', 'refuse', 'a correction is its author''s or its department''s'));
  end if;
  return '[]';
end $$;

-- ── lines ──
create function base.note_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(e -> 'data' ->> 'heading', ''), base.words(coalesce(e -> 'data' ->> 'kind', 'note'))) ||
    coalesce(' · ' || nullif(left(regexp_replace(trim(e -> 'data' ->> 'text'), '\s*\n\s*', ' · ', 'g'), 160), ''), '') ||
    case when jsonb_array_length(coalesce(e -> 'data' -> 'attachments', '[]')) > 0 then ' · ' || jsonb_array_length(e -> 'data' -> 'attachments') || ' file(s)' else '' end
$$;
create function base.vitals_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ',
    case when e -> 'data' ? 'bp' then 'BP ' || (e -> 'data' -> 'bp' -> 'sys' ->> 'value') || '/' || (e -> 'data' -> 'bp' -> 'dia' ->> 'value') end,
    'HR ' || (e -> 'data' -> 'hr' ->> 'value'), 'RR ' || (e -> 'data' -> 'rr' ->> 'value'), 'T ' || (e -> 'data' -> 'temp' ->> 'value'),
    'SpO2 ' || (e -> 'data' -> 'spo2' ->> 'value') || '%', 'Wt ' || base.q(e -> 'data' -> 'weight'), 'Ht ' || base.q(e -> 'data' -> 'height'),
    'BMI ' || (e -> 'data' -> 'bmi' ->> 'value'), 'HC ' || base.q(e -> 'data' -> 'head'), 'Pain ' || (e -> 'data' -> 'pain' ->> 'value') || '/10',
    'Glucose ' || base.q(e -> 'data' -> 'glucose'))
$$;
create function base.observation_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select (e -> 'data' -> 'code' ->> 'text') || ': ' || coalesce(base.q(e -> 'data' -> 'value' -> 'quantity'), e -> 'data' -> 'value' -> 'concept' ->> 'text',
    e -> 'data' -> 'value' ->> 'text', e -> 'data' -> 'value' -> 'date' ->> 'value', e -> 'data' -> 'value' ->> 'boolean', '')
$$;
create function base.problem_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'category' = 'encounter-diagnosis' then 'Diagnosis: ' else '' end || (e -> 'data' -> 'concept' ->> 'text') ||
    case when e -> 'data' ->> 'verification' in ('provisional', 'differential', 'unconfirmed') then ' (?)' else '' end ||
    coalesce(' (' || (select c ->> 'code' from jsonb_array_elements(e -> 'data' -> 'concept' -> 'codings') c where c ->> 'system' = 'icd10' limit 1) || ')', '') ||
    case when e -> 'data' ->> 'clinical_status' not in ('active', 'recurrence', 'relapse') then ' · ' || (e -> 'data' ->> 'clinical_status') else '' end ||
    coalesce(' · since ' || (e -> 'data' -> 'onset' ->> 'value'), '')
$$;
create function base.allergy_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'type' = 'intolerance' then 'Intolerance: ' else 'Allergy: ' end || (e -> 'data' -> 'concept' ->> 'text') ||
    coalesce(' · ' || (select string_agg(r -> 'manifestation' ->> 'text', ', ') from jsonb_array_elements(e -> 'data' -> 'reactions') r), '') ||
    coalesce(' (' || (select r ->> 'severity' from jsonb_array_elements(e -> 'data' -> 'reactions') r where r ? 'severity' limit 1) || ')', '') ||
    case when e -> 'data' ->> 'clinical_status' <> 'active' then ' · ' || (e -> 'data' ->> 'clinical_status') else '' end
$$;
create function base.medication_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'stopped' then 'Stopped: ' when 'completed' then 'Completed: ' when 'on-hold' then 'On hold: ' else '' end ||
    case when e -> 'data' ->> 'basis' = 'reported' then 'Takes ' else '' end ||
    (e -> 'data' -> 'drug' ->> 'text') ||
    coalesce(' ' || base.q(e -> 'data' -> 'dosage' -> 'dose'), '') ||
    coalesce(' ' || coalesce(e -> 'data' -> 'dosage' -> 'timing' ->> 'code', e -> 'data' -> 'dosage' -> 'timing' ->> 'text'), '') ||
    case when (e -> 'data' -> 'dosage' ->> 'as_needed')::boolean then ' PRN' || coalesce(' ' || (e -> 'data' -> 'dosage' ->> 'as_needed_for'), '') else '' end ||
    coalesce(' · ' || (e -> 'data' ->> 'duration_days') || ' d', '') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'instructions', ''), '') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'status_reason', ''), '')
$$;
create function base.given_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'not-done' then 'Not given: ' else 'Given: ' end ||
    coalesce(e -> 'data' -> 'drug' ->> 'text', 'medication') || coalesce(' ' || base.q(e -> 'data' -> 'dose'), '') || coalesce(' ' || (e -> 'data' ->> 'route'), '') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;
create function base.list_review_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'outcome' = 'none_known' then 'No known ' || (e -> 'data' ->> 'list') else base.words(e -> 'data' ->> 'list') || ' reviewed' end
$$;
create function base.order_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'revoked' then 'Cancelled: ' when 'on-hold' then 'On hold: ' else '' end ||
    coalesce(e -> 'data' -> 'service' ->> 'name', 'Order') ||
    case when coalesce(e -> 'data' ->> 'priority', 'routine') <> 'routine' then ' · ' || (e -> 'data' ->> 'priority') else '' end ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'question', ''), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;
create function base.step_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select base.words(coalesce(e -> 'data' ->> 'step', e -> 'data' ->> 'status')) || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '') ||
    coalesce(' · #' || (e -> 'data' ->> 'specimen'), '')
$$;
create function base.result_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'preliminary' then 'Preliminary: ' when 'corrected' then 'Corrected: ' when 'cancelled' then 'Cancelled: ' else '' end ||
    concat_ws(' · ', coalesce(e -> 'data' -> 'service' ->> 'name', e -> 'data' -> 'code' ->> 'text'),
      (select string_agg(coalesce(a ->> 'name', a ->> 'key') || ' ' || coalesce(a -> 'value' ->> 'value', a ->> 'text', a -> 'concept' ->> 'text', '') ||
         case a ->> 'interpretation' when 'L' then ' ↓' when 'H' then ' ↑' when 'LL' then ' ↓↓' when 'HH' then ' ↑↑' when 'A' then ' !' when 'AA' then ' !!' when 'POS' then ' +' else '' end, ' · ')
       from jsonb_array_elements(coalesce(e -> 'data' -> 'analytes', '[]')) a),
      nullif(left(e -> 'data' ->> 'conclusion', 160), ''))
$$;
create function base.procedure_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select (e -> 'data' -> 'concept' ->> 'text') || case when e -> 'data' ->> 'status' <> 'completed' then ' · ' || (e -> 'data' ->> 'status') else '' end ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'outcome', ''), '')
$$;
create function base.reviewed_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Reviewed' || coalesce(' · ' || nullif(e -> 'data' ->> 'note', ''), '')
$$;
create function base.alert_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Alert: ' || (e -> 'data' -> 'concept' ->> 'text') || case when e -> 'data' ->> 'status' = 'inactive' then ' · inactive' else '' end
$$;
-- pregnant and breastfeeding: base facts (spec §5.1 rule 3), each current until a version ends it
create function base.pregnancy_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'ended' then 'Ended: ' else '' end ||
    case when (e -> 'data' ->> 'pregnant')::boolean then 'Pregnant' else 'Not pregnant' end ||
    coalesce(' · ' || (e -> 'data' ->> 'weeks') || ' wk', '') || coalesce(' · LMP ' || (e -> 'data' -> 'lmp' ->> 'value'), '') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'note', ''), '')
$$;
create function base.breastfeeding_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'ended' then 'Ended: ' else '' end ||
    case when (e -> 'data' ->> 'breastfeeding')::boolean then 'Breastfeeding' else 'Not breastfeeding' end ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'note', ''), '')
$$;
-- a recorded score (§5.1 rule 8): "GCS 14, 1974 · Mild", its short name and its band's words from the version it used
create function base.score_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(s.short, e -> 'data' ->> 'score') || ' ' || (e -> 'data' ->> 'total') || ', ' || (e -> 'data' ->> 'version') ||
    coalesce(' · ' || (select b -> 'labels' ->> 'en' from jsonb_array_elements(s.bands) b where b ->> 'key' = e -> 'data' ->> 'band'), '')
  from (select 1) one left join core.scores s on s.key = e -> 'data' ->> 'score' and s.version = e -> 'data' ->> 'version'
$$;
create function base.died_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Died' || coalesce(' · ' || (e -> 'data' -> 'cause' ->> 'text'), '')
$$;
create function base.crossed_out_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Crossed out · ' || replace(e -> 'data' ->> 'reason', '_', ' ') || coalesce(' · ' || nullif(e -> 'data' ->> 'text', ''), '')
$$;
create function base.presence_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e ->> 'type'
    when 'checked_in' then 'Checked in' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '') || case when e -> 'data' ->> 'priority' in ('urgent', 'asap', 'stat') then ' · urgent' else '' end
    when 'here' then 'Here' when 'not_here' then 'Not here' when 'called' then 'Called' when 'seen' then 'Seen'
    when 'back_to_waiting' then 'Back to waiting' || coalesce(' · ' || replace(e -> 'data' ->> 'reason', '_', ' '), '')
    when 'away' then 'Stepped out' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    when 'urgent' then case when (e -> 'data' ->> 'urgent')::boolean then 'Made urgent' else 'Made routine' end
    when 'assigned' then case when e -> 'data' ->> 'user_id' is null then 'Unassigned' else 'Assigned' end
    when 'transferred' then 'Sent on' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    when 'left' then 'Left' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    when 'done' then 'Done' || case when (e -> 'data' ->> 'wait')::boolean is false then ' · not waiting' else '' end
    when 'admitted' then 'Admitted' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    when 'moved' then 'Moved' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    when 'discharged' then 'Discharged · ' || replace(e -> 'data' ->> 'disposition', '-', ' ')
    else e ->> 'type' end
$$;
create function base.privacy_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e ->> 'type'
    when 'private' then 'Made private'
    when 'not_private' then 'Made not private · ' || (e -> 'data' ->> 'reason')
    when 'opened_anyway' then 'Opened anyway · ' || (e -> 'data' ->> 'reason') || coalesce(' · ' || nullif(e -> 'data' ->> 'text', ''), '')
    else e ->> 'type' end
$$;

-- ── checks ──
-- presence: moves change the visit's latest version; the visit must be open; called once; beds claimed
create function base.presence_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; v_type text := core.base_of(p_entry ->> 'type'); d jsonb := p_entry -> 'data';
        v_visit uuid := (p_entry ->> 'visit_id')::uuid; t core.entries; pr base.presence; v_dept core.departments; v_pat uuid[]; v_in_set boolean;
begin
  v_pat := core.family(v_org, (p_entry ->> 'patient_id')::uuid);
  if v_type in ('checked_in', 'admitted') then
    if v_visit is distinct from (p_entry ->> 'id')::uuid then return jsonb_build_array(base.find('bad_visit', 'refuse', 'an opening entry is its own visit')); end if;
    -- the visit's department: the one named (the desk checks in for others), else the entry's own
    select * into v_dept from core.departments x where x.organization_id = v_org and x.id = coalesce((d ->> 'department_id')::uuid, (p_entry ->> 'department_id')::uuid)
       and x.retired_at is null;
    if v_dept.id is null then return jsonb_build_array(base.find('not_found', 'refuse', 'department')); end if;
    if v_dept.id <> (p_entry ->> 'department_id')::uuid then
      declare cif jsonb := core.setting_at(v_org, 'department.checks_in_for', (p_entry ->> 'department_id')::uuid);
      begin
        if cif is not null and not coalesce((cif ->> 'all')::boolean, false) and not (coalesce(cif -> 'departments', '[]') @> to_jsonb(array[v_dept.id::text])) then
          return jsonb_build_array(base.find('not_served'));
        end if;
      end;
    end if;
    if v_type = 'checked_in' then
      if v_dept.work not in ('visits', 'bench') then return jsonb_build_array(base.find('wrong_work')); end if;
      if exists (select 1 from base.presence p where p.organization_id = v_org and p.patient_id = any (v_pat) and p.department_id = v_dept.id
                   and p.state not in ('done', 'left', 'discharged')) then
        return jsonb_build_array(base.find('already_here'));
      end if;
    else
      if v_dept.work <> 'stays' then return jsonb_build_array(base.find('wrong_work')); end if;
      if exists (select 1 from base.presence p where p.organization_id = v_org and p.patient_id = any (v_pat) and p.kind = 'stay' and p.state = 'admitted') then
        return jsonb_build_array(base.find('already_admitted'));
      end if;
      if d ? 'place_id' then
        if not exists (select 1 from core.places x where x.organization_id = v_org and x.id = (d ->> 'place_id')::uuid and x.department_id = v_dept.id and x.retired_at is null) then
          return jsonb_build_array(base.find('not_found', 'refuse', 'place'));
        end if;
        if exists (select 1 from base.presence p where p.organization_id = v_org and p.place_id = (d ->> 'place_id')::uuid and p.kind = 'stay' and p.state = 'admitted') then
          return jsonb_build_array(base.find('bed_taken'));
        end if;
      end if;
    end if;
    return '[]';
  end if;
  -- every other move changes the visit's latest version
  t := base.target(p_entry, p_set);
  if v_visit is null or p_entry ->> 'relation' is distinct from 'changes' or t.id is null or t.item <> v_visit then
    return jsonb_build_array(base.find('bad_visit', 'refuse', 'a move changes the visit'));
  end if;
  -- a stay takes only its own moves (§4.2): a bed, a discharge, who has it, urgency. Calling, seeing, Done, back to waiting, here,
  -- away, left and sending on are a clinic visit's; another ward with its bed is a later round
  if core.base_of((base.entry(v_org, v_visit, p_set)).type) = 'admitted' and v_type not in ('moved', 'discharged', 'assigned', 'urgent') then
    return jsonb_build_array(base.find('not_a_visit'));
  end if;
  select * into pr from base.presence p where p.organization_id = v_org and p.item = v_visit;
  v_in_set := pr.item is null;
  if v_in_set then pr.state := case when exists (select 1 from jsonb_array_elements(p_set) x where (x ->> 'id')::uuid = v_visit and x ->> 'type' = 'admitted') then 'admitted' else 'waiting' end; end if;
  if pr.state in ('done', 'left', 'discharged') and v_type not in ('crossed_out') then return jsonb_build_array(base.find('visit_closed')); end if;
  -- a clinician's moves come from where the patient is: being assigned, seeing or Done makes one responsible for reading a private
  -- department's notes (§4.3), so another department cannot claim the visit by writing them
  if v_type in ('called', 'seen', 'done', 'assigned') and not v_in_set and (p_entry ->> 'department_id')::uuid is distinct from pr.department_id then
    return jsonb_build_array(base.find('other_department'));
  end if;
  case v_type
    when 'called' then
      if pr.state in ('called', 'with') then return jsonb_build_array(base.find('already_called')); end if;
    when 'transferred' then
      select * into v_dept from core.departments x where x.organization_id = v_org and x.id = (d ->> 'to_department_id')::uuid and x.retired_at is null;
      if v_dept.id is null or v_dept.work not in ('visits', 'bench') then return jsonb_build_array(base.find('not_found', 'refuse', 'department')); end if;
      if v_dept.id = pr.department_id then return jsonb_build_array(base.find('same_department')); end if;
    when 'moved' then
      if pr.state <> 'admitted' then return jsonb_build_array(base.find('not_admitted')); end if;
      if not exists (select 1 from core.places x where x.organization_id = v_org and x.id = (d ->> 'place_id')::uuid and x.department_id = pr.department_id and x.retired_at is null) then
        return jsonb_build_array(base.find('not_found', 'refuse', 'place'));
      end if;
      if exists (select 1 from base.presence p where p.organization_id = v_org and p.place_id = (d ->> 'place_id')::uuid and p.kind = 'stay' and p.state = 'admitted' and p.item <> v_visit) then
        return jsonb_build_array(base.find('bed_taken'));
      end if;
    when 'discharged' then
      if pr.state <> 'admitted' then return jsonb_build_array(base.find('not_admitted')); end if;
    else null;
  end case;
  return '[]';
end $$;
create function base.presence_claims(p_entry jsonb) returns text[] language sql stable security definer set search_path = '' as $$
  select case when p_entry -> 'data' ? 'place_id' then array['place:' || (p_entry -> 'data' ->> 'place_id')] else '{}' end
$$;

-- orders: the service is the target department's; the target works for the ordering department; a change is the requester's
create function base.order_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; d jsonb := p_entry -> 'data'; v_to uuid := (d ->> 'department_id')::uuid; v_from uuid := (p_entry ->> 'department_id')::uuid;
        wf jsonb; t core.entries; o base.orders; f jsonb := base.same_kind(p_entry, p_set);
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  if not exists (select 1 from core.departments x where x.organization_id = v_org and x.id = v_to and x.retired_at is null) then
    return jsonb_build_array(base.find('not_found', 'refuse', 'department'));
  end if;
  if d -> 'service' ? 'id' and core.setting_at(v_org, 'service', (d -> 'service' ->> 'id')::uuid) is null then
    return jsonb_build_array(base.find('unknown_service'));
  end if;
  if d -> 'service' ? 'id' and not exists (select 1 from core.settings_at(v_org, 'service') s where s.thing_id = (d -> 'service' ->> 'id')::uuid and s.owner_id = v_to) then
    return jsonb_build_array(base.find('wrong_department', 'refuse', 'the service belongs to another department'));
  end if;
  wf := core.setting_at(v_org, 'department.works_for', v_to);
  if wf is not null and not coalesce((wf ->> 'all')::boolean, false) and not (coalesce(wf -> 'departments', '[]') @> to_jsonb(array[v_from::text])) then
    return jsonb_build_array(base.find('not_served'));
  end if;
  if p_entry ->> 'relation' = 'changes' or p_entry ->> 'replaces' is not null then
    t := base.target(p_entry, p_set);
    select * into o from base.orders x where x.organization_id = v_org and x.item = t.item;
    if o.status in ('completed', 'revoked', 'rejected', 'cancelled') then return jsonb_build_array(base.find('order_closed')); end if;
  end if;
  return '[]';
end $$;

-- a step's key is one of the steps of the order's service as the service stands (§4.4), in any order and again if need be; a step
-- with no key (a status only: in progress, held, not done) names none
create function base.step_listed(p_org uuid, p_order core.entries, p_key text) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_key is null or coalesce(core.setting_at(p_org, 'service', (p_order.data -> 'service' ->> 'id')::uuid) -> 'steps', '[]') ? p_key then '[]'::jsonb
              else jsonb_build_array(base.find('unknown_step', 'refuse', p_key)) end
$$;

-- a step, a result or a note answering an order: the right department, the right answer, an order still open, a listed step
create function base.answer_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; v_type text := core.base_of(p_entry ->> 'type'); t core.entries; o base.orders; v_answer text;
        f jsonb := base.same_kind(p_entry, p_set); v_key text := p_entry -> 'data' ->> 'step'; v_first core.entries;
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  if p_entry ->> 'relation' is distinct from 'answers' then
    if v_type = 'step' and p_entry ->> 'relation' is distinct from 'changes' then return jsonb_build_array(base.find('bad_target', 'refuse', 'a step answers an order')); end if;
    if v_type <> 'step' or v_key is null then return '[]'; end if;
    -- a later step changes an earlier one: its order is the one the step item's first entry answers
    v_first := base.target(p_entry, p_set);
    while v_first.id is not null and v_first.relation is distinct from 'answers' loop
      v_first := base.entry(v_org, coalesce(v_first.replaces, v_first.refers_to), p_set);
    end loop;
    return base.step_listed(v_org, base.entry(v_org, v_first.refers_to, p_set), v_key);
  end if;
  t := base.target(p_entry, p_set);
  if t.id is null or core.base_of(t.type) <> 'order' then return jsonb_build_array(base.find('bad_target')); end if;
  select * into o from base.orders x where x.organization_id = v_org and x.item = t.item;
  if o.to_department_id is not null and o.to_department_id <> (p_entry ->> 'department_id')::uuid then return jsonb_build_array(base.find('wrong_department')); end if;
  if o.status in ('revoked', 'rejected', 'cancelled') then return jsonb_build_array(base.find('order_closed')); end if;
  if v_type = 'step' and o.status = 'completed' then return jsonb_build_array(base.find('order_closed')); end if;
  v_answer := coalesce(t.data -> 'service' ->> 'answer',
    (select s.data ->> 'answer' from core.settings_at(v_org, 'service') s where s.thing_id = (t.data -> 'service' ->> 'id')::uuid), 'result');
  if v_type = 'result' and v_answer <> 'result' then return jsonb_build_array(base.find('wrong_answer', 'refuse', 'this service is answered by ' || v_answer)); end if;
  if v_type = 'note' and v_answer <> 'note' then return jsonb_build_array(base.find('wrong_answer', 'refuse', 'this service is answered by ' || v_answer)); end if;
  if v_type = 'step' and v_answer not in ('result', 'note') and v_answer <> p_entry ->> 'type' and (p_entry -> 'data' ->> 'status') = 'completed' then
    return jsonb_build_array(base.find('wrong_answer', 'refuse', 'this service is answered by ' || v_answer));
  end if;
  if v_type = 'step' then return base.step_listed(v_org, t, v_key); end if;
  return '[]';
end $$;

-- medicines: allergy clash and duplicate therapy (by ATC ingredient and class) are inline warnings
create function base.medication_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; d jsonb := p_entry -> 'data'; f jsonb := base.same_kind(p_entry, p_set); v_pat uuid[];
        v_atc text; v_class text; a record; v_aclass text; v_rule jsonb; out jsonb := '[]';
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  if (p_entry ->> 'item_version')::int > 1 or d ->> 'status' <> 'active' then return '[]'; end if;
  v_pat := core.family(v_org, (p_entry ->> 'patient_id')::uuid);
  select c ->> 'code' into v_atc from jsonb_array_elements(coalesce(d -> 'drug' -> 'codings', '[]')) c where c ->> 'system' = 'atc' limit 1;
  select coalesce(x.props ->> 'allergy_class', null) into v_class from core.codes x where x.system = 'atc' and x.code = v_atc;
  for a in select l.item, e.data from base.lists l join core.entries e on e.organization_id = l.organization_id and e.id = l.entry_id
            where l.organization_id = v_org and l.patient_id = any (v_pat) and l.list = 'allergies' and l.status = 'active' loop
    select coalesce(
      (select x.props ->> 'allergy_class' from jsonb_array_elements(coalesce(a.data -> 'concept' -> 'codings', '[]')) c join core.codes x on x.system = c ->> 'system' and x.code = c ->> 'code' where x.props ? 'allergy_class' limit 1),
      (select x.props ->> 'allergy_class' from core.codes x where x.system = 'local.allergen' and lower(x.labels ->> 'en') = lower(a.data -> 'concept' ->> 'text') limit 1)) into v_aclass;
    if lower(a.data -> 'concept' ->> 'text') = lower(d -> 'drug' ->> 'text') or (v_class is not null and v_aclass = v_class)
       or exists (select 1 from jsonb_array_elements(coalesce(a.data -> 'concept' -> 'codings', '[]')) c where c ->> 'system' = 'atc' and c ->> 'code' = v_atc) then
      out := out || base.find('allergy_clash', 'warn', (a.data -> 'concept' ->> 'text'));
    elsif v_class is not null and v_aclass is not null then
      for v_rule in select r from core.codes x, jsonb_array_elements(coalesce(x.props -> 'rules', '[]')) r where x.system = 'local.allergy-class' and x.code = v_aclass loop
        if v_rule -> 'also' @> to_jsonb(array[v_class]) then
          out := out || base.find(case when v_rule ->> 'level' = 'warn' then 'allergy_clash' else 'allergy_caution' end, 'warn', v_rule ->> 'note');
        end if;
      end loop;
    end if;
  end loop;
  if v_atc is not null then
    if exists (select 1 from base.lists l where l.organization_id = v_org and l.patient_id = any (v_pat) and l.list = 'medications' and l.status = 'active'
                 and l.code = 'atc:' || v_atc and l.item <> (p_entry ->> 'item')::uuid) then
      out := out || base.find('duplicate_medication', 'warn');
    elsif length(v_atc) >= 5 and exists (select 1 from base.lists l where l.organization_id = v_org and l.patient_id = any (v_pat) and l.list = 'medications' and l.status = 'active'
                 and l.code like 'atc:' || left(v_atc, 5) || '%' and l.item <> (p_entry ->> 'item')::uuid) then
      out := out || base.find('duplicate_class', 'warn');
    end if;
  elsif exists (select 1 from base.lists l join core.entries e on e.organization_id = l.organization_id and e.id = l.entry_id
                 where l.organization_id = v_org and l.patient_id = any (v_pat) and l.list = 'medications' and l.status = 'active'
                   and lower(e.data -> 'drug' ->> 'text') = lower(d -> 'drug' ->> 'text')) then
    out := out || base.find('duplicate_medication', 'warn');
  end if;
  return out;
end $$;

-- problems and allergies: a new item already on the list is an inline warning
create function base.listed_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; d jsonb := p_entry -> 'data'; f jsonb := base.same_kind(p_entry, p_set); v_list text; v_code text;
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  if (p_entry ->> 'item_version')::int > 1 or coalesce(d ->> 'category', '') = 'encounter-diagnosis' then return '[]'; end if;
  v_list := case core.base_of(p_entry ->> 'type') when 'problem' then 'problems' else 'allergies' end;
  select (c ->> 'system') || ':' || (c ->> 'code') into v_code from jsonb_array_elements(coalesce(d -> 'concept' -> 'codings', '[]')) c limit 1;
  if exists (select 1 from base.lists l join core.entries e on e.organization_id = l.organization_id and e.id = l.entry_id
              where l.organization_id = v_org and l.patient_id = any (core.family(v_org, (p_entry ->> 'patient_id')::uuid)) and l.list = v_list
                and l.status = 'active' and (l.code = v_code or lower(e.data -> 'concept' ->> 'text') = lower(d -> 'concept' ->> 'text'))) then
    return jsonb_build_array(base.find('already_on_list', 'warn'));
  end if;
  return '[]';
end $$;

-- a plain correction check for the types with nothing else to check
create function base.kind_check(p_entry jsonb, p_set jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select base.same_kind(p_entry, p_set)
$$;

-- names HIV (§5.1 rule 3: an alert shows in every department): the word (HIV1, _hiv too), AIDS, spelled out, in Arabic, and the ICD-10
-- codes (B20–B24, Z21, R75, Z20.6, Z71.7, O98.7); the client's namesHiv (chart/model/facts.ts) holds the same pattern
create function base.names_hiv(s text) returns boolean language sql immutable as $$
  select coalesce(s, '') ~* '(^|[^a-z])(hiv|aids)([^a-z]|$)|human[^a-z]*immuno[^a-z]*deficiency|(^|[^a-z0-9])(b2[0-4]|z21|r75|z20\.6|z71\.7|o98\.7)([^0-9]|$)|إيدز|ايدز|نقص المناعة'
$$;

-- the standing facts (alert, pregnancy, breastfeeding): ending one changes it, once; an alert never names HIV, in any version (§5.1
-- rule 3: the banner shows alerts in every department); one current pregnancy and one breastfeeding at a time (a new line changes the
-- standing one); pregnancy dates only when pregnant, an LMP or weeks, a real day never after the day it is written
create function base.fact_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; d jsonb := p_entry -> 'data'; v_type text := core.base_of(p_entry ->> 'type');
        f jsonb := base.same_kind(p_entry, p_set); t core.entries; v_lmp text; v_on date; out jsonb := '[]';
        v_new boolean := p_entry ->> 'replaces' is null and p_entry ->> 'relation' is distinct from 'changes';
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  if v_type = 'alert' and (base.names_hiv(d -> 'concept' ->> 'text') or base.names_hiv(d ->> 'note')
       or exists (select 1 from jsonb_array_elements(coalesce(d -> 'concept' -> 'codings', '[]')) c where base.names_hiv(c ->> 'code') or base.names_hiv(c ->> 'display'))) then
    return jsonb_build_array(base.find('names_hiv', 'refuse', 'an alert shows in every department: write Isolation, never the reason'));
  end if;
  if d ->> 'status' in ('ended', 'inactive') and v_new then
    return jsonb_build_array(base.find('nothing_to_end', 'refuse', 'ending changes the fact it ends'));
  end if;
  if p_entry ->> 'relation' = 'changes' then
    t := base.target(p_entry, p_set);
    if t.data ->> 'status' in ('ended', 'inactive') then return jsonb_build_array(base.find('already_ended')); end if;
  end if;
  if v_type in ('pregnancy', 'breastfeeding') and v_new and exists (select 1 from core.entries x
       where x.organization_id = v_org and x.patient_id = any (core.family(v_org, (p_entry ->> 'patient_id')::uuid)) and core.base_of(x.type) = v_type
         and x.data ->> 'status' = 'current'
         and not exists (select 1 from core.entries y where y.organization_id = v_org and y.item = x.item and y.item_version > x.item_version)) then
    return jsonb_build_array(base.find('already_recorded', 'refuse', 'change the one recorded'));
  end if;
  if v_type = 'pregnancy' then
    if not (d ->> 'pregnant')::boolean and (d ? 'lmp' or d ? 'weeks') then return jsonb_build_array(base.find('dates_not_pregnant')); end if;
    if d ? 'lmp' and d ? 'weeks' then return jsonb_build_array(base.find('lmp_or_weeks')); end if;
    if d ? 'lmp' then
      v_lmp := d -> 'lmp' ->> 'value' || substr('-01-01', length(d -> 'lmp' ->> 'value') - 3);
      if not pg_input_is_valid(v_lmp, 'date') then return jsonb_build_array(base.find('bad_lmp', 'refuse', 'the LMP is not a day')); end if;
      v_on := ((p_entry ->> 'occurred_at')::timestamptz at time zone coalesce(core.setting_at(v_org, 'organization.time_zone', v_org) ->> 'zone', 'Africa/Cairo'))::date;
      if v_lmp::date > v_on then return jsonb_build_array(base.find('lmp_future')); end if;
      -- only while current: an end written after the delivery is long after the LMP, and right
      if d ->> 'status' = 'current' and v_lmp::date < v_on - 44 * 7 then out := out || base.find('lmp_long_ago', 'warn'); end if;
    end if;
    if (d ->> 'pregnant')::boolean and d ->> 'status' = 'current'
       and (select p.gender from core.patients p where p.organization_id = v_org and p.id = core.survivor(v_org, (p_entry ->> 'patient_id')::uuid)) = 'male' then
      out := out || base.find('sex_male', 'warn');
    end if;
  end if;
  return out;
end $$;

-- a recorded score is the server's sum (§5.1 rule 8): worked out again with the version the entry names, which must be declared and in
-- use; a total or band that differs is refused (score_mismatch). An entry keeps its version: nothing recomputes an old one
create function base.score_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := p_entry -> 'data'; f jsonb := base.same_kind(p_entry, p_set); r jsonb; s core.scores;
begin
  if jsonb_array_length(f) > 0 then return f; end if;
  select * into s from core.scores x where x.key = d ->> 'score' and x.version = d ->> 'version';
  if not found then return jsonb_build_array(base.find('unknown_score', 'refuse', concat_ws(' ', d ->> 'score', d ->> 'version'))); end if;
  if s.retired_at is not null then return jsonb_build_array(base.find('score_retired', 'refuse', s.key || ' ' || s.version)); end if;
  -- a pack's score is written where the department uses the pack (§5.1 rule 1); a correction follows its entry
  if p_entry ->> 'replaces' is null and p_entry ->> 'relation' is distinct from 'changes'
     and not core.department_uses((p_entry ->> 'organization_id')::uuid, (p_entry ->> 'department_id')::uuid, s.layer) then
    return jsonb_build_array(base.find('pack_not_used', 'refuse', s.layer));
  end if;
  r := core.score(s.key, s.version, d -> 'inputs');
  if jsonb_array_length(r -> 'problems') > 0 then
    return jsonb_build_array(base.find('bad_input', 'refuse', (select string_agg((x ->> 'item') || ': ' || (x ->> 'code'), ', ') from jsonb_array_elements(r -> 'problems') x)));
  end if;
  if not (r ->> 'complete')::boolean then
    return jsonb_build_array(base.find('score_incomplete', 'refuse', (select string_agg(x, ', ') from jsonb_array_elements_text(r -> 'missing') x)));
  end if;
  if (r ->> 'total')::int is distinct from (d ->> 'total')::int or r -> 'band' ->> 'key' is distinct from d ->> 'band' then
    return jsonb_build_array(base.find('score_mismatch', 'refuse', format('the server adds it up to %s (%s)', r ->> 'total', r -> 'band' ->> 'key')));
  end if;
  return '[]';
end $$;

-- crossing out: of the author's own entry or one the writer may write there; never an order someone already answered
create function base.crossed_out_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; t core.entries; v_by uuid := (p_entry ->> 'author_id')::uuid;
begin
  if p_entry ->> 'replaces' is null then return jsonb_build_array(base.find('bad_target', 'refuse', 'a cross-out replaces what it crosses out')); end if;
  t := base.target(p_entry, p_set);
  if t.type = 'crossed_out' then return jsonb_build_array(base.find('already_crossed_out')); end if;
  if core.base_of(t.type) = 'order' and exists (select 1 from base.orders o where o.organization_id = v_org and o.item = t.item and (cardinality(o.answers) > 0 or o.step is not null)) then
    return jsonb_build_array(base.find('has_answers'));
  end if;
  if not exists (select 1 from core.entries x where x.organization_id = v_org and x.item = t.item and x.author_id = v_by)
     and not core.may(v_by, 'write:' || t.type, t.department_id) then
    return jsonb_build_array(base.find('not_allowed'));
  end if;
  return '[]';
end $$;

-- the story may be private, never the fact; its authors or its department decide; not private needs a reason
create function base.privacy_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; t core.entries; v_by uuid := (p_entry ->> 'author_id')::uuid; f core.entries; tt core.types;
begin
  if p_entry ->> 'type' = 'opened_anyway' then
    if p_entry ->> 'refers_to' is not null or p_entry ->> 'replaces' is not null then return jsonb_build_array(base.find('bad_target')); end if;
    if (select u.kind from core.users u where u.id = v_by) <> 'staff' then return jsonb_build_array(base.find('not_allowed')); end if;
    if not exists (select 1 from core.departments x where x.organization_id = v_org and x.id = (p_entry -> 'data' ->> 'department_id')::uuid) then
      return jsonb_build_array(base.find('not_found', 'refuse', 'department'));
    end if;
    if p_entry -> 'data' ->> 'reason' = 'other' and length(trim(coalesce(p_entry -> 'data' ->> 'text', ''))) < 3 then return jsonb_build_array(base.find('reason_missing')); end if;
    return jsonb_build_array(base.find('opened_anyway', 'flag'));
  end if;
  if p_entry ->> 'relation' is distinct from 'about' then return jsonb_build_array(base.find('bad_target', 'refuse', 'privacy is about an entry')); end if;
  t := base.target(p_entry, p_set);
  select x.* into f from core.entries x where x.organization_id = v_org and x.item = t.item and x.item_version = 1;
  if f.id is null then f := t; end if;
  select x.* into tt from core.types x where x.key = f.type and x.version = f.type_version;
  if not tt.may_be_private then return jsonb_build_array(base.find('never_private')); end if;
  if not exists (select 1 from core.entries x where x.organization_id = v_org and x.item = f.item and x.author_id = v_by and x.type <> 'crossed_out')
     and not (v_by in (select core.holders_in(v_org, 'read:record', f.department_id))) then
    return jsonb_build_array(base.find('not_allowed'));
  end if;
  if p_entry ->> 'type' = 'not_private' and length(trim(coalesce(p_entry -> 'data' ->> 'reason', ''))) = 0 then return jsonb_build_array(base.find('reason_missing')); end if;
  if p_entry ->> 'type' = 'not_private' then return jsonb_build_array(base.find('made_not_private', 'flag')); end if;
  return '[]';
end $$;

-- reviewed: about an answer or a flagged entry
create function base.reviewed_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t core.entries;
begin
  if p_entry ->> 'relation' is distinct from 'about' then return jsonb_build_array(base.find('bad_target')); end if;
  t := base.target(p_entry, p_set);
  if t.id is null then return jsonb_build_array(base.find('bad_target')); end if;
  return '[]';
end $$;

-- ── the privacy rule (§4.3): hide the story, never the fact ──
create function base.private_hidden(p_reader uuid, p_ids uuid[]) returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare me core.users; out uuid[] := '{}'; e record; v_private boolean; v_last text; f core.entries; v_dept uuid;
begin
  select * into me from core.users u where u.id = p_reader;   -- no reader: what is private to someone with no rights (FHIR meta.security)
  for e in select x.* from core.entries x where x.id = any (p_ids) and (me.id is null or x.organization_id = me.organization_id) loop
    select y.* into f from core.entries y where y.organization_id = e.organization_id and y.item = e.item and y.item_version = 1;
    v_dept := f.department_id;
    -- the latest private or not_private about any version of the item; else the department's setting when the item began
    select p.type into v_last from core.entries p join core.entries t on t.organization_id = p.organization_id and t.id = p.refers_to
     where p.organization_id = e.organization_id and p.relation = 'about' and p.type in ('private', 'not_private') and t.item = e.item
     order by p.recorded_at desc, p.id desc limit 1;
    v_private := case when v_last is not null then v_last = 'private'
                      else coalesce((core.setting_at(e.organization_id, 'department.private', v_dept, f.recorded_at) ->> 'private')::boolean, false) end;
    continue when not v_private;
    -- who reads it
    continue when me.kind = 'staff' and me.retired_at is null and (
         p_reader in (select core.holders_in(e.organization_id, 'read:record', v_dept))
      or exists (select 1 from core.entries a where a.organization_id = e.organization_id and a.item = e.item and a.author_id = p_reader and a.type <> 'crossed_out')
      -- the visit's responsible clinician (§4.3): assigned to them, or seen or Done by them; calling is not seeing, and a move that only
      -- landed late and flagged (a refused move sent late) makes nobody responsible
      or (f.visit_id is not null and exists (select 1 from core.entries v where v.organization_id = e.organization_id and v.item = f.visit_id
            and not v.findings @> '[{"late": true}]'
            and ((v.type = 'assigned' and (v.data ->> 'user_id')::uuid = p_reader) or (v.type in ('seen', 'done') and v.author_id = p_reader))))
      or (f.relation = 'answers' and exists (select 1 from core.entries o where o.organization_id = e.organization_id and o.id = f.refers_to
            and (o.author_id = p_reader or p_reader in (select core.holders_in(e.organization_id, 'read:record', o.department_id)))))
      or exists (select 1 from core.entries a where a.organization_id = e.organization_id and a.type = 'opened_anyway' and a.author_id = p_reader
            and a.patient_id = any (core.family(e.organization_id, e.patient_id)) and (a.data ->> 'department_id')::uuid = v_dept
            and a.recorded_at > clock_timestamp() - interval '12 hours'));
    out := out || e.id;
  end loop;
  return out;
end $$;

-- ── settings checks ──
create function base.service_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_where ->> 'organization_id')::uuid; v_answer text := coalesce(p_data ->> 'answer', 'result'); v_layer text;
begin
  if v_answer not in ('result', 'note') then
    select t.layer into v_layer from core.types t where t.key = v_answer limit 1;
    if v_layer is null then return jsonb_build_array(base.find('bad_answer', 'refuse', v_answer)); end if;
    if not core.layer_on(v_org, v_layer) then return jsonb_build_array(base.find('pack_off', 'refuse', v_layer)); end if;
  end if;
  if exists (select 1 from core.settings_at(v_org, 'service') s where s.owner_id = (p_where ->> 'owner_id')::uuid and s.thing_id <> (p_where ->> 'thing_id')::uuid
               and lower(s.data ->> 'code') = lower(p_data ->> 'code')) then
    return jsonb_build_array(base.find('duplicate', 'refuse', 'code'));
  end if;
  -- its steps, in order: each key once, and none a word the bench uses for an order's state (sent, started, held, replied, reopened)
  if (select count(*) <> count(distinct x) from jsonb_array_elements_text(coalesce(p_data -> 'steps', '[]')) x) then
    return jsonb_build_array(base.find('duplicate', 'refuse', 'step'));
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p_data -> 'steps', '[]')) x where x in ('sent', 'started', 'held', 'replied', 'reopened')) then
    return jsonb_build_array(base.find('reserved_step', 'refuse',
      (select x from jsonb_array_elements_text(p_data -> 'steps') x where x in ('sent', 'started', 'held', 'replied', 'reopened') limit 1)));
  end if;
  return '[]';
end $$;

-- the packs a department uses (§5.1 rule 1): each a known pack, on for the clinic, once
create function base.department_packs_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_where ->> 'organization_id')::uuid; k text;
begin
  for k in select x from jsonb_array_elements_text(coalesce(p_data -> 'packs', '[]')) x loop
    if not exists (select 1 from core.layers l where l.key = k and l.is_pack) then return jsonb_build_array(base.find('unknown_pack', 'refuse', k)); end if;
    if not (k = any (core.packs_used(v_org))) then return jsonb_build_array(base.find('pack_off', 'refuse', k)); end if;
  end loop;
  if (select count(*) <> count(distinct x) from jsonb_array_elements_text(coalesce(p_data -> 'packs', '[]')) x) then
    return jsonb_build_array(base.find('duplicate', 'refuse', 'pack'));
  end if;
  return '[]';
end $$;

-- the Screens line (§4.6, §5.1 rules 1, 4 and 6): each screen declared, the base's or a pack this department uses, of the
-- department's work, once; never beside a base screen it stands in for; a department of places keeps the bed board; and it opens on
-- one of them
create function base.department_screens_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_where ->> 'organization_id')::uuid; v_dept uuid := (p_where ->> 'owner_id')::uuid; v_work text; k text; s core.screens;
        v_line text[] := array(select x from jsonb_array_elements_text(coalesce(p_data -> 'screens', '[]')) x);
begin
  select d.work into v_work from core.departments d where d.organization_id = v_org and d.id = v_dept;
  foreach k in array v_line loop
    select * into s from core.screens x where x.key = k;
    if not found then return jsonb_build_array(base.find('unknown_screen', 'refuse', k)); end if;
    if s.layer not in ('core', 'base') and not core.layer_on(v_org, s.layer) then return jsonb_build_array(base.find('pack_off', 'refuse', s.layer)); end if;
    if not core.department_uses(v_org, v_dept, s.layer) then return jsonb_build_array(base.find('pack_not_used', 'refuse', s.layer)); end if;
    if s.work not in (v_work, 'any') then return jsonb_build_array(base.find('wrong_work', 'refuse', k)); end if;
    if s.replaces && v_line then
      return jsonb_build_array(base.find('replaced', 'refuse', format('%s stands in for %s', k, (select string_agg(r, ', ') from unnest(s.replaces) r where r = any (v_line)))));
    end if;
  end loop;
  if cardinality(v_line) <> (select count(distinct x) from unnest(v_line) x) then return jsonb_build_array(base.find('duplicate', 'refuse', 'screen')); end if;
  -- a department of places always has its one board (§5.1 rule 4)
  if v_work = 'stays' and not ('base.beds' = any (v_line)) then return jsonb_build_array(base.find('no_board', 'refuse', 'base.beds')); end if;
  if p_data ? 'opens' and not ((p_data ->> 'opens') = any (v_line)) then return jsonb_build_array(base.find('opens_off_line', 'refuse', p_data ->> 'opens')); end if;
  return '[]';
end $$;

reset role;

-- ── the declarations ──
do $$
declare
  qty text := '{"$ref":"#/$defs/quantity"}';
  concept text := '{"$ref":"#/$defs/concept"}';
  pdate text := '{"$ref":"#/$defs/partial_date"}';
  uuidt text := '{"type":"string","format":"uuid"}';
  service text := '{"type":"object","additionalProperties":false,"required":["name"],"properties":{"id":{"type":"string","format":"uuid"},"code":{"type":"string"},"name":{"type":"string"},"coding":{"$ref":"#/$defs/coding"},"answer":{"type":"string"}}}';
  empty text := '{"type":"object","additionalProperties":false,"properties":{"note":{"type":"string"}}}';
  t record;
begin
  perform core.declare_type('note', 1, 'base', format('{"type":"object","additionalProperties":false,
      "properties":{"kind":{"type":"string"},"heading":{"type":"string"},"text":{"type":"string"},"language":{"type":"string"},
                    "attachments":{"type":"array","items":{"$ref":"#/$defs/attachment"}}},
      "anyOf":[{"required":["text"]},{"required":["attachments"]}]}')::jsonb,
    'base.note_line(jsonb)', array['DocumentReference'], checks => array['base.answer_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.orders', 'base.presence', 'base.review'], may_be_private => true, labels => '{"en":"Note","ar":"ملاحظة"}');
  perform core.declare_type('vitals', 1, 'base', format('{"type":"object","additionalProperties":false,"minProperties":1,
      "properties":{"bp":{"type":"object","additionalProperties":false,"required":["sys","dia"],"properties":{"sys":%1$s,"dia":%1$s}},
        "hr":%1$s,"rr":%1$s,"temp":%1$s,"spo2":%1$s,"weight":%1$s,"height":%1$s,"bmi":%1$s,"head":%1$s,"pain":%1$s,"glucose":%1$s,
        "method":{"type":"string"},"site":{"type":"string"},"note":{"type":"string"}}}', qty)::jsonb,
    'base.vitals_line(jsonb)', array['Observation'], checks => array['base.kind_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence', 'base.values'], labels => '{"en":"Vitals","ar":"العلامات الحيوية"}');
  perform core.declare_type('observation', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["code","value"],
      "properties":{"code":%1$s,"value":{"type":"object","additionalProperties":false,"minProperties":1,"maxProperties":1,
        "properties":{"quantity":%2$s,"concept":%1$s,"text":{"type":"string"},"date":%3$s,"boolean":{"type":"boolean"}}},
        "interpretation":{"type":"string"},"method":{"type":"string"},"note":{"type":"string"}}}', concept, qty, pdate)::jsonb,
    'base.observation_line(jsonb)', array['Observation'], checks => array['base.kind_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence', 'base.values'], labels => '{"en":"Observation"}');
  perform core.declare_type('problem', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["concept","clinical_status","verification"],
      "properties":{"concept":%1$s,"category":{"enum":["problem-list-item","encounter-diagnosis"]},
        "clinical_status":{"enum":["active","recurrence","relapse","inactive","remission","resolved"]},
        "verification":{"enum":["unconfirmed","provisional","differential","confirmed","refuted"]},
        "severity":{"enum":["mild","moderate","severe"]},"body_site":%1$s,"laterality":{"enum":["left","right","both"]},
        "onset":%2$s,"abatement":%2$s,"note":{"type":"string"}}}', concept, pdate)::jsonb,
    'base.problem_line(jsonb)', array['Condition'], checks => array['base.listed_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence', 'base.lists'], labels => '{"en":"Problem","ar":"مشكلة"}');
  perform core.declare_type('allergy', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["concept","clinical_status","verification"],
      "properties":{"concept":%1$s,"type":{"enum":["allergy","intolerance"]},
        "category":{"type":"array","items":{"enum":["food","medication","environment","biologic"]}},
        "criticality":{"enum":["low","high","unable-to-assess"]},"clinical_status":{"enum":["active","inactive","resolved"]},
        "verification":{"enum":["unconfirmed","confirmed","refuted"]},
        "reactions":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["manifestation"],
          "properties":{"manifestation":%1$s,"severity":{"enum":["mild","moderate","severe"]}}}},
        "onset":%2$s,"note":{"type":"string"}}}', concept, pdate)::jsonb,
    'base.allergy_line(jsonb)', array['AllergyIntolerance'], checks => array['base.listed_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence', 'base.lists'], labels => '{"en":"Allergy","ar":"حساسية"}');
  perform core.declare_type('medication', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["basis","drug","status"],
      "properties":{"basis":{"enum":["prescribed","reported"]},"drug":%1$s,"strength":{"type":"string"},"form":{"type":"string"},
        "dosage":{"type":"object","additionalProperties":false,"properties":{"text":{"type":"string"},"dose":%2$s,"timing":{"$ref":"#/$defs/timing"},
          "as_needed":{"type":"boolean"},"as_needed_for":{"type":"string"},"route":{"type":"string"},"max":{"type":"string"}}},
        "duration_days":{"type":"integer","minimum":1},"quantity":%2$s,"repeats":{"type":"integer","minimum":0},"substitution":{"type":"boolean"},
        "instructions":{"type":"string"},"reasons":{"type":"array","items":{"$ref":"#/$defs/reference"}},
        "status":{"enum":["active","on-hold","stopped","completed"]},"status_reason":{"type":"string"},"started":%3$s}}', concept, qty, pdate)::jsonb,
    'base.medication_line(jsonb)', array['MedicationRequest', 'MedicationStatement'], checks => array['base.medication_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence', 'base.lists'], labels => '{"en":"Medication","ar":"دواء"}');
  perform core.declare_type('given', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["status"],
      "properties":{"medication":%1$s,"drug":%2$s,"dose":%3$s,"route":{"type":"string"},"site":{"type":"string"},"lot":{"type":"string"},
        "expiry":{"type":"string"},"status":{"enum":["completed","not-done"]},"reason":{"type":"string"},"note":{"type":"string"}},
      "anyOf":[{"required":["medication"]},{"required":["drug"]}]}', uuidt, concept, qty)::jsonb,
    'base.given_line(jsonb)', array['MedicationAdministration'], checks => array['base.kind_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence'], labels => '{"en":"Given"}');
  perform core.declare_type('list_review', 1, 'base', '{"type":"object","additionalProperties":false,"required":["list","outcome"],
      "properties":{"list":{"enum":["problems","medications","allergies"]},"outcome":{"enum":["reviewed","none_known"]},"note":{"type":"string"}}}'::jsonb,
    'base.list_review_line(jsonb)', array['List'], checks => array['base.kind_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.lists'], labels => '{"en":"List review"}');
  perform core.declare_type('order', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["service","department_id","priority","status"],
      "properties":{"service":%1$s,"department_id":%2$s,"priority":{"enum":["routine","urgent","asap","stat"]},
        "status":{"enum":["active","on-hold","revoked","completed"]},"question":{"type":"string"},"reason":{"type":"string"},
        "reasons":{"type":"array","items":{"$ref":"#/$defs/reference"}},"answers":{"type":"object"},"due":{"$ref":"#/$defs/datetime"},"details":{"type":"object"}}}',
      service, uuidt)::jsonb,
    'base.order_line(jsonb)', array['ServiceRequest'], checks => array['base.order_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.orders', 'base.presence', 'base.review'], labels => '{"en":"Order","ar":"طلب"}');
  perform core.declare_type('step', 1, 'base', '{"type":"object","additionalProperties":false,"required":["status"],
      "properties":{"status":{"enum":["received","accepted","rejected","in-progress","on-hold","completed","cancelled","failed"]},
        "step":{"type":"string"},"reason":{"type":"string"},"specimen":{"type":"string"},"note":{"type":"string"}}}'::jsonb,
    'base.step_line(jsonb)', array['Task'], checks => array['base.answer_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.orders', 'base.presence', 'base.review'], labels => '{"en":"Step"}');
  perform core.declare_type('result', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["status"],
      "properties":{"code":%1$s,"service":%2$s,"status":{"enum":["registered","preliminary","final","amended","corrected","cancelled"]},
        "analytes":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["key"],
          "properties":{"key":{"type":"string"},"code":{"$ref":"#/$defs/coding"},"name":{"type":"string"},"value":%3$s,"text":{"type":"string"},
            "concept":%1$s,"interpretation":{"enum":["N","L","H","LL","HH","A","AA","POS","NEG"]},"range":{"$ref":"#/$defs/range"},
            "critical":{"$ref":"#/$defs/range"},"method":{"type":"string"},"device":{"type":"string"}}}},
        "conclusion":{"type":"string"},"attachments":{"type":"array","items":{"$ref":"#/$defs/attachment"}},"specimen":{"type":"string"},"performer":{"type":"string"}},
      "anyOf":[{"required":["analytes"]},{"required":["conclusion"]},{"required":["attachments"]}]}', concept, service, qty)::jsonb,
    'base.result_line(jsonb)', array['DiagnosticReport', 'Observation'], checks => array['base.answer_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.orders', 'base.presence', 'base.review', 'base.values'], may_be_private => true, labels => '{"en":"Result","ar":"نتيجة"}');
  perform core.declare_type('procedure', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["concept","status"],
      "properties":{"concept":%1$s,"status":{"enum":["preparation","in-progress","not-done","on-hold","stopped","completed"]},"performed":%2$s,
        "body_site":%1$s,"outcome":{"type":"string"},"reason":{"type":"string"},"note":{"type":"string"}}}', concept, pdate)::jsonb,
    'base.procedure_line(jsonb)', array['Procedure'], checks => array['base.kind_check(jsonb,jsonb)']::regprocedure[], feeds => array['base.presence'], labels => '{"en":"Procedure"}');
  perform core.declare_type('reviewed', 1, 'base', '{"type":"object","additionalProperties":false,"properties":{"note":{"type":"string"},"action":{"type":"string"}}}'::jsonb,
    'base.reviewed_line(jsonb)', array['Task'], checks => array['base.reviewed_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.review'], in_record => false, labels => '{"en":"Reviewed"}');
  perform core.declare_type('alert', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["concept","status"],
      "properties":{"concept":%1$s,"status":{"enum":["active","inactive"]},"period":{"$ref":"#/$defs/period"},"note":{"type":"string"}}}', concept)::jsonb,
    'base.alert_line(jsonb)', array['Flag'], checks => array['base.fact_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Alert"}');
  perform core.declare_type('pregnancy', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["status","pregnant"],
      "properties":{"status":{"enum":["current","ended"]},"pregnant":{"type":"boolean"},"lmp":%1$s,"weeks":{"type":"integer","minimum":0,"maximum":45},
        "reason":{"type":"string"},"note":{"type":"string"}}}', pdate)::jsonb,
    'base.pregnancy_line(jsonb)', array['Observation'], checks => array['base.fact_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Pregnancy","ar":"الحمل"}');
  perform core.declare_type('breastfeeding', 1, 'base', '{"type":"object","additionalProperties":false,"required":["status","breastfeeding"],
      "properties":{"status":{"enum":["current","ended"]},"breastfeeding":{"type":"boolean"},"note":{"type":"string"}}}'::jsonb,
    'base.breastfeeding_line(jsonb)', array['Observation'], checks => array['base.fact_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Breastfeeding","ar":"الرضاعة الطبيعية"}');
  perform core.declare_type('score', 1, 'base', '{"type":"object","additionalProperties":false,"required":["score","version","inputs","total","band"],
      "properties":{"score":{"type":"string","minLength":1},"version":{"type":"string","minLength":1},
        "inputs":{"type":"object","additionalProperties":{"type":["string","number","boolean"]}},"total":{"type":"integer"},"band":{"type":"string"},"note":{"type":"string"}}}'::jsonb,
    'base.score_line(jsonb)', array['Observation'], checks => array['base.score_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Score","ar":"مقياس"}');
  perform core.declare_type('died', 1, 'base', format('{"type":"object","additionalProperties":false,"properties":{"cause":%1$s,"note":{"type":"string"}}}', concept)::jsonb,
    'base.died_line(jsonb)', array['Patient'], checks => array['base.kind_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.deceased'], labels => '{"en":"Died"}');
  perform core.declare_type('crossed_out', 1, 'base', '{"type":"object","additionalProperties":false,"required":["reason"],
      "properties":{"reason":{"enum":["typo","wrong_value","wrong_patient","late_information","other"]},"text":{"type":"string"}}}'::jsonb,
    'base.crossed_out_line(jsonb)', '{}', checks => array['base.crossed_out_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.orders', 'base.presence', 'base.review', 'base.lists', 'base.values', 'base.deceased'], labels => '{"en":"Crossed out"}');

  -- presence: each move changes the visit; the opening entries start it
  perform core.declare_type('checked_in', 1, 'base', format('{"type":"object","additionalProperties":false,
      "properties":{"department_id":%1$s,"reason":{"type":"string"},"arrival":{"type":"string"},"priority":{"enum":["routine","urgent","asap","stat"]},
        "here":{"type":"boolean"},"for_order":%1$s,"place_id":%1$s}}', uuidt)::jsonb,
    'base.presence_line(jsonb)', array['Encounter'], checks => array['base.presence_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence'], in_record => false, labels => '{"en":"Checked in"}');
  perform core.declare_type('admitted', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["admit_source"],
      "properties":{"department_id":%1$s,"place_id":%1$s,"admit_source":{"enum":["emd","outp","hosp-trans","born","gp","other"]},"reason":{"type":"string"}}}', uuidt)::jsonb,
    'base.presence_line(jsonb)', array['Encounter'], checks => array['base.presence_check(jsonb,jsonb)']::regprocedure[],
    feeds => array['base.presence'], claims => 'base.presence_claims(jsonb)', in_record => false, labels => '{"en":"Admitted"}');
  for t in select * from (values
      ('here', empty, 'Here'), ('not_here', empty, 'Not here'), ('called', empty, 'Called'), ('seen', empty, 'Seen'),
      ('back_to_waiting', '{"type":"object","additionalProperties":false,"properties":{"reason":{"enum":["not_here","sent_out","other"]},"text":{"type":"string"}}}', 'Back to waiting'),
      ('away', '{"type":"object","additionalProperties":false,"properties":{"reason":{"type":"string"}}}', 'Stepped out'),
      ('urgent', '{"type":"object","additionalProperties":false,"required":["urgent"],"properties":{"urgent":{"type":"boolean"}}}', 'Urgent'),
      ('assigned', '{"type":"object","additionalProperties":false,"properties":{"user_id":{"type":["string","null"],"format":"uuid"}}}', 'Assigned'),
      ('transferred', '{"type":"object","additionalProperties":false,"required":["to_department_id"],"properties":{"to_department_id":{"type":"string","format":"uuid"},"reason":{"type":"string"}}}', 'Sent on'),
      ('left', '{"type":"object","additionalProperties":false,"properties":{"reason":{"type":"string"}}}', 'Left'),
      ('done', '{"type":"object","additionalProperties":false,"properties":{"wait":{"type":"boolean"}}}', 'Done'),
      ('moved', '{"type":"object","additionalProperties":false,"required":["place_id"],"properties":{"place_id":{"type":"string","format":"uuid"},"reason":{"type":"string"}}}', 'Moved'),
      ('discharged', '{"type":"object","additionalProperties":false,"required":["disposition"],"properties":{"disposition":{"enum":["home","other-hcf","hosp","aadvice","exp","oth"]},"note":{"type":"string"}}}', 'Discharged')
    ) v(k, s, l) loop
    perform core.declare_type(t.k, 1, 'base', t.s::jsonb, 'base.presence_line(jsonb)', array['Encounter'],
      checks => array['base.presence_check(jsonb,jsonb)']::regprocedure[], feeds => array['base.presence', 'base.review'],
      claims => case when t.k = 'moved' then 'base.presence_claims(jsonb)'::regprocedure end, in_record => false, labels => jsonb_build_object('en', t.l));
  end loop;

  -- privacy
  perform core.declare_type('private', 1, 'base', empty::jsonb, 'base.privacy_line(jsonb)', '{}', checks => array['base.privacy_check(jsonb,jsonb)']::regprocedure[],
    in_record => false, labels => '{"en":"Private"}');
  perform core.declare_type('not_private', 1, 'base', '{"type":"object","additionalProperties":false,"required":["reason"],"properties":{"reason":{"type":"string"}}}'::jsonb,
    'base.privacy_line(jsonb)', '{}', checks => array['base.privacy_check(jsonb,jsonb)']::regprocedure[], feeds => array['base.review'], in_record => false, labels => '{"en":"Not private"}');
  perform core.declare_type('opened_anyway', 1, 'base', format('{"type":"object","additionalProperties":false,"required":["department_id","reason"],
      "properties":{"department_id":%1$s,"reason":{"enum":["TREAT","ETREAT","PATADMIN","other"]},"text":{"type":"string"}}}', uuidt)::jsonb,
    'base.privacy_line(jsonb)', '{}', checks => array['base.privacy_check(jsonb,jsonb)']::regprocedure[], feeds => array['base.review'], in_record => false, labels => '{"en":"Opened anyway"}');

  -- write:<type> for every base type
  for t in select key, labels from core.types where layer = 'base' loop
    perform core.declare_action('write:' || t.key, 'base', 'department', jsonb_build_object('en', 'Write ' || lower(coalesce(t.labels ->> 'en', t.key))));
  end loop;
end $$;

select core.declare_rule('base.private', 'base', 'base.private_hidden(uuid,uuid[])');

-- ── settings keys (§4.6) ──
select core.declare_setting('organization.record_view', 'base', 'organization',
  '{"type":"object","additionalProperties":false,"required":["view"],"properties":{"view":{"enum":["visits","entries"]}}}', labels => '{"en":"The record shows"}');
select core.declare_setting('department.private', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["private"],"properties":{"private":{"type":"boolean"}}}', labels => '{"en":"Private department"}');
select core.declare_setting('department.encounter_class', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["class"],"properties":{"class":{"enum":["AMB","EMER","IMP","OBSENC","SS","VR","HH"]}}}', labels => '{"en":"Kind of encounter"}');
select core.declare_setting('department.after_done', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["after"],"properties":{"after":{"enum":["next","queue"]}}}', labels => '{"en":"After Done"}');
select core.declare_setting('department.patients_wait', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["wait"],"properties":{"wait":{"type":"boolean"}}}', labels => '{"en":"Patients wait for results"}');
select core.declare_setting('department.review_results', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["level"],"properties":{"level":{"enum":["critical","abnormal","all"]}}}', labels => '{"en":"Results to review"}');
select core.declare_setting('department.works_for', 'base', 'department',
  '{"type":"object","additionalProperties":false,"properties":{"all":{"type":"boolean"},"departments":{"type":"array","items":{"type":"string","format":"uuid"}}}}', labels => '{"en":"Works for"}');
select core.declare_setting('department.checks_in_for', 'base', 'department',
  '{"type":"object","additionalProperties":false,"properties":{"all":{"type":"boolean"},"departments":{"type":"array","items":{"type":"string","format":"uuid"}}}}', labels => '{"en":"Checks in for"}');
select core.declare_setting('department.packs', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["packs"],"properties":{"packs":{"type":"array","items":{"type":"string"}}}}',
  'base.department_packs_check(jsonb,jsonb)', labels => '{"en":"Packs used here"}');
select core.declare_setting('department.screens', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["screens"],"properties":{"screens":{"type":"array","items":{"type":"string"}},"opens":{"type":"string"}}}',
  'base.department_screens_check(jsonb,jsonb)', labels => '{"en":"Screens"}');
select core.declare_setting('service', 'base', 'department', '{"type":"object","additionalProperties":false,"required":["code","name"],
  "properties":{"code":{"type":"string","minLength":1},"name":{"type":"string","minLength":1},"section":{"type":"string"},"coding":{"$ref":"#/$defs/coding"},
    "answer":{"type":"string"},"autoverify":{"type":"boolean"},"steps":{"type":"array","items":{"type":"string","pattern":"^[a-z][a-z0-9_]*$"}},
    "fields":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["key","name"],
      "properties":{"key":{"type":"string"},"name":{"type":"string"},"coding":{"$ref":"#/$defs/coding"},"kind":{"enum":["number","text","choice"]},
        "unit":{"type":"string"},"ucum":{"type":"string"},"choices":{"type":"array","items":{"type":"string"}},
        "low":{"type":"number"},"high":{"type":"number"},"critical_low":{"type":"number"},"critical_high":{"type":"number"},
        "ranges":{"type":"array","items":{"type":"object","additionalProperties":false,
          "properties":{"gender":{"enum":["male","female"]},"age_low":{"type":"number"},"age_high":{"type":"number"},"low":{"type":"number"},"high":{"type":"number"},
            "critical_low":{"type":"number"},"critical_high":{"type":"number"}}}}}}}}}',
  'base.service_check(jsonb,jsonb)', true, '{"en":"Service"}');
select core.declare_setting('preset', 'base', 'organization', '{"type":"object","additionalProperties":false,"required":["name"],
  "properties":{"name":{"type":"string","minLength":1},"shortcut":{"type":["string","null"]},"lines":{"type":"array","items":{"type":"string"}},
    "services":{"type":"array","items":{"type":"string","format":"uuid"}},"department_id":{"type":["string","null"],"format":"uuid"}}}',
  null, true, '{"en":"Preset"}');
-- the starter setup a department was made from (§5.2), kept by the setup door so Settings can compare the department with it
select core.declare_setting('department.setup', 'base', 'department',
  '{"type":"object","additionalProperties":false,"required":["setup"],"properties":{"setup":{"type":"string","minLength":1}}}', labels => '{"en":"Started from"}');
select core.declare_setting('place.closed', 'base', 'place',
  '{"type":"object","additionalProperties":false,"required":["closed"],"properties":{"closed":{"type":"boolean"},"reason":{"type":"string"}}}', labels => '{"en":"Closed"}');

-- ── the base's score (§5.1 rule 8): every department uses it. Teasdale and Jennett's scale, its motor response of six (1974–1976) ──
select core.declare_score('gcs', 'base', '1974', 'Teasdale G, Jennett B. Assessment of coma and impaired consciousness: a practical scale. Lancet 1974;2(7872):81–84',
  '[{"key":"eye","labels":{"en":"Eye opening"},"input":"choice","coding":{"system":"loinc","code":"9267-6"},"choices":[
      {"value":"4","points":4,"labels":{"en":"Spontaneously"}},{"value":"3","points":3,"labels":{"en":"To speech"}},
      {"value":"2","points":2,"labels":{"en":"To pain"}},{"value":"1","points":1,"labels":{"en":"None"}}]},
    {"key":"verbal","labels":{"en":"Verbal response"},"input":"choice","coding":{"system":"loinc","code":"9270-0"},"choices":[
      {"value":"5","points":5,"labels":{"en":"Oriented"}},{"value":"4","points":4,"labels":{"en":"Confused"}},{"value":"3","points":3,"labels":{"en":"Inappropriate words"}},
      {"value":"2","points":2,"labels":{"en":"Incomprehensible sounds"}},{"value":"1","points":1,"labels":{"en":"None"}}]},
    {"key":"motor","labels":{"en":"Motor response"},"input":"choice","coding":{"system":"loinc","code":"9268-4"},"choices":[
      {"value":"6","points":6,"labels":{"en":"Obeys commands"}},{"value":"5","points":5,"labels":{"en":"Localises to pain"}},{"value":"4","points":4,"labels":{"en":"Withdraws from pain"}},
      {"value":"3","points":3,"labels":{"en":"Abnormal flexion"}},{"value":"2","points":2,"labels":{"en":"Extension"}},{"value":"1","points":1,"labels":{"en":"None"}}]}]',
  '[{"key":"severe","labels":{"en":"Severe"},"min":3,"max":8,"tone":"danger"},{"key":"moderate","labels":{"en":"Moderate"},"min":9,"max":12,"tone":"warn"},
    {"key":"mild","labels":{"en":"Mild"},"min":13,"max":15,"tone":null}]',
  '{"en":"Glasgow Coma Scale","ar":"مقياس غلاسكو للغيبوبة"}', 'GCS', 'gcs', '{"system":"loinc","code":"9269-2"}');

-- ── default screens (§4.6): each tab shows to whoever holds its action in the department ──
select core.declare_screen('base.desk', 'base', 'desk', '{"en":"Front desk"}', 'read:patients');
select core.declare_screen('base.queue', 'base', 'visits', '{"en":"Queue"}', 'read:queue');
select core.declare_screen('base.bench', 'base', 'bench', '{"en":"Bench"}', 'read:bench');
select core.declare_screen('base.beds', 'base', 'stays', '{"en":"Bed board"}', 'read:queue');

-- ── the base's starter setups (§5.2): what a clinic, a ward, a laboratory and a front desk start with. The setup door adds what is
-- missing and never overwrites what staff changed; each thing's id comes from its key ──
select core.declare_setup('clinic', 'base', 'visits', '{"en":"Clinic"}',
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.patients_wait":{"wait":true},"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  presets => '[{"name":"Follow-up visit","shortcut":"fu","lines":["Since the last visit:","Examination:","Plan:"]}]',
  help => '{"en":"Patients are seen in visits: a queue, results waited for, critical ones to review."}');
select core.declare_setup('ward', 'base', 'stays', '{"en":"Ward"}',
  screens => '{"screens":["base.beds"],"opens":"base.beds"}',
  settings => '{"department.encounter_class":{"class":"IMP"},"department.review_results":{"level":"critical"}}',
  places => (select jsonb_agg(jsonb_build_object('key', 'bed_' || n, 'name', 'Bed ' || n, 'label', 'bed') order by n) from generate_series(1, 8) n),
  presets => '[{"name":"Ward round","shortcut":"round","lines":["Overnight:","Examination:","Plan:"]}]',
  help => '{"en":"Patients stay in beds: eight beds on the board, inpatient stays."}');
select core.declare_setup('laboratory', 'base', 'bench', '{"en":"Laboratory"}',
  screens => '{"screens":["base.bench"],"opens":"base.bench"}',
  settings => '{"department.works_for":{"all":true}}',
  services => $j$[
  {"code":"cbc","name":"Complete blood count","section":"Haematology","coding":{"system":"loinc","code":"58410-2"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"hb","name":"Haemoglobin","coding":{"system":"loinc","code":"718-7"},"kind":"number","unit":"g/dL","ucum":"g/dL","low":12,"high":16,"critical_low":7,"critical_high":20,
     "ranges":[{"gender":"female","low":12,"high":15.5},{"gender":"male","low":13.5,"high":17.5}]},
    {"key":"wbc","name":"WBC","coding":{"system":"loinc","code":"6690-2"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":4,"high":11,"critical_low":1,"critical_high":30},
    {"key":"plt","name":"Platelets","coding":{"system":"loinc","code":"777-3"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":150,"high":400,"critical_low":50}]},
  {"code":"hba1c","name":"HbA1c","section":"Chemistry","coding":{"system":"loinc","code":"4548-4"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"hba1c","name":"HbA1c","coding":{"system":"loinc","code":"4548-4"},"kind":"number","unit":"%","ucum":"%","low":4,"high":5.6}]},
  {"code":"creat","name":"Creatinine","section":"Chemistry","coding":{"system":"loinc","code":"2160-0"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"creat","name":"Creatinine","coding":{"system":"loinc","code":"2160-0"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":0.6,"high":1.2,"critical_high":5}]},
  {"code":"lipids","name":"Lipid panel","section":"Chemistry","coding":{"system":"loinc","code":"57698-3"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"chol","name":"Total cholesterol","coding":{"system":"loinc","code":"2093-3"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":200},
    {"key":"ldl","name":"LDL","coding":{"system":"loinc","code":"2089-1"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":100},
    {"key":"hdl","name":"HDL","coding":{"system":"loinc","code":"2085-9"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":40},
    {"key":"tg","name":"Triglycerides","coding":{"system":"loinc","code":"2571-8"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":150}]},
  {"code":"lithium","name":"Lithium level","section":"Chemistry","coding":{"system":"loinc","code":"14334-7"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"li","name":"Lithium","coding":{"system":"loinc","code":"14334-7"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":0.6,"high":1.2,"critical_high":2}]}]$j$,
  help => '{"en":"Work others order: blood counts and chemistry, collected and received, then answered with results."}');
select core.declare_setup('front_desk', 'base', 'desk', '{"en":"Front desk"}',
  screens => '{"screens":["base.desk"],"opens":"base.desk"}',
  settings => '{"department.checks_in_for":{"all":true}}',
  help => '{"en":"Registers patients and checks them in for every clinic."}');

-- ── built-in roles (fixed ids; read-only to organizations). Doctor and Nurse are everyday: where a department uses a pack, they hold its
-- everyday actions (§5.2); a specialist a pack declares is built on one of them ──
select core.declare_role('00000000-0000-0000-0000-00000000c001', 'owner', 'base', 'Owner', '{}', '{"en":"Owner"}', every_action => true);
select core.declare_role('00000000-0000-0000-0000-00000000c002', 'doctor', 'base', 'Doctor', array[
  'read:patients', 'read:record', 'read:queue', 'read:review', 'read:bench', 'export:fhir',
  'write:note', 'write:vitals', 'write:observation', 'write:problem', 'write:allergy', 'write:medication', 'write:given', 'write:list_review', 'write:order',
  'write:result', 'write:procedure', 'write:reviewed', 'write:alert', 'write:pregnancy', 'write:breastfeeding', 'write:score', 'sign:score', 'write:died', 'write:crossed_out',
  'write:here', 'write:not_here', 'write:called', 'write:seen', 'write:back_to_waiting', 'write:away', 'write:urgent', 'write:assigned', 'write:left', 'write:done',
  'write:transferred', 'write:admitted', 'write:moved', 'write:discharged', 'write:private', 'write:not_private', 'write:opened_anyway'], '{"en":"Doctor"}',
  everyday => true);
select core.declare_role('00000000-0000-0000-0000-00000000c003', 'nurse', 'base', 'Nurse', array[
  'read:patients', 'read:record', 'read:queue', 'write:note', 'write:vitals', 'write:observation', 'write:allergy', 'write:given', 'write:list_review',
  'write:procedure', 'write:alert', 'write:pregnancy', 'write:breastfeeding', 'write:score', 'write:crossed_out', 'write:here', 'write:not_here', 'write:called', 'write:back_to_waiting', 'write:away', 'write:urgent',
  'write:assigned', 'write:moved', 'write:private'], '{"en":"Nurse"}', everyday => true);
select core.declare_role('00000000-0000-0000-0000-00000000c004', 'reception', 'base', 'Reception', array[
  'read:patients', 'read:queue', 'manage:patients', 'write:checked_in', 'write:here', 'write:not_here', 'write:away', 'write:urgent', 'write:transferred',
  'write:left', 'write:crossed_out'], '{"en":"Reception"}');
select core.declare_role('00000000-0000-0000-0000-00000000c005', 'lab_technician', 'base', 'Lab technician', array[
  'read:patients', 'read:bench', 'read:queue', 'write:step', 'write:result', 'write:note', 'write:crossed_out', 'write:checked_in', 'write:called', 'write:done',
  'write:here', 'write:not_here', 'write:left'], '{"en":"Lab technician"}');

grant execute on function base.eg_national_id_check(text, jsonb) to postgres;
