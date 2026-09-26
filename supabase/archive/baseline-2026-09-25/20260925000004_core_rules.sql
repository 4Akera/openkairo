-- 04 · core: keys, foreign keys, indexes, triggers and row security.

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

ALTER TABLE ONLY core.actions
    ADD CONSTRAINT actions_pkey PRIMARY KEY (key);

ALTER TABLE ONLY core.codes
    ADD CONSTRAINT codes_pkey PRIMARY KEY (code);

ALTER TABLE ONLY core.department_types
    ADD CONSTRAINT department_types_pkey PRIMARY KEY (key);

ALTER TABLE ONLY core.departments
    ADD CONSTRAINT departments_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.drafts
    ADD CONSTRAINT drafts_pkey PRIMARY KEY (entry_id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.entry_files
    ADD CONSTRAINT entry_files_pkey PRIMARY KEY (entry_id, "position");

ALTER TABLE ONLY core.entry_types
    ADD CONSTRAINT entry_types_pkey PRIMARY KEY (key);

ALTER TABLE ONLY core.entry_values
    ADD CONSTRAINT entry_values_pkey PRIMARY KEY (entry_id, "position");

ALTER TABLE ONLY core.note_privacy
    ADD CONSTRAINT note_privacy_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.organization_packs
    ADD CONSTRAINT organization_packs_pkey PRIMARY KEY (organization_id, pack);

ALTER TABLE ONLY core.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.pack_calls
    ADD CONSTRAINT pack_calls_pkey PRIMARY KEY (pack, entry_id);

ALTER TABLE ONLY core.packs
    ADD CONSTRAINT packs_pkey PRIMARY KEY (key);

ALTER TABLE ONLY core.patient_allergies
    ADD CONSTRAINT patient_allergies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.patient_changes
    ADD CONSTRAINT patient_changes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.patient_identifiers
    ADD CONSTRAINT patient_identifiers_pkey PRIMARY KEY (patient_id, system, value);

ALTER TABLE ONLY core.patient_list_reviews
    ADD CONSTRAINT patient_list_reviews_pkey PRIMARY KEY (patient_id, list);

ALTER TABLE ONLY core.patient_medications
    ADD CONSTRAINT patient_medications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.patient_problems
    ADD CONSTRAINT patient_problems_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.patients
    ADD CONSTRAINT patients_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.patients
    ADD CONSTRAINT patients_organization_id_record_number_key UNIQUE (organization_id, record_number);

ALTER TABLE ONLY core.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.record_numbers
    ADD CONSTRAINT record_numbers_pkey PRIMARY KEY (organization_id);

ALTER TABLE ONLY core.request_steps
    ADD CONSTRAINT request_steps_pkey PRIMARY KEY (request_id, "position");

ALTER TABLE ONLY core.requests
    ADD CONSTRAINT requests_organization_id_entry_id_key UNIQUE (organization_id, entry_id);

ALTER TABLE ONLY core.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (entry_id);

ALTER TABLE ONLY core.role_actions
    ADD CONSTRAINT role_actions_pkey PRIMARY KEY (role_id, action);

ALTER TABLE ONLY core.roles
    ADD CONSTRAINT roles_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.server_settings
    ADD CONSTRAINT server_settings_pkey PRIMARY KEY (key);

ALTER TABLE ONLY core.service_fields
    ADD CONSTRAINT service_fields_pkey PRIMARY KEY (service_id, "position");

ALTER TABLE ONLY core.services
    ADD CONSTRAINT services_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.settings_changes
    ADD CONSTRAINT settings_changes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY core.visit_steps
    ADD CONSTRAINT visit_steps_pkey PRIMARY KEY (visit_id, "position");

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_organization_id_id_key UNIQUE (organization_id, id);

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_patient_id_id_key UNIQUE (patient_id, id);

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_pkey PRIMARY KEY (id);

CREATE INDEX drafts_by_author ON core.drafts USING btree (author_id, patient_id);

CREATE INDEX entries_by_patient ON core.entries USING btree (patient_id, recorded_at, id);

CREATE UNIQUE INDEX entries_replaces ON core.entries USING btree (replaces_id) WHERE (replaces_id IS NOT NULL);

CREATE INDEX entries_replies ON core.entries USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL);

CREATE UNIQUE INDEX entries_source_key ON core.entries USING btree (organization_id, source, source_key) WHERE (source_key IS NOT NULL);

CREATE INDEX entries_timeline ON core.entries USING btree (patient_id, occurred_at DESC, id DESC) WHERE ((reply_to_id IS NULL) AND (replaced_by_id IS NULL) AND (type <> 'entered_in_error'::text));

CREATE INDEX entries_visit ON core.entries USING btree (visit_id) WHERE (visit_id IS NOT NULL);

