-- a score is worked out once (spec §5.1 rule 8): a declared points table with a version and its source, checked when declared; the
-- server alone adds it up (core.score, the 'score' read); a recorded score is checked against the version it names and keeps it; a new
-- version is a new row and old entries never change; a clinician signs a version off for the clinic. Proven on the base's Glasgow Coma
-- Scale and a test-only probe score with every kind of input.
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set ali  '00000000-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
\set desk '11111111-0000-0000-0000-0000000000b4'
\set e1   '00000000-0000-0000-0000-00000000e501'
\set e2   '00000000-0000-0000-0000-00000000e502'
\set e3   '00000000-0000-0000-0000-00000000e503'
select t.fixture();

\echo '── the base declares the Glasgow Coma Scale: three items, each choice with its points, three bands over the total, its source'
select t.ok(s.layer = 'base' and s.version = '1974' and s.short = 'GCS' and s.alias = 'gcs' and s.source like 'Teasdale G, Jennett B.%' and s.coding ->> 'code' = '9269-2'
  and (select array_agg(i ->> 'key' order by n) from jsonb_array_elements(s.items) with ordinality x(i, n)) = array['eye', 'verbal', 'motor']
  and (select array_agg(jsonb_array_length(i -> 'choices') order by n) from jsonb_array_elements(s.items) with ordinality x(i, n)) = array[4, 5, 6],
  'GCS 1974: eye 1–4, verbal 1–5, motor 1–6, its paper and its LOINC') from core.scores s where s.key = 'gcs';
select t.ok((select array_agg((b ->> 'min') || '-' || (b ->> 'max') || ' ' || (b ->> 'key') || ' ' || coalesce(b ->> 'tone', 'none') order by n)
  from core.scores s, jsonb_array_elements(s.bands) with ordinality x(b, n) where s.key = 'gcs') = array['3-8 severe danger', '9-12 moderate warn', '13-15 mild none'],
  'bands: 3–8 severe in danger, 9–12 moderate in warn, 13–15 mild with no colour');
