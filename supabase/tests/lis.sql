-- the laboratory pack (spec §5.3): sample numbers, one counter per laboratory and day, through its door; the earlier values of a patient's
-- tests (the change check), fed after commit by a listener on the base's results, read by its technician; its door refused elsewhere
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set lt   '11111111-0000-0000-0000-0000000000b2'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["lis"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'labd', 'data', '{"packs":["lis"]}'::jsonb)) ->> 'key' as ticked;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b2', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c005', 'department_id', :'labd'),
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000cf01', 'department_id', :'labd')))) ->> 'id' as granted;
set role authenticated;

\echo '── sample numbers: one counter per laboratory and day, S-MMDD-NNNN'
select t.as(:'lt');
select t.ok((public.pack_op(jsonb_build_object('op', 'lis.sample', 'department_id', :'labd')) ->> 'sample') ~ '^S-[0-9]{4}-0001$', 'the first today: …-0001');
select t.ok((public.pack_op(jsonb_build_object('op', 'lis.sample', 'department_id', :'labd')) ->> 'sample') ~ '^S-[0-9]{4}-0002$', 'the next: …-0002');
select t.refuses($q$select public.pack_op('{"op":"lis.sample","department_id":"00000000-0000-0000-0000-0000000000d1"}')$q$, 'not_used_here');

\echo '── the earlier values: a final result''s numbers, by analyte key, for its technician'
select t.as(:'dr');
select t.landed(t.w(t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'CBC'), 'department_id', :'labd', 'priority', 'routine', 'status', 'active'),
  '00000000-0000-0000-0000-00000000ad01')), 'a CBC ordered');
select t.as(:'lt');
select t.landed(t.w(t.e('result', :'pt', :'labd', jsonb_build_object('status', 'final', 'analytes', jsonb_build_array(
  jsonb_build_object('key', 'hb', 'name', 'Hb', 'value', jsonb_build_object('value', '13.1', 'ucum', 'g/dL')),
  jsonb_build_object('key', 'note', 'name', 'Comment', 'text', 'normocytic'))), '00000000-0000-0000-0000-00000000ad02', null,
  '00000000-0000-0000-0000-00000000ad01', 'answers')), 'its result');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'lt');
select t.ok(count(*) = 1 and min(r ->> 'key') = 'hb' and min((r ->> 'value')::numeric) = 13.1, 'one number kept (the comment is not a number): hb 13.1')
  from t.rows('lis.values', :'labd', jsonb_build_object('patient_id', :'pt')) r;
select t.as(:'dr');
select t.refuses(format($q$select count(*) from t.rows('lis.values', %L, '{}')$q$, :'im'), 'not_allowed');
