-- ============================================================
-- OpenKairo — Demo Seed Data (English Names)
--
-- Prerequisites: run schema.sql first (or wipe_all.sql + schema.sql)
--
-- Password for all accounts: Demo123!
--
-- Demo accounts:
--   admin@demo.com          Dr. James Harrison     — Admin + Physician
--   dr.emily@demo.com       Dr. Emily Carter       — Physician (Internal Medicine)
--   dr.michael@demo.com     Dr. Michael Bennett    — Physician (General Surgery)
--   nurse.sarah@demo.com    Sarah O'Brien RN       — Nurse
--   lab.tech@demo.com       Thomas Wright          — Lab Technician
--   reception@demo.com      Lisa Anderson          — Receptionist
--   billing@demo.com        Patricia Evans         — Billing
--
-- Patients:
--   MRN-1001  Robert Mitchell  — Inpatient: community-acquired pneumonia
--   MRN-1002  Jennifer Walsh   — Outpatient: T2DM + hypertension follow-up
--   MRN-1003  David Harrison   — ED → Inpatient: laparoscopic appendectomy
--
-- Departments:
--   Lab — CBC, BMP, HbA1c & Lipid Panel (full order/result demo)
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

  -- Patient IDs
  v_pt1  uuid := gen_random_uuid();  -- Robert Mitchell  (inpatient)
  v_pt2  uuid := gen_random_uuid();  -- Jennifer Walsh   (outpatient)
  v_pt3  uuid := gen_random_uuid();  -- David Harrison   (ED → surgical)

  -- Encounter IDs
  v_enc1 uuid := gen_random_uuid();  -- pt1: Inpatient — Pneumonia         (open)
  v_enc2 uuid := gen_random_uuid();  -- pt2: Outpatient — T2DM Follow-up   (open)
  v_enc3 uuid := gen_random_uuid();  -- pt2: Initial Diabetes Diagnosis     (closed)
  v_enc4 uuid := gen_random_uuid();  -- pt3: ED — Acute Abdominal Pain      (closed)
  v_enc5 uuid := gen_random_uuid();  -- pt3: Inpatient — Appendectomy       (closed)

  -- Role IDs
  v_role_admin     uuid;
  v_role_physician uuid;
  v_role_nurse     uuid;
  v_role_lab       uuid;
  v_role_recep     uuid;
  v_role_billing   uuid;

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
     '{"full_name":"Patricia Evans"}'::jsonb,       now(), now(), false, '', '', '', '')
  on conflict (id) do nothing;

  insert into profiles (id, full_name) values
    (v_admin,   'Dr. James Harrison'),
    (v_emily,   'Dr. Emily Carter'),
    (v_michael, 'Dr. Michael Bennett'),
    (v_nurse,   'Sarah O''Brien RN'),
    (v_lab,     'Thomas Wright'),
    (v_recep,   'Lisa Anderson'),
    (v_billing, 'Patricia Evans')
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
    ('Lab Technician', 'lab_tech',     'Can receive and fulfill lab orders, create direct lab entries', true, 50,
     array[]::text[]),
    ('Billing',        'billing',      'Can manage charges, receive payments, and generate invoices', true, 45,
     array['billing.charge','billing.payment','billing.manage_fees']::text[])
  on conflict (slug) do nothing;

  select id into v_role_admin     from roles where slug = 'admin';
  select id into v_role_physician from roles where slug = 'physician';
  select id into v_role_nurse     from roles where slug = 'nurse';
  select id into v_role_lab       from roles where slug = 'lab_tech';
  select id into v_role_recep     from roles where slug = 'receptionist';
  select id into v_role_billing   from roles where slug = 'billing';

  insert into user_roles (user_id, role_id) values
    (v_admin,   v_role_admin),
    (v_admin,   v_role_physician),
    (v_emily,   v_role_physician),
    (v_michael, v_role_physician),
    (v_nurse,   v_role_nurse),
    (v_lab,     v_role_lab),
    (v_recep,   v_role_recep),
    (v_billing, v_role_billing)
  on conflict do nothing;

  -- ============================================================
  -- 3. PATIENTS
  -- ============================================================

  insert into patients (id, mrn, first_name, middle_name, last_name, date_of_birth, gender, phone, blood_group, created_by) values
    (v_pt1, 'MRN-' || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 7)),
     'Robert',   'James',       'Mitchell', '1963-02-14', 'Male',   '+1 555 201 4433', 'A+', v_recep),
    (v_pt2, 'MRN-' || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 7)),
     'Jennifer', 'Anne',        'Walsh',    '1974-08-22', 'Female', '+1 555 302 5544', 'O-', v_recep),
    (v_pt3, 'MRN-' || upper(substring(encode(gen_random_bytes(4), 'hex'), 1, 7)),
     'David',    'Christopher', 'Harrison', '1990-05-07', 'Male',   '+1 555 403 6655', 'B+', v_recep);

  -- Problems
  insert into patient_problems (patient_id, problem, status, importance, created_by) values
    -- Robert Mitchell
    (v_pt1, 'Community-Acquired Pneumonia',       'active',   'high',   v_emily),
    (v_pt1, 'COPD — GOLD Stage II',               'active',   'high',   v_emily),
    (v_pt1, 'Hypertension',                       'active',   'medium', v_emily),
    (v_pt1, 'Ex-smoker (30 pack-years)',          'active',   'low',    v_emily),
    -- Jennifer Walsh
    (v_pt2, 'Type 2 Diabetes Mellitus',           'active',   'high',   v_admin),
    (v_pt2, 'Hypertension',                       'active',   'high',   v_admin),
    (v_pt2, 'Hyperlipidemia',                     'active',   'medium', v_admin),
    (v_pt2, 'Obesity (BMI 31)',                   'active',   'medium', v_admin),
    -- David Harrison
    (v_pt3, 'Acute Appendicitis',                 'resolved', 'high',   v_michael),
    (v_pt3, 'Laparoscopic Appendectomy (post-op)','resolved', 'medium', v_michael);

  -- Medications
  insert into patient_medications (patient_id, medication_name, dosage, frequency, route, status, prescriber, created_by) values
    -- Robert Mitchell (pneumonia + COPD + HTN)
    (v_pt1, 'Moxifloxacin',            '400mg',        'Once daily',     'IV',        'active', 'Dr. Emily Carter',    v_emily),
    (v_pt1, 'Azithromycin',            '500mg',        'Once daily',     'IV',        'active', 'Dr. Emily Carter',    v_emily),
    (v_pt1, 'Salbutamol',              '2.5mg',        'Q4h PRN',        'Nebulised', 'active', 'Dr. Emily Carter',    v_emily),
    (v_pt1, 'Budesonide/Formoterol',   '400/12mcg',    'Twice daily',    'Inhaled',   'active', 'Dr. Emily Carter',    v_emily),
    (v_pt1, 'Amlodipine',              '10mg',         'Once daily',     'Oral',      'active', 'Dr. Emily Carter',    v_emily),
    (v_pt1, 'Paracetamol',             '1g',           'Q6h PRN',        'IV',        'active', 'Dr. Emily Carter',    v_emily),
    -- Jennifer Walsh (T2DM + HTN + hyperlipidemia)
    (v_pt2, 'Metformin',               '1000mg',       'Twice daily',    'Oral',      'active', 'Dr. James Harrison',  v_admin),
    (v_pt2, 'Lisinopril',              '10mg',         'Once daily',     'Oral',      'active', 'Dr. James Harrison',  v_admin),
    (v_pt2, 'Atorvastatin',            '40mg',         'Once at night',  'Oral',      'active', 'Dr. James Harrison',  v_admin),
    (v_pt2, 'Empagliflozin',           '10mg',         'Once daily',     'Oral',      'active', 'Dr. James Harrison',  v_admin),
    -- David Harrison (post-op analgesia)
    (v_pt3, 'Paracetamol',             '1g',           'Every 6 hours',  'Oral',      'active', 'Dr. Michael Bennett', v_michael),
    (v_pt3, 'Ibuprofen',               '400mg',        'Every 8 hours',  'Oral',      'active', 'Dr. Michael Bennett', v_michael);

  -- Allergies
  insert into patient_allergies (patient_id, allergen, reaction, severity, created_by) values
    (v_pt1, 'Penicillin',    'Anaphylaxis',          'severe',   v_emily),
    (v_pt1, 'Codeine',       'Nausea and vomiting',  'mild',     v_emily),
    (v_pt2, 'Sulfonamides',  'Rash and urticaria',   'mild',     v_admin),
    (v_pt3, 'Latex',         'Contact dermatitis',   'moderate', v_michael);

  -- ============================================================
  -- 4. ENCOUNTERS
  -- ============================================================

  insert into encounters (id, patient_id, title, status, visibility, created_by) values
    (v_enc1, v_pt1, 'Inpatient Admission — Community-Acquired Pneumonia', 'open',   'staff', v_emily),
    (v_enc2, v_pt2, 'Outpatient Follow-up — T2DM & Hypertension',         'open',   'staff', v_admin),
    (v_enc3, v_pt2, 'Initial Diabetes Diagnosis',                         'closed', 'staff', v_admin),
    (v_enc4, v_pt3, 'Emergency — Acute Abdominal Pain',                   'closed', 'staff', v_emily),
    (v_enc5, v_pt3, 'Inpatient — Laparoscopic Appendectomy',              'closed', 'staff', v_michael)
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
      'exam_notes', 'SpO2 91% on room air. Temperature 38.9°C. HR 104. RR 24. BP 148/88.'
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

  -- Nurse note — Day 1 morning
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'nurse_note',
    '{"note":"Patient admitted to Ward 4B. IV access secured — right antecubital fossa 18G. O2 via 2L nasal cannula. SpO2 improved to 94%. IV fluids commenced at 80 mL/hr. Patient alert and cooperative. Sputum sample collected. Observations chart started. Family notified of admission and visiting hours explained.","tasks_completed":["IV access x1 (right AC)","O2 therapy via nasal cannula","Admission observations","Sputum specimen collected","Family notification"]}'::jsonb,
    'active', 30, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Pain assessment (pleuritic chest pain)
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'pain_assessment',
    '{"pain_score":4,"location":"Right chest — pleuritic on deep inspiration","character":"Sharp, stabbing, worse on deep breath and cough","radiation":"None","aggravating":"Deep inspiration, coughing, movement","relieving":"Shallow breathing, sitting upright, mild analgesia","intervention":"Paracetamol 1g IV administered at 09:15. Patient instructed on splinting technique and incentive spirometry.","reassessment_score":2,"reassessment_time":"1 hour post-intervention"}'::jsonb,
    'active', 35, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Medications block
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'meds',
    '{"medications":[{"name":"Moxifloxacin","dose":"400mg","route":"IV","frequency":"Once daily","indication":"CAP — penicillin-allergic patient"},{"name":"Azithromycin","dose":"500mg","route":"IV","frequency":"Once daily","indication":"Atypical coverage (Legionella, Mycoplasma)"},{"name":"Salbutamol","dose":"2.5mg","route":"Nebulised","frequency":"Q4h PRN","indication":"Bronchodilation / COPD exacerbation"},{"name":"Budesonide/Formoterol","dose":"400/12mcg","route":"Inhaled","frequency":"Twice daily","indication":"COPD maintenance therapy — continue from home"},{"name":"Amlodipine","dose":"10mg","route":"Oral","frequency":"Once daily","indication":"Hypertension — continue from home"},{"name":"Paracetamol","dose":"1g","route":"IV","frequency":"Q6h PRN","indication":"Fever and pleuritic pain control"}],"adherence_summary":"Patient receiving all medications as prescribed. PENICILLIN ALLERGY documented — penicillin-based antibiotics avoided."}'::jsonb,
    'active', 50, 'Dr. Emily Carter', true, v_emily
  );

  -- Day 2 vitals (improving — off O2)
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'vitals',
    jsonb_build_object(
      'bp_systolic', 136, 'bp_diastolic', 82, 'bp_flags', '[]'::jsonb,
      'pulse_rate', 88, 'pr_flags', '[]'::jsonb,
      'resp_rate', 18, 'rr_flags', '[]'::jsonb,
      'temperature', 37.6, 'temp_unit', 'C', 'temp_flags', '[]'::jsonb,
      'spo2', 96, 'spo2_flags', '["room_air"]'::jsonb,
      'avpu', 'A'
    ),
    'active', 60, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Ward round SOAP note (Day 2)
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'tour',
    '{"date":"Day 2 Morning Round","subjective":"Patient reports improved breathing. Productive cough reducing. Fever resolved overnight. Appetite returning — tolerating oral fluids. Pain well-controlled with paracetamol.","objective":"Afebrile 37.6°C. HR 88. RR 18. SpO2 96% on room air — O2 discontinued this morning. Improved air entry. Residual dullness right base. CBC results: WBC 16.8 (neutrophilia consistent with bacterial infection). Chest X-Ray confirming right lower lobe consolidation.","assessment":"CAP responding well to dual antibiotic therapy. Safe to step down O2. Plan oral step-down if afebrile and tolerating PO by Day 3.","plan":"1. Continue Moxifloxacin + Azithromycin IV — step down to oral Day 3 if ongoing improvement.\n2. Chest physiotherapy referral today.\n3. COPD nurse educator to review inhaler technique.\n4. Target discharge Day 4 if criteria met.\n5. Repeat CXR pre-discharge.","tasks":["O2 discontinued","Physio referral placed","COPD educator notified","Oral step-down planned for Day 3"]}'::jsonb,
    'active', 70, 'Dr. Emily Carter', false, v_emily
  );

  -- Assessment & Plan
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'plan',
    '{"assessment":"62-year-old male with right lower lobe community-acquired pneumonia on background of COPD II and hypertension. Presented with sepsis criteria (HR 104, Temp 38.9°C, RR 24). Marked improvement by Day 2 with dual antibiotic therapy (Moxifloxacin + Azithromycin). Penicillin allergy documented — alternative regimen used. CBC consistent with bacterial infection. BMP: mild creatinine elevation — monitor.","plan":"1. Respiratory: IV antibiotics → oral step-down Day 3 (Moxifloxacin 400mg PO + Azithromycin 500mg PO). Total 7-day course. Daily chest physio.\n2. COPD: Continue ICS/LABA (Budesonide/Formoterol). Salbutamol nebs Q4h PRN. Spirometry at 6-week follow-up.\n3. Hypertension: Continue Amlodipine 10mg. Daily BP monitoring.\n4. Renal: Monitor creatinine — repeat BMP Day 4.\n5. Discharge criteria: SpO2 ≥95% on room air, afebrile >24h, tolerating oral antibiotics, adequate home support.\n6. Follow-up: GP in 1 week. Repeat CXR in 6 weeks."}'::jsonb,
    'active', 80, 'Dr. Emily Carter', true, v_emily
  );

  -- Nurse note — Day 2 night handover
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc1, v_pt1, 'nurse_note',
    '{"note":"Night handover: Patient resting comfortably. Afebrile for past 6 hours. Oxygen therapy discontinued — maintaining SpO2 96% on room air. IV site patent and clean. Tolerating sips of water. No new concerns overnight. Patient enquired about discharge — informed Dr. Carter will discuss timeline on morning round.","tasks_completed":["Night observations completed","IV site checked — patent","Patient reassured re discharge planning"]}'::jsonb,
    'active', 90, 'Sarah O''Brien RN', false, v_nurse
  );

  -- ── Enc 2: Jennifer Walsh — Outpatient T2DM Follow-up ──────

  -- H&P
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc2, v_pt2, 'hx_physical',
    jsonb_build_object(
      'chief_complaint', 'Routine 3-month diabetic and hypertension follow-up',
      'hpi', '51-year-old female with T2DM (diagnosed 2021), hypertension, and hyperlipidemia presenting for scheduled 3-month review. Reports good medication compliance overall — occasionally misses evening Atorvastatin. Home blood glucose monitoring: fasting readings 7–9 mmol/L. No hypoglycaemic episodes. Mild fatigue and nocturia ×2. Denies chest pain, dyspnoea, peripheral oedema, visual changes, or foot symptoms.',
      'ros', jsonb_build_object(
        'constitutional',   jsonb_build_object('items', jsonb_build_object('Fatigue / Malaise', 'positive', 'Weight loss', 'denied'), 'notes', 'Mild fatigue — attributed to suboptimal glycaemic control'),
        'cardiovascular',   jsonb_build_object('items', jsonb_build_object('Chest pain / tightness', 'denied', 'Leg swelling / Edema', 'denied', 'Dyspnea on exertion', 'denied'), 'notes', ''),
        'genitourinary',    jsonb_build_object('items', jsonb_build_object('Nocturia', 'positive', 'Urinary frequency', 'positive', 'Dysuria', 'denied'), 'notes', 'Nocturia x2 — may reflect glycosuria'),
        'neurological',     jsonb_build_object('items', jsonb_build_object('Numbness / Tingling', 'denied', 'Dizziness / Vertigo', 'denied'), 'notes', ''),
        'endocrine',        jsonb_build_object('items', jsonb_build_object('Polyuria', 'positive', 'Polydipsia', 'denied'), 'notes', 'Polyuria improving on Empagliflozin')
      ),
      'ros_notes', '',
      'exam', jsonb_build_object(
        'general',     jsonb_build_object('items', jsonb_build_object('No acute distress', 'present', 'Appears well', 'present', 'Obese', 'present'), 'notes', 'BMI 31.2'),
        'cardiac',     jsonb_build_object('items', jsonb_build_object('Regular rate and rhythm', 'present', 'S1 S2 normal', 'present', 'Peripheral pulses intact', 'present', 'Leg swelling / Edema', 'absent'), 'notes', ''),
        'respiratory', jsonb_build_object('items', jsonb_build_object('Clear to auscultation bilaterally', 'present'), 'notes', ''),
        'abdomen',     jsonb_build_object('items', jsonb_build_object('Soft', 'present', 'Non-tender', 'present', 'Non-distended', 'present', 'Bowel sounds present', 'present'), 'notes', ''),
        'neuro',       jsonb_build_object('items', jsonb_build_object('Alert and oriented x3', 'present', 'Sensory intact', 'present', 'Motor strength 5/5', 'present'), 'notes', 'Monofilament sensation intact bilaterally'),
        'other',       jsonb_build_object('items', jsonb_build_object('Bilateral pitting edema', 'absent', 'No rash', 'present'), 'notes', 'Foot exam: no ulcers, normal pulses, intact sensation')
      ),
      'exam_notes', 'BP 138/86. Weight 79.5kg. Foot exam performed — no diabetic complications detected.'
    ),
    'active', 10, 'Dr. James Harrison', false, v_admin
  );

  -- Vitals
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc2, v_pt2, 'vitals',
    jsonb_build_object(
      'bp_systolic', 138, 'bp_diastolic', 86, 'bp_flags', '[]'::jsonb,
      'pulse_rate', 72, 'pr_flags', '[]'::jsonb,
      'resp_rate', 16, 'rr_flags', '[]'::jsonb,
      'temperature', 36.8, 'temp_unit', 'C', 'temp_flags', '[]'::jsonb,
      'spo2', 99, 'spo2_flags', '["room_air"]'::jsonb,
      'avpu', 'A'
    ),
    'active', 20, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Medication review
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc2, v_pt2, 'meds',
    '{"medications":[{"name":"Metformin","dose":"1000mg","route":"Oral","frequency":"Twice daily","status":"active","compliance":"Good","note":"Continue — well tolerated"},{"name":"Lisinopril","dose":"10mg","route":"Oral","frequency":"Once daily","status":"active","compliance":"Good","note":"BP marginally elevated — consider uptitrating at next visit"},{"name":"Atorvastatin","dose":"40mg","route":"Oral","frequency":"Once at night","status":"active","compliance":"Occasional misses","note":"Counselled on importance of evening dose compliance"},{"name":"Empagliflozin","dose":"10mg","route":"Oral","frequency":"Once daily","status":"active","compliance":"Good","note":"Added 6 months ago for cardiovascular benefit — tolerating well"}],"adherence_summary":"Overall good adherence. Statin compliance counselling given. No new medications required at this visit."}'::jsonb,
    'active', 30, 'Dr. James Harrison', true, v_admin
  );

  -- Assessment & Plan
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc2, v_pt2, 'plan',
    '{"assessment":"T2DM with suboptimal glycaemic control — home glucose 7–9 mmol/L (target 4–7 fasting). HbA1c awaited. Hypertension borderline elevated at 138/86 on Lisinopril 10mg. Hyperlipidemia — Atorvastatin compliance suboptimal. Overweight (BMI 31.2). Empagliflozin added 6 months ago — no adverse effects.","plan":"1. Labs: HbA1c, fasting glucose, lipid panel, eGFR, urine ACR — ordered today.\n2. If HbA1c >8%: consider adding Semaglutide 0.5mg weekly OR increasing Metformin frequency.\n3. BP: If next visit BP >135/85, uptitrate Lisinopril to 20mg.\n4. Statins: Counselled on compliance — if LDL elevated, consider switching to Rosuvastatin.\n5. Referrals: Dietitian (low GI diet), Ophthalmology (annual retinal screen), Foot Clinic (annual review).\n6. Return in 3 months or sooner if labs reveal urgent findings."}'::jsonb,
    'active', 40, 'Dr. James Harrison', true, v_admin
  );

  -- Follow-up note
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc2, v_pt2, 'note',
    '{"text":"Patient education provided at this visit:\n• Importance of consistent evening Atorvastatin — skipping increases LDL and CV risk\n• Dietary modifications: low glycaemic index foods, portion control, reduced saturated fat intake\n• Blood glucose targets: 4–7 mmol/L fasting, <10 mmol/L 2h post-meal\n• Exercise goal: 150 min moderate aerobic activity per week\n• Annual preventive checks: eyes, feet, kidneys — all scheduled\n• When to seek urgent review: glucose consistently >15 mmol/L, chest pain, dyspnoea\n\nPatient verbalized understanding of all points. Written summary provided. Lab results to be reviewed via phone call within 5 business days."}'::jsonb,
    'active', 50, 'Dr. James Harrison', false, v_admin
  );

  -- ── Enc 3: Jennifer Walsh — Initial Diabetes Diagnosis (closed) ──

  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc3, v_pt2, 'hx_physical',
    jsonb_build_object(
      'chief_complaint', 'Fatigue, increased thirst, and frequent urination for 3 months',
      'hpi', 'New presentation. GP referral with random glucose 14.2 mmol/L. HbA1c 9.1% on referral bloods. 49-year-old female with BMI 31.4. Mother has T2DM. No previous diabetes diagnosis. Reports 3 months of fatigue, polyuria, polydipsia, and 3kg unintentional weight loss. BP elevated at GP visit (144/90). No visual changes, foot symptoms, or chest pain.',
      'exam', jsonb_build_object(
        'general',  jsonb_build_object('items', jsonb_build_object('No acute distress', 'present', 'Appears well', 'present', 'Obese', 'present'), 'notes', 'Central obesity'),
        'cardiac',  jsonb_build_object('items', jsonb_build_object('Regular rate and rhythm', 'present', 'S1 S2 normal', 'present'), 'notes', ''),
        'neuro',    jsonb_build_object('items', jsonb_build_object('Sensory intact', 'present'), 'notes', 'Monofilament normal bilaterally'),
        'other',    jsonb_build_object('items', jsonb_build_object('No rash', 'present'), 'notes', 'No acanthosis nigricans noted')
      ),
      'exam_notes', 'BP 144/90. Weight 82kg. BMI 31.4. Random glucose 14.2 mmol/L. HbA1c 9.1%.'
    ),
    'active', 10, 'Dr. James Harrison', true, v_admin
  );

  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc3, v_pt2, 'vitals',
    jsonb_build_object(
      'bp_systolic', 144, 'bp_diastolic', 90, 'bp_flags', '[]'::jsonb,
      'pulse_rate', 78, 'pr_flags', '[]'::jsonb,
      'resp_rate', 16, 'rr_flags', '[]'::jsonb,
      'temperature', 36.9, 'temp_unit', 'C', 'temp_flags', '[]'::jsonb,
      'spo2', 98, 'spo2_flags', '["room_air"]'::jsonb,
      'avpu', 'A'
    ),
    'active', 20, 'Sarah O''Brien RN', false, v_nurse
  );

  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc3, v_pt2, 'plan',
    '{"assessment":"New T2DM (HbA1c 9.1%, random glucose 14.2 mmol/L). Hypertension (BP 144/90). Overweight BMI 31.4. Family history of T2DM (mother). No evidence of end-organ damage at this stage.","plan":"1. Commence Metformin 500mg twice daily — titrate to 1000mg over 4 weeks.\n2. Commence Lisinopril 5mg once daily — for BP and renal protection.\n3. Atorvastatin 40mg once at night — pending fasting lipid panel result.\n4. Referrals: Dietitian, Diabetes Education Program, Ophthalmology.\n5. Self-monitoring blood glucose (SMBG) — device and training provided.\n6. Return 6 weeks — medication review. Repeat HbA1c in 3 months."}'::jsonb,
    'active', 30, 'Dr. James Harrison', true, v_admin
  );

  -- ── Enc 4: David Harrison — ED Acute Abdomen (closed) ──────

  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc4, v_pt3, 'hx_physical',
    jsonb_build_object(
      'chief_complaint', 'Right iliac fossa pain, worsening over 12 hours',
      'hpi', '35-year-old male presenting with 12-hour history of pain that began periumbilically and migrated to the right iliac fossa. Associated with nausea, vomiting ×2, and low-grade fever. Last meal 6 hours prior. No diarrhoea, no urinary symptoms. No similar episodes in the past. Latex allergy (contact dermatitis) — documented.',
      'ros', jsonb_build_object(
        'gastrointestinal', jsonb_build_object('items', jsonb_build_object('Nausea', 'positive', 'Vomiting', 'positive', 'Abdominal pain', 'positive', 'Diarrhea', 'denied', 'Constipation', 'denied'), 'notes', 'Anorexia present'),
        'constitutional',   jsonb_build_object('items', jsonb_build_object('Fever', 'positive', 'Fatigue / Malaise', 'positive', 'Anorexia', 'positive'), 'notes', 'Low-grade fever 38.1°C'),
        'genitourinary',    jsonb_build_object('items', jsonb_build_object('Dysuria', 'denied', 'Hematuria', 'denied', 'Urinary frequency', 'denied'), 'notes', ''),
        'musculoskeletal',  jsonb_build_object('items', jsonb_build_object('Back pain', 'denied'), 'notes', '')
      ),
      'ros_notes', 'No recent travel. No sick contacts. No similar presentations.',
      'exam', jsonb_build_object(
        'general',   jsonb_build_object('items', jsonb_build_object('In moderate distress', 'present', 'Diaphoretic', 'present'), 'notes', 'Guarding on walking into room'),
        'cardiac',   jsonb_build_object('items', jsonb_build_object('Regular rate and rhythm', 'present', 'Peripheral pulses intact', 'present'), 'notes', 'Mild tachycardia'),
        'abdomen',   jsonb_build_object('items', jsonb_build_object('Tenderness (RLQ)', 'present', 'Guarding', 'present', 'Rebound tenderness', 'present', 'Non-distended', 'present', 'Bowel sounds present', 'present', 'Non-tender', 'absent'), 'notes', 'Rovsing sign positive. Psoas sign positive. No palpable mass.'),
        'neuro',     jsonb_build_object('items', jsonb_build_object('Alert and oriented x3', 'present'), 'notes', '')
      ),
      'exam_notes', 'T 38.1°C. HR 96. BP 122/74. RR 16. SpO2 99%. Alvarado Score 8/10.'
    ),
    'active', 10, 'Dr. Emily Carter', false, v_emily
  );

  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc4, v_pt3, 'vitals',
    jsonb_build_object(
      'bp_systolic', 122, 'bp_diastolic', 74, 'bp_flags', '[]'::jsonb,
      'pulse_rate', 96, 'pr_flags', '[]'::jsonb,
      'resp_rate', 16, 'rr_flags', '[]'::jsonb,
      'temperature', 38.1, 'temp_unit', 'C', 'temp_flags', '[]'::jsonb,
      'spo2', 99, 'spo2_flags', '["room_air"]'::jsonb,
      'avpu', 'A'
    ),
    'active', 20, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Clinical score — Alvarado
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc4, v_pt3, 'score',
    '{"score_type":"Alvarado","total":8,"max":10,"components":{"Migration of pain to RIF":1,"Anorexia":1,"Nausea / Vomiting":1,"RIF tenderness":2,"Rebound tenderness":1,"Elevated temperature (>37.3°C)":1,"Leukocytosis":1},"interpretation":"Score 8/10 — High probability of acute appendicitis. Surgical review recommended urgently.","action":"Urgent General Surgery consult placed. Patient made NPO. IV access secured. Morphine analgesia given."}'::jsonb,
    'active', 30, 'Dr. Emily Carter', false, v_emily
  );

  -- Pain assessment
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc4, v_pt3, 'pain_assessment',
    '{"pain_score":7,"location":"Right iliac fossa — migrated from periumbilical","character":"Constant dull ache with sharp exacerbations on movement","radiation":"Periumbilical initially — now localised to RIF","aggravating":"Movement, palpation, coughing","relieving":"Lying still, mild flexion of right hip","intervention":"Morphine 2.5mg IV administered at 18:45. Ondansetron 4mg IV given for nausea. Anti-emetic effective.","reassessment_score":3,"reassessment_time":"45 minutes post-intervention"}'::jsonb,
    'active', 40, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Specialist consultation (surgery)
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc4, v_pt3, 'consultation',
    '{"requesting_physician":"Dr. Emily Carter","specialist":"Dr. Michael Bennett","specialty":"General Surgery","reason":"Acute appendicitis — Alvarado Score 8/10. Request urgent surgical review and operative plan.","clinical_summary":"35M, Alvarado 8, RIF guarding and rebound tenderness, Rovsing and Psoas signs positive. CBC pending (WBC expected elevated). Latex allergy documented — latex-free protocol required. Patient NPO, IV access, morphine given. No CT performed — clinical diagnosis sufficient.","response":"Reviewed patient at bedside. Agree with clinical diagnosis of acute appendicitis. Consented for laparoscopic appendectomy. Booked for next available theatre slot (approx. 2 hours). Anaesthetics notified. Latex-free protocol activated across theatre team.","response_time":"28 minutes","responding_physician":"Dr. Michael Bennett"}'::jsonb,
    'active', 50, 'Dr. Emily Carter', false, v_emily
  );

  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc4, v_pt3, 'plan',
    '{"assessment":"Acute appendicitis (Alvarado Score 8/10). Haemodynamically stable. No perforation signs on examination. Latex allergy documented — latex-free protocol activated throughout care team.","plan":"1. NPO maintained.\n2. IV Cefoxitin 2g pre-operatively as surgical prophylaxis (latex-free prep confirmed).\n3. Laparoscopic appendectomy booked — next available theatre slot.\n4. Anaesthetics team notified.\n5. Consent obtained by Dr. Michael Bennett.\n6. Post-operative plan: recovery monitoring, PCA/multimodal analgesia protocol, early mobilisation Day 1."}'::jsonb,
    'active', 60, 'Dr. Emily Carter', false, v_emily
  );

  -- ── Enc 5: David Harrison — Surgical Inpatient (closed) ────

  -- Anaesthetic note
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'anaesthetic_note',
    '{"type":"General Anaesthesia","asa_grade":"ASA I","premedication":"None","induction_agent":"Propofol 150mg IV","maintenance":"Sevoflurane 1.5–2% in O2/air mixture","muscle_relaxant":"Rocuronium 50mg IV","airway":"Endotracheal tube 8.0 cuffed — grade 1 view on laryngoscopy","reversal":"Sugammadex 200mg IV","analgesia_intra":"Fentanyl 100mcg IV, Paracetamol 1g IV, Ketorolac 15mg IV","analgesia_post":"Paracetamol 1g PO Q6h, Ibuprofen 400mg PO Q8h PRN","antiemetic":"Ondansetron 4mg IV, Dexamethasone 8mg IV (dual prophylaxis)","duration_minutes":45,"complications":"None","latex_free":true,"notes":"Full latex-free protocol used throughout — latex-free gloves, equipment, and drug vials confirmed. Uneventful induction, maintenance, and emergence. Patient extubated in theatre and transferred to recovery in stable condition."}'::jsonb,
    'active', 10, 'Dr. James Harrison', false, v_admin
  );

  -- Procedure note
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'procedure_note',
    '{"procedure":"Laparoscopic Appendectomy","surgeon":"Dr. Michael Bennett","assistant":"Dr. James Harrison","date":"2026-04-06","indication":"Acute appendicitis — Alvarado Score 8/10. Failed conservative management attempt not applicable — operative criteria met.","technique":"Three-port laparoscopic technique. 10mm periumbilical camera port, two 5mm working ports (right lower quadrant and suprapubic). Appendix identified — acutely inflamed, no perforation, no free pus. Meso-appendix divided with Harmonic scalpel. Appendix base secured with two EndoLoops. Specimen retrieved via 10mm port in endobag. Peritoneal toilet with warm saline. Haemostasis confirmed. Ports removed under direct vision.","findings":"Acutely inflamed appendix approximately 8cm in length. No perforation. No abscess. No free pus. Remainder of abdomen unremarkable.","specimen":"Appendix sent to histopathology — result pending.","complications":"None intraoperatively.","blood_loss_ml":"Less than 20mL","drain":"None","closure":"10mm fascial defect closed with Vicryl 0. Skin closed with subcuticular Monocryl 3-0. Steri-strips applied."}'::jsonb,
    'active', 20, 'Dr. Michael Bennett', true, v_michael
  );

  -- Post-op vitals
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'vitals',
    jsonb_build_object(
      'bp_systolic', 118, 'bp_diastolic', 72, 'bp_flags', '[]'::jsonb,
      'pulse_rate', 82, 'pr_flags', '[]'::jsonb,
      'resp_rate', 16, 'rr_flags', '[]'::jsonb,
      'temperature', 37.2, 'temp_unit', 'C', 'temp_flags', '[]'::jsonb,
      'spo2', 98, 'spo2_flags', '["room_air"]'::jsonb,
      'avpu', 'A'
    ),
    'active', 30, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Post-op pain assessment
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'pain_assessment',
    '{"pain_score":4,"location":"Periumbilical port site and generalised mild lower abdominal discomfort","character":"Aching, predominantly at port sites, mild bloating from port gas","radiation":"None","aggravating":"Movement, deep inspiration, coughing","relieving":"Rest, lying still, analgesia","intervention":"Paracetamol 1g IV at 15:00. Local anaesthetic infiltration at all port sites performed intraoperatively by surgical team.","reassessment_score":2,"reassessment_time":"1 hour post-op"}'::jsonb,
    'active', 40, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Post-op nurse note
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'nurse_note',
    '{"note":"Patient arrived from recovery to Ward 2A at 14:30. Alert and oriented. Tolerating sips of water without nausea. IV site intact and patent. Passed urine independently at 16:15. Encouraged to mobilise — patient walked to bathroom unassisted at 16:00. Port site dressings intact and dry. No signs of bleeding. Vital signs stable on 1-hourly observations. Patient asking about diet — advised to progress to light diet as tolerated this evening.","tasks_completed":["Post-op observations (hourly)","Port site wound check","Early mobilisation — patient walked independently","Oral intake assessed","Patient education re post-op diet progression"]}'::jsonb,
    'active', 50, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Wound care
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'wound_care',
    '{"wound_type":"Laparoscopic port sites ×3","locations":["Periumbilical (10mm)","Right iliac fossa (5mm)","Suprapubic (5mm)"],"appearance":"All sites clean and dry. No erythema, swelling, or discharge. Subcuticular closure intact at periumbilical site.","dressing_type":"Mepilex Border absorbent dressings","dressing_changed":true,"next_dressing":"Day 3 post-op or sooner if soiled or loose","plan":"Remove dressings Day 3 post-op. Subcuticular and Monocryl sutures are absorbable — no removal required. Advise patient to keep wounds dry for 48 hours, then shower normally.","patient_education":"Patient instructed on wound care at home: keep dry 48h, watch for redness/warmth/discharge, return to ED if signs of infection. Written wound care instructions provided."}'::jsonb,
    'active', 60, 'Sarah O''Brien RN', false, v_nurse
  );

  -- Discharge note
  insert into blocks (encounter_id, patient_id, type, content, state, sequence_order, author_name, share_to_record, created_by) values (
    v_enc5, v_pt3, 'dc_note',
    '{"admitting_diagnosis":"Acute appendicitis","final_diagnosis":"Acute appendicitis — non-perforated (confirmed on histopathology pending)","procedures_performed":"Laparoscopic appendectomy (06/04/2026)","hospital_course":"35-year-old male admitted via ED with 12-hour history of RIF pain, Alvarado Score 8. Underwent uneventful laparoscopic appendectomy under general anaesthesia with full latex-free protocol (documented latex allergy). Post-operative recovery excellent. Tolerating a regular diet by Day 1. Pain well-controlled on oral multimodal analgesia. Port sites clean and dry. Mobilising independently. Discharged Day 1 post-operative.","discharge_medications":[{"name":"Paracetamol","dose":"1g","frequency":"Every 6 hours as needed","duration":"5 days"},{"name":"Ibuprofen","dose":"400mg","frequency":"Every 8 hours with food","duration":"5 days","note":"Avoid on empty stomach"}],"follow_up":"Surgical outpatient clinic — 2 weeks. GP for wound review — Day 5 post-op. Histopathology results to be discussed at clinic.","instructions":"1. Rest for 1 week. Avoid heavy lifting (>5kg) for 4 weeks.\n2. Normal diet as tolerated — light foods first 24 hours.\n3. Keep wounds dry for 48 hours, then shower normally. Pat dry.\n4. Driving: do not drive while on opioids (none prescribed). May resume when comfortable — typically 1 week.\n5. Return to work: desk job 1 week, manual labour 4 weeks.\n6. RETURN TO ED if: fever >38.5°C, worsening abdominal pain, wound redness / discharge, inability to tolerate fluids.","discharge_condition":"Good — haemodynamically stable, pain controlled, mobile, tolerating diet"}'::jsonb,
    'active', 70, 'Dr. Michael Bennett', true, v_michael
  );

