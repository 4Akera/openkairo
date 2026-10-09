-- Emergency's seed (spec/openCare.md §5.6): the clinic turns the pack on; the Emergency department is made from the pack's starter
-- setup (two resus bays, six cubicles, emergency stays, the board and the Patients tab); Heba Nabil, its triage nurse, and Dr. Tamer
-- Ezz, its doctor, work there. Ids in the pack's own namespace; written through the doors by the kit; run again, it adds only what is
-- missing. Its day is supabase/demo/casualty.sql.

select demo.layer('casualty');
select demo.pack_on('casualty');
select demo.setup(demo.id('casualty', 'department'), 'casualty.er', 'Emergency', 9);
select demo.person(demo.id('casualty', 'triage nurse'), 'triage@demo.com', 'Heba Nabil');
select demo.grant(demo.id('casualty', 'triage nurse'), '00000000-0000-0000-0000-00000000d101', demo.id('casualty', 'department'));
select demo.person(demo.id('casualty', 'doctor'), 'er@demo.com', 'Dr. Tamer Ezz', 'Dr');
select demo.grant(demo.id('casualty', 'doctor'), demo.base('role:doctor'), demo.id('casualty', 'department'));
