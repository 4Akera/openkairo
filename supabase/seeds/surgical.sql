-- The surgical pack's seed (spec/openCare.md §5.1 rule 9, §5.8): the clinic turns the pack on; the Surgery clinic is made from the pack's
-- starter setup; the surgeons' templates for their operations and their post-op presets (the base's presets: each /rx line and the
-- plan the surgeon signs with the note); a demo person for the role the pack declares: the surgeon, Dr. Hesham Abdelaal. Ids in the
-- pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is supabase/demo/surgical.sql.
select demo.layer('surgical');
select demo.pack_on('surgical');
select demo.setup(demo.id('surgical', 'clinic'), 'surgical.clinic', 'Surgery clinic', 42);

select demo.person(demo.id('surgical', 'surgeon'), 'surgery@demo.com', 'Dr. Hesham Abdelaal', 'Dr');
select demo.grant(demo.id('surgical', 'surgeon'), '00000000-0000-0000-0000-00000000e901', demo.id('surgical', 'clinic'));

select demo.setting('surgical.templates', null, null, $j${"templates":[
  {"surgeon":"Dr. Hesham Abdelaal","operation":"lapchole","postop":"postop lapchole",
   "why":"Symptomatic gallstones: biliary colic; stones on ultrasound.",
   "findings":"Gallbladder with stones; cystic duct and one cystic artery; liver normal.",
   "steps":"1. Open entry at the umbilicus, CO₂ 12 mmHg; 10 mm epigastric and two 5 mm right subcostal ports.\n2. Omentum freed from Hartmann's pouch.\n3. Calot's triangle opened; the critical view of safety seen.\n4. Cystic duct (2 + 1 clips) and artery (1 + 1) clipped and divided.\n5. Gallbladder off the liver bed with diathermy; no bile spilled; bed dry.\n6. Gallbladder out in a bag through the umbilicus.",
   "closure":"Umbilical sheath 0 polyglactin; skin 3-0 subcuticular; bupivacaine 0.25 % 20 mL to the ports."},
  {"surgeon":"Dr. Hesham Abdelaal","operation":"ihr_mesh","postop":"postop hernia",
   "why":"Symptomatic reducible inguinal hernia.",
   "findings":"Indirect sac; cord and ilioinguinal nerve preserved.",
   "steps":"1. Groin incision; external oblique opened.\n2. Cord lifted; the sac freed and reduced.\n3. Polypropylene mesh 7.5 × 15 cm laid and sutured with 2-0 polypropylene.\n4. External oblique closed over the cord.",
   "closure":"Scarpa's 3-0 polyglactin; skin 3-0 subcuticular; bupivacaine 0.5 % 10 mL."}
]}$j$::jsonb);
select demo.setting('preset', null, demo.id('surgical', 'preset:postop_lapchole'), '{"name":"Post-op lap chole","shortcut":"postop","lines":[
  "/rx paracetamol 1g iv q6h 2d","/rx ketorolac 30mg iv q8h 2d","/rx ondansetron 4mg iv q8h prn sickness",
  "plan: obs every 30 min for 2 hours, then every 4 hours · sips at 2 hours, light food tonight · walk this evening with help · home tomorrow if eating, walking, pain controlled"]}'::jsonb);
select demo.setting('preset', null, demo.id('surgical', 'preset:postop_hernia'), '{"name":"Post-op hernia, day case","shortcut":"postophernia","lines":[
  "/rx paracetamol 1g po q6h 5d","/rx ibuprofen 400mg po tds 5d ; after food",
  "plan: home this evening if passing urine, walking and comfortable · no lifting for 4 weeks · wound check in 10 days"]}'::jsonb);
