-- the pharmacy's stock (spec §5.3): products in its settings; a delivery received, by batch and expiry; what is given comes off by the
-- dispense records (pharmacy.given), never copied; a count adds a row with its reason; only through the pack's operations
-- (public.pack_op), for whoever holds the stock action in a pharmacy that uses the pack; refused otherwise
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set disp '00000000-0000-0000-0000-0000000000c3'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set pm   '11111111-0000-0000-0000-0000000000b6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set glu  '00000000-0000-0000-0000-00000000aa51'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'pharmacy.keep_stock', 'owner_id', :'ph', 'data', '{"keep":true}'::jsonb)) ->> 'key' as keeps;
set role authenticated;

create or replace function pg_temp.op(p_op text, p_dept uuid, p_args jsonb) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', p_op, 'department_id', p_dept, 'args', p_args))
$$;
create or replace function pg_temp.on_hand(p_product uuid) returns int language sql as $$
  select (p ->> 'on_hand')::int from jsonb_array_elements(pg_temp.op('pharmacy.stock', '00000000-0000-0000-0000-0000000000d3', '{}') -> 'products') p where (p ->> 'id')::uuid = p_product
$$;

\echo '── a product, written by whoever holds the stock action there'
select t.as(:'pm');
select t.ok(public.write_setting(jsonb_build_object('key', 'pharmacy.product', 'owner_id', :'ph', 'thing_id', :'glu', 'data',
  '{"brand":"Glucophage 500","generic":"Metformin","atc":"A10BA02","strength":"500 mg","form":"tablet","pack_size":30,"unit":"tablets","minimum":10}'::jsonb)) ->> 'key' = 'pharmacy.product',
  'the pharmacist adds Glucophage 500, box of 30');

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

\echo '── only through its operations, for whoever holds the action, where the pack is used'
select t.as(:'dr');
select t.refuses($q$select pg_temp.op('pharmacy.stock', '00000000-0000-0000-0000-0000000000d3', '{}')$q$, 'not_allowed');
select t.refuses($q$select pg_temp.op('pharmacy.stock', '00000000-0000-0000-0000-0000000000d1', '{}')$q$, 'not_used_here');
select t.refuses($q$select public.pack_op('{"op":"pharmacy.nothing","department_id":"00000000-0000-0000-0000-0000000000d3"}')$q$, 'unknown_op');
select t.refuses($q$select count(*) from pharmacy.stock$q$, 'permission denied');
