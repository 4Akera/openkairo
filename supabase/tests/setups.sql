-- starter setups and the registry's guards (spec §5.2 "Setup and guards"): a layer declares a setup for a kind of department (its
-- places, services, presets, settings, the packs it ticks, its Screens line), checked once; one door runs it on a new department or an
-- existing one. On an existing department it adds only what is missing and never overwrites what staff changed: it answers the
-- difference and applies only the parts accepted. A thing's id comes from its key, never its place in the list; run twice, nothing
-- changes. The guards: a code system and a built-in role sit inside their layer (prefix, the pack's reserved block of role ids, never
-- another layer's key), and a demo seed row outside its layer's namespace is refused.
\set org  '00000000-0000-0000-0000-0000000000a1'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set new  '00000000-0000-0000-0000-0000000000e1'
\set new2 '00000000-0000-0000-0000-0000000000e2'
\set new3 '00000000-0000-0000-0000-0000000000e3'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set doc  '11111111-0000-0000-0000-0000000000b1'
select t.fixture(false);

-- the parts of a setup's answer as {part: state}, and a setup run as the owner
create or replace function t.states(r jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(x ->> 'part', x ->> 'state'), '{}') from jsonb_array_elements(r -> 'parts') x
$$;
create or replace function t.setup(p_setup text, p_dept uuid, p_apply jsonb default null, p_more jsonb default '{}') returns jsonb language sql as $$
  select public.setup(jsonb_build_object('setup', p_setup, 'department_id', p_dept) || coalesce(p_more, '{}')
    || case when p_apply is null then '{}'::jsonb else jsonb_build_object('apply', p_apply) end)
$$;
-- what a department holds now: its settings rows, places and audit rows (a run that adds nothing adds none of them)
create or replace function t.footprint(p_dept uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('settings', (select count(*) from core.settings s where s.organization_id = '00000000-0000-0000-0000-0000000000a1'
      and (s.owner_id = p_dept or s.data ->> 'department_id' = p_dept::text)),
    'places', (select count(*) from core.places p where p.department_id = p_dept),
    'audit', (select count(*) from core.audit a where a.organization_id = '00000000-0000-0000-0000-0000000000a1'))
$$;

\echo '── the base declares a Clinic, a Ward, a Laboratory and a Front desk; pharmacy declares its Pharmacy'
select t.ok((select array_agg(key order by key) from core.setups where layer = 'base') = array['clinic', 'front_desk', 'laboratory', 'ward'], 'the base''s four setups');
select t.ok(work = 'bench' and packs = array['pharmacy'] and screens -> 'screens' = '["pharmacy.dispensing","pharmacy.stock"]' and settings ? 'pharmacy.late_after'
  and not settings ? 'pharmacy.counselling' and jsonb_array_length(services) = 1, 'Pharmacy: ticks pharmacy, opens on Dispensing, its service and late_after (the counselling note is the clinic''s)')
  from core.setups where key = 'pharmacy.pharmacy';
select t.ok(jsonb_array_length(places) = 8 and settings -> 'department.encounter_class' = '{"class":"IMP"}', 'Ward: eight beds, inpatient stays') from core.setups where key = 'ward';
select t.as(:'ow');
select t.ok((select jsonb_agg(x ->> 'key' order by x ->> 'key') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'registry' -> 'setups') x)
  = '["clinic", "front_desk", "laboratory", "pharmacy.pharmacy", "ward"]', 'read me lists every setup of the layers on here');

\echo '── a declaration is checked once'
select core.declare_pack('spare', 1, '{}', '{"en":"Spare"}');
select t.refuses($$select core.declare_setup('pharmacy.x', 'base', 'visits', '{"en":"X"}')$$, 'outside_prefix');
select t.refuses($$select core.declare_setup('clinic2', 'pharmacy', 'visits', '{"en":"X"}')$$, 'outside_prefix');
select t.refuses($$select core.declare_setup('clinic', 'core', 'visits', '{"en":"X"}')$$, 'outside_prefix');
select t.refuses($$select core.declare_setup('x', 'base', 'outside', '{"en":"X"}')$$, 'wrong_work');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{}')$$, 'label_missing');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', packs => array['nosuch'])$$, 'unknown_pack');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', packs => array['pharmacy'])$$, 'other_pack');
select t.refuses($$select core.declare_setup('spare.x', 'spare', 'bench', '{"en":"X"}', packs => array['pharmacy'])$$, 'other_pack');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', settings => '{"department.nope":{}}')$$, 'unknown_setting');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', settings => '{"department.screens":{"screens":["base.queue"]}}')$$, 'not_a_setting');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', settings => '{"organization.record_view":{"view":"visits"}}')$$, 'wrong_owner');
select t.refuses($$select core.declare_setup('pharmacy.x', 'pharmacy', 'bench', '{"en":"X"}', settings => '{"pharmacy.counselling":{"show":false}}')$$, 'wrong_owner');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', settings => '{"service":{"code":"a","name":"A"}}')$$, 'wrong_owner');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', settings => '{"pharmacy.late_after":{"minutes":30}}')$$, 'other_pack');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', settings => '{"department.private":{"private":"yes"}}')$$, 'bad_shape');
select t.refuses($$select core.declare_setup('x', 'base', 'stays', '{"en":"X"}', places => '[{"key":"Bed 1","name":"Bed 1"}]')$$, 'bad_place');
select t.refuses($$select core.declare_setup('x', 'base', 'stays', '{"en":"X"}', places => '[{"key":"b1","name":"Bed 1","label":"sofa"}]')$$, 'bad_place');
select t.refuses($$select core.declare_setup('x', 'base', 'stays', '{"en":"X"}', places => '[{"key":"b1","name":"Bed 1"},{"key":"b2","name":"bed 1"}]')$$, 'duplicate');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', services => '[{"code":"a"}]')$$, 'bad_shape');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', services => '[{"code":"a","name":"A"},{"code":"A","name":"B"}]')$$, 'duplicate');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', presets => '[{"name":"A","lines":[]}]')$$, 'bad_preset');
select t.refuses(format($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', presets => '[{"name":"A","shortcut":"a","department_id":"%s"}]')$$, :'im'), 'bad_preset');
select t.refuses($$select core.declare_setup('x', 'base', 'visits', '{"en":"X"}', screens => '{"screens":["base.nope"]}')$$, 'unknown_screen');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', screens => '{"screens":["base.queue"]}')$$, 'wrong_work');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', screens => '{"screens":["pharmacy.dispensing"]}')$$, 'pack_not_used');
select t.refuses($$select core.declare_setup('pharmacy.x', 'pharmacy', 'bench', '{"en":"X"}', packs => array['pharmacy'], screens => '{"screens":["pharmacy.dispensing","base.bench"]}')$$, 'replaced');
select t.refuses($$select core.declare_setup('x', 'base', 'stays', '{"en":"X"}', screens => '{"screens":[]}')$$, 'bad_screens');
select t.refuses($$select core.declare_setup('x', 'base', 'bench', '{"en":"X"}', screens => '{"screens":["base.bench"],"opens":"base.queue"}')$$, 'opens_off_line');
select t.ok(not exists (select 1 from core.setups where key in ('x', 'clinic2', 'pharmacy.x', 'spare.x')), 'nothing refused was declared');

