-- 05 · core: who may execute what. The API is granted to `authenticated`; core's tables to nobody.

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

GRANT USAGE ON SCHEMA core TO authenticated;
GRANT USAGE ON SCHEMA core TO service_role;
GRANT USAGE ON SCHEMA core TO pack_runner;

REVOKE USAGE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON FUNCTION core.can(p_user uuid, p_org uuid, p_action text, p_department uuid) TO authenticated;

GRANT ALL ON FUNCTION core.current_user_id(p_organization_id uuid) TO authenticated;
GRANT ALL ON FUNCTION core.current_user_id(p_organization_id uuid) TO pack_runner;

GRANT ALL ON FUNCTION core.may_listen(p_topic text) TO authenticated;

GRANT ALL ON FUNCTION core.require_access(p_organization_id uuid, p_action text, p_patient_id uuid, p_department_id uuid) TO authenticated;
GRANT ALL ON FUNCTION core.require_access(p_organization_id uuid, p_action text, p_patient_id uuid, p_department_id uuid) TO pack_runner;

GRANT ALL ON FUNCTION core.require_pack(p_organization_id uuid, p_pack text) TO authenticated;
GRANT ALL ON FUNCTION core.require_pack(p_organization_id uuid, p_pack text) TO pack_runner;

REVOKE ALL ON FUNCTION public.create_organization(id uuid, name text, owner_id uuid, owner_name text, owner_login_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_organization(id uuid, name text, owner_id uuid, owner_name text, owner_login_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.delete_department(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_role(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_service(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_template(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.delete_user(id uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.erase_patient(patient_id uuid, reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.erase_patient(patient_id uuid, reason text) TO service_role;

REVOKE ALL ON FUNCTION public.link_login(user_id uuid, login_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_login(user_id uuid, login_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.mark_note_private(entry_id uuid, is_private boolean, reason text) TO authenticated;

GRANT ALL ON FUNCTION public.mark_present(visit_id uuid, is_present boolean) TO authenticated;

GRANT ALL ON FUNCTION public.mark_reviewed(request_ids uuid[]) TO authenticated;

GRANT ALL ON FUNCTION public.mark_routing(request_id uuid, assignee_id uuid, to_department_id uuid, priority core.request_priority, due_at timestamp with time zone, reason text) TO authenticated;

GRANT ALL ON FUNCTION public.mark_step(request_id uuid, from_step core.request_step, step core.request_step, reason text, occurred_at timestamp with time zone) TO authenticated;

GRANT ALL ON FUNCTION public.mark_visit(visit_id uuid, from_status core.visit_status, status core.visit_status, reason text, wait boolean) TO authenticated;

GRANT ALL ON FUNCTION public.mark_visit_priority(visit_id uuid, priority core.request_priority) TO authenticated;

GRANT ALL ON FUNCTION public.mark_visit_routing(visit_id uuid, assignee_id uuid, priority core.request_priority, is_first boolean) TO authenticated;

GRANT ALL ON FUNCTION public.my_organization() TO authenticated;

GRANT ALL ON FUNCTION public.open_visit(id uuid, patient_id uuid, department_id uuid, priority core.request_priority, assignee_id uuid, request_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_actions(organization_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_codes(organization_id uuid, query text, "limit" integer) TO authenticated;

GRANT ALL ON FUNCTION public.read_entries(patient_id uuid, before_at timestamp with time zone, before_id uuid, types text[], "limit" integer, visit_ids uuid[], department_ids uuid[], between_visits boolean) TO authenticated;

GRANT ALL ON FUNCTION public.read_entry(entry_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_entry_file(entry_id uuid, file_position smallint) TO authenticated;

GRANT ALL ON FUNCTION public.read_opened_anyway(organization_id uuid, since timestamp with time zone) TO authenticated;

GRANT ALL ON FUNCTION public.read_organization(organization_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_patient(patient_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_patients(organization_id uuid, query text, born_on text, phone_text text) TO authenticated;

GRANT ALL ON FUNCTION public.read_queue(department_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_ranges(organization_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_record(patient_id uuid, department_id uuid, open_department_id uuid, reason text) TO authenticated;

GRANT ALL ON FUNCTION public.read_record_reads(patient_id uuid, "limit" integer) TO authenticated;

GRANT ALL ON FUNCTION public.read_reply_types(organization_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_results_table(patient_id uuid, "limit" integer) TO authenticated;

GRANT ALL ON FUNCTION public.read_sent_outside(organization_id uuid, department_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_settings_changes(organization_id uuid, table_name text, row_id uuid, "limit" integer) TO authenticated;

GRANT ALL ON FUNCTION public.read_to_review(department_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_values(patient_id uuid, codes text[], "limit" integer) TO authenticated;

GRANT ALL ON FUNCTION public.read_visit_queue(department_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.read_visits(patient_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.register_patient(id uuid, organization_id uuid, given_name text, family_name text, sex core.sex, born_on text, middle_name text, died_on text, phone_text text, contact_text text, identifiers jsonb, seen_change_id uuid, change_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.retire_department(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.retire_organization_pack(organization_id uuid, pack text) TO authenticated;

GRANT ALL ON FUNCTION public.retire_role(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.retire_service(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.retire_template(id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.retry_pack_calls(organization_id uuid, pack text) TO authenticated;

GRANT ALL ON FUNCTION public.save_department(id uuid, organization_id uuid, type text, name text, site_name text, is_outside boolean, contact_text text, serves uuid[], seen_change_id uuid, patients_wait boolean, review_results text, is_private boolean, after_done text, pack_cards boolean) TO authenticated;

GRANT ALL ON FUNCTION public.save_organization(organization_id uuid, name text, time_zone text, record_view text) TO authenticated;

GRANT ALL ON FUNCTION public.save_organization_pack(organization_id uuid, pack text) TO authenticated;

GRANT ALL ON FUNCTION public.save_role(id uuid, organization_id uuid, name text, actions text[], seen_change_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.save_service(id uuid, organization_id uuid, department_id uuid, code text, name text, reply_type text, section_name text, fields jsonb, seen_change_id uuid, ranges jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.save_template(id uuid, organization_id uuid, name text, items jsonb, department_id uuid, seen_change_id uuid, shortcut text, lines text[]) TO authenticated;

GRANT ALL ON FUNCTION public.save_user(id uuid, organization_id uuid, kind core.user_kind, name text, title text, roles jsonb, departments uuid[], retired_at timestamp with time zone, seen_change_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.write_allergy(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, action text, allergy_id uuid, substance jsonb, kind text, reactions_text text, severity text, certainty text, onset_on text) TO authenticated;

GRANT ALL ON FUNCTION public.write_entered_in_error(id uuid, replaces_id uuid, department_id uuid, reason_text text) TO authenticated;

GRANT ALL ON FUNCTION public.write_list_review(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, list core.list_kind, outcome text, items uuid[]) TO authenticated;

GRANT ALL ON FUNCTION public.write_note(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, kind text, text text, fields jsonb, problems jsonb, reply_to_id uuid, is_final boolean, files jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.write_prescription(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, action text, medication_id uuid, drug jsonb, dose_number numeric, dose_unit text, route text, frequency text, prn boolean, prn_reason_text text, duration_days integer, quantity numeric, repeats integer, instructions_text text, problems jsonb, stop_reason_text text, send boolean) TO authenticated;

GRANT ALL ON FUNCTION public.write_problem(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, action text, problem_id uuid, code text, name text, status text, onset_on text, resolved_on text, text text, certainty text) TO authenticated;

GRANT ALL ON FUNCTION public.write_request(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, service_id uuid, priority core.request_priority, due_at timestamp with time zone, question_text text, problems jsonb, to_department_id uuid) TO authenticated;

GRANT ALL ON FUNCTION public.write_result(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, request_id uuid, "values" jsonb, text text, is_final boolean, not_done boolean, not_done_reason_text text, needs_review boolean, files jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.write_set(department_id uuid, items jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.write_vitals(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, systolic numeric, diastolic numeric, pulse numeric, respiratory_rate numeric, temperature numeric, spo2 numeric, weight numeric, height numeric) TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT UPDATE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO service_role;



--
--
