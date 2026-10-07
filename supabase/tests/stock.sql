-- the pharmacy's stock (spec §5.3): the clinic's one product list, each place its own minimums; a delivery received, by batch and
-- expiry; what is given comes off by the dispense records (pharmacy.given), never copied; a count adds a row with its reason; a main
-- store sends to a pharmacy in one step (sent there, arrived here, never more of a batch than it has); only through the pack's
-- operations (public.pack_op), for whoever holds the stock action in a place that uses the pack; refused otherwise
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set disp '00000000-0000-0000-0000-0000000000c3'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set pm   '11111111-0000-0000-0000-0000000000b6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set glu  '00000000-0000-0000-0000-00000000aa51'
\set st   '00000000-0000-0000-0000-0000000000d7'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'pharmacy.keep_stock', 'owner_id', :'ph', 'data', '{"keep":true}'::jsonb)) ->> 'key' as keeps;
-- a main store: the pack ticked, Keep stock on; the pharmacist keeps its stock too
select public.save('department', jsonb_build_object('id', :'st', 'name', 'Main store', 'work', 'bench')) ->> 'id' as store;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'st', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'pharmacy.keep_stock', 'owner_id', :'st', 'data', '{"keep":true}'::jsonb)) ->> 'key' as keeps;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b6', 'name', 'Pharmacist', 'login_id', :'pm', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ca01', 'department_id', :'ph'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ca01', 'department_id', :'st')))) ->> 'id' as granted;
set role authenticated;

create or replace function pg_temp.op(p_op text, p_dept uuid, p_args jsonb) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', p_op, 'department_id', p_dept, 'args', p_args))
$$;
create or replace function pg_temp.on_hand(p_product uuid) returns int language sql as $$
  select (p ->> 'on_hand')::int from jsonb_array_elements(pg_temp.op('pharmacy.stock', '00000000-0000-0000-0000-0000000000d3', '{}') -> 'products') p where (p ->> 'id')::uuid = p_product
$$;

\echo '── a product on the clinic''s one list, by whoever holds the stock action somewhere; each place its own minimum'
select t.as(:'pm');
select t.ok(public.write_setting(jsonb_build_object('key', 'pharmacy.product', 'thing_id', :'glu', 'data',
  '{"brand":"Glucophage 500","generic":"Metformin","atc":"A10BA02","strength":"500 mg","form":"tablet","pack_size":30,"unit":"tablets"}'::jsonb)) ->> 'key' = 'pharmacy.product',
  'the pharmacist adds Glucophage 500, box of 30');
select t.ok(public.write_setting(jsonb_build_object('key', 'pharmacy.minimums', 'owner_id', :'ph', 'data', jsonb_build_object('minimums', jsonb_build_object(:'glu', 10)))) ->> 'key' = 'pharmacy.minimums',
  'its minimum at the Pharmacy: 10 boxes');
select t.ok(p -> 'kept' = 'true' and (p ->> 'minimum')::int = 10, 'the Pharmacy keeps it, minimum 10') from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'ph', '{}') -> 'products') p where (p ->> 'id')::uuid = :'glu';
select t.ok(p -> 'kept' = 'false' and p -> 'minimum' = 'null', 'the store does not keep it yet') from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'st', '{}') -> 'products') p where (p ->> 'id')::uuid = :'glu';

\echo '── a delivery: by batch and expiry, in boxes; refused when expired, with no batch, nothing, or a product it does not have'
select t.ok((pg_temp.op('pharmacy.stock_write', :'ph', jsonb_build_object('do', 'receive', 'supplier', 'Ibn Sina Pharma', 'invoice', 'INV-55821', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', '23K114', 'expiry', to_char(current_date + interval '8 months', 'YYYY-MM'), 'boxes', 2)))) ->> 'rows')::int = 1, 'received 2 boxes');
select t.ok(pg_temp.on_hand(:'glu') = 60, 'on hand: 60 tablets');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, '{"do":"receive","lines":[{"product_id":%s,"batch":"OLD1","expiry":"2020-01","boxes":1}]}')$q$, :'ph', to_json(:'glu'::text)), 'expired_already');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, '{"do":"receive","lines":[{"product_id":%s,"batch":" ","expiry":"2030-01","boxes":1}]}')$q$, :'ph', to_json(:'glu'::text)), 'batch_missing');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, '{"do":"receive","lines":[{"product_id":%s,"batch":"B","expiry":"2030-01","boxes":0}]}')$q$, :'ph', to_json(:'glu'::text)), 'nothing_received');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, '{"do":"receive","lines":[{"product_id":"00000000-0000-0000-0000-00000000aa99","batch":"B","expiry":"2030-01","boxes":1}]}')$q$, :'ph'), 'unknown_product');

\echo '── given comes off by the dispense, with its batch; nothing is copied into the stock table'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Metformin","codings":[{"system":"atc","code":"A10BA02"}]},"dosage":{"dose":{"value":"500","unit":"mg","ucum":"mg"},"timing":{"code":"BD"}},"duration_days":7,"status":"active"}',
    '00000000-0000-0000-0000-00000000aa61'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine', 'status', 'active'),
    '00000000-0000-0000-0000-00000000aa62', null, '00000000-0000-0000-0000-00000000aa61', 'about'))), 'metformin sent');
select t.as(:'pm');
select t.landed(t.w(t.e('pharmacy.dispense', :'pt', :'ph', jsonb_build_object('status', 'completed', 'pharmacy', jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
  'drug', '{"text":"Glucophage 500"}'::jsonb, 'quantity', '{"value":"14","unit":"tablets"}'::jsonb, 'product', :'glu', 'batch', '23K114')))),
  null, null, '00000000-0000-0000-0000-00000000aa62', 'answers')), 'given 14 from batch 23K114');
