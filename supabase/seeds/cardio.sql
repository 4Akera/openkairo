-- The cardio pack's seed (spec/openCare.md §5.1 rule 9, §5.8): the clinic turns the pack on; the Cardiology clinic and the Echo room are
-- made from the pack's starter setups (the clinic's queue; the Echo room's bench answering /echo for every department); a demo person for
-- each role it declares: the cardiologist, Dr. Wael Ghoneim, and the echo doctor, Dr. Rasha Nabil. Ids in the pack's own namespace; written
-- through the doors by the kit; run again, it adds only what is missing. Its day is supabase/demo/cardio.sql.

select demo.layer('cardio');
select demo.pack_on('cardio');
select demo.setup(demo.id('cardio', 'clinic'), 'cardio.clinic', 'Cardiology clinic', 20);
select demo.setup(demo.id('cardio', 'echo'), 'cardio.echo_room', 'Echo room', 21);

select demo.person(demo.id('cardio', 'cardiologist'), 'cardio@demo.com', 'Dr. Wael Ghoneim', 'Dr');
select demo.grant(demo.id('cardio', 'cardiologist'), '00000000-0000-0000-0000-00000000e401', demo.id('cardio', 'clinic'));
select demo.person(demo.id('cardio', 'echo_doctor'), 'echo@demo.com', 'Dr. Rasha Nabil', 'Dr');
select demo.grant(demo.id('cardio', 'echo_doctor'), '00000000-0000-0000-0000-00000000e402', demo.id('cardio', 'echo'));
