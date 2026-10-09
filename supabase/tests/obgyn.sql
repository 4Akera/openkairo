-- the obgyn pack, its clinic part (spec §5.8): the antenatal check on the base's observation (its words, the booking; everyday where the
-- department uses the pack, never elsewhere), the periods and the visit after the birth, a birth elsewhere ending the base's pregnancy,
-- the method as a base observation by the pack's own code, the clinic's scan as a base result with no order; the queue's table fed after
-- commit from the base's pregnancy, vitals and observations and from its own checks; EPDS added up by the server; its settings with
-- their starter rows; its roles and setup
\set org  '00000000-0000-0000-0000-0000000000a1'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set ob   '11111111-0000-0000-0000-0000000000d3'
\set mw   '11111111-0000-0000-0000-0000000000d4'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set her  '00000000-0000-0000-0000-00000000d3f1'
\set oc   '00000000-0000-0000-0000-0000000000da'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["obgyn"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'obgyn.clinic', 'department_id', :'oc', 'name', 'ObGyn clinic', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000d3', 'name', 'Dr Nermeen', 'login_id', :'ob', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000d301', 'department_id', :'oc')))) ->> 'id' as obstetrician;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000d4', 'name', 'Samah', 'login_id', :'mw', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000d302', 'department_id', :'oc')))) ->> 'id' as midwife;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'oc')))) ->> 'id' as doctor;
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'her', 'given', jsonb_build_array('Rania'), 'family', 'Saad', 'gender', 'female',
  'birth_date', '1997-05-01'))) -> 'patient' ->> 'id') = :'her' as her;
set role authenticated;

create function pg_temp.anc(p_o jsonb) returns jsonb language sql as $$
  select jsonb_build_object('code', jsonb_build_object('text', 'Antenatal visit'), 'value', jsonb_build_object('text', 'Antenatal visit'), 'obgyn', p_o)
$$;
\echo '── the pregnancy (the base''s) and the antenatal check on the base''s observation, with the booking'
select t.as(:'ob');
select t.landed(t.w(t.e('pregnancy', :'her', :'oc', jsonb_build_object('status', 'current', 'pregnant', true, 'lmp', jsonb_build_object('value', ((now() at time zone 'Africa/Cairo')::date - 199)::text, 'precision', 'day')),
  '00000000-0000-0000-0000-00000000d301')), 'pregnant, by the LMP');
select t.landed(t.w(jsonb_build_array(
  t.e('vitals', :'her', :'oc', '{"bp":{"sys":{"value":"118","unit":"mmHg","ucum":"mm[Hg]"},"dia":{"value":"74","unit":"mmHg","ucum":"mm[Hg]"}},"weight":{"value":"71","unit":"kg","ucum":"kg"}}'),
  t.e('obgyn.anc', :'her', :'oc', pg_temp.anc('{"weeks":28,"days":3,"sfh":29,"fhr":144,"lie":"cephalic","protein":"nil","booking":{"gravida":3,"para":1,"miscarriages":1,"blood_group":"O","rh":"negative","risks":["previous_caesarean"]},"taken":["anti-D"]}'),
    '00000000-0000-0000-0000-00000000d302'))), 'BP and weight in the base''s vitals and the check, in one set');
reset role;
select t.ok((select obgyn.anc_line(jsonb_build_object('data', x.data)) from core.entries x where x.id = '00000000-0000-0000-0000-00000000d302')
  = 'Antenatal visit · 28+3 w · fundus 29 · FHR 144 · cephalic · urine nil · booking', 'its line');
