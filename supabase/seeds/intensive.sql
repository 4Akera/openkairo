-- Critical care's seed (spec/openCare.md §5.6): the clinic turns the pack on; the ICU is made from the pack's starter setup (six beds,
-- inpatient stays, the board and the ICU chart, the unit's infusions); its nurse Mariam Saad and its doctor Dr. Hany Salem work there.
-- The CCU is made from the pack's second starter setup (four beds, the cardiac rows on); Dr. Tarek Nour is its doctor, and Mariam Saad
-- nurses there too.
-- Ids in the pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is
-- supabase/demo/intensive.sql. Ward nursing on the ICU is the clinic's own choice (supabase/seeds/clinic_packs.sql).
select demo.layer('intensive');
select demo.pack_on('intensive');
select demo.setup(demo.id('intensive', 'icu'), 'intensive.icu', 'ICU', 10);
select demo.person(demo.id('intensive', 'nurse'), 'mariam@demo.com', 'Mariam Saad');
select demo.grant(demo.id('intensive', 'nurse'), demo.base('role:nurse'), demo.id('intensive', 'icu'));
select demo.person(demo.id('intensive', 'doctor'), 'hany@demo.com', 'Dr. Hany Salem', 'Dr');
select demo.grant(demo.id('intensive', 'doctor'), demo.base('role:doctor'), demo.id('intensive', 'icu'));
select demo.setup(demo.id('intensive', 'ccu'), 'intensive.ccu', 'CCU', 11);
select demo.person(demo.id('intensive', 'ccu doctor'), 'tarek@demo.com', 'Dr. Tarek Nour', 'Dr');
select demo.grant(demo.id('intensive', 'ccu doctor'), demo.base('role:doctor'), demo.id('intensive', 'ccu'));
select demo.grant(demo.id('intensive', 'nurse'), demo.base('role:nurse'), demo.id('intensive', 'ccu'));
