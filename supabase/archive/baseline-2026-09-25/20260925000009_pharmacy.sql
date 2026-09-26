-- 09 · the pharmacy pack (the baseline of 2026-09-25): its role, schema, functions, grants and registry rows.

set check_function_bodies = false;
select pg_catalog.set_config('search_path', '', false);
set client_min_messages = warning;

-- pharmacy pack (spec 06): dispensing a prescription. Kinds only — the practice makes the Pharmacy department and its Dispensing service.
-- its role: no privilege on any core table; only the funnel and the gates (K2 moves this to core.create_pack_role)
do $$ begin if not exists (select 1 from pg_roles where rolname = 'pack_pharmacy') then create role pack_pharmacy nologin; end if; end $$;
grant pack_pharmacy to postgres;   -- the migration runner is not a superuser; it must be allowed to SET ROLE

INSERT INTO core.actions (key, pack) VALUES ('write:pharmacy_dispense', 'pharmacy');
INSERT INTO core.actions (key, pack) VALUES ('mark:prepared', 'pharmacy');
INSERT INTO core.department_types (key, name, pack, is_visited, retired_at) VALUES ('pharmacy', 'Pharmacy', 'pharmacy', false, NULL);
INSERT INTO core.packs (key, name, is_called_after_write) VALUES ('pharmacy', 'Pharmacy', false);
INSERT INTO core.entry_types (key, name, pack, list, pack_list, retired_at, is_note, answers) VALUES ('pharmacy_dispense', 'Dispense', 'pharmacy', NULL, NULL, NULL, false, 'prescription');
INSERT INTO core.roles (id, organization_id, key, name, retired_at) VALUES ('00000000-0000-0000-0000-00000000ca01', NULL, 'pharmacy_pharmacist', 'Pharmacist', NULL);
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'read:organization');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'read:patient');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'read:queue');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'read:record');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'write:pharmacy_dispense');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'mark:prepared');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'mark:held');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'mark:sent');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000ca01', 'mark:cancelled');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000c001', 'write:pharmacy_dispense');
INSERT INTO core.role_actions (role_id, action) VALUES ('00000000-0000-0000-0000-00000000c001', 'mark:prepared');

CREATE SCHEMA pharmacy;


ALTER SCHEMA pharmacy OWNER TO pack_pharmacy;

-- dispense: the reply that closes a prescription's request. items: [{name, dose_number, dose_unit, quantity, substituted_from}]
CREATE FUNCTION pharmacy.write_dispense(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, request_id uuid DEFAULT NULL::uuid, items jsonb DEFAULT '[]'::jsonb, text text DEFAULT NULL::text, not_done boolean DEFAULT false, not_done_reason_text text DEFAULT NULL::text) RETURNS core.entries
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare h record; d jsonb; line text;
begin
  select * into h from core.begin_write(patient_id, department_id, 'write:pharmacy_dispense', source, stated_author_name, stated_recorded_at, '{}');
  perform core.require_pack(h.o_org, 'pharmacy');
  if request_id is null then perform core.refuse('request_missing', 'a dispense answers a prescription'); end if;
  if not not_done and pg_catalog.jsonb_array_length(coalesce(items, '[]')) = 0 then perform core.refuse('items_missing'); end if;
  if not_done and coalesce(pg_catalog.btrim(not_done_reason_text), '') = '' then perform core.refuse('reason_missing'); end if;
  d := h.o_data || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('items', items, 'text', text,
         'not_done', case when not_done then true end, 'not_done_reason_text', not_done_reason_text));
  line := case when not_done then 'Not dispensed — ' || core.short(not_done_reason_text, 60)
    else 'Dispensed: ' || (select pg_catalog.string_agg(pg_catalog.concat_ws(' ', i->>'name', nullif(pg_catalog.concat_ws(' ', i->>'dose_number', i->>'dose_unit'), ''),
           case when i->>'quantity' is not null then '× ' || (i->>'quantity') end, case when i->>'substituted_from' is not null then '(for ' || (i->>'substituted_from') || ')' end), ' · ')
         from pg_catalog.jsonb_array_elements(items) i) end;
  -- the funnel checks the reply against the service's reply type, the patient, the department and the author
  return core.write_entry(id, h.o_org, patient_id, visit_id, department_id, h.o_author, responsible_id, source, source_key, occurred_at,
    'pharmacy_dispense', null, d, line, request_id, true, replaces_id, written_with_id, null, false);
