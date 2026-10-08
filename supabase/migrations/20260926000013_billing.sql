-- 13 · the billing pack (spec/openCare.md §5.4). Money never reaches the record: the chart keeps what was ordered and given; billing
-- keeps its own tables and reaches them only through its operations (public.pack_op), each gated by its action in a department that
-- uses the pack and, to take money, by the department's Takes payment here (its own charges, or everyone's: the main cashier).
--   · charges (derived, from entries and settings only, §3.8): a department's visit fee at check-in there (owner, 2026-10-08), and each
--     ordered service that has a price, charged to the department that performs it, as both stood when checked in or ordered; void when
--     the check-in is undone or crossed out, or the order revoked, crossed out or closed undone. A charge row carries no amount (the
--     record read sends every derived row of the family): its price is read as of its moment (priced_at), from billing's settings, by
--     billing's operations only. It sends no record entries (F08).
--   · its own original data, only ever added to (a mistake is a new row with its reason; Erase the one exception, core.declare_store):
--     the lines a department sends to the cashier (an open bill), payments and their lines (cash with received and change, or card; a
--     refund is a payment of its own naming the one it undoes), the reasons for going ahead before payment, each drawer closed, and each
--     receipt printed (§3.13 Printing, owner 2026-10-08: a later copy is marked "Reprint" with its time, even after a reload).
--   · what is paid, owed and waived is worked out when read, from those tables (D12); billing locks per charge, in one sorted order (D13).
-- Billing never names another pack: what another department prices itself reaches it only as the lines that department's rows hand it.

set client_min_messages = warning;

-- it charges for work (core change (d)): a department using it may show the prices a department keeps for its own work
select core.declare_pack('billing', 1, '{}', '{"en":"Billing","ar":"الحسابات"}', role_block => 'ce', charges => true);
select core.create_pack('billing');

set role pack_billing;

-- ── what is charged (derived) ──
create table billing.charges (
  organization_id uuid not null,
  item          uuid not null,             -- the order item (a service), or the visit item (a visit fee)
  department_id uuid not null,             -- the department that charges: performs the service, or where the patient was checked in
  patient_id    uuid not null,
  visit_id      uuid,
  kind          text not null check (kind in ('service', 'visit')),
  service_id    uuid,
  name          text,                      -- the service as the order named it; a visit fee has none (the department's name is its word)
  from_department_id uuid,                 -- the department that ordered it
  at            timestamptz not null,      -- ordered, or checked in (clinical time)
  priced_at     timestamptz not null,      -- the moment its price is read as of: when the order or the check-in was written
  open          boolean not null,          -- false: void
  source_entries uuid[] not null,
  primary key (organization_id, item, department_id)
);
create index charges_patient on billing.charges (organization_id, patient_id);
create index charges_department on billing.charges (organization_id, department_id);

-- ── its own original data, only ever added to ──
-- the lines a department sends to the main cashier (Send to cashier, §5.4 "A department's own priced lines"), trusted as handed
create table billing.sent (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),   -- one line
  bill_id       uuid not null,             -- the lines sent together
  patient_id    uuid not null,
  visit_id      uuid,
  department_id uuid not null,             -- the department that sent them (the clinic's name for it is the line's word)
  order_item    uuid,                      -- the order the line belongs to, where it has one: a resend for it replaces what was not paid
  name          text not null,
  quantity      numeric(12,2) not null,
  amount        numeric(12,2) not null,    -- for the quantity
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index sent_patient on billing.sent (organization_id, patient_id);
create index sent_order on billing.sent (organization_id, order_item) where order_item is not null;
-- a payment taken at a desk, or given back (a refund names the payment it undoes); its number is the clinic's next receipt
create table billing.payments (
  organization_id uuid not null,
  id            uuid not null,
  receipt       text not null,             -- R-00412
  department_id uuid not null,             -- the desk that took it (or gave it back)
  patient_id    uuid,                      -- emptied by an Erase: the amounts and the number stay (D18)
  method        text not null check (method in ('cash', 'card')),
  total         numeric(12,2) not null,    -- what was taken (a refund: what was given back, below nothing)
  discount      numeric(12,2) not null default 0,
  discount_reason text,
  received      numeric(12,2),             -- the cash handed over
  change        numeric(12,2),
  refund_of     uuid,
  reason        text,                      -- why it was given back
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  day           date not null,             -- the clinic's day it was taken (its time zone)
  primary key (organization_id, id),
  unique (organization_id, receipt)
);
create unique index payments_refunded on billing.payments (organization_id, refund_of) where refund_of is not null;   -- given back once
create index payments_day on billing.payments (organization_id, day, department_id);
create index payments_patient on billing.payments (organization_id, patient_id);
create table billing.payment_lines (
  organization_id uuid not null,
  payment_id    uuid not null,
  n             int not null,
  kind          text not null check (kind in ('charge', 'sent', 'handed')),
  charge_item   uuid,                      -- a charge: its item and department
  charge_department uuid,
  sent_id       uuid,                      -- a line sent to the cashier
  order_item    uuid,                      -- the order it belongs to (a service's, or a line's as handed)
  department_id uuid not null,             -- whose work it is: the charging, sending or handing department
  name          text,                      -- as it read when paid; a visit fee has none
  quantity      numeric(12,2),
  amount        numeric(12,2) not null,    -- its price (a refund's line: below nothing)
  typed         boolean not null default false,   -- an open price the cashier typed, with who and when (the payment's)
  primary key (organization_id, payment_id, n)
);
create index lines_charge on billing.payment_lines (organization_id, charge_item) where charge_item is not null;
create index lines_sent on billing.payment_lines (organization_id, sent_id) where sent_id is not null;
create index lines_order on billing.payment_lines (organization_id, order_item) where order_item is not null;
-- going ahead before payment (…anyway, the soft check): the order, the reason, who and when
create table billing.anyway (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),
  patient_id    uuid not null,
  order_item    uuid not null,
  department_id uuid not null,             -- the department that did the work
  reason        text not null,
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index anyway_patient on billing.anyway (organization_id, patient_id);
-- a drawer closed by its cashier at a desk: the float and the cash taken since the last closing, counted against what is there
create table billing.drawers (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),
  department_id uuid not null,
  user_id       uuid not null,
  since         timestamptz,               -- the closing before (none: the first)
  at            timestamptz not null default clock_timestamp(),
  day           date not null,
  float         numeric(12,2) not null,
  cash          numeric(12,2) not null,
  expected      numeric(12,2) not null,
  counted       numeric(12,2) not null,
  reason        text,                      -- a difference needs one
  primary key (organization_id, id)
);
-- each copy of a receipt or a refund slip printed (owner, 2026-10-08): which, at which desk, by whom, when; the first is the original,
-- every later one a reprint. It holds no patient (the payment does), so Erase leaves it as the payment's number and amount stay
create table billing.prints (
  organization_id uuid not null,
  id            uuid not null default gen_random_uuid(),
  payment_id    uuid not null,
  department_id uuid not null,             -- the desk it was printed at
  author_id     uuid not null,
  at            timestamptz not null default clock_timestamp(),
  primary key (organization_id, id)
);
create index prints_payment on billing.prints (organization_id, payment_id, at);
-- the clinic's last receipt number
create table billing.receipts (
  organization_id uuid primary key,
  last          int not null
);

-- only ever added to: a change is a new row with its reason; the eraser alone empties a patient's link (core.declare_store)
create function billing.insert_only() returns trigger language plpgsql as $$
begin
  if current_user = 'core_eraser' then return case when tg_op = 'DELETE' then old else new end; end if;
  raise exception '% are only ever added to', tg_table_name using errcode = 'P0001';
end $$;
create trigger sent_kept before update or delete on billing.sent for each row execute function billing.insert_only();
create trigger payments_kept before update or delete on billing.payments for each row execute function billing.insert_only();
create trigger lines_kept before update or delete on billing.payment_lines for each row execute function billing.insert_only();
create trigger anyway_kept before update or delete on billing.anyway for each row execute function billing.insert_only();
create trigger drawers_kept before update or delete on billing.drawers for each row execute function billing.insert_only();
create trigger prints_kept before update or delete on billing.prints for each row execute function billing.insert_only();
create trigger sent_whole before truncate on billing.sent for each statement execute function billing.insert_only();
create trigger payments_whole before truncate on billing.payments for each statement execute function billing.insert_only();
create trigger lines_whole before truncate on billing.payment_lines for each statement execute function billing.insert_only();
create trigger anyway_whole before truncate on billing.anyway for each statement execute function billing.insert_only();
create trigger drawers_whole before truncate on billing.drawers for each statement execute function billing.insert_only();
create trigger prints_whole before truncate on billing.prints for each statement execute function billing.insert_only();

-- ── helpers ──
-- the clinic's day (its time zone; Africa/Cairo unless it says)
create function billing.tz(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo')
$$;
create function billing.today(p_org uuid) returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone billing.tz(p_org))::date
$$;
-- an amount as money is kept: at most two decimals, never below nothing, no more than 99,999,999.99; null when it is not one
create function billing.amount(p text) returns numeric language sql immutable security definer set search_path = '' as $$
  select case when trim(p) ~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then trim(p)::numeric(12,2) end
$$;
-- did this department use billing then (§5.1 rule 1, as it stood: a later untick neither drops a charge nor charges the past)
create function billing.used(p_org uuid, p_department uuid, p_at timestamptz) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'organization.packs_used', p_org, p_at) -> 'packs', '[]') @> '["billing"]'
     and coalesce(core.setting_at(p_org, 'department.packs', p_department, p_at) -> 'packs', '[]') @> '["billing"]'
