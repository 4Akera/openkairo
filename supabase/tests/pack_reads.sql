-- what a pack may read (spec §5.2): core doors granted to every pack role, never core tables. Masked by default: in a check or a read
-- for a person the reader is the user signed in (the session's), so a pack sees only what that person may see; only a refresh or a
-- listener (core.run_refresh) reads unmasked, and its rows keep source_entries for the reader to mask. A probe pack reads through each door.
\set org  '00000000-0000-0000-0000-0000000000a1'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set psy  '00000000-0000-0000-0000-0000000000d5'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set psd  '11111111-0000-0000-0000-0000000000b8'
\set rc   '11111111-0000-0000-0000-0000000000b4'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set visit '00000000-0000-0000-0000-0000000000a5'
select t.fixture();

\echo '── the probe pack: a listener on notes that counts what it can read, and a type whose check says what the writer can read'
select core.declare_pack('probe', 1, '{}', '{"en":"Probe"}');
select core.create_pack('probe');
set role pack_probe;
create table probe.seen (organization_id uuid, patient_id uuid, item uuid, readable boolean, source_entries uuid[]);   -- one row per note item (§3.10 the row rule)
create function probe.look(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_patient uuid := (select e.patient_id from core.pack_entries(p_org, p_items) e limit 1);
begin
  delete from probe.seen where organization_id = p_org and patient_id = v_patient;
  insert into probe.seen select p_org, v_patient, e.item, bool_and(e.author_id is not null), array_agg(e.id) from core.pack_kind(p_org, v_patient, 'note') e group by e.item;
end $$;
-- reads another clinic's lists while unmasked: refused, a refresh reads only the clinic it runs for
create function probe.peek(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform count(*) from core.pack_rows('00000000-0000-0000-0000-0000000000a9', 'base.lists', '{}');
end $$;
create function probe.ping_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$ select 'Ping' $$;
create function probe.ping_check(p_entry jsonb, p_set jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('code', 'probe_read', 'level', 'warn', 'detail',
    (select count(*) filter (where e.author_id is not null) || ' of ' || count(*) from core.pack_kind((p_entry ->> 'organization_id')::uuid, (p_entry ->> 'patient_id')::uuid, 'note') e)))
$$;
reset role;
select core.declare_action('write:probe.ping', 'probe', everyday => true);
select core.declare_type('probe.ping', 1, 'probe', '{"type":"object","additionalProperties":false,"properties":{"text":{"type":"string"}}}', 'probe.ping_line(jsonb)',
  checks => array['probe.ping_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Ping"}');
select core.declare_listener('probe', array['note'], 'probe.look(uuid,uuid[])');
select core.lock_pack('probe');
select t.as(:'ow');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy","probe"]}}') ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', d, 'data', '{"packs":["probe"]}'::jsonb)) ->> 'key' as ticked from unnest(array[:'im', :'psy']::uuid[]) d;

\echo '── the doors: granted to every pack role, never to the API'
select t.ok(bool_and(has_function_privilege('pack_probe', f, 'EXECUTE') and has_function_privilege('pack_pharmacy', f, 'EXECUTE') and not has_function_privilege('authenticated', f, 'EXECUTE')),
  'every read door: ' || string_agg(f, ', ')) from unnest(array['core.pack_entries(uuid,uuid[])', 'core.pack_kind(uuid,uuid,text,jsonb)', 'core.pack_visit(uuid,uuid,text)',
  'core.pack_rows(uuid,text,jsonb)', 'core.pack_codes(text,text[])', 'core.pack_department(uuid,uuid)', 'core.pack_staff(uuid,uuid[])', 'base.pack_identity(uuid,uuid,timestamptz)']) f;
select t.ok(not has_function_privilege('pack_probe', 'core.run_refresh(regprocedure,uuid,uuid[])', 'EXECUTE') and not has_table_privilege('pack_probe', 'core.unmasked', 'SELECT,INSERT,UPDATE,DELETE'),
  'a pack can neither run itself unmasked nor write the mark');

\echo '── the record: a visit with a note and vitals in Internal Medicine; a private note and a private result in Psychiatry'
set role authenticated;
select t.as(:'rc');
select t.landed(t.check_in(:'visit', :'pt', :'desk', :'im'), 'checked in to Internal Medicine');
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', :'im', '{"kind":"progress","text":"plain words"}', '00000000-0000-0000-0000-0000000000e1', :'visit'),
  t.e('vitals', :'pt', :'im', '{"hr":{"value":"80","unit":"/min","ucum":"/min"}}', '00000000-0000-0000-0000-0000000000e2', :'visit'),
  t.e('problem', :'pt', :'im', '{"concept":{"text":"Hypertension","codings":[{"system":"icd10","code":"I10"}]},"category":"problem-list-item","clinical_status":"active","verification":"confirmed"}', null, :'visit'),
  t.e('order', :'pt', :'im', '{"service":{"id":"00000000-0000-0000-0000-0000000000c1","code":"cbc","name":"Complete blood count"},"department_id":"00000000-0000-0000-0000-0000000000d2","priority":"routine","status":"active"}',
    '00000000-0000-0000-0000-0000000000e3', :'visit'))), 'Dr Ali: a note, vitals, a problem and a CBC');
select t.as(:'psd');
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', :'psy', '{"kind":"progress","text":"MARK-41 the story"}', '00000000-0000-0000-0000-0000000000e4', null, null, null, null,
    jsonb_build_object('until', now() + interval '1 hour')),
  t.e('result', :'pt', :'psy', '{"status":"final","conclusion":"MARK-41","analytes":[{"key":"hr","code":{"system":"loinc","code":"8867-4"},"name":"Heart rate","value":{"value":"130","ucum":"/min"}}]}',
    '00000000-0000-0000-0000-0000000000e5'))), 'Dr Salma: a private note and a private result, the later heart rate');