select t.ok(has_function_privilege('base_role', 'core.score(text,text,jsonb)', 'EXECUTE') and has_function_privilege('pack_pharmacy', 'core.score(text,text,jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'core.score(text,text,jsonb)', 'EXECUTE') and not has_table_privilege('authenticated', 'core.scores', 'SELECT')
  and not has_function_privilege('pack_pharmacy', 'core.declare_score(text,text,text,text,jsonb,jsonb,jsonb,text,text,jsonb)', 'EXECUTE'),
  'core.score is the base''s and every pack''s; the API reaches it only through the read; nobody but migrations declares');

\echo '── a declaration is checked once'
select core.declare_pack('probe', 1, '{}', '{"en":"Probe"}');
select core.create_pack('probe');
select t.ok(has_function_privilege('pack_probe', 'core.score(text,text,jsonb)', 'EXECUTE'), 'a new pack''s role may call core.score');
create function t.decl(p_key text, p_items text, p_bands text, p_layer text default 'probe', p_source text default 'a paper', p_version text default '1',
  p_labels text default '{"en":"X"}', p_alias text default null) returns void language sql as $$
  select core.declare_score(p_key, p_layer, p_version, p_source, p_items::jsonb, p_bands::jsonb, p_labels::jsonb, null, p_alias)
$$;
\set yn '[{"key":"a","labels":{"en":"A"},"input":"yes_no","points":{"yes":1,"no":0}}]'
\set b01 '[{"key":"lo","labels":{"en":"Low"},"min":0,"max":1}]'
select t.refuses(format($$select t.decl('gcs2', %L, %L)$$, :'yn', :'b01'), 'outside_prefix');
select t.refuses(format($$select t.decl('probe.x', %L, %L, 'base')$$, :'yn', :'b01'), 'outside_prefix');
select t.refuses(format($$select t.decl('gcs', %L, %L, 'probe')$$, :'yn', :'b01'), 'outside_prefix');
select t.refuses(format($$select t.decl('probe.x', %L, %L, p_source => ' ')$$, :'yn', :'b01'), 'source_missing');
select t.refuses(format($$select t.decl('probe.x', %L, %L, p_labels => '{}')$$, :'yn', :'b01'), 'label_missing');
select t.refuses(format($$select t.decl('probe.x', '[]', %L)$$, :'b01'), 'no_items');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"yes_no","points":{"yes":1,"no":0}},{"key":"a","labels":{"en":"A"},"input":"yes_no","points":{"yes":1,"no":0}}]', :'b01'), 'duplicate');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{},"input":"yes_no","points":{"yes":1,"no":0}}]', :'b01'), 'label_missing');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"slider"}]', :'b01'), 'unknown_input');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"yes_no","points":{"yes":1.5,"no":0}}]', :'b01'), 'bad_points');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"choice","choices":[]}]', :'b01'), 'no_choices');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"choice","choices":[{"value":"x","points":0,"labels":{"en":"X"}},{"value":"x","points":1,"labels":{"en":"X"}}]}]', :'b01'), 'duplicate');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","ranges":[{"max":8,"points":1},{"min":10,"points":0}]}]', :'b01'), 'ranges_gap');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","ranges":[{"max":8,"points":1},{"min":8,"points":0}]}]', :'b01'), 'ranges_overlap');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","decimals":1,"ranges":[{"max":35,"points":1},{"min":35.2,"points":0}]}]', :'b01'), 'ranges_gap');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","ranges":[{"min":0,"points":1},{"min":5,"points":0}]}]', :'b01'), 'ranges_open');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","ranges":[]}]', :'b01'), 'no_ranges');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","decimals":1,"ranges":[{"max":35.05,"points":1},{"min":35.15,"points":0}]}]', :'b01'), 'bad_number');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","decimals":7,"ranges":[{"points":1}]}]', :'b01'), 'bad_number');
\set rng '"ranges":[{"max":8,"points":1},{"min":9,"points":0}]'
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number",' || :'rng' || '}]', :'b01'), 'unit_missing');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","unit":" ",' || :'rng' || '}]', :'b01'), 'unit_missing');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","unit":"/min","min":"low",' || :'rng' || '}]', :'b01'), 'bad_number');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","unit":"/min","min":20,"max":10,' || :'rng' || '}]', :'b01'), 'bad_number');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","unit":"/min","min":0.5,' || :'rng' || '}]', :'b01'), 'bad_number');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"number","unit":"/min","ranges":[{"max":"8","points":1},{"min":9,"points":0}]}]', :'b01'), 'bad_number');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"choice","choices":[{"value":4,"points":0,"labels":{"en":"X"}}]}]', :'b01'), 'bad_choice');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"choice","choices":[{"value":"","points":0,"labels":{"en":"X"}}]}]', :'b01'), 'bad_choice');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, '[{"key":"a","labels":{"en":"A"},"input":"choice","choices":[{"value":"x","points":0,"labels":{}}]}]', :'b01'), 'label_missing');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, :'yn', '[{"key":"lo","labels":{"en":"Low"},"min":0,"max":0},{"key":"hi","labels":{"en":"High"},"min":2,"max":2}]'), 'bands_gap');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, :'yn', '[{"key":"lo","labels":{"en":"Low"},"min":0,"max":1},{"key":"hi","labels":{"en":"High"},"min":1,"max":2}]'), 'bands_overlap');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, :'yn', '[{"key":"lo","labels":{"en":"Low"},"min":0,"max":0}]'), 'bands_cover');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, :'yn', '[{"key":"lo","labels":{"en":"Low"},"min":0,"max":1,"tone":"purple"}]'), 'unknown_tone');
select t.refuses(format($$select t.decl('probe.x', %L, %L)$$, :'yn', '[]'), 'no_bands');
select t.refuses(format($$select t.decl('probe.x', %L, %L, p_alias => 'gcs')$$, :'yn', :'b01'), 'alias_taken');
select t.ok(not exists (select 1 from core.scores where key in ('probe.x', 'gcs2')), 'none of them was declared');