\echo '── a setup on a new department: asked first, nothing written; then made, with every part'
select t.ok(r -> 'exists' = 'false' and (select bool_and(v = '"add"') from jsonb_each(t.states(r) - 'screens') x(k, v)) and jsonb_array_length(r -> 'parts') = 2 + 8 + 1 + 1
  and t.states(r) ->> 'screens' = 'same', 'asked about a department not yet made: two settings, eight beds and a preset to add; its default line is the setup''s')
  from t.setup('ward', :'new') r;
select t.ok(not exists (select 1 from core.departments where id = :'new'), 'asking writes nothing');
select t.ok(r -> 'created' = 'true' and jsonb_array_length(r -> 'applied') = 11 and (select bool_and(v = '"same"') from jsonb_each(t.states(r)) x(k, v)),
  'made from the Ward setup: every part applied, and now each the same') from t.setup('ward', :'new', 'true', '{"name":"Surgical Ward","position":7}') r;
select t.ok(name = 'Surgical Ward' and work = 'stays' and position = 7, 'the department: its name, the setup''s work') from core.departments where id = :'new';
select t.ok((select count(*) from core.places where department_id = :'new' and retired_at is null) = 8
  and (select bool_and(id = core.setup_id(:'new', 'place', 'bed_' || substr(name, 5))) from core.places where department_id = :'new'),
  'eight beds, each id from its key (bed_n), never its position');
