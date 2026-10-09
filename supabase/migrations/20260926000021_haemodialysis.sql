-- 21 · Dialysis (spec/openCare.md §5.6), piece D1: the unit, its standing schedule, who is due. Its key is haemodialysis; a person
-- always reads "Dialysis" (the word dialysis is one the core already uses). A session is a short stay in a chair: the base's admitted
-- into the chair (an outpatient encounter, AMB) with the session begun in the same set, and later the base's discharged. The session is
-- the pack's own type on the base's procedure (in progress, completed, stopped; not done when missed). The standing schedule (a
-- patient, Sat/Mon/Wed or Sun/Tue/Thu, a shift, a chair, from and until) and its one-off moves are the pack's own two tables, not entries
-- (the plan's Q13), written and read only through its operations; Erase removes a patient's rows. The board lists who is due under the
-- chairs (the clinics' C5) and each tile says the session's time left and the last blood pressure (C1). HBV and HCV chairs are named in
-- the unit's setting; a patient in the wrong chair is shown, never stopped. Chosen by Claude at the owner's request, awaiting the owner.

set client_min_messages = warning;

select core.declare_pack('haemodialysis', 1, '{}', '{"en":"Dialysis","ar":"الغسيل الكلوي"}', role_block => 'd4');
select core.create_pack('haemodialysis');

set role pack_haemodialysis;

-- ── the standing schedule (Q13): a patient's slot; a change ends it (until) and adds the next ──
create table haemodialysis.slots (
  organization_id uuid not null,
  id            uuid not null,
  department_id uuid not null,             -- the unit
  patient_id    uuid not null,
  days          text not null check (days in ('sat_mon_wed', 'sun_tue_thu')),
  shift         int not null check (shift between 1 and 4),
  place_id      uuid not null,             -- the chair
  starts_on     date not null,
  ends_on       date,                      -- its last day (none: open); the day before it starts: never used
  note          text check (length(note) <= 200),
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  ended_by      uuid,
  ended_at      timestamptz,
  check (ends_on is null or ends_on >= starts_on - 1),
  primary key (organization_id, id)
);
create index slots_unit on haemodialysis.slots (organization_id, department_id, days, shift);
create index slots_patient on haemodialysis.slots (organization_id, patient_id);
-- one session moved: from the day it leaves (none: an extra session) to the day it comes (none: off that day), its shift and chair there
create table haemodialysis.moves (
  organization_id uuid not null,
  id            uuid not null,
  department_id uuid not null,
  patient_id    uuid not null,
  slot_id       uuid,
  from_on       date,
  to_on         date,
  shift         int check (shift between 1 and 4),
  place_id      uuid,
  reason        text not null check (length(trim(reason)) between 1 and 200),
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  undone_by     uuid,
  undone_at     timestamptz,
  check (from_on is not null or to_on is not null),
  check ((slot_id is null) = (from_on is null)),
  check ((to_on is null) = (shift is null) and (to_on is null) = (place_id is null)),
  primary key (organization_id, id)
);
create index moves_unit on haemodialysis.moves (organization_id, department_id, to_on);
create index moves_patient on haemodialysis.moves (organization_id, patient_id);

-- the clinic's time zone (Africa/Cairo unless it says)
create function haemodialysis.tz(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo')
$$;
-- is a day one of the pattern's: Saturday, Monday, Wednesday or Sunday, Tuesday, Thursday (a Friday is neither)
create function haemodialysis.on_day(p_days text, p_on date) returns boolean language sql immutable set search_path = '' as $$
  select extract(dow from p_on)::int = any (case p_days when 'sat_mon_wed' then array[6, 1, 3] when 'sun_tue_thu' then array[0, 2, 4] else '{}'::int[] end)
$$;
-- the unit's shifts, their start times in order
create function haemodialysis.shifts(p_org uuid, p_department uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(array(select jsonb_array_elements_text(core.setting_at(p_org, 'haemodialysis.unit', p_department) -> 'shifts')), '{}'),
    array['07:00', '11:30', '16:00'])
$$;
-- a patient's isolation for the chairs (hbv, hcv), from the base's current active isolation alerts, as the reader may see them
create function haemodialysis.isolation(p_org uuid, p_patient uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct substr(c, 23) order by substr(c, 23)), '{}')
    from core.pack_kind(p_org, p_patient, 'alert', '{"current":true,"data":{"status":"active"},"codes":["local.alert:isolation_hbv","local.alert:isolation_hcv"]}'::jsonb) x,
         unnest(x.codes) c where c in ('local.alert:isolation_hbv', 'local.alert:isolation_hcv')
$$;
-- a live place of this unit (a chair), or refused
create function haemodialysis.chair_here(p_org uuid, p_department uuid, p_place uuid) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_place is null or not exists (select 1 from jsonb_array_elements(core.pack_department(p_org, p_department) -> 'places') x
                                     where (x ->> 'id')::uuid = p_place and not (x ->> 'retired')::boolean) then
    perform core.refuse('not_a_chair', coalesce(p_place::text, '(none)'));
  end if;
end $$;
-- is the chair taken that day and shift: a slot there that day not moved away, or a session moved into it
create function haemodialysis.taken(p_org uuid, p_department uuid, p_place uuid, p_on date, p_shift int) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from haemodialysis.slots x where x.organization_id = p_org and x.department_id = p_department and x.place_id = p_place and x.shift = p_shift
                   and x.starts_on <= p_on and (x.ends_on is null or x.ends_on >= p_on) and haemodialysis.on_day(x.days, p_on)
                   and not exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.slot_id = x.id and m.from_on = p_on and m.undone_at is null))
      or exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.department_id = p_department and m.place_id = p_place
                   and m.to_on = p_on and m.shift = p_shift and m.undone_at is null)
