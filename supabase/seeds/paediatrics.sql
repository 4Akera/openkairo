-- The paediatrics pack's seed (spec/openCare.md §5.1 rule 9, §5.7; its WHO tables' demo sample is supabase/codes/who_growth_sample.sql,
-- a reference list loaded with the codes): the clinic turns the pack on; the Paediatrics clinic and the Children's ward are made
-- from the pack's starter setups; the clinic's dose list and milestones (its settings, on the pack's page); a demo person for each role
-- it uses: the paediatricians Dr. Rehab Shaker and Dr. Hassan Kandil, and Doha Wagdy, a nurse on the children's ward (the base's Nurse).
-- Ids in the pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is
-- supabase/demo/paediatrics.sql.

select demo.layer('paediatrics');

select demo.pack_on('paediatrics');
select demo.setup(demo.id('paediatrics', 'clinic'), 'paediatrics.clinic', 'Paediatrics clinic', 9);
select demo.setup(demo.id('paediatrics', 'ward'), 'paediatrics.ward', 'Children''s ward', 10);

-- the clinic's own dose list (Q23 b: the EDA list carries no children's doses), per kg a day or a dose; the line under /rx reads it
select demo.setting('paediatrics.doses', null, null, $j${"doses":[
  {"drug":"Amoxicillin","route":"oral","per":"day","from":40,"to":90,"times_from":2,"times_to":3,"most":1000},
  {"drug":"Amoxicillin + clavulanic acid","route":"oral","per":"day","from":40,"to":90,"times_from":2,"times_to":3,"most":875},
  {"drug":"Azithromycin","route":"oral","per":"day","from":10,"to":12,"times_from":1,"times_to":1,"most":500},
  {"drug":"Cefixime","route":"oral","per":"day","from":8,"to":8,"times_from":1,"times_to":2,"most":400},
  {"drug":"Ceftriaxone","route":"iv","per":"day","from":50,"to":100,"times_from":1,"times_to":2,"most":2000},
  {"drug":"Paracetamol","route":"oral","per":"dose","from":10,"to":15,"times_from":4,"times_to":6,"most":1000},
  {"drug":"Ibuprofen","route":"oral","per":"dose","from":5,"to":10,"times_from":3,"times_to":4,"most":400},
  {"drug":"Metronidazole","route":"oral","per":"day","from":20,"to":30,"times_from":3,"times_to":3,"most":500},
  {"drug":"Ondansetron","route":"oral","per":"dose","from":0.1,"to":0.15,"times_from":1,"times_to":3,"most":4}
]}$j$);

-- the clinic's milestones (Q24), started from the CDC's 2022 list: what 3 in 4 children do by each age
select demo.setting('paediatrics.milestones', null, null, $j${"source":"CDC 2022 (Learn the Signs. Act Early.)","milestones":[
  {"months":2,"area":"movement","text":"Holds the head up on the tummy","short":"head up"},{"months":2,"area":"hands","text":"Opens the hands briefly","short":"opens hands"},
  {"months":2,"area":"talking","text":"Makes sounds other than crying","short":"sounds"},{"months":2,"area":"social","text":"Smiles when you talk or smile","short":"smiles"},
  {"months":4,"area":"movement","text":"Holds the head steady when held","short":"head steady"},{"months":4,"area":"hands","text":"Holds a toy put in the hand","short":"holds a toy"},
  {"months":4,"area":"talking","text":"Coos: “oooo”, “aahh”","short":"coos"},{"months":4,"area":"social","text":"Chuckles; smiles to get your attention","short":"chuckles"},
  {"months":6,"area":"movement","text":"Rolls from tummy to back","short":"rolls"},{"months":6,"area":"hands","text":"Reaches to grab a toy","short":"reaches"},
  {"months":6,"area":"talking","text":"Takes turns making sounds with you","short":"turn-taking sounds"},{"months":6,"area":"social","text":"Knows familiar people; laughs","short":"knows familiar people"},
  {"months":9,"area":"movement","text":"Sits without support","short":"sits"},{"months":9,"area":"movement","text":"Gets to sitting alone","short":"gets to sitting"},
  {"months":9,"area":"hands","text":"Moves a toy from one hand to the other","short":"hand to hand"},{"months":9,"area":"hands","text":"Rakes food in with the fingers","short":"rakes food"},
  {"months":9,"area":"talking","text":"Babbles “mamama”, “bababa”","short":"babbles"},{"months":9,"area":"talking","text":"Lifts the arms to be picked up","short":"lifts arms"},
  {"months":9,"area":"social","text":"Looks when the name is called","short":"looks to the name"},{"months":9,"area":"social","text":"Reacts when you leave","short":"reacts when you leave"},
  {"months":9,"area":"social","text":"Laughs at peek-a-boo","short":"peek-a-boo"},
  {"months":12,"area":"movement","text":"Pulls up to stand; walks holding on","short":"cruises"},{"months":12,"area":"hands","text":"Picks things up between thumb and finger","short":"pincer grip"},
  {"months":12,"area":"talking","text":"Waves bye-bye; says “mama” or “dada”","short":"waves, mama"},{"months":12,"area":"social","text":"Plays pat-a-cake","short":"pat-a-cake"},
  {"months":18,"area":"movement","text":"Walks without holding on","short":"walks"},{"months":18,"area":"hands","text":"Scribbles; feeds with the fingers","short":"scribbles"},
  {"months":18,"area":"talking","text":"Says three words or more besides mama and dada","short":"three words"},{"months":18,"area":"social","text":"Points to show you something","short":"points to show"},
  {"months":24,"area":"movement","text":"Kicks a ball; runs","short":"kicks, runs"},{"months":24,"area":"hands","text":"Eats with a spoon","short":"spoon"},
  {"months":24,"area":"talking","text":"Says two words together (“more milk”)","short":"two words together"},{"months":24,"area":"social","text":"Notices when others are hurt or upset","short":"notices others"}
]}$j$);

select demo.person(demo.id('paediatrics', 'rehab'), 'paeds@demo.com', 'Dr. Rehab Shaker', 'Dr');
select demo.grant(demo.id('paediatrics', 'rehab'), '00000000-0000-0000-0000-00000000e301', demo.id('paediatrics', 'clinic'));
select demo.grant(demo.id('paediatrics', 'rehab'), '00000000-0000-0000-0000-00000000e301', demo.id('paediatrics', 'ward'));
select demo.person(demo.id('paediatrics', 'kandil'), 'kandil@demo.com', 'Dr. Hassan Kandil', 'Dr');
select demo.grant(demo.id('paediatrics', 'kandil'), '00000000-0000-0000-0000-00000000e301', demo.id('paediatrics', 'ward'));
select demo.person(demo.id('paediatrics', 'doha'), 'children.nurse@demo.com', 'Doha Wagdy');
select demo.grant(demo.id('paediatrics', 'doha'), '00000000-0000-0000-0000-00000000c003', demo.id('paediatrics', 'ward'));
