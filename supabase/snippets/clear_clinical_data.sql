-- ============================================================
-- OpenKairo — Clear Clinical & Department Data
-- Preserves: auth users, profiles, roles, block_definitions,
--            encounter_templates, patient_field_definitions,
--            departments, department_block_types, department_members,
--            service_items (fee schedule).
-- Safe to re-run at any time.
-- ============================================================

-- Billing transactional data (patient-specific)
do $$ begin
  truncate table payments           restart identity cascade;
  truncate table patient_deposits   restart identity cascade;
  truncate table invoices           restart identity cascade;
  truncate table charges            restart identity cascade;
  truncate table patient_insurance  restart identity cascade;
exception when undefined_table then null;
end $$;

-- Block sub-tables
truncate table block_attachments     restart identity cascade;
truncate table block_entries         restart identity cascade;
truncate table block_acknowledgments restart identity cascade;
truncate table block_actions         restart identity cascade;
truncate table blocks                restart identity cascade;

-- Encounters
truncate table encounters            restart identity cascade;

-- Patients (cascades to all clinical child tables)
truncate table patients              restart identity cascade;
