-- The obgyn pack's seed, its clinic part (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on, the ObGyn clinic is made from
-- the pack's starter setup (it ticks obgyn, opens on the base's queue; the antenatal schedule, visits, notices and gynaecology's
-- intervals are the clinic's settings with their starter rows), and a demo person for each role the pack declares: the obstetricians
-- Dr. Nermeen Fathy and Dr. Ahmed Zaki, and the midwife Samah Lotfy. Ids in the pack's own namespace; written through the doors by the
-- kit; run again, it adds only what is missing. Its day is supabase/demo/obgyn.sql. (The labour ward's part comes with the beds lane.)

select demo.layer('obgyn');
select demo.pack_on('obgyn');
select demo.setup(demo.id('obgyn', 'clinic'), 'obgyn.clinic', 'ObGyn clinic', 11);

select demo.person(demo.id('obgyn', 'nermeen'), 'obgyn@demo.com', 'Dr. Nermeen Fathy', 'Dr');
select demo.grant(demo.id('obgyn', 'nermeen'), '00000000-0000-0000-0000-00000000d301', demo.id('obgyn', 'clinic'));
select demo.person(demo.id('obgyn', 'zaki'), 'zaki@demo.com', 'Dr. Ahmed Zaki', 'Dr');
select demo.grant(demo.id('obgyn', 'zaki'), '00000000-0000-0000-0000-00000000d301', demo.id('obgyn', 'clinic'));
select demo.person(demo.id('obgyn', 'samah'), 'midwife@demo.com', 'Samah Lotfy');
select demo.grant(demo.id('obgyn', 'samah'), '00000000-0000-0000-0000-00000000d302', demo.id('obgyn', 'clinic'));