select t.ok(core.setting_at(:'org', 'department.encounter_class', :'new') = '{"class":"IMP"}' and core.setting_at(:'org', 'department.screens', :'new') is null
  and (select d -> 'screens' from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'new') = '["base.beds"]'
  and core.setting_at(:'org', 'department.setup', :'new') = '{"setup":"ward"}', 'its settings, its Screens line (the default, so none written), and the setup it was made from');
select t.ok(data ->> 'name' = 'Ward round' and data ->> 'department_id' = :'new', 'its preset, for this department, id from its shortcut')
  from core.settings where key = 'preset' and thing_id = core.setup_id(:'new', 'preset', 'round');
select t.ok(exists (select 1 from core.audit where action = 'setup' and thing_id = :'new' and after ->> 'setup' = 'ward' and jsonb_array_length(after -> 'applied') = 11)
  and exists (select 1 from core.audit where action = 'create' and what = 'place' and thing_id = core.setup_id(:'new', 'place', 'bed_1')),
  'audited: the setup run, and each thing as if staff had added it');

\echo '── run twice changes nothing'
select t.footprint(:'new') as before \gset
select t.ok(r -> 'applied' = '[]' and r -> 'created' = 'false', 'the second run adds nothing') from t.setup('ward', :'new', 'true') r;
select t.ok(t.footprint(:'new') = :'before'::jsonb, 'not a setting row, a place or an audit row more');

\echo '── ids come from the match fields: the same rows in another order name the same things'
select core.declare_setup('ward_turned', 'base', 'stays', '{"en":"Ward, listed the other way"}',
  places => (select jsonb_agg(jsonb_build_object('key', 'bed_' || n, 'name', 'Bed ' || n) order by n desc) from generate_series(1, 8) n),
  presets => '[{"name":"Ward round","shortcut":"round","lines":["Overnight:","Examination:","Plan:"]}]');
select t.ok((select bool_and(v = '"same"') from jsonb_each(t.states(r)) x(k, v)) and r -> 'applied' = '[]', 'listed backwards: every bed and the preset already there')
  from t.setup('ward_turned', :'new', 'true') r;
select t.ok(t.footprint(:'new') = :'before'::jsonb, 'nothing added');
select t.ok(core.setup_id(:'new', 'place', 'Bed_3') = core.setup_id(:'new', 'place', 'bed_3') and core.setup_id(:'new', 'place', 'bed_3') <> core.setup_id(:'new2', 'place', 'bed_3'),
  'an id is the department''s and the key''s (case aside)');

\echo '── a bed staff deleted differs and is never added again'
select public.remove('place', core.setup_id(:'new', 'place', 'bed_8')) ->> 'deleted' as bed_8_deleted;
select t.ok(x ->> 'state' = 'differs' and x -> 'have' ->> 'removed' = 'true' and x -> 'have' ->> 'name' = 'Bed 8', 'Bed 8, deleted by staff: differs, shown as removed')
  from jsonb_array_elements(t.setup('ward', :'new') -> 'parts') x where x ->> 'part' = 'place:bed_8';
