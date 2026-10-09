-- The demo clinic's own choices between its packs (spec/openCare.md §5.1 rule 9, §5.4): no pack names another, so what joins two of
-- them is the clinic's, as its owner sets it in Settings → Departments — here, after every pack's seed. The Pharmacy bills (billing
-- ticked there: its prices show, its Dispensing rows hand their lines) and takes its own payment at its counter, where the pharmacist
-- holds the Cashier's role and has billing's Today on the Pharmacy's line, to count and close their own drawer. Written through the
-- doors as the owner; run again, it adds only what is missing. Skipped while either pack is off. Emergency uses Ward nursing too, after
-- its own pack, so Emergency's words lead each tile's line and its two buttons are the tile's (skipped while either is off). Its day is
-- supabase/demo/clinic_packs.sql.

select demo.layer('clinic_packs');

do $$
declare c uuid := demo.base('clinic'); ph uuid := demo.id('pharmacy', 'department');
begin
  if not (core.packs_used(c) @> array['pharmacy', 'billing']) then return; end if;
  perform demo.tick(ph, 'billing');
  if core.setting_at(c, 'billing.desk', ph) is null then
    perform demo.as(demo.base('owner'));
    perform public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', ph, 'data', '{"takes":"own","float":"0.00"}'::jsonb));
  end if;
  perform demo.grant(demo.id('pharmacy', 'pharmacist'), '00000000-0000-0000-0000-00000000ce01', ph);
  -- its line as it shows (Dispensing, opening it, and Stock), then billing's Today after them
  perform demo.screen(ph, 'pharmacy.dispensing', true);
  perform demo.screen(ph, 'pharmacy.stock');
  perform demo.screen(ph, 'billing.today');
end $$;

do $$
declare c uuid := demo.base('clinic'); er uuid := demo.id('casualty', 'department');
begin
  if not (core.packs_used(c) @> array['casualty', 'bedside']) then return; end if;
  perform demo.tick(er, 'bedside');
end $$;
