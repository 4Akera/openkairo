-- 0038: calling is not seeing — a called patient who is not here keeps his place and can still be marked left;
-- he is seen at Done, or when he goes back to waiting with something written for him
\set org  '00000000-0000-0000-0000-0000000000a1'
\set gp   '00000000-0000-0000-0000-0000000000d1'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set p1   '00000000-0000-0000-0000-0000000000f1'
\set p2   '00000000-0000-0000-0000-0000000000f2'
\set p3   '00000000-0000-0000-0000-0000000000f3'
\set v1   '00000000-0000-0000-0000-0000000000a1'
\set v2   '00000000-0000-0000-0000-0000000000a2'
\set v3   '00000000-0000-0000-0000-0000000000a3'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr');
insert into core.departments (id, organization_id, type, name) values (:'gp', :'org', 'clinic', 'General Practice');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', :'gp');
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values
  (:'p1', :'org', 1, 'Mona', 'Saleh', 'female', '1970'), (:'p2', :'org', 2, 'Omar', 'Zaki', 'male', '1980'), (:'p3', :'org', 3, 'Hala', 'Nour', 'female', '1990');
set role authenticated;
select set_config('request.jwt.claim.sub', :'jdr', false);
select status from public.open_visit(:'v1', :'p1', :'gp');
select status from public.open_visit(:'v2', :'p2', :'gp');
select status from public.open_visit(:'v3', :'p3', :'gp');

\echo '── called, not here: not seen, a missed call, still waiting in his place, and he can be marked left'
select status from public.mark_visit(:'v1', 'waiting', 'in_consult');
select case when seen_at is null and called_at is not null then 'ok called is not seen' else 'FAIL seen on call' end from public.mark_visit(:'v1', 'in_consult', 'waiting', 'not_here');
select case when r->>'band' = 'waiting' and (r->>'missed_calls')::int = 1 then 'ok back in Waiting with a missed call' else 'FAIL ' || coalesce(r->>'band', '-') end
  from jsonb_array_elements(public.read_visit_queue(:'gp')->'rows') r where r->>'id' = :'v1';
select case when status = 'left' then 'ok an unseen patient can still be marked left' else 'FAIL' end from public.mark_visit(:'v1', 'waiting', 'left');

\echo '── called, vitals written, sent out: seen, and Back when he returns'
select status from public.mark_visit(:'v2', 'waiting', 'in_consult');
select display_line from public.write_vitals('00000000-0000-0000-0000-0000000000e1', :'p2', :'v2', :'gp', systolic := 150, diastolic := 95);
select case when seen_at is not null then 'ok seen: something was written for him' else 'FAIL not seen' end from public.mark_visit(:'v2', 'in_consult', 'waiting');
select case when r->>'band' = 'back' then 'ok Back means he came back' else 'FAIL ' || coalesce(r->>'band', '-') end
  from jsonb_array_elements(public.read_visit_queue(:'gp')->'rows') r where r->>'id' = :'v2';

\echo '── called and Done: seen'
select status from public.mark_visit(:'v3', 'waiting', 'in_consult');
select case when seen_at is not null and status = 'done' then 'ok seen at Done' else 'FAIL' end from public.mark_visit(:'v3', 'in_consult', 'done');
