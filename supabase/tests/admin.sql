-- people, roles and deleting a mistake (ported from roles and deletes): a clinic's own roles, the last administrator, may with a null
-- department, deleting only what nothing ever used, services and presets retired through settings
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
set role authenticated;
select t.as(:'ow');

\echo '── the owner makes a Physiotherapist role: notes, vitals, problems, no medicines'
select t.ok(r ->> 'key' = 'physiotherapist' and jsonb_array_length(r -> 'actions') = 6, 'a role made') from public.save('role', jsonb_build_object('id', '00000000-0000-0000-0000-00000000e001', 'name', 'Physiotherapist',
  'actions', jsonb_build_array('write:note', 'write:vitals', 'write:problem', 'read:record', 'read:queue', 'read:patients'))) r;
select t.ok(exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'actions') a where a ->> 'key' = 'write:medication'), 'the actions a role can carry are listed');
select t.refuses($q$select public.save('role', '{"id":"00000000-0000-0000-0000-00000000c002","name":"Doctor","actions":["write:note"]}')$q$, 'builtin_role');
select t.refuses($q$select public.save('role', '{"id":"00000000-0000-0000-0000-00000000e002","name":"Odd","actions":["write:nothing"]}')$q$, 'unknown_action');

\echo '── the doctor holds it in Internal Medicine; the doctor cannot edit roles'
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e001', 'department_id', :'im')))) ->> 'id' as dr;
select t.as(:'dr');
select t.refuses($q$select public.save('role', '{"id":"00000000-0000-0000-0000-00000000e001","name":"Physio","actions":["write:note"]}')$q$, 'not_allowed');

\echo '── the owner retires it: taken from its holder; a new role of the same name gets a new key'
select t.as(:'ow');
select t.ok((r ->> 'unassigned')::int = 1, 'retired, taken from its holder') from public.save('role', '{"id":"00000000-0000-0000-0000-00000000e001","retired":true}') r;
select t.ok(r ->> 'key' = 'physiotherapist_1', 'a key is never reused') from public.save('role', '{"id":"00000000-0000-0000-0000-00000000e002","name":"Physiotherapist","actions":["write:note"]}') r;

