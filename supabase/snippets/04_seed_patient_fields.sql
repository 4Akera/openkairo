-- Seed patient_field_definitions with default demographics fields.
-- Run this once in Supabase SQL Editor if the New Patient dialog appears empty.

insert into patient_field_definitions (label, slug, field_type, is_required, is_system, sort_order, options) values
  ('First Name',         'first_name',         'text',     true,  true,  10, '[]'::jsonb),
  ('Last Name',          'last_name',           'text',     true,  true,  20, '[]'::jsonb),
  ('Date of Birth',      'date_of_birth',       'date',     false, true,  30, '[]'::jsonb),
  ('Gender',             'gender',              'select',   false, false, 40,
    '[{"value":"Male","label":"Male"},{"value":"Female","label":"Female"},{"value":"Non-binary","label":"Non-binary"},{"value":"Other","label":"Other"}]'::jsonb),
  ('Blood Group',        'blood_group',         'select',   false, false, 50,
    '[{"value":"A+","label":"A+"},{"value":"A-","label":"A−"},{"value":"B+","label":"B+"},{"value":"B-","label":"B−"},{"value":"AB+","label":"AB+"},{"value":"AB-","label":"AB−"},{"value":"O+","label":"O+"},{"value":"O-","label":"O−"}]'::jsonb),
  ('Phone',              'phone',               'text',     false, false, 60, '[]'::jsonb),
  ('Email',              'email',               'text',     false, false, 70, '[]'::jsonb),
  ('Address',            'address',             'textarea', false, false, 80, '[]'::jsonb),
  ('Nationality',        'nationality',         'text',     false, false, 90, '[]'::jsonb),
  ('Marital Status',     'marital_status',      'select',   false, false, 100,
    '[{"value":"Single","label":"Single"},{"value":"Married","label":"Married"},{"value":"Divorced","label":"Divorced"},{"value":"Widowed","label":"Widowed"}]'::jsonb),
  ('Occupation',         'occupation',          'text',     false, false, 110, '[]'::jsonb),
  ('Emergency Contact',  'emergency_contact',   'text',     false, false, 120, '[]'::jsonb),
  ('Emergency Phone',    'emergency_phone',     'text',     false, false, 130, '[]'::jsonb),
  ('Emergency Relation', 'emergency_relation',  'text',     false, false, 140, '[]'::jsonb)
on conflict (slug) do nothing;
