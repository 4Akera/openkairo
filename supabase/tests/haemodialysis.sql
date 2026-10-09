-- Dialysis (spec §5.6): the pack and its role block; the Dialysis unit from its starter setup (eight chairs, an HCV and an HBV chair
-- named in the unit's setting, outpatient stays, the board and the Schedule tab); the unit's setting and its check (shifts in order);
-- the unit's nurse and doctor, built on the base's Nurse and Doctor, who change the schedule (the base's Nurse there does not); the
-- standing schedule as the pack's own table, written through its door: a slot a patient, a chair a pattern and shift (a standing slot
-- or a session moved there holds it), a patient once a day, a session moved one-off (or an extra one), undone only into a free chair,
-- a slot ended (its sessions moved off later days with it; one never used blocks nothing); a shift in use stays in the unit's setting;
-- the week the Schedule tab reads (the Friday after it holds the sessions moved there); who is due now, from the schedule, with each
-- patient's isolation; the session, the pack's own type on the base's procedure: started into a chair with the base's admitted in one
-- set, one a stay and one a patient a day, missed in no stay, ended with the base's discharged and corrected after it; the board's read
-- (the session, the last blood pressure, the isolation; a crossed-out one passed over), read-logged; the session as a Procedure in its Encounter; Erase removes a patient's rows; off, the
-- doors are shut.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set desk  '00000000-0000-0000-0000-0000000000d4'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set hd    '00000000-0000-0000-0000-0000000000d8'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set p2    '00000000-0000-0000-0000-0000000000f2'
\set p3    '00000000-0000-0000-0000-0000000000f3'
\set p4    '00000000-0000-0000-0000-0000000000f4'
\set s1    '00000000-0000-0000-0000-00000000e801'
\set s2    '00000000-0000-0000-0000-00000000e802'
\set h1    '00000000-0000-0000-0000-00000000e811'
\set h2    '00000000-0000-0000-0000-00000000e812'
\set h3    '00000000-0000-0000-0000-00000000e813'
\set h4    '00000000-0000-0000-0000-00000000e814'
\set v1    '00000000-0000-0000-0000-00000000e821'
\set v2    '00000000-0000-0000-0000-00000000e822'
\set m1    '00000000-0000-0000-0000-00000000e831'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set rc    '11111111-0000-0000-0000-0000000000b4'
\set hn    '11111111-0000-0000-0000-0000000000c1'
\set hdr   '11111111-0000-0000-0000-0000000000c2'
-- the suite's today is the ops' (the clinic's day in Cairo); a slot's days for today: none on a Friday (dow 5)
select (now() at time zone 'Africa/Cairo')::date as today, extract(dow from (now() at time zone 'Africa/Cairo')::date)::int as dow \gset
select case when :dow in (0, 2, 4) then 'sun_tue_thu' else 'sat_mon_wed' end as days, case when :dow in (0, 2, 4) then 'sat_mon_wed' else 'sun_tue_thu' end as other \gset

select t.fixture();
select t.as(:'rc');
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p2', 'given', jsonb_build_array('Mona'), 'family', 'Adly',
  'gender', 'female', 'birth_date', '1990-02-11'))) is not null as p2;
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p3', 'given', jsonb_build_array('Karim'), 'family', 'Said',
  'gender', 'male', 'birth_date', '1975-06-30'))) is not null as p3;
select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p4', 'given', jsonb_build_array('Hoda'), 'family', 'Samir',
  'gender', 'female', 'birth_date', '1968-04-02'))) is not null as p4;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["haemodialysis"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'haemodialysis.unit', 'department_id', :'hd', 'name', 'Dialysis unit', 'apply', true)) is not null as made;
-- shifts that make shift 1 on all day (shift 2 starts at 23:59)
select public.write_setting(jsonb_build_object('key', 'haemodialysis.unit', 'owner_id', :'hd', 'data',
  '{"shifts":["00:00","23:59"],"hours":4,"hbv_chairs":["HBV chair 8"],"hcv_chairs":["HCV chair 7"]}'::jsonb)) ->> 'key' as unit;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c1', 'name', 'Rasha Mounir', 'login_id', :'hn', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000d401', 'department_id', :'hd')))) ->> 'id' as rasha;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c2', 'name', 'Dr Walid', 'login_id', :'hdr', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000d402', 'department_id', :'hd')))) ->> 'id' as walid;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'hd')))) ->> 'id' as ali;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b3', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'hd')))) ->> 'id' as sara;
select core.setup_id(:'hd', 'place', 'chair_1') as c1, core.setup_id(:'hd', 'place', 'chair_2') as c2,
  core.setup_id(:'hd', 'place', 'hcv_chair_7') as c7, core.setup_id(:'hd', 'place', 'hbv_chair_8') as c8 \gset
-- (aa)'s days: the first day ahead off today's pattern, and the next day on it
select (min(d) filter (where not haemodialysis.on_day(:'days', d::date)))::date as nd, (min(d) filter (where haemodialysis.on_day(:'days', d::date)))::date as pd
  from generate_series(:'today'::date + 1, :'today'::date + 7, interval '1 day') d \gset
