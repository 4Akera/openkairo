-- 04 · core: the reader, the only way out (spec/openCare.md §3.10). One VOLATILE function; every read is logged in the same
-- transaction; every row passes the visibility rules; a hidden entry is a placeholder, and a derived row about a hidden item is withheld.

set client_min_messages = warning;

-- one entry as the reader returns it: the type's line, or a placeholder with no data and no author when hidden
create function core.line_of(e core.entries) returns text language plpgsql stable security definer set search_path = '' as $$
declare t core.types; v text;
begin
  select * into t from core.types x where x.key = e.type and x.version = e.type_version;
  begin
    execute format('select %s($1)', t.line::regproc) into v using to_jsonb(e);
  exception when others then v := null;
  end;
  return coalesce(v, t.labels ->> 'en', e.type);
end $$;

create function core.entry_out(e core.entries, p_hidden boolean) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_hidden then
    jsonb_build_object('id', e.id, 'type', e.type, 'type_version', e.type_version, 'item', e.item, 'item_version', e.item_version, 'patient_id', e.patient_id,
      'department_id', e.department_id, 'visit_id', e.visit_id, 'occurred_at', e.occurred_at, 'precision', e.precision, 'recorded_at', e.recorded_at,
      'set_id', e.set_id, 'replaces', e.replaces, 'refers_to', e.refers_to, 'relation', e.relation, 'source', e.source, 'hidden', true,
      'line', 'Private ' || lower(coalesce((select t.labels ->> 'en' from core.types t where t.key = e.type and t.version = e.type_version), e.type)))
  else
    (to_jsonb(e) - 'organization_id') || jsonb_build_object('hidden', false, 'line', core.line_of(e))
  end
$$;

-- a patient's identity as every list shows it (no clinical data)
create function core.identity(p core.patients) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'number', p.number, 'given', to_jsonb(p.given), 'family', p.family, 'full_name', p.full_name, 'latin', p.latin,
    'gender', p.gender, 'birth_date', p.birth_date, 'birth_precision', p.birth_precision, 'birth_estimated', p.birth_estimated, 'anonymous', p.anonymous,
    'telecom', p.telecom, 'address', p.address, 'merged_into', p.merged_into,
    'identifiers', coalesce((select jsonb_agg(jsonb_build_object('system', i.system, 'value', i.value, 'verified', i.verified) order by i.system)
                             from core.patient_identifiers i where i.organization_id = p.organization_id and i.patient_id = p.id), '[]'::jsonb))
$$;

-- the read log: one row per (user, patient, purpose) per 10 minutes; if it cannot be written, the read fails (§3.10)
create function core.log_read(me core.users, p_department uuid, p_patient uuid, p_purpose text, p_reason text, p_what jsonb, p_withheld int)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not exists (select 1 from core.purposes where key = p_purpose) then perform core.refuse('unknown_purpose', p_purpose); end if;
  select id into v_id from core.read_log l
   where l.organization_id = me.organization_id and l.user_id = me.id and l.patient_id is not distinct from p_patient and l.purpose = p_purpose
     and l.department_id is not distinct from p_department and l.at > clock_timestamp() - interval '10 minutes' and l.reason is not distinct from p_reason
   order by l.at desc limit 1;
  if found then
    update core.read_log set last_at = clock_timestamp(), reads = reads + 1, withheld = withheld + coalesce(p_withheld, 0),
      what = case when jsonb_typeof(what) = 'array' and jsonb_typeof(p_what) = 'array' then (select jsonb_agg(distinct x) from (select jsonb_array_elements(what) x union select jsonb_array_elements(p_what)) q) else p_what end
     where organization_id = me.organization_id and id = v_id;
  else
    insert into core.read_log (organization_id, user_id, department_id, patient_id, purpose, reason, what, withheld)
    values (me.organization_id, me.id, p_department, p_patient, p_purpose, p_reason, coalesce(p_what, '{}'), coalesce(p_withheld, 0));
  end if;
end $$;

