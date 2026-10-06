-- roles (spec §3.1, §5.2): a pack's actions count only in departments that tick the pack; a specialist role is built on a base role and
-- holds what that role holds as it stands now, plus its own; a pack's everyday actions go to the base's Doctor and Nurse where a
-- department ticks the pack, and only those; actions are added one at a time, never by replacing a list. A probe pack shows each.
\set org  '00000000-0000-0000-0000-0000000000a1'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set ali  '00000000-0000-0000-0000-0000000000b1'
\set sara '00000000-0000-0000-0000-0000000000b3'
\set rcp  '00000000-0000-0000-0000-0000000000b4'
\set pm   '00000000-0000-0000-0000-0000000000b6'
\set own  '00000000-0000-0000-0000-0000000000b9'
\set spec '00000000-0000-0000-0000-0000000000bc'
\set doctor '00000000-0000-0000-0000-00000000c002'
\set specialist '00000000-0000-0000-0000-00000000cb01'
select t.fixture(false);

\echo '── pharmacy''s actions count only where a department ticks pharmacy'
select t.ok(not core.may(:'pm', 'write:pharmacy.dispense', :'ph') and not core.may_somewhere(:'pm', 'read:pharmacy.queue'), 'the pharmacy has not ticked it: the pharmacist holds none of its actions');
select t.ok(core.may(:'pm', 'write:note', :'ph') and core.may(:'pm', 'read:bench', :'ph'), 'and keeps the base''s');
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as ticked;
select t.ok(core.may(:'pm', 'write:pharmacy.dispense', :'ph') and core.may_somewhere(:'pm', 'read:pharmacy.queue'), 'ticked: the pharmacist dispenses there');
select t.ok(core.may(:'own', 'write:pharmacy.dispense', :'ph') and not core.may(:'own', 'write:pharmacy.dispense', :'lab') and not core.may(:'own', 'write:pharmacy.dispense', null),
  'the owner holds it there, and nowhere else');
select t.ok(not core.may(:'ali', 'read:pharmacy.queue', :'ph') and not core.may_somewhere(:'ali', 'write:pharmacy.dispense'), 'a doctor holds none of pharmacy''s (none is everyday)');
select t.ok(jsonb_array_length(d) > 0 and not (d ? 'write:pharmacy.dispense'), 'read me: no pack action where it does not count')
  from (select (public.read('{"shape":"me"}') -> 'me' -> 'may' -> (:'lab')) d) x;
select t.ok((public.read('{"shape":"me"}') -> 'me' -> 'may' -> (:'ph')) ? 'write:pharmacy.dispense', 'read me: the owner''s rights in the pharmacy name it');