-- the pattern day after pd, and the first pattern day past a week from today (the slot ends a week on)
select (min(d) filter (where haemodialysis.on_day(:'days', d::date)))::date as pd2 from generate_series(:'pd'::date + 1, :'pd'::date + 7, interval '1 day') d \gset
select (min(d) filter (where haemodialysis.on_day(:'days', d::date)))::date as pl from generate_series(:'today'::date + 8, :'today'::date + 14, interval '1 day') d \gset

\echo '── (a) the pack: Dialysis, its role ids in block d4, nothing of its own callable'
select t.ok(l.role_block = 'd4' and l.is_pack and l.labels ->> 'en' = 'Dialysis', 'haemodialysis reads "Dialysis", its role ids in block d4') from core.layers l where l.key = 'haemodialysis';
select t.ok(not has_schema_privilege('authenticated', 'haemodialysis', 'USAGE'), 'the API cannot reach its schema');

\echo '── (b) the session: the pack''s own type on the base''s procedure, in the record, its line and its check'
select t.ok(y.layer = 'haemodialysis' and y.base_type = 'procedure' and y.resources = array['Procedure'] and y.in_record and not y.may_be_private
  and y.line = 'haemodialysis.session_line(jsonb)'::regprocedure and y.checks = array['haemodialysis.session_check(jsonb,jsonb)'::regprocedure],
  'haemodialysis.session v1: a procedure, a Procedure, in the record, never private; its line and its check') from core.types y where y.key = 'haemodialysis.session' and y.version = 1;
select t.ok(haemodialysis.session_line('{"data":{"status":"completed","haemodialysis":{"on":"2026-10-09","removed":{"value":"2600","unit":"mL","ucum":"mL"}}}}') = 'Dialysis · done · 2.6 L off'
  and haemodialysis.session_line('{"data":{"status":"completed","haemodialysis":{"on":"2026-10-09","removed":{"value":"2.6","unit":"L","ucum":"L"}}}}') = 'Dialysis · done · 2.6 L off',
  'the fluid taken off reads in litres, written in mL or in L');

\echo '── (c) the session''s action: everyday; the schedule''s: not'
select t.ok(a.layer = 'haemodialysis' and a.everyday and a.scope = 'department', 'write:haemodialysis.session: the department''s, everyday')
  from core.actions a where a.key = 'write:haemodialysis.session';
select t.ok(a.layer = 'haemodialysis' and not a.everyday and a.scope = 'department', 'write:haemodialysis.schedule: the department''s, not everyday')
  from core.actions a where a.key = 'write:haemodialysis.schedule';

\echo '── (d) the unit''s nurse and doctor, built on the base''s'
select t.ok(r.key = 'haemodialysis.nurse' and r.built_on = '00000000-0000-0000-0000-00000000c003'
  and (select array_agg(x.action order by x.action) from core.role_actions x where x.role_id = r.id) = array['write:admitted', 'write:discharged', 'write:haemodialysis.schedule'],
  'Dialysis nurse: built on Nurse; admits, discharges, changes the schedule') from core.roles r where r.id = '00000000-0000-0000-0000-00000000d401';
select t.ok(r.key = 'haemodialysis.doctor' and r.built_on = '00000000-0000-0000-0000-00000000c002'
  and (select array_agg(x.action order by x.action) from core.role_actions x where x.role_id = r.id) = array['write:haemodialysis.schedule'],
  'Dialysis doctor: built on Doctor; changes the schedule') from core.roles r where r.id = '00000000-0000-0000-0000-00000000d402';
select t.ok(core.gives(:'org', '00000000-0000-0000-0000-00000000d401', 'write:haemodialysis.schedule', :'hd')
  and not core.gives(:'org', '00000000-0000-0000-0000-00000000c003', 'write:haemodialysis.schedule', :'hd'), 'the base''s Nurse there does not change the schedule');
select t.ok(core.gives(:'org', '00000000-0000-0000-0000-00000000d401', 'write:haemodialysis.session', :'hd'), 'the Dialysis nurse writes the session (the Nurse''s everyday)');

\echo '── (e) the unit''s setting, on the department''s card'
select t.ok(k.layer = 'haemodialysis' and k.owner_kind = 'department' and k.form = 'department' and not k.many and k.check_fn = 'haemodialysis.unit_check(jsonb,jsonb)'::regprocedure,
  'haemodialysis.unit: one per department, its card, its check') from core.setting_keys k where k.key = 'haemodialysis.unit';

\echo '── (f) the Schedule tab'
select t.ok(s.layer = 'haemodialysis' and s.work = 'stays' and s.action = 'read:queue' and s.replaces = '{}', 'haemodialysis.schedule: stays, read:queue, replaces nothing')
  from core.screens s where s.key = 'haemodialysis.schedule';

\echo '── (g) the starter setup'
select t.ok(s.work = 'stays' and s.packs = array['haemodialysis'] and jsonb_array_length(s.places) = 8
  and not exists (select 1 from jsonb_array_elements(s.places) p where p ->> 'label' <> 'chair')
  and s.settings -> 'department.encounter_class' ->> 'class' = 'AMB'
  and s.settings -> 'haemodialysis.unit' = '{"shifts":["07:00","11:30","16:00"],"hours":4,"hbv_chairs":["HBV chair 8"],"hcv_chairs":["HCV chair 7"]}'
  and s.screens = '{"screens":["base.beds","haemodialysis.schedule"],"opens":"base.beds"}', 'haemodialysis.unit: eight chairs, AMB, three shifts, the board then the Schedule')
  from core.setups s where s.key = 'haemodialysis.unit';

