-- Ward nursing (spec §5.6): NEWS2 (RCP 2017) as two of the server's score tables, SpO₂ scale 1 and scale 2, each item's points at
-- its edges, the totals and their bands; the pack's starter setup; on the ward the base's vitals (ACVPU and air or oxygen among them)
-- and the base's score in one set, as /v signs them, the record's lines, the values and the board's has_vitals; the board's read of each
-- stay's latest NEWS2 through the pack's own op; refused where the department or the clinic does not use the pack, while plain vitals
-- still land.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set stay  '00000000-0000-0000-0000-00000000e601'
\set v1    '00000000-0000-0000-0000-00000000e602'
\set s1    '00000000-0000-0000-0000-00000000e603'
\set s2    '00000000-0000-0000-0000-00000000e604'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set stay2 '00000000-0000-0000-0000-00000000e605'
\set stay3 '00000000-0000-0000-0000-00000000e606'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["bedside"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked;

\echo '── the pack: Ward nursing, its role ids in block d0, nothing of its own callable'
select t.ok(l.role_block = 'd0' and l.is_pack and l.labels ->> 'en' = 'Ward nursing', 'bedside reads "Ward nursing", its role ids in its block, d0')
  from core.layers l where l.key = 'bedside';
select t.ok(not has_schema_privilege('authenticated', 'bedside', 'USAGE'), 'the API cannot reach its schema');

\echo '── NEWS2 as two tables: scale 1 and scale 2, RCP 2017, the same seven items save the saturation, the same bands'
select t.ok(s.layer = 'bedside' and s.version = '2017' and s.short = 'NEWS2' and s.alias = 'news2' and s.source like 'Royal College of Physicians%' and s.coding is null
  and (select array_agg(i ->> 'key' order by n) from jsonb_array_elements(s.items) with ordinality x(i, n)) = array['rr', 'spo2', 'oxygen', 'sbp', 'pulse', 'consciousness', 'temp'],
  'bedside.news2 2017: its seven items in order, its paper, no coding') from core.scores s where s.key = 'bedside.news2';
select t.ok(s.layer = 'bedside' and s.version = '2017' and s.short = 'NEWS2' and s.alias = 'news2s2' and s.source like 'Royal College of Physicians%' and s.coding is null
  and (select array_agg(i ->> 'key' order by n) from jsonb_array_elements(s.items) with ordinality x(i, n)) = array['rr', 'spo2_s2', 'oxygen', 'sbp', 'pulse', 'consciousness', 'temp'],
  'bedside.news2_s2 2017: the saturation on scale 2 in second place, no coding') from core.scores s where s.key = 'bedside.news2_s2';
select t.ok(count(*) = 2 and bool_and((select array_agg((b ->> 'min') || '-' || (b ->> 'max') || ' ' || (b ->> 'key') || ' ' || coalesce(b ->> 'tone', 'none') order by n)
  from jsonb_array_elements(s.bands) with ordinality x(b, n)) = array['0-4 low none', '5-6 medium warn', '7-20 high danger']),
  'both: 0–4 low with no colour, 5–6 medium in warn, 7–20 high in danger') from core.scores s where s.key in ('bedside.news2', 'bedside.news2_s2');
select t.ok((select array_agg(b -> 'labels' ->> 'en' order by n) from core.scores s, jsonb_array_elements(s.bands) with ordinality x(b, n) where s.key = 'bedside.news2_s2')
  = array['Low · scale 2', 'Medium · scale 2', 'High · scale 2'], 'scale 2''s bands say so');
select t.ok((select jsonb_agg(i order by n) from jsonb_array_elements(a.items) with ordinality x(i, n) where i ->> 'key' <> 'spo2')
  = (select jsonb_agg(i order by n) from jsonb_array_elements(b.items) with ordinality x(i, n) where i ->> 'key' <> 'spo2_s2'),
  'scale 2''s other six items are scale 1''s, ranges and all') from core.scores a, core.scores b where a.key = 'bedside.news2' and b.key = 'bedside.news2_s2';

\echo '── its starter setup: a ward with Ward nursing ticked'
select t.ok(s.work = 'stays' and s.packs = array['bedside'] and jsonb_array_length(s.places) = 8 and s.settings -> 'department.encounter_class' ->> 'class' = 'IMP'
  and s.screens = '{"screens":["base.beds","bedside.round","bedside.obs","bedside.handover"],"opens":"base.beds"}'::jsonb, 'bedside.ward: stays, ticks bedside, eight beds, inpatient, the bed board, the Drug round, Obs due and Handover') from core.setups s where s.key = 'bedside.ward';
select public.setup(jsonb_build_object('setup', 'bedside.ward', 'department_id', :'new', 'name', 'Surgical Ward', 'apply', true)) is not null as made;
select t.ok(core.department_uses(:'org', :'new', 'bedside') and (select count(*) from core.places p where p.department_id = :'new' and p.retired_at is null) = 8
  and core.setting_at(:'org', 'department.encounter_class', :'new') ->> 'class' = 'IMP' and core.setting_at(:'org', 'department.setup', :'new') ->> 'setup' = 'bedside.ward',
  'a ward made from it uses Ward nursing, has eight beds, is inpatient, and keeps the setup it was made from');

\echo '── each item''s points at its edges, on both scales'
create function t.news(k text, i jsonb) returns jsonb language sql as $$ select core.score(k, '2017', i) $$;
create function t.pts(r jsonb, k text) returns int language sql immutable as $$ select (select (i ->> 'points')::int from jsonb_array_elements(r -> 'items') i where i ->> 'key' = k) $$;
create function t.prob(r jsonb, k text) returns text language sql immutable as $$ select (select p ->> 'code' from jsonb_array_elements(r -> 'problems') p where p ->> 'item' = k) $$;
create temp table edges (s text, k text, v text, p int);
insert into edges
select 'bedside.news2', 'rr', v, p from (values ('8', 3), ('9', 1), ('11', 1), ('12', 0), ('20', 0), ('21', 2), ('24', 2), ('25', 3)) x(v, p)
union all select 'bedside.news2', 'spo2', v, p from (values ('91', 3), ('92', 2), ('93', 2), ('94', 1), ('95', 1), ('96', 0), ('100', 0)) x(v, p)
union all select 'bedside.news2', 'oxygen', v, p from (values ('air', 0), ('oxygen', 2)) x(v, p)
union all select 'bedside.news2', 'sbp', v, p from (values ('90', 3), ('91', 2), ('100', 2), ('101', 1), ('110', 1), ('111', 0), ('219', 0), ('220', 3)) x(v, p)
union all select 'bedside.news2', 'pulse', v, p from (values ('40', 3), ('41', 1), ('50', 1), ('51', 0), ('90', 0), ('91', 1), ('110', 1), ('111', 2), ('130', 2), ('131', 3)) x(v, p)
union all select 'bedside.news2', 'consciousness', v, p from (values ('a', 0), ('c', 3), ('v', 3), ('p', 3), ('u', 3)) x(v, p)
union all select 'bedside.news2', 'temp', v, p from (values ('35.0', 3), ('35.1', 1), ('36.0', 1), ('36.1', 0), ('38.0', 0), ('38.1', 1), ('39.0', 1), ('39.1', 2)) x(v, p)
union all select 'bedside.news2_s2', 'spo2_s2', v, p from (values ('le83', 3), ('84_85', 2), ('86_87', 1), ('88_92', 0), ('ge93_air', 0), ('93_94_o2', 1), ('95_96_o2', 2), ('ge97_o2', 3)) x(v, p)
union all select 'bedside.news2_s2', 'rr', '25', 3
union all select 'bedside.news2_s2', 'temp', '39.1', 2;
select t.ok(count(*) filter (where got is distinct from p) = 0, count(*) || ' edges, each its points' || coalesce(': wrong ' || string_agg(s || ' ' || k || ' ' || v || ' → ' || coalesce(got::text, 'none'), ', ')
  filter (where got is distinct from p), '')) from (select e.*, t.pts(t.news(e.s, jsonb_build_object(e.k, e.v)), e.k) got from edges e) x;

\echo '── totals and bands'
create function t.n1(rr text, spo2 text, ox text, sbp text, pulse text, c text, temp text) returns jsonb language sql as $$
  select t.news('bedside.news2', jsonb_build_object('rr', rr, 'spo2', spo2, 'oxygen', ox, 'sbp', sbp, 'pulse', pulse, 'consciousness', c, 'temp', temp))
$$;
create function t.n2(rr text, s2 text, ox text, sbp text, pulse text, c text, temp text) returns jsonb language sql as $$
  select t.news('bedside.news2_s2', jsonb_build_object('rr', rr, 'spo2_s2', s2, 'oxygen', ox, 'sbp', sbp, 'pulse', pulse, 'consciousness', c, 'temp', temp))
$$;
select t.ok((r ->> 'total')::int = 0 and r -> 'band' ->> 'key' = 'low' and r -> 'band' ->> 'tone' is null, 'all normal: 0, low') from (select t.n1('16', '97', 'air', '125', '72', 'a', '36.8') r) x;
select t.ok((r ->> 'total')::int = 3 and r -> 'band' ->> 'key' = 'low' and t.pts(r, 'rr') = 3, 'rr 8 alone: 3, low, with 3 in one sign') from (select t.n1('8', '97', 'air', '125', '72', 'a', '36.8') r) x;
select t.ok((r ->> 'total')::int = 4 and r -> 'band' ->> 'key' = 'low', '20 94 air 108 100 a 38.1: 4, low') from (select t.n1('20', '94', 'air', '108', '100', 'a', '38.1') r) x;
select t.ok((r ->> 'total')::int = 5 and r -> 'band' ->> 'key' = 'medium' and r -> 'band' ->> 'tone' = 'warn', '21 95 air 112 102 a 38.2: 5, medium in warn')
  from (select t.n1('21', '95', 'air', '112', '102', 'a', '38.2') r) x;
select t.ok((r ->> 'total')::int = 6 and r -> 'band' ->> 'key' = 'medium', '22 94 air 105 104 a 38.4 (the picture''s line): 6, medium') from (select t.n1('22', '94', 'air', '105', '104', 'a', '38.4') r) x;
select t.ok((r ->> 'total')::int = 7 and r -> 'band' ->> 'key' = 'high' and r -> 'band' ->> 'tone' = 'danger', '25 93 air 115 112 a 37.0: 7, high in danger')
  from (select t.n1('25', '93', 'air', '115', '112', 'a', '37.0') r) x;
select t.ok((r ->> 'total')::int = 20 and r -> 'band' ->> 'key' = 'high', 'the worst of each: 20, high') from (select t.n1('8', '91', 'oxygen', '90', '40', 'u', '35.0') r) x;
select t.ok((r ->> 'total')::int = 8 and r -> 'band' ->> 'key' = 'high', 'scale 2, 26 86–87 % oxygen 146 112 a 37.8: 8, high') from (select t.n2('26', '86_87', 'oxygen', '146', '112', 'a', '37.8') r) x;
select t.ok((r ->> 'total')::int = 3 and r -> 'band' ->> 'key' = 'low', 'scale 2, 20 88–92 % oxygen 132 96 a 37.1: 3, low') from (select t.n2('20', '88_92', 'oxygen', '132', '96', 'a', '37.1') r) x;
select t.ok((r ->> 'total')::int = 6 and r -> 'band' ->> 'key' = 'medium', 'the same on scale 1 with SpO₂ 91: 6, medium') from (select t.n1('20', '91', 'oxygen', '132', '96', 'a', '37.1') r) x;
select t.ok(t.prob(t.news('bedside.news2', '{"temp":"38.45"}'), 'temp') = 'too_precise', 'a temperature with two decimals: too precise');
select t.ok(t.prob(t.news('bedside.news2', '{"spo2":"101"}'), 'spo2') = 'out_of_range', 'SpO₂ 101: out of range');
select t.ok(t.prob(t.news('bedside.news2', '{"consciousness":"x"}'), 'consciousness') = 'unknown_choice', 'consciousness x: not offered');
select t.ok(t.prob(t.news('bedside.news2', '{"spo2_s2":"88_92"}'), 'spo2_s2') = 'unknown_item', 'scale 2''s saturation on scale 1: not its item');
select t.ok(t.prob(t.news('bedside.news2_s2', '{"spo2_s2":"94"}'), 'spo2_s2') = 'unknown_choice', 'a number for scale 2''s saturation: not a choice it offers');
select t.refuses($$select core.score('bedside.news2', '1999', '{}')$$, 'unknown_score');

set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'stay', :'stay')), 'admitted to the ward');
select t.ok(count(*) = 1 and not bool_or((r ->> 'has_vitals')::boolean), 'just admitted: the board knows the stay has no obs yet') from t.rows('base.presence', :'ward', jsonb_build_object('item', :'stay')) r;

