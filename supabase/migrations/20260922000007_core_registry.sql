-- 0007 · the registry rows core ships (specs 02, 04): actions, roles, department types, entry types, codes
insert into core.actions (key) values
  ('read:patient'),('write:patient'),('read:record'),('read:queue'),('read:organization'),('read:cohort'),
  ('write:visit'),('mark:in_consult'),
  ('write:request'),('write:result'),('write:prescription'),('write:note'),('write:vitals'),('write:problem'),('write:allergy'),('write:list_review'),('write:entered_in_error'),
  ('mark:sent'),('mark:held'),('mark:started'),('mark:done'),('mark:cancelled'),('mark:routing'),('mark:reviewed'),
  ('manage:organization'),('manage:departments'),('manage:services'),('manage:users'),('manage:roles'),('manage:templates'),('manage:patients'),
  ('read:settings_changes'),('read:record_reads');

-- built-in roles: organization_id NULL, read-only
insert into core.roles (id, organization_id, key, name) values
  ('00000000-0000-0000-0000-00000000c001', null, 'owner',        'Owner'),
  ('00000000-0000-0000-0000-00000000c002', null, 'doctor',       'Doctor'),
  ('00000000-0000-0000-0000-00000000c003', null, 'nurse',        'Nurse'),
  ('00000000-0000-0000-0000-00000000c004', null, 'receptionist', 'Receptionist'),
  ('00000000-0000-0000-0000-00000000c005', null, 'technician',   'Technician');

insert into core.role_actions (role_id, action)
  select '00000000-0000-0000-0000-00000000c001', key from core.actions;                        -- owner: everything
insert into core.role_actions (role_id, action) values
  ('00000000-0000-0000-0000-00000000c002','read:patient'),('00000000-0000-0000-0000-00000000c002','write:patient'),('00000000-0000-0000-0000-00000000c002','read:record'),
  ('00000000-0000-0000-0000-00000000c002','read:queue'),('00000000-0000-0000-0000-00000000c002','read:organization'),('00000000-0000-0000-0000-00000000c002','write:visit'),
  ('00000000-0000-0000-0000-00000000c002','mark:in_consult'),('00000000-0000-0000-0000-00000000c002','write:request'),('00000000-0000-0000-0000-00000000c002','write:result'),
  ('00000000-0000-0000-0000-00000000c002','write:prescription'),('00000000-0000-0000-0000-00000000c002','write:note'),('00000000-0000-0000-0000-00000000c002','write:vitals'),
  ('00000000-0000-0000-0000-00000000c002','write:problem'),('00000000-0000-0000-0000-00000000c002','write:allergy'),('00000000-0000-0000-0000-00000000c002','write:list_review'),
  ('00000000-0000-0000-0000-00000000c002','write:entered_in_error'),('00000000-0000-0000-0000-00000000c002','mark:cancelled'),('00000000-0000-0000-0000-00000000c002','mark:routing'),
  ('00000000-0000-0000-0000-00000000c002','mark:reviewed'),('00000000-0000-0000-0000-00000000c002','mark:done'),
  ('00000000-0000-0000-0000-00000000c003','read:patient'),('00000000-0000-0000-0000-00000000c003','write:patient'),('00000000-0000-0000-0000-00000000c003','read:record'),
  ('00000000-0000-0000-0000-00000000c003','read:queue'),('00000000-0000-0000-0000-00000000c003','read:organization'),('00000000-0000-0000-0000-00000000c003','write:visit'),
  ('00000000-0000-0000-0000-00000000c003','mark:in_consult'),('00000000-0000-0000-0000-00000000c003','write:note'),('00000000-0000-0000-0000-00000000c003','write:vitals'),
  ('00000000-0000-0000-0000-00000000c003','write:allergy'),('00000000-0000-0000-0000-00000000c003','write:list_review'),('00000000-0000-0000-0000-00000000c003','mark:started'),
  ('00000000-0000-0000-0000-00000000c004','read:patient'),('00000000-0000-0000-0000-00000000c004','write:patient'),('00000000-0000-0000-0000-00000000c004','read:queue'),
  ('00000000-0000-0000-0000-00000000c004','read:organization'),('00000000-0000-0000-0000-00000000c004','write:visit'),
  ('00000000-0000-0000-0000-00000000c005','read:patient'),('00000000-0000-0000-0000-00000000c005','read:queue'),('00000000-0000-0000-0000-00000000c005','read:organization'),
  ('00000000-0000-0000-0000-00000000c005','write:visit'),('00000000-0000-0000-0000-00000000c005','write:result'),('00000000-0000-0000-0000-00000000c005','mark:started'),
  ('00000000-0000-0000-0000-00000000c005','mark:done'),('00000000-0000-0000-0000-00000000c005','mark:cancelled');

insert into core.department_types (key, name, pack, is_visited) values
  ('clinic',    'Clinic',    null, true),
  ('reception', 'Reception', null, true),
  ('ward',      'Ward',      null, true),
  ('ancillary', 'Ancillary', null, false),
  ('outside',   'Outside',   null, false);

insert into core.entry_types (key, name, pack, list) values
  ('request',          'Request',          null, null),
  ('result',           'Result',           null, null),
  ('prescription',     'Prescription',     null, 'medications'),
  ('note',             'Note',             null, null),
  ('vitals',           'Vitals',           null, null),
  ('problem',          'Problem',          null, 'problems'),
  ('allergy',          'Allergy',          null, 'allergies'),
  ('list_review',      'List review',      null, null),
  ('entered_in_error', 'Entered in error', null, null);

-- global codes: the vitals set (LOINC), one unit per code
insert into core.codes (code, name, kind, unit) values
  ('loinc:8480-6',  'Systolic blood pressure',  'number', 'mmHg'),
  ('loinc:8462-4',  'Diastolic blood pressure', 'number', 'mmHg'),
  ('loinc:8867-4',  'Heart rate',               'number', 'bpm'),
  ('loinc:9279-1',  'Respiratory rate',         'number', '/min'),
  ('loinc:8310-5',  'Body temperature',         'number', '°C'),
  ('loinc:59408-5', 'Oxygen saturation',        'number', '%'),
  ('loinc:29463-7', 'Body weight',              'number', 'kg'),
  ('loinc:8302-2',  'Body height',              'number', 'cm'),
  ('loinc:39156-5', 'Body mass index',          'number', 'kg/m2');
