-- the pharmacy pack (spec §5), ported: a medication sent is an order to the pharmacy; the queue (a pack table, fed after commit by a
-- listener); prepared, the one step its service lists; a result cannot answer it; the dispense closes it; the pack off refuses new
-- dispenses and the record still reads
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set disp '00000000-0000-0000-0000-0000000000c3'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set pm   '11111111-0000-0000-0000-0000000000b6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
-- the pharmacy ticks the pack (the demo's does): its actions count only there (§5.2)
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select t.as(null);

\echo '── the boundary: the pack role holds nothing on any core table; its functions are its own and definer'
select t.ok(bool_and(not has_table_privilege('pack_pharmacy', 'core.' || tablename, 'SELECT,INSERT,UPDATE,DELETE')), 'pack_pharmacy holds no core table') from pg_tables where schemaname = 'core';
select t.ok(bool_and(p.prosecdef and r.rolname = 'pack_pharmacy'), 'its functions are its own, definer') from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner where n.nspname = 'pharmacy';
set role authenticated;

\echo '── a medication not sent stays on the list only; one sent is an order to the pharmacy about it'
select t.as(:'dr');
select t.landed(t.w(t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Amlodipine","codings":[{"system":"atc","code":"C08CA01"}]},"dosage":{"dose":{"value":"5","unit":"mg","ucum":"mg"},"timing":{"code":"OD"}},"status":"active"}')), 'not sent');
select t.ok(count(*) = 0, 'no order') from t.rows('base.orders', :'im', jsonb_build_object('to_department_id', :'ph')) r;
select t.landed(t.w(jsonb_build_array(
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Lithium","codings":[{"system":"atc","code":"N05AN01"}]},"dosage":{"dose":{"value":"400","unit":"mg","ucum":"mg"},"timing":{"code":"BD"}},"duration_days":30,"status":"active"}',
    '00000000-0000-0000-0000-0000000000e1'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine', 'status', 'active'),
    '00000000-0000-0000-0000-0000000000e2', null, '00000000-0000-0000-0000-0000000000e1', 'about'))), 'sent: the medication and its order in one set');
reset role;
select t.ok(count(*) >= 1, 'the pack hears of it after commit (an outbox row)') from core.outbox where layer = 'pharmacy';
select t.ok(core.drain() >= 1, 'drained');
set role authenticated;
select t.as(:'pm');
select t.ok(r ->> 'drug' = 'Lithium' and (r ->> 'duration_days')::int = 30 and r ->> 'status' = 'to_prepare' and r ->> 'dose' = '400 mg', 'the queue carries what to give')
  from t.rows('pharmacy.queue', :'ph', jsonb_build_object('department_id', :'ph')) r;

\echo '── the pharmacist: prepared (the dispensing service''s step); a result cannot answer it; the dispense closes it'
select t.refused(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"in-progress","step":"counted"}', null, null, '00000000-0000-0000-0000-0000000000e2', 'answers')), 'unknown_step', 'a step dispensing does not list');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"in-progress","step":"prepared"}', '00000000-0000-0000-0000-0000000000e3', null, '00000000-0000-0000-0000-0000000000e2', 'answers')), 'prepared');
select t.ok(r ->> 'status' = 'prepared', 'the queue: prepared (inline, its own type)') from t.rows('pharmacy.queue', :'ph', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e2')) r;
select t.ok(r ->> 'status' = 'in-progress' and r ->> 'step_key' = 'prepared', 'the base order: in progress, step prepared') from t.rows('base.orders', :'ph', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e2')) r;
select t.as(:'ow');
select t.refused(t.w(t.e('result', :'pt', :'ph', '{"status":"final","conclusion":"given"}', null, null, '00000000-0000-0000-0000-0000000000e2', 'answers')), 'wrong_answer', 'a result for a dispensing order');
select t.as(:'pm');
select t.refused(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"completed"}', null, null, '00000000-0000-0000-0000-0000000000e3', 'changes')), 'nothing_dispensed');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Lithium"},"dose":{"value":"400","unit":"mg","ucum":"mg"},"quantity":{"value":"60","unit":"tablets","ucum":"{tbl}"}}]}}',
  '00000000-0000-0000-0000-0000000000e4', null, '00000000-0000-0000-0000-0000000000e3', 'changes')), 'dispensed');
