-- the radiology pack (spec §5.5): an order carrying radiology's words (its own type on the base's order, written with the base's
-- write:order from any department: core change (a)), kept in its table; the radiographer's scan as the base's step, the radiologist's
-- report as the base's result (a critical impression marked AA reaches the requester as critical); an X-ray nobody reports, done with
-- no answer to come, on the requester's To review for their own reading (core change (c)); the Report tab the radiologist's; off, it
-- takes no new order
\set im   '00000000-0000-0000-0000-0000000000d1'
\set rad  '00000000-0000-0000-0000-0000000000d7'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set rg   '11111111-0000-0000-0000-0000000000bc'
\set rl   '11111111-0000-0000-0000-0000000000bd'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["radiology"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'radiology.department', 'department_id', :'rad', 'name', 'Radiology', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000bc', 'name', 'Radiographer', 'login_id', :'rg', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cc02', 'department_id', :'rad')))) ->> 'id' as radiographer;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000bd', 'name', 'Dr Mai', 'login_id', :'rl', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cc01', 'department_id', :'rad')))) ->> 'id' as radiologist;
create temp table svc as select x.code, core.setup_id(:'rad', 'service', x.code) id from (values ('xrknee'), ('xrchest'), ('ctapc')) x(code);
grant select on svc to authenticated;
create function pg_temp.req(p_code text, p_id uuid, p_words jsonb) returns jsonb language sql as $$
  select t.e('radiology.request', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('service',
    jsonb_build_object('id', (select id from svc where code = p_code), 'code', p_code, 'name', p_code), 'department_id', '00000000-0000-0000-0000-0000000000d7',
    'priority', 'routine', 'status', 'active', 'radiology', p_words), p_id)
$$;
set role authenticated;

\echo '── (a) an order with radiology''s words: written with write:order where the doctor orders (Internal Medicine does not use the pack)'
select t.as(:'dr');
select t.landed(t.w(pg_temp.req('xrknee', '00000000-0000-0000-0000-00000000ae01', '{"side":"left"}')), 'a knee X-ray, left, from Internal Medicine');
select t.refused(t.w(pg_temp.req('xrknee', null, '{"side":"up"}')), 'bad_shape', 'a side is left, right or both');
select t.refused(t.w(pg_temp.req('xrknee', null, '{"colour":"red"}')), 'bad_shape', 'only radiology''s own words');
select t.as(:'rg');
select t.ok((select r ->> 'side' from t.rows('radiology.requests', :'rad', jsonb_build_object('item', '00000000-0000-0000-0000-00000000ae01')) r) = 'left',
  'kept in its table for its screens: the side');
select t.ok(exists (select 1 from t.rows('base.orders', :'rad', jsonb_build_object('to_department_id', :'rad')) r where r ->> 'item' = '00000000-0000-0000-0000-00000000ae01'
  and r ->> 'status' = 'active'), 'the base''s order: on Radiology''s list, open');

\echo '── the scan (the base''s step), then the report (the base''s result): a critical impression reaches the doctor as critical'
select t.landed(t.w(t.e('step', :'pt', :'rad', '{"status":"in-progress","step":"scanned"}', '00000000-0000-0000-0000-00000000ae02', null,
  '00000000-0000-0000-0000-00000000ae01', 'answers')), 'scanned');
select t.refused(t.w(t.e('result', :'pt', :'rad', '{"status":"final","conclusion":"Normal."}', null, null, (select t.latest('00000000-0000-0000-0000-00000000ae01')), 'answers')),
  'not_allowed', 'the radiographer writes no report');
select t.as(:'rl');
select t.landed(t.w(t.e('result', :'pt', :'rad', jsonb_build_object('status', 'final', 'conclusion', 'Fracture of the lateral tibial plateau.', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'impression', 'name', 'Impression', 'code', jsonb_build_object('system', 'loinc', 'code', '19005-8'), 'text', 'Fracture of the lateral tibial plateau.', 'interpretation', 'AA'),
  jsonb_build_object('key', 'findings', 'name', 'Findings', 'code', jsonb_build_object('system', 'loinc', 'code', '18782-3'), 'text', 'A depressed fracture of the lateral tibial plateau.'))),
  '00000000-0000-0000-0000-00000000ae03', null, (select t.latest('00000000-0000-0000-0000-00000000ae01')), 'answers')), 'the report, critical');
select t.as(:'dr');
select t.ok(exists (select 1 from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r
  where r ->> 'entry_id' = '00000000-0000-0000-0000-00000000ae03' and (r ->> 'critical')::boolean), 'on the doctor''s To review, critical');
select t.ok((select r ->> 'status' from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000ae01')) r) = 'completed', 'the order answered');

\echo '── (c) an X-ray nobody reports: done with no answer to come, on the doctor''s To review for their own reading'
select t.landed(t.w(pg_temp.req('xrchest', '00000000-0000-0000-0000-00000000ae11', '{}')), 'a chest X-ray, no report asked');
select t.as(:'rg');
select t.landed(t.w(t.e('step', :'pt', :'rad', '{"status":"completed","step":"scanned"}', '00000000-0000-0000-0000-00000000ae12', null,
  '00000000-0000-0000-0000-00000000ae11', 'answers')), 'scanned, film only: the order ends');
select t.as(:'dr');
select t.ok((select r ->> 'why' from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r
  where r ->> 'entry_id' = '00000000-0000-0000-0000-00000000ae12') = 'no_answer', 'a row: no report, for the doctor''s reading');
select t.ok((select r ->> 'status' from t.rows('base.orders', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-00000000ae11')) r) = 'completed', 'the order done');
select t.landed(t.w(t.e('reviewed', :'pt', :'im', '{"note":"No consolidation. Normal heart size."}', null, null, '00000000-0000-0000-0000-00000000ae12', 'about')), 'the doctor''s reading');
select t.ok(not exists (select 1 from t.rows('base.review', :'im', jsonb_build_object('for_user', '00000000-0000-0000-0000-0000000000b1')) r
  where r ->> 'entry_id' = '00000000-0000-0000-0000-00000000ae12'), 'read: the row closes');

\echo '── a step that ends an order answered by a pack''s own step (dispensing) is not that: no row'
reset role;
select t.ok(not exists (select 1 from base.review r join core.entries e on e.id = r.entry_id where r.why = 'no_answer' and e.type <> 'step'), 'only steps raise it');
set role authenticated;

\echo '── the Report tab is the radiologist''s; the Scan tab anyone''s on the bench there'
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000bd', 'report:radiology.studies', :'rad'), 'the radiologist reports');
select t.ok(not core.may('00000000-0000-0000-0000-0000000000bc', 'report:radiology.studies', :'rad'), 'the radiographer does not');
select t.ok(core.may('00000000-0000-0000-0000-0000000000bc', 'read:record', :'rad') and core.may('00000000-0000-0000-0000-0000000000bc', 'write:pregnancy', :'rad')
  and core.may('00000000-0000-0000-0000-0000000000bc', 'write:given', :'rad'), 'the radiographer reads the record and writes pregnant and the contrast given');
select t.ok(core.may('00000000-0000-0000-0000-0000000000bd', 'write:result', :'rad'), 'the radiologist is built on Doctor');
set role authenticated;

\echo '── off for the clinic: no new radiology order'
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'dr');
select t.refused(t.w(pg_temp.req('xrknee', null, '{"side":"right"}')), 'pack_off', 'radiology off');
