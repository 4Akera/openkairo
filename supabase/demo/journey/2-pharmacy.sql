-- The shared journey's pharmacy step (spec/openCare.md §5.1 rule 9; the journey: supabase/demo/journey/1-base.sql): his antibiotics
-- for home, sent from the ward after the round and given by the pharmacist before he leaves. Skipped while the pack is off.

select demo.layer('pharmacy');

do $$
declare ward uuid := demo.base('ward'); s uuid := demo.kept('journey_stay'); amox uuid := gen_random_uuid(); rx uuid := gen_random_uuid();
begin
  if not 'pharmacy' = any (core.packs_used(demo.base('clinic'))) then return; end if;
  perform demo.use(demo.kept('journey_patient'));
  perform demo.w(demo.base('doctor'), jsonb_build_array(
    demo.e('medication', ward, s, demo.ago(150), demo.med('Amoxicillin and clavulanic acid', 'J01CR02', 1, 'g', 'BD', '{"duration_days":5}'), amox),
    demo.e('order', ward, s, demo.ago(150), jsonb_build_object('service', jsonb_build_object('id', demo.thing(demo.id('pharmacy', 'department'), 'service', 'dispense'),
      'code', 'dispense', 'name', 'Dispensing'), 'department_id', demo.id('pharmacy', 'department'), 'priority', 'routine', 'status', 'active'), rx, amox, 'about')));
  perform demo.w(demo.id('pharmacy', 'pharmacist'), jsonb_build_array(demo.e('pharmacy.dispense', demo.id('pharmacy', 'department'), null, demo.ago(100),
    jsonb_build_object('status', 'completed', 'pharmacy', jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'drug', demo.concept('atc', 'J01CR02', 'Amoxicillin and clavulanic acid 1 g'), 'quantity', demo.q(10, 'tablets', '{tbl}'))))), null, rx, 'answers')));
end $$;
