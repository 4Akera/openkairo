-- the billing pack (spec §5.4) and the core changes it needs (owner, 2026-10-08: (e) a table that sends no record entries, (f) a pack
-- operation's patients read-logged, (g) Erase reaching a pack's declared tables): prices (a service's, At the order, a department's
-- visit fee) only where billing is used; charges from entries and settings as they stood, void when revoked, crossed out or closed undone;
-- the cashier's lines, payments in cash and by card, discounts from the clinic's reasons, open prices typed, receipts, refunds any day,
-- the desk's scope, the lines a department sends or hands, Pay first's soft check and …anyway, closing a drawer, the day's totals; money
-- only ever added to and never in the record; a department not using billing sees nothing; rebuild = live; Erase
\set im   '00000000-0000-0000-0000-0000000000d1'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set psy  '00000000-0000-0000-0000-0000000000d5'
\set cash '00000000-0000-0000-0000-0000000000d8'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set p2   '00000000-0000-0000-0000-0000000000f2'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set cxr  '00000000-0000-0000-0000-0000000000c2'
\set disp '00000000-0000-0000-0000-0000000000c3'
\set psyc '00000000-0000-0000-0000-0000000000c5'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set tech '11111111-0000-0000-0000-0000000000b2'
\set rec  '11111111-0000-0000-0000-0000000000b4'
\set pm   '11111111-0000-0000-0000-0000000000b6'
\set sal  '11111111-0000-0000-0000-0000000000b8'
\set cr   '11111111-0000-0000-0000-0000000000ba'
\set acc  '11111111-0000-0000-0000-0000000000bc'
select t.fixture();
create function pg_temp.op(p_op text, p_dept uuid, p_args jsonb default '{}') returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', p_op, 'department_id', p_dept, 'args', p_args))
$$;
create function pg_temp.lines(p_patient uuid, p_dept uuid default '00000000-0000-0000-0000-0000000000d8') returns jsonb language sql as $$
  select pg_temp.op('billing.lines', p_dept, jsonb_build_object('patient_id', p_patient))
$$;
-- a charge as the payment card names it
create function pg_temp.charge(p_item uuid, p_dept uuid, p_price text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('item', p_item, 'department_id', p_dept, 'price', p_price))
$$;
grant execute on all functions in schema pg_temp to public;

\echo '── declared: the pack, its block, actions, roles, setups, screens; its charges send no record entries; Erase reaches its money'
select t.ok((select role_block from core.layers where key = 'billing') = 'ce', 'billing''s role ids in its block, ce');
select t.ok((select array_agg(key order by key) from core.actions where layer = 'billing')
  = array['read:billing.accounts', 'read:billing.cashier', 'write:billing.payment', 'write:billing.prices', 'write:billing.refund'], 'its five actions');
select t.ok((select array_agg(r.key || ':' || (select string_agg(a.action, ',' order by a.action) from core.role_actions a where a.role_id = r.id) order by r.key) from core.roles r where r.layer = 'billing')
  = array['billing.accountant:read:billing.accounts,read:billing.cashier,read:patients,write:billing.prices',
          'billing.cashier:read:billing.cashier,read:patients,write:billing.payment,write:billing.refund'], 'the cashier and the accountant, plain roles');
select t.ok(not d.entries and d.action = 'read:billing.cashier', 'billing.charges is declared to send no record entries') from core.derived d where d.key = 'billing.charges';
select t.ok(charges, 'billing declares that it charges (core change (d)): a department using it may show the prices it keeps for its own work') from core.layers where key = 'billing';
select t.ok(not exists (select 1 from pg_attribute a where a.attrelid = 'billing.charges'::regclass and a.attname in ('amount', 'price', 'total') and not a.attisdropped),
  'a charge row holds no amount: its price is read by billing''s operations, as it stood');
select t.ok((select jsonb_object_agg(key, coalesce(to_jsonb(clear), 'null')) from core.stores where layer = 'billing')
  = '{"billing.payments":["patient_id"],"billing.sent":null,"billing.anyway":null}', 'Erase: payments lose the patient, open bills and reasons go');
select t.ok((select jsonb_object_agg(key, patients) from core.ops where layer = 'billing')
  = '{"billing.owed":true,"billing.lines":true,"billing.paid":true,"billing.day":false,"billing.pay":true,"billing.refund":true,"billing.close":false,
      "billing.send":true,"billing.waiting":true,"billing.anyway":true,"billing.chart":true}', 'every operation returning patient ids says so');
select t.ok((select jsonb_object_agg(key, action) from core.ops where layer = 'billing' and key in ('billing.send', 'billing.waiting', 'billing.anyway', 'billing.chart'))
  = '{"billing.send":"read:bench","billing.waiting":"read:bench","billing.anyway":"read:bench","billing.chart":"read:record"}',
  'Send to cashier and …anyway for anyone working the bench (owner, 2026-10-08); the chart''s word for whoever reads the record');
select t.ok(s.work = 'desk' and s.packs = array['billing'] and s.screens = '{"screens":["billing.cashier","billing.today","billing.prices"],"opens":"billing.cashier"}'
  and s.settings -> 'billing.desk' ->> 'takes' = 'everyone', 'the Cashier setup: a desk of its own, takes everyone''s payments') from core.setups s where s.key = 'billing.cashier';
select t.ok((select array_agg(key || ':' || work order by key) from core.setups where layer = 'billing' and key <> 'billing.cashier') = array['billing.bench:bench', 'billing.clinic:visits'],
  'and a clinic and a bench that bill');
select t.ok((select array_agg(key || ':' || work || ':' || coalesce(action, '') order by key) from core.screens where layer = 'billing')
  = array['billing.cashier:any:read:billing.cashier', 'billing.prices:any:write:billing.prices', 'billing.today:any:read:billing.cashier'], 'its three screens, for any work');

\echo '── on: the main Cashier from its setup, Internal Medicine and the Lab tick billing; Psychiatry does not'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","billing"]}}') ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'billing.cashier', 'department_id', :'cash', 'name', 'Cashier', 'apply', true)) ->> 'created' as cashier_made;
select public.setup(jsonb_build_object('setup', 'billing.clinic', 'department_id', :'im', 'apply', true)) ->> 'setup' as im_bills;
select public.setup(jsonb_build_object('setup', 'billing.bench', 'department_id', :'lab', 'apply', true)) ->> 'setup' as lab_bills;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000ba', 'name', 'Cashier Mona', 'login_id', :'cr', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ce01', 'department_id', :'cash')))) ->> 'id' as cashier;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000bc', 'name', 'Accountant Wael', 'login_id', :'acc', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ce02')))) ->> 'id' as accountant;
select t.ok(core.department_uses(o, :'cash', 'billing') and core.department_uses(o, :'im', 'billing') and core.department_uses(o, :'lab', 'billing')
  and not core.department_uses(o, :'psy', 'billing') and core.setting_at(o, 'billing.desk', :'cash') ->> 'takes' = 'everyone',
  'billing used at the Cashier (everyone''s), Internal Medicine and the Lab; not Psychiatry')
  from (select '00000000-0000-0000-0000-0000000000a1'::uuid o) x;
set role authenticated;

\echo '── prices: Billing → Prices, by whoever sets them, only where billing is used; one a service, a price or At the order'
select t.as(:'acc');
select t.ok(public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', :'lab', 'data', jsonb_build_object('service_id', :'cbc', 'price', '80.00'))) ->> 'key' = 'billing.price',
  'the accountant prices the CBC at 80.00');
select t.ok(public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', :'lab', 'data', jsonb_build_object('service_id', :'cxr', 'at_order', true))) ->> 'key' = 'billing.price',
  'and the chest X-ray At the order');
select t.ok(public.write_setting(jsonb_build_object('key', 'billing.visit_fee', 'owner_id', :'im', 'data', '{"amount":"150"}'::jsonb)) ->> 'key' = 'billing.visit_fee',
  'Internal Medicine''s visit fee, 150');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '90.00')))$q$, :'lab', :'cbc'), 'already_priced');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '9', 'at_order', true)))$q$, :'lab', :'cbc'), 'price_or_order');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L)))$q$, :'lab', :'cbc'), 'price_or_order');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '9.999')))$q$, :'lab', :'cbc'), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '10000000.01')))$q$, :'lab', :'cbc'), 'too_much');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '5')))$q$, :'lab', :'disp'), 'not_its_service');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.visit_fee', 'owner_id', %L, 'data', '{"amount":"200"}'::jsonb))$q$, :'im'), 'already_priced');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '300')))$q$, :'psy', :'psyc'), 'not_allowed');
select t.as(:'cr');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '1')))$q$, :'lab', :'cxr'), 'not_allowed');

\echo '── charges: from entries and settings only, heard after commit; a visit fee at check-in there (owner, 2026-10-08), each priced service as ordered'
select t.as(:'rec');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e100', :'pt', :'desk', :'im'), 'Ahmed checked in to Internal Medicine');
select t.ok(public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p2', 'given', jsonb_build_array('Soad'), 'family', 'Ali',
  'gender', 'female', 'birth_date', '1980-05-02'))) -> 'patient' ->> 'id' = :'p2', 'and Soad registered');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok(jsonb_array_length(l -> 'charges') = 1 and l -> 'charges' -> 0 ->> 'kind' = 'visit' and (l -> 'charges' -> 0 ->> 'department_id')::uuid = :'im'
  and l -> 'charges' -> 0 ->> 'amount' = '150.00' and l ->> 'desk' = 'everyone', 'checked in, not yet seen: the visit fee is charged already, at check-in, 150.00')
  from pg_temp.lines(:'pt') l;
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-00000000e100', :'im')), 'called');
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', :'im', '{"kind":"progress","text":"cough for a week"}', null, '00000000-0000-0000-0000-00000000e100'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'), 'department_id', :'lab',
    'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-00000000e105', '00000000-0000-0000-0000-00000000e100'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cxr', 'code', 'cxr', 'name', 'Chest X-ray'), 'department_id', :'lab',
    'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-00000000e106', '00000000-0000-0000-0000-00000000e100'))),
  'seen: a note after the call, a CBC and a chest X-ray sent to the Lab');
reset role;
select t.ok(not exists (select 1 from billing.charges where item in ('00000000-0000-0000-0000-00000000e105', '00000000-0000-0000-0000-00000000e106')),
  'nothing charged in the writer''s own transaction: billing listens after commit');
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok(jsonb_array_length(l -> 'charges') = 3
  and exists (select 1 from jsonb_array_elements(l -> 'charges') c where c ->> 'kind' = 'visit' and (c ->> 'department_id')::uuid = :'im' and c ->> 'amount' = '150.00')
  and exists (select 1 from jsonb_array_elements(l -> 'charges') c where c ->> 'name' = 'Complete blood count' and (c ->> 'department_id')::uuid = :'lab' and c ->> 'amount' = '80.00')
  and exists (select 1 from jsonb_array_elements(l -> 'charges') c where c ->> 'name' = 'Chest X-ray' and c -> 'at_order' = 'true' and not c ? 'amount'),
  'the cashier''s lines: the visit fee 150.00, the CBC 80.00, the chest X-ray unpriced (At the order)') from pg_temp.lines(:'pt') l;

\echo '── a later price is for later orders; void when revoked, crossed out or closed undone; a department not using billing still orders priced work'
reset role;
select thing_id as cbc_price from core.settings where key = 'billing.price' and data ->> 'service_id' = :'cbc' limit 1 \gset
set role authenticated;
select t.as(:'acc');
select t.ok(public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', :'lab', 'thing_id', :'cbc_price', 'data', jsonb_build_object('service_id', :'cbc', 'price', '95.00'))) ->> 'key' = 'billing.price',
  'the CBC''s price changes to 95.00');
