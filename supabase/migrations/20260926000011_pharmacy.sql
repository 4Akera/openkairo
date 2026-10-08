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
    core.pack_department(uuid, uuid), core.pack_staff(uuid, uuid[]), base.pack_identity(uuid, uuid, timestamptz), core.score(text, text, jsonb),
    core.fhir_uri(text, uuid), core.fhir_coding(jsonb, uuid), core.fhir_concept(jsonb, uuid), core.fhir_code(text, text, text, uuid), core.fhir_quantity(jsonb),
    core.fhir_date(timestamptz, text, uuid), core.fhir_instant(timestamptz), core.fhir_meta(jsonb, boolean) to %I', r);
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

-- drain the outbox inside a transaction (tests): as the job does, live work before a catch-up's; the rows done
create function core.drain(p_limit int default 500) returns int language plpgsql volatile security definer set search_path = '' as $$
declare o core.outbox; n int := 0; v_orgs uuid[] := '{}';
begin
  for o in select * from core.outbox where tries < 5 order by (kind = 'catch_up'), id limit p_limit for update skip locked loop
    if core.drain_one(o) then n := n + 1; end if;
    v_orgs := v_orgs || o.organization_id;
  end loop;
  perform core.drain_hints(v_orgs);
  return n;
end $$;
revoke all on function core.drain(int) from public, anon, authenticated;

-- ── the pack ──
select core.declare_pack('pharmacy', 1, '{}', '{"en":"Pharmacy","ar":"الصيدلية"}', role_block => 'ca');
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
  status        text not null,             -- to_prepare · prepared · owed · dispensed · cancelled
  prepared_at   timestamptz,
  dispensed_at  timestamptz,
  ordered_at    timestamptz not null,
  source_entries uuid[] not null,
  instructions  text,                      -- the prescription's own words (with meals), for the directions in Arabic
  warnings      jsonb not null default '[]',   -- what the prescriber was warned of (allergy, duplicate) and whether they signed anyway
  owed          text,                      -- given in part: what is still owed (spec §5.3)
  question      jsonb,                     -- the pharmacy asked the doctor (spec §5.3): text, at; when answered, answer, action, answered_by, answered_at
  primary key (organization_id, item)
);

-- recompute the rows of the orders these items are, answer or are about (the medication an order dispenses)
create function pharmacy.queue_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare es core.entries[]; k uuid; keys uuid[]; o1 core.entries; ol core.entries; m core.entries; d core.entries; v_answer text; v_status text; src uuid[];
        v_warn jsonb; qn core.entries; rv core.entries; v_q jsonb;
