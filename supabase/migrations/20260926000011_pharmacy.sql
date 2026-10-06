-- 11 · the pharmacy pack on the new contract (spec/openCare.md §5): dispensing an order sent to a pharmacy.
-- Its type pharmacy.dispense extends the base's step, so the order's status, the review loop and FHIR (Task) come from the base.
-- Its table pharmacy.queue is fed by its own type (inline) and by a listener on the base's orders and medications (after commit).

set client_min_messages = warning;

-- ── core: what every pack gets (a role and a schema of its own; doors instead of table privileges) ──
create function core.create_pack(p_key text) returns void language plpgsql as $$
#variable_conflict use_variable
declare r text := 'pack_' || p_key;
begin
  if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I nologin', r); end if;
  execute format('grant %I to postgres', r);
  execute format('create schema if not exists %I authorization %I', p_key, r);
  execute format('revoke all on schema %I from public', p_key);
  execute format('grant usage on schema core, base to %I', r);
  execute format('grant usage on schema %I to core_eraser', p_key);
  execute format('alter default privileges for role %I revoke execute on functions from public', r);   -- global: a per-schema default cannot take it away
  execute format('grant execute on function core.pack_entries(uuid, uuid[]), core.may(uuid, text, uuid), core.setting_at(uuid, text, uuid, timestamptz),
    core.settings_at(uuid, text, timestamptz), core.survivor(uuid, uuid), core.family(uuid, uuid), core.uuid5(uuid, text), core.kinds(text), core.base_of(text),
    core.refuse(text, text), core.hint(text), core.layer_on(uuid, text), core.department_uses(uuid, uuid, text),
    core.pack_kind(uuid, uuid, text, jsonb), core.pack_visit(uuid, uuid, text), core.pack_rows(uuid, text, jsonb), core.pack_codes(text, text[]),
    core.pack_department(uuid, uuid), core.pack_staff(uuid, uuid[]), base.pack_identity(uuid, uuid, timestamptz) to %I', r);
end $$;

-- ── what a pack may read (§5.2): core doors, never core tables. Masked by default: in a check or any read made for a person, the reader
-- is the user signed in (the session's, never a parameter), so a pack sees only what that person may see; only a refresh or a listener
-- (core.run_refresh) reads unmasked, and its rows keep source_entries for the reader to mask. A hidden entry comes back as its
-- placeholder: no data, no codes, no findings, no author. ──
-- the entries of these items (every version), the entries that refer to them and the entries they refer to
create function core.pack_entries(p_org uuid, p_items uuid[]) returns setof core.entries language sql stable security definer set search_path = '' as $$
  select * from core.pack_masked(p_org, array(select e from core.entries e where e.organization_id = p_org and (e.item = any (p_items)
    or e.refers_to in (select x.id from core.entries x where x.organization_id = p_org and x.item = any (p_items))
    or e.id in (select x.refers_to from core.entries x where x.organization_id = p_org and x.item = any (p_items) and x.refers_to is not null))))
$$;

-- a patient's entries of one kind, newest first: the type and every pack type extending it (core.kinds). The filter: data (contained),
-- codes (any of them), from and to (occurred_at, from inclusive), current (only each item's latest version, while it is still of the
-- kind: a crossed-out item drops), limit (500 by default, 2000 at most), applied last. A data or codes filter matches only what the
-- reader may see: the matches are read newest first a page at a time and masked, the hidden ones dropped, until the limit is reached.
create function core.pack_kind(p_org uuid, p_patient uuid, p_kind text, p_filter jsonb default '{}') returns setof core.entries
language plpgsql stable security definer set search_path = '' as $$
declare f jsonb := coalesce(p_filter, '{}'); v_codes text[] := (select array_agg(x) from jsonb_array_elements_text(f -> 'codes') x);
        lim int := greatest(1, least(coalesce((f ->> 'limit')::int, 500), 2000)); v_filtered boolean := f -> 'data' is not null or v_codes is not null;
        page core.entries[]; v_out core.entries[] := '{}'; v_at timestamptz; v_id uuid;
begin
  loop
    select coalesce(array_agg(e order by e.recorded_at desc, e.id desc), '{}') into page from (
      select e.* from core.entries e
       where e.organization_id = p_org and e.patient_id = any (core.family(p_org, p_patient)) and e.type = any (core.kinds(p_kind))
         and (f ->> 'from' is null or e.occurred_at >= (f ->> 'from')::timestamptz) and (f ->> 'to' is null or e.occurred_at < (f ->> 'to')::timestamptz)
         and (f -> 'data' is null or e.data @> (f -> 'data')) and (v_codes is null or e.codes && v_codes)
         and (not coalesce((f ->> 'current')::boolean, false) or not exists (select 1 from core.entries y where y.organization_id = p_org and y.item = e.item and y.item_version > e.item_version))
         and (v_at is null or (e.recorded_at, e.id) < (v_at, v_id))
       order by e.recorded_at desc, e.id desc limit lim) e;
    v_out := v_out || array(select m from core.pack_masked(p_org, page) m where not v_filtered or m.author_id is not null);
    exit when cardinality(v_out) >= lim or cardinality(page) < lim;
    v_at := page[lim].recorded_at; v_id := page[lim].id;
  end loop;
  return query select m.* from unnest(v_out[1:lim]) m order by m.recorded_at desc, m.id desc;
end $$;

-- a visit's entries: its own item (the moves) and every entry written in it, oldest first; of one kind when named
create function core.pack_visit(p_org uuid, p_visit uuid, p_kind text default null) returns setof core.entries language sql stable security definer set search_path = '' as $$
  select * from core.pack_masked(p_org, array(select e from core.entries e where e.organization_id = p_org and (e.visit_id = p_visit or e.item = p_visit)
    and (p_kind is null or e.type = any (core.kinds(p_kind))) order by e.recorded_at, e.id))
$$;

-- rows of one of the base's derived tables, through the registry (never another pack's: a pack reads its own directly). The query:
-- patient (the family's rows), where (as the reader's table filter), latest {by, at} (one row per value of by, the latest by at: latest
-- values by code), limit. The matching rows are read (2000 at most; the newest by at first for latest), a row with a source entry the
-- reader may not see is withheld, then the latest is picked and the limit applied: the latest is the latest the reader may see.
create function core.pack_rows(p_org uuid, p_table text, p_query jsonb default '{}') returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare d core.derived; q jsonb := coalesce(p_query, '{}'); w jsonb := coalesce(p_query -> 'where', '{}'); v jsonb; hid uuid[]; hid_items uuid[];
        v_by text := q -> 'latest' ->> 'by'; v_at text := coalesce(q -> 'latest' ->> 'at', 'at');
        lim int := greatest(1, least(coalesce((q ->> 'limit')::int, 2000), 2000));
begin
  select * into d from core.derived x where x.key = p_table;
  if not found then perform core.refuse('unknown_table', p_table); end if;
  if d.layer <> 'base' then perform core.refuse('other_packs_table', p_table); end if;
  if q ? 'patient' then w := w || jsonb_build_object('patient_id', to_jsonb(core.family(p_org, (q ->> 'patient')::uuid))); end if;
  v := core.table_rows(p_org, d, w, 2000, case when v_by is not null then v_at end);
  hid := core.pack_hidden(p_org, (select array_agg(distinct s::uuid) from jsonb_array_elements(v) r, jsonb_array_elements_text(coalesce(r -> 'source_entries', '[]')) s));
  select coalesce(array_agg(distinct e.item), '{}') into hid_items from core.entries e where e.organization_id = p_org and e.id = any (hid);
  if v_by is null then
    return query select r from jsonb_array_elements(v) with ordinality x(r, n) where not ((r ->> 'item')::uuid = any (hid_items)) order by n limit lim;
  else
    -- the rows come newest first (ordered by at's own type), so the first of each value is its latest
    return query select y.r from (select distinct on (x.r ->> v_by) x.r, x.n from jsonb_array_elements(v) with ordinality x(r, n)
                                   where not ((x.r ->> 'item')::uuid = any (hid_items)) order by x.r ->> v_by, x.n) y order by y.n limit lim;
  end if;
end $$;

-- code properties: a code system's rows (labels, parent, props such as a LOINC code's units or an ATC level)
create function core.pack_codes(p_system text, p_codes text[]) returns table (system text, code text, labels jsonb, parent text, props jsonb, retired boolean)
language sql stable security definer set search_path = '' as $$
  select c.system, c.code, c.labels, c.parent, c.props, c.retired_at is not null from core.codes c where c.system = p_system and c.code = any (p_codes)
$$;

-- a department's work and places (and the packs it uses)
create function core.pack_department(p_org uuid, p_department uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', d.id, 'name', d.name, 'work', d.work, 'site_id', d.site_id, 'retired', d.retired_at is not null,
    'packs', coalesce((select jsonb_agg(l.key order by l.key) from core.layers l where l.is_pack and core.department_uses(p_org, d.id, l.key)), '[]'),
    'places', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'label', p.label, 'name', p.name, 'parent_id', p.parent_id, 'position', p.position,
                          'retired', p.retired_at is not null) order by p.position, p.name) from core.places p where p.organization_id = p_org and p.department_id = d.id), '[]'))
  from core.departments d where d.organization_id = p_org and d.id = p_department and core.pack_hidden(p_org, null) = '{}'
