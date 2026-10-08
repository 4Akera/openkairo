-- The anaesthesia pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Pre-op clinic and Recovery are
-- made from the pack's starter setups (the queue; five bays on the base's board); the clinic's list of medicines to stop before an
-- operation; a demo person for each role the pack declares: the anaesthetist, Dr. Sherine Rashad, and recovery's nurse, Rehab Seif. Ids
-- in the pack's own namespace; written through the doors by the kit; run again, it adds only what is missing. Its day is
-- supabase/demo/anaesthesia.sql.
select demo.layer('anaesthesia');
select demo.pack_on('anaesthesia');
select demo.setup(demo.id('anaesthesia', 'preop'), 'anaesthesia.preop_clinic', 'Pre-op clinic', 43);
select demo.setup(demo.id('anaesthesia', 'recovery'), 'anaesthesia.recovery', 'Recovery', 45);

select demo.setting('anaesthesia.stop_list', null, null, $j${"rules":[
  {"match":"warfarin, B01AA","what":"stop 5 days before","days":5,"rule":"warfarin: 5 days, an INR the day before","warn":true},
  {"match":"clopidogrel, ticagrelor, prasugrel, B01AC04, B01AC24, B01AC22","what":"stop 5–7 days before (ask the cardiologist with a stent)","days":7,"rule":"clopidogrel 5–7 days","warn":true},
  {"match":"apixaban, rivaroxaban, dabigatran, edoxaban, B01AF, B01AE","what":"stop 2 days before","days":2,"rule":"apixaban, rivaroxaban: 2 days","warn":true},
  {"match":"aspirin, B01AC06","what":"continue, also on the day","rule":"antiplatelet with a stent: continue"},
  {"match":"metformin, A10BA02","what":"no dose on the morning of the operation","days":0,"rule":"metformin: omit on the day"},
  {"match":"empagliflozin, dapagliflozin, canagliflozin, A10BK","what":"stop 3 days before","days":3,"rule":"SGLT2 inhibitors: 3 days","warn":true},
  {"match":"valsartan, losartan, candesartan, enalapril, lisinopril, ramipril, perindopril, captopril, C09","what":"no dose on the morning","days":0,"rule":"ACE inhibitors, ARBs: omit on the day"},
  {"match":"amlodipine, C08","what":"take on the morning with a sip of water","rule":"continue"},
  {"match":"atorvastatin, rosuvastatin, simvastatin, C10","what":"continue","rule":"continue"}
]}$j$::jsonb);

select demo.person(demo.id('anaesthesia', 'anaesthetist'), 'anaesthesia@demo.com', 'Dr. Sherine Rashad', 'Dr');
select demo.grant(demo.id('anaesthesia', 'anaesthetist'), '00000000-0000-0000-0000-00000000eb01', demo.id('anaesthesia', 'preop'));
select demo.grant(demo.id('anaesthesia', 'anaesthetist'), '00000000-0000-0000-0000-00000000eb01', demo.id('anaesthesia', 'recovery'));
select demo.person(demo.id('anaesthesia', 'nurse'), 'recovery@demo.com', 'Rehab Seif');
select demo.grant(demo.id('anaesthesia', 'nurse'), '00000000-0000-0000-0000-00000000eb02', demo.id('anaesthesia', 'recovery'));
