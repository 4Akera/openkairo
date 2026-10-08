-- printing (spec §3.13; the owner's (p3) and (p4), 2026-10-08): the clinic's header, the core's setting every printout carries, written by
-- whoever changes settings everywhere, in its shape (a small logo of a known kind); a printout of a patient's information logged like a
-- read — who printed what, for which patient, when, from where — in the core read log, merged with the person's other reads of that
-- patient in ten minutes, refused to whoever does not find patients. (Each pack's own print records are its suite's: billing.sql.)
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set lt   '11111111-0000-0000-0000-0000000000b2'
\set none '11111111-0000-0000-0000-0000000000cc'
select t.fixture();

\echo '── the clinic''s header: the core''s setting, one for the clinic, in its shape, written by whoever changes settings everywhere'
select t.ok(k.layer = 'core' and k.owner_kind = 'organization' and k.form is null and k.action is null and not k.many,
  'organization.header: the core''s, the clinic''s one, its own editor in Settings → Organization') from core.setting_keys k where k.key = 'organization.header';
set role authenticated;
select t.as(:'ow');
select t.ok(public.write_setting(jsonb_build_object('key', 'organization.header', 'data', jsonb_build_object('name', 'عيادة النيل · Nile Clinic', 'address', '12 Nile St, Cairo',
  'phone', '+20 2 2345 6789', 'tax_number', '123-456-789', 'logo', 'data:image/png;base64,iVBORw0KGgo='))) ->> 'key' = 'organization.header', 'the owner sets it: an Arabic name, a small PNG logo');
select t.ok(exists (select 1 from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') x where x ->> 'key' = 'organization.header'
  and x -> 'data' ->> 'name' = 'عيادة النيل · Nile Clinic' and x -> 'data' ->> 'tax_number' = '123-456-789'), 'every screen reads it with the directory, as written');
select t.refuses($$select public.write_setting('{"key":"organization.header","data":{"name":""}}')$$, 'bad_shape');
select t.refuses($$select public.write_setting('{"key":"organization.header","data":{"address":"a name is needed"}}')$$, 'bad_shape');
select t.refuses($$select public.write_setting('{"key":"organization.header","data":{"name":"N","logo":"data:image/gif;base64,R0lGOD="}}')$$, 'bad_shape');
select t.refuses($$select public.write_setting('{"key":"organization.header","data":{"name":"N","logo":"javascript:alert(1)"}}')$$, 'bad_shape');
select t.refuses(format($q$select public.write_setting('{"key":"organization.header","data":{"name":"N","logo":"data:image/png;base64,%s"}}')$q$, repeat('A', 100001)), 'bad_shape');
select t.refuses($$select public.write_setting('{"key":"organization.header","data":{"name":"N","fax":"1"}}')$$, 'bad_shape');
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000cc', 'name', 'No role', 'login_id', :'none', 'holdings', '[]'::jsonb)) ->> 'id' as no_role;
select t.as(:'dr');
select t.refuses($$select public.write_setting('{"key":"organization.header","data":{"name":"Mine"}}')$$, 'not_allowed');

\echo '── a print of a patient''s information is logged like a read: who printed what, for which patient, when, from where; nothing returned'
select t.as(:'lt');
select t.ok((r - 'at') = '{"logged":true}' and (r ->> 'at')::timestamptz between now() and clock_timestamp(),
  'labels printed at the Lab: logged, and nothing of the patient comes back, only when (the server''s time, for a reprint''s mark)')
  from public.read(jsonb_build_object('shape', 'printed', 'patient_id', :'pt', 'department_id', :'labd', 'printout', 'lis.labels', 'what', 'S-1008-0001')) r;
reset role;
select t.ok(l.purpose = 'TREAT' and l.department_id = :'labd' and l.what -> 'prints' = '[{"printout":"lis.labels","what":"S-1008-0001"}]' and l.reads = 1 and l.at is not null,
  'one row of the read log: the technician, the patient, the Lab, the labels and their sample, when')
  from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b2' and l.patient_id = :'pt';
set role authenticated;
select public.read(jsonb_build_object('shape', 'printed', 'patient_id', :'pt', 'department_id', :'labd', 'printout', 'lis.labels', 'what', 'S-1008-0001')) is not null as again,
       public.read(jsonb_build_object('shape', 'printed', 'patient_id', :'pt', 'department_id', :'labd', 'printout', 'lis.labels', 'what', 'S-1008-0004')) is not null as another;
reset role;
select t.ok(l.reads = 3 and l.what -> 'prints' = '[{"printout":"lis.labels","what":"S-1008-0001"},{"printout":"lis.labels","what":"S-1008-0004"}]',
  'printed again, and another sample, within ten minutes: one row keeps each print once and counts all three')
  from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b2' and l.patient_id = :'pt';
set role authenticated;
select t.as(:'dr');
select t.ok(t.record(:'pt', :'im') is not null and public.read(jsonb_build_object('shape', 'printed', 'patient_id', :'pt', 'department_id', :'im', 'printout', 'base.prescription',
  'what', 'set-1')) ->> 'logged' = 'true', 'the doctor reads the record, then prints a prescription');
select t.ok(public.read(jsonb_build_object('shape', 'printed', 'patient_id', :'pt', 'department_id', :'im', 'printout', 'billing.receipt', 'what', 'R-00412', 'purpose', 'PATADMIN'))
  ->> 'logged' = 'true', 'a receipt, for running the clinic');
reset role;
select t.ok(l.what ? 'records' and l.what -> 'prints' = '[{"printout":"base.prescription","what":"set-1"}]', 'the record read and the print merged in one row of care: neither lost')
  from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b1' and l.patient_id = :'pt' and l.purpose = 'TREAT';
select t.ok(l.what -> 'prints' = '[{"printout":"billing.receipt","what":"R-00412"}]', 'the receipt''s print in a row of its own purpose')
  from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b1' and l.patient_id = :'pt' and l.purpose = 'PATADMIN';
set role authenticated;
select t.as(:'ow');
select t.ok((select count(*) from jsonb_array_elements(public.read(jsonb_build_object('shape', 'log', 'patient_id', :'pt')) -> 'reads') r where r -> 'what' ? 'prints') = 3,
  'whoever reviews the read log sees each print: who, what, for whom, when');

\echo '── a record opened anyway (break the glass): a print from it carries the same purpose and reason, so it joins that read''s row'
select t.as(:'dr');
select t.ok(public.read(jsonb_build_object('shape', 'record', 'patient_id', :'pt', 'department_id', :'im', 'purpose', 'BTG', 'reason', 'unconscious, no one to ask')) is not null
  and public.read(jsonb_build_object('shape', 'printed', 'patient_id', :'pt', 'department_id', :'im', 'printout', 'base.prescription', 'what', 'set-2', 'purpose', 'BTG',
    'reason', 'unconscious, no one to ask')) ->> 'logged' = 'true', 'the doctor opens the record anyway, says why, and prints a prescription from it');
reset role;
select t.ok(l.reason = 'unconscious, no one to ask' and l.what ? 'records' and l.what -> 'prints' = '[{"printout":"base.prescription","what":"set-2"}]' and l.reads = 2,
  'one row of break the glass, with why: the read and the print from it, neither lost')
  from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b1' and l.patient_id = :'pt' and l.purpose = 'BTG';
select t.ok(not exists (select 1 from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000b1' and l.patient_id = :'pt' and l.purpose = 'TREAT'
  and l.what -> 'prints' @> '[{"what":"set-2"}]'), 'not as a read of care');
set role authenticated;

\echo '── refused: a printout that is not one, a patient not found, a purpose not known, a department not the clinic''s, who does not find patients'
select t.as(:'dr');
select t.refuses(format($q$select public.read(jsonb_build_object('shape', 'printed', 'patient_id', %L, 'printout', 'Labels'))$q$, :'pt'), 'bad_printout');
select t.refuses(format($q$select public.read(jsonb_build_object('shape', 'printed', 'patient_id', %L, 'printout', 'base.prescription', 'what', repeat('x', 201)))$q$, :'pt'), 'bad_printout');
select t.refuses($$select public.read('{"shape":"printed","patient_id":"00000000-0000-0000-0000-00000000dead","printout":"base.prescription"}')$$, 'not_found');
select t.refuses(format($q$select public.read(jsonb_build_object('shape', 'printed', 'patient_id', %L, 'printout', 'base.prescription', 'purpose', 'GOSSIP'))$q$, :'pt'), 'unknown_purpose');
select t.refuses(format($q$select public.read(jsonb_build_object('shape', 'printed', 'patient_id', %L, 'printout', 'base.prescription', 'department_id', '00000000-0000-0000-0000-00000000dead'))$q$, :'pt'), 'not_found');
select t.as(:'none');
select t.refuses(format($q$select public.read(jsonb_build_object('shape', 'printed', 'patient_id', %L, 'printout', 'base.prescription'))$q$, :'pt'), 'not_allowed');
reset role;
select t.ok(not exists (select 1 from core.read_log l where l.user_id = '00000000-0000-0000-0000-0000000000cc'), 'nothing refused was logged');
