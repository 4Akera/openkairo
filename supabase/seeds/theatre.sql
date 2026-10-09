-- The theatre pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Theatre is made from the pack's starter
-- setup (its list in place of the bench; its operations by specialty, each with its usual time, a side asked and the risks to tell;
-- three rooms with their week of sessions); a demo person for the role the pack declares: the theatre nurse, Iman Zidan. Ids in the
-- pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is
-- supabase/demo/theatre.sql.


select demo.layer('theatre');
select demo.pack_on('theatre');
select demo.setup(demo.id('theatre', 'department'), 'theatre.department', 'Theatre', 44);

select demo.person(demo.id('theatre', 'nurse'), 'theatre@demo.com', 'Iman Zidan');
select demo.grant(demo.id('theatre', 'nurse'), '00000000-0000-0000-0000-00000000ea01', demo.id('theatre', 'department'));
