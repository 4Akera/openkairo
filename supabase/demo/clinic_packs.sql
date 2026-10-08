-- The demo clinic's day between its packs (spec/openCare.md §5.1 rule 9, §5.4; its choices: supabase/seeds/clinic_packs.sql): the box of
-- Glucophage the pharmacist gave Hamdy ten minutes ago went to the main cashier as an open bill (Send to cashier, the line as Dispensing's
-- row hands it: a name, a quantity, an amount, his metformin's order), so he pays it there with his visit, or at the Pharmacy's counter.
-- Through billing's door as the pharmacist; a reload erases Hamdy first, and his open bill with him (§5.4 Erase). Skipped while either
-- pack is off.

select demo.layer('clinic_packs');

do $$
declare c uuid := demo.base('clinic'); ph uuid := demo.id('pharmacy', 'department'); hamdy uuid := demo.id('pharmacy', 'patient:hamdy'); o core.entries;
begin
  if not (core.packs_used(c) @> array['pharmacy', 'billing']) then return; end if;
  select x.* into o from core.entries x join core.entries m on m.organization_id = x.organization_id and m.id = x.refers_to
   where x.organization_id = c and x.patient_id = hamdy and x.type = 'order' and x.data ->> 'department_id' = ph::text and m.data -> 'drug' ->> 'text' = 'Metformin'
   order by x.recorded_at limit 1;
  perform demo.as(demo.id('pharmacy', 'pharmacist'));
  perform public.pack_op(jsonb_build_object('op', 'billing.send', 'department_id', ph, 'args', jsonb_build_object('patient_id', hamdy, 'visit_id', o.visit_id,
    'lines', jsonb_build_array(jsonb_build_object('name', 'Glucophage 500 · box', 'quantity', 1, 'amount', '45.00', 'order_item', o.item)))));
end $$;