$$;

-- the unit's shifts start in order (their numbers are their places in the list), and a shift still in use is not cut from the list: a
-- slot live today or later, or a session moved to today or later, on a shift past the new list's end would fall off the schedule
create function haemodialysis.unit_check(p_where jsonb, p_data jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  with w as (select (p_where ->> 'organization_id')::uuid org, (p_where ->> 'owner_id')::uuid dept, jsonb_array_length(p_data -> 'shifts') n,
                    (now() at time zone haemodialysis.tz((p_where ->> 'organization_id')::uuid))::date today)
  select case when exists (select 1 from jsonb_array_elements_text(p_data -> 'shifts') with ordinality a(t, n)
                             join jsonb_array_elements_text(p_data -> 'shifts') with ordinality b(t, n) on b.n = a.n + 1 where b.t <= a.t)
    then jsonb_build_array(jsonb_build_object('code', 'shifts_out_of_order', 'level', 'refuse', 'field', 'shifts'))
    when exists (select 1 from w, haemodialysis.slots x where x.organization_id = w.org and x.department_id = w.dept and x.shift > w.n
                   and (x.ends_on is null or x.ends_on >= w.today) and (x.ends_on is null or x.ends_on >= x.starts_on))
      or exists (select 1 from w, haemodialysis.moves m where m.organization_id = w.org and m.department_id = w.dept and m.shift > w.n
                   and m.to_on >= w.today and m.undone_at is null)
    then jsonb_build_array(jsonb_build_object('code', 'shift_in_use', 'level', 'refuse', 'field', 'shifts')) else '[]'::jsonb end
$$;

-- the week for the Schedule tab: the slots live on any of its six days (Saturday … Thursday, from the Saturday of p_args.from, else
-- today's), the sessions moved from or to those days or to the Friday after (a session may be moved to a Friday, which is in no
-- pattern), each patient's isolation; each patient named is read-logged
create function haemodialysis.week(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_today date := (now() at time zone haemodialysis.tz(p_org))::date; v_from date := coalesce((p_args ->> 'from')::date, (now() at time zone haemodialysis.tz(p_org))::date);
        v_to date; v_ids uuid[]; v_iso jsonb := '{}'; p uuid;
begin
  v_from := v_from - ((extract(dow from v_from)::int + 1) % 7);
  v_to := v_from + 5;
  select coalesce(array_agg(distinct q.x), '{}') into v_ids from (
    select sl.patient_id x from haemodialysis.slots sl where sl.organization_id = p_org and sl.department_id = p_department and sl.starts_on <= v_to and (sl.ends_on is null or sl.ends_on >= v_from)
    union select m.patient_id from haemodialysis.moves m where m.organization_id = p_org and m.department_id = p_department and m.undone_at is null
       and (m.from_on between v_from and v_to or m.to_on between v_from and v_to + 1)) q;
  foreach p in array v_ids loop v_iso := v_iso || jsonb_build_object(p::text, to_jsonb(haemodialysis.isolation(p_org, p))); end loop;
  return jsonb_build_object('from', v_from, 'to', v_to, 'today', v_today, 'patient_ids', to_jsonb(v_ids), 'isolation', v_iso,
    'slots', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', sl.id, 'patient_id', sl.patient_id, 'days', sl.days, 'shift', sl.shift,
        'place_id', sl.place_id, 'starts_on', sl.starts_on, 'ends_on', sl.ends_on, 'note', sl.note)) order by sl.shift, sl.starts_on) from haemodialysis.slots sl
       where sl.organization_id = p_org and sl.department_id = p_department and sl.starts_on <= v_to and (sl.ends_on is null or sl.ends_on >= v_from)), '[]'),
    'moves', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', m.id, 'patient_id', m.patient_id, 'slot_id', m.slot_id, 'from_on', m.from_on,
        'to_on', m.to_on, 'shift', m.shift, 'place_id', m.place_id, 'reason', m.reason)) order by m.at) from haemodialysis.moves m
       where m.organization_id = p_org and m.department_id = p_department and m.undone_at is null
         and (m.from_on between v_from and v_to or m.to_on between v_from and v_to + 1)), '[]'));
