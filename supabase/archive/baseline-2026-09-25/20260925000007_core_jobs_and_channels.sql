-- 07 · core: scheduled jobs (pg_cron) and who may listen on the live channels.

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

-- the pack runner every 5 s, the visit sweep hourly, and a watchdog for a runner stuck past two minutes (spec 01, spec 03)
select cron.schedule('opencare_runner', '5 seconds', $$set statement_timeout = '55s'; call core.run_pack_calls()$$);
select cron.schedule('opencare_sweep',  '7 * * * *',  'select core.sweep_visits()');
select cron.schedule('opencare_watchdog', '* * * * *',
  $$select pg_terminate_backend(pid) from pg_stat_activity where query like '%core.run_pack_calls()%' and state <> 'idle' and now() - query_start > interval '2 minutes'$$);

-- the live channels: a definer function answers, because the check reads core tables `authenticated` cannot; a record channel also
-- needs an opened record (spec 07)
do $$ begin
  if exists (select 1 from pg_catalog.pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute 'drop policy if exists opencare_channels on realtime.messages';
    execute 'create policy opencare_channels on realtime.messages for select to authenticated using (core.may_listen(realtime.topic()))';
  end if;
end $$;