select t.as(:'dr');
create function pg_temp.cbc(p_id uuid, p_patient uuid default '00000000-0000-0000-0000-0000000000f1', p_dept uuid default '00000000-0000-0000-0000-0000000000d1') returns jsonb language sql as $$
  select t.e('order', p_patient, p_dept, jsonb_build_object('service', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c1', 'code', 'cbc', 'name', 'Complete blood count'),
    'department_id', '00000000-0000-0000-0000-0000000000d2', 'priority', 'routine', 'status', 'active'), p_id)
$$;
grant execute on function pg_temp.cbc(uuid, uuid, uuid) to public;
select t.landed(t.w(jsonb_build_array(pg_temp.cbc('00000000-0000-0000-0000-00000000e107'), pg_temp.cbc('00000000-0000-0000-0000-00000000e108'),
  pg_temp.cbc('00000000-0000-0000-0000-00000000e109'))), 'three more CBCs');
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'), 'department_id', :'lab',
  'priority', 'routine', 'status', 'revoked'), null, null, '00000000-0000-0000-0000-00000000e107', 'changes')), 'one revoked');
select t.landed(t.w(t.e('crossed_out', :'pt', :'im', '{"reason":"typo"}', null, null, null, null, '00000000-0000-0000-0000-00000000e108')), 'one crossed out');
select t.as(:'tech');
select t.landed(t.w(t.e('step', :'pt', :'lab', '{"status":"rejected","reason":"no sample"}', null, null, '00000000-0000-0000-0000-00000000e109', 'answers')), 'one rejected at the Lab');
select t.as(:'sal');
select t.landed(t.w(pg_temp.cbc('00000000-0000-0000-0000-00000000e10a', :'p2', :'psy')), 'Psychiatry (no billing) sends Soad''s CBC to the Lab');
reset role;
select core.drain() as drained;
select t.ok((select jsonb_object_agg(item, open) from billing.charges where item in ('00000000-0000-0000-0000-00000000e107', '00000000-0000-0000-0000-00000000e108', '00000000-0000-0000-0000-00000000e109'))
  = '{"00000000-0000-0000-0000-00000000e107":false,"00000000-0000-0000-0000-00000000e108":false,"00000000-0000-0000-0000-00000000e109":false}', 'revoked, crossed out, rejected: void');
select t.ok(c.department_id = :'lab' and c.from_department_id = :'psy' and c.open, 'Soad''s CBC is the Lab''s charge, though Psychiatry does not bill (the screen there shows no money)')
  from billing.charges c where c.item = '00000000-0000-0000-0000-00000000e10a';
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');
set role authenticated;
select t.as(:'cr');
select t.ok((select string_agg(c ->> 'amount', ',' order by c ->> 'at') from jsonb_array_elements(pg_temp.lines(:'pt') -> 'charges') c where c ->> 'name' = 'Complete blood count') = '80.00',
  'the first CBC keeps 80.00; the others are void');
select t.as(:'dr');
select t.landed(t.w(pg_temp.cbc('00000000-0000-0000-0000-00000000e10b')), 'a CBC after the change');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok((select string_agg(c ->> 'amount', ',' order by c ->> 'item') from jsonb_array_elements(pg_temp.lines(:'pt') -> 'charges') c where c ->> 'name' = 'Complete blood count') = '80.00,95.00',
  'a later order takes the later price: 80.00 and 95.00');

\echo '── money never reaches the record: a charge row has no amount and sends no record entries, whoever asks'
select t.ok(r -> 'entries' = '{}' and not exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ? 'source_entries') and jsonb_array_length(r -> 'rows') >= 5,
  'the cashier asking billing.charges with its entries gets rows, no entries, no source ids')
  from public.read(jsonb_build_object('shape', 'table', 'table', 'billing.charges', 'department_id', :'cash', 'entries', true, 'where', jsonb_build_object('patient_id', :'pt'))) r;
select t.as(:'dr');
select t.refuses(format($q$select public.read(jsonb_build_object('shape', 'table', 'table', 'billing.charges', 'department_id', %L))$q$, :'im'), 'not_allowed');
select t.ok(jsonb_array_length(r -> 'tables' -> 'billing.charges' -> 'rows') >= 5 and r -> 'tables' -> 'billing.charges' -> 'entries' = '{}'
  and not (r -> 'tables' -> 'billing.charges')::text ~ '"(amount|price|source_entries)"', 'the doctor''s record read: charge rows with no amount, no entries, no source ids')
  from t.record(:'pt', :'im') r;

\echo '── taking payment: the lines ticked, an open price typed, a discount from the clinic''s reasons only, cash with change or card, the card''s total'
select t.as(:'ow');
select public.write_setting('{"key":"billing.reasons","data":{"reasons":["Staff","Charity"]}}') ->> 'key' as reasons;
select public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', :'cash', 'data', '{"takes":"everyone","float":"500.00"}'::jsonb)) ->> 'key' as float;
select t.as(:'cr');
create function pg_temp.pay(p_patient uuid, p_args jsonb, p_dept uuid default '00000000-0000-0000-0000-0000000000d8') returns jsonb language sql as $$
  select pg_temp.op('billing.pay', p_dept, jsonb_build_object('patient_id', p_patient) || p_args)
$$;
grant execute on function pg_temp.pay(uuid, jsonb, uuid) to public;
\set visit '{"item":"00000000-0000-0000-0000-00000000e100","department_id":"00000000-0000-0000-0000-0000000000d1"}'
\set cbc1  '{"item":"00000000-0000-0000-0000-00000000e105","department_id":"00000000-0000-0000-0000-0000000000d2"}'
\set xray  '{"item":"00000000-0000-0000-0000-00000000e106","department_id":"00000000-0000-0000-0000-0000000000d2"}'
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s,%s],"total":"200.00"}')$q$, :'pt', :'visit', :'cbc1'), 'total_changed');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s]}')$q$, :'pt', :'xray'), 'price_missing');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[{"item":"00000000-0000-0000-0000-00000000e106","department_id":"%s","price":"10000001"}]}')$q$, :'pt', :'lab'), 'price_missing');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[{"item":"00000000-0000-0000-0000-00000000e105","department_id":"%s","price":"10"}]}')$q$, :'pt', :'lab'), 'not_open_price');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s],"discount":{"amount":"81","reason":"Staff"}}')$q$, :'pt', :'cbc1'), 'bad_discount');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s],"discount":{"amount":"1.234","reason":"Staff"}}')$q$, :'pt', :'cbc1'), 'bad_discount');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s],"discount":{"amount":"10","reason":"My friend"}}')$q$, :'pt', :'cbc1'), 'unknown_reason');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s],"received":"50"}')$q$, :'pt', :'cbc1'), 'not_enough_cash');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s],"method":"cheque"}')$q$, :'pt', :'cbc1'), 'bad_method');
select t.refuses(format($q$select pg_temp.pay(%L, '{}')$q$, :'pt'), 'nothing_to_pay');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[{"item":"00000000-0000-0000-0000-00000000e10a","department_id":"%s"}]}')$q$, :'pt', :'lab'), 'not_found');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[{"item":"00000000-0000-0000-0000-00000000e107","department_id":"%s"}]}')$q$, :'pt', :'lab'), 'charge_void');
select t.ok(r ->> 'receipt' = 'R-00001' and (r ->> 'total')::numeric = 510 and (r ->> 'change')::numeric = 90,
  'Ahmed pays his visit, the CBC and the chest X-ray (typed 300.00), less 20 for Staff: 510.00 in cash, 600 received, 90 change, receipt R-00001')
  from pg_temp.pay(:'pt', format('{"charges":[%s,%s,{"item":"00000000-0000-0000-0000-00000000e106","department_id":"%s","price":"300"}],"discount":{"amount":"20","reason":"Staff"},"received":"600","total":"510.00"}',
    :'visit', :'cbc1', :'lab')::jsonb) r;
reset role;
select t.ok(p.method = 'cash' and p.discount = 20 and p.discount_reason = 'Staff' and p.day = (now() at time zone 'Africa/Cairo')::date and p.department_id = :'cash'
  and p.author_id = '00000000-0000-0000-0000-0000000000ba', 'kept: cash, the discount and its reason, the clinic''s day, the desk, who took it') from billing.payments p where p.receipt = 'R-00001';
select t.ok((select string_agg(kind || ':' || coalesce(name, 'visit') || ':' || amount || ':' || typed, ' | ' order by n) from billing.payment_lines l join billing.payments p on p.id = l.payment_id where p.receipt = 'R-00001')
  = 'charge:visit:150.00:false | charge:Complete blood count:80.00:false | charge:Chest X-ray:300.00:true', 'its lines, the typed price marked as typed (the payment''s who and when)');
set role authenticated;
select t.as(:'cr');
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s]}')$q$, :'pt', :'cbc1'), 'already_paid');
select t.ok(jsonb_array_length(l -> 'charges') = 1 and l -> 'charges' -> 0 ->> 'amount' = '95.00', 'what is left: the later CBC, 95.00') from pg_temp.lines(:'pt') l;

\echo '── who owes: one row a patient, paged and grouped here (nobody drops out), searched by patient; the three views'' counts'
select t.ok((o ->> 'count')::int = 2 and jsonb_array_length(o -> 'rows') = 1 and (o -> 'more')::boolean and (o ->> 'paid')::int = 1
  and (o -> 'rows' -> 0 ->> 'patient_id')::uuid = :'pt' and (o -> 'rows' -> 0 ->> 'total')::numeric = 95,
  'two owe; a page of one: Ahmed (the newest), 95.00, more to come; one paid today') from pg_temp.op('billing.owed', :'cash', '{"limit":1}') o;
select t.ok(jsonb_array_length(o2 -> 'rows') = 1 and (o2 -> 'rows' -> 0 ->> 'patient_id')::uuid = :'p2' and not (o2 -> 'more')::boolean,
  'the next page: Soad, her CBC at the Lab, and no more')
  from pg_temp.op('billing.owed', :'cash', '{"limit":1}') o, lateral pg_temp.op('billing.owed', :'cash', jsonb_build_object('limit', 1, 'after',
    jsonb_build_object('at', o -> 'rows' -> 0 -> 'last_at', 'patient_id', o -> 'rows' -> 0 -> 'patient_id'))) o2;
select t.ok(jsonb_array_length(o -> 'rows') = 1 and (o -> 'rows' -> 0 ->> 'patient_id')::uuid = :'p2' and (o -> 'rows' -> 0 ->> 'services')::int = 1,
  'searched: Soad only') from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p2'))) o;
select t.ok(r ->> 'receipt' = 'R-00002' and r ->> 'method' = 'card' and (r ->> 'total')::numeric = 85 and r -> 'change' = 'null',
  'Soad pays her CBC (95.00, ordered after the change) by card, 10 waived for Charity: R-00002, 85.00')
  from pg_temp.pay(:'p2', format('{"method":"card","charges":[{"item":"00000000-0000-0000-0000-00000000e10a","department_id":"%s"}],"discount":{"amount":"10","reason":"Charity"}}', :'lab')::jsonb) r;
select t.ok(jsonb_array_length(p -> 'payments') = 2 and p -> 'payments' -> 0 ->> 'receipt' = 'R-00002' and p -> 'payments' -> 0 ->> 'by' = 'Cashier Mona'
  and jsonb_array_length(p -> 'payments' -> 1 -> 'lines') = 3, 'paid today at this desk: both receipts, newest first, each with its lines and who took it')
  from pg_temp.op('billing.paid', :'cash') p;