end $$;

-- the schedule's changes, one door: add a slot, end a slot, move one session (or take it off a day, or add an extra one), undo a move.
-- Refusals name what is wrong; an isolation mismatch is never one (shown by the client). A chair holds one patient a day and shift
-- (chair_taken), a patient comes once a day (already_due); the unit's changes take turns, so each check sees the one before it
create function haemodialysis.plan(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_do text := p_args ->> 'do'; v_id uuid := gen_random_uuid(); v_pt uuid; v_slot uuid; v_place uuid := (p_args ->> 'place_id')::uuid;
        v_shift int := (p_args ->> 'shift')::int; v_days text := p_args ->> 'days'; v_on date; v_to date; sl record;
        v_today date := (now() at time zone haemodialysis.tz(p_org))::date; v_n int := cardinality(haemodialysis.shifts(p_org, p_department));
        v_reason text := trim(p_args ->> 'reason'); mv record;
begin
  perform pg_advisory_xact_lock(hashtextextended('haemodialysis.plan ' || p_department::text, 0));
  if v_do = 'add' then
    v_pt := core.survivor(p_org, (p_args ->> 'patient_id')::uuid);
    v_on := (p_args ->> 'starts_on')::date;
    if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
    if v_days is null or v_days not in ('sat_mon_wed', 'sun_tue_thu') then perform core.refuse('bad_days', coalesce(v_days, '(none)')); end if;
    if v_shift is null or v_shift < 1 or v_shift > v_n then perform core.refuse('no_such_shift', coalesce(v_shift::text, '(none)')); end if;
    if v_on is null then perform core.refuse('bad_day', 'starts_on'); end if;
    perform haemodialysis.chair_here(p_org, p_department, v_place);
    -- a slot ended the day before it started (never used) blocks nothing
    if exists (select 1 from haemodialysis.slots x where x.organization_id = p_org and x.department_id = p_department and x.patient_id = v_pt
                and (x.ends_on is null or x.ends_on >= v_on) and (x.ends_on is null or x.ends_on >= x.starts_on)) then perform core.refuse('already_scheduled'); end if;
    if exists (select 1 from haemodialysis.slots x where x.organization_id = p_org and x.department_id = p_department and x.place_id = v_place
                and x.days = v_days and x.shift = v_shift and (x.ends_on is null or x.ends_on >= v_on) and (x.ends_on is null or x.ends_on >= x.starts_on))
      then perform core.refuse('chair_taken'); end if;
    -- a session moved into that chair and shift on one of the new slot's days
    if exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.department_id = p_department and m.place_id = v_place
                and m.shift = v_shift and m.undone_at is null and m.to_on >= v_on and haemodialysis.on_day(v_days, m.to_on)) then perform core.refuse('chair_taken'); end if;
    -- the patient's own extra session on one of the new slot's days
    if exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.department_id = p_department and m.patient_id = v_pt
                and m.undone_at is null and m.to_on >= v_on and haemodialysis.on_day(v_days, m.to_on)) then perform core.refuse('already_due'); end if;
    insert into haemodialysis.slots (organization_id, id, department_id, patient_id, days, shift, place_id, starts_on, note, author_id)
    values (p_org, v_id, p_department, v_pt, v_days, v_shift, v_place, v_on, nullif(trim(p_args ->> 'note'), ''), p_user);
  elsif v_do = 'end' then
    select x.* into sl from haemodialysis.slots x where x.organization_id = p_org and x.department_id = p_department and x.id = (p_args ->> 'slot_id')::uuid;
    if not found then perform core.refuse('not_found', 'slot'); end if;
    if sl.ends_on is not null then perform core.refuse('not_found', 'slot'); end if;
    v_on := (p_args ->> 'ends_on')::date;
    if v_on is null or v_on < sl.starts_on - 1 then perform core.refuse('bad_day', 'ends_on'); end if;
    update haemodialysis.slots set ends_on = v_on, ended_by = p_user, ended_at = clock_timestamp() where organization_id = p_org and id = sl.id;
    -- a session moved off a day after the end no longer comes: its move is undone (it would hold its chair and make the patient due)
    update haemodialysis.moves set undone_by = p_user, undone_at = clock_timestamp()
     where organization_id = p_org and slot_id = sl.id and from_on > v_on and undone_at is null;
    v_id := sl.id; v_pt := sl.patient_id;
  elsif v_do = 'move' then
    v_pt := core.survivor(p_org, (p_args ->> 'patient_id')::uuid);
    v_on := (p_args ->> 'from_on')::date; v_to := (p_args ->> 'to_on')::date;
    if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
    if coalesce(v_reason, '') = '' or length(v_reason) > 200 then perform core.refuse('reason_missing'); end if;
    if p_args ->> 'slot_id' is not null then
      select x.* into sl from haemodialysis.slots x where x.organization_id = p_org and x.department_id = p_department and x.id = (p_args ->> 'slot_id')::uuid and x.patient_id = v_pt;
      if not found then perform core.refuse('not_found', 'slot'); end if;
      v_slot := sl.id;
      if v_on is null or v_on < sl.starts_on or (sl.ends_on is not null and v_on > sl.ends_on) or not haemodialysis.on_day(sl.days, v_on) then
        perform core.refuse('not_a_day', coalesce(v_on::text, '(none)'));
      end if;
      if exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.slot_id = sl.id and m.from_on = v_on and m.undone_at is null) then
        perform core.refuse('already_moved');
      end if;
    elsif v_on is not null then perform core.refuse('not_found', 'slot');
    elsif v_to is null then perform core.refuse('bad_day', 'to_on');
    end if;
    if v_to is not null then
      if v_to < v_today or v_to > v_today + 14 then perform core.refuse('too_far', v_to::text); end if;
      if v_shift is null or v_shift < 1 or v_shift > v_n then perform core.refuse('no_such_shift', coalesce(v_shift::text, '(none)')); end if;
      perform haemodialysis.chair_here(p_org, p_department, v_place);
      if haemodialysis.taken(p_org, p_department, v_place, v_to, v_shift) then perform core.refuse('chair_taken'); end if;
      -- the patient already comes that day: a slot of theirs (not moved away; its own day is a change of chair or shift), or a move there
      if exists (select 1 from haemodialysis.slots x where x.organization_id = p_org and x.department_id = p_department and x.patient_id = v_pt
                   and x.starts_on <= v_to and (x.ends_on is null or x.ends_on >= v_to) and haemodialysis.on_day(x.days, v_to)
                   and not (x.id is not distinct from v_slot and v_on is not distinct from v_to)
                   and not exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.slot_id = x.id and m.from_on = v_to and m.undone_at is null))
         or exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.department_id = p_department and m.patient_id = v_pt
                      and m.to_on = v_to and m.undone_at is null) then
        perform core.refuse('already_due', v_to::text);
      end if;
    end if;
    insert into haemodialysis.moves (organization_id, id, department_id, patient_id, slot_id, from_on, to_on, shift, place_id, reason, author_id)
    values (p_org, v_id, p_department, v_pt, v_slot, v_on, v_to, case when v_to is not null then v_shift end, case when v_to is not null then v_place end, v_reason, p_user);
  elsif v_do = 'undo' then
    select m.* into mv from haemodialysis.moves m
     where m.organization_id = p_org and m.department_id = p_department and m.id = (p_args ->> 'move_id')::uuid and m.undone_at is null;
    if not found then perform core.refuse('not_found', 'move'); end if;
    -- the session comes back to its slot's chair and shift on the day it left: still free (while the move is live the slot itself is
    -- passed over there, so a taken chair is another patient's), and the patient not brought there by another move
    if mv.slot_id is not null then
      select x.* into sl from haemodialysis.slots x where x.organization_id = p_org and x.id = mv.slot_id;
      if haemodialysis.taken(p_org, p_department, sl.place_id, mv.from_on, sl.shift) then perform core.refuse('chair_taken'); end if;
      if exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.department_id = p_department and m.patient_id = mv.patient_id
                   and m.id <> mv.id and m.to_on = mv.from_on and m.undone_at is null) then perform core.refuse('already_due', mv.from_on::text); end if;
    end if;
    update haemodialysis.moves set undone_by = p_user, undone_at = clock_timestamp() where organization_id = p_org and id = mv.id;
    v_id := mv.id; v_pt := mv.patient_id;
  else
    perform core.refuse('bad_request', coalesce(v_do, '(none)'));
  end if;
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('id', v_id, 'patient_ids', jsonb_build_array(v_pt));
end $$;
reset role;

