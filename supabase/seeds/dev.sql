-- dev seed: one clinic through the public doors (never into tables), so a developer has an organization to log into.
-- Login ids match the auth users seeds/auth.sql creates (password Demo123!). Local only.

-- local development only: settings changes without a second factor
update core.server_settings set value = 'off' where key = 'require_mfa';

-- the owner's login makes the organization (and becomes its owner, held everywhere)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', false);
select public.create_organization('00000000-0000-0000-0000-00000000a001', 'Demo Clinic', '00000000-0000-0000-0000-000000000101', 'Admin');
select public.write_setting('{"key":"organization.time_zone","data":{"zone":"Africa/Cairo"}}');
select public.write_setting('{"key":"organization.packs_used","data":{"packs":["pharmacy"]}}');

-- departments: work is the core key (desk · visits · stays · bench · outside)
select public.save('department', '{"id":"00000000-0000-0000-0000-00000000d001","name":"Front desk","work":"desk","position":1}');
select public.save('department', '{"id":"00000000-0000-0000-0000-00000000d002","name":"General Practice","work":"visits","position":2}');
select public.save('department', '{"id":"00000000-0000-0000-0000-00000000d005","name":"Psychiatry","work":"visits","position":3}');
select public.save('department', '{"id":"00000000-0000-0000-0000-00000000d006","name":"Medical Ward","work":"stays","position":4}');
select public.save('department', '{"id":"00000000-0000-0000-0000-00000000d003","name":"Laboratory","work":"bench","position":5}');
select public.save('department', '{"id":"00000000-0000-0000-0000-00000000d004","name":"Pharmacy","work":"bench","position":6}');
-- a private department (spec §4.3): every note and result written there is private
select public.write_setting('{"key":"department.private","owner_id":"00000000-0000-0000-0000-00000000d005","data":{"private":true}}');
select public.write_setting('{"key":"department.encounter_class","owner_id":"00000000-0000-0000-0000-00000000d006","data":{"class":"IMP"}}');
select public.write_setting('{"key":"department.screens","owner_id":"00000000-0000-0000-0000-00000000d004","data":{"screens":["pharmacy.dispensing","base.bench"],"opens":"pharmacy.dispensing"}}');
-- the ward's beds
select public.save('place', jsonb_build_object('id', ('00000000-0000-0000-0000-0000000b0' || lpad(n::text, 3, '0'))::uuid, 'department_id', '00000000-0000-0000-0000-00000000d006',
  'label', 'bed', 'name', 'Bed ' || n, 'position', n)) from generate_series(1, 8) n;