begin
  select coalesce(array_agg(e), '{}') into es from core.pack_entries(p_org, p_items) e;
  -- the order items: those given, those answered by the given ones, those about a given medication
  select coalesce(array_agg(distinct x), '{}') into keys from (
    select e.item x from unnest(es) e where e.item = any (p_items) and e.type = any (core.kinds('order'))
    union select o.item from unnest(es) a join core.pack_entries(p_org, (select array_agg(y.item) from unnest(es) y)) o on o.id = a.refers_to
     where a.item = any (p_items) and a.relation = 'answers' and o.type = any (core.kinds('order'))
    union select e.item from unnest(es) e where e.relation = 'about' and e.type = any (core.kinds('order'))
    -- a question about an order, or the answer to one: the order it is about
    union select o.item from unnest(es) a join unnest(es) o on o.id = a.refers_to
     where a.item = any (p_items) and a.relation = 'about' and a.type = any (core.kinds('question')) and o.type = any (core.kinds('order'))
    union select o.item from unnest(es) r join unnest(es) a on a.id = r.refers_to, core.pack_entries(p_org, array[a.item]) o
     where r.item = any (p_items) and r.type = any (core.kinds('reviewed')) and a.type = any (core.kinds('question')) and o.id = a.refers_to
       and o.type = any (core.kinds('order'))) q;
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
                     when d.data -> 'pharmacy' ? 'owed' then 'owed'
                     when d.id is not null then 'prepared' else 'to_prepare' end;
    -- the pharmacy's latest question about it, and the doctor's answer
    qn := null; rv := null; v_q := null;
    select x.* into qn from core.pack_entries(p_org, array[k]) x where x.type = any (core.kinds('question')) and x.relation = 'about'
       and x.refers_to in (select t.id from core.pack_entries(p_org, array[k]) t where t.item = k) order by x.recorded_at desc limit 1;
    if qn.id is not null then
      select x.* into rv from core.pack_entries(p_org, array[qn.item]) x where x.type = any (core.kinds('reviewed')) and x.refers_to = qn.id order by x.recorded_at desc limit 1;
      v_q := jsonb_strip_nulls(jsonb_build_object('text', qn.data ->> 'text', 'at', qn.recorded_at, 'answer', rv.data ->> 'note', 'action', rv.data ->> 'action', 'answered_at', rv.recorded_at,
        'answered_by', (select s.name from core.pack_staff(p_org, array[rv.author_id]) s)));
    end if;
    -- the prescriber's warnings on the medicine (allergy, duplicate), and whether they signed anyway: the pharmacist checks them
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('code', f ->> 'code', 'detail', f ->> 'detail', 'confirmed', (f ->> 'confirmed')::boolean))), '[]')
      into v_warn from jsonb_array_elements(coalesce(m.findings, '[]')) f
     where f ->> 'code' in ('allergy_clash', 'allergy_caution', 'duplicate_medication', 'duplicate_class');
    src := (select array_agg(distinct x.id) from core.pack_entries(p_org, array[k] || coalesce(m.item, k) || coalesce(d.item, k)) x
             where x.item in (k, coalesce(m.item, k), coalesce(d.item, k)));
    insert into pharmacy.queue values (p_org, k, core.survivor(p_org, o1.patient_id), (ol.data ->> 'department_id')::uuid, m.item, m.data -> 'drug' ->> 'text',
      coalesce(m.data -> 'dosage' -> 'dose' ->> 'value' || ' ' || coalesce(m.data -> 'dosage' -> 'dose' ->> 'unit', ''), null), m.data -> 'dosage' -> 'timing' ->> 'code',
      (m.data ->> 'duration_days')::int, m.data -> 'quantity' ->> 'value', v_status,
      -- clinical times, as base.orders' are
      case when d.id is not null then (select min(x.occurred_at) from core.pack_entries(p_org, array[d.item]) x where x.item = d.item) end,
      case when v_status = 'dispensed' then d.occurred_at end, o1.occurred_at, coalesce(src, '{}'), m.data ->> 'instructions', v_warn,
      case when v_status = 'owed' then concat_ws(' ', d.data -> 'pharmacy' -> 'owed' ->> 'value', d.data -> 'pharmacy' -> 'owed' ->> 'unit') end, v_q);
  end loop;
end $$;

-- a dispense: its items; a result or a note never answers a dispensing order (the base's answer check), and only a pharmacy dispenses
create function pharmacy.dispense_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (p_entry -> 'data' ->> 'status' = 'completed' or p_entry -> 'data' -> 'pharmacy' ? 'owed') and jsonb_array_length(coalesce(p_entry -> 'data' -> 'pharmacy' -> 'items', '[]')) = 0 then
    return jsonb_build_array(jsonb_build_object('code', 'nothing_dispensed', 'level', 'refuse'));
  end if;
  return '[]';
end $$;

create function pharmacy.dispense_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' -> 'pharmacy' ? 'owed' then 'Given in part' else case e -> 'data' ->> 'status' when 'completed' then 'Dispensed' when 'cancelled' then 'Not dispensed'
           else coalesce(initcap(e -> 'data' ->> 'step'), 'Dispensing') end end ||
    coalesce(' · ' || (select string_agg(concat_ws(' ', i -> 'drug' ->> 'text', i -> 'dose' ->> 'value', i -> 'dose' ->> 'unit', '× ' || (i -> 'quantity' ->> 'value')), ', ')
                       from jsonb_array_elements(e -> 'data' -> 'pharmacy' -> 'items') i), '') ||
    case when e -> 'data' -> 'pharmacy' ? 'owed' then ' · owes ' || concat_ws(' ', e -> 'data' -> 'pharmacy' -> 'owed' ->> 'value', e -> 'data' -> 'pharmacy' -> 'owed' ->> 'unit') else '' end ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;

-- its FHIR beside the base's Task (§5.2 Export: the base maps the dispense as the step it extends; this only adds). A MedicationDispense
-- for each thing given ({item}-d1, -d2 …), or one declined for the medicine prescribed, with the reason; on the Task an output naming
-- each. Its prescription is the MedicationRequest of the version the order was about
create function pharmacy.dispense_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p ->> 'org')::uuid; v_item text := p -> 'entries' -> 0 ->> 'item'; o jsonb; l jsonb; v_status text; ord core.entries; m core.entries;
        v_rx jsonb; v_head jsonb; i jsonb; n int := 0; out jsonb := '[]'; outs jsonb := '[]';