CREATE INDEX entries_written_with ON core.entries USING btree (written_with_id) WHERE (written_with_id IS NOT NULL);

CREATE INDEX entry_values_trend ON core.entry_values USING btree (patient_id, code, occurred_at DESC);

CREATE INDEX note_privacy_by_chain ON core.note_privacy USING btree (entry_id, changed_at DESC, id DESC);

CREATE INDEX note_privacy_by_patient ON core.note_privacy USING btree (patient_id);

CREATE INDEX pack_calls_due ON core.pack_calls USING btree (recorded_at) WHERE (tries < 5);

CREATE INDEX patient_allergies_by_patient ON core.patient_allergies USING btree (patient_id);

CREATE INDEX patient_changes_by_patient ON core.patient_changes USING btree (patient_id, recorded_at DESC);

CREATE INDEX patient_identifiers_value ON core.patient_identifiers USING btree (organization_id, value);

CREATE INDEX patient_medications_active ON core.patient_medications USING btree (patient_id) WHERE (status = 'active'::text);

CREATE INDEX patient_problems_active ON core.patient_problems USING btree (patient_id) WHERE (status = 'active'::text);

CREATE INDEX patients_family_dm ON core.patients USING btree (organization_id, extensions.dmetaphone(family_name));

CREATE INDEX patients_family_trgm ON core.patients USING gin (core.fold(family_name) extensions.gin_trgm_ops);

CREATE INDEX patients_given_trgm ON core.patients USING gin (core.fold(given_name) extensions.gin_trgm_ops);

CREATE INDEX patients_merged ON core.patients USING btree (merged_into_id) WHERE (merged_into_id IS NOT NULL);

CREATE INDEX patients_phone ON core.patients USING btree (organization_id, phone_digits) WHERE (phone_digits <> ''::text);

CREATE INDEX record_reads_anyway ON core.record_reads USING btree (organization_id, read_at DESC) WHERE (basis = 'anyway'::text);

CREATE INDEX record_reads_by_patient ON core.record_reads USING btree (patient_id, read_at DESC);

CREATE INDEX record_reads_open ON core.record_reads USING btree (user_id, patient_id, read_at DESC);

CREATE INDEX record_reads_opened_department ON core.record_reads USING btree (user_id, opened_department_id, patient_id, read_at DESC) WHERE (basis = 'anyway'::text);

CREATE INDEX requests_by_patient ON core.requests USING btree (patient_id) WHERE ((status = 'open'::core.request_status) OR (review_needed_at IS NOT NULL));

CREATE INDEX requests_dept_review ON core.requests USING btree (from_department_id, review_needed_at) WHERE (review_needed_at IS NOT NULL);

CREATE INDEX requests_queue ON core.requests USING btree (to_department_id, priority, due_at) WHERE (status = 'open'::core.request_status);

CREATE INDEX requests_replied ON core.requests USING btree (patient_id, replied_at DESC) WHERE (replied_at IS NOT NULL);

CREATE INDEX requests_to_review ON core.requests USING btree (requester_id, review_needed_at) WHERE (review_needed_at IS NOT NULL);

CREATE UNIQUE INDEX roles_key ON core.roles USING btree (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), key) WHERE (retired_at IS NULL);

