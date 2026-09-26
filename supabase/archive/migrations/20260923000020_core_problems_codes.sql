-- 0020 · problems carry a note and a certainty on the list; service fields may be typed without a registered code
--        (the organization gets a local code); a code lookup for the settings screens

-- problems: note + certainty (confirmed | suspected); the display line says what was written
alter table core.patient_problems add column if not exists note_text text, add column if not exists certainty text not null default 'confirmed';

create or replace function core.update_problems(e core.entries) returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb := e.data; act text := d->>'action'; target uuid := (d->>'problem_id')::uuid;
begin
  if act = 'add' then
    insert into core.patient_problems (id, organization_id, patient_id, code, name, status, onset_on, note_text, certainty, latest_entry_id)
    values (core.root_of(e.id), e.organization_id, e.patient_id, d->>'code', d->>'name', coalesce(d->>'status', 'active'), d->>'onset_on', d->>'text', coalesce(d->>'certainty', 'confirmed'), e.id)
    on conflict (id) do update set code = excluded.code, name = excluded.name, status = excluded.status, onset_on = excluded.onset_on,
      note_text = excluded.note_text, certainty = excluded.certainty, latest_entry_id = excluded.latest_entry_id;
  elsif act = 'update' then
    update core.patient_problems set code = coalesce(d->>'code', code), name = coalesce(d->>'name', name), status = coalesce(d->>'status', status),
      onset_on = coalesce(d->>'onset_on', onset_on), note_text = coalesce(d->>'text', note_text), certainty = coalesce(d->>'certainty', certainty), latest_entry_id = e.id where id = target;
  elsif act = 'resolve' then
    update core.patient_problems set status = 'resolved', resolved_on = coalesce(d->>'resolved_on', to_char(e.occurred_at at time zone 'UTC', 'YYYY-MM-DD')), latest_entry_id = e.id where id = target;
  end if;
end $$;

drop function if exists public.write_problem(uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, core.entry_source, text, text, timestamptz, uuid, text, uuid, text, text, text, text, text, text);
create function public.write_problem(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  action text default 'add', problem_id uuid default null, code text default null, name text default null, status text default 'active',
  onset_on text default null, resolved_on text default null, text text default null, certainty text default null
) returns core.entries language plpgsql security definer set search_path = '' as $$
declare h record; p core.patient_problems; d jsonb; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:problem', source, stated_author_name, stated_recorded_at, '{}');
  if action not in ('add','update','resolve') then perform core.refuse('bad_action', action); end if;
  if certainty is not null and certainty not in ('confirmed','suspected') then perform core.refuse('bad_certainty', certainty); end if;
  if action = 'add' and nullif(trim(name), '') is null then perform core.refuse('name_missing'); end if;
  if action <> 'add' then
    select * into p from core.patient_problems where patient_problems.id = problem_id and patient_problems.patient_id = write_problem.patient_id;
    if not found then perform core.refuse('problem_not_found'); end if;
    name := coalesce(name, p.name); code := coalesce(code, p.code);
  end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('action', action, 'problem_id', problem_id, 'code', code, 'name', trim(name), 'status', status,
         'onset_on', onset_on, 'resolved_on', resolved_on, 'text', text, 'certainty', certainty));
  line := case action when 'add' then 'Problem: ' when 'update' then 'Problem updated: ' else 'Problem resolved: ' end || trim(name)
       || case when certainty = 'suspected' then ' (suspected)' else '' end
       || coalesce(' · since ' || onset_on, '') || coalesce(' — ' || core.short(text, 60), '');
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'problem', null, d, line, null, true, replaces_id, written_with_id, null);
end $$;
grant execute on function public.write_problem(uuid, uuid, uuid, uuid, uuid, timestamptz, uuid, core.entry_source, text, text, timestamptz, uuid, text, uuid, text, text, text, text, text, text, text) to authenticated;

