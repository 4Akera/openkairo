-- every setting editable in the app (spec §3.4, §3.8, §5.1 rule 7): a setting declares what its automatic form needs (each field's words,
-- its unit, the order, where the form shows), checked once at declaration; read 'me' sends it with the shape; a refusal names its field;
-- the change history reads by setting; the licensed lists loaded here read with their version, source and licence. Proven on pharmacy.
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set own  '00000000-0000-0000-0000-0000000000b9'
\set doc  '11111111-0000-0000-0000-0000000000b1'
\set pml  '11111111-0000-0000-0000-0000000000b6'
select t.fixture(false);

-- a refusal's field: the hint core.refuse_at raises, as the client reads it
create or replace function t.field_of(sql text) returns text language plpgsql as $$
declare c text; h text;
begin
  execute sql;
  return 'landed';
exception when others then
  get stacked diagnostics c = message_text, h = pg_exception_hint;
  return c || ' @ ' || coalesce(nullif(h, ''), '-');
end $$;

\echo '── pharmacy''s settings declare their forms: the words for each field, a unit, the order, where the form shows'
select t.ok(k.form = 'department' and k.owner_kind = 'department' and k.fields -> 0 ->> 'key' = 'minutes' and k.fields -> 0 ->> 'unit' = 'min'
  and k.fields -> 0 -> 'labels' ->> 'en' <> '' and k.fields -> 0 -> 'help' ->> 'en' <> '', 'late_after: on the department''s card, minutes with its words and unit')
  from core.setting_keys k where k.key = 'pharmacy.late_after';
select t.ok(k.form = 'pack' and k.owner_kind = 'organization' and (select array_agg(f ->> 'key' order by n) from jsonb_array_elements(k.fields) with ordinality x(f, n)) = array['show', 'note'],
  'counselling: on the pack''s page, its fields in order (show, then note)') from core.setting_keys k where k.key = 'pharmacy.counselling';
select t.ok(not exists (select 1 from core.setting_keys k where k.layer in ('core', 'base') and k.form is not null), 'the core''s and the base''s keep their own editors (no form)');
select t.ok((select array_agg(path order by path) from core.shape_nodes((select shape from core.setting_keys where key = 'pharmacy.counselling'))) = array['note', 'show'],
  'the nodes a form draws: each property by its path');

