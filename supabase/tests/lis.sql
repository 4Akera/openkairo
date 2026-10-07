-- the laboratory pack (spec §5.3): sample numbers, one counter per laboratory and day, through its door; the earlier values of a patient's
-- tests (the change check), fed after commit by a listener on the base's results, read by its technician; its door refused elsewhere
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set lt   '11111111-0000-0000-0000-0000000000b2'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["lis"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'labd', 'data', '{"packs":["lis"]}'::jsonb)) ->> 'key' as ticked;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b2', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c005', 'department_id', :'labd'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cf01', 'department_id', :'labd')))) ->> 'id' as granted;
set role authenticated;

\echo '── sample numbers: one counter per laboratory and day, S-MMDD-NNNN'
select t.as(:'lt');
select t.ok((public.pack_op(jsonb_build_object('op', 'lis.sample', 'department_id', :'labd')) ->> 'sample') ~ '^S-[0-9]{4}-0001$', 'the first today: …-0001');
select t.ok((public.pack_op(jsonb_build_object('op', 'lis.sample', 'department_id', :'labd')) ->> 'sample') ~ '^S-[0-9]{4}-0002$', 'the next: …-0002');
select t.refuses($q$select public.pack_op('{"op":"lis.sample","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'not_used_here');

\echo '── the earlier values: a final result''s numbers, by analyte key, for its technician'
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'CBC'), 'department_id', :'labd', 'priority', 'routine', 'status', 'active'),
  '00000000-0000-0000-0000-00000000ad01')), 'a CBC ordered');
select t.as(:'lt');
select t.landed(t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'final', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'hb', 'name', 'Hb', 'value', jsonb_build_object('value', '13.1', 'ucum', 'g/dL')),
  jsonb_build_object('key', 'note', 'name', 'Comment', 'text', 'normocytic'))), '00000000-0000-0000-0000-00000000ad02', null,
  '00000000-0000-0000-0000-00000000ad01', 'answers')), 'its result');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'lt');
select t.ok(count(*) = 1 and min(r ->> 'key') = 'hb' and min((r ->> 'value')::numeric) = 13.1, 'one number kept (the comment is not a number): hb 13.1')
  from t.rows('lis.values', :'labd', jsonb_build_object('patient_id', :'pt')) r;
select t.as(:'dr');
select t.refuses(format($q$select count(*) from t.rows('lis.values', %L, '{}')$q$, :'im'), 'not_allowed');

\echo '── the large lab: its placeholders hold (a written number, no analysers); chairs are its own count'
select t.as(:'ow');
create temp table large as select jsonb_build_object('turnaround', true, 'targets', jsonb_build_object('haematology', 60, 'coagulation', 60, 'chemistry', 120,
  'hormones', 240, 'serology', 240, 'urine_stool', 60), 'second_check', true, 'scan_receive', true, 'chairs', 2, 'labels', 'written', 'analysers', false, 'auto_release', false) v;
grant select on large to authenticated;
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'lis.large', 'owner_id', %L, 'data', (select v from large) || '{"analysers":true}'))$q$, :'labd'), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'lis.large', 'owner_id', %L, 'data', (select v from large) || '{"labels":"printed"}'))$q$, :'labd'), 'bad_shape');
select public.write_setting(jsonb_build_object('key', 'lis.large', 'owner_id', :'labd', 'data', (select v from large))) ->> 'key' as large;

\echo '── the queue tickets: one per patient''s tests of the day, in the order given; a test asked for later joins its ticket'
select t.as(:'lt');
create temp table tk as select public.pack_op(jsonb_build_object('op', 'lis.tickets', 'department_id', :'labd', 'args', jsonb_build_object('groups', jsonb_build_array(
  jsonb_build_array('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'), jsonb_build_array('00000000-0000-0000-0000-0000000000a3'))))) -> 'tickets' v;
grant select on tk to authenticated;
select t.ok(jsonb_array_length(v) = 2 and (v -> 0 ->> 'number')::int = 1 and (v -> 1 ->> 'number')::int = 2 and v -> 0 -> 'chair' = 'null', 'two tickets, #1 and #2, no chair yet') from tk;
select t.ok((x -> 'tickets' -> 0 -> 'items') @> '["00000000-0000-0000-0000-0000000000a4"]' and jsonb_array_length(x -> 'tickets') = 2, 'a later test of the first patient joins #1')
  from (select public.pack_op(jsonb_build_object('op', 'lis.tickets', 'department_id', :'labd', 'args', jsonb_build_object('groups', jsonb_build_array(
    jsonb_build_array('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a4'), jsonb_build_array('00000000-0000-0000-0000-0000000000a3'))))) x) y;

\echo '── calling: to a chair this laboratory counts (two); one called to another chair only when taken'
select t.ok((public.pack_op(jsonb_build_object('op', 'lis.call', 'department_id', :'labd', 'args', '{"number":1,"chair":1}'::jsonb)) ->> 'chair')::int = 1, '#1 called to chair 1');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op', 'lis.call', 'department_id', %L, 'args', '{"number":1,"chair":2}'::jsonb))$q$, :'labd'), 'called_elsewhere');
select t.ok((public.pack_op(jsonb_build_object('op', 'lis.call', 'department_id', :'labd', 'args', '{"number":1,"chair":2,"take":true}'::jsonb)) ->> 'chair')::int = 2, 'taken to chair 2');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op', 'lis.call', 'department_id', %L, 'args', '{"number":9,"chair":1}'::jsonb))$q$, :'labd'), 'unknown_ticket');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op', 'lis.call', 'department_id', %L, 'args', '{"number":2,"chair":3}'::jsonb))$q$, :'labd'), 'no_such_chair');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op', 'lis.call', 'department_id', %L, 'args', '{"number":2,"chair":0}'::jsonb))$q$, :'labd'), 'no_such_chair');

\echo '── a second person checks: a preliminary result, then its final (the next version) — the first final, never a correction'
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'CBC'), 'department_id', :'labd', 'priority', 'routine', 'status', 'active'),
  '00000000-0000-0000-0000-00000000ad11')), 'a second CBC ordered');
select t.as(:'lt');
select t.landed(t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'preliminary', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'hb', 'name', 'Hb', 'value', jsonb_build_object('value', '6.1', 'ucum', 'g/dL'), 'interpretation', 'LL'))), '00000000-0000-0000-0000-00000000ad12', null,
  '00000000-0000-0000-0000-00000000ad11', 'answers')), 'released, preliminary');
reset role;
select t.ok(status = 'in-progress' and not final, 'the order waits (in progress, not final)') from base.orders where item = '00000000-0000-0000-0000-00000000ad11';
select t.ok(critical and why = 'not_seen', 'a critical preliminary already reaches the doctor (no visit: not seen)') from base.review where order_item = '00000000-0000-0000-0000-00000000ad11';
set role authenticated;
select t.as(:'lt');
select t.landed(t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'final', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'hb', 'name', 'Hb', 'value', jsonb_build_object('value', '6.1', 'ucum', 'g/dL'), 'interpretation', 'LL'))), '00000000-0000-0000-0000-00000000ad13', null,
  null, null, '00000000-0000-0000-0000-00000000ad12')), 'approved: the final replaces it');
reset role;
select t.ok(status = 'completed' and final, 'the order is completed') from base.orders where item = '00000000-0000-0000-0000-00000000ad11';
select t.ok(critical and why = 'not_seen', 'its review is the result''s, never a correction') from base.review where order_item = '00000000-0000-0000-0000-00000000ad11';