select t.refuses(format($$select t.setup('ward', %L, '["place:bed_8"]')$$, :'new'), 'would_overwrite');
select t.ok(r -> 'applied' = '[]' and not exists (select 1 from core.places where id = core.setup_id(:'new', 'place', 'bed_8'))
  and (select count(*) from core.places where department_id = :'new') = 7, 'apply all: Bed 8 is not made again') from t.setup('ward', :'new', 'true') r;
-- staff's own bed (an id of its own) with a setup bed's name, deleted: found by its name in this department
select public.save('department', jsonb_build_object('id', :'new3', 'name', 'Short Stay', 'work', 'stays')) ->> 'id' as short_stay;
select gen_random_uuid() as own_bed \gset
select public.save('place', jsonb_build_object('id', :'own_bed', 'department_id', :'new3', 'label', 'bed', 'name', 'bed 2', 'position', 1)) ->> 'id' as own_bed_saved;
select public.remove('place', :'own_bed') ->> 'deleted' as own_bed_deleted;
select t.ok(t.states(t.setup('ward', :'new3')) ->> 'place:bed_2' = 'differs' and t.states(t.setup('ward', :'new3')) ->> 'place:bed_1' = 'add',
  'a bed of its own named Bed 2, deleted: Bed 2 differs; Bed 1 to add');
select t.ok(not (t.setup('ward', :'new3', 'true') -> 'applied') ? 'place:bed_2'
  and not exists (select 1 from core.places where department_id = :'new3' and lower(name) = 'bed 2'), 'apply all: no Bed 2 again');

\echo '── on an existing department staff changed: only what is missing is added; the rest is answered, never overwritten'
-- the fixture's ward: four beds of its own (ids of its own), Bed 4 retired since, inpatient changed to observation
select public.save('place', jsonb_build_object('id', '00000000-0000-0000-0000-000000000004', 'retired', true)) ->> 'id' as bed_4_retired;
select public.write_setting(jsonb_build_object('key', 'department.encounter_class', 'owner_id', :'ward', 'data', '{"class":"OBSENC"}'::jsonb)) ->> 'key' as obs;
select t.states(t.setup('ward', :'ward')) as ward_parts \gset
select t.ok((:'ward_parts'::jsonb) ->> 'place:bed_1' = 'same' and (:'ward_parts'::jsonb) ->> 'place:bed_3' = 'same', 'Beds 1–3 are the fixture''s own, matched by name');
select t.ok((:'ward_parts'::jsonb) ->> 'place:bed_4' = 'differs', 'Bed 4, retired by staff: differs (never added again)');
select t.ok((:'ward_parts'::jsonb) ->> 'place:bed_5' = 'add' and (:'ward_parts'::jsonb) ->> 'place:bed_8' = 'add', 'Beds 5–8 to add');
select t.ok((:'ward_parts'::jsonb) ->> 'setting:department.encounter_class' = 'differs' and (:'ward_parts'::jsonb) ->> 'setting:department.review_results' = 'add'
  and (:'ward_parts'::jsonb) ->> 'preset:round' = 'add' and (:'ward_parts'::jsonb) ->> 'screens' = 'same',
  'the kind of encounter staff set differs; review to add; the preset to add; the default line is the setup''s already');
select t.ok(x -> 'have' = '{"class":"OBSENC"}' and x -> 'want' = '{"class":"IMP"}', 'a difference shows what is here and what the setup has')
  from jsonb_array_elements(t.setup('ward', :'ward') -> 'parts') x where x ->> 'part' = 'setting:department.encounter_class';
select t.refuses(format($$select t.setup('ward', %L, '["setting:department.encounter_class"]')$$, :'ward'), 'would_overwrite');
select t.refuses(format($$select t.setup('ward', %L, '["place:bed_4"]')$$, :'ward'), 'would_overwrite');
select t.refuses(format($$select t.setup('ward', %L, '["place:bed_99"]')$$, :'ward'), 'unknown_part');
select t.ok(r -> 'applied' = '["place:bed_5"]', 'only the part accepted: Bed 5') from t.setup('ward', :'ward', '["place:bed_5"]') r;
select t.ok((select count(*) from core.places where department_id = :'ward') = 5 and exists (select 1 from core.places where id = core.setup_id(:'ward', 'place', 'bed_5')),
  'one bed more, with its id from its key');
