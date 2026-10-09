-- 16 · the bookings pack (spec/openCare.md §5.7): one diary for the clinic. A department that uses bookings has sessions (days, hours,
-- a doctor or anyone, a room), each booking by time (every N minutes) or by number (N places, seen in number order). A booking is the
-- pack's own row, never a record entry (owner, 2026-10-08): the patient, where, which session and day, the time or the number, the
-- order it is for (a bench's booking always names one), a note. What happens to it later — cancelled (moved is a cancel with a new
-- booking), here (arrived), a call's answer — is a new row of its own, who and when on each; nothing is ever changed. Missed is worked
-- out when read, once the session has ended. Bookings never names another pack, and reads the base only through the core's doors.

set client_min_messages = warning;

select core.declare_pack('bookings', 1, '{}', '{"en":"Bookings","ar":"الحجز"}', role_block => 'cd');
select core.create_pack('bookings');

set role pack_bookings;

-- ── its own original data, only ever added to ──
create table bookings.bookings (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),
  patient_id    uuid,                      -- emptied by an Erase with the rest of the row gone (core.declare_store)
  department_id uuid not null,             -- where: the clinic, or the bench
  session_id    uuid not null,             -- the session (its id in bookings.sessions)
  doctor_id     uuid,                      -- the session's doctor, or the one asked for
  day           date not null,             -- the clinic's day
  starts_at     timestamptz not null,      -- the time; by number, the number's place in the session (its estimate)
  number        int,                       -- by number: the place given
  order_item    uuid,                      -- the order it is for (a bench's booking always names one)
  note          text,                      -- new or re-visit, or what the desk must know (owner: a note only)
  moved_from    uuid,                      -- the booking this one moved
  booked_from   uuid not null,             -- the department it was booked from (the desk, the clinic)
  visit_id      uuid,                      -- the visit it was booked in (/book at Done)
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index bookings_day on bookings.bookings (organization_id, department_id, day);
create index bookings_patient on bookings.bookings (organization_id, patient_id);
create index bookings_order on bookings.bookings (organization_id, order_item) where order_item is not null;
-- what happened to a booking: cancelled (with its reason), here (with the visit it came in), a call's answer
create table bookings.events (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),
  booking_id    uuid not null,
  patient_id    uuid,
  kind          text not null check (kind in ('cancelled', 'here', 'call')),
  reason        text,                      -- cancelled: why
  outcome       text check (outcome in ('confirmed', 'will_cancel', 'no_answer', 'wrong_number')),
  visit_id      uuid,                      -- here: the visit it came in (a clinic's)
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index events_booking on bookings.events (organization_id, booking_id);
create index events_visit on bookings.events (organization_id, visit_id) where visit_id is not null;
create unique index events_cancelled_once on bookings.events (organization_id, booking_id) where kind = 'cancelled';
create unique index events_here_once on bookings.events (organization_id, booking_id) where kind = 'here';

create function bookings.insert_only() returns trigger language plpgsql as $$
begin
  if current_user = 'core_eraser' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception '% are only ever added to', tg_table_name using errcode = 'P0001';
end $$;
create trigger bookings_kept before update or delete on bookings.bookings for each row execute function bookings.insert_only();
create trigger events_kept before update or delete on bookings.events for each row execute function bookings.insert_only();
create trigger bookings_whole before truncate on bookings.bookings for each statement execute function bookings.insert_only();
create trigger events_whole before truncate on bookings.events for each statement execute function bookings.insert_only();

-- ── helpers ──
create function bookings.tz(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo')
$$;
create function bookings.today(p_org uuid) returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone bookings.tz(p_org))::date
$$;
-- a moment on the clinic's clock: the day and "09:30"
create function bookings.at(p_org uuid, p_day date, p_time text) returns timestamptz language sql stable security definer set search_path = '' as $$
  select (p_day + p_time::time) at time zone bookings.tz(p_org)
$$;
-- a day's word as sessions name it
create function bookings.dow(p_day date) returns text language sql immutable security definer set search_path = '' as $$
  select (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from p_day)::int + 1]
$$;
-- the department's sessions as they stand, each with its id
create function bookings.sessions_of(p_org uuid, p_department uuid) returns setof jsonb language sql stable security definer set search_path = '' as $$
  select s from jsonb_array_elements(coalesce(core.setting_at(p_org, 'bookings.sessions', p_department) -> 'sessions', '[]')) s
$$;
create function bookings.session(p_org uuid, p_department uuid, p_session uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select s from bookings.sessions_of(p_org, p_department) s where s ->> 'id' = p_session::text limit 1
$$;
-- the rules: book ahead, same doctor first
create function bookings.rules(p_org uuid, p_department uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select '{"ahead": 90, "same_doctor": true}'::jsonb || coalesce(core.setting_at(p_org, 'bookings.rules', p_department), '{}')
$$;
-- does the session sit on this day: its weekday, and not on leave (the doctor's, or the whole department's)
create function bookings.on_day(p_org uuid, p_department uuid, s jsonb, p_day date) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(s -> 'days', '[]') ? bookings.dow(p_day)
    and not exists (select 1 from jsonb_array_elements(coalesce(core.setting_at(p_org, 'bookings.sessions', p_department) -> 'leave', '[]')) l
                     where p_day between (l ->> 'from')::date and (l ->> 'to')::date
                       and (l ->> 'doctor_id' is null or l ->> 'doctor_id' = s ->> 'doctor_id'))
$$;
-- does the session book this service: its list names it, or it names none
create function bookings.books(s jsonb, p_service uuid) returns boolean language sql immutable security definer set search_path = '' as $$
  select p_service is null or jsonb_array_length(coalesce(s -> 'services', '[]')) = 0 or (s -> 'services') ? p_service::text
$$;
-- how many a session holds: its places, or its times
create function bookings.capacity(s jsonb) returns int language sql immutable security definer set search_path = '' as $$
  select case when s ->> 'how' = 'number' then coalesce((s ->> 'places')::int, 0)
    else greatest(0, (extract(epoch from ((s ->> 'to')::time - (s ->> 'from')::time)) / 60 / greatest(coalesce((s ->> 'every')::int, 15), 1))::int) end
$$;
-- what may be booked of it: its places less those kept for walk-ins, and the overbooking allowed
create function bookings.bookable(s jsonb) returns int language sql immutable security definer set search_path = '' as $$
  select greatest(0, bookings.capacity(s) - coalesce((s ->> 'walk_ins')::int, 0)) + coalesce((s ->> 'overbook')::int, 0)
$$;
-- the session's times on a day (by time), or each number's place in it (by number: the session shared evenly, the last before its end)
create function bookings.times(p_org uuid, s jsonb, p_day date) returns setof timestamptz language sql stable security definer set search_path = '' as $$
  select bookings.at(p_org, p_day, s ->> 'from') + case when s ->> 'how' = 'number'
           then make_interval(secs => floor(n * extract(epoch from ((s ->> 'to')::time - (s ->> 'from')::time)) / greatest(bookings.capacity(s), 1)))
           else make_interval(mins => n * greatest(coalesce((s ->> 'every')::int, 15), 1)) end
    from generate_series(0, greatest(bookings.capacity(s) - 1, 0)) n where bookings.capacity(s) > 0
$$;
-- a booking still standing: not cancelled
create function bookings.standing(p_org uuid, p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from bookings.events e where e.organization_id = p_org and e.booking_id = p_id and e.kind = 'cancelled')
$$;
-- may this department book (or read the bookings of) that one: itself, or a desk that checks in for it (owner: "this clinic, and the
-- desks that check in for it")
create function bookings.serves(p_org uuid, p_from uuid, p_to uuid) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare cif jsonb;
begin
  if p_from = p_to then return true; end if;
  if (core.pack_department(p_org, p_from) ->> 'work') is distinct from 'desk' then return false; end if;
  cif := core.setting_at(p_org, 'department.checks_in_for', p_from);
  return cif is null or coalesce((cif ->> 'all')::boolean, false) or coalesce(cif -> 'departments', '[]') ? p_to::text;
end $$;
-- the department a booking may be for: one that uses bookings, of a clinic's or a bench's work, served by the writer
create function bookings.target(p_org uuid, p_from uuid, p_to uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := core.pack_department(p_org, p_to);
begin
  if d is null or (d ->> 'retired')::boolean then perform core.refuse('not_found', 'department'); end if;
  if not core.department_uses(p_org, p_to, 'bookings') then perform core.refuse('no_diary', d ->> 'name'); end if;
  if not bookings.serves(p_org, p_from, p_to) then perform core.refuse('not_served', d ->> 'name'); end if;
  return d;
end $$;
-- one lock a session and day: two desks giving the last place, the second finds it taken
create function bookings.lock(p_session uuid, p_day date) returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('bookings ' || p_session::text || ' ' || p_day::text, 0))
$$;
-- one lock a thing (an order, a booking), taken before it is checked: two bookings of one order, or a move and a cancel of one booking at
-- once, the second sees the first
create function bookings.hold(p_what text, p_id uuid) returns void language sql volatile security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('bookings ' || p_what || ' ' || p_id::text, 0)) where p_id is not null
$$;
-- an order of this patient's (family) sent to this department: the latest version (book checks that it is still open)
create function bookings.open_order(p_org uuid, p_patient uuid, p_order uuid, p_department uuid) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o record;
begin
  select y.* into o from core.pack_entries(p_org, array[p_order]) y where y.item = p_order and y.type = any (core.kinds('order')) order by y.item_version desc limit 1;
  if o.id is null or not (o.patient_id = any (core.family(p_org, p_patient))) or (o.data ->> 'department_id')::uuid is distinct from p_department then
    perform core.refuse('not_found', 'order');
  end if;
  return jsonb_build_object('item', o.item, 'name', coalesce(o.data -> 'service' ->> 'name', ''), 'service_id', o.data -> 'service' ->> 'id');
end $$;

-- a booking as the screens read it: where, when, the order's name, and what became of it (booked, here, cancelled, missed). p_came: its
-- order was started or done at the bench (the operations read that from the base's orders), so the patient came though nobody pressed
-- Here: never missed
create function bookings.row_of(p_org uuid, b bookings.bookings, p_came boolean default false) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s jsonb := bookings.session(p_org, b.department_id, b.session_id); c bookings.events; h bookings.events; k bookings.events; v_end timestamptz; v_state text;
begin
  select e.* into c from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'cancelled' limit 1;
  select e.* into h from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'here' limit 1;
  select e.* into k from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'call' order by e.at desc limit 1;
  v_end := case when s is null then b.starts_at else bookings.at(p_org, b.day, s ->> 'to') end;
  v_state := case when c.id is not null then 'cancelled' when h.id is not null or p_came then 'here' when v_end < now() then 'missed' else 'booked' end;
  return jsonb_build_object('id', b.id, 'patient_id', core.survivor(p_org, b.patient_id), 'department_id', b.department_id, 'session_id', b.session_id,
    'session', coalesce(s ->> 'name', ''), 'how', coalesce(s ->> 'how', 'time'), 'doctor_id', b.doctor_id, 'place_id', s ->> 'place_id',
    'day', b.day, 'starts_at', b.starts_at, 'number', b.number, 'order_item', b.order_item, 'note', b.note, 'moved_from', b.moved_from,
    'booked_from', b.booked_from, 'booked_in', b.visit_id, 'author_id', b.author_id, 'at', b.at, 'state', v_state,
    'cancelled', case when c.id is null then null else jsonb_build_object('reason', c.reason, 'at', c.at, 'author_id', c.author_id) end,
    'here', case when h.id is null then null else jsonb_build_object('visit_id', h.visit_id, 'at', h.at) end,
    'call', case when k.id is null then null else jsonb_build_object('outcome', k.outcome, 'at', k.at, 'author_id', k.author_id) end)
    || case when b.order_item is null then '{}'::jsonb else coalesce((select jsonb_build_object('service', y.data -> 'service' ->> 'name', 'service_id', y.data -> 'service' ->> 'id')
         from core.pack_entries(p_org, array[b.order_item]) y where y.item = b.order_item and y.type = any (core.kinds('order')) order by y.item_version desc limit 1), '{}') end;
end $$;

-- ── its operations (public.pack_op) ──

-- the free places: each session of the department, day by day from a day, with its times (free or taken) or its next number; never
-- past the book-ahead days, never a day on leave, never a time gone. No patient here
create function bookings.free(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_to uuid := coalesce((p_args ->> 'department_id')::uuid, p_department); v_dept jsonb; v_today date := bookings.today(p_org);
        v_from date := greatest(coalesce((p_args ->> 'from')::date, v_today), v_today); v_days int := least(greatest(coalesce((p_args ->> 'days')::int, 14), 1), 120);
        v_doctor uuid := (p_args ->> 'doctor_id')::uuid; v_service uuid := (p_args ->> 'service_id')::uuid; v_ahead int; s jsonb; dd date; out jsonb := '[]'; v_taken jsonb; v_n int; v_times jsonb; v_next int; v_cap int;
        v_left int; v_over int; v_free int;
begin
  v_dept := bookings.target(p_org, p_department, v_to);
  v_ahead := (bookings.rules(p_org, v_to) ->> 'ahead')::int;
  for dd in select d::date from generate_series(v_from, least(v_from + v_days - 1, v_today + v_ahead), interval '1 day') d loop
    for s in select x from bookings.sessions_of(p_org, v_to) x order by x ->> 'from', x ->> 'name' loop
      continue when not bookings.on_day(p_org, v_to, s, dd);
      continue when v_doctor is not null and s ->> 'doctor_id' is not null and s ->> 'doctor_id' <> v_doctor::text;
      continue when not bookings.books(s, v_service);
      continue when bookings.at(p_org, dd, s ->> 'to') <= now();
      select coalesce(jsonb_agg(b.starts_at), '[]'), count(*) into v_taken, v_n from bookings.bookings b
       where b.organization_id = p_org and b.department_id = v_to and b.session_id = (s ->> 'id')::uuid and b.day = dd and bookings.standing(p_org, b.id);
      select coalesce(max(b.number), 0) + 1 into v_next from bookings.bookings b
       where b.organization_id = p_org and b.department_id = v_to and b.session_id = (s ->> 'id')::uuid and b.day = dd;
      v_cap := bookings.capacity(s); v_left := greatest(bookings.bookable(s) - v_n, 0)
        ; v_over := least(v_left, greatest(coalesce((s ->> 'overbook')::int, 0) - (v_n - (select count(distinct x) from jsonb_array_elements(v_taken) x)), 0));
      if s ->> 'how' = 'number' then v_times := null;
      else
        select coalesce(jsonb_agg(jsonb_build_object('at', t, 'taken', v_taken @> jsonb_build_array(t))), '[]'), count(*) filter (where not v_taken @> jsonb_build_array(t))
          into v_times, v_free from bookings.times(p_org, s, dd) t where t > now();
        -- by time, what is left is the free times still to come, and the overbooking left
        v_left := least(v_left, v_free + v_over);
      end if;
      out := out || jsonb_build_array(jsonb_build_object('session_id', s ->> 'id', 'name', s ->> 'name', 'day', dd, 'how', coalesce(s ->> 'how', 'time'),
        'from', s ->> 'from', 'to', s ->> 'to', 'every', s -> 'every', 'doctor_id', s ->> 'doctor_id', 'place_id', s ->> 'place_id', 'services', coalesce(s -> 'services', '[]'),
        'capacity', v_cap, 'booked', v_n, 'left', v_left, 'overbook_left', v_over, 'next_number', case when s ->> 'how' = 'number' then v_next end,
        'times', v_times));
    end loop;
  end loop;
  return jsonb_build_object('department', jsonb_build_object('id', v_dept ->> 'id', 'name', v_dept ->> 'name', 'work', v_dept ->> 'work',
    'places', v_dept -> 'places'), 'sessions', out, 'today', v_today, 'ahead', v_ahead);
end $$;

-- book (§5.7): a patient into a session on a day — at a time (by time) or the next number (by number) — for an order where it names
-- one (a bench's booking must), with a note; moved_from cancels the booking it replaces in the same step. Two desks giving the last
-- place: the second is refused (one lock a session and day)
create function bookings.book(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_to uuid := coalesce((p_args ->> 'department_id')::uuid, p_department); v_dept jsonb; v_pt uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid);
        v_session uuid := (p_args ->> 'session_id')::uuid; v_day date := (p_args ->> 'day')::date; s jsonb; v_today date := bookings.today(p_org);
        v_at timestamptz; v_number int; v_n int; v_slot int; v_order uuid := (p_args ->> 'order_item')::uuid; v_note text := nullif(trim(coalesce(p_args ->> 'note', '')), '');
        v_moved uuid := (p_args ->> 'moved_from')::uuid; old bookings.bookings; v_id uuid := gen_random_uuid(); v_doctor uuid; v_visit uuid := (p_args ->> 'visit_id')::uuid;
        v_order_name text;
begin
  v_dept := bookings.target(p_org, p_department, v_to);
  if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
  if v_note is not null and length(v_note) > 200 then perform core.refuse('too_long', 'note'); end if;
  s := bookings.session(p_org, v_to, v_session);
  if s is null then perform core.refuse('not_found', 'session'); end if;
  if v_day is null or v_day < v_today then perform core.refuse('in_past'); end if;
  if v_day > v_today + (bookings.rules(p_org, v_to) ->> 'ahead')::int then perform core.refuse('too_far'); end if;
  if not bookings.on_day(p_org, v_to, s, v_day) then perform core.refuse('closed'); end if;
  if bookings.at(p_org, v_day, s ->> 'to') <= now() then perform core.refuse('in_past'); end if;
  -- a move: the booking moved, held first; standing and not come yet; it carries its order (a move never books another order)
  if v_moved is not null then
    perform bookings.hold('booking', v_moved);
    select b.* into old from bookings.bookings b where b.organization_id = p_org and b.id = v_moved;
    if old.id is null or not (old.patient_id = any (core.family(p_org, v_pt))) or not bookings.serves(p_org, p_department, old.department_id) then perform core.refuse('not_found', 'booking'); end if;
    if not bookings.standing(p_org, old.id) or exists (select 1 from bookings.events e where e.organization_id = p_org and e.booking_id = old.id and e.kind = 'here') then
      perform core.refuse('booking_closed');
    end if;
    if old.order_item is not null and v_order is distinct from old.order_item and v_order is not null then perform core.refuse('other_order'); end if;
    v_order := coalesce(v_order, old.order_item);
  end if;
  -- a bench's booking names an order; an order is the patient's, sent here, still open (a crossed-out order is gone), and booked once
  if (v_dept ->> 'work') = 'bench' and v_order is null then perform core.refuse('order_missing'); end if;
  if v_order is not null then
    perform bookings.hold('order', v_order);
    v_order_name := bookings.open_order(p_org, v_pt, v_order, v_to) ->> 'name';
    if not bookings.books(s, (bookings.open_order(p_org, v_pt, v_order, v_to) ->> 'service_id')::uuid) then perform core.refuse('not_booked_here', v_order_name); end if;
    if not exists (select 1 from core.pack_rows(p_org, 'base.orders', jsonb_build_object('where', jsonb_build_object('item', v_order))) r
                    where r ->> 'status' in ('active', 'on-hold', 'in-progress')) then perform core.refuse('order_closed'); end if;
    if exists (select 1 from bookings.bookings b where b.organization_id = p_org and b.order_item = v_order and bookings.standing(p_org, b.id)
                 and b.id is distinct from v_moved and not exists (select 1 from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'here')) then
      perform core.refuse('already_booked');
    end if;
  end if;
  v_doctor := coalesce((s ->> 'doctor_id')::uuid, (p_args ->> 'doctor_id')::uuid);

  perform bookings.lock(v_session, v_day);
  select count(*) into v_n from bookings.bookings b where b.organization_id = p_org and b.department_id = v_to and b.session_id = v_session and b.day = v_day
     and bookings.standing(p_org, b.id) and b.id is distinct from v_moved;
  if v_n >= bookings.bookable(s) then perform core.refuse('full'); end if;
  if s ->> 'how' = 'number' then
    select coalesce(max(b.number), 0) + 1 into v_number from bookings.bookings b where b.organization_id = p_org and b.department_id = v_to and b.session_id = v_session and b.day = v_day;
    select t into v_at from bookings.times(p_org, s, v_day) with ordinality x(t, n) where x.n = least(v_number, greatest(bookings.capacity(s), 1));
    v_at := coalesce(v_at, bookings.at(p_org, v_day, s ->> 'to'));
  else
    v_at := (p_args ->> 'at')::timestamptz;
    if v_at is null or not exists (select 1 from bookings.times(p_org, s, v_day) t where t = v_at) then perform core.refuse('not_a_time'); end if;
    if v_at <= now() then perform core.refuse('in_past'); end if;
    select count(*) into v_slot from bookings.bookings b where b.organization_id = p_org and b.department_id = v_to and b.session_id = v_session and b.day = v_day
       and b.starts_at = v_at and bookings.standing(p_org, b.id) and b.id is distinct from v_moved;
    -- a taken time is booked again only into the overbooking the session allows (the bookings beyond one a time, so far)
    if v_slot > 0 and v_n - (select count(distinct b.starts_at) from bookings.bookings b where b.organization_id = p_org and b.department_id = v_to
         and b.session_id = v_session and b.day = v_day and bookings.standing(p_org, b.id) and b.id is distinct from v_moved) >= coalesce((s ->> 'overbook')::int, 0) then
      perform core.refuse('taken');
    end if;
  end if;
  if v_moved is not null then
    insert into bookings.events (organization_id, booking_id, patient_id, kind, reason, author_id) values (p_org, v_moved, old.patient_id, 'cancelled', 'moved', p_user);
  end if;
  insert into bookings.bookings (organization_id, id, patient_id, department_id, session_id, doctor_id, day, starts_at, number, order_item, note, moved_from, booked_from, visit_id, author_id)
  values (p_org, v_id, v_pt, v_to, v_session, v_doctor, v_day, v_at, v_number, v_order, v_note, v_moved, p_department, v_visit, p_user);
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('id', v_id, 'day', v_day, 'starts_at', v_at, 'number', v_number, 'session', s ->> 'name', 'department', v_dept ->> 'name',
    'order', v_order_name, 'patient_ids', jsonb_build_array(v_pt));
end $$;

-- cancel, with a reason from the list (picture: patient asked, doctor away, clinic closed, entered by mistake)
create function bookings.cancel(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare b bookings.bookings; v_reason text := p_args ->> 'reason';
begin
  if v_reason is null or v_reason not in ('patient asked', 'doctor away', 'clinic closed', 'entered by mistake') then perform core.refuse('reason_missing'); end if;
  perform bookings.hold('booking', (p_args ->> 'booking_id')::uuid);
  select x.* into b from bookings.bookings x where x.organization_id = p_org and x.id = (p_args ->> 'booking_id')::uuid;
  if b.id is null or not bookings.serves(p_org, p_department, b.department_id) then perform core.refuse('not_found', 'booking'); end if;
  if not bookings.standing(p_org, b.id) or exists (select 1 from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'here') then
    perform core.refuse('booking_closed');
  end if;
  insert into bookings.events (organization_id, booking_id, patient_id, kind, reason, author_id) values (p_org, b.id, b.patient_id, 'cancelled', v_reason, p_user);
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('id', b.id, 'patient_ids', jsonb_build_array(core.survivor(p_org, b.patient_id)));
end $$;

-- here (Booked today's Here): the booking came, today. A clinic's names the visit the desk's check-in opened (the base's checked_in,
-- written first): the patient's, into that clinic; a bench's names none (its order is in To do already)
create function bookings.here(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare b bookings.bookings; v_visit uuid := (p_args ->> 'visit_id')::uuid; v record;
begin
  perform bookings.hold('booking', (p_args ->> 'booking_id')::uuid);
  select x.* into b from bookings.bookings x where x.organization_id = p_org and x.id = (p_args ->> 'booking_id')::uuid;
  if b.id is null or not bookings.serves(p_org, p_department, b.department_id) then perform core.refuse('not_found', 'booking'); end if;
  if not bookings.standing(p_org, b.id) or exists (select 1 from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'here') then
    perform core.refuse('booking_closed');
  end if;
  if b.day <> bookings.today(p_org) then perform core.refuse('not_today'); end if;
  if (core.pack_department(p_org, b.department_id) ->> 'work') = 'visits' then
    select y.* into v from core.pack_entries(p_org, array[v_visit]) y where y.item = v_visit and y.item_version = 1 and y.type = any (core.kinds('checked_in'));
    if v.id is null or not (v.patient_id = any (core.family(p_org, b.patient_id)))
       or coalesce(v.data ->> 'department_id', v.department_id::text)::uuid <> b.department_id then perform core.refuse('not_found', 'visit'); end if;
  else v_visit := null;
  end if;
  insert into bookings.events (organization_id, booking_id, patient_id, kind, visit_id, author_id) values (p_org, b.id, b.patient_id, 'here', v_visit, p_user);
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('id', b.id, 'patient_ids', jsonb_build_array(core.survivor(p_org, b.patient_id)));
end $$;

-- a call's answer (Tomorrow's calls); will cancel cancels the booking ("patient asked")
create function bookings.call(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare b bookings.bookings; v_out text := p_args ->> 'outcome';
begin
  if v_out is null or v_out not in ('confirmed', 'will_cancel', 'no_answer', 'wrong_number') then perform core.refuse('bad_outcome'); end if;
  perform bookings.hold('booking', (p_args ->> 'booking_id')::uuid);
  select x.* into b from bookings.bookings x where x.organization_id = p_org and x.id = (p_args ->> 'booking_id')::uuid;
  if b.id is null or not bookings.serves(p_org, p_department, b.department_id) then perform core.refuse('not_found', 'booking'); end if;
  if not bookings.standing(p_org, b.id) then perform core.refuse('booking_closed'); end if;
  insert into bookings.events (organization_id, booking_id, patient_id, kind, outcome, author_id) values (p_org, b.id, b.patient_id, 'call', v_out, p_user);
  if v_out = 'will_cancel' then
    insert into bookings.events (organization_id, booking_id, patient_id, kind, reason, author_id) values (p_org, b.id, b.patient_id, 'cancelled', 'patient asked', p_user);
  end if;
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('id', b.id, 'patient_ids', jsonb_build_array(core.survivor(p_org, b.patient_id)));
end $$;

-- the bookings the screens list: of these departments (each this one or one it checks in for), from a day to a day (at most 14); or a
-- patient's (from today: the chart's Next visit, the booking card's "other bookings"), every department's, standing ones only
create function bookings.list(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_today date := bookings.today(p_org); v_from date := coalesce((p_args ->> 'from')::date, v_today); v_to date := coalesce((p_args ->> 'to')::date, v_from);
        v_depts uuid[]; v_pt uuid := (p_args ->> 'patient_id')::uuid; out jsonb; v_pts jsonb; v_came uuid[];
begin
  if v_pt is not null then
    select coalesce(jsonb_agg(bookings.row_of(p_org, q) order by q.starts_at), '[]') into out from (
      select b.* from bookings.bookings b
       where b.organization_id = p_org and b.patient_id = any (core.family(p_org, v_pt)) and b.day >= v_today and bookings.standing(p_org, b.id)
         and not exists (select 1 from bookings.events e where e.organization_id = p_org and e.booking_id = b.id and e.kind = 'here')
       order by b.starts_at limit 20) q;
    return jsonb_build_object('bookings', out, 'today', v_today, 'patient_ids', jsonb_build_array(core.survivor(p_org, v_pt)));
  end if;
  if v_to < v_from or v_to - v_from > 13 then perform core.refuse('too_many', 'days'); end if;
  v_depts := case when p_args ? 'departments' then array(select x::uuid from jsonb_array_elements_text(p_args -> 'departments') x) else array[p_department] end;
  if cardinality(v_depts) > 50 then perform core.refuse('too_many', 'departments'); end if;
  if exists (select 1 from unnest(v_depts) d where not bookings.serves(p_org, p_department, d)) then perform core.refuse('not_served'); end if;
  -- a bench booking whose order was started or done came, though nobody pressed Here
  v_came := array(select (r ->> 'item')::uuid from core.pack_rows(p_org, 'base.orders', jsonb_build_object('where', jsonb_build_object('item', to_jsonb(array(select b.order_item from bookings.bookings b where b.organization_id = p_org and b.department_id = any (v_depts)
    and b.day between v_from and v_to and b.order_item is not null))))) r
    where r ->> 'status' in ('in-progress', 'completed') or r ->> 'step_key' is not null or r ->> 'answered_at' is not null);
  select coalesce(jsonb_agg(bookings.row_of(p_org, b, b.order_item = any (v_came)) order by b.day, b.starts_at, b.number, b.at), '[]') into out from bookings.bookings b
   where b.organization_id = p_org and b.department_id = any (v_depts) and b.day between v_from and v_to and b.patient_id is not null;
  select coalesce(jsonb_agg(distinct x -> 'patient_id'), '[]') into v_pts from jsonb_array_elements(out) x;
  return jsonb_build_object('bookings', out, 'today', v_today, 'patient_ids', v_pts);
end $$;

-- the places on a list (core change (h)): for the clinic queue's visits, each one's booked time (here today); for a bench's orders,
-- each one's standing booking (its time, number and state: the marks (l), the To book view (m)). Ids only, no patient
create function bookings.places(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_visits uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_args -> 'visits', '[]')) x);
        v_orders uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_args -> 'orders', '[]')) x); vp jsonb; op jsonb; v_came uuid[];
begin
  if cardinality(v_visits) + cardinality(v_orders) > 1000 then perform core.refuse('too_many', 'rows'); end if;
  v_came := array(select (r ->> 'item')::uuid from core.pack_rows(p_org, 'base.orders', jsonb_build_object('where', jsonb_build_object('item', to_jsonb(v_orders)))) r
    where r ->> 'status' in ('in-progress', 'completed') or r ->> 'step_key' is not null or r ->> 'answered_at' is not null);
  select coalesce(jsonb_object_agg(e.visit_id, jsonb_build_object('at', b.starts_at, 'number', b.number, 'session', bookings.session(p_org, b.department_id, b.session_id) ->> 'name')), '{}')
    into vp from bookings.events e join bookings.bookings b on b.organization_id = e.organization_id and b.id = e.booking_id
   where e.organization_id = p_org and e.kind = 'here' and e.visit_id = any (v_visits);
  select coalesce(jsonb_object_agg(q.order_item, q.r), '{}') into op from (
    select distinct on (b.order_item) b.order_item, bookings.row_of(p_org, b, b.order_item = any (v_came)) - 'patient_id' - 'note' - 'author_id' - 'call' - 'cancelled' r
      from bookings.bookings b where b.organization_id = p_org and b.order_item = any (v_orders) and bookings.standing(p_org, b.id)
     order by b.order_item, b.at desc) q;
  -- the services this department's sessions book (a bench's To book: an order for one, not booked, waits there)
  return jsonb_build_object('visits', vp, 'orders', op, 'today', bookings.today(p_org), 'now', now(),
    'books', (select case when bool_or(jsonb_array_length(coalesce(x -> 'services', '[]')) = 0) then '"any"'::jsonb
                          else coalesce(jsonb_agg(distinct v), '[]') end
                from bookings.sessions_of(p_org, p_department) x left join lateral jsonb_array_elements_text(coalesce(x -> 'services', '[]')) v on true));
end $$;

-- the settings' checks: sessions with their days, hours (from before to), how (every 5–240 minutes, or 1–200 places), unique ids
create function bookings.sessions_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s jsonb; out jsonb := '[]'; i int := 0; l jsonb;
begin
  for s in select x from jsonb_array_elements(coalesce(p_data -> 'sessions', '[]')) x loop
    if (s ->> 'from') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (s ->> 'to') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (s ->> 'to')::time <= (s ->> 'from')::time then
      out := out || jsonb_build_array(jsonb_build_object('level', 'refuse', 'code', 'bad_hours', 'field', 'sessions.' || i || '.from', 'detail', s ->> 'name'));
    elsif s ->> 'how' = 'number' and coalesce((s ->> 'places')::int, 0) < 1 then
      out := out || jsonb_build_array(jsonb_build_object('level', 'refuse', 'code', 'places_missing', 'field', 'sessions.' || i || '.places', 'detail', s ->> 'name'));
    elsif coalesce(s ->> 'how', 'time') = 'time' and coalesce((s ->> 'every')::int, 0) < 5 then
      out := out || jsonb_build_array(jsonb_build_object('level', 'refuse', 'code', 'every_missing', 'field', 'sessions.' || i || '.every', 'detail', s ->> 'name'));
    elsif jsonb_array_length(coalesce(s -> 'days', '[]')) = 0 then
      out := out || jsonb_build_array(jsonb_build_object('level', 'refuse', 'code', 'days_missing', 'field', 'sessions.' || i || '.days', 'detail', s ->> 'name'));
    end if;
    i := i + 1;
  end loop;
  if (select count(*) <> count(distinct x ->> 'id') from jsonb_array_elements(coalesce(p_data -> 'sessions', '[]')) x) then
    out := out || jsonb_build_array(jsonb_build_object('level', 'refuse', 'code', 'duplicate', 'field', 'sessions'));
  end if;
  i := 0;
  for l in select x from jsonb_array_elements(coalesce(p_data -> 'leave', '[]')) x loop
    if (l ->> 'to')::date < (l ->> 'from')::date then
      out := out || jsonb_build_array(jsonb_build_object('level', 'refuse', 'code', 'bad_dates', 'field', 'leave.' || i || '.to'));
    end if;
    i := i + 1;
  end loop;
  return out;
end $$;

reset role;

grant select, delete on bookings.bookings, bookings.events to core_eraser;

-- its actions: reading the diary and booking are everyday (a clinic's Doctor and Nurse hold them where it uses bookings); the desk's
-- through its own role built on Reception; a department's sessions by whoever sets them up
select core.declare_action('read:bookings.diary', 'bookings', 'department', '{"en":"See the diary and who is booked"}', everyday => true);
select core.declare_action('write:bookings.booking', 'bookings', 'department', '{"en":"Book, move and cancel; mark here and a call''s answer"}', everyday => true);
select core.declare_action('write:bookings.sessions', 'bookings', 'department', '{"en":"Set the sessions, leave and closed days"}');

-- Erase reaches its own tables: a patient's bookings and what became of them go with the patient
select core.declare_store('bookings.bookings', 'bookings');
select core.declare_store('bookings.events', 'bookings');

-- its operations; those returning patient ids are read-logged per patient
select core.declare_op('bookings.free', 'bookings', 'bookings.free(uuid,uuid,uuid,jsonb)', 'read:bookings.diary');
select core.declare_op('bookings.list', 'bookings', 'bookings.list(uuid,uuid,uuid,jsonb)', 'read:bookings.diary', patients => true);
select core.declare_op('bookings.book', 'bookings', 'bookings.book(uuid,uuid,uuid,jsonb)', 'write:bookings.booking', patients => true);
select core.declare_op('bookings.cancel', 'bookings', 'bookings.cancel(uuid,uuid,uuid,jsonb)', 'write:bookings.booking', patients => true);
select core.declare_op('bookings.here', 'bookings', 'bookings.here(uuid,uuid,uuid,jsonb)', 'write:bookings.booking', patients => true);
select core.declare_op('bookings.call', 'bookings', 'bookings.call(uuid,uuid,uuid,jsonb)', 'write:bookings.booking', patients => true);
-- the places on a list: whoever reads the list (the queue's read:queue is held by the desk, the doctors, nurses and the bench's staff)
select core.declare_op('bookings.places', 'bookings', 'bookings.places(uuid,uuid,uuid,jsonb)', 'read:queue');

-- its settings (§5.1 rule 7), each a department's: the sessions with leave and closed days (its own editor), the rules (the automatic
-- form), and what to tell the patient per service (its own editor)
select core.declare_setting('bookings.sessions', 'bookings', 'department',
  '{"type":"object","additionalProperties":false,"properties":{
     "sessions":{"type":"array","maxItems":40,"items":{"type":"object","additionalProperties":false,"required":["id","name","days","from","to","how"],"properties":{
       "id":{"type":"string","format":"uuid"},"name":{"type":"string","minLength":1,"maxLength":40},
       "days":{"type":"array","uniqueItems":true,"items":{"enum":["sat","sun","mon","tue","wed","thu","fri"]}},
       "from":{"type":"string","pattern":"^[0-2][0-9]:[0-5][0-9]$"},"to":{"type":"string","pattern":"^[0-2][0-9]:[0-5][0-9]$"},
       "how":{"enum":["time","number"]},"every":{"type":"integer","minimum":5,"maximum":240},"places":{"type":"integer","minimum":1,"maximum":200},
       "doctor_id":{"type":"string","format":"uuid"},"place_id":{"type":"string","format":"uuid"},
       "overbook":{"type":"integer","minimum":0,"maximum":50},"walk_ins":{"type":"integer","minimum":0,"maximum":200},
       "services":{"type":"array","uniqueItems":true,"maxItems":100,"items":{"type":"string","format":"uuid"}}}}},
     "leave":{"type":"array","maxItems":200,"items":{"type":"object","additionalProperties":false,"required":["from","to"],"properties":{
       "from":{"type":"string","format":"date"},"to":{"type":"string","format":"date"},"doctor_id":{"type":"string","format":"uuid"},
       "reason":{"type":"string","maxLength":60}}}}}}',
  'bookings.sessions_check(jsonb,jsonb)', labels => '{"en":"Sessions"}', form => 'department', action => 'write:bookings.sessions',
  fields => '[{"key":"sessions","labels":{"en":"Sessions"}},{"key":"sessions.id","labels":{"en":"Id"}},{"key":"sessions.name","labels":{"en":"Name"}},
    {"key":"sessions.days","labels":{"en":"Days"},"choices":{"sat":{"en":"Sat"},"sun":{"en":"Sun"},"mon":{"en":"Mon"},"tue":{"en":"Tue"},"wed":{"en":"Wed"},"thu":{"en":"Thu"},"fri":{"en":"Fri"}}},{"key":"sessions.from","labels":{"en":"From"}},{"key":"sessions.to","labels":{"en":"To"}},
    {"key":"sessions.how","labels":{"en":"How"},"choices":{"time":{"en":"By time"},"number":{"en":"By number"}}},
    {"key":"sessions.every","labels":{"en":"Every"},"unit":"min"},{"key":"sessions.places","labels":{"en":"Places"}},
    {"key":"sessions.doctor_id","labels":{"en":"Doctor"}},{"key":"sessions.place_id","labels":{"en":"Room"}},
    {"key":"sessions.overbook","labels":{"en":"Overbook"}},{"key":"sessions.walk_ins","labels":{"en":"Kept for walk-ins"}},
    {"key":"sessions.services","labels":{"en":"What it books"},"help":{"en":"A bench''s services booked in this session (none: any). An order for one waits in To book until it is booked."}},
    {"key":"leave","labels":{"en":"Leave and closed days"}},{"key":"leave.from","labels":{"en":"From"}},{"key":"leave.to","labels":{"en":"To"}},
    {"key":"leave.doctor_id","labels":{"en":"Doctor"}},{"key":"leave.reason","labels":{"en":"Reason"}}]');
select core.declare_setting('bookings.rules', 'bookings', 'department',
  '{"type":"object","additionalProperties":false,"properties":{"ahead":{"type":"integer","minimum":1,"maximum":365,"default":90},
     "same_doctor":{"type":"boolean","default":true}}}',
  labels => '{"en":"Booking"}', form => 'department', action => 'write:bookings.sessions',
  fields => '[{"key":"ahead","labels":{"en":"Book ahead"},"unit":"days","help":{"en":"How far ahead the desk and the doctors may book."}},
    {"key":"same_doctor","labels":{"en":"Same doctor first"},"help":{"en":"A follow-up offers the doctor who saw the patient first."}}]');
