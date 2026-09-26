-- test helpers (spec 08 K1), loaded before every suite by scripts/db-test.sh. A suite prints lines; the runner fails the run on
-- any line starting with FAIL and on any ERROR its `-- expects:` line does not name. Rerunnable: `if not exists`, `or replace`.
create schema if not exists t;
grant usage on schema t to public;

-- run one statement; 'ok', or '<sqlstate> <message>' when it raises (a refusal's message is its code, core.refuse)
create or replace function t.try(sql text) returns text language plpgsql as $$
begin
  execute sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- one check, one line: 'ok <what>' or 'FAIL <what>'; a NULL result is a failure, never a pass
create or replace function t.ok(pass boolean, what text) returns text language sql as $$
  select case when pass then 'ok ' else 'FAIL ' end || coalesce(what, '(no label)')
$$;

-- a statement must be refused with this code (the message core.refuse raises); anything else, success included, fails
create or replace function t.refuses(sql text, code text) returns text language plpgsql as $$
declare got text := t.try(sql); c text := coalesce(code, '(null)');
begin
  return case when code is not null and (got like 'P0001 ' || code || '%' or got like '% ' || code || '%') then 'ok refused ' || c
              else 'FAIL expected ' || c || ', got ' || got end;
end $$;

-- a violation already on the plan: it prints 'known … (<row>)' instead of FAIL until the named kit row fixes it
create table if not exists t.known_list (test text not null, what text not null, fixed_by text not null);
grant select on t.known_list to public;
create or replace function t.known(test text, what text, fixed_by text) returns void language sql as $$
  insert into t.known_list (test, what, fixed_by) values (test, what, fixed_by)
$$;
-- 'known …' when a known pattern covers it, else 'FAIL …'
create or replace function t.report(test text, what text) returns text language sql stable as $$
  select coalesce((select 'known ' || test || ': ' || coalesce(report.what, '(null)') || ' (' || k.fixed_by || ')' from t.known_list k
                   where k.test = report.test and report.what like k.what limit 1), 'FAIL ' || test || ': ' || coalesce(report.what, '(null)'))
$$;
-- a privilege the role holds only through grants made by a role we are not a member of (the host), so it cannot be revoked here
create or replace function t.host_granted(acl aclitem[], owner oid, kind "char", priv text, grantee oid) returns boolean language sql stable as $$
  select coalesce(bool_and(not pg_has_role(current_user, a.grantor, 'MEMBER')), false)
  from aclexplode(coalesce(acl, acldefault(kind, owner))) a
  where a.privilege_type = priv and case when a.grantee = 0 then true else pg_has_role(host_granted.grantee, a.grantee, 'USAGE') end
$$;
grant execute on all functions in schema t to public;