\echo '── the probe: every kind of input (a whole number, a number with a decimal, a choice, yes/no) and numeric bands over its total'
\set probe_items '[{"key":"rr","labels":{"en":"Respiratory rate"},"input":"number","unit":"/min","decimals":0,"min":0,"max":80,"ranges":[{"max":8,"points":3},{"min":9,"max":11,"points":1},{"min":12,"max":20,"points":0},{"min":21,"max":24,"points":2},{"min":25,"points":3}]},{"key":"temp","labels":{"en":"Temperature"},"input":"number","unit":"°C","decimals":1,"min":25,"max":45,"ranges":[{"max":35.0,"points":3},{"min":35.1,"max":36.0,"points":1},{"min":36.1,"max":38.0,"points":0},{"min":38.1,"max":39.0,"points":1},{"min":39.1,"points":2}]},{"key":"avpu","labels":{"en":"Consciousness"},"input":"choice","choices":[{"value":"a","points":0,"labels":{"en":"Alert"}},{"value":"v","points":3,"labels":{"en":"Voice"}},{"value":"p","points":3,"labels":{"en":"Pain"}},{"value":"u","points":3,"labels":{"en":"Unresponsive"}}]},{"key":"oxygen","labels":{"en":"On oxygen"},"input":"yes_no","points":{"yes":2,"no":0}}]'
\set probe_bands '[{"key":"low","labels":{"en":"Low"},"min":0,"max":4},{"key":"medium","labels":{"en":"Medium"},"min":5,"max":6,"tone":"warn"},{"key":"high","labels":{"en":"High"},"min":7,"max":11,"tone":"danger"}]'
select core.declare_score('probe.early', 'probe', '1', 'The probe''s own table (tests only)', :'probe_items', :'probe_bands', '{"en":"Probe early warning"}', 'PEW', 'pew');
select t.ok(t.try(format($$select core.declare_score('probe.early', 'probe', '1', 'The probe''s own table (tests only)', %L, %L, '{"en":"Probe early warning"}', 'PEW', 'pew')$$,
  :'probe_items', :'probe_bands')) = 'ok', 'the same table declared again: nothing changes');
select t.refuses(format($$select core.declare_score('probe.early', 'probe', '1', 'The probe''s own table (tests only)', %L, %L, '{"en":"Probe early warning"}', 'PEW', 'pew')$$,
  replace(:'probe_items', '"yes":2', '"yes":1'), :'probe_bands'), 'version_exists');
select t.ok(t.try(format($$select core.declare_score('probe.early', 'probe', '1', E' The probe''s own table (tests only)\n', %L, %L, '{"en":"Probe early warning"}', 'PEW', 'pew')$$,
  :'probe_items', :'probe_bands')) = 'ok' and (select source from core.scores where key = 'probe.early') = 'The probe''s own table (tests only)',
  'the same table with its source padded: stored trimmed, nothing changes');

\echo '── core.score adds it up: each kind, each boundary, each problem, the band only once complete'
create function t.sc(p_inputs text, p_version text default '1') returns jsonb language sql as $$ select core.score('probe.early', p_version, p_inputs::jsonb) $$;
create function t.pts(r jsonb, k text) returns text language sql immutable as $$ select (select i ->> 'points' from jsonb_array_elements(r -> 'items') i where i ->> 'key' = k) $$;
create function t.problem(r jsonb, k text) returns text language sql immutable as $$ select (select p ->> 'code' from jsonb_array_elements(r -> 'problems') p where p ->> 'item' = k) $$;
select t.ok(t.pts(t.sc('{"rr":"8"}'), 'rr') = '3' and t.pts(t.sc('{"rr":"9"}'), 'rr') = '1' and t.pts(t.sc('{"rr":"20"}'), 'rr') = '0' and t.pts(t.sc('{"rr":"25"}'), 'rr') = '3'
  and t.pts(t.sc('{"rr":0}'), 'rr') = '3', 'a whole number: ≤ 8 is 3, 9–11 is 1, 12–20 is 0, ≥ 25 is 3 (a JSON number too)');
select t.ok(t.pts(t.sc('{"temp":"35.0"}'), 'temp') = '3' and t.pts(t.sc('{"temp":"35.1"}'), 'temp') = '1' and t.pts(t.sc('{"temp":"38"}'), 'temp') = '0'
  and t.pts(t.sc('{"temp":"39.1"}'), 'temp') = '2', 'a number with a decimal: 35.0 is 3, 35.1 is 1, 38 is 0, 39.1 is 2');
select t.ok(t.problem(t.sc('{"temp":"37.25"}'), 'temp') = 'too_precise' and t.problem(t.sc('{"rr":"fast"}'), 'rr') = 'not_a_number'
  and t.problem(t.sc('{"rr":"90"}'), 'rr') = 'out_of_range' and t.problem(t.sc('{"temp":"20"}'), 'temp') = 'out_of_range', 'a number it cannot score: too precise, not a number, out of range');
