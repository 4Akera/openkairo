-- 02 · core: helpers (identity, may, settings, counters, patient families, datatypes) and the registry's declare_* functions,
-- which enforce the contract when something is declared (spec/openCare.md §3.1–§3.8).

set client_min_messages = warning;

-- ── small helpers ──
-- a refusal: its message is its code; the detail may name what (never patient data)
create function core.refuse(code text, detail text default null) returns void language plpgsql as $$
begin
  raise exception using message = code, detail = coalesce(detail, ''), errcode = 'P0001';
end $$;

-- uuid v7 (time-ordered), for ids the server mints
create function core.uuid7() returns uuid language sql volatile as $$
  select encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid()) placing
    substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 'hex')::uuid
$$;
-- uuid v5 of an item and a key: every derived id, so a rebuild keeps every FHIR id (§6.4)
create function core.uuid5(item uuid, key text) returns uuid language sql immutable as $$
  select extensions.uuid_generate_v5(item, key)
$$;

-- Arabic folding (أ/إ/آ/ٱ→ا, ى→ي, ة→ه, no tatweel or harakat), Latin accents off, lower case (§3.2)
create function core.fold(t text) returns text language sql stable as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary,
    translate(regexp_replace(coalesce(t, ''), '[\u064B-\u065F\u0670\u0640]', '', 'g'), U&'\0623\0625\0622\0671\0649\0629', U&'\0627\0627\0627\0627\064A\0647')))
$$;

-- ── identity from the JWT (§3.1, §3.9 step 2) ──
create function core.claims() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function core.login_id() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), core.claims() ->> 'sub')::uuid
$$;
create function core.session_id() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.session_id', true), ''), core.claims() ->> 'session_id'), '')::uuid
$$;
create function core.aal() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''), core.claims() ->> 'aal', 'aal1')
$$;

-- the signed-in user: the session's choice, or the login's only live user; never a parameter (§3.1)
create function core.me() returns core.users language plpgsql stable security definer set search_path = '' as $$
declare v_login uuid := core.login_id(); v_session uuid := core.session_id(); u core.users; n int;
begin
  if v_login is null then perform core.refuse('not_signed_in'); end if;
  if v_session is not null then
    select x.* into u from core.sessions s join core.users x on x.organization_id = s.organization_id and x.id = s.user_id
     where s.session_id = v_session and s.login_id = v_login and x.login_id = v_login and x.retired_at is null;
    if found then return u; end if;
  end if;
  select count(*) into n from core.users x join core.organizations o on o.id = x.organization_id
   where x.login_id = v_login and x.retired_at is null and o.retired_at is null;
  if n = 0 then perform core.refuse('not_a_member'); end if;
  if n > 1 then perform core.refuse('choose_user'); end if;
  select x.* into u from core.users x join core.organizations o on o.id = x.organization_id
   where x.login_id = v_login and x.retired_at is null and o.retired_at is null;
  return u;
end $$;