-- the schedule is changed by the unit's own nurse and doctor (not everyday: a base Nurse or Doctor working there reads it)
select core.declare_action('write:haemodialysis.schedule', 'haemodialysis', 'department', '{"en":"Change the dialysis schedule","ar":"تعديل جدول الغسيل الكلوي"}');

-- the unit: its shifts, a session's hours, the chairs kept for HBV and HCV (by name, as on the board)
select core.declare_setting('haemodialysis.unit', 'haemodialysis', 'department',
  $j${"type":"object","additionalProperties":false,"required":["shifts","hours"],"properties":{
    "shifts":{"type":"array","minItems":1,"maxItems":4,"items":{"type":"string","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$"},"default":["07:00","11:30","16:00"]},
    "hours":{"type":"number","minimum":1,"maximum":8,"default":4},
    "hbv_chairs":{"type":"array","uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":40},"default":[]},
    "hcv_chairs":{"type":"array","uniqueItems":true,"items":{"type":"string","minLength":1,"maxLength":40},"default":[]}}}$j$,
  'haemodialysis.unit_check(jsonb,jsonb)', labels => '{"en":"Dialysis unit"}', form => 'department',
  fields => $j$[{"key":"shifts","labels":{"en":"Shifts (start times, in order)"},"help":{"en":"Each shift's start: 07:00, 11:30, 16:00. A standing slot names its shift by its place in this list."}},
    {"key":"hours","labels":{"en":"Hours a session"},"unit":"h","help":{"en":"Unless the patient's prescription says."}},
    {"key":"hbv_chairs","labels":{"en":"Chairs kept for HBV"},"help":{"en":"Chair names as on the board. A patient with an HBV isolation alert in another chair, or anyone else in these, is shown, never stopped."}},
    {"key":"hcv_chairs","labels":{"en":"Chairs kept for HCV"},"help":{"en":"Chair names as on the board."}}]$j$);