select t.ok(t.pts(t.sc('{"avpu":"v"}'), 'avpu') = '3' and t.pts(t.sc('{"avpu":"a"}'), 'avpu') = '0' and t.problem(t.sc('{"avpu":"x"}'), 'avpu') = 'unknown_choice', 'a choice: its points; one not offered is a problem');
select t.ok(t.pts(t.sc('{"oxygen":true}'), 'oxygen') = '2' and t.pts(t.sc('{"oxygen":false}'), 'oxygen') = '0' and t.problem(t.sc('{"oxygen":"yes"}'), 'oxygen') = 'not_yes_no', 'yes/no: true or false');
select t.ok(t.problem(t.sc('{"pulse":"80"}'), 'pulse') = 'unknown_item', 'an item the table does not name is a problem');
select t.ok(r ->> 'total' is null and r -> 'band' = 'null' and not (r ->> 'complete')::boolean and (r ->> 'so_far')::int = 3 and r -> 'missing' = '["temp", "oxygen"]',
  'not every item answered: no total, no band; what is missing and the points so far') from (select t.sc('{"rr":"8","avpu":"a"}') r) x;
select t.ok((r ->> 'total')::int = 6 and r -> 'band' ->> 'key' = 'medium' and r -> 'band' ->> 'tone' = 'warn' and (r ->> 'complete')::boolean, 'complete: 3 + 1 + 0 + 2 = 6, medium in warn')
  from (select t.sc('{"rr":"8","temp":"35.5","avpu":"a","oxygen":true}') r) x;
select t.ok((r ->> 'total')::int = 11 and r -> 'band' ->> 'key' = 'high' and r -> 'band' ->> 'tone' = 'danger', 'the highest total: 11, high in danger')
  from (select t.sc('{"rr":"30","temp":"34","avpu":"u","oxygen":true}') r) x;
select t.ok((r ->> 'total')::int = 0 and r -> 'band' ->> 'key' = 'low' and r -> 'band' ->> 'tone' is null, 'the lowest: 0, low with no colour')
  from (select t.sc('{"rr":"16","temp":"37","avpu":"a","oxygen":false}') r) x;
select t.ok((r ->> 'total')::int = 14 and r -> 'band' ->> 'key' = 'mild' and r ->> 'version' = '1974', 'GCS E4 V4 M6 is 14, mild; no version asked: the latest in use')
  from (select core.score('gcs', null, '{"eye":"4","verbal":"4","motor":"6"}') r) x;
select t.ok((select array_agg((core.score('gcs', null, jsonb_build_object('eye', e, 'verbal', v, 'motor', m)) -> 'band' ->> 'key') order by e)
  from (values ('1', '1', '1'), ('2', '3', '3'), ('3', '3', '3'), ('4', '4', '4'), ('4', '5', '6')) x(e, v, m)) = array['severe', 'severe', 'moderate', 'moderate', 'mild'],
  'GCS bands at their edges: 3 and 8 severe, 9 and 12 moderate, 15 mild');
select t.refuses($$select core.score('nope', null, '{}')$$, 'unknown_score');
select t.refuses($$select core.score('gcs', '2099', '{}')$$, 'unknown_score');
select t.refuses($$select core.score('gcs', null, '[1,2]')$$, 'bad_input');

\echo '── the read scores while typing: for anyone signed in, the server''s sum'
set role authenticated;
select t.as(:'nurse');
select t.ok(r ->> 'total' = '14' and r -> 'band' ->> 'key' = 'mild' and t.pts(r, 'motor') = '6', 'read score: GCS 14 mild, each item''s points')
  from (select public.read('{"shape":"score","score":"gcs","inputs":{"eye":"4","verbal":"4","motor":"6"}}') r) x;
select t.ok(r ->> 'total' is null and t.pts(r, 'eye') = '3', 'half typed: the points so far, no total') from (select public.read('{"shape":"score","score":"gcs","inputs":{"eye":"3"}}') r) x;
select t.ok(exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'registry' -> 'scores') s where s ->> 'key' = 'gcs' and s ->> 'version' = '1974'
  and jsonb_array_length(s -> 'items') = 3 and s ->> 'source' like 'Teasdale%'), 'read me: every score table with its items, bands, version and source');
select t.ok(exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'registry' -> 'setting_keys') k where k ->> 'key' = 'score.signed_off' and k ->> 'action' = 'sign:score'),
  'read me: the sign-off is a setting written by sign:score');
select t.as(null);
select t.refuses($$select public.read('{"shape":"score","score":"gcs","inputs":{}}')$$, 'not_signed_in');