-- ── settings (§3.4): the row of a thing as it stood at a moment ──
create function core.setting_at(p_org uuid, p_key text, p_thing uuid, p_at timestamptz default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when s.retired then null else s.data end from core.settings s
   where s.organization_id = p_org and s.key = p_key and s.thing_id = p_thing and s.recorded_at <= coalesce(p_at, clock_timestamp())
   order by s.recorded_at desc, s.id desc limit 1
$$;
create function core.settings_at(p_org uuid, p_key text, p_at timestamptz default null)
returns table (thing_id uuid, owner_id uuid, data jsonb, recorded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.thing_id, x.owner_id, x.data, x.recorded_at from (
    select distinct on (s.thing_id) s.thing_id, s.owner_id, s.data, s.recorded_at, s.retired from core.settings s
     where s.organization_id = p_org and s.key = p_key and s.recorded_at <= coalesce(p_at, clock_timestamp())
     order by s.thing_id, s.recorded_at desc, s.id desc) x
  where not x.retired
$$;

-- the packs this organization uses (the core's own setting key, organization.packs_used)
create function core.packs_used(p_org uuid, p_at timestamptz default null) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce((select array_agg(v) from jsonb_array_elements_text(core.setting_at(p_org, 'organization.packs_used', p_org, p_at) -> 'packs') v), '{}')
$$;
create function core.layer_on(p_org uuid, p_layer text) returns boolean language sql stable security definer set search_path = '' as $$
  select p_layer in ('core', 'base') or p_layer = any (core.packs_used(p_org))
$$;

-- ── may (§3.1): a null department matches only roles held everywhere ──
create function core.may(p_user uuid, p_action text, p_department uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.users u
      join core.holdings h on h.organization_id = u.organization_id and h.user_id = u.id
      join core.roles r on r.id = h.role_id and r.retired_at is null and (r.organization_id is null or r.organization_id = u.organization_id)
      join core.actions a on a.key = p_action
      left join core.role_actions ra on ra.role_id = r.id and ra.action = p_action
     where u.id = p_user and u.retired_at is null
       and h.valid_from <= clock_timestamp() and (h.valid_until is null or h.valid_until > clock_timestamp())
       and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id and x.ended_at <= clock_timestamp())
       and (h.department_id is null or h.department_id = p_department)
       and (ra.action is not null or r.every_action)
       and core.layer_on(u.organization_id, a.layer))
$$;
create function core.may_somewhere(p_user uuid, p_action text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.users u
      join core.holdings h on h.organization_id = u.organization_id and h.user_id = u.id
      join core.roles r on r.id = h.role_id and r.retired_at is null and (r.organization_id is null or r.organization_id = u.organization_id)
      join core.actions a on a.key = p_action
      left join core.role_actions ra on ra.role_id = r.id and ra.action = p_action
     where u.id = p_user and u.retired_at is null
       and h.valid_from <= clock_timestamp() and (h.valid_until is null or h.valid_until > clock_timestamp())
       and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id and x.ended_at <= clock_timestamp())
       and (ra.action is not null or r.every_action)
       and core.layer_on(u.organization_id, a.layer))
$$;
-- the live holdings of a user (who holds what where): used by the base's privacy rule and by settings
create function core.live_holdings(p_org uuid) returns table (user_id uuid, role_id uuid, department_id uuid)
language sql stable security definer set search_path = '' as $$
  select h.user_id, h.role_id, h.department_id from core.holdings h join core.roles r on r.id = h.role_id and r.retired_at is null
   where h.organization_id = p_org and h.valid_from <= clock_timestamp() and (h.valid_until is null or h.valid_until > clock_timestamp())
     and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id and x.ended_at <= clock_timestamp())