$$;
-- a charge's price as it stood at its moment: {"amount": "80.00"}, {"at_order": true}, or null (free)
create function billing.price(p_org uuid, p_kind text, p_service uuid, p_department uuid, p_at timestamptz) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_kind = 'visit' then
      (select jsonb_build_object('amount', (s.data ->> 'amount')::numeric(12,2)) from core.settings_at(p_org, 'billing.visit_fee', p_at) s
        where s.owner_id = p_department order by s.recorded_at desc limit 1)
    else
      (select case when coalesce((s.data ->> 'at_order')::boolean, false) then '{"at_order": true}'::jsonb
                   else jsonb_build_object('amount', (s.data ->> 'price')::numeric(12,2)) end
         from core.settings_at(p_org, 'billing.price', p_at) s where s.data ->> 'service_id' = p_service::text order by s.recorded_at desc limit 1) end
$$;
-- Takes payment here (§5.4): own (its own charges), everyone (the main cashier), none
create function billing.desk(p_org uuid, p_department uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'billing.desk', p_department) ->> 'takes', 'none')
$$;
-- Pay first in a department as it stands now (the soft check: its words go the moment it is switched off)
create function billing.pay_first(p_org uuid, p_department uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((core.setting_at(p_org, 'billing.pay_first', p_department) ->> 'on')::boolean, false) and core.department_uses(p_org, p_department, 'billing')
$$;
-- a payment that stands: taken, and not given back
create function billing.stands(p_org uuid, p_payment uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from billing.payments p where p.organization_id = p_org and p.id = p_payment and p.refund_of is null
    and not exists (select 1 from billing.payments r where r.organization_id = p_org and r.refund_of = p.id))
$$;
-- the payment that stands for a charge, or a sent line (none: unpaid)
create function billing.paid_charge(p_org uuid, p_item uuid, p_department uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select l.payment_id from billing.payment_lines l where l.organization_id = p_org and l.charge_item = p_item and l.charge_department = p_department
     and billing.stands(p_org, l.payment_id) limit 1
$$;
create function billing.paid_sent(p_org uuid, p_line uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select l.payment_id from billing.payment_lines l where l.organization_id = p_org and l.sent_id = p_line and billing.stands(p_org, l.payment_id) limit 1
$$;
-- the moment an order was closed undone or crossed out, read from its entries as the base reads an order's status: crossed out or revoked
-- (its latest version), or its latest step rejected, cancelled or failed; none while it stands (chosen in the build, awaiting the owner,
-- as for a charge)
create function billing.stopped(p_org uuid, p_order uuid) returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare ol record; st record;
begin
  if p_order is null then return null; end if;
  select x.* into ol from core.pack_entries(p_org, array[p_order]) x where x.item = p_order order by x.item_version desc limit 1;
  if ol.id is null then return null; end if;
  if ol.type = 'crossed_out' or ol.data ->> 'status' = 'revoked' then return ol.recorded_at; end if;
  select l.* into st from core.pack_entries(p_org, array[p_order]) a,
         lateral (select y.* from core.pack_entries(p_org, array[a.item]) y where y.item = a.item order by y.item_version desc limit 1) l
   where a.relation = 'answers' and a.item_version = 1 and a.type = any (core.kinds('step')) and l.type <> 'crossed_out'
     and a.refers_to in (select z.id from core.pack_entries(p_org, array[p_order]) z where z.item = p_order)
   order by l.recorded_at desc limit 1;
  return case when st.data ->> 'status' in ('rejected', 'cancelled', 'failed') then st.recorded_at end;
end $$;
-- a line sent before its order was closed undone or crossed out is void: nothing more is owed for it (one paid is given back from its
-- receipt); a line its department sends after that, for what was given before the stop, stands (chosen in the build, awaiting the owner)
create function billing.sent_void(p_org uuid, p_order uuid, p_at timestamptz) returns boolean language sql stable security definer set search_path = '' as $$
  select p_order is not null and coalesce(billing.stopped(p_org, p_order) >= p_at, false)
$$;
-- a sent line still owed: unpaid, not void, and no later bill from its department for its order (a resend replaces what was not paid)
create function billing.sent_owed(p_org uuid, p_line uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select billing.paid_sent(p_org, s.id) is null and not exists (select 1 from billing.sent x where x.organization_id = p_org and s.order_item is not null
      and x.order_item = s.order_item and x.department_id = s.department_id and x.bill_id <> s.bill_id and (x.at, x.bill_id) > (s.at, s.bill_id))
      and not billing.sent_void(p_org, s.order_item, s.at)
    from billing.sent s where s.organization_id = p_org and s.id = p_line and s.patient_id is not null
$$;
-- what billing already holds of a department's own lines for one order: paid (lines handed or sent, on a payment that stands) and, asked,
-- still owed on its open bill. A row hands what its order comes to so far; only the rest beyond this is handed again (the rest of a
-- medicine given in part, a line left unticked), never the whole order twice (chosen in the build, awaiting the owner)
create function billing.accounted(p_org uuid, p_order uuid, p_department uuid, p_sent boolean) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(l.amount) from billing.payment_lines l where l.organization_id = p_org and l.order_item = p_order and l.department_id = p_department
                     and l.kind in ('handed', 'sent') and billing.stands(p_org, l.payment_id)), 0)
       + case when p_sent then coalesce((select sum(s.amount) from billing.sent s where s.organization_id = p_org and s.order_item = p_order and s.department_id = p_department
                     and billing.sent_owed(p_org, s.id)), 0) else 0 end
$$;
-- an order the charges have not heard yet (billing listens after commit; a parked listener never): priced, or At the order, as the
-- price stood when it was written, where the department performing it used billing then — what the charge will be (§5.4 Pay first)
create function billing.priced_order(p_org uuid, p_order uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select billing.used(p_org, d.dep, o1.recorded_at) and billing.price(p_org, 'service', d.svc, d.dep, o1.recorded_at) is not null
    from (select x.* from core.pack_entries(p_org, array[p_order]) x where x.item = p_order and x.item_version = 1) o1,
         lateral (select (lv.data -> 'service' ->> 'id')::uuid svc, coalesce(lv.data ->> 'department_id', o1.data ->> 'department_id')::uuid dep
                    from core.pack_entries(p_org, array[p_order]) lv where lv.item = p_order and lv.type = any (core.kinds('order')) order by lv.item_version desc limit 1) d
   where d.svc is not null and d.dep is not null), false)
$$;
-- one lock a thing, always in the same order: the charges and lines a payment names (two desks taking one line: the second finds it paid)
create function billing.lock(p_keys text[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k text;
begin
  for k in select distinct x from unnest(p_keys) x order by 1 loop perform pg_advisory_xact_lock(hashtextextended('billing ' || k, 0)); end loop;
end $$;
-- the clinic's next receipt number (R-00001 on)
create function billing.next_receipt(p_org uuid) returns text language sql volatile security definer set search_path = '' as $$
  with n as (insert into billing.receipts as r (organization_id, last) values (p_org, 1) on conflict (organization_id) do update set last = r.last + 1 returning r.last)
  select 'R-' || lpad(n.last::text, greatest(5, length(n.last::text)), '0') from n
$$;
-- a cashier's drawer at a desk now: the float (the desk's), the cash taken since the last closing (given back included), what is expected
create function billing.drawer_of(p_org uuid, p_department uuid, p_user uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  with lc as (select max(d.at) at from billing.drawers d where d.organization_id = p_org and d.department_id = p_department and d.user_id = p_user),
  tk as (select coalesce(sum(p.total), 0) n, count(*) filter (where p.refund_of is null) receipts from billing.payments p, lc
          where p.organization_id = p_org and p.department_id = p_department and p.author_id = p_user and p.method = 'cash' and (lc.at is null or p.at > lc.at)),
  fl as (select coalesce(billing.amount(core.setting_at(p_org, 'billing.desk', p_department) ->> 'float'), 0) n)
  select jsonb_build_object('since', lc.at, 'float', fl.n, 'cash', tk.n, 'receipts', tk.receipts, 'expected', fl.n + tk.n) from lc, tk, fl
$$;

-- ── the charges' refresh: from entries and settings only (as they stood), never billing's own tables ──
create function billing.charges_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare es core.entries[]; v_orders uuid[]; v_visits uuid[]; k uuid; o1 core.entries; ol core.entries; lv core.entries; f core.entries; e core.entries;
        v_svc uuid; v_dept uuid; v_status text; v_came jsonb; v_gone boolean; d record; v_src uuid[];
begin
  select coalesce(array_agg(x), '{}') into es from core.pack_entries(p_org, p_items) x;
  -- the orders these items are, or answer (a step, a result, a dispense)
  select coalesce(array_agg(distinct q.x), '{}') into v_orders from (
    select a.item x from unnest(es) a where a.item = any (p_items) and a.item_version = 1 and a.type = any (core.kinds('order'))
    union select t.item from unnest(es) a join unnest(es) t on t.id = a.refers_to
     where a.item = any (p_items) and a.relation = 'answers' and t.type = any (core.kinds('order'))) q;
  -- the visits these items are, or were written in
  select coalesce(array_agg(distinct q.x), '{}') into v_visits from (
    select a.item x from unnest(es) a where a.item = any (p_items) and a.item_version = 1 and a.type = any (core.kinds('checked_in'))
    union select a.visit_id from unnest(es) a where a.item = any (p_items) and a.visit_id is not null) q where q.x is not null;
  delete from billing.charges c where c.organization_id = p_org and c.item = any (v_orders || v_visits);

  -- a service: priced (or At the order) as it stood when ordered, where the performing department used billing then
  foreach k in array v_orders loop
    o1 := null; ol := null; lv := null;
    select x.* into o1 from core.pack_entries(p_org, array[k]) x where x.item = k and x.item_version = 1;
    select x.* into ol from core.pack_entries(p_org, array[k]) x where x.item = k order by x.item_version desc limit 1;
    select x.* into lv from core.pack_entries(p_org, array[k]) x where x.item = k and x.type = any (core.kinds('order')) order by x.item_version desc limit 1;
    continue when o1.id is null or lv.id is null;
    v_svc := (lv.data -> 'service' ->> 'id')::uuid; v_dept := coalesce(lv.data ->> 'department_id', o1.data ->> 'department_id')::uuid;
    continue when v_svc is null or v_dept is null or not billing.used(p_org, v_dept, o1.recorded_at)
      or billing.price(p_org, 'service', v_svc, v_dept, o1.recorded_at) is null;
    -- void: revoked, crossed out, or closed undone where it was sent (rejected, cancelled, failed; chosen in the build, awaiting the owner)
    v_status := (select r ->> 'status' from core.pack_rows(p_org, 'base.orders', jsonb_build_object('where', jsonb_build_object('item', k))) r limit 1);
    select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') into v_src from core.pack_entries(p_org, array[k]) x where x.item = k;
    insert into billing.charges values (p_org, k, v_dept, core.survivor(p_org, o1.patient_id), o1.visit_id, 'service', v_svc, lv.data -> 'service' ->> 'name',
      o1.department_id, o1.occurred_at, o1.recorded_at,
      ol.type <> 'crossed_out' and coalesce(lv.data ->> 'status', 'active') <> 'revoked' and coalesce(v_status, 'active') not in ('revoked', 'rejected', 'cancelled', 'failed'),
      v_src);
  end loop;

  -- a visit fee: at check-in, in the department checked in to, as the fee stood then, where that department used billing then (owner,
  -- 2026-10-08: at check-in, not once seen); where Send to… brings the visit to another department, at its arrival there, the same way
  -- (chosen in the build, awaiting the owner); one a department a visit; void when the check-in is undone (the desk's Undo crosses the
  -- visit out) or the visit is crossed out (owner, 2026-10-08)
  foreach k in array v_visits loop
    f := null;
    select x.* into f from core.pack_entries(p_org, array[k]) x where x.item = k and x.item_version = 1;
    continue when f.id is null or not (f.type = any (core.kinds('checked_in')));
    v_gone := (select x.type = 'crossed_out' from core.pack_entries(p_org, array[k]) x where x.item = k order by x.item_version desc limit 1);
    v_came := jsonb_build_object(coalesce(f.data ->> 'department_id', f.department_id::text), jsonb_build_object('at', f.occurred_at, 'rec', f.recorded_at));
    for e in select x.* from core.pack_entries(p_org, array[k]) x where x.item = k and core.base_of(x.type) = 'transferred' order by x.recorded_at, x.item_version, x.id loop
      if e.data ->> 'to_department_id' is not null and not v_came ? (e.data ->> 'to_department_id') then
        v_came := v_came || jsonb_build_object(e.data ->> 'to_department_id', jsonb_build_object('at', e.occurred_at, 'rec', e.recorded_at));
      end if;
    end loop;
    select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') into v_src from core.pack_entries(p_org, array[k]) x where x.item = k;
    for d in select y.key::uuid dep, (y.value ->> 'at')::timestamptz at, (y.value ->> 'rec')::timestamptz rec from jsonb_each(v_came) y loop
      continue when not billing.used(p_org, d.dep, d.rec) or billing.price(p_org, 'visit', null, d.dep, d.rec) is null;
      insert into billing.charges values (p_org, k, d.dep, core.survivor(p_org, f.patient_id), k, 'visit', null, null, null, d.at, d.rec, not coalesce(v_gone, false), v_src);
    end loop;
  end loop;
end $$;

-- ── settings' checks (§5.1 rule 7) ──
-- a service's price: one of the department's services, a price or At the order (never both), no more than 10,000,000, once a service
create function billing.price_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p_where ->> 'organization_id')::uuid;
begin
  if not exists (select 1 from core.settings_at(v_org, 'service') s where s.thing_id::text = p_data ->> 'service_id' and s.owner_id = (p_where ->> 'owner_id')::uuid) then
    return jsonb_build_array(jsonb_build_object('code', 'not_its_service', 'level', 'refuse', 'field', 'service_id'));
  end if;
  if (p_data ? 'price') = coalesce((p_data ->> 'at_order')::boolean, false) then
    return jsonb_build_array(jsonb_build_object('code', 'price_or_order', 'level', 'refuse', 'field', 'price'));
  end if;
  if (p_data ->> 'price')::numeric > 10000000 then return jsonb_build_array(jsonb_build_object('code', 'too_much', 'level', 'refuse', 'field', 'price')); end if;
  if exists (select 1 from core.settings_at(v_org, 'billing.price') s where s.thing_id <> (p_where ->> 'thing_id')::uuid and s.data ->> 'service_id' = p_data ->> 'service_id') then
    return jsonb_build_array(jsonb_build_object('code', 'already_priced', 'level', 'refuse', 'field', 'service_id'));
  end if;
  return '[]';
end $$;
-- a department's visit fee: no more than 10,000,000, one a department
create function billing.fee_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (p_data ->> 'amount')::numeric > 10000000 then return jsonb_build_array(jsonb_build_object('code', 'too_much', 'level', 'refuse', 'field', 'amount')); end if;
  if exists (select 1 from core.settings_at((p_where ->> 'organization_id')::uuid, 'billing.visit_fee') s where s.thing_id <> (p_where ->> 'thing_id')::uuid
               and s.owner_id = (p_where ->> 'owner_id')::uuid) then
    return jsonb_build_array(jsonb_build_object('code', 'already_priced', 'level', 'refuse', 'field', 'amount'));
  end if;
  return '[]';
end $$;

-- ── its operations: the reads (who owes, a patient's lines, receipts, the day) ──
-- a patient's payable lines at this desk: open unpaid charges (a price, or none yet for one priced At the order), the lines sent to the
-- cashier still owed, void charges and void sent lines that still have money on them (to give back), the departments waiting for
-- payment (Pay first: an order of theirs not paid, and nobody went ahead with it anyway) and whether work was done before payment. A
-- desk that does not take payment has none
create function billing.lines(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pt uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid); v_desk text := billing.desk(p_org, p_department); v_fam uuid[]; ch jsonb; sl jsonb; bk jsonb;
begin
  if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
  v_fam := core.family(p_org, v_pt);
  select coalesce(jsonb_agg(jsonb_build_object('item', c.item, 'department_id', c.department_id, 'kind', c.kind, 'name', c.name, 'service_id', c.service_id,
      'from_department_id', c.from_department_id, 'visit_id', c.visit_id, 'at', c.at) || coalesce(billing.price(p_org, c.kind, c.service_id, c.department_id, c.priced_at), '{}')
      order by c.kind <> 'visit', c.at, c.name, c.item), '[]') into ch
    from billing.charges c where c.organization_id = p_org and c.patient_id = any (v_fam) and c.open and v_desk <> 'none'
     and (v_desk = 'everyone' or c.department_id = p_department) and billing.paid_charge(p_org, c.item, c.department_id) is null;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'bill_id', s.bill_id, 'department_id', s.department_id, 'order_item', s.order_item, 'name', s.name,
      'quantity', s.quantity, 'amount', s.amount, 'at', s.at) order by s.at, s.id), '[]') into sl
    from billing.sent s where s.organization_id = p_org and s.patient_id = any (v_fam) and v_desk <> 'none' and (v_desk = 'everyone' or s.department_id = p_department)
     and billing.sent_owed(p_org, s.id);
  select coalesce(jsonb_agg(b.x order by b.at), '[]') into bk from (
    select jsonb_build_object('item', c.item, 'department_id', c.department_id, 'kind', c.kind, 'name', c.name, 'payment_id', p.id, 'receipt', p.receipt) x, c.at
      from billing.charges c join billing.payment_lines l on l.organization_id = c.organization_id and l.charge_item = c.item and l.charge_department = c.department_id
        join billing.payments p on p.organization_id = l.organization_id and p.id = l.payment_id
     where c.organization_id = p_org and c.patient_id = any (v_fam) and not c.open and v_desk <> 'none' and (v_desk = 'everyone' or p.department_id = p_department)
       and billing.stands(p_org, p.id)
    union all
    select jsonb_build_object('item', s.order_item, 'department_id', s.department_id, 'kind', 'sent', 'name', s.name, 'payment_id', p.id, 'receipt', p.receipt), s.at
      from billing.sent s join billing.payment_lines l on l.organization_id = s.organization_id and l.sent_id = s.id
        join billing.payments p on p.organization_id = l.organization_id and p.id = l.payment_id
     where s.organization_id = p_org and s.patient_id = any (v_fam) and v_desk <> 'none' and (v_desk = 'everyone' or p.department_id = p_department)
       and billing.stands(p_org, p.id) and billing.sent_void(p_org, s.order_item, s.at)) b;
  return jsonb_build_object('desk', v_desk, 'patient_id', v_pt, 'patient_ids', jsonb_build_array(v_pt), 'charges', ch, 'sent', sl, 'back', bk,
    'waiting', (select coalesce(jsonb_agg(distinct x), '[]') from (select (y ->> 'department_id')::uuid x, coalesce(y ->> 'order_item', case when y ->> 'kind' = 'service' then y ->> 'item' end)::uuid o
        from jsonb_array_elements(ch || sl) y) q
      where q.o is not null and billing.pay_first(p_org, q.x) and not exists (select 1 from billing.anyway a where a.organization_id = p_org and a.order_item = q.o)),
    'before_payment', exists (select 1 from billing.anyway a where a.organization_id = p_org and a.patient_id = any (v_fam)
      and a.order_item in (select (y ->> 'item')::uuid from jsonb_array_elements(ch) y union select (y ->> 'order_item')::uuid from jsonb_array_elements(sl) y)));