\echo '── on the ward: the vitals and NEWS2 in one set, as /v signs them'
select t.as(:'nurse');
select t.landed(t.w(jsonb_build_array(
  t.e('vitals', :'pt', :'ward', '{"bp":{"sys":{"value":"105","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"68","unit":"mmHg","ucum":"mm[Hg]"}},"hr":{"value":"104","unit":"bpm","ucum":"/min"},"rr":{"value":"22","unit":"/min","ucum":"/min"},"temp":{"value":"38.4","unit":"°C","ucum":"Cel"},"spo2":{"value":"94","unit":"%","ucum":"%"},"consciousness":"a","oxygen":{"on":"air"}}',
    :'v1', :'stay'),
  t.e('score', :'pt', :'ward', '{"score":"bedside.news2","version":"2017","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"},"total":6,"band":"medium"}',
    :'s1', :'stay'))), 'the vitals and NEWS2 6 land in one set');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'s1') ->> 'line' = 'NEWS2 6, 2017 · Medium', 'its line: NEWS2 6, 2017 · Medium');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'v1') ->> 'line' = 'BP 105/68 · HR 104 · RR 22 · T 38.4 · SpO2 94% · Air · ACVPU A',
  'the vitals'' line: BP 105/68 · HR 104 · RR 22 · T 38.4 · SpO2 94% · Air · ACVPU A');
