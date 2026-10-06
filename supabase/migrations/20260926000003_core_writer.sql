-- 03 · core: the writer, the only way in (spec/openCare.md §3.9), and the visibility rule runner it shares with the reader (§3.10).
-- It knows no type: shapes, permissions, items and findings come from the registry; meaning comes from the base's checks.

set client_min_messages = warning;

-- ── the rule runner: which of these entries this reader may not see (§3.10). Rules only hide; a rule that raises hides all it was
-- asked about. Types that may never be private skip every rule; a pack's rule sees only its own types. ──
create function core.hidden(p_org uuid, p_reader uuid, p_ids uuid[]) returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare cand uuid[]; sub uuid[]; h uuid[]; out uuid[] := '{}'; ru core.rules;
begin
  if p_ids is null or cardinality(p_ids) = 0 then return '{}'; end if;
  select coalesce(array_agg(e.id), '{}') into cand from core.entries e join core.types t on t.key = e.type and t.version = e.type_version
   where e.organization_id = p_org and e.id = any (p_ids) and t.may_be_private;
  if cardinality(cand) = 0 then return '{}'; end if;
  for ru in select * from core.rules order by key loop
    if ru.layer = 'base' then sub := cand;
    else
      select coalesce(array_agg(e.id), '{}') into sub from core.entries e join core.types t on t.key = e.type and t.version = e.type_version
       where e.organization_id = p_org and e.id = any (cand) and t.layer = ru.layer;
    end if;
    if cardinality(sub) = 0 then continue; end if;
    begin
      execute format('select %s($1, $2)', ru.hidden::regproc) into h using p_reader, sub;
    exception when others then
      raise warning 'rule % failed: %', ru.key, sqlerrm;
      h := sub;
    end;
    out := out || coalesce(h, '{}');
  end loop;
  return (select coalesce(array_agg(distinct x), '{}') from unnest(out) x where x = any (cand));
end $$;

-- a content-free hint on a private channel; never let a missing realtime fail a write
create function core.hint(p_topic text) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'change', p_topic, true);
exception when others then null;
end $$;

-- ── the writer ──
create function core.refused(p_set_id uuid, p_code text, p_entry uuid default null, p_detail text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('set_id', p_set_id, 'outcome', 'refused', 'findings', jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object('code', p_code, 'level', 'refuse', 'entries', case when p_entry is null then '[]'::jsonb else jsonb_build_array(p_entry) end, 'detail', p_detail))))
$$;

create function core.writer(me core.users, p_set jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_org uuid := me.organization_id;
  v_set_id uuid; v_made_at timestamptz; v_hash text; v_live boolean; v_source text; v_now timestamptz; v_prev core.sets;
  v_in jsonb := p_set -> 'entries';
  v_confirmed text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_set -> 'confirmed', '[]')) x), '{}');
  v_seen jsonb := coalesce(p_set -> 'seen', '{}');
  n int; i int; j int;
  e jsonb; r core.entries; rows core.entries[] := '{}'; t core.types; types core.types[] := '{}';
  tgt core.entries; tgt_type core.types; found_tgt boolean;
  v_keys text[] := '{}'; v_locked text[] := '{}'; k text; v_claims text[]; v_timeout text;
  v_fam uuid[]; v_family uuid; v_other boolean;
  v_find jsonb := '[]'; f jsonb; fs jsonb; fn regprocedure; cur int; seen int;
  v_setj jsonb; v_result jsonb; v_refuse jsonb; v_warn jsonb; v_items uuid[] := '{}'; v_types text[] := '{}'; v_patients uuid[];
  dv core.derived; lv core.listeners; v_err text; v_hidden uuid[]; v_idle boolean;
