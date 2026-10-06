-- how a pack shows up (spec §5.1 rules 1, 4 and 6): a department ticks the packs it uses (department.packs), only packs the clinic has
-- on; core.department_uses answers "does this department use the layer"; the Screens line (department.screens) holds only screens
-- of the department's work from the base or a pack it uses, never beside a base screen one of them stands in for, and opens on one of
-- them; the directory carries each department's packs and line, and each screen's action and what it replaces
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set pm   '11111111-0000-0000-0000-0000000000b6'
select t.fixture(false);
-- a second pack the clinic has not turned on
select core.declare_pack('spare', 1, '{}', '{"en":"Spare fixture"}');

\echo '── the registry: each screen names the action its tab needs; a pack screen names the base screen it stands in for'
select t.ok(action = 'read:bench' and replaces = '{}', 'base.bench needs read:bench') from core.screens where key = 'base.bench';
select t.ok(action = 'read:queue', 'base.queue needs read:queue') from core.screens where key = 'base.queue';
select t.ok(action = 'read:pharmacy.queue' and replaces = array['base.bench'], 'pharmacy.dispensing needs read:pharmacy.queue and replaces base.bench') from core.screens where key = 'pharmacy.dispensing';
select t.refuses($$select core.declare_screen('spare.board', 'spare', 'bench', '{}', 'read:nothing')$$, 'unknown_action');
select t.refuses($$select core.declare_screen('spare.board', 'spare', 'bench', '{}', null, array['base.queue'])$$, 'unknown_screen');
select t.refuses($$select core.declare_screen('spare.board', 'spare', 'bench', '{}', null, array['pharmacy.dispensing'])$$, 'unknown_screen');
select core.declare_screen('spare.board', 'spare', 'bench', '{"en":"Board"}', null, array['base.bench']);
select t.ok(action is null and replaces = array['base.bench'], 'a screen with no action shows to anyone working there') from core.screens where key = 'spare.board';

\echo '── department.packs: known packs, on for the clinic, each once'
select t.as(:'ow');
select t.refuses(format($$select public.write_setting('{"key":"department.packs","owner_id":"%s","data":{"packs":["nosuch"]}}')$$, :'ph'), 'unknown_pack');
select t.refuses(format($$select public.write_setting('{"key":"department.packs","owner_id":"%s","data":{"packs":["spare"]}}')$$, :'ph'), 'pack_off');
select t.refuses(format($$select public.write_setting('{"key":"department.packs","owner_id":"%s","data":{"packs":["pharmacy","pharmacy"]}}')$$, :'ph'), 'duplicate');
select t.refuses(format($$select public.write_setting('{"key":"department.packs","owner_id":"%s","data":{"packs":"pharmacy"}}')$$, :'ph'), 'bad_shape');

\echo '── department_uses: the core and the base always; a pack once ticked here, only here, only while the clinic has it on'
select t.ok(core.department_uses(:'org', :'ph', 'base') and core.department_uses(:'org', :'ph', 'core'), 'the base and the core everywhere');
select t.ok(not core.department_uses(:'org', :'ph', 'pharmacy'), 'pharmacy is on for the clinic, not yet ticked here');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select t.ok(core.department_uses(:'org', :'ph', 'pharmacy'), 'ticked: the pharmacy uses it');
select t.ok(d -> 'screens' = '["pharmacy.dispensing"]', 'ticked with no line set: the pack''s screen in place of the bench (one tick brings the tab)')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';
select t.ok(d -> 'screens' = '["base.bench"]', 'the lab, not ticked: the bench') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'lab';
select t.ok(not core.department_uses(:'org', :'lab', 'pharmacy'), 'the lab does not');
select t.ok(not core.department_uses(:'org', :'ph', 'spare'), 'a pack the clinic has off is used nowhere');
select t.ok(has_function_privilege('base_role', 'core.department_uses(uuid,uuid,text)', 'EXECUTE') and has_function_privilege('pack_pharmacy', 'core.department_uses(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'core.department_uses(uuid,uuid,text)', 'EXECUTE'), 'granted to the base and the packs, not to the API');

\echo '── the Screens line: each refusal'
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["base.nope"]}}')$$, :'ph'), 'unknown_screen');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["pharmacy.dispensing"]}}')$$, :'lab'), 'pack_not_used');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["spare.board"]}}')$$, :'lab'), 'pack_off');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["base.queue"]}}')$$, :'ph'), 'wrong_work');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["base.bench"]}}')$$, :'ward'), 'wrong_work');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["pharmacy.dispensing","base.bench"]}}')$$, :'ph'), 'replaced');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["base.bench","base.bench"]}}')$$, :'lab'), 'duplicate');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["base.bench"],"opens":"base.queue"}}')$$, :'lab'), 'opens_off_line');

