-- ============================================================
-- OpenKairo — Demo Seed Data (English Names)
--
-- Prerequisites: run schema.sql first (or wipe_all.sql + schema.sql)
--
-- Password for all accounts: Demo123!
--
-- Demo accounts:
--   admin@demo.com          Dr. James Harrison     — Every role; member of Lab + Radiology (demo convenience)
--   dr.emily@demo.com       Dr. Emily Carter       — Physician (Internal Medicine)
--   dr.michael@demo.com     Dr. Michael Bennett    — Physician (General Surgery)
--   nurse.sarah@demo.com    Sarah O'Brien RN       — Nurse
--   lab.tech@demo.com       Thomas Wright          — Lab role (non-system); dept portal
--   radio.tech@demo.com     Maria Santos           — Radiology role (non-system); dept portal
--   reception@demo.com      Lisa Anderson          — Receptionist
--   billing@demo.com        Patricia Evans         — Billing
--
-- Non-system roles (demo): lab, radiology — department workflows without nurse/physician permissions
--
-- Patients:
--   MRN-1001  Robert Mitchell  — Inpatient: community-acquired pneumonia (sole demo patient)
--
-- Departments:
--   Lab / Radiology — orders only (can_create_direct false); fulfilled results on timeline, not as walk-in History dupes
--   Result block types are is_dept_only (schema); fees: per-panel / per-study rules + manual fees (confirm mode)
-- ============================================================

do $$
declare
  -- Fixed user IDs
  v_admin    uuid := '00000000-0000-0000-0000-000000000001';
  v_emily    uuid := '00000000-0000-0000-0000-000000000002';
  v_michael  uuid := '00000000-0000-0000-0000-000000000003';
  v_nurse    uuid := '00000000-0000-0000-0000-000000000004';
  v_lab      uuid := '00000000-0000-0000-0000-000000000005';
  v_recep    uuid := '00000000-0000-0000-0000-000000000006';
  v_billing  uuid := '00000000-0000-0000-0000-000000000007';
  v_radio    uuid := '00000000-0000-0000-0000-000000000008';

  -- Patient / encounter IDs
  v_pt1  uuid := gen_random_uuid();  -- Robert Mitchell (inpatient)
  v_enc1 uuid := gen_random_uuid();  -- Inpatient — Pneumonia (open)

  -- Role IDs
  v_role_admin     uuid;
  v_role_physician uuid;
  v_role_nurse     uuid;
  v_role_recep     uuid;
  v_role_billing   uuid;
  v_role_lab       uuid;
  v_role_radio     uuid;