\echo '── the probe pack: an everyday action, an action of its own, a specialist built on Doctor'
select core.declare_pack('probe', 1, '{}', '{"en":"Probe"}');
select core.create_pack('probe');
select core.declare_action('write:probe.visit', 'probe', everyday => true, labels => '{"en":"Probe visit"}');
select core.declare_action('read:probe.chart', 'probe', labels => '{"en":"Probe chart"}');
select core.declare_role(:'specialist', 'probe.specialist', 'probe', 'Probe specialist', array['read:probe.chart'], '{"en":"Probe specialist"}', built_on => :'doctor');
select t.refuses($$select core.declare_action('write:later_everyday', 'base', everyday => true)$$, 'everyday_for_packs');
select t.refuses($$select core.declare_action('read:probe.wide', 'probe', scope => 'organization', everyday => true)$$, 'everyday_for_department');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000cb02', 'probe.x', 'probe', 'X', '{}', built_on => '00000000-0000-0000-0000-00000000ca01')$$, 'unknown_role');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000cb03', 'probe.y', 'probe', 'Y', '{}', everyday => true)$$, 'everyday_for_base');
select t.refuses($$select core.declare_role_action('probe', '00000000-0000-0000-0000-00000000c002', 'read:probe.chart')$$, 'other_layers_role');
select t.refuses($$select core.declare_role('00000000-0000-0000-0000-00000000c002', 'doctor', 'probe', 'Doctor', '{}')$$, 'other_layers_role');
select t.refuses($$select core.declare_role_action('probe', '00000000-0000-0000-0000-00000000cb01', 'write:pharmacy.dispense')$$, 'unknown_action');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["probe"]}'::jsonb)) ->> 'key' as ticked;
select public.save('user', jsonb_build_object('id', :'spec', 'name', 'Dr Spec', 'login_id', '11111111-0000-0000-0000-0000000000bc', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', :'specialist', 'department_id', :'im'), jsonb_build_object('role_id', :'specialist', 'department_id', :'ward')))) ->> 'id' as specialist_given;

\echo '── built on Doctor: everything a Doctor holds, plus its own'
select t.ok(core.may(:'spec', 'read:record', :'im') and core.may(:'spec', 'write:medication', :'im') and core.may(:'spec', 'read:probe.chart', :'im'), 'the specialist: Doctor''s actions and its own');
select t.ok(not core.may(:'spec', 'read:probe.chart', :'ward') and core.may(:'spec', 'write:medication', :'ward'), 'its pack''s action only where the pack is ticked; Doctor''s everywhere it is held');
select t.ok(:'spec' in (select core.holders_in(:'org', 'read:record', :'im')), 'it reads the department''s private items as a Doctor there would');
select t.ok(not core.may(:'spec', 'read:later', :'im'), 'not yet: an action the base has not declared');
select core.declare_action('read:later', 'base', labels => '{"en":"Later"}');
select core.declare_role_action('base', :'doctor', 'read:later');
select t.ok(core.may(:'spec', 'read:later', :'im') and core.may(:'ali', 'read:later', :'im'), 'Doctor gains an action later: the specialist gains it too');
select core.declare_role(:'specialist', 'probe.specialist', 'probe', 'Probe specialist', array['write:probe.visit'], '{"en":"Probe specialist"}', built_on => :'doctor');
select t.ok(core.may(:'spec', 'read:probe.chart', :'im') and exists (select 1 from core.role_actions where role_id = :'specialist' and action = 'write:probe.visit'),
  'declared again with one more action: added, nothing replaced');
select t.ok(r ->> 'built_on' = :'doctor' and r -> 'own' = '["read:probe.chart", "write:probe.visit"]' and r -> 'actions' ? 'read:record' and r -> 'actions' ? 'read:later',
  'read me: the role names what it is built on, its own actions, and all it gives') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'roles') r where r ->> 'id' = :'specialist';

\echo '── everyday: a GP Doctor and a Nurse hold the pack''s everyday action where the department ticks it, and only there'
select t.ok(core.may(:'ali', 'write:probe.visit', :'im') and core.may(:'sara', 'write:probe.visit', :'im'), 'Internal Medicine ticks probe: Doctor and Nurse hold it there');
select t.ok(not core.may(:'ali', 'write:probe.visit', :'ward') and not core.may(:'sara', 'write:probe.visit', :'ward'), 'the ward does not: nowhere else');
select t.ok(not core.may(:'ali', 'read:probe.chart', :'im'), 'a non-everyday action stays the specialist''s');
select t.ok(not core.may(:'rcp', 'write:probe.visit', :'desk') and not core.may(:'pm', 'write:probe.visit', :'ph'), 'plain roles hold none');
select t.ok(r -> 'everyday' = 'true', 'read me: Doctor is everyday') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'roles') r where r ->> 'id' = :'doctor';
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.ok((m -> (:'im')) ? 'write:probe.visit' and not ((m -> (:'ward')) ? 'write:probe.visit') and (m -> (:'ward')) ? 'write:note',
  'read me: Dr Ali''s rights per department') from (select public.read('{"shape":"me"}') -> 'me' -> 'may' m) x;

\echo '── unticked, then off: the pack''s actions stop; the base''s stay'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":[]}'::jsonb)) ->> 'key' as unticked;
select t.ok(not core.may(:'ali', 'write:probe.visit', :'im') and not core.may(:'spec', 'read:probe.chart', :'im') and core.may(:'spec', 'read:record', :'im'),
  'unticked: no everyday action, no pack action; Doctor''s stay');
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'im', 'data', '{"packs":["probe"]}'::jsonb)) ->> 'key' as ticked_again;
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.ok(not core.may(:'ali', 'write:probe.visit', :'im') and not core.may(:'spec', 'read:probe.chart', :'im') and not core.may_somewhere(:'own', 'read:probe.chart'),
  'off for the clinic: nobody holds its actions, the owner included');
select t.ok(core.may(:'spec', 'write:medication', :'im'), 'the specialist keeps Doctor''s');
select t.as(null);
