-- Dialysis's seed (spec/openCare.md §5.6): the clinic turns the pack on; the Dialysis unit is made from the pack's starter setup (eight
-- chairs, an HBV chair and an HCV chair among them, three shifts, outpatient stays, the board and the Schedule tab); Rasha Mounir, its
-- nurse, and Dr. Walid Hamza, its doctor, work there. Ids in the pack's own namespace; written through the doors by the kit; run again,
-- it adds only what is missing. Its day is supabase/demo/haemodialysis.sql.
select demo.layer('haemodialysis');
select demo.pack_on('haemodialysis');
select demo.setup(demo.id('haemodialysis', 'department'), 'haemodialysis.unit', 'Dialysis unit', 12);
select demo.person(demo.id('haemodialysis', 'nurse'), 'rasha@demo.com', 'Rasha Mounir');
select demo.grant(demo.id('haemodialysis', 'nurse'), '00000000-0000-0000-0000-00000000d401', demo.id('haemodialysis', 'department'));
select demo.person(demo.id('haemodialysis', 'doctor'), 'walid@demo.com', 'Dr. Walid Hamza', 'Dr');
select demo.grant(demo.id('haemodialysis', 'doctor'), '00000000-0000-0000-0000-00000000d402', demo.id('haemodialysis', 'department'));