select t.ok(r -> 'applied' = '["setting:department.review_results", "place:bed_6", "place:bed_7", "place:bed_8", "preset:round"]', 'then every part missing')
  from t.setup('ward', :'ward', 'true') r;
select t.ok(core.setting_at(:'org', 'department.encounter_class', :'ward') = '{"class":"OBSENC"}'
  and (select retired_at is not null and name = 'Bed 4' from core.places where id = '00000000-0000-0000-0000-000000000004')
  and (select count(*) from core.places where department_id = :'ward' and name = 'Bed 4') = 1, 'what staff changed stays theirs: observation, Bed 4 retired, no second Bed 4');
select t.ok(core.setting_at(:'org', 'department.setup', :'ward') = '{"setup":"ward"}', 'the setup is kept for Compare');
select t.footprint(:'ward') as ward_before \gset
select t.ok(t.setup('ward', :'ward', 'true') -> 'applied' = '[]' and t.footprint(:'ward') = :'ward_before'::jsonb, 'and run again: nothing');

\echo '── a pack''s setup on the fixture''s pharmacy: it ticks the pack; its service is there already'
select t.states(t.setup('pharmacy.pharmacy', :'ph')) as ph_parts \gset
select t.ok((:'ph_parts'::jsonb) ->> 'pack:pharmacy' = 'add' and (:'ph_parts'::jsonb) ->> 'service:dispense' = 'same' and (:'ph_parts'::jsonb) ->> 'screens' = 'same'
  and (:'ph_parts'::jsonb) ->> 'setting:pharmacy.late_after' = 'add', 'the pack to tick, its late mark to add; the dispensing service and the line (once ticked) as they are');
select t.ok(r -> 'applied' = '["pack:pharmacy", "setting:department.works_for", "setting:pharmacy.late_after"]', 'applied in order: the pack first')
  from t.setup('pharmacy.pharmacy', :'ph', 'true') r;
select t.ok(core.department_uses(:'org', :'ph', 'pharmacy') and core.setting_at(:'org', 'pharmacy.late_after', :'ph') = '{"minutes":30}'
  and core.setting_at(:'org', 'department.screens', :'ph') is null, 'ticked: Dispensing is its line by default (no line written)');
select t.ok((select count(*) from core.settings_at(:'org', 'service') s where s.owner_id = :'ph') = 1, 'one dispensing service, the fixture''s');

\echo '── a pack staff unticked differs and is never ticked again'
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":[]}'::jsonb)) ->> 'key' as unticked;
select t.ok(x ->> 'state' = 'differs' and x -> 'have' -> 'packs' = '[]', 'unticked by staff: the tick differs (here none)')
  from jsonb_array_elements(t.setup('pharmacy.pharmacy', :'ph') -> 'parts') x where x ->> 'part' = 'pack:pharmacy';
select t.refuses(format($$select t.setup('pharmacy.pharmacy', %L, '["pack:pharmacy"]')$$, :'ph'), 'would_overwrite');
select t.ok(not (r -> 'applied') ? 'pack:pharmacy' and not core.department_uses(:'org', :'ph', 'pharmacy')
  and core.setting_at(:'org', 'department.packs', :'ph') = '{"packs":[]}', 'apply all: still unticked') from t.setup('pharmacy.pharmacy', :'ph', 'true') r;

