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
  execute format('grant usage on schema core to %I', r);
  execute format('grant usage on schema %I to core_eraser', p_key);
  execute format('alter default privileges for role %I revoke execute on functions from public', r);   -- global: a per-schema default cannot take it away
  execute format('grant execute on function core.pack_entries(uuid, uuid[]), core.may(uuid, text, uuid), core.setting_at(uuid, text, uuid, timestamptz),
    core.settings_at(uuid, text, timestamptz), core.survivor(uuid, uuid), core.family(uuid, uuid), core.uuid5(uuid, text), core.kinds(text), core.base_of(text),
    core.refuse(text, text), core.hint(text), core.layer_on(uuid, text) to %I', r);
end $$;
-- the entries of these items (every version), the entries that refer to them and the entries they refer to: a pack's only way to
-- read the record
create function core.pack_entries(p_org uuid, p_items uuid[]) returns setof core.entries language sql stable security definer set search_path = '' as $$
  select e.* from core.entries e where e.organization_id = p_org and (e.item = any (p_items)
    or e.refers_to in (select x.id from core.entries x where x.organization_id = p_org and x.item = any (p_items))
    or e.id in (select x.refers_to from core.entries x where x.organization_id = p_org and x.item = any (p_items) and x.refers_to is not null))
$$;
revoke all on function core.pack_entries(uuid, uuid[]), core.create_pack(text) from public, anon, authenticated;

-- drain the outbox inside a transaction (tests, and the procedure's batches)
create function core.drain(p_limit int default 500) returns int language plpgsql volatile security definer set search_path = '' as $$
declare o core.outbox; v_err text; n int := 0;
begin
  for o in select * from core.outbox where tries < 5 order by id limit p_limit for update skip locked loop
    begin
      execute format('select %s($1, $2)', o.refresh::regproc) using o.organization_id, o.items;
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
select core.declare_screen('pharmacy.dispensing', 'pharmacy', 'bench', '{"en":"Dispensing"}');
select core.declare_role('00000000-0000-0000-0000-00000000ca01', 'pharmacist', 'pharmacy', 'Pharmacist', array[
  'read:patients', 'read:bench', 'read:pharmacy.queue', 'read:queue', 'write:pharmacy.dispense', 'write:note', 'write:crossed_out'], '{"en":"Pharmacist"}');
