-- 0013 · the runner, the sweep, cron, the RLS backstop, revocations (specs 01, 02, 03)
create extension if not exists pg_cron;

-- one due call, locked, tries counted; NULL when nothing is due
create or replace function core.next_pack_call() returns table (pack text, entry_id uuid, organization_id uuid, entry core.entries)
language plpgsql security definer set search_path = '' as $$
declare c core.pack_calls;
begin
  select * into c from core.pack_calls pc
    where pc.tries < 5 and (pc.tried_at is null or pc.tried_at + (interval '1 minute' * least(60, 2 ^ pc.tries)) < pg_catalog.now())
      and exists (select 1 from core.organization_packs op where op.organization_id = pc.organization_id and op.pack = pc.pack and op.retired_at is null)
    order by pc.recorded_at limit 1 for update skip locked;
  if not found then return; end if;
  update core.pack_calls set tries = tries + 1, tried_at = pg_catalog.now() where pack_calls.pack = c.pack and pack_calls.entry_id = c.entry_id;
  return query select c.pack, c.entry_id, c.organization_id, e from core.entries e where e.id = c.entry_id;
  if not found then delete from core.pack_calls where pack_calls.pack = c.pack and pack_calls.entry_id = c.entry_id; end if;
end $$;

create or replace function core.finish_pack_call(p_pack text, p_entry_id uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_error is null then delete from core.pack_calls where pack = p_pack and entry_id = p_entry_id;
  else update core.pack_calls set error_text = left(p_error, 2000) where pack = p_pack and entry_id = p_entry_id; end if;
end $$;

-- one call: the pack's reaction under a timeout, as the pack's own user; returns NULL or the error text.
-- The exception block is a savepoint, so a failing pack leaves nothing behind.
create or replace function core.run_one_pack_call(p_pack text, p_organization_id uuid, p_entry core.entries) returns text
language plpgsql security definer set search_path = '' as $$
declare pu uuid;
begin
  select id into pu from core.users where users.organization_id = p_organization_id and kind = 'pack' and name = p_pack;
  perform pg_catalog.set_config('opencare.acting_user_id', coalesce(pu::text, ''), true);
  perform pg_catalog.set_config('lock_timeout', '2s', true);   -- applies to every lock wait from here on
  -- statement_timeout cannot be armed from inside a running statement: it is set on the cron job below,
  -- so a pack that hangs holds one runner invocation for at most that long; tries are counted before
  -- the call, so a hanging pack is parked after five invocations without ever touching a write.
  execute pg_catalog.format('select %I.after_write($1)', p_pack) using p_entry;
  return null;
exception when others then
  return sqlerrm;
end $$;

-- the runner: every 5 s; each call in its own transaction
create or replace procedure core.run_pack_calls() language plpgsql as $$   -- no SET clause: a procedure that commits may not carry one
declare c record; err text; n int := 0;
begin
  loop
    select * into c from core.next_pack_call();
    if c.pack is null then exit; end if;
    commit;
    err := core.run_one_pack_call(c.pack, c.organization_id, c.entry);
    perform core.finish_pack_call(c.pack, c.entry_id, err);
    commit;
    n := n + 1; if n >= 200 then exit; end if;
  end loop;
end $$;

-- a parked or failed retry can be re-queued by the organization
create or replace function public.retry_pack_calls(organization_id uuid, pack text) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform core.require_access(organization_id, 'manage:organization', null, null);
  update core.pack_calls set tries = 0, tried_at = null, error_text = null where pack_calls.organization_id = retry_pack_calls.organization_id and pack_calls.pack = retry_pack_calls.pack and tries >= 5;
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.retry_pack_calls(uuid, text) to authenticated;

-- cron: runner, sweep, watchdog (a runner backend older than 2 min is ended)
select cron.schedule('opencare_runner', '5 seconds', $$set statement_timeout = '55s'; call core.run_pack_calls()$$);
select cron.schedule('opencare_sweep',  '7 * * * *',  'select core.sweep_visits()');
select cron.schedule('opencare_watchdog', '* * * * *',
  $$select pg_terminate_backend(pid) from pg_stat_activity where query like '%core.run_pack_calls()%' and state <> 'idle' and now() - query_start > interval '2 minutes'$$);
delete from cron.job_run_details where 1 = 0;   -- keep the table referenced so a missing pg_cron fails here, not at 3 a.m.

-- the RLS backstop: every core table locked to the API roles; functions are the only door
do $$ declare t text; begin
  for t in select tablename from pg_catalog.pg_tables where schemaname = 'core' loop
    execute pg_catalog.format('alter table core.%I enable row level security', t);
    execute pg_catalog.format('revoke all on core.%I from authenticated, anon', t);
  end loop;
end $$;
revoke all on all sequences in schema core from authenticated, anon;

-- no pack may take the record lock: advisory locks leave PUBLIC (fallback: the runner's timeout and the static scan)
do $$ begin
  begin
    revoke execute on function pg_catalog.pg_advisory_xact_lock(bigint), pg_catalog.pg_advisory_lock(bigint), pg_catalog.pg_try_advisory_lock(bigint),
      pg_catalog.pg_try_advisory_xact_lock(bigint), pg_catalog.pg_advisory_xact_lock(int, int), pg_catalog.pg_advisory_lock(int, int) from public;
  exception when others then raise notice 'advisory revoke not permitted on this host: %', sqlerrm;
  end;
end $$;

-- erase: the one delete path (spec 01/03), service_role only
create or replace function public.erase_patient(patient_id uuid, reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; sv uuid;
begin
  if coalesce(reason, '') = '' then perform core.refuse('reason_missing'); end if;
  sv := core.survivor(patient_id);
  select pg_catalog.array_agg(id) into ids from core.patients where id = sv or merged_into_id = sv;
  perform pg_catalog.set_config('opencare.erasing', 'true', true);
  delete from core.drafts where drafts.patient_id = any(ids);
  delete from core.entry_values where entry_values.patient_id = any(ids);
  delete from core.entry_files f using core.entries e where f.entry_id = e.id and e.patient_id = any(ids);
  delete from core.request_steps s using core.entries e where s.request_id = e.id and e.patient_id = any(ids);
  delete from core.requests where requests.patient_id = any(ids);
  delete from core.pack_calls pc using core.entries e where pc.entry_id = e.id and e.patient_id = any(ids);
  delete from core.patient_medications where patient_medications.patient_id = any(ids);
  delete from core.patient_problems where patient_problems.patient_id = any(ids);
  delete from core.patient_allergies where patient_allergies.patient_id = any(ids);
  delete from core.patient_list_reviews where patient_list_reviews.patient_id = any(ids);
  delete from core.record_reads where record_reads.patient_id = any(ids);
  delete from core.entries where entries.patient_id = any(ids);
  delete from core.patient_changes where patient_changes.patient_id = any(ids);
  delete from core.visit_steps s using core.visits v where s.visit_id = v.id and v.patient_id = any(ids);
  delete from core.visits where visits.patient_id = any(ids);
  delete from core.patient_identifiers where patient_identifiers.patient_id = any(ids);
  delete from core.patients where id = any(ids);
  insert into core.erasures (patient_id, reason, actor_id) values (sv, reason, coalesce(core.auth_uid(), '00000000-0000-0000-0000-000000000000'));
end $$;
revoke all on function public.erase_patient(uuid, text) from public, authenticated, anon;
grant execute on function public.erase_patient(uuid, text) to service_role;