\echo '── (h) the ops: who is due and the week (read:queue), the plan (the schedule''s action), the board (read:record), each naming its patients'
select t.ok(count(*) = 4 and bool_and(o.patients) and bool_and(o.layer = 'haemodialysis')
  and min(o.action) filter (where o.key = 'haemodialysis.due') = 'read:queue' and min(o.action) filter (where o.key = 'haemodialysis.week') = 'read:queue'
  and min(o.action) filter (where o.key = 'haemodialysis.plan') = 'write:haemodialysis.schedule' and min(o.action) filter (where o.key = 'haemodialysis.board') = 'read:record',
  'due, week, plan and board') from core.ops o where o.key in ('haemodialysis.due', 'haemodialysis.week', 'haemodialysis.plan', 'haemodialysis.board');

\echo '── (i) the two tables are stores: Erase removes their rows'
select t.ok(count(*) = 2 and bool_and(s.clear is null), 'haemodialysis.slots and haemodialysis.moves, clear null')
  from core.stores s where s.key in ('haemodialysis.slots', 'haemodialysis.moves');

\echo '── (j) the unit made from it'
select t.ok(core.department_uses(:'org', :'hd', 'haemodialysis') and (select count(*) from core.places p where p.department_id = :'hd' and p.retired_at is null) = 8
  and core.setting_at(:'org', 'department.encounter_class', :'hd') ->> 'class' = 'AMB' and core.setting_at(:'org', 'department.setup', :'hd') ->> 'setup' = 'haemodialysis.unit',
  'the Dialysis unit uses the pack, has eight chairs, is outpatient, and keeps its setup');

\echo '── (k) the patterns: Sat · Mon · Wed and Sun · Tue · Thu; a Friday is neither'
select t.ok(haemodialysis.on_day('sat_mon_wed', '2026-10-10') and not haemodialysis.on_day('sat_mon_wed', '2026-10-11') and haemodialysis.on_day('sun_tue_thu', '2026-10-11')
  and not haemodialysis.on_day('sat_mon_wed', '2026-10-09') and not haemodialysis.on_day('sun_tue_thu', '2026-10-09'), 'Saturday, Sunday, and a Friday in neither');
\echo '── (k) how far who is due reaches: the shift on now and every earlier one, the next within the hour; before the first, the first'
select t.ok(haemodialysis.upto(array['07:00', '11:30', '16:00'], '06:00') = 1 and haemodialysis.upto(array['07:00', '11:30', '16:00'], '10:29') = 1
  and haemodialysis.upto(array['07:00', '11:30', '16:00'], '10:30') = 2 and haemodialysis.upto(array['07:00', '11:30', '16:00'], '12:00') = 2
  and haemodialysis.upto(array['07:00', '11:30', '16:00'], '15:00') = 3 and haemodialysis.upto(array['07:00', '11:30', '16:00'], '23:00') = 3
  and haemodialysis.upto(array['00:00'], '12:00') = 1, '06:00 → 1, 10:29 → 1, 10:30 → 2, 12:00 → 2, 15:00 → 3, 23:00 → 3; one shift: 1');

\echo '── (l) the setting''s check: shifts in order, each a clock time'
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'haemodialysis.unit', 'owner_id', %L, 'data', '{"shifts":["11:30","07:00"],"hours":4}'::jsonb))$q$, :'hd'), 'shifts_out_of_order');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'haemodialysis.unit', 'owner_id', %L, 'data', '{"shifts":["7:00"],"hours":4}'::jsonb))$q$, :'hd'), 'bad_shape');

set role authenticated;
create function pg_temp.plan(p_dept uuid, p_args jsonb) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'haemodialysis.plan', 'department_id', p_dept, 'args', p_args))
$$;
create function pg_temp.week(p_dept uuid, p_args jsonb) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'haemodialysis.week', 'department_id', p_dept, 'args', p_args))
$$;

\echo '── (m) Rasha adds a standing slot'
select t.as(:'hn');
create temp table m as select pg_temp.plan(:'hd', jsonb_build_object('do', 'add', 'patient_id', :'pt', 'days', :'days', 'shift', 1, 'place_id', :'c1',
  'starts_on', :'today'::date - 30)) r;
select t.ok((select r ->> 'id' from m) is not null and (select r -> 'patient_ids' from m) = jsonb_build_array(:'pt'), 'Ahmed''s slot: today''s pattern, shift 1, Chair 1');
select r ->> 'id' as sl1 from m \gset

\echo '── (n) refused: twice, a taken chair, not a chair, no such shift or days, no patient; who may not; where the pack is not used'
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'pt', :'days', :'c2', :'today'), 'already_scheduled');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'days', :'c1', :'today'), 'chair_taken');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', '00000000-0000-0000-0000-000000000001', 'starts_on', %L))$q$,
  :'hd', :'p2', :'days', :'today'), 'not_a_chair');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 3, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'days', :'c2', :'today'), 'no_such_shift');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', 'mon_wed', 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'c2', :'today'), 'bad_days');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', '00000000-0000-0000-0000-0000000000ff', 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'days', :'c2', :'today'), 'not_found');