select t.ok(p -> 'payments' -> 0 ->> 'receipt' = 'R-00001', 'a receipt found by its number') from pg_temp.op('billing.paid', :'cash', '{"receipt":"r-00001"}') p;
select t.ok(jsonb_array_length(p -> 'payments') = 1, 'and by its patient') from pg_temp.op('billing.paid', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p2'))) p;

\echo '── Pay first, a soft check: words for the orders waiting at the Lab, never a refusal; …anyway with a reason; off, the words go at once'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'lab', 'data', '{"on":true}'::jsonb)) ->> 'key' as pay_first;
select t.as(:'tech');
create function pg_temp.waiting(p_orders text[]) returns jsonb language sql as $$
  select pg_temp.op('billing.waiting', '00000000-0000-0000-0000-0000000000d2', jsonb_build_object('orders', to_jsonb(p_orders)))
$$;
grant execute on function pg_temp.waiting(text[]) to public;
select t.ok(w -> 'waiting' = '["00000000-0000-0000-0000-00000000e10b"]' and not w ? 'own' and not w::text ~ '"(amount|price|total|paid)"',
  'at the Lab: Ahmed''s later CBC waits for payment; the two paid do not; words only, no amount')
  from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e105', '00000000-0000-0000-0000-00000000e10b', '00000000-0000-0000-0000-00000000e10a', '00000000-0000-0000-0000-00000000e107']) w;
select t.as(:'cr');
select t.ok(l -> 'waiting' = jsonb_build_array(:'lab') and not (l -> 'before_payment')::boolean, 'the cashier''s card: the Lab is waiting (the later CBC, unpaid)')
  from pg_temp.lines(:'pt') l;
select t.as(:'tech');
select t.landed(t.w(t.e('step', :'pt', :'lab', '{"status":"in-progress","step":"collected"}', null, null, '00000000-0000-0000-0000-00000000e10b', 'answers')),
  'the writer never refuses waiting work: collected anyway');
select t.refuses($$select pg_temp.op('billing.anyway', '00000000-0000-0000-0000-0000000000d2', '{"order_item":"00000000-0000-0000-0000-00000000e10b","reason":"  "}')$$, 'reason_missing');
select t.refuses($$select pg_temp.op('billing.anyway', '00000000-0000-0000-0000-0000000000d2', '{"order_item":"00000000-0000-0000-0000-00000000e100","reason":"emergency"}')$$, 'not_found');
select t.ok((r -> 'patient_ids' ->> 0)::uuid = :'pt', 'Collect anyway…: the reason kept by billing, with who and when')
  from pg_temp.op('billing.anyway', :'lab', '{"order_item":"00000000-0000-0000-0000-00000000e10b","reason":"emergency: chest pain"}') r;
select t.ok(w -> 'waiting' = '[]' and w -> 'ahead' = '["00000000-0000-0000-0000-00000000e10b"]' and (w -> 'pay_first')::boolean and w ->> 'desk' = 'none',
  'gone ahead: with Pay first still on it waits no more, for this screen and after a reload; Pay first and the desk as they stand')
  from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e10b']) w;
select t.as(:'cr');
select t.ok((l -> 'before_payment')::boolean and l -> 'waiting' = '[]', 'the cashier''s card: done before payment; the Lab no longer waits for it (gone ahead)') from pg_temp.lines(:'pt') l;
select t.ok((o -> 'rows' -> 0 -> 'before_payment')::boolean and o -> 'rows' -> 0 -> 'waiting' = '[]', 'and the row: "done before payment", no "Laboratory is waiting"')
  from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'pt'))) o;
reset role;
select t.ok(a.reason = 'emergency: chest pain' and a.author_id = '00000000-0000-0000-0000-0000000000b2' and a.department_id = :'lab', 'billing.anyway: the order, the reason, who')
  from billing.anyway a where a.order_item = '00000000-0000-0000-0000-00000000e10b';
select t.ok(not exists (select 1 from core.entries e where e.data::text ~ 'chest pain|R-0000|"price"|"amount"'), 'none of it is in the record: no reason, receipt or amount in any entry');
set role authenticated;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'lab', 'data', '{"on":false}'::jsonb)) ->> 'key' as pay_after;
select t.as(:'tech');
select t.ok(w -> 'waiting' = '[]', 'Pay first off: nothing waits, at once') from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e10b']) w;

\echo '── a refund, any day: a payment of its own naming the one it undoes, its reason, its own number; once; what it paid is owed again'
select t.as(:'cr');
reset role;
select id as r1 from billing.payments where receipt = 'R-00001' \gset
set role authenticated;
select t.refuses(format($q$select pg_temp.op('billing.refund', %L, '{"payment_id":"%s"}')$q$, :'cash', :'r1'), 'reason_missing');
select t.ok(r ->> 'receipt' = 'R-00003' and (r ->> 'total')::numeric = -510 and r ->> 'refund_of' = 'R-00001', 'R-00001 given back: R-00003, -510.00')
  from pg_temp.op('billing.refund', :'cash', jsonb_build_object('payment_id', :'r1', 'reason', 'the patient was charged twice')) r;
select t.refuses(format($q$select pg_temp.op('billing.refund', %L, '{"payment_id":"%s","reason":"again"}')$q$, :'cash', :'r1'), 'already_refunded');
reset role;
select id as r3 from billing.payments where receipt = 'R-00003' \gset
set role authenticated;
select t.refuses(format($q$select pg_temp.op('billing.refund', %L, '{"payment_id":"%s","reason":"back"}')$q$, :'cash', :'r3'), 'is_a_refund');
select t.ok(jsonb_array_length(l -> 'charges') = 4 and exists (select 1 from jsonb_array_elements(l -> 'charges') c where c ->> 'name' = 'Chest X-ray' and c -> 'at_order' = 'true'),
  'the visit, both CBCs and the chest X-ray (unpriced again) are owed again') from pg_temp.lines(:'pt') l;
reset role;
select t.ok((select string_agg(l.amount::text, ',' order by l.n) from billing.payment_lines l where l.payment_id = :'r3') = '-150.00,-80.00,-300.00', 'its lines below nothing');
-- a payment taken yesterday (written here as the table keeps it), given back today
insert into billing.payments (organization_id, id, receipt, department_id, patient_id, method, total, author_id, at, day)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f0f0', 'R-00099', :'cash', :'p2', 'cash', 40, '00000000-0000-0000-0000-0000000000ba',
        now() - interval '1 day', ((now() - interval '1 day') at time zone 'Africa/Cairo')::date);
set role authenticated;
select t.ok((r ->> 'total')::numeric = -40, 'yesterday''s R-00099 given back today') from pg_temp.op('billing.refund', :'cash', '{"payment_id":"00000000-0000-0000-0000-00000000f0f0","reason":"returned"}') r;

\echo '── only ever added to: a mistake is a new row; nobody but the eraser changes or removes one'
reset role;
select t.ok(t.try('update billing.payments set total = 0') like 'P0001 payments are only ever added to%', 'a payment never changes');
select t.ok(t.try('delete from billing.payment_lines') like 'P0001 payment_lines are only ever added to%', 'a payment''s line never goes');
select t.ok(t.try('truncate billing.drawers') like 'P0001 drawers are only ever added to%', 'nor a drawer''s closing');
select t.ok(t.try('truncate billing.sent') like 'P0001 sent are only ever added to%' and t.try('update billing.anyway set reason = null') like 'P0001 anyway are only ever added to%',
  'nor a line sent, nor a reason for going ahead');
select t.ok(not has_table_privilege('authenticated', 'billing.payments', 'SELECT,INSERT,UPDATE,DELETE') and not has_function_privilege('authenticated', 'billing.pay(uuid,uuid,uuid,jsonb)', 'EXECUTE'),
  'the API reaches billing only through public.pack_op');

\echo '── the desk''s scope: a Lab that takes its own charges takes only those; a department that takes no payment takes none'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', :'lab', 'data', '{"takes":"own"}'::jsonb)) ->> 'key' as lab_takes_own;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b2', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c005', 'department_id', :'lab'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ce01', 'department_id', :'lab')))) ->> 'id' as tech_takes_payment;
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s]}', %L)$q$, :'pt', :'visit', :'im'), 'not_a_desk');
select t.as(:'tech');
select t.ok(jsonb_array_length(l -> 'charges') = 3 and not exists (select 1 from jsonb_array_elements(l -> 'charges') c where c ->> 'kind' = 'visit') and l ->> 'desk' = 'own',
  'at the Lab''s desk: only the Lab''s three, not the visit fee') from pg_temp.lines(:'pt', :'lab') l;
select t.refuses(format($q$select pg_temp.pay(%L, '{"charges":[%s]}', %L)$q$, :'pt', :'visit', :'lab'), 'not_this_desk');
select t.ok(r ->> 'receipt' = 'R-00005', 'the Lab takes its own CBC at its counter: the clinic''s next receipt, R-00005')
  from pg_temp.pay(:'pt', format('{"charges":[{"item":"00000000-0000-0000-0000-00000000e10b","department_id":"%s"}]}', :'lab')::jsonb, :'lab') r;
select t.ok(jsonb_array_length(p -> 'payments') = 1, 'the Lab''s Paid today: its own receipt only') from pg_temp.op('billing.paid', :'lab') p;
select t.as(:'cr');
select t.ok(not exists (select 1 from jsonb_array_elements(pg_temp.lines(:'pt') -> 'charges') c where c ->> 'item' = '00000000-0000-0000-0000-00000000e10b'),
  'paid once, wherever it is taken: gone from the main cashier''s card too');
select t.as(:'sal');
select t.refuses(format($q$select pg_temp.op('billing.owed', %L)$q$, :'psy'), 'not_used_here');
select t.as(:'dr');
select t.refuses(format($q$select pg_temp.op('billing.owed', %L)$q$, :'im'), 'not_allowed');

\echo '── a department''s own priced lines: Send to cashier (an open bill), a resend replaces what was not paid; Pay at a counter that takes payment'
select t.as(:'ow');
select public.setup(jsonb_build_object('setup', 'billing.bench', 'department_id', :'ph', 'apply', true)) ->> 'setup' as pharmacy_bills;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy","billing"]}'::jsonb)) ->> 'key' as ticked;
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Augmentin 1 g"},"status":"active"}', '00000000-0000-0000-0000-00000000e120'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine',
    'status', 'active'), '00000000-0000-0000-0000-00000000e121', null, '00000000-0000-0000-0000-00000000e120', 'about'),
  t.e('medication', :'pt', :'im', '{"basis":"prescribed","drug":{"text":"Nexium 40"},"status":"active"}', '00000000-0000-0000-0000-00000000e122'),
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph', 'priority', 'routine',
    'status', 'active'), '00000000-0000-0000-0000-00000000e123', null, '00000000-0000-0000-0000-00000000e122', 'about'))), 'two prescriptions sent to the Pharmacy');