select core.drain() as drained;
set role authenticated;
select t.as(:'ob');
select t.ok((select r -> 'data' ->> 'rh' from t.rows('obgyn.marks', :'oc', jsonb_build_object('patient_id', :'her', 'kind', 'anc')) r) = 'negative', 'the queue''s table: the check''s blood group');
select t.ok((select r -> 'data' ->> 'lmp' from t.rows('obgyn.marks', :'oc', jsonb_build_object('patient_id', :'her', 'kind', 'pregnancy')) r) is not null, 'the pregnancy, by its LMP');
select t.ok((select (r -> 'data' ->> 'sys')::int from t.rows('obgyn.marks', :'oc', jsonb_build_object('patient_id', :'her', 'kind', 'bp')) r) = 118, 'today''s BP');
select t.refused(t.w(t.e('obgyn.anc', :'her', :'oc', pg_temp.anc('{"lie":"sideways"}'))), 'bad_shape', 'a lie is cephalic, breech, transverse or not sure');
select t.as(:'mw');
select t.landed(t.w(t.e('obgyn.anc', :'her', :'oc', pg_temp.anc('{"weeks":28,"days":3,"fhr":140}'))), 'the midwife writes the check');
select t.as(:'dr');
select t.landed(t.w(t.e('obgyn.anc', :'her', :'oc', pg_temp.anc('{"weeks":28,"days":3,"fhr":142}'))), 'everyday: the base''s Doctor where the department uses the pack');
select t.refused(t.w(t.e('obgyn.anc', :'her', :'im', pg_temp.anc('{"fhr":142}'))), 'not_allowed', 'never where it is not used');

\echo '── the clinic''s scan: the base''s result with no order'
select t.as(:'ob');
select t.landed(t.w(t.e('result', :'her', :'oc', '{"status":"final","service":{"name":"Scan in the clinic"},"conclusion":"Scan in the clinic · 32+0 w · EFW 1419 g",
  "analytes":[{"key":"efw","name":"Estimated fetal weight (Hadlock)","value":{"value":"1419","unit":"g","ucum":"g"},"interpretation":"L"},{"key":"dvp","name":"Deepest pool","value":{"value":"1.8","unit":"cm","ucum":"cm"}}]}')),
  'written by the doctor, no order');

\echo '── gynaecology: the method by the pack''s code, the periods, a device put in'
select t.landed(t.w(t.e('observation', :'her', :'oc', '{"code":{"text":"Contraception method","codings":[{"system":"obgyn.codes","code":"contraception","display":"Contraception method"}]},"value":{"text":"Copper IUD"},"note":"T380A"}')),
  'the method: a base observation by the pack''s own code, not flagged');
select t.landed(t.w(t.e('obgyn.periods', :'her', :'oc', jsonb_build_object('code', jsonb_build_object('text', 'Periods'), 'value', jsonb_build_object('text', 'Periods'),
  'obgyn', '{"lmp":"2026-09-21","cycle_from":26,"cycle_to":28,"days_from":8,"days_to":9,"flow":"heavy","clots":true,"pain":"moderate"}'::jsonb))), 'the periods'' pattern');
select t.refused(t.w(t.e('obgyn.periods', :'her', :'oc', jsonb_build_object('code', jsonb_build_object('text', 'Periods'), 'value', jsonb_build_object('text', 'Periods'),
  'obgyn', '{"flow":"torrential"}'::jsonb))), 'bad_shape', 'flow is light, normal or heavy');
select t.landed(t.w(t.e('procedure', :'her', :'oc', '{"concept":{"text":"Hormonal IUD inserted"},"status":"completed","outcome":"no problems","note":"copper IUD removed, intact · sounds 8 cm"}')), 'a device put in: the base''s procedure');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'ob');
select t.ok((select r -> 'data' ->> 'method' from t.rows('obgyn.marks', :'oc', jsonb_build_object('patient_id', :'her', 'kind', 'method')) r) = 'Copper IUD', 'the queue''s table: the method');
select t.as('11111111-0000-0000-0000-0000000000b3');
select t.refused(t.w(t.e('obgyn.periods', :'her', :'im', jsonb_build_object('code', jsonb_build_object('text', 'Periods'), 'value', jsonb_build_object('text', 'Periods'), 'obgyn', '{"flow":"heavy"}'::jsonb))),
  'not_allowed', 'a nurse where the department does not use the pack writes no periods (everyday only where it is used)');