\echo '── the Screens line: what lands'
select t.ok(public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'lab', 'data', '{"screens":["base.bench"],"opens":"base.bench"}'::jsonb)) ->> 'key' = 'department.screens', 'the lab: its bench');
select t.ok(public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'ph', 'data', '{"screens":["pharmacy.dispensing"],"opens":"pharmacy.dispensing"}'::jsonb)) ->> 'key' = 'department.screens',
  'the pharmacy: Dispensing alone, in place of the bench');
select t.ok(public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'ward', 'data', '{"screens":["base.beds"]}'::jsonb)) ->> 'key' = 'department.screens', 'the ward: its beds, no opens named');

\echo '── the directory: each department''s packs used here and its line; each screen''s action and what it replaces'
create temp table me as select public.read('{"shape":"me"}') as m;
select t.ok(d -> 'packs' = '["pharmacy"]' and d -> 'screens' = '["pharmacy.dispensing"]' and d ->> 'opens' = 'pharmacy.dispensing', 'the pharmacy: ' || (d - 'name')::text)
  from me, jsonb_array_elements(m -> 'departments') d where d ->> 'id' = :'ph';
select t.ok(d -> 'packs' = '[]' and d -> 'screens' = '["base.queue"]', 'a clinic with no line set: the base''s screen of its work')
  from me, jsonb_array_elements(m -> 'departments') d where d ->> 'id' = :'im';
select t.ok(s ->> 'action' = 'read:pharmacy.queue' and s -> 'replaces' = '["base.bench"]', 'the registry''s screens carry action and replaces')
  from me, jsonb_array_elements(m -> 'registry' -> 'screens') s where s ->> 'key' = 'pharmacy.dispensing';
select t.ok(s ->> 'layer' = 'spare' and s -> 'replaces' = '["base.bench"]', 'a screen of a pack that is off is listed with its layer (a line naming it shows what it stands in for)')
  from me, jsonb_array_elements(m -> 'registry' -> 'screens') s where s ->> 'key' = 'spare.board';

\echo '── the clinic turns the pack off: used nowhere, a line naming its screen refused, the tick kept for when it is on again'
select public.write_setting('{"key":"organization.packs_used","data":{"packs":[]}}') ->> 'key' as off;
select t.ok(not core.department_uses(:'org', :'ph', 'pharmacy'), 'off: the pharmacy no longer uses it');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["pharmacy.dispensing"]}}')$$, :'ph'), 'pack_off');
select t.refuses(format($$select public.write_setting('{"key":"department.packs","owner_id":"%s","data":{"packs":["pharmacy"]}}')$$, :'ph'), 'pack_off');
select t.ok(d -> 'packs' = '[]', 'the directory: no packs used there while off') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as on_again;
select t.ok(core.department_uses(:'org', :'ph', 'pharmacy'), 'on again: the tick holds');

\echo '── unticking keeps every entry: only the department''s use ends'
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":[]}'::jsonb)) ->> 'key' as unticked;
select t.ok(not core.department_uses(:'org', :'ph', 'pharmacy'), 'unticked: not used here');
select t.refuses(format($$select public.write_setting('{"key":"department.screens","owner_id":"%s","data":{"screens":["pharmacy.dispensing"]}}')$$, :'ph'), 'pack_not_used');
select t.as(null);
