-- The family pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on, Family medicine is made from the pack's
-- starter setup (it ticks the family pack; its queue and Families; the checks by age and sex; New patient asks for a file), and its
-- doctor, Dr. Hazem Ouda (the base's Doctor). The other packs Family medicine uses, and the desk's file at New patient, are the clinic's
-- choices (supabase/seeds/clinic_packs.sql). Ids in the pack's own namespace; run again, it adds only what is missing.

select demo.layer('family_medicine');
select demo.pack_on('family_medicine');
select demo.setup(demo.id('family_medicine', 'department'), 'family_medicine.medicine', 'Family medicine', 11);
select demo.person(demo.id('family_medicine', 'doctor'), 'family@demo.com', 'Dr. Hazem Ouda', 'Dr');
select demo.grant(demo.id('family_medicine', 'doctor'), '00000000-0000-0000-0000-00000000c002', demo.id('family_medicine', 'department'));
