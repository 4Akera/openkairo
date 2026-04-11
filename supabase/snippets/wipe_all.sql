-- ============================================================
-- OpenKairo — Full Wipe
-- Removes ALL data including auth users and configuration.
-- After running this, re-run schema.sql then seed_demo.sql.
-- ============================================================

-- Truncate every base table in `public` in one statement so PostgreSQL can
-- resolve FK order (including self-referential and cross-table links).
-- New tables added to schema.sql are picked up automatically on the next wipe.
do $$
declare
  stmt text;
begin
  select 'truncate table '
         || string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
         || ' restart identity cascade'
  into stmt
  from pg_tables
  where schemaname = 'public';

  if stmt is not null and stmt like 'truncate table %' then
    execute stmt;
  end if;
end $$;

-- Storage objects in all app buckets
-- NOTE: Supabase blocks direct SQL deletes on storage.objects via a trigger.
-- Files must be cleared via the Supabase Dashboard → Storage, or the JS client.
-- They become inaccessible once auth.users is wiped, so this is safe to skip.


-- Auth users (identities). `profiles` and `user_roles` are already empty from
-- the truncate above; any stragglers with ON DELETE CASCADE are cleaned up here.
delete from auth.users;
