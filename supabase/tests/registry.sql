-- permanent test 5 · registry integrity (spec §3.8, §8): OIDs, owners, definer, search_path, volatility, prefixes, may_be_private against the
-- resource, hashes of the bodies as declared; every key read from entry or setting data declared by a shape; and declaring something
-- outside the contract is refused
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
select t.ok((select count(*) from core.types where layer = 'base') = 36, 'the base declares 36 types: ' || (select count(*) from core.types where layer = 'base'));
select t.ok(not exists (select 1 from core.types t where t.layer = 'base' and not exists (select 1 from core.actions a where a.key = 'write:' || t.key)), 'every type has its write action');

\echo '── every key read from entry or setting data is one a declared shape names (a misspelled or drifted key reads NULL, silently)'
-- the keys a body reads from data (§3.7): each quoted key (-> ->> #> #>> ?) of every chain that starts at an entry's -> 'data', a data
-- column or parameter (x.data, p_data, v_data), core.setting_at(…), or a variable or element alias holding one of those (d jsonb :=
-- p_entry -> 'data', select x.data into d, wf := core.setting_at(…), jsonb_array_elements(… -> 'analytes') a); a chain may pass a
-- coalesce default (coalesce(e -> 'data', '{}') ->> 'k'); keys inside a setting_at(…) argument are read too; p_own: from an entry's
-- own -> 'data' only. Regexes over prosrc, not a parser: a helper handed a piece of data as its parameter (base.q,
-- core.fhir_quantity) is not followed.
create function t.data_keys(src text, p_own boolean default false) returns setof text language plpgsql immutable as $$
declare
  op constant text := '\s*(?:(?:->>?|#>>?|\?)\s*''[^'']*''|->>?\s*\d+)';
  dflt constant text := '(?:\s*,\s*''[^'']*''(?:::jsonb)?\s*\))?';   -- coalesce(<chain>, '[]'::jsonb) and on
  lead constant text := '(?:coalesce\(\s*)?(?:\w+\.|\w+\s*)?';
  s constant text := regexp_replace(src, '--[^\n]*', '', 'g');
  root text; plain text; held text[] := '{}'; n int := -1;
begin
  while n <> cardinality(held) loop   -- until no new holder appears: jsonb_array_elements(d -> 'drug' -> 'codings') c needs d first
    n := cardinality(held);
    -- plain: the roots without setting_at(…), whose match would swallow its own argument (setting_at(…, (o.data -> 'service' ->> 'id')))
    plain := '->\s*''data''' || case when p_own then '' else '|(?<![\w.])(?:[pv]_)?data\M|\.data\M' end
      || coalesce('|(?<![\w.])(?:' || nullif(array_to_string(held, '|'), '') || ')\M', '');
    root := '(?:' || plain || case when p_own then '' else '|core\.setting_at\((?:[^()]|\([^()]*\))*\)' end || ')';
    plain := '(?:' || plain || ')';
    held := array(select distinct h from (
      select (regexp_matches(s, '(?<![\w.])(\w+)(?:\s+jsonb)?\s*:=\s*' || lead || root, 'g'))[1] h
      union all select (regexp_matches(s, 'jsonb_array_elements\(\s*' || lead || root || '(?:' || op || ')*' || dflt || '\s*\)\s*(?:with ordinality\s+)?(?:as\s+)?(\w+)', 'g'))[1]
      union all select (regexp_matches(s, 'select\s+' || lead || root || '(?:' || op || ')*' || dflt || '\s+into\s+(?:strict\s+)?(\w+)', 'g'))[1]
      union all select (regexp_matches(s, 'for\s+(\w+)\s+in\s+select\s+\*\s+from\s+jsonb_array_elements\(\s*' || lead || root, 'g'))[1]) x
      where h !~ '^([pv]_)?data$' and h not in ('text', 'int', 'integer', 'uuid', 'boolean', 'numeric', 'loop', 'where', 'limit', 'on', 'join', 'order', 'and', 'or', 'then'));
  end loop;
  return query select distinct k from (
      select m[1] c from regexp_matches(s, root || dflt || '((?:' || op || ')+)', 'g') m
      union all select m[1] from regexp_matches(s, plain || dflt || '((?:' || op || ')+)', 'g') m) m,
    regexp_matches(m.c, '(?:->>?|#>>?|\?)\s*''([^'']*)''', 'g') q, unnest(string_to_array(trim(both '{}' from q[1]), ',')) k where k !~ '^\d+$';
end $$;
-- every property name a shape declares, its $defs (the datatypes) included
create function t.shape_keys(shape jsonb) returns setof text language sql immutable as $$
  select distinct k from jsonb_path_query(shape, 'strict $.**.properties') p, jsonb_object_keys(case when jsonb_typeof(p) = 'object' then p end) k
$$;
-- what the core, the base and every pack read from data, and whether some type or setting key declares it
create function t.data_reads() returns table (fn regprocedure, key text, declared boolean) language sql stable as $$
  with keys as (select t.shape_keys(x.shape) k from core.types x union select t.shape_keys(x.shape) from core.setting_keys x)
  select p.oid::regprocedure, r, r in (select k from keys) from pg_proc p join pg_namespace n on n.oid = p.pronamespace, t.data_keys(p.prosrc) r
   where n.nspname in (select schema_name from core.layers)
$$;
select t.ok((select bool_and(exists (select 1 from t.data_reads() r where r.fn = x.fn::regprocedure and r.key = x.key)) from (values
    ('base.medication_line(jsonb)', 'dosage'), ('pharmacy.queue_refresh(uuid,uuid[])', 'duration_days'), ('base.presence_check(jsonb,jsonb)', 'place_id'),
    ('base.order_check(jsonb,jsonb)', 'departments'), ('core.packs_used(uuid,timestamptz)', 'packs'), ('base.service_check(jsonb,jsonb)', 'steps'),
    ('base.values_refresh(uuid,uuid[])', 'interpretation'), ('pharmacy.dispense_line(jsonb)', 'quantity'), ('base.problem_line(jsonb)', 'system'),
    ('base.step_listed(uuid,core.entries,text)', 'service')) x(fn, key)),
  'the scan follows every idiom (-> ''data'', x.data, d :=, wf := setting_at, setting_at(…) -> and its argument, p_data, element aliases): '
    || (select count(*) || ' keys read in ' || count(distinct fn) || ' functions' from t.data_reads()));
set role base_role;
create function base.typo_line(e jsonb) returns text language sql stable as $$ select (e -> 'data' -> 'dosage' ->> 'text') || (e -> 'data' ->> 'dosge') $$;
-- the same slip in each idiom: select … into, a coalesce default, an element alias over a '[]'::jsonb default, a setting_at argument
create function base.typo_check(e jsonb, p_org uuid) returns text language plpgsql stable as $$
declare d jsonb; v text;
begin
  select x.data into d from core.entries x where x.id = (e ->> 'id')::uuid;
  v := d ->> 'dosge1';
  v := coalesce(e -> 'data', '{}') ->> 'dosge2';
  select string_agg(r ->> 'dosge3', ',') into v from jsonb_array_elements(coalesce(e -> 'data' -> 'reactions', '[]'::jsonb)) r;
  v := core.setting_at(p_org, 'service', (e -> 'data' -> 'servce' ->> 'id')::uuid) ->> 'steps';
  return v;
end $$;
reset role;
select t.ok((select array_agg(key) from t.data_reads() where fn = 'base.typo_line(jsonb)'::regprocedure and not declared) = array['dosge'],
  'a misspelled key is caught, and only it: ' || coalesce((select string_agg(key, ', ') from t.data_reads() where fn = 'base.typo_line(jsonb)'::regprocedure and not declared), 'nothing'));
select t.ok((select array_agg(key order by key) from t.data_reads() where fn = 'base.typo_check(jsonb,uuid)'::regprocedure and not declared) = array['dosge1', 'dosge2', 'dosge3', 'servce'],
  'and in every idiom: ' || coalesce((select string_agg(key, ', ' order by key) from t.data_reads() where fn = 'base.typo_check(jsonb,uuid)'::regprocedure and not declared), 'nothing'));
drop function base.typo_line(jsonb);
drop function base.typo_check(jsonb, uuid);
select coalesce(nullif(string_agg(t.report('registry', fn || ' reads ' || key || ', which no shape declares'), E'\n' order by fn::text, key), ''),
  'ok every key the core, the base and the packs read from entry or setting data is one a shape declares')
  from t.data_reads() where not declared;
-- the one read by a computed path (base.values_refresh, base.vitals_fhir): each vitals key is the vitals shape's
select t.ok(not exists (select 1 from base.vital_keys() v where (select x.shape from core.types x where x.key = 'vitals' order by x.version desc limit 1)
    #> ('{properties,' || array_to_string(v.path, ',properties,') || '}')::text[] is null), 'every path in base.vital_keys is a property of the vitals shape');

\echo '── a line or a mapping reads from the entry''s own data only keys of the types it serves'
-- the types it serves: every type registering it (the presence and privacy lines serve several, by branch), their base types and, for a
-- mapping (which reads every row of one item), the types sharing its resources: a visit's moves are versions of its Encounter
create function t.foreign_reads() returns table (fn regprocedure, key text) language sql stable as $$
  with serves as (
    select x.line f, x.key, x.base_type, x.resources, false fhir from core.types x
    union select x.to_fhir, x.key, x.base_type, x.resources, true from core.types x where x.to_fhir is not null),
  own as (
    select distinct s.f, k from serves s join core.types x on x.key in (s.key, s.base_type) or (s.fhir and x.resources && s.resources), t.shape_keys(x.shape) k)
  select q.f::regprocedure, r from (select distinct f from serves) q, t.data_keys((select prosrc from pg_proc where oid = q.f), true) r
   where not exists (select 1 from own o where o.f = q.f and o.k = r)
$$;
select coalesce(nullif(string_agg(t.report('registry', fn || ' reads ' || key || ', which no type it serves declares'), E'\n' order by fn::text, key), ''),
  'ok every line and mapping reads only keys of the types it serves') from t.foreign_reads();
set role base_role;
create function base.probe_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select e -> 'data' ->> 'lot' $$;
reset role;
select core.declare_type('probe', 1, 'base', '{"type":"object","additionalProperties":false,"properties":{"note":{"type":"string"}}}', 'base.probe_line(jsonb)');
select t.ok((select array_agg(key) from t.foreign_reads() where fn = 'base.probe_line(jsonb)'::regprocedure) = array['lot'],
  'a line reading another type''s key (a given dose''s lot) is caught, though a shape declares it');

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