end $$;

-- who owes, one row a patient, grouped and paged here so nobody drops out (newest first, then by patient, in the order the cursor reads;
-- after: the last row's {at, patient_id}; the search's patients when given): what for (visits, the services by name, each sending
-- department), the sum of what is priced, how many lines wait for a price, the departments waiting (Pay first), work done before payment,
-- and how many paid lines there are to give back (a void charge or sent line still holding money: the patient is listed for it, so the
-- cashier is told). With the counts of the desk's three views: to pay, paid today, nothing to pay (seen today in a department of this
-- desk that uses billing, owing nothing)
create function billing.owed(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_desk text := billing.desk(p_org, p_department); v_lim int := greatest(1, least(coalesce((p_args ->> 'limit')::int, 40), 200));
        v_pts uuid[] := (select array_agg(distinct core.survivor(p_org, x::uuid)) from jsonb_array_elements_text(p_args -> 'patients') x);
        v_after_at timestamptz := (p_args -> 'after' ->> 'at')::timestamptz; v_after_pt uuid := (p_args -> 'after' ->> 'patient_id')::uuid;
        v_rows jsonb; v_count int; v_none jsonb; v_paid int; v_day date := billing.today(p_org);
begin
  create temp table if not exists billing_owed (pt uuid, department_id uuid, kind text, at timestamptz, amount numeric, unpriced boolean, order_item uuid, name text) on commit drop;
  delete from billing_owed where true;
  if v_desk <> 'none' then
    insert into billing_owed
    select core.survivor(p_org, c.patient_id), c.department_id, c.kind, c.at, (pr ->> 'amount')::numeric, pr ? 'at_order', case when c.kind = 'service' then c.item end, c.name
      from billing.charges c, lateral (select billing.price(p_org, c.kind, c.service_id, c.department_id, c.priced_at) pr) x
     where c.organization_id = p_org and c.open and (v_desk = 'everyone' or c.department_id = p_department) and billing.paid_charge(p_org, c.item, c.department_id) is null;
    insert into billing_owed
    select core.survivor(p_org, s.patient_id), s.department_id, 'sent', s.at, s.amount, false, s.order_item, s.name
      from billing.sent s where s.organization_id = p_org and s.patient_id is not null and (v_desk = 'everyone' or s.department_id = p_department) and billing.sent_owed(p_org, s.id);
    -- money to give back: a paid charge gone void, a paid line sent for an order since closed undone (taken at this desk, or any for everyone's)
    insert into billing_owed
    select core.survivor(p_org, c.patient_id), c.department_id, 'back', p.at, null::numeric, false, null::uuid, c.name
      from billing.charges c join billing.payment_lines l on l.organization_id = c.organization_id and l.charge_item = c.item and l.charge_department = c.department_id
        join billing.payments p on p.organization_id = l.organization_id and p.id = l.payment_id
     where c.organization_id = p_org and not c.open and (v_desk = 'everyone' or p.department_id = p_department) and billing.stands(p_org, p.id)
    union all
    select core.survivor(p_org, s.patient_id), s.department_id, 'back', p.at, null::numeric, false, null::uuid, s.name
      from billing.sent s join billing.payment_lines l on l.organization_id = s.organization_id and l.sent_id = s.id
        join billing.payments p on p.organization_id = l.organization_id and p.id = l.payment_id
     where s.organization_id = p_org and s.patient_id is not null and (v_desk = 'everyone' or p.department_id = p_department) and billing.stands(p_org, p.id)
       and billing.sent_void(p_org, s.order_item, s.at);
  end if;
  select count(distinct pt) into v_count from billing_owed;
  select coalesce(jsonb_agg(jsonb_build_object('patient_id', g.pt, 'last_at', g.last_at, 'total', g.total, 'unpriced', g.unpriced, 'lines', g.lines,
      'visits', g.visits, 'services', g.services, 'names', g.names, 'sent', g.sent, 'waiting', g.waiting, 'back', g.back,
      'before_payment', exists (select 1 from billing.anyway a where a.organization_id = p_org and a.patient_id = any (core.family(p_org, g.pt)) and a.order_item = any (g.orders)))
      order by g.last_at desc, g.pt desc), '[]') into v_rows
    from (select o.pt, max(o.at) last_at, coalesce(sum(o.amount), 0) total, count(*) filter (where o.unpriced) unpriced, count(*) filter (where o.kind <> 'back') lines,
            count(*) filter (where o.kind = 'back') back,
            count(*) filter (where o.kind = 'visit') visits, count(*) filter (where o.kind = 'service') services,
            coalesce(jsonb_agg(o.name order by o.at) filter (where o.kind = 'service'), '[]') names,
            coalesce(jsonb_agg(distinct o.department_id) filter (where o.kind = 'sent'), '[]') sent,
            coalesce(jsonb_agg(distinct o.department_id) filter (where o.order_item is not null and billing.pay_first(p_org, o.department_id)
              and not exists (select 1 from billing.anyway a where a.organization_id = p_org and a.order_item = o.order_item)), '[]') waiting,
            array_agg(o.order_item) filter (where o.order_item is not null) orders
          from billing_owed o where v_pts is null or o.pt = any (v_pts) group by o.pt
          having v_after_at is null or (max(o.at), o.pt) < (v_after_at, v_after_pt)
          order by max(o.at) desc, o.pt desc limit v_lim + 1) g;
  select count(*) into v_paid from billing.payments p where p.organization_id = p_org and p.day = v_day and p.department_id = p_department and p.refund_of is null;
  -- nothing to pay: here today (a visit today in a department of this desk's that uses billing, or a charge of today's), owing nothing at
  -- this desk
  select coalesce(jsonb_agg(distinct jsonb_build_object('patient_id', x.pt, 'department_id', x.dep)), '[]') into v_none from (
    select core.survivor(p_org, (r ->> 'patient_id')::uuid) pt, (r ->> 'department_id')::uuid dep
      from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('day', v_day, 'kind', 'visit'))) r
     where v_desk <> 'none' and (v_desk = 'everyone' or (r ->> 'department_id')::uuid = p_department) and core.department_uses(p_org, (r ->> 'department_id')::uuid, 'billing')
    union
    select core.survivor(p_org, c.patient_id), c.department_id from billing.charges c
     where c.organization_id = p_org and v_desk <> 'none' and (v_desk = 'everyone' or c.department_id = p_department) and (c.at at time zone billing.tz(p_org))::date = v_day) x
   where not exists (select 1 from billing_owed o where o.pt = x.pt) and (v_pts is null or x.pt = any (v_pts));
  return jsonb_build_object('desk', v_desk, 'rows', (select coalesce(jsonb_agg(y order by n), '[]') from jsonb_array_elements(v_rows) with ordinality z(y, n) where n <= v_lim),
    'more', jsonb_array_length(v_rows) > v_lim, 'count', v_count, 'paid', v_paid, 'none', v_none,
    'patient_ids', (select coalesce(jsonb_agg(y -> 'patient_id'), '[]') from jsonb_array_elements(v_rows) with ordinality z(y, n) where n <= v_lim)
      || (select coalesce(jsonb_agg(y -> 'patient_id'), '[]') from jsonb_array_elements(v_none) y));