\echo '── masked: as Dr Ali, a pack sees Psychiatry''s note as a placeholder'
set role pack_probe;
select t.as(:'dr');
select t.ok(count(*) = 2 and count(*) filter (where author_id is null and data = '{}' and codes = '{}') = 1, 'two notes, one a placeholder (no data, no author)')
  from core.pack_kind(:'org', :'pt', 'note');
select t.ok(e.data = '{}' and e.findings = '[]' and e.author_id is null and e.until is null, 'the item''s own versions come back masked too (no end time either)') from core.pack_entries(:'org', array['00000000-0000-0000-0000-0000000000e4'::uuid]) e
  where e.id = '00000000-0000-0000-0000-0000000000e4';
select t.ok(count(*) = 0, 'a data filter matches only what the reader may see') from core.pack_kind(:'org', :'pt', 'note', '{"data":{"text":"MARK-41 the story"}}');
select t.ok(count(*) = 1, 'and finds what he may') from core.pack_kind(:'org', :'pt', 'note', '{"data":{"kind":"progress"}}');
select t.ok(count(*) = 1 and bool_and(id = '00000000-0000-0000-0000-0000000000e1'), 'a filter comes before the limit: the newest match he may see, not the hidden newer one')
  from core.pack_kind(:'org', :'pt', 'note', '{"data":{"kind":"progress"},"limit":1}');
select t.ok(count(*) = 1 and bool_and(type = 'problem'), 'a codes filter') from core.pack_kind(:'org', :'pt', 'problem', '{"codes":["icd10:I10"]}');
select t.ok(count(*) = 0, 'a time filter') from core.pack_kind(:'org', :'pt', 'note', jsonb_build_object('to', now() - interval '1 day'));
select t.ok(string_agg(type, ',' order by recorded_at, id) like 'checked_in,%' and count(*) filter (where type = 'note') = 1 and count(*) filter (where type = 'vitals') = 1,
  'a visit''s entries: its moves and what was written in it') from core.pack_visit(:'org', :'visit');
select t.ok(count(*) = 1, 'a visit''s entries of one kind') from core.pack_visit(:'org', :'visit', 'vitals');
select t.ok((r ->> 'value')::numeric = 80, 'latest values by code: the latest he may see (80, not the private 130)')
  from core.pack_rows(:'org', 'base.values', jsonb_build_object('patient', :'pt', 'where', '{"code":"loinc:8867-4"}'::jsonb, 'latest', '{"by":"code","at":"at"}'::jsonb)) r;
