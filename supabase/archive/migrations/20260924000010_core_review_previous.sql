-- 0032 · the review list shows each result beside the patient's value before it ("Creatinine 1.9 ↑, was 1.1 in Jun"),
--   so a result can be judged without opening the record; a previous value from a private visit the reader cannot see is left out
create or replace function public.read_to_review(department_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid; org uuid;
begin
  if department_id is not null then
    select organization_id into org from core.departments where id = department_id;
    u := core.require_access(org, 'read:queue', null, department_id);
  else
    -- mine: any organization I belong to; find it from the login
    select organization_id, id into org, u from core.users where login_id = core.auth_uid() and retired_at is null limit 1;
    if u is null then perform core.refuse('not_a_member'); end if;
    perform core.require_access(org, 'mark:reviewed', null, null);
  end if;
  return coalesce((select pg_catalog.jsonb_agg(core.entry_card(e, core.hidden_for(u, e.patient_id)) || pg_catalog.jsonb_build_object(
        'patient', pg_catalog.jsonb_build_object('id', p.id, 'record_number', p.record_number, 'given_name', p.given_name, 'family_name', p.family_name),
        'service_name', e.data->'service'->>'name',
        -- up to three numbers of the latest reply, the most flagged first, each with the patient's value before it
        'compare', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', coalesce(k.name, v.code), 'value', v.value_number, 'unit', v.unit, 'flag', v.flag,
            'previous', pv.value_number, 'previous_at', pv.occurred_at) order by v.rank)
          from (select v0.*, row_number() over (order by (v0.flag = 'critical') desc, (v0.flag in ('high', 'low', 'abnormal')) desc, v0.position) as rank
                from core.entry_values v0
                where v0.value_number is not null and v0.entry_id = (select x.id from core.entries x where x.reply_to_id = r.entry_id and x.replaced_by_id is null
                        and x.type <> 'entered_in_error' and not core.note_hidden(x, core.hidden_for(u, x.patient_id)) order by x.recorded_at desc limit 1)) v
          left join core.codes k on k.code = v.code
          left join lateral (select y.value_number, y.occurred_at from core.entry_values y join core.entries ye on ye.id = y.entry_id
              where y.patient_id = v.patient_id and y.code = v.code and y.occurred_at < v.occurred_at and y.value_number is not null and ye.replaced_by_id is null
                and not core.note_hidden(ye, core.hidden_for(u, v.patient_id)) order by y.occurred_at desc limit 1) pv on true
          where v.rank <= 3), '[]')) order by (r.reply_flag = 'critical') desc, r.review_needed_at)
    from core.requests r join core.entries e on e.id = r.entry_id join core.patients p on p.id = e.patient_id
    where r.review_needed_at is not null and ((read_to_review.department_id is null and r.requester_id = u) or (read_to_review.department_id is not null and r.from_department_id = read_to_review.department_id))), '[]');
end $$;
