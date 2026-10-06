-- The pharmacy pack's seed (spec/openCare.md §5.1 rule 9): the clinic turns the pack on, the Pharmacy department ticks it (its
-- Dispensing stands in for the bench), its settings, its dispensing service, and a demo person for each role the pack declares.
-- Ids in the pack's own namespace (demo.id('pharmacy', …)); written through the doors by the kit; run again, it adds only what is
-- missing. Its day is supabase/demo/pharmacy.sql.

select demo.pack_on('pharmacy');
select demo.department(demo.id('pharmacy', 'department'), 'Pharmacy', 'bench', 6);
select demo.tick(demo.id('pharmacy', 'department'), 'pharmacy');
select demo.screen(demo.id('pharmacy', 'department'), 'pharmacy.dispensing', true);

-- its settings (§5.1 rule 7): a prepared dispense reads late after half an hour here; the clinic's counselling note shown when giving
select demo.setting('pharmacy.late_after', demo.id('pharmacy', 'department'), null, '{"minutes":30}');
select demo.setting('pharmacy.counselling', null, null, '{"show":true,"note":"Say how and when to take it, what to watch for, and when to come back."}');
-- the service a prescription is sent with: one step (prepared), then the dispense that gives it
select demo.setting('service', demo.id('pharmacy', 'department'), demo.id('pharmacy', 'service:dispense'),
  '{"code":"dispense","name":"Dispensing","answer":"pharmacy.dispense","steps":["prepared"]}');

-- its roles' people
select demo.person(demo.id('pharmacy', 'pharmacist'), 'pharm@demo.com', 'Dr. Reem Hamdy', 'Dr');
select demo.grant(demo.id('pharmacy', 'pharmacist'), '00000000-0000-0000-0000-00000000ca01', demo.id('pharmacy', 'department'));
select demo.person(demo.id('pharmacy', 'store keeper'), 'store@demo.com', 'Hesham Ragab');
select demo.grant(demo.id('pharmacy', 'store keeper'), '00000000-0000-0000-0000-00000000ca02', demo.id('pharmacy', 'department'));