begin
  l := p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1);
  select e into o from jsonb_array_elements(p -> 'entries') with ordinality x(e, k) where e ->> 'type' <> 'crossed_out' order by k desc limit 1;
  if o is null then return '[]'; end if;
  v_status := case when l ->> 'type' = 'crossed_out' then 'entered-in-error'
                   else case o -> 'data' ->> 'status' when 'completed' then 'completed' when 'in-progress' then 'in-progress' else 'declined' end end;
  -- the order it answers, and the medicine that order is about (never private: the queue copies it too)
  select x.* into ord from core.pack_entries(v_org, array[v_item::uuid]) x where x.id = (p -> 'entries' -> 0 ->> 'refers_to')::uuid;
  if ord.id is not null and ord.relation = 'about' then
    select x.* into m from core.pack_entries(v_org, array[ord.item]) x where x.id = ord.refers_to;
  end if;
  v_rx := case when m.data ->> 'basis' = 'prescribed' then jsonb_build_array(jsonb_build_object('reference', 'MedicationRequest/' || m.id)) end;
  v_head := jsonb_build_object('resourceType', 'MedicationDispense', 'meta', core.fhir_meta(o, coalesce((p ->> 'private')::boolean, false)), 'status', v_status,
    'subject', jsonb_build_object('reference', 'Patient/' || (p ->> 'patient')),
    'context', case when o ->> 'visit_id' is not null then jsonb_build_object('reference', 'Encounter/' || (o ->> 'visit_id')) end,
    'performer', jsonb_build_array(jsonb_build_object('actor', jsonb_build_object('reference', 'PractitionerRole/' || (o ->> 'author_id')))),
    'authorizingPrescription', v_rx);
  for i in select * from jsonb_array_elements(coalesce(o -> 'data' -> 'pharmacy' -> 'items', '[]')) loop
    n := n + 1;
    out := out || jsonb_build_array(jsonb_strip_nulls(v_head || jsonb_build_object('id', v_item || '-d' || n,
      'medicationCodeableConcept', core.fhir_concept(i -> 'drug', v_org), 'quantity', core.fhir_quantity(i -> 'quantity'),
      'whenHandedOver', case when v_status = 'completed' then core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org) end,
      'dosageInstruction', case when i ? 'dose' then jsonb_build_array(jsonb_build_object('doseAndRate', jsonb_build_array(jsonb_build_object('doseQuantity', core.fhir_quantity(i -> 'dose'))))) end,
      'note', case when coalesce(i ->> 'note', '') <> '' then jsonb_build_array(jsonb_build_object('text', i ->> 'note')) end)));
  end loop;
  -- not given: the medicine prescribed, declined, and why
  if n = 0 and v_status = 'declined' and m.id is not null then
    n := 1;
    out := jsonb_build_array(jsonb_strip_nulls(v_head || jsonb_build_object('id', v_item || '-d1', 'medicationCodeableConcept', core.fhir_concept(m.data -> 'drug', v_org),
      'statusReasonCodeableConcept', case when coalesce(o -> 'data' ->> 'reason', '') <> '' then jsonb_build_object('text', o -> 'data' ->> 'reason') end)));
  end if;
  if n = 0 then return '[]'; end if;
  select jsonb_agg(jsonb_build_object('type', jsonb_build_object('text', 'Dispensed'), 'valueReference', jsonb_build_object('reference', 'MedicationDispense/' || (d ->> 'id'))))
    into outs from jsonb_array_elements(out) d;
  return out || jsonb_build_array(jsonb_build_object('resourceType', 'Task', 'id', v_item, 'output', outs));
end $$;