select t.ok(count(*) = 1 and bool_and((r ->> 'value')::numeric = 80), 'with a limit of one: the hidden 130 is withheld before the limit')
  from core.pack_rows(:'org', 'base.values', jsonb_build_object('patient', :'pt', 'latest', '{"by":"code","at":"at"}'::jsonb, 'limit', 1)) r;
select t.ok(count(*) = 1 and bool_and(r ->> 'list' = 'problems'), 'the lists') from core.pack_rows(:'org', 'base.lists', jsonb_build_object('patient', :'pt')) r;
select t.ok(count(*) = 1 and bool_and(r ->> 'service_code' = 'cbc'), 'open orders')
  from core.pack_rows(:'org', 'base.orders', jsonb_build_object('patient', :'pt', 'where', '{"status":["active","on-hold","in-progress"]}'::jsonb)) r;
select t.refuses($$select count(*) from core.pack_rows('00000000-0000-0000-0000-0000000000a1', 'pharmacy.queue')$$, 'other_packs_table');
select t.refuses($$select count(*) from core.pack_rows('00000000-0000-0000-0000-0000000000a1', 'base.nothing')$$, 'unknown_table');
select t.refuses($$select count(*) from core.pack_kind('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000f1', 'note')$$, 'wrong_organization');
select t.refuses($$select core.pack_department('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000d1')$$, 'wrong_organization');

\echo '── the reader is the session''s user, never a parameter: Dr Salma reads her own story; nobody signed in reads nothing'
select t.as(:'psd');
select t.ok(count(*) = 2 and count(*) filter (where author_id is null) = 0, 'Dr Salma: both notes in full') from core.pack_kind(:'org', :'pt', 'note');
select t.ok((r ->> 'value')::numeric = 130, 'her latest heart rate is the private 130')
  from core.pack_rows(:'org', 'base.values', jsonb_build_object('patient', :'pt', 'where', '{"code":"loinc:8867-4"}'::jsonb, 'latest', '{"by":"code","at":"at"}'::jsonb)) r;
select t.ok(count(*) = 1 and bool_and((r ->> 'value')::numeric = 130), 'with a limit of one, still the latest (the limit comes last)')
  from core.pack_rows(:'org', 'base.values', jsonb_build_object('patient', :'pt', 'where', '{"code":"loinc:8867-4"}'::jsonb, 'latest', '{"by":"code","at":"at"}'::jsonb, 'limit', 1)) r;
select t.ok(e.until is not null, 'she sees the private note''s end time') from core.pack_entries(:'org', array['00000000-0000-0000-0000-0000000000e4'::uuid]) e
  where e.id = '00000000-0000-0000-0000-0000000000e4';
select t.ok(count(*) = 1 and bool_and(id = '00000000-0000-0000-0000-0000000000e1'), 'a data filter with a limit: the older match, past her newer note that does not match')
  from core.pack_kind(:'org', :'pt', 'note', '{"data":{"text":"plain words"},"limit":1}');
select t.as(null);
select t.refuses($$select count(*) from core.pack_kind('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', 'note')$$, 'not_signed_in');
reset role;

\echo '── in a check: the writer''s view'
set role authenticated;
select t.as(:'dr');
select t.ok(f ->> 'detail' = '1 of 2', 'Dr Ali''s check reads 1 of 2 notes') from jsonb_array_elements(t.w(t.e('probe.ping', :'pt', :'im', '{}')) -> 'findings') f where f ->> 'code' = 'probe_read';
select t.as(:'psd');
select t.ok(f ->> 'detail' = '2 of 2', 'Dr Salma''s reads 2 of 2') from jsonb_array_elements(t.w(t.e('probe.ping', :'pt', :'psy', '{}')) -> 'findings') f where f ->> 'code' = 'probe_read';