\echo '── a recorded score: the check adds it up again with the version it names, and refuses what differs'
select t.as(:'dr');
select t.landed(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"1974","inputs":{"eye":"4","verbal":"4","motor":"6"},"total":14,"band":"mild"}', :'e1')), 'GCS 14 mild lands');
select t.ok(t.entry(t.record(:'pt', :'im'), :'e1') ->> 'line' = 'GCS 14, 1974 · Mild', 'its line: GCS 14, 1974 · Mild');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"1974","inputs":{"eye":"4","verbal":"4","motor":"6"},"total":15,"band":"mild"}')), 'score_mismatch', 'a total the server does not reach');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"1974","inputs":{"eye":"4","verbal":"4","motor":"6"},"total":14,"band":"moderate"}')), 'score_mismatch', 'the wrong band');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"1974","inputs":{"eye":"4","verbal":"4"},"total":8,"band":"severe"}')), 'score_incomplete', 'an item unanswered');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"1974","inputs":{"eye":"9","verbal":"4","motor":"6"},"total":19,"band":"mild"}')), 'bad_input', 'a value not offered');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"apache","version":"2","inputs":{},"total":0,"band":"low"}')), 'unknown_score', 'a score never declared');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"2014","inputs":{"eye":"4","verbal":"4","motor":"6"},"total":14,"band":"mild"}')), 'unknown_score', 'a version never declared');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","inputs":{"eye":"4"},"total":4,"band":"severe"}')), 'bad_shape', 'no version');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"probe.early","version":"1","inputs":{"rr":"16","temp":"37","avpu":"a","oxygen":false},"total":0,"band":"low"}')), 'pack_not_used',
  'a pack''s score where the department does not use the pack');
select t.as(:'nurse');
select t.landed(t.w(t.e('score', :'pt', :'im', '{"score":"gcs","version":"1974","inputs":{"eye":"3","verbal":"4","motor":"5"},"total":12,"band":"moderate"}')), 'a nurse records GCS 12 moderate');
select t.as(:'desk');
select t.refused(t.w(t.e('score', :'pt', '00000000-0000-0000-0000-0000000000d4', '{"score":"gcs","version":"1974","inputs":{"eye":"4","verbal":"5","motor":"6"},"total":15,"band":"mild"}')), 'not_allowed', 'reception does not');

\echo '── a new version is a new row: old entries keep theirs; a retired version takes no new entry'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as probe_on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["probe"]}'::jsonb)) ->> 'key' as probe_ticked;
select t.as(:'dr');
select t.landed(t.w(t.e('score', :'pt', :'im', '{"score":"probe.early","version":"1","inputs":{"rr":"8","temp":"35.5","avpu":"a","oxygen":true},"total":6,"band":"medium"}', :'e2')),
  'the probe, version 1: 6 medium, where the department uses the pack');
reset role;
select core.declare_score('probe.early', 'probe', '2', 'The probe''s own table, revised (tests only)', replace(:'probe_items', '"yes":2', '"yes":3')::jsonb,
  replace(replace(replace(:'probe_bands', '"max":11', '"max":12'), '"min":5,"max":6', '"min":5,"max":7'), '"min":7,', '"min":8,')::jsonb, '{"en":"Probe early warning"}', 'PEW', 'pew');
select t.ok((select array_agg(version order by position) from core.scores where key = 'probe.early') = array['1', '2'], 'two versions: the old row stays');
select t.ok((core.score('probe.early', null, '{"rr":"8","temp":"35.5","avpu":"a","oxygen":true}') ->> 'version') = '2', 'no version asked: the latest');
set role authenticated;
select t.as(:'dr');
select t.ok(e -> 'data' ->> 'version' = '1' and e -> 'data' ->> 'total' = '6' and e ->> 'line' = 'PEW 6, 1 · Medium', 'the old entry keeps version 1, its total, its band and its line')
  from (select t.entry(t.record(:'pt', :'im'), :'e2') e) x;
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"probe.early","version":"2","inputs":{"rr":"8","temp":"35.5","avpu":"a","oxygen":true},"total":6,"band":"medium"}')), 'score_mismatch',
  'version 2 with version 1''s sum');
select t.landed(t.w(t.e('score', :'pt', :'im', '{"score":"probe.early","version":"2","inputs":{"rr":"8","temp":"35.5","avpu":"a","oxygen":true},"total":7,"band":"medium"}', :'e3')),
  'version 2 adds it up its own way: 7, still medium');
