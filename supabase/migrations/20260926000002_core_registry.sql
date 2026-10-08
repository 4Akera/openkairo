-- 02 · core: helpers (identity, may, settings, counters, patient families, datatypes) and the registry's declare_* functions,
-- which enforce the contract when something is declared (spec/openCare.md §3.1–§3.8).

set client_min_messages = warning;

-- ── small helpers ──
-- a refusal: its message is its code; the detail may name what (never patient data)
create function core.refuse(code text, detail text default null) returns void language plpgsql as $$
begin
  raise exception using message = code, detail = coalesce(detail, ''), errcode = 'P0001';
end $$;
-- a refusal of one field of a setting (§5.1 rule 7): the field's path is the hint, so the form shows it there
create function core.refuse_at(code text, detail text, field text) returns void language plpgsql as $$
begin
  raise exception using message = code, detail = coalesce(detail, ''), hint = coalesce(field, ''), errcode = 'P0001';
end $$;

-- "now" for a live check: never behind the transaction's own start, though the clock may step back (§3.1)
create function core.now_safe() returns timestamptz language sql volatile as $$
  select greatest(now(), clock_timestamp())
$$;

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

-- ── settings (§3.4): the row of a thing as it stood at a moment. Settings are insert-only and never dated ahead, so as of now
-- (no moment) is every committed row: the clock may step back past one written a moment ago. A moment keeps the filter. ──
create function core.setting_at(p_org uuid, p_key text, p_thing uuid, p_at timestamptz default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when s.retired then null else s.data end from core.settings s
   where s.organization_id = p_org and s.key = p_key and s.thing_id = p_thing and (p_at is null or s.recorded_at <= p_at)
   order by s.recorded_at desc, s.id desc limit 1
$$;
create function core.settings_at(p_org uuid, p_key text, p_at timestamptz default null)
returns table (thing_id uuid, owner_id uuid, data jsonb, recorded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select x.thing_id, x.owner_id, x.data, x.recorded_at from (
    select distinct on (s.thing_id) s.thing_id, s.owner_id, s.data, s.recorded_at, s.retired from core.settings s
     where s.organization_id = p_org and s.key = p_key and (p_at is null or s.recorded_at <= p_at)
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
-- does this department use the layer (§5.1 rule 1): the core and the base always; a pack only while the clinic has it on and the
-- department ticks it (department.packs, the base's key), as of now
create function core.department_uses(p_org uuid, p_department uuid, p_layer text) returns boolean language sql stable security definer set search_path = '' as $$
  select p_layer in ('core', 'base') or (p_layer = any (core.packs_used(p_org))
    and exists (select 1 from jsonb_array_elements_text(coalesce(core.setting_at(p_org, 'department.packs', p_department) -> 'packs', '[]')) x where x = p_layer))
$$;

-- ── may (§3.1, §5.2): a null department matches only roles held everywhere. A holding dated no later than its grant counts once
-- committed, one dated later from core.now_safe(); an end is dated by its own insert (a planned end is valid_until), so it counts
-- once committed, as the doors read it. A clock stepping back never undoes a grant or an end of a moment ago. ──
-- does a role give this action in this department: its own actions and those of the role it is built on, as they stand now (the Owner
-- every action); a pack's everyday action to a role marked everyday (the base's Doctor and Nurse, and what is built on them). A pack's
-- action counts only where the department uses the pack (§5.1 rule 1); an organization-wide one while the clinic has it on.
create function core.gives(p_org uuid, p_role uuid, p_action text, p_department uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.roles r join core.actions a on a.key = p_action join core.layers l on l.key = a.layer
      left join core.roles b on b.id = r.built_on and b.retired_at is null
     where r.id = p_role
       and (r.every_action or exists (select 1 from core.role_actions ra where ra.role_id in (r.id, b.id) and ra.action = a.key)
            or (a.everyday and (r.everyday or coalesce(b.everyday, false))))
       and case when not l.is_pack then true
                when a.scope = 'organization' then core.layer_on(p_org, a.layer)
                else p_department is not null and core.department_uses(p_org, p_department, a.layer) end)
$$;
create function core.may(p_user uuid, p_action text, p_department uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.users u
      join core.holdings h on h.organization_id = u.organization_id and h.user_id = u.id
      join core.roles r on r.id = h.role_id and r.retired_at is null and (r.organization_id is null or r.organization_id = u.organization_id)
     where u.id = p_user and u.retired_at is null
       and h.valid_from <= greatest(h.recorded_at, core.now_safe()) and (h.valid_until is null or h.valid_until > core.now_safe())
       and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id)
       and (h.department_id is null or h.department_id = p_department)
       and core.gives(u.organization_id, r.id, p_action, p_department))
$$;
-- in any department: where the holding is, or any department for one held everywhere (a pack's action counts where it is used)
create function core.may_somewhere(p_user uuid, p_action text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from core.users u
      join core.holdings h on h.organization_id = u.organization_id and h.user_id = u.id
      join core.roles r on r.id = h.role_id and r.retired_at is null and (r.organization_id is null or r.organization_id = u.organization_id)
     where u.id = p_user and u.retired_at is null
       and h.valid_from <= greatest(h.recorded_at, core.now_safe()) and (h.valid_until is null or h.valid_until > core.now_safe())
       and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id)
       and (core.gives(u.organization_id, r.id, p_action, h.department_id)
            or (h.department_id is null and exists (select 1 from core.departments d where d.organization_id = u.organization_id and d.retired_at is null
                                                      and core.gives(u.organization_id, r.id, p_action, d.id)))))
$$;
-- the live holdings of a user (who holds what where), live as in may: used by the base's privacy rule and by settings
create function core.live_holdings(p_org uuid) returns table (user_id uuid, role_id uuid, department_id uuid)
language sql stable security definer set search_path = '' as $$
  select h.user_id, h.role_id, h.department_id from core.holdings h join core.roles r on r.id = h.role_id and r.retired_at is null
   where h.organization_id = p_org and h.valid_from <= greatest(h.recorded_at, core.now_safe()) and (h.valid_until is null or h.valid_until > core.now_safe())
     and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id)
$$;
-- the actions a role gives wherever a department uses them: its own and its base role's (every action of the organization's layers, for
-- the Owner); a pack's everyday actions count only in a department, so they are not here (Settings, and who may grant what)
create function core.role_actions_of(p_org uuid, p_role uuid) returns setof text language sql stable security definer set search_path = '' as $$
  select a.key from core.actions a join core.roles r on r.id = p_role left join core.roles b on b.id = r.built_on and b.retired_at is null
   where core.layer_on(p_org, a.layer)
     and (r.every_action or exists (select 1 from core.role_actions ra where ra.role_id in (r.id, b.id) and ra.action = a.key))
$$;
-- every action a user may do in a department (null: held everywhere), as may answers it: the directory's rights, one per department
create function core.actions_in(p_user uuid, p_department uuid) returns setof text language sql stable security definer set search_path = '' as $$
  select distinct a.key from core.users u join core.live_holdings(u.organization_id) h on h.user_id = u.id
    join core.roles r on r.id = h.role_id and (r.organization_id is null or r.organization_id = u.organization_id), core.actions a
   where u.id = p_user and u.retired_at is null and (h.department_id is null or h.department_id = p_department)
     and core.gives(u.organization_id, r.id, a.key, p_department)