\echo '── the lab: a service staff changed, a line of their own, whom it works for'
select core.declare_screen('base.worklist', 'base', 'bench', '{"en":"Worklist"}', 'read:bench');
select public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', :'lab', 'data', '{"screens":["base.bench","base.worklist"],"opens":"base.bench"}'::jsonb)) ->> 'key' as line;
select public.write_setting(jsonb_build_object('key', 'department.works_for', 'owner_id', :'lab', 'data', jsonb_build_object('departments', jsonb_build_array(:'im')))) ->> 'key' as works_for;
select t.states(t.setup('laboratory', :'lab')) as lab_parts \gset
select t.ok((:'lab_parts'::jsonb) ->> 'service:cbc' = 'differs' and (:'lab_parts'::jsonb) ->> 'service:hba1c' = 'add' and (:'lab_parts'::jsonb) ->> 'service:lithium' = 'add',
  'the fixture''s CBC (matched by its code) differs; HbA1c and lithium to add');
select t.ok((:'lab_parts'::jsonb) ->> 'screens' = 'differs' and (:'lab_parts'::jsonb) ->> 'setting:department.works_for' = 'differs', 'your Screens line differs; whom it works for too');
select t.ok(jsonb_array_length(r -> 'applied') = 4 and not r -> 'applied' ? 'screens' and not r -> 'applied' ? 'service:cbc', 'applied: the four services missing')
  from t.setup('laboratory', :'lab', 'true') r;
select t.ok(core.setting_at(:'org', 'department.screens', :'lab') -> 'screens' = '["base.bench", "base.worklist"]'
  and core.setting_at(:'org', 'department.works_for', :'lab') -> 'departments' = jsonb_build_array(:'im')
  and core.setting_at(:'org', 'service', '00000000-0000-0000-0000-0000000000c1') -> 'fields' -> 1 is null
  and not exists (select 1 from core.settings where thing_id = core.setup_id(:'lab', 'service', 'cbc')), 'the line, whom it works for and the CBC are staff''s still; no second CBC');
select t.ok((select count(*) from core.settings_at(:'org', 'service') s where s.owner_id = :'lab') = 6, 'the lab: its two services and the four added');
select t.refuses(format($$select t.setup('laboratory', %L, '["screens"]')$$, :'lab'), 'would_overwrite');

\echo '── a setup whose pack is off waits for the clinic; a setup only for its work; only for whoever manages places'
select core.declare_setup('spare.desk', 'spare', 'bench', '{"en":"Spare desk"}', packs => array['spare']);
select t.ok(x ->> 'state' = 'blocked' and x ->> 'why' = 'pack_off', 'the spare pack is off: its tick is blocked')
  from jsonb_array_elements(t.setup('spare.desk', :'lab') -> 'parts') x where x ->> 'part' = 'pack:spare';
select t.refuses(format($$select t.setup('spare.desk', %L, 'true')$$, :'lab'), 'pack_off');
select t.refuses(format($$select t.setup('ward', %L)$$, :'lab'), 'wrong_work');
select t.refuses(format($$select t.setup('nosuch', %L)$$, :'lab'), 'unknown_setup');
select t.refuses(format($$select t.setup('ward', %L, '"all"')$$, :'ward'), 'bad_request');
select t.as(:'doc');
select t.refuses(format($$select t.setup('clinic', %L, 'true', '{"name":"Mine"}')$$, :'new2'), 'not_allowed');
select t.as(:'ow');
select t.ok(not exists (select 1 from core.departments where id = :'new2'), 'nothing made');

\echo '── guards: a code system inside its layer, never another layer''s key'
select t.refuses($$select core.declare_system('pharmacy.gtin', 'base', 'code', 'https://www.gs1.org/gtin')$$, 'outside_prefix');
select t.refuses($$select core.declare_system('gtin', 'pharmacy', 'code', 'https://www.gs1.org/gtin')$$, 'outside_prefix');
select core.declare_system('pharmacy.gtin', 'pharmacy', 'code', 'https://www.gs1.org/gtin', labels => '{"en":"GTIN"}');
select t.refuses($$select core.declare_system('pharmacy.gtin', 'spare', 'code', 'https://example.org')$$, 'outside_prefix');
select t.refuses($$select core.declare_system('loinc', 'core', 'code', 'https://example.org')$$, 'outside_prefix');
select t.ok(uri = 'http://loinc.org' and layer = 'base', 'loinc stays the base''s, unchanged') from core.systems where key = 'loinc';