-- rows of one derived table: equality or IN filters on its own columns, or {"op": ">=", "value": …}; organization always first. With
-- p_newest, the rows newest first by that column (its own type)
create function core.table_rows(p_org uuid, p_table core.derived, p_where jsonb, p_limit int, p_newest text default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare sql text := format(' from (select * from %s x where x.organization_id = %L', p_table.relation, p_org);
        k text; v jsonb; typ text; op text; ord text := '';
begin
  for k, v in select * from jsonb_each(coalesce(p_where, '{}')) loop
    select format_type(a.atttypid, a.atttypmod) into typ from pg_attribute a where a.attrelid = p_table.relation and a.attname = k and a.attnum > 0 and not a.attisdropped;
    if typ is null then perform core.refuse('bad_filter', k); end if;
    if jsonb_typeof(v) = 'array' then
      sql := sql || format(' and x.%I = any (%L::%s[])', k, (select array_agg(y) from jsonb_array_elements_text(v) y), typ);
    elsif jsonb_typeof(v) = 'object' then
      op := v ->> 'op';
      if op not in ('>=', '>', '<=', '<', '<>') then perform core.refuse('bad_filter', k); end if;
      sql := sql || format(' and x.%I %s %L::%s', k, op, v ->> 'value', typ);
    elsif jsonb_typeof(v) = 'null' then
      sql := sql || format(' and x.%I is null', k);
    else
      sql := sql || format(' and x.%I = %L::%s', k, v #>> '{}', typ);
    end if;
  end loop;
  if p_newest is not null then
    if not exists (select 1 from pg_attribute a where a.attrelid = p_table.relation and a.attname = p_newest and a.attnum > 0 and not a.attisdropped) then
      perform core.refuse('bad_filter', p_newest);
    end if;
    ord := format(' order by x.%I desc nulls last', p_newest);
  end if;
  sql := format('select coalesce(jsonb_agg(to_jsonb(x) - %L%s), %L)', 'organization_id', ord, '[]') || sql
         || ord || format(' limit %s) x', greatest(1, least(coalesce(p_limit, 500), 2000)));
  execute sql into v;
  return v;
end $$;

-- mask rows: withhold every row whose item has a hidden source entry; return the rows, the entries they came from and the patients
create function core.rows_out(me core.users, p_rows jsonb, p_with_entries boolean default true) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := me.organization_id; ids uuid[]; hid uuid[]; hid_items uuid[]; kept jsonb; v_entries jsonb; v_patients jsonb;
begin
  select coalesce(array_agg(distinct s::uuid), '{}') into ids from jsonb_array_elements(p_rows) r, jsonb_array_elements_text(coalesce(r -> 'source_entries', '[]')) s;
  hid := core.hidden(v_org, me.id, ids);
  select coalesce(array_agg(distinct e.item), '{}') into hid_items from core.entries e where e.organization_id = v_org and e.id = any (hid);
  select coalesce(jsonb_agg(r), '[]') into kept from jsonb_array_elements(p_rows) r where not ((r ->> 'item')::uuid = any (hid_items));
  if p_with_entries then
    select coalesce(jsonb_object_agg(e.id, core.entry_out(e, e.id = any (hid))), '{}') into v_entries
      from core.entries e where e.organization_id = v_org and e.id in (select s::uuid from jsonb_array_elements(kept) r, jsonb_array_elements_text(coalesce(r -> 'source_entries', '[]')) s);
  end if;
  select coalesce(jsonb_object_agg(p.id, core.identity(p)), '{}') into v_patients from core.patients p
   where p.organization_id = v_org and p.id in (select (r ->> 'patient_id')::uuid from jsonb_array_elements(kept) r);
  return jsonb_build_object('rows', kept, 'entries', coalesce(v_entries, '{}'), 'patients', v_patients,
    'withheld', jsonb_array_length(p_rows) - jsonb_array_length(kept));
end $$;

-- ── the shapes ──
create function core.read_me(me core.users) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name, 'title', me.title, 'kind', me.kind, 'organization_id', me.organization_id,
      'holdings', coalesce((select jsonb_agg(jsonb_build_object('department_id', h.department_id, 'role_id', h.role_id,
          'actions', (select jsonb_agg(x order by x) from core.role_actions_of(me.organization_id, h.role_id) x)))
        from core.live_holdings(me.organization_id) h where h.user_id = me.id), '[]'),
      -- what I may do in each department, as may answers it ('' for held everywhere): a pack's actions only where it is used (§5.2)
      'may', (select jsonb_object_agg(coalesce(d.id::text, ''), coalesce((select jsonb_agg(x order by x) from core.actions_in(me.id, d.id) x), '[]'))
        from (select x.id from core.departments x where x.organization_id = me.organization_id and x.retired_at is null union all select null) d)),
    'users_of_login', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'organization_id', u.organization_id, 'organization', o.name, 'name', u.name))
        from core.users u join core.organizations o on o.id = u.organization_id where u.login_id = me.login_id and u.retired_at is null and o.retired_at is null), '[]'),
    'organization', (select jsonb_build_object('id', o.id, 'name', o.name, 'time_zone', coalesce(core.setting_at(o.id, 'organization.time_zone', o.id) ->> 'zone', 'Africa/Cairo'),
        'packs_used', to_jsonb(core.packs_used(o.id))) from core.organizations o where o.id = me.organization_id),
    'sites', coalesce((select jsonb_agg(to_jsonb(s) - 'organization_id') from core.sites s where s.organization_id = me.organization_id), '[]'),
    -- each department with the packs it uses (ticked and on, §5.1 rule 1) and its Screens line: the one set, else the screens of its work
    -- from the base and the packs it uses, the base's first, without a base screen one of those stands in for (one tick brings the tabs)
    'departments', coalesce((select jsonb_agg(to_jsonb(d) - 'organization_id'
        || jsonb_build_object('packs', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(core.setting_at(d.organization_id, 'department.packs', d.id) -> 'packs', '[]')) x
                                                  where core.department_uses(d.organization_id, d.id, x)), '[]'))
        || coalesce(core.setting_at(d.organization_id, 'department.screens', d.id),
                    jsonb_build_object('screens', coalesce((select jsonb_agg(s.key order by s.layer <> 'base', s.key) from core.screens s
                      where s.layer <> 'core' and s.work = d.work and core.department_uses(d.organization_id, d.id, s.layer)
                        and not exists (select 1 from core.screens x where x.work = d.work and s.key = any (x.replaces)
                                          and core.department_uses(d.organization_id, d.id, x.layer))), '[]')))
        order by d.position, d.name) from core.departments d where d.organization_id = me.organization_id), '[]'),
    'places', coalesce((select jsonb_agg(to_jsonb(p) - 'organization_id' order by p.position, p.name) from core.places p where p.organization_id = me.organization_id), '[]'),
    'users', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'title', u.title, 'kind', u.kind, 'retired_at', u.retired_at,
          'signed_in_at', u.signed_in_at, 'has_login', u.login_id is not null) order by u.name) from core.users u where u.organization_id = me.organization_id), '[]'),
    'holdings', case when core.may(me.id, 'manage:users', null) or core.may_somewhere(me.id, 'manage:users') then
        coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'user_id', h.user_id, 'role_id', h.role_id, 'department_id', h.department_id))
          from core.holdings h where h.organization_id = me.organization_id
           and not exists (select 1 from core.holding_ends x where x.organization_id = h.organization_id and x.holding_id = h.id)), '[]') else '[]' end,
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name, 'layer', r.layer, 'builtin', r.organization_id is null,
          'retired_at', r.retired_at, 'every_action', r.every_action, 'built_on', r.built_on, 'everyday', r.everyday,
          'actions', coalesce((select jsonb_agg(x order by x) from core.role_actions_of(me.organization_id, r.id) x), '[]'),
          'own', coalesce((select jsonb_agg(ra.action order by ra.action) from core.role_actions ra join core.actions a on a.key = ra.action
                            where ra.role_id = r.id and core.layer_on(me.organization_id, a.layer)), '[]')) order by r.name)
        from core.roles r where (r.organization_id = me.organization_id or (r.organization_id is null and core.layer_on(me.organization_id, r.layer)))), '[]'),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('key', a.key, 'layer', a.layer, 'scope', a.scope, 'everyday', a.everyday, 'labels', a.labels) order by a.key)
        from core.actions a where core.layer_on(me.organization_id, a.layer)), '[]'),
    'settings', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'thing_id', s.thing_id, 'owner_id', s.owner_id, 'data', s.data, 'recorded_at', s.recorded_at,
          'author_id', s.author_id))
        from (select distinct on (s.key, s.thing_id) s.* from core.settings s where s.organization_id = me.organization_id order by s.key, s.thing_id, s.recorded_at desc, s.id desc) s
        where not s.retired), '[]'),
    'registry', jsonb_build_object(
      'types', coalesce((select jsonb_agg(jsonb_build_object('key', t.key, 'version', t.version, 'layer', t.layer, 'base_type', t.base_type, 'resources', t.resources,
          'in_record', t.in_record, 'may_be_private', t.may_be_private, 'labels', t.labels) order by t.key, t.version) from core.types t), '[]'),
      -- every screen, a pack's off included: a line naming one whose pack is not used shows the base screens it stands in for
      'screens', coalesce((select jsonb_agg(to_jsonb(s) order by s.key) from core.screens s), '[]'),
      -- each key with its shape (the datatypes once, below; its own $defs kept) and what its form needs: the fields in order with their
      -- words, where it shows
      'setting_keys', coalesce((select jsonb_agg(jsonb_build_object('key', k.key, 'layer', k.layer, 'owner_kind', k.owner_kind, 'many', k.many, 'labels', k.labels,
          'shape', (k.shape - '$defs') || coalesce((select jsonb_build_object('$defs', jsonb_object_agg(d.k, d.v)) from jsonb_each(k.shape -> '$defs') d(k, v)
            where core.datatypes() -> d.k is distinct from d.v having count(*) > 0), '{}'),
          'fields', k.fields, 'form', k.form, 'action', k.action) order by k.key) from core.setting_keys k), '[]'),
      -- every score table, each version (a retired one marked): the composer's cards and Settings → Scores (§5.1 rule 8)
      'scores', coalesce((select jsonb_agg(to_jsonb(x) - 'position' order by x.key, x.position) from core.scores x), '[]'),
      'datatypes', core.datatypes(),
      'packs', coalesce((select jsonb_agg(jsonb_build_object('key', l.key, 'version', l.version, 'requires', l.requires, 'labels', l.labels,
          'used', l.key = any (core.packs_used(me.organization_id)),
          'stale', (select count(*) from core.stale s where s.organization_id = me.organization_id and s.layer = l.key))) from core.layers l where l.is_pack), '[]'),
      'systems', coalesce((select jsonb_agg(jsonb_build_object('key', s.key, 'kind', s.kind, 'closed', s.closed, 'labels', s.labels)) from core.systems s), '[]'),
      'purposes', coalesce((select jsonb_agg(to_jsonb(p)) from core.purposes p), '[]')))