\echo '── a new pack entry where the department does not tick the pack: refused for everyone'
select t.as(:'dr');
select t.refused(t.w(t.e('probe.ping', :'pt', :'ward', '{}')), 'not_allowed', 'Dr Ali in the ward, which does not tick probe');
select t.as(:'rc');
select t.refused(t.w(t.e('probe.ping', :'pt', :'ward', '{}')), 'not_allowed', 'reception, who holds no probe action');
select t.as(:'ow');
select t.refused(t.w(t.e('probe.ping', :'pt', :'ward', '{}')), 'not_allowed', 'the owner, there');

\echo '── unmasked in a listener: a row per note item, each keeping its source entries for the reader to mask'
reset role;
select t.ok(core.drain() >= 1, 'the listener ran after commit');
select t.ok(count(*) = 2 and bool_and(readable), 'the listener read both notes in full') from probe.seen where patient_id = :'pt';
select t.ok(not exists (select 1 from core.unmasked), 'the mark is gone once the refresh is done');
select t.refuses($$select core.run_refresh('probe.peek(uuid,uuid[])'::regprocedure, '00000000-0000-0000-0000-0000000000a1', '{}')$$, 'wrong_organization');
select core.declare_table('probe.seen', 'probe', 'probe.look(uuid,uuid[])', 'read:record');
set role authenticated;
select t.as(:'dr');
select t.ok(count(*) = 1 and bool_and(r ->> 'item' = '00000000-0000-0000-0000-0000000000e1'), 'read through the reader, Dr Ali gets no row of the private note''s item') from t.rows('probe.seen', :'im') r;
select t.as(:'psd');
select t.ok(count(*) = 2, 'Dr Salma gets both') from t.rows('probe.seen', :'psy');
reset role;

\echo '── identity, codes, a department, staff'
set role pack_probe;
select t.as(:'dr');
select t.ok(i ->> 'sex' = 'male' and i ->> 'birth_date' = '1968-03-14' and i ->> 'birth_precision' = 'day' and not (i ->> 'estimated')::boolean
  and not (i ->> 'unknown')::boolean and not (i ->> 'deceased')::boolean, 'identity: ' || i::text) from base.pack_identity(:'org', :'pt') i;
select t.ok((base.pack_identity(:'org', :'pt', '2026-03-14 12:00+02') ->> 'age_years')::int = 58 and (base.pack_identity(:'org', :'pt', '2026-03-13 12:00+02') ->> 'age_years')::int = 57
  and (base.pack_identity(:'org', :'pt', '1968-04-14 12:00+02') ->> 'age_months')::int = 1 and (base.pack_identity(:'org', :'pt', '1968-03-24 12:00+02') ->> 'age_days')::int = 10,
  'the age at a moment, in completed years, months and days');
select t.ok(base.pack_identity(:'org', :'pt', '1960-01-01') ->> 'age_years' is null, 'no age before birth');
select t.ok(c.props is not null and c.labels ->> 'en' is not null and not c.retired, 'code properties') from core.pack_codes('loinc', array['8867-4']) c;
select t.ok(d ->> 'work' = 'stays' and jsonb_array_length(d -> 'places') = 4 and d -> 'packs' = '[]', 'a department''s work and places') from core.pack_department(:'org', :'ward') d;
select t.ok(core.pack_department(:'org', :'im') -> 'packs' = '["probe"]', 'and the packs it uses');
reset role;
insert into core.identifiers (organization_id, owner_kind, owner_id, system, value) values (:'org', 'user', '00000000-0000-0000-0000-0000000000b1', 'eg-syndicate-med', '12345');
set role pack_probe;
select t.ok(s.name = 'Dr Ali' and s.identifiers = '[{"system":"eg-syndicate-med","value":"12345","verified":false}]', 'staff identifiers') from core.pack_staff(:'org', array['00000000-0000-0000-0000-0000000000b1'::uuid]) s;
reset role;
set role authenticated;
select t.as(:'dr');
select t.landed(t.w(t.e('died', :'pt', :'im', '{"note":"at home"}')), 'died');
set role pack_probe;
select t.ok((base.pack_identity(:'org', :'pt') ->> 'deceased')::boolean and base.pack_identity(:'org', :'pt') ->> 'deceased_at' is not null, 'deceased, from the base''s died');
reset role;
select t.as(null);
