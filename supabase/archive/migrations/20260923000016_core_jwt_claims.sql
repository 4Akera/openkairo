-- 0016 · PostgREST publishes the JWT as one JSON setting (request.jwt.claims); the per-claim settings the tests use stay as a fallback
create or replace function core.auth_uid() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;
create or replace function core.auth_aal() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.aal', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1')
$$;