-- services (settings rows owned by the performing department): LOINC codings, UCUM units, ranges, the steps the bench walks
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d003","thing_id":"00000000-0000-0000-0000-00000000c001","data":{
  "code":"cbc","name":"Complete blood count","section":"Haematology","coding":{"system":"loinc","code":"58410-2"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"hb","name":"Haemoglobin","coding":{"system":"loinc","code":"718-7"},"kind":"number","unit":"g/dL","ucum":"g/dL","low":12,"high":16,"critical_low":7,"critical_high":20,
   "ranges":[{"gender":"female","low":12,"high":15.5},{"gender":"male","low":13.5,"high":17.5}]},
  {"key":"wbc","name":"WBC","coding":{"system":"loinc","code":"6690-2"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":4,"high":11,"critical_low":1,"critical_high":30},
  {"key":"plt","name":"Platelets","coding":{"system":"loinc","code":"777-3"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":150,"high":400,"critical_low":50}]}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d003","thing_id":"00000000-0000-0000-0000-00000000c002","data":{
  "code":"hba1c","name":"HbA1c","section":"Chemistry","coding":{"system":"loinc","code":"4548-4"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"hba1c","name":"HbA1c","coding":{"system":"loinc","code":"4548-4"},"kind":"number","unit":"%","ucum":"%","low":4,"high":5.6}]}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d003","thing_id":"00000000-0000-0000-0000-00000000c003","data":{
  "code":"creat","name":"Creatinine","section":"Chemistry","coding":{"system":"loinc","code":"2160-0"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"creat","name":"Creatinine","coding":{"system":"loinc","code":"2160-0"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":0.6,"high":1.2,"critical_high":5}]}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d003","thing_id":"00000000-0000-0000-0000-00000000c004","data":{
  "code":"lipids","name":"Lipid panel","section":"Chemistry","coding":{"system":"loinc","code":"57698-3"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"chol","name":"Total cholesterol","coding":{"system":"loinc","code":"2093-3"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":200},
  {"key":"ldl","name":"LDL","coding":{"system":"loinc","code":"2089-1"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":100},
  {"key":"hdl","name":"HDL","coding":{"system":"loinc","code":"2085-9"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":40},
  {"key":"tg","name":"Triglycerides","coding":{"system":"loinc","code":"2571-8"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":150}]}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d003","thing_id":"00000000-0000-0000-0000-00000000c005","data":{
  "code":"cxr","name":"Chest X-ray","section":"Imaging","coding":{"system":"loinc","code":"36643-5"},"answer":"note"}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d003","thing_id":"00000000-0000-0000-0000-00000000c006","data":{
  "code":"lithium","name":"Lithium level","section":"Chemistry","coding":{"system":"loinc","code":"14334-7"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"li","name":"Lithium","coding":{"system":"loinc","code":"14334-7"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":0.6,"high":1.2,"critical_high":2}]}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d004","thing_id":"00000000-0000-0000-0000-00000000c007","data":{
  "code":"dispense","name":"Dispensing","answer":"pharmacy.dispense","steps":["prepared"]}}$j$);
select public.write_setting($j${"key":"service","owner_id":"00000000-0000-0000-0000-00000000d005","thing_id":"00000000-0000-0000-0000-00000000c008","data":{
  "code":"psych","name":"Psychiatry consult","answer":"note"}}$j$);

-- presets: a /shortcut and lines the composer runs; services it orders
select public.write_setting($j${"key":"preset","thing_id":"00000000-0000-0000-0000-00000000e001","data":{"name":"DM follow-up","shortcut":"dm",
  "services":["00000000-0000-0000-0000-00000000c002","00000000-0000-0000-0000-00000000c003","00000000-0000-0000-0000-00000000c004"],
  "department_id":"00000000-0000-0000-0000-00000000d002",
  "lines":["/rx metformin 500 bd 30d for dm","plan: review HbA1c and kidney function in 3 months; diet and exercise advice"]}}$j$);
select public.write_setting($j${"key":"preset","thing_id":"00000000-0000-0000-0000-00000000e002","data":{"name":"SOAP note","shortcut":"soap","lines":["S:","O:","A:","P:"]}}$j$);
select public.write_setting($j${"key":"preset","thing_id":"00000000-0000-0000-0000-00000000e003","data":{"name":"History & examination","shortcut":"hx","lines":["History:","Examination:"]}}$j$);

-- staff (login ids = auth users of the same id; created in seeds/auth.sql)
select public.save('user', $j${"id":"00000000-0000-0000-0000-000000000102","name":"Dr. Ali Hassan","title":"Dr","login_id":"00000000-0000-0000-0000-000000000102","holdings":[
  {"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-00000000d002"},
  {"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-00000000d006"}]}$j$);
select public.save('user', $j${"id":"00000000-0000-0000-0000-000000000104","name":"Sarah Nurse","login_id":"00000000-0000-0000-0000-000000000104","holdings":[
  {"role_id":"00000000-0000-0000-0000-00000000c003","department_id":"00000000-0000-0000-0000-00000000d002"},
  {"role_id":"00000000-0000-0000-0000-00000000c003","department_id":"00000000-0000-0000-0000-00000000d006"}]}$j$);
select public.save('user', $j${"id":"00000000-0000-0000-0000-000000000105","name":"Lab Tech","login_id":"00000000-0000-0000-0000-000000000105","holdings":[
  {"role_id":"00000000-0000-0000-0000-00000000c005","department_id":"00000000-0000-0000-0000-00000000d003"}]}$j$);
select public.save('user', $j${"id":"00000000-0000-0000-0000-000000000108","name":"Dr. Salma Adel","title":"Dr","login_id":"00000000-0000-0000-0000-000000000108","holdings":[
  {"role_id":"00000000-0000-0000-0000-00000000c002","department_id":"00000000-0000-0000-0000-00000000d005"}]}$j$);
select public.save('user', $j${"id":"00000000-0000-0000-0000-000000000109","name":"Pharmacist","login_id":"00000000-0000-0000-0000-000000000109","holdings":[
  {"role_id":"00000000-0000-0000-0000-00000000ca01","department_id":"00000000-0000-0000-0000-00000000d004"}]}$j$);
select public.save('user', $j${"id":"00000000-0000-0000-0000-000000000107","name":"Receptionist","login_id":"00000000-0000-0000-0000-000000000107","holdings":[
  {"role_id":"00000000-0000-0000-0000-00000000c004","department_id":"00000000-0000-0000-0000-00000000d001"}]}$j$);

select set_config('request.jwt.claim.sub', '', false);
select 'dev seed: ' || (select count(*) from core.departments) || ' departments · ' || (select count(*) from core.places) || ' beds · '
  || (select count(*) from core.settings where key = 'service') || ' services · ' || (select count(*) from core.users) || ' users' as seeded;