end $$;


ALTER FUNCTION pharmacy.write_dispense(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, request_id uuid, items jsonb, text text, not_done boolean, not_done_reason_text text) OWNER TO pack_pharmacy;

-- ── the public door: a thin invoker wrapper, so the pack's code runs as its own role ──
CREATE FUNCTION public.pharmacy_write_dispense(id uuid, patient_id uuid, visit_id uuid DEFAULT NULL::uuid, department_id uuid DEFAULT NULL::uuid, replaces_id uuid DEFAULT NULL::uuid, occurred_at timestamp with time zone DEFAULT NULL::timestamp with time zone, responsible_id uuid DEFAULT NULL::uuid, source core.entry_source DEFAULT 'staff'::core.entry_source, source_key text DEFAULT NULL::text, stated_author_name text DEFAULT NULL::text, stated_recorded_at timestamp with time zone DEFAULT NULL::timestamp with time zone, written_with_id uuid DEFAULT NULL::uuid, request_id uuid DEFAULT NULL::uuid, items jsonb DEFAULT '[]'::jsonb, text text DEFAULT NULL::text, not_done boolean DEFAULT false, not_done_reason_text text DEFAULT NULL::text) RETURNS core.entries
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select * from pharmacy.write_dispense(id, patient_id, visit_id, department_id, replaces_id, occurred_at, responsible_id, source, source_key,
    stated_author_name, stated_recorded_at, written_with_id, request_id, items, text, not_done, not_done_reason_text)
$$;


ALTER FUNCTION public.pharmacy_write_dispense(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, request_id uuid, items jsonb, text text, not_done boolean, not_done_reason_text text) OWNER TO postgres;

GRANT USAGE ON SCHEMA core TO pack_pharmacy;
GRANT ALL ON FUNCTION core.begin_write(p_patient_id uuid, p_department_id uuid, p_action text, p_source core.entry_source, p_stated_author_name text, p_stated_recorded_at timestamp with time zone, p_data jsonb, OUT o_org uuid, OUT o_author uuid, OUT o_data jsonb) TO pack_pharmacy;
GRANT ALL ON FUNCTION core.refuse(code text, detail text) TO pack_pharmacy;
GRANT ALL ON FUNCTION core.require_access(p_organization_id uuid, p_action text, p_patient_id uuid, p_department_id uuid) TO pack_pharmacy;
GRANT ALL ON FUNCTION core.require_pack(p_organization_id uuid, p_pack text) TO pack_pharmacy;
GRANT ALL ON FUNCTION core.short(t text, n integer) TO pack_pharmacy;
GRANT ALL ON FUNCTION core.write_entry(p_id uuid, p_organization_id uuid, p_patient_id uuid, p_visit_id uuid, p_department_id uuid, p_author_id uuid, p_responsible_id uuid, p_source core.entry_source, p_source_key text, p_occurred_at timestamp with time zone, p_type text, p_service_id uuid, p_data jsonb, p_display_line text, p_reply_to_id uuid, p_is_final boolean, p_replaces_id uuid, p_written_with_id uuid, p_destination jsonb, p_needs_review boolean) TO pack_pharmacy;

GRANT USAGE ON SCHEMA pharmacy TO authenticated;

GRANT ALL ON FUNCTION pharmacy.write_dispense(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, request_id uuid, items jsonb, text text, not_done boolean, not_done_reason_text text) TO authenticated;

GRANT ALL ON FUNCTION public.pharmacy_write_dispense(id uuid, patient_id uuid, visit_id uuid, department_id uuid, replaces_id uuid, occurred_at timestamp with time zone, responsible_id uuid, source core.entry_source, source_key text, stated_author_name text, stated_recorded_at timestamp with time zone, written_with_id uuid, request_id uuid, items jsonb, text text, not_done boolean, not_done_reason_text text) TO authenticated;
