-- the bookings pack (spec §5.7): sessions by time or by number, booking from the clinic itself or a desk that checks in for it, the
-- next number, a free time, full and taken, overbooking and places kept for walk-ins, leave, book ahead; a bench's booking names its
-- order, booked once; moved, cancelled with a reason, here with the visit the desk opened, a call's answer (will cancel cancels);
-- missed worked out when read; the lists and the places on the queue and the bench; only ever added to; never a record entry; Erase
\set im   '00000000-0000-0000-0000-0000000000d1'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set psy  '00000000-0000-0000-0000-0000000000d5'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set tech '11111111-0000-0000-0000-0000000000b2'
\set rec  '11111111-0000-0000-0000-0000000000b4'
\set clerk '11111111-0000-0000-0000-0000000000b7'
\set sal  '11111111-0000-0000-0000-0000000000b8'
\set num  '00000000-0000-0000-0000-00000000aa01'
\set tim  '00000000-0000-0000-0000-00000000aa02'
\set lb   '00000000-0000-0000-0000-00000000aa03'
select t.fixture();
create function pg_temp.op(p_op text, p_dept uuid, p_args jsonb default '{}') returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', p_op, 'department_id', p_dept, 'args', p_args))
$$;
create function pg_temp.today() returns date language sql stable as $$ select (now() at time zone 'Africa/Cairo')::date $$;
create function pg_temp.at(p_day date, p_time text) returns timestamptz language sql stable as $$ select (p_day + p_time::time) at time zone 'Africa/Cairo' $$;
grant execute on all functions in schema pg_temp to public;

\echo '── declared: the pack, its block, actions (two everyday), roles built on Reception and the lab technician, ops, settings, screens, setups'
select t.ok((select role_block from core.layers where key = 'bookings') = 'cd', 'bookings'' role ids in its block, cd');
select t.ok((select array_agg(key || ':' || everyday order by key) from core.actions where layer = 'bookings')
  = array['read:bookings.diary:true', 'write:bookings.booking:true', 'write:bookings.sessions:false'], 'its three actions, reading and booking everyday');
select t.ok((select array_agg(r.key || ':' || r.built_on order by r.key) from core.roles r where r.layer = 'bookings')
  = array['bookings.bench:00000000-0000-0000-0000-00000000c005', 'bookings.desk:00000000-0000-0000-0000-00000000c004'], 'the booking desk on Reception, the bench''s on the lab technician');
select t.ok((select jsonb_object_agg(key, patients) from core.ops where layer = 'bookings')
  = '{"bookings.free":false,"bookings.list":true,"bookings.book":true,"bookings.cancel":true,"bookings.here":true,"bookings.call":true,"bookings.places":false}',
  'every operation returning patient ids says so');
select t.ok((select array_agg(key order by key) from core.setting_keys where layer = 'bookings') = array['bookings.rules', 'bookings.sessions', 'bookings.tell'], 'its three settings');
select t.ok((select array_agg(key || ':' || work order by key) from core.screens where layer = 'bookings') = array['bookings.diary:any', 'bookings.today:desk'], 'Booked today at a desk, the Diary anywhere');
select t.ok((select array_agg(key || ':' || work order by key) from core.setups where layer = 'bookings') = array['bookings.bench:bench', 'bookings.clinic:visits', 'bookings.desk:desk'],
  'a clinic, a bench and a desk that use the diary');
select t.ok((select jsonb_object_agg(key, coalesce(to_jsonb(clear), 'null')) from core.stores where layer = 'bookings') = '{"bookings.bookings":null,"bookings.events":null}',
  'Erase: a patient''s bookings and what became of them go');
select t.ok(not exists (select 1 from core.types where layer = 'bookings'), 'no record type: a booking is never a record entry');

