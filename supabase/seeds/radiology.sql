-- The radiology pack's seed (spec/openCare.md §5.1 rule 9, §5.5): the clinic turns the pack on, the Radiology department is made from
-- the pack's starter setup (it ticks radiology, opens on Scan in place of the bench, beside Report; its exams by kind), and a demo
-- person for each role the pack declares: the radiologist, Dr. Mai Farouk, and the radiographer, Ahmed Saber. Ids in the pack's own
-- namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is supabase/demo/radiology.sql.

select demo.layer('radiology');
select demo.pack_on('radiology');
select demo.setup(demo.id('radiology', 'department'), 'radiology.department', 'Radiology', 8);

select demo.person(demo.id('radiology', 'radiologist'), 'radiology@demo.com', 'Dr. Mai Farouk', 'Dr');
select demo.grant(demo.id('radiology', 'radiologist'), '00000000-0000-0000-0000-00000000cc01', demo.id('radiology', 'department'));
select demo.person(demo.id('radiology', 'radiographer'), 'xray@demo.com', 'Ahmed Saber');
select demo.grant(demo.id('radiology', 'radiographer'), '00000000-0000-0000-0000-00000000cc02', demo.id('radiology', 'department'));
