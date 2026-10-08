-- The vaccines pack's seed (spec/openCare.md §5.1 rule 9, §5.7): the clinic turns the pack on, the Vaccination room is made from the
-- pack's starter setup (it ticks vaccines, opens on its own list in place of the queue; the optional rows a clinic usually offers), the
-- national schedule is loaded as an import would load it — the MOHP's rows, birth to 18 months, a demo sample said to be one — and a
-- demo person for the role the pack declares: the vaccinator, Rokaya Ghoneim. Ids in the pack's own namespace; written through the
-- doors by the kit; run again, it adds only what is missing. Its day is supabase/demo/vaccines.sql.

select demo.layer('vaccines');
select demo.pack_on('vaccines');
select demo.setup(demo.id('vaccines', 'room'), 'vaccines.room', 'Vaccination room', 9);
select demo.setting('vaccines.national', null, null, jsonb_build_object('version', 'Dec 2024', 'source', 'MOHP', 'sample', true, 'rows', $j$[
  {"key":"hepb0","vaccine":"hepb","name":"Hepatitis B 0","dose":0,"age":"Birth","earliest_days":0,"how":"IM right thigh, in the first 24 hours","route":"im","site":"right thigh","cvx":"08"},
  {"key":"opv0","vaccine":"opv","name":"OPV 0","dose":0,"age":"Birth","earliest_days":0,"how":"2 drops by mouth","route":"oral","cvx":"02"},
  {"key":"bcg","vaccine":"bcg","name":"BCG","dose":1,"age":"Birth","earliest_days":0,"how":"ID left upper arm","route":"id","site":"left upper arm","cvx":"19"},
  {"key":"opv1","vaccine":"opv","name":"OPV 1","dose":1,"age":"2 mo","earliest_days":42,"how":"by mouth","route":"oral","cvx":"02"},
  {"key":"penta1","vaccine":"penta","name":"Penta 1","dose":1,"age":"2 mo","earliest_days":42,"how":"IM right thigh","route":"im","site":"right thigh","cvx":"102"},
  {"key":"opv2","vaccine":"opv","name":"OPV 2","dose":2,"age":"4 mo","earliest_days":70,"interval_days":28,"how":"by mouth","route":"oral","cvx":"02"},
  {"key":"ipv1","vaccine":"ipv","name":"IPV","dose":1,"age":"4 mo","earliest_days":98,"how":"IM left thigh","route":"im","site":"left thigh","cvx":"10"},
  {"key":"penta2","vaccine":"penta","name":"Penta 2","dose":2,"age":"4 mo","earliest_days":70,"interval_days":28,"how":"IM right thigh","route":"im","site":"right thigh","cvx":"102"},
  {"key":"opv3","vaccine":"opv","name":"OPV 3","dose":3,"age":"6 mo","earliest_days":98,"interval_days":28,"how":"by mouth","route":"oral","cvx":"02"},
  {"key":"penta3","vaccine":"penta","name":"Penta 3","dose":3,"age":"6 mo","earliest_days":98,"interval_days":28,"how":"IM right thigh","route":"im","site":"right thigh","cvx":"102"},
  {"key":"opv4","vaccine":"opv","name":"OPV 4","dose":4,"age":"9 mo","earliest_days":270,"interval_days":28,"how":"by mouth","route":"oral","cvx":"02"},
  {"key":"vita1","vaccine":"vita","name":"Vitamin A","dose":1,"age":"9 mo","earliest_days":270,"how":"100 000 IU by mouth","route":"oral"},
  {"key":"opv5","vaccine":"opv","name":"OPV 5","dose":5,"age":"12 mo","earliest_days":365,"interval_days":28,"how":"by mouth","route":"oral","cvx":"02"},
  {"key":"mmr1","vaccine":"mmr","name":"MMR 1","dose":1,"age":"12 mo","earliest_days":365,"how":"under the skin, right arm","route":"sc","site":"right arm","cvx":"03"},
  {"key":"opv6","vaccine":"opv","name":"OPV","dose":6,"age":"18 mo","earliest_days":545,"interval_days":28,"how":"by mouth","route":"oral","cvx":"02"},
  {"key":"dtp4","vaccine":"dtp","name":"DTP booster","dose":4,"age":"18 mo","earliest_days":545,"interval_days":183,"how":"IM left thigh","route":"im","site":"left thigh","cvx":"01"},
  {"key":"mmr2","vaccine":"mmr","name":"MMR 2","dose":2,"age":"18 mo","earliest_days":545,"interval_days":28,"how":"under the skin, right arm","route":"sc","site":"right arm","cvx":"03"},
  {"key":"vita2","vaccine":"vita","name":"Vitamin A","dose":2,"age":"18 mo","earliest_days":545,"how":"200 000 IU by mouth","route":"oral"}
]$j$::jsonb));

select demo.person(demo.id('vaccines', 'vaccinator'), 'vaccines@demo.com', 'Rokaya Ghoneim');
select demo.grant(demo.id('vaccines', 'vaccinator'), '00000000-0000-0000-0000-00000000e001', demo.id('vaccines', 'room'));