$$;
-- users who hold an action in a department by a role held there (not everywhere): who works there (§4.3)
create function core.holders_in(p_org uuid, p_action text, p_department uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct h.user_id from core.live_holdings(p_org) h
    join core.users u on u.organization_id = p_org and u.id = h.user_id and u.retired_at is null and u.kind = 'staff'
   where h.department_id = p_department and core.gives(p_org, h.role_id, p_action, p_department)
$$;

-- ── masked by default (§5.2): a pack door reads for the person signed in, unless a refresh or a listener is under way ──
create function core.unmasked_now() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.unmasked m where m.pid = pg_backend_pid() and m.xid = pg_current_xact_id_if_assigned())
$$;
-- the clinic the refresh under way runs for (null: none under way)
create function core.unmasked_for() returns uuid language sql stable security definer set search_path = '' as $$
  select m.organization_id from core.unmasked m where m.pid = pg_backend_pid() and m.xid = pg_current_xact_id_if_assigned()
$$;
-- run a refresh or a listener: the pack doors it calls read unmasked, and its rows keep source_entries for the reader to mask. The mark
-- lives in this transaction only; a refresh that raises takes it back with its own work
create function core.run_refresh(p_fn regprocedure, p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare n int; v_outer regprocedure;
begin
  insert into core.unmasked as m (pid, xid, organization_id, refresh) values (pg_backend_pid(), pg_current_xact_id(), p_org, p_fn)
  on conflict (pid) do update set xid = excluded.xid, organization_id = excluded.organization_id, refresh = excluded.refresh where m.xid is distinct from excluded.xid;
  get diagnostics n = row_count;
  -- nested inside another refresh: the same clinic only; the inner one is the refresh running until it returns
  if n = 0 then
    if core.unmasked_for() is distinct from p_org then perform core.refuse('wrong_organization'); end if;
    select m.refresh into v_outer from core.unmasked m where m.pid = pg_backend_pid();
    update core.unmasked set refresh = p_fn where pid = pg_backend_pid();
  end if;
  execute format('select %s($1, $2)', p_fn::regproc) using p_org, p_items;
  if n > 0 then delete from core.unmasked where pid = pg_backend_pid(); else update core.unmasked set refresh = v_outer where pid = pg_backend_pid(); end if;
end $$;
-- the identity door, in a refresh or a listener under way (§5.2): a pack's refresh reads identity only when its table declared it
-- (reads), so a change of sex or birth date refreshes it; read through a helper or not, it is refused at run time otherwise
create function core.identity_read() returns boolean language plpgsql stable security definer set search_path = '' as $$
declare r regprocedure;
begin
  select m.refresh into r from core.unmasked m where m.pid = pg_backend_pid() and m.xid = pg_current_xact_id_if_assigned();
  if r is null or exists (select 1 from core.derived d where d.refresh = r and (d.layer = 'base' or cardinality(d.reads) > 0)) then return true; end if;
  perform core.refuse('identity_undeclared', format('%s reads identity: its table declares no reads', r));
  return false;
end $$;

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

create function core.declare_layer(p_key text, p_role text, p_schema text, p_labels jsonb default '{}', p_role_block text default null) returns void language plpgsql as $$
#variable_conflict use_variable
begin
  insert into core.layers (key, role_name, schema_name, labels, role_block) values (p_key, p_role, p_schema, p_labels, p_role_block)
  on conflict (key) do update set labels = excluded.labels, role_block = coalesce(core.layers.role_block, excluded.role_block);
end $$;

-- a pack: its requires (no loop) and its block of role ids (§5.2), the one named or the next free from ca; a pack keeps the block it has.
-- charges: the pack charges for work (core change (d), owner 2026-10-08), so a department using it may show the prices other packs keep
-- (the pharmacy's per box), asked of the department without naming the pack; declared again, it says so again
create function core.declare_pack(key text, version int, requires text[] default '{}', labels jsonb default '{}', role_block text default null,
  charges boolean default false)
returns void language plpgsql as $$
#variable_conflict use_variable
declare r text; loop_found boolean; v_block text;
begin
  foreach r in array requires loop
    if not exists (select 1 from core.layers l where l.key = r and l.is_pack) then perform core.refuse('unknown_pack', r); end if;
  end loop;
  v_block := coalesce((select l.role_block from core.layers l where l.key = declare_pack.key), role_block,
    (select to_hex(n) from generate_series(202, 255) n where not exists (select 1 from core.layers l where l.role_block = to_hex(n)) order by n limit 1));
  if exists (select 1 from core.layers l where l.role_block = v_block and l.key <> declare_pack.key) then perform core.refuse('block_taken', v_block); end if;
  insert into core.layers (key, role_name, schema_name, version, requires, labels, is_pack, role_block, charges)
  values (declare_pack.key, 'pack_' || declare_pack.key, declare_pack.key, declare_pack.version, declare_pack.requires, declare_pack.labels, true, v_block,
          coalesce(declare_pack.charges, false))
  on conflict on constraint layers_pkey do update set version = excluded.version, requires = excluded.requires, labels = excluded.labels, charges = excluded.charges;
  -- requires may not loop
  with recursive dep(k, path) as (
    select declare_pack.key, array[declare_pack.key]
    union all
    select q, dep.path || q from dep, core.layers l, unnest(l.requires) q where l.key = dep.k and not (q = any (dep.path[2:])) and array_length(dep.path, 1) < 50)
  select exists (select 1 from dep where array_length(path, 1) > 1 and k = declare_pack.key) into loop_found;
  if loop_found then perform core.refuse('requires_loop', declare_pack.key); end if;
end $$;

-- an action (§3.8). A pack may mark one everyday: where a department uses the pack, the everyday roles hold it (§5.2)
create function core.declare_action(key text, layer text, scope text default 'department', labels jsonb default '{}', everyday boolean default false)
returns void language plpgsql as $$
#variable_conflict use_variable
begin
  perform core.check_prefix(layer, split_part(key, ':', 2));
  if everyday and not (select is_pack from core.layers l where l.key = layer) then perform core.refuse('everyday_for_packs', key); end if;
  -- everyday actions are held only in a department that uses the pack, so an organization-wide one cannot be everyday
  if everyday and scope = 'organization' then perform core.refuse('everyday_for_department', key); end if;
  insert into core.actions (key, layer, scope, labels, everyday) values (declare_action.key, declare_action.layer, declare_action.scope, declare_action.labels, declare_action.everyday)
  on conflict on constraint actions_pkey do update set labels = excluded.labels, scope = excluded.scope, everyday = excluded.everyday
  where core.actions.layer = excluded.layer;
end $$;

-- one action more for a built-in role, never a whole list replaced (§5.2): the core's, the base's, or its own layer's and the packs it
-- requires; only the role's own layer adds to it (a base role gains a pack's action only as an everyday one)
create function core.declare_role_action(layer text, role uuid, action text) returns void language plpgsql as $$
#variable_conflict use_variable
declare r core.roles; a core.actions; v_requires text[];
begin
  select * into r from core.roles x where x.id = role and x.organization_id is null;
  if not found then perform core.refuse('unknown_role', role::text); end if;
  if r.layer <> layer then perform core.refuse('other_layers_role', format('%s may not add to %s', layer, r.key)); end if;
  select coalesce(l.requires, '{}') into v_requires from core.layers l where l.key = r.layer;
  select * into a from core.actions x where x.key = action;
  if not found or not (a.layer in ('core', 'base', r.layer) or a.layer = any (coalesce(v_requires, '{}'))) then
    perform core.refuse('unknown_action', format('%s for %s', action, r.key));
  end if;
  insert into core.role_actions (role_id, action) values (r.id, a.key) on conflict do nothing;
end $$;

-- a built-in role (§3.1, §5.2): built on a base role (it holds what that role holds, as it stands now, plus its own), or everyday (it
-- holds a pack's everyday actions where a department uses the pack). Its actions are added, never replaced. Like every declaration it
-- sits inside its layer: its key in the layer's prefix, its id in the layer's reserved block; an id or a key another role holds is
-- refused, never taken over
create function core.declare_role(id uuid, key text, layer text, name text, actions text[], labels jsonb default '{}', every_action boolean default false,
  built_on uuid default null, everyday boolean default false) returns void language plpgsql as $$
#variable_conflict use_variable
declare a text; v_block text := (select l.role_block from core.layers l where l.key = declare_role.layer);
begin
  if exists (select 1 from core.roles x where x.id = declare_role.id and x.layer is distinct from declare_role.layer) then
    perform core.refuse('other_layers_role', format('%s may not declare %s', layer, key));
  end if;
  if built_on is not null and not exists (select 1 from core.roles b where b.id = built_on and b.organization_id is null and b.layer = 'base'
                                            and not b.every_action and b.built_on is null) then
    perform core.refuse('unknown_role', format('%s is built on %s, which is no base role', key, built_on));
  end if;
  if everyday and layer <> 'base' then perform core.refuse('everyday_for_base', key); end if;
  perform core.check_prefix(layer, key);
  if v_block is null then perform core.refuse('no_role_block', layer); end if;
  if id::text !~ ('^00000000-0000-0000-0000-00000000' || v_block || '[0-9a-f]{2}$') then
    perform core.refuse('outside_block', format('%s roles take ids 00000000-0000-0000-0000-00000000%s__, not %s', layer, v_block, id));
  end if;
  if exists (select 1 from core.roles x where x.organization_id is null and x.key = declare_role.key and x.id <> declare_role.id) then
    perform core.refuse('key_taken', format('%s: another role holds the key %s', layer, key));
  end if;
  insert into core.roles (id, organization_id, layer, key, name, labels, every_action, built_on, everyday)
  values (declare_role.id, null, declare_role.layer, declare_role.key, declare_role.name, declare_role.labels, declare_role.every_action, declare_role.built_on, declare_role.everyday)
  on conflict on constraint roles_pkey do update set name = excluded.name, labels = excluded.labels, every_action = excluded.every_action,
     built_on = excluded.built_on, everyday = excluded.everyday;
  foreach a in array actions loop
    perform core.declare_role_action(layer, declare_role.id, a);
  end loop;
end $$;

-- a code or identifier system: inside its layer's prefix, and never a key another layer holds
create function core.declare_system(key text, layer text, kind text, uri text, version text default null, closed boolean default false,
  check_fn regprocedure default null, licence text default null, labels jsonb default '{}') returns void language plpgsql as $$
#variable_conflict use_variable
declare h jsonb := '{}';
begin
  perform core.check_prefix(layer, key);
  if exists (select 1 from core.systems s where s.key = declare_system.key and s.layer <> declare_system.layer) then
    perform core.refuse('outside_prefix', format('%s may not declare %s: another layer holds it', layer, key));
  end if;
  if check_fn is not null then h := jsonb_build_object('check', core.check_fn(layer, check_fn, 's', 'system check')); end if;
  insert into core.systems (key, layer, kind, uri, version, closed, check_fn, licence, labels, hashes)
  values (declare_system.key, declare_system.layer, declare_system.kind, declare_system.uri, declare_system.version, declare_system.closed, declare_system.check_fn,
          declare_system.licence, declare_system.labels, h)
  on conflict on constraint systems_pkey do update set uri = excluded.uri, version = excluded.version, closed = excluded.closed, check_fn = excluded.check_fn,
     licence = excluded.licence, labels = excluded.labels, hashes = excluded.hashes where core.systems.layer = excluded.layer;
end $$;

-- a licensed list loaded (scripts/import-codes.sh, or the demo's sample): recorded once per load, with the system's licence note as it
-- stands and its count of codes after the load (§5.1 rule 7)
create function core.record_import(p_system text, p_version text, p_source text, p_sample boolean default false) returns void language plpgsql as $$
begin
  if not exists (select 1 from core.systems s where s.key = p_system) then perform core.refuse('unknown_system', p_system); end if;
  if coalesce(trim(p_source), '') = '' then perform core.refuse('source_missing', p_system); end if;
  insert into core.code_imports (system, version, source, licence, sample, codes)
  select p_system, coalesce(nullif(trim(p_version), ''), s.version), trim(p_source), s.licence, coalesce(p_sample, false), (select count(*) from core.codes c where c.system = p_system)
    from core.systems s where s.key = p_system;
end $$;

-- a derived table (§3.8). reads: what of a patient's identity its refresh reads (age, sex), so only such tables are refreshed when it
-- changes (§5.2); a refresh calling the identity door must say so. entries false: the table sends no record entries with its rows, whoever
-- asks (owner, 2026-10-08, F08)
create function core.declare_table(key text, layer text, refresh regprocedure, action text, reads text[] default '{}', entries boolean default true)
returns void language plpgsql as $$
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
  if exists (select 1 from unnest(reads) r where r not in ('age', 'sex')) then perform core.refuse('unknown_read', array_to_string(reads, ',')); end if;
  -- the refresh and the functions of its own schema it names, five calls deep; a call this scan cannot see (built at run time) is
  -- refused when it runs (core.identity_read)
  if cardinality(reads) = 0 and layer <> 'base' and exists (
       with recursive f(oid, depth) as (
         select refresh::oid, 0
         union
         select p.oid, f.depth + 1 from f join pg_proc s on s.oid = f.oid
           join pg_proc p on p.pronamespace = s.pronamespace and p.oid <> s.oid and s.prosrc ~ ('\m' || p.proname || '\M')
          where f.depth < 5)
       select 1 from f join pg_proc p on p.oid = f.oid where p.prosrc ~ 'pack_identity') then
    perform core.refuse('identity_undeclared', format('%s reads identity: declare reads => ''{age}'' or ''{sex}''', key));
  end if;
  insert into core.derived (key, layer, relation, refresh, action, reads, entries, hashes)
  values (declare_table.key, declare_table.layer, rel, declare_table.refresh, declare_table.action, (select coalesce(array_agg(distinct r order by r), '{}') from unnest(reads) r),
          coalesce(declare_table.entries, true), jsonb_build_object('refresh', core.check_fn(layer, refresh, 'v', 'refresh')))
  on conflict on constraint derived_pkey do update set refresh = excluded.refresh, action = excluded.action, reads = excluded.reads, entries = excluded.entries,
     hashes = excluded.hashes
  where core.derived.layer = excluded.layer;
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

-- the nodes a setting's form draws (§5.1 rule 7): each property by its path (a.b), through objects and arrays of objects; a $ref is a
-- datatype, a node of its own (a pack's editor draws it)
create function core.shape_nodes(p_shape jsonb) returns table (path text, node jsonb) language sql immutable as $$
  with recursive n(path, node) as (
    select k, v from jsonb_each(coalesce(p_shape -> 'properties', '{}')) x(k, v)
    union all
    select n.path || '.' || x.k, x.v from n, jsonb_each(coalesce(n.node -> 'properties', n.node -> 'items' -> 'properties', '{}')) x(k, v)
  ) select path, node from n
$$;
create function core.node_is(p_node jsonb, p_types text[]) returns boolean language sql immutable as $$
  select exists (select 1 from jsonb_array_elements_text(case jsonb_typeof(p_node -> 'type') when 'array' then p_node -> 'type'
    when 'string' then jsonb_build_array(p_node -> 'type') else '[]' end) t where t = any (p_types))
$$;
-- what a form needs, checked once at declaration: each field names a node of the shape, once, with its words; a unit only on a number,
-- choices only of its enum (on a list, of its items': the chips to tick; matched as text, so a number's too); a form shows on a pack's
-- page (a clinic-wide setting of a pack) or a department's card (a per-department one), only for a pack, one value per owner, and then
-- every node it draws has its words; a field declared later (a placeholder, drawn read-only) holds its value by the shape's const
create function core.check_fields(p_key text, p_layer text, p_owner text, p_many boolean, p_shape jsonb, p_fields jsonb, p_form text) returns void language plpgsql as $$
declare f jsonb; nd jsonb; v jsonb; c text; v_owner text := case p_form when 'pack' then 'organization' when 'department' then 'department' end;
begin
  if jsonb_typeof(p_fields) is distinct from 'array' then perform core.refuse('bad_fields', p_key); end if;
  if p_form is not null and not exists (select 1 from core.layers l where l.key = p_layer and l.is_pack) then perform core.refuse('not_a_pack', p_key); end if;
  if p_owner is distinct from coalesce(v_owner, p_owner) then
    perform core.refuse('wrong_owner', format('%s: a form on the %s edits a setting of the %s', p_key, p_form, v_owner));
  end if;
  if p_form is not null and p_many then perform core.refuse('form_many', p_key); end if;
  for f in select x from jsonb_array_elements(p_fields) x loop
    nd := (select n.node from core.shape_nodes(p_shape) n where n.path = f ->> 'key');
    if nd is null then perform core.refuse('unknown_field', p_key || ': ' || coalesce(f ->> 'key', '(no key)')); end if;
    if coalesce(f -> 'labels' ->> 'en', '') = '' then perform core.refuse('label_missing', p_key || ': ' || (f ->> 'key')); end if;
    if f ? 'later' and (f -> 'later' <> 'true'::jsonb or not nd ? 'const') then perform core.refuse('bad_fields', p_key || ': ' || (f ->> 'key') || ' later, with no const'); end if;
    v := case when core.node_is(nd, array['array']) and nd ? 'items' then nd -> 'items' else nd end;   -- a list's unit and choices are its items'
    if f ? 'unit' and not core.node_is(v, array['number', 'integer']) then perform core.refuse('unit_not_number', p_key || ': ' || (f ->> 'key')); end if;
    if f ? 'choices' and exists (select 1 from jsonb_object_keys(f -> 'choices') x
        where not exists (select 1 from jsonb_array_elements(case jsonb_typeof(v -> 'enum') when 'array' then v -> 'enum' else '[]' end) e where e #>> '{}' = x)) then
      perform core.refuse('unknown_choice', p_key || ': ' || (f ->> 'key'));
    end if;
  end loop;
  if (select count(*) <> count(distinct x ->> 'key') from jsonb_array_elements(p_fields) x) then perform core.refuse('duplicate', p_key || ': field'); end if;
  if p_form is not null then
    c := (select n.path from core.shape_nodes(p_shape) n where not exists (select 1 from jsonb_array_elements(p_fields) x where x ->> 'key' = n.path) order by n.path limit 1);
    if c is not null then perform core.refuse('field_unlabelled', p_key || ': ' || c); end if;
  end if;
end $$;

-- action: what writes it, when not manage:settings (score.signed_off: sign:score, a clinician's act, held in any department)
create function core.declare_setting(key text, layer text, owner text, shape jsonb, check_fn regprocedure default null, many boolean default false, labels jsonb default '{}',
  fields jsonb default '[]', form text default null, action text default null)
returns void language plpgsql as $$
#variable_conflict use_variable
declare s jsonb := shape || jsonb_build_object('$defs', core.datatypes() || coalesce(shape -> '$defs', '{}'));
begin
  perform core.check_prefix(layer, key);
  if not extensions.jsonschema_is_valid(s::json) then perform core.refuse('bad_schema', key); end if;
  perform core.check_fields(key, layer, owner, many, s, coalesce(fields, '[]'), form);
  if action is not null and not exists (select 1 from core.actions a where a.key = action and a.layer in ('core', 'base', declare_setting.layer)) then
    perform core.refuse('unknown_action', action);
  end if;
  insert into core.setting_keys (key, layer, owner_kind, shape, check_fn, many, labels, fields, form, action, hashes)
  values (declare_setting.key, declare_setting.layer, owner, s, declare_setting.check_fn, declare_setting.many, declare_setting.labels, coalesce(declare_setting.fields, '[]'), declare_setting.form,
          declare_setting.action,
          case when declare_setting.check_fn is null then '{}' else jsonb_build_object('check', core.check_fn(layer, declare_setting.check_fn, 's', 'setting check')) end)
  on conflict on constraint setting_keys_pkey do update set shape = excluded.shape, check_fn = excluded.check_fn, many = excluded.many, labels = excluded.labels,
     fields = excluded.fields, form = excluded.form, action = excluded.action, hashes = excluded.hashes where core.setting_keys.layer = excluded.layer;
end $$;

-- ── scores (§5.1 rule 8): a declared points table with a version and its source; the server is the only place that adds it up ──
-- an integer, as a points or a band's bound must be
create function core.is_int(v jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
$$;
-- one item's points for one value: {points}, or {problem} (unknown_choice, not_yes_no, not_a_number, too_precise, out_of_range)
create function core.score_points(p_item jsonb, p_value jsonb) returns jsonb language plpgsql immutable as $$
declare v text := p_value #>> '{}'; n numeric; r jsonb;
begin
  if p_item ->> 'input' = 'choice' then
    select c into r from jsonb_array_elements(p_item -> 'choices') c where jsonb_typeof(p_value) in ('string', 'number') and c ->> 'value' = v limit 1;
    return case when r is null then '{"problem":"unknown_choice"}' else jsonb_build_object('points', (r ->> 'points')::int) end;
  end if;
  if p_item ->> 'input' = 'yes_no' then
    if jsonb_typeof(p_value) <> 'boolean' then return '{"problem":"not_yes_no"}'; end if;
    return jsonb_build_object('points', (p_item -> 'points' ->> case when v = 'true' then 'yes' else 'no' end)::int);
  end if;
  if jsonb_typeof(p_value) not in ('string', 'number') or v !~ '^-?[0-9]+(\.[0-9]+)?$' then return '{"problem":"not_a_number"}'; end if;
  if coalesce(length(substring(v from '\.([0-9]+)$')), 0) > coalesce((p_item ->> 'decimals')::int, 0) then return '{"problem":"too_precise"}'; end if;
  n := v::numeric;
  if n < coalesce((p_item ->> 'min')::numeric, n) or n > coalesce((p_item ->> 'max')::numeric, n) then return '{"problem":"out_of_range"}'; end if;
  select x into r from jsonb_array_elements(p_item -> 'ranges') x where n >= coalesce((x ->> 'min')::numeric, n) and n <= coalesce((x ->> 'max')::numeric, n) limit 1;
  return case when r is null then '{"problem":"out_of_range"}' else jsonb_build_object('points', (r ->> 'points')::int) end;
end $$;

-- the lowest and highest points of one item (the bands must cover every total)
create function core.score_item_span(p_item jsonb) returns int[] language sql immutable as $$
  select array[min(p), max(p)] from (
    select (c ->> 'points')::int p from jsonb_array_elements(case when p_item ->> 'input' = 'choice' then p_item -> 'choices' when p_item ->> 'input' = 'number' then p_item -> 'ranges' else '[]' end) c
    union all select (p_item -> 'points' ->> x)::int from unnest(array['yes', 'no']) x where p_item ->> 'input' = 'yes_no') q
$$;

-- a score's table (§5.1 rule 8), checked once: a key inside its layer's prefix, its source, its items (each with its words, its input
-- and how it scores: points per choice, per yes and no, per range of a number, ranges in order and touching at the number's step) and
-- the total's bands (in order, touching, covering every total, each with its words and a state tone or none). A version once declared
-- never changes (version_exists); a new version is a new row and the old stay
create function core.declare_score(key text, layer text, version text, source text, items jsonb, bands jsonb, labels jsonb default '{}', short text default null,
  alias text default null, coding jsonb default null) returns void language plpgsql as $$
#variable_conflict use_variable
declare it jsonb; x jsonb; prev jsonb; v_step numeric; v_lo int := 0; v_hi int := 0; v_span int[]; old core.scores; n int;
begin
  source := btrim(source, E' \t\r\n');   -- stored trimmed (spaces and line ends): the same call again finds the same row
  perform core.check_prefix(layer, key);
  if exists (select 1 from core.scores s where s.key = declare_score.key and s.layer <> declare_score.layer) then perform core.refuse('outside_prefix', key); end if;
  if coalesce(trim(source), '') = '' then perform core.refuse('source_missing', key); end if;
  if coalesce(labels ->> 'en', '') = '' then perform core.refuse('label_missing', key); end if;
  if alias is not null and exists (select 1 from core.scores s where s.alias = declare_score.alias and s.key <> declare_score.key) then perform core.refuse('alias_taken', alias); end if;
  if coding is not null and not exists (select 1 from core.systems s where s.key = coding ->> 'system') then perform core.refuse('unknown_system', coding ->> 'system'); end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then perform core.refuse('no_items', key); end if;
  if (select count(*) <> count(distinct i ->> 'key') from jsonb_array_elements(items) i) then perform core.refuse('duplicate', key || ': item'); end if;
  for it in select i from jsonb_array_elements(items) i loop
    if coalesce(it ->> 'key', '') !~ '^[a-z][a-z0-9_]*$' then perform core.refuse('bad_item', key || ': ' || coalesce(it ->> 'key', '(no key)')); end if;
    if coalesce(it -> 'labels' ->> 'en', '') = '' then perform core.refuse('label_missing', key || ': ' || (it ->> 'key')); end if;
    if it ? 'coding' and not exists (select 1 from core.systems s where s.key = it -> 'coding' ->> 'system') then perform core.refuse('unknown_system', it -> 'coding' ->> 'system'); end if;
    if it ->> 'input' = 'choice' then
      if jsonb_typeof(it -> 'choices') is distinct from 'array' or jsonb_array_length(it -> 'choices') = 0 then perform core.refuse('no_choices', key || ': ' || (it ->> 'key')); end if;
      if (select count(*) <> count(distinct c ->> 'value') from jsonb_array_elements(it -> 'choices') c) then perform core.refuse('duplicate', key || ': ' || (it ->> 'key') || ' choice'); end if;
      -- a choice's value is a text (the card and the record match it as one)
      if exists (select 1 from jsonb_array_elements(it -> 'choices') c where jsonb_typeof(c -> 'value') is distinct from 'string' or c ->> 'value' = '') then
        perform core.refuse('bad_choice', key || ': ' || (it ->> 'key') || ' choice');
      end if;
      if exists (select 1 from jsonb_array_elements(it -> 'choices') c where coalesce(c -> 'labels' ->> 'en', '') = '') then
        perform core.refuse('label_missing', key || ': ' || (it ->> 'key') || ' choice');
      end if;
      if exists (select 1 from jsonb_array_elements(it -> 'choices') c where not core.is_int(c -> 'points')) then perform core.refuse('bad_points', key || ': ' || (it ->> 'key')); end if;
    elsif it ->> 'input' = 'yes_no' then
      if not (core.is_int(it -> 'points' -> 'yes') and core.is_int(it -> 'points' -> 'no')) then perform core.refuse('bad_points', key || ': ' || (it ->> 'key')); end if;
    elsif it ->> 'input' = 'number' then
      if it ? 'decimals' and not (core.is_int(it -> 'decimals') and (it ->> 'decimals')::int between 0 and 4) then perform core.refuse('bad_number', key || ': ' || (it ->> 'key')); end if;
      if jsonb_typeof(it -> 'ranges') is distinct from 'array' or jsonb_array_length(it -> 'ranges') = 0 then perform core.refuse('no_ranges', key || ': ' || (it ->> 'key')); end if;
      v_step := power(10::numeric, -coalesce((it ->> 'decimals')::int, 0)); prev := null; n := 0;
      -- a plausible min and max: numbers, at the number's step, min ≤ max (core.score compares a value with them)
      if exists (select 1 from unnest(array['min', 'max']) k where it ? k
                 and case when jsonb_typeof(it -> k) <> 'number' then true else (it ->> k)::numeric / v_step <> trunc((it ->> k)::numeric / v_step) end) then
        perform core.refuse('bad_number', key || ': ' || (it ->> 'key') || ' min/max');
      end if;
      if (it ->> 'min')::numeric > (it ->> 'max')::numeric then perform core.refuse('bad_number', key || ': ' || (it ->> 'key') || ' min above max'); end if;
      for x in select r from jsonb_array_elements(it -> 'ranges') r loop
        n := n + 1;
        if not core.is_int(x -> 'points') then perform core.refuse('bad_points', key || ': ' || (it ->> 'key')); end if;
        if exists (select 1 from unnest(array['min', 'max']) k where x ? k and jsonb_typeof(x -> k) <> 'number') then perform core.refuse('bad_number', key || ': ' || (it ->> 'key')); end if;
        -- a bound at the number's own step (35.0 with one decimal, never 35.05)
        if exists (select 1 from unnest(array[(x ->> 'min')::numeric, (x ->> 'max')::numeric]) v where v / v_step <> trunc(v / v_step)) then
          perform core.refuse('bad_number', key || ': ' || (it ->> 'key'));
        end if;
        if (n > 1 and not x ? 'min') or (n < jsonb_array_length(it -> 'ranges') and not x ? 'max') or (x ->> 'min')::numeric > (x ->> 'max')::numeric then
          perform core.refuse('ranges_open', key || ': ' || (it ->> 'key'));
        end if;
        if prev is not null and (x ->> 'min')::numeric < (prev ->> 'max')::numeric + v_step then perform core.refuse('ranges_overlap', key || ': ' || (it ->> 'key')); end if;
        if prev is not null and (x ->> 'min')::numeric > (prev ->> 'max')::numeric + v_step then perform core.refuse('ranges_gap', key || ': ' || (it ->> 'key')); end if;
        prev := x;
      end loop;
      if jsonb_typeof(it -> 'unit') is distinct from 'string' or trim(it ->> 'unit') = '' then perform core.refuse('unit_missing', key || ': ' || (it ->> 'key')); end if;
    else
      perform core.refuse('unknown_input', key || ': ' || (it ->> 'key'));
    end if;
    v_span := core.score_item_span(it); v_lo := v_lo + v_span[1]; v_hi := v_hi + v_span[2];
  end loop;
  if jsonb_typeof(bands) is distinct from 'array' or jsonb_array_length(bands) = 0 then perform core.refuse('no_bands', key); end if;
  if (select count(*) <> count(distinct b ->> 'key') from jsonb_array_elements(bands) b) then perform core.refuse('duplicate', key || ': band'); end if;
  prev := null;
  for x in select b from jsonb_array_elements(bands) b loop
    if coalesce(x ->> 'key', '') !~ '^[a-z][a-z0-9_]*$' or coalesce(x -> 'labels' ->> 'en', '') = '' then perform core.refuse('label_missing', key || ': band'); end if;
    if not (core.is_int(x -> 'min') and core.is_int(x -> 'max')) or (x ->> 'min')::int > (x ->> 'max')::int then perform core.refuse('bad_band', key || ': ' || (x ->> 'key')); end if;
    if x ? 'tone' and jsonb_typeof(x -> 'tone') <> 'null' and not (x ->> 'tone' in ('ok', 'info', 'warn', 'danger')) then perform core.refuse('unknown_tone', key || ': ' || (x ->> 'tone')); end if;
    if prev is not null and (x ->> 'min')::int <= (prev ->> 'max')::int then perform core.refuse('bands_overlap', key || ': ' || (x ->> 'key')); end if;
    if prev is not null and (x ->> 'min')::int > (prev ->> 'max')::int + 1 then perform core.refuse('bands_gap', key || ': ' || (x ->> 'key')); end if;
    prev := x;
  end loop;
  if (bands -> 0 ->> 'min')::int > v_lo or (prev ->> 'max')::int < v_hi then perform core.refuse('bands_cover', format('%s: the totals run %s to %s', key, v_lo, v_hi)); end if;
  select * into old from core.scores s where s.key = declare_score.key and s.version = declare_score.version;
  if found then
    if (old.items, old.bands, old.source, old.labels, old.short, old.alias, old.coding) is distinct from (items, bands, source, labels, coalesce(short, labels ->> 'en'), alias, coding) then
      perform core.refuse('version_exists', format('%s %s is declared: a changed table is a new version', key, version));
    end if;
    return;
  end if;
  insert into core.scores (key, version, layer, labels, short, alias, source, coding, items, bands)
  values (declare_score.key, declare_score.version, declare_score.layer, declare_score.labels, coalesce(declare_score.short, declare_score.labels ->> 'en'),
          declare_score.alias, declare_score.source, declare_score.coding, declare_score.items, declare_score.bands);
end $$;
-- a version retired: new entries may no longer use it (score_retired); its entries keep it
create function core.retire_score(p_key text, p_version text) returns void language plpgsql as $$
begin
  update core.scores set retired_at = coalesce(retired_at, now()) where key = p_key and version = p_version;
  if not found then perform core.refuse('unknown_score', p_key || ' ' || p_version); end if;
end $$;

-- the one place a score is added up: each item's points, the total and its band once every item is answered. No version: the latest
-- in use. A value it cannot score is a problem of its item, never a raise, so a card can ask while the clinician types
create function core.score(p_key text, p_version text, p_inputs jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s core.scores; it jsonb; r jsonb; v_in jsonb := coalesce(p_inputs, '{}'); v_items jsonb := '[]'; v_total int := 0; v_missing text[] := '{}';
        v_problems jsonb := '[]'; v_done boolean; b jsonb;
begin
  select * into s from core.scores x where x.key = p_key and (x.version = p_version or (p_version is null and x.retired_at is null)) order by x.position desc limit 1;
  if not found then perform core.refuse('unknown_score', p_key || coalesce(' ' || p_version, '')); end if;
  if jsonb_typeof(v_in) <> 'object' then perform core.refuse('bad_input', 'the inputs are an object by item'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('item', k, 'code', 'unknown_item')), '[]') into v_problems from jsonb_object_keys(v_in) k
   where not exists (select 1 from jsonb_array_elements(s.items) i where i ->> 'key' = k);
  for it in select i from jsonb_array_elements(s.items) i loop
    if coalesce(jsonb_typeof(v_in -> (it ->> 'key')), 'null') = 'null' then
      v_missing := v_missing || (it ->> 'key'); v_items := v_items || jsonb_build_object('key', it ->> 'key', 'points', null);
      continue;
    end if;
    r := core.score_points(it, v_in -> (it ->> 'key'));
    if r ? 'problem' then v_problems := v_problems || jsonb_build_object('item', it ->> 'key', 'code', r ->> 'problem');
    else v_total := v_total + (r ->> 'points')::int; end if;
    v_items := v_items || jsonb_build_object('key', it ->> 'key', 'value', v_in -> (it ->> 'key'), 'points', r -> 'points');
  end loop;
  v_done := cardinality(v_missing) = 0 and jsonb_array_length(v_problems) = 0;
  if v_done then select x into b from jsonb_array_elements(s.bands) x where v_total between (x ->> 'min')::int and (x ->> 'max')::int limit 1; end if;
  return jsonb_build_object('score', s.key, 'version', s.version, 'retired', s.retired_at is not null, 'items', v_items, 'so_far', v_total,
    'total', case when v_done then v_total end, 'complete', v_done, 'band', b, 'missing', to_jsonb(v_missing), 'problems', v_problems);
end $$;

-- a screen: its work, the action its tab needs (the core's, the base's or its own layer's; null: anyone working there) and, for a pack's,
-- the base screens of the same work it stands in for (pharmacy.dispensing replaces base.bench, §5.1 rules 4 and 6)
create function core.declare_screen(key text, layer text, work text, labels jsonb default '{}', action text default null, replaces text[] default '{}')
returns void language plpgsql as $$
#variable_conflict use_variable
declare r text;
begin
  if split_part(key, '.', 1) <> layer then perform core.refuse('outside_prefix', format('%s may not declare screen %s', layer, key)); end if;
  if action is not null and not exists (select 1 from core.actions a where a.key = action and a.layer in ('core', 'base', declare_screen.layer)) then
    perform core.refuse('unknown_action', action);
  end if;
  -- one board per place (§5.1 rule 4): beds, chairs and cubicles show on the base's board only; a pack adds its tile line and buttons
  if 'base.beds' = any (coalesce(replaces, '{}')) then
    perform core.refuse('board_is_base', format('%s may not stand in for base.beds: a pack adds a line and buttons to its tiles', key));
  end if;
  foreach r in array coalesce(replaces, '{}') loop
    if not exists (select 1 from core.screens s where s.key = r and s.layer = 'base' and (s.work = declare_screen.work or s.work = 'any')) then
      perform core.refuse('unknown_screen', format('%s replaces %s, which is no base screen of its work', key, r));
    end if;
  end loop;
  insert into core.screens (key, layer, work, action, replaces, labels)
  values (declare_screen.key, declare_screen.layer, declare_screen.work, declare_screen.action, coalesce(declare_screen.replaces, '{}'), declare_screen.labels)
  on conflict on constraint screens_pkey do update set work = excluded.work, action = excluded.action, replaces = excluded.replaces, labels = excluded.labels
  where core.screens.layer = excluded.layer;
end $$;

-- ── starter setups (§5.2) ──
-- a thing a setup adds takes its id from the department and its key (a place's key, a service's code, a preset's shortcut), never from
-- its place in the list, so the same setup on the same department always names the same things
create function core.setup_id(p_department uuid, p_kind text, p_key text) returns uuid language sql immutable as $$
  select core.uuid5(p_department, 'setup:' || p_kind || ':' || lower(trim(p_key)))
$$;
-- a row's value once in a list (by a field, compared as folded text)
create function core.setup_once(p_rows jsonb, p_field text) returns boolean language sql immutable as $$
  select count(*) = count(distinct lower(trim(x ->> p_field))) from jsonb_array_elements(p_rows) x where x ? p_field
$$;

-- a setup for a kind of department, checked once: its key inside its layer's prefix, its work, its words; the packs it ticks (its own
-- layer's, or those it requires); one-per-department settings only (a clinic-wide key is on the pack's page, §5.1 rule 7), each of its
-- layer, the base's or a pack it ticks, and in its shape; places, services and presets each with its match fields, once, in their shapes;
-- a Screens line as the department's check would take it once the packs are ticked
create function core.declare_setup(key text, layer text, work text, labels jsonb, packs text[] default '{}', screens jsonb default null,
  places jsonb default '[]', services jsonb default '[]', presets jsonb default '[]', settings jsonb default '{}', help jsonb default '{}')
returns void language plpgsql as $$
#variable_conflict use_variable
declare l core.layers; allowed text[]; k text; v jsonb; sk core.setting_keys; sc core.screens; v_line text[];
begin
  perform core.check_prefix(layer, key);
  if exists (select 1 from core.setups s where s.key = declare_setup.key and s.layer <> declare_setup.layer) then perform core.refuse('outside_prefix', key); end if;
  select * into l from core.layers x where x.key = declare_setup.layer;
  if not found then perform core.refuse('unknown_layer', layer); end if;
  if work is null or work not in ('desk', 'visits', 'stays', 'bench') then perform core.refuse('wrong_work', coalesce(work, '(none)')); end if;
  if coalesce(trim(labels ->> 'en'), '') = '' then perform core.refuse('label_missing', key); end if;
  allowed := case when l.is_pack then array[l.key] || l.requires else '{}' end;
  foreach k in array coalesce(packs, '{}') loop
    if not exists (select 1 from core.layers x where x.key = k and x.is_pack) then perform core.refuse('unknown_pack', k); end if;
    if not (k = any (allowed)) then perform core.refuse('other_pack', format('%s may not tick %s', key, k)); end if;
  end loop;
  if cardinality(packs) <> (select count(distinct x) from unnest(packs) x) then perform core.refuse('duplicate', 'pack'); end if;
  for k, v in select x.key, x.value from jsonb_each(coalesce(settings, '{}')) x loop
    select * into sk from core.setting_keys x where x.key = k;
    if not found then perform core.refuse('unknown_setting', k); end if;
    if k in ('department.packs', 'department.screens', 'department.setup') then perform core.refuse('not_a_setting', format('%s: name it as the setup''s packs or screens', k)); end if;
    if sk.owner_kind <> 'department' or sk.many then perform core.refuse('wrong_owner', format('%s is not one per department: a clinic-wide key is set on its pack''s page', k)); end if;
    if not (sk.layer in ('core', 'base') or sk.layer = any (allowed)) then perform core.refuse('other_pack', k); end if;
    if not extensions.jsonb_matches_schema(sk.shape::json, v) then perform core.refuse('bad_shape', k); end if;
  end loop;
  if jsonb_typeof(places) <> 'array' or jsonb_typeof(services) <> 'array' or jsonb_typeof(presets) <> 'array' then perform core.refuse('bad_setup', key); end if;
  for v in select x from jsonb_array_elements(places) x loop
    if coalesce(v ->> 'key', '') !~ '^[a-z0-9][a-z0-9_-]*$' or coalesce(trim(v ->> 'name'), '') = '' or coalesce(v ->> 'label', 'bed') not in ('bed', 'room', 'chair', 'cubicle')
       or exists (select 1 from jsonb_object_keys(v) f where f not in ('key', 'name', 'label')) then
      perform core.refuse('bad_place', v::text);
    end if;
  end loop;
  if not (core.setup_once(places, 'key') and core.setup_once(places, 'name')) then perform core.refuse('duplicate', 'place'); end if;
  select * into sk from core.setting_keys x where x.key = 'service';
  for v in select x from jsonb_array_elements(services) x loop
    if not extensions.jsonb_matches_schema(sk.shape::json, v) then perform core.refuse('bad_shape', 'service ' || coalesce(v ->> 'code', '?')); end if;
  end loop;
  if not (core.setup_once(services, 'code') and core.setup_once(services, 'name')) then perform core.refuse('duplicate', 'service'); end if;
  select * into sk from core.setting_keys x where x.key = 'preset';
  for v in select x from jsonb_array_elements(presets) x loop
    -- a preset is matched by its shortcut; the department it is for is the one the setup runs on
    if coalesce(v ->> 'shortcut', '') !~ '^[a-z0-9_-]+$' or v ? 'department_id' then perform core.refuse('bad_preset', coalesce(v ->> 'name', '?')); end if;
    if not extensions.jsonb_matches_schema(sk.shape::json, v) then perform core.refuse('bad_shape', 'preset ' || coalesce(v ->> 'name', '?')); end if;
  end loop;
  if not (core.setup_once(presets, 'shortcut') and core.setup_once(presets, 'name')) then perform core.refuse('duplicate', 'preset'); end if;
  if screens is not null then
    if jsonb_typeof(screens -> 'screens') <> 'array' or jsonb_array_length(screens -> 'screens') = 0 or (screens ? 'opens' and jsonb_typeof(screens -> 'opens') <> 'string')
       or exists (select 1 from jsonb_object_keys(screens) f where f not in ('screens', 'opens')) then
      perform core.refuse('bad_screens', key);
    end if;
    v_line := array(select x from jsonb_array_elements_text(screens -> 'screens') x);
    foreach k in array v_line loop
      select * into sc from core.screens x where x.key = k;
      if not found then perform core.refuse('unknown_screen', k); end if;
      if sc.work not in (work, 'any') then perform core.refuse('wrong_work', k); end if;
      if not (sc.layer = 'base' or sc.layer = any (packs)) then perform core.refuse('pack_not_used', k); end if;
      if sc.replaces && v_line then perform core.refuse('replaced', k); end if;
    end loop;
    if cardinality(v_line) <> (select count(distinct x) from unnest(v_line) x) then perform core.refuse('duplicate', 'screen'); end if;
    if work = 'stays' and not ('base.beds' = any (v_line)) then perform core.refuse('no_board', key); end if;
    if screens ? 'opens' and not ((screens ->> 'opens') = any (v_line)) then perform core.refuse('opens_off_line', screens ->> 'opens'); end if;
  end if;
  insert into core.setups (key, layer, work, labels, help, packs, screens, places, services, presets, settings)
  values (declare_setup.key, declare_setup.layer, declare_setup.work, declare_setup.labels, coalesce(declare_setup.help, '{}'), coalesce(declare_setup.packs, '{}'),
          declare_setup.screens, declare_setup.places, declare_setup.services, declare_setup.presets, coalesce(declare_setup.settings, '{}'))
  on conflict on constraint setups_pkey do update set work = excluded.work, labels = excluded.labels, help = excluded.help, packs = excluded.packs, screens = excluded.screens,
     places = excluded.places, services = excluded.services, presets = excluded.presets, settings = excluded.settings
  where core.setups.layer = excluded.layer;
end $$;

-- a pack's operation on its own table that holds no entries (spec §5.3: the pharmacy's stock): a definer function of the pack (owned,
-- in its schema, search_path pinned) taking (organization, department, user, arguments) and returning jsonb; public.pack_op runs it
-- for the user signed in, only where they hold its action in a department that uses the pack. patients: it returns patient ids (its
-- answer names each in patient_ids), and the core logs a read of each (owner, 2026-10-08, F28)
create function core.declare_op(key text, layer text, fn regprocedure, action text, patients boolean default false) returns void language plpgsql as $$
#variable_conflict use_variable
begin
  perform core.check_prefix(layer, key);
  if not exists (select 1 from core.actions a where a.key = action) then perform core.refuse('unknown_action', action); end if;
  if pg_get_function_identity_arguments(fn) <> 'p_org uuid, p_department uuid, p_user uuid, p_args jsonb' then
    perform core.refuse('wrong_signature', format('op %s must take (p_org uuid, p_department uuid, p_user uuid, p_args jsonb)', fn));
  end if;
  insert into core.ops (key, layer, fn, action, patients, hashes) values (key, layer, fn, action, coalesce(patients, false), jsonb_build_object('fn', core.check_fn(layer, fn, 'v', 'op')))
  on conflict on constraint ops_pkey do update set fn = excluded.fn, action = excluded.action, patients = excluded.patients, hashes = excluded.hashes;
end $$;

-- a pack's own table that holds a patient and is not rebuilt from entries (spec §3.11; owner, 2026-10-08, D17): Erase reaches it. It is
-- the layer's (its prefix and schema), holds organization_id and patient_id, and is no derived table (Erase empties those already). clear
-- null: Erase removes the patient's rows (the eraser may delete them); else it keeps them and empties these columns, the patient link
-- among them (the eraser may update each; each may be empty): billing's money keeps its amounts and receipt numbers (D18)
create function core.declare_store(key text, layer text, clear text[] default null) returns void language plpgsql as $$
#variable_conflict use_variable
declare rel regclass := to_regclass(key); c text;
begin
  if rel is null then perform core.refuse('no_such_table', key); end if;
  perform core.check_prefix(layer, key);
  if split_part(key, '.', 1) <> (select l.schema_name from core.layers l where l.key = layer) then perform core.refuse('wrong_schema', key); end if;
  if exists (select 1 from core.derived d where d.relation = rel) then perform core.refuse('derived_table', key); end if;
  foreach c in array array['organization_id', 'patient_id'] loop
    if not exists (select 1 from pg_attribute a where a.attrelid = rel and a.attname = c and a.attnum > 0 and not a.attisdropped) then
      perform core.refuse('store_needs', format('%s needs column %s', key, c));
    end if;
  end loop;
  if clear is null then
    if not (has_table_privilege('core_eraser', rel, 'SELECT') and has_table_privilege('core_eraser', rel, 'DELETE')) then
      perform core.refuse('eraser_cannot', format('the eraser may not delete from %s', key));
    end if;
  else
    if not ('patient_id' = any (clear)) then perform core.refuse('keeps_patient', format('%s: a row kept after an Erase loses its patient', key)); end if;
    foreach c in array clear loop
      if not exists (select 1 from pg_attribute a where a.attrelid = rel and a.attname = c and a.attnum > 0 and not a.attisdropped) then
        perform core.refuse('unknown_column', format('%s.%s', key, c));
      end if;
      if exists (select 1 from pg_attribute a where a.attrelid = rel and a.attname = c and a.attnotnull) then perform core.refuse('not_nullable', format('%s.%s', key, c)); end if;
      if not has_column_privilege('core_eraser', rel, c, 'UPDATE') then perform core.refuse('eraser_cannot', format('the eraser may not empty %s.%s', key, c)); end if;
    end loop;
    if not has_table_privilege('core_eraser', rel, 'SELECT') then perform core.refuse('eraser_cannot', format('the eraser may not read %s', key)); end if;
  end if;
  insert into core.stores (key, layer, relation, clear) values (declare_store.key, declare_store.layer, rel, declare_store.clear)
  on conflict on constraint stores_pkey do update set relation = excluded.relation, clear = excluded.clear where core.stores.layer = excluded.layer;
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
-- the action that writes a type: write:<type>, except a pack's type extending the base's order (an order carrying the pack's own words,
-- radiology's side), which whoever may order writes with the base's write:order, wherever they order from (spec §5.5, core change (a))
create function core.write_action(p_type text) returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from core.types t where t.key = p_type and t.layer <> 'base' and t.base_type = 'order') then 'write:order' else 'write:' || p_type end
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
-- the clinic's header on every printout (§3.13 Printing, the owner's (p3), 2026-10-08): its name, logo, address, phone and tax number;
-- the logo a small picture kept in the setting itself (a data: URI, PNG, JPEG or WebP, no larger than 100,000 characters), since it
-- goes with every directory read; edited in Settings → Organization by whoever changes settings everywhere
select core.declare_setting('organization.header', 'core', 'organization',
  '{"type":"object","required":["name"],"additionalProperties":false,"properties":{
    "name":{"type":"string","minLength":1,"maxLength":120},
    "logo":{"type":"string","maxLength":100000,"pattern":"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$"},
    "address":{"type":"string","maxLength":300},"phone":{"type":"string","maxLength":60},"tax_number":{"type":"string","maxLength":60}}}',
  labels => '{"en":"The clinic''s header on printouts"}');

-- a score signed off for this clinic (§5.1 rule 8): who and when are the setting's; a version unsigned still works. One live sign-off
-- per score version; written by sign:score (a clinician's act, held in any department), never by manage:settings
select core.declare_action('sign:score', 'core', 'organization', '{"en":"Sign off a score for the clinic"}');
create function core.score_signed_check(p_where jsonb, p_data jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from core.scores s where s.key = p_data ->> 'score' and s.version = p_data ->> 'version')
      then jsonb_build_array(jsonb_build_object('code', 'unknown_score', 'level', 'refuse', 'field', 'version'))
    when exists (select 1 from core.settings_at((p_where ->> 'organization_id')::uuid, 'score.signed_off') x
                  where x.thing_id <> (p_where ->> 'thing_id')::uuid and x.data ->> 'score' = p_data ->> 'score' and x.data ->> 'version' = p_data ->> 'version')
      then jsonb_build_array(jsonb_build_object('code', 'already_signed', 'level', 'refuse', 'field', 'version'))
    else '[]'::jsonb end
$$;
select core.declare_setting('score.signed_off', 'core', 'organization',
  '{"type":"object","required":["score","version"],"additionalProperties":false,"properties":{"score":{"type":"string"},"version":{"type":"string"},"note":{"type":"string"}}}',
  'core.score_signed_check(jsonb,jsonb)', true, '{"en":"Score signed off"}', action => 'sign:score');

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