select t.ok(count(*) = 1 and min((r ->> 'value')::numeric) = 22, 'the respiration rate is in the values: 22') from t.rows('base.values', :'ward', jsonb_build_object('patient_id', :'pt')) r
 where r ->> 'key' = 'rr';
select t.ok(count(*) = 1 and bool_and((r ->> 'has_vitals')::boolean), 'the board knows the stay has obs') from t.rows('base.presence', :'ward', jsonb_build_object('item', :'stay')) r;
select t.ok((r ->> 'total')::int = 6 and r -> 'band' ->> 'key' = 'medium', 'read score: the server''s 6, medium')
  from (select public.read('{"shape":"score","score":"bedside.news2","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"}}') r) x;
select t.refused(t.w(t.e('score', :'pt', :'ward', '{"score":"bedside.news2","version":"2017","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"},"total":5,"band":"medium"}',
  null, :'stay')), 'score_mismatch', 'a total the server does not reach');
select t.refused(t.w(t.e('score', :'pt', :'ward', '{"score":"bedside.news2","version":"2017","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","temp":"38.4"},"total":6,"band":"medium"}',
  null, :'stay')), 'score_incomplete', 'consciousness unanswered');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"bedside.news2","version":"2017","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"},"total":6,"band":"medium"}')),
  'pack_not_used', 'Internal Medicine does not use Ward nursing');