end $$;

-- receipts: the day's at this desk, or found by number or patient (any day; a desk of everyone's finds every desk's); each with its
-- lines, who took it and whether it was given back
create function billing.paid(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_desk text := billing.desk(p_org, p_department); v_day date := coalesce((p_args ->> 'day')::date, billing.today(p_org)); v_rows jsonb;
        v_number text := upper(nullif(trim(p_args ->> 'receipt'), '')); v_id uuid := (p_args ->> 'payment_id')::uuid;
        v_pts uuid[] := (select array_agg(f) from jsonb_array_elements_text(p_args -> 'patients') x, unnest(core.family(p_org, x::uuid)) f);
begin
  select coalesce(jsonb_agg(jsonb_build_object('payment_id', p.id, 'receipt', p.receipt, 'department_id', p.department_id, 'patient_id', core.survivor(p_org, p.patient_id),
      'method', p.method, 'total', p.total, 'discount', p.discount, 'discount_reason', p.discount_reason, 'received', p.received, 'change', p.change, 'at', p.at,
      'author_id', p.author_id, 'by', (select s.name from core.pack_staff(p_org, array[p.author_id]) s), 'reason', p.reason,
      'refund_of', (select r.receipt from billing.payments r where r.organization_id = p_org and r.id = p.refund_of),
      'refunded_by', (select r.receipt from billing.payments r where r.organization_id = p_org and r.refund_of = p.id),
      -- each copy printed, the first the original (owner, 2026-10-08): so a later copy is marked a reprint, after a reload too
      'prints', (select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'by', (select s.name from core.pack_staff(p_org, array[x.author_id]) s)) order by x.at, x.id), '[]')
        from billing.prints x where x.organization_id = p_org and x.payment_id = p.id),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('n', l.n, 'kind', l.kind, 'department_id', l.department_id, 'name', l.name, 'quantity', l.quantity,
          'amount', l.amount, 'typed', l.typed, 'order_item', l.order_item) order by l.n), '[]') from billing.payment_lines l where l.organization_id = p_org and l.payment_id = p.id))
      order by p.at desc), '[]') into v_rows
    from (select x.* from billing.payments x
           where x.organization_id = p_org and v_desk <> 'none'
             and case when v_id is not null then x.id = v_id
                      when v_number is not null then x.receipt = v_number
                      when v_pts is not null then x.patient_id = any (v_pts)
                      else x.day = v_day and x.department_id = p_department end
             and (v_desk = 'everyone' or x.department_id = p_department)
           order by x.at desc limit 200) p;
  return jsonb_build_object('desk', v_desk, 'day', v_day, 'payments', v_rows,
    'patient_ids', (select coalesce(jsonb_agg(distinct y -> 'patient_id') filter (where y ->> 'patient_id' is not null), '[]') from jsonb_array_elements(v_rows) y));
end $$;