-- ── its stock (spec §5.3: part of the pack, its setting Keep stock): products in its settings (pharmacy.product, each pharmacy's), and
-- this small table of its own for what comes in and what is counted — only ever added to, who and when on every row; what is given is
-- the dispense records (pharmacy.given), never copied: on hand = received + counted − given. Read and written only through its
-- operations (core.declare_op, public.pack_op), never by table privileges ──
create table pharmacy.stock (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),
  department_id uuid not null,               -- the pharmacy it is in
  product_id    uuid not null,               -- a pharmacy.product (the clinic's one list)
  batch         text,
  expiry        date,                        -- the last day it may be given (the month printed, to its end)
  kind          text not null check (kind in ('received', 'counted', 'expired', 'damaged', 'sent', 'arrived')),
  quantity      int not null,                -- units (tablets, capsules, bottles): in +, out −
  other_department_id uuid,                  -- sent: the place it went to; arrived: the place it came from
  transfer_id   uuid,                        -- the one send that wrote both rows (sent here, arrived there)
  supplier      text,
  invoice       text,
  reason        text,
  author_id     uuid not null,
  recorded_at   timestamptz not null default clock_timestamp(),   -- when written (several rows of one count keep their order)
  primary key (organization_id, id)
);
create index stock_product on pharmacy.stock (organization_id, department_id, product_id);

-- what was given from the stock: each thing a dispense gave from a product, by batch (a derived table, from the dispenses)
create table pharmacy.given (
  organization_id uuid not null,
  item          uuid not null,             -- the dispense item
  n             int not null,              -- its n-th thing given
  patient_id    uuid not null,
  department_id uuid not null,             -- the pharmacy that gave it
  product_id    uuid not null,
  batch         text,
  quantity      int not null,              -- units
  at            timestamptz not null,
  source_entries uuid[] not null,
  primary key (organization_id, item, n)
);
create function pharmacy.given_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; l core.entries;
begin
  delete from pharmacy.given where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into l from core.pack_entries(p_org, array[k]) x where x.item = k order by x.item_version desc limit 1;
    continue when l.id is null or l.type <> 'pharmacy.dispense' or coalesce(l.data ->> 'status', '') not in ('completed', 'in-progress');
    insert into pharmacy.given
    select p_org, k, i.n::int, core.survivor(p_org, l.patient_id), l.department_id, (i.x ->> 'product')::uuid, i.x ->> 'batch',
           coalesce((i.x -> 'quantity' ->> 'value')::numeric, 0)::int, l.occurred_at,
           (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[k]) e where e.item = k)
      from jsonb_array_elements(coalesce(l.data -> 'pharmacy' -> 'items', '[]')) with ordinality i(x, n) where i.x ? 'product';
  end loop;
end $$;

-- 2027-05 → 31 May 2027 (a box says the month); a whole date as it is
create function pharmacy.expiry_of(p text) returns date language sql immutable security definer set search_path = '' as $$
  select case when p ~ '^\d{4}-\d{2}$' then (to_date(p || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
              when p ~ '^\d{4}-\d{2}-\d{2}$' then p::date end
$$;
-- the Stock screen's read: every product of the clinic's one list with what this place has of it and its batches (first to expire
-- first), its minimum here, and whether this place keeps it (a minimum set here, or anything that moved here); what the other places
-- that keep stock have of the products they keep, against their minimums (a store sends what a pharmacy runs low on); with a product
-- named, its last movements here — received, sent, arrived, counted, given — newest first
create function pharmacy.stock_read(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_product uuid := (p_args ->> 'product')::uuid; v_moves jsonb := '[]'; v_min jsonb := coalesce(core.setting_at(p_org, 'pharmacy.minimums', p_department) -> 'minimums', '{}');
begin
  -- what each place has, by product and batch: its own rows less what it gave
  create temp table if not exists pharmacy_on_hand (department_id uuid, product_id uuid, batch text, expiry date, units int) on commit drop;
  delete from pharmacy_on_hand where true;
  insert into pharmacy_on_hand select x.department_id, x.product_id, x.batch, max(x.expiry), sum(x.q)::int from (
    select s.department_id, s.product_id, s.batch, s.expiry, s.quantity q from pharmacy.stock s where s.organization_id = p_org
    union all select g.department_id, g.product_id, g.batch, null::date, -g.quantity from pharmacy.given g where g.organization_id = p_org) x
   group by x.department_id, x.product_id, x.batch;
  if v_product is not null then
    select coalesce(jsonb_agg(m order by (m ->> 'at')::timestamptz desc), '[]') into v_moves from (
      select m from (
        select jsonb_strip_nulls(jsonb_build_object('at', s.recorded_at, 'kind', s.kind, 'units', s.quantity, 'batch', s.batch, 'expiry', s.expiry, 'supplier', s.supplier,
                 'invoice', s.invoice, 'reason', s.reason, 'other', s.other_department_id, 'by', (select x.name from core.pack_staff(p_org, array[s.author_id]) x))) m, s.recorded_at at
          from pharmacy.stock s where s.organization_id = p_org and s.department_id = p_department and s.product_id = v_product
        union all
        select jsonb_strip_nulls(jsonb_build_object('at', g.at, 'kind', 'given', 'units', -g.quantity, 'batch', g.batch)), g.at
          from pharmacy.given g where g.organization_id = p_org and g.department_id = p_department and g.product_id = v_product) y
      order by y.at desc limit 40) z;
  end if;
  return jsonb_build_object('moves', v_moves,
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', s.thing_id) || s.data || jsonb_build_object(
      'on_hand', coalesce((select sum(h.units) from pharmacy_on_hand h where h.department_id = p_department and h.product_id = s.thing_id), 0),
      'batches', coalesce((select jsonb_agg(jsonb_build_object('batch', h.batch, 'expiry', h.expiry, 'units', h.units) order by h.expiry nulls last)
                            from pharmacy_on_hand h where h.department_id = p_department and h.product_id = s.thing_id and h.units > 0 and h.batch is not null), '[]'),
      'minimum', (v_min ->> s.thing_id::text)::int,
      'kept', v_min ? s.thing_id::text or exists (select 1 from pharmacy_on_hand h where h.department_id = p_department and h.product_id = s.thing_id))
    order by s.data ->> 'brand') from core.settings_at(p_org, 'pharmacy.product') s), '[]'),
    -- the other places that keep stock (the pack used there, Keep stock on): what they have of each product they keep a minimum of
    'elsewhere', coalesce((select jsonb_agg(jsonb_build_object('department_id', k.owner_id, 'product_id', m.key::uuid, 'minimum', (m.value #>> '{}')::int,
        'units', coalesce((select sum(h.units) from pharmacy_on_hand h where h.department_id = k.owner_id and h.product_id = m.key::uuid), 0)))
      from core.settings_at(p_org, 'pharmacy.keep_stock') k
      cross join lateral jsonb_each(coalesce(core.setting_at(p_org, 'pharmacy.minimums', k.owner_id) -> 'minimums', '{}')) m
     where k.owner_id <> p_department and coalesce((k.data ->> 'keep')::boolean, false) and core.department_uses(p_org, k.owner_id, 'pharmacy')), '[]'));