end;
$$;

-- ============================================================
-- 6. LAB DEPARTMENT — Services, Order/Result Demo (built-in blocks)
-- ============================================================

do $$
declare
  v_admin   uuid := '00000000-0000-0000-0000-000000000001';
  v_emily   uuid := '00000000-0000-0000-0000-000000000002';
  v_lab     uuid := '00000000-0000-0000-0000-000000000005';

  -- Fixed UUIDs
  v_dept_lab  uuid := 'aaaaaaaa-0000-0000-0000-000000000003';
  v_dbt_cbc   uuid := 'cccccccc-0000-0000-0000-000000000010';
  v_dbt_bmp   uuid := 'cccccccc-0000-0000-0000-000000000011';
  v_dbt_hba1c uuid := 'cccccccc-0000-0000-0000-000000000013';

  -- Resolved patient / encounter IDs
  v_pt1  uuid;
  v_pt2  uuid;
  v_enc1 uuid;   -- Robert Mitchell inpatient
  v_enc2 uuid;   -- Jennifer Walsh outpatient

  -- Block IDs for cross-referencing
  v_cbc_order_block    uuid := gen_random_uuid();
  v_cbc_result_block   uuid := gen_random_uuid();
  v_cbc_action         uuid := gen_random_uuid();
  v_bmp_order_block    uuid := gen_random_uuid();
  v_bmp_result_block   uuid := gen_random_uuid();
  v_bmp_action         uuid := gen_random_uuid();
  v_hba1c_order_block  uuid := gen_random_uuid();
  v_hba1c_result_block uuid := gen_random_uuid();
  v_hba1c_action       uuid := gen_random_uuid();