-- the day at this desk (or, for whoever reads every desk's accounts, the clinic's): taken and its receipts, cash (given back included) and
-- card, waived with its reasons, given back; a row a cashier and a row a department whose work was paid; the drawers closed; my drawer.
-- Each counts what happened that day and nothing later changes it: a discount is waived on the day it was given, as what is taken is
-- taken, and a refund's day carries its reversal (the discount of the payment it undoes, below nothing). Whose work was paid shares each
-- payment's total (its discount taken off) among its lines by their amounts, the last line taking the piastres left, so the rows add up
-- to what was taken less what was given back
create function billing.totals(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_day date := coalesce((p_args ->> 'day')::date, billing.today(p_org)); v_all boolean := coalesce((p_args ->> 'all')::boolean, false); v jsonb;
begin
  if v_all and not core.may(p_user, 'read:billing.accounts', p_department) then perform core.refuse('not_allowed', 'read:billing.accounts'); end if;
  with p as (select x.*, case when x.refund_of is null then x.discount else -o.discount end waived, coalesce(x.discount_reason, o.discount_reason) why
               from billing.payments x left join billing.payments o on o.organization_id = x.organization_id and o.id = x.refund_of
              where x.organization_id = p_org and x.day = v_day and (v_all or x.department_id = p_department)),
  ln as (select z.department_id, z.payment_id, z.amount, y.total, sum(z.amount) over (partition by z.payment_id) gross,
                row_number() over (partition by z.payment_id order by z.n desc) k
           from billing.payment_lines z join p y on y.id = z.payment_id where z.organization_id = p_org),
  sh as (select ln.*, case when ln.gross = 0 then 0 else round(ln.total * ln.amount / ln.gross, 2) end share from ln),
  net as (select sh.department_id, case when sh.k = 1 then sh.total - (sum(sh.share) over (partition by sh.payment_id) - sh.share) else sh.share end amount from sh)
  select jsonb_build_object('day', v_day, 'all', v_all,
      'taken', coalesce(sum(p.total) filter (where p.refund_of is null), 0), 'receipts', count(*) filter (where p.refund_of is null),
      'cash', coalesce(sum(p.total) filter (where p.method = 'cash'), 0), 'card', coalesce(sum(p.total) filter (where p.method = 'card'), 0),
      'cards', count(*) filter (where p.method = 'card' and p.refund_of is null),
      'given_back', coalesce(sum(p.total) filter (where p.refund_of is not null), 0), 'refunds', count(*) filter (where p.refund_of is not null),
      'waived', coalesce(sum(p.waived), 0), 'discounts', count(*) filter (where p.waived > 0) - count(*) filter (where p.waived < 0),
      'reasons', coalesce((select jsonb_agg(jsonb_build_object('reason', r.why, 'count', r.n, 'amount', r.a) order by r.a desc)
          from (select y.why, count(*) filter (where y.waived > 0) - count(*) filter (where y.waived < 0) n, sum(y.waived) a from p y where y.waived <> 0
                 group by y.why having sum(y.waived) <> 0) r), '[]'),
      'cashiers', coalesce((select jsonb_agg(jsonb_build_object('user_id', c.author_id, 'by', (select s.name from core.pack_staff(p_org, array[c.author_id]) s), 'receipts', c.receipts,
          'cash', c.cash, 'card', c.card, 'waived', c.waived, 'given_back', c.back) order by c.cash + c.card desc)
          from (select y.author_id, count(*) filter (where y.refund_of is null) receipts, coalesce(sum(y.total) filter (where y.method = 'cash'), 0) cash,
                       coalesce(sum(y.total) filter (where y.method = 'card'), 0) card, coalesce(sum(y.waived), 0) waived,
                       coalesce(sum(y.total) filter (where y.refund_of is not null), 0) back from p y group by y.author_id) c), '[]'),
      'departments', coalesce((select jsonb_agg(jsonb_build_object('department_id', l.department_id, 'amount', l.a, 'lines', l.n) order by l.a desc)
          from (select t.department_id, sum(t.amount) a, count(*) n from net t group by t.department_id) l), '[]'))
    into v from p;
  return v || jsonb_build_object(
    'closings', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'department_id', d.department_id, 'user_id', d.user_id, 'by', (select s.name from core.pack_staff(p_org, array[d.user_id]) s),
        'at', d.at, 'since', d.since, 'float', d.float, 'cash', d.cash, 'expected', d.expected, 'counted', d.counted, 'difference', d.counted - d.expected, 'reason', d.reason) order by d.at desc), '[]')
      from billing.drawers d where d.organization_id = p_org and d.day = v_day and (v_all or d.department_id = p_department)),
    'drawer', case when core.may(p_user, 'write:billing.payment', p_department) then billing.drawer_of(p_org, p_department, p_user) end,
    'desk', billing.desk(p_org, p_department));
end $$;

-- ── its operations: what is written ──
-- take payment at this desk: the charges ticked (an open price typed for one priced At the order), the sent lines ticked, the lines a
-- row of this department hands (paid at its counter); a discount from the clinic's reasons; cash (received, change) or card. The total
-- the card showed must be the server's. Each charge, line and order is locked in one order and paid once: the lines handed for an order
-- come with what the row knew billing held of it already (basis: paid, and owed on its open bill), and a payment or a bill sent since
-- (another counter, a resend) refuses it, so an order is never handed twice
create function billing.pay(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_desk text := billing.desk(p_org, p_department); v_pt uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid); v_fam uuid[]; v_method text := coalesce(p_args ->> 'method', 'cash');
        v_lines jsonb := '[]'; x jsonb; v_line text; c billing.charges; s billing.sent; v_pr jsonb; v_amount numeric; v_qty numeric; v_sum numeric := 0; n int := 0;
        v_disc numeric := 0; v_reason text; v_total numeric; v_received numeric; v_id uuid := gen_random_uuid(); v_receipt text; v_order uuid; ord record;
begin
  if v_desk not in ('own', 'everyone') then perform core.refuse('not_a_desk'); end if;
  if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
  if v_method not in ('cash', 'card') then perform core.refuse('bad_method', v_method); end if;
  v_fam := core.family(p_org, v_pt);
  perform billing.lock(array(select 'charge ' || (y ->> 'item') || ' ' || (y ->> 'department_id') from jsonb_array_elements(coalesce(p_args -> 'charges', '[]')) y
                             union select 'sent ' || y from jsonb_array_elements_text(coalesce(p_args -> 'sent', '[]')) y
                             union select 'order ' || z.order_item from billing.sent z where z.organization_id = p_org and z.order_item is not null
                                and z.id::text in (select y from jsonb_array_elements_text(coalesce(p_args -> 'sent', '[]')) y)
                             union select 'order ' || (y ->> 'order_item') from jsonb_array_elements(coalesce(p_args -> 'handed', '[]')) y where y ->> 'order_item' is not null));
  for x in select y from jsonb_array_elements(coalesce(p_args -> 'charges', '[]')) y loop
    select z.* into c from billing.charges z where z.organization_id = p_org and z.item = (x ->> 'item')::uuid and z.department_id = (x ->> 'department_id')::uuid;
    if c.item is null or not (c.patient_id = any (v_fam)) then perform core.refuse('not_found', 'charge'); end if;
    if not c.open then perform core.refuse('charge_void', coalesce(c.name, 'visit')); end if;
    if v_desk = 'own' and c.department_id <> p_department then perform core.refuse('not_this_desk', coalesce(c.name, 'visit')); end if;
    if billing.paid_charge(p_org, c.item, c.department_id) is not null then perform core.refuse('already_paid', coalesce(c.name, 'visit')); end if;
    v_pr := billing.price(p_org, c.kind, c.service_id, c.department_id, c.priced_at);
    if v_pr ? 'at_order' then
      -- an open price: typed here, above nothing and no more than 10,000,000 (chosen in the build, awaiting the owner)
      v_amount := billing.amount(x ->> 'price');
      if v_amount is null or v_amount <= 0 or v_amount > 10000000 then perform core.refuse('price_missing', c.name); end if;
    else
      if x ->> 'price' is not null then perform core.refuse('not_open_price', c.name); end if;
      v_amount := (v_pr ->> 'amount')::numeric;
    end if;
    n := n + 1; v_sum := v_sum + v_amount;
    v_lines := v_lines || jsonb_build_object('n', n, 'kind', 'charge', 'charge_item', c.item, 'charge_department', c.department_id,
      'order_item', case when c.kind = 'service' then c.item end, 'department_id', c.department_id, 'name', c.name, 'amount', v_amount, 'typed', v_pr ? 'at_order');
    c := null;
  end loop;
  for v_line in select y from jsonb_array_elements_text(coalesce(p_args -> 'sent', '[]')) y loop
    select z.* into s from billing.sent z where z.organization_id = p_org and z.id = v_line::uuid;
    if s.id is null or not (s.patient_id = any (v_fam)) then perform core.refuse('not_found', 'line'); end if;
    if v_desk = 'own' and s.department_id <> p_department then perform core.refuse('not_this_desk', s.name); end if;
    -- paid already; or replaced by a later bill, or void, since the card opened
    if not billing.sent_owed(p_org, s.id) then perform core.refuse(case when billing.paid_sent(p_org, s.id) is not null then 'already_paid' else 'total_changed' end, s.name); end if;
    n := n + 1; v_sum := v_sum + s.amount;
    v_lines := v_lines || jsonb_build_object('n', n, 'kind', 'sent', 'sent_id', s.id, 'order_item', s.order_item, 'department_id', s.department_id, 'name', s.name,
      'quantity', s.quantity, 'amount', s.amount);
    s := null;
  end loop;
  -- the lines this department's row hands, paid at its counter: trusted as handed (a name, a quantity, an amount; its order, the patient's,
  -- sent here, where it has one)
  for x in select y from jsonb_array_elements(coalesce(p_args -> 'handed', '[]')) y loop
    v_amount := billing.amount(x ->> 'amount'); v_qty := billing.amount(x ->> 'quantity'); v_order := (x ->> 'order_item')::uuid;
    if coalesce(trim(x ->> 'name'), '') = '' or length(x ->> 'name') > 200 or v_amount is null or v_amount > 10000000 or v_qty is null or v_qty <= 0 then
      perform core.refuse('bad_line', coalesce(x ->> 'name', ''));
    end if;
    if v_order is not null then
      select y.* into ord from core.pack_entries(p_org, array[v_order]) y where y.item = v_order and y.type = any (core.kinds('order')) order by y.item_version desc limit 1;
      if ord.id is null or not (ord.patient_id = any (v_fam)) or (ord.data ->> 'department_id')::uuid is distinct from p_department then perform core.refuse('not_found', 'order'); end if;
    end if;
    n := n + 1; v_sum := v_sum + v_amount;
    v_lines := v_lines || jsonb_build_object('n', n, 'kind', 'handed', 'order_item', v_order, 'department_id', p_department, 'name', trim(x ->> 'name'), 'quantity', v_qty, 'amount', v_amount);
  end loop;
  -- each order handed: what billing holds of it now (paid, owed on its open bill) is what the row knew (none: nothing)
  for v_order in select distinct (y ->> 'order_item')::uuid from jsonb_array_elements(coalesce(p_args -> 'handed', '[]')) y where y ->> 'order_item' is not null loop
    if billing.accounted(p_org, v_order, p_department, true) <> coalesce(billing.amount(p_args -> 'basis' ->> v_order::text), 0) then
      perform core.refuse('total_changed', 'order');
    end if;
  end loop;
  if n = 0 then perform core.refuse('nothing_to_pay'); end if;
  -- a discount: an amount, with a reason from the clinic's list only (owner, 2026-10-08, D35)
  if jsonb_typeof(p_args -> 'discount') = 'object' then
    v_disc := billing.amount(p_args -> 'discount' ->> 'amount'); v_reason := trim(p_args -> 'discount' ->> 'reason');
    if v_disc is null or v_disc > v_sum then perform core.refuse('bad_discount'); end if;
    if v_disc > 0 and not exists (select 1 from jsonb_array_elements_text(coalesce(core.setting_at(p_org, 'billing.reasons', p_org) -> 'reasons', '[]')) r where r = v_reason) then
      perform core.refuse('unknown_reason', coalesce(v_reason, ''));
    end if;
    if v_disc = 0 then v_reason := null; end if;
  end if;
  v_total := v_sum - v_disc;
  if p_args ->> 'total' is not null and billing.amount(p_args ->> 'total') is distinct from v_total then perform core.refuse('total_changed', v_total::text); end if;
  if v_method = 'cash' then
    v_received := coalesce(billing.amount(p_args ->> 'received'), v_total);
    if v_received < v_total then perform core.refuse('not_enough_cash', v_total::text); end if;
  end if;
  perform billing.lock(array['drawer ' || p_org || ' ' || p_department || ' ' || p_user]);
  v_receipt := billing.next_receipt(p_org);
  insert into billing.payments (organization_id, id, receipt, department_id, patient_id, method, total, discount, discount_reason, received, change, author_id, day)
  values (p_org, v_id, v_receipt, p_department, v_pt, v_method, v_total, v_disc, v_reason, v_received, v_received - v_total, p_user, billing.today(p_org));
  insert into billing.payment_lines (organization_id, payment_id, n, kind, charge_item, charge_department, sent_id, order_item, department_id, name, quantity, amount, typed)
  select p_org, v_id, (l ->> 'n')::int, l ->> 'kind', (l ->> 'charge_item')::uuid, (l ->> 'charge_department')::uuid, (l ->> 'sent_id')::uuid, (l ->> 'order_item')::uuid,
         (l ->> 'department_id')::uuid, l ->> 'name', (l ->> 'quantity')::numeric, (l ->> 'amount')::numeric, coalesce((l ->> 'typed')::boolean, false)
    from jsonb_array_elements(v_lines) l;
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('payment_id', v_id, 'receipt', v_receipt, 'total', v_total, 'received', v_received, 'change', v_received - v_total, 'method', v_method,
    'patient_ids', jsonb_build_array(v_pt));
