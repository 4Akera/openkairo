-- The base's seed (spec/openCare.md §5.1 rule 9): the demo clinic, its departments and places, services, presets and staff, a
-- demo person for each of the base's built-in roles. Written through the doors by the kit (demo_kit.sql, which runs first); run
-- again, it adds only what is missing. Its day is supabase/demo/base.sql. Logins: the kit's demo.password(). Local only.

select demo.layer('base');

-- the owner's login makes the organization (and holds everything everywhere)
select demo.clinic('Demo Clinic', 'admin@demo.com', 'Amira Lotfy');

-- departments, each made from the base's starter setup for its kind (§5.2): its Screens line, settings, beds, services and presets.
-- Run again, the setup door adds only what is missing and never overwrites what staff changed
select demo.setup(demo.base('desk'), 'front_desk', 'Front desk', 1);
select demo.setup(demo.base('gp'), 'clinic', 'General Practice', 2);
select demo.setup(demo.base('psychiatry'), 'clinic', 'Psychiatry', 3);
select demo.setup(demo.base('ward'), 'ward', 'Medical Ward', 4);
select demo.setup(demo.base('lab'), 'laboratory', 'Laboratory', 5);

-- what this clinic changed since, as staff would in Settings: a private department (spec §4.3: every note and result written there is
-- private); the lab's chest X-ray, answered with a note; a psychiatry consult
select demo.setting('department.private', demo.base('psychiatry'), null, '{"private":true}');
select demo.setting('service', demo.base('lab'), '00000000-0000-0000-0000-00000000c005', $j${
  "code":"cxr","name":"Chest X-ray","section":"Imaging","coding":{"system":"loinc","code":"36643-5"},"answer":"note"}$j$);
select demo.setting('service', demo.base('psychiatry'), '00000000-0000-0000-0000-00000000c008', $j${"code":"psych","name":"Psychiatry consult","answer":"note"}$j$);

-- the clinic's presets: a /shortcut and lines the composer runs; services it orders
select demo.setting('preset', null, '00000000-0000-0000-0000-00000000e001', jsonb_build_object('name', 'DM follow-up', 'shortcut', 'dm',
  'services', jsonb_build_array(demo.service('hba1c') -> 'id', demo.service('creat') -> 'id', demo.service('lipids') -> 'id'), 'department_id', demo.base('gp'),
  'lines', jsonb_build_array('/rx metformin 500 bd 30d for dm', 'plan: review HbA1c and kidney function in 3 months; diet and exercise advice')));
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