\echo '── on: Internal Medicine and the Lab keep a diary, the desk books; Psychiatry does not'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","bookings"]}}') ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'bookings.clinic', 'department_id', :'im', 'apply', true)) ->> 'setup' as im_books;
select public.setup(jsonb_build_object('setup', 'bookings.bench', 'department_id', :'lab', 'apply', true)) ->> 'setup' as lab_books;
select public.setup(jsonb_build_object('setup', 'bookings.desk', 'department_id', :'desk', 'apply', true)) ->> 'setup' as desk_books;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b4', 'name', 'Reception', 'login_id', :'rec', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cd01', 'department_id', :'desk')))) ->> 'id' as desk_role;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b2', 'name', 'Lab Tech', 'login_id', :'tech', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cd02', 'department_id', :'lab')))) ->> 'id' as bench_role;
-- the sessions: by number all day every day (4 places, 1 kept for walk-ins, 1 overbooked); by time every 30 minutes tomorrow on
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'bookings.sessions', 'owner_id', %L, 'data', jsonb_build_object('sessions', jsonb_build_array(
  jsonb_build_object('id', %L, 'name', 'Bad', 'days', '["sun"]'::jsonb, 'from', '13:00', 'to', '09:00', 'how', 'number', 'places', 4)))))$q$, :'im', :'num'), 'bad_hours');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'bookings.sessions', 'owner_id', %L, 'data', jsonb_build_object('sessions', jsonb_build_array(
  jsonb_build_object('id', %L, 'name', 'Bad', 'days', '["sun"]'::jsonb, 'from', '09:00', 'to', '13:00', 'how', 'time')))))$q$, :'im', :'num'), 'every_missing');
select t.ok(public.write_setting(jsonb_build_object('key', 'bookings.sessions', 'owner_id', :'im', 'data', jsonb_build_object('sessions', jsonb_build_array(
  jsonb_build_object('id', :'num', 'name', 'All day', 'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb, 'from', '00:00', 'to', '23:59', 'how', 'number', 'places', 4,
    'walk_ins', 1, 'overbook', 1),
  jsonb_build_object('id', :'tim', 'name', 'Clinic', 'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb, 'from', '09:00', 'to', '11:00', 'how', 'time', 'every', 30,
    'doctor_id', '00000000-0000-0000-0000-0000000000b1')), 'leave', '[]'::jsonb))) ->> 'key' = 'bookings.sessions', 'Internal Medicine''s two sessions');
select t.ok(public.write_setting(jsonb_build_object('key', 'bookings.sessions', 'owner_id', :'lab', 'data', jsonb_build_object('sessions', jsonb_build_array(
  jsonb_build_object('id', :'lb', 'name', 'Fasting bloods', 'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb, 'from', '07:00', 'to', '10:00', 'how', 'number', 'places', 10)))))
  ->> 'key' = 'bookings.sessions', 'the Lab''s fasting bloods by number');
set role authenticated;

\echo '── free places: from the clinic itself or a desk that checks in for it; never a department without a diary'
select t.as(:'rec');
select t.ok(jsonb_array_length(f -> 'sessions') >= 2 and (select (x ->> 'left')::int from jsonb_array_elements(f -> 'sessions') x where x ->> 'session_id' = :'num' and (x ->> 'day')::date = pg_temp.today() + 1) = 4
  and (select x ->> 'next_number' from jsonb_array_elements(f -> 'sessions') x where x ->> 'session_id' = :'num' and (x ->> 'day')::date = pg_temp.today() + 1) = '1'
  and (select jsonb_array_length(x -> 'times') from jsonb_array_elements(f -> 'sessions') x where x ->> 'session_id' = :'tim' and (x ->> 'day')::date = pg_temp.today() + 1) = 4,
  'tomorrow: 4 bookable by number (4 less 1 kept, 1 overbooked), next No. 1; 4 times by time')
  from pg_temp.op('bookings.free', :'desk', jsonb_build_object('department_id', :'im', 'from', pg_temp.today() + 1, 'days', 1)) f;
select t.refuses(format($q$select pg_temp.op('bookings.free', %L, jsonb_build_object('department_id', %L))$q$, :'desk', :'psy'), 'no_diary');

\echo '── by number: the next number, until the session is full (places less those kept for walk-ins, plus the overbooking)'
select t.ok(b ->> 'number' = '1' and (b ->> 'starts_at')::timestamptz = pg_temp.at(pg_temp.today() + 1, '00:00'), 'No. 1, at the session''s start')
  from pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'num', 'day', pg_temp.today() + 1, 'note', 're-visit')) b;
select t.ok(pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'num', 'day', pg_temp.today() + 1)) ->> 'number' = '2', 'No. 2');
select t.ok(pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'num', 'day', pg_temp.today() + 1)) ->> 'number' = '3', 'No. 3');
select t.ok(pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'num', 'day', pg_temp.today() + 1)) ->> 'number' = '4', 'No. 4, the overbooked one');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L))$q$,
  :'desk', :'im', :'pt', :'num', pg_temp.today() + 1), 'full');