begin

  -- ============================================================
  -- 1. USERS
  -- ============================================================

  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at,
    is_super_admin, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values
    (v_admin,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@demo.com',       crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Dr. James Harrison"}'::jsonb,   now(), now(), false, '', '', '', ''),
    (v_emily,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'dr.emily@demo.com',    crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Dr. Emily Carter"}'::jsonb,     now(), now(), false, '', '', '', ''),
    (v_michael, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'dr.michael@demo.com',  crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Dr. Michael Bennett"}'::jsonb,  now(), now(), false, '', '', '', ''),
    (v_nurse,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'nurse.sarah@demo.com', crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Sarah O''Brien RN"}'::jsonb,    now(), now(), false, '', '', '', ''),
    (v_lab,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'lab.tech@demo.com',    crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Thomas Wright"}'::jsonb,        now(), now(), false, '', '', '', ''),
    (v_recep,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'reception@demo.com',   crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Lisa Anderson"}'::jsonb,        now(), now(), false, '', '', '', ''),
    (v_billing, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'billing@demo.com',     crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Patricia Evans"}'::jsonb,       now(), now(), false, '', '', '', ''),
    (v_radio,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'radio.tech@demo.com',  crypt('Demo123!', gen_salt('bf')), now(),
     '{"full_name":"Maria Santos"}'::jsonb,         now(), now(), false, '', '', '', '')
  on conflict (id) do nothing;

  insert into profiles (id, full_name) values
    (v_admin,   'Dr. James Harrison'),
    (v_emily,   'Dr. Emily Carter'),
    (v_michael, 'Dr. Michael Bennett'),
    (v_nurse,   'Sarah O''Brien RN'),
    (v_lab,     'Thomas Wright'),
    (v_recep,   'Lisa Anderson'),
    (v_billing, 'Patricia Evans'),
    (v_radio,   'Maria Santos')
  on conflict (id) do update set full_name = excluded.full_name;

  -- ============================================================
  -- 2. ROLE ASSIGNMENTS
  -- ============================================================

  insert into roles (name, slug, description, is_system, sort_order, permissions) values
    ('System Admin',   'admin',        'Full access to all features including user and role management', true, 10,
     array['block.add','admin.manage_users','admin.manage_blocks','admin.manage_templates','template.create',
           'billing.charge','billing.payment','billing.manage_fees']),
    ('Physician',      'physician',    'Full clinical access — create encounters, add all block types, edit patient records', true, 20,
     array['block.add','template.create']),
    ('Nurse',          'nurse',        'Can add blocks and view encounters; cannot create encounters or edit master record', true, 30,
     array['block.add']),
    ('Receptionist',   'receptionist', 'Can register patients and create/assign encounters', true, 40,
     array[]::text[]),
    ('Billing',        'billing',      'Can manage charges, receive payments, and generate invoices', true, 45,
     array['billing.charge','billing.payment','billing.manage_fees']::text[])
  on conflict (slug) do nothing;

  insert into roles (name, slug, description, is_system, sort_order, permissions) values
    ('Lab',       'lab',       'Laboratory staff — department portal fulfilment (demo; non-system)',       false, 32, array[]::text[]),
    ('Radiology', 'radiology', 'Radiology staff — department portal fulfilment (demo; non-system)',      false, 33, array[]::text[])
  on conflict (slug) do update set
    name        = excluded.name,
    description = excluded.description,
    is_system   = excluded.is_system,
    sort_order  = excluded.sort_order,
    permissions = excluded.permissions;

  select id into v_role_admin     from roles where slug = 'admin';
  select id into v_role_physician from roles where slug = 'physician';
  select id into v_role_nurse     from roles where slug = 'nurse';
  select id into v_role_recep     from roles where slug = 'receptionist';
  select id into v_role_billing   from roles where slug = 'billing';
  select id into v_role_lab       from roles where slug = 'lab';
  select id into v_role_radio     from roles where slug = 'radiology';

  -- Demo lab account uses the dedicated `lab` role, not nurse (idempotent re-seed)
  delete from user_roles ur
  using roles r
  where ur.user_id = v_lab and ur.role_id = r.id and r.slug = 'nurse';

  insert into user_roles (user_id, role_id) values
    (v_admin,   v_role_admin),
    (v_admin,   v_role_physician),
    (v_admin,   v_role_nurse),
    (v_admin,   v_role_recep),
    (v_admin,   v_role_billing),
    (v_admin,   v_role_lab),
    (v_admin,   v_role_radio),
    (v_emily,   v_role_physician),
    (v_michael, v_role_physician),
    (v_nurse,   v_role_nurse),
    (v_lab,     v_role_lab),
    (v_radio,   v_role_radio),
    (v_recep,   v_role_recep),
    (v_billing, v_role_billing)
  on conflict do nothing;

  -- ============================================================
  -- 3. PATIENTS
  -- ============================================================

  insert into patients (id, mrn, first_name, middle_name, last_name, date_of_birth, gender, phone, blood_group, created_by) values
    (v_pt1, 'MRN-' || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 7)),
     'Robert',   'James',       'Mitchell', '1963-02-14', 'Male',   '+1 555 201 4433', 'A+', v_recep);

  -- Problems
  insert into patient_problems (patient_id, problem, status, importance, created_by) values
    (v_pt1, 'Community-Acquired Pneumonia',       'active',   'high',   v_emily),
    (v_pt1, 'COPD — GOLD Stage II',               'active',   'high',   v_emily),
    (v_pt1, 'Hypertension',                       'active',   'medium', v_emily),
    (v_pt1, 'Ex-smoker (30 pack-years)',          'active',   'low',    v_emily);

  -- Medications
  insert into patient_medications (patient_id, medication_name, dosage, frequency, route, status, prescriber, created_by) values
    -- Robert Mitchell — home meds only (inpatient antibiotics etc. documented in encounter notes / plan)
    (v_pt1, 'Budesonide/Formoterol',   '400/12mcg',    'Twice daily',    'Inhaled',   'active', 'Dr. Emily Carter',    v_emily),
    (v_pt1, 'Amlodipine',              '10mg',         'Once daily',     'Oral',      'active', 'Dr. Emily Carter',    v_emily);

  -- Allergies
  insert into patient_allergies (patient_id, allergen, reaction, severity, created_by) values
    (v_pt1, 'Penicillin',    'Anaphylaxis',          'severe',   v_emily),
    (v_pt1, 'Codeine',       'Nausea and vomiting',  'mild',     v_emily);

  -- ============================================================
  -- 4. ENCOUNTERS
  -- ============================================================

  insert into encounters (id, patient_id, title, status, visibility, created_by, assigned_to) values
    (v_enc1, v_pt1, 'Inpatient Admission — Community-Acquired Pneumonia', 'open',   'staff',   v_emily,   v_emily)
  on conflict do nothing;

  -- ============================================================
  -- 5. BLOCKS
  -- ============================================================

  -- ── Enc 1: Robert Mitchell — Inpatient Pneumonia ───────────

  -- H&P on admission
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'hx_physical',
    jsonb_build_object(
      'chief_complaint', 'Productive cough, fever, and worsening shortness of breath for 5 days',
      'hpi', '62-year-old male with known COPD (GOLD II) and hypertension presenting with a 5-day history of productive cough with yellow-green sputum, fever to 39.2°C, and worsening dyspnoea on exertion. Denies haemoptysis. Reports mild right-sided pleuritic chest pain on deep inspiration. Former smoker — quit 8 years ago (30 pack-year history). Known penicillin allergy (anaphylaxis).',
      'ros', jsonb_build_object(
        'constitutional',  jsonb_build_object('items', jsonb_build_object('Fever', 'positive', 'Fatigue / Malaise', 'positive', 'Anorexia', 'positive', 'Night sweats', 'denied'), 'notes', ''),
        'respiratory',     jsonb_build_object('items', jsonb_build_object('Cough (productive)', 'positive', 'Shortness of breath', 'positive', 'Wheezing', 'denied', 'Hemoptysis', 'denied'), 'notes', 'Yellow-green sputum'),
        'cardiovascular',  jsonb_build_object('items', jsonb_build_object('Chest pain / tightness', 'positive', 'Leg swelling / Edema', 'denied', 'Palpitations', 'denied'), 'notes', 'Pleuritic in character'),
        'gastrointestinal',jsonb_build_object('items', jsonb_build_object('Nausea', 'denied', 'Vomiting', 'denied'), 'notes', ''),
        'neurological',    jsonb_build_object('items', jsonb_build_object('Dizziness / Vertigo', 'denied'), 'notes', '')
      ),
      'ros_notes', '',
      'exam', jsonb_build_object(
        'general',     jsonb_build_object('items', jsonb_build_object('In moderate distress', 'present', 'Alert and oriented', 'present'), 'notes', 'Mild accessory muscle use noted'),
        'heent',       jsonb_build_object('items', jsonb_build_object('Normocephalic / Atraumatic', 'present', 'PERRL', 'present', 'Dry mucous membranes', 'present'), 'notes', ''),
        'cardiac',     jsonb_build_object('items', jsonb_build_object('Regular rate and rhythm', 'present', 'S1 S2 normal', 'present', 'Peripheral pulses intact', 'present'), 'notes', 'Tachycardic at 104'),
        'respiratory', jsonb_build_object('items', jsonb_build_object('Decreased breath sounds (right)', 'present', 'Dullness to percussion', 'present', 'Crackles (right)', 'present', 'Clear to auscultation bilaterally', 'absent'), 'notes', 'Right lower zone consolidation signs'),
        'abdomen',     jsonb_build_object('items', jsonb_build_object('Soft', 'present', 'Non-tender', 'present', 'Non-distended', 'present', 'Bowel sounds present', 'present'), 'notes', ''),
        'neuro',       jsonb_build_object('items', jsonb_build_object('Alert and oriented x3', 'present', 'Motor strength 5/5', 'present'), 'notes', ''),
        'other',       jsonb_build_object('items', jsonb_build_object('Skin warm and dry', 'absent', 'Diaphoretic', 'present'), 'notes', 'Diaphoretic on presentation — likely febrile')
      ),
      'exam_notes', ''
    ),
    'active', 10, 'Dr. Emily Carter', false, v_emily
  );

  -- Day 1 vitals (admission — on nasal cannula)
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'vitals',
    jsonb_build_object(
      'bp_systolic', 148, 'bp_diastolic', 88, 'bp_flags', '[]'::jsonb,
      'pulse_rate', 104, 'pr_flags', '[]'::jsonb,
      'resp_rate', 24, 'rr_flags', '[]'::jsonb,
      'temperature', 38.9, 'temp_unit', 'C', 'temp_flags', '[]'::jsonb,
      'spo2', 94, 'spo2_flags', '["nasal_cannula"]'::jsonb,
      'avpu', 'A'
    ),
    'active', 20, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Plan block for pneumonia encounter is inserted in §6b after lab/rad results (timeline orders by created_at).

end;
$$;

-- ============================================================
-- 6. LAB DEPARTMENT — One service (lab_order → lab_result), order/result demo
-- ============================================================

do $$
declare
  v_admin   uuid := '00000000-0000-0000-0000-000000000001';
  v_emily   uuid := '00000000-0000-0000-0000-000000000002';
  v_lab     uuid := '00000000-0000-0000-0000-000000000005';

  v_dept_lab   uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_dbt_lab    uuid := 'cccccccc-0000-0000-0000-000000000010';
  v_dbt_lab_b  uuid := 'cccccccc-0000-0000-0000-000000000011';  -- legacy row: merge then delete
  v_dbt_lab_h  uuid := 'cccccccc-0000-0000-0000-000000000013';

  v_def_lab_order  uuid;
  v_def_lab_result uuid;

  v_pt1  uuid;
  v_enc1 uuid;

  -- Stable result block IDs so billing seed can attach charges (dept portal History queries by block_id).
  v_cbc_result_block   uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_bmp_result_block   uuid := 'dddddddd-0000-0000-0000-000000000002';
  v_cbc_order_block    uuid := gen_random_uuid();
  v_cbc_action         uuid := gen_random_uuid();
  v_bmp_order_block    uuid := gen_random_uuid();
  v_bmp_action         uuid := gen_random_uuid();

begin
  select id into v_pt1  from patients where first_name = 'Robert'   and last_name = 'Mitchell';
  select id into v_enc1 from encounters where patient_id = v_pt1 and title ilike '%Pneumonia%';

  select id into v_def_lab_order  from block_definitions where slug = 'lab_order'  limit 1;
  select id into v_def_lab_result from block_definitions where slug = 'lab_result' limit 1;

  insert into departments (id, name, slug, description, icon, color, can_receive_orders, can_create_direct, sort_order, created_by) values
    (v_dept_lab, 'Laboratory', 'lab',
     'Clinical pathology — haematology, biochemistry, microbiology, immunology',
     'flask-conical', 'teal', true, false, 20, v_admin)
  on conflict (id) do update set
    can_create_direct = excluded.can_create_direct,
    name                = excluded.name,
    description         = excluded.description,
    icon                = excluded.icon,
    color               = excluded.color,
    can_receive_orders  = excluded.can_receive_orders,
    sort_order          = excluded.sort_order;

  -- Single lab service: timeline uses lab_order; portal fulfils lab_result (built-in renderer).
  insert into department_block_types (
    id, department_id, name, description,
    order_block_def_id, entry_block_def_id,
    built_in_type, sort_order, charge_mode
  ) values (
    v_dbt_lab, v_dept_lab,
    'Laboratory diagnostics',
    'All structured lab panels — clinicians place lab_order blocks; lab fulfils lab_result.',
    v_def_lab_order, v_def_lab_result,
    'lab_result', 10, 'confirm'
  )
  on conflict (id) do update set
    name                 = excluded.name,
    description          = excluded.description,
    order_block_def_id   = excluded.order_block_def_id,
    entry_block_def_id   = excluded.entry_block_def_id,
    built_in_type        = excluded.built_in_type,
    sort_order           = excluded.sort_order,
    charge_mode          = excluded.charge_mode;

  update blocks set department_block_type_id = v_dbt_lab
  where department_block_type_id in (v_dbt_lab_b, v_dbt_lab_h);

  delete from department_block_types where id in (v_dbt_lab_b, v_dbt_lab_h);

  insert into department_members (department_id, user_id) values
    (v_dept_lab, v_lab),
    (v_dept_lab, v_admin)
  on conflict do nothing;

  -- ── CBC Order/Result — Robert Mitchell (enc1) ─────────────────

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, definition_id, content, state, sequence_order, author_name, created_by)
  values (
    v_cbc_order_block, v_enc1, v_pt1, v_dept_lab, v_dbt_lab, 'lab_order', v_def_lab_order,
    '{"panels":["cbc"],"custom":[],"indication":"Community-acquired pneumonia — assess WBC for leukocytosis, haemoglobin, and platelet count.","specimen":"venous blood"}'::jsonb,
    'active', 25, 'Dr. Emily Carter', v_emily
  );

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, content, state, sequence_order, share_to_record, author_name, created_by)
  values (
    v_cbc_result_block, null, v_pt1,
    v_dept_lab, v_dbt_lab, 'lab_result',
    jsonb_build_object(
      'panels', '["cbc"]'::jsonb,
      'custom_defs', '[]'::jsonb,
      'results', jsonb_build_object(
        'cbc.wbc',  jsonb_build_object('value','16.8','flag','H','comment','Leukocytosis — neutrophilia'),
        'cbc.rbc',  jsonb_build_object('value','4.2', 'flag','L','comment',''),
        'cbc.hb',   jsonb_build_object('value','12.9','flag','L','comment','Mild anaemia of acute illness'),
        'cbc.hct',  jsonb_build_object('value','38',  'flag','', 'comment',''),
        'cbc.mcv',  jsonb_build_object('value','85',  'flag','', 'comment',''),
        'cbc.plt',  jsonb_build_object('value','420', 'flag','H','comment','Reactive thrombocytosis'),
        'cbc.neut', jsonb_build_object('value','14.2','flag','H','comment','Marked neutrophilia'),
        'cbc.lymph',jsonb_build_object('value','1.8', 'flag','', 'comment','')
      ),
      'custom_results', '[]'::jsonb,
      'notes', 'Leukocytosis with marked neutrophilia — consistent with active bacterial infection. Mild anaemia of acute illness. Reactive thrombocytosis. Findings support community-acquired pneumonia.',
      'status', 'verified',
      'reported_at', now()
    ),
    'active', 0, true, 'Thomas Wright', v_lab
  );

  insert into block_actions (id, block_id, encounter_id, patient_id, action_type, action_payload, status, result_block_id, triggered_by, completed_at)
  values (
    v_cbc_action, v_cbc_order_block, v_enc1, v_pt1,
    'lab',
    jsonb_build_object('block_type_id', v_dbt_lab, 'panels', '["cbc"]'::jsonb, 'priority', 'routine'),
    'completed', v_cbc_result_block, v_emily, now()
  );

  -- ── BMP Order/Result — Robert Mitchell (enc1) ─────────────────

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, definition_id, content, state, sequence_order, author_name, created_by)
  values (
    v_bmp_order_block, v_enc1, v_pt1, v_dept_lab, v_dbt_lab, 'lab_order', v_def_lab_order,
    '{"panels":["metabolic"],"custom":[],"indication":"Pneumonia admission — baseline renal function, electrolytes, and glucose. Patient on Amlodipine.","specimen":"venous blood"}'::jsonb,
    'active', 26, 'Dr. Emily Carter', v_emily
  );

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, content, state, sequence_order, share_to_record, author_name, created_by)
  values (
    v_bmp_result_block, null, v_pt1,
    v_dept_lab, v_dbt_lab, 'lab_result',
    jsonb_build_object(
      'panels', '["metabolic"]'::jsonb,
      'custom_defs', '[]'::jsonb,
      'results', jsonb_build_object(
        'metabolic.na',   jsonb_build_object('value','138', 'flag','', 'comment',''),
        'metabolic.k',    jsonb_build_object('value','3.9', 'flag','', 'comment',''),
        'metabolic.cl',   jsonb_build_object('value','102', 'flag','', 'comment',''),
        'metabolic.hco3', jsonb_build_object('value','23',  'flag','', 'comment',''),
        'metabolic.urea', jsonb_build_object('value','7.8', 'flag','', 'comment',''),
        'metabolic.cr',   jsonb_build_object('value','97',  'flag','', 'comment','Mild elevation — monitor'),
        'metabolic.gluc', jsonb_build_object('value','6.4', 'flag','H','comment','Likely stress hyperglycaemia'),
        'metabolic.egfr', jsonb_build_object('value','68',  'flag','L','comment','Stage G2 CKD — mild reduction')
      ),
      'custom_results', '[]'::jsonb,
      'notes', 'Electrolytes within normal limits. Creatinine mildly elevated — eGFR 68. Glucose 6.4 mmol/L borderline, likely stress hyperglycaemia. Recommend monitoring creatinine trend.',
      'status', 'verified',
      'reported_at', now()
    ),
    'active', 0, true, 'Thomas Wright', v_lab
  );

  insert into block_actions (id, block_id, encounter_id, patient_id, action_type, action_payload, status, result_block_id, triggered_by, completed_at)
  values (
    v_bmp_action, v_bmp_order_block, v_enc1, v_pt1,
    'lab',
    jsonb_build_object('block_type_id', v_dbt_lab, 'panels', '["metabolic"]'::jsonb, 'priority', 'routine'),
    'completed', v_bmp_result_block, v_emily, now()
  );