-- the Schedule tab: the week by shift and chair (whoever reads the queue)
select core.declare_screen('haemodialysis.schedule', 'haemodialysis', 'stays', '{"en":"Schedule","ar":"الجدول"}', 'read:queue');

-- the unit's nurse admits and discharges (a session is a short stay) and changes the schedule; its doctor changes the schedule
select core.declare_role('00000000-0000-0000-0000-00000000d401', 'haemodialysis.nurse', 'haemodialysis', 'Dialysis nurse',
  array['write:admitted', 'write:discharged', 'write:haemodialysis.schedule'], '{"en":"Dialysis nurse","ar":"ممرض الغسيل الكلوي"}',
  built_on => '00000000-0000-0000-0000-00000000c003');
select core.declare_role('00000000-0000-0000-0000-00000000d402', 'haemodialysis.doctor', 'haemodialysis', 'Dialysis doctor',
  array['write:haemodialysis.schedule'], '{"en":"Dialysis doctor","ar":"طبيب الغسيل الكلوي"}', built_on => '00000000-0000-0000-0000-00000000c002');

-- the two tables hold patients: Erase removes their rows
grant select, delete on haemodialysis.slots, haemodialysis.moves to core_eraser;
select core.declare_store('haemodialysis.slots', 'haemodialysis');
select core.declare_store('haemodialysis.moves', 'haemodialysis');