select t.as(:'nurse');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'days', :'c2', :'today'), 'not_allowed');
select t.as(:'rc');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'days', :'c2', :'today'), 'not_allowed');
select t.as(:'hn');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'ward', :'p2', :'days', :'c2', :'today'), 'not_used_here');

\echo '── (o) an extra session today, in the HCV chair; the chair then taken; too far; a move needs its reason'
create temp table o as select pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'patient_id', :'p2', 'to_on', :'today', 'shift', 1, 'place_id', :'c7', 'reason', 'extra after a missed one')) r;
select t.ok((select r ->> 'id' from o) is not null and (select r -> 'patient_ids' from o) = jsonb_build_array(:'p2'), 'Mona''s extra session today lands');
select r ->> 'id' as mv2 from o \gset
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'patient_id', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'extra'))$q$,
  :'hd', :'p3', :'today', :'c7'), 'chair_taken');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'patient_id', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'extra'))$q$,
  :'hd', :'p3', :'today'::date + 20, :'c2'), 'too_far');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'patient_id', %L, 'to_on', %L, 'shift', 1, 'place_id', %L))$q$,
  :'hd', :'p3', :'today', :'c2'), 'reason_missing');

\echo '── (p) the week the Schedule tab reads: Saturday to Thursday, and the sessions moved to the Friday after'
create temp table w as select pg_temp.week(:'hd', jsonb_build_object('from', :'today')) r;
select t.ok(extract(dow from (r ->> 'from')::date) = 6 and (r ->> 'from')::date <= :'today'::date and (r ->> 'from')::date > :'today'::date - 7
  and (r ->> 'to')::date = (r ->> 'from')::date + 5 and (r ->> 'today')::date = :'today'::date, 'from today''s Saturday to the Thursday after') from w;
select t.ok(exists (select 1 from jsonb_array_elements(r -> 'slots') s where s ->> 'id' = :'sl1' and s ->> 'days' = :'days' and (s ->> 'shift')::int = 1 and s ->> 'place_id' = :'c1')
  and r -> 'patient_ids' ? :'pt', 'Ahmed''s slot is in it') from w;