end;
$$;

-- ============================================================
-- 6b. RADIOLOGY — One service (radiology_request → radiology_result)
-- ============================================================

do $$
declare
  v_admin   uuid := '00000000-0000-0000-0000-000000000001';
  v_emily   uuid := '00000000-0000-0000-0000-000000000002';
  v_radio   uuid := '00000000-0000-0000-0000-000000000008';
  v_dept_rad   uuid := 'aaaaaaaa-0000-0000-0000-000000000004';
  v_dbt_rad    uuid := 'cccccccc-0000-0000-0000-000000000020';

  v_def_rad_request uuid;
  v_def_rad_result  uuid;

  v_pt1   uuid;
  v_enc1  uuid;
  v_rad_result_block  uuid := 'dddddddd-0000-0000-0000-000000000004';
  v_rad_order_block   uuid := gen_random_uuid();
  v_rad_action        uuid := gen_random_uuid();
begin
  select id into v_pt1  from patients where first_name = 'Robert'   and last_name = 'Mitchell';
  select id into v_enc1 from encounters where patient_id = v_pt1 and title ilike '%Pneumonia%';

  if v_enc1 is null then
    return;
  end if;

  select id into v_def_rad_request from block_definitions where slug = 'radiology_request' limit 1;
  select id into v_def_rad_result  from block_definitions where slug = 'radiology_result'  limit 1;

  insert into departments (id, name, slug, description, icon, color, can_receive_orders, can_create_direct, sort_order, created_by) values
    (v_dept_rad, 'Radiology', 'radiology',
     'Diagnostic imaging — X-ray, CT, MRI, ultrasound',
     'scan', 'indigo', true, false, 25, v_admin)
  on conflict (id) do update set
    can_create_direct = excluded.can_create_direct,
    name                = excluded.name,
    description         = excluded.description,
    icon                = excluded.icon,
    color               = excluded.color,
    can_receive_orders  = excluded.can_receive_orders,
    sort_order          = excluded.sort_order;

  insert into department_block_types (
    id, department_id, name, description,
    order_block_def_id, entry_block_def_id,
    built_in_type, sort_order, charge_mode
  ) values (
    v_dbt_rad, v_dept_rad,
    'Diagnostic imaging',
    'All catalog imaging studies — clinicians place radiology_request; radiology fulfils radiology_result.',
    v_def_rad_request, v_def_rad_result,
    'radiology_result', 10, 'confirm'
  )
  on conflict (id) do update set
    name                 = excluded.name,
    description          = excluded.description,
    order_block_def_id   = excluded.order_block_def_id,
    entry_block_def_id   = excluded.entry_block_def_id,
    built_in_type        = excluded.built_in_type,
    sort_order           = excluded.sort_order,
    charge_mode          = excluded.charge_mode;

  insert into department_members (department_id, user_id) values
    (v_dept_rad, v_radio),
    (v_dept_rad, v_admin)
  on conflict do nothing;

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, definition_id, content, state, sequence_order, author_name, created_by)
  values (
    v_rad_order_block, v_enc1, v_pt1, v_dept_rad, v_dbt_rad, 'radiology_request', v_def_rad_request,
    '{"studies":["ct_chest"],"custom":[],"indication":"CAP — assess infiltrates and complications","contrast_note":"IV contrast unless contraindicated — no known allergy documented."}'::jsonb,
    'active', 27, 'Dr. Emily Carter', v_emily
  );

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, content, state, sequence_order, share_to_record, author_name, created_by)
  values (
    v_rad_result_block, null, v_pt1,
    v_dept_rad, v_dbt_rad, 'radiology_result',
    jsonb_build_object(
      'studies', '["ct_chest"]'::jsonb,
      'custom_defs', '[]'::jsonb,
      'technique', 'Helical CT chest with IV contrast; 1 mm reconstructions.',
      'findings', 'Right lower lobe consolidation with air bronchograms. Small right pleural effusion. No pneumothorax. Mediastinal lymph nodes within normal limits.',
      'impression', 'Findings consistent with right lower lobe pneumonia. Small parapneumonic effusion.',
      'recommendations', 'Clinical correlation. Repeat imaging if no clinical improvement in 48–72 hours.',
      'status', 'verified',
      'reported_at', now()
    ),
    'active', 0, true, 'Maria Santos', v_radio
  );

  insert into block_actions (id, block_id, encounter_id, patient_id, action_type, action_payload, status, result_block_id, triggered_by, completed_at)
  values (
    v_rad_action, v_rad_order_block, v_enc1, v_pt1,
    'radiology',
    jsonb_build_object('block_type_id', v_dbt_rad, 'studies', '["ct_chest"]'::jsonb, 'priority', 'routine'),
    'completed', v_rad_result_block, v_emily, now()
  );

  -- Assessment & plan — created_at after other blocks so timeline merge (sorts by created_at) lists plan after results
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by, created_at, updated_at) values (
    v_enc1, v_pt1, 'plan',
    '{"assessment":"62-year-old male with right lower lobe community-acquired pneumonia on background of COPD II and hypertension. Presented with sepsis criteria (HR 104, Temp 38.9°C, RR 24). Marked improvement by Day 2 with dual antibiotic therapy (Moxifloxacin + Azithromycin). Penicillin allergy documented — alternative regimen used. CBC consistent with bacterial infection. BMP: mild creatinine elevation — monitor.","plan":"1. Respiratory: IV antibiotics → oral step-down Day 3 (Moxifloxacin 400mg PO + Azithromycin 500mg PO). Total 7-day course. Daily chest physio.\n2. COPD: Continue ICS/LABA (Budesonide/Formoterol). Salbutamol nebs Q4h PRN. Spirometry at 6-week follow-up.\n3. Hypertension: Continue Amlodipine 10mg. Daily BP monitoring.\n4. Renal: Monitor creatinine — repeat BMP Day 4.\n5. Discharge criteria: SpO2 ≥95% on room air, afebrile >24h, tolerating oral antibiotics, adequate home support.\n6. Follow-up: GP in 1 week. Repeat CXR in 6 weeks."}'::jsonb,
    'active', 80, 'Dr. Emily Carter', true, v_emily,
    clock_timestamp(), clock_timestamp()
  );
