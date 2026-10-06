-- The base's seed (spec/openCare.md §5.1 rule 9): the demo clinic, its departments and places, services, presets and staff, a
-- demo person for each of the base's built-in roles. Written through the doors by the kit (demo_kit.sql, which runs first); run
-- again, it adds only what is missing. Its day is supabase/demo/base.sql. Logins: the kit's demo.password(). Local only.

-- the owner's login makes the organization (and holds everything everywhere)
select demo.clinic('Demo Clinic', 'admin@demo.com', 'Amira Lotfy');

-- departments: work is the core key (desk · visits · stays · bench · outside)
select demo.department(demo.base('desk'), 'Front desk', 'desk', 1);
select demo.department(demo.base('gp'), 'General Practice', 'visits', 2);
select demo.department(demo.base('psychiatry'), 'Psychiatry', 'visits', 3);
select demo.department(demo.base('ward'), 'Medical Ward', 'stays', 4);
select demo.department(demo.base('lab'), 'Laboratory', 'bench', 5);
-- a private department (spec §4.3): every note and result written there is private; the ward's stays are inpatient encounters
select demo.setting('department.private', demo.base('psychiatry'), null, '{"private":true}');
select demo.setting('department.encounter_class', demo.base('ward'), null, '{"class":"IMP"}');
-- the ward's beds
select demo.place(demo.bed(n), demo.base('ward'), 'bed', 'Bed ' || n, n) from generate_series(1, 8) n;

-- services (settings rows owned by the performing department): LOINC codings, UCUM units, ranges, the steps the bench walks
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c001', $j${
  "code":"cbc","name":"Complete blood count","section":"Haematology","coding":{"system":"loinc","code":"58410-2"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"hb","name":"Haemoglobin","coding":{"system":"loinc","code":"718-7"},"kind":"number","unit":"g/dL","ucum":"g/dL","low":12,"high":16,"critical_low":7,"critical_high":20,
   "ranges":[{"gender":"female","low":12,"high":15.5},{"gender":"male","low":13.5,"high":17.5}]},
  {"key":"wbc","name":"WBC","coding":{"system":"loinc","code":"6690-2"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":4,"high":11,"critical_low":1,"critical_high":30},
  {"key":"plt","name":"Platelets","coding":{"system":"loinc","code":"777-3"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":150,"high":400,"critical_low":50}]}$j$);
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c002', $j${
  "code":"hba1c","name":"HbA1c","section":"Chemistry","coding":{"system":"loinc","code":"4548-4"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"hba1c","name":"HbA1c","coding":{"system":"loinc","code":"4548-4"},"kind":"number","unit":"%","ucum":"%","low":4,"high":5.6}]}$j$);
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c003', $j${
  "code":"creat","name":"Creatinine","section":"Chemistry","coding":{"system":"loinc","code":"2160-0"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"creat","name":"Creatinine","coding":{"system":"loinc","code":"2160-0"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":0.6,"high":1.2,"critical_high":5}]}$j$);
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c004', $j${
  "code":"lipids","name":"Lipid panel","section":"Chemistry","coding":{"system":"loinc","code":"57698-3"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"chol","name":"Total cholesterol","coding":{"system":"loinc","code":"2093-3"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":200},
  {"key":"ldl","name":"LDL","coding":{"system":"loinc","code":"2089-1"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":100},
  {"key":"hdl","name":"HDL","coding":{"system":"loinc","code":"2085-9"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":40},
  {"key":"tg","name":"Triglycerides","coding":{"system":"loinc","code":"2571-8"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":150}]}$j$);
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c005', $j${
  "code":"cxr","name":"Chest X-ray","section":"Imaging","coding":{"system":"loinc","code":"36643-5"},"answer":"note"}$j$);
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c006', $j${
  "code":"lithium","name":"Lithium level","section":"Chemistry","coding":{"system":"loinc","code":"14334-7"},"answer":"result","steps":["collected","received"],"fields":[
  {"key":"li","name":"Lithium","coding":{"system":"loinc","code":"14334-7"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":0.6,"high":1.2,"critical_high":2}]}$j$);
select demo.setting('service', demo.base('psychiatry'), '00000000-0000-0000-0000-00000000c008', $j${"code":"psych","name":"Psychiatry consult","answer":"note"}$j$);

-- presets: a /shortcut and lines the composer runs; services it orders
select demo.setting('preset', null, '00000000-0000-0000-0000-00000000e001', $j${"name":"DM follow-up","shortcut":"dm",
  "services":["00000000-0000-0000-0000-00000000c002","00000000-0000-0000-0000-00000000c003","00000000-0000-0000-0000-00000000c004"],
  "department_id":"00000000-0000-0000-0000-00000000d002",
  "lines":["/rx metformin 500 bd 30d for dm","plan: review HbA1c and kidney function in 3 months; diet and exercise advice"]}$j$);
select demo.setting('preset', null, '00000000-0000-0000-0000-00000000e002', '{"name":"SOAP note","shortcut":"soap","lines":["S:","O:","A:","P:"]}');
select demo.setting('preset', null, '00000000-0000-0000-0000-00000000e003', '{"name":"History & examination","shortcut":"hx","lines":["History:","Examination:"]}');

-- staff: one demo person for each of the base's built-in roles (the owner above), each where the role is used
select demo.person(demo.base('doctor'), 'dr.ali@demo.com', 'Dr. Ali Hassan', 'Dr');
select demo.grant(demo.base('doctor'), demo.base('role:doctor'), demo.base('gp'));
select demo.grant(demo.base('doctor'), demo.base('role:doctor'), demo.base('ward'));
select demo.person(demo.base('psychiatrist'), 'psych@demo.com', 'Dr. Salma Adel', 'Dr');
select demo.grant(demo.base('psychiatrist'), demo.base('role:doctor'), demo.base('psychiatry'));
select demo.person(demo.base('nurse'), 'nurse@demo.com', 'Sara Mahmoud');
select demo.grant(demo.base('nurse'), demo.base('role:nurse'), demo.base('gp'));
select demo.grant(demo.base('nurse'), demo.base('role:nurse'), demo.base('ward'));
select demo.person(demo.base('reception'), 'reception@demo.com', 'Mai Samir');
select demo.grant(demo.base('reception'), demo.base('role:reception'), demo.base('desk'));
select demo.person(demo.base('tech'), 'lab@demo.com', 'Karim Fawzy');
select demo.grant(demo.base('tech'), demo.base('role:lab_technician'), demo.base('lab'));

select 'base seed: ' || (select count(*) from core.departments where organization_id = demo.base('clinic')) || ' departments · '
  || (select count(*) from core.places where organization_id = demo.base('clinic')) || ' beds · '
  || (select count(*) from core.users where organization_id = demo.base('clinic')) || ' users' as seeded;
