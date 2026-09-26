-- pharmacy pack (spec 06): dispensing a prescription. Kinds only — the practice makes the Pharmacy department and its Dispensing service.
--   department type pharmacy · entry type pharmacy_dispense (the reply that closes a prescription's request) · step prepared ·
--   actions write:pharmacy_dispense, mark:prepared · role pharmacy_pharmacist. No list of its own, no after_write (stock comes later).

-- ── its role: no privilege on any core table; only the funnel and the gates ──
do $$ begin if not exists (select 1 from pg_roles where rolname = 'pack_pharmacy') then create role pack_pharmacy nologin; end if; end $$;
grant pack_pharmacy to postgres;   -- the migration runner is not a superuser; it must be allowed to SET ROLE
grant usage on schema core to pack_pharmacy;
grant execute on function core.write_entry(uuid,uuid,uuid,uuid,uuid,uuid,uuid,core.entry_source,text,timestamptz,text,uuid,jsonb,text,uuid,boolean,uuid,uuid,jsonb,boolean),
  core.begin_write(uuid,uuid,text,core.entry_source,text,timestamptz,jsonb), core.require_access(uuid,text,uuid,uuid), core.require_pack(uuid,text),
  core.refuse(text,text), core.short(text,int) to pack_pharmacy;

-- ── registry rows (as the migration owner: the pack role holds nothing on core tables) ──
insert into core.packs (key, name, is_called_after_write) values ('pharmacy', 'Pharmacy', false);
insert into core.department_types (key, name, pack, is_visited) values ('pharmacy', 'Pharmacy', 'pharmacy', false);
insert into core.entry_types (key, name, pack) values ('pharmacy_dispense', 'Dispense', 'pharmacy');
insert into core.actions (key, pack) values ('write:pharmacy_dispense', 'pharmacy'), ('mark:prepared', 'pharmacy');
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000ca01', null, 'pharmacy_pharmacist', 'Pharmacist');
insert into core.role_actions (role_id, action) select '00000000-0000-0000-0000-00000000ca01', a from unnest(array[
  'read:organization','read:patient','read:queue','read:record','write:pharmacy_dispense','mark:prepared','mark:held','mark:sent','mark:cancelled']) a;
-- the owner holds every action, pack ones included
insert into core.role_actions (role_id, action) select '00000000-0000-0000-0000-00000000c001', a from unnest(array['write:pharmacy_dispense','mark:prepared']) a;

-- ── its schema, owned by its role ──
create schema pharmacy authorization pack_pharmacy;
grant usage on schema pharmacy to authenticated;
set role pack_pharmacy;

-- dispense: the reply that closes a prescription's request. items: [{name, dose_number, dose_unit, quantity, substituted_from}]
create function pharmacy.write_dispense(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  request_id uuid default null, items jsonb default '[]', text text default null, not_done boolean default false, not_done_reason_text text default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
declare h record; d jsonb; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:pharmacy_dispense', source, stated_author_name, stated_recorded_at, '{}');
  perform core.require_pack(h.o_org, 'pharmacy');
  if request_id is null then perform core.refuse('request_missing', 'a dispense answers a prescription'); end if;
  if not not_done and pg_catalog.jsonb_array_length(coalesce(items, '[]')) = 0 then perform core.refuse('items_missing'); end if;
  if not_done and coalesce(pg_catalog.btrim(not_done_reason_text), '') = '' then perform core.refuse('reason_missing'); end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('items', items, 'text', text,
         'not_done', case when not_done then true end, 'not_done_reason_text', not_done_reason_text));
  line := case when not_done then 'Not dispensed — ' || core.short(not_done_reason_text, 60)
    else 'Dispensed: ' || (select pg_catalog.string_agg(pg_catalog.concat_ws(' ', i->>'name', nullif(pg_catalog.concat_ws(' ', i->>'dose_number', i->>'dose_unit'), ''),
           case when i->>'quantity' is not null then '× ' || (i->>'quantity') end, case when i->>'substituted_from' is not null then '(for ' || (i->>'substituted_from') || ')' end), ' · ')
         from pg_catalog.jsonb_array_elements(items) i) end;
  -- the funnel checks the reply against the service's reply type, the patient, the department and the author
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'pharmacy_dispense', null, d, line, request_id, true, replaces_id, written_with_id, null, false);
end $$;
reset role;

-- ── the public door: a thin invoker wrapper, so the pack's code runs as its own role ──
create function public.pharmacy_write_dispense(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  request_id uuid default null, items jsonb default '[]', text text default null, not_done boolean default false, not_done_reason_text text default null
) returns core.entries language sql security invoker set search_path = '' as $$
  select * from pharmacy.write_dispense(id, patient_id, visit_id, department_id, replaces_id, occurred_at, responsible_id, source, source_key,
    stated_author_name, stated_recorded_at, written_with_id, request_id, items, text, not_done, not_done_reason_text)
$$;
grant execute on function pharmacy.write_dispense(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,core.entry_source,text,text,timestamptz,uuid,uuid,jsonb,text,boolean,text) to authenticated;
grant execute on function public.pharmacy_write_dispense(uuid,uuid,uuid,uuid,uuid,timestamptz,uuid,core.entry_source,text,text,timestamptz,uuid,uuid,jsonb,text,boolean,text) to authenticated;