select core.declare_setting('bookings.tell', 'bookings', 'department',
  '{"type":"object","additionalProperties":false,"properties":{"lines":{"type":"array","maxItems":200,"items":{"type":"object","additionalProperties":false,
     "required":["en"],"properties":{"service_id":{"type":"string","format":"uuid"},"en":{"type":"string","minLength":1,"maxLength":200},
     "ar":{"type":"string","maxLength":200}}}}}}',
  labels => '{"en":"Tell the patient when booked"}', form => 'department', action => 'write:bookings.sessions',
  fields => '[{"key":"lines","labels":{"en":"Tell the patient when booked"},"help":{"en":"Said on the booking card and the calls list. A line with no service is for a visit here."}},
    {"key":"lines.service_id","labels":{"en":"Service"}},{"key":"lines.en","labels":{"en":"English"}},{"key":"lines.ar","labels":{"en":"Arabic"}}]');

-- its screens: Booked today at a desk (with Tomorrow's calls and Missed), the Diary of a clinic or a bench
select core.declare_screen('bookings.today', 'bookings', 'desk', '{"en":"Booked today"}', 'read:bookings.diary');
select core.declare_screen('bookings.diary', 'bookings', 'any', '{"en":"Diary"}', 'read:bookings.diary');

-- its role: the booking desk, built on Reception (the desk books and marks here; Reception's own actions come with it)
select core.declare_role('00000000-0000-0000-0000-00000000cd01', 'bookings.desk', 'bookings', 'Booking desk', array[
  'read:bookings.diary', 'write:bookings.booking'], '{"en":"Booking desk"}', built_on => '00000000-0000-0000-0000-00000000c004');
select core.declare_role('00000000-0000-0000-0000-00000000cd02', 'bookings.bench', 'bookings', 'Books its rooms', array[
  'read:bookings.diary', 'write:bookings.booking'], '{"en":"Books its rooms"}', built_on => '00000000-0000-0000-0000-00000000c005');

-- its starter setups: a clinic, a bench and a desk that use the diary
select core.declare_setup('bookings.clinic', 'bookings', 'visits', '{"en":"Clinic with a diary"}', packs => array['bookings'],
  screens => '{"screens":["base.queue","bookings.diary"],"opens":"base.queue"}',
  settings => '{"bookings.rules":{"ahead":90,"same_doctor":true}}',
  help => '{"en":"Ticks bookings on a clinic: its sessions, the Diary, booked patients in the queue at their time or number."}');
select core.declare_setup('bookings.bench', 'bookings', 'bench', '{"en":"Bench with a diary"}', packs => array['bookings'],
  screens => '{"screens":["base.bench","bookings.diary"],"opens":"base.bench"}',
  settings => '{"bookings.rules":{"ahead":90,"same_doctor":false}}',
  help => '{"en":"Ticks bookings on a bench: its rooms'' sessions, Book on an order, To book."}');
select core.declare_setup('bookings.desk', 'bookings', 'desk', '{"en":"Desk that books"}', packs => array['bookings'],
  screens => '{"screens":["base.desk","bookings.today"],"opens":"base.desk"}',
  help => '{"en":"Ticks bookings on a desk: Book beside Send, Booked today, Tomorrow''s calls."}');

select core.lock_pack('bookings');
