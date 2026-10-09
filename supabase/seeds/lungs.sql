-- The lungs pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Chest clinic is made from the pack's
-- starter setup; its chest physician, Dr. Dalia Mostafa. The GLI-2012 demo sample is loaded with the pack (its migration), marked so.
-- Ids in the pack's own namespace; run again, it adds only what is missing. Its day is supabase/demo/lungs.sql.

select demo.layer('lungs');
select demo.pack_on('lungs');
select demo.setup(demo.id('lungs', 'clinic'), 'lungs.clinic', 'Chest clinic', 23);

select demo.person(demo.id('lungs', 'physician'), 'chest@demo.com', 'Dr. Dalia Mostafa', 'Dr');
select demo.grant(demo.id('lungs', 'physician'), '00000000-0000-0000-0000-00000000e601', demo.id('lungs', 'clinic'));