\echo '── by time: a time of the session, free; a taken time only into the overbooking (none here)'
select t.ok(pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'tim', 'day', pg_temp.today() + 1,
  'at', pg_temp.at(pg_temp.today() + 1, '09:30'))) ->> 'number' is null, 'booked at 09:30');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L, 'at', %L))$q$,
  :'desk', :'im', :'pt', :'tim', pg_temp.today() + 1, pg_temp.at(pg_temp.today() + 1, '09:30')), 'taken');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L, 'at', %L))$q$,
  :'desk', :'im', :'pt', :'tim', pg_temp.today() + 1, pg_temp.at(pg_temp.today() + 1, '09:40')), 'not_a_time');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L, 'at', %L))$q$,
  :'desk', :'im', :'pt', :'tim', pg_temp.today() - 1, pg_temp.at(pg_temp.today() - 1, '09:30')), 'in_past');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L))$q$,
  :'desk', :'im', :'pt', :'num', pg_temp.today() + 91), 'too_far');

\echo '── who books: the clinic''s doctor (everyday) in the clinic; never a desk for a department it does not check in for; nor the clerk without the role'
select t.as(:'dr');
select t.ok(pg_temp.op('bookings.book', :'im', jsonb_build_object('patient_id', :'pt', 'session_id', :'tim', 'day', pg_temp.today() + 2,
  'at', pg_temp.at(pg_temp.today() + 2, '10:00'))) ->> 'day' = (pg_temp.today() + 2)::text, 'Dr Ali books the follow-up from the clinic');
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.checks_in_for', 'owner_id', :'desk', 'data', jsonb_build_object('departments', jsonb_build_array(:'lab')))) ->> 'key' as narrowed;
select t.as(:'rec');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L))$q$,
  :'desk', :'im', :'pt', :'num', pg_temp.today() + 2), 'not_served');
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.checks_in_for', 'owner_id', :'desk', 'data', '{"all":true}'::jsonb)) ->> 'key' as widened;

\echo '── a bench''s booking names its order, open and sent there, booked once; moving keeps it once'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'),
  'department_id', :'lab', 'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-00000000ab01'))), 'a CBC sent to the Lab');
select t.as(:'tech');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('patient_id', %L, 'session_id', %L, 'day', %L))$q$, :'lab', :'pt', :'lb', pg_temp.today() + 1), 'order_missing');
select t.ok(pg_temp.op('bookings.book', :'lab', jsonb_build_object('patient_id', :'pt', 'session_id', :'lb', 'day', pg_temp.today() + 1,
  'order_item', '00000000-0000-0000-0000-00000000ab01')) ->> 'number' = '1', 'the technician books the CBC for tomorrow''s fasting bloods, No. 1');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('patient_id', %L, 'session_id', %L, 'day', %L, 'order_item', %L))$q$,
  :'lab', :'pt', :'lb', pg_temp.today() + 2, '00000000-0000-0000-0000-00000000ab01'), 'already_booked');
reset role;
select id as lab1 from bookings.bookings where order_item = '00000000-0000-0000-0000-00000000ab01' order by at limit 1 \gset
set role authenticated;
select t.ok(m ->> 'number' = '1' and (m ->> 'day')::date = pg_temp.today() + 2, 'moved to the day after: the old one cancelled ("moved"), the order booked once')
  from pg_temp.op('bookings.book', :'lab', jsonb_build_object('patient_id', :'pt', 'session_id', :'lb', 'day', pg_temp.today() + 2, 'order_item', '00000000-0000-0000-0000-00000000ab01',
    'moved_from', :'lab1')) m;
reset role;
select t.ok((select count(*) from bookings.bookings b where b.order_item = '00000000-0000-0000-0000-00000000ab01' and bookings.standing(b.organization_id, b.id)) = 1
  and exists (select 1 from bookings.events e where e.kind = 'cancelled' and e.reason = 'moved'), 'one standing booking for the order');
