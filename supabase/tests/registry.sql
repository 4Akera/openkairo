-- permanent test 5 · registry integrity (spec §3.8, §8): OIDs, owners, definer, search_path, volatility, prefixes, may_be_private against the
-- resource, hashes of the bodies as declared; and declaring something outside the contract is refused
-- expects: outside_prefix, not_definer, wrong_volatility, never_private, own_type, outside_prefix, requires_loop, wrong_owner, search_path_not_pinned, derived_table_needs
\echo '── every registered function: its layer''s role, definer, search_path pinned, its layer''s schema, the right volatility, the body it was declared with'
with fns as (
  select t.layer, f, 's' vol, t.hashes ->> 'line' h, 'line ' || t.key what from core.types t, lateral (select t.line f) x
  union all select t.layer, t.to_fhir, 's', t.hashes ->> 'to_fhir', 'to_fhir ' || t.key from core.types t where t.to_fhir is not null
  union all select t.layer, t.claims, 's', t.hashes ->> 'claims', 'claims ' || t.key from core.types t where t.claims is not null
  union all select t.layer, c.f, 's', t.hashes ->> ('check' || c.n), 'check ' || t.key from core.types t, unnest(t.checks) with ordinality c(f, n)
  union all select d.layer, d.refresh, 'v', d.hashes ->> 'refresh', 'refresh ' || d.key from core.derived d
  union all select r.layer, r.hidden, 's', r.hashes ->> 'hidden', 'rule ' || r.key from core.rules r
  union all select l.layer, l.refresh, 'v', l.hashes ->> 'refresh', 'listener ' || l.layer from core.listeners l)
select coalesce(nullif(string_agg(t.report('registry', fns.what || ' ' || problem), E'\n'), ''), 'ok every registered function is its layer''s, definer, pinned, in its schema, of the right volatility and unchanged')
  from fns join pg_proc p on p.oid = fns.f join pg_roles o on o.oid = p.proowner join pg_namespace n on n.oid = p.pronamespace join core.layers l on l.key = fns.layer,
  lateral (select unnest(array[
    case when o.rolname <> l.role_name then 'is owned by ' || o.rolname end,
    case when not p.prosecdef then 'is not definer' end,
    case when not coalesce(p.proconfig @> array['search_path=""'], false) then 'has no pinned search_path' end,
    case when n.nspname <> l.schema_name then 'lives in ' || n.nspname end,
    case when p.provolatile::text <> fns.vol then 'has the wrong volatility' end,
    case when fns.h is distinct from md5(p.prosrc) then 'changed since it was declared' end]) problem) q
 where problem is not null;
select t.ok(not exists (select 1 from core.types where may_be_private and resources && array['MedicationRequest', 'MedicationStatement', 'MedicationAdministration', 'Immunization', 'AllergyIntolerance']),
  'no type that may be private is a medicine, an immunization or an allergy');
select t.ok(not exists (select 1 from core.types t join core.layers l on l.key = t.layer where l.is_pack and position(l.key || '.' in t.key) <> 1), 'pack types sit inside their prefix');
select t.ok(not exists (select 1 from core.types t join core.layers l on l.key = t.layer where not l.is_pack and t.key like '%.%'), 'base types have no prefix');
select t.ok(not exists (select 1 from core.derived d where not exists (select 1 from pg_attribute a where a.attrelid = d.relation and a.attname = 'source_entries')), 'every derived table keeps its source entries');
select t.ok((select count(*) from core.types where layer = 'base') = 34, 'the base declares 34 types: ' || (select count(*) from core.types where layer = 'base'));
select t.ok(not exists (select 1 from core.types t where t.layer = 'base' and not exists (select 1 from core.actions a where a.key = 'write:' || t.key)), 'every type has its write action');

\echo '── declaring outside the contract is refused'
select core.create_pack('hostile');
select core.declare_pack('hostile', 1, '{}', '{"en":"Hostile"}');
set role pack_hostile;
create function hostile.line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select 'x' $$;
create function hostile.open_line(e jsonb) returns text language sql stable as $$ select 'x' $$;
create function hostile.unpinned(e jsonb) returns text language sql stable security definer as $$ select 'x' $$;
create function hostile.volatile_check(p_entry jsonb, p_set jsonb) returns jsonb language sql volatile security definer set search_path = '' as $$ select '[]'::jsonb $$;
create function hostile.refresh(p_org uuid, p_items uuid[]) returns void language sql volatile security definer set search_path = '' as $$ select $$;
create table hostile.no_sources (organization_id uuid, patient_id uuid, item uuid);
reset role;
select core.declare_type('note', 2, 'hostile', '{"type":"object"}', 'hostile.line(jsonb)');
select core.declare_type('hostile.x', 1, 'hostile', '{"type":"object"}', 'hostile.open_line(jsonb)');
select core.declare_type('hostile.x', 1, 'hostile', '{"type":"object"}', 'hostile.line(jsonb)', checks => array['hostile.volatile_check(jsonb,jsonb)']::regprocedure[]);
select core.declare_type('hostile.dose', 1, 'hostile', '{"type":"object"}', 'hostile.line(jsonb)', array['Immunization'], may_be_private => true);
select core.declare_type('hostile.x', 1, 'hostile', '{"type":"object"}', 'hostile.line(jsonb)');
select core.declare_listener('hostile', array['hostile.x'], 'hostile.refresh(uuid,uuid[])');
select core.declare_action('write:obgyn.birth', 'hostile');
select core.declare_pack('hostile', 1, array['hostile'], '{"en":"Hostile"}');
select core.declare_type('hostile.y', 1, 'hostile', '{"type":"object"}', 'base.note_line(jsonb)');
select core.declare_type('hostile.y', 1, 'hostile', '{"type":"object"}', 'hostile.unpinned(jsonb)');
select core.declare_table('hostile.no_sources', 'hostile', 'hostile.refresh(uuid,uuid[])', 'read:record');
select t.ok(exists (select 1 from core.types where key = 'hostile.x') and not exists (select 1 from core.types where key in ('hostile.dose', 'hostile.y') or (key = 'note' and version = 2)),
  'only the contract-abiding declaration landed');
select t.ok(not has_table_privilege('pack_hostile', 'core.types', 'INSERT,UPDATE,DELETE') and not has_function_privilege('pack_hostile', 'core.declare_type(text,integer,text,jsonb,regprocedure,text[],text,text,regprocedure,regprocedure[],text[],regprocedure,boolean,boolean,boolean,jsonb)', 'EXECUTE'),
  'a pack cannot write the registry itself');
