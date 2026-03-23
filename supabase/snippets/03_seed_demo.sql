-- ============================================================
-- DEMO SEED DATA
-- Creates realistic demo users, patients, encounters, and templates.
--
-- Prerequisites:
--   1. Run 02_wipe_all.sql  (or 01_clear_clinical_data.sql for data-only reset)
--   2. Run schema.sql
--   3. Then run THIS file
--
-- Demo credentials (all share same password):
--   dr.sarah@demo.com    — Dr. Sarah Chen     (Admin + Physician)
--   dr.james@demo.com    — Dr. James Okonkwo  (Physician)
--   nurse.maria@demo.com — Maria Santos        (Nurse)
-- Password: Demo1234!
-- ============================================================

do $$
declare
  -- User IDs (fixed so cross-references work)
  v_sarah  uuid := '11111111-1111-1111-1111-111111111111';
  v_james  uuid := '22222222-2222-2222-2222-222222222222';
  v_maria  uuid := '33333333-3333-3333-3333-333333333333';

  -- Patient IDs
  v_john   uuid := gen_random_uuid();
  v_sarah_pt uuid := gen_random_uuid();
  v_aisha  uuid := gen_random_uuid();

  -- Role IDs (looked up after insert)
  v_role_admin     uuid;
  v_role_physician uuid;
  v_role_nurse     uuid;

  -- Encounter IDs
  v_enc1 uuid := gen_random_uuid(); -- John: Cardiology Follow-up (closed)
  v_enc2 uuid := gen_random_uuid(); -- John: Routine Check (open)
  v_enc3 uuid := gen_random_uuid(); -- Sarah: Acute Asthma (closed)
  v_enc4 uuid := gen_random_uuid(); -- Aisha: Thyroid Follow-up (open)

