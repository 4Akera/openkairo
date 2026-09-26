-- 0018 · save_service: a field sent with "choices": null is a number/text field, not a scalar to unpack
create or replace function public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text default 'result',
  section_name text default null, fields jsonb default '[]', seen_change_id uuid default null)
returns core.services language plpgsql security definer set search_path = '' as $$
declare u uuid; s core.services; f jsonb; i int := 0;
begin
  u := core.require_access(organization_id, 'manage:services', null, null);
  perform core.require_fresh('services', id, seen_change_id);
  if reply_type = 'result' and pg_catalog.jsonb_array_length(coalesce(fields, '[]')) = 0 then perform core.refuse('fields_missing', 'a result needs at least one field'); end if;
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(fields, '[]')) loop
    if not exists (select 1 from core.codes c where c.code = f->>'code' and (c.organization_id is null or c.organization_id = save_service.organization_id)) then perform core.refuse('unknown_code', f->>'code'); end if;
  end loop;
  insert into core.services (id, organization_id, department_id, section_name, code, name, reply_type)
  values (id, organization_id, department_id, section_name, code, trim(name), reply_type)
  on conflict on constraint services_pkey do update set department_id = excluded.department_id, section_name = excluded.section_name, code = excluded.code, name = excluded.name, reply_type = excluded.reply_type
  returning * into s;
  delete from core.service_fields where service_id = s.id;
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(fields, '[]')) loop
    i := i + 1;
    insert into core.service_fields (service_id, position, code, name, kind, unit, choices, reference_low, reference_high, critical_low, critical_high)
    values (s.id, i, f->>'code', f->>'name', coalesce(f->>'kind', 'number'), f->>'unit',
      case when pg_catalog.jsonb_typeof(f->'choices') = 'array' then (select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(f->'choices') x) end,
      (f->>'reference_low')::numeric, (f->>'reference_high')::numeric, (f->>'critical_low')::numeric, (f->>'critical_high')::numeric);
  end loop;
  perform core.record_settings_change(organization_id, u, 'services', s.id, pg_catalog.jsonb_build_object('name', s.name, 'code', s.code, 'department_id', s.department_id, 'fields', i));
  return s;
end $$;
