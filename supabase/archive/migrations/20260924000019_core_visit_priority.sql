-- 0040 · the desk marks a waiting visit urgent (or back to routine): the queue orders it first; the visit's history keeps who and when
create or replace function public.mark_visit_priority(visit_id uuid, priority core.request_priority) returns core.visits
language plpgsql security definer set search_path = '' as $$
declare v core.visits; u uuid;
begin
  select * into v from core.visits where id = mark_visit_priority.visit_id for update; if not found then perform core.refuse('not_found', 'visit'); end if;
  u := core.require_access(v.organization_id, 'write:visit', v.patient_id, v.department_id);
  if v.ended_at is not null then perform core.refuse('illegal_move', 'visit ended'); end if;
  if v.priority = mark_visit_priority.priority then return v; end if;
  update core.visits set priority = mark_visit_priority.priority where id = v.id returning * into v;
  perform core.change_visit(v, v.status, u, null, pg_catalog.jsonb_build_object('priority', v.priority));
  return v;
end $$;
grant execute on function public.mark_visit_priority(uuid, core.request_priority) to authenticated;