select t.ok(pg_temp.on_hand(:'glu') = 46, 'on hand: 46 (60 received, 14 given)');
select t.ok(b ->> 'batch' = '23K114' and (b ->> 'units')::int = 46, 'by batch: 23K114, 46') from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'ph', '{}') -> 'products') p,
  jsonb_array_elements(p -> 'batches') b where (p ->> 'id')::uuid = :'glu';

\echo '── a count: a difference needs its reason, and is a new row; nothing written before changes'
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, '{"do":"count","lines":[{"product_id":%s,"units":45}]}')$q$, :'ph', to_json(:'glu'::text)), 'reason_missing');
select t.ok((pg_temp.op('pharmacy.stock_write', :'ph', jsonb_build_object('do', 'count', 'lines', jsonb_build_array(jsonb_build_object('product_id', :'glu', 'units', 45, 'reason', 'Damaged')))) ->> 'rows')::int = 1,
  'counted 45: one box damaged');
select t.ok(pg_temp.on_hand(:'glu') = 45, 'on hand: 45');
select t.ok((pg_temp.op('pharmacy.stock_write', :'ph', jsonb_build_object('do', 'count', 'lines', jsonb_build_array(jsonb_build_object('product_id', :'glu', 'units', 45)))) ->> 'rows')::int = 0,
  'counted as expected: nothing to add');
select t.ok(string_agg(m ->> 'kind', ' < ' order by ord) = 'damaged < given < received', 'its movements, newest first: ' || string_agg(m ->> 'kind', ' < ' order by ord))
  from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'ph', jsonb_build_object('product', :'glu')) -> 'moves') with ordinality x(m, ord);

\echo '── the main store sends to the Pharmacy in one step: sent there, arrived here, batch and expiry with it'
select t.ok((pg_temp.op('pharmacy.stock_write', :'st', jsonb_build_object('do', 'receive', 'supplier', 'Ibn Sina Pharma', 'invoice', 'INV-60110', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', '24A031', 'expiry', to_char(current_date + interval '10 months', 'YYYY-MM'), 'boxes', 10)))) ->> 'rows')::int = 1, 'the store received 10 boxes');
select t.ok((pg_temp.op('pharmacy.stock_write', :'st', jsonb_build_object('do', 'send', 'to', :'ph', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', '24A031', 'boxes', 4)))) ->> 'rows')::int = 1, 'sent 4 boxes to the Pharmacy');
select t.ok(pg_temp.on_hand(:'glu') = 165, 'the Pharmacy: 165 (45 + 120 arrived)');
select t.ok((p ->> 'on_hand')::int = 180, 'the store: 180 (300 − 120)') from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'st', '{}') -> 'products') p where (p ->> 'id')::uuid = :'glu';
select t.ok(m ->> 'kind' = 'arrived' and (m ->> 'units')::int = 120 and m ->> 'batch' = '24A031' and m ->> 'expiry' is not null and (m ->> 'other')::uuid = :'st',
  'at the Pharmacy: arrived from the store, 120, its batch and expiry') from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'ph', jsonb_build_object('product', :'glu')) -> 'moves') m limit 1;
select t.ok(m ->> 'kind' = 'sent' and (m ->> 'units')::int = -120 and (m ->> 'other')::uuid = :'ph', 'at the store: sent to the Pharmacy, −120')
  from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'st', jsonb_build_object('product', :'glu')) -> 'moves') m limit 1;
select t.ok(e ->> 'department_id' = :'ph' and (e ->> 'units')::int = 165 and (e ->> 'minimum')::int = 10, 'the store sees what the Pharmacy has of it, against its minimum')
  from jsonb_array_elements(pg_temp.op('pharmacy.stock', :'st', '{}') -> 'elsewhere') e where (e ->> 'product_id')::uuid = :'glu';
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, %L::jsonb)$q$, :'st', jsonb_build_object('do', 'send', 'to', :'ph', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', '24A031', 'boxes', 7)))), 'not_enough');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, %L::jsonb)$q$, :'st', jsonb_build_object('do', 'send', 'to', :'im', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', '24A031', 'boxes', 1)))), 'not_a_stock_place');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, %L::jsonb)$q$, :'st', jsonb_build_object('do', 'send', 'to', :'st', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', '24A031', 'boxes', 1)))), 'not_a_stock_place');
select t.refuses(format($q$select pg_temp.op('pharmacy.stock_write', %L, %L::jsonb)$q$, :'st', jsonb_build_object('do', 'send', 'to', :'ph', 'lines',
  jsonb_build_array(jsonb_build_object('product_id', :'glu', 'batch', 'NOPE', 'boxes', 1)))), 'not_enough');

\echo '── only through its operations, for whoever holds the action, where the pack is used'
select t.as(:'dr');
select t.refuses($q$select pg_temp.op('pharmacy.stock', '00000000-0000-0000-0000-0000000000d3', '{}')$q$, 'not_allowed');
select t.refuses($q$select pg_temp.op('pharmacy.stock', '00000000-0000-0000-0000-0000000000d1', '{}')$q$, 'not_used_here');
select t.refuses($q$select public.pack_op('{"op":"pharmacy.nothing","department_id":"00000000-0000-0000-0000-0000000000d3"}')$q$, 'unknown_op');
select t.refuses($q$select count(*) from pharmacy.stock$q$, 'permission denied');
