-- 0033: a clinic's own roles — copy a built-in role and choose its actions; built-in roles stay read-only; nobody edits a role they hold
\set org  '00000000-0000-0000-0000-0000000000a1'
\set gp   '00000000-0000-0000-0000-0000000000d1'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set ow   '00000000-0000-0000-0000-0000000000b9'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jow  '11111111-0000-0000-0000-0000000000b9'
\set physio '00000000-0000-0000-0000-00000000e001'
\set again  '00000000-0000-0000-0000-00000000e002'
\set boss   '00000000-0000-0000-0000-00000000e003'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'ow', :'org', 'staff', 'Owner', :'jow');
insert into core.departments (id, organization_id, type, name) values (:'gp', :'org', 'clinic', 'General Practice');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'gp'), (:'org', :'ow', '00000000-0000-0000-0000-00000000c001', null);
set role authenticated;
select set_config('request.jwt.claim.sub', :'jow', false);

\echo '── the owner makes a Physiotherapist role: notes, vitals, problems, no prescriptions'
select case when r->>'key' = 'physiotherapist' and jsonb_array_length(r->'actions') = 7 then 'ok role made' else 'FAIL ' || r::text end
  from public.save_role(:'physio', :'org', 'Physiotherapist', array['write:note','write:vitals','write:problem','read:record','read:queue','read:patient','read:organization']) r;
select case when exists (select 1 from jsonb_array_elements(public.read_actions(:'org')) a where a->>'key' = 'write:prescription') then 'ok the actions a role can carry are listed' else 'FAIL read_actions' end;
\echo '── refused: a built-in role, an unknown action'
do $$ begin perform public.save_role('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000a1', 'Doctor', array['write:note']); raise notice 'FAIL a built-in role was edited';
  exception when others then raise notice '%', case when sqlerrm = 'builtin_role' then 'ok refused builtin_role' else 'FAIL refused with ' || sqlerrm end; end $$;
do $$ begin perform public.save_role('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000a1', 'Odd', array['write:nothing']); raise notice 'FAIL an unknown action was saved';
  exception when others then raise notice '%', case when sqlerrm = 'unknown_action' then 'ok refused unknown_action' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── the doctor holds it in General Practice; the doctor cannot edit roles'
reset role;
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', :'physio', :'gp');
set role authenticated;
select set_config('request.jwt.claim.sub', :'jdr', false);
do $$ begin perform public.save_role('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 'Physio', array['write:note']); raise notice 'FAIL the doctor edited a role';
  exception when others then raise notice '%', case when sqlerrm = 'not_allowed' then 'ok refused not_allowed' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── the owner retires it: the doctor no longer holds it; a new role of the same name gets a new key'
select set_config('request.jwt.claim.sub', :'jow', false);
select case when (r->>'unassigned')::int = 1 then 'ok retired, taken from its holder' else 'FAIL ' || r::text end from public.retire_role(:'physio') r;
select case when r->>'key' = 'physiotherapist_1' then 'ok a key is never reused' else 'FAIL key ' || (r->>'key') end
  from public.save_role(:'again', :'org', 'Physiotherapist', array['write:note']) r;

\echo '── a role the owner holds cannot be edited by the owner'
select case when r->>'key' = 'boss' then 'ok manage: actions granted by one who holds them' else 'FAIL' end
  from public.save_role(:'boss', :'org', 'Boss', array['manage:users','manage:roles','read:organization']) r;
reset role;
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'ow', :'boss', null);
set role authenticated;
do $$ begin perform public.save_role('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000a1', 'Boss', array['read:organization']); raise notice 'FAIL the owner edited a role they hold';
  exception when others then raise notice '%', case when sqlerrm = 'self_change' then 'ok refused self_change' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── 0035: nobody takes the last administrator\'s rights away, not even a manage:users role'
reset role;
delete from core.user_roles where user_id = :'ow' and role_id = :'boss';
insert into core.users (id, organization_id, kind, name, login_id) values ('00000000-0000-0000-0000-0000000000b7', :'org', 'staff', 'HR', '11111111-0000-0000-0000-0000000000b7');
set role authenticated;
select set_config('request.jwt.claim.sub', :'jow', false);
select case when r->>'key' = 'hr' then 'ok an HR role (manage:users only)' else 'FAIL' end from public.save_role('00000000-0000-0000-0000-00000000e004', :'org', 'HR', array['manage:users','read:organization']) r;
reset role;
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', '00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-00000000e004', null);
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-0000000000b7', false);
do $$ begin perform public.save_user('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000a1', 'staff', 'Owner', null, '[]'::jsonb); raise notice 'FAIL HR stripped the owner';
  exception when others then raise notice '%', case when sqlerrm = 'last_administrator' then 'ok refused last_administrator' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── 0035: a role of another organization, or a retired one, cannot be given'
reset role;
insert into core.organizations (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'Other');
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000e009', '00000000-0000-0000-0000-0000000000a2', 'theirs', 'Theirs');
set role authenticated;
select set_config('request.jwt.claim.sub', :'jow', false);
do $$ begin perform public.save_user('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'staff', 'Dr Ali', null, '[{"role_id":"00000000-0000-0000-0000-00000000e009","department_id":null}]'::jsonb); raise notice 'FAIL another organization''s role was given';
  exception when others then raise notice '%', case when sqlerrm = 'not_found' then 'ok refused a role of another organization' else 'FAIL refused with ' || sqlerrm end; end $$;
do $$ begin perform public.save_user('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'staff', 'Dr Ali', null, '[{"role_id":"00000000-0000-0000-0000-00000000e001","department_id":null}]'::jsonb); raise notice 'FAIL a retired role was given';
  exception when others then raise notice '%', case when sqlerrm = 'not_found' then 'ok refused a retired role' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── 0035: an administrator may hold the two rights on two roles'
reset role;
delete from core.user_roles where user_id = :'ow';
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000e005', :'org', 'keeper', 'Role keeper');
insert into core.role_actions (role_id, action) values ('00000000-0000-0000-0000-00000000e005', 'manage:roles');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', '00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-00000000e005', null);
do $$ begin perform core.require_last_administrator('00000000-0000-0000-0000-0000000000a1'); raise notice 'ok HR + Role keeper on one person is an administrator';
  exception when others then raise notice 'FAIL split rights refused: %', sqlerrm; end $$;
