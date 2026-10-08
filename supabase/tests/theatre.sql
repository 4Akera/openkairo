-- the theatre pack (spec §5.7): the operation, its own type on the base's order to the Theatre (written with write:order wherever the
-- surgeon orders from), its words kept for the list; the Theatre's steps on it (the pack's step: scheduled with its room and time, sent
-- for, the anaesthetic, operating, recovery, back, which ends it), a step the service does not have refused; the WHO checklist's parts
-- about the operation, kept for the list; its FHIR beside the base's; the theatre nurse; off, no new operation
\set im   '00000000-0000-0000-0000-0000000000d1'
\set th   '00000000-0000-0000-0000-0000000000e3'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set tn   '11111111-0000-0000-0000-0000000000e3'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["theatre"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'theatre.department', 'department_id', :'th', 'name', 'Theatre', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e3', 'name', 'Iman', 'login_id', :'tn', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ea01', 'department_id', :'th')))) ->> 'id' as nurse;
create temp table svc as select core.setup_id(:'th', 'service', 'ihr_mesh') id;
grant select on svc to authenticated;
create function pg_temp.op(p_id uuid, p_words jsonb, p_priority text default 'routine') returns jsonb language sql as $$
  select t.e('theatre.op', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('service', jsonb_build_object(
    'id', (select id from svc), 'code', 'ihr_mesh', 'name', 'Inguinal hernia repair, open mesh (Lichtenstein)'),
    'department_id', '00000000-0000-0000-0000-0000000000e3', 'priority', p_priority, 'status', 'active', 'theatre', p_words), p_id)
$$;
create function pg_temp.step(p_key text, p_after uuid, p_rel text, p_id uuid, p_status text default 'in-progress') returns jsonb language sql as $$
  select t.e('theatre.step', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e3', jsonb_build_object('status', p_status, 'step', p_key,
    'theatre', jsonb_build_object('op', '00000000-0000-0000-0000-00000000a501', 'room', 'Theatre 1', 'starts', (current_date + 1)::timestamptz + interval '8 hours 30 minutes', 'position', 0)), p_id, null, p_after, p_rel)
$$;
set role authenticated;

\echo '── the operation: the base''s order with theatre''s words, from Internal Medicine (the Theatre works for every department)'
select t.as(:'dr');
select t.landed(t.w(pg_temp.op('00000000-0000-0000-0000-00000000a501', '{"side":"right","technique":"spinal","stay":"day","surgeon":"Dr. Hesham","usual_min":60,"risks":["bleeding","the hernia comes back"]}')), 'a hernia repair, right, day case');
select t.refused(t.w(pg_temp.op(null, '{"side":"up"}')), 'bad_shape', 'a side is left, right, both or none');
select t.as(:'tn');
select t.ok((select r ->> 'side' = 'right' and r ->> 'stay' = 'day' and (r ->> 'usual_min')::int = 60 and (r ->> 'risks')::int = 2
  from t.rows('theatre.cases', :'th', jsonb_build_object('item', '00000000-0000-0000-0000-00000000a501')) r), 'kept for the list: the side, the stay, the usual time, two risks told');

\echo '── the Theatre''s steps: scheduled with its room and time, then each key changes the one before; Back ends it'
select t.landed(t.w(pg_temp.step('scheduled', '00000000-0000-0000-0000-00000000a501', 'answers', '00000000-0000-0000-0000-00000000a511')), 'scheduled');
select t.ok((select r ->> 'room' = 'Theatre 1' and r ->> 'step' = 'scheduled' from t.rows('theatre.slots', :'th', jsonb_build_object('op', '00000000-0000-0000-0000-00000000a501')) r), 'its room and time kept');
select t.refused(t.w(pg_temp.step('teatime', '00000000-0000-0000-0000-00000000a511', 'changes', null)), 'unknown_step', 'a step the operation''s service does not have');
select t.landed(t.w(pg_temp.step('sent_for', '00000000-0000-0000-0000-00000000a511', 'changes', '00000000-0000-0000-0000-00000000a512')), 'sent for');
select t.landed(t.w(t.e('theatre.check', :'pt', :'th', '{"op":"00000000-0000-0000-0000-00000000a501","part":"sign_in","items":[{"key":"identity","text":"Name, birth date, operation and consent confirmed","done":true,"who":"Iman"},{"key":"site","text":"Site marked","done":false,"not":"marked on the ward"}],"by":["Iman","Dr. Sherine"]}',
  null, null, (select t.latest('00000000-0000-0000-0000-00000000a501')), 'about')), 'Sign in, signed by who said it');
select t.ok((select r ->> 'part' = 'sign_in' and (r ->> 'missed')::int = 1 from t.rows('theatre.checks', :'th', jsonb_build_object('op', '00000000-0000-0000-0000-00000000a501')) r),
  'kept for the list: Sign in, one item not done');
select t.landed(t.w(pg_temp.step('anaesthetic', '00000000-0000-0000-0000-00000000a512', 'changes', '00000000-0000-0000-0000-00000000a513')), 'the anaesthetic');
select t.landed(t.w(pg_temp.step('back', '00000000-0000-0000-0000-00000000a513', 'changes', '00000000-0000-0000-0000-00000000a514', 'completed')), 'back to the ward: the operation done');
select t.ok((select r ->> 'status' from t.rows('base.orders', :'th', jsonb_build_object('item', '00000000-0000-0000-0000-00000000a501')) r) = 'completed', 'the order completed by the Theatre''s last step');
select t.as(:'dr');
select t.ok(not exists (select 1 from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r where r ->> 'why' = 'no_answer'),
  'no "no report" row: the operation is answered by the Theatre''s own steps');

\echo '── its FHIR adds the side as the bodySite'
create temp table bundle as select public.read(jsonb_build_object('shape', 'fhir', 'patient_id', :'pt', 'department_id', :'im')) b;
grant select on bundle to authenticated;
select t.ok((select e -> 'resource' -> 'bodySite' -> 0 ->> 'text' from bundle, jsonb_array_elements(b -> 'entry') e
  where e -> 'resource' ->> 'resourceType' = 'ServiceRequest' and e -> 'resource' ->> 'id' = '00000000-0000-0000-0000-00000000a501') = 'right', 'the ServiceRequest''s bodySite: right');

\echo '── the theatre nurse runs the list; the checklist and the steps are everyday where the Theatre ticks the pack'
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000e3', 'write:theatre.step', :'th') and core.may('00000000-0000-0000-0000-0000000000e3', 'write:theatre.check', :'th')
  and core.may('00000000-0000-0000-0000-0000000000e3', 'read:bench', :'th'), 'the theatre nurse');
select t.ok((select a.everyday from core.actions a where a.key = 'write:theatre.check') and (select s.action from core.screens s where s.key = 'theatre.list') = 'read:bench', 'the checklist everyday; the list for whoever reads the bench');
set role authenticated;

\echo '── off for the clinic: no new operation'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'dr');
select t.refused(t.w(pg_temp.op(null, '{"side":"left"}')), 'pack_off', 'theatre off');
