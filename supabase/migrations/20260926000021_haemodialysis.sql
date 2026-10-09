-- 21 · Dialysis (spec/openCare.md §5.6), piece D1: the unit, its standing schedule, who is due. Its key is haemodialysis; a person
-- always reads "Dialysis" (the word dialysis is one the core already uses). A session is a short stay in a chair: the base's admitted
-- into the chair (an outpatient encounter, AMB) with the session begun in the same set, and later the base's discharged. The session is
-- the pack's own type on the base's procedure (in progress, completed, stopped; not done when missed). The standing schedule (a
-- patient, Sat/Mon/Wed or Sun/Tue/Thu, a shift, a chair, from and until) and its one-off moves are the pack's own two tables, not entries
-- (the plan's Q13), written and read only through its operations; Erase removes a patient's rows. The board lists who is due under the
-- chairs (the clinics' C5) and each tile says the session's time left and the last blood pressure (C1). HBV and HCV chairs are named in
-- the unit's setting; a patient in the wrong chair is shown, never stopped. Piece D2: the patient's standing prescription (the pack's
-- own type, one a patient, the unit's doctor's), the machine readings (the pack's own type on the base's vitals), the Session tab, and
-- the board's fluid words (the fluid to take off and taken off, the weights, the event of the last hour). Chosen by Claude at the
-- owner's request, awaiting the owner.

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
-- how far who is due reaches: the shift on now and every earlier one, and the next when it starts within the hour (before the first:
-- the first)
create function haemodialysis.upto(p_shifts text[], p_now time) returns int language plpgsql immutable set search_path = '' as $$
declare v_cur int := 0;
begin
  for i in 1 .. coalesce(cardinality(p_shifts), 0) loop
    if p_shifts[i]::time <= p_now then v_cur := i; end if;
  end loop;
  if v_cur < cardinality(p_shifts) and p_shifts[v_cur + 1]::time - p_now <= interval '60 minutes' then return v_cur + 1; end if;
  return greatest(v_cur, 1);
end $$;
-- a patient's isolation for the chairs (hbv, hcv), from the base's current active isolation alerts, as the reader may see them
create function haemodialysis.isolation(p_org uuid, p_patient uuid) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct substr(c, 23) order by substr(c, 23)), '{}')
    from core.pack_kind(p_org, p_patient, 'alert', '{"current":true,"data":{"status":"active"},"codes":["local.alert:isolation_hbv","local.alert:isolation_hcv"]}'::jsonb) x,
         unnest(x.codes) c where c in ('local.alert:isolation_hbv', 'local.alert:isolation_hcv')
$$;
-- the day of a patient's last session before today (on, done or stopped), as the reader may see it
create function haemodialysis.last_on(p_org uuid, p_patient uuid) returns date language sql stable security definer set search_path = '' as $$
  select max((x.data -> 'haemodialysis' ->> 'on')::date) from core.pack_kind(p_org, p_patient, 'haemodialysis.session', '{"current":true}'::jsonb) x
   where x.data ->> 'status' in ('in-progress', 'completed', 'stopped') and (x.data -> 'haemodialysis' ->> 'on')::date < (now() at time zone haemodialysis.tz(p_org))::date
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

-- a session in words: "Dialysis · on · 4 h", "Dialysis · done · 2.6 L off" (the fluid taken off in mL, or in L when it says so),
-- "Dialysis missed · Did not come"
create function haemodialysis.session_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status'
    when 'not-done' then 'Dialysis missed' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    when 'in-progress' then 'Dialysis · on' || coalesce(' · ' || (e -> 'data' -> 'haemodialysis' ->> 'hours') || ' h', '')
    when 'stopped' then 'Dialysis · stopped early' || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    else 'Dialysis · done' || coalesce(' · ' || to_char((e -> 'data' -> 'haemodialysis' -> 'removed' ->> 'value')::numeric
        / case when coalesce(e -> 'data' -> 'haemodialysis' -> 'removed' ->> 'ucum', e -> 'data' -> 'haemodialysis' -> 'removed' ->> 'unit') = 'L' then 1 else 1000 end, 'FM990.0') || ' L off', '')
      || coalesce(' · ' || nullif(e -> 'data' ->> 'outcome', ''), '') end