$$;

-- staff identifiers: who these users are (name, title, kind) and their identifiers (syndicate numbers)
create function core.pack_staff(p_org uuid, p_users uuid[]) returns table (user_id uuid, name text, title text, kind text, retired boolean, identifiers jsonb)
language sql stable security definer set search_path = '' as $$
  select u.id, u.name, u.title, u.kind, u.retired_at is not null,
    coalesce((select jsonb_agg(jsonb_build_object('system', i.system, 'value', i.value, 'verified', i.verified) order by i.system, i.value) from core.identifiers i
               where i.organization_id = p_org and i.owner_kind = 'user' and i.owner_id = u.id), '[]')
  from core.users u where u.organization_id = p_org and u.id = any (p_users) and core.pack_hidden(p_org, null) = '{}'
$$;
revoke all on function core.pack_entries(uuid, uuid[]), core.create_pack(text),
  core.pack_kind(uuid, uuid, text, jsonb), core.pack_visit(uuid, uuid, text), core.pack_rows(uuid, text, jsonb), core.pack_codes(text, text[]),
  core.pack_department(uuid, uuid), core.pack_staff(uuid, uuid[]) from public, anon, authenticated;

-- drain the outbox inside a transaction (tests, and the procedure's batches)
create function core.drain(p_limit int default 500) returns int language plpgsql volatile security definer set search_path = '' as $$
declare o core.outbox; v_err text; n int := 0;
begin
  for o in select * from core.outbox where tries < 5 order by id limit p_limit for update skip locked loop
    begin
      perform core.run_refresh(o.refresh, o.organization_id, o.items);
      delete from core.outbox where id = o.id;
      n := n + 1;
    exception when others then
      get stacked diagnostics v_err = message_text;
      update core.outbox set tries = tries + 1, error = v_err where id = o.id;
      if o.patient_id is not null then
        insert into core.stale (organization_id, layer, patient_id, error) values (o.organization_id, o.layer, o.patient_id, v_err)
        on conflict (organization_id, layer, patient_id) do update set error = excluded.error;
      end if;
    end;
  end loop;
  return n;
end $$;
revoke all on function core.drain(int) from public, anon, authenticated;

-- ── the pack ──
select core.declare_pack('pharmacy', 1, '{}', '{"en":"Pharmacy","ar":"الصيدلية"}');
select core.create_pack('pharmacy');

set role pack_pharmacy;

create table pharmacy.queue (
  organization_id uuid not null,
  item          uuid not null,             -- the order item sent to the pharmacy
  patient_id    uuid not null,
  department_id uuid,                      -- the pharmacy it was sent to
  medication_item uuid,
  drug          text,
  dose          text,
  timing        text,
  duration_days int,
  quantity      text,
  status        text not null,             -- to_prepare · prepared · dispensed · cancelled
  prepared_at   timestamptz,
  dispensed_at  timestamptz,
  ordered_at    timestamptz not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);

-- recompute the rows of the orders these items are, answer or are about (the medication an order dispenses)
create function pharmacy.queue_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare es core.entries[]; k uuid; keys uuid[]; o1 core.entries; ol core.entries; m core.entries; d core.entries; v_answer text; v_status text; src uuid[];
begin
  select coalesce(array_agg(e), '{}') into es from core.pack_entries(p_org, p_items) e;
  -- the order items: those given, those answered by the given ones, those about a given medication
  select coalesce(array_agg(distinct x), '{}') into keys from (
    select e.item x from unnest(es) e where e.item = any (p_items) and e.type = any (core.kinds('order'))
    union select o.item from unnest(es) a join core.pack_entries(p_org, (select array_agg(y.item) from unnest(es) y)) o on o.id = a.refers_to
     where a.item = any (p_items) and a.relation = 'answers' and o.type = any (core.kinds('order'))
    union select e.item from unnest(es) e where e.relation = 'about' and e.type = any (core.kinds('order'))) q;
  delete from pharmacy.queue where organization_id = p_org and item = any (keys);
  foreach k in array keys loop
    select e.* into o1 from core.pack_entries(p_org, array[k]) e where e.item = k and e.item_version = 1;
    select e.* into ol from core.pack_entries(p_org, array[k]) e where e.item = k order by e.item_version desc limit 1;
    continue when o1.id is null or ol.type = 'crossed_out';
    v_answer := coalesce(o1.data -> 'service' ->> 'answer', (select s.data ->> 'answer' from core.settings_at(p_org, 'service') s where s.thing_id = (o1.data -> 'service' ->> 'id')::uuid));
    continue when v_answer is distinct from 'pharmacy.dispense';
    -- the medication it dispenses: the latest version of the item it is about
    m := null;
    if o1.relation = 'about' then
      select e.* into m from core.pack_entries(p_org, (select array[t.item] from core.pack_entries(p_org, array[k]) t where t.id = o1.refers_to limit 1)) e
       where e.item = (select t.item from core.pack_entries(p_org, array[k]) t where t.id = o1.refers_to limit 1)
       order by e.item_version desc limit 1;
    end if;
    d := null;
    -- the latest dispense answering it
    select l.* into d from core.pack_entries(p_org, array[k]) a, lateral (select x.* from core.pack_entries(p_org, array[a.item]) x where x.item = a.item order by x.item_version desc limit 1) l
     where a.refers_to in (select t.id from core.pack_entries(p_org, array[k]) t where t.item = k) and a.relation = 'answers' and a.type = 'pharmacy.dispense'
     order by l.recorded_at desc limit 1;
    v_status := case when ol.data ->> 'status' = 'revoked' or d.type = 'crossed_out' and false then 'cancelled'
                     when d.data ->> 'status' = 'completed' then 'dispensed'
                     when d.data ->> 'status' in ('cancelled', 'rejected', 'failed') then 'cancelled'
                     when d.id is not null then 'prepared' else 'to_prepare' end;
    src := (select array_agg(distinct x.id) from core.pack_entries(p_org, array[k] || coalesce(m.item, k) || coalesce(d.item, k)) x
             where x.item in (k, coalesce(m.item, k), coalesce(d.item, k)));
    insert into pharmacy.queue values (p_org, k, core.survivor(p_org, o1.patient_id), (ol.data ->> 'department_id')::uuid, m.item, m.data -> 'drug' ->> 'text',
      coalesce(m.data -> 'dosage' -> 'dose' ->> 'value' || ' ' || coalesce(m.data -> 'dosage' -> 'dose' ->> 'unit', ''), null), m.data -> 'dosage' -> 'timing' ->> 'code',
      (m.data ->> 'duration_days')::int, m.data -> 'quantity' ->> 'value', v_status,
      case when d.id is not null then (select min(x.recorded_at) from core.pack_entries(p_org, array[d.item]) x where x.item = d.item) end,
      case when v_status = 'dispensed' then d.recorded_at end, o1.recorded_at, coalesce(src, '{}'));
  end loop;
end $$;

-- a dispense: its items; a result or a note never answers a dispensing order (the base's answer check), and only a pharmacy dispenses
create function pharmacy.dispense_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_entry -> 'data' ->> 'status' = 'completed' and jsonb_array_length(coalesce(p_entry -> 'data' -> 'pharmacy' -> 'items', '[]')) = 0 then
    return jsonb_build_array(jsonb_build_object('code', 'nothing_dispensed', 'level', 'refuse'));
  end if;
  return '[]';
end $$;

create function pharmacy.dispense_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'completed' then 'Dispensed' when 'cancelled' then 'Not dispensed' else coalesce(initcap(e -> 'data' ->> 'step'), 'Dispensing') end ||
    coalesce(' · ' || (select string_agg(concat_ws(' ', i -> 'drug' ->> 'text', i -> 'dose' ->> 'value', i -> 'dose' ->> 'unit', '× ' || (i -> 'quantity' ->> 'value')), ', ')
                       from jsonb_array_elements(e -> 'data' -> 'pharmacy' -> 'items') i), '') ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;

-- the counselling note shown when giving: shown needs words (the form shows the refusal next to the note)
create function pharmacy.counselling_check(p_where jsonb, p_data jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when coalesce((p_data ->> 'show')::boolean, false) and coalesce(trim(p_data ->> 'note'), '') = ''
    then jsonb_build_array(jsonb_build_object('code', 'note_missing', 'level', 'refuse', 'field', 'note')) else '[]'::jsonb end
$$;

reset role;

grant select, delete on pharmacy.queue to core_eraser;
grant execute on function pharmacy.queue_refresh(uuid, uuid[]) to core_eraser;

select core.declare_action('write:pharmacy.dispense', 'pharmacy', 'department', '{"en":"Dispense"}');
select core.declare_action('read:pharmacy.queue', 'pharmacy', 'department', '{"en":"Read the dispensing queue"}');
select core.declare_table('pharmacy.queue', 'pharmacy', 'pharmacy.queue_refresh(uuid,uuid[])', 'read:pharmacy.queue');
select core.declare_type('pharmacy.dispense', 1, 'pharmacy', '{"type":"object","additionalProperties":false,"required":["status"],
    "properties":{"status":{"enum":["in-progress","completed","cancelled","rejected"]},"step":{"type":"string"},"reason":{"type":"string"},"note":{"type":"string"},
      "pharmacy":{"type":"object","additionalProperties":false,"properties":{"items":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["drug","quantity"],
        "properties":{"drug":{"$ref":"#/$defs/concept"},"dose":{"$ref":"#/$defs/quantity"},"quantity":{"$ref":"#/$defs/quantity"},"batch":{"type":"string"},"expiry":{"type":"string"},"note":{"type":"string"}}}}}}}}'::jsonb,
  'pharmacy.dispense_line(jsonb)', array['Task'], base_type => 'step', checks => array['pharmacy.dispense_check(jsonb,jsonb)']::regprocedure[],
  feeds => array['pharmacy.queue'], labels => '{"en":"Dispense","ar":"صرف"}');
