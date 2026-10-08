-- the surgery pack (spec §5.7): the operation note, its own type extending the base's note (the surgeon's write; the base's note's text
-- required), the base's procedure beside it; the surgeons' templates as a clinic setting; the surgeon is built on Doctor; a plain doctor
-- writes no operation note; off, no new note
\set sc   '00000000-0000-0000-0000-0000000000e4'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set su   '11111111-0000-0000-0000-0000000000e4'
\set ow   '11111111-0000-0000-0000-0000000000b9'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["surgery"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'surgery.clinic', 'department_id', :'sc', 'name', 'Surgery clinic', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e4', 'name', 'Dr Hesham', 'login_id', :'su', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e901', 'department_id', :'sc')))) ->> 'id' as surgeon;
create function pg_temp.note(p_surgery jsonb, p_text text default 'Findings: stones. Steps: six. Closure: subcuticular.') returns jsonb language sql as $$
  select t.e('surgery.opnote', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e4', jsonb_strip_nulls(jsonb_build_object('kind', 'operation', 'heading', 'Operation note', 'text', p_text, 'surgery', p_surgery)))
$$;
set role authenticated;

\echo '── the operation note: the surgeon writes it with the base''s procedure; the operation named; the base''s note needs its text'
select t.as(:'su');
select t.landed(t.w(jsonb_build_array(
  t.e('procedure', :'pt', :'sc', '{"concept":{"text":"Laparoscopic cholecystectomy","codings":[]},"status":"completed"}'),
  pg_temp.note('{"operation":"Laparoscopic cholecystectomy","surgeon":"Dr. Hesham","times":{"from":"08:55","to":"09:40"},"blood_loss":30,"drain":"none","complications":[]}'))),
  'the procedure and the operation note, one set');
select t.refused(t.w(pg_temp.note('{"surgeon":"Dr. Hesham"}')), 'bad_shape', 'the operation is named');
select t.refused(t.w(pg_temp.note('{"operation":"x"}', null)), 'bad_shape', 'the base''s note needs its text');
select t.ok((select e ->> 'line' from jsonb_array_elements(t.record(:'pt', :'sc') -> 'entries') e where e ->> 'type' = 'surgery.opnote' limit 1)
  like 'Operation note · Laparoscopic cholecystectomy · 08:55–09:40 · blood loss 30 mL · no drain%', 'its line in the record');
select t.as(:'dr');
select t.refused(t.w(t.e('surgery.opnote', :'pt', '00000000-0000-0000-0000-0000000000d1', '{"kind":"operation","text":"x","surgery":{"operation":"x"}}')), 'not_allowed', 'a doctor elsewhere writes no operation note');

\echo '── the surgeon is built on Doctor; the templates are a clinic setting'
reset role;
select t.ok(core.may('00000000-0000-0000-0000-0000000000e4', 'write:surgery.opnote', :'sc') and core.may('00000000-0000-0000-0000-0000000000e4', 'write:order', :'sc'), 'the surgeon writes notes and orders');
set role authenticated;
select t.as(:'ow');
select public.write_setting('{"key":"surgery.templates","data":{"templates":[{"surgeon":"Dr. Hesham","operation":"lapchole","steps":"1. Ports."}]}}') ->> 'key' as templates;

\echo '── off for the clinic: no new operation note'
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}') ->> 'key' as off;
select t.as(:'su');
select t.refused(t.w(pg_temp.note('{"operation":"Laparoscopic cholecystectomy"}')), 'pack_off', 'surgery off');
