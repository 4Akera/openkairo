-- The pharmacy pack's seed (spec/openCare.md §5.1 rule 9): the clinic turns the pack on, the Pharmacy department is made from the
-- pack's starter setup (it ticks the pack; its Dispensing stands in for the bench), and a demo person for each role the pack declares.
-- Ids in the pack's own namespace (demo.id('pharmacy', …)); written through the doors by the kit; run again, it adds only what is
-- missing. Its day is supabase/demo/pharmacy.sql.

select demo.layer('pharmacy');
select demo.pack_on('pharmacy');
-- the Pharmacy department, made from the pack's starter setup (§5.2): it ticks pharmacy, opens on Dispensing (which stands in for the
-- bench), its dispensing service (one step, prepared, then the dispense that gives it), and a prepared dispense reads late after half an
-- hour here
select demo.setup(demo.id('pharmacy', 'department'), 'pharmacy.pharmacy', 'Pharmacy', 6);
-- the clinic's counselling note shown when giving: a clinic-wide setting, on the pack's page (§5.1 rule 7), never a setup's
select demo.setting('pharmacy.counselling', null, null, '{"show":true,"note":"Say how and when to take it, what to watch for, and when to come back."}');

-- its roles' people
select demo.person(demo.id('pharmacy', 'pharmacist'), 'pharm@demo.com', 'Dr. Reem Hamdy', 'Dr');
select demo.grant(demo.id('pharmacy', 'pharmacist'), '00000000-0000-0000-0000-00000000ca01', demo.id('pharmacy', 'department'));
select demo.person(demo.id('pharmacy', 'store keeper'), 'store@demo.com', 'Hesham Ragab');
select demo.grant(demo.id('pharmacy', 'store keeper'), '00000000-0000-0000-0000-00000000ca02', demo.id('pharmacy', 'department'));
