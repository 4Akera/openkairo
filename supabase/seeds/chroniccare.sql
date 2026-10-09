-- The chronic care pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on, the Diabetes clinic is made from the
-- pack's starter setup (it ticks chronic care; its queue and the Chronic care list; the clinic's conditions, targets and checks), and a
-- doctor who works there, Dr. Iman Sherif (the base's Doctor: the pack declares no role of its own). Ids in the pack's own namespace;
-- written through the doors by the kit; run again, it adds only what is missing. Its day is supabase/demo/chroniccare.sql.

select demo.layer('chroniccare');
select demo.pack_on('chroniccare');
select demo.setup(demo.id('chroniccare', 'clinic'), 'chroniccare.clinic', 'Diabetes clinic', 10);
select demo.person(demo.id('chroniccare', 'doctor'), 'diabetes@demo.com', 'Dr. Iman Sherif', 'Dr');
select demo.grant(demo.id('chroniccare', 'doctor'), '00000000-0000-0000-0000-00000000c002', demo.id('chroniccare', 'clinic'));