select t.as(:'pm');
select t.refuses($$select pg_temp.op('billing.send', '00000000-0000-0000-0000-0000000000d3', '{"patient_id":"00000000-0000-0000-0000-0000000000f1","lines":[{"name":" ","quantity":1,"amount":"5"}]}')$$, 'bad_line');
select t.refuses($$select pg_temp.op('billing.send', '00000000-0000-0000-0000-0000000000d3', '{"patient_id":"00000000-0000-0000-0000-0000000000f1","lines":[{"name":"x","quantity":1,"amount":"-5"}]}')$$, 'bad_line');
select t.refuses($$select pg_temp.op('billing.send', '00000000-0000-0000-0000-0000000000d3', '{"patient_id":"00000000-0000-0000-0000-0000000000f1","lines":[{"name":"x","quantity":1,"amount":"5","order_item":"00000000-0000-0000-0000-00000000e105"}]}')$$, 'not_found');
select t.refuses($$select pg_temp.op('billing.send', '00000000-0000-0000-0000-0000000000d3', '{"patient_id":"00000000-0000-0000-0000-0000000000f1","lines":[]}')$$, 'nothing_to_send');
select t.ok((r ->> 'lines')::int = 2, 'the pharmacist sends Augmentin (its order) and a box of Panadol to the cashier')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f1","lines":[{"name":"Augmentin 1 g","quantity":1,"amount":"96","order_item":"00000000-0000-0000-0000-00000000e121"},{"name":"Panadol Extra","quantity":"2","amount":"30.50"}]}') r;
select t.ok((r ->> 'lines')::int = 1, 'then Augmentin again: two boxes now')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f1","lines":[{"name":"Augmentin 1 g","quantity":2,"amount":"192","order_item":"00000000-0000-0000-0000-00000000e121"}]}') r;
select t.as(:'cr');
select t.ok((select string_agg(x ->> 'name' || ' × ' || trim_scale((x ->> 'quantity')::numeric) || ' ' || (x ->> 'amount'), ', ' order by x ->> 'name') from jsonb_array_elements(l -> 'sent') x)
  = 'Augmentin 1 g × 2 192.00, Panadol Extra × 2 30.50' and (select bool_and((x ->> 'department_id')::uuid = :'ph') from jsonb_array_elements(l -> 'sent') x),
  'the main cashier: the Pharmacy''s lines as sent, the resend in place of what it replaced') from pg_temp.lines(:'pt') l;
select t.ok((r ->> 'total')::numeric = 222.50, 'taken with the rest of the visit')
  from pg_temp.pay(:'pt', jsonb_build_object('sent', (select jsonb_agg(x -> 'id') from jsonb_array_elements(pg_temp.lines(:'pt') -> 'sent') x))) r;
select t.ok(jsonb_array_length(pg_temp.lines(:'pt') -> 'sent') = 0, 'nothing sent is owed now');
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', :'ph', 'data', '{"takes":"own"}'::jsonb)) ->> 'key' as pharmacy_takes_own;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b6', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ca01', 'department_id', :'ph'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ce01', 'department_id', :'ph')))) ->> 'id' as pharmacist_takes_payment;
select t.as(:'pm');
select t.refuses($$select pg_temp.pay('00000000-0000-0000-0000-0000000000f1', '{"handed":[{"name":"Nexium 40","quantity":1,"amount":"75","order_item":"00000000-0000-0000-0000-00000000e10b"}]}', '00000000-0000-0000-0000-0000000000d3')$$, 'not_found');
select t.ok((r ->> 'total')::numeric = 75 and r ->> 'method' = 'card', 'Pay at the Pharmacy''s counter: the Nexium its row hands, by card')
  from pg_temp.pay(:'pt', '{"method":"card","handed":[{"name":"Nexium 40","quantity":1,"amount":"75","order_item":"00000000-0000-0000-0000-00000000e123"}]}', :'ph') r;
select t.ok(w -> 'own' -> '00000000-0000-0000-0000-00000000e123' ->> 'paid' = '75.00' and w -> 'own' -> '00000000-0000-0000-0000-00000000e123' ->> 'sent' = '0'
  and w -> 'own' -> '00000000-0000-0000-0000-00000000e123' -> 'lines' -> 0 ->> 'name' = 'Nexium 40', 'its order''s own lines, paid, for its row and the soft check')
  from pg_temp.op('billing.waiting', :'ph', '{"orders":["00000000-0000-0000-0000-00000000e123"],"lines":true}') w;
reset role;
select t.ok((select string_agg(kind || ':' || name || ':' || quantity || ':' || amount, ',') from billing.payment_lines l join billing.payments p on p.id = l.payment_id
  where p.department_id = :'ph') = 'handed:Nexium 40:1.00:75.00', 'kept as handed: a name, a quantity, an amount; who took it is the payment''s');

\echo '── closing a drawer: the float and the cash taken since the last closing (given back included), counted; a difference needs its reason'
select t.as(:'cr');
select t.ok((d -> 'drawer' ->> 'float')::numeric = 500 and (d -> 'drawer' ->> 'cash')::numeric = 222.50 and (d -> 'drawer' ->> 'expected')::numeric = 722.50,
  'Mona''s drawer: float 500 + cash 222.50 (taken, given back and taken again) = 722.50 expected') from pg_temp.op('billing.day', :'cash') d;
select t.refuses(format($q$select pg_temp.op('billing.close', %L, '{"counted":"700"}')$q$, :'cash'), 'reason_missing');
select t.refuses(format($q$select pg_temp.op('billing.close', %L, '{"counted":"seven"}')$q$, :'cash'), 'drawer_count');
select t.ok((r ->> 'difference')::numeric = -22.50, 'closed: 700 counted, 22.50 short, with its reason')
  from pg_temp.op('billing.close', :'cash', '{"counted":"700","reason":"change given twice"}') r;
select t.ok((d -> 'drawer' ->> 'cash')::numeric = 0 and (d -> 'drawer' ->> 'expected')::numeric = 500 and (d -> 'closings' -> 0 ->> 'reason') = 'change given twice',
  'the next drawer starts from the float; the closing is kept with its reason') from pg_temp.op('billing.day', :'cash') d;

\echo '── today: taken, cash and card, waived and why, given back; a row a cashier and a department; the clinic''s for whoever reads every desk'
select t.ok((d ->> 'taken')::numeric = 817.50 and (d ->> 'receipts')::int = 3 and (d ->> 'cash')::numeric = 182.50 and (d ->> 'card')::numeric = 85
  and (d ->> 'given_back')::numeric = -550 and (d ->> 'refunds')::int = 2 and (d ->> 'waived')::numeric = 10 and d -> 'reasons' = '[{"count": 1, "amount": 10.00, "reason": "Charity"}]',
  'the Cashier today: 817.50 taken in 3 receipts, cash 182.50, card 85.00, 550.00 given back, 10.00 waived for Charity (the refunded discount no longer counts)')
  from pg_temp.op('billing.day', :'cash') d;
select t.ok(jsonb_array_length(d -> 'cashiers') = 1 and d -> 'cashiers' -> 0 ->> 'by' = 'Cashier Mona' and (d -> 'cashiers' -> 0 ->> 'receipts')::int = 3,
  'a row a cashier') from pg_temp.op('billing.day', :'cash') d;
select t.ok((select jsonb_object_agg(x ->> 'department_id', (x ->> 'amount')::numeric) from jsonb_array_elements(d -> 'departments') x)
  = jsonb_build_object(:'im', 0.00, :'lab', 85.00, :'ph', 222.50),
  'a row a department whose work was paid, each payment''s discount shared among its lines: the Lab''s CBC 85.00 (95 less 10 waived), R-00001 and its refund cancel out')
  from pg_temp.op('billing.day', :'cash') d;
select t.refuses(format($q$select pg_temp.op('billing.day', %L, '{"all":true}')$q$, :'cash'), 'not_allowed');
select t.as(:'acc');
select t.ok((d ->> 'taken')::numeric = 987.50 and d -> 'drawer' = 'null', 'the accountant: the clinic''s day, every desk (the Lab''s 95, the Pharmacy''s 75); no drawer of her own')
  from pg_temp.op('billing.day', :'cash', '{"all":true}') d;

\echo '── (f) a pack operation returning patients is read-logged per patient; reads merged in ten minutes keep what each read (D19)'
reset role;
select t.ok(exists (select 1 from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000ba' and l.patient_id = :'pt' and l.purpose = 'PATADMIN'
    and l.what -> 'ops' @> '["billing.lines","billing.owed","billing.pay"]'), 'the cashier''s reads of Ahmed: lines, who owes and the payment, in one row of the log');
select t.ok(not exists (select 1 from core.read_log l where l.what -> 'ops' ? 'billing.day'), 'the day''s totals name no patient and are not logged per patient');
select t.ok(core.read_merge('{"items":["a"],"x":1,"tables":["t"]}', '{"items":["b","a"],"x":2,"y":[3]}') = '{"items":["a","b"],"x":2,"y":[3],"tables":["t"]}',
  'merged detail by detail: lists joined, each value once; a detail one names kept; else the later');
set role authenticated;
select t.as(:'dr');
select public.read(jsonb_build_object('shape', 'item', 'item', '00000000-0000-0000-0000-00000000e105', 'department_id', :'im')) is not null as read_one,
       public.read(jsonb_build_object('shape', 'item', 'item', '00000000-0000-0000-0000-00000000e106', 'department_id', :'im')) is not null as read_two;
reset role;
select t.ok(l.what -> 'items' @> '["00000000-0000-0000-0000-00000000e105","00000000-0000-0000-0000-00000000e106"]', 'two items read in one window: both kept')
  from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b1' and l.patient_id = :'pt' and l.what ? 'items';