end $$;

-- the Stock screen's writes, each in one go (a refusal keeps nothing): receive a delivery (lines of product, batch, expiry, boxes); a
-- count (lines of product, units counted, and a reason for any difference: a new row each, nothing written before changes); or send to
-- another place that keeps stock (lines of product, batch, boxes): in one step — it leaves here (sent) and is there (arrived) at once,
-- its batch and expiry with it, never more of a batch than is here
create function pharmacy.stock_write(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare l jsonb; v_do text := p_args ->> 'do'; v_pack int; v_prod jsonb; v_exp date; v_have int; v_count int; n int := 0; v_to uuid; v_units int; v_send uuid := gen_random_uuid();
begin
  if v_do is null or v_do not in ('receive', 'count', 'send') then perform core.refuse('unknown_op', coalesce(v_do, 'nothing')); end if;
  if v_do = 'send' then
    v_to := (p_args ->> 'to')::uuid;
    if v_to is null or v_to = p_department or not coalesce((core.setting_at(p_org, 'pharmacy.keep_stock', v_to) ->> 'keep')::boolean, false)
       or not core.department_uses(p_org, v_to, 'pharmacy') then
      perform core.refuse('not_a_stock_place', coalesce(p_args ->> 'to', 'nowhere'));
    end if;
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_args -> 'lines', '[]')) loop
    select s.data into v_prod from core.settings_at(p_org, 'pharmacy.product') s where s.thing_id = (l ->> 'product_id')::uuid;
    if v_prod is null then perform core.refuse('unknown_product', coalesce(l ->> 'product_id', '')); end if;
    v_pack := greatest(1, coalesce((v_prod ->> 'pack_size')::int, 1));
    if v_do = 'receive' then
      if coalesce((l ->> 'boxes')::int, 0) <= 0 then perform core.refuse('nothing_received', v_prod ->> 'brand'); end if;
      if coalesce(trim(l ->> 'batch'), '') = '' then perform core.refuse('batch_missing', v_prod ->> 'brand'); end if;
      v_exp := pharmacy.expiry_of(l ->> 'expiry');
      if v_exp is null then perform core.refuse('expiry_missing', v_prod ->> 'brand'); end if;
      if v_exp < current_date then perform core.refuse('expired_already', v_prod ->> 'brand'); end if;
      insert into pharmacy.stock (organization_id, department_id, product_id, batch, expiry, kind, quantity, supplier, invoice, author_id)
      values (p_org, p_department, (l ->> 'product_id')::uuid, trim(l ->> 'batch'), v_exp, 'received', (l ->> 'boxes')::int * v_pack,
              nullif(trim(p_args ->> 'supplier'), ''), nullif(trim(p_args ->> 'invoice'), ''), p_user);
      n := n + 1;
    elsif v_do = 'send' then
      v_units := coalesce((l ->> 'boxes')::int * v_pack, (l ->> 'units')::int, 0);
      if v_units <= 0 then perform core.refuse('nothing_sent', v_prod ->> 'brand'); end if;
      if coalesce(trim(l ->> 'batch'), '') = '' then perform core.refuse('batch_missing', v_prod ->> 'brand'); end if;
      -- that batch here: its own rows less what was given of it
      select coalesce(sum(x.q), 0)::int, max(x.e) into v_have, v_exp from (
        select s.quantity q, s.expiry e from pharmacy.stock s where s.organization_id = p_org and s.department_id = p_department and s.product_id = (l ->> 'product_id')::uuid and s.batch = trim(l ->> 'batch')
        union all select -g.quantity, null from pharmacy.given g where g.organization_id = p_org and g.department_id = p_department and g.product_id = (l ->> 'product_id')::uuid and g.batch = trim(l ->> 'batch')) x;
      if v_units > v_have then perform core.refuse('not_enough', format('%s, batch %s: %s here', v_prod ->> 'brand', trim(l ->> 'batch'), v_have)); end if;
      insert into pharmacy.stock (organization_id, department_id, product_id, batch, expiry, kind, quantity, other_department_id, transfer_id, author_id) values
        (p_org, p_department, (l ->> 'product_id')::uuid, trim(l ->> 'batch'), v_exp, 'sent', -v_units, v_to, v_send, p_user),
        (p_org, v_to, (l ->> 'product_id')::uuid, trim(l ->> 'batch'), v_exp, 'arrived', v_units, p_department, v_send, p_user);
      n := n + 1;
    else
      v_count := (l ->> 'units')::int;
      if v_count is null or v_count < 0 then perform core.refuse('bad_count', v_prod ->> 'brand'); end if;
      -- on hand now: its own rows less what it gave (as the read sums them)
      select coalesce(sum(x.q), 0)::int into v_have from (
        select s.quantity q from pharmacy.stock s where s.organization_id = p_org and s.department_id = p_department and s.product_id = (l ->> 'product_id')::uuid
        union all select -g.quantity from pharmacy.given g where g.organization_id = p_org and g.department_id = p_department and g.product_id = (l ->> 'product_id')::uuid) x;
      if v_count <> v_have then
        if coalesce(trim(l ->> 'reason'), '') = '' then perform core.refuse('reason_missing', v_prod ->> 'brand'); end if;
        insert into pharmacy.stock (organization_id, department_id, product_id, kind, quantity, reason, author_id)
        values (p_org, p_department, (l ->> 'product_id')::uuid, case lower(trim(l ->> 'reason')) when 'expired' then 'expired' when 'damaged' then 'damaged' else 'counted' end,
                v_count - v_have, trim(l ->> 'reason'), p_user);
        n := n + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('rows', n);
