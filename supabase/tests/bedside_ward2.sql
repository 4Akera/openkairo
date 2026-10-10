-- Ward nursing's obs due (spec §5.6, W1): the department setting bedside.response with RCP 2017's response as its defaults, the Obs due
-- tab on the starter setup's line, and the op bedside.obs_due on a ward's stays: each stay's latest NEWS2, its level by the server's own
-- points (the band first, then a 3 in any one sign, then 0), the ward's rule for it and when the next obs are due; the ward's own
-- response replacing RCP's level by level; the read logged; another department's stays left out; a new stay's clock starting afresh;
-- silent where the department's line has no Obs due; refused where the pack is not used or the role may not read the record.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set stay  '00000000-0000-0000-0000-00000000e701'
\set stay2 '00000000-0000-0000-0000-00000000e702'
\set stay3 '00000000-0000-0000-0000-00000000e703'
\set n10   '00000000-0000-0000-0000-00000000e710'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["bedside"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked;
-- the ward's line holds the Obs due tab, as the starter setup's does
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'ward', 'data', '{"screens":["base.beds","bedside.obs"],"opens":"base.beds"}'::jsonb)) ->> 'key' as line;

\echo '── the ward''s response: a setting on the department''s card, RCP 2017''s as its defaults'
select t.ok(k.layer = 'bedside' and k.owner_kind = 'department' and k.form = 'department' and not k.many and k.labels ->> 'en' = 'NEWS2 · the response',
  'bedside.response: Ward nursing''s, one per department, on its card, "NEWS2 · the response"') from core.setting_keys k where k.key = 'bedside.response';
select t.ok((select array_agg(f ->> 'key' order by n) from jsonb_array_elements(k.fields) with ordinality x(f, n)) = array['zero', 'zero.every', 'zero.tell', 'low', 'low.every',
  'low.tell', 'single', 'single.every', 'single.tell', 'medium', 'medium.every', 'medium.tell', 'high', 'high.every', 'high.tell'],
  'its form: the five levels, each with Obs every and Tell') from core.setting_keys k where k.key = 'bedside.response';
select t.ok((select jsonb_object_agg(l.key, jsonb_strip_nulls(jsonb_build_object('every', l.value -> 'properties' -> 'every' -> 'default', 'tell', l.value -> 'properties' -> 'tell' -> 'default')))
  from core.setting_keys k, jsonb_each(k.shape -> 'properties') l where k.key = 'bedside.response') = bedside.rcp_response(), 'its defaults are bedside.rcp_response(), word for word');
select t.ok(bedside.rcp_response() = '{"zero":{"every":720},"low":{"every":240,"tell":"the nurse in charge"},"single":{"every":60,"tell":"the doctor caring for the patient"},
  "medium":{"every":60,"tell":"the doctor now"},"high":{"every":30,"tell":"the doctor now · think of ICU"}}'::jsonb,
  'RCP 2017: 0 every 12 hours; 1–4 every 4 hours, the nurse in charge; a 3 in one sign and 5–6 hourly, a doctor; 7 or more every 30 min, think of ICU');

\echo '── its tab beside the board, on the starter setup''s line'
select t.ok(s.layer = 'bedside' and s.work = 'stays' and s.action = 'read:record' and s.replaces = '{}' and s.labels ->> 'en' = 'Obs due',
  'bedside.obs: "Obs due", a stays screen for whoever may read the record, replacing nothing') from core.screens s where s.key = 'bedside.obs';
select t.ok(s.screens -> 'screens' ->> 0 = 'base.beds' and (s.screens -> 'screens') ? 'bedside.obs' and s.screens ->> 'opens' = 'base.beds',
  'bedside.ward''s line: the board first, Obs due on it, opening on the board') from core.setups s where s.key = 'bedside.ward';
select public.setup(jsonb_build_object('setup', 'bedside.ward', 'department_id', :'new', 'name', 'Short Stay Ward', 'apply', true)) is not null as made;
select t.ok(bedside.obs_here(:'org', :'new') and bedside.obs_here(:'org', :'ward') and not bedside.obs_here(:'org', :'im'),
  'a ward made from it holds Obs due on its line (the setup''s, or the default where that is the same); the ward''s own line holds it; a clinic''s does not');
select t.ok(o.layer = 'bedside' and o.action = 'read:record' and o.patients, 'bedside.obs_due: Ward nursing''s op, for whoever may read the record, naming its patients')
  from core.ops o where o.key = 'bedside.obs_due';

