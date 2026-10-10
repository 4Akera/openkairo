-- Ward nursing's handover (spec §5.6, W3a): the Handover tab on the starter setup's line, and the op bedside.handover on a ward's stays:
-- each admitted stay with the patient's active alerts in the base's words and this stay's latest handover note (when, by whom, its words),
-- a crossed-out note passed over; another department's stays left out; silent where the department's line has no Handover; refused where
-- the pack is not used or the role may not read the record; the read logged. A handover is the base's note, kind handover, in the stay:
-- its line in the record is its heading and its words; a nurse's lands as one note; the stay discharged leaves the answer.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set im    '00000000-0000-0000-0000-0000000000d1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set new   '00000000-0000-0000-0000-0000000000e9'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set stay  '00000000-0000-0000-0000-00000000e901'
\set stay2 '00000000-0000-0000-0000-00000000e902'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["bedside"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked;
-- the ward's line holds the Handover tab, as the starter setup's does
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'ward', 'data', '{"screens":["base.beds","bedside.obs","bedside.handover"],"opens":"base.beds"}'::jsonb)) ->> 'key' as line;

\echo '── its tab beside the board, last on the starter setup''s line'
select t.ok(s.layer = 'bedside' and s.work = 'stays' and s.action = 'read:record' and s.replaces = '{}' and s.labels ->> 'en' = 'Handover',
  'bedside.handover: "Handover", a stays screen for whoever may read the record, replacing nothing') from core.screens s where s.key = 'bedside.handover';
select t.ok(s.screens -> 'screens' ->> 0 = 'base.beds' and s.screens -> 'screens' ->> -1 = 'bedside.handover' and (s.screens -> 'screens') ? 'bedside.obs'
  and s.screens ->> 'opens' = 'base.beds', 'bedside.ward''s line: the board first, Obs due kept, Handover last, opening on the board') from core.setups s where s.key = 'bedside.ward';
select t.ok(o.layer = 'bedside' and o.action = 'read:record' and o.patients, 'bedside.handover: Ward nursing''s op, for whoever may read the record, naming its patients')
  from core.ops o where o.key = 'bedside.handover';

set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"pneumonia"}', :'stay', :'stay')), 'admitted to the ward');
select t.as(:'nurse');
create function pg_temp.ho(p_dept uuid) returns jsonb language sql as $$
  select public.pack_op(jsonb_build_object('op', 'bedside.handover', 'department_id', p_dept, 'args', '{}'::jsonb, 'purpose', 'TREAT'))
$$;
-- a handover note in a stay, p_min minutes ago
create function pg_temp.note(p_id uuid, p_stay uuid, p_min int, p_data jsonb, p_patient uuid default '00000000-0000-0000-0000-0000000000f1',
  p_dept uuid default '00000000-0000-0000-0000-0000000000d6') returns jsonb language sql as $$
  select t.w(t.e('note', p_patient, p_dept, p_data, p_id, p_stay, null, null, null, jsonb_build_object('occurred_at', now() - make_interval(mins => p_min))))
$$;

\echo '── nothing yet: the stay with no alerts and no last handover; its patient named'
select t.ok(d -> 'stays' -> :'stay' = '{"alerts":[]}'::jsonb and d -> 'patient_ids' ? :'pt', 'no alert, no handover: alerts [], no last; the patient named for the read log')
  from (select pg_temp.ho(:'ward') d) x;

\echo '── the patient''s active alerts, in the base''s words; one ended is left out'
select t.landed(t.w(t.e('alert', :'pt', :'ward', '{"concept":{"text":"Fall risk","codings":[{"system":"local.alert","code":"fall_risk","display":"Fall risk"}]},"status":"active"}',
  '00000000-0000-0000-0000-00000000e911', :'stay')), 'a fall-risk alert');
select t.landed(t.w(t.e('alert', :'pt', :'ward', '{"concept":{"text":"Isolation","codings":[]},"status":"active"}', '00000000-0000-0000-0000-00000000e912', :'stay')), 'an isolation alert');
select t.landed(t.w(t.e('alert', :'pt', :'ward', '{"concept":{"text":"Isolation","codings":[]},"status":"inactive"}', '00000000-0000-0000-0000-00000000e913', :'stay',
  '00000000-0000-0000-0000-00000000e912', 'changes')), 'the isolation ended');
select t.ok(d -> 'stays' -> :'stay' -> 'alerts' = '["Fall risk"]'::jsonb, 'alerts: Fall risk only') from (select pg_temp.ho(:'ward') d) x;

\echo '── the stay''s latest handover, by when it was handed over; a progress note is not one; crossed out, the one before answers'
select t.landed(pg_temp.note('00000000-0000-0000-0000-00000000e914', :'stay', 30, '{"kind":"handover","heading":"Handover 08–14 → 14–20","text":"This shift: a\nFor the next shift: b"}'),
  'a handover 30 min ago');
select t.landed(pg_temp.note('00000000-0000-0000-0000-00000000e915', :'stay', 10, '{"kind":"handover","text":"This shift: c"}'), 'another 10 min ago, no heading');
select t.landed(pg_temp.note('00000000-0000-0000-0000-00000000e916', :'stay', 5, '{"kind":"progress","text":"comfortable"}'), 'a progress note 5 min ago');
select t.ok((l ->> 'at')::timestamptz = now() - interval '10 minutes' and l ->> 'by' = '00000000-0000-0000-0000-0000000000b3' and l ->> 'text' = 'This shift: c'
  and not l ? 'heading', 'last: the 10-minute handover, by the nurse''s user, its words, no heading') from (select pg_temp.ho(:'ward') -> 'stays' -> :'stay' -> 'last' l) x;
