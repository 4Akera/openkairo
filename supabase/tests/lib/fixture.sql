-- the new core's test helpers (spec/openCare.md §8): act as a login, build entries and sets, move a visit, check outcomes,
-- and one fixture organization every suite can start from. Loaded after assert.sql by scripts/db-test.sh.

-- act as a login, as PostgREST does from the JWT (and as nobody with null)
create or replace function t.as(p_login uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_login::text, ''), false);
  perform set_config('request.jwt.claims', '', false);
  perform set_config('request.jwt.claim.session_id', '', false);
end $$;

-- one entry, as the client sends it
create or replace function t.e(p_type text, p_patient uuid, p_dept uuid, p_data jsonb default '{}', p_id uuid default null, p_visit uuid default null,
  p_refers uuid default null, p_relation text default null, p_replaces uuid default null, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('id', coalesce(p_id, gen_random_uuid()), 'type', p_type, 'patient_id', p_patient, 'department_id', p_dept,
    'visit_id', p_visit, 'refers_to', p_refers, 'relation', p_relation, 'replaces', p_replaces)) || jsonb_build_object('data', coalesce(p_data, '{}')) || coalesce(p_extra, '{}')
$$;
-- one set through the writer
create or replace function t.w(p_entries jsonb, p_set uuid default null, p_confirmed text[] default '{}', p_seen jsonb default '{}', p_made_at timestamptz default null)
returns jsonb language sql as $$
  select public.write(jsonb_build_object('set_id', coalesce(p_set, gen_random_uuid()), 'made_at', coalesce(p_made_at, clock_timestamp()),
    'entries', case jsonb_typeof(p_entries) when 'array' then p_entries else jsonb_build_array(p_entries) end,
    'confirmed', to_jsonb(coalesce(p_confirmed, '{}')), 'seen', coalesce(p_seen, '{}')))