-- a Friday is in no pattern; a session moved to one is in the week before it (from today's Saturday, today is always in it)
select t.ok(exists (select 1 from jsonb_array_elements(r -> 'moves') x where x ->> 'id' = :'mv2' and x ->> 'to_on' = :'today' and x ->> 'place_id' = :'c7'
                   and x ->> 'reason' = 'extra after a missed one' and not x ? 'from_on') and r -> 'patient_ids' ? :'p2',
  'Mona''s extra session is in it (a Friday''s too)') from w;

-- the session's concept, a session's data, who is due now and the board's read (as the reader signed in)
create function pg_temp.hd() returns jsonb language sql immutable as $$
  select '{"text":"Haemodialysis","codings":[{"system":"local.procedure","code":"haemodialysis","display":"Haemodialysis"}]}'::jsonb
$$;
create function pg_temp.session(p_status text, p_hd jsonb, p_more jsonb default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object('concept', pg_temp.hd(), 'status', p_status, 'performed', jsonb_build_object('value', now(), 'precision', 'minute'), 'haemodialysis', p_hd) || p_more
$$;
create function pg_temp.due(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'haemodialysis.due', 'department_id', p_dept, 'args', '{}'::jsonb))
$$;
create function pg_temp.board(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'haemodialysis.board', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;
-- who is missed in (w): Ahmed on his own day; on a Friday (no pattern's day) Karim, after an extra session moved to today
select case when :dow = 5 then :'p3' else :'pt' end as mp, case when :dow = 5 then :'c8' else :'c1' end as mc \gset

\echo '── (q) Mona''s HCV isolation: the base''s alert, active'
select t.as(:'dr');
select t.landed(t.w(t.e('alert', :'p2', :'hd', '{"concept":{"text":"Isolation · HCV","codings":[{"system":"local.alert","code":"isolation_hcv","display":"Isolation · HCV"}]},"status":"active"}')),
  'Dr Ali records Mona''s HCV isolation');

\echo '── (r) who is due now: Mona''s extra session in the HCV chair, and Ahmed''s slot (none on a Friday)'
select t.as(:'hn');
create temp table r as select pg_temp.due(:'hd') r;
select t.ok(jsonb_array_length(r -> 'rows') = case when :dow = 5 then 1 else 2 end and (r ->> 'on')::date = :'today'::date and (r ->> 'shift')::int = 1,
  'due today: ' || jsonb_array_length(r -> 'rows') || ' rows, shift 1 on') from r;
select t.ok(x ->> 'move_id' = :'mv2' and x ->> 'place_id' = :'c7' and (x ->> 'shift')::int = 1 and (x ->> 'hours')::numeric = 4 and x -> 'isolation' = '["hcv"]'
  and x ->> 'starts' = '00:00' and x ? 'starts_at' and not x ? 'slot_id' and not x ? 'last_on' and not x ? 'elsewhere', 'Mona: moved here for today, the HCV chair, HCV, shift 1 at 00:00')
  from r, jsonb_array_elements(r -> 'rows') x where x ->> 'patient_id' = :'p2';
select t.ok(case when :dow = 5 then not exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'patient_id' = :'pt')
  else exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'patient_id' = :'pt' and x ->> 'slot_id' = :'sl1' and x ->> 'place_id' = :'c1'
    and x -> 'isolation' = '[]' and not x ? 'move_id') end and r -> 'patient_ids' ? :'p2',
  case when :dow = 5 then 'a Friday: Ahmed''s slot is not today''s' else 'Ahmed: his slot, Chair 1, no isolation' end) from r;

\echo '── (s) who may read it: whoever reads the queue there'
select t.as(:'dr');
select t.ok(jsonb_typeof(pg_temp.due(:'hd') -> 'rows') = 'array', 'Dr Ali (a Doctor there) reads who is due');
select t.as(:'rc');
select t.refuses(format($q$select pg_temp.due(%L)$q$, :'hd'), 'not_allowed');

\echo '── (t) Start: the base''s admitted into the chair and the session begun, one set'
select t.as(:'hn');
select t.landed(t.w(jsonb_build_array(
  t.e('admitted', :'p2', :'hd', jsonb_build_object('department_id', :'hd', 'admit_source', 'outp', 'place_id', :'c7', 'reason', 'Haemodialysis'), :'s1', :'s1'),
  t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('in-progress', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c7', 'hours', 4)), :'h1', :'s1'))),
  'Rasha starts Mona''s session in the HCV chair');
select t.ok(r ->> 'kind' = 'stay' and r ->> 'state' = 'admitted' and r ->> 'place_id' = :'c7' and r ->> 'department_id' = :'hd', 'a stay in the HCV chair, admitted')
  from t.rows('base.presence', :'hd', jsonb_build_object('item', :'s1')) r;
select t.ok(t.entry(t.record(:'p2', :'hd'), :'h1') ->> 'line' = 'Dialysis · on · 4 h', 'its line: Dialysis · on · 4 h');

\echo '── (u) started, she is no longer due'
select t.ok(not exists (select 1 from jsonb_array_elements(pg_temp.due(:'hd') -> 'rows') x where x ->> 'patient_id' = :'p2'), 'Mona is not due now');

\echo '── (v) the session''s check'
select t.refused(t.w(t.e('haemodialysis.session', :'p3', :'hd', pg_temp.session('in-progress', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c2', 'hours', 4)))),
  'session_not_in_stay', 'on dialysis in no stay');
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'s2', :'s2')), 'Dr Ali admits Ahmed to the ward (no bed yet)');
select t.as(:'hn');
select t.refused(t.w(t.e('haemodialysis.session', :'pt', :'hd', pg_temp.session('in-progress', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c1', 'hours', 4)), null, :'s2')),
  'session_not_in_stay', 'a stay on the ward is not one here');
select t.refused(t.w(t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('in-progress', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c7', 'hours', 4)), null, :'s1')),
  'session_exists', 'a second session in the stay');
select t.refused(t.w(t.e('haemodialysis.session', :'p2', :'hd', jsonb_build_object('concept', '{"text":"Haemodialysis"}'::jsonb, 'status', 'in-progress',
  'haemodialysis', jsonb_build_object('on', :'today')), null, :'s1')), 'not_a_session', 'a procedure that is not the pack''s');
select t.refused(t.w(t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('not-done', jsonb_build_object('on', :'today', 'missed', 'not_came'), '{"reason":"Did not come"}'), null, :'s1')),
  'session_missed_in_stay', 'missed, in a stay');
select t.refused(t.w(t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('not-done', jsonb_build_object('on', :'today', 'missed', 'not_came'), '{"reason":"Did not come"}'))),
  'session_on_day', 'a second session for Mona today');
select t.as(:'rc');
select t.refused(t.w(t.e('haemodialysis.session', :'p3', :'hd', pg_temp.session('not-done', jsonb_build_object('on', :'today', 'missed', 'not_came'), '{"reason":"Did not come"}'))),
  'not_allowed', 'Reception does not write the session');

\echo '── (w) Missed: not done, in no stay, "Did not come"; no longer due'
select t.as(:'hn');
select r ->> 'id' is not null as extra from (select pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'patient_id', :'p3', 'to_on', :'today', 'shift', 1, 'place_id', :'c8',
  'reason', 'extra this week')) r) x where :dow = 5;
select t.ok(exists (select 1 from jsonb_array_elements(pg_temp.due(:'hd') -> 'rows') x where x ->> 'patient_id' = :'mp' and x ->> 'place_id' = :'mc'), 'due before: the one missed');
select t.landed(t.w(t.e('haemodialysis.session', :'mp', :'hd', jsonb_build_object('concept', pg_temp.hd(), 'status', 'not-done', 'reason', 'Did not come',
  'performed', jsonb_build_object('value', :'today', 'precision', 'day'), 'haemodialysis', jsonb_strip_nulls(jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'mc',
  'slot', case when :dow <> 5 then :'sl1' end, 'missed', 'not_came'))), :'h2')), 'missed: did not come');
select t.ok(t.entry(t.record(:'mp', :'hd'), :'h2') ->> 'line' = 'Dialysis missed · Did not come', 'its line: Dialysis missed · Did not come');
select t.ok(not exists (select 1 from jsonb_array_elements(pg_temp.due(:'hd') -> 'rows') x where x ->> 'patient_id' = :'mp'), 'and no longer due');

\echo '── (x) the blood pressure in the chair'
select t.landed(t.w(t.e('vitals', :'p2', :'hd', '{"bp":{"sys":{"value":"132","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"80","unit":"mmHg","ucum":"mm[Hg]"}}}', :'v1', :'s1')),
  'Rasha records BP 132/80');

\echo '── (y) the board''s read: the session, the last blood pressure, the isolation; read-logged for treatment'
select t.as(:'dr');
select t.ok(b -> 'stays' -> :'s1' -> 'session' ->> 'status' = 'in-progress' and (b -> 'stays' -> :'s1' -> 'session' ->> 'hours')::numeric = 4
  and b -> 'stays' -> :'s1' -> 'session' ->> 'started' is not null and b -> 'stays' -> :'s1' -> 'session' ->> 'item' = :'h1'
  and (b -> 'stays' -> :'s1' -> 'bp' ->> 'sys')::numeric = 132 and (b -> 'stays' -> :'s1' -> 'bp' ->> 'dia')::numeric = 80
  and b -> 'stays' -> :'s1' -> 'isolation' = '["hcv"]' and b -> 'patient_ids' ? :'p2' and not (b -> 'stays' ? :'s2'),
  'Mona''s stay: on, 4 h, BP 132/80, HCV; the ward''s stay is not this board''s') from (select pg_temp.board(:'hd') b) x;
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'p2' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'haemodialysis.board'),
  'the read is logged for Mona, for treatment, naming the op');
set role authenticated;
select t.refuses(format($q$select pg_temp.board(%L)$q$, :'ward'), 'not_used_here');
select t.as(:'rc');
select t.refuses(format($q$select pg_temp.board(%L)$q$, :'hd'), 'not_allowed');

\echo '── (y) crossed out: a struck blood pressure or session is no longer the board''s; the stay may then take a new session'
savepoint struck;
select t.as(:'hn');
select t.landed(t.w(t.e('vitals', :'p2', :'hd', '{"bp":{"sys":{"value":"78","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"40","unit":"mmHg","ucum":"mm[Hg]"}}}', :'v2', :'s1')),
  'a BP of 78/40 in the chair');
select t.as(:'dr');
select t.ok((b -> 'stays' -> :'s1' -> 'bp' ->> 'sys')::numeric = 78, 'the board: BP 78/40') from (select pg_temp.board(:'hd') b) x;
select t.as(:'hn');
select t.landed(t.w(t.e('crossed_out', :'p2', :'hd', '{"reason":"wrong_patient"}', null, :'s1', null, null, t.latest(:'v2'))), 'the 78/40 crossed out: another patient''s');
select t.as(:'dr');
select t.ok((b -> 'stays' -> :'s1' -> 'bp' ->> 'sys')::numeric = 132 and (b -> 'stays' -> :'s1' -> 'bp' ->> 'dia')::numeric = 80, 'the board: back to BP 132/80')
  from (select pg_temp.board(:'hd') b) x;
select t.as(:'hn');
select t.landed(t.w(t.e('crossed_out', :'p2', :'hd', '{"reason":"wrong_patient"}', null, :'s1', null, null, t.latest(:'h1'))), 'the session crossed out');
select t.as(:'dr');
select t.ok(b -> 'stays' ? :'s1' and not (b -> 'stays' -> :'s1' ? 'session'), 'the board: the stay has no session') from (select pg_temp.board(:'hd') b) x;
select t.as(:'hn');
select t.landed(t.w(t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('in-progress', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c7', 'hours', 4)), :'h4', :'s1')),
  'a new session in the stay (the struck one no longer counts)');
select t.as(:'dr');
select t.ok(b -> 'stays' -> :'s1' -> 'session' ->> 'item' = :'h4' and b -> 'stays' -> :'s1' -> 'session' ->> 'status' = 'in-progress', 'the board: the new session')
  from (select pg_temp.board(:'hd') b) x;
rollback to savepoint struck;

\echo '── (z) End: the session completed and the base''s discharged, one set'
select t.as(:'hn');
select t.landed(t.w(jsonb_build_array(
  t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('completed', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c7', 'hours', 4,
    'removed', jsonb_build_object('value', '2600', 'unit', 'mL', 'ucum', 'mL'), 'ended', now())), :'h3', :'s1', t.latest(:'h1'), 'changes'),
  t.move('discharged', :'s1', :'hd', '{"disposition":"home"}'))), 'Rasha ends Mona''s session: completed, 2.6 L off, discharged');
select t.ok(r ->> 'state' = 'discharged', 'the stay is discharged') from t.rows('base.presence', :'hd', jsonb_build_object('item', :'s1')) r;
select t.ok(t.entry(t.record(:'p2', :'hd'), :'h3') ->> 'line' = 'Dialysis · done · 2.6 L off', 'its line: Dialysis · done · 2.6 L off');
-- after the discharge: the ended session may still be corrected (a late note); no new session goes into the closed stay
savepoint late;
select t.landed(t.w(t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('completed', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c7', 'hours', 4,
    'removed', jsonb_build_object('value', '2600', 'unit', 'mL', 'ucum', 'mL'), 'ended', now()), '{"note":"Cramps in the last half hour"}'), null, :'s1', null, null, t.latest(:'h1'))),
  'a late note on Mona''s ended session, after the discharge');
