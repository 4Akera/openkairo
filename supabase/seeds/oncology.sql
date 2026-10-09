-- The oncology pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on; the Oncology clinic and the Chemotherapy
-- day unit are made from the pack's starter setups (the clinic's queue; eight chairs on the base's board, the cycle its one service);
-- the clinic's regimens (a demo sample, not the full list); a demo person for each role the pack declares: the oncologist, Dr. Hesham
-- Abdallah, and the day unit's nurse, Asmaa Farid. Ids in the pack's own namespace; written through the doors by the kit; run again, it
-- adds only what is missing. Its day is supabase/demo/oncology.sql.


select demo.layer('oncology');
select demo.pack_on('oncology');
select demo.setup(demo.id('oncology', 'clinic'), 'oncology.clinic', 'Oncology clinic', 40);
select demo.setup(demo.id('oncology', 'day_unit'), 'oncology.day_unit', 'Chemotherapy day unit', 41);

-- the clinic's regimens and plans: a demo sample, not the full list (rule 7)
select demo.setting('oncology.regimens', null, null, $j${"regimens":[
  {"key":"ac","name":"AC","site":"breast","every_days":21,"cycles":4,
   "drugs":[{"drug":"Doxorubicin","atc":"L01DB01","per":60,"basis":"m2","round":1,"how":"IV push over 10 min, into running saline"},
            {"drug":"Cyclophosphamide","atc":"L01AA01","per":600,"basis":"m2","round":10,"how":"IV in 500 mL saline over 60 min"}],
   "premeds":["Aprepitant 125 mg oral","Granisetron 1 mg IV","Dexamethasone 12 mg IV","Aprepitant 80 mg days 2–3, to take home"],
   "checks":[{"test":"anc","min":1.5},{"test":"plt","min":100},{"test":"egfr","min":30},{"test":"bili","max":1.2},{"test":"ef","min":50}]},
  {"key":"ddac","name":"Dose-dense AC","site":"breast","every_days":14,"cycles":4,
   "drugs":[{"drug":"Doxorubicin","atc":"L01DB01","per":60,"basis":"m2","round":1,"how":"IV push over 10 min"},
            {"drug":"Cyclophosphamide","atc":"L01AA01","per":600,"basis":"m2","round":10,"how":"IV over 60 min"}],
   "premeds":["Granisetron 1 mg IV","Dexamethasone 12 mg IV","Pegfilgrastim 6 mg SC on day 2"],
   "checks":[{"test":"anc","min":1.5},{"test":"plt","min":100},{"test":"ef","min":50}]},
  {"key":"pacw","name":"Paclitaxel weekly","site":"breast","every_days":7,"cycles":12,
   "drugs":[{"drug":"Paclitaxel","atc":"L01CD01","per":80,"basis":"m2","round":1,"how":"IV in 250 mL saline over 60 min","watch":true}],
   "premeds":["Dexamethasone 8 mg IV","Chlorphenamine 10 mg IV","Famotidine 20 mg IV"],
   "checks":[{"test":"anc","min":1.0},{"test":"plt","min":75},{"test":"bili","max":1.5}]},
  {"key":"tc","name":"TC","site":"breast","every_days":21,"cycles":4,
   "drugs":[{"drug":"Docetaxel","atc":"L01CD02","per":75,"basis":"m2","round":1,"how":"IV over 60 min","watch":true},
            {"drug":"Cyclophosphamide","atc":"L01AA01","per":600,"basis":"m2","round":10,"how":"IV over 60 min"}],
   "premeds":["Dexamethasone 8 mg oral twice a day, the day before to the day after"],"checks":[{"test":"anc","min":1.5},{"test":"plt","min":100}]},
  {"key":"trast","name":"Trastuzumab","site":"breast","every_days":21,"cycles":17,
   "drugs":[{"drug":"Trastuzumab","atc":"L01FD01","per":6,"basis":"kg","round":10,"how":"IV over 30 min","watch":true}],"checks":[{"test":"ef","min":50}]},
  {"key":"folfox","name":"FOLFOX","site":"colon","every_days":14,"cycles":12,
   "drugs":[{"drug":"Oxaliplatin","atc":"L01XA03","per":85,"basis":"m2","round":5,"how":"IV in 500 mL glucose 5 % over 2 h","watch":true},
            {"drug":"Calcium folinate","atc":"V03AF03","per":400,"basis":"m2","round":10,"how":"IV over 2 h, beside oxaliplatin"},
            {"drug":"Fluorouracil","atc":"L01BC02","per":400,"basis":"m2","round":10,"how":"IV bolus"},
            {"drug":"Fluorouracil","atc":"L01BC02","per":2400,"basis":"m2","round":50,"how":"by pump over 46 h, at home"}],
   "premeds":["Granisetron 1 mg IV","Dexamethasone 8 mg IV"],"checks":[{"test":"anc","min":1.5},{"test":"plt","min":75},{"test":"creat","max":1.5}]},
  {"key":"folfiri","name":"FOLFIRI","site":"colon","every_days":14,"cycles":12,
   "drugs":[{"drug":"Irinotecan","atc":"L01CE02","per":180,"basis":"m2","round":10,"how":"IV over 90 min"},
            {"drug":"Calcium folinate","atc":"V03AF03","per":400,"basis":"m2","round":10,"how":"IV over 2 h"},
            {"drug":"Fluorouracil","atc":"L01BC02","per":400,"basis":"m2","round":10,"how":"IV bolus"},
            {"drug":"Fluorouracil","atc":"L01BC02","per":2400,"basis":"m2","round":50,"how":"by pump over 46 h, at home"}],
   "premeds":["Granisetron 1 mg IV","Dexamethasone 8 mg IV","Atropine 0.25 mg SC if cramps"],"checks":[{"test":"anc","min":1.5},{"test":"plt","min":100},{"test":"bili","max":1.5}]},
  {"key":"carbopac","name":"Carboplatin–paclitaxel","site":"ovary","every_days":21,"cycles":6,
   "drugs":[{"drug":"Paclitaxel","atc":"L01CD01","per":175,"basis":"m2","round":5,"how":"IV over 3 h","watch":true},
            {"drug":"Carboplatin","atc":"L01XA02","per":5,"basis":"auc","round":10,"how":"IV over 60 min, after paclitaxel"}],
   "premeds":["Dexamethasone 20 mg IV","Chlorphenamine 10 mg IV","Famotidine 20 mg IV","Granisetron 1 mg IV"],"checks":[{"test":"anc","min":1.5},{"test":"plt","min":100},{"test":"creat","max":1.5}]},
  {"key":"gem","name":"Gemcitabine","site":"pancreas","every_days":28,"cycles":6,
   "drugs":[{"drug":"Gemcitabine","atc":"L01BC05","per":1000,"basis":"m2","round":10,"how":"IV over 30 min, days 1, 8 and 15"}],"checks":[{"test":"anc","min":1.0},{"test":"plt","min":75}]},
  {"key":"rchop","name":"R-CHOP","site":"lymphoma","every_days":21,"cycles":6,
   "drugs":[{"drug":"Rituximab","atc":"L01FA01","per":375,"basis":"m2","round":50,"how":"IV, 50 mg/h rising by 50 every 30 min","watch":true},
            {"drug":"Cyclophosphamide","atc":"L01AA01","per":750,"basis":"m2","round":10,"how":"IV over 30 min"},
            {"drug":"Doxorubicin","atc":"L01DB01","per":50,"basis":"m2","round":1,"how":"IV push"},
            {"drug":"Vincristine","atc":"L01CA02","per":1.4,"basis":"m2","round":0.1,"how":"IV in 50 mL saline over 10 min · at most 2 mg"},
            {"drug":"Prednisone","atc":"H02AB07","per":100,"basis":"flat","round":5,"how":"by mouth, days 1–5"}],
   "premeds":["Paracetamol 1 g oral","Chlorphenamine 10 mg IV","Hydrocortisone 100 mg IV"],"checks":[{"test":"anc","min":1.5},{"test":"plt","min":100},{"test":"bili","max":1.5}]}
],"plans":[
  {"name":"AC → paclitaxel weekly","site":"breast","regimens":["ac","pacw"]},{"name":"Dose-dense AC → paclitaxel","site":"breast","regimens":["ddac","pacw"]},
  {"name":"TC × 4","site":"breast","regimens":["tc"]},{"name":"AC → paclitaxel + trastuzumab","site":"breast","regimens":["ac","pacw","trast"]},
  {"name":"FOLFOX × 12","site":"colon","regimens":["folfox"]},{"name":"FOLFIRI","site":"colon","regimens":["folfiri"]},
  {"name":"Carboplatin–paclitaxel × 6","site":"ovary","regimens":["carbopac"]},{"name":"R-CHOP × 6","site":"lymphoma","regimens":["rchop"]}
]}$j$::jsonb);

select demo.person(demo.id('oncology', 'oncologist'), 'oncology@demo.com', 'Dr. Hesham Abdallah', 'Dr');
select demo.grant(demo.id('oncology', 'oncologist'), '00000000-0000-0000-0000-00000000e801', demo.id('oncology', 'clinic'));
select demo.grant(demo.id('oncology', 'oncologist'), '00000000-0000-0000-0000-00000000e801', demo.id('oncology', 'day_unit'));
select demo.person(demo.id('oncology', 'nurse'), 'chemo@demo.com', 'Asmaa Farid');
select demo.grant(demo.id('oncology', 'nurse'), '00000000-0000-0000-0000-00000000e802', demo.id('oncology', 'day_unit'));
