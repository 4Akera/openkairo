-- 0031: what the composer's change and update cards send — a change can turn PRN off and clear instructions,
-- an update can clear a problem's note and onset; a key left out keeps what the list holds
\set org  '00000000-0000-0000-0000-0000000000a1'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set dr   '00000000-0000-0000-0000-0000000000b1'
\set jdr  '11111111-0000-0000-0000-0000000000b1'
\set pt   '00000000-0000-0000-0000-0000000000f1'
insert into core.organizations (id, name) values (:'org', 'Demo');
insert into core.users (id, organization_id, kind, name, login_id) values (:'dr', :'org', 'staff', 'Dr Ali', :'jdr');
insert into core.departments (id, organization_id, type, name) values (:'im', :'org', 'clinic', 'Internal Medicine');
insert into core.user_roles (organization_id, user_id, role_id, department_id) values (:'org', :'dr', '00000000-0000-0000-0000-00000000c002', null);
insert into core.record_numbers values (:'org', 0);
insert into core.patients (id, organization_id, record_number, given_name, family_name, sex, born_on) values (:'pt', :'org', 1, 'Ahmed', 'Hassan', 'male', '1968-03-14');
select set_config('request.jwt.claim.sub', :'jdr', false);
set role authenticated;

\echo '── a PRN medicine, then a change that turns PRN off and clears the instructions'
select display_line from public.write_prescription('00000000-0000-0000-0000-0000000000e1', :'pt', null, :'im', drug := '{"name":"Paracetamol"}', dose_number := 1, dose_unit := 'g',
  route := 'oral', frequency := 'PRN', prn := true, prn_reason_text := 'pain', instructions_text := 'after food');
select display_line from public.write_prescription('00000000-0000-0000-0000-0000000000e2', :'pt', null, :'im', action := 'change', medication_id := '00000000-0000-0000-0000-0000000000e1',
  dose_number := 1, dose_unit := 'g', route := 'oral', frequency := 'QDS', prn := false, instructions_text := '');
reset role;
select case when not prn and prn_reason_text is null and instructions_text is null and frequency = 'QDS' then 'ok change cleared PRN and instructions' else 'FAIL change: ' || prn || ' ' || coalesce(prn_reason_text, '-') || ' ' || coalesce(instructions_text, '-') end
  from core.patient_medications where id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;
\echo '── a change that names instructions keeps them; one that leaves them out keeps the list'
select display_line from public.write_prescription('00000000-0000-0000-0000-0000000000e3', :'pt', null, :'im', action := 'change', medication_id := '00000000-0000-0000-0000-0000000000e1',
  dose_number := 500, dose_unit := 'mg', frequency := 'QDS', instructions_text := 'with water');
select display_line from public.write_prescription('00000000-0000-0000-0000-0000000000e4', :'pt', null, :'im', action := 'change', medication_id := '00000000-0000-0000-0000-0000000000e1',
  dose_number := 1, dose_unit := 'g', frequency := 'TDS');
reset role;
select case when instructions_text = 'with water' and frequency = 'TDS' and dose_number = 1 then 'ok a change without instructions keeps them' else 'FAIL kept: ' || coalesce(instructions_text, '-') end
  from core.patient_medications where id = '00000000-0000-0000-0000-0000000000e1';
set role authenticated;

\echo '── a problem with an onset and a note; an update clears both; one that leaves them out keeps them'
select display_line from public.write_problem('00000000-0000-0000-0000-0000000000e5', :'pt', null, :'im', name := 'Hypertension', code := 'icd10:I10', onset_on := '2019', text := 'poorly controlled');
select display_line from public.write_problem('00000000-0000-0000-0000-0000000000e6', :'pt', null, :'im', action := 'update', problem_id := '00000000-0000-0000-0000-0000000000e5', certainty := 'suspected');
reset role;
select case when onset_on = '2019' and note_text = 'poorly controlled' and certainty = 'suspected' then 'ok an update keeps what it leaves out' else 'FAIL update kept' end
  from core.patient_problems where id = '00000000-0000-0000-0000-0000000000e5';
set role authenticated;
select case when display_line = 'Problem updated: Hypertension' then 'ok the line says nothing of what was cleared' else 'FAIL line: ' || display_line end
  from public.write_problem('00000000-0000-0000-0000-0000000000e7', :'pt', null, :'im', action := 'update', problem_id := '00000000-0000-0000-0000-0000000000e5', onset_on := '', text := '');
reset role;
select case when onset_on is null and note_text is null then 'ok an update cleared the onset and the note' else 'FAIL update cleared: ' || coalesce(onset_on, '-') || ' ' || coalesce(note_text, '-') end
  from core.patient_problems where id = '00000000-0000-0000-0000-0000000000e5';
\echo '── the lists rebuild to the same rows'
select core.rebuild_record(:'pt');
select case when (select onset_on is null and note_text is null from core.patient_problems where id = '00000000-0000-0000-0000-0000000000e5')
  and (select not prn and instructions_text = 'with water' from core.patient_medications where id = '00000000-0000-0000-0000-0000000000e1') then 'ok rebuild agrees' else 'FAIL rebuild' end;