set role pack_billing;
create function billing.probe_op(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language sql volatile security definer set search_path = '' as $$
  select '{"rows":[]}'::jsonb
$$;
reset role;
select core.declare_op('billing.probe', 'billing', 'billing.probe_op(uuid,uuid,uuid,jsonb)', 'read:billing.cashier', patients => true);
set role authenticated;
select t.as(:'cr');
select t.refuses(format($q$select pg_temp.op('billing.probe', %L)$q$, :'cash'), 'patients_unnamed');

\echo '── (g) a store is declared with care: the layer''s table holding a patient, no derived table, the eraser able to reach it'
reset role;
set role pack_billing;
create table billing.probe (organization_id uuid, patient_id uuid);
reset role;
select t.refuses($$select core.declare_store('billing.nope', 'billing')$$, 'no_such_table');
select t.refuses($$select core.declare_store('pharmacy.stock', 'billing')$$, 'outside_prefix');
select t.refuses($$select core.declare_store('billing.charges', 'billing')$$, 'derived_table');
select t.refuses($$select core.declare_store('billing.drawers', 'billing')$$, 'store_needs');
select t.refuses($$select core.declare_store('billing.sent', 'billing', array['name'])$$, 'keeps_patient');
select t.refuses($$select core.declare_store('billing.payments', 'billing', array['patient_id', 'nope'])$$, 'unknown_column');
select t.refuses($$select core.declare_store('billing.anyway', 'billing', array['patient_id'])$$, 'not_nullable');
select t.refuses($$select core.declare_store('billing.probe', 'billing')$$, 'eraser_cannot');
select t.refuses($$select core.declare_store('billing.probe', 'billing', array['patient_id'])$$, 'eraser_cannot');
select t.ok(not exists (select 1 from core.stores where key in ('billing.probe', 'billing.drawers')), 'nothing refused was declared');

\echo '── the row rule (§3.10): a charge copies only its own item''s facts, and its rows are masked by its own entries'
reset role;
select t.ok(not exists (select 1 from billing.charges c, unnest(c.source_entries) x join core.entries e on e.id = x where e.item <> c.item),
  'every charge''s source entries are its own item''s (the order''s, or the visit''s moves), never a note''s');
select t.ok(not exists (select 1 from billing.charges c, unnest(c.source_entries) x join core.entries e on e.id = x join core.types y on y.key = e.type and y.version = e.type_version
  where y.may_be_private), 'and of types that may never be private');

\echo '── Erase reaches billing''s own tables: its money keeps amounts and receipt numbers and loses the patient; the rest of his goes'
create temp table before_erase as select receipt, total from billing.payments where patient_id = :'pt';
set role authenticated;
select t.as(:'ow');
select t.ok((public.erase_patient(jsonb_build_object('patient_id', :'pt', 'reason', 'the law')) ->> 'erased')::boolean, 'Ahmed erased');
reset role;
select t.ok(not exists (select 1 from billing.charges where patient_id = :'pt') and not exists (select 1 from billing.sent where patient_id = :'pt')
  and not exists (select 1 from billing.anyway where patient_id = :'pt'), 'his charges, open bills and reasons are gone');
select t.ok((select count(*) from before_erase) = 5 and not exists (select 1 from before_erase b left join billing.payments p on p.receipt = b.receipt
    where p.id is null or p.total <> b.total or p.patient_id is not null), 'his five payments stay, each with its number and amount, and no patient');
select t.ok((select count(*) from billing.payment_lines l join before_erase b on true join billing.payments p on p.receipt = b.receipt and p.id = l.payment_id) > 0,
  'their lines stay');
set role authenticated;
select t.as(:'cr');
select t.ok((d ->> 'taken')::numeric = 817.50, 'the day''s totals are as they were') from pg_temp.op('billing.day', :'cash') d;
select t.ok(p -> 'payments' -> 0 -> 'patient_id' = 'null', 'his receipt reads with no patient') from pg_temp.op('billing.paid', :'cash', '{"receipt":"R-00001"}') p;
reset role;
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live after it all');

\echo '── a visit fee at check-in (owner, 2026-10-08), not once seen: sent on to Psychiatry (no billing) it is Internal Medicine''s only; paid, the patient is in Nothing to pay'
set role authenticated;
select t.as(:'rec');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e200', :'p2', :'desk', :'im'), 'Soad checked in to Internal Medicine');
reset role;
select core.drain() as drained;
select t.ok(c.department_id = :'im' and c.kind = 'visit' and c.open and c.at = (select occurred_at from core.entries where id = '00000000-0000-0000-0000-00000000e200'),
  'charged at check-in, before anyone called or saw her: Internal Medicine''s fee, at the check-in''s time')
  from billing.charges c where c.item = '00000000-0000-0000-0000-00000000e200';
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-00000000e200', :'im')), 'called');
select t.landed(t.w(t.move('seen', '00000000-0000-0000-0000-00000000e200', :'im')), 'seen');
select t.landed(t.w(t.move('transferred', '00000000-0000-0000-0000-00000000e200', :'im', jsonb_build_object('to_department_id', :'psy'))), 'sent on to Psychiatry');
select t.as(:'sal');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-00000000e200', :'psy')), 'called there');
select t.landed(t.w(t.move('done', '00000000-0000-0000-0000-00000000e200', :'psy', '{"wait":false}')), 'and seen, done');
reset role;
select core.drain() as drained;
select t.ok((select array_agg(department_id) from billing.charges where item = '00000000-0000-0000-0000-00000000e200') = array[:'im'::uuid], 'one visit fee, Internal Medicine''s');
set role authenticated;
select t.as(:'cr');
select t.ok((r ->> 'total')::numeric = 150, 'paid') from pg_temp.pay(:'p2', format('{"charges":[{"item":"00000000-0000-0000-0000-00000000e200","department_id":"%s"}]}', :'im')::jsonb) r;
select t.ok(o -> 'none' @> jsonb_build_array(jsonb_build_object('patient_id', :'p2', 'department_id', :'im')) and not exists (select 1 from jsonb_array_elements(o -> 'rows') x where (x ->> 'patient_id')::uuid = :'p2'),
  'seen today and owing nothing: Nothing to pay') from pg_temp.op('billing.owed', :'cash') o;

\echo '── a check-in undone or crossed out voids its fee (owner, 2026-10-08); one that left unseen keeps it; sent on to a clinic that bills, charged on arrival there, as its fee stood'
\set p8   '00000000-0000-0000-0000-0000000000f8'
\set p9   '00000000-0000-0000-0000-0000000000f9'
\set card '00000000-0000-0000-0000-0000000000da'
select t.as(:'rec');
select t.ok(count(*) = 2, 'Nabil and Rania registered') from (select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', x, 'given',
  jsonb_build_array(g), 'family', 'Test', 'gender', 'male', 'birth_date', '1975-03-03'))) from (values (:'p8', 'Nabil'), (:'p9', 'Rania')) v(x, g)) y;
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e500', :'p8', :'desk', :'im'), 'Nabil checked in to Internal Medicine');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e501', :'p9', :'desk', :'im'), 'Rania checked in to Internal Medicine');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e502', :'p9', :'desk', :'psy'), 'and to Psychiatry, which does not bill');
reset role;
select core.drain() as drained;
select t.ok((select count(*) from billing.charges where item in ('00000000-0000-0000-0000-00000000e500', '00000000-0000-0000-0000-00000000e501') and open and kind = 'visit') = 2
  and not exists (select 1 from billing.charges where item = '00000000-0000-0000-0000-00000000e502'), 'both charged at check-in; Psychiatry''s check-in charges nothing');
set role authenticated;
select t.as(:'rec');
select t.landed(t.w(t.e('crossed_out', :'p8', :'desk', '{"reason":"typo","text":"checked in by mistake"}', null, null, null, null, t.latest('00000000-0000-0000-0000-00000000e500'))),
  'the desk''s Undo: Nabil''s check-in crossed out (checked in by mistake)');
select t.landed(t.w(t.move('left', '00000000-0000-0000-0000-00000000e501', :'desk')), 'Rania left before she was seen');
reset role;
select core.drain() as drained;
select t.ok(not open, 'the check-in undone: its fee is void') from billing.charges where item = '00000000-0000-0000-0000-00000000e500';
select t.ok(open, 'left unseen: her fee stands (chosen in the build, awaiting the owner; given back from its receipt if the clinic says so)')
  from billing.charges where item = '00000000-0000-0000-0000-00000000e501';
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');
set role authenticated;
select t.as(:'cr');
select t.ok(jsonb_array_length(l -> 'charges') = 0 and jsonb_array_length(l -> 'back') = 0, 'Nabil owes nothing, and nothing is to give back') from pg_temp.lines(:'p8') l;
select t.ok(not exists (select 1 from jsonb_array_elements(o -> 'rows') x where (x ->> 'patient_id')::uuid = :'p8'), 'nor is he on the cashier''s list')
  from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p8'))) o;
-- a clinic that bills, its fee 200; Rania checked in again to Internal Medicine and sent on there
select t.as(:'ow');
select public.save('department', jsonb_build_object('id', :'card', 'name', 'Cardiology', 'work', 'visits')) ->> 'id' as cardiology;
select public.setup(jsonb_build_object('setup', 'billing.clinic', 'department_id', :'card', 'apply', true)) ->> 'setup' as cardiology_bills;
select t.as(:'acc');
select public.write_setting(jsonb_build_object('key', 'billing.visit_fee', 'owner_id', :'card', 'data', '{"amount":"200"}'::jsonb)) ->> 'key' as cardiology_fee;
select t.as(:'rec');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e503', :'p9', :'desk', :'im'), 'Rania back to Internal Medicine');
select t.as(:'dr');
select t.landed(t.w(t.move('transferred', '00000000-0000-0000-0000-00000000e503', :'im', jsonb_build_object('to_department_id', :'card'))), 'sent on to Cardiology before she was seen');
reset role;
select core.drain() as drained;
select thing_id as card_fee from core.settings where key = 'billing.visit_fee' and owner_id = :'card' limit 1 \gset
set role authenticated;
select t.as(:'acc');
select public.write_setting(jsonb_build_object('key', 'billing.visit_fee', 'owner_id', :'card', 'thing_id', :'card_fee', 'data', '{"amount":"250"}'::jsonb)) ->> 'key' as cardiology_dearer;
select t.as(:'cr');
select t.ok((select string_agg((c ->> 'department_id') || ':' || (c ->> 'amount'), ',' order by c ->> 'amount') from jsonb_array_elements(l -> 'charges') c
    where c ->> 'item' = '00000000-0000-0000-0000-00000000e503') = :'im' || ':150.00,' || :'card' || ':200.00',
  'two fees for one visit: Internal Medicine''s at check-in, Cardiology''s on arrival (chosen in the build, awaiting the owner), each as it stood (200, not the later 250)')
  from pg_temp.lines(:'p9') l;

\echo '── any department that prices its own work, not only the pharmacy (a test-only Physiotherapy, no pack of its own): lines sent, Pay first per order, …anyway, paid at the cashier or at its counter; the chart, the word only'
\set phy  '00000000-0000-0000-0000-0000000000d9'
\set sess '00000000-0000-0000-0000-0000000000c9'
\set ther '11111111-0000-0000-0000-0000000000bd'
select t.as(:'ow');
select public.save('department', jsonb_build_object('id', :'phy', 'name', 'Physiotherapy', 'work', 'bench')) ->> 'id' as physio;
select public.write_setting(jsonb_build_object('key', 'service', 'owner_id', :'phy', 'thing_id', :'sess', 'data', '{"code":"session","name":"Physiotherapy session","answer":"note"}'::jsonb)) ->> 'key' as session;
select public.setup(jsonb_build_object('setup', 'billing.bench', 'department_id', :'phy', 'apply', true)) ->> 'setup' as physio_bills;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000bd', 'name', 'Therapist Nour', 'login_id', :'ther', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c005', 'department_id', :'phy')))) ->> 'id' as therapist;
reset role;
select t.ok((select action from core.setting_keys where key = 'billing.pay_first') = 'write:billing.prices', 'Pay first is switched by whoever sets prices (owner, 2026-10-08)');
set role authenticated;
select t.as(:'ther');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', %L, 'data', '{"on":true}'::jsonb))$q$, :'phy'), 'not_allowed');
select t.as(:'cr');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', %L, 'data', '{"on":true}'::jsonb))$q$, :'phy'), 'not_allowed');
select t.as(:'dr');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', %L, 'data', '{"on":true}'::jsonb))$q$, :'phy'), 'not_allowed');
select t.as(:'acc');
select t.ok(public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'phy', 'data', '{"on":true}'::jsonb)) ->> 'key' = 'billing.pay_first',
  'Pay first on in Physiotherapy by the accountant, who sets prices there (as on Billing → Prices); not its therapist, the cashier or a doctor');
select t.as(:'dr');
create function pg_temp.session(p_id uuid) returns jsonb language sql as $$
  select t.e('order', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('service', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c9',
    'code', 'session', 'name', 'Physiotherapy session'), 'department_id', '00000000-0000-0000-0000-0000000000d9', 'priority', 'routine', 'status', 'active'), p_id)
$$;
grant execute on function pg_temp.session(uuid) to public;
select t.landed(t.w(jsonb_build_array(pg_temp.session('00000000-0000-0000-0000-00000000e300'), pg_temp.session('00000000-0000-0000-0000-00000000e301'),
  pg_temp.session('00000000-0000-0000-0000-00000000e302'))), 'three sessions for Soad sent to Physiotherapy');
reset role;
select core.drain() as drained;
select t.ok(not exists (select 1 from billing.charges where item in ('00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000e302')),
  'billing prices none of them: the department prices its own work, and billing learns it only from the lines its rows hand');