end $$;

-- the counselling note shown when giving: shown needs words (the form shows the refusal next to the note)
create function pharmacy.counselling_check(p_where jsonb, p_data jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when coalesce((p_data ->> 'show')::boolean, false) and coalesce(trim(p_data ->> 'note'), '') = ''
    then jsonb_build_array(jsonb_build_object('code', 'note_missing', 'level', 'refuse', 'field', 'note')) else '[]'::jsonb end
$$;

-- a product's prices (spec §5.4, owner 2026-10-08: the pharmacy's own, per box and per strip): a strip price needs the strip's size, and a
-- strip is smaller than the box it comes in (the form shows each refusal under its field)
create function pharmacy.product_check(p_where jsonb, p_data jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(f), '[]'::jsonb) from (
    select jsonb_build_object('code', 'strip_size_missing', 'level', 'refuse', 'field', 'strip_size') f where p_data ? 'price_strip' and not p_data ? 'strip_size'
    union all
    select jsonb_build_object('code', 'strip_not_smaller', 'level', 'refuse', 'field', 'strip_size') where (p_data ->> 'strip_size')::int >= (p_data ->> 'pack_size')::int) x
$$;

reset role;

grant select, delete on pharmacy.queue, pharmacy.given to core_eraser;
grant execute on function pharmacy.queue_refresh(uuid, uuid[]), pharmacy.given_refresh(uuid, uuid[]) to core_eraser;