\echo '── a declaration is checked once: a field names a node, once, with its words; a unit on a number; choices of its enum; the form''s place'
select core.declare_pack('probe', 1, '{}', '{"en":"Probe"}');
select core.create_pack('probe');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'department', fields => '[{"key":"b","labels":{"en":"B"}}]')$$, 'unknown_field');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'department', fields => '[{"key":"a","labels":{}}]')$$, 'label_missing');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"string"}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"unit":"min"}]')$$, 'unit_not_number');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"enum":["x","y"]}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"choices":{"z":{"en":"Z"}}}]')$$, 'unknown_choice');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"}},{"key":"a","labels":{"en":"A again"}}]')$$, 'duplicate');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"object","properties":{"c":{"type":"string"}}}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"}},{"key":"b","labels":{"en":"B"}}]')$$, 'field_unlabelled');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'organization', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"}}]')$$, 'wrong_owner');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'pack', fields => '[{"key":"a","labels":{"en":"A"}}]')$$, 'wrong_owner');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}', many => true,
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"}}]')$$, 'form_many');
select t.refuses($$select core.declare_setting('base.x', 'base', 'organization', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'pack', fields => '[{"key":"a","labels":{"en":"A"}}]')$$, 'not_a_pack');
select t.refuses($$select core.declare_setting('base.x', 'base', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"}}]')$$, 'not_a_pack');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"array","items":{"type":"string"}}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"unit":"mg"}]')$$, 'unit_not_number');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"array","items":{"enum":["mg","mL"]}}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"choices":{"g":{"en":"Grams"}}}]')$$, 'unknown_choice');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"enum":[1,2]}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"choices":{"3":{"en":"Three"}}}]')$$, 'unknown_choice');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"integer"}}}', fields => '{"a":1}')$$, 'bad_fields');
select t.refuses($$select core.declare_setting('probe.x', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"boolean"}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"later":true}]')$$, 'bad_fields');   -- a placeholder holds its value by a const
select core.declare_setting('probe.y', 'probe', 'department', '{"type":"object","properties":{"a":{"type":"boolean","const":false}}}',
  form => 'department', fields => '[{"key":"a","labels":{"en":"A"},"later":true}]');
select t.ok(exists (select 1 from core.setting_keys k where k.key = 'probe.y' and k.fields -> 0 -> 'later' = 'true'), 'a placeholder (later) with its const is declared');

\echo '── the probe: one setting with every kind of field (a choice, a number with its unit, text, yes/no, a small table, a list, a sub-section)'
select core.declare_setting('probe.everything', 'probe', 'organization', '{"type":"object","additionalProperties":false,"required":["scale"],"properties":{
    "scale":{"enum":["news2","pews"]},"wait":{"type":"integer","minimum":0,"maximum":120},"greeting":{"type":"string","maxLength":40},"strict":{"type":"boolean"},
    "rows":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["drug"],"properties":{"drug":{"type":"string","minLength":1},"dose":{"type":"number","minimum":0}}}},
    "tags":{"type":"array","items":{"type":"string"}},
    "units":{"type":"array","items":{"enum":["mg","mL"]}},"doses":{"type":"array","items":{"type":"number"}},"level":{"enum":[1,2,3]},
    "contact":{"type":"object","additionalProperties":false,"properties":{"name":{"type":"string"},"phone":{"type":"string","pattern":"^[+0-9 ]+$"}}}}}',
  labels => '{"en":"Everything"}', form => 'pack', fields => '[
    {"key":"scale","labels":{"en":"Scale"},"choices":{"news2":{"en":"NEWS2"},"pews":{"en":"PEWS"}}},{"key":"wait","labels":{"en":"Wait"},"unit":"min"},
    {"key":"greeting","labels":{"en":"Greeting"}},{"key":"strict","labels":{"en":"Strict"}},
    {"key":"rows","labels":{"en":"Rows"}},{"key":"rows.drug","labels":{"en":"Drug"}},{"key":"rows.dose","labels":{"en":"Dose"},"unit":"mg"},
    {"key":"tags","labels":{"en":"Tags"}},{"key":"contact","labels":{"en":"Contact"}},{"key":"contact.name","labels":{"en":"Name"}},{"key":"contact.phone","labels":{"en":"Phone"}},
    {"key":"units","labels":{"en":"Units"},"choices":{"mg":{"en":"Milligrams"},"mL":{"en":"Millilitres"}}},{"key":"doses","labels":{"en":"Doses"},"unit":"mg"},
    {"key":"level","labels":{"en":"Level"},"choices":{"1":{"en":"Low"},"2":{"en":"Medium"},"3":{"en":"High"}}}]');
select t.ok(jsonb_array_length(fields) = 14 and form = 'pack', 'declared: fourteen fields, every node with its words (a list of choices with its words, a list of numbers with its unit, a numeric choice with words)')
  from core.setting_keys where key = 'probe.everything';
select core.declare_setting('probe.local', 'probe', 'organization', '{"type":"object","$defs":{"band":{"type":"object","properties":{"lo":{"type":"integer"}}}},
  "properties":{"b":{"$ref":"#/$defs/band"}}}', labels => '{"en":"Local"}');

\echo '── read ''me'' sends each key''s shape (the datatypes once), its fields and where its form shows; and who changed each setting last'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select t.ok(k ->> 'form' = 'department' and k -> 'fields' -> 0 ->> 'unit' = 'min' and k -> 'shape' -> 'properties' -> 'minutes' ->> 'maximum' = '1440' and not (k -> 'shape' ? '$defs'),
  'a key: its shape without the datatypes, its fields, its form') from (select k from jsonb_array_elements(public.read('{"shape":"me"}') -> 'registry' -> 'setting_keys') k) x
  where k ->> 'key' = 'pharmacy.late_after';
