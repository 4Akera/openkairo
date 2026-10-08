-- Ward nursing's seed (spec/openCare.md §5.6): the clinic turns the pack on; the Medical Ward (the base's) takes the pack's starter
-- setup, which only ticks it (its beds, stays and board are already the base ward's); Nour Adel, the ward's nurse, works there.
-- Ids in the pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is
-- supabase/demo/bedside.sql.
select demo.layer('bedside');
select demo.pack_on('bedside');
select demo.serve(demo.base('ward'), 'bedside.ward');
-- its own person: the ward's nurse, who writes the obs and NEWS2
select demo.person(demo.id('bedside', 'nurse'), 'nour@demo.com', 'Nour Adel');
select demo.grant(demo.id('bedside', 'nurse'), demo.base('role:nurse'), demo.base('ward'));