select core.declare_action('write:pharmacy.dispense', 'pharmacy', 'department', '{"en":"Dispense"}');
select core.declare_action('read:pharmacy.queue', 'pharmacy', 'department', '{"en":"Read the dispensing queue"}');
select core.declare_action('write:pharmacy.stock', 'pharmacy', 'department', '{"en":"Receive and count stock"}');
select core.declare_table('pharmacy.queue', 'pharmacy', 'pharmacy.queue_refresh(uuid,uuid[])', 'read:pharmacy.queue');
select core.declare_table('pharmacy.given', 'pharmacy', 'pharmacy.given_refresh(uuid,uuid[])', 'read:pharmacy.queue');
select core.declare_op('pharmacy.stock', 'pharmacy', 'pharmacy.stock_read(uuid,uuid,uuid,jsonb)', 'read:pharmacy.queue');
select core.declare_op('pharmacy.stock_write', 'pharmacy', 'pharmacy.stock_write(uuid,uuid,uuid,jsonb)', 'write:pharmacy.stock');
select core.declare_type('pharmacy.dispense', 1, 'pharmacy', '{"type":"object","additionalProperties":false,"required":["status"],
    "properties":{"status":{"enum":["in-progress","completed","cancelled","rejected"]},"step":{"type":"string"},"reason":{"type":"string"},"note":{"type":"string"},
      "pharmacy":{"type":"object","additionalProperties":false,"properties":{"items":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["drug","quantity"],
        "properties":{"drug":{"$ref":"#/$defs/concept"},"dose":{"$ref":"#/$defs/quantity"},"quantity":{"$ref":"#/$defs/quantity"},"batch":{"type":"string"},"expiry":{"type":"string"},"note":{"type":"string"},
          "instead_of":{"type":"string"},"directions":{"type":"string"},"product":{"type":"string","format":"uuid"}}}},
        "owed":{"$ref":"#/$defs/quantity"},"received_by":{"type":"string"}}}}}'::jsonb,
  'pharmacy.dispense_line(jsonb)', array['Task', 'MedicationDispense'], base_type => 'step', checks => array['pharmacy.dispense_check(jsonb,jsonb)']::regprocedure[],
  to_fhir => 'pharmacy.dispense_fhir(jsonb)',
  feeds => array['pharmacy.queue', 'pharmacy.given'], labels => '{"en":"Dispense","ar":"صرف"}');
select core.declare_listener('pharmacy', array['order', 'medication', 'question', 'reviewed'], 'pharmacy.queue_refresh(uuid,uuid[])');
-- its one screen for the work sent to a pharmacy: the bench's list and actions for dispensing, so it stands in for the bench (§5.1 rule 4)
select core.declare_screen('pharmacy.dispensing', 'pharmacy', 'bench', '{"en":"Dispensing"}', 'read:pharmacy.queue', array['base.bench']);
-- its stock, shown only where the pharmacy keeps stock (pharmacy.keep_stock)
select core.declare_screen('pharmacy.stock', 'pharmacy', 'bench', '{"en":"Stock"}', 'read:pharmacy.queue');
select core.declare_role('00000000-0000-0000-0000-00000000ca01', 'pharmacy.pharmacist', 'pharmacy', 'Pharmacist', array[
  'read:patients', 'read:bench', 'read:pharmacy.queue', 'read:queue', 'write:pharmacy.dispense', 'write:note', 'write:crossed_out', 'write:question',
  'write:pharmacy.stock'], '{"en":"Pharmacist"}');
-- a plain role (§5.2): the store keeper sees what is to prepare and what waits, so the shelves keep up, and receives and counts the stock
select core.declare_role('00000000-0000-0000-0000-00000000ca02', 'pharmacy.store_keeper', 'pharmacy', 'Store keeper', array[
  'read:patients', 'read:bench', 'read:pharmacy.queue', 'write:pharmacy.stock'], '{"en":"Store keeper"}');
-- its settings (§5.1 rule 7), each drawn by the automatic form: how long a prepared dispense waits before Dispensing marks it late, per
-- pharmacy (on the department's card); the counselling note shown when giving, for the clinic (on the pack's page)
select core.declare_setting('pharmacy.late_after', 'pharmacy', 'department',
  '{"type":"object","additionalProperties":false,"required":["minutes"],"properties":{"minutes":{"type":"integer","minimum":5,"maximum":1440,"default":30}}}',
  labels => '{"en":"Late to collect"}', form => 'department',
  fields => '[{"key":"minutes","labels":{"en":"Prepared reads late after"},"unit":"min",
    "help":{"en":"A dispense prepared this long ago and not yet given is marked late on Dispensing."}}]');
