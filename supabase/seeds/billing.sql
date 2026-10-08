-- The billing pack's seed (spec/openCare.md §5.1 rule 9, §5.4): the clinic turns the pack on; the main Cashier is made from the pack's
-- own starter setup (Cashier and Today, Prices for whoever sets them; it takes everyone's payments); General Practice and the clinic's
-- Laboratory tick billing through the pack's small setups (nothing else of theirs changes); the clinic's prices for them — the GP's visit
-- fee and the base Laboratory's own tests, the lithium level priced At the order — the reasons a charge may be waived, and Pay first at
-- the Laboratory; a demo person for each role the pack declares. Ids in the pack's own namespace; written through the doors by the kit; run again, it adds only what
-- is missing. Its day is supabase/demo/billing.sql.

select demo.layer('billing');
select demo.pack_on('billing');
select demo.setup(demo.id('billing', 'cashier'), 'billing.cashier', 'Cashier', 8);
select demo.serve(demo.base('gp'), 'billing.clinic');
select demo.serve(demo.base('lab'), 'billing.bench');

-- the reasons a charge may be waived: the clinic's own list, on the pack's page (a discount takes its reason from it only)
select demo.setting('billing.reasons', null, null, '{"reasons":["Staff","Charity","Follow-up within 7 days"]}');
-- Billing → Prices: the GP's visit fee, and the Laboratory's own tests (its lithium level priced At the order, as a send-out the
-- cashier prices on the payment card)
select demo.setting('billing.visit_fee', demo.base('gp'), demo.id('billing', 'fee:gp'), '{"amount":"150.00"}');
do $$
declare p record;
begin
  for p in select * from (values ('cbc', '{"price":"80.00"}'), ('hba1c', '{"price":"120.00"}'), ('creat', '{"price":"60.00"}'), ('lipids', '{"price":"150.00"}'),
                                  ('lithium', '{"at_order":true}')) x(code, price) loop
    perform demo.setting('billing.price', demo.base('lab'), demo.id('billing', 'price:' || p.code),
      jsonb_build_object('service_id', demo.thing(demo.base('lab'), 'service', p.code)) || p.price::jsonb);
  end loop;
end $$;

-- Pay first at the Laboratory (spec §5.4, a soft check, never a server refusal): its priced tests wait for payment, each on its own, until
-- paid at the Cashier or collected anyway with a reason. Billing's own setting on the base's department, written once through the
-- door as the owner would on Billing → Prices (a reload leaves what staff changed since)
do $$
begin
  if core.setting_at(demo.base('clinic'), 'billing.pay_first', demo.base('lab')) is not null then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_build_object('key', 'billing.pay_first', 'owner_id', demo.base('lab'), 'data', '{"on":true}'::jsonb));
end $$;

-- its roles' people: the cashier at the main Cashier; the accountant, everywhere, since a price is set where its service is done (the
-- Laboratory's, the GP's visit fee), and reads every desk's day
select demo.person(demo.id('billing', 'cashier person'), 'cashier@demo.com', 'Mona Saad');
select demo.grant(demo.id('billing', 'cashier person'), '00000000-0000-0000-0000-00000000ce01', demo.id('billing', 'cashier'));
select demo.person(demo.id('billing', 'accountant'), 'accounts@demo.com', 'Wael Shawky');
select demo.grant(demo.id('billing', 'accountant'), '00000000-0000-0000-0000-00000000ce02', null);