select t.landed(t.w(t.e('crossed_out', :'pt', :'ward', '{"reason":"wrong_patient"}', null, :'stay', null, null, '00000000-0000-0000-0000-00000000e915')), 'the 10-minute handover crossed out');
select t.ok((l ->> 'at')::timestamptz = now() - interval '30 minutes' and l ->> 'heading' = 'Handover 08–14 → 14–20' and l ->> 'text' = E'This shift: a\nFor the next shift: b',
  'last: the 30-minute handover again, with its heading') from (select pg_temp.ho(:'ward') -> 'stays' -> :'stay' -> 'last' l) x;
select t.ok(t.entry(t.record(:'pt', :'ward'), '00000000-0000-0000-0000-00000000e914') ->> 'line' = 'Handover 08–14 → 14–20 · This shift: a · For the next shift: b',
  'in the record its line is its heading, then its words');

\echo '── refused: a department without the pack, a role that may not read the record'
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.handover','department_id',%L))$q$, :'im'), 'not_used_here');
select t.as(:'rec');
select t.refuses(format($q$select public.pack_op(jsonb_build_object('op','bedside.handover','department_id',%L))$q$, :'ward'), 'not_allowed');

\echo '── the read is logged for each patient it names'
reset role;
select t.ok(exists (select 1 from core.read_log l where l.patient_id = :'pt' and l.purpose = 'TREAT' and l.what -> 'ops' ? 'bedside.handover'),
  'the read is logged for the patient, for treatment, naming the op');
set role authenticated;

\echo '── a nurse''s handover lands as one note in the stay (the tab''s write); reception may not write it'
select t.as(:'nurse');
select t.landed(t.w(t.e('note', :'pt', :'ward', '{"kind":"handover","heading":"Handover 14–20 → 20–08","text":"At handover: NEWS2 6 · Fall risk\nThis shift: d"}',
  '00000000-0000-0000-0000-00000000e917', :'stay')), 'a nurse''s handover lands as one note in the stay');
select t.ok(pg_temp.ho(:'ward') -> 'stays' -> :'stay' -> 'last' ->> 'heading' = 'Handover 14–20 → 20–08', 'it is the stay''s last handover now');
select t.as(:'rec');
select t.refused(t.w(t.e('note', :'pt', :'ward', '{"kind":"handover","text":"This shift: e"}', '00000000-0000-0000-0000-00000000e918', :'stay')), 'not_allowed',
  'reception may not write a handover');

\echo '── this department''s stays only; a ward made from the setup takes its line, which holds the tab, as the default line does'
select t.as(:'ow');
select public.setup(jsonb_build_object('setup', 'bedside.ward', 'department_id', :'new', 'name', 'Surgical Ward', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'new')))) is not null as dr;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b3', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'ward'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', :'new')))) is not null as nurse;
reset role;
select t.ok(core.setting_at(:'org', 'department.screens', :'new') -> 'screens' ->> -1 = 'bedside.handover' and bedside.handover_here(:'org', :'new')
  and bedside.handover_here(:'org', :'ward') and not bedside.handover_here(:'org', :'im'),
  'the new ward takes the setup''s line (Handover last, after Obs due: not the default''s order, so it is written), which holds it; the ward''s own line holds it; a clinic''s does not');
set role authenticated;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'new', 'retired', true)) ->> 'key' as back_to_default;
reset role;
select t.ok(core.setting_at(:'org', 'department.screens', :'new') is null and bedside.handover_here(:'org', :'new'),
  'with no line of its own, the default line of a stays department that uses the pack holds the tab too');
set role authenticated;
select t.as(:'rec');
select public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'pt2', 'given', jsonb_build_array('Mona'),
  'family', 'Saleh', 'gender', 'female', 'birth_date', '1975-06-02'))) is not null as registered;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt2', :'new', '{"admit_source":"emd","reason":"cellulitis"}', :'stay2', :'stay2')), 'another patient admitted to the Surgical Ward');
select t.as(:'nurse');
select t.landed(pg_temp.note('00000000-0000-0000-0000-00000000e919', :'stay2', 15, '{"kind":"handover","text":"This shift: f"}', :'pt2', :'new'), 'a handover in that stay');
select t.ok(not (d -> 'stays' ? :'stay2') and not (d -> 'patient_ids' ? :'pt2') and d -> 'stays' ? :'stay', 'the ward''s answer leaves out a stay of another department, and its patient')
  from (select pg_temp.ho(:'ward') d) x;
select t.ok((select array_agg(k) from jsonb_object_keys(d -> 'stays') k) = array[:'stay2'] and d -> 'patient_ids' = jsonb_build_array(:'pt2')
  and d -> 'stays' -> :'stay2' -> 'last' ->> 'text' = 'This shift: f', 'the Surgical Ward''s answer: its own stay only, with its handover') from (select pg_temp.ho(:'new') d) x;

\echo '── silent where the line has no Handover tab'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'new', 'data', '{"screens":["base.beds"],"opens":"base.beds"}'::jsonb)) ->> 'key' as no_tab;
select t.as(:'nurse');
select t.ok(d = '{"patient_ids":[],"stays":{}}'::jsonb, 'a department that ticks the pack with no Handover on its line (an ICU, an ER): an empty answer, though its stay has a handover')
  from (select pg_temp.ho(:'new') d) x;

\echo '── discharged, the stay leaves the answer'
select t.as(:'dr');
select t.landed(t.w(t.move('discharged', :'stay', :'ward', '{"disposition":"home"}')), 'the ward''s stay discharged home');
select t.as(:'nurse');
select t.ok(d -> 'stays' = '{}'::jsonb and d -> 'patient_ids' = '[]'::jsonb, 'no stay, no patient') from (select pg_temp.ho(:'ward') d) x;
select t.as(null);