$$;

-- a session is a dialysis in this unit (its concept the pack's); on, done or stopped it sits in a stay admitted here (or opened here in
-- the same set), one session a stay; not done (missed) it sits in no stay; one session a patient a day (a crossed-out one aside)
create function haemodialysis.session_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; v_visit uuid := (p_entry ->> 'visit_id')::uuid; d jsonb := p_entry -> 'data';
        v_item uuid := coalesce((p_entry ->> 'item')::uuid, (p_entry ->> 'id')::uuid); v_stay jsonb;
        v_new boolean := p_entry ->> 'replaces' is null and p_entry ->> 'relation' is distinct from 'changes';
begin
  if not coalesce(d -> 'concept' -> 'codings' @> '[{"system":"local.procedure","code":"haemodialysis"}]'::jsonb, false) then
    return jsonb_build_array(jsonb_build_object('code', 'not_a_session', 'level', 'refuse'));
  end if;
  if d ->> 'status' = 'not-done' then
    if v_visit is not null then return jsonb_build_array(jsonb_build_object('code', 'session_missed_in_stay', 'level', 'refuse')); end if;
  else
    if v_visit is null then return jsonb_build_array(jsonb_build_object('code', 'session_not_in_stay', 'level', 'refuse')); end if;
    select r into v_stay from core.pack_rows(v_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('item', v_visit))) r limit 1;
    if v_stay is not null then
      -- a new session needs the stay still admitted; a correction or a change of one (End, a late signature) may follow the discharge
      if not (v_stay ->> 'kind' = 'stay' and (v_stay ->> 'department_id')::uuid = (p_entry ->> 'department_id')::uuid and (not v_new or v_stay ->> 'state' = 'admitted')) then
        return jsonb_build_array(jsonb_build_object('code', 'session_not_in_stay', 'level', 'refuse'));
      end if;
    elsif not exists (select 1 from jsonb_array_elements(p_set) x where (x ->> 'id')::uuid = v_visit and core.base_of(x ->> 'type') = 'admitted'
                        and coalesce((x -> 'data' ->> 'department_id')::uuid, (x ->> 'department_id')::uuid) = (p_entry ->> 'department_id')::uuid) then
      return jsonb_build_array(jsonb_build_object('code', 'session_not_in_stay', 'level', 'refuse'));
    end if;
    -- the stay's sessions as they stand now (a crossed-out one drops)
    if v_new and exists (select 1 from core.pack_kind(v_org, (p_entry ->> 'patient_id')::uuid, 'haemodialysis.session', '{"current":true}'::jsonb) x
                          where x.visit_id = v_visit and x.item <> v_item) then
      return jsonb_build_array(jsonb_build_object('code', 'session_exists', 'level', 'refuse'));
    end if;
  end if;
  if v_new and exists (select 1 from core.pack_kind(v_org, (p_entry ->> 'patient_id')::uuid, 'haemodialysis.session',
       jsonb_build_object('current', true, 'data', jsonb_build_object('haemodialysis', jsonb_build_object('on', d -> 'haemodialysis' ->> 'on')))) x where x.item <> v_item) then
    return jsonb_build_array(jsonb_build_object('code', 'session_on_day', 'level', 'refuse'));
  end if;
  return '[]';
end $$;

-- D2 · the standing prescription in words: "Dialysis prescription · 4 h · BF 300 · DF 500 · FX80 · K 2 Ca 1.5 HCO₃ 32 · 2000 units then
-- 1000 units/h · dry 72.0 kg"
create function haemodialysis.prescription_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Dialysis prescription', (e -> 'data' ->> 'hours') || ' h',
    'BF ' || (e -> 'data' -> 'blood_flow' ->> 'value'), 'DF ' || (e -> 'data' -> 'dialysate_flow' ->> 'value'), nullif(e -> 'data' ->> 'dialyser', ''),
    'K ' || (e -> 'data' -> 'bath' ->> 'k') || ' Ca ' || (e -> 'data' -> 'bath' ->> 'ca') || ' HCO₃ ' || (e -> 'data' -> 'bath' ->> 'hco3'),
    case when coalesce((e -> 'data' -> 'heparin' ->> 'none')::boolean, false) then 'no heparin'
      else nullif(concat_ws(' then ', (e -> 'data' -> 'heparin' -> 'bolus' ->> 'value') || ' units', (e -> 'data' -> 'heparin' -> 'rate' ->> 'value') || ' units/h'), '') end,
    'dry ' || (e -> 'data' -> 'dry_weight' ->> 'value') || ' kg')