begin
  -- the envelope
  begin v_set_id := (p_set ->> 'set_id')::uuid; exception when others then v_set_id := null; end;
  if v_set_id is null then return core.refused(null, 'bad_set', null, 'set_id'); end if;
  if jsonb_typeof(v_in) is distinct from 'array' or jsonb_array_length(v_in) = 0 then return core.refused(v_set_id, 'empty_set'); end if;
  begin v_made_at := coalesce((p_set ->> 'made_at')::timestamptz, clock_timestamp()); exception when others then return core.refused(v_set_id, 'bad_set', null, 'made_at'); end;
  v_hash := md5(v_in::text);
  v_source := case me.kind when 'staff' then 'staff' when 'machine' then 'machine' when 'importer' then 'import' else 'patient' end;
  v_live := v_source = 'staff' and v_made_at between clock_timestamp() - interval '5 minutes' and clock_timestamp() + interval '1 minute';
  n := jsonb_array_length(v_in);

  -- 3. the set ledger, under the set's own lock so a double submit waits for the first
  v_timeout := current_setting('lock_timeout');
  perform set_config('lock_timeout', '3s', true);
  begin
    perform pg_advisory_xact_lock(hashtextextended('set:' || v_set_id::text, 0));
  exception when lock_not_available then
    perform set_config('lock_timeout', v_timeout, true);
    return jsonb_build_object('set_id', v_set_id, 'outcome', 'busy', 'findings', '[]'::jsonb);
  end;
  select * into v_prev from core.sets s where s.organization_id = v_org and s.id = v_set_id;
  if found then
    perform set_config('lock_timeout', v_timeout, true);
    if v_prev.hash = v_hash then return v_prev.outcome || '{"repeat": true}'::jsonb; end if;
    return core.refused(v_set_id, 'set_changed');
  end if;

  -- the rows, before any lock: ids, types, patients, claims
  for i in 0 .. n - 1 loop
    e := v_in -> i;
    r := null;
    begin r.id := (e ->> 'id')::uuid; exception when others then r.id := null; end;
    if r.id is null then return core.refused(v_set_id, 'bad_entry', null, 'id'); end if;
    select * into t from core.types x where x.key = e ->> 'type' and x.version = coalesce((e ->> 'type_version')::int, core.type_latest(e ->> 'type'));
    if not found then return core.refused(v_set_id, 'unknown_type', r.id, e ->> 'type'); end if;
    r.organization_id := v_org; r.type := t.key; r.type_version := t.version;
    r.data := coalesce(e -> 'data', '{}'); r.author_id := me.id; r.source := v_source; r.set_id := v_set_id;
    begin
      r.patient_id := (e ->> 'patient_id')::uuid; r.department_id := (e ->> 'department_id')::uuid; r.visit_id := (e ->> 'visit_id')::uuid;
      r.replaces := (e ->> 'replaces')::uuid; r.refers_to := (e ->> 'refers_to')::uuid; r.relation := e ->> 'relation';
      r.occurred_at := (e ->> 'occurred_at')::timestamptz; r.until := (e ->> 'until')::timestamptz;
      r.precision := coalesce(e ->> 'precision', case when e ? 'occurred_at' then 'minute' else 'second' end);
      r.source_system := e ->> 'source_system'; r.source_id := e ->> 'source_id';
    exception when others then return core.refused(v_set_id, 'bad_entry', r.id, sqlerrm);
    end;
    if r.patient_id is null or r.department_id is null then return core.refused(v_set_id, 'bad_entry', r.id, 'patient_id and department_id'); end if;
    if r.precision not in ('year', 'month', 'day', 'minute', 'second') then return core.refused(v_set_id, 'bad_entry', r.id, 'precision'); end if;
    if (r.refers_to is null) <> (r.relation is null) or coalesce(r.relation, 'answers') not in ('answers', 'changes', 'about') then
      return core.refused(v_set_id, 'bad_entry', r.id, 'refers_to and relation');
    end if;
    if r.replaces is not null and r.refers_to is not null then return core.refused(v_set_id, 'bad_entry', r.id, 'replaces or refers_to'); end if;
    if (r.source_system is null) <> (r.source_id is null) then return core.refused(v_set_id, 'bad_entry', r.id, 'source_system and source_id'); end if;
    if not exists (select 1 from core.patients p where p.organization_id = v_org and p.id = r.patient_id) then
      return core.refused(v_set_id, 'wrong_patient', r.id);
    end if;
    rows := rows || r; types := types || t;
    if t.claims is not null then
      begin
        execute format('select %s($1)', t.claims::regproc) into v_claims using to_jsonb(r);
      exception when others then return core.refused(v_set_id, 'check_failed', r.id, sqlerrm);
      end;
      v_keys := v_keys || coalesce(v_claims, '{}');
    end if;
  end loop;

  -- 4. locks: every patient family and every claim, in one order; then the survivors again, in case a merge moved them
  loop
    v_keys := v_keys || (select coalesce(array_agg(distinct 'patient:' || core.survivor(v_org, x.patient_id)), '{}') from unnest(rows) x);
    begin
      for k in select distinct y from unnest(v_keys) y where not (y = any (v_locked)) order by 1 loop
        perform pg_advisory_xact_lock(hashtextextended(k, 0));
        v_locked := v_locked || k;
      end loop;
    exception when lock_not_available then
      perform set_config('lock_timeout', v_timeout, true);
      return jsonb_build_object('set_id', v_set_id, 'outcome', 'busy', 'findings', '[]'::jsonb);
    end;
    exit when not exists (select 1 from unnest(rows) x where not ('patient:' || core.survivor(v_org, x.patient_id)) = any (v_locked));
  end loop;
  perform set_config('lock_timeout', v_timeout, true);
  -- after a clock step back, still after the last set of every family here (under their locks): (recorded_at, id) is the write order;
  -- and after the organization's latest setting, so a check or refresh as of this entry sees a setting written before it (§3.4)
  select greatest(clock_timestamp(), max(l.recorded_at) + interval '1 microsecond',
                  (select s.recorded_at from core.settings s where s.organization_id = v_org order by s.recorded_at desc limit 1) + interval '1 microsecond') into v_now
    from (select distinct unnest(core.family(v_org, x.patient_id)) p from unnest(rows) x) f,
    lateral (select y.recorded_at from core.entries y where y.organization_id = v_org and y.patient_id = f.p order by y.recorded_at desc limit 1) l;

  -- 5. generic checks (always refuse) and 6. items and versions
  for i in 1 .. n loop
    r := rows[i]; t := types[i];
    r.patient_id := core.survivor(v_org, r.patient_id);
    r.recorded_at := v_now;
    r.occurred_at := coalesce(r.occurred_at, v_now);
    if r.occurred_at > v_now + interval '5 minutes' then return core.refused(v_set_id, 'in_the_future', r.id); end if;
    -- a pack off for the clinic takes no new entry of its types; a correction of one (replaces, or changes for a type whose base
    -- corrects by change, as a step does) still lands (§5, §5.2 Off)
    if t.layer <> 'base' and not core.layer_on(v_org, t.layer) and r.replaces is null and coalesce(r.relation, '') <> 'changes' then
      return core.refused(v_set_id, 'pack_off', r.id, t.layer);
    end if;
    if not extensions.jsonb_matches_schema(t.shape::json, r.data) then
      return core.refused(v_set_id, 'bad_shape', r.id,
        (select string_agg(x, '; ') from unnest(extensions.jsonschema_validation_errors(t.shape::json, r.data::json)) x));
    end if;
    if not exists (select 1 from core.departments d where d.organization_id = v_org and d.id = r.department_id and d.retired_at is null) then
      return core.refused(v_set_id, 'not_found', r.id, 'department');
    end if;
    -- where the pack's actions do not count (off, or not used in this department), its entry is corrected by an author of the item who
    -- still holds a role there, written in the target's own department (checked with the target below)
    v_idle := coalesce((r.replaces is not null or r.relation = 'changes') and t.layer <> 'base' and not core.department_uses(v_org, r.department_id, t.layer)
              and not core.may(me.id, 'write:' || t.key, r.department_id), false);
    if not v_idle and not core.may(me.id, 'write:' || t.key, r.department_id) then return core.refused(v_set_id, 'not_allowed', r.id, 'write:' || t.key); end if;
    -- one family per set, unless the type declares it may sit beside another patient
    if i = 1 then v_family := r.patient_id;
    elsif r.patient_id <> v_family and not t.other_patient then return core.refused(v_set_id, 'two_patients', r.id);
    end if;
    v_fam := core.family(v_org, r.patient_id);
    -- the visit: an item of this family, stored or opened in this set
    if r.visit_id is not null and not exists (select 1 from core.entries x where x.organization_id = v_org and x.item = r.visit_id and x.item_version = 1 and x.patient_id = any (v_fam))
       and not exists (select 1 from unnest(rows[1:i]) x where x.id = r.visit_id and x.patient_id = r.patient_id) then
      return core.refused(v_set_id, 'not_found', r.id, 'visit');
    end if;
    -- the target of a correction or a reference
    if coalesce(r.replaces, r.refers_to) is not null then
      select x.* into tgt from core.entries x where x.organization_id = v_org and x.id = coalesce(r.replaces, r.refers_to);
      found_tgt := found;
      if not found_tgt then
        select x.* into tgt from unnest(rows[1:i-1]) x where x.id = coalesce(r.replaces, r.refers_to);
        found_tgt := found;
      end if;
      if not found_tgt then return core.refused(v_set_id, 'not_found', r.id, 'target'); end if;
      if not (tgt.patient_id = any (v_fam)) and not t.other_patient then return core.refused(v_set_id, 'wrong_patient', r.id, 'target'); end if;
      -- a stored target is known by its set, not its time (the clock may step back)
      if tgt.set_id <> v_set_id and (core.hidden(v_org, me.id, array[tgt.id]) @> array[tgt.id]) then
        return core.refused(v_set_id, 'not_found', r.id, 'target');
      end if;
      if v_idle and not (tgt.type = t.key and tgt.department_id = r.department_id and exists (select 1 from core.entries x where x.organization_id = v_org and x.item = tgt.item and x.author_id = me.id)
                         and exists (select 1 from core.live_holdings(v_org) h where h.user_id = me.id and (h.department_id is null or h.department_id = r.department_id))) then
        return core.refused(v_set_id, 'not_allowed', r.id, 'write:' || t.key);
      end if;
      select x.* into tgt_type from core.types x where x.key = tgt.type and x.version = tgt.type_version;
      if r.replaces is not null or r.relation = 'changes' then
        -- the same-resource rule: a type with no resource of its own (a cross-out) may continue any item
        if t.resources <> '{}' and not (t.resources && tgt_type.resources) then return core.refused(v_set_id, 'wrong_resource', r.id); end if;
        r.item := tgt.item;
        select greatest(coalesce(max(x.item_version), 0), (select coalesce(max(y.item_version), 0) from unnest(rows[1:i-1]) y where y.item = tgt.item))
          into cur from core.entries x where x.organization_id = v_org and x.item = tgt.item;
        seen := coalesce((v_seen ->> tgt.item::text)::int, tgt.item_version);
        if seen < cur then
          v_find := v_find || jsonb_build_object('code', 'changed_since_opened', 'level', 'refuse', 'entries', jsonb_build_array(r.id));
        end if;
        r.item_version := cur + 1;
      else
        r.item := r.id; r.item_version := 1;
      end if;
    else
      r.item := r.id; r.item_version := 1;
    end if;
    -- codings: a system that is not registered is a bug; unknown codes and units land flagged
    for f in select * from core.codings(r.data) loop
      if not exists (select 1 from core.systems s where s.key = f ->> 'system') then return core.refused(v_set_id, 'unknown_system', r.id, f ->> 'system'); end if;
      if exists (select 1 from core.systems s where s.key = f ->> 'system' and s.closed)
         and not exists (select 1 from core.codes c where c.system = f ->> 'system' and c.code = f ->> 'code' and c.retired_at is null) then
        v_find := v_find || jsonb_build_object('code', 'code_unknown', 'level', 'flag', 'entries', jsonb_build_array(r.id), 'detail', (f ->> 'system') || ':' || (f ->> 'code'));
      end if;
    end loop;
    for k in select * from core.ucums(r.data) loop
      if not exists (select 1 from core.codes c where c.system = 'ucum' and c.code = k) then
        v_find := v_find || jsonb_build_object('code', 'unit_not_ucum', 'level', 'flag', 'entries', jsonb_build_array(r.id), 'detail', k);
      end if;
    end loop;
    r.codes := core.codes_of(r.data);
    rows[i] := r;
  end loop;
  if exists (select 1 from unnest(rows) x group by x.id having count(*) > 1) then return core.refused(v_set_id, 'bad_entry', null, 'duplicate id'); end if;
  if exists (select 1 from unnest(rows) x join core.entries y on y.organization_id = v_org and y.id = x.id) then
    return core.refused(v_set_id, 'set_changed', null, 'an entry id was used by another set');
  end if;
  -- an import or a resend lands once: every entry already stored under its outside id returns what is stored; some is a conflict
  if exists (select 1 from unnest(rows) x join core.entries y on y.organization_id = v_org and y.source_system = x.source_system and y.source_id = x.source_id) then
    if not exists (select 1 from unnest(rows) x where x.source_system is null or not exists (
                     select 1 from core.entries y where y.organization_id = v_org and y.source_system = x.source_system and y.source_id = x.source_id)) then
      return jsonb_build_object('set_id', v_set_id, 'outcome', 'landed', 'repeat', true, 'findings', '[]'::jsonb,
        'entries', (select jsonb_agg(jsonb_build_object('id', y.id, 'item', y.item, 'item_version', y.item_version)) from unnest(rows) x
                     join core.entries y on y.organization_id = v_org and y.source_system = x.source_system and y.source_id = x.source_id));
    end if;
    return core.refused(v_set_id, 'already_imported');
  end if;

  -- 7. the types' checks: findings, never raises (a check that raises is a flag, and a bug)
  v_setj := (select jsonb_agg(to_jsonb(x)) from unnest(rows) x);
  for i in 1 .. n loop
    r := rows[i]; t := types[i];
    for fn in select c from unnest(coalesce((select b.checks from core.types b where b.key = t.base_type order by b.version desc limit 1), '{}') || t.checks) c loop
      begin
        execute format('select %s($1, $2)', fn::regproc) into fs using to_jsonb(r), v_setj;
      exception when others then
        fs := jsonb_build_array(jsonb_build_object('code', 'check_failed', 'level', 'flag', 'detail', fn::text || ': ' || sqlerrm));
      end;
      for f in select * from jsonb_array_elements(coalesce(fs, '[]')) loop
        if not (f ? 'entries') or jsonb_array_length(f -> 'entries') = 0 then f := f || jsonb_build_object('entries', jsonb_build_array(r.id)); end if;
        v_find := v_find || f;
      end loop;
    end loop;
  end loop;

  -- the decision: a live set is refused or warned; a late one lands flagged
  v_refuse := coalesce((select jsonb_agg(fx) from jsonb_array_elements(v_find) fx where fx ->> 'level' = 'refuse'), '[]');
  v_warn := coalesce((select jsonb_agg(fx) from jsonb_array_elements(v_find) fx where fx ->> 'level' = 'warn' and not (fx ->> 'code' = any (v_confirmed))), '[]');
  if v_live and jsonb_array_length(v_refuse) > 0 then
    return jsonb_build_object('set_id', v_set_id, 'outcome', 'refused', 'findings', v_refuse);
  end if;
  if v_live and jsonb_array_length(v_warn) > 0 then
    return jsonb_build_object('set_id', v_set_id, 'outcome', 'warn', 'findings', v_warn);
  end if;
  v_find := coalesce((select jsonb_agg(case
      when fx ->> 'level' = 'refuse' then fx || '{"level": "flag", "late": true}'::jsonb
      when fx ->> 'level' = 'warn' and fx ->> 'code' = any (v_confirmed) then fx || '{"confirmed": true}'::jsonb
      when fx ->> 'level' = 'warn' then fx || '{"level": "flag", "late": true}'::jsonb
      else fx end) from jsonb_array_elements(v_find) fx), '[]');

  -- 8. insert, with each entry's own findings; files named in data; the ledger
  for i in 1 .. n loop
    rows[i].findings := coalesce((select jsonb_agg(fx - 'entries') from jsonb_array_elements(v_find) fx where fx -> 'entries' @> to_jsonb(array[rows[i].id]::text[])), '[]');
  end loop;
  insert into core.entries select * from unnest(rows);
  insert into core.file_uses (organization_id, sha256, patient_id, entry_id)
    select v_org, a ->> 'sha256', x.patient_id, x.id from unnest(rows) x, core.nodes(x.data) a
     where a ? 'sha256' and a ? 'mime' on conflict do nothing;
  v_result := jsonb_build_object('set_id', v_set_id, 'outcome', 'landed', 'recorded_at', v_now,
    'entries', (select jsonb_agg(jsonb_build_object('id', x.id, 'item', x.item, 'item_version', x.item_version)) from unnest(rows) x),
    'findings', v_find);
  insert into core.sets (organization_id, id, hash, user_id, made_at, recorded_at, live, outcome)
    values (v_org, v_set_id, v_hash, me.id, v_made_at, v_now, v_live, v_result);

  -- 9. refreshes: every table fed by the new entries' types and their targets' types, with every touched item
  select coalesce(array_agg(distinct z), '{}') into v_items from (
    select x.item as z from unnest(rows) x
    union select x.visit_id from unnest(rows) x where x.visit_id is not null
    union select y.item from unnest(rows) x join core.entries y on y.organization_id = v_org and y.id in (x.replaces, x.refers_to)) q;
  select coalesce(array_agg(distinct z), '{}') into v_types from (
    select x.type as z from unnest(rows) x
    union select y.type from unnest(rows) x join core.entries y on y.organization_id = v_org and y.id in (x.replaces, x.refers_to)) q;
  v_types := v_types || (select coalesce(array_agg(distinct b.base_type), '{}') from core.types b where b.key = any (v_types) and b.base_type is not null);
  v_patients := (select array_agg(distinct x.patient_id) from unnest(rows) x);
  for dv in select * from core.derived dd where dd.key in (select unnest(tt.feeds) from core.types tt where tt.key = any (v_types)) order by (dd.layer <> 'base'), dd.position loop
    if dv.layer = 'base' then
      perform core.run_refresh(dv.refresh, v_org, v_items);
    else
      begin
        perform core.run_refresh(dv.refresh, v_org, v_items);
      exception when others then
        get stacked diagnostics v_err = message_text;
        insert into core.stale (organization_id, layer, patient_id, error) select v_org, dv.layer, p, v_err from unnest(v_patients) p
          on conflict (organization_id, layer, patient_id) do update set error = excluded.error;
      end;
    end if;
  end loop;
  for lv in select * from core.listeners ll where ll.types && v_types and core.layer_on(v_org, ll.layer) loop
    insert into core.outbox (organization_id, layer, refresh, patient_id, items) select v_org, lv.layer, lv.refresh, p, v_items from unnest(v_patients) p;
  end loop;

  -- 10. content-free hints
  perform core.hint('record:' || p) from unnest(v_patients) p;
  perform core.hint('organization:' || v_org);
  return v_result;