select t.landed(t.w(t.e('score', :'pt', :'ward', '{"score":"bedside.news2_s2","version":"2017","inputs":{"rr":"20","spo2_s2":"88_92","oxygen":"oxygen","sbp":"132","pulse":"96","consciousness":"a","temp":"37.1"},"total":3,"band":"low"}',
  :'s2', :'stay')), 'scale 2: NEWS2 3, low, lands in the stay');
select t.ok(t.entry(t.record(:'pt', :'ward'), :'s2') ->> 'line' = 'NEWS2 3, 2017 · Low · scale 2', 'its line: NEWS2 3, 2017 · Low · scale 2');

\echo '── the board reads each stay''s latest NEWS2 once, through the pack''s door'
create function pg_temp.board(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'bedside.board', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;
select t.ok(b -> 'news2' -> :'stay' ->> 'score' = 'bedside.news2_s2' and (b -> 'news2' -> :'stay' ->> 'total')::int = 3 and b -> 'news2' -> :'stay' ->> 'band' = 'low'
  and b -> 'news2' -> :'stay' ->> 'version' = '2017' and b -> 'news2' -> :'stay' ? 'at' and b -> 'patient_ids' ? :'pt',
  'the stay''s latest NEWS2 is scale 2''s 3, low; the patient is named for the read log') from (select pg_temp.board(:'ward') b) x;
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'bedside.board'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;
select t.landed(t.w(t.e('crossed_out', :'pt', :'ward', '{"reason":"wrong_value"}', null, :'stay', null, null, :'s2')), 'scale 2''s NEWS2 crossed out');
select t.ok(b -> 'news2' -> :'stay' ->> 'score' = 'bedside.news2' and (b -> 'news2' -> :'stay' ->> 'total')::int = 6 and b -> 'news2' -> :'stay' ->> 'band' = 'medium',
  'crossed out, it is passed over: the board answers the NEWS2 before it, 6, medium') from (select pg_temp.board(:'ward') b) x;
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.board','department_id',%L))$q$, :'im'), 'not_used_here');
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.board','department_id',%L))$q$, :'ward'), 'not_allowed');

\echo '── the board names only this department''s admitted stays, each with a NEWS2 of its own stay'
select t.as(:'ow');   -- Dr Ali and Nurse Sara work on the Surgical Ward too
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'new')))) is not null as dr;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b3', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'new')))) is not null as nurse;
select t.as(:'rec');
select public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'pt2', 'given', jsonb_build_array('Mona'),
  'family', 'Saleh', 'gender', 'female', 'birth_date', '1975-06-02'))) is not null as registered;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt2', :'new', '{"admit_source":"emd","reason":"cellulitis"}', :'stay2', :'stay2')), 'another patient admitted to the Surgical Ward');
