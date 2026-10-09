-- 07 · base: the derived tables and their refreshes (spec/openCare.md §4.2, §4.5). Each holds nothing entries do not: a refresh
-- recomputes, from entries and settings as of each entry, every row that depends on the items it is given. Declared in dependency
-- order (orders → presence → review → lists → values → deceased): a refresh may read the tables declared before it.
-- A row's source_entries are in write order (recorded_at, id), so a rebuild gives the same row whichever plan the query takes.

set client_min_messages = warning;
set role base_role;

-- ── helpers ──
create function base.tz(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo')
$$;
-- the latest version of an item, and whether the item is gone (crossed out, or redacted)
create function base.latest(p_org uuid, p_item uuid) returns core.entries language sql stable security definer set search_path = '' as $$
  select e from core.entries e where e.organization_id = p_org and e.item = p_item order by e.item_version desc limit 1
$$;
create function base.gone(p_org uuid, e core.entries) returns boolean language sql stable security definer set search_path = '' as $$
  select e.id is null or e.type = 'crossed_out' or exists (select 1 from core.redactions r where r.organization_id = p_org and r.item = e.item)
$$;
-- the order items these items are, or answer (a step's first entry answers the order; a result or a note answers it)
create function base.orders_of(p_org uuid, p_items uuid[]) returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select e.item x from core.entries e where e.organization_id = p_org and e.item = any (p_items) and e.item_version = 1 and e.type = any (core.kinds('order'))
    union
    select o.item from core.entries a join core.entries o on o.organization_id = a.organization_id and o.id = a.refers_to
     where a.organization_id = p_org and a.item = any (p_items) and a.relation = 'answers' and o.type = any (core.kinds('order'))) q
$$;
-- the items that answer these orders (results, notes, steps and what extends them)
create function base.answers_of(p_org uuid, p_orders uuid[]) returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a.item), '{}') from core.entries a join core.entries o on o.organization_id = a.organization_id and o.id = a.refers_to
   where a.organization_id = p_org and a.relation = 'answers' and o.item = any (p_orders)
$$;
-- how bad a result is: critical (LL, HH, AA), abnormal (L, H, A, POS) or normal
create function base.result_level(p_data jsonb) returns text language sql immutable as $$
  select case when exists (select 1 from jsonb_array_elements(coalesce(p_data -> 'analytes', '[]')) a where a ->> 'interpretation' in ('LL', 'HH', 'AA')) then 'critical'
              when exists (select 1 from jsonb_array_elements(coalesce(p_data -> 'analytes', '[]')) a where a ->> 'interpretation' in ('L', 'H', 'A', 'POS')) then 'abnormal'
              else 'normal' end
$$;

-- ── base.orders: one row per order item ──
create table base.orders (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  visit_id      uuid,
  requester_id  uuid not null,
  from_department_id uuid not null,
  to_department_id uuid,
  service_id    uuid,
  service_code  text,
  service_name  text,
  priority      text not null default 'routine',
  status        text not null,             -- active · on-hold · in-progress · completed · revoked · rejected · cancelled
  step          text,                      -- the latest step's status
  step_key      text,                      -- the latest of the service's steps it reached (collected, prepared)
  step_item     uuid,
  step_entry    uuid,                      -- the step item's latest entry: a later step changes it
  answers       uuid[] not null default '{}',   -- the latest entry of each answer item
  answered_at   timestamptz,
  final         boolean not null default false,
  about_item    uuid,                      -- what it is about (the medication a dispense order is for)
  ordered_at    timestamptz not null,
  last_at       timestamptz not null,
  day           date not null,
  latest_entry  uuid not null,
  version       int not null,
  source_entries uuid[] not null,
  asked_by      text,                      -- a walk-in's outside doctor, as the order says (spec §5.3)
  primary key (organization_id, item)
);
create index orders_to on base.orders (organization_id, to_department_id, status);
create index orders_patient on base.orders (organization_id, patient_id);
create index orders_visit on base.orders (organization_id, visit_id);