$$;
-- one standing prescription a patient: the first is new, each change continues it (a change of anything else is refused); one the
-- writer may not see still counts (its placeholder has no author). No heparin is no dose: "none" beside a bolus or a rate is refused
create function haemodialysis.prescription_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; v_item uuid := coalesce((p_entry ->> 'item')::uuid, (p_entry ->> 'id')::uuid);
        v_new boolean := p_entry ->> 'replaces' is null and p_entry ->> 'relation' is distinct from 'changes';
begin
  if not v_new and not exists (select 1 from core.pack_entries(v_org, array[v_item]) x where x.item = v_item and x.type = 'haemodialysis.prescription') then
    return jsonb_build_array(jsonb_build_object('code', 'not_a_prescription', 'level', 'refuse'));
  end if;
  if v_new and exists (select 1 from core.pack_kind(v_org, (p_entry ->> 'patient_id')::uuid, 'haemodialysis.prescription', '{"current":true}'::jsonb) x
                        where x.item <> v_item) then
    return jsonb_build_array(jsonb_build_object('code', 'prescription_exists', 'level', 'refuse'));
  end if;
  if coalesce((p_entry -> 'data' -> 'heparin' ->> 'none')::boolean, false) and (p_entry -> 'data' -> 'heparin' ? 'bolus' or p_entry -> 'data' -> 'heparin' ? 'rate') then
    return jsonb_build_array(jsonb_build_object('code', 'heparin_none_with_dose', 'level', 'refuse'));
  end if;
  return '[]';
end $$;
-- a machine reading in words: "Reading · BP 128/76 · P 84 · BF 300 · AP -190 · VP 150 · TMP 80 · off 0.9 L · heparin 1000 units/h"
create function haemodialysis.reading_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Reading',
    'BP ' || (e -> 'data' -> 'bp' -> 'sys' ->> 'value') || '/' || (e -> 'data' -> 'bp' -> 'dia' ->> 'value'), 'P ' || (e -> 'data' -> 'hr' ->> 'value'),
    'BF ' || (e -> 'data' -> 'haemodialysis' -> 'blood_flow' ->> 'value'), 'AP ' || (e -> 'data' -> 'haemodialysis' -> 'arterial' ->> 'value'),
    'VP ' || (e -> 'data' -> 'haemodialysis' -> 'venous' ->> 'value'), 'TMP ' || (e -> 'data' -> 'haemodialysis' -> 'tmp' ->> 'value'),
    'off ' || to_char((e -> 'data' -> 'haemodialysis' -> 'uf' ->> 'value')::numeric / 1000, 'FM990.0') || ' L',
    'heparin ' || (e -> 'data' -> 'haemodialysis' -> 'heparin' ->> 'value') || ' units/h', nullif(e -> 'data' ->> 'note', ''))
$$;
-- a new reading sits in a stay whose session is in progress (as it stands now, a crossed-out one aside; or begun in the same set);
-- a correction is free, of a reading only (never the base's vitals or another Observation turned into one)
create function haemodialysis.reading_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_entry ->> 'organization_id')::uuid; v_visit uuid := (p_entry ->> 'visit_id')::uuid; v_status text;
        v_item uuid := coalesce((p_entry ->> 'item')::uuid, (p_entry ->> 'id')::uuid);
