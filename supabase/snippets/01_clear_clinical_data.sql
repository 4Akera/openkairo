-- ============================================================
-- Clear all clinical / encounter data.
-- Preserves: auth users, profiles, roles, block_definitions, templates.
-- Run this before re-running schema.sql on an existing project.
-- Safe to re-run at any time.
-- ============================================================

truncate table block_attachments     restart identity cascade;
truncate table block_entries         restart identity cascade;
truncate table block_acknowledgments restart identity cascade;
truncate table block_actions         restart identity cascade;
truncate table blocks                restart identity cascade;
truncate table encounters            restart identity cascade;
-- Truncating patients cascades to:
--   patient_problems, patient_problem_history,
--   patient_medications, patient_medication_history,
--   patient_allergies, patient_archive
truncate table patients              restart identity cascade;
