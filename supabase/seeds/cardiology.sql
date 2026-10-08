-- The cardiology pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Cardiology clinic and the Echo room are
-- made from the pack's starter setups (the clinic's queue; the Echo room's bench answering /echo for every department); a demo person for
-- each role it declares: the cardiologist, Dr. Wael Ghoneim, and the echo doctor, Dr. Rasha Nabil. Ids in the pack's own namespace; written
-- through the doors by the kit; run again, it adds only what is missing. Its day is supabase/demo/cardiology.sql.

select demo.layer('cardiology');
select demo.pack_on('cardiology');
select demo.setup(demo.id('cardiology', 'clinic'), 'cardiology.clinic', 'Cardiology clinic', 20);
select demo.setup(demo.id('cardiology', 'echo'), 'cardiology.echo_room', 'Echo room', 21);

select demo.person(demo.id('cardiology', 'cardiologist'), 'cardiology@demo.com', 'Dr. Wael Ghoneim', 'Dr');
select demo.grant(demo.id('cardiology', 'cardiologist'), '00000000-0000-0000-0000-00000000e401', demo.id('cardiology', 'clinic'));
select demo.person(demo.id('cardiology', 'echo_doctor'), 'echo@demo.com', 'Dr. Rasha Nabil', 'Dr');
select demo.grant(demo.id('cardiology', 'echo_doctor'), '00000000-0000-0000-0000-00000000e402', demo.id('cardiology', 'echo'));