select t.as(:'nurse');
select t.landed(t.w(t.e('score', :'pt2', :'new', '{"score":"bedside.news2","version":"2017","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"},"total":6,"band":"medium"}',
  null, :'stay2')), 'NEWS2 6 in that stay');
select t.ok(not (b -> 'news2' ? :'stay2') and not (b -> 'patient_ids' ? :'pt2') and b -> 'news2' ? :'stay', 'the Ward''s board leaves out a stay of another department, and its patient')
  from (select pg_temp.board(:'ward') b) x;
select t.ok((b -> 'news2' -> :'stay2' ->> 'total')::int = 6 and b -> 'patient_ids' = jsonb_build_array(:'pt2') and not (b -> 'news2' ? :'stay'), 'the Surgical Ward''s board: its own stay only')
  from (select pg_temp.board(:'new') b) x;
select t.as(:'dr');
select t.landed(t.w(t.move('discharged', :'stay', :'ward', '{"disposition":"home"}')), 'the ward''s stay discharged home');
select t.ok(b -> 'news2' = '{}'::jsonb and b -> 'patient_ids' = '[]'::jsonb, 'a discharged stay is not on the board, nor its NEWS2, nor its patient') from (select pg_temp.board(:'ward') b) x;
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia again"}', :'stay3', :'stay3')), 'the same patient admitted again');
select t.ok(b -> 'news2' = '{}'::jsonb and b -> 'patient_ids' = jsonb_build_array(:'pt'), 'the new stay is on the board with no NEWS2: the one of the stay before is not its own')
  from (select pg_temp.board(:'ward') b) x;
select t.as(:'nurse');

\echo '── the clinic turns the pack off: NEWS2 is refused, plain vitals still land'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'nurse');
select t.refused(t.w(t.e('score', :'pt', :'ward', '{"score":"bedside.news2","version":"2017","inputs":{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"},"total":6,"band":"medium"}',
  null, :'stay3')), 'pack_not_used', 'the clinic no longer uses Ward nursing');
select t.landed(t.w(t.e('vitals', :'pt', :'ward', '{"hr":{"value":"90","unit":"bpm","ucum":"/min"}}', null, :'stay3')), 'a plain vitals entry still lands');
select t.as(null);