set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'stay', :'stay')), 'admitted to the ward');
select t.as(:'nurse');
create function pg_temp.due(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'bedside.obs_due', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;
-- one NEWS2 (the server checks its total), taken p_min minutes ago
create function pg_temp.news(p_stay uuid, p_min int, p_score text, p_inputs jsonb, p_total int, p_band text, p_id uuid default null, p_patient uuid default '00000000-0000-0000-0000-0000000000f1',
  p_dept uuid default '00000000-0000-0000-0000-0000000000d6') returns jsonb language sql as $$
  select t.w(t.e('score', p_patient, p_dept, jsonb_build_object('score', p_score, 'version', '2017', 'inputs', p_inputs, 'total', p_total, 'band', p_band), p_id, p_stay,
    null, null, null, jsonb_build_object('occurred_at', now() - make_interval(mins => p_min))))
$$;
-- the stay's obs due: its level, total, threes, rule, and due at its NEWS2's time plus the rule's interval
create function pg_temp.due_is(p_dept uuid, p_stay uuid, p_min int, p_level text, p_total int, p_threes jsonb, p_every int, p_tell text) returns text language sql as $$
  select t.ok(s ->> 'level' = p_level and (s ->> 'total')::int = p_total and s -> 'threes' = p_threes and (s ->> 'every')::int = p_every
    and (s ->> 'tell') is not distinct from p_tell and (p_tell is not null or not s ? 'tell')
    and (s ->> 'at')::timestamptz = now() - make_interval(mins => p_min) and (s ->> 'due_at')::timestamptz = (s ->> 'at')::timestamptz + make_interval(mins => p_every),
    format('NEWS2 %s, %s min ago: %s, every %s min, tell %s, threes %s, due %s min on', p_total, p_min, p_level, p_every, coalesce(p_tell, '(none)'), p_threes, p_every)
      || case when s is null then ' (no answer)' else '' end)
  from (select pg_temp.due(p_dept) -> 'stays' -> p_stay::text s) x
$$;

\echo '── no NEWS2 yet: the stay is not in the answer, its patient is named'
select t.ok(d -> 'stays' = '{}'::jsonb and d -> 'patient_ids' ? :'pt', 'no NEWS2: no stay in the answer, the patient named for the read log') from (select pg_temp.due(:'ward') d) x;

\echo '── each level, by the server''s points: the band first, then a 3 in one sign, then 0'
select t.landed(pg_temp.news(:'stay', 50, 'bedside.news2', '{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"}', 6, 'medium'), 'NEWS2 6, 50 min ago');
select pg_temp.due_is(:'ward', :'stay', 50, 'medium', 6, '[]', 60, 'the doctor now');
select t.landed(pg_temp.news(:'stay', 40, 'bedside.news2', '{"rr":"18","spo2":"96","oxygen":"air","sbp":"88","pulse":"98","consciousness":"a","temp":"38.0"}', 4, 'low'), 'NEWS2 4 with systolic 88, 40 min ago');
select pg_temp.due_is(:'ward', :'stay', 40, 'single', 4, '["sbp"]', 60, 'the doctor caring for the patient');
select t.landed(pg_temp.news(:'stay', 30, 'bedside.news2', '{"rr":"16","spo2":"97","oxygen":"air","sbp":"120","pulse":"70","consciousness":"a","temp":"37.0"}', 0, 'low'), 'NEWS2 0, 30 min ago');
select pg_temp.due_is(:'ward', :'stay', 30, 'zero', 0, '[]', 720, null);
select t.landed(pg_temp.news(:'stay', 20, 'bedside.news2', '{"rr":"22","spo2":"97","oxygen":"air","sbp":"120","pulse":"70","consciousness":"a","temp":"37.0"}', 2, 'low'), 'NEWS2 2, 20 min ago');
select pg_temp.due_is(:'ward', :'stay', 20, 'low', 2, '[]', 240, 'the nurse in charge');
select t.landed(pg_temp.news(:'stay', 10, 'bedside.news2_s2', '{"rr":"26","spo2_s2":"86_87","oxygen":"oxygen","sbp":"146","pulse":"112","consciousness":"a","temp":"37.8"}', 8, 'high', :'n10'),
  'NEWS2 8 on scale 2 with a 3 in rr, 10 min ago');
select pg_temp.due_is(:'ward', :'stay', 10, 'high', 8, '["rr"]', 30, 'the doctor now · think of ICU');

\echo '── the latest is by when the obs were taken, not when they were written; crossed out, it is passed over'
select t.landed(pg_temp.news(:'stay', 60, 'bedside.news2', '{"rr":"16","spo2":"97","oxygen":"air","sbp":"120","pulse":"70","consciousness":"a","temp":"37.0"}', 0, 'low'), 'NEWS2 0 written now, taken 60 min ago');
select pg_temp.due_is(:'ward', :'stay', 10, 'high', 8, '["rr"]', 30, 'the doctor now · think of ICU');
select t.landed(t.w(t.e('crossed_out', :'pt', :'ward', '{"reason":"wrong_value"}', null, :'stay', null, null, :'n10')), 'the 10-minute NEWS2 crossed out');
select pg_temp.due_is(:'ward', :'stay', 20, 'low', 2, '[]', 240, 'the nurse in charge');

\echo '── the ward''s own response: a level saved replaces RCP''s whole; an empty Tell stays empty'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'bedside.response', 'owner_id', :'ward', 'data',
  '{"zero":{"every":720},"low":{"every":360},"single":{"every":60,"tell":"the doctor"},"medium":{"every":30,"tell":"Dr on call, bleep 412"},"high":{"every":15,"tell":"the outreach team"}}'::jsonb)) ->> 'key' as saved;