end;
$$;

-- ============================================================
-- 7. BILLING — Service catalogue, insurance, lab/rad charges only (demo)
-- ============================================================

do $$
declare
  v_admin   uuid := '00000000-0000-0000-0000-000000000001';
  v_lab     uuid := '00000000-0000-0000-0000-000000000005';
  v_radio   uuid := '00000000-0000-0000-0000-000000000008';

  v_pt1  uuid;
  v_enc1 uuid;

  -- Demo dept result blocks (must match §6 / §6b fixed UUIDs) for portal History charge badges
  v_demo_cbc_res   uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_demo_bmp_res   uuid := 'dddddddd-0000-0000-0000-000000000002';
  v_demo_rad_res   uuid := 'dddddddd-0000-0000-0000-000000000004';

begin
  -- Resolve IDs
  select id into v_pt1  from patients where first_name = 'Robert'   and last_name = 'Mitchell';
  select id into v_enc1 from encounters where patient_id = v_pt1 and title ilike '%Pneumonia%';

  -- Idempotent demo billing rows for this patient/encounter
  delete from patient_deposits where patient_id = v_pt1;
  delete from charges where patient_id = v_pt1 and encounter_id = v_enc1;

  -- Enable billing in app settings
  insert into app_settings (key, value) values ('billing_enabled', 'true')
  on conflict (key) do update set value = 'true';

  -- Result blocks: department-only entry (idempotent if schema already applied)
  update block_definitions set is_dept_only = true where slug in ('lab_result', 'radiology_result');

  -- ── Service Item Catalogue ────────────────────────────────────

  insert into service_items (code, name, category, default_price, active, sort_order) values
    ('LAB-CBC',   'Complete Blood Count (CBC)',        'lab',          18.00,   true, 40),
    ('LAB-BMP',   'Basic Metabolic Panel (BMP)',       'lab',          22.00,   true, 41),
    ('LAB-HBA1C', 'HbA1c',                            'lab',          25.00,   true, 42),
    ('LAB-LIPID', 'Lipid Panel',                      'lab',          28.00,   true, 43),
    ('LAB-LFT',   'Liver Function Panel (LFT)',       'lab',          24.00,   true, 44),
    ('LAB-TFT',   'Thyroid Function Panel (TFT)',     'lab',          32.00,   true, 45),
    ('LAB-COAG',  'Coagulation Screen',               'lab',          30.00,   true, 46),
    ('LAB-CARD',  'Cardiac Markers Panel',            'lab',          45.00,   true, 47),
    ('LAB-ABG',   'Arterial Blood Gas (ABG)',         'lab',          40.00,   true, 48),
    ('LAB-URINE', 'Urinalysis Panel',                 'lab',          15.00,   true, 49),
    ('LAB-INFL',  'Inflammatory Markers Panel',       'lab',          35.00,   true, 50),
    ('RAD-CXR-PA',      'Imaging: Chest X-ray (PA)',           'imaging',  45.00,   true, 51),
    ('RAD-CXR-PORT',    'Imaging: Chest X-ray (portable)',     'imaging',  55.00,   true, 52),
    ('RAD-CT-HEAD',     'Imaging: CT head (non-contrast)',     'imaging', 320.00,   true, 53),
    ('RAD-CT-CHEST',    'Imaging: CT chest',                   'imaging', 285.00,   true, 54),
    ('RAD-CT-PE',       'Imaging: CT pulmonary angiogram',     'imaging', 450.00,   true, 55),
    ('RAD-CT-ABD',      'Imaging: CT abdomen & pelvis',        'imaging', 340.00,   true, 56),
    ('RAD-US-ABD',      'Imaging: Ultrasound abdomen',         'imaging', 120.00,   true, 57),
    ('RAD-US-DVT',      'Imaging: Ultrasound DVT lower limb',  'imaging',  95.00,   true, 58),
    ('RAD-MRI-BRAIN',   'Imaging: MRI brain',                  'imaging', 520.00,   true, 59),
    ('RAD-MRI-LS',      'Imaging: MRI lumbar spine',           'imaging', 480.00,   true, 60),
    ('RAD-MG-BILAT',    'Imaging: Mammography (bilateral)',    'imaging', 175.00,   true, 61),
    ('RAD-NM-BONE',     'Imaging: Bone scan',                  'imaging', 280.00,   true, 62),
    ('RAD-PET-CT',      'Imaging: PET-CT',                     'imaging',1200.00,   true, 63)
  on conflict (code) do nothing;

  delete from service_items where code in (
    'MED-PARA', 'MED-MOXI', 'MED-AZITH',
    'CONS-OP', 'CONS-IP', 'CONS-ED', 'CONS-SPEC',
    'PROC-SURG', 'PROC-ANAES', 'PROC-IV', 'WARD-IP', 'WARD-RECOV'
  );

  -- Reusable insurance payers (billing directory)
  insert into insurance_providers (name, default_copay_percent, active, sort_order) values
    ('BlueCross PPO',  20.00, true, 10),
    ('AAR Insurance',  10.00, true, 20),
    ('NHIF',           0.00,  true, 30),
    ('Jubilee Health', 15.00, true, 40)
  on conflict (name) do nothing;

  -- Lab Result: one rule per catalog panel id (labShared PANELS); confirm + manual fees on timeline
  update block_definitions bd
  set
    service_item_id = null,
    charge_mode     = 'confirm',
    config          = coalesce(bd.config, '{}'::jsonb) || jsonb_build_object(
      'billing',
      jsonb_build_object(
        'supports_custom_rules',   true,
        'allow_manual_block_fees', true,
        'settings_ui',             'lab_panels',
        'strategy',                'custom_rules',
        'rules',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', x.rule_id,
                'label', x.lbl,
                'service_item_id', x.sid::text,
                'quantity', 1,
                'match_panel_id', x.match
              ) order by x.ord
            )
            from (
              select 1  as ord, 'demo_cbc'::text as rule_id,
                (select id from service_items where code = 'LAB-CBC' limit 1) as sid,
                (select name from service_items where code = 'LAB-CBC' limit 1) as lbl, 'cbc'::text as match
              union all select 2, 'demo_bmp'::text,
                (select id from service_items where code = 'LAB-BMP' limit 1) as sid,
                (select name from service_items where code = 'LAB-BMP' limit 1) as lbl, 'metabolic'::text as match
              union all select 3, 'demo_lipid'::text,
                (select id from service_items where code = 'LAB-LIPID' limit 1) as sid,
                (select name from service_items where code = 'LAB-LIPID' limit 1) as lbl, 'lipids'::text as match
              union all select 4, 'demo_lft'::text,
                (select id from service_items where code = 'LAB-LFT' limit 1) as sid,
                (select name from service_items where code = 'LAB-LFT' limit 1) as lbl, 'lft'::text as match
              union all select 5, 'demo_tft'::text,
                (select id from service_items where code = 'LAB-TFT' limit 1) as sid,
                (select name from service_items where code = 'LAB-TFT' limit 1) as lbl, 'tft'::text as match
              union all select 6, 'demo_coag'::text,
                (select id from service_items where code = 'LAB-COAG' limit 1) as sid,
                (select name from service_items where code = 'LAB-COAG' limit 1) as lbl, 'coag'::text as match
              union all select 7, 'demo_cardiac'::text,
                (select id from service_items where code = 'LAB-CARD' limit 1) as sid,
                (select name from service_items where code = 'LAB-CARD' limit 1) as lbl, 'cardiac'::text as match
              union all select 8, 'demo_abg'::text,
                (select id from service_items where code = 'LAB-ABG' limit 1) as sid,
                (select name from service_items where code = 'LAB-ABG' limit 1) as lbl, 'abg'::text as match
              union all select 9, 'demo_urine'::text,
                (select id from service_items where code = 'LAB-URINE' limit 1) as sid,
                (select name from service_items where code = 'LAB-URINE' limit 1) as lbl, 'urine'::text as match
              union all select 10, 'demo_infl'::text,
                (select id from service_items where code = 'LAB-INFL' limit 1) as sid,
                (select name from service_items where code = 'LAB-INFL' limit 1) as lbl, 'infl'::text as match
            ) x
            where x.sid is not null
          ),
          '[]'::jsonb
        )
      )
    )
  where bd.slug = 'lab_result';

  -- Radiology Result: one rule per catalog study id (radiologyShared RADIOLOGY_STUDIES); confirm + manual fees
  update block_definitions bd
  set
    service_item_id = null,
    charge_mode     = 'confirm',
    config          = coalesce(bd.config, '{}'::jsonb) || jsonb_build_object(
      'billing',
      jsonb_build_object(
        'supports_custom_rules',   true,
        'allow_manual_block_fees', true,
        'settings_ui',             'radiology_studies',
        'strategy',                'custom_rules',
        'rules',
        coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', x.rule_id,
                'label', x.lbl,
                'service_item_id', x.sid::text,
                'quantity', 1,
                'match_panel_id', x.match
              ) order by x.ord
            )
            from (
              select 1  as ord, 'demo_rad_cxr_pa'::text as rule_id,
                (select id from service_items where code = 'RAD-CXR-PA' limit 1) as sid,
                (select name from service_items where code = 'RAD-CXR-PA' limit 1) as lbl, 'cxr_pa'::text as match
              union all select 2, 'demo_rad_cxr_port'::text,
                (select id from service_items where code = 'RAD-CXR-PORT' limit 1) as sid,
                (select name from service_items where code = 'RAD-CXR-PORT' limit 1) as lbl, 'cxr_portable'::text as match
              union all select 3, 'demo_rad_ct_head'::text,
                (select id from service_items where code = 'RAD-CT-HEAD' limit 1) as sid,
                (select name from service_items where code = 'RAD-CT-HEAD' limit 1) as lbl, 'ct_head_wo'::text as match
              union all select 4, 'demo_rad_ct_chest'::text,
                (select id from service_items where code = 'RAD-CT-CHEST' limit 1) as sid,
                (select name from service_items where code = 'RAD-CT-CHEST' limit 1) as lbl, 'ct_chest'::text as match
              union all select 5, 'demo_rad_ct_pe'::text,
                (select id from service_items where code = 'RAD-CT-PE' limit 1) as sid,
                (select name from service_items where code = 'RAD-CT-PE' limit 1) as lbl, 'ct_pe'::text as match
              union all select 6, 'demo_rad_ct_abd'::text,
                (select id from service_items where code = 'RAD-CT-ABD' limit 1) as sid,
                (select name from service_items where code = 'RAD-CT-ABD' limit 1) as lbl, 'ct_abd_pelvis'::text as match
              union all select 7, 'demo_rad_us_abd'::text,
                (select id from service_items where code = 'RAD-US-ABD' limit 1) as sid,
                (select name from service_items where code = 'RAD-US-ABD' limit 1) as lbl, 'us_abdomen'::text as match
              union all select 8, 'demo_rad_us_dvt'::text,
                (select id from service_items where code = 'RAD-US-DVT' limit 1) as sid,
                (select name from service_items where code = 'RAD-US-DVT' limit 1) as lbl, 'us_dvt_le'::text as match
              union all select 9, 'demo_rad_mri_brain'::text,
                (select id from service_items where code = 'RAD-MRI-BRAIN' limit 1) as sid,
                (select name from service_items where code = 'RAD-MRI-BRAIN' limit 1) as lbl, 'mri_brain'::text as match
              union all select 10, 'demo_rad_mri_ls'::text,
                (select id from service_items where code = 'RAD-MRI-LS' limit 1) as sid,
                (select name from service_items where code = 'RAD-MRI-LS' limit 1) as lbl, 'mri_spine_ls'::text as match
              union all select 11, 'demo_rad_mg'::text,
                (select id from service_items where code = 'RAD-MG-BILAT' limit 1) as sid,
                (select name from service_items where code = 'RAD-MG-BILAT' limit 1) as lbl, 'mammo_bilateral'::text as match
              union all select 12, 'demo_rad_bone'::text,
                (select id from service_items where code = 'RAD-NM-BONE' limit 1) as sid,
                (select name from service_items where code = 'RAD-NM-BONE' limit 1) as lbl, 'bone_scan'::text as match
              union all select 13, 'demo_rad_pet'::text,
                (select id from service_items where code = 'RAD-PET-CT' limit 1) as sid,
                (select name from service_items where code = 'RAD-PET-CT' limit 1) as lbl, 'pet_ct'::text as match
            ) x
            where x.sid is not null
          ),
          '[]'::jsonb
        )
      )
    )
  where bd.slug = 'radiology_result';

  -- Department routing (Settings → Department role + action module for queue payload)
  update block_definitions set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
    'dept_role', 'order',
    'action', jsonb_build_object('module', 'department')
  ) where slug in ('lab_order', 'radiology_request');

  update block_definitions set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
    'dept_role', 'result'
  ) where slug in ('lab_result', 'radiology_result');

  -- ── Patient Insurance ──────────────────────────────────────────

  -- Robert Mitchell: BlueCross PPO (copay % for billing UI)
  insert into patient_insurance (patient_id, payer_name, policy_number, copay_percent, is_active)
  values (v_pt1, 'BlueCross PPO', 'BCPPO-RM-441829', 20.00, true)
  on conflict do nothing;

  -- ── Charges — lab + radiology only (block_auto + manual fees on result blocks) ──

  insert into charges (patient_id, encounter_id, block_id, service_item_id, description, quantity, unit_price, status, source, created_by) values
    (v_pt1, v_enc1, v_demo_cbc_res, (select id from service_items where code = 'LAB-CBC' limit 1),
     'Complete Blood Count (CBC)', 1, 18.00, 'pending', 'block_auto', v_lab),
    (v_pt1, v_enc1, v_demo_bmp_res, (select id from service_items where code = 'LAB-BMP' limit 1),
     'Basic Metabolic Panel (BMP)', 1, 22.00, 'pending', 'block_auto', v_lab),
    (v_pt1, v_enc1, v_demo_rad_res, (select id from service_items where code = 'RAD-CT-CHEST' limit 1),
     'CT chest (radiology)', 1, 285.00, 'pending', 'block_auto', v_radio);

  insert into charges (patient_id, encounter_id, block_id, service_item_id, description, quantity, unit_price, status, source, created_by) values
    (v_pt1, v_enc1, v_demo_cbc_res, null, 'Phlebotomy & accession', 1, 6.00,  'pending', 'manual', v_admin),
    (v_pt1, v_enc1, v_demo_bmp_res, null, 'Phlebotomy & accession', 1, 6.00,  'pending', 'manual', v_admin),
    (v_pt1, v_enc1, v_demo_rad_res, null, 'Contrast pharmacy prep', 1, 42.00, 'pending', 'manual', v_admin);

end;
$$;