end $$;

-- give a payment back, any day: a payment of its own naming the one it undoes, with its reason, its lines below nothing, its own number;
-- once. A desk of its own charges gives back only what it took
create function billing.refund(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_desk text := billing.desk(p_org, p_department); v_reason text := trim(p_args ->> 'reason'); p billing.payments; v_id uuid := gen_random_uuid(); v_receipt text;
begin
  if v_desk not in ('own', 'everyone') then perform core.refuse('not_a_desk'); end if;
  if coalesce(v_reason, '') = '' then perform core.refuse('reason_missing'); end if;
  perform billing.lock(array['payment ' || coalesce(p_args ->> 'payment_id', '')]);
  select x.* into p from billing.payments x where x.organization_id = p_org and x.id = (p_args ->> 'payment_id')::uuid;
  if p.id is null then perform core.refuse('not_found', 'receipt'); end if;
  if p.refund_of is not null then perform core.refuse('is_a_refund', p.receipt); end if;
  if exists (select 1 from billing.payments r where r.organization_id = p_org and r.refund_of = p.id) then perform core.refuse('already_refunded', p.receipt); end if;
  if v_desk = 'own' and p.department_id <> p_department then perform core.refuse('not_this_desk', p.receipt); end if;
  perform billing.lock(array['drawer ' || p_org || ' ' || p_department || ' ' || p_user]);
  v_receipt := billing.next_receipt(p_org);
  insert into billing.payments (organization_id, id, receipt, department_id, patient_id, method, total, refund_of, reason, author_id, day)
  values (p_org, v_id, v_receipt, p_department, p.patient_id, p.method, -p.total, p.id, v_reason, p_user, billing.today(p_org));
  insert into billing.payment_lines (organization_id, payment_id, n, kind, charge_item, charge_department, sent_id, order_item, department_id, name, quantity, amount, typed)
  select p_org, v_id, l.n, l.kind, l.charge_item, l.charge_department, l.sent_id, l.order_item, l.department_id, l.name, l.quantity, -l.amount, l.typed
    from billing.payment_lines l where l.organization_id = p_org and l.payment_id = p.id;
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('payment_id', v_id, 'receipt', v_receipt, 'total', -p.total, 'refund_of', p.receipt, 'method', p.method,
    'patient_ids', case when p.patient_id is null then '[]'::jsonb else jsonb_build_array(core.survivor(p_org, p.patient_id)) end);
end $$;

-- a receipt or a refund slip printed at this desk (§3.13 Printing, owner 2026-10-08): recorded before it prints, one row a copy, so the
-- copy knows whether it is the first or a reprint (and when the first was), whoever prints it and after any reload. The desk's scope is
-- the receipts': a desk of everyone's prints any desk's, a desk of its own only what it took; a department taking no payment none
create function billing.print(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_desk text := billing.desk(p_org, p_department); p billing.payments; v_id uuid := gen_random_uuid(); v_at timestamptz; v_copy int; v_first timestamptz;
begin
  if v_desk not in ('own', 'everyone') then perform core.refuse('not_a_desk'); end if;
  perform billing.lock(array['print ' || coalesce(p_args ->> 'payment_id', '')]);
  select x.* into p from billing.payments x where x.organization_id = p_org and x.id = (p_args ->> 'payment_id')::uuid;
  if p.id is null then perform core.refuse('not_found', 'receipt'); end if;
  if v_desk = 'own' and p.department_id <> p_department then perform core.refuse('not_this_desk', p.receipt); end if;
  insert into billing.prints (organization_id, id, payment_id, department_id, author_id) values (p_org, v_id, p.id, p_department, p_user) returning at into v_at;
  select count(*), min(x.at) into v_copy, v_first from billing.prints x where x.organization_id = p_org and x.payment_id = p.id;
  return jsonb_build_object('id', v_id, 'receipt', p.receipt, 'copy', v_copy, 'reprint', v_copy > 1, 'at', v_at, 'first_at', v_first);
end $$;

-- close my drawer at this desk: the float and the cash since my last closing, counted against what is there; a difference needs its
-- reason; a new row, never edited
create function billing.close_drawer(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_counted numeric := billing.amount(p_args ->> 'counted'); v_reason text := nullif(trim(p_args ->> 'reason'), ''); d jsonb; v_id uuid := gen_random_uuid();
begin
  if billing.desk(p_org, p_department) not in ('own', 'everyone') then perform core.refuse('not_a_desk'); end if;
  if v_counted is null then perform core.refuse('drawer_count'); end if;
  perform billing.lock(array['drawer ' || p_org || ' ' || p_department || ' ' || p_user]);
  d := billing.drawer_of(p_org, p_department, p_user);
  if v_counted <> (d ->> 'expected')::numeric and v_reason is null then perform core.refuse('reason_missing', ((d ->> 'expected')::numeric)::text); end if;
  insert into billing.drawers (organization_id, id, department_id, user_id, since, day, float, cash, expected, counted, reason)
  values (p_org, v_id, p_department, p_user, (d ->> 'since')::timestamptz, billing.today(p_org), (d ->> 'float')::numeric, (d ->> 'cash')::numeric, (d ->> 'expected')::numeric, v_counted,
          case when v_counted <> (d ->> 'expected')::numeric then v_reason end);
  return jsonb_build_object('id', v_id, 'expected', (d ->> 'expected')::numeric, 'counted', v_counted, 'difference', v_counted - (d ->> 'expected')::numeric);
end $$;

-- Send to cashier (§5.4): a department that prices its own work and does not take payment here sends the lines its row hands — a name, a
-- quantity, an amount, and the order each belongs to where it has one — as an open bill the main cashier takes with the rest of the
-- visit. Trusted as handed; who sent them and when are kept. A resend for an order replaces its lines not yet paid. Each order is
-- locked, and comes with what the row knew was paid of it (basis): a payment taken since refuses it, so it is never sent twice
create function billing.send(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pt uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid); v_fam uuid[]; v_bill uuid := gen_random_uuid(); x jsonb; v_amount numeric; v_qty numeric;
        v_order uuid; ord record; n int := 0;
begin
  if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
  v_fam := core.family(p_org, v_pt);
  if jsonb_array_length(coalesce(p_args -> 'lines', '[]')) = 0 then perform core.refuse('nothing_to_send'); end if;
  if jsonb_array_length(p_args -> 'lines') > 200 then perform core.refuse('too_many', 'lines'); end if;
  perform billing.lock(array(select 'order ' || (y ->> 'order_item') from jsonb_array_elements(p_args -> 'lines') y where y ->> 'order_item' is not null));
  for x in select y from jsonb_array_elements(p_args -> 'lines') y loop
    v_amount := billing.amount(x ->> 'amount'); v_qty := billing.amount(x ->> 'quantity'); v_order := (x ->> 'order_item')::uuid;
    if coalesce(trim(x ->> 'name'), '') = '' or length(x ->> 'name') > 200 or v_amount is null or v_amount > 10000000 or v_qty is null or v_qty <= 0 then
      perform core.refuse('bad_line', coalesce(x ->> 'name', ''));
    end if;
    if v_order is not null then
      select y.* into ord from core.pack_entries(p_org, array[v_order]) y where y.item = v_order and y.type = any (core.kinds('order')) order by y.item_version desc limit 1;
      if ord.id is null or not (ord.patient_id = any (v_fam)) or (ord.data ->> 'department_id')::uuid is distinct from p_department then perform core.refuse('not_found', 'order'); end if;
    end if;
    insert into billing.sent (organization_id, bill_id, patient_id, visit_id, department_id, order_item, name, quantity, amount, author_id)
    values (p_org, v_bill, v_pt, (p_args ->> 'visit_id')::uuid, p_department, v_order, trim(x ->> 'name'), v_qty, v_amount, p_user);
    n := n + 1;
  end loop;
  for v_order in select distinct (y ->> 'order_item')::uuid from jsonb_array_elements(p_args -> 'lines') y where y ->> 'order_item' is not null loop
    if billing.accounted(p_org, v_order, p_department, false) <> coalesce(billing.amount(p_args -> 'basis' ->> v_order::text), 0) then
      perform core.refuse('total_changed', 'order');
    end if;
  end loop;
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('bill_id', v_bill, 'lines', n, 'patient_ids', jsonb_build_array(v_pt));
end $$;

-- the soft check's read (§5.4 Pay first), for the orders a list's rows show: of those performed here, the ones waiting for payment — Pay
-- first on where the work is done, as it stands now; an unpaid charge, a line sent to the cashier still owed, or an open order priced
-- (or At the order) that the charges have not heard yet (the listener's few seconds after commit, or a listener parked: never a gap);
-- and nobody went ahead anyway (…anyway frees an order for good) — and those gone ahead; with Pay first and Takes payment here as they
-- stand, so a row can also wait on the lines it hands itself (a department's own priced work, which billing learns only when handed).
-- Words only: no amount, except, asked for (lines), what billing holds of this department's own lines per order, which it handed itself
-- — paid, and owed on its open bill, with the lines — so its row hands only the rest and sends again only what changed. With no
-- department (billing.chart alone asks so: the door always names one), the orders waiting wherever they are performed, and nothing else
create function billing.waiting(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_orders uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(p_args -> 'orders', '[]')) x); v_wait uuid[]; v_ahead uuid[]; v_pts uuid[];
        v_new uuid[] := '{}'; v_own jsonb; v_held uuid[];
begin
  if cardinality(v_orders) > 500 then perform core.refuse('too_many', 'orders'); end if;
  v_ahead := array(select distinct a.order_item from billing.anyway a where a.organization_id = p_org and a.order_item = any (v_orders)
                     and (p_department is null or a.department_id = p_department));
  -- an open order sent here (or anywhere, with none named) the charges have not heard yet: waiting already where it will be charged
  if cardinality(v_orders) > 0 and (p_department is null or billing.pay_first(p_org, p_department)) then
    v_new := array(select (r ->> 'item')::uuid from core.pack_rows(p_org, 'base.orders', jsonb_build_object('where', jsonb_build_object('item', to_jsonb(v_orders),
                     'status', '["active","in-progress","on-hold"]'::jsonb) || case when p_department is null then '{}'::jsonb else jsonb_build_object('to_department_id', p_department) end)) r
                    where r ->> 'to_department_id' is not null and billing.pay_first(p_org, (r ->> 'to_department_id')::uuid)
                      and not exists (select 1 from billing.charges c where c.organization_id = p_org and c.item = (r ->> 'item')::uuid and c.department_id = (r ->> 'to_department_id')::uuid)
                      and billing.priced_order(p_org, (r ->> 'item')::uuid));
  end if;
  v_wait := array(select distinct c.item from billing.charges c where c.organization_id = p_org and c.item = any (v_orders) and (p_department is null or c.department_id = p_department)
                    and c.open and billing.pay_first(p_org, c.department_id) and billing.paid_charge(p_org, c.item, c.department_id) is null
                  union select distinct s.order_item from billing.sent s where s.organization_id = p_org and s.order_item = any (v_orders)
                    and (p_department is null or s.department_id = p_department) and billing.pay_first(p_org, s.department_id) and billing.sent_owed(p_org, s.id)
                  union select unnest(v_new)
                  except select unnest(v_ahead));
  if p_department is null then return jsonb_build_object('waiting', to_jsonb(v_wait)); end if;
  -- this department's own lines, per order: those on a payment that stands, and those still owed on its open bill
  if coalesce((p_args ->> 'lines')::boolean, false) then
    select coalesce(jsonb_object_agg(q.o, jsonb_build_object('paid', q.paid, 'sent', q.sent, 'lines', q.lines)), '{}') into v_own from (
      select y.o, coalesce(sum(y.amount) filter (where y.paid), 0) paid, coalesce(sum(y.amount) filter (where not y.paid), 0) sent,
             jsonb_agg(jsonb_build_object('name', y.name, 'quantity', y.quantity, 'amount', y.amount, 'paid', y.paid) order by y.at, y.n) lines
        from (select l.order_item o, l.name, l.quantity, l.amount, true paid, p.at, l.n from billing.payment_lines l join billing.payments p on p.organization_id = l.organization_id and p.id = l.payment_id
               where l.organization_id = p_org and l.order_item = any (v_orders) and l.department_id = p_department and l.kind in ('handed', 'sent') and billing.stands(p_org, l.payment_id)
              union all
              select s.order_item, s.name, s.quantity, s.amount, false, s.at, 0 from billing.sent s
               where s.organization_id = p_org and s.order_item = any (v_orders) and s.department_id = p_department and billing.sent_owed(p_org, s.id)) y
       group by y.o) q;
  end if;
  v_held := v_wait || v_ahead || array(select distinct l.order_item from billing.payment_lines l where l.organization_id = p_org and l.order_item = any (v_orders)
                                         and l.department_id = p_department and billing.stands(p_org, l.payment_id));
  v_pts := array(select distinct core.survivor(p_org, c.patient_id) from billing.charges c where c.organization_id = p_org and c.item = any (v_held)
                 union select distinct core.survivor(p_org, s.patient_id) from billing.sent s where s.organization_id = p_org and s.order_item = any (v_held) and s.patient_id is not null
                 union select distinct core.survivor(p_org, a.patient_id) from billing.anyway a where a.organization_id = p_org and a.order_item = any (v_ahead)
                 union select distinct core.survivor(p_org, p.patient_id) from billing.payment_lines l join billing.payments p on p.organization_id = l.organization_id and p.id = l.payment_id
                   where l.organization_id = p_org and l.order_item = any (v_held) and l.department_id = p_department and p.patient_id is not null
                 union select distinct core.survivor(p_org, (r ->> 'patient_id')::uuid) from core.pack_rows(p_org, 'base.orders',
                   jsonb_build_object('where', jsonb_build_object('item', to_jsonb(v_new)))) r where cardinality(v_new) > 0);
  return jsonb_build_object('waiting', to_jsonb(v_wait), 'ahead', to_jsonb(v_ahead), 'pay_first', billing.pay_first(p_org, p_department),
    'desk', billing.desk(p_org, p_department), 'patient_ids', coalesce(to_jsonb(v_pts), '[]'))
    || case when v_own is null then '{}'::jsonb else jsonb_build_object('own', v_own) end;
end $$;

-- the doctor's chart (owner, 2026-10-08: the soft check's word on the chart's order line): of one record's orders, those waiting for
-- payment wherever they are performed (billing.waiting with no department: Pay first as it stands where the work is done) — the orders
-- alone: no amount, no price, no reason, nothing of what was paid or sent — only where the reader's department uses billing (a department
-- that does not use billing sees no money word), for whoever reads the record there (its gate, chosen in the build, awaiting the owner).
-- Orders not of this patient are not answered
create function billing.chart(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_pt uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid); v_orders uuid[] := '{}';
begin
  if v_pt is null then perform core.refuse('not_found', 'patient'); end if;
  if jsonb_array_length(coalesce(p_args -> 'orders', '[]')) > 500 then perform core.refuse('too_many', 'orders'); end if;
  if jsonb_array_length(coalesce(p_args -> 'orders', '[]')) > 0 then
    v_orders := array(select (r ->> 'item')::uuid from core.pack_rows(p_org, 'base.orders', jsonb_build_object('patient', v_pt, 'where', jsonb_build_object('item',
                        (select jsonb_agg(x::uuid) from jsonb_array_elements_text(p_args -> 'orders') x)))) r);
  end if;
  return jsonb_build_object('waiting', coalesce(billing.waiting(p_org, null, p_user, jsonb_build_object('orders', to_jsonb(v_orders))) -> 'waiting', '[]'),
    'patient_ids', jsonb_build_array(v_pt));
end $$;

-- …anyway (§5.4): the work on an order performed here goes ahead before payment, with a one-line reason; who and when are kept. Anyone
-- working this department's bench may (owner, 2026-10-08: the operation's gate, read:bench there; there is no right of its own); the
-- order must be sent here
create function billing.anyway_of(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_order uuid := (p_args ->> 'order_item')::uuid; v_reason text := trim(p_args ->> 'reason'); ord record; v_id uuid := gen_random_uuid();
begin
  if coalesce(v_reason, '') = '' or length(v_reason) > 300 then perform core.refuse('reason_missing'); end if;
  select y.* into ord from core.pack_entries(p_org, array[v_order]) y where y.item = v_order and y.type = any (core.kinds('order')) order by y.item_version desc limit 1;
  if ord.id is null or (ord.data ->> 'department_id')::uuid is distinct from p_department then perform core.refuse('not_found', 'order'); end if;
  insert into billing.anyway (organization_id, id, patient_id, order_item, department_id, reason, author_id)
  values (p_org, v_id, core.survivor(p_org, ord.patient_id), v_order, p_department, v_reason, p_user);
  perform core.hint('organization:' || p_org);
  return jsonb_build_object('id', v_id, 'patient_ids', jsonb_build_array(core.survivor(p_org, ord.patient_id)));
end $$;

reset role;

grant select, delete on billing.charges to core_eraser;
grant select, delete on billing.sent, billing.anyway to core_eraser;
grant select, update (patient_id) on billing.payments to core_eraser;
grant execute on function billing.charges_refresh(uuid, uuid[]) to core_eraser;

-- its actions (§5.2: a pack's actions count only where a department uses it)
select core.declare_action('read:billing.cashier', 'billing', 'department', '{"en":"See who owes, receipts and the day''s totals"}');
select core.declare_action('write:billing.payment', 'billing', 'department', '{"en":"Take payment and close one''s own drawer"}');
select core.declare_action('write:billing.refund', 'billing', 'department', '{"en":"Give a payment back"}');
select core.declare_action('write:billing.prices', 'billing', 'department', '{"en":"Set prices, visit fees and Pay first"}');
select core.declare_action('read:billing.accounts', 'billing', 'department', '{"en":"See every desk''s totals"}');

-- the charges: from the base's check-ins and Send to… moves, orders and their steps (and what crosses them out), after commit; sending
-- no record entries (F08)
select core.declare_table('billing.charges', 'billing', 'billing.charges_refresh(uuid,uuid[])', 'read:billing.cashier', entries => false);
select core.declare_listener('billing', array['checked_in', 'transferred', 'crossed_out', 'order', 'step'], 'billing.charges_refresh(uuid,uuid[])');
-- Erase reaches its own tables (D17): money keeps its amounts and receipt numbers and loses the patient (D18); an open bill and the
-- reasons for going ahead go with the patient (a paid line lives on as the payment's line)
select core.declare_store('billing.payments', 'billing', array['patient_id']);
select core.declare_store('billing.sent', 'billing');
select core.declare_store('billing.anyway', 'billing');

-- its operations (public.pack_op): each returning patient ids is read-logged per patient (F28)
select core.declare_op('billing.owed', 'billing', 'billing.owed(uuid,uuid,uuid,jsonb)', 'read:billing.cashier', patients => true);
select core.declare_op('billing.lines', 'billing', 'billing.lines(uuid,uuid,uuid,jsonb)', 'read:billing.cashier', patients => true);
select core.declare_op('billing.paid', 'billing', 'billing.paid(uuid,uuid,uuid,jsonb)', 'read:billing.cashier', patients => true);
select core.declare_op('billing.day', 'billing', 'billing.totals(uuid,uuid,uuid,jsonb)', 'read:billing.cashier');
select core.declare_op('billing.pay', 'billing', 'billing.pay(uuid,uuid,uuid,jsonb)', 'write:billing.payment', patients => true);
select core.declare_op('billing.refund', 'billing', 'billing.refund(uuid,uuid,uuid,jsonb)', 'write:billing.refund', patients => true);
select core.declare_op('billing.close', 'billing', 'billing.close_drawer(uuid,uuid,uuid,jsonb)', 'write:billing.payment');
-- a receipt or a refund slip printed (owner, 2026-10-08): whoever sees the desk's receipts; it names no patient (the core logs the print
-- of a patient's receipt itself, like a read: §3.13)
select core.declare_op('billing.print', 'billing', 'billing.print(uuid,uuid,uuid,jsonb)', 'read:billing.cashier');
-- a department's own lines, the soft check and going ahead anyway: anyone working its bench (read:bench, the base's), where it uses
-- billing (owner, 2026-10-08)
select core.declare_op('billing.send', 'billing', 'billing.send(uuid,uuid,uuid,jsonb)', 'read:bench', patients => true);
select core.declare_op('billing.waiting', 'billing', 'billing.waiting(uuid,uuid,uuid,jsonb)', 'read:bench', patients => true);
select core.declare_op('billing.anyway', 'billing', 'billing.anyway_of(uuid,uuid,uuid,jsonb)', 'read:bench', patients => true);
-- the waiting word on the doctor's chart (owner, 2026-10-08), where the reader's department uses billing: for whoever reads the record
-- there (chosen in the build, awaiting the owner)
select core.declare_op('billing.chart', 'billing', 'billing.chart(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- its settings (§5.1 rule 7). Prices: billing's own (Billing → Prices, D27), each a service's (its department's) or a department's visit
-- fee, written by whoever sets prices there; Pay first on the department's card and on Billing → Prices, switched by whoever sets
-- prices there (write:billing.prices: owner, 2026-10-08); Takes payment here on the department's card; the reasons a charge may be
-- waived on the pack's page
select core.declare_setting('billing.price', 'billing', 'department',
  '{"type":"object","additionalProperties":false,"required":["service_id"],"properties":{"service_id":{"type":"string","format":"uuid"},
    "price":{"type":"string","pattern":"^[0-9]{1,8}(\\.[0-9]{1,2})?$"},"at_order":{"type":"boolean"}}}',
  'billing.price_check(jsonb,jsonb)', true, '{"en":"Service price"}', action => 'write:billing.prices');
select core.declare_setting('billing.visit_fee', 'billing', 'department',
  '{"type":"object","additionalProperties":false,"required":["amount"],"properties":{"amount":{"type":"string","pattern":"^[0-9]{1,8}(\\.[0-9]{1,2})?$"}}}',
  'billing.fee_check(jsonb,jsonb)', true, '{"en":"Visit fee"}', action => 'write:billing.prices');
select core.declare_setting('billing.pay_first', 'billing', 'department',
  '{"type":"object","additionalProperties":false,"required":["on"],"properties":{"on":{"type":"boolean","default":false}}}',
  labels => '{"en":"Pay first"}', form => 'department', action => 'write:billing.prices',
  fields => '[{"key":"on","labels":{"en":"Pay first"},"help":{"en":"Priced work sent here waits for payment: its order says \"Waiting for payment\" until paid, and can go ahead anyway with a reason. Off: pay after, at the cashier."}}]');
select core.declare_setting('billing.desk', 'billing', 'department',
  '{"type":"object","additionalProperties":false,"required":["takes"],"properties":{"takes":{"enum":["none","own","everyone"],"default":"none"},
    "float":{"type":"string","pattern":"^[0-9]{1,8}(\\.[0-9]{1,2})?$","default":"0.00"}}}',
  labels => '{"en":"Takes payment here"}', form => 'department',
  fields => '[{"key":"takes","labels":{"en":"Takes payment here"},"help":{"en":"Its own charges (the lab takes the lab''s), or everyone''s (the main cashier)."},
      "choices":{"none":{"en":"No"},"own":{"en":"Its own charges"},"everyone":{"en":"Everyone''s"}}},
    {"key":"float","labels":{"en":"Float in each drawer (EGP)"},"help":{"en":"The cash a drawer starts with: closing expects the float plus the cash taken."}}]');
