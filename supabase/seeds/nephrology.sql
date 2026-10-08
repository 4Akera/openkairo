-- The nephrology pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Nephrology clinic is made from the
-- pack's starter setup; its nephrologist, Dr. Medhat Sorour. The renal list is the pack's clinic-wide setting, its starter rows as declared.
-- Ids in the pack's own namespace; run again, it adds only what is missing. Its day is supabase/demo/nephrology.sql.

select demo.layer('nephrology');
select demo.pack_on('nephrology');
select demo.setup(demo.id('nephrology', 'clinic'), 'nephrology.clinic', 'Nephrology clinic', 22);

select demo.person(demo.id('nephrology', 'nephrologist'), 'nephrology@demo.com', 'Dr. Medhat Sorour', 'Dr');
select demo.grant(demo.id('nephrology', 'nephrologist'), '00000000-0000-0000-0000-00000000e501', demo.id('nephrology', 'clinic'));