select core.declare_listener('pharmacy', array['order', 'medication'], 'pharmacy.queue_refresh(uuid,uuid[])');
-- its one screen for the work sent to a pharmacy: the bench's list and actions for dispensing, so it stands in for the bench (§5.1 rule 4)
select core.declare_screen('pharmacy.dispensing', 'pharmacy', 'bench', '{"en":"Dispensing"}', 'read:pharmacy.queue', array['base.bench']);
select core.declare_role('00000000-0000-0000-0000-00000000ca01', 'pharmacist', 'pharmacy', 'Pharmacist', array[
  'read:patients', 'read:bench', 'read:pharmacy.queue', 'read:queue', 'write:pharmacy.dispense', 'write:note', 'write:crossed_out'], '{"en":"Pharmacist"}');
-- its settings (§5.1 rule 7), each drawn by the automatic form: how long a prepared dispense waits before Dispensing marks it late, per
-- pharmacy (on the department's card); the counselling note shown when giving, for the clinic (on the pack's page)
select core.declare_setting('pharmacy.late_after', 'pharmacy', 'department',
  '{"type":"object","additionalProperties":false,"required":["minutes"],"properties":{"minutes":{"type":"integer","minimum":5,"maximum":1440,"default":30}}}',
  labels => '{"en":"Late to collect"}', form => 'department',
  fields => '[{"key":"minutes","labels":{"en":"Prepared reads late after"},"unit":"min",
    "help":{"en":"A dispense prepared this long ago and not yet given is marked late on Dispensing."}}]');
select core.declare_setting('pharmacy.counselling', 'pharmacy', 'organization',
  '{"type":"object","additionalProperties":false,"required":["show"],"properties":{"show":{"type":"boolean","default":false},"note":{"type":"string","maxLength":400}}}',
  'pharmacy.counselling_check(jsonb,jsonb)', labels => '{"en":"Counselling when giving"}', form => 'pack',
  fields => '[{"key":"show","labels":{"en":"Show a counselling note"},"help":{"en":"Shown to whoever gives, above Give."}},
    {"key":"note","labels":{"en":"Note"},"help":{"en":"What to tell the patient: how to take it, what to watch for."}}]');
