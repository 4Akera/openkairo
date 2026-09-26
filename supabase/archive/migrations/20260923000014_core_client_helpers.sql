-- 0014 · what the client needs on first contact: which organization am I in; realtime channel policy
create or replace function public.my_organization() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from core.users where login_id = core.auth_uid() and (retired_at is null or retired_at > pg_catalog.now()) order by accepted_at nulls last limit 1
$$;
grant execute on function public.my_organization() to authenticated;

-- private broadcast channels (spec 02): queue:<department> for members of the organization; record:<patient> for those who may read it
do $$ begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute $p$
      create policy opencare_channels on realtime.messages for select to authenticated using (
        exists (select 1 from core.users u where u.login_id = core.auth_uid() and (u.retired_at is null or u.retired_at > now())
          and ((realtime.topic() like 'queue:%' and exists (select 1 from core.departments d where d.id::text = substr(realtime.topic(), 7) and d.organization_id = u.organization_id))
            or (realtime.topic() like 'record:%' and exists (select 1 from core.patients p where p.id::text = substr(realtime.topic(), 8) and p.organization_id = u.organization_id))))
      )$p$;
  end if;
end $$;