\echo '── guards: a built-in role inside its layer: its key''s prefix, its id in the layer''s block, never another''s key or id'
select t.ok((select role_block from core.layers where key = 'base') = 'c0' and (select role_block from core.layers where key = 'pharmacy') = 'ca'
  and (select role_block from core.layers where key = 'spare') = 'cb', 'blocks: the base c0, pharmacy ca, the next pack the next free (cb)');
select t.refuses($$select core.declare_pack('other', 1, '{}', '{}', role_block => 'ca')$$, 'block_taken');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000ca09', 'cashier', 'pharmacy', 'Cashier', '{}')$$, 'outside_prefix');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000cb09', 'pharmacy.cashier', 'pharmacy', 'Cashier', '{}')$$, 'outside_block');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000c0aa', 'pharmacy.cashier', 'pharmacy', 'Cashier', '{}')$$, 'outside_block');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000ca09', 'cashier', 'base', 'Cashier', '{}')$$, 'outside_block');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000ca09', 'pharmacy.pharmacist', 'pharmacy', 'Second pharmacist', '{}')$$, 'key_taken');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000c009', 'doctor', 'base', 'Doctor again', '{}')$$, 'key_taken');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000ca01', 'spare.pharmacist', 'spare', 'Mine now', '{}')$$, 'other_layers_role');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000cb01', 'spare.x', 'core', 'X', '{}')$$, 'outside_prefix');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-000000000c01', 'clerk', 'core', 'Clerk', '{}')$$, 'no_role_block');
select t.ok(name = 'Pharmacist' and key = 'pharmacy.pharmacist' and layer = 'pharmacy', 'the pharmacist is never taken over') from core.roles where id = '00000000-0000-0000-0000-00000000ca01';
select core.declare_role('00000000-0000-0000-0000-00000000cb01', 'spare.clerk', 'spare', 'Clerk', array['read:patients'], '{"en":"Clerk"}');
select t.ok(exists (select 1 from core.roles where id = '00000000-0000-0000-0000-00000000cb01' and key = 'spare.clerk'), 'a role in its block with its prefix is declared');
select t.ok(not exists (select 1 from core.roles r join core.layers l on l.key = r.layer where r.organization_id is null
    and (r.id::text !~ ('^00000000-0000-0000-0000-00000000' || l.role_block || '[0-9a-f]{2}$') or (l.is_pack and position(l.key || '.' in r.key) <> 1))),
  'every built-in role sits in its layer''s block and prefix');

\echo '── guards: a demo seed row outside its layer''s namespace is refused'
select demo.layer('pharmacy');
select t.refuses($$select demo.department(demo.base('lab'), 'Lab', 'bench', 5)$$, 'outside_namespace');
select t.refuses($$select demo.place(demo.id('base', 'shelf'), demo.id('pharmacy', 'department'), 'room', 'Shelf', 1)$$, 'outside_namespace');
select t.refuses($$select demo.setting('service', demo.id('pharmacy', 'department'), demo.id('obgyn', 'service:x'), '{"code":"x","name":"X"}')$$, 'outside_namespace');
select t.refuses($$select demo.patient(gen_random_uuid(), array['No'], 'One', 'male', demo.born(30))$$, 'outside_namespace');
select demo.setup(demo.id('pharmacy', 'department'), 'pharmacy.pharmacy', 'Pharmacy', 6);
select t.ok(true, 'its own department, through its setup, passes');
select demo.layer('base');
select t.refuses($$select demo.department(demo.id('pharmacy', 'department'), 'Pharmacy', 'bench', 6)$$, 'outside_namespace');
select t.refuses($$select demo.person(demo.id('pharmacy', 'pharmacist'), 'pharm@demo.com', 'Dr. Reem Hamdy')$$, 'outside_namespace');
select t.ok((select layer from demo.ids where id = demo.id('pharmacy', 'department')) = 'pharmacy', 'every id the kit gives is kept with its layer');