$$;

-- search: identities only (a hit carries no clinical data); includes rows of named tables for the hits (open visits)
create function core.read_patients(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid := me.organization_id; term text := trim(coalesce(q ->> 'q', '')); digits text; v_folded text; hits uuid[]; out jsonb;
begin
  if not core.may_somewhere(me.id, 'read:patients') then perform core.refuse('not_allowed', 'read:patients'); end if;
  digits := regexp_replace(term, '[^0-9]', '', 'g');
  if length(term) < 2 and not (digits <> '' and digits = term) then return jsonb_build_object('patients', '[]'::jsonb, 'tables', '{}'::jsonb); end if;
  v_folded := core.fold(term);
  select coalesce(array_agg(id), '{}') into hits from (
    select p.id from core.patients p
     where p.organization_id = v_org and p.merged_into is null and (
       (digits <> '' and digits = term and p.number::text = digits)
       or (length(digits) >= 4 and exists (select 1 from jsonb_array_elements(p.telecom) t where regexp_replace(t ->> 'value', '[^0-9]', '', 'g') like '%' || digits || '%'))
       or exists (select 1 from core.patient_identifiers i where i.organization_id = v_org and i.patient_id = p.id and i.value = term)
       or (length(v_folded) >= 2 and (p.folded like '%' || v_folded || '%' or p.folded operator(extensions.%) v_folded)))
     order by (p.folded like v_folded || '%') desc, extensions.similarity(p.folded, v_folded) desc, p.number desc
     limit greatest(1, least(coalesce((q ->> 'limit')::int, 20), 50))) x;
  select coalesce(jsonb_agg(core.identity(p) order by array_position(hits, p.id)), '[]') into out from core.patients p where p.organization_id = v_org and p.id = any (hits);
  perform core.log_read(me, (q ->> 'department_id')::uuid, null, 'PATADMIN', null, jsonb_build_object('search', term, 'hits', to_jsonb(hits)), 0);
  return jsonb_build_object('patients', out, 'tables', core.read_includes(me, (q ->> 'department_id')::uuid, hits, q -> 'include'));
end $$;

-- rows of each included table for these patients' families (only tables whose action the reader holds in the department)
create function core.read_includes(me core.users, p_department uuid, p_patients uuid[], p_include jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare out jsonb := '{}'; k text; w jsonb; d core.derived; fams uuid[];
begin
  if p_include is null or cardinality(p_patients) = 0 then return out; end if;
  select coalesce(array_agg(distinct f), '{}') into fams from unnest(p_patients) p, unnest(core.family(me.organization_id, p)) f;
  for k, w in select key, value from jsonb_each(case when jsonb_typeof(p_include) = 'array' then (select jsonb_object_agg(x, '{}'::jsonb) from jsonb_array_elements_text(p_include) x) else p_include end) loop
    select * into d from core.derived x where x.key = k;
    if not found then perform core.refuse('unknown_table', k); end if;
    if not (core.may(me.id, d.action, p_department) or (p_department is null and core.may_somewhere(me.id, d.action))) then continue; end if;
    out := out || jsonb_build_object(k, core.rows_out(me, core.table_rows(me.organization_id, d, coalesce(w, '{}') || jsonb_build_object('patient_id', to_jsonb(fams)), 2000)));
  end loop;
  return out;
end $$;

create function core.read_patient(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare p core.patients; v_id uuid := (q ->> 'patient_id')::uuid;
begin
  if not core.may_somewhere(me.id, 'read:patients') then perform core.refuse('not_allowed', 'read:patients'); end if;
  select * into p from core.patients x where x.organization_id = me.organization_id and x.id = core.survivor(me.organization_id, v_id);
  if not found then perform core.refuse('not_found', 'patient'); end if;
  perform core.log_read(me, (q ->> 'department_id')::uuid, p.id, 'PATADMIN', null, '{"shape": "patient"}', 0);
  return jsonb_build_object('patient', core.identity(p),
    'relations', coalesce((select jsonb_agg(jsonb_build_object('relation', r.relation, 'other_id', r.other_id, 'patient_id', r.patient_id))
      from core.patient_relations r where r.organization_id = me.organization_id and (r.patient_id = p.id or r.other_id = p.id) and r.ended_at is null), '[]'),
    'tables', core.read_includes(me, (q ->> 'department_id')::uuid, array[p.id], q -> 'include'));
end $$;

-- the record: identity, a page of entries (types in the record unless named), every readable derived table of the family, hidden counts
create function core.read_record(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid := me.organization_id; v_dept uuid := (q ->> 'department_id')::uuid; p core.patients; fam uuid[];
        v_types text[]; v_visits uuid[]; v_depts uuid[]; v_before_at timestamptz; v_before_id uuid; v_limit int;
        page core.entries[]; hid uuid[]; v_entries jsonb; v_tables jsonb := '{}'; v_withheld int := 0; d core.derived; v_t jsonb; v_hidden jsonb;
        v_include jsonb := q -> 'include';
begin
  if v_dept is null or not core.may(me.id, 'read:record', v_dept) then perform core.refuse('not_allowed', 'read:record'); end if;
  select * into p from core.patients x where x.organization_id = v_org and x.id = core.survivor(v_org, (q ->> 'patient_id')::uuid);
  if not found then perform core.refuse('not_found', 'patient'); end if;
  fam := core.family(v_org, p.id);
  v_types := (select array_agg(x) from jsonb_array_elements_text(q -> 'types') x);
  v_visits := (select array_agg(x::uuid) from jsonb_array_elements_text(q -> 'visits') x);
  v_depts := (select array_agg(x::uuid) from jsonb_array_elements_text(q -> 'departments') x);
  v_before_at := (q -> 'before' ->> 'recorded_at')::timestamptz; v_before_id := (q -> 'before' ->> 'id')::uuid;
  v_limit := greatest(1, least(coalesce((q ->> 'limit')::int, 50), 500));
  select coalesce(array_agg(e order by e.recorded_at desc, e.id desc), '{}') into page from (
    select e.* from core.entries e join core.types t on t.key = e.type and t.version = e.type_version
     where e.organization_id = v_org and e.patient_id = any (fam)
       and (case when v_types is null then t.in_record else e.type = any (v_types) or t.base_type = any (v_types) end)
       and (v_visits is null or e.visit_id = any (v_visits))
       and (v_depts is null or e.department_id = any (v_depts))
       and (v_before_at is null or (e.recorded_at, e.id) < (v_before_at, v_before_id))
     order by e.recorded_at desc, e.id desc limit v_limit) e;
  hid := core.hidden(v_org, me.id, (select array_agg(x.id) from unnest(page) x));
  select coalesce(jsonb_agg(core.entry_out(x, x.id = any (hid)) order by x.recorded_at desc, x.id desc), '[]') into v_entries from unnest(page) x;
  -- the derived tables of the family: all readable ones unless named
  -- whoever reads the record reads every derived row of the family (the table's own action gates only the table read)
  for d in select * from core.derived x where (v_include is null or x.key in (select jsonb_array_elements_text(v_include))) order by x.position loop
    v_t := core.rows_out(me, core.table_rows(v_org, d, jsonb_build_object('patient_id', to_jsonb(fam)), 2000));
    v_withheld := v_withheld + (v_t ->> 'withheld')::int;
    v_tables := v_tables || jsonb_build_object(d.key, v_t - 'patients');
  end loop;
  -- where private items are, by department (names are never hidden; counts only)
  select coalesce(jsonb_agg(jsonb_build_object('department_id', x.department_id, 'items', x.n)), '[]') into v_hidden from (
    select e.department_id, count(distinct e.item) n from core.entries e
     where e.organization_id = v_org and e.patient_id = any (fam) and e.id = any (core.hidden(v_org, me.id,
       (select array_agg(y.id) from core.entries y join core.types t on t.key = y.type and t.version = y.type_version
         where y.organization_id = v_org and y.patient_id = any (fam) and t.may_be_private)))
     group by e.department_id) x;
  perform core.log_read(me, v_dept, p.id, coalesce(q ->> 'purpose', 'TREAT'), q ->> 'reason',
    jsonb_build_object('entries', cardinality(page), 'types', to_jsonb(v_types), 'visits', to_jsonb(v_visits)), cardinality(hid) + v_withheld);
  return jsonb_build_object('patient', core.identity(p), 'family', to_jsonb(fam), 'entries', v_entries, 'tables', v_tables, 'hidden', v_hidden,
    'more', cardinality(page) = v_limit);
end $$;

-- one item: every version, and every entry that refers to any of them
create function core.read_item(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid := me.organization_id; v_dept uuid := (q ->> 'department_id')::uuid; v_item uuid := (q ->> 'item')::uuid; rows core.entries[]; hid uuid[]; v_patient uuid;
begin
  if v_dept is null or not core.may(me.id, 'read:record', v_dept) then perform core.refuse('not_allowed', 'read:record'); end if;
  select coalesce(array_agg(e order by e.item_version), '{}') into rows from core.entries e where e.organization_id = v_org and e.item = v_item;
  if cardinality(rows) = 0 then
    select coalesce(array_agg(e order by e.item_version), '{}') into rows from core.entries e
     where e.organization_id = v_org and e.item = (select x.item from core.entries x where x.organization_id = v_org and x.id = v_item);
  end if;
  if cardinality(rows) = 0 then perform core.refuse('not_found', 'item'); end if;
  v_patient := rows[1].patient_id;
  rows := rows || (select coalesce(array_agg(e order by e.recorded_at, e.id), '{}') from core.entries e
     where e.organization_id = v_org and e.refers_to = any (select x.id from unnest(rows) x) and e.item <> rows[1].item);
  hid := core.hidden(v_org, me.id, (select array_agg(x.id) from unnest(rows) x));
  perform core.log_read(me, v_dept, core.survivor(v_org, v_patient), coalesce(q ->> 'purpose', 'TREAT'), q ->> 'reason', jsonb_build_object('item', v_item), cardinality(hid));
  return jsonb_build_object('entries', (select jsonb_agg(core.entry_out(x, x.id = any (hid))) from unnest(rows) x));
end $$;

-- one derived table with a filter; the table's declared action in the department
create function core.read_table(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare d core.derived; v_dept uuid := (q ->> 'department_id')::uuid; out jsonb; pts jsonb;
begin
  select * into d from core.derived x where x.key = q ->> 'table';
  if not found then perform core.refuse('unknown_table', q ->> 'table'); end if;
  if v_dept is null or not core.may(me.id, d.action, v_dept) then perform core.refuse('not_allowed', d.action); end if;
  out := core.rows_out(me, core.table_rows(me.organization_id, d, q -> 'where', (q ->> 'limit')::int), coalesce((q ->> 'entries')::boolean, true));
  select coalesce(jsonb_agg(distinct x), '[]') into pts from jsonb_object_keys(out -> 'patients') x;
  perform core.log_read(me, v_dept, null, coalesce(q ->> 'purpose', 'TREAT'), null, jsonb_build_object('table', d.key, 'patients', pts), (out ->> 'withheld')::int);
  return out;
end $$;

-- a file: the storage path of one attachment of a visible entry (the storage policy asks the same question)
create function core.may_read_file(p_object text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare me core.users; parts text[] := string_to_array(p_object, '/'); v_org uuid; v_sha text;
begin
  begin me := core.me(); exception when others then return false; end;
  if cardinality(parts) <> 3 then return false; end if;
  v_org := parts[1]::uuid; v_sha := parts[3];
  if v_org <> me.organization_id then return false; end if;
  return exists (select 1 from core.file_uses f join core.entries e on e.organization_id = f.organization_id and e.id = f.entry_id
     join core.departments d on d.organization_id = e.organization_id and d.id = e.department_id
     where f.organization_id = v_org and f.sha256 = v_sha and core.may_somewhere(me.id, 'read:record')
       and not (core.hidden(v_org, me.id, array[e.id]) @> array[e.id]));
end $$;
create function core.read_file(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare e core.entries; v_dept uuid := (q ->> 'department_id')::uuid;
begin
  if v_dept is null or not core.may(me.id, 'read:record', v_dept) then perform core.refuse('not_allowed', 'read:record'); end if;
  select * into e from core.entries x where x.organization_id = me.organization_id and x.id = (q ->> 'entry_id')::uuid;
  if not found or core.hidden(me.organization_id, me.id, array[e.id]) @> array[e.id]
     or not exists (select 1 from core.file_uses f where f.organization_id = e.organization_id and f.entry_id = e.id and f.sha256 = q ->> 'sha256') then
    perform core.refuse('not_found', 'file');
  end if;
  perform core.log_read(me, v_dept, e.patient_id, coalesce(q ->> 'purpose', 'TREAT'), q ->> 'reason', jsonb_build_object('file', q ->> 'sha256', 'entry', e.id), 0);
  return jsonb_build_object('bucket', 'files', 'path', e.organization_id || '/' || e.patient_id || '/' || (q ->> 'sha256'));
end $$;

-- the read log and the privacy changes, for those who review them
create function core.read_log_rows(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_patient uuid := (q ->> 'patient_id')::uuid; out jsonb;
begin
  if not core.may(me.id, 'read:log', null) then perform core.refuse('not_allowed', 'read:log'); end if;
  select coalesce(jsonb_agg(to_jsonb(l) - 'organization_id' order by l.at desc), '[]') into out from (
    select * from core.read_log l where l.organization_id = me.organization_id and (v_patient is null or l.patient_id = any (core.family(me.organization_id, v_patient)))
       and (q ->> 'purpose' is null or l.purpose = q ->> 'purpose')
     order by l.at desc limit greatest(1, least(coalesce((q ->> 'limit')::int, 200), 1000))) l;
  return jsonb_build_object('reads', out);
end $$;

create function core.read_audit(me core.users, q jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (core.may(me.id, 'manage:settings', null) or core.may_somewhere(me.id, 'manage:settings') or core.may(me.id, 'manage:users', null)) then
    perform core.refuse('not_allowed', 'manage:settings');
  end if;
  return jsonb_build_object('changes', coalesce((select jsonb_agg(to_jsonb(a) - 'organization_id' order by a.at desc) from (
    select * from core.audit a where a.organization_id = me.organization_id and (q ->> 'thing_id' is null or a.thing_id = (q ->> 'thing_id')::uuid)
       and (q ->> 'what' is null or a.what = q ->> 'what')
     order by a.at desc limit greatest(1, least(coalesce((q ->> 'limit')::int, 200), 1000))) a), '[]'));
end $$;

-- reference data: codes of a system by code or label (no patient data, not logged)
create function core.read_codes(me core.users, q jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('codes', coalesce(jsonb_agg(jsonb_build_object('system', c.system, 'code', c.code, 'label', c.labels ->> 'en', 'props', c.props) order by c.system, c.code), '[]'))
  from (select * from core.codes c where c.retired_at is null and (q ->> 'system' is null or c.system = q ->> 'system')
          and (coalesce(q ->> 'q', '') = '' or c.code ilike (q ->> 'q') || '%' or c.labels ->> 'en' ilike '%' || (q ->> 'q') || '%')
        order by c.system, c.code limit greatest(1, least(coalesce((q ->> 'limit')::int, 50), 2000))) c
$$;

-- the licensed reference lists loaded here (§5.1 rule 7): each system's latest load, with its version, source, licence and whether it is
-- the demo's sample; reference data, no patient data, not logged
create function core.read_reference(me core.users) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('lists', coalesce(jsonb_agg(jsonb_build_object('system', i.system, 'labels', s.labels, 'uri', s.uri, 'version', coalesce(i.version, s.version),
      'source', i.source, 'licence', coalesce(i.licence, s.licence), 'sample', i.sample, 'codes', i.codes, 'loaded_at', i.loaded_at,
      'loads', (select count(*) from core.code_imports x where x.system = i.system)) order by i.system), '[]'))
  from (select distinct on (x.system) x.* from core.code_imports x order by x.system, x.loaded_at desc, x.id desc) i join core.systems s on s.key = i.system
  where me.id is not null
$$;

-- ── masked by default (§5.2): a pack's read for a person sees what that person may see (the pack doors, migration 11) ──
-- which of these entries the reader may not see; a read for a person of another organization is refused
create function core.pack_hidden(p_org uuid, p_ids uuid[]) returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare me core.users;
begin
  if core.unmasked_now() then
    if core.unmasked_for() is distinct from p_org then perform core.refuse('wrong_organization'); end if;
    return '{}';
  end if;
  me := core.me();
  if me.organization_id is distinct from p_org then perform core.refuse('wrong_organization'); end if;
  if coalesce(cardinality(p_ids), 0) = 0 then return '{}'; end if;
  return core.hidden(p_org, me.id, p_ids);
end $$;
create function core.pack_masked(p_org uuid, p_rows core.entries[]) returns setof core.entries language plpgsql stable security definer set search_path = '' as $$
declare hid uuid[]; x core.entries;
begin
  hid := core.pack_hidden(p_org, (select array_agg(y.id) from unnest(p_rows) y));
  foreach x in array coalesce(p_rows, '{}') loop
    if x.id = any (hid) then
      x.data := '{}'; x.codes := '{}'; x.findings := '[]'; x.author_id := null; x.source_system := null; x.source_id := null; x.until := null;
    end if;
    return next x;
  end loop;
end $$;

-- a score worked out while the clinician types (§5.1 rule 8): each item's points, the total and its band, by the server alone; no
-- patient data, not logged
create function core.read_score(me core.users, q jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select core.score(q ->> 'score', q ->> 'version', coalesce(q -> 'inputs', '{}')) where me.id is not null
$$;

-- the one door out. FHIR (shape fhir) is added by the base's export migration through core.read_fhir.
create function core.read_fhir(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform core.refuse('not_available', 'fhir');
  return null;
end $$;

create function public.read(p_query jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users := core.me();
begin
  if p_query ->> 'shape' = 'me' then
    update core.users set signed_in_at = now() where organization_id = me.organization_id and id = me.id and signed_in_at is null;
  end if;
  return case p_query ->> 'shape'
    when 'me'       then core.read_me(me)
    when 'patients' then core.read_patients(me, p_query)
    when 'patient'  then core.read_patient(me, p_query)
    when 'record'   then core.read_record(me, p_query)
    when 'item'     then core.read_item(me, p_query)
    when 'table'    then core.read_table(me, p_query)
    when 'file'     then core.read_file(me, p_query)
    when 'fhir'     then core.read_fhir(me, p_query)
    when 'log'      then core.read_log_rows(me, p_query)
    when 'audit'    then core.read_audit(me, p_query)
    when 'codes'    then core.read_codes(me, p_query)
    when 'reference' then core.read_reference(me)
    when 'score'    then core.read_score(me, p_query)
    else null end;
end $$;
revoke all on function public.read(jsonb) from public, anon;
grant execute on function public.read(jsonb) to authenticated;

-- who may listen on a live channel: their own organization; a record they read in the last 12 hours
create function core.may_listen(p_topic text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare me core.users;
begin
  begin me := core.me(); exception when others then return false; end;
  if p_topic = 'organization:' || me.organization_id then return true; end if;
  if p_topic like 'record:%' then
    return exists (select 1 from core.read_log l where l.organization_id = me.organization_id and l.user_id = me.id
      and l.patient_id = any (core.family(me.organization_id, nullif(substr(p_topic, 8), '')::uuid)) and l.last_at > clock_timestamp() - interval '12 hours');
  end if;
  return false;
end $$;
grant execute on function core.may_listen(text) to authenticated;
grant usage on schema core to authenticated;
do $$ begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'drop policy if exists opencare_channels on realtime.messages';
    execute 'create policy opencare_channels on realtime.messages for select to authenticated using (core.may_listen(realtime.topic()))';
  end if;
end $$;
