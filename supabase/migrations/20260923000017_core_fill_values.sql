-- 0017 · results are self-contained (spec 01): at write time each value gets the service field's name, unit, the range that
-- fits the patient (sex/age row, else the field's own) and a flag computed once. The writer may still send its own ranges/flag.
create or replace function core.fill_values(p_service uuid, p_patient uuid, vals jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; f core.service_fields; rg core.service_field_ranges; p core.patients; a int; out jsonb := '[]'; i int := 0;
begin
  if p_service is null then return coalesce(vals, '[]'); end if;
  select * into p from core.patients where id = p_patient;
  a := core.age_on(p.born_on, current_date);
  for v in select x from pg_catalog.jsonb_array_elements(coalesce(vals, '[]')) x loop
    i := i + 1;
    select * into f from core.service_fields sf where sf.service_id = p_service and sf.retired_at is null
      and (sf.code = v->>'code' or (v->>'code' is null and sf.position = i)) limit 1;
    if found then
      select * into rg from core.service_field_ranges r where r.service_id = p_service and r.position = f.position
        and (r.sex is null or r.sex = p.sex) and (r.age_low is null or a >= r.age_low) and (r.age_high is null or a < r.age_high)
        order by (r.sex is not null) desc, (r.age_low is not null or r.age_high is not null) desc limit 1;
      v := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
             'code', f.code, 'name', f.name, 'unit', f.unit,
             'reference_low', coalesce(rg.reference_low, f.reference_low), 'reference_high', coalesce(rg.reference_high, f.reference_high),
             'critical_low', coalesce(rg.critical_low, f.critical_low), 'critical_high', coalesce(rg.critical_high, f.critical_high))) || v;
    end if;
    if not (v ? 'flag') then v := v || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('flag', core.flag_of(v))); end if;
    out := out || v;
  end loop;
  return out;
end $$;

create or replace function public.write_result(
  id uuid, patient_id uuid, visit_id uuid default null, department_id uuid default null,
  replaces_id uuid default null, occurred_at timestamptz default null, responsible_id uuid default null,
  source core.entry_source default 'staff', source_key text default null, stated_author_name text default null, stated_recorded_at timestamptz default null,
  written_with_id uuid default null,
  request_id uuid default null, "values" jsonb default '[]', text text default null, is_final boolean default true,
  not_done boolean default false, not_done_reason_text text default null, needs_review boolean default true, files jsonb default '[]'
) returns core.entries language plpgsql security definer set search_path = '' as $$
declare h record; r core.requests; req core.entries; svc uuid; line text; d jsonb; e core.entries; f jsonb; i int := 0; vals jsonb;
begin
  if request_id is not null then
    select * into r from core.requests where entry_id = request_id;
    if not found then perform core.refuse('request_not_found'); end if;
    select * into req from core.entries where entries.id = request_id;
    svc := req.service_id;
    select * into h from core.begin_write(patient_id, r.to_department_id, 'write:result', source, stated_author_name, stated_recorded_at, '{}');
  else
    if source <> 'outside' then perform core.refuse('request_missing', 'a result without a request is an outside result'); end if;
    select * into h from core.begin_write(patient_id, department_id, 'write:result', source, stated_author_name, stated_recorded_at, '{}');
  end if;
  vals := core.fill_values(svc, patient_id, "values");
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('values', vals, 'text', text, 'not_done', case when not_done then true end, 'not_done_reason_text', not_done_reason_text));
  if not_done then line := 'Not done' || coalesce(' — ' || core.short(not_done_reason_text, 60), '');
  elsif pg_catalog.jsonb_array_length(coalesce(vals,'[]')) > 0 then line := coalesce((req.data->'service'->>'name') || ' · ', '') || core.values_line(vals);
  else line := coalesce((req.data->'service'->>'name') || ' · ', '') || coalesce(core.short(split_part(text, E'\n', 1), 80), 'Result'); end if;
  e := core.write_entry(id, h.o_org, patient_id, coalesce(visit_id, req.visit_id), department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'result', svc, d, line, request_id, is_final, replaces_id, written_with_id, null, needs_review);
  for f in select * from pg_catalog.jsonb_array_elements(coalesce(files,'[]')) loop
    i := i + 1;
    insert into core.entry_files (entry_id, position, path, url, mime, name) values (e.id, i, f->>'path', f->>'url', f->>'mime', coalesce(f->>'name', 'file'))
    on conflict do nothing;
  end loop;
  return e;
end $$;
