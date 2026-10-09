-- The bookings pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; General Practice keeps a diary (a
-- morning by number, every day, and an evening by time with Dr. Ali, Saturday to Thursday) and the Front desk books for it, through the
-- pack's small setups; an ECG room, a bench of its own with a diary for echoes (by time), which the desk books too; what to tell the
-- patient when booked; the desk's Booked today and the clinic's and room's Diary on their lines (the setups'); a demo person for each role the pack
-- declares. Ids in the pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day
-- is supabase/demo/bookings.sql.

select demo.layer('bookings');

select demo.pack_on('bookings');
select demo.serve(demo.base('gp'), 'bookings.clinic');
select demo.serve(demo.base('desk'), 'bookings.desk');

-- the ECG room: a bench (ECG now, echoes and Holters booked), served by the desk and working for every department
select demo.setup(demo.id('bookings', 'ecg room'), 'bookings.bench', 'ECG room', 7);
select demo.setting('service', demo.id('bookings', 'ecg room'), demo.id('bookings', 'service:ecg'), '{"code":"ecg","name":"ECG","answer":"result"}');
select demo.setting('service', demo.id('bookings', 'ecg room'), demo.id('bookings', 'service:echo'), '{"code":"echo","name":"Echo","answer":"result"}');
select demo.setting('service', demo.id('bookings', 'ecg room'), demo.id('bookings', 'service:holter'), '{"code":"holter","name":"Holter (24 h)","answer":"result"}');

-- the department settings, each written once through the door as the owner would in Settings (a reload leaves what staff changed
-- since): the ECG room works for every department; the sessions (General Practice's morning by number, every day, anyone, 24 places, two
-- kept for walk-ins and two overbooked; its evening by time every 15 minutes with Dr. Ali; the ECG room's echoes every 30 minutes);
-- what to tell the patient when booked
create or replace function pg_temp.once(p_key text, p_department uuid, p_data jsonb) returns void language plpgsql as $$
begin
  if core.setting_at(demo.base('clinic'), p_key, p_department) is not null then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_build_object('key', p_key, 'owner_id', p_department, 'data', p_data));
end $$;
do $$
begin
  perform pg_temp.once('department.works_for', demo.id('bookings', 'ecg room'), '{"all":true}');
  perform pg_temp.once('bookings.sessions', demo.base('gp'), jsonb_build_object('sessions', jsonb_build_array(
  jsonb_build_object('id', demo.id('bookings', 'session:gp morning'), 'name', 'Morning', 'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb,
    'from', '08:00', 'to', '14:00', 'how', 'number', 'places', 24, 'overbook', 2, 'walk_ins', 2),
  jsonb_build_object('id', demo.id('bookings', 'session:gp evening'), 'name', 'Evening', 'days', '["sat","sun","mon","tue","wed","thu"]'::jsonb,
    'from', '14:00', 'to', '22:00', 'how', 'time', 'every', 15, 'doctor_id', demo.base('doctor'), 'overbook', 0, 'walk_ins', 0)),
  'leave', '[]'::jsonb));
  perform pg_temp.once('bookings.sessions', demo.id('bookings', 'ecg room'), jsonb_build_object('sessions', jsonb_build_array(
  jsonb_build_object('id', demo.id('bookings', 'session:echo'), 'name', 'Echo', 'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb,
    'from', '08:00', 'to', '22:00', 'how', 'time', 'every', 30, 'overbook', 0, 'walk_ins', 0,
    'services', jsonb_build_array(demo.id('bookings', 'service:echo'), demo.id('bookings', 'service:holter')))),
  'leave', '[]'::jsonb));
  perform pg_temp.once('bookings.tell', demo.base('gp'), jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('en', 'Bring your medicines and any results.', 'ar', 'أحضر علب الأدوية وأي تحاليل.'))));
  perform pg_temp.once('bookings.tell', demo.id('bookings', 'ecg room'), jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('service_id', demo.id('bookings', 'service:echo'), 'en', 'No fasting. Wear a top that opens at the front.', 'ar', 'لا صيام. ارتدِ ملابس تُفتح من الأمام.'),
  jsonb_build_object('service_id', demo.id('bookings', 'service:holter'), 'en', 'Shower before you come; no shower for 24 hours after.', 'ar', 'استحم قبل الحضور؛ لا استحمام لمدة ٢٤ ساعة بعدها.'))));
end $$;

-- its roles' people: the desk's reception books (the Booking desk, built on Reception); the ECG room's technician books its room
select demo.grant(demo.base('reception'), '00000000-0000-0000-0000-00000000cd01', demo.base('desk'));
select demo.person(demo.id('bookings', 'ecg tech'), 'ecg@demo.com', 'Tamer Wahba');
select demo.grant(demo.id('bookings', 'ecg tech'), '00000000-0000-0000-0000-00000000cd02', demo.id('bookings', 'ecg room'));
