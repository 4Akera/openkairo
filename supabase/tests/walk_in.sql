-- walk-ins (spec §5.3): a patient with no order from inside openCare. A bench orders only for itself, the desk only for the benches
-- it checks in for; who asked (an outside doctor) rides on the order and reaches the bench's list
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set lt   '11111111-0000-0000-0000-0000000000b2'
\set rc   '11111111-0000-0000-0000-0000000000b4'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
set role authenticated;

-- an order from one department to another: a CBC (the lab's), dispensing (the pharmacy's), or a consult (no service)
create or replace function pg_temp.order_of(p_from uuid, p_to uuid, p_service jsonb, p_extra jsonb default '{}', p_id uuid default null) returns jsonb language sql as $$
  select t.w(t.e('order', '00000000-0000-0000-0000-0000000000f1', p_from, jsonb_build_object('service', p_service, 'department_id', p_to,
    'priority', 'routine', 'status', 'active') || coalesce(p_extra, '{}'), p_id))
$$;
create temp table svc (k text, s jsonb);
insert into svc values ('cbc', '{"id":"00000000-0000-0000-0000-0000000000c1","code":"cbc","name":"CBC"}'),
  ('disp', '{"id":"00000000-0000-0000-0000-0000000000c3","code":"dispense","name":"Dispensing"}'), ('consult', '{"name":"Consult","answer":"note"}');
grant select on svc to public;

\echo '── the lab takes a walk-in for itself; who asked is on the order and on the bench''s list'
select t.as(:'lt');
select t.landed(pg_temp.order_of(:'labd', :'labd', (select s from svc where k = 'cbc'), '{"asked_by":"Dr. Samir Fouad · Nasr City clinic"}',
  '00000000-0000-0000-0000-00000000aa01'), 'a walk-in CBC started at the lab');
select t.ok(r ->> 'asked_by' = 'Dr. Samir Fouad · Nasr City clinic' and r ->> 'from_department_id' = :'labd' and r ->> 'status' = 'active' and r ->> 'visit_id' is null,
  'on the bench''s list: from the lab itself, no visit, who asked') from t.rows('base.orders', :'labd', '{"item":"00000000-0000-0000-0000-00000000aa01"}') r;
select t.landed(pg_temp.order_of(:'labd', :'labd', (select s from svc where k = 'cbc')), 'who asked is optional');

\echo '── a bench orders only for itself'
select t.refused(pg_temp.order_of(:'labd', :'ph', (select s from svc where k = 'disp')), 'walk_in_elsewhere', 'the lab cannot send to the pharmacy');
select t.refused(pg_temp.order_of(:'labd', :'im', (select s from svc where k = 'consult')), 'walk_in_elsewhere', 'nor ask a clinic');

\echo '── the desk starts a walk-in for a bench it checks in for, never for a clinic (that is a check-in)'
select t.as(:'rc');
select t.landed(pg_temp.order_of(:'desk', :'labd', (select s from svc where k = 'cbc'), '{"asked_by":"Dr. Hany Saleh"}'), 'the desk sends a walk-in to the lab');
select t.refused(pg_temp.order_of(:'desk', :'im', (select s from svc where k = 'consult')), 'walk_in_elsewhere', 'a clinic is a check-in, not an order');
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.checks_in_for', 'owner_id', :'desk', 'data', jsonb_build_object('departments', jsonb_build_array(:'im')))) ->> 'key' as checks_in_for;
select t.as(:'rc');
select t.refused(pg_temp.order_of(:'desk', :'labd', (select s from svc where k = 'cbc')), 'not_served', 'a desk that checks in only for Internal Medicine');

\echo '── a clinic still orders from the lab as before'
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(pg_temp.order_of(:'im', :'labd', (select s from svc where k = 'cbc')), 'Dr Ali orders a CBC from Internal Medicine');