select t.ok(public.read('{"shape":"me"}') -> 'registry' -> 'datatypes' ? 'quantity', 'the datatypes, once');
select t.ok(k -> 'shape' -> '$defs' ? 'band' and not (k -> 'shape' -> '$defs' ? 'quantity'), 'a key''s own $defs come with its shape (the datatypes do not)')
  from (select k from jsonb_array_elements(public.read('{"shape":"me"}') -> 'registry' -> 'setting_keys') k) x where k ->> 'key' = 'probe.local';

\echo '── a refusal names its field: the shape''s (core.shape_field) and a check''s (its finding''s field)'
select t.ok(t.field_of(format($$select public.write_setting('{"key":"pharmacy.late_after","owner_id":"%s","data":{"minutes":2}}')$$, :'ph')) = 'bad_shape @ minutes',
  'two minutes is under the least: bad_shape at minutes');
select t.ok(t.field_of(format($$select public.write_setting('{"key":"pharmacy.late_after","owner_id":"%s","data":{}}')$$, :'ph')) = 'bad_shape @ minutes', 'missing: at minutes');
select t.ok(t.field_of($$select public.write_setting('{"key":"pharmacy.counselling","data":{"show":true,"note":"  "}}')$$) = 'note_missing @ note',
  'shown with no words: the pharmacy''s check refuses note_missing at note');
select t.ok(t.field_of($$select public.write_setting('{"key":"pharmacy.counselling","data":{"show":"yes"}}')$$) = 'bad_shape @ show', 'a yes/no that is not one: at show');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as probe_on;
select t.ok(t.field_of($$select public.write_setting('{"key":"probe.everything","data":{"scale":"news2","rows":[{"drug":"a","dose":1},{"drug":"b","dose":-1}]}}')$$) = 'bad_shape @ rows.1.dose',
  'a small table: the row and its column (rows.1.dose)');
select t.ok(t.field_of($$select public.write_setting('{"key":"probe.everything","data":{"scale":"news2","contact":{"phone":"call me"}}}')$$) = 'bad_shape @ contact.phone',
  'a sub-section: contact.phone');
select t.ok(t.field_of($$select public.write_setting('{"key":"probe.everything","data":{"scale":"other"}}')$$) = 'bad_shape @ scale', 'a choice not offered: at scale');
select t.ok(t.field_of($$select public.write_setting('{"key":"probe.everything","data":{"scale":"pews","extra":1}}')$$) = 'bad_shape @ extra', 'a key the shape does not name');
select t.ok(t.field_of($$select public.write_setting('{"key":"probe.everything","data":{"scale":"pews","wait":30,"greeting":"Hi","strict":true,"rows":[{"drug":"a","dose":2.5}],
  "tags":["x","y"],"units":["mL"],"doses":[2.5],"level":3,"contact":{"name":"Desk","phone":"+20 100"}}}')$$) = 'landed', 'every kind, as the form sends it: lands');
select t.ok(t.field_of(format($$select public.save('department', '{"id":"%s","name":"Lab"}')$$, :'lab')) = 'landed', 'a refusal of another door names no field (and this one lands)');

\echo '── who may: an organization''s needs manage:settings everywhere, a department''s needs it there; a pack off takes no change'
select public.write_setting(jsonb_build_object('key', 'pharmacy.late_after', 'owner_id', :'ph', 'data', '{"minutes":45}'::jsonb)) ->> 'key' as late_set;
select public.write_setting('{"key":"pharmacy.counselling","data":{"show":true,"note":"Take with food."}}') ->> 'key' as counselling_set;
select t.as(:'pml');
select t.refuses(format($$select public.write_setting('{"key":"pharmacy.late_after","owner_id":"%s","data":{"minutes":20}}')$$, :'ph'), 'not_allowed');
select t.refuses($$select public.write_setting('{"key":"pharmacy.counselling","data":{"show":false}}')$$, 'not_allowed');
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["probe"]}}') ->> 'key' as pharmacy_off;
select t.refuses(format($$select public.write_setting('{"key":"pharmacy.late_after","owner_id":"%s","data":{"minutes":20}}')$$, :'ph'), 'pack_off');
select t.ok(s ->> 'author_id' = :'own' and (s ->> 'recorded_at') is not null and s -> 'data' ->> 'minutes' = '45', 'read me: the value as saved, who saved it and when (kept while the pack is off)')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'key' = 'pharmacy.late_after';
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as pharmacy_on;
select public.write_setting(jsonb_build_object('key', 'pharmacy.late_after', 'owner_id', :'ph', 'data', '{"minutes":60}'::jsonb)) ->> 'key' as late_again;