create function base.orders_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; o1 core.entries; ol core.entries; st core.entries; ans uuid[]; fin boolean; v_answered timestamptz; v_status text; src uuid[]; keys uuid[]; v_key text;
begin
  keys := base.orders_of(p_org, p_items);
  delete from base.orders where organization_id = p_org and item = any (keys);
  foreach k in array keys loop
    select e.* into o1 from core.entries e where e.organization_id = p_org and e.item = k and e.item_version = 1;
    ol := base.latest(p_org, k);
    continue when base.gone(p_org, ol);
    -- the latest step of every step item answering it
    select l.* into st from core.entries a, lateral base.latest(p_org, a.item) l
     where a.organization_id = p_org and a.relation = 'answers' and a.item_version = 1 and a.type = any (core.kinds('step'))
       and a.refers_to in (select x.id from core.entries x where x.organization_id = p_org and x.item = k) and not base.gone(p_org, l)
     order by l.recorded_at desc limit 1;
    -- the latest step key any of its step items carried: a status-only step after it (held, resumed, or one answering it anew from a
    -- bench that had not seen the first) keeps it
    v_key := (select x.data ->> 'step' from core.entries a join core.entries x on x.organization_id = a.organization_id and x.item = a.item
               where a.organization_id = p_org and a.relation = 'answers' and a.item_version = 1 and a.type = any (core.kinds('step'))
                 and a.refers_to in (select y.id from core.entries y where y.organization_id = p_org and y.item = k)
                 and not base.gone(p_org, base.latest(p_org, a.item)) and x.data ? 'step'
               order by x.recorded_at desc, x.item_version desc limit 1);
    -- results and notes answering it: the latest version of each, unless crossed out
    select coalesce(array_agg(l.id order by l.recorded_at), '{}'), coalesce(bool_or(coalesce(l.data ->> 'status', 'final') in ('final', 'corrected', 'amended')), false),
           min(case when coalesce(l.data ->> 'status', 'final') in ('final', 'corrected', 'amended') then f.occurred_at end)
      into ans, fin, v_answered
      from core.entries a join core.entries f on f.organization_id = a.organization_id and f.item = a.item and f.item_version = 1, lateral base.latest(p_org, a.item) l
     where a.organization_id = p_org and a.relation = 'answers' and a.item_version = 1 and not (a.type = any (core.kinds('step')))
       and a.refers_to in (select x.id from core.entries x where x.organization_id = p_org and x.item = k) and not base.gone(p_org, l);
    v_status := case
      when ol.data ->> 'status' = 'revoked' then 'revoked'
      when st.data ->> 'status' in ('rejected', 'cancelled', 'failed') then st.data ->> 'status'
      when fin or st.data ->> 'status' = 'completed' then 'completed'
      when cardinality(ans) > 0 or st.data ->> 'status' in ('accepted', 'in-progress', 'received') then 'in-progress'
      when ol.data ->> 'status' = 'on-hold' or st.data ->> 'status' = 'on-hold' then 'on-hold'
      when ol.data ->> 'status' = 'completed' then 'completed'
      else 'active' end;
    if v_answered is null and v_status in ('completed', 'rejected', 'cancelled', 'failed', 'revoked') then v_answered := coalesce(st.occurred_at, ol.occurred_at); end if;
    select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') into src from core.entries x where x.organization_id = p_org
       and (x.item = k or x.item in (select a.item from core.entries a where a.organization_id = p_org and a.relation = 'answers'
                                       and a.refers_to in (select y.id from core.entries y where y.organization_id = p_org and y.item = k)));
    insert into base.orders values (p_org, k, core.survivor(p_org, o1.patient_id), o1.visit_id, o1.author_id, o1.department_id,
      coalesce(ol.data ->> 'department_id', o1.data ->> 'department_id')::uuid, (ol.data -> 'service' ->> 'id')::uuid, ol.data -> 'service' ->> 'code',
      ol.data -> 'service' ->> 'name', coalesce(ol.data ->> 'priority', 'routine'), v_status, st.data ->> 'status', v_key, st.item, st.id, ans, v_answered, fin,
      case when o1.relation = 'about' then (select t.item from core.entries t where t.organization_id = p_org and t.id = o1.refers_to) end,
      -- ordered, answered, last moved and the day are clinical times, as presence's are (a dispense prepared an hour ago reads an hour old)
      o1.occurred_at, greatest(ol.occurred_at, coalesce(st.occurred_at, ol.occurred_at)), (o1.occurred_at at time zone base.tz(p_org))::date, ol.id, ol.item_version, src, ol.data ->> 'asked_by');
  end loop;
