-- dev seed: one clinic through the public birth path, so a developer has an organization to log into.
-- login ids match the auth users seeds/auth.sql creates (password Demo123!).
select public.create_organization('00000000-0000-0000-0000-00000000a001', 'Demo Clinic', '00000000-0000-0000-0000-000000000101', 'Admin', '00000000-0000-0000-0000-000000000101');
-- act as the owner for the rest (what the client would do after first login; MFA is not checked off the API)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', false);
select public.save_department('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000a001', 'reception', 'Front desk', serves := '{}');
select public.save_department('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000a001', 'clinic',    'Internal Medicine');
select public.save_department('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000a001', 'ancillary', 'Laboratory');
-- the pharmacy pack: enabled for this clinic; its department type makes Pharmacy a dispensing bench
select public.save_organization_pack('00000000-0000-0000-0000-00000000a001', 'pharmacy');
select public.save_department('00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000a001', 'pharmacy', 'Pharmacy');
-- a department whose visits are private from the start (spec 07)
select public.save_department('00000000-0000-0000-0000-00000000d005', '00000000-0000-0000-0000-00000000a001', 'clinic', 'Psychiatry', private_visits := true);
insert into core.served_departments (department_id, served_department_id) values ('00000000-0000-0000-0000-00000000d001', null), ('00000000-0000-0000-0000-00000000d003', null), ('00000000-0000-0000-0000-00000000d004', null);
insert into core.codes (code, name, kind, unit) values
  ('loinc:718-7', 'Haemoglobin', 'number', 'g/dL'), ('loinc:6690-2', 'White cell count', 'number', '10^9/L'), ('loinc:777-3', 'Platelets', 'number', '10^9/L'),
  ('loinc:4548-4', 'HbA1c', 'number', '%'), ('loinc:2160-0', 'Creatinine', 'number', 'mg/dL'), ('loinc:2093-3', 'Total cholesterol', 'number', 'mg/dL'),
  ('loinc:2089-1', 'LDL cholesterol', 'number', 'mg/dL'), ('loinc:2085-9', 'HDL cholesterol', 'number', 'mg/dL'), ('loinc:2571-8', 'Triglycerides', 'number', 'mg/dL')
on conflict do nothing;
select public.save_service('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000d003', 'cbc', 'Complete blood count', 'result', 'Haematology',
  '[{"code":"loinc:718-7","name":"Haemoglobin","unit":"g/dL","reference_low":12,"reference_high":16,"critical_low":7},{"code":"loinc:6690-2","name":"WBC","unit":"10^9/L","reference_low":4,"reference_high":11},{"code":"loinc:777-3","name":"Platelets","unit":"10^9/L","reference_low":150,"reference_high":400,"critical_low":50}]');
select public.save_service('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000d003', 'hba1c', 'HbA1c', 'result', 'Chemistry', '[{"code":"loinc:4548-4","name":"HbA1c","unit":"%","reference_low":4,"reference_high":5.6}]');
select public.save_service('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000d003', 'creat', 'Creatinine', 'result', 'Chemistry', '[{"code":"loinc:2160-0","name":"Creatinine","unit":"mg/dL","reference_low":0.6,"reference_high":1.2,"critical_high":5}]');
select public.save_service('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000d003', 'lipids', 'Lipid panel', 'result', 'Chemistry',
  '[{"code":"loinc:2093-3","name":"Total cholesterol","unit":"mg/dL","reference_high":200},{"code":"loinc:2089-1","name":"LDL","unit":"mg/dL","reference_high":100},{"code":"loinc:2085-9","name":"HDL","unit":"mg/dL","reference_low":40},{"code":"loinc:2571-8","name":"Triglycerides","unit":"mg/dL","reference_high":150}]');
select public.save_service('00000000-0000-0000-0000-00000000c007', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000d004', 'dispense', 'Dispensing', 'pharmacy_dispense');
select public.save_template('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a001', 'DM follow-up', '[{"service_id":"00000000-0000-0000-0000-00000000c002"},{"service_id":"00000000-0000-0000-0000-00000000c003"},{"service_id":"00000000-0000-0000-0000-00000000c004"}]', '00000000-0000-0000-0000-00000000d002');
-- staff (login ids = auth users of the same id; created in seeds/auth.sql)
select public.save_user('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-00000000a001', 'staff', 'Dr. Ali Hassan', 'Dr', '[{"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-00000000d002"}]');
select public.save_user('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-00000000a001', 'staff', 'Sarah Nurse',   null, '[{"role_id":"00000000-0000-0000-0000-00000000c003","department_id":"00000000-0000-0000-0000-00000000d002"}]');
select public.save_user('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-00000000a001', 'staff', 'Lab Tech',      null, '[{"role_id":"00000000-0000-0000-0000-00000000c005","department_id":"00000000-0000-0000-0000-00000000d003"}]');
select public.save_user('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-00000000a001', 'staff', 'Dr. Salma Adel', 'Dr', '[{"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-00000000d005"}]');
select public.save_user('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-00000000a001', 'staff', 'Pharmacist', null, '[{"role_id":"00000000-0000-0000-0000-00000000ca01","department_id":"00000000-0000-0000-0000-00000000d004"}]');
select public.save_user('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-00000000a001', 'staff', 'Receptionist',  null, '[{"role_id":"00000000-0000-0000-0000-00000000c004","department_id":"00000000-0000-0000-0000-00000000d001"}]');
update core.users set login_id = id, accepted_at = now() where organization_id = '00000000-0000-0000-0000-00000000a001' and kind = 'staff';
select set_config('request.jwt.claim.sub', '', false);
select 'dev seed: ' || (select count(*) from core.departments) || ' departments · ' || (select count(*) from core.services) || ' services · ' || (select count(*) from core.users) || ' users' as seeded;

-- local development only: settings changes without a second factor (migration 0019)
insert into core.server_settings (key, value) values ('require_mfa', 'off') on conflict (key) do update set value = 'off';
