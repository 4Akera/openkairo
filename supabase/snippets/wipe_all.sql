-- ============================================================
-- OpenKairo — Full Wipe
-- Removes ALL data including auth users and configuration.
-- After running this, re-run schema.sql then seed_demo.sql.
-- ============================================================

-- 1. Billing tables (cascade safe order)
do $$ begin
  truncate table payments           restart identity cascade;
  truncate table patient_deposits   restart identity cascade;
  truncate table invoices           restart identity cascade;
  truncate table charges            restart identity cascade;
  truncate table patient_insurance  restart identity cascade;
  truncate table service_items      restart identity cascade;
exception when undefined_table then null;
end $$;

-- 2. Department tables (only exist on schemas that include the departments system)
do $$ begin
  truncate table department_members     restart identity cascade;
  truncate table department_block_types restart identity cascade;
  truncate table departments            restart identity cascade;
exception when undefined_table then null;
end $$;

-- 2. Block sub-tables (all cascade from blocks/encounters)
truncate table block_attachments     restart identity cascade;
truncate table block_entries         restart identity cascade;
truncate table block_acknowledgments restart identity cascade;
truncate table block_actions         restart identity cascade;
truncate table blocks                restart identity cascade;

-- 3. Encounters (cascades to blocks if not already gone)
truncate table encounters            restart identity cascade;

-- 4. Patient clinical data (cascades from patients)
truncate table patients              restart identity cascade;

-- 5. Patient field definitions
truncate table patient_field_definitions restart identity cascade;

-- 6. Block definitions
truncate table block_definitions     restart identity cascade;

-- 7. Encounter templates
truncate table encounter_templates   restart identity cascade;

-- 8. Roles (cascades to user_roles)
truncate table roles                 restart identity cascade;

-- 9. Auth users (cascades to profiles and user_roles)
delete from auth.users;