begin
  if p_entry ->> 'replaces' is not null or p_entry ->> 'relation' = 'changes' then
    if not exists (select 1 from core.pack_entries(v_org, array[v_item]) x where x.item = v_item and x.type = 'haemodialysis.reading') then
      return jsonb_build_array(jsonb_build_object('code', 'not_a_reading', 'level', 'refuse'));
    end if;
    return '[]';
  end if;
  if v_visit is not null then
    select x.data ->> 'status' into v_status from core.pack_kind(v_org, (p_entry ->> 'patient_id')::uuid, 'haemodialysis.session', '{"current":true}'::jsonb) x
     where x.visit_id = v_visit and x.author_id is not null order by x.recorded_at desc, x.id desc limit 1;
    if v_status is null then
      select x -> 'data' ->> 'status' into v_status from jsonb_array_elements(p_set) x
       where x ->> 'type' = 'haemodialysis.session' and (x ->> 'visit_id')::uuid = v_visit limit 1;
    end if;
  end if;
  if v_status is distinct from 'in-progress' then return jsonb_build_array(jsonb_build_object('code', 'reading_not_in_session', 'level', 'refuse')); end if;
  return '[]';
end $$;

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

-- who is due now (the clinics' C5 rows under the board, spec §5.6). Read here, never ids from the client; each patient named is read-logged
create function haemodialysis.due(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_tz text := haemodialysis.tz(p_org); v_today date := (now() at time zone haemodialysis.tz(p_org))::date;
        v_now time := (now() at time zone haemodialysis.tz(p_org))::time; v_shifts text[] := haemodialysis.shifts(p_org, p_department);
        v_upto int; v_cur int := 0; v_hours numeric := coalesce((core.setting_at(p_org, 'haemodialysis.unit', p_department) ->> 'hours')::numeric, 4);
        r record; s jsonb; v_here uuid[] := '{}'; v_rows jsonb := '[]'; v_ids uuid[] := '{}'; v_else text; v_rx_hours numeric; v_access text;
begin
  v_upto := haemodialysis.upto(v_shifts, v_now);
  for i in 1 .. cardinality(v_shifts) loop
    if v_shifts[i]::time <= v_now then v_cur := i; end if;
  end loop;
  for s in select x from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) x loop
    v_here := v_here || (s ->> 'patient_id')::uuid;
  end loop;
  for r in
    select sl.id slot_id, null::uuid move_id, sl.patient_id, sl.shift, sl.place_id from haemodialysis.slots sl
     where sl.organization_id = p_org and sl.department_id = p_department and sl.starts_on <= v_today and (sl.ends_on is null or sl.ends_on >= v_today)
       and haemodialysis.on_day(sl.days, v_today)
       and not exists (select 1 from haemodialysis.moves m where m.organization_id = p_org and m.slot_id = sl.id and m.from_on = v_today and m.undone_at is null)
    union all
    select m.slot_id, m.id, m.patient_id, m.shift, m.place_id from haemodialysis.moves m
     where m.organization_id = p_org and m.department_id = p_department and m.to_on = v_today and m.undone_at is null
  loop
    continue when r.shift > v_upto or r.patient_id = any (v_here);
    continue when exists (select 1 from core.pack_kind(p_org, r.patient_id, 'haemodialysis.session',
      jsonb_build_object('current', true, 'data', jsonb_build_object('haemodialysis', jsonb_build_object('on', v_today)))));
    select dp ->> 'name' into v_else from core.pack_rows(p_org, 'base.presence', jsonb_build_object('patient', r.patient_id,
        'where', jsonb_build_object('kind', 'stay', 'state', 'admitted'))) x, lateral (select core.pack_department(p_org, (x ->> 'department_id')::uuid) dp) y
     where (x ->> 'department_id')::uuid <> p_department limit 1;
    -- the hours and the access from the patient's standing prescription (D2), else the unit's hours
    select (x.data ->> 'hours')::numeric, x.data -> 'access' ->> 'kind' into v_rx_hours, v_access
      from core.pack_kind(p_org, r.patient_id, 'haemodialysis.prescription', '{"current":true}'::jsonb) x
     where x.author_id is not null order by x.recorded_at desc limit 1;
    v_ids := v_ids || r.patient_id;
    v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('patient_id', r.patient_id, 'slot_id', r.slot_id, 'move_id', r.move_id,
      'on', v_today, 'shift', r.shift, 'starts', v_shifts[r.shift], 'starts_at', case when v_shifts[r.shift] is not null then (v_today + v_shifts[r.shift]::time) at time zone v_tz end,
      'place_id', r.place_id, 'hours', coalesce(v_rx_hours, v_hours), 'access', v_access, 'isolation', to_jsonb(haemodialysis.isolation(p_org, r.patient_id)),
      'last_on', haemodialysis.last_on(p_org, r.patient_id), 'elsewhere', v_else)));
    v_else := null; v_rx_hours := null; v_access := null;
  end loop;
  return jsonb_build_object('on', v_today, 'shift', v_cur, 'patient_ids', to_jsonb(v_ids), 'rows', v_rows);
