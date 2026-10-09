-- The bookings pack's day (spec/openCare.md §5.1 rule 9, §5.7): its own patients, booked through the pack's door as the desk and the
-- doctor book them. General Practice today: Fathy booked by number and here (in the queue at his number), Samira booked and not yet
-- here (Booked today, Here); tomorrow: Laila (Tomorrow's calls) and Ihab, who said he will come (confirmed); in three months: Samira's
-- follow-up, booked by Dr. Ali. The ECG room: Nevine's echo, ordered by General Practice this morning, to book; Karima's echo booked in
-- three days. Today's bookings are made only while a session of today is still open (a demo loaded late keeps the rest). Times
-- relative to the load; ids in the pack's namespace; a reload erases these patients first (their bookings go with them).

select demo.layer('bookings');

-- book through the door as a user, in a department (the desk for the clinic, or the clinic itself): the session's next place on a day
-- (its next number, or its first free time); none when the session holds no more that day
create or replace function demo.book(p_user uuid, p_from uuid, p_to uuid, p_session uuid, p_day date, p_args jsonb default '{}') returns jsonb language plpgsql as $$
declare f jsonb; s jsonb; t jsonb;
begin
  perform demo.as(p_user);
  f := public.pack_op(jsonb_build_object('op', 'bookings.free', 'department_id', p_from, 'args', jsonb_build_object('department_id', p_to, 'from', p_day, 'days', 1)));
  select x into s from jsonb_array_elements(f -> 'sessions') x where x ->> 'session_id' = p_session::text and (x ->> 'left')::int > 0;
  if s is null then return null; end if;
  if s ->> 'how' = 'time' then
    select x into t from jsonb_array_elements(s -> 'times') x where not (x ->> 'taken')::boolean limit 1;
    if t is null then return null; end if;
  end if;
  return public.pack_op(jsonb_build_object('op', 'bookings.book', 'department_id', p_from, 'args', jsonb_build_object('department_id', p_to,
    'session_id', p_session, 'day', p_day, 'patient_id', current_setting('demo.patient')::uuid) || case when t is null then '{}'::jsonb else jsonb_build_object('at', t ->> 'at') end || p_args));
end $$;

do $$
declare gp uuid := demo.base('gp'); desk uuid := demo.base('desk'); rec uuid := demo.base('reception'); ecg uuid := demo.id('bookings', 'ecg room');
        morning uuid := demo.id('bookings', 'session:gp morning'); evening uuid := demo.id('bookings', 'session:gp evening');
        today date := (demo.now() at time zone 'Africa/Cairo')::date; b jsonb; v uuid; o uuid;
begin
  -- Fathy: booked this morning by phone, now here: the desk checks him in and marks the booking here (he goes in at his number; loaded
  -- after the day's sessions he is a walk-in)
  perform demo.patient(demo.id('bookings', 'patient:fathy'), array['Fathy'], 'Abdelaziz', 'male', demo.born(66, 30), '+201097723410');
  b := coalesce(demo.book(rec, desk, gp, morning, today, '{"note":"re-visit"}'), demo.book(rec, desk, gp, evening, today, '{"note":"re-visit"}'));
  v := demo.arrive('follow-up, booked', 6);
  if b is not null then
    perform demo.as(rec);
    perform public.pack_op(jsonb_build_object('op', 'bookings.here', 'department_id', desk, 'args', jsonb_build_object('booking_id', b ->> 'id', 'visit_id', v)));
  end if;

  -- Samira: booked for today, not here yet (Booked today: Here)
  perform demo.patient(demo.id('bookings', 'patient:samira'), array['Samira'], 'Fawzy', 'female', demo.born(58, 200), '+201004551290');
  perform coalesce(demo.book(rec, desk, gp, morning, today, '{"note":"re-visit, brings her HbA1c"}'), demo.book(rec, desk, gp, evening, today, '{"note":"re-visit, brings her HbA1c"}'));
  -- and her follow-up in three months, booked by the doctor at the end of a visit (the morning, by number)
  perform demo.book(demo.base('doctor'), gp, gp, morning, today + 84, '{"note":"re-visit"}');

  -- tomorrow: Laila to call; Ihab already said he will come
  perform demo.patient(demo.id('bookings', 'patient:laila'), array['Laila'], 'Sherif', 'female', demo.born(29, 75), '+201558702213');
  perform demo.book(rec, desk, gp, morning, today + 1, '{"note":"new"}');
  perform demo.patient(demo.id('bookings', 'patient:ihab'), array['Ihab'], 'Kamal', 'male', demo.born(57, 140), '+201112049981');
  b := demo.book(rec, desk, gp, morning, today + 1, '{}');
  if b is not null then
    perform demo.as(rec);
    perform public.pack_op(jsonb_build_object('op', 'bookings.call', 'department_id', desk, 'args', jsonb_build_object('booking_id', b ->> 'id', 'outcome', 'confirmed')));
  end if;

  -- Nevine: an echo ordered by General Practice this morning, still to book (the ECG room's To book)
  perform demo.patient(demo.id('bookings', 'patient:nevine'), array['Nevine'], 'Hosny', 'female', demo.born(44, 12), '+201223100457');
  v := demo.arrive('breathless on stairs', 150);
  perform demo.consult(v, 135, jsonb_build_array(
    demo.gp('note', v, 130, demo.note('assessment', 'Breathless on two flights of stairs for a month; a soft systolic murmur. Echo to look at the valves.')),
    demo.e('order', gp, v, demo.ago(128), jsonb_build_object('service', jsonb_build_object('id', demo.id('bookings', 'service:echo'), 'code', 'echo', 'name', 'Echo'),
      'department_id', ecg, 'priority', 'routine', 'status', 'active', 'question', 'Murmur: the valves?'), demo.id('bookings', 'order:nevine echo'))), 120);

  -- Karima: an echo ordered this morning and booked in three days at the ECG room (by its technician)
  perform demo.patient(demo.id('bookings', 'patient:karima'), array['Karima'], 'Selim', 'female', demo.born(55, 300), '+201275500123');
  v := demo.arrive('palpitations', 200);
  perform demo.consult(v, 190, jsonb_build_array(
    demo.e('order', gp, v, demo.ago(185), jsonb_build_object('service', jsonb_build_object('id', demo.id('bookings', 'service:echo'), 'code', 'echo', 'name', 'Echo'),
      'department_id', ecg, 'priority', 'routine', 'status', 'active', 'question', 'Palpitations: structure and function?'), demo.id('bookings', 'order:karima echo'))), 180);
  perform demo.book(demo.id('bookings', 'ecg tech'), ecg, ecg, demo.id('bookings', 'session:echo'), today + 3,
    jsonb_build_object('order_item', demo.id('bookings', 'order:karima echo'), 'patient_id', demo.id('bookings', 'patient:karima')));
end $$;