set role authenticated;
select t.as(:'ther');
create function pg_temp.physio(p_orders text[], p_more jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.op('billing.waiting', '00000000-0000-0000-0000-0000000000d9', jsonb_build_object('orders', to_jsonb(p_orders)) || p_more)
$$;
grant execute on function pg_temp.physio(text[], jsonb) to public;
select t.ok(w -> 'waiting' = '[]' and (w -> 'pay_first')::boolean and w ->> 'desk' = 'none' and not w ? 'own',
  'nothing sent yet: billing holds none of them, and says Pay first is on here, so the screen holds what its rows price themselves')
  from pg_temp.physio(array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301']) w;
select t.refuses($$select pg_temp.pay('00000000-0000-0000-0000-0000000000f2', '{"handed":[{"name":"Session","quantity":1,"amount":"250"}]}', '00000000-0000-0000-0000-0000000000d9')$$, 'not_allowed');
select t.ok((r ->> 'lines')::int = 3, 'Send to cashier: two sessions and a band, as its rows hand them (a name, a quantity, an amount, the order)')
  from pg_temp.op('billing.send', :'phy', jsonb_build_object('patient_id', :'p2', 'lines', jsonb_build_array(
    jsonb_build_object('name', 'Session · 45 min', 'quantity', 1, 'amount', '250', 'order_item', '00000000-0000-0000-0000-00000000e300'),
    jsonb_build_object('name', 'Session · 45 min', 'quantity', 1, 'amount', '250', 'order_item', '00000000-0000-0000-0000-00000000e301'),
    jsonb_build_object('name', 'Elastic band', 'quantity', 2, 'amount', '60')))) r;
select t.ok(w -> 'waiting' @> '["00000000-0000-0000-0000-00000000e300","00000000-0000-0000-0000-00000000e301"]' and jsonb_array_length(w -> 'waiting') = 2
  and (w -> 'own' -> '00000000-0000-0000-0000-00000000e300' ->> 'sent')::numeric = 250 and (w -> 'own' -> '00000000-0000-0000-0000-00000000e300' ->> 'paid')::numeric = 0
  and not w -> 'own' ? '00000000-0000-0000-0000-00000000e302',
  'sent and not paid under Pay first: both sessions wait (the third, never sent, is the screen''s to hold); what each order''s open bill holds, for its own row')
  from pg_temp.physio(array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000e302'], '{"lines":true}') w;
select t.ok(not w::text ~ '"(amount|price|total|sent|own)"', 'not asked, the read is words only') from pg_temp.physio(array['00000000-0000-0000-0000-00000000e300']) w;
select t.as(:'dr');
select t.ok(w -> 'waiting' = '[]' and not w::text ~ '"(amount|price|total|sent|own)"',
  'billing.waiting is a list''s read: asked from Internal Medicine, an order performed in Physiotherapy is not that department''s')
  from pg_temp.op('billing.waiting', :'im', '{"orders":["00000000-0000-0000-0000-00000000e300"],"anywhere":true}') w;
-- the doctor's chart (owner, 2026-10-08): the word on the order's line, wherever the order is performed, for whoever reads the record where billing is used
create function pg_temp.chart(p_dept uuid, p_patient uuid, p_orders text[]) returns jsonb language sql as $$
  select pg_temp.op('billing.chart', p_dept, jsonb_build_object('patient_id', p_patient, 'orders', to_jsonb(p_orders)))
$$;
grant execute on function pg_temp.chart(uuid, uuid, text[]) to public;
select t.ok(w -> 'waiting' @> '["00000000-0000-0000-0000-00000000e300","00000000-0000-0000-0000-00000000e301"]' and jsonb_array_length(w -> 'waiting') = 2
  and w -> 'patient_ids' = jsonb_build_array(:'p2'), 'the chart in Internal Medicine: both sessions sent and unpaid under Physiotherapy''s Pay first wait; the third, never handed, billing does not know')
  from pg_temp.chart(:'im', :'p2', array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000e302']) w;
select t.ok((select array_agg(k order by k) from jsonb_object_keys(w) k) = array['patient_ids', 'waiting'],
  'the chart''s read is the waiting orders alone: no amount, price, line, desk, Pay first or reason')
  from pg_temp.chart(:'im', :'p2', array['00000000-0000-0000-0000-00000000e300']) w;
select t.ok(w -> 'waiting' = '[]', 'asked about another patient''s orders: none answered') from pg_temp.chart(:'im', :'p8', array['00000000-0000-0000-0000-00000000e300']) w;
select t.ok(w -> 'waiting' = '[]' and w -> 'patient_ids' = jsonb_build_array(:'p2'), 'asked about no orders: none') from pg_temp.chart(:'im', :'p2', '{}'::text[]) w;
select t.refuses(format($q$select pg_temp.chart(%L, %L, array['00000000-0000-0000-0000-00000000e300'])$q$, :'im', '00000000-0000-0000-0000-0000000000ff'), 'not_found');
select t.as(:'cr');
select t.refuses(format($q$select pg_temp.chart(%L, %L, array['00000000-0000-0000-0000-00000000e300'])$q$, :'cash', :'p2'), 'not_allowed');
select t.as(:'sal');
select t.refuses($$select pg_temp.op('billing.waiting', '00000000-0000-0000-0000-0000000000d5', '{"orders":["00000000-0000-0000-0000-00000000e300"]}')$$, 'not_used_here');
select t.refuses(format($q$select pg_temp.chart(%L, %L, array['00000000-0000-0000-0000-00000000e300'])$q$, :'psy', :'p2'), 'not_used_here');
select t.as(:'ther');
select t.ok((r -> 'patient_ids' ->> 0)::uuid = :'p2', 'Go ahead anyway… with the second session: "will pay after", kept by billing')
  from pg_temp.op('billing.anyway', :'phy', '{"order_item":"00000000-0000-0000-0000-00000000e301","reason":"will pay after"}') r;
select t.ok(w -> 'waiting' = '["00000000-0000-0000-0000-00000000e300"]' and w -> 'ahead' = '["00000000-0000-0000-0000-00000000e301"]', 'the first still waits; the second went ahead')
  from pg_temp.physio(array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301']) w;
select t.as(:'dr');
select t.ok(w -> 'waiting' = '["00000000-0000-0000-0000-00000000e300"]', 'and on the chart: the word goes from the session gone ahead')
  from pg_temp.chart(:'im', :'p2', array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301']) w;
select t.as(:'cr');
select t.ok(jsonb_array_length(l -> 'sent') = 3 and l -> 'waiting' = jsonb_build_array(:'phy') and (l -> 'before_payment')::boolean
  and (select bool_and((x ->> 'department_id')::uuid = :'phy') from jsonb_array_elements(l -> 'sent') x), 'the main cashier: Physiotherapy''s three lines, Physiotherapy waiting, done before payment')
  from pg_temp.lines(:'p2') l;
select t.ok((o -> 'rows' -> 0 -> 'sent') = jsonb_build_array(:'phy') and (o -> 'rows' -> 0 -> 'before_payment')::boolean and (o -> 'rows' -> 0 ->> 'total')::numeric = 560,
  'and on her row: sent by Physiotherapy, done before payment, 560.00') from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p2'))) o;
select t.ok((r ->> 'total')::numeric = 560, 'Soad pays them by card at the main cashier')
  from pg_temp.pay(:'p2', jsonb_build_object('method', 'card', 'sent', (select jsonb_agg(x -> 'id') from jsonb_array_elements(pg_temp.lines(:'p2') -> 'sent') x))) r;
select t.as(:'ther');
select t.ok(w -> 'waiting' = '[]' and (select bool_and((x.value ->> 'paid')::numeric = 250 and (x.value ->> 'sent')::numeric = 0) from jsonb_each(w -> 'own') x)
  and (select count(*) from jsonb_each(w -> 'own')) = 2, 'paid: nothing waits, nothing is left sent; the word goes the moment the payment is taken')
  from pg_temp.physio(array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301'], '{"lines":true}') w;
select t.as(:'dr');
select t.ok(w -> 'waiting' = '[]', 'paid: no word on the chart either') from pg_temp.chart(:'im', :'p2', array['00000000-0000-0000-0000-00000000e300', '00000000-0000-0000-0000-00000000e301']) w;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', :'phy', 'data', '{"takes":"own"}'::jsonb)) ->> 'key' as physio_takes_own;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000bd', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c005', 'department_id', :'phy'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ce01', 'department_id', :'phy')))) ->> 'id' as therapist_takes_payment;
select t.as(:'ther');
select t.ok((r ->> 'total')::numeric = 250 and r ->> 'method' = 'card', 'now it takes its own: Pay at its counter, the third session as its row hands it')
  from pg_temp.pay(:'p2', '{"method":"card","handed":[{"name":"Session · 45 min","quantity":1,"amount":"250","order_item":"00000000-0000-0000-0000-00000000e302"}]}', :'phy') r;
select t.ok((w -> 'own' -> '00000000-0000-0000-0000-00000000e302' ->> 'paid')::numeric = 250 and w ->> 'desk' = 'own', 'its order is paid, for the soft check')
  from pg_temp.physio(array['00000000-0000-0000-0000-00000000e302'], '{"lines":true}') w;
reset role;
select t.ok((select string_agg(l.kind || ':' || l.name || ':' || l.amount, ',' order by p.at, l.n) from billing.payment_lines l join billing.payments p on p.id = l.payment_id
  where l.department_id = :'phy') = 'sent:Session · 45 min:250.00,sent:Session · 45 min:250.00,sent:Elastic band:60.00,handed:Session · 45 min:250.00',
  'kept as they were handed, each line Physiotherapy''s; billing names no department, it reads where the lines came from');
set role authenticated;

\echo '── a medicine given in part (old audit F38): a row hands what the order comes to so far; billing takes only the rest, checking what the row knew, so nothing goes twice'
\set p3 '00000000-0000-0000-0000-0000000000f3'
\set p4 '00000000-0000-0000-0000-0000000000f4'
select t.as(:'rec');
select t.ok(public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p3', 'given', jsonb_build_array('Magdy'), 'family', 'Saleh',
  'gender', 'male', 'birth_date', '1975-01-20'))) -> 'patient' ->> 'id' = :'p3'
  and public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p4', 'given', jsonb_build_array('Hoda'), 'family', 'Fathy',
  'gender', 'female', 'birth_date', '1990-07-02'))) -> 'patient' ->> 'id' = :'p4', 'Magdy and Hoda registered');
select t.as(:'dr');
create function pg_temp.rx(p_med uuid, p_order uuid, p_drug text) returns jsonb language sql as $$
  select jsonb_build_array(
    t.e('medication', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('basis', 'prescribed', 'drug', jsonb_build_object('text', p_drug),
      'status', 'active'), p_med),
    t.e('order', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('service', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c3',
      'code', 'dispense', 'name', 'Dispensing'), 'department_id', '00000000-0000-0000-0000-0000000000d3', 'priority', 'routine', 'status', 'active'), p_order, null, p_med, 'about'))
$$;
grant execute on function pg_temp.rx(uuid, uuid, text) to public;
select t.landed(t.w(pg_temp.rx('00000000-0000-0000-0000-00000000e400', '00000000-0000-0000-0000-00000000e401', 'Augmentin 1 g')
  || pg_temp.rx('00000000-0000-0000-0000-00000000e402', '00000000-0000-0000-0000-00000000e403', 'Glucophage 500')
  || pg_temp.rx('00000000-0000-0000-0000-00000000e404', '00000000-0000-0000-0000-00000000e405', 'Nexium 40')
  || pg_temp.rx('00000000-0000-0000-0000-00000000e406', '00000000-0000-0000-0000-00000000e407', 'Concor 5')), 'four prescriptions for Magdy, sent to the Pharmacy');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'pm');
select t.ok((r ->> 'total')::numeric = 145, 'fourteen of twenty-eight tablets given: the box its row hands, paid at the Pharmacy''s counter')
  from pg_temp.pay(:'p3', '{"handed":[{"name":"Augmentin 1 g · box","quantity":1,"amount":"145","order_item":"00000000-0000-0000-0000-00000000e401"}]}', :'ph') r;