end $$;

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

-- the board's words (the owner's C1, and D2's fluid): each stay admitted here, its session (with the fluid to take off and the dry
-- weight Before copied in), the stay's latest blood pressure, the latest fluid taken off by the machine, the stay's first weight (the
-- weight before), the patient's last weight in the 30 days before the stay began (the last session's weight after), the dialysis
-- event of the last hour, the patient's isolation, as the reader may see them (a hidden entry comes back with no author and is passed
-- over). This unit's stays only, read here; each patient named is read-logged by the door
create function haemodialysis.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; n record; b record; u record; e record; v_stay uuid; v_pt uuid; v_from jsonb; v_ids uuid[] := '{}'; v_out jsonb := '{}';
        v_session jsonb; v_bp jsonb; v_uf jsonb; v_event jsonb; v_pre numeric; v_last numeric;
begin
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_stay := (s ->> 'item')::uuid; v_pt := (s ->> 'patient_id')::uuid; v_ids := v_ids || v_pt;
    v_session := null; v_bp := null; v_uf := null; v_event := null; v_pre := null; v_last := null;
    -- each as it stands now: each item's latest version, a crossed-out one dropped (read from the day before the stay began, so a long
    -- record is not read whole)
    v_from := jsonb_build_object('current', true, 'from', (s ->> 'checked_in_at')::timestamptz - interval '1 day');
    select x.item, x.data into n from core.pack_kind(p_org, v_pt, 'haemodialysis.session', v_from) x
     where x.visit_id = v_stay and x.author_id is not null order by x.recorded_at desc, x.id desc limit 1;
    if found then
      v_session := jsonb_strip_nulls(jsonb_build_object('item', n.item, 'status', n.data ->> 'status', 'on', n.data -> 'haemodialysis' ->> 'on',
        'shift', (n.data -> 'haemodialysis' ->> 'shift')::int, 'hours', (n.data -> 'haemodialysis' ->> 'hours')::numeric, 'started', n.data -> 'performed' ->> 'value',
        'target', (n.data -> 'haemodialysis' -> 'target' ->> 'value')::numeric, 'dry', (n.data -> 'haemodialysis' -> 'prescription' -> 'dry_weight' ->> 'value')::numeric));
    end if;
    -- the latest blood pressure (the base's vitals and the readings on them)
    select x.data, x.occurred_at into b from core.pack_kind(p_org, v_pt, 'vitals', v_from) x
     where x.visit_id = v_stay and x.author_id is not null and x.data ? 'bp' order by x.occurred_at desc, x.recorded_at desc limit 1;
    if found then
      v_bp := jsonb_build_object('sys', (b.data -> 'bp' -> 'sys' ->> 'value')::numeric, 'dia', (b.data -> 'bp' -> 'dia' ->> 'value')::numeric, 'at', b.occurred_at);
    end if;
    select x.data, x.occurred_at into u from core.pack_kind(p_org, v_pt, 'haemodialysis.reading', v_from) x
     where x.visit_id = v_stay and x.author_id is not null and x.data -> 'haemodialysis' ? 'uf' order by x.occurred_at desc, x.recorded_at desc limit 1;
    if found then v_uf := jsonb_build_object('ml', (u.data -> 'haemodialysis' -> 'uf' ->> 'value')::numeric, 'at', u.occurred_at); end if;
    select (x.data -> 'weight' ->> 'value')::numeric into v_pre from core.pack_kind(p_org, v_pt, 'vitals', v_from) x
     where x.visit_id = v_stay and x.author_id is not null and x.data ? 'weight' order by x.occurred_at, x.recorded_at limit 1;
    -- pack_kind's to is "occurred_at < to": the weight before this stay began, of the 30 days before it (only entries with a weight
    -- are read, so the readings, vitals too, are not)
    select (x.data -> 'weight' ->> 'value')::numeric into v_last from core.pack_kind(p_org, v_pt, 'vitals', jsonb_build_object('current', true,
        'from', (s ->> 'checked_in_at')::timestamptz - interval '30 days', 'to', s ->> 'checked_in_at', 'data', '{"weight":{}}'::jsonb)) x
     where x.author_id is not null and x.data ? 'weight' order by x.occurred_at desc, x.recorded_at desc limit 1;
    -- the stay's latest dialysis event of the last hour (a private note reads as its placeholder, with no author, and is passed over)
    select x.data, x.occurred_at into e from core.pack_kind(p_org, v_pt, 'note', jsonb_build_object('current', true, 'from', now() - interval '60 minutes',
        'data', jsonb_build_object('kind', 'dialysis_event'))) x
     where x.visit_id = v_stay and x.author_id is not null order by x.occurred_at desc, x.recorded_at desc limit 1;
    if found then v_event := jsonb_build_object('heading', e.data ->> 'heading', 'at', e.occurred_at); end if;
    v_out := v_out || jsonb_build_object(v_stay, jsonb_strip_nulls(jsonb_build_object('session', v_session, 'bp', v_bp, 'uf', v_uf, 'pre', v_pre, 'last', v_last,
      'event', v_event, 'isolation', to_jsonb(haemodialysis.isolation(p_org, v_pt)))));
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'stays', v_out);
end $$;
reset role;

