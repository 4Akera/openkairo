-- ============================================================
-- FULL WIPE — removes ALL data including auth users.
-- After running this, re-run schema.sql to restore structure.
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Clinical tables (cascade handles all child tables:
--    encounters → blocks, block_entries, block_attachments,
--    block_actions, block_acknowledgments;
--    patients → patient_problems, patient_problem_history,
--    patient_medications, patient_medication_history,
--    patient_allergies, patient_archive)
truncate table patients restart identity cascade;

-- 2. Block definitions (safe now — blocks are gone)
truncate table block_definitions restart identity cascade;

-- 3. Encounter templates
truncate table encounter_templates restart identity cascade;

-- 4. Patient field definitions
truncate table patient_field_definitions restart identity cascade;

-- 5. Roles (cascades to user_roles)
truncate table roles restart identity cascade;

-- 6. Auth users (cascades to profiles)
delete from auth.users;