-- codes: an organization's own codes are 'local:<org8>.<slug>'; a field typed without a registered code gets one
create or replace function core.local_code(p_org uuid, p_code text, p_name text, p_kind text, p_unit text) returns text
language plpgsql security definer set search_path = '' as $$
declare c text := nullif(trim(p_code), ''); slug text;
begin
  if c is not null and exists (select 1 from core.codes k where k.code = c and (k.organization_id is null or k.organization_id = p_org)) then return c; end if;
  if c is not null and c ~ '^[a-z0-9_]+:[^\s]+$' then perform core.refuse('unknown_code', c); end if;   -- a system code nobody registered
  slug := trim(both '_' from regexp_replace(lower(core.fold(coalesce(c, p_name))), '[^a-z0-9]+', '_', 'g'));
  if slug = '' then perform core.refuse('code_missing', p_name); end if;
  c := 'local:' || left(p_org::text, 8) || '.' || slug;
  insert into core.codes (code, name, kind, unit, organization_id) values (c, trim(p_name), coalesce(p_kind, 'number'), nullif(trim(p_unit), ''), p_org)
  on conflict (code) do nothing;
  return c;
end $$;

create or replace function public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text default 'result',
  section_name text default null, fields jsonb default '[]', seen_change_id uuid default null)
returns core.services language plpgsql security definer set search_path = '' as $$
declare u uuid; s core.services; f jsonb; i int := 0; fc text;
begin
  u := core.require_access(organization_id, 'manage:services', null, null);
  perform core.require_fresh('services', id, seen_change_id);
  if reply_type = 'result' and pg_catalog.jsonb_array_length(coalesce(fields, '[]')) = 0 then perform core.refuse('fields_missing', 'a result needs at least one field'); end if;
  if nullif(trim(name), '') is null then perform core.refuse('name_missing'); end if;
  insert into core.services (id, organization_id, department_id, section_name, code, name, reply_type)
  values (id, organization_id, department_id, nullif(trim(section_name), ''), lower(trim(code)), trim(name), reply_type)
  on conflict on constraint services_pkey do update set department_id = excluded.department_id, section_name = excluded.section_name, code = excluded.code, name = excluded.name, reply_type = excluded.reply_type
  returning * into s;
  delete from core.service_fields where service_id = s.id;
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(fields, '[]')) loop
    i := i + 1;
    fc := core.local_code(save_service.organization_id, f->>'code', coalesce(f->>'name', f->>'code'), coalesce(f->>'kind', 'number'), f->>'unit');
    insert into core.service_fields (service_id, position, code, name, kind, unit, choices, reference_low, reference_high, critical_low, critical_high)
    values (s.id, i, fc, coalesce(nullif(trim(f->>'name'), ''), (select k.name from core.codes k where k.code = fc)), coalesce(f->>'kind', 'number'),
      coalesce(nullif(trim(f->>'unit'), ''), (select k.unit from core.codes k where k.code = fc)),
      case when pg_catalog.jsonb_typeof(f->'choices') = 'array' then (select pg_catalog.array_agg(x) from pg_catalog.jsonb_array_elements_text(f->'choices') x) end,
      (f->>'reference_low')::numeric, (f->>'reference_high')::numeric, (f->>'critical_low')::numeric, (f->>'critical_high')::numeric);
  end loop;
  perform core.record_settings_change(organization_id, u, 'services', s.id, pg_catalog.jsonb_build_object('name', s.name, 'code', s.code, 'department_id', s.department_id, 'fields', i));
  return s;
end $$;

-- the codes an organization may use (global and its own), for pickers
create or replace function public.read_codes(organization_id uuid, query text default null, "limit" int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; q text := nullif(trim(coalesce(query, '')), '');
begin
  u := core.require_access(organization_id, 'read:organization', null, null);
  return coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code', c.code, 'name', c.name, 'kind', c.kind, 'unit', c.unit, 'is_local', c.organization_id is not null) order by c.name)
    from (select * from core.codes k where (k.organization_id is null or k.organization_id = read_codes.organization_id) and k.retired_at is null
          and (q is null or core.fold(k.name) ilike '%' || core.fold(q) || '%' or k.code ilike '%' || q || '%') order by k.name limit "limit") c), '[]');
end $$;
grant execute on function public.read_codes(uuid, text, int) to authenticated;