$$;
-- the latest entry of an item (a visit moves by changing it), and the patient an item is about (test-only definer reads)
create or replace function t.latest(p_item uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from core.entries where item = p_item order by item_version desc limit 1
$$;
create or replace function t.patient_of(p_item uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select patient_id from core.entries where item = p_item limit 1
$$;
-- a move of a visit: changes its latest version
create or replace function t.move(p_type text, p_visit uuid, p_dept uuid, p_data jsonb default '{}', p_id uuid default null) returns jsonb language sql as $$
  select t.e(p_type, t.patient_of(p_visit), p_dept, p_data, p_id, p_visit, t.latest(p_visit), 'changes')
$$;
-- check in (the desk names the visit's department) and open a stay
create or replace function t.check_in(p_visit uuid, p_patient uuid, p_desk uuid, p_to uuid, p_data jsonb default '{}') returns jsonb language sql as $$
  select t.w(t.e('checked_in', p_patient, p_desk, jsonb_build_object('department_id', p_to) || coalesce(p_data, '{}'), p_visit, p_visit))
$$;

-- outcomes as check lines
create or replace function t.landed(r jsonb, what text) returns text language sql as $$
  select case when r ->> 'outcome' = 'landed' then 'ok ' || what else 'FAIL ' || what || ': ' || coalesce(r::text, 'null') end
$$;
create or replace function t.refused(r jsonb, code text, what text default null) returns text language sql as $$
  select case when r ->> 'outcome' = 'refused' and exists (select 1 from jsonb_array_elements(r -> 'findings') f where f ->> 'code' = code)
    then 'ok refused ' || code || coalesce(': ' || what, '') else 'FAIL expected ' || code || coalesce(' (' || what || ')', '') || ', got ' || coalesce(r::text, 'null') end
$$;
create or replace function t.warned(r jsonb, code text, what text default null) returns text language sql as $$
  select case when r ->> 'outcome' = 'warn' and exists (select 1 from jsonb_array_elements(r -> 'findings') f where f ->> 'code' = code)
    then 'ok warned ' || code || coalesce(': ' || what, '') else 'FAIL expected a warning ' || code || coalesce(' (' || what || ')', '') || ', got ' || coalesce(r::text, 'null') end
$$;
create or replace function t.flagged(r jsonb, code text, what text default null) returns text language sql as $$
  select case when r ->> 'outcome' = 'landed' and exists (select 1 from jsonb_array_elements(r -> 'findings') f where f ->> 'code' = code and f ->> 'level' = 'flag')
    then 'ok flagged ' || code || coalesce(': ' || what, '') else 'FAIL expected a flag ' || code || coalesce(' (' || what || ')', '') || ', got ' || coalesce(r::text, 'null') end
$$;
-- rows of a table read (as the reader), filtered
create or replace function t.rows(p_table text, p_dept uuid, p_where jsonb default '{}') returns setof jsonb language sql as $$
  select jsonb_array_elements(public.read(jsonb_build_object('shape', 'table', 'table', p_table, 'department_id', p_dept, 'where', p_where)) -> 'rows')
$$;
-- the record as the reader: the page of entries, and one table's rows
create or replace function t.record(p_patient uuid, p_dept uuid, p_extra jsonb default '{}') returns jsonb language sql as $$
  select public.read(jsonb_build_object('shape', 'record', 'patient_id', p_patient, 'department_id', p_dept) || coalesce(p_extra, '{}'))
$$;
create or replace function t.entry(p_record jsonb, p_id uuid) returns jsonb language sql immutable as $$
  select e from jsonb_array_elements(p_record -> 'entries') e where (e ->> 'id')::uuid = p_id
$$;

-- ── the fixture organization (ids end in the same letters as the old suites) ──
--   a1 Demo · d4 Front desk (desk) · d1 Internal Medicine (visits) · d2 Lab (bench) · d3 Pharmacy (bench) · d5 Psychiatry (visits, private)
--   · d6 Ward (stays, beds p1–p4) · b9 owner · b1 Dr Ali (doctor, IM) · b3 Nurse Sara (nurse, IM) · b4 reception (desk) · b2 lab tech (lab)
--   · b6 pharmacist · b8 Dr Salma (doctor, psychiatry) · b7 clerk (reception, psychiatry) · bm analyser (machine, doctor in psychiatry)
--   · services c1 CBC (result; steps collected, received), c2 chest X-ray (note), c3 dispensing (pharmacy; step prepared) · f1 Ahmed Hassan
--   · logins are 11111111-…-<user>
create or replace function t.fixture(p_patients boolean default true) returns void language plpgsql as $$
declare o text := '00000000-0000-0000-0000-0000000000'; l text := '11111111-0000-0000-0000-0000000000';
begin
  update core.server_settings set value = 'off' where key = 'require_mfa';
  perform t.as((l || 'b9')::uuid);
  perform public.create_organization((o || 'a1')::uuid, 'Demo', (o || 'b9')::uuid, 'Owner');
  perform public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}');
  perform public.save('department', jsonb_build_object('id', o || 'd4', 'name', 'Front desk', 'work', 'desk'));
  perform public.save('department', jsonb_build_object('id', o || 'd1', 'name', 'Internal Medicine', 'work', 'visits'));
  perform public.save('department', jsonb_build_object('id', o || 'd2', 'name', 'Lab', 'work', 'bench'));
  perform public.save('department', jsonb_build_object('id', o || 'd3', 'name', 'Pharmacy', 'work', 'bench'));
  perform public.save('department', jsonb_build_object('id', o || 'd5', 'name', 'Psychiatry', 'work', 'visits'));
  perform public.save('department', jsonb_build_object('id', o || 'd6', 'name', 'Ward', 'work', 'stays'));
  perform public.write_setting(jsonb_build_object('key', 'department.private', 'owner_id', o || 'd5', 'data', jsonb_build_object('private', true)));
  perform public.save('place', jsonb_build_object('id', '00000000-0000-0000-0000-00000000000' || n, 'department_id', o || 'd6', 'name', 'Bed ' || n, 'position', n))
    from generate_series(1, 4) n;
  perform public.write_setting(jsonb_build_object('key', 'service', 'owner_id', o || 'd2', 'thing_id', o || 'c1', 'data', jsonb_build_object(
    'code', 'cbc', 'name', 'Complete blood count', 'section', 'Haematology', 'answer', 'result', 'coding', jsonb_build_object('system', 'loinc', 'code', '58410-2'),
    'steps', jsonb_build_array('collected', 'received'),
    'fields', jsonb_build_array(jsonb_build_object('key', 'hb', 'name', 'Haemoglobin', 'coding', jsonb_build_object('system', 'loinc', 'code', '718-7'), 'kind', 'number',
      'unit', 'g/dL', 'ucum', 'g/dL', 'low', 12, 'high', 16, 'critical_low', 7, 'critical_high', 20)))));
  perform public.write_setting(jsonb_build_object('key', 'service', 'owner_id', o || 'd2', 'thing_id', o || 'c2', 'data', jsonb_build_object(
    'code', 'cxr', 'name', 'Chest X-ray', 'answer', 'note')));
  perform public.write_setting(jsonb_build_object('key', 'service', 'owner_id', o || 'd3', 'thing_id', o || 'c3', 'data', jsonb_build_object(
    'code', 'dispense', 'name', 'Dispensing', 'answer', 'pharmacy.dispense', 'steps', jsonb_build_array('prepared'))));
  perform public.write_setting(jsonb_build_object('key', 'service', 'owner_id', o || 'd5', 'thing_id', o || 'c5', 'data', jsonb_build_object(
    'code', 'psych', 'name', 'Psychiatry consult', 'answer', 'note')));
  perform public.save('user', jsonb_build_object('id', o || 'b1', 'name', 'Dr Ali', 'login_id', l || 'b1', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', o || 'd1'),
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', o || 'd6'))));
  perform public.save('user', jsonb_build_object('id', o || 'b3', 'name', 'Nurse Sara', 'login_id', l || 'b3', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c003', 'department_id', o || 'd1'))));
  perform public.save('user', jsonb_build_object('id', o || 'b4', 'name', 'Reception', 'login_id', l || 'b4', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c004', 'department_id', o || 'd4'))));
  perform public.save('user', jsonb_build_object('id', o || 'b2', 'name', 'Lab Tech', 'login_id', l || 'b2', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c005', 'department_id', o || 'd2'))));
  perform public.save('user', jsonb_build_object('id', o || 'b6', 'name', 'Pharmacist', 'login_id', l || 'b6', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000ca01', 'department_id', o || 'd3'))));
  perform public.save('user', jsonb_build_object('id', o || 'b8', 'name', 'Dr Salma', 'login_id', l || 'b8', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', o || 'd5'))));
  perform public.save('user', jsonb_build_object('id', o || 'b7', 'name', 'Clerk', 'login_id', l || 'b7', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c004', 'department_id', o || 'd5'))));
  perform public.save('user', jsonb_build_object('id', o || 'bb', 'name', 'Analyser', 'kind', 'machine', 'login_id', l || 'bb', 'holdings', jsonb_build_array(
    jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', o || 'd5'))));
  if p_patients then
    perform t.as((l || 'b4')::uuid);
    perform public.save_patient(jsonb_build_object('department_id', o || 'd4', 'patient', jsonb_build_object('id', o || 'f1', 'given', jsonb_build_array('Ahmed'),
      'family', 'Hassan', 'gender', 'male', 'birth_date', '1968-03-14', 'telecom', jsonb_build_array(jsonb_build_object('system', 'phone', 'value', '+201000000001')))));
  end if;
  perform t.as(null);
end $$;
grant execute on all functions in schema t to public;
