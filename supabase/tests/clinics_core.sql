-- the clinics' core change that needs SQL (spec/openCare.md §5.7, the owner 2026-10-08, Q36; core change C3): a pack's type extending a
-- base type, declared served, is written with the base type's action (write:given) where its pack serves the department — it uses the
-- pack, or a department using it works for this one (a nurse in a ward that does not tick the pack, the Blood bank working for it) — and
-- its pack's check refuses it `not_served` elsewhere. Proven with a probe pack: Lab (d2) uses it and works for Internal Medicine only.
\set im '00000000-0000-0000-0000-0000000000d1'
\set lab '00000000-0000-0000-0000-0000000000d2'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set pt '00000000-0000-0000-0000-0000000000f1'
select t.fixture();

select core.declare_pack('probeserve', 1, '{}', '{"en":"Probe served"}');
select core.create_pack('probeserve');
set role pack_probeserve;
create function probeserve.line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select 'Transfused' $$;
-- its own check: written only where the pack serves the department
create function probeserve.check(p_entry jsonb, p_set jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when core.pack_serves((p_entry ->> 'organization_id')::uuid, (p_entry ->> 'department_id')::uuid, 'probeserve') then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object('code', 'not_served', 'level', 'refuse')) end
$$;
reset role;
select core.declare_type('probeserve.given', 1, 'probeserve',
  jsonb_set((select t.shape from core.types t where t.key = 'given' order by t.version desc limit 1), '{properties,probeserve}', '{"type":"object","properties":{"units":{"type":"integer"}}}'),
  'probeserve.line(jsonb)', array['MedicationAdministration'], base_type => 'given', checks => array['probeserve.check(jsonb,jsonb)']::regprocedure[]);
select core.declare_served('probeserve.given');
select core.lock_pack('probeserve');

\echo '── declared served: written with its base type''s action'
select t.ok(core.write_action('probeserve.given') = 'write:given', 'a served type is written with write:given');
select t.ok(core.write_action('given') = 'write:given' and core.write_action('note') = 'write:note', 'the base''s own types as before');
select t.ok(core.write_action('radiology.request') = 'write:order', 'a pack''s order type as before (§5.5 a)');
select t.refuses($$select core.declare_served('given')$$, 'not_served');
select t.refuses($$select core.declare_served('radiology.request')$$, 'not_served');

\echo '── where the pack serves: used here, or a department using it works for this one'
select t.as('11111111-0000-0000-0000-0000000000b9');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probeserve"]}}') ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'lab', 'data', '{"packs":["probeserve"]}'::jsonb)) ->> 'key' as ticked;
select public.write_setting(jsonb_build_object('key', 'department.works_for', 'owner_id', :'lab', 'data', jsonb_build_object('departments', jsonb_build_array(:'im')))) ->> 'key' as serves;
select t.ok(core.pack_serves('00000000-0000-0000-0000-0000000000a1', :'im', 'probeserve'), 'the Lab uses it and works for Internal Medicine');
select t.ok(core.pack_serves('00000000-0000-0000-0000-0000000000a1', :'lab', 'probeserve'), 'the Lab uses it itself');
select t.ok(not core.pack_serves('00000000-0000-0000-0000-0000000000a1', :'ward', 'probeserve'), 'the Lab does not work for the Ward');

\echo '── Nurse Sara (IM and the ward, no probe action): writes it in IM, refused in the ward'
select t.as('11111111-0000-0000-0000-0000000000b3');
select t.landed(t.w(jsonb_build_array(t.e('probeserve.given', :'pt', :'im', '{"status":"completed","drug":{"text":"Red cells"},"probeserve":{"units":2}}'))), 'a served type in Internal Medicine, with write:given');
select t.refused(t.w(jsonb_build_array(t.e('probeserve.given', :'pt', :'ward', '{"status":"completed","drug":{"text":"Red cells"},"probeserve":{"units":1}}'))), 'not_served', 'in the ward the Lab does not work for');
select t.as('11111111-0000-0000-0000-0000000000b9');
select public.write_setting(jsonb_build_object('key', 'department.works_for', 'owner_id', :'lab', 'data', '{"all":true}'::jsonb)) ->> 'key' as all_served;
select t.as('11111111-0000-0000-0000-0000000000b3');
select t.landed(t.w(jsonb_build_array(t.e('probeserve.given', :'pt', :'ward', '{"status":"completed","drug":{"text":"Red cells"}}'))), 'once the Lab works for every department, the ward too');
