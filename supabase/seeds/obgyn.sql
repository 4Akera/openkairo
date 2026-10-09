-- The obgyn pack's seed, its clinic part (spec/openCare.md §5.1 rule 9, §5.8): the clinic turns the pack on, the ObGyn clinic is made from
-- the pack's starter setup (it ticks obgyn, opens on the base's queue; the antenatal schedule, visits, notices and gynaecology's
-- intervals are the clinic's settings with their starter rows), and a demo person for each role the pack declares: the obstetricians
-- Dr. Nermeen Fathy and Dr. Ahmed Zaki, and the midwife Samah Lotfy. Ids in the pack's own namespace; written through the doors by the
-- kit; run again, it adds only what is missing. Its day is supabase/demo/obgyn.sql. The labour ward's part follows: the Labour ward
-- made from the pack's labour ward setup, its midwife Hanan Fouad, and the clinic's two obstetricians working there too (spec §5.6).

select demo.layer('obgyn');
select demo.pack_on('obgyn');
select demo.setup(demo.id('obgyn', 'clinic'), 'obgyn.clinic', 'ObGyn clinic', 11);

select demo.person(demo.id('obgyn', 'nermeen'), 'obgyn@demo.com', 'Dr. Nermeen Fathy', 'Dr');
select demo.grant(demo.id('obgyn', 'nermeen'), '00000000-0000-0000-0000-00000000d301', demo.id('obgyn', 'clinic'));
select demo.person(demo.id('obgyn', 'zaki'), 'zaki@demo.com', 'Dr. Ahmed Zaki', 'Dr');
select demo.grant(demo.id('obgyn', 'zaki'), '00000000-0000-0000-0000-00000000d301', demo.id('obgyn', 'clinic'));
select demo.person(demo.id('obgyn', 'samah'), 'midwife@demo.com', 'Samah Lotfy');
select demo.grant(demo.id('obgyn', 'samah'), '00000000-0000-0000-0000-00000000d302', demo.id('obgyn', 'clinic'));

-- the labour ward (§5.6): made from the pack's starter setup (four delivery beds, four postnatal beds, six cots, the board and the Labour
-- tab, active labour from 4 cm); its midwife Hanan Fouad, and the clinic's two obstetricians work there too. Ward nursing on the Labour
-- ward is the clinic's own choice (supabase/seeds/clinic_packs.sql)
select demo.setup(demo.id('obgyn', 'labour ward'), 'obgyn.labour_ward', 'Labour ward', 12);
select demo.person(demo.id('obgyn', 'hanan'), 'hanan@demo.com', 'Hanan Fouad');
select demo.grant(demo.id('obgyn', 'hanan'), '00000000-0000-0000-0000-00000000d302', demo.id('obgyn', 'labour ward'));
select demo.grant(demo.id('obgyn', 'nermeen'), '00000000-0000-0000-0000-00000000d301', demo.id('obgyn', 'labour ward'));
select demo.grant(demo.id('obgyn', 'zaki'), '00000000-0000-0000-0000-00000000d301', demo.id('obgyn', 'labour ward'));