-- a session is started, ended or marked missed by whoever works there (everyday: the base's Doctors and Nurses where the unit uses
-- the pack, and every role built on them)
select core.declare_action('write:haemodialysis.session', 'haemodialysis', 'department', '{"en":"Start, end or mark missed a dialysis session","ar":"تسجيل جلسة الغسيل الكلوي"}', everyday => true);
-- the schedule is changed by the unit's own nurse and doctor (not everyday: a base Nurse or Doctor working there reads it)
select core.declare_action('write:haemodialysis.schedule', 'haemodialysis', 'department', '{"en":"Change the dialysis schedule","ar":"تعديل جدول الغسيل الكلوي"}');

-- the session: the pack's own type on the base's procedure (so the procedure's check, record line rules, privacy and FHIR apply: a
-- Procedure in its Encounter), its own fields under haemodialysis; D2's fields are declared now so the shape does not change later
select core.declare_type('haemodialysis.session', 1, 'haemodialysis', $j${"type":"object","additionalProperties":false,"required":["concept","status","haemodialysis"],
  "properties":{
    "concept":{"$ref":"#/$defs/concept"},
    "status":{"enum":["in-progress","completed","stopped","not-done"]},
    "performed":{"$ref":"#/$defs/partial_date"},
    "outcome":{"type":"string"},"reason":{"type":"string"},"note":{"type":"string"},
    "haemodialysis":{"type":"object","additionalProperties":false,"required":["on"],"properties":{
      "on":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},
      "shift":{"type":"integer","minimum":1,"maximum":4},
      "chair":{"type":"string","format":"uuid"},
      "slot":{"type":"string","format":"uuid"},
      "hours":{"type":"number","minimum":0.5,"maximum":8},
      "missed":{"enum":["not_came","unwell","admitted","travelling","refused","other"]},
      "prescription":{"type":"object","additionalProperties":false,"properties":{
        "hours":{"type":"number","minimum":0.5,"maximum":8},
        "blood_flow":{"$ref":"#/$defs/quantity"},"dialysate_flow":{"$ref":"#/$defs/quantity"},
        "dialyser":{"type":"string","maxLength":40},
        "bath":{"type":"object","additionalProperties":false,"properties":{"k":{"type":"number","minimum":0,"maximum":5},
          "ca":{"type":"number","minimum":0,"maximum":3},"hco3":{"type":"number","minimum":20,"maximum":40}}},
        "heparin":{"type":"object","additionalProperties":false,"properties":{"bolus":{"$ref":"#/$defs/quantity"},"rate":{"$ref":"#/$defs/quantity"},"none":{"type":"boolean"}}},
        "dry_weight":{"$ref":"#/$defs/quantity"},
        "access":{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"enum":["fistula","graft","catheter"]},"site":{"type":"string","maxLength":60}}},
        "note":{"type":"string","maxLength":300}}},
      "target":{"$ref":"#/$defs/quantity"},
      "access":{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"enum":["fistula","graft","catheter"]},
        "site":{"type":"string","maxLength":60},"ok":{"type":"boolean"},"note":{"type":"string","maxLength":200}}},
      "removed":{"$ref":"#/$defs/quantity"},
      "needles":{"type":"string","maxLength":200},
      "ended":{"$ref":"#/$defs/datetime"}}}}}$j$::jsonb,
  'haemodialysis.session_line(jsonb)', array['Procedure'], base_type => 'procedure',
  checks => array['haemodialysis.session_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Dialysis session","ar":"جلسة غسيل كلوي"}');