select t.as(:'nurse');
select pg_temp.due_is(:'ward', :'stay', 20, 'low', 2, '[]', 360, null);
select t.landed(pg_temp.news(:'stay', 5, 'bedside.news2', '{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"}', 6, 'medium'), 'NEWS2 6, 5 min ago');
select pg_temp.due_is(:'ward', :'stay', 5, 'medium', 6, '[]', 30, 'Dr on call, bleep 412');

\echo '── refused: a rule out of range or a level missing, a role that may not set it, a department without the pack, a role that may not read'
select t.as(:'ow');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.response','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"zero":{"every":720},"low":{"every":10},"single":{"every":60},"medium":{"every":60},"high":{"every":30}}'), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.response','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"zero":{"every":720},"low":{"every":1441},"single":{"every":60},"medium":{"every":60},"high":{"every":30}}'), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.response','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"zero":{"every":720},"low":{"every":240},"single":{"every":60},"medium":{"every":60}}'), 'bad_shape');
select t.as(:'nurse');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.response','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"zero":{"every":720},"low":{"every":240},"single":{"every":60},"medium":{"every":60},"high":{"every":30}}'), 'not_allowed');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.obs_due','department_id',%L))$q$, :'im'), 'not_used_here');
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.obs_due','department_id',%L))$q$, :'ward'), 'not_allowed');

\echo '── the read is logged for each patient it names'
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'bedside.obs_due'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;

\echo '── this department''s stays only; silent where the line has no Obs due'
select t.as(:'ow');   -- Dr Ali and Nurse Sara work on the Short Stay Ward too
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
select t.landed(t.w(t.e('admitted', :'pt2', :'new', '{"admit_source":"emd","reason":"cellulitis"}', :'stay2', :'stay2')), 'another patient admitted to the Short Stay Ward');
select t.as(:'nurse');
select t.landed(pg_temp.news(:'stay2', 15, 'bedside.news2', '{"rr":"22","spo2":"94","oxygen":"air","sbp":"105","pulse":"104","consciousness":"a","temp":"38.4"}', 6, 'medium', null, :'pt2', :'new'),
  'NEWS2 6 in that stay');
select t.ok(not (d -> 'stays' ? :'stay2') and not (d -> 'patient_ids' ? :'pt2') and d -> 'stays' ? :'stay', 'the ward''s answer leaves out a stay of another department, and its patient')
  from (select pg_temp.due(:'ward') d) x;
select t.ok((select array_agg(k) from jsonb_object_keys(d -> 'stays') k) = array[:'stay2'] and d -> 'patient_ids' = jsonb_build_array(:'pt2'),
  'the Short Stay Ward''s answer: its own stay only, with RCP''s rule') from (select pg_temp.due(:'new') d) x;
select pg_temp.due_is(:'new', :'stay2', 15, 'medium', 6, '[]', 60, 'the doctor now');
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'new', 'data', '{"screens":["base.beds"],"opens":"base.beds"}'::jsonb)) ->> 'key' as no_tab;
select t.as(:'nurse');
select t.ok(d = '{"patient_ids":[],"stays":{}}'::jsonb, 'a department that ticks the pack with no Obs due on its line (an ICU, an ER): an empty answer, though its stay has NEWS2 6')
  from (select pg_temp.due(:'new') d) x;

\echo '── discharged, the stay leaves the answer'
select t.as(:'dr');
select t.landed(t.w(t.move('discharged', :'stay', :'ward', '{"disposition":"home"}')), 'the ward''s stay discharged home');
select t.as(:'nurse');
select t.ok(d -> 'stays' = '{}'::jsonb and d -> 'patient_ids' = '[]'::jsonb, 'no stay, no patient') from (select pg_temp.due(:'ward') d) x;

\echo '── the clock starts at this stay: a NEWS2 of the stay before does not count'
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia again"}', :'stay3', :'stay3')), 'the same patient admitted again: a new stay');
select t.as(:'nurse');
select t.ok(d -> 'stays' = '{}'::jsonb and d -> 'patient_ids' = jsonb_build_array(:'pt'),
  'the new stay has no NEWS2 of its own: not in the answer (the stay before had NEWS2), its patient named') from (select pg_temp.due(:'ward') d) x;

\echo '── a department that ticks the pack but does not keep stays, with no line of its own: no Obs due'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked_im;
reset role;
select t.ok(core.department_uses(:'org', :'im', 'bedside') and core.setting_at(:'org', 'department.screens', :'im') is null and not bedside.obs_here(:'org', :'im'),
  'the clinic ticks the pack, has no line of its own, and its work is not stays: no Obs due there');
set role authenticated;
select t.as(:'nurse');
select t.ok(d = '{"patient_ids":[],"stays":{}}'::jsonb, 'and its answer is empty') from (select pg_temp.due(:'im') d) x;
select t.as(null);