begin
  -- Resolve IDs
  select id into v_pt1  from patients where first_name = 'Robert'   and last_name = 'Mitchell';
  select id into v_pt2  from patients where first_name = 'Jennifer' and last_name = 'Walsh';
  select id into v_enc1 from encounters where patient_id = v_pt1 and title ilike '%Pneumonia%';
  select id into v_enc2 from encounters where patient_id = v_pt2 and title ilike '%T2DM%';

  -- ── Laboratory Department ────────────────────────────────────

  insert into departments (id, name, slug, description, icon, color, can_receive_orders, can_create_direct, sort_order, created_by) values
    (v_dept_lab, 'Laboratory', 'lab',
     'Clinical pathology — haematology, biochemistry, microbiology, immunology',
     'flask-conical', 'teal', true, true, 20, v_admin)
  on conflict (id) do nothing;

  -- ── Department Block Types (built-in lab_result renderer) ────

  insert into department_block_types (id, department_id, name, description, built_in_type, sort_order) values
    (v_dbt_cbc,   v_dept_lab, 'Complete Blood Count',  'FBC / CBC — haematological panel',           'lab_result', 10),
    (v_dbt_bmp,   v_dept_lab, 'Basic Metabolic Panel', 'Electrolytes, renal function, glucose',       'lab_result', 20),
    (v_dbt_hba1c, v_dept_lab, 'HbA1c & Lipid Panel',  'Glycated Hb + lipid panel + eGFR',            'lab_result', 30)
  on conflict (id) do nothing;

  -- ── Department Member ─────────────────────────────────────────

  insert into department_members (department_id, user_id) values
    (v_dept_lab, v_lab)
  on conflict do nothing;

  -- ── CBC Order/Result — Robert Mitchell (enc1) ─────────────────

  insert into blocks (id, encounter_id, patient_id, type, content, state, sequence_order, author_name, created_by)
  values (
    v_cbc_order_block, v_enc1, v_pt1, 'lab_order',
    '{"panels":["cbc"],"custom":[],"indication":"Community-acquired pneumonia — assess WBC for leukocytosis, haemoglobin, and platelet count.","urgency":"urgent","specimen":"venous blood"}'::jsonb,
    'active', 25, 'Dr. Emily Carter', v_emily
  );

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, content, state, sequence_order, share_to_record, author_name, created_by)
  values (
    v_cbc_result_block, null, v_pt1,
    v_dept_lab, v_dbt_cbc, 'lab_result',
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
    jsonb_build_object('block_type_id', v_dbt_cbc, 'panels', '["cbc"]'::jsonb, 'urgency', 'urgent'),
    'completed', v_cbc_result_block, v_emily, now()
  );

  -- ── BMP Order/Result — Robert Mitchell (enc1) ─────────────────

  insert into blocks (id, encounter_id, patient_id, type, content, state, sequence_order, author_name, created_by)
  values (
    v_bmp_order_block, v_enc1, v_pt1, 'lab_order',
    '{"panels":["metabolic"],"custom":[],"indication":"Pneumonia admission — baseline renal function, electrolytes, and glucose. Patient on Amlodipine.","urgency":"urgent","specimen":"venous blood"}'::jsonb,
    'active', 26, 'Dr. Emily Carter', v_emily
  );

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, content, state, sequence_order, share_to_record, author_name, created_by)
  values (
    v_bmp_result_block, null, v_pt1,
    v_dept_lab, v_dbt_bmp, 'lab_result',
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
    jsonb_build_object('block_type_id', v_dbt_bmp, 'panels', '["metabolic"]'::jsonb, 'urgency', 'urgent'),
    'completed', v_bmp_result_block, v_emily, now()
  );

  -- ── HbA1c & Lipids Order/Result — Jennifer Walsh (enc2) ───────

  insert into blocks (id, encounter_id, patient_id, type, content, state, sequence_order, author_name, created_by)
  values (
    v_hba1c_order_block, v_enc2, v_pt2, 'lab_order',
    '{"panels":["lipids","metabolic"],"custom":[{"name":"HbA1c","unit":"%","ref_low":"4.0","ref_high":"5.7"},{"name":"Urine ACR","unit":"mg/mmol","ref_low":"","ref_high":"3.0"}],"indication":"T2DM follow-up — HbA1c, fasting glucose, lipid panel, eGFR, urine ACR.","urgency":"routine","specimen":"fasting venous blood + spot urine"}'::jsonb,
    'active', 35, 'Dr. James Harrison', v_admin
  );

  insert into blocks (id, encounter_id, patient_id, department_id, department_block_type_id, type, content, state, sequence_order, share_to_record, author_name, created_by)
  values (
    v_hba1c_result_block, null, v_pt2,
    v_dept_lab, v_dbt_hba1c, 'lab_result',
    jsonb_build_object(
      'panels', '["lipids","metabolic"]'::jsonb,
      'custom_defs', '[{"name":"HbA1c","unit":"%","ref_low":"4.0","ref_high":"5.7"},{"name":"Urine ACR","unit":"mg/mmol","ref_low":"","ref_high":"3.0"}]'::jsonb,
      'results', jsonb_build_object(
        'lipids.tchol', jsonb_build_object('value','5.6', 'flag','H','comment','Above target for diabetic patient'),
        'lipids.ldl',   jsonb_build_object('value','3.2', 'flag','H','comment','Above target <2.6'),
        'lipids.hdl',   jsonb_build_object('value','1.1', 'flag','', 'comment','Borderline low'),
        'lipids.tg',    jsonb_build_object('value','2.1', 'flag','H','comment','Mildly elevated'),
        'metabolic.gluc',jsonb_build_object('value','9.2','flag','H','comment','Fasting glucose elevated'),
        'metabolic.egfr',jsonb_build_object('value','72', 'flag','L','comment','Stage G2 CKD — mild reduction')
      ),
      'custom_results', '[{"value":"8.1","flag":"H","comment":"Above target <7%"},{"value":"4.2","flag":"","comment":"Within normal range"}]'::jsonb,
      'notes', 'HbA1c 8.1% — above target. Fasting glucose 9.2 mmol/L elevated. LDL 3.2 above target for diabetic patient. Suggest medication review and dietary reinforcement.',
      'status', 'verified',
      'reported_at', now()
    ),
    'active', 0, true, 'Thomas Wright', v_lab
  );

  insert into block_actions (id, block_id, encounter_id, patient_id, action_type, action_payload, status, result_block_id, triggered_by, completed_at)
  values (
    v_hba1c_action, v_hba1c_order_block, v_enc2, v_pt2,
    'lab',
    jsonb_build_object('block_type_id', v_dbt_hba1c, 'panels', '["lipids","metabolic"]'::jsonb, 'urgency', 'routine'),
    'completed', v_hba1c_result_block, v_admin, now()
  );