select t.ok(r ->> 'status' = 'completed', 'the order is done') from t.rows('base.orders', :'ph', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e2')) r;
select t.ok(r ->> 'status' = 'dispensed', 'the queue: dispensed') from t.rows('pharmacy.queue', :'ph', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000e2')) r;
select t.as(:'dr');
select t.ok(count(*) = 0, 'nothing to review for a dispense') from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r;
select t.ok(string_agg(e ->> 'line', ' > ' order by (e ->> 'item_version')::int) = 'Prepared > Dispensed · Lithium 400 mg × 60', 'steps: ' || string_agg(e ->> 'line', ' > ' order by (e ->> 'item_version')::int))
  from jsonb_array_elements(public.read(jsonb_build_object('shape', 'item', 'item', '00000000-0000-0000-0000-0000000000e3', 'department_id', :'im')) -> 'entries') e where e ->> 'item' = '00000000-0000-0000-0000-0000000000e3';

\echo '── pack on: a former pharmacist, now a nurse in the ward (which does not tick pharmacy), cannot alter a dispense'
reset role;
savepoint former;
insert into core.holding_ends (organization_id, holding_id) select h.organization_id, h.id from core.holdings h where h.user_id = '00000000-0000-0000-0000-0000000000b6';
insert into core.holdings (organization_id, user_id, role_id, department_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000d6');
set role authenticated;
select t.as(:'pm');
select t.refused(t.w(t.e('pharmacy.dispense', :'pt', '00000000-0000-0000-0000-0000000000d6', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Lithium"},"quantity":{"value":"90","unit":"tablets","ucum":"{tbl}"}}]}}',
  null, null, '00000000-0000-0000-0000-0000000000e4', 'changes')), 'not_allowed', 'written in the ward, where pharmacy''s actions do not count');
select t.refused(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Lithium"},"quantity":{"value":"90","unit":"tablets","ucum":"{tbl}"}}]}}',
  null, null, '00000000-0000-0000-0000-0000000000e4', 'changes')), 'not_allowed', 'written in the pharmacy, where they hold the action no more');
reset role;
rollback to savepoint former;
set role authenticated;

\echo '── pack off: a new dispense is refused; a correction still lands; the record still reads; on again, its table catches up'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin"},"status":"active"}', '00000000-0000-0000-0000-0000000000e5'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine', 'status', 'active'),
    '00000000-0000-0000-0000-0000000000e6', null, '00000000-0000-0000-0000-0000000000e5', 'about'))), 'another order to the pharmacy');
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":[]}}') ->> 'key' as pack_off;
select t.as(:'pm');
select t.refused(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"in-progress","step":"prepared"}', null, null, '00000000-0000-0000-0000-0000000000e6', 'answers')), 'pack_off', 'a new dispense');
reset role;
select t.ok(not core.may('00000000-0000-0000-0000-0000000000b6', 'write:pharmacy.dispense', :'ph') and not core.may_somewhere('00000000-0000-0000-0000-0000000000b6', 'read:pharmacy.queue'),
  'its holders keep none of its actions');
set role authenticated;
select t.as(:'pm');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Lithium"},"dose":{"value":"400","unit":"mg","ucum":"mg"},"quantity":{"value":"30","unit":"tablets","ucum":"{tbl}"}}]}}',
  '00000000-0000-0000-0000-0000000000e9', null, '00000000-0000-0000-0000-0000000000e4', 'changes')), 'a correction by its author still lands (60 was 30; a step corrects by change)');
select t.as(:'ow');
select t.refused(t.w(t.e('pharmacy.dispense', :'pt', :'ph', '{"status":"completed","pharmacy":{"items":[{"drug":{"text":"Lithium"},"quantity":{"value":"20","unit":"tablets","ucum":"{tbl}"}}]}}',
  null, null, '00000000-0000-0000-0000-0000000000e9', 'changes')), 'not_allowed', 'a correction by someone who wrote none of it');
select t.as(:'pm');
select t.landed(t.w(t.e('crossed_out', :'pt', :'ph', '{"reason":"wrong_value"}', null, null, null, null, '00000000-0000-0000-0000-0000000000e9')), 'a cross-out still lands');
select t.as(:'ow');
select t.ok(exists (select 1 from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') e where e ->> 'type' = 'pharmacy.dispense' and e ->> 'line' like 'Dispensed%'), 'the record still reads, with the pack''s line');
reset role;
delete from pharmacy.queue;
select core.drain();
set role authenticated;
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as pack_on;
select t.as(:'pm');
select t.ok(count(*) = 2, 'on again: its table caught up for the organization') from t.rows('pharmacy.queue', :'ph', jsonb_build_object('department_id', :'ph')) r;
reset role;
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live, the pack''s table included');