\echo '── the history: the audit read by setting, newest first, each with who, when, before and after'
select t.ok(jsonb_array_length(c) = 2 and c -> 0 -> 'after' ->> 'minutes' = '60' and c -> 0 -> 'before' ->> 'minutes' = '45' and c -> 1 -> 'after' ->> 'minutes' = '45'
  and c -> 1 ->> 'action' = 'create' and c -> 0 ->> 'user_id' = :'own', 'late_after in the pharmacy: two changes, the earlier value kept')
  from (select public.read(jsonb_build_object('shape', 'audit', 'what', 'setting:pharmacy.late_after', 'thing_id', :'ph')) -> 'changes' c) x;
select t.ok(not exists (select 1 from jsonb_array_elements(public.read(jsonb_build_object('shape', 'audit', 'what', 'setting:pharmacy.late_after', 'thing_id', :'ph')) -> 'changes') c
  where c ->> 'what' <> 'setting:pharmacy.late_after'), 'only that setting: the department''s other settings stay out');
select t.ok(jsonb_array_length(public.read(jsonb_build_object('shape', 'audit', 'what', 'setting:pharmacy.counselling', 'thing_id', :'org')) -> 'changes') = 1, 'the clinic''s counselling: one change');

\echo '── the licensed lists loaded here: each with its version, source, licence note and when; the demo''s marked a sample'
select t.ok(l ->> 'version' = '2019' and (l ->> 'sample')::boolean and l ->> 'licence' like 'WHO ICD-10%' and l ->> 'source' like 'openCare demo%' and (l ->> 'codes')::int > 0
  and l ->> 'loaded_at' is not null and l -> 'labels' ->> 'en' = 'ICD-10 (WHO)', 'ICD-10: the demo sample, version 2019, WHO''s licence note')
  from jsonb_array_elements(public.read('{"shape":"reference"}') -> 'lists') l where l ->> 'system' = 'icd10';
select t.ok((select count(*) from jsonb_array_elements(public.read('{"shape":"reference"}') -> 'lists')) = 2, 'two lists loaded: ICD-10 and ATC');
select t.refuses($$select core.record_import('nowhere', null, 'x.csv')$$, 'unknown_system');
select t.refuses($$select core.record_import('atc', null, ' ')$$, 'source_missing');
insert into core.codes (system, code, labels) values ('atc', 'Z99ZZ99', '{"en":"Probe drug"}');
select core.record_import('atc', '2026', 'atc-2026.csv');
select t.ok(l ->> 'version' = '2026' and not (l ->> 'sample')::boolean and l ->> 'source' = 'atc-2026.csv' and (l ->> 'loads')::int = 2,
  'a full import later: the latest load shows, no longer a sample') from jsonb_array_elements(public.read('{"shape":"reference"}') -> 'lists') l where l ->> 'system' = 'atc';
select t.as(:'doc');
select t.ok(jsonb_array_length(public.read('{"shape":"reference"}') -> 'lists') = 2, 'any signed-in user reads the lists (reference data, no patient)');
select t.as(null);
select t.refuses($$select public.read('{"shape":"reference"}')$$, 'not_signed_in');
select t.ok(not has_table_privilege('authenticated', 'core.code_imports', 'SELECT,INSERT') and not has_function_privilege('authenticated', 'core.record_import(text,text,text,boolean)', 'EXECUTE'),
  'the API holds neither the table nor the recorder');