set role authenticated;
select t.ok(p -> 'orders' -> '00000000-0000-0000-0000-00000000ab01' ->> 'state' = 'booked', 'the bench''s places: the order booked (its mark, To book)')
  from pg_temp.op('bookings.places', :'lab', jsonb_build_object('orders', jsonb_build_array('00000000-0000-0000-0000-00000000ab01'))) p;

\echo '── a move keeps its order (the Diary names only the booking moved), never books another; a gone order is never booked; a started one came'
reset role;
select id as lab2 from bookings.bookings where order_item = '00000000-0000-0000-0000-00000000ab01' and bookings.standing(organization_id, id) \gset
set role authenticated;
select t.ok((m ->> 'day')::date = pg_temp.today() + 3, 'moved with the booking alone: it carries its order')
  from pg_temp.op('bookings.book', :'lab', jsonb_build_object('patient_id', :'pt', 'session_id', :'lb', 'day', pg_temp.today() + 3, 'moved_from', :'lab2')) m;
reset role;
select t.ok((select order_item from bookings.bookings where moved_from = :'lab2') = '00000000-0000-0000-0000-00000000ab01', 'the new booking names the order');
select id as lab3 from bookings.bookings where order_item = '00000000-0000-0000-0000-00000000ab01' and bookings.standing(organization_id, id) \gset
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'),
  'department_id', :'lab', 'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-00000000ab02'))), 'a second CBC sent to the Lab');
select t.as(:'tech');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('patient_id', %L, 'session_id', %L, 'day', %L, 'order_item', %L, 'moved_from', %L))$q$,
  :'lab', :'pt', :'lb', pg_temp.today() + 4, '00000000-0000-0000-0000-00000000ab02', :'lab3'), 'other_order');
select t.as(:'dr');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"typo","text":"wrong patient"}', null, null, null, null, t.latest('00000000-0000-0000-0000-00000000ab02'))),
  'the second CBC crossed out');
select t.as(:'tech');
select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('patient_id', %L, 'session_id', %L, 'day', %L, 'order_item', %L))$q$,
  :'lab', :'pt', :'lb', pg_temp.today() + 4, '00000000-0000-0000-0000-00000000ab02'), 'order_closed');
select t.landed(t.w(t.e('step', :'pt', :'lab', '{"status":"in-progress","step":"collected"}', null, null, '00000000-0000-0000-0000-00000000ab01', 'answers')),
  'the first CBC collected at the bench, with nobody pressing Here');
select t.ok(p -> 'orders' -> '00000000-0000-0000-0000-00000000ab01' ->> 'state' = 'here', 'its booking came: never missed')
  from pg_temp.op('bookings.places', :'lab', jsonb_build_object('orders', jsonb_build_array('00000000-0000-0000-0000-00000000ab01'))) p;
reset role;
select t.ok(max(x) < (current_date + time '09:00') at time zone 'Africa/Cairo', 'by number, the last place is before the session ends (48 places in two hours)')
  from bookings.times('00000000-0000-0000-0000-0000000000a1', '{"how":"number","from":"07:00","to":"09:00","places":48}'::jsonb, current_date) x;
set role authenticated;

\echo '── today: booked, here with the visit the desk opened (the base''s check-in first), in the queue at its number'
select t.as(:'rec');
select t.ok(pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'num', 'day', pg_temp.today())) ->> 'number' = '1',
  'booked for today, No. 1');
reset role;
select id as t1 from bookings.bookings where day = (now() at time zone 'Africa/Cairo')::date and department_id = :'im' and number = 1 \gset
select id as n2 from bookings.bookings where day = (now() at time zone 'Africa/Cairo')::date + 1 and department_id = :'im' and number = 2 \gset
select id as n3 from bookings.bookings where day = (now() at time zone 'Africa/Cairo')::date + 1 and department_id = :'im' and number = 3 \gset
set role authenticated;
select t.refuses(format($q$select pg_temp.op('bookings.here', %L, jsonb_build_object('booking_id', %L, 'visit_id', %L))$q$,
  :'desk', :'t1', '00000000-0000-0000-0000-00000000e101'), 'not_found');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e101', :'pt', :'desk', :'im'), 'checked in at the desk');
select t.ok(pg_temp.op('bookings.here', :'desk', jsonb_build_object('booking_id', :'t1', 'visit_id', '00000000-0000-0000-0000-00000000e101')) ->> 'id' is not null, 'here, with that visit');
select t.refuses(format($q$select pg_temp.op('bookings.here', %L, jsonb_build_object('booking_id', %L, 'visit_id', %L))$q$,
  :'desk', :'t1', '00000000-0000-0000-0000-00000000e101'), 'booking_closed');
