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
select t.ok(not exists (select 1 from pg_attribute a where a.attrelid = 'billing.charges'::regclass and a.attname in ('amount', 'price', 'total') and not a.attisdropped),
  'a charge row holds no amount: its price is read by billing''s operations, as it stood');
select t.ok((select jsonb_object_agg(key, coalesce(to_jsonb(clear), 'null')) from core.stores where layer = 'billing')
  = '{"billing.payments":["patient_id"],"billing.sent":null,"billing.anyway":null}', 'Erase: payments lose the patient, open bills and reasons go');
select t.ok((select jsonb_object_agg(key, patients) from core.ops where layer = 'billing')
  = '{"billing.owed":true,"billing.lines":true,"billing.paid":true,"billing.day":false,"billing.pay":true,"billing.refund":true,"billing.close":false,
      "billing.send":true,"billing.waiting":true,"billing.anyway":true}', 'every operation returning patient ids says so');
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
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '5')))$q$, :'lab', :'disp'), 'unknown_service');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.visit_fee', 'owner_id', %L, 'data', '{"amount":"200"}'::jsonb))$q$, :'im'), 'already_priced');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '300')))$q$, :'psy', :'psyc'), 'not_allowed');
select t.as(:'cr');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key', 'billing.price', 'owner_id', %L, 'data', jsonb_build_object('service_id', %L, 'price', '1')))$q$, :'lab', :'cxr'), 'not_allowed');

\echo '── charges: from entries and settings only, heard after commit; a visit fee once seen there, each priced service as ordered'
select t.as(:'rec');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e100', :'pt', :'desk', :'im'), 'Ahmed checked in to Internal Medicine');
select t.ok(public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'p2', 'given', jsonb_build_array('Soad'), 'family', 'Ali',
  'gender', 'female', 'birth_date', '1980-05-02'))) -> 'patient' ->> 'id' = :'p2', 'and Soad registered');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'cr');
select t.ok(jsonb_array_length(l -> 'charges') = 0 and l ->> 'desk' = 'everyone', 'checked in, not yet seen: no visit fee') from pg_temp.lines(:'pt') l;
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
select t.ok(not exists (select 1 from billing.charges where patient_id = :'pt'), 'nothing charged in the writer''s own transaction: billing listens after commit');
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
select t.ok(w -> 'waiting' = '["00000000-0000-0000-0000-00000000e10b"]' and w -> 'paid' @> '["00000000-0000-0000-0000-00000000e105","00000000-0000-0000-0000-00000000e10a"]'
  and jsonb_array_length(w -> 'paid') = 2 and not w::text ~ '"(amount|price|total)"', 'at the Lab: Ahmed''s later CBC waits for payment; the two paid do not; words only, no amount')
  from pg_temp.waiting(array['00000000-0000-0000-0000-00000000e105', '00000000-0000-0000-0000-00000000e10b', '00000000-0000-0000-0000-00000000e10a', '00000000-0000-0000-0000-00000000e107']) w;
select t.landed(t.w(t.e('step', :'pt', :'lab', '{"status":"in-progress","step":"collected"}', null, null, '00000000-0000-0000-0000-00000000e10b', 'answers')),
  'the writer never refuses waiting work: collected anyway');
select t.refuses($$select pg_temp.op('billing.anyway', '00000000-0000-0000-0000-0000000000d2', '{"order_item":"00000000-0000-0000-0000-00000000e10b","reason":"  "}')$$, 'reason_missing');
select t.refuses($$select pg_temp.op('billing.anyway', '00000000-0000-0000-0000-0000000000d2', '{"order_item":"00000000-0000-0000-0000-00000000e100","reason":"emergency"}')$$, 'not_found');
select t.ok((r -> 'patient_ids' ->> 0)::uuid = :'pt', 'Collect anyway…: the reason kept by billing, with who and when')
  from pg_temp.op('billing.anyway', :'lab', '{"order_item":"00000000-0000-0000-0000-00000000e10b","reason":"emergency: chest pain"}') r;
select t.as(:'cr');
select t.ok((l -> 'before_payment')::boolean and l -> 'waiting' = jsonb_build_array(:'lab'), 'the cashier''s card: the Lab is waiting, done before payment') from pg_temp.lines(:'pt') l;
select t.ok((o -> 'rows' -> 0 -> 'before_payment')::boolean and o -> 'rows' -> 0 -> 'waiting' = jsonb_build_array(:'lab'), 'and the row: "done before payment", "Laboratory is waiting"')
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
select t.ok(w -> 'paid' = '["00000000-0000-0000-0000-00000000e123"]', 'its order is paid, for the soft check')
  from pg_temp.op('billing.waiting', :'ph', '{"orders":["00000000-0000-0000-0000-00000000e123"]}') w;
reset role;
select t.ok((select string_agg(kind || ':' || name || ':' || quantity || ':' || amount, ',') from billing.payment_lines l join billing.payments p on p.id = l.payment_id
  where p.department_id = :'ph') = 'handed:Nexium 40:1.00:75.00', 'kept as handed: a name, a quantity, an amount; who took it is the payment''s');

\echo '── closing a drawer: the float and the cash taken since the last closing (given back included), counted; a difference needs its reason'
select t.as(:'cr');
select t.ok((d -> 'drawer' ->> 'float')::numeric = 500 and (d -> 'drawer' ->> 'cash')::numeric = 222.50 and (d -> 'drawer' ->> 'expected')::numeric = 722.50,
  'Mona''s drawer: float 500 + cash 222.50 (taken, given back and taken again) = 722.50 expected') from pg_temp.op('billing.day', :'cash') d;
select t.refuses(format($q$select pg_temp.op('billing.close', %L, '{"counted":"700"}')$q$, :'cash'), 'reason_missing');
select t.refuses(format($q$select pg_temp.op('billing.close', %L, '{"counted":"seven"}')$q$, :'cash'), 'bad_count');
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
  = jsonb_build_object(:'im', 0.00, :'lab', 95.00, :'ph', 222.50), 'a row a department whose work was paid') from pg_temp.op('billing.day', :'cash') d;
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

\echo '── a visit fee where seen: sent on to Psychiatry (no billing) it is Internal Medicine''s only; paid, the patient is in Nothing to pay'
set role authenticated;
select t.as(:'rec');
select t.landed(t.check_in('00000000-0000-0000-0000-00000000e200', :'p2', :'desk', :'im'), 'Soad checked in to Internal Medicine');
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
