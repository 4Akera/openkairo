-- The haematology pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Haematology clinic is made from the
-- pack's starter setup; its haematologist, Dr. Ola Kandil. The INR targets and the dosing table are the pack's clinic-wide setting, its
-- starter rows as declared. Ids in the pack's own namespace; run again, it adds only what is missing. Its day is supabase/demo/haematology.sql.

select demo.layer('haematology');
select demo.pack_on('haematology');
select demo.setup(demo.id('haematology', 'clinic'), 'haematology.clinic', 'Haematology clinic', 24);

select demo.person(demo.id('haematology', 'haematologist'), 'haematology@demo.com', 'Dr. Ola Kandil', 'Dr');
select demo.grant(demo.id('haematology', 'haematologist'), '00000000-0000-0000-0000-00000000e701', demo.id('haematology', 'clinic'));