-- D2 · the standing prescription is written by the unit's doctor only (not everyday); a machine reading by whoever works there (everyday)
select core.declare_action('write:haemodialysis.prescription', 'haemodialysis', 'department', '{"en":"Write a dialysis prescription","ar":"كتابة وصفة الغسيل الكلوي"}');
select core.declare_action('write:haemodialysis.reading', 'haemodialysis', 'department', '{"en":"Write a dialysis reading","ar":"تسجيل قراءة الغسيل الكلوي"}', everyday => true);
-- the standing prescription: the pack's own type (the base has none), one a patient, each change a version; no FHIR mapping yet
select core.declare_type('haemodialysis.prescription', 1, 'haemodialysis', $j${"type":"object","additionalProperties":false,"required":["hours","dry_weight"],"properties":{
    "hours":{"type":"number","minimum":0.5,"maximum":8},
    "blood_flow":{"$ref":"#/$defs/quantity"},"dialysate_flow":{"$ref":"#/$defs/quantity"},
    "dialyser":{"type":"string","maxLength":40},
    "bath":{"type":"object","additionalProperties":false,"properties":{"k":{"type":"number","minimum":0,"maximum":5},
      "ca":{"type":"number","minimum":0,"maximum":3},"hco3":{"type":"number","minimum":20,"maximum":40}}},
    "heparin":{"type":"object","additionalProperties":false,"properties":{"bolus":{"$ref":"#/$defs/quantity"},"rate":{"$ref":"#/$defs/quantity"},"none":{"type":"boolean"}}},
    "dry_weight":{"$ref":"#/$defs/quantity"},
    "access":{"type":"object","additionalProperties":false,"required":["kind"],"properties":{"kind":{"enum":["fistula","graft","catheter"]},"site":{"type":"string","maxLength":60}}},
    "note":{"type":"string","maxLength":300}}}$j$::jsonb,
  'haemodialysis.prescription_line(jsonb)', '{}', checks => array['haemodialysis.prescription_check(jsonb,jsonb)']::regprocedure[],
  labels => '{"en":"Dialysis prescription","ar":"وصفة الغسيل الكلوي"}');