select t.ok((p -> 'visits' -> '00000000-0000-0000-0000-00000000e101' ->> 'number') = '1', 'the queue''s place: the visit at No. 1')
  from pg_temp.op('bookings.places', :'desk', jsonb_build_object('visits', jsonb_build_array('00000000-0000-0000-0000-00000000e101'))) p;
select t.refuses(format($q$select pg_temp.op('bookings.here', %L, jsonb_build_object('booking_id', %L))$q$, :'desk', :'n2'), 'not_today');

select t.refuses(format($q$select pg_temp.op('bookings.book', %L, jsonb_build_object('department_id', %L, 'patient_id', %L, 'session_id', %L, 'day', %L, 'moved_from', %L))$q$,
  :'desk', :'im', :'pt', :'num', pg_temp.today() + 2, :'t1'), 'booking_closed');
select t.as(:'dr');
select t.ok(jsonb_array_length(l -> 'bookings') >= 1, 'the list with no departments named reads the department''s own')
  from pg_temp.op('bookings.list', :'im', jsonb_build_object('from', pg_temp.today(), 'to', pg_temp.today() + 2)) l;
select t.as(:'rec');

\echo '── calls and cancelling: a call''s answer; will cancel cancels (patient asked); a reason from the list'
select t.ok(pg_temp.op('bookings.call', :'desk', jsonb_build_object('booking_id', :'n2', 'outcome', 'will_cancel')) ->> 'id' is not null, 'No. 2 will cancel');
select t.ok(r ->> 'state' = 'cancelled' and r -> 'cancelled' ->> 'reason' = 'patient asked' and r -> 'call' ->> 'outcome' = 'will_cancel', 'cancelled, the patient asked')
  from jsonb_array_elements(pg_temp.op('bookings.list', :'desk', jsonb_build_object('departments', jsonb_build_array(:'im'), 'from', pg_temp.today() + 1)) -> 'bookings') r
 where r ->> 'number' = '2';
select t.refuses(format($q$select pg_temp.op('bookings.cancel', %L, jsonb_build_object('booking_id', %L, 'reason', 'because'))$q$, :'desk', :'n3'), 'reason_missing');
select t.ok(pg_temp.op('bookings.cancel', :'desk', jsonb_build_object('booking_id', :'n3', 'reason', 'doctor away')) ->> 'id' is not null, 'No. 3 cancelled, the doctor away');
select t.ok(pg_temp.op('bookings.book', :'desk', jsonb_build_object('department_id', :'im', 'patient_id', :'pt', 'session_id', :'num', 'day', pg_temp.today() + 1)) ->> 'number' = '5',
  'a cancelled place frees room; numbers are never given twice (No. 5)');

\echo '── reading: the patient''s next bookings (the chart''s Next visit), every department''s; the list read-logged'
select t.as(:'dr');
select t.ok(jsonb_array_length(l -> 'bookings') >= 3 and l -> 'patient_ids' = jsonb_build_array(:'pt'), 'Ahmed''s bookings from today on')
  from pg_temp.op('bookings.list', :'im', jsonb_build_object('patient_id', :'pt')) l;
reset role;
select t.ok(exists (select 1 from core.read_log r where r.patient_id = :'pt' and r.user_id = '00000000-0000-0000-0000-0000000000b1'), 'read-logged');

\echo '── only ever added to; never a record entry; Erase takes them'
select t.ok(t.try('update bookings.bookings set note = ''x''') like 'P0001 bookings are only ever added to%', 'a booking never changes');
select t.ok(t.try('delete from bookings.events') like 'P0001 events are only ever added to%', 'nor what became of it');
select t.ok(not exists (select 1 from core.entries e where e.type like 'bookings.%'), 'no record entry of the pack''s');
select t.as(:'ow');
select public.erase_patient(jsonb_build_object('patient_id', :'pt', 'reason', 'test')) is not null as erased;
reset role;
select t.ok(not exists (select 1 from bookings.bookings where patient_id = :'pt') and not exists (select 1 from bookings.events where patient_id = :'pt'), 'erased with the patient');