select core.declare_op('haemodialysis.week', 'haemodialysis', 'haemodialysis.week(uuid,uuid,uuid,jsonb)', 'read:queue', patients => true);
select core.declare_op('haemodialysis.plan', 'haemodialysis', 'haemodialysis.plan(uuid,uuid,uuid,jsonb)', 'write:haemodialysis.schedule', patients => true);

-- the starter setup: eight chairs (an HCV chair and an HBV chair among them), three shifts, outpatient stays, the board and the Schedule
select core.declare_setup('haemodialysis.unit', 'haemodialysis', 'stays', '{"en":"Dialysis unit","ar":"وحدة الغسيل الكلوي"}', packs => array['haemodialysis'],
  screens => '{"screens":["base.beds","haemodialysis.schedule"],"opens":"base.beds"}',
  settings => $j${"department.encounter_class":{"class":"AMB"},"department.review_results":{"level":"critical"},
    "haemodialysis.unit":{"shifts":["07:00","11:30","16:00"],"hours":4,"hbv_chairs":["HBV chair 8"],"hcv_chairs":["HCV chair 7"]}}$j$,
  places => (select jsonb_agg(jsonb_build_object('key', 'chair_' || n, 'name', 'Chair ' || n, 'label', 'chair') order by n) from generate_series(1, 6) n)
    || '[{"key":"hcv_chair_7","name":"HCV chair 7","label":"chair"},{"key":"hbv_chair_8","name":"HBV chair 8","label":"chair"}]'::jsonb,
  help => '{"en":"Eight chairs on the board, one kept for HBV and one for HCV; three shifts; the standing schedule, and who is due under the board; each session a short outpatient stay in its chair."}');

select core.lock_pack('haemodialysis');
