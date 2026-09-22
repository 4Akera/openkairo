-- 0015 · read_entry names its patient: the request surface opens a request by id and needs the patient it belongs to
create or replace function public.read_entry(entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e core.entries; u uuid;
begin
  select * into e from core.entries where id = entry_id; if not found then perform core.refuse('not_found'); end if;
  u := core.require_access(e.organization_id, 'read:record', e.patient_id, null);
  perform core.require_open(u, core.survivor(e.patient_id));
  return core.entry_card(e) || pg_catalog.jsonb_build_object('data', e.data, 'patient_id', e.patient_id,
    'patient', (select pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name, 'sex', p.sex, 'age', core.age_on(p.born_on, current_date))
                from core.patients p where p.id = e.patient_id),
    'replies', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x) || pg_catalog.jsonb_build_object('data', x.data) order by x.occurred_at) from core.entries x where x.reply_to_id = e.id and x.replaced_by_id is null and x.type <> 'entered_in_error'), '[]'),
    'files', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('position', f.position, 'name', f.name, 'mime', f.mime) order by f.position) from core.entry_files f where f.entry_id = e.id), '[]'),
    'steps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by s.position) from core.request_steps s where s.request_id = e.id), '[]'),
    'versions', coalesce((select pg_catalog.jsonb_agg(core.entry_card(x) order by x.recorded_at) from core.entries x where core.root_of(x.id) = core.root_of(e.id) and x.id <> e.id), '[]'));
end $$;
