-- The haemato pack's seed (spec/openCare.md §5.1 rule 9, §5.8): the clinic turns the pack on; the Haematology clinic is made from the
-- pack's starter setup; its haematologist, Dr. Ola Kandil. The INR targets and the dosing table are the pack's clinic-wide setting, its
-- starter rows as declared. Ids in the pack's own namespace; run again, it adds only what is missing. Its day is supabase/demo/haemato.sql.

select demo.layer('haemato');
select demo.pack_on('haemato');
select demo.setup(demo.id('haemato', 'clinic'), 'haemato.clinic', 'Haematology clinic', 24);

select demo.person(demo.id('haemato', 'haematologist'), 'haemato@demo.com', 'Dr. Ola Kandil', 'Dr');
select demo.grant(demo.id('haemato', 'haematologist'), '00000000-0000-0000-0000-00000000e701', demo.id('haemato', 'clinic'));