end $$;

create function public.write(p_set jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me core.users; v jsonb;
begin
  if coalesce(current_setting('core.in_writer', true), '') = 'on' then perform core.refuse('nested_write'); end if;
  if current_setting('transaction_isolation') <> 'read committed' then perform core.refuse('read_committed_only'); end if;
  me := core.me();
  perform set_config('core.in_writer', 'on', true);
  v := core.writer(me, p_set);
  perform set_config('core.in_writer', '', true);
  return v;
end $$;
revoke all on function public.write(jsonb) from public, anon;
grant execute on function public.write(jsonb) to authenticated;

-- the permanence trigger (§2): only the eraser changes or removes an entry, and a set's ledger row never changes
create function core.permanent() returns trigger language plpgsql as $$
begin
  if current_user = 'core_eraser' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception '% are permanent', tg_table_name using errcode = 'P0001';
end $$;
create trigger entries_permanent before update or delete on core.entries for each row execute function core.permanent();
create trigger entries_no_truncate before truncate on core.entries for each statement execute function core.permanent();
create trigger sets_permanent before update or delete on core.sets for each row execute function core.permanent();
create trigger settings_permanent before update or delete on core.settings for each row execute function core.permanent();
create trigger patient_changes_permanent before update or delete on core.patient_changes for each row execute function core.permanent();
create trigger holdings_permanent before update on core.holdings for each row execute function core.permanent();

-- after commit: pack listeners drain here, as the pack's refresh (a definer owned by the pack's role); a failure marks the
-- (pack, patient) stale and never touches the write that caused it
create procedure core.drain_outbox(p_limit int default 200) language plpgsql as $$
declare o core.outbox; v_err text;
begin
  perform set_config('statement_timeout', '55s', false);   -- a run never outlasts the next one (a SET clause would forbid the COMMIT below)
  for o in select * from core.outbox where tries < 5 order by id limit p_limit for update skip locked loop
    begin
      perform core.run_refresh(o.refresh, o.organization_id, o.items);
      delete from core.outbox where id = o.id;
      -- a pack's table caught up: the screens reading it look again (the hint carries no content)
      perform core.hint('organization:' || o.organization_id);
      if o.patient_id is not null then perform core.hint('record:' || o.patient_id); end if;
    exception when others then
      get stacked diagnostics v_err = message_text;
      update core.outbox set tries = tries + 1, error = v_err where id = o.id;
      if o.patient_id is not null then
        insert into core.stale (organization_id, layer, patient_id, error) values (o.organization_id, o.layer, o.patient_id, v_err)
        on conflict (organization_id, layer, patient_id) do update set error = excluded.error;
      end if;
    end;
    commit;
  end loop;
end $$;