select core.declare_setting('billing.reasons', 'billing', 'organization',
  '{"type":"object","additionalProperties":false,"required":["reasons"],"properties":{"reasons":{"type":"array","uniqueItems":true,
    "items":{"type":"string","minLength":1,"maxLength":60},"default":["Staff","Charity","Follow-up within 7 days"]}}}',
  labels => '{"en":"Reasons a charge may be waived"}', form => 'pack',
  fields => '[{"key":"reasons","labels":{"en":"Reasons a charge may be waived"},"help":{"en":"A discount takes its reason from this list only."}}]');

-- its screens: anywhere a department takes payment (work any): the Cashier (who owes, the payment card, receipts), Today (the day's
-- totals, closing the drawer) and Prices (Billing → Prices, for whoever sets them)
select core.declare_screen('billing.cashier', 'billing', 'any', '{"en":"Cashier"}', 'read:billing.cashier');
select core.declare_screen('billing.today', 'billing', 'any', '{"en":"Today"}', 'read:billing.cashier');
select core.declare_screen('billing.prices', 'billing', 'any', '{"en":"Prices"}', 'write:billing.prices');

-- its roles: plain (§5.2), neither doctor nor nurse
select core.declare_role('00000000-0000-0000-0000-00000000ce01', 'billing.cashier', 'billing', 'Cashier', array[
  'read:patients', 'read:billing.cashier', 'write:billing.payment', 'write:billing.refund'], '{"en":"Cashier"}');