\echo '── the visit after the birth: a birth elsewhere, the pregnancy ended once (the base''s)'
select t.as(:'ob');
select t.landed(t.w(jsonb_build_array(
  t.e('obgyn.postnatal', :'her', :'oc', jsonb_build_object('code', jsonb_build_object('text', 'Visit after the birth'), 'value', jsonb_build_object('text', 'Visit after the birth'),
    'obgyn', '{"days":42,"bleeding":"none","wound":"healed","birth":{"on":"2026-08-27","weeks":39,"days":0,"where":"elsewhere","place":"Heliopolis, private","how":"caesarean","baby":"boy","grams":3400}}'::jsonb)),
  t.e('pregnancy', :'her', :'oc', jsonb_build_object('status', 'ended', 'pregnant', true, 'reason', 'Delivered', 'lmp', jsonb_build_object('value', ((now() at time zone 'Africa/Cairo')::date - 199)::text, 'precision', 'day')),
    null, null, '00000000-0000-0000-0000-00000000d301', 'changes'))), 'the visit, and the pregnancy ended: the birth');
reset role;
select t.ok((select obgyn.postnatal_line(jsonb_build_object('data', x.data)) from core.entries x where x.type = 'obgyn.postnatal' order by x.recorded_at desc limit 1)
  like 'Visit after the birth · 6 w · no bleeding · wound healed · the birth: 27 Aug, 39+0 w, Heliopolis, private, caesarean, boy 3400 g', 'its line says the birth');

\echo '── EPDS, added up by the server; its settings, setup and roles'
select t.ok((core.score('obgyn.epds', null, '{"laughing":"not_quite","looking_forward":"rather_less","blaming":"some","anxious":"sometimes","scared":"sometimes","on_top":"sometimes","sleep":"not_often","sad":"often","crying":"occasionally","harming":"never"}')
  ->> 'total')::int = 14 and (core.score('obgyn.epds', null, '{"laughing":"not_quite","looking_forward":"rather_less","blaming":"some","anxious":"sometimes","scared":"sometimes","on_top":"sometimes","sleep":"not_often","sad":"often","crying":"occasionally","harming":"never"}')
  -> 'band' ->> 'key') = 'possible', 'EPDS 14: 13 or more, possible depression (the picture)');
select t.ok((select s.alias from core.scores s where s.key = 'obgyn.epds') = 'epds', '/epds in the composer');
set role authenticated;
select t.as(:'ow');
select t.ok(public.write_setting('{"key":"obgyn.schedule","data":{"rows":[{"from":28,"to":28,"what":"Anti-D 1500 IU IM · given here","whom":"rh_negative","word":"anti-D"}]}}') ->> 'key' = 'obgyn.schedule', 'the schedule, the clinic''s');
select t.refuses($$select public.write_setting('{"key":"obgyn.schedule","data":{"rows":[{"from":28,"to":28,"what":"Anti-D","whom":"blondes"}]}}')$$, 'bad_shape');
reset role;
select t.ok((select s.shape -> 'properties' -> 'rows' -> 'default' -> 0 ->> 'word' from core.setting_keys s where s.key = 'obgyn.schedule') = 'booking bloods', 'the drawn starter rows as the shape''s defaults');
select t.ok(core.department_uses(:'org', :'oc', 'obgyn'), 'the ObGyn clinic ticks obgyn');
select t.ok(core.may('00000000-0000-0000-0000-0000000000d3', 'write:result', :'oc') and core.may('00000000-0000-0000-0000-0000000000d3', 'write:obgyn.periods', :'oc'), 'the obstetrician: a doctor with obgyn''s actions');
select t.ok(core.may('00000000-0000-0000-0000-0000000000d4', 'write:vitals', :'oc') and core.may('00000000-0000-0000-0000-0000000000d4', 'write:obgyn.anc', :'oc')
  and not core.may('00000000-0000-0000-0000-0000000000d4', 'write:result', :'oc'), 'the midwife: a nurse with the antenatal and postnatal checks');
select t.ok((select l.role_block from core.layers l where l.key = 'obgyn') = 'd3', 'block d3 (d310–d31f kept for the labour ward)');
