-- The laboratory pack's seed (spec/openCare.md §5.3): the clinic turns the pack on, and the demo's own Laboratory takes the pack's
-- starter setup — it ticks lis, opens on Collect (in place of the bench) beside Results, and gains the catalogue of the tests most
-- asked for (what it had stays); the lab technician, Karim Fawzy, holds the pack's technician role there, and its senior, Hala Mansour,
-- approves what another released where a second person checks (the large lab's switches, all off here: Settings turns them on). Run again, it adds only what
-- is missing. The Laboratory is the base's, which this pack now serves (demo.serve: its own setup, through the door).
select demo.layer('lis');
select demo.pack_on('lis');
select demo.serve(demo.base('lab'), 'lis.laboratory');
select demo.grant(demo.base('tech'), '00000000-0000-0000-0000-00000000cf01', demo.base('lab'));
-- its own person: a second technician, who draws the blood at the collection chair
select demo.person(demo.id('lis', 'collector'), 'collect@demo.com', 'Mona Saber');
select demo.grant(demo.id('lis', 'collector'), '00000000-0000-0000-0000-00000000cf01', demo.base('lab'));
-- its senior: approves on To check (never what she released herself)
select demo.person(demo.id('lis', 'senior'), 'senior@demo.com', 'Hala Mansour');
select demo.grant(demo.id('lis', 'senior'), '00000000-0000-0000-0000-00000000cf02', demo.base('lab'));