select t.refuses($$select pg_temp.pay('00000000-0000-0000-0000-0000000000f3', '{"handed":[{"name":"Augmentin 1 g · box","quantity":1,"amount":"145","order_item":"00000000-0000-0000-0000-00000000e401"}]}',
  '00000000-0000-0000-0000-0000000000d3')$$, 'total_changed');
select t.ok((r ->> 'total')::numeric = 135, 'the rest, a week later: its row hands both boxes, the card only the second (with what it knew was paid, 145), 10 off for Staff')
  from pg_temp.pay(:'p3', '{"handed":[{"name":"Augmentin 1 g · box","quantity":1,"amount":"145","order_item":"00000000-0000-0000-0000-00000000e401"}],
    "basis":{"00000000-0000-0000-0000-00000000e401":"145.00"},"discount":{"amount":"10","reason":"Staff"}}', :'ph') r;
select t.ok((w -> 'own' -> '00000000-0000-0000-0000-00000000e401' ->> 'paid')::numeric = 290 and jsonb_array_length(w -> 'own' -> '00000000-0000-0000-0000-00000000e401' -> 'lines') = 2,
  'billing holds both boxes of the order (a second counter that knew nothing paid was refused): 290 for twenty-eight tablets')
  from pg_temp.op('billing.waiting', :'ph', '{"orders":["00000000-0000-0000-0000-00000000e401"],"lines":true}') w;
select t.ok((d ->> 'taken')::numeric = (select sum((x ->> 'amount')::numeric) from jsonb_array_elements(d -> 'departments') x) and (d ->> 'taken')::numeric = 355,
  'the Pharmacy''s day adds up: whose work was paid (its discount taken off) comes to what was taken, 355.00') from pg_temp.op('billing.day', :'ph') d;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', :'ph', 'data', '{"takes":"none"}'::jsonb)) ->> 'key' as pharmacy_sends;
select t.as(:'pm');
select t.ok((r ->> 'lines')::int = 1, 'Glucophage: one box of two given, sent to the cashier')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Glucophage 500 · box","quantity":1,"amount":"45","order_item":"00000000-0000-0000-0000-00000000e403"}]}') r;
select t.as(:'cr');
select t.ok((r ->> 'total')::numeric = 45, 'the main cashier takes it')
  from pg_temp.pay(:'p3', jsonb_build_object('sent', (select jsonb_agg(x -> 'id') from jsonb_array_elements(pg_temp.lines(:'p3') -> 'sent') x))) r;
select t.as(:'pm');
select t.refuses($$select pg_temp.op('billing.send', '00000000-0000-0000-0000-0000000000d3', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Glucophage 500 · box","quantity":2,"amount":"90","order_item":"00000000-0000-0000-0000-00000000e403"}]}')$$,
  'total_changed');
select t.ok((r ->> 'lines')::int = 1, 'the rest given: sent in addition, with what was paid of it (45), never the whole order again')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Glucophage 500 · box","quantity":1,"amount":"45","order_item":"00000000-0000-0000-0000-00000000e403"}],
    "basis":{"00000000-0000-0000-0000-00000000e403":"45.00"}}') r;
select t.as(:'cr');
select t.ok((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(l -> 'sent') x) = 45, 'the cashier: the rest owed, 45; the part stays paid') from pg_temp.lines(:'p3') l;
select pg_temp.lines(:'p3') -> 'sent' -> 0 ->> 'id' as rest_line \gset
select t.as(:'pm');
select t.ok((r ->> 'lines')::int = 2, 'the pharmacist changes the rest (a box and a strip): its open bill is replaced, the part paid stays')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Glucophage 500 · box","quantity":1,"amount":"45","order_item":"00000000-0000-0000-0000-00000000e403"},
    {"name":"Glucophage 500 · strip","quantity":1,"amount":"15","order_item":"00000000-0000-0000-0000-00000000e403"}],"basis":{"00000000-0000-0000-0000-00000000e403":"45.00"}}') r;
select t.as(:'cr');
select t.refuses(format($q$select pg_temp.pay(%L, '{"sent":["%s"]}')$q$, :'p3', :'rest_line'), 'total_changed');
select t.ok((r ->> 'total')::numeric = 60, 'a card opened since takes the bill as it stands: the patient owes the order once')
  from pg_temp.pay(:'p3', jsonb_build_object('sent', (select jsonb_agg(x -> 'id') from jsonb_array_elements(pg_temp.lines(:'p3') -> 'sent') x))) r;

\echo '── an open bill whose order is stopped is void (old audit F11 for sent lines): nothing owed for it; paid, it is listed to give back'
select t.as(:'pm');
select t.ok((r ->> 'lines')::int = 1, 'Nexium sent to the cashier before Give (75)')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Nexium 40 · box","quantity":1,"amount":"75","order_item":"00000000-0000-0000-0000-00000000e405"}]}') r;
select t.landed(t.w(t.e('pharmacy.dispense', :'p3', :'ph', '{"status":"cancelled","reason":"Out of stock"}', null, null, t.latest('00000000-0000-0000-0000-00000000e405'), 'answers')),
  'then not given: out of stock');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok(not exists (select 1 from jsonb_array_elements(l -> 'sent') x where x ->> 'order_item' = '00000000-0000-0000-0000-00000000e405'),
  'the open bill sent before the stop is void: Magdy owes nothing for a medicine not given') from pg_temp.lines(:'p3') l;
select t.as(:'pm');
select t.ok((r ->> 'lines')::int = 1, 'a line the Pharmacy sends after the stop (what was given before it) stands')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Nexium 40 · strip","quantity":1,"amount":"20","order_item":"00000000-0000-0000-0000-00000000e405"}]}') r;
select t.as(:'cr');
select t.ok(exists (select 1 from jsonb_array_elements(l -> 'sent') x where x ->> 'order_item' = '00000000-0000-0000-0000-00000000e405' and (x ->> 'amount')::numeric = 20), 'owed: 20')
  from pg_temp.lines(:'p3') l;
select t.ok((r ->> 'total')::numeric = 20, 'paid') from pg_temp.pay(:'p3', jsonb_build_object('sent', (select jsonb_agg(x -> 'id') from jsonb_array_elements(pg_temp.lines(:'p3') -> 'sent') x))) r;
select t.as(:'pm');
select t.ok((r ->> 'lines')::int = 1, 'Concor sent (60)')
  from pg_temp.op('billing.send', :'ph', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"Concor 5 · box","quantity":1,"amount":"60","order_item":"00000000-0000-0000-0000-00000000e407"}]}') r;
select t.as(:'cr');
select t.ok((r ->> 'total')::numeric = 60, 'and paid at the main cashier') from pg_temp.pay(:'p3', jsonb_build_object('sent', (select jsonb_agg(x -> 'id') from jsonb_array_elements(pg_temp.lines(:'p3') -> 'sent') x))) r;
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'p3', :'im', jsonb_build_object('service', jsonb_build_object('id', :'disp', 'code', 'dispense', 'name', 'Dispensing'), 'department_id', :'ph',
  'priority', 'routine', 'status', 'revoked'), null, null, t.latest('00000000-0000-0000-0000-00000000e407'), 'changes')), 'the doctor stops the Concor');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok(jsonb_array_length(l -> 'sent') = 0 and exists (select 1 from jsonb_array_elements(l -> 'back') b where b ->> 'kind' = 'sent'
  and b ->> 'item' = '00000000-0000-0000-0000-00000000e407' and b ->> 'receipt' like 'R-%'), 'paid, then stopped: the card says to give it back from its receipt') from pg_temp.lines(:'p3') l;
select t.ok(jsonb_array_length(o -> 'rows') = 1 and (o -> 'rows' -> 0 ->> 'back')::int = 1 and (o -> 'rows' -> 0 ->> 'total')::numeric = 0,
  'and Magdy is listed for it though he owes nothing: the cashier is told') from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p3'))) o;

\echo '── Pay first before billing has heard an order (old audit F22): it waits from the moment it is written; At the order waits until priced and taken; a paid test not done is listed to give back'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'lab', 'data', '{"on":true}'::jsonb)) ->> 'key' as pay_first_again;
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(pg_temp.cbc('00000000-0000-0000-0000-00000000e410', :'p4'),
  t.e('order', :'p4', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cxr', 'code', 'cxr', 'name', 'Chest X-ray'), 'department_id', :'lab', 'priority', 'routine',
    'status', 'active'), '00000000-0000-0000-0000-00000000e411'))), 'a CBC (95) and a chest X-ray (At the order) for Hoda');
select t.as(:'tech');
reset role;
select t.ok(not exists (select 1 from billing.charges where item in ('00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411')), 'billing has not heard them yet');
set role authenticated;
select t.ok(w -> 'waiting' @> '["00000000-0000-0000-0000-00000000e410","00000000-0000-0000-0000-00000000e411"]' and jsonb_array_length(w -> 'waiting') = 2
  and w -> 'patient_ids' = jsonb_build_array(:'p4'), 'yet both wait already, as their charges will be: no window in which a test is free to collect')
  from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411']) w;
select t.as(:'dr');
select t.ok(jsonb_array_length(w -> 'waiting') = 2, 'and on the chart where they were ordered, wherever they are performed')
  from pg_temp.chart(:'im', :'p4', array['00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411']) w;
select t.as(:'acc');
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'lab', 'data', '{"on":false}'::jsonb)) ->> 'key' as lab_pay_after;
select t.as(:'dr');
select t.ok(w -> 'waiting' = '[]', 'Pay first off where the work is done: the chart''s words go at once')
  from pg_temp.chart(:'im', :'p4', array['00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411']) w;
select t.as(:'acc');
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'lab', 'data', '{"on":true}'::jsonb)) ->> 'key' as lab_pay_first;
select t.as(:'tech');
reset role;
select core.drain() as drained;
set role authenticated;
select t.ok(jsonb_array_length(w -> 'waiting') = 2, 'heard: still both') from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411']) w;
select t.as(:'cr');
select t.ok((r ->> 'total')::numeric = 95, 'the cashier takes the CBC alone') from pg_temp.pay(:'p4', format('{"charges":[{"item":"00000000-0000-0000-0000-00000000e410","department_id":"%s"}]}', :'lab')::jsonb) r;
select t.as(:'tech');
select t.ok(w -> 'waiting' = '["00000000-0000-0000-0000-00000000e411"]', 'the chest X-ray still waits: priced at the order, nobody priced and took it')
  from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411']) w;
select t.as(:'cr');
select t.ok((r ->> 'total')::numeric = 250, 'the cashier types its price, 250, and takes it')
  from pg_temp.pay(:'p4', format('{"charges":[{"item":"00000000-0000-0000-0000-00000000e411","department_id":"%s","price":"250"}]}', :'lab')::jsonb) r;
select t.as(:'tech');
select t.ok(w -> 'waiting' = '[]', 'priced and paid: free') from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e410', '00000000-0000-0000-0000-00000000e411']) w;
select t.landed(t.w(t.e('step', :'p4', :'lab', '{"status":"cancelled","reason":"Refused"}', null, null, '00000000-0000-0000-0000-00000000e410', 'answers')), 'Hoda''s CBC: couldn''t collect, refused');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok((o -> 'rows' -> 0 ->> 'back')::int = 1 and (o -> 'rows' -> 0 ->> 'total')::numeric = 0 and exists (select 1 from jsonb_array_elements(pg_temp.lines(:'p4') -> 'back') b
  where b ->> 'item' = '00000000-0000-0000-0000-00000000e410'), 'paid before collection, then not collected: Hoda is listed, her card says to give the 95 back')
  from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p4'))) o;
