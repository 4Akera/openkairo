-- 10 · core: the guardrails that run (spec/openCare.md §8) and the jobs: rebuild = live, the outbox drain, the files bucket.

set client_min_messages = warning;

-- rebuild = live (§8.1): recompute every registered table from entries (refreshes only, never checks), compare row by row, undo.
-- Returns one row per table that differs, with the rows only in live and only in the rebuild.
create function core.rebuild_check(p_org uuid default null) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare d core.derived; o uuid; before jsonb := '{}'; after jsonb := '{}'; v jsonb; items uuid[]; out jsonb := '[]';
begin
  for d in select * from core.derived order by position loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]'') from %s x where $1 is null or x.organization_id = $1', d.relation) into v using p_org;
    before := before || jsonb_build_object(d.key, v);
  end loop;
  begin
    -- a pack off for a clinic is not rebuilt there (§5.2 Off): its rows stay as they were
    for o in select id from core.organizations where p_org is null or id = p_org loop
      for d in select * from core.derived x where core.layer_on(o, x.layer) order by position loop
        execute format('delete from %s x where x.organization_id = $1', d.relation) using o;
      end loop;
      select coalesce(array_agg(distinct e.item), '{}') into items from core.entries e where e.organization_id = o;
      for d in select * from core.derived x where core.layer_on(o, x.layer) order by (x.layer <> 'base'), x.position loop
        perform core.run_refresh(d.refresh, o, items);
      end loop;
    end loop;
    for d in select * from core.derived order by position loop
      execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]'') from %s x where $1 is null or x.organization_id = $1', d.relation) into v using p_org;
      after := after || jsonb_build_object(d.key, v);
    end loop;
    raise exception 'undo the rebuild' using errcode = 'P0002';
  exception when sqlstate 'P0002' then null;
  end;
  for d in select * from core.derived order by position loop
    v := jsonb_build_object('table', d.key,
      'only_live', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_array_elements(before -> d.key) x except select jsonb_array_elements(after -> d.key)) q),
      'only_rebuilt', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_array_elements(after -> d.key) x except select jsonb_array_elements(before -> d.key)) q));
    if jsonb_array_length(v -> 'only_live') > 0 or jsonb_array_length(v -> 'only_rebuilt') > 0 then out := out || jsonb_build_array(v); end if;
  end loop;
  return out;
end $$;

-- the files bucket (§3.6): private; reading asks the reader's question; writing needs the organization and patient in the path
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
create function core.may_upload_file(p_object text) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare me core.users; parts text[] := string_to_array(p_object, '/');
begin
  begin me := core.me(); exception when others then return false; end;
  return cardinality(parts) = 3 and parts[1] = me.organization_id::text and parts[3] ~ '^[0-9a-f]{64}$'
     and exists (select 1 from core.patients p where p.organization_id = me.organization_id and p.id::text = parts[2]);
end $$;
grant execute on function core.may_read_file(text), core.may_upload_file(text) to authenticated;
do $$ begin
  execute 'drop policy if exists opencare_files_read on storage.objects';
  execute 'drop policy if exists opencare_files_write on storage.objects';
  execute 'create policy opencare_files_read on storage.objects for select to authenticated using (bucket_id = ''files'' and core.may_read_file(name))';
  execute 'create policy opencare_files_write on storage.objects for insert to authenticated with check (bucket_id = ''files'' and core.may_upload_file(name))';
exception when insufficient_privilege then raise notice 'storage policies need the storage owner: %', sqlerrm;
end $$;

-- a file never signed into an entry is removed after a day
create function core.sweep_files() returns int language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects o where o.bucket_id = 'files' and o.created_at < now() - interval '1 day'
    and not exists (select 1 from core.file_uses f where f.organization_id::text = split_part(o.name, '/', 1) and f.sha256 = split_part(o.name, '/', 3));
  get diagnostics n = row_count;
  return n;
end $$;
grant select, delete on storage.objects to postgres;

-- the jobs: pack listeners after commit (every 5 s), unsigned files (daily). The outbox job is a lone CALL: a command of two statements
-- runs as one transaction block, where the procedure's COMMIT per batch is refused (it sets its own statement timeout instead)
select cron.schedule('opencare_outbox', '5 seconds', 'call core.drain_outbox()');
select cron.schedule('opencare_files', '17 3 * * *', 'select core.sweep_files()');

revoke all on function core.rebuild_check(uuid), core.sweep_files() from public, anon, authenticated;
