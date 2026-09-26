-- permanent test 3 · the privacy canary (spec §8): a private note, a private result and a file carry a marker; every door is called as
-- users who may not read them; the marker never appears
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set psy  '00000000-0000-0000-0000-0000000000d5'
\set pt   '00000000-0000-0000-0000-0000000000f1'
select t.fixture();
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b4');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a5', :'pt', :'desk', :'psy'), 'into Psychiatry');
select t.as('11111111-0000-0000-0000-0000000000b8');
select t.landed(t.w(jsonb_build_array(t.move('called', '00000000-0000-0000-0000-0000000000a5', :'psy', '{}', '00000000-0000-0000-0000-0000000000c0'),
  t.e('note', :'pt', :'psy', '{"kind":"progress","text":"CANARY-7 the story","attachments":[{"sha256":"aaaa000000000000000000000000000000000000000000000000000000000001","mime":"text/plain","size":7,"name":"CANARY-7.txt"}]}', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a5'),
  t.e('result', :'pt', :'psy', '{"status":"final","code":{"text":"CANARY-7 test"},"conclusion":"CANARY-7 conclusion","analytes":[{"key":"k","name":"CANARY-7","value":{"value":"77.7","ucum":"mmol/L"},"interpretation":"H"}]}', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a5'),
  t.e('done', :'pt', :'psy', '{}', null, '00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000c0', 'changes'))), 'the canaries (moves in one set chain)');
select t.ok(public.read('{"shape":"record","patient_id":"00000000-0000-0000-0000-0000000000f1","department_id":"00000000-0000-0000-0000-0000000000d5"}')::text like '%CANARY-7%', 'its author reads them (the canary is alive)');

reset role;
create temp table tables as select key from core.derived;
grant select on tables to public;
set role authenticated;
create temp table seen (who text, door text, out text);
grant all on seen to public;
create or replace function pg_temp.call(p_who text, p_door text, p_sql text) returns void language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; exception when others then v := sqlerrm; end;
  insert into seen values (p_who, p_door, coalesce(v, ''));
end $$;
do $$
declare w record; d record; shape text;
begin
  for w in select * from (values ('11111111-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', 'IM doctor'),
                                 ('11111111-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000d1', 'owner'),
                                 ('11111111-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000d5', 'Psychiatry clerk'),
                                 ('11111111-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000d5', 'machine'),
                                 ('11111111-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2', 'lab technician'),
                                 ('11111111-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000d4', 'reception')) v(login, dept, who) loop
    perform t.as(w.login::uuid);
    for shape in select unnest(array['me', 'patients', 'patient', 'record', 'item', 'file', 'fhir', 'log', 'audit']) loop
      perform pg_temp.call(w.who, shape, format('select public.read(%L)::text', jsonb_build_object('shape', shape, 'q', 'ahmed', 'patient_id', '00000000-0000-0000-0000-0000000000f1',
        'department_id', w.dept, 'item', '00000000-0000-0000-0000-0000000000e1', 'entry_id', '00000000-0000-0000-0000-0000000000e1',
        'sha256', 'aaaa000000000000000000000000000000000000000000000000000000000001', 'kind', 'ips',
        'include', jsonb_build_object('base.presence', '{}'::jsonb, 'base.values', '{}'::jsonb))));
    end loop;
    perform pg_temp.call(w.who, 'fhir bundle', format('select public.read(%L)::text', jsonb_build_object('shape', 'fhir', 'patient_id', '00000000-0000-0000-0000-0000000000f1', 'department_id', w.dept)));
    for d in select key from tables loop
      perform pg_temp.call(w.who, 'table ' || d.key, format('select public.read(%L)::text', jsonb_build_object('shape', 'table', 'table', d.key, 'department_id', w.dept)));
    end loop;
    -- the writer never returns rows: a refused correction and a refused reference say nothing of what they point at
    perform pg_temp.call(w.who, 'write correction', format('select public.write(%L)::text', jsonb_build_object('set_id', gen_random_uuid(), 'entries',
      jsonb_build_array(t.e('note', '00000000-0000-0000-0000-0000000000f1'::uuid, w.dept::uuid, '{"text":"x"}'::jsonb, null, null, null, null, '00000000-0000-0000-0000-0000000000e1'::uuid)))));
    perform pg_temp.call(w.who, 'write about', format('select public.write(%L)::text', jsonb_build_object('set_id', gen_random_uuid(), 'entries',
      jsonb_build_array(t.e('reviewed', '00000000-0000-0000-0000-0000000000f1'::uuid, w.dept::uuid, '{}'::jsonb, null, null, '00000000-0000-0000-0000-0000000000e2'::uuid, 'about')))));
    perform pg_temp.call(w.who, 'storage', 'select core.may_read_file(''00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000f1/aaaa000000000000000000000000000000000000000000000000000000000001'')::text');
  end loop;
end $$;
select t.ok(count(*) >= 90, count(*) || ' door calls made') from seen;
select t.report('canary', who || ' · ' || door || ' shows the marker') from seen where out like '%CANARY-7%' or out like '%77.7%';
select t.ok(not exists (select 1 from seen where out like '%CANARY-7%' or out like '%77.7%'), 'the marker never appears to anyone who may not read it');
select t.ok(not exists (select 1 from seen where door = 'storage' and out = 'true'), 'no storage path opens for them');
