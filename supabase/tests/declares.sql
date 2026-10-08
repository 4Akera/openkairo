-- a pack declares that it charges (spec §5.4, core change (d), owner 2026-10-08): an option of core.declare_pack, kept with the pack;
-- the department read (read 'me') carries each pack a department uses with what that pack declares, so a screen asks "does a pack
-- used here charge" without naming one. Only packs used there (ticked and on for the clinic) are listed; declared again, it says so again.
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set lab  '00000000-0000-0000-0000-0000000000d2'
\set ph   '00000000-0000-0000-0000-0000000000d3'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set dr   '11111111-0000-0000-0000-0000000000b1'
select t.fixture(false);

\echo '── the declaration: off unless a pack says so; the shipped packs charge for nothing'
select t.ok(not charges, 'pharmacy declares no charging') from core.layers where key = 'pharmacy';
select t.ok(not charges, 'the laboratory declares no charging') from core.layers where key = 'lis';
select core.declare_pack('till', 1, '{}', '{"en":"Till fixture"}', charges => true);
select core.declare_pack('quiet', 1, '{}', '{"en":"Quiet fixture"}');
select t.ok(charges, 'a pack declared with charges keeps it') from core.layers where key = 'till';
select t.ok(not charges, 'a pack declared without it does not charge') from core.layers where key = 'quiet';
select t.ok(not has_table_privilege('authenticated', 'core.layers', 'SELECT,INSERT,UPDATE,DELETE'), 'the API reads the declaration only through read me');

\echo '── the department read: each pack used here with what it declares, and nothing for a pack not used here'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","till","quiet"]}}') ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy","till"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'lab', 'data', '{"packs":["quiet"]}'::jsonb)) ->> 'key' as ticked;
select t.ok(d -> 'declared' = '{"pharmacy":{"charges":false},"till":{"charges":true}}', 'the pharmacy: the pharmacy, and the till that charges')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';
select t.ok(d -> 'declared' = '{"quiet":{"charges":false}}', 'the lab: only the pack it uses, which charges for nothing')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'lab';
select t.ok(d -> 'declared' = '{}', 'a department using no pack declares nothing') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'im';
select t.ok(d -> 'packs' = '["pharmacy","till"]', 'the packs used here stay a plain list') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';
-- read as a doctor too: the directory is everyone's
select t.as(:'dr');
select t.ok(d -> 'declared' -> 'till' ->> 'charges' = 'true', 'any user reads it with the directory') from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';

\echo '── off for the clinic, or unticked: gone at once from the department read'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","quiet"]}}') ->> 'key' as off;
select t.ok(d -> 'declared' = '{"pharmacy":{"charges":false}}', 'the till is off for the clinic: no longer listed where it was ticked')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","till","quiet"]}}') ->> 'key' as on_again;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ph', 'data', '{"packs":["pharmacy"]}'::jsonb)) ->> 'key' as unticked;
select t.ok(d -> 'declared' = '{"pharmacy":{"charges":false}}', 'unticked here: not listed')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'ph';

\echo '── declared again: the declaration as it is now'
select core.declare_pack('till', 1, '{}', '{"en":"Till fixture"}');
select t.ok(not charges, 'declared again without charges: it charges no more') from core.layers where key = 'till';
select core.declare_pack('quiet', 2, '{}', '{"en":"Quiet fixture"}', charges => true);
select t.ok(charges and version = 2, 'declared again with charges: it charges') from core.layers where key = 'quiet';
select t.ok(d -> 'declared' = '{"quiet":{"charges":true}}', 'and the department read follows it')
  from jsonb_array_elements(public.read('{"shape":"me"}') -> 'departments') d where d ->> 'id' = :'lab';
