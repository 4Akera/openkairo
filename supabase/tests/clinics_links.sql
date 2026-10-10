-- The clinics' loose ends (spec/openCare.md §5.8, 2026-10-10): the queue words that read a pack's own data once a list (the core's (l)
-- of §5.7) — each read a list's load makes, as the doctor of a department that ticks the pack — and the booking links (the demo's
-- clinics keep a diary; a family doctor books a member of the file in Family medicine through bookings' door). On the demo.
-- include: supabase/demo/load.sql
select core.drain(100000) as drained;

\echo '── the clinics that book keep a diary, with the Diary on their line'
select t.ok(core.department_uses(demo.base('clinic'), d, 'bookings') and jsonb_array_length(core.setting_at(demo.base('clinic'), 'bookings.sessions', d) -> 'sessions') = 1
    and core.setting_at(demo.base('clinic'), 'department.screens', d) -> 'screens' ? 'bookings.diary', n || ' ticks bookings, one session, the Diary on its line')
  from (values ('Family medicine', demo.id('familycare', 'department')), ('the Vaccination room', demo.id('vaccines', 'room')),
    ('the Pre-op clinic', demo.id('anaesthesia', 'preop'))) x(n, d);
select t.ok(core.setting_at(demo.base('clinic'), 'department.screens', demo.id('vaccines', 'room')) -> 'screens' ->> 0 = 'vaccines.room', 'the room still opens on its own list');

\echo '── the queue words'' reads, once a list, as Dr. Hazem Ouda in Family medicine (his queue''s visits, the values, the doses, the registers)'
select demo.as(demo.id('familycare', 'doctor'));
create temp table fm_q as select x.r ->> 'item' item, x.r ->> 'patient_id' patient from jsonb_array_elements(public.read(jsonb_build_object('shape', 'table', 'table', 'base.presence',
  'department_id', demo.id('familycare', 'department'), 'where', jsonb_build_object('department_id', demo.id('familycare', 'department')), 'entries', false)) -> 'rows') x(r);
select t.ok((select count(*) from fm_q) >= 3, (select count(*) from fm_q) || ' visits on his queue');
select t.ok((select count(*) from jsonb_object_keys(r -> 'patients')) = (select count(distinct patient) from fm_q)
    and (select bool_and(r -> 'patients' -> p ->> 'birth_date' is not null and r -> 'patients' -> p ->> 'gender' is not null) from fm_q x(i, p)),
  'the presence read by the visits names each patient with the birth date and sex (the vaccines'' and the checks'' words)')
  from (select public.read(jsonb_build_object('shape', 'table', 'table', 'base.presence', 'department_id', demo.id('familycare', 'department'),
    'where', jsonb_build_object('item', (select jsonb_agg(item) from fm_q)), 'entries', false)) r) y;
select t.ok(jsonb_array_length(public.read(jsonb_build_object('shape', 'table', 'table', 'base.values', 'department_id', demo.id('familycare', 'department'),
  'where', jsonb_build_object('patient_id', (select jsonb_agg(distinct patient) from fm_q), 'code', jsonb_build_array('loinc:4548-4', 'loinc:8480-6')), 'entries', false)) -> 'rows') >= 1,
  'the values by the checks'' codes, for the queue''s patients only (Zeinab''s HbA1c, a BP)');
select t.ok(public.read(jsonb_build_object('shape', 'table', 'table', 'vaccines.doses', 'department_id', demo.id('familycare', 'department'),
  'where', jsonb_build_object('patient_id', (select jsonb_agg(distinct patient) from fm_q)), 'entries', false)) ? 'rows', 'the doses of the queue''s patients (Family medicine ticks vaccines)');
select t.ok(public.read(jsonb_build_object('shape', 'table', 'table', 'chroniccare.checks', 'department_id', demo.id('familycare', 'department'),
  'where', jsonb_build_object('patient_id', (select jsonb_agg(distinct patient) from fm_q)), 'entries', false)) ? 'rows'
  and public.read(jsonb_build_object('shape', 'table', 'table', 'base.lists', 'department_id', demo.id('familycare', 'department'),
  'where', jsonb_build_object('list', 'problems', 'patient_id', (select jsonb_agg(distinct patient) from fm_q)), 'entries', false)) ? 'rows',
  'the registers'' reads: the problem lists and the pack''s coded checks (Family medicine ticks chronic care)');
reset role;

\echo '── ObGyn''s word reads its own table (no small store): the women on its queue with their identities'
select demo.as(demo.id('obgyn', 'nermeen'));
select t.ok(jsonb_array_length(r -> 'rows') >= 1 and (select bool_and(r -> 'patients' ? (x ->> 'patient_id')) from jsonb_array_elements(r -> 'rows') x),
  jsonb_array_length(r -> 'rows') || ' marks, each woman named with her birth date (her age for the rows by age)')
  from (select public.read(jsonb_build_object('shape', 'table', 'table', 'obgyn.marks', 'department_id', demo.id('obgyn', 'clinic'), 'where', jsonb_build_object('patient_id',
    (select jsonb_agg(x ->> 'patient_id') from jsonb_array_elements(public.read(jsonb_build_object('shape', 'table', 'table', 'base.presence', 'department_id', demo.id('obgyn', 'clinic'),
      'where', jsonb_build_object('department_id', demo.id('obgyn', 'clinic')), 'entries', false)) -> 'rows') x)), 'entries', false)) r) y;
reset role;

\echo '── Book on a member of the file: Dr. Hazem books Ayman in Family medicine through bookings'' door'
select demo.as(demo.id('familycare', 'doctor'));
create temp table fm_free as select public.pack_op(jsonb_build_object('op', 'bookings.free', 'department_id', demo.id('familycare', 'department'),
  'args', jsonb_build_object('department_id', demo.id('familycare', 'department'), 'from', (demo.now() at time zone 'Africa/Cairo')::date + 7, 'days', 3))) f;
select t.ok(jsonb_array_length(f -> 'sessions') = 3, 'three days of the Morning to choose from') from fm_free;
select t.ok(b ->> 'number' is not null, 'Ayman booked, No. ' || coalesce(b ->> 'number', '?'))
  from fm_free, lateral (select public.pack_op(jsonb_build_object('op', 'bookings.book', 'department_id', demo.id('familycare', 'department'),
    'args', jsonb_build_object('department_id', demo.id('familycare', 'department'), 'patient_id', demo.id('familycare', 'patient:ayman'),
      'session_id', f -> 'sessions' -> 0 ->> 'session_id', 'day', f -> 'sessions' -> 0 ->> 'day', 'note', 'BP recheck'))) b) x;
reset role;
