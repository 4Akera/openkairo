-- The demo clinic's own choices between its packs (spec/openCare.md §5.1 rule 9, §5.4): no pack names another, so what joins two of
-- them is the clinic's, as its owner sets it in Settings → Departments — here, after every pack's seed. The Pharmacy bills (billing
-- ticked there: its prices show, its Dispensing rows hand their lines) and takes its own payment at its counter, where the pharmacist
-- holds the Cashier's role and has billing's Today on the Pharmacy's line, to count and close their own drawer. Written through the
-- doors as the owner; run again, it adds only what is missing. Skipped while either pack is off. Its day is supabase/demo/clinic_packs.sql.

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

-- Family medicine uses chronic care and the immunisation pack too (§5.7 Q16), after its own and in that order, with the immunisation
-- list a tab of its line; the desk asks for a family file at New patient (§5.7 C4), so it ticks the family medicine pack, whose door it writes
-- the file through. Skipped while the family medicine pack is off; each other pack only while it is on.
do $$
declare c uuid := demo.base('clinic'); fm uuid := demo.id('familycare', 'department');
begin
  if not (core.packs_used(c) @> array['familycare']) then return; end if;
  perform demo.tick(demo.base('desk'), 'familycare');
  if core.packs_used(c) @> array['chroniccare'] then perform demo.tick(fm, 'chroniccare'); end if;
  if core.packs_used(c) @> array['vaccines'] then
    -- its line as drawn: the queue, Families, then the immunisation list
    perform demo.tick(fm, 'vaccines');
    perform demo.screen(fm, 'vaccines.room');
  end if;
end $$;
