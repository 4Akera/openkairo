-- permanent test 7 · the tenancy matrix (spec §8): every read and write across organizations sees nothing
\set pt '00000000-0000-0000-0000-0000000000f1'
select t.fixture();
-- a second organization with its own owner and doctor
select t.as('11111111-0000-0000-0000-0000000000c1');
select public.create_organization('00000000-0000-0000-0000-0000000000a2', 'Other', '00000000-0000-0000-0000-0000000000c1', 'Their owner') ->> 'organization_id';
select public.save('department', '{"id":"00000000-0000-0000-0000-0000000000e0","name":"Their clinic","work":"visits"}') ->> 'id';
create temp table tables as select key from core.derived;
grant select on tables to public;
set role authenticated;
select t.as('11111111-0000-0000-0000-0000000000b1');
select t.landed(t.w(t.e('note', :'pt', '00000000-0000-0000-0000-0000000000d1', '{"text":"OURS-ONLY"}', '00000000-0000-0000-0000-0000000000e1')), 'our note');
select t.as('11111111-0000-0000-0000-0000000000c1');
create temp table seen (door text, out text);
grant all on seen to public;
do $$
declare shape text; d record; v text;
begin
  for shape in select unnest(array['patients', 'patient', 'record', 'item', 'file', 'fhir', 'log', 'audit']) loop
    begin
      execute format('select public.read(%L)::text', jsonb_build_object('shape', shape, 'q', 'ahmed', 'patient_id', '00000000-0000-0000-0000-0000000000f1', 'department_id', '00000000-0000-0000-0000-0000000000e0',
        'item', '00000000-0000-0000-0000-0000000000e1', 'entry_id', '00000000-0000-0000-0000-0000000000e1', 'sha256', 'x')) into v;
    exception when others then v := sqlerrm; end;
    insert into seen values (shape, coalesce(v, ''));
  end loop;
  for d in select key from tables loop
    begin execute format('select public.read(%L)::text', jsonb_build_object('shape', 'table', 'table', d.key, 'department_id', '00000000-0000-0000-0000-0000000000e0')) into v;
    exception when others then v := sqlerrm; end;
    insert into seen values ('table ' || d.key, coalesce(v, ''));
  end loop;
end $$;
select t.report('tenancy', door || ' shows another organization''s data: ' || left(out, 120)) from seen where out like '%OURS-ONLY%' or out like '%Ahmed%' or out like '%Internal Medicine%';
select t.ok(not exists (select 1 from seen where out like '%OURS-ONLY%' or out like '%Ahmed%'), 'no read shows another organization''s patient');
select t.ok(not (public.read('{"shape":"me"}')::text like '%Internal Medicine%'), 'their directory holds none of our departments');
select t.refused(t.w(t.e('note', :'pt', '00000000-0000-0000-0000-0000000000e0', '{"text":"x"}')), 'wrong_patient', 'writing on our patient');
select t.refused(t.w(t.e('note', :'pt', '00000000-0000-0000-0000-0000000000d1', '{"text":"x"}')), 'wrong_patient', 'into our department');
select t.refuses($q$select public.save_patient('{"department_id":"00000000-0000-0000-0000-0000000000e0","patient":{"id":"00000000-0000-0000-0000-0000000000f1","given":["Taken"]}}')$q$, 'not_found');
select t.refuses($q$select public.save('user', '{"id":"00000000-0000-0000-0000-0000000000b1","name":"Taken"}')$q$, 'not_found');
select t.refuses($q$select public.remove('department', '00000000-0000-0000-0000-0000000000d1')$q$, 'not_found');
select t.refuses($q$select public.write_setting('{"key":"service","owner_id":"00000000-0000-0000-0000-0000000000d2","data":{"code":"x","name":"x"}}')$q$, 'not_found');
select t.refuses($q$select public.merge_patients('{"department_id":"00000000-0000-0000-0000-0000000000e0","from":"00000000-0000-0000-0000-0000000000f1","into":"00000000-0000-0000-0000-0000000000f1","reason":"x"}')$q$, 'not_found');
select t.ok(not core.may_listen('record:00000000-0000-0000-0000-0000000000f1') and not core.may_listen('organization:00000000-0000-0000-0000-0000000000a1'), 'no live channel of ours');