\echo '── a role the owner holds cannot be edited by the owner; nobody edits their own holdings'
select t.ok(r ->> 'key' = 'boss', 'a Boss role') from public.save('role', '{"id":"00000000-0000-0000-0000-00000000e003","name":"Boss","actions":["manage:users","manage:roles"]}') r;
reset role;
insert into core.holdings (organization_id, user_id, role_id, department_id) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-00000000e003', null);
set role authenticated;
select t.refuses($q$select public.save('role', '{"id":"00000000-0000-0000-0000-00000000e003","name":"Boss","actions":["manage:users"]}')$q$, 'self_change');
select t.refuses($q$select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b9","holdings":[]}')$q$, 'self_change');

\echo '── nobody takes the last administrator''s rights away, not even a manage:users role'
select t.ok(r ->> 'key' = 'hr', 'an HR role (manage:users)') from public.save('role', '{"id":"00000000-0000-0000-0000-00000000e004","name":"HR","actions":["manage:users"]}') r;
select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b5","name":"HR","login_id":"11111111-0000-0000-0000-0000000000b5","holdings":[{"role_id":"00000000-0000-0000-0000-00000000e004","department_id":null}]}') ->> 'id' as hr;
reset role;
delete from core.holding_ends where holding_id in (select id from core.holdings where user_id = '00000000-0000-0000-0000-0000000000b9' and role_id = '00000000-0000-0000-0000-00000000e003');
insert into core.holding_ends (organization_id, holding_id) select organization_id, id from core.holdings where user_id = '00000000-0000-0000-0000-0000000000b9' and role_id = '00000000-0000-0000-0000-00000000e003';
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b5');
select t.refuses($q$select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b9","holdings":[]}')$q$, 'last_administrator');

\echo '── a role of another organization, or a retired one, cannot be given'
reset role;
insert into core.organizations (id, name) values ('00000000-0000-0000-0000-0000000000a2', 'Other');
insert into core.roles (id, organization_id, key, name) values ('00000000-0000-0000-0000-00000000e009', '00000000-0000-0000-0000-0000000000a2', 'theirs', 'Theirs');
set role authenticated;
select t.as(:'ow');
select t.refuses($q$select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b1","holdings":[{"role_id":"00000000-0000-0000-0000-00000000e009","department_id":null}]}')$q$, 'not_found');
select t.refuses($q$select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b1","holdings":[{"role_id":"00000000-0000-0000-0000-00000000e001","department_id":null}]}')$q$, 'not_found');

\echo '── may: a null department matches only roles held everywhere'
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000b1', 'write:note', :'im') and not core.may('00000000-0000-0000-0000-0000000000b1', 'write:note', null), 'a department role is not held "anywhere"');
select t.ok(core.may('00000000-0000-0000-0000-0000000000b9', 'write:pharmacy.dispense', null), 'the owner holds every action, a pack''s included');
select t.ok(core.may_somewhere('00000000-0000-0000-0000-0000000000b1', 'write:note'), 'may_somewhere answers "in any department"');
set role authenticated;

\echo '── delete a mistake: only what nothing ever used'
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'), 'department_id', :'labd', 'priority', 'routine', 'status', 'active'))), 'a CBC ordered');
select t.as(:'ow');
select public.save('department', '{"id":"00000000-0000-0000-0000-0000000000d9","name":"Genral Practise","work":"visits"}') ->> 'id' as typo;
select t.ok((r ->> 'deleted') = '00000000-0000-0000-0000-0000000000d9', 'the typo department is deleted') from public.remove('department', '00000000-0000-0000-0000-0000000000d9') r;
select t.refuses($q$select public.remove('department', '00000000-0000-0000-0000-0000000000d2')$q$, 'in_use');
select t.refuses($q$select public.remove('department', '00000000-0000-0000-0000-0000000000d1')$q$, 'in_use');
select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000bc","name":"Dr Aly (typo)"}') ->> 'id' as typo_user;
select t.ok((r ->> 'deleted') = '00000000-0000-0000-0000-0000000000bc', 'a user added by mistake who never signed in goes') from public.remove('user', '00000000-0000-0000-0000-0000000000bc') r;
select t.refuses($q$select public.remove('user', '00000000-0000-0000-0000-0000000000b1')$q$, 'in_use');
select t.refuses($q$select public.remove('user', '00000000-0000-0000-0000-0000000000b9')$q$, 'self_change');
select t.ok(public.save('role', '{"id":"00000000-0000-0000-0000-00000000e005","name":"Typo role","actions":["read:queue"]}') ->> 'key' = 'typo_role', 'a role nobody holds');
select t.ok((r ->> 'deleted') is not null, 'the unheld role is deleted') from public.remove('role', '00000000-0000-0000-0000-00000000e005') r;
select t.refuses($q$select public.remove('role', '00000000-0000-0000-0000-00000000c002')$q$, 'builtin_role');
select t.refuses($q$select public.remove('role', '00000000-0000-0000-0000-00000000e003')$q$, 'in_use');

\echo '── services and presets are settings: retired, never deleted; the history keeps the name; old orders keep theirs'
select public.write_setting('{"key":"service","owner_id":"00000000-0000-0000-0000-0000000000d2","thing_id":"00000000-0000-0000-0000-0000000000c9","data":{"code":"cbcc","name":"Complete blod count","answer":"result"}}') ->> 'key' as typo_service;
select public.write_setting('{"key":"service","owner_id":"00000000-0000-0000-0000-0000000000d2","thing_id":"00000000-0000-0000-0000-0000000000c9","retired":true}') ->> 'key' as retired;
select t.ok(not exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'thing_id' = '00000000-0000-0000-0000-0000000000c9'), 'the retired service is gone from the lists');
select t.ok(exists (select 1 from jsonb_array_elements(public.read('{"shape":"audit"}') -> 'changes') c where c ->> 'thing_id' = '00000000-0000-0000-0000-0000000000c9' and c -> 'before' ->> 'name' = 'Complete blod count'),
  'the change log keeps its name');
select public.write_setting('{"key":"service","owner_id":"00000000-0000-0000-0000-0000000000d2","thing_id":"00000000-0000-0000-0000-0000000000c1","retired":true}') ->> 'key' as cbc_retired;
select t.as(:'dr');
select t.ok(exists (select 1 from jsonb_array_elements(t.record(:'pt', :'im') -> 'entries') e where e ->> 'line' = 'Complete blood count'), 'the order in the record still reads its name');
select t.refused(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'CBC'), 'department_id', :'labd', 'priority', 'routine', 'status', 'active'))),
  'unknown_service', 'a retired service cannot be ordered');

\echo '── a clinic with a login in two organizations: the session chooses'
reset role;
insert into core.users (organization_id, id, login_id, kind, name) values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c9', :'dr', 'staff', 'Dr Ali at Other');
set role authenticated;
select t.as(:'dr');
select t.refuses($q$select public.read('{"shape":"me"}')$q$, 'choose_user');
select set_config('request.jwt.claim.session_id', '00000000-0000-0000-0000-00000000555e', false);
select t.ok(public.choose_user('00000000-0000-0000-0000-0000000000b1') ->> 'organization_id' = '00000000-0000-0000-0000-0000000000a1', 'chosen');
select t.ok(public.read('{"shape":"me"}') -> 'organization' ->> 'name' = 'Demo' and jsonb_array_length(public.read('{"shape":"me"}') -> 'users_of_login') = 2, 'the session is Demo; the login has two users');
select t.refuses($q$select public.choose_user('00000000-0000-0000-0000-0000000000b9')$q$, 'not_found');