select pg_temp.lines(:'p4') -> 'back' -> 0 ->> 'payment_id' as cbc_paid \gset
select t.ok((r ->> 'total')::numeric = -95, 'given back from its receipt') from pg_temp.op('billing.refund', :'cash', jsonb_build_object('payment_id', :'cbc_paid', 'reason', 'not collected')) r;
select t.ok(jsonb_array_length(o -> 'rows') = 0, 'and Hoda leaves the list') from pg_temp.op('billing.owed', :'cash', jsonb_build_object('patients', jsonb_build_array(:'p4'))) o;

\echo '── …anyway is for anyone working that department''s bench (read:bench there; owner, 2026-10-08): a store keeper may; the cashier may not; a doctor answers anyway a consult his clinic prices'
select t.as(:'ow');
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000be', 'name', 'Store keeper', 'login_id', '11111111-0000-0000-0000-0000000000be',
  'holdings', jsonb_build_array(jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ca02', 'department_id', :'ph')))) ->> 'id' as store_keeper;
select t.as(:'cr');
select t.refuses($$select pg_temp.op('billing.anyway', '00000000-0000-0000-0000-0000000000d3', '{"order_item":"00000000-0000-0000-0000-00000000e403","reason":"will pay after"}')$$, 'not_allowed');
select t.refuses($$select pg_temp.op('billing.send', '00000000-0000-0000-0000-0000000000d3', '{"patient_id":"00000000-0000-0000-0000-0000000000f3","lines":[{"name":"x","quantity":1,"amount":"1"}]}')$$, 'not_allowed');
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000be', 'read:bench', :'ph') and not core.may('00000000-0000-0000-0000-0000000000be', 'write:pharmacy.dispense', :'ph'),
  'the store keeper works the Pharmacy''s bench and gives nothing');
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000be');
select t.ok((r -> 'patient_ids' ->> 0)::uuid = :'p3', 'yet he may go ahead anyway: anyone working the bench may (the earlier narrowing to whoever may do the work is gone)')
  from pg_temp.op('billing.anyway', :'ph', '{"order_item":"00000000-0000-0000-0000-00000000e403","reason":"will pay after"}') r;
reset role;
select t.ok(a.author_id = '00000000-0000-0000-0000-0000000000be' and a.reason = 'will pay after', 'kept with who: the store keeper')
  from billing.anyway a where a.order_item = '00000000-0000-0000-0000-00000000e403' order by a.at limit 1;
set role authenticated;
select t.as(:'pm');
select t.ok((r -> 'patient_ids' ->> 0)::uuid = :'p3', 'the pharmacist, who gives it, may')
  from pg_temp.op('billing.anyway', :'ph', '{"order_item":"00000000-0000-0000-0000-00000000e403","reason":"will pay after"}') r;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'service', 'owner_id', :'im', 'thing_id', '00000000-0000-0000-0000-0000000000c6',
  'data', '{"code":"imc","name":"Medical consult","answer":"note"}'::jsonb)) ->> 'key' as consult;
select t.as(:'acc');
select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', :'im', 'data', '{"service_id":"00000000-0000-0000-0000-0000000000c6","price":"300"}'::jsonb)) ->> 'key' as consult_priced;
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'im', 'data', '{"on":true}'::jsonb)) ->> 'key' as im_pay_first;
select t.as(:'sal');
select t.landed(t.w(t.e('order', :'p2', :'psy', jsonb_build_object('service', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c6', 'code', 'imc', 'name', 'Medical consult'),
  'department_id', :'im', 'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-00000000e420')), 'Psychiatry asks Internal Medicine for a consult on Soad');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'dr');
select t.ok(w -> 'waiting' = '["00000000-0000-0000-0000-00000000e420"]', 'the consult waits for payment at Internal Medicine')
  from pg_temp.op('billing.waiting', :'im', '{"orders":["00000000-0000-0000-0000-00000000e420"]}') w;
select t.ok((r -> 'patient_ids' ->> 0)::uuid = :'p2', 'Answer anyway…: Dr Ali, a doctor of Internal Medicine (he may write its answer), records why')
  from pg_temp.op('billing.anyway', :'im', '{"order_item":"00000000-0000-0000-0000-00000000e420","reason":"urgent: chest pain"}') r;
select t.ok(w -> 'waiting' = '[]' and w -> 'ahead' = '["00000000-0000-0000-0000-00000000e420"]', 'gone ahead')
  from pg_temp.op('billing.waiting', :'im', '{"orders":["00000000-0000-0000-0000-00000000e420"]}') w;
select t.as(:'acc');
select public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', :'im', 'data', '{"on":false}'::jsonb)) ->> 'key' as im_pay_after;

\echo '── open, awaiting the owner (old audit F31): a price on the Pharmacy''s own Dispensing charges each prescription as a service, besides the lines its rows hand'
select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', :'ph', 'data', jsonb_build_object('service_id', :'disp', 'price', '20'))) ->> 'key' as dispensing_priced;
select t.as(:'dr');
select t.landed(t.w(pg_temp.rx('00000000-0000-0000-0000-00000000e430', '00000000-0000-0000-0000-00000000e431', 'Panadol Extra')), 'another prescription for Magdy');
reset role;
select core.drain() as drained;
select t.ok(exists (select 1 from billing.charges where item = '00000000-0000-0000-0000-00000000e431' and kind = 'service' and open and department_id = :'ph'),
  'known: the prescription is a 20.00 service charge too (billing cannot tell such a service apart without naming the pack)');
set role authenticated;
select t.as(:'cr');
select t.ok((r ->> 'total')::numeric = 20, 'the Dispensing charge paid at the main cashier')
  from pg_temp.pay(:'p3', format('{"charges":[{"item":"00000000-0000-0000-0000-00000000e431","department_id":"%s"}]}', :'ph')::jsonb) r;
select t.as(:'pm');
select t.ok(not (w -> 'own') ? '00000000-0000-0000-0000-00000000e431', 'a service charge paid never stands for the medicines the row hands: billing holds none of them, so they are still handed')
  from pg_temp.op('billing.waiting', :'ph', '{"orders":["00000000-0000-0000-0000-00000000e431"],"lines":true}') w;

\echo '── who owes, paged when patients share a moment: each once, none skipped (the order the cursor reads)'
select t.as(:'rec');
select t.ok(count(*) = 3, 'three more patients') from (select public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', x, 'given', jsonb_build_array('Same'),
  'family', 'Moment ' || n, 'gender', 'female', 'birth_date', '1980-01-01'))) from (values ('00000000-0000-0000-0000-0000000000f5', 1), ('00000000-0000-0000-0000-0000000000f6', 2),
  ('00000000-0000-0000-0000-0000000000f7', 3)) v(x, n)) y;
reset role;
insert into billing.sent (organization_id, bill_id, patient_id, department_id, name, quantity, amount, author_id, at)
select '00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), x::uuid, :'ph', 'Panadol Extra', 1, 10, '00000000-0000-0000-0000-0000000000b6', now() - interval '1 hour'
  from unnest(array['00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f7']) x;
set role authenticated;
select t.as(:'cr');
\set same '["00000000-0000-0000-0000-0000000000f5","00000000-0000-0000-0000-0000000000f6","00000000-0000-0000-0000-0000000000f7"]'
select t.ok((select count(distinct x) from unnest(array[o1 -> 'rows' -> 0 ->> 'patient_id', o2 -> 'rows' -> 0 ->> 'patient_id', o3 -> 'rows' -> 0 ->> 'patient_id']) x) = 3
  and (o2 -> 'more')::boolean and not (o3 -> 'more')::boolean, 'three patients owing from the same moment, a page each: each once, none skipped')
  from pg_temp.op('billing.owed', :'cash', jsonb_build_object('limit', 1, 'patients', :'same'::jsonb)) o1,
  lateral pg_temp.op('billing.owed', :'cash', jsonb_build_object('limit', 1, 'patients', :'same'::jsonb, 'after',
    jsonb_build_object('at', o1 -> 'rows' -> 0 -> 'last_at', 'patient_id', o1 -> 'rows' -> 0 -> 'patient_id'))) o2,
  lateral pg_temp.op('billing.owed', :'cash', jsonb_build_object('limit', 1, 'patients', :'same'::jsonb, 'after',
    jsonb_build_object('at', o2 -> 'rows' -> 0 -> 'last_at', 'patient_id', o2 -> 'rows' -> 0 -> 'patient_id'))) o3;

\echo '── a day''s totals stay as they were: a discount is waived on its own day; the refund''s day carries its reversal'
reset role;
insert into billing.payments (organization_id, id, receipt, department_id, patient_id, method, total, discount, discount_reason, author_id, at, day)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f0f1', 'R-00098', :'cash', :'p2', 'cash', 90, 10, 'Staff', '00000000-0000-0000-0000-0000000000ba',
        now() - interval '1 day', ((now() - interval '1 day') at time zone 'Africa/Cairo')::date);
insert into billing.payment_lines (organization_id, payment_id, n, kind, department_id, name, quantity, amount)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f0f1', 1, 'handed', :'ph', 'Panadol Extra', 1, 100);
set role authenticated;
select t.as(:'cr');
select ((now() - interval '1 day') at time zone 'Africa/Cairo')::date as yesterday \gset
select (d ->> 'waived') as waived_before from pg_temp.op('billing.day', :'cash') d \gset
select t.ok((d ->> 'waived')::numeric = 10 and (d ->> 'taken')::numeric = 130, 'yesterday: 10 waived for Staff') from pg_temp.op('billing.day', :'cash', jsonb_build_object('day', :'yesterday')) d;
select t.ok((r ->> 'total')::numeric = -90, 'yesterday''s receipt given back today')
  from pg_temp.op('billing.refund', :'cash', '{"payment_id":"00000000-0000-0000-0000-00000000f0f1","reason":"returned"}') r;
select t.ok((d ->> 'waived')::numeric = 10 and (d ->> 'taken')::numeric = 130, 'yesterday is as it was: still 10 waived, as its taken is still taken')
  from pg_temp.op('billing.day', :'cash', jsonb_build_object('day', :'yesterday')) d;
select t.ok((d ->> 'waived')::numeric = :'waived_before'::numeric - 10, 'today carries the reversal: 10 less waived') from pg_temp.op('billing.day', :'cash') d;

\echo '── unticked: what the Lab charged stays (as it stood); what is ordered after is not charged; rebuild = live. Off for the clinic: no operation'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'lab', 'data', '{"packs":[]}'::jsonb)) ->> 'key' as unticked;
select t.as(:'sal');
select t.landed(t.w(pg_temp.cbc('00000000-0000-0000-0000-00000000e20a', :'p2', :'psy')), 'another CBC for Soad, after the untick');
select t.as(:'tech');
select t.landed(t.w(t.e('step', :'p2', :'lab', '{"status":"in-progress","step":"collected"}', null, null, '00000000-0000-0000-0000-00000000e10a', 'answers')), 'her first CBC collected');
reset role;
select core.drain() as drained;
select t.ok(exists (select 1 from billing.charges where item = '00000000-0000-0000-0000-00000000e10a' and open) and not exists (select 1 from billing.charges where item = '00000000-0000-0000-0000-00000000e20a'),
  'her first CBC stays charged; the one after is free');
select t.ok(core.rebuild_check('00000000-0000-0000-0000-0000000000a1') = '[]'::jsonb, 'rebuild = live');
set role authenticated;
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as billing_off;
select t.as(:'cr');
select t.refuses(format($q$select pg_temp.op('billing.owed', %L)$q$, :'cash'), 'pack_off');
