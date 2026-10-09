-- 22 · the clinics' core change that needs SQL (spec/openCare.md §5.8, the owner 2026-10-08, Q36; core change C3): a pack's command that
-- is not an order (/transfuse) is offered where a department using the pack works for this one, as an order word is. What it writes is a
-- pack type extending a base type (the transfusion record extends given); declared *served*, it is written with the base type's own
-- action (write:given), as a pack's order type is written with write:order (§5.5 a), so a ward that does not tick the pack can write it
-- where the Blood bank works for it. The pack's own check on the type asks core.pack_serves (granted to the pack as it declares the type
-- served) and refuses it `not_served` in a department that neither uses the pack nor is served by a department using it.

set client_min_messages = warning;

create table core.served_types (
  key         text primary key,
  layer       text not null references core.layers,
  declared_at timestamptz not null default now()
);

-- a pack type extending a base type (not order: an order is written with write:order already) is written with its base's action
create function core.declare_served(p_type text) returns void language plpgsql as $$
declare t core.types;
begin
  select * into t from core.types where key = p_type order by version desc limit 1;
  if not found then raise exception 'not_found: the type %', p_type; end if;
  if t.layer in ('core', 'base') or t.base_type is null or t.base_type = 'order'
     or not exists (select 1 from core.types b where b.key = t.base_type and b.layer = 'base') then
    raise exception 'not_served: % is not a pack type extending a base type other than order', p_type;
  end if;
  insert into core.served_types (key, layer) values (p_type, t.layer) on conflict (key) do nothing;
  execute format('grant execute on function core.pack_serves(uuid, uuid, text) to %I', 'pack_' || t.layer);   -- its check asks it
end $$;

-- the action that writes a type: write:<type>, except a pack's type extending the base's order (written with write:order wherever
-- its writer orders from, §5.5 a) and a pack's served type (written with its base type's action where the pack serves, C3)
create or replace function core.write_action(p_type text) returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from core.types t where t.key = p_type and t.layer <> 'base' and t.base_type = 'order') then 'write:order'
              when exists (select 1 from core.served_types s where s.key = p_type) then 'write:' || core.base_of(p_type)
              else 'write:' || p_type end
$$;

-- does the pack serve this department: it uses the pack, or a department using it works for this one (department.works_for)
create function core.pack_serves(p_org uuid, p_department uuid, p_pack text) returns boolean language sql stable security definer set search_path = '' as $$
  select core.department_uses(p_org, p_department, p_pack) or exists (
    select 1 from core.departments d where d.organization_id = p_org and d.id <> p_department and d.retired_at is null
      and core.department_uses(p_org, d.id, p_pack)
      and (core.setting_at(p_org, 'department.works_for', d.id) is null
           or coalesce((core.setting_at(p_org, 'department.works_for', d.id) ->> 'all')::boolean, false)
           or coalesce(core.setting_at(p_org, 'department.works_for', d.id) -> 'departments', '[]') @> to_jsonb(array[p_department::text])))
$$;

revoke all on function core.declare_served(text), core.pack_serves(uuid, uuid, text) from public, anon, authenticated;
grant execute on function core.pack_serves(uuid, uuid, text) to base_role, core_eraser;