end $$;

-- ── base.presence: who is where; one row per visit or stay ──
create table base.presence (
  organization_id uuid not null,
  item          uuid not null,             -- the visit (or stay) item
  patient_id    uuid not null,
  kind          text not null,             -- visit · stay
  department_id uuid not null,
  from_department_id uuid,
  place_id      uuid,
  state         text not null,             -- waiting · called · with · pending · back · done · left · admitted · discharged
  here          boolean not null,
  away_since    timestamptz,
  urgent        boolean not null default false,
  assigned_id   uuid,
  calls         int not null default 0,
  missed        int not null default 0,
  checked_in_at timestamptz not null,
  called_at     timestamptz,
  called_by     uuid,
  seen_at       timestamptz,
  seen_by       uuid,
  done_at       timestamptz,
  ended_at      timestamptz,
  wait          boolean,
  orders        int not null default 0,
  orders_out    int not null default 0,
  has_vitals    boolean not null default false,
  reason        text,
  came_from     uuid,                      -- a stay: the visit it came from
  for_order     uuid,                      -- a visit checked in for an order (a consult)
  last_at       timestamptz not null,
  day           date not null,
  latest_entry  uuid not null,
  version       int not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index presence_department on base.presence (organization_id, department_id, state);
create index presence_patient on base.presence (organization_id, patient_id);
create index presence_place on base.presence (organization_id, place_id) where place_id is not null;
create index presence_day on base.presence (organization_id, day);

create function base.presence_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; keys uuid[]; v_e core.entries; f core.entries; r base.presence; b text; v_open int; v_src uuid[]; v_clin timestamptz; v_clin_by uuid;
        v_called timestamptz;   -- when the call was written: what came after it is found in write order
begin
  select coalesce(array_agg(distinct x), '{}') into keys from (
    select e.item x from core.entries e where e.organization_id = p_org and e.item = any (p_items) and e.item_version = 1
       and e.type = any (core.kinds('checked_in') || core.kinds('admitted'))
    union select e.visit_id from core.entries e where e.organization_id = p_org and e.item = any (p_items) and e.visit_id is not null
    union select o.visit_id from base.orders o where o.organization_id = p_org and o.item = any (base.orders_of(p_org, p_items)) and o.visit_id is not null) q
  where x is not null;
  delete from base.presence where organization_id = p_org and item = any (keys);
  foreach k in array keys loop
    select x.* into f from core.entries x where x.organization_id = p_org and x.item = k and x.item_version = 1;
    continue when f.id is null or not (f.type = any (core.kinds('checked_in') || core.kinds('admitted')));
    v_e := base.latest(p_org, k);
    continue when base.gone(p_org, v_e);
    r := null;
    r.organization_id := p_org; r.item := k; r.patient_id := core.survivor(p_org, f.patient_id);
    r.kind := case when f.type = any (core.kinds('admitted')) then 'stay' else 'visit' end;
    r.department_id := coalesce((f.data ->> 'department_id')::uuid, f.department_id); r.place_id := (f.data ->> 'place_id')::uuid;
    r.from_department_id := case when r.department_id <> f.department_id then f.department_id end;
    r.state := case r.kind when 'stay' then 'admitted' else 'waiting' end;
    r.here := coalesce((f.data ->> 'here')::boolean, true); r.urgent := coalesce(f.data ->> 'priority', 'routine') in ('urgent', 'asap', 'stat');
    r.calls := 0; r.missed := 0; r.orders := 0; r.orders_out := 0; r.has_vitals := false;
    -- arrived, called and seen are clinical times (occurred_at: the same as written, unless written late); the order of moves is
    -- the order they were written
    r.checked_in_at := f.occurred_at; v_called := null; r.reason := f.data ->> 'reason'; r.for_order := (f.data ->> 'for_order')::uuid;
    r.came_from := case when f.relation = 'about' then (select t.item from core.entries t where t.organization_id = p_org and t.id = f.refers_to) end;
    for v_e in select x.* from core.entries x where x.organization_id = p_org and x.item = k and x.item_version > 1 order by x.item_version loop
      b := core.base_of(v_e.type);
      -- a stay counts only its own moves (§4.2): a clinic move landed late (flagged, not refused) never ends or unseats it
      continue when r.kind = 'stay' and b not in ('moved', 'discharged', 'assigned', 'urgent');
      -- seen before this move: something clinical written in the visit after the call
      if v_called is not null and r.seen_at is null then
        select greatest(x.occurred_at, r.called_at), x.author_id into v_clin, v_clin_by from core.entries x join core.types t on t.key = x.type and t.version = x.type_version
         where x.organization_id = p_org and x.visit_id = k and t.in_record and x.recorded_at >= v_called and x.recorded_at <= v_e.recorded_at
           and x.department_id = r.department_id order by x.recorded_at, x.occurred_at, x.id limit 1;
        if v_clin is not null then
          r.seen_at := v_clin; r.seen_by := v_clin_by;
          if r.state = 'called' then r.state := 'with'; end if;
        end if;
      end if;
      case b
        when 'here' then r.here := true; r.away_since := null;
        when 'not_here' then r.here := false; r.away_since := null;
        when 'called' then r.state := 'called'; r.calls := r.calls + 1; r.called_at := v_e.occurred_at; v_called := v_e.recorded_at; r.called_by := v_e.author_id; r.away_since := null;
        when 'back_to_waiting' then
          r.state := case when r.seen_at is not null then 'back' else 'waiting' end;
          if v_e.data ->> 'reason' = 'not_here' then r.missed := r.missed + 1; end if;
        when 'seen' then
          r.seen_at := coalesce(r.seen_at, v_e.occurred_at); r.seen_by := coalesce(r.seen_by, v_e.author_id);
          if r.state in ('called', 'waiting', 'back', 'pending') then r.state := 'with'; end if;
        when 'away' then r.away_since := v_e.recorded_at;
        when 'urgent' then r.urgent := coalesce((v_e.data ->> 'urgent')::boolean, true);
        when 'assigned' then r.assigned_id := (v_e.data ->> 'user_id')::uuid;
        when 'transferred' then
          r.from_department_id := r.department_id; r.department_id := (v_e.data ->> 'to_department_id')::uuid; r.state := 'waiting';
          r.assigned_id := null; r.called_at := null; v_called := null; r.called_by := null; r.seen_at := null; r.seen_by := null; r.calls := 0; r.here := true;
        when 'left' then r.state := 'left'; r.ended_at := v_e.recorded_at;
        when 'done' then
          r.done_at := v_e.recorded_at; r.seen_at := coalesce(r.seen_at, v_e.occurred_at); r.seen_by := coalesce(r.seen_by, v_e.author_id);
          -- the clinician says at Done whether the patient waits for the orders still out (owner, 2026-10-07: Done or Wait for
          -- results); a writer that does not say waits
          r.wait := coalesce((v_e.data ->> 'wait')::boolean, true);
          select count(*) into v_open from base.orders o where o.organization_id = p_org and o.visit_id = k
             and (o.answered_at is null or o.answered_at > v_e.occurred_at) and o.ordered_at <= v_e.occurred_at;
          if r.wait and v_open > 0 then r.state := 'pending'; r.ended_at := null; else r.state := 'done'; r.ended_at := v_e.recorded_at; end if;
        when 'moved' then r.place_id := (v_e.data ->> 'place_id')::uuid;
        when 'discharged' then r.state := 'discharged'; r.ended_at := v_e.recorded_at;
        else null;
      end case;
    end loop;
    -- seen: something clinical written in the visit after the call
    if v_called is not null and r.seen_at is null then
      select greatest(x.occurred_at, r.called_at), x.author_id into v_clin, v_clin_by from core.entries x join core.types t on t.key = x.type and t.version = x.type_version
       where x.organization_id = p_org and x.visit_id = k and t.in_record and x.recorded_at >= v_called and x.department_id = r.department_id
       order by x.recorded_at, x.occurred_at, x.id limit 1;
      if v_clin is not null then
        r.seen_at := v_clin; r.seen_by := v_clin_by;
        if r.state = 'called' then r.state := 'with'; end if;
      end if;
    end if;
    select count(*), count(*) filter (where o.status not in ('completed', 'revoked', 'rejected', 'cancelled', 'failed')) into r.orders, r.orders_out
      from base.orders o where o.organization_id = p_org and o.visit_id = k;
    if r.state = 'pending' and r.orders_out = 0 then r.state := 'back'; end if;
    r.has_vitals := exists (select 1 from core.entries x where x.organization_id = p_org and x.visit_id = k and x.type = any (core.kinds('vitals')));
    v_e := base.latest(p_org, k);
    r.latest_entry := v_e.id; r.version := v_e.item_version; r.last_at := v_e.recorded_at;
    r.day := (f.occurred_at at time zone base.tz(p_org))::date;
    select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') into r.source_entries from core.entries x where x.organization_id = p_org and x.item = k;
    insert into base.presence select r.*;
  end loop;
end $$;

-- ── base.review: what needs a clinician's review, for whom and why ──
create table base.review (
  organization_id uuid not null,
  item          uuid not null,             -- the result, step or flagged item
  patient_id    uuid not null,
  why           text not null,             -- result · abnormal · critical · not_seen · corrected · rejected · flag · question
  level         text,                      -- normal · abnormal · critical
  critical      boolean not null default false,
  for_user      uuid,
  for_department uuid,
  order_item    uuid,
  visit_id      uuid,
  entry_id      uuid not null,
  at            timestamptz not null,
  source_entries uuid[] not null
);
create index review_item on base.review (organization_id, item);
create index review_for on base.review (organization_id, for_user);
create index review_department on base.review (organization_id, for_department);

create function base.review_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; keys uuid[]; f core.entries; l core.entries; v_o base.orders; v_p base.presence; b text; v_reviewed boolean; v_level text; v_rule text; v_waiting boolean;
        v_why text; v_orders uuid[]; fl jsonb;
begin
  v_orders := base.orders_of(p_org, p_items) || (select coalesce(array_agg(o.item), '{}') from base.orders o where o.organization_id = p_org and o.visit_id = any (p_items));
  keys := (select coalesce(array_agg(distinct x), '{}') from unnest(p_items || base.answers_of(p_org, v_orders)) x);
  delete from base.review where organization_id = p_org and item = any (keys);
  foreach k in array keys loop
    select x.* into f from core.entries x where x.organization_id = p_org and x.item = k and x.item_version = 1;
    continue when f.id is null;
    l := base.latest(p_org, k);
    continue when base.gone(p_org, l);
    b := core.base_of(l.type);
    v_reviewed := exists (select 1 from core.entries rv join core.entries t on t.organization_id = rv.organization_id and t.id = rv.refers_to
      where rv.organization_id = p_org and rv.type = any (core.kinds('reviewed')) and t.item = k and rv.recorded_at >= l.recorded_at);
    -- answers to an order: the loop closes on the requester
    if f.relation = 'answers' and b in ('result', 'note', 'step') and not v_reviewed then
      select x.* into v_o from base.orders x where x.organization_id = p_org and x.item = (select t.item from core.entries t where t.organization_id = p_org and t.id = f.refers_to);
      if v_o.item is not null then
        v_why := null; v_level := null;
        if b = 'step' then
          if l.data ->> 'status' in ('rejected', 'cancelled', 'failed') then v_why := 'rejected'; end if;
        elsif b in ('result', 'note') and (b = 'note' or coalesce(l.data ->> 'status', 'final') in ('final', 'corrected', 'amended', 'preliminary')) then
          v_level := case when b = 'result' then base.result_level(l.data) else 'normal' end;
          select x.* into v_p from base.presence x where x.organization_id = p_org and x.item = v_o.visit_id;
          v_waiting := v_p.item is not null and ((v_p.state in ('pending', 'back', 'called', 'with', 'waiting') and v_p.here)
                                               or (v_p.state = 'done' and v_p.done_at >= l.recorded_at));
          v_rule := coalesce(core.setting_at(p_org, 'department.review_results', v_o.from_department_id, l.recorded_at) ->> 'level', 'critical');
          -- a version replacing a released one is a correction; the final that replaces a preliminary is the result's first final
          v_why := case when l.replaces is not null and coalesce((select x.data ->> 'status' from core.entries x where x.organization_id = p_org and x.id = l.replaces), 'final')
                                                     not in ('preliminary', 'registered') then 'corrected'
                        when not v_waiting then 'not_seen'
                        when v_level = 'critical' then 'critical'
                        when v_rule = 'abnormal' and v_level = 'abnormal' then 'abnormal'
                        when v_rule = 'all' then 'result' end;
        end if;
        if v_why is not null then
          insert into base.review values (p_org, k, core.survivor(p_org, l.patient_id), v_why, v_level, coalesce(v_level = 'critical', false), v_o.requester_id,
            v_o.from_department_id, v_o.item, v_o.visit_id, l.id, l.recorded_at,
            (select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') from core.entries x where x.organization_id = p_org and x.item = k));
        end if;
      end if;
    end if;
    -- a question about an order (spec §5.3): for whoever asked for the order, until they answer it (a reviewed entry about it)
    if b = 'question' and not v_reviewed then
      select x.* into v_o from base.orders x where x.organization_id = p_org and x.item = (select t.item from core.entries t where t.organization_id = p_org and t.id = f.refers_to);
      if v_o.item is not null then
        insert into base.review values (p_org, k, core.survivor(p_org, l.patient_id), 'question', null, false, v_o.requester_id, v_o.from_department_id, v_o.item, v_o.visit_id,
          l.id, l.recorded_at, (select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') from core.entries x where x.organization_id = p_org and x.item = k));
      end if;
    end if;
    -- a flagged entry: a review row for its department, until someone reviews it
    if not v_reviewed and b <> 'reviewed' then
      select x into fl from jsonb_array_elements(l.findings) x where x ->> 'level' = 'flag' limit 1;
      if fl is not null then
        insert into base.review values (p_org, k, core.survivor(p_org, l.patient_id), 'flag', fl ->> 'code', false, null, l.department_id, null, l.visit_id, l.id, l.recorded_at,
          (select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') from core.entries x where x.organization_id = p_org and x.item = k));
      end if;
    end if;
  end loop;
end $$;

-- ── base.lists: problems, medications, allergies (and their reviews); a patient's or machine's fact waits for a staff change ──
create table base.lists (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  list          text not null,             -- problems · diagnoses · medications · allergies · reviews
  status        text not null,
  code          text,                      -- the first coding (system:code), for checks and cohorts
  entry_id      uuid not null,             -- the current version
  first_at      timestamptz not null,
  changed_at    timestamptz not null,
  visit_id      uuid,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index lists_patient on base.lists (organization_id, patient_id, list);

create function base.lists_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; f core.entries; l core.entries; b text; v_list text; v_status text; v_code text;
begin
  delete from base.lists where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into f from core.entries x where x.organization_id = p_org and x.item = k and x.item_version = 1;
    continue when f.id is null;
    b := core.base_of(f.type);
    continue when b not in ('problem', 'medication', 'allergy', 'list_review');
    l := base.latest(p_org, k);
    continue when base.gone(p_org, l) or l.source not in ('staff', 'import');
    v_list := case b when 'problem' then case when l.data ->> 'category' = 'encounter-diagnosis' then 'diagnoses' else 'problems' end
                     when 'medication' then 'medications' when 'allergy' then 'allergies' else 'reviews' end;
    v_status := case b when 'problem' then l.data ->> 'clinical_status' when 'allergy' then l.data ->> 'clinical_status'
                       when 'medication' then l.data ->> 'status' else l.data ->> 'list' end;
    select (c ->> 'system') || ':' || (c ->> 'code') into v_code from core.codings(coalesce(l.data -> 'concept', l.data -> 'drug', '{}')) c limit 1;
    insert into base.lists values (p_org, k, core.survivor(p_org, l.patient_id), v_list, coalesce(v_status, 'active'), v_code, l.id, f.recorded_at, l.recorded_at, f.visit_id,
      (select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') from core.entries x where x.organization_id = p_org and x.item = k));
  end loop;
end $$;

-- ── base.values: every numeric value (vitals by stable key, analytes, coded observations) for trends and key results ──
create table base.values (
  organization_id uuid not null,
  id            uuid not null,             -- uuid v5(item, key)
  item          uuid not null,
  key           text not null,
  patient_id    uuid not null,
  code          text,
  name          text,
  value         numeric not null,
  ucum          text,
  unit          text,
  interpretation text,
  at            timestamptz not null,
  entry_id      uuid not null,
  visit_id      uuid,
  source_entries uuid[] not null,
  primary key (organization_id, id)
);
create index values_patient on base.values (organization_id, patient_id, code, at desc);
create index values_item on base.values (organization_id, item);

-- the vitals keys and their LOINC codes (§4.1); oxygen's flow and FiO2 by their path (the owner's Q5, 2026-10-08)
create function base.vital_keys() returns table (key text, path text[], code text, name text) language sql immutable as $$
  values ('bp.sys', array['bp','sys'], 'loinc:8480-6', 'Systolic BP'), ('bp.dia', array['bp','dia'], 'loinc:8462-4', 'Diastolic BP'),
         ('hr', array['hr'], 'loinc:8867-4', 'Heart rate'), ('rr', array['rr'], 'loinc:9279-1', 'Respiratory rate'), ('temp', array['temp'], 'loinc:8310-5', 'Temperature'),
         ('spo2', array['spo2'], 'loinc:59408-5', 'SpO2'), ('oxygen.flow', array['oxygen','flow'], 'loinc:3151-8', 'Oxygen flow'),
         ('oxygen.fio2', array['oxygen','fio2'], 'loinc:3150-0', 'FiO2'), ('weight', array['weight'], 'loinc:29463-7', 'Weight'), ('height', array['height'], 'loinc:8302-2', 'Height'),
         ('bmi', array['bmi'], 'loinc:39156-5', 'BMI'), ('head', array['head'], 'loinc:9843-4', 'Head circumference'), ('pain', array['pain'], 'loinc:72514-3', 'Pain'),
         ('glucose', array['glucose'], 'loinc:41653-7', 'Glucose (capillary)')
$$;

create function base.values_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; f core.entries; l core.entries; b text; src uuid[]; pt uuid; a jsonb;
begin
  delete from base.values where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into f from core.entries x where x.organization_id = p_org and x.item = k and x.item_version = 1;
    continue when f.id is null;
    b := core.base_of(f.type);
    continue when b not in ('vitals', 'result', 'observation');
    l := base.latest(p_org, k);
    continue when base.gone(p_org, l);
    src := (select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') from core.entries x where x.organization_id = p_org and x.item = k);
    pt := core.survivor(p_org, l.patient_id);
    if b = 'vitals' then
      insert into base.values select p_org, core.uuid5(k, v.key), k, v.key, pt, v.code, v.name, (l.data #>> (v.path || array['value']))::numeric,
          l.data #>> (v.path || array['ucum']), l.data #>> (v.path || array['unit']), null, l.occurred_at, l.id, l.visit_id, src
        from base.vital_keys() v where l.data #>> (v.path || array['value']) ~ '^-?[0-9]+(\.[0-9]+)?$';
    elsif b = 'result' then
      for a in select * from jsonb_array_elements(coalesce(l.data -> 'analytes', '[]')) loop
        continue when coalesce(a -> 'value' ->> 'value', '') !~ '^-?[0-9]+(\.[0-9]+)?$';
        insert into base.values values (p_org, core.uuid5(k, coalesce(a ->> 'key', a -> 'code' ->> 'code', a ->> 'name')), k, coalesce(a ->> 'key', a -> 'code' ->> 'code', a ->> 'name'),
          pt, case when a ? 'code' then (a -> 'code' ->> 'system') || ':' || (a -> 'code' ->> 'code') end, a ->> 'name', (a -> 'value' ->> 'value')::numeric,
          a -> 'value' ->> 'ucum', a -> 'value' ->> 'unit', a ->> 'interpretation', l.occurred_at, l.id, l.visit_id, src)
        on conflict (organization_id, id) do nothing;
      end loop;
    elsif l.data -> 'value' -> 'quantity' ->> 'value' ~ '^-?[0-9]+(\.[0-9]+)?$' then
      insert into base.values values (p_org, core.uuid5(k, 'value'), k, 'value', pt,
        (select (c ->> 'system') || ':' || (c ->> 'code') from core.codings(l.data -> 'code') c limit 1), l.data -> 'code' ->> 'text',
        (l.data -> 'value' -> 'quantity' ->> 'value')::numeric, l.data -> 'value' -> 'quantity' ->> 'ucum', l.data -> 'value' -> 'quantity' ->> 'unit',
        l.data ->> 'interpretation', l.occurred_at, l.id, l.visit_id, src);
    end if;
  end loop;
end $$;

-- ── base.deceased: the banner and Patient.deceased ──
create table base.deceased (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  at            timestamptz not null,
  precision     text not null,
  entry_id      uuid not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index deceased_patient on base.deceased (organization_id, patient_id);

create function base.deceased_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; f core.entries; l core.entries;
begin
  delete from base.deceased where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into f from core.entries x where x.organization_id = p_org and x.item = k and x.item_version = 1;
    continue when f.id is null or core.base_of(f.type) <> 'died';
    l := base.latest(p_org, k);
    continue when base.gone(p_org, l);
    insert into base.deceased values (p_org, k, core.survivor(p_org, l.patient_id), l.occurred_at, l.precision, l.id,
      (select coalesce(array_agg(x.id order by x.recorded_at, x.id), '{}') from core.entries x where x.organization_id = p_org and x.item = k));
  end loop;
end $$;

-- a pack's read of identity (§5.2): sex, birth date with its precision, estimated, unknown, deceased (the base's died, never private), and
-- the age at a moment (now when none) in completed years, months and days by the clinic's day; no age without a birth date
create function base.pack_identity(p_org uuid, p_patient uuid, p_at timestamptz default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.identity_read();   -- in a refresh: only one whose table declares what of identity it reads
  return (
  with p as (select x.*, (coalesce(p_at, now()) at time zone base.tz(p_org))::date as day from core.patients x
              where x.organization_id = p_org and x.id = core.survivor(p_org, p_patient) and core.pack_hidden(p_org, null) = '{}'),
       a as (select p.*, case when p.birth_date <= p.day then age(p.day, p.birth_date) end as span from p)
  select jsonb_build_object('patient_id', a.id, 'sex', a.gender, 'birth_date', a.birth_date, 'birth_precision', a.birth_precision, 'estimated', a.birth_estimated,
    'unknown', a.anonymous, 'age_years', extract(year from a.span)::int, 'age_months', (extract(year from a.span) * 12 + extract(month from a.span))::int,
    'age_days', case when a.span is not null then a.day - a.birth_date end,
    'deceased', exists (select 1 from base.deceased d where d.organization_id = p_org and d.patient_id = any (core.family(p_org, a.id))),
    'deceased_at', (select d.at from base.deceased d where d.organization_id = p_org and d.patient_id = any (core.family(p_org, a.id)) order by d.at limit 1))
  from a);
end $$;

reset role;

-- the eraser removes a patient's rows and runs the refreshes; the reader reads these tables through core's definer functions
grant select, delete on base.orders, base.presence, base.review, base.lists, base.values, base.deceased to core_eraser;
grant execute on function base.orders_refresh(uuid, uuid[]), base.presence_refresh(uuid, uuid[]), base.review_refresh(uuid, uuid[]),
  base.lists_refresh(uuid, uuid[]), base.values_refresh(uuid, uuid[]), base.deceased_refresh(uuid, uuid[]) to core_eraser;

-- read actions (the tables' own) and the declarations, in dependency order
select core.declare_action('read:record', 'base', 'department', '{"en":"Read the record"}');
select core.declare_action('read:queue',  'base', 'department', '{"en":"Read who is where (desk, queue, bed board)"}');
select core.declare_action('read:bench',  'base', 'department', '{"en":"Read the orders sent to the department"}');
select core.declare_action('read:review', 'base', 'department', '{"en":"Read results to review"}');
select core.declare_action('export:fhir', 'base', 'department', '{"en":"Export FHIR"}');
select core.declare_table('base.orders',   'base', 'base.orders_refresh(uuid,uuid[])',   'read:bench');
select core.declare_table('base.presence', 'base', 'base.presence_refresh(uuid,uuid[])', 'read:queue');
select core.declare_table('base.review',   'base', 'base.review_refresh(uuid,uuid[])',   'read:review');
select core.declare_table('base.lists',    'base', 'base.lists_refresh(uuid,uuid[])',    'read:record');
select core.declare_table('base.values',   'base', 'base.values_refresh(uuid,uuid[])',   'read:record');
select core.declare_table('base.deceased', 'base', 'base.deceased_refresh(uuid,uuid[])', 'read:patients');