begin

  -- ============================================================
  -- 1. AUTH USERS
  -- ============================================================

  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at,
    is_super_admin, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values
    (v_sarah, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'dr.sarah@demo.com', crypt('Demo1234!', gen_salt('bf')), now(),
     '{"full_name":"Dr. Sarah Chen"}'::jsonb, now(), now(),
     false, '', '', '', ''),
    (v_james, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'dr.james@demo.com', crypt('Demo1234!', gen_salt('bf')), now(),
     '{"full_name":"Dr. James Okonkwo"}'::jsonb, now(), now(),
     false, '', '', '', ''),
    (v_maria, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'nurse.maria@demo.com', crypt('Demo1234!', gen_salt('bf')), now(),
     '{"full_name":"Maria Santos RN"}'::jsonb, now(), now(),
     false, '', '', '', '')
  on conflict (id) do nothing;

  -- Ensure profiles exist (trigger should auto-create, but be safe)
  insert into profiles (id, full_name)
  values
    (v_sarah, 'Dr. Sarah Chen'),
    (v_james, 'Dr. James Okonkwo'),
    (v_maria, 'Maria Santos RN')
  on conflict (id) do update set full_name = excluded.full_name;

  -- ============================================================
  -- 2. ROLE ASSIGNMENTS
  -- ============================================================

  -- Ensure system roles exist (idempotent — safe even if schema.sql already ran)
  insert into roles (name, slug, description, is_system, sort_order, permissions) values
    ('System Admin', 'admin',
     'Full access to all features including user and role management',
     true, 10,
     array['encounter.create','encounter.close','encounter.view_all',
           'block.add','block.delete',
           'patient.create','patient.edit_record','patient.view_all',
           'admin.manage_users','admin.manage_roles',
           'admin.manage_blocks','admin.manage_templates',
           'admin.manage_patient_fields','template.create']),
    ('Physician', 'physician',
     'Full clinical access — create encounters, add all block types, edit patient records',
     true, 20,
     array['encounter.create','encounter.close','encounter.view_all',
           'block.add','block.delete',
           'patient.create','patient.edit_record','patient.view_all',
           'template.create']),
    ('Nurse', 'nurse',
     'Can add blocks and view encounters; cannot create encounters or edit the master record',
     true, 30,
     array['encounter.view_all','block.add','patient.view_all']),
    ('Receptionist', 'receptionist',
     'Can register and view patients only',
     true, 40,
     array['patient.create','patient.view_all'])
  on conflict (slug) do update set
    name        = excluded.name,
    description = excluded.description,
    permissions = excluded.permissions;

  select id into v_role_admin     from roles where slug = 'admin';
  select id into v_role_physician from roles where slug = 'physician';
  select id into v_role_nurse     from roles where slug = 'nurse';

  -- Dr. Sarah: admin + physician
  insert into user_roles (user_id, role_id, assigned_by) values
    (v_sarah, v_role_admin,     v_sarah),
    (v_sarah, v_role_physician, v_sarah),
    (v_james, v_role_physician, v_sarah),
    (v_maria, v_role_nurse,     v_sarah)
  on conflict do nothing;

  -- ============================================================
  -- 3. PATIENTS
  -- ============================================================

  -- Patient 1: John Harrington — complex chronic diseases
  insert into patients (id, mrn, first_name, last_name, date_of_birth, date_of_birth_precision,
    gender, blood_group, phone, custom_fields, created_by, created_at)
  values (
    v_john, 'MRN-001', 'John', 'Harrington',
    '1957-03-15', 'full', 'Male', 'B+', '+1 555-0101',
    '{"occupation":"Retired Engineer","marital_status":"Married",
      "emergency_contact":"Margaret Harrington","emergency_phone":"+1 555-0102",
      "emergency_relation":"Spouse","address":"42 Elm Street, Springfield"}'::jsonb,
    v_sarah, now() - interval '2 years'
  );

  -- Patient 2: Sarah Kim — asthma / anxiety
  insert into patients (id, mrn, first_name, last_name, date_of_birth, date_of_birth_precision,
    gender, blood_group, phone, custom_fields, created_by, created_at)
  values (
    v_sarah_pt, 'MRN-002', 'Sarah', 'Kim',
    '1990-08-22', 'full', 'Female', 'O+', '+1 555-0201',
    '{"occupation":"Graphic Designer","marital_status":"Single",
      "emergency_contact":"David Kim","emergency_phone":"+1 555-0202",
      "emergency_relation":"Father"}'::jsonb,
    v_james, now() - interval '8 months'
  );

  -- Patient 3: Aisha Mohammed — hypothyroid / migraine
  insert into patients (id, mrn, first_name, last_name, date_of_birth, date_of_birth_precision,
    gender, blood_group, phone, custom_fields, created_by, created_at)
  values (
    v_aisha, 'MRN-003', 'Aisha', 'Mohammed',
    '1979-11-04', 'full', 'Female', 'A+', '+1 555-0301',
    '{"occupation":"Teacher","marital_status":"Married",
      "emergency_contact":"Tariq Mohammed","emergency_phone":"+1 555-0302",
      "emergency_relation":"Spouse"}'::jsonb,
    v_sarah, now() - interval '1 year'
  );

  -- ============================================================
  -- 4. ALLERGIES
  -- ============================================================

  insert into patient_allergies (patient_id, allergen, reaction, severity, created_by, updated_by) values
    (v_john,     'Penicillin',    'Anaphylaxis — airway swelling, hypotension', 'severe',   v_sarah, v_sarah),
    (v_john,     'Sulfa drugs',   'Diffuse maculopapular rash',                 'moderate', v_sarah, v_sarah),
    (v_sarah_pt, 'NSAIDs',        'Acute bronchospasm, worsening asthma',       'moderate', v_james, v_james),
    (v_sarah_pt, 'Latex',         'Contact urticaria',                          'mild',     v_james, v_james),
    (v_aisha,    'Codeine',       'Nausea, vomiting, excessive sedation',       'moderate', v_sarah, v_sarah);

  -- ============================================================
  -- 5. PROBLEM LISTS
  -- ============================================================

  insert into patient_problems (patient_id, problem, onset_date, onset_date_precision,
    status, importance, notes, created_by, updated_by) values
    -- John
    (v_john, 'Hypertension', '2005-01-01', 'year', 'active', 'high',
     'Currently on Amlodipine 10mg. Target BP <130/80.', v_sarah, v_sarah),
    (v_john, 'Type 2 Diabetes Mellitus', '2008-01-01', 'year', 'active', 'high',
     'HbA1c last check 7.8%. On Metformin. Needs closer monitoring.', v_sarah, v_sarah),
    (v_john, 'Coronary Artery Disease', '2019-06-01', 'month', 'active', 'high',
     'CABG ×3 in June 2019. On aspirin and statin therapy.', v_sarah, v_james),
    (v_john, 'Chronic Kidney Disease — Stage 3', '2020-01-01', 'year', 'active', 'medium',
     'eGFR ~42. Nephrology follow-up annually.', v_james, v_james),
    (v_john, 'Gout', '2015-01-01', 'year', 'active', 'low',
     'Infrequent flares. On Allopurinol 300mg daily.', v_sarah, v_sarah),
    (v_john, 'Appendicitis', '1988-01-01', 'year', 'resolved',
     'low', 'Appendectomy performed 1988, uncomplicated.', v_sarah, v_sarah),
    -- Sarah Kim
    (v_sarah_pt, 'Asthma — moderate persistent', '2012-01-01', 'year', 'active', 'medium',
     'Triggered by dust, cold air, NSAIDs. Uses salbutamol PRN.', v_james, v_james),
    (v_sarah_pt, 'Generalized Anxiety Disorder', '2018-01-01', 'year', 'active', 'medium',
     'Well-controlled on Sertraline 100mg. Regular CBT sessions.', v_james, v_james),
    -- Aisha
    (v_aisha, 'Hypothyroidism', '2010-01-01', 'year', 'active', 'medium',
     'On Levothyroxine 75mcg. TSH within range on last check.', v_sarah, v_sarah),
    (v_aisha, 'Migraine without aura', '2014-01-01', 'year', 'active', 'low',
     '2–3 episodes/month. Sumatriptan for acute attacks.', v_sarah, v_sarah);

  -- ============================================================
  -- 6. MEDICATIONS
  -- ============================================================

  insert into patient_medications (patient_id, medication_name, dosage, frequency, route,
    start_date, start_date_precision, status, prescriber, created_by, updated_by) values
    -- John
    (v_john, 'Metformin',      '1000 mg',  'Twice daily',   'Oral', '2008-06-01', 'month', 'active', 'Dr. Sarah Chen',   v_sarah, v_sarah),
    (v_john, 'Amlodipine',     '10 mg',    'Once daily',    'Oral', '2010-03-01', 'month', 'active', 'Dr. Sarah Chen',   v_sarah, v_sarah),
    (v_john, 'Aspirin',        '75 mg',    'Once daily',    'Oral', '2019-06-01', 'month', 'active', 'Dr. Sarah Chen',   v_sarah, v_sarah),
    (v_john, 'Atorvastatin',   '40 mg',    'Once at night', 'Oral', '2019-06-01', 'month', 'active', 'Dr. Sarah Chen',   v_sarah, v_sarah),
    (v_john, 'Allopurinol',    '300 mg',   'Once daily',    'Oral', '2015-09-01', 'month', 'active', 'Dr. Sarah Chen',   v_sarah, v_sarah),
    (v_john, 'Lisinopril',     '10 mg',    'Once daily',    'Oral', '2005-01-01', 'year',  'discontinued', 'Dr. H. Walsh', v_sarah, v_sarah),
    -- Sarah Kim
    (v_sarah_pt, 'Salbutamol (Ventolin) inhaler', '100 mcg', 'PRN', 'Inhaled', '2012-01-01', 'year',  'active', 'Dr. James Okonkwo', v_james, v_james),
    (v_sarah_pt, 'Sertraline',  '100 mg',   'Once daily',    'Oral', '2018-04-01', 'month', 'active', 'Dr. James Okonkwo', v_james, v_james),
    -- Aisha
    (v_aisha, 'Levothyroxine', '75 mcg',   'Once daily (morning, fasting)', 'Oral', '2010-06-01', 'month', 'active', 'Dr. Sarah Chen', v_sarah, v_sarah),
    (v_aisha, 'Sumatriptan',   '50 mg',    'PRN (max 2/24h)', 'Oral', '2014-09-01', 'month', 'active', 'Dr. Sarah Chen', v_sarah, v_sarah);

  -- ============================================================
  -- 7. HISTORICAL ARCHIVE
  -- ============================================================

  insert into patient_archive (patient_id, category, content, created_by) values
    -- John — hospitalizations
    (v_john, 'visit',
     '{"reason":"Triple vessel CABG","date":"2019-06-10","date_out":"2019-06-19",
       "notes":"Uneventful post-op recovery. Discharged day 9."}'::jsonb, v_sarah),
    (v_john, 'visit',
     '{"reason":"Elective Appendectomy","date":"1988-07-01","date_out":"1988-07-05",
       "notes":"Right lower quadrant pain, confirmed appendicitis. Open appendectomy."}'::jsonb, v_sarah),
    -- John — social history
    (v_john, 'social_hx',
     '{"content":"Retired engineer, married 40 years, 2 adult children. Non-smoker (never). Occasional alcohol (1–2 units/week). Sedentary since retirement. Lives in own home."}'::jsonb, v_sarah),
    -- John — family history
    (v_john, 'family_hx',
     '{"content":"Father: MI age 62, deceased. Mother: T2DM, hypertension, deceased age 78. Brother: T2DM. No family history of malignancy."}'::jsonb, v_sarah),
    -- Sarah Kim — visit
    (v_sarah_pt, 'visit',
     '{"reason":"Acute Asthma Exacerbation — ED Visit","date":"2023-11-03","date_out":"2023-11-03",
       "notes":"Presented with severe wheeze and SpO2 88%. Responded to nebulised salbutamol and IV hydrocortisone. Discharged same day."}'::jsonb, v_james),
    -- Aisha — family history
    (v_aisha, 'family_hx',
     '{"content":"Mother: hypothyroidism, hypertension. Father: T2DM. No known malignancy or cardiovascular disease."}'::jsonb, v_sarah);

  -- ============================================================
  -- 8. ENCOUNTERS
  -- ============================================================

  insert into encounters (id, patient_id, title, status, visibility, portal_visible, created_by, created_at, closed_at) values
    (v_enc1, v_john, 'Cardiology Follow-up', 'closed', 'staff', true,
     v_sarah, now() - interval '3 months', now() - interval '3 months' + interval '1 hour'),
    (v_enc2, v_john, 'Routine Check', 'open', 'staff', false,
     v_james, now() - interval '2 days', null),
    (v_enc3, v_sarah_pt, 'Acute Asthma Exacerbation', 'closed', 'staff', true,
     v_james, now() - interval '4 months', now() - interval '4 months' + interval '3 hours'),
    (v_enc4, v_aisha, 'Thyroid Follow-up', 'open', 'staff', false,
     v_sarah, now() - interval '1 day', null);

  -- ============================================================
  -- 9. BLOCKS
  -- ============================================================

  -- ENC1: John — Cardiology Follow-up (closed, 3 months ago)

  -- Vitals block
  insert into blocks (encounter_id, type, sequence_order, author_name, is_pinned,
    portal_visible, created_by, created_at, content) values
  (v_enc1, 'vitals', 10, 'Maria Santos RN', true, true, v_maria,
   now() - interval '3 months',
   '{
     "bp_systolic":"138","bp_diastolic":"86","bp_flags":[],
     "pr":"72","pr_flags":[],
     "rr":"16","rr_flags":[],
     "temp":"36.8","temp_flags":[],
     "spo2":"97","spo2_flags":[],
     "avpu":"A",
     "news2_score":1
   }'::jsonb),

  -- H&P block
  (v_enc1, 'hx_physical', 20, 'Dr. Sarah Chen', false, true, v_sarah,
   now() - interval '3 months',
   '{
     "cc":"Follow-up after CABG. Patient reports good exercise tolerance, no chest pain or dyspnoea.",
     "hpi":"67-year-old male with CAD s/p triple CABG (2019) presenting for routine cardiology review. He reports walking 30 minutes daily without symptoms. No angina, no palpitations, no orthopnoea. Denies ankle swelling.",
     "ros_constitutional_fatigue":false,
     "ros_constitutional_weight_loss":false,
     "ros_cv_chest_pain":false,
     "ros_cv_palpitations":false,
     "ros_cv_dyspnoea":false,
     "ros_cv_oedema":false,
     "ros_resp_cough":false,
     "ros_resp_wheeze":false,
     "ros_resp_haemoptysis":false,
     "exam_general":"Well-appearing male, no distress, ambulatory",
     "exam_heent":"Unremarkable",
     "exam_cardiac":"Regular rate and rhythm. No murmurs, rubs or gallops. JVP not elevated.",
     "exam_resp":"Clear to auscultation bilaterally",
     "exam_abdomen":"Soft, non-tender, no organomegaly",
     "exam_neuro":"Alert and oriented ×3. Cranial nerves intact."
   }'::jsonb),

  -- Assessment & Plan
  (v_enc1, 'plan', 30, 'Dr. Sarah Chen', false, true, v_sarah,
   now() - interval '3 months',
   '{
     "assessment":"1. CAD post-CABG — well-controlled, asymptomatic\n2. Hypertension — borderline, BP 138/86\n3. T2DM — HbA1c due for recheck",
     "plan":"• Continue aspirin 75mg, atorvastatin 40mg\n• Repeat HbA1c and lipid panel in 6 weeks\n• Increase amlodipine to 10mg if BP remains >135/85 on next visit\n• Annual echocardiogram scheduled\n• Return to clinic in 3 months",
     "follow_up":"3 months"
   }'::jsonb);

  -- ENC2: John — Routine Check (open, 2 days ago) — template-seeded blocks, in edit mode
  insert into blocks (encounter_id, type, sequence_order, author_name, is_pinned,
    is_template_seed, portal_visible, created_by, created_at, content) values
  (v_enc2, 'vitals', 10, 'Maria Santos RN', true, true, true, v_maria,
   now() - interval '2 days', '{}'::jsonb),
  (v_enc2, 'hx_physical', 20, 'Dr. James Okonkwo', false, true, true, v_james,
   now() - interval '2 days', '{}'::jsonb),
  (v_enc2, 'plan', 30, 'Dr. James Okonkwo', false, true, true, v_james,
   now() - interval '2 days', '{}'::jsonb);

  -- ENC3: Sarah Kim — Acute Asthma (closed, 4 months ago)
  insert into blocks (encounter_id, type, sequence_order, author_name, is_pinned,
    portal_visible, share_to_record, created_by, created_at, content) values
  (v_enc3, 'vitals', 10, 'Maria Santos RN', true, true, false, v_maria,
   now() - interval '4 months',
   '{
     "bp_systolic":"128","bp_diastolic":"80","bp_flags":[],
     "pr":"102","pr_flags":["Tachycardic"],
     "rr":"26","rr_flags":["Tachypnoeic"],
     "temp":"37.1","temp_flags":[],
     "spo2":"88","spo2_flags":["On O2"],
     "avpu":"A",
     "news2_score":9
   }'::jsonb),

  (v_enc3, 'hx_physical', 20, 'Dr. James Okonkwo', false, true, false, v_james,
   now() - interval '4 months',
   '{
     "cc":"Severe breathlessness and wheeze, unable to complete sentences.",
     "hpi":"34-year-old female with known moderate persistent asthma presents via ED with 2-hour history of worsening dyspnoea and wheeze after exposure to dust while moving house. Used salbutamol inhaler ×4 puffs without relief. No fever, no productive cough.",
     "ros_resp_wheeze":true,
     "ros_resp_cough":true,
     "ros_cv_dyspnoea":true,
     "exam_general":"Visibly distressed. Using accessory muscles. Speaking in 3-word sentences.",
     "exam_cardiac":"Tachycardic, regular. No murmurs.",
     "exam_resp":"Widespread bilateral expiratory wheeze. Prolonged expiratory phase. Reduced air entry at bases.",
     "exam_heent":"Unremarkable","exam_abdomen":"Soft, non-tender"
   }'::jsonb),

  (v_enc3, 'note', 30, 'Dr. James Okonkwo', false, true, true, v_james,
   now() - interval '4 months',
   '{
     "text":"Treated with:\n• Nebulised salbutamol 5mg ×3 doses q20min\n• Ipratropium 500mcg ×2 doses\n• IV hydrocortisone 100mg stat\n• High-flow O2 via mask (FiO2 40%)\n\nResponse: SpO2 improved to 96% after 90 minutes. Wheeze significantly reduced. Patient able to speak in full sentences.\n\nPeak flow pre: unmeasured (too distressed). Post-treatment: 280 L/min (62% predicted).\n\nDecision: Safe for discharge with step-up inhaled therapy. Prescription for prednisolone 40mg ×5 days."
   }'::jsonb),

  (v_enc3, 'plan', 40, 'Dr. James Okonkwo', false, true, false, v_james,
   now() - interval '4 months',
   '{
     "assessment":"Acute severe asthma exacerbation (PEFR <50%, SpO2 88% on air, unable to complete sentences)",
     "plan":"• Salbutamol nebulised — completed, good response\n• Prednisolone 40mg PO OD ×5 days — prescribed\n• Review regular preventer therapy at GP (consider adding LABA)\n• Avoid NSAID use (documented allergy)\n• Asthma action plan reinforced\n• Return immediately if symptoms worsen",
     "follow_up":"GP review in 5 days"
   }'::jsonb);

  -- ENC4: Aisha — Thyroid Follow-up (open, 1 day ago)
  insert into blocks (encounter_id, type, sequence_order, author_name, is_pinned,
    is_template_seed, portal_visible, created_by, created_at, content) values
  (v_enc4, 'vitals', 10, 'Maria Santos RN', true, false, true, v_maria,
   now() - interval '1 day',
   '{
     "bp_systolic":"118","bp_diastolic":"74","bp_flags":[],
     "pr":"68","pr_flags":[],
     "rr":"14","rr_flags":[],
     "temp":"36.6","temp_flags":[],
     "spo2":"99","spo2_flags":[],
     "avpu":"A",
     "news2_score":0
   }'::jsonb),
  (v_enc4, 'hx_physical', 20, 'Dr. Sarah Chen', false, true, true, v_sarah,
   now() - interval '1 day', '{}'::jsonb);

  -- ============================================================
  -- 10. STANDARD ENCOUNTER TEMPLATES
  -- ============================================================

  insert into encounter_templates (
    name, description, is_universal, visible_to_roles, blocks,
    default_visibility, default_visible_to_roles, created_by
  ) values
  (
    'Inpatient Admission',
    'Standard template for new hospital admissions. H&P and pinned vitals are mandatory.',
    true, '{}',
    '[
      {"slug":"vitals",      "definition_id":null,"pin":true, "sort_order":10},
      {"slug":"hx_physical", "definition_id":null,"pin":false,"sort_order":20},
      {"slug":"med_orders",  "definition_id":null,"pin":false,"sort_order":30},
      {"slug":"plan",        "definition_id":null,"pin":false,"sort_order":40}
    ]'::jsonb,
    'staff', '{}', v_sarah
  ),
  (
    'Outpatient Review',
    'Quick template for routine outpatient or follow-up visits.',
    true, '{}',
    '[
      {"slug":"vitals",      "definition_id":null,"pin":true, "sort_order":10},
      {"slug":"hx_physical", "definition_id":null,"pin":false,"sort_order":20},
      {"slug":"plan",        "definition_id":null,"pin":false,"sort_order":30}
    ]'::jsonb,
    'staff', '{}', v_sarah
  ),
  (
    'Emergency Assessment',
    'For acute/ED presentations. Vitals pinned, note block for quick documentation.',
    true, '{}',
    '[
      {"slug":"vitals",      "definition_id":null,"pin":true, "sort_order":10},
      {"slug":"hx_physical", "definition_id":null,"pin":false,"sort_order":20},
      {"slug":"note",        "definition_id":null,"pin":false,"sort_order":30},
      {"slug":"plan",        "definition_id":null,"pin":false,"sort_order":40}
    ]'::jsonb,
    'staff', '{}', v_sarah
  );

end $$;