select core.declare_setting('pharmacy.prepare_first', 'pharmacy', 'department',
  '{"type":"object","additionalProperties":false,"required":["prepare"],"properties":{"prepare":{"type":"boolean","default":false}}}',
  labels => '{"en":"Prepare first"}', form => 'department',
  fields => '[{"key":"prepare","labels":{"en":"Prepare first"},
    "help":{"en":"To give → Prepared → Given, when one person prepares and another hands over (and for wards). Off: give straight away."}}]');
select core.declare_setting('pharmacy.keep_stock', 'pharmacy', 'department',
  '{"type":"object","additionalProperties":false,"required":["keep"],"properties":{"keep":{"type":"boolean","default":false}}}',
  labels => '{"en":"Keep stock"}', form => 'department',
  fields => '[{"key":"keep","labels":{"en":"Keep stock"},
    "help":{"en":"Products, deliveries, counts and the Stock screen. Each Give takes from the stock, first to expire first."}}]');
-- a product (one per brand, strength and pack): the clinic's one list, so a box sent from the store is the same product where it
-- arrives; written by whoever receives and counts stock somewhere. Each place keeps its own minimums (in boxes), one table a place.
-- Its prices are the pharmacy's own (spec §5.4, owner 2026-10-08): per box, and per strip where it is sold in strips (the strip's size
-- in units); plain numbers, shown only where a pack the department uses charges, and never in an entry
select core.declare_setting('pharmacy.product', 'pharmacy', 'organization',
  '{"type":"object","additionalProperties":false,"required":["brand","pack_size"],"properties":{"brand":{"type":"string","minLength":1},
    "generic":{"type":"string"},"atc":{"type":"string"},"strength":{"type":"string"},
    "form":{"enum":["tablet","capsule","syrup","suspension","injection","cream","drops","inhaler","sachet","other"]},
    "pack_size":{"type":"integer","minimum":1},"unit":{"type":"string"},"eda_code":{"type":"string"},"barcode":{"type":"string"},
    "price_box":{"type":"number","minimum":0,"maximum":10000000},"strip_size":{"type":"integer","minimum":1},
    "price_strip":{"type":"number","minimum":0,"maximum":10000000}}}',
  'pharmacy.product_check(jsonb,jsonb)', many => true, labels => '{"en":"Product"}', action => 'write:pharmacy.stock');
select core.declare_setting('pharmacy.minimums', 'pharmacy', 'department',
  '{"type":"object","additionalProperties":false,"required":["minimums"],"properties":{"minimums":{"type":"object","default":{},
    "additionalProperties":{"type":"integer","minimum":0}}}}',
  labels => '{"en":"Stock minimums"}', action => 'write:pharmacy.stock');
select core.declare_setting('pharmacy.counselling', 'pharmacy', 'organization',
  '{"type":"object","additionalProperties":false,"required":["show"],"properties":{"show":{"type":"boolean","default":false},"note":{"type":"string","maxLength":400}}}',
  'pharmacy.counselling_check(jsonb,jsonb)', labels => '{"en":"Counselling when giving"}', form => 'pack',
  fields => '[{"key":"show","labels":{"en":"Show a counselling note"},"help":{"en":"Shown to whoever gives, above Give."}},
    {"key":"note","labels":{"en":"Note"},"help":{"en":"What to tell the patient: how to take it, what to watch for."}}]');
-- its starter setup (§5.2): a pharmacy ticks the pack, opens on Dispensing, sends its prescriptions through one step (prepared) and
-- marks a prepared dispense late after half an hour; the counselling note is the clinic's, on the pack's page
select core.declare_setup('pharmacy.pharmacy', 'pharmacy', 'bench', '{"en":"Pharmacy"}', packs => array['pharmacy'],
  screens => '{"screens":["pharmacy.dispensing","pharmacy.stock"],"opens":"pharmacy.dispensing"}',
  settings => '{"pharmacy.late_after":{"minutes":30},"department.works_for":{"all":true}}',
  services => '[{"code":"dispense","name":"Dispensing","answer":"pharmacy.dispense","steps":["prepared"]}]',
  help => '{"en":"Dispenses what the clinics prescribe: prepared, then given."}');
-- the main store (owner, 2026-10-07): stock only — receives from suppliers and sends on to the pharmacies in one step; no dispensing
select core.declare_setup('pharmacy.store', 'pharmacy', 'bench', '{"en":"Main store"}', packs => array['pharmacy'],
  screens => '{"screens":["pharmacy.stock"],"opens":"pharmacy.stock"}', settings => '{"pharmacy.keep_stock":{"keep":true}}',
  help => '{"en":"Stock only: receives from suppliers and sends on to the pharmacies. No dispensing."}');