select t.landed(t.w(t.e('score', :'pt', :'im', '{"score":"probe.early","version":"1","inputs":{"rr":"16","temp":"37","avpu":"a","oxygen":false},"total":0,"band":"low"}')),
  'version 1 still takes an entry until it is retired');
reset role;
select core.retire_score('probe.early', '1');
select t.refuses($$select core.retire_score('probe.early', '9')$$, 'unknown_score');
set role authenticated;
select t.as(:'dr');
select t.refused(t.w(t.e('score', :'pt', :'im', '{"score":"probe.early","version":"1","inputs":{"rr":"16","temp":"37","avpu":"a","oxygen":false},"total":0,"band":"low"}')), 'score_retired',
  'a retired version takes no new entry');
select t.ok(e -> 'data' ->> 'version' = '1' and e ->> 'line' = 'PEW 6, 1 · Medium', 'the old entry still reads as written') from (select t.entry(t.record(:'pt', :'im'), :'e2') e) x;
select t.ok((public.read('{"shape":"score","score":"probe.early","version":"1","inputs":{}}') ->> 'retired')::boolean, 'the read says a version is retired');
select t.ok((select count(*) from jsonb_array_elements(public.read('{"shape":"me"}') -> 'registry' -> 'scores') s where s ->> 'key' = 'probe.early') = 2, 'read me sends both versions');

\echo '── FHIR: an Observation of the total, its band in words, a component per item with its points'
select t.ok(o -> 'code' -> 'coding' -> 0 ->> 'code' = '9269-2' and (o ->> 'valueInteger')::int = 14 and o -> 'interpretation' -> 0 ->> 'text' = 'Mild'
  and jsonb_array_length(o -> 'component') = 3 and o -> 'component' -> 2 -> 'code' -> 'coding' -> 0 ->> 'code' = '9268-4' and (o -> 'component' -> 2 ->> 'valueInteger')::int = 6
  and o -> 'method' ->> 'text' = 'Glasgow Coma Scale, 1974', 'GCS 14: LOINC 9269-2, Mild, eye, verbal and motor with their points')
  from jsonb_array_elements(public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'im')) -> 'entry') b, lateral (select b -> 'resource' o) x
 where o ->> 'id' = :'e1';

\echo '── signed off for this clinic: a setting by sign:score that records who and when; unsigned still works'
select t.ok(not exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'key' = 'score.signed_off'), 'nothing signed off yet (and GCS took entries)');
select t.ok(public.write_setting('{"key":"score.signed_off","data":{"score":"gcs","version":"1974","note":"Adopted by the ward"}}') ->> 'key' = 'score.signed_off', 'Dr Ali signs off GCS 1974');
select t.ok(s ->> 'author_id' = :'ali' and s ->> 'recorded_at' is not null and s -> 'data' ->> 'version' = '1974', 'read me: who signed it off and when')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'key' = 'score.signed_off';
select t.refuses($$select public.write_setting('{"key":"score.signed_off","data":{"score":"gcs","version":"1974"}}')$$, 'already_signed');
select t.refuses($$select public.write_setting('{"key":"score.signed_off","data":{"score":"gcs","version":"2014"}}')$$, 'unknown_score');
select t.refuses($$select public.write_setting('{"key":"score.signed_off","data":{"score":"gcs"}}')$$, 'bad_shape');
select t.as(:'nurse');
select t.refuses($$select public.write_setting('{"key":"score.signed_off","data":{"score":"probe.early","version":"2"}}')$$, 'not_allowed');
select t.as(:'desk');
select t.refuses($$select public.write_setting('{"key":"score.signed_off","data":{"score":"probe.early","version":"2"}}')$$, 'not_allowed');
select t.as(:'dr');
select public.write_setting(jsonb_build_object('key', 'score.signed_off', 'thing_id', s ->> 'thing_id', 'retired', true)) ->> 'key' as withdrawn
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'key' = 'score.signed_off';
select t.ok(not exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'key' = 'score.signed_off'), 'withdrawn: not signed off');
select t.ok(public.write_setting('{"key":"score.signed_off","data":{"score":"gcs","version":"1974"}}') ->> 'key' = 'score.signed_off', 'signed off again');
select t.as(:'ow');
select t.ok(jsonb_array_length(public.read('{"shape":"audit","what":"setting:score.signed_off"}') -> 'changes') = 3, 'the history: signed, withdrawn, signed again');
select t.as(null);