select core.declare_role('00000000-0000-0000-0000-00000000ce02', 'billing.accountant', 'billing', 'Accountant', array[
  'read:patients', 'read:billing.cashier', 'read:billing.accounts', 'write:billing.prices'], '{"en":"Accountant"}');

-- its starter setups (§5.2): the main cashier, a desk of its own (Cashier and Today, Prices for whoever sets them; it takes everyone's
-- payments and checks nobody in, D36); and a clinic or a bench that bills (the pack ticked, nothing else changed)
select core.declare_setup('billing.cashier', 'billing', 'desk', '{"en":"Cashier"}', packs => array['billing'],
  screens => '{"screens":["billing.cashier","billing.today","billing.prices"],"opens":"billing.cashier"}',
  settings => '{"billing.desk":{"takes":"everyone","float":"0.00"}}',
  help => '{"en":"The main cashier: takes payment for every department, closes its drawers. It has no check-in."}');
select core.declare_setup('billing.clinic', 'billing', 'visits', '{"en":"Clinic that bills"}', packs => array['billing'],
  help => '{"en":"Ticks billing on a clinic: its visit fee and the priced services it orders reach the cashier."}');
select core.declare_setup('billing.bench', 'billing', 'bench', '{"en":"Bench that bills"}', packs => array['billing'],
  help => '{"en":"Ticks billing on a bench: its priced services reach the cashier."}');