CREATE UNIQUE INDEX served_departments_uniq ON core.served_departments USING btree (department_id, COALESCE(served_department_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX services_code ON core.services USING btree (organization_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid), code) WHERE (retired_at IS NULL);

CREATE INDEX settings_changes_by_row ON core.settings_changes USING btree (organization_id, table_name, row_id, recorded_at DESC);

CREATE UNIQUE INDEX templates_shortcut ON core.templates USING btree (organization_id, shortcut) WHERE ((shortcut IS NOT NULL) AND (retired_at IS NULL));

CREATE INDEX user_roles_by_user ON core.user_roles USING btree (user_id);

CREATE UNIQUE INDEX user_roles_uniq ON core.user_roles USING btree (user_id, role_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX users_by_login ON core.users USING btree (login_id) WHERE (login_id IS NOT NULL);

CREATE UNIQUE INDEX users_login ON core.users USING btree (organization_id, login_id) WHERE ((login_id IS NOT NULL) AND (retired_at IS NULL));

CREATE INDEX visits_by_patient ON core.visits USING btree (patient_id, arrived_at DESC);

CREATE UNIQUE INDEX visits_open ON core.visits USING btree (patient_id, department_id) WHERE (ended_at IS NULL);

CREATE INDEX visits_open_by_dept ON core.visits USING btree (department_id) WHERE (ended_at IS NULL);

CREATE INDEX visits_present ON core.visits USING btree (department_id) WHERE (present_at IS NOT NULL);

CREATE TRIGGER entries_no_truncate BEFORE TRUNCATE ON core.entries FOR EACH STATEMENT EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER entries_permanent BEFORE DELETE OR UPDATE ON core.entries FOR EACH ROW EXECUTE FUNCTION core.entries_permanent();

CREATE TRIGGER entry_files_permanent BEFORE DELETE OR UPDATE ON core.entry_files FOR EACH ROW EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER note_privacy_permanent BEFORE DELETE OR UPDATE ON core.note_privacy FOR EACH ROW EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER organizations_time_zone BEFORE INSERT OR UPDATE OF time_zone ON core.organizations FOR EACH ROW EXECUTE FUNCTION core.check_time_zone();

CREATE TRIGGER patient_changes_permanent BEFORE DELETE OR UPDATE ON core.patient_changes FOR EACH ROW EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER record_reads_permanent BEFORE DELETE OR UPDATE ON core.record_reads FOR EACH ROW EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER request_steps_permanent BEFORE DELETE OR UPDATE ON core.request_steps FOR EACH ROW EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER requests_guard BEFORE DELETE OR UPDATE ON core.requests FOR EACH ROW EXECUTE FUNCTION core.requests_guard();

CREATE TRIGGER settings_changes_permanent BEFORE DELETE OR UPDATE OR TRUNCATE ON core.settings_changes FOR EACH STATEMENT EXECUTE FUNCTION core.refuse_change();

CREATE TRIGGER visit_steps_permanent BEFORE DELETE OR UPDATE ON core.visit_steps FOR EACH ROW EXECUTE FUNCTION core.refuse_change();

ALTER TABLE ONLY core.codes
    ADD CONSTRAINT codes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.codes
    ADD CONSTRAINT codes_replaced_by_code_fkey FOREIGN KEY (replaced_by_code) REFERENCES core.codes(code);

ALTER TABLE ONLY core.departments
    ADD CONSTRAINT departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.departments
    ADD CONSTRAINT departments_type_fkey FOREIGN KEY (type) REFERENCES core.department_types(key);

ALTER TABLE ONLY core.drafts
    ADD CONSTRAINT drafts_type_fkey FOREIGN KEY (type) REFERENCES core.entry_types(key);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_organization_id_author_id_fkey FOREIGN KEY (organization_id, author_id) REFERENCES core.users(organization_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_organization_id_department_id_fkey FOREIGN KEY (organization_id, department_id) REFERENCES core.departments(organization_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_organization_id_patient_id_fkey FOREIGN KEY (organization_id, patient_id) REFERENCES core.patients(organization_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_organization_id_responsible_id_fkey FOREIGN KEY (organization_id, responsible_id) REFERENCES core.users(organization_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_organization_id_service_id_fkey FOREIGN KEY (organization_id, service_id) REFERENCES core.services(organization_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_patient_id_visit_id_fkey FOREIGN KEY (patient_id, visit_id) REFERENCES core.visits(patient_id, id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_replaced_by_id_fkey FOREIGN KEY (replaced_by_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_replaces_id_fkey FOREIGN KEY (replaces_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_reply_to_fk FOREIGN KEY (reply_to_id) REFERENCES core.requests(entry_id);

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_type_fkey FOREIGN KEY (type) REFERENCES core.entry_types(key) ON DELETE RESTRICT;

ALTER TABLE ONLY core.entries
    ADD CONSTRAINT entries_written_with_id_fkey FOREIGN KEY (written_with_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.entry_files
    ADD CONSTRAINT entry_files_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.entry_types
    ADD CONSTRAINT entry_types_pack_fkey FOREIGN KEY (pack) REFERENCES core.packs(key);

ALTER TABLE ONLY core.entry_values
    ADD CONSTRAINT entry_values_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.note_privacy
    ADD CONSTRAINT note_privacy_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.note_privacy
    ADD CONSTRAINT note_privacy_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.organization_packs
    ADD CONSTRAINT organization_packs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.organization_packs
    ADD CONSTRAINT organization_packs_pack_fkey FOREIGN KEY (pack) REFERENCES core.packs(key);

ALTER TABLE ONLY core.pack_calls
    ADD CONSTRAINT pack_calls_pack_fkey FOREIGN KEY (pack) REFERENCES core.packs(key);

ALTER TABLE ONLY core.patient_changes
    ADD CONSTRAINT patient_changes_organization_id_patient_id_fkey FOREIGN KEY (organization_id, patient_id) REFERENCES core.patients(organization_id, id);

ALTER TABLE ONLY core.patient_identifiers
    ADD CONSTRAINT patient_identifiers_organization_id_patient_id_fkey FOREIGN KEY (organization_id, patient_id) REFERENCES core.patients(organization_id, id);

ALTER TABLE ONLY core.patients
    ADD CONSTRAINT patients_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES core.patients(id);

ALTER TABLE ONLY core.patients
    ADD CONSTRAINT patients_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.record_numbers
    ADD CONSTRAINT record_numbers_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.request_steps
    ADD CONSTRAINT request_steps_request_id_fkey FOREIGN KEY (request_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.requests
    ADD CONSTRAINT requests_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES core.entries(id);

ALTER TABLE ONLY core.requests
    ADD CONSTRAINT requests_organization_id_assignee_id_fkey FOREIGN KEY (organization_id, assignee_id) REFERENCES core.users(organization_id, id);

ALTER TABLE ONLY core.requests
    ADD CONSTRAINT requests_organization_id_to_department_id_fkey FOREIGN KEY (organization_id, to_department_id) REFERENCES core.departments(organization_id, id);

ALTER TABLE ONLY core.role_actions
    ADD CONSTRAINT role_actions_action_fkey FOREIGN KEY (action) REFERENCES core.actions(key);

ALTER TABLE ONLY core.role_actions
    ADD CONSTRAINT role_actions_role_id_fkey FOREIGN KEY (role_id) REFERENCES core.roles(id);

ALTER TABLE ONLY core.roles
    ADD CONSTRAINT roles_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.served_departments
    ADD CONSTRAINT served_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES core.departments(id);

ALTER TABLE ONLY core.served_departments
    ADD CONSTRAINT served_departments_served_department_id_fkey FOREIGN KEY (served_department_id) REFERENCES core.departments(id);

ALTER TABLE ONLY core.service_field_ranges
    ADD CONSTRAINT service_field_ranges_service_id_fkey FOREIGN KEY (service_id) REFERENCES core.services(id);

ALTER TABLE ONLY core.service_field_ranges
    ADD CONSTRAINT service_field_ranges_service_id_position_fkey FOREIGN KEY (service_id, "position") REFERENCES core.service_fields(service_id, "position");

ALTER TABLE ONLY core.service_fields
    ADD CONSTRAINT service_fields_code_fkey FOREIGN KEY (code) REFERENCES core.codes(code);

ALTER TABLE ONLY core.service_fields
    ADD CONSTRAINT service_fields_service_id_fkey FOREIGN KEY (service_id) REFERENCES core.services(id);

ALTER TABLE ONLY core.services
    ADD CONSTRAINT services_organization_id_department_id_fkey FOREIGN KEY (organization_id, department_id) REFERENCES core.departments(organization_id, id);

ALTER TABLE ONLY core.services
    ADD CONSTRAINT services_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.settings_changes
    ADD CONSTRAINT settings_changes_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.templates
    ADD CONSTRAINT templates_organization_id_department_id_fkey FOREIGN KEY (organization_id, department_id) REFERENCES core.departments(organization_id, id);

ALTER TABLE ONLY core.templates
    ADD CONSTRAINT templates_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.templates
    ADD CONSTRAINT templates_organization_id_user_id_fkey FOREIGN KEY (organization_id, user_id) REFERENCES core.users(organization_id, id);

ALTER TABLE ONLY core.user_roles
    ADD CONSTRAINT user_roles_organization_id_department_id_fkey FOREIGN KEY (organization_id, department_id) REFERENCES core.departments(organization_id, id);

ALTER TABLE ONLY core.user_roles
    ADD CONSTRAINT user_roles_organization_id_user_id_fkey FOREIGN KEY (organization_id, user_id) REFERENCES core.users(organization_id, id);

ALTER TABLE ONLY core.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES core.roles(id);

ALTER TABLE ONLY core.users
    ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES core.organizations(id);

ALTER TABLE ONLY core.visit_steps
    ADD CONSTRAINT visit_steps_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id);

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_organization_id_assignee_id_fkey FOREIGN KEY (organization_id, assignee_id) REFERENCES core.users(organization_id, id);

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_organization_id_department_id_fkey FOREIGN KEY (organization_id, department_id) REFERENCES core.departments(organization_id, id);

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_organization_id_patient_id_fkey FOREIGN KEY (organization_id, patient_id) REFERENCES core.patients(organization_id, id);

ALTER TABLE ONLY core.visits
    ADD CONSTRAINT visits_request_fk FOREIGN KEY (organization_id, request_id) REFERENCES core.requests(organization_id, entry_id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE core.actions ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.department_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.departments ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.drafts ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.entry_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.entry_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.entry_values ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.erasures ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.organization_packs ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.pack_calls ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.packs ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patient_allergies ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patient_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patient_identifiers ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patient_list_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patient_medications ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patient_problems ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.patients ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.record_numbers ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.record_reads ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.request_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.role_actions ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.served_departments ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.service_field_ranges ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.service_fields ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.services ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.settings_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.visit_steps ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.visits ENABLE ROW LEVEL SECURITY;