rollback to savepoint late;
select t.refused(t.w(t.e('haemodialysis.session', :'p2', :'hd', pg_temp.session('in-progress', jsonb_build_object('on', :'today', 'shift', 1, 'chair', :'c7', 'hours', 4)), null, :'s1')),
  'session_not_in_stay', 'a new session in the discharged stay');

\echo '── (aa) a session moved and undone; a slot ended; a slot never used blocks nothing'
select t.as(:'hn');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'slot_id', %L, 'patient_id', %L, 'from_on', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'family wedding'))$q$,
  :'hd', :'sl1', :'pt', :'nd', :'pd'::date + 1, :'c2'), 'not_a_day');
-- a standing slot holds its chair: Karim's extra session cannot go into Chair 1 on Ahmed's day
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'patient_id', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'extra'))$q$,
  :'hd', :'p3', :'pd', :'c1'), 'chair_taken');
-- a patient comes once a day: an extra session on Ahmed's own day, his session moved onto his next one, Mona's second extra today
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'patient_id', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'extra'))$q$,
  :'hd', :'pt', :'pd', :'c2'), 'already_due');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'slot_id', %L, 'patient_id', %L, 'from_on', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'twice'))$q$,
  :'hd', :'sl1', :'pt', :'pd', :'pd2', :'c2'), 'already_due');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'patient_id', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'extra'))$q$,
  :'hd', :'p2', :'today', :'c2'), 'already_due');
