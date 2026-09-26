-- 0036: delete a mistake — only what nothing ever used; anything used is refused (in_use) and stays to be retired
\set org  '00000000-0000-0000-0000-0000000000a1'
\set gp   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set typo '00000000-0000-0000-0000-0000000000d9'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set ow   '00000000-0000-0000-0000-0000000000b9'
\set nw   '00000000-0000-0000-0000-0000000000b5'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set jow  '11111111-0000-0000-0000-0000000000b9'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set oops '00000000-0000-0000-0000-0000000000c9'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr'), (:'ow', :'org', 'staff', 'Owner', :'jow');
insert into core.users (id, organization_id, kind, name) values (:'nw', :'org', 'staff', 'Dr Aly (typo)');
insert into core.departments (id, organization_id, type, name) values (:'gp', :'org', 'clinic', 'General Practice'), (:'labd', :'org', 'ancillary', 'Lab'), (:'typo', :'org', 'clinic', 'Genral Practise');
insert into core.served_departments (department_id, served_department_id) values (:'labd', null), (:'typo', null);
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'gp'), (:'org', :'ow', '00000000-0000-0000-0000-00000000c001', null),
  (:'org', :'nw', '00000000-0000-0000-0000-00000000c002', :'gp');
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values (:'pt', :'org', 1, 'Ahmed', 'Hassan', 'male', '1968-03-14');
insert into core.services (id, organization_id, department_id, code, name) values (:'cbc', :'org', :'labd', 'cbc', 'Complete blood count'), (:'oops', :'org', :'labd', 'cbcc', 'Complete blod count');
set role authenticated;

\echo '── the doctor orders a CBC: the service is in the record now'
select set_config('request.jwt.claim.sub', :'jdr', false);
select type from public.write_set(:'gp', jsonb_build_array(jsonb_build_object('function', 'write_request', 'params', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e1', 'patient_id', :'pt', 'service_id', :'cbc', 'priority', 'routine'))));

select set_config('request.jwt.claim.sub', :'jow', false);
\echo '── a typo nobody used goes; the service in the record stays'
select case when (r->>'deleted') = :'oops' then 'ok the typo service is deleted' else 'FAIL' end from public.delete_service(:'oops') r;
reset role;
select case when exists (select 1 from core.settings_changes c where c.row_id = :'oops' and c.changes->>'deleted' = 'true' and c.changes->>'name' = 'Complete blod count') then 'ok the change log keeps its name' else 'FAIL log' end;
set role authenticated;
do $$ begin perform public.delete_service('00000000-0000-0000-0000-0000000000c1'); raise notice 'FAIL a used service was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'in_use' then 'ok refused: the CBC is in the record' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── a preset holding a service keeps it; the preset itself can always go'
select name from public.save_template('00000000-0000-0000-0000-00000000e101', :'org', 'Anaemia', '[{"service_id":"00000000-0000-0000-0000-0000000000c1"}]');
reset role;
insert into core.services (id, organization_id, department_id, code, name) values ('00000000-0000-0000-0000-0000000000c8', :'org', :'labd', 'ferr', 'Ferritin');
set role authenticated;
select name from public.save_template('00000000-0000-0000-0000-00000000e102', :'org', 'Iron', '[{"service_id":"00000000-0000-0000-0000-0000000000c8"}]');
do $$ begin perform public.delete_service('00000000-0000-0000-0000-0000000000c8'); raise notice 'FAIL a service in a preset was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'in_use' then 'ok refused: Ferritin is in a preset' else 'FAIL refused with ' || sqlerrm end; end $$;
select case when (r->>'deleted') is not null then 'ok the preset is deleted' else 'FAIL' end from public.delete_template('00000000-0000-0000-0000-00000000e102') r;
select case when (r->>'deleted') is not null then 'ok then Ferritin can go' else 'FAIL' end from public.delete_service('00000000-0000-0000-0000-0000000000c8') r;

\echo '── a misspelt department nobody worked in goes (its serving link with it); one with services or people stays'
select case when (r->>'deleted') = :'typo' then 'ok the typo department is deleted' else 'FAIL' end from public.delete_department(:'typo') r;
reset role;
select case when not exists (select 1 from core.served_departments where department_id = :'typo') then 'ok its serving link went with it' else 'FAIL link left' end;
set role authenticated;
do $$ begin perform public.delete_department('00000000-0000-0000-0000-0000000000d2'); raise notice 'FAIL a department with services was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'in_use' then 'ok refused: the Lab has services' else 'FAIL refused with ' || sqlerrm end; end $$;
do $$ begin perform public.delete_department('00000000-0000-0000-0000-0000000000d1'); raise notice 'FAIL a department people work in was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'in_use' then 'ok refused: people hold roles in General Practice' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── people: one added by mistake who never signed in goes; one who signed in, or yourself, stays'
select case when (r->>'deleted') = :'nw' then 'ok the typo user is deleted' else 'FAIL' end from public.delete_user(:'nw') r;
reset role;
select case when not exists (select 1 from core.user_roles where user_id = :'nw') then 'ok their roles went with them' else 'FAIL roles left' end;
set role authenticated;
do $$ begin perform public.delete_user('00000000-0000-0000-0000-0000000000b1'); raise notice 'FAIL a user who signed in was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'in_use' then 'ok refused: Dr Ali has signed in' else 'FAIL refused with ' || sqlerrm end; end $$;
do $$ begin perform public.delete_user('00000000-0000-0000-0000-0000000000b9'); raise notice 'FAIL the owner deleted themselves';
  exception when others then raise notice '%', case when sqlerrm = 'self_change' then 'ok refused: not yourself' else 'FAIL refused with ' || sqlerrm end; end $$;

\echo '── roles: one nobody holds goes; a held one or a built-in one stays'
select case when (r->>'key') = 'typo_role' then 'ok a role nobody holds' else 'FAIL' end from public.save_role('00000000-0000-0000-0000-00000000e201', :'org', 'Typo role', array['read:queue']) r;
select case when (r->>'deleted') is not null then 'ok the unheld role is deleted' else 'FAIL' end from public.delete_role('00000000-0000-0000-0000-00000000e201') r;
do $$ begin perform public.delete_role('00000000-0000-0000-0000-00000000c002'); raise notice 'FAIL a built-in role was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'builtin_role' then 'ok refused: built-in' else 'FAIL refused with ' || sqlerrm end; end $$;
select case when (r->>'key') = 'held' then 'ok a role someone holds' else 'FAIL' end from public.save_role('00000000-0000-0000-0000-00000000e202', :'org', 'Held', array['read:queue']) r;
reset role;
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000e202', :'gp');
set role authenticated;
do $$ begin perform public.delete_role('00000000-0000-0000-0000-00000000e202'); raise notice 'FAIL a held role was deleted';
  exception when others then raise notice '%', case when sqlerrm = 'in_use' then 'ok refused: someone holds it' else 'FAIL refused with ' || sqlerrm end; end $$;