-- a machine reading: the pack's own type on the base's vitals (BP and pulse are the base's everywhere: the values, the vitals block,
-- the stay's has_vitals, FHIR), the machine's numbers under haemodialysis; a BP or a pulse on each (the export's vital-signs panel
-- needs a member: machine numbers alone would make an empty one)
select core.declare_type('haemodialysis.reading', 1, 'haemodialysis', format($j${"type":"object","additionalProperties":false,"required":["haemodialysis"],
    "anyOf":[{"required":["bp"]},{"required":["hr"]}],"properties":{
    "bp":{"type":"object","additionalProperties":false,"required":["sys","dia"],"properties":{"sys":%1$s,"dia":%1$s}},
    "hr":%1$s,"note":{"type":"string"},
    "haemodialysis":{"type":"object","additionalProperties":false,"minProperties":1,"properties":{
      "blood_flow":%1$s,"arterial":%1$s,"venous":%1$s,"tmp":%1$s,"uf":%1$s,"heparin":%1$s}}}}$j$, '{"$ref":"#/$defs/quantity"}')::jsonb,
  'haemodialysis.reading_line(jsonb)', array['Observation'], base_type => 'vitals',
  checks => array['haemodialysis.reading_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Dialysis reading","ar":"قراءة الغسيل الكلوي"}');

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
-- the Session tab (D2): one stay's session beside the board, opened at a stay by the tile's buttons (the chart's centre holds no pack's
-- view)
select core.declare_screen('haemodialysis.session', 'haemodialysis', 'stays', '{"en":"Session","ar":"الجلسة"}', 'read:record');

-- the unit's nurse admits and discharges (a session is a short stay) and changes the schedule; its doctor changes the schedule and
-- writes the standing prescription
select core.declare_role('00000000-0000-0000-0000-00000000d401', 'haemodialysis.nurse', 'haemodialysis', 'Dialysis nurse',
  array['write:admitted', 'write:discharged', 'write:haemodialysis.schedule'], '{"en":"Dialysis nurse","ar":"ممرض الغسيل الكلوي"}',
  built_on => '00000000-0000-0000-0000-00000000c003');
select core.declare_role('00000000-0000-0000-0000-00000000d402', 'haemodialysis.doctor', 'haemodialysis', 'Dialysis doctor',
  array['write:haemodialysis.schedule', 'write:haemodialysis.prescription'], '{"en":"Dialysis doctor","ar":"طبيب الغسيل الكلوي"}', built_on => '00000000-0000-0000-0000-00000000c002');

-- the two tables hold patients: Erase removes their rows
grant select, delete on haemodialysis.slots, haemodialysis.moves to core_eraser;
select core.declare_store('haemodialysis.slots', 'haemodialysis');
select core.declare_store('haemodialysis.moves', 'haemodialysis');

select core.declare_op('haemodialysis.due', 'haemodialysis', 'haemodialysis.due(uuid,uuid,uuid,jsonb)', 'read:queue', patients => true);
select core.declare_op('haemodialysis.week', 'haemodialysis', 'haemodialysis.week(uuid,uuid,uuid,jsonb)', 'read:queue', patients => true);
select core.declare_op('haemodialysis.plan', 'haemodialysis', 'haemodialysis.plan(uuid,uuid,uuid,jsonb)', 'write:haemodialysis.schedule', patients => true);
select core.declare_op('haemodialysis.board', 'haemodialysis', 'haemodialysis.board(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- the starter setup: eight chairs (an HCV chair and an HBV chair among them), three shifts, outpatient stays, the board, the Session tab
-- and the Schedule
select core.declare_setup('haemodialysis.unit', 'haemodialysis', 'stays', '{"en":"Dialysis unit","ar":"وحدة الغسيل الكلوي"}', packs => array['haemodialysis'],
  screens => '{"screens":["base.beds","haemodialysis.session","haemodialysis.schedule"],"opens":"base.beds"}',
  settings => $j${"department.encounter_class":{"class":"AMB"},"department.review_results":{"level":"critical"},
    "haemodialysis.unit":{"shifts":["07:00","11:30","16:00"],"hours":4,"hbv_chairs":["HBV chair 8"],"hcv_chairs":["HCV chair 7"]}}$j$,
  places => (select jsonb_agg(jsonb_build_object('key', 'chair_' || n, 'name', 'Chair ' || n, 'label', 'chair') order by n) from generate_series(1, 6) n)
    || '[{"key":"hcv_chair_7","name":"HCV chair 7","label":"chair"},{"key":"hbv_chair_8","name":"HBV chair 8","label":"chair"}]'::jsonb,
  help => '{"en":"Eight chairs on the board, one kept for HBV and one for HCV; three shifts; the standing schedule, and who is due under the board; each session a short outpatient stay in its chair."}');

select core.lock_pack('haemodialysis');