create temp table aa as select pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'slot_id', :'sl1', 'patient_id', :'pt', 'from_on', :'pd', 'to_on', :'pd'::date + 1,
  'shift', 1, 'place_id', :'c2', 'reason', 'family wedding')) r;
select r ->> 'id' as mv1 from aa \gset
select t.ok(:'mv1' <> '' and exists (select 1 from jsonb_array_elements(pg_temp.week(:'hd', jsonb_build_object('from', :'pd')) -> 'moves') x where x ->> 'id' = :'mv1'
  and x ->> 'from_on' = :'pd' and (x ->> 'to_on')::date = :'pd'::date + 1 and x ->> 'slot_id' = :'sl1'), 'Ahmed''s next session moved a day on, in Chair 2');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'move', 'slot_id', %L, 'patient_id', %L, 'from_on', %L, 'to_on', %L, 'shift', 1, 'place_id', %L, 'reason', 'again'))$q$,
  :'hd', :'sl1', :'pt', :'pd', :'pd'::date + 2, :'c2'), 'already_moved');
-- Chair 1 is free on that day once Ahmed's session left it: Karim's extra session goes in, and Ahmed's move cannot then be undone
create temp table aa3 as select pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'patient_id', :'p3', 'to_on', :'pd', 'shift', 1, 'place_id', :'c1', 'reason', 'extra')) r;
select r ->> 'id' as mv3 from aa3 \gset
select t.ok(:'mv3' <> '', 'Karim''s extra session in Chair 1 on the day Ahmed''s left');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'undo', 'move_id', %L))$q$, :'hd', :'mv1'), 'chair_taken');
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'undo', 'move_id', :'mv3')) ->> 'id' = :'mv3', 'Karim''s extra session undone');
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'undo', 'move_id', :'mv1')) ->> 'id' = :'mv1'
  and not exists (select 1 from jsonb_array_elements(pg_temp.week(:'hd', jsonb_build_object('from', :'pd')) -> 'moves') x where x ->> 'id' = :'mv1'), 'undone, and gone from the week');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'undo', 'move_id', %L))$q$, :'hd', :'mv1'), 'not_found');
-- one session to another chair on its own day (not a second session that day), then undone
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'undo', 'move_id', pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'slot_id', :'sl1', 'patient_id', :'pt',
  'from_on', :'pd', 'to_on', :'pd', 'shift', 1, 'place_id', :'c2', 'reason', 'chair 1 broken')) ->> 'id')) ->> 'id' is not null, 'Ahmed into Chair 2 on his own day, and back');