$$;
-- the actions a role gives (every action of the organization's layers, for the Owner)
create function core.role_actions_of(p_org uuid, p_role uuid) returns setof text language sql stable security definer set search_path = '' as $$
  select a.key from core.actions a join core.roles r on r.id = p_role
   where core.layer_on(p_org, a.layer) and (r.every_action or exists (select 1 from core.role_actions ra where ra.role_id = r.id and ra.action = a.key))
$$;
-- users who hold an action in a department by a role held there (not everywhere): who works there (§4.3)
create function core.holders_in(p_org uuid, p_action text, p_department uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct h.user_id from core.live_holdings(p_org) h
    join core.role_actions_of(p_org, h.role_id) ra(action) on ra.action = p_action
    join core.users u on u.organization_id = p_org and u.id = h.user_id and u.retired_at is null and u.kind = 'staff'
   where h.department_id = p_department
$$;

-- ── counters (§3.6) ──
create function core.next_number(p_org uuid, p_key text, p_scope text default '', p_day date default '2000-01-01') returns bigint
language sql volatile security definer set search_path = '' as $$
  insert into core.counters as c (organization_id, key, scope, day, value) values (p_org, p_key, coalesce(p_scope, ''), coalesce(p_day, '2000-01-01'), 1)
  on conflict (organization_id, key, scope, day) do update set value = c.value + 1
  returning value
$$;

-- ── patients: the survivor and the merged family (§3.2) ──
create function core.survivor(p_org uuid, p_patient uuid) returns uuid language sql stable security definer set search_path = '' as $$
  with recursive up(id, merged_into, depth) as (
    select p.id, p.merged_into, 0 from core.patients p where p.organization_id = p_org and p.id = p_patient
    union all
    select p.id, p.merged_into, up.depth + 1 from up join core.patients p on p.organization_id = p_org and p.id = up.merged_into where up.depth < 50)
  select id from up where merged_into is null
$$;
create function core.family(p_org uuid, p_patient uuid) returns uuid[] language sql stable security definer set search_path = '' as $$
  with recursive down(id, depth) as (
    select core.survivor(p_org, p_patient), 0
    union all
    select p.id, down.depth + 1 from down join core.patients p on p.organization_id = p_org and p.merged_into = down.id where down.depth < 50)
  select coalesce(array_agg(id), '{}') from down where id is not null
$$;

-- ── datatypes (§3.7): the only building blocks of data; every type's shape inlines these $defs ──
create function core.datatypes() returns jsonb language sql immutable as $$
  select '{
    "coding":     {"type": "object", "required": ["system", "code"], "additionalProperties": false,
                   "properties": {"system": {"type": "string", "pattern": "^[a-z0-9][a-z0-9_.-]*$"}, "code": {"type": "string", "minLength": 1}, "display": {"type": "string"}}},
    "concept":    {"type": "object", "required": ["text"], "additionalProperties": false,
                   "properties": {"text": {"type": "string"}, "codings": {"type": "array", "items": {"$ref": "#/$defs/coding"}}}},
    "decimal":    {"type": "string", "pattern": "^-?[0-9]+(\\.[0-9]+)?$"},
    "quantity":   {"type": "object", "required": ["value"], "additionalProperties": false,
                   "properties": {"value": {"$ref": "#/$defs/decimal"}, "unit": {"type": "string"}, "ucum": {"type": "string"}, "comparator": {"enum": ["<", "<=", ">=", ">"]}}},
    "range":      {"type": "object", "additionalProperties": false,
                   "properties": {"low": {"$ref": "#/$defs/quantity"}, "high": {"$ref": "#/$defs/quantity"}, "text": {"type": "string"}}},
    "ratio":      {"type": "object", "additionalProperties": false, "required": ["numerator", "denominator"],
                   "properties": {"numerator": {"$ref": "#/$defs/quantity"}, "denominator": {"$ref": "#/$defs/quantity"}}},
    "datetime":   {"type": "string", "pattern": "^[0-9]{4}(-[0-9]{2}(-[0-9]{2}([T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)?)?)?)?$"},
    "period":     {"type": "object", "additionalProperties": false, "properties": {"start": {"$ref": "#/$defs/datetime"}, "end": {"$ref": "#/$defs/datetime"}}},
    "partial_date": {"type": "object", "required": ["value"], "additionalProperties": false,
                   "properties": {"value": {"$ref": "#/$defs/datetime"}, "precision": {"enum": ["year", "month", "day", "minute", "second"]}, "text": {"type": "string"}}},
    "reference":  {"type": "object", "required": ["to", "id"], "additionalProperties": false,
                   "properties": {"to": {"enum": ["item", "patient", "user", "department", "place"]}, "id": {"type": "string", "format": "uuid"}, "display": {"type": "string"}}},
    "identifier": {"type": "object", "required": ["system", "value"], "additionalProperties": false,
                   "properties": {"system": {"type": "string"}, "value": {"type": "string", "minLength": 1}}},
    "timing":     {"type": "object", "additionalProperties": false,
                   "properties": {"frequency": {"type": "integer", "minimum": 1}, "period": {"type": "number", "exclusiveMinimum": 0},
                                  "period_unit": {"enum": ["s", "min", "h", "d", "wk", "mo", "a"]}, "when": {"type": "array", "items": {"type": "string"}},
                                  "bounds_days": {"type": "integer", "minimum": 1}, "code": {"type": "string"}, "text": {"type": "string"}}},
    "attachment": {"type": "object", "required": ["sha256", "mime", "size"], "additionalProperties": false,
                   "properties": {"sha256": {"type": "string", "pattern": "^[0-9a-f]{64}$"}, "sha1": {"type": "string", "pattern": "^[0-9a-f]{40}$"},
                                  "mime": {"type": "string"}, "size": {"type": "integer", "minimum": 0}, "name": {"type": "string"}, "created": {"$ref": "#/$defs/datetime"}}}
  }'::jsonb
$$;

-- every coding (an object with system and code) and every quantity carrying a ucum code, anywhere in data (§3.7)
create function core.nodes(j jsonb) returns setof jsonb language sql immutable as $$
  with recursive w(v) as (
    select j
    union all
    select c.v from w, lateral (
      select value as v from jsonb_each(case when jsonb_typeof(w.v) = 'object' then w.v else '{}'::jsonb end)
      union all
      select value from jsonb_array_elements(case when jsonb_typeof(w.v) = 'array' then w.v else '[]'::jsonb end)) c)
  select v from w where jsonb_typeof(v) = 'object'
$$;
create function core.codings(j jsonb) returns setof jsonb language sql immutable as $$
  select v from core.nodes(j) v where v ? 'system' and v ? 'code' and jsonb_typeof(v -> 'code') = 'string'
$$;
create function core.codes_of(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(distinct (c ->> 'system') || ':' || (c ->> 'code')), '{}') from core.codings(j) c
$$;
create function core.ucums(j jsonb) returns setof text language sql immutable as $$
  select v ->> 'ucum' from core.nodes(j) v where v ? 'ucum' and v ? 'value' and jsonb_typeof(v -> 'ucum') = 'string'
$$;

-- ── the registry: declarations with enforcement (§3.8) ──
create function core.layer_role(p_layer text) returns text language sql stable as $$
  select role_name from core.layers where key = p_layer
$$;

-- a declared function: owned by the layer's role, SECURITY DEFINER, search_path pinned empty, in the layer's schema,
-- with the volatility asked ('s' stable, 'v' volatile); returns md5(prosrc) to store beside the OID
create function core.check_fn(p_layer text, p_fn regprocedure, p_volatility "char", p_what text) returns text language plpgsql as $$
declare l core.layers; p record;
begin
  select * into l from core.layers where key = p_layer;
  if not found then perform core.refuse('unknown_layer', p_layer); end if;
  select pr.*, n.nspname, r.rolname into p from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace join pg_roles r on r.oid = pr.proowner where pr.oid = p_fn;
  if p.rolname <> l.role_name then perform core.refuse('wrong_owner', format('%s %s is owned by %s, not %s', p_what, p_fn, p.rolname, l.role_name)); end if;
  if p.nspname <> l.schema_name then perform core.refuse('wrong_schema', format('%s %s lives in %s, not %s', p_what, p_fn, p.nspname, l.schema_name)); end if;
  if not p.prosecdef then perform core.refuse('not_definer', format('%s %s', p_what, p_fn)); end if;
  if not coalesce(p.proconfig @> array['search_path=""'], false) then perform core.refuse('search_path_not_pinned', format('%s %s', p_what, p_fn)); end if;
  if p.provolatile <> p_volatility then perform core.refuse('wrong_volatility', format('%s %s must be %s', p_what, p_fn, case p_volatility when 's' then 'STABLE' else 'VOLATILE' end)); end if;
  return md5(coalesce(p.prosrc, ''));
end $$;

-- a key inside the layer's prefix: the base and the core declare bare keys; a pack only '<pack>.<name>'
create function core.check_prefix(p_layer text, p_key text, p_sep text default '.') returns void language plpgsql as $$
declare packish boolean := (select is_pack from core.layers where key = p_layer);
begin
  if packish then
    if position(p_layer || p_sep in p_key) <> 1 then perform core.refuse('outside_prefix', format('%s may not declare %s', p_layer, p_key)); end if;
  elsif exists (select 1 from core.layers l where l.is_pack and position(l.key || p_sep in p_key) = 1) then
    perform core.refuse('outside_prefix', format('%s may not declare a pack key %s', p_layer, p_key));
  end if;
end $$;

create function core.declare_layer(p_key text, p_role text, p_schema text, p_labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
begin
  insert into core.layers (key, role_name, schema_name, labels) values (p_key, p_role, p_schema, p_labels)
  on conflict (key) do update set labels = excluded.labels;
end $$;

create function core.declare_pack(key text, version int, requires text[] default '{}', labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
declare r text; loop_found boolean;
begin
  foreach r in array requires loop
    if not exists (select 1 from core.layers l where l.key = r and l.is_pack) then perform core.refuse('unknown_pack', r); end if;
  end loop;
  insert into core.layers (key, role_name, schema_name, version, requires, labels, is_pack)
  values (declare_pack.key, 'pack_' || declare_pack.key, declare_pack.key, declare_pack.version, declare_pack.requires, declare_pack.labels, true)
  on conflict on constraint layers_pkey do update set version = excluded.version, requires = excluded.requires, labels = excluded.labels;
  -- requires may not loop
  with recursive dep(k, path) as (
    select declare_pack.key, array[declare_pack.key]
    union all
    select q, dep.path || q from dep, core.layers l, unnest(l.requires) q where l.key = dep.k and not (q = any (dep.path[2:])) and array_length(dep.path, 1) < 50)
  select exists (select 1 from dep where array_length(path, 1) > 1 and k = declare_pack.key) into loop_found;
  if loop_found then perform core.refuse('requires_loop', declare_pack.key); end if;
end $$;

create function core.declare_action(key text, layer text, scope text default 'department', labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
begin
  perform core.check_prefix(layer, split_part(key, ':', 2));
  insert into core.actions (key, layer, scope, labels) values (declare_action.key, declare_action.layer, declare_action.scope, declare_action.labels)
  on conflict on constraint actions_pkey do update set labels = excluded.labels, scope = excluded.scope
  where core.actions.layer = excluded.layer;
end $$;

create function core.declare_role(id uuid, key text, layer text, name text, actions text[], labels jsonb default '{}', every_action boolean default false) returns void language plpgsql as $$
#variable_conflict use_variable
declare a text;
begin
  foreach a in array actions loop
    if not exists (select 1 from core.actions x where x.key = a) then perform core.refuse('unknown_action', a); end if;
  end loop;
  insert into core.roles (id, organization_id, layer, key, name, labels, every_action)
  values (declare_role.id, null, declare_role.layer, declare_role.key, declare_role.name, declare_role.labels, declare_role.every_action)
  on conflict on constraint roles_pkey do update set name = excluded.name, labels = excluded.labels, every_action = excluded.every_action;
  delete from core.role_actions ra where ra.role_id = declare_role.id and not (ra.action = any (actions));
  insert into core.role_actions (role_id, action) select declare_role.id, unnest(actions) on conflict do nothing;
end $$;

create function core.declare_system(key text, layer text, kind text, uri text, version text default null, closed boolean default false,
  check_fn regprocedure default null, licence text default null, labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
declare h jsonb := '{}';
begin
  if check_fn is not null then h := jsonb_build_object('check', core.check_fn(layer, check_fn, 's', 'system check')); end if;
  insert into core.systems (key, layer, kind, uri, version, closed, check_fn, licence, labels, hashes)
  values (declare_system.key, declare_system.layer, declare_system.kind, declare_system.uri, declare_system.version, declare_system.closed, declare_system.check_fn,
          declare_system.licence, declare_system.labels, h)
  on conflict on constraint systems_pkey do update set uri = excluded.uri, version = excluded.version, closed = excluded.closed, check_fn = excluded.check_fn,
     licence = excluded.licence, labels = excluded.labels, hashes = excluded.hashes where core.systems.layer = excluded.layer;
end $$;

create function core.declare_table(key text, layer text, refresh regprocedure, action text) returns void language plpgsql as $$
#variable_conflict use_variable
declare rel regclass := to_regclass(key); c text;
begin
  if rel is null then perform core.refuse('no_such_table', key); end if;
  perform core.check_prefix(layer, key);
  if split_part(key, '.', 1) <> (select schema_name from core.layers l where l.key = layer) then perform core.refuse('wrong_schema', key); end if;
  foreach c in array array['organization_id', 'patient_id', 'item', 'source_entries'] loop
    if not exists (select 1 from pg_attribute a where a.attrelid = rel and a.attname = c and not a.attisdropped) then
      perform core.refuse('derived_table_needs', format('%s needs column %s', key, c));
    end if;
  end loop;
  if pg_get_function_identity_arguments(refresh) <> 'p_org uuid, p_items uuid[]' then
    perform core.refuse('wrong_signature', format('refresh %s must take (p_org uuid, p_items uuid[])', refresh));
  end if;
  if not exists (select 1 from core.actions a where a.key = action) then perform core.refuse('unknown_action', action); end if;
  insert into core.derived (key, layer, relation, refresh, action, hashes)
  values (declare_table.key, declare_table.layer, rel, declare_table.refresh, declare_table.action, jsonb_build_object('refresh', core.check_fn(layer, refresh, 'v', 'refresh')))
  on conflict on constraint derived_pkey do update set refresh = excluded.refresh, action = excluded.action, hashes = excluded.hashes where core.derived.layer = excluded.layer;
end $$;

create function core.declare_rule(key text, layer text, hidden regprocedure) returns void language plpgsql as $$
#variable_conflict use_variable
begin
  perform core.check_prefix(layer, key);
  if pg_get_function_identity_arguments(hidden) <> 'p_reader uuid, p_ids uuid[]' then
    perform core.refuse('wrong_signature', format('rule %s must take (p_reader uuid, p_ids uuid[])', hidden));
  end if;
  insert into core.rules (key, layer, hidden, hashes) values (declare_rule.key, declare_rule.layer, declare_rule.hidden, jsonb_build_object('hidden', core.check_fn(layer, hidden, 's', 'rule')))
  on conflict on constraint rules_pkey do update set hidden = excluded.hidden, hashes = excluded.hashes where core.rules.layer = excluded.layer;
end $$;

create function core.declare_setting(key text, layer text, owner text, shape jsonb, check_fn regprocedure default null, many boolean default false, labels jsonb default '{}')
returns void language plpgsql as $$
#variable_conflict use_variable
declare s jsonb := shape || jsonb_build_object('$defs', core.datatypes() || coalesce(shape -> '$defs', '{}'));
begin
  perform core.check_prefix(layer, key);
  if not extensions.jsonschema_is_valid(s::json) then perform core.refuse('bad_schema', key); end if;
  insert into core.setting_keys (key, layer, owner_kind, shape, check_fn, many, labels, hashes)
  values (declare_setting.key, declare_setting.layer, owner, s, declare_setting.check_fn, declare_setting.many, declare_setting.labels,
          case when declare_setting.check_fn is null then '{}' else jsonb_build_object('check', core.check_fn(layer, declare_setting.check_fn, 's', 'setting check')) end)
  on conflict on constraint setting_keys_pkey do update set shape = excluded.shape, check_fn = excluded.check_fn, many = excluded.many, labels = excluded.labels,
     hashes = excluded.hashes where core.setting_keys.layer = excluded.layer;
end $$;

create function core.declare_screen(key text, layer text, work text, labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
begin
  if split_part(key, '.', 1) <> layer then perform core.refuse('outside_prefix', format('%s may not declare screen %s', layer, key)); end if;
  insert into core.screens (key, layer, work, labels) values (declare_screen.key, declare_screen.layer, declare_screen.work, declare_screen.labels)
  on conflict on constraint screens_pkey do update set work = excluded.work, labels = excluded.labels where core.screens.layer = excluded.layer;
end $$;

create function core.declare_listener(layer text, types text[], refresh regprocedure) returns void language plpgsql as $$
#variable_conflict use_variable
declare t text;
begin
  foreach t in array types loop
    if not exists (select 1 from core.types x where x.key = t) then perform core.refuse('unknown_type', t); end if;
    if exists (select 1 from core.types x where x.key = t and x.layer = declare_listener.layer) then
      perform core.refuse('own_type', format('%s listens to its own type %s: feed it instead', layer, t));
    end if;
  end loop;
  if pg_get_function_identity_arguments(refresh) <> 'p_org uuid, p_items uuid[]' then
    perform core.refuse('wrong_signature', format('listener %s must take (p_org uuid, p_items uuid[])', refresh));
  end if;
  insert into core.listeners (layer, types, refresh, hashes)
  values (declare_listener.layer, declare_listener.types, declare_listener.refresh, jsonb_build_object('refresh', core.check_fn(layer, refresh, 'v', 'listener')))
  on conflict on constraint listeners_pkey do update set types = excluded.types, hashes = excluded.hashes;
end $$;

-- a type version (§3.8). The resources a private item may never have: medicines, immunizations, allergies
create function core.declare_type(key text, version int, layer text, shape jsonb, line regprocedure, resources text[] default '{}',
  base_type text default null, profile text default null, to_fhir regprocedure default null, checks regprocedure[] default '{}',
  feeds text[] default '{}', claims regprocedure default null, may_be_private boolean default false, in_record boolean default true,
  other_patient boolean default false, labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
declare s jsonb := shape || jsonb_build_object('$defs', core.datatypes() || coalesce(shape -> '$defs', '{}'));
        h jsonb := '{}'; c regprocedure; i int := 0; f text; prev core.types;
begin
  perform core.check_prefix(layer, key);
  if base_type is not null then
    if not (select is_pack from core.layers l where l.key = layer) then perform core.refuse('base_type_for_packs', key); end if;
    if not exists (select 1 from core.types t where t.key = base_type and t.layer = 'base') then perform core.refuse('unknown_base_type', base_type); end if;
  end if;
  if not extensions.jsonschema_is_valid(s::json) then perform core.refuse('bad_schema', key); end if;
  if may_be_private and resources && array['MedicationRequest', 'MedicationStatement', 'MedicationAdministration', 'Immunization', 'AllergyIntolerance'] then
    perform core.refuse('never_private', format('%s maps to %s, which may never be private', key, resources));
  end if;
  h := jsonb_build_object('line', core.check_fn(layer, line, 's', 'line'));
  if to_fhir is not null then h := h || jsonb_build_object('to_fhir', core.check_fn(layer, to_fhir, 's', 'to_fhir')); end if;
  if claims is not null then h := h || jsonb_build_object('claims', core.check_fn(layer, claims, 's', 'claims')); end if;
  foreach c in array checks loop
    i := i + 1;
    if pg_get_function_identity_arguments(c) <> 'p_entry jsonb, p_set jsonb' then
      perform core.refuse('wrong_signature', format('check %s must take (p_entry jsonb, p_set jsonb)', c));
    end if;
    h := h || jsonb_build_object('check' || i, core.check_fn(layer, c, 's', 'check'));
  end loop;
  foreach f in array feeds loop
    if not exists (select 1 from core.derived d where d.key = f and (d.layer = layer or d.layer = 'base')) then perform core.refuse('unknown_table', f); end if;
    if exists (select 1 from core.derived d where d.key = f and d.layer <> layer and d.layer <> 'base') then perform core.refuse('other_packs_table', f); end if;
  end loop;
  select * into prev from core.types t where t.key = declare_type.key order by t.version desc limit 1;
  if found and prev.layer <> layer then perform core.refuse('outside_prefix', key); end if;
  insert into core.types (key, version, layer, base_type, shape, resources, profile, to_fhir, line, checks, feeds, claims, may_be_private, in_record, other_patient, labels, hashes)
  values (declare_type.key, declare_type.version, declare_type.layer, declare_type.base_type, s, declare_type.resources, declare_type.profile, declare_type.to_fhir,
          declare_type.line, declare_type.checks, declare_type.feeds, declare_type.claims, declare_type.may_be_private, declare_type.in_record,
          declare_type.other_patient, declare_type.labels, h)
  on conflict on constraint types_pkey do update set base_type = excluded.base_type, shape = excluded.shape, resources = excluded.resources, profile = excluded.profile,
     to_fhir = excluded.to_fhir, line = excluded.line, checks = excluded.checks, feeds = excluded.feeds, claims = excluded.claims,
     may_be_private = excluded.may_be_private, in_record = excluded.in_record, other_patient = excluded.other_patient, labels = excluded.labels, hashes = excluded.hashes;
end $$;

-- the latest version of a type, and every type that is a base type or extends it (base.orders reads 'step' and pharmacy.dispense)
create function core.type_latest(p_key text) returns int language sql stable security definer set search_path = '' as $$
  select max(version) from core.types where key = p_key
$$;
create function core.kinds(p_base text) returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct key), array[p_base]) from core.types where key = p_base or base_type = p_base
$$;
create function core.base_of(p_type text) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select base_type from core.types where key = p_type and base_type is not null limit 1), p_type)
$$;

-- ── the core's own layer, actions and settings keys ──
select core.declare_layer('core', 'postgres', 'core', '{"en":"Core"}');
select core.declare_action('manage:users',    'core', 'organization', '{"en":"Manage people"}');
select core.declare_action('manage:roles',    'core', 'organization', '{"en":"Manage roles"}');
select core.declare_action('manage:settings', 'core', 'department',   '{"en":"Change settings"}');
select core.declare_action('manage:places',   'core', 'organization', '{"en":"Manage departments, sites and places"}');
select core.declare_action('manage:patients', 'core', 'department',   '{"en":"Register and change patients"}');
select core.declare_action('read:patients',   'core', 'department',   '{"en":"Find patients"}');
select core.declare_action('read:log',        'core', 'organization', '{"en":"Read the read log"}');
select core.declare_action('erase:patient',   'core', 'organization', '{"en":"Erase a patient (the law)"}');
select core.declare_action('redact:entry',    'core', 'organization', '{"en":"Redact a misfiled entry"}');
select core.declare_setting('organization.time_zone', 'core', 'organization',
  '{"type":"object","required":["zone"],"additionalProperties":false,"properties":{"zone":{"type":"string"}}}', labels => '{"en":"Time zone"}');
select core.declare_setting('organization.packs_used', 'core', 'organization',
  '{"type":"object","required":["packs"],"additionalProperties":false,"properties":{"packs":{"type":"array","items":{"type":"string"}}}}', labels => '{"en":"Packs used"}');

-- a type version's FHIR mapping, declared after the type (the base's mappings live in their own migration)
create function core.declare_fhir(key text, version int, to_fhir regprocedure) returns void language plpgsql as $$
#variable_conflict use_variable
declare t core.types;
begin
  select * into t from core.types x where x.key = declare_fhir.key and x.version = declare_fhir.version;
  if not found then perform core.refuse('unknown_type', key); end if;
  update core.types set to_fhir = declare_fhir.to_fhir, hashes = hashes || jsonb_build_object('to_fhir', core.check_fn(t.layer, declare_fhir.to_fhir, 's', 'to_fhir'))
   where core.types.key = declare_fhir.key and core.types.version = declare_fhir.version;
end $$;