end;
$$;

-- ============================================================
-- 7. BILLING — Service Catalogue, Insurance, Charges, Invoice, Payments
-- ============================================================

do $$
declare
  v_admin   uuid := '00000000-0000-0000-0000-000000000001';
  v_emily   uuid := '00000000-0000-0000-0000-000000000002';
  v_michael uuid := '00000000-0000-0000-0000-000000000003';
  v_lab     uuid := '00000000-0000-0000-0000-000000000005';
  v_recep   uuid := '00000000-0000-0000-0000-000000000006';
  v_billing uuid := '00000000-0000-0000-0000-000000000007';

  v_pt1  uuid;
  v_pt2  uuid;
  v_pt3  uuid;
  v_enc1 uuid;
  v_enc2 uuid;
  v_enc4 uuid;
  v_enc5 uuid;

  v_inv3  uuid := gen_random_uuid();   -- David Harrison — full invoice

begin
  -- Resolve IDs
  select id into v_pt1  from patients where first_name = 'Robert'   and last_name = 'Mitchell';
  select id into v_pt2  from patients where first_name = 'Jennifer' and last_name = 'Walsh';
  select id into v_pt3  from patients where first_name = 'David'    and last_name = 'Harrison';
  select id into v_enc1 from encounters where patient_id = v_pt1 and title ilike '%Pneumonia%';
  select id into v_enc2 from encounters where patient_id = v_pt2 and title ilike '%T2DM%';
  select id into v_enc4 from encounters where patient_id = v_pt3 and title ilike '%Abdominal%';
  select id into v_enc5 from encounters where patient_id = v_pt3 and title ilike '%Appendectomy%';

  -- Enable billing in app settings
  insert into app_settings (key, value) values ('billing_enabled', 'true')
  on conflict (key) do update set value = 'true';

  -- ── Service Item Catalogue ────────────────────────────────────

  insert into service_items (code, name, category, default_price, active, sort_order) values
    ('CONS-OP',   'Outpatient Consultation',           'consultation', 75.00,   true, 10),
    ('CONS-IP',   'Inpatient Admission Consultation',  'consultation', 150.00,  true, 20),
    ('CONS-ED',   'Emergency Consultation',            'consultation', 120.00,  true, 25),
    ('CONS-SPEC', 'Specialist Consultation',           'consultation', 200.00,  true, 30),
    ('LAB-CBC',   'Complete Blood Count (CBC)',        'lab',          18.00,   true, 40),
    ('LAB-BMP',   'Basic Metabolic Panel (BMP)',       'lab',          22.00,   true, 45),
    ('LAB-HBA1C', 'HbA1c',                            'lab',          25.00,   true, 50),
    ('LAB-LIPID', 'Lipid Panel',                      'lab',          28.00,   true, 55),
    ('PROC-SURG', 'Laparoscopic Appendectomy',        'procedure',    2500.00, true, 70),
    ('PROC-ANAES','General Anaesthesia (≤1 hour)',    'procedure',    600.00,  true, 75),
    ('PROC-IV',   'IV Line Insertion & Access',        'procedure',    45.00,   true, 80),
    ('MED-PARA',  'Paracetamol IV 1g',                'medication',   12.00,   true, 90),
    ('MED-MOXI',  'Moxifloxacin IV 400mg',            'medication',   38.00,   true, 95),
    ('MED-AZITH', 'Azithromycin IV 500mg',            'medication',   28.00,   true, 96),
    ('WARD-IP',   'Inpatient Ward Stay (per night)',   'ward',         280.00,  true, 100),
    ('WARD-RECOV','Recovery Room (post-op)',           'ward',         150.00,  true, 105)
  on conflict (code) do nothing;

  -- ── Patient Insurance ──────────────────────────────────────────

  -- Robert Mitchell: BlueCross PPO (20% patient copay — admission deposit placed)
  insert into patient_insurance (patient_id, payer_name, policy_number, copay_percent, is_active)
  values (v_pt1, 'BlueCross PPO', 'BCPPO-RM-441829', 20.00, true)
  on conflict do nothing;

  -- Jennifer Walsh: Aetna HMO (15% patient copay)
  insert into patient_insurance (patient_id, payer_name, policy_number, copay_percent, is_active)
  values (v_pt2, 'Aetna HMO', 'AETNA-JW-882041', 15.00, true)
  on conflict do nothing;

  -- David Harrison: self-pay (no insurance)

  -- ── Charges — Robert Mitchell (open inpatient — pending) ──────
  -- Encounter still open. Charges accumulating, to be invoiced on discharge.

  insert into charges (patient_id, encounter_id, description, quantity, unit_price, status, source, created_by) values
    (v_pt1, v_enc1, 'Inpatient Admission Consultation',   1,  150.00, 'pending_insurance', 'encounter_close', v_emily),
    (v_pt1, v_enc1, 'Complete Blood Count (CBC)',          1,   18.00, 'pending_insurance', 'department',      v_lab),
    (v_pt1, v_enc1, 'Basic Metabolic Panel (BMP)',         1,   22.00, 'pending_insurance', 'department',      v_lab),
    (v_pt1, v_enc1, 'IV Line Insertion & Access',          1,   45.00, 'pending_insurance', 'block_auto',      v_emily),
    (v_pt1, v_enc1, 'Moxifloxacin IV 400mg',              3,   38.00, 'pending_insurance', 'block_auto',      v_emily),
    (v_pt1, v_enc1, 'Azithromycin IV 500mg',              3,   28.00, 'pending_insurance', 'block_auto',      v_emily),
    (v_pt1, v_enc1, 'Paracetamol IV 1g',                  4,   12.00, 'pending_insurance', 'block_auto',      v_emily),
    (v_pt1, v_enc1, 'Inpatient Ward Stay (per night)',     2,  280.00, 'pending_insurance', 'block_auto',      v_emily);

  -- Admission deposit from Robert Mitchell (BlueCross claim pending)
  insert into patient_deposits (patient_id, amount, remaining, method, reference, notes, received_by) values
    (v_pt1, 500.00, 500.00, 'card', 'DEP-2026-0012',
     'Admission deposit received on 06/04/2026. BlueCross PPO insurance claim to be submitted on discharge. Copay 20% applicable.',
     v_recep);

  -- ── Charges — Jennifer Walsh (open outpatient — pending) ──────

  insert into charges (patient_id, encounter_id, description, quantity, unit_price, status, source, created_by) values
    (v_pt2, v_enc2, 'Outpatient Consultation',  1, 75.00, 'pending_insurance', 'encounter_close', v_admin),
    (v_pt2, v_enc2, 'HbA1c',                    1, 25.00, 'pending_insurance', 'department',      v_lab),
    (v_pt2, v_enc2, 'Lipid Panel',              1, 28.00, 'pending_insurance', 'department',      v_lab);

  -- ── Charges — David Harrison (closed, self-pay — fully paid) ──

  -- ED encounter charges
  insert into charges (patient_id, encounter_id, description, quantity, unit_price, status, source, created_by) values
    (v_pt3, v_enc4, 'Emergency Consultation',       1,  120.00, 'invoiced', 'encounter_close', v_emily),
    (v_pt3, v_enc4, 'Complete Blood Count (CBC)',    1,   18.00, 'invoiced', 'department',      v_lab),
    (v_pt3, v_enc4, 'IV Line Insertion & Access',    1,   45.00, 'invoiced', 'block_auto',      v_emily),
    (v_pt3, v_enc4, 'Paracetamol IV 1g',             1,   12.00, 'invoiced', 'block_auto',      v_emily);

  -- Surgical inpatient encounter charges
  insert into charges (patient_id, encounter_id, description, quantity, unit_price, status, source, created_by) values
    (v_pt3, v_enc5, 'Specialist Consultation (Surgery)', 1, 200.00,  'invoiced', 'encounter_close', v_michael),
    (v_pt3, v_enc5, 'Laparoscopic Appendectomy',        1, 2500.00, 'invoiced', 'encounter_close', v_michael),
    (v_pt3, v_enc5, 'General Anaesthesia (≤1 hour)',    1,  600.00, 'invoiced', 'encounter_close', v_admin),
    (v_pt3, v_enc5, 'Recovery Room (post-op)',           1,  150.00, 'invoiced', 'block_auto',      v_michael),
    (v_pt3, v_enc5, 'Inpatient Ward Stay (per night)',   1,  280.00, 'invoiced', 'block_auto',      v_michael);
    -- subtotal: 120+18+45+12 + 200+2500+600+150+280 = 3925.00

  -- Invoice — David Harrison (self-pay, paid in full)
  insert into invoices (id, patient_id, invoice_number, subtotal, discount, total, status, issued_at, due_date, notes, created_by)
  values (
    v_inv3, v_pt3, 'INV-2026-0001', 3925.00, 0.00, 3925.00,
    'paid', now(), current_date + 30,
    'Self-pay patient. Full payment received at discharge on 07/04/2026.',
    v_billing
  )
  on conflict do nothing;

  -- Link all pt3 charges to this invoice and mark as paid
  update charges set invoice_id = v_inv3, status = 'paid' where patient_id = v_pt3;

  -- Payment — David Harrison (cash, full payment on discharge)
  insert into payments (patient_id, invoice_id, amount, method, reference, payer_name, notes, received_by)
  values (
    v_pt3, v_inv3, 3925.00, 'cash', 'RCP-2026-0041', 'David Harrison',
    'Full payment of INV-2026-0001 received at cashier on 07/04/2026. Self-pay.',
    v_billing
  );

end;
$$;