-- a session moved into a chair holds it on the pattern's days: no new slot there; nor a slot for its patient on those days
create temp table aa4 as select pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'patient_id', :'p2', 'to_on', :'pd', 'shift', 1, 'place_id', :'c7', 'reason', 'extra')) r;
select r ->> 'id' as mv4 from aa4 \gset
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p4', :'days', :'c7', :'today'), 'chair_taken');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', %L, 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'days', :'c2', :'today'), 'already_due');
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'undo', 'move_id', :'mv4')) ->> 'id' = :'mv4', 'Mona''s extra session undone');
-- Ahmed's session taken off a day past the slot's end: ending the slot undoes it
create temp table aa5 as select pg_temp.plan(:'hd', jsonb_build_object('do', 'move', 'slot_id', :'sl1', 'patient_id', :'pt', 'from_on', :'pl', 'reason', 'travelling')) r;
select r ->> 'id' as mv5 from aa5 \gset
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'end', 'slot_id', :'sl1', 'ends_on', :'today'::date + 7)) ->> 'id' = :'sl1'
  and exists (select 1 from jsonb_array_elements(pg_temp.week(:'hd', jsonb_build_object('from', :'today'::date + 7)) -> 'slots') s where s ->> 'id' = :'sl1'
    and (s ->> 'ends_on')::date = :'today'::date + 7)
  and not exists (select 1 from jsonb_array_elements(pg_temp.week(:'hd', jsonb_build_object('from', :'pl')) -> 'moves') x where x ->> 'id' = :'mv5'),
  'Ahmed''s slot ended a week on; his session taken off a later day is undone with it');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'end', 'slot_id', %L, 'ends_on', %L))$q$, :'hd', :'sl1', :'today'::date + 8), 'not_found');
create temp table sl3 as select pg_temp.plan(:'hd', jsonb_build_object('do', 'add', 'patient_id', :'p3', 'days', 'sun_tue_thu', 'shift', 1, 'place_id', :'c8',
  'starts_on', :'today'::date + 10)) r;
select r ->> 'id' as sl3 from sl3 \gset
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'end', 'slot_id', :'sl3', 'ends_on', :'today'::date + 9)) ->> 'id' = :'sl3', 'Karim''s slot ended the day before it starts: never used');
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'add', 'patient_id', :'p3', 'days', 'sun_tue_thu', 'shift', 1, 'place_id', :'c8', 'starts_on', :'today'::date + 5)) ->> 'id' is not null,
  'Karim added again from sooner, in the same chair: the slot never used blocks neither');
select t.refuses(format($q$select pg_temp.plan(%L, jsonb_build_object('do', 'add', 'patient_id', %L, 'days', 'sun_tue_thu', 'shift', 1, 'place_id', %L, 'starts_on', %L))$q$,
  :'hd', :'p2', :'c8', :'today'::date + 5), 'chair_taken');

-- the unit's doctor changes the schedule too; a shift in use stays in the unit's setting
select t.as(:'hdr');
select t.ok(pg_temp.plan(:'hd', jsonb_build_object('do', 'add', 'patient_id', :'pt', 'days', :'other', 'shift', 2, 'place_id', :'c2', 'starts_on', :'today'::date + 8)) ->> 'id' is not null,
  'Dr Walid adds Ahmed''s next slot, shift 2, after the first ends');
select t.as(:'ow');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'haemodialysis.unit', 'owner_id', %L, 'data', '{"shifts":["00:00"],"hours":4}'::jsonb))$q$, :'hd'), 'shift_in_use');

\echo '── (bb) the export: the session a Procedure (its latest version, completed) in its Encounter, an outpatient one'
set role authenticated;
select t.as(:'dr');
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'p2', 'department_id', :'hd')) b;
reset role;
create temp table res as select e -> 'resource' r from bundle, jsonb_array_elements(b -> 'entry') e;
select t.ok(count(*) = 1 and bool_and(r ->> 'status' = 'completed' and r -> 'code' -> 'coding' @> '[{"code":"haemodialysis"}]' and r -> 'encounter' ->> 'reference' = 'Encounter/' || :'s1'),
  'the Procedure: completed, haemodialysis, in its Encounter') from res where r ->> 'resourceType' = 'Procedure' and r ->> 'id' = :'h1';
select t.ok(count(*) = 1 and bool_and(r -> 'class' ->> 'code' = 'AMB'), 'the Encounter: outpatient (AMB)') from res where r ->> 'resourceType' = 'Encounter' and r ->> 'id' = :'s1';
select t.ok(not exists (select 1 from res, unnest(core.fhir_problems(r)) q where r ->> 'resourceType' <> 'Bundle'), 'no resource has a problem');
set role authenticated;

\echo '── (cc) Erase reaches the schedule: Ahmed''s slots and moves are gone'
select t.as(:'ow');
select t.ok((public.erase_patient(jsonb_build_object('patient_id', :'pt', 'reason', 'test')) ->> 'erased')::boolean, 'Ahmed erased');
reset role;
select t.ok(not exists (select 1 from haemodialysis.slots where patient_id = :'pt') and not exists (select 1 from haemodialysis.moves where patient_id = :'pt')
  and exists (select 1 from haemodialysis.slots where patient_id = :'p3'), 'none of his rows is left; the others'' stay');

\echo '── (dd) off: the door is shut'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) - 'haemodialysis'))) ->> 'key' as off;
set role authenticated;
select t.as(:'hn');
select t.refuses(format($q$select pg_temp.week(%L, '{}')$q$, :'hd'), 'pack_off');
select t.refuses(format($q$select pg_temp.due(%L)$q$, :'hd'), 'pack_off');
select t.refused(t.w(t.e('haemodialysis.session', :'p4', :'hd', pg_temp.session('not-done', jsonb_build_object('on', :'today', 'missed', 'not_came'), '{"reason":"Did not come"}'))),
  'pack_off', 'off: no session is written');
