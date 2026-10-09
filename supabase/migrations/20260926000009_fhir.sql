-- 09 · FHIR R4 (spec/openCare.md §6.4): a mapping of what the reader returns, never stored.
-- Core maps datatypes, people, places, the patient, Provenance and the Bundle/IPS envelope; the base maps each type to resources.

set client_min_messages = warning;

-- ── core: datatypes and envelopes ──
create function core.fhir_uri(p_system text, p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select replace(replace(coalesce((select s.uri from core.systems s where s.key = p_system), '{canon}/CodeSystem/' || p_system),
    '{canon}', (select url from core.canon)), '{organization}', coalesce(p_org::text, ''))
$$;
create function core.fhir_coding(c jsonb, p_org uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when c is null then null else jsonb_strip_nulls(jsonb_build_object('system', core.fhir_uri(c ->> 'system', p_org), 'code', c ->> 'code', 'display', c ->> 'display')) end
$$;
create function core.fhir_concept(c jsonb, p_org uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when c is null then null else jsonb_strip_nulls(jsonb_build_object('text', c ->> 'text',
    'coding', (select jsonb_agg(core.fhir_coding(x, p_org)) from jsonb_array_elements(coalesce(c -> 'codings', '[]')) x))) end
$$;
create function core.fhir_code(p_system text, p_code text, p_display text, p_org uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('coding', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('system', core.fhir_uri(p_system, p_org), 'code', p_code,
    'display', coalesce(p_display, (select c.labels ->> 'en' from core.codes c where c.system = p_system and c.code = p_code))))))
$$;
create function core.fhir_quantity(q jsonb) returns jsonb language sql immutable as $$
  select case when q is null or q ->> 'value' is null then null else jsonb_strip_nulls(jsonb_build_object('value', (q ->> 'value')::numeric,
    'comparator', q ->> 'comparator', 'unit', coalesce(q ->> 'unit', q ->> 'ucum'),
    'system', case when q ? 'ucum' then 'http://unitsofmeasure.org' end, 'code', q ->> 'ucum')) end
$$;
-- a clinical time as a FHIR partial date in the organization's time zone (§6.4 rule 4)
create function core.fhir_date(ts timestamptz, p_precision text, p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select case when ts is null then null else
    case coalesce(p_precision, 'second')
      when 'year' then to_char(ts at time zone z, 'YYYY')
      when 'month' then to_char(ts at time zone z, 'YYYY-MM')
      when 'day' then to_char(ts at time zone z, 'YYYY-MM-DD')
      else to_char(ts at time zone z, 'YYYY-MM-DD"T"HH24:MI:SS') ||
        (select case when o < interval '0' then '-' else '+' end || to_char(abs(extract(epoch from o))::int / 3600, 'FM00') || ':' || to_char((abs(extract(epoch from o))::int % 3600) / 60, 'FM00')
           from (select (ts at time zone z) - (ts at time zone 'UTC') o) q)
    end end
  from (select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo') z) zz
$$;
create function core.fhir_instant(ts timestamptz) returns text language sql immutable as $$
  select to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
-- meta: id = item, versionId = item_version, lastUpdated = recorded_at, profile, security (§6.4 rules 1–2)
create function core.fhir_meta(e jsonb, p_private boolean) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('versionId', (e ->> 'item_version'), 'lastUpdated', core.fhir_instant((e ->> 'recorded_at')::timestamptz),
    'profile', jsonb_build_array((select url from core.canon) || '/StructureDefinition/' || (e ->> 'type') || '|' || (e ->> 'type_version')),
    'security', jsonb_build_array(jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality', 'code', case when p_private then 'R' else 'N' end)))
$$;

-- the Patient (with its merged family as links), practitioner roles, organizations and locations
create function core.fhir_patient(p_org uuid, p_patient uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('resourceType', 'Patient', 'id', p.id,
    'identifier', (select jsonb_agg(jsonb_build_object('system', core.fhir_uri(i.system, p_org), 'value', i.value,
          'type', case i.system when 'eg-national-id' then core.fhir_code('hl7.v2-0203', 'NI', null, p_org) when 'mrn' then core.fhir_code('hl7.v2-0203', 'MR', null, p_org)
            else case when i.system like 'passport-%' then core.fhir_code('hl7.v2-0203', 'PPN', null, p_org) when i.system like 'eg-payer-%' then core.fhir_code('hl7.v2-0203', 'MB', null, p_org) end end))
        from core.patient_identifiers i where i.organization_id = p_org and i.patient_id = p.id)
      || jsonb_build_array(jsonb_build_object('system', core.fhir_uri('mrn', p_org), 'value', p.number::text, 'type', core.fhir_code('hl7.v2-0203', 'MR', null, p_org))),
    'name', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('use', case when p.anonymous then 'anonymous' else 'official' end, 'text', p.full_name,
        'family', p.family, 'given', case when cardinality(p.given) > 0 then to_jsonb(p.given) end)))
      || case when p.latin is not null then jsonb_build_array(jsonb_build_object('use', 'usual', 'text', p.latin)) else '[]'::jsonb end,
    'gender', p.gender,
    'birthDate', case when p.birth_date is null then null else case p.birth_precision when 'year' then to_char(p.birth_date, 'YYYY') when 'month' then to_char(p.birth_date, 'YYYY-MM') else to_char(p.birth_date, 'YYYY-MM-DD') end end,
    'telecom', (select jsonb_agg(jsonb_build_object('system', coalesce(t ->> 'system', 'phone'), 'value', t ->> 'value')) from jsonb_array_elements(p.telecom) t),
    'address', case when p.address is not null then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('text', p.address ->> 'text', 'city', p.address ->> 'city',
        'state', p.address ->> 'governorate', 'country', coalesce(p.address ->> 'country', 'EG')))) end,
    'link', (select jsonb_agg(jsonb_build_object('other', jsonb_build_object('reference', 'Patient/' || m.id), 'type', 'replaces'))
        from core.patients m where m.organization_id = p_org and m.merged_into = p.id),
    'managingOrganization', jsonb_build_object('reference', 'Organization/' || p_org)))
  from core.patients p where p.organization_id = p_org and p.id = p_patient
$$;
create function core.fhir_people(p_org uuid, p_users uuid[]) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(r), '[]') from (
    select jsonb_strip_nulls(jsonb_build_object('resourceType', case when u.kind = 'machine' then 'Device' else 'PractitionerRole' end, 'id', u.id,
      'practitioner', case when u.kind <> 'machine' then jsonb_build_object('display', u.name) end,
      'organization', case when u.kind <> 'machine' then jsonb_build_object('reference', 'Organization/' || p_org) end,
      'deviceName', case when u.kind = 'machine' then jsonb_build_array(jsonb_build_object('name', u.name, 'type', 'user-friendly-name')) end,
      'identifier', (select jsonb_agg(jsonb_build_object('system', core.fhir_uri(i.system, p_org), 'value', i.value)) from core.identifiers i
                      where i.organization_id = p_org and i.owner_kind = 'user' and i.owner_id = u.id))) r
    from core.users u where u.organization_id = p_org and u.id = any (p_users)) q
$$;
create function core.fhir_places(p_org uuid, p_departments uuid[]) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(jsonb_build_object('resourceType', 'Organization', 'id', o.id, 'name', o.name, 'active', o.retired_at is null)) ||
    coalesce((select jsonb_agg(jsonb_build_object('resourceType', 'Organization', 'id', d.id, 'name', d.name, 'active', d.retired_at is null,
        'partOf', jsonb_build_object('reference', 'Organization/' || o.id)))
      from core.departments d where d.organization_id = p_org and d.id = any (p_departments)), '[]') ||
    -- a department is also a ward-level Location; its rooms and beds are Locations of their own (§6.4 rule 6)
    coalesce((select jsonb_agg(jsonb_build_object('resourceType', 'Location', 'id', d.id, 'name', d.name, 'status', case when d.retired_at is null then 'active' else 'inactive' end,
        'physicalType', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/location-physical-type', 'code', 'wa'))),
        'managingOrganization', jsonb_build_object('reference', 'Organization/' || d.id)))
      from core.departments d where d.organization_id = p_org and d.id = any (p_departments)), '[]') ||
    coalesce((select jsonb_agg(jsonb_build_object('resourceType', 'Location', 'id', pl.id, 'name', pl.name, 'status', case when pl.retired_at is null then 'active' else 'inactive' end,
        'physicalType', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/location-physical-type',
          'code', case pl.label when 'room' then 'ro' when 'bed' then 'bd' else 'area' end))),
        'partOf', jsonb_build_object('reference', 'Location/' || coalesce(pl.parent_id, pl.department_id))))
      from core.places pl where pl.organization_id = p_org and pl.department_id = any (p_departments)), '[]')
  from core.organizations o where o.id = p_org
$$;

-- ── base: one mapping per type. Input: {org, patient, private, entries: the reader's rows of one item, oldest first} ──
set role base_role;

-- the common head of a resource
create function base.fhir_head(p jsonb, p_type text) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('resourceType', p_type, 'id', l ->> 'item', 'meta', core.fhir_meta(l, coalesce((p ->> 'private')::boolean, false)))
  from (select p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1) l) x
$$;
-- the latest row of the item; the kind's own latest row (before a cross-out); whether the item is crossed out or redacted
create function base.fhir_latest(p jsonb) returns jsonb language sql immutable as $$
  select p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1)
$$;
create function base.fhir_own(p jsonb) returns jsonb language sql immutable as $$
  select (select e from jsonb_array_elements(p -> 'entries') with ordinality x(e, n) where e ->> 'type' <> 'crossed_out' order by n desc limit 1)
$$;
create function base.fhir_gone(p jsonb) returns boolean language sql immutable as $$
  select base.fhir_latest(p) ->> 'type' = 'crossed_out' or coalesce((base.fhir_latest(p) ->> 'redacted')::boolean, false)
$$;
create function base.fhir_ref(p_kind text, p_id text) returns jsonb language sql immutable as $$
  select case when p_id is null then null else jsonb_build_object('reference', p_kind || '/' || p_id) end
$$;
create function base.fhir_subject(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('reference', 'Patient/' || (p ->> 'patient'))
$$;

create function base.note_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'DocumentReference') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else 'current' end,
    'docStatus', case when (base.fhir_latest(p) ->> 'item_version')::int > 1 then 'amended' else 'final' end,
    'type', coalesce((select core.fhir_code('loinc', c.code, null, (p ->> 'org')::uuid) from core.codes c where c.system = 'loinc' and c.props ->> 'note' = coalesce(o -> 'data' ->> 'kind', 'other') limit 1),
                     core.fhir_code('loinc', '34109-9', null, (p ->> 'org')::uuid)),
    'subject', base.fhir_subject(p), 'date', core.fhir_instant((o ->> 'recorded_at')::timestamptz),
    'author', jsonb_build_array(base.fhir_ref('PractitionerRole', o ->> 'author_id')),
    'description', o -> 'data' ->> 'heading',
    'context', case when o ->> 'visit_id' is not null then jsonb_build_object('encounter', jsonb_build_array(base.fhir_ref('Encounter', o ->> 'visit_id'))) end,
    'content', (select jsonb_agg(c) from (
        select jsonb_build_object('attachment', jsonb_build_object('contentType', 'text/plain; charset=utf-8', 'language', coalesce(o -> 'data' ->> 'language', 'en'),
          'data', translate(encode(convert_to(o -> 'data' ->> 'text', 'UTF8'), 'base64'), E'\n', ''))) c where o -> 'data' ? 'text'
        union all
        select jsonb_build_object('attachment', jsonb_strip_nulls(jsonb_build_object('contentType', a ->> 'mime', 'size', (a ->> 'size')::int, 'title', a ->> 'name',
          'hash', case when a ? 'sha1' then translate(encode(decode(a ->> 'sha1', 'hex'), 'base64'), E'\n', '') end,
          'url', 'files/' || (p ->> 'org') || '/' || (p ->> 'patient') || '/' || (a ->> 'sha256'))))
        from jsonb_array_elements(coalesce(o -> 'data' -> 'attachments', '[]')) a) q))))
  from (select base.fhir_own(p) o) x
$$;

-- vitals: a panel and one Observation per key, id {item}-{key}
create function base.vitals_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o jsonb := base.fhir_own(p); v_org uuid := (p ->> 'org')::uuid; out jsonb := '[]'; members jsonb := '[]'; k record; v_status text; v_id text; base_obs jsonb;
begin
  v_status := case when base.fhir_gone(p) then 'entered-in-error' when (base.fhir_latest(p) ->> 'item_version')::int > 1 then 'amended' else 'final' end;
  base_obs := jsonb_strip_nulls(jsonb_build_object('status', v_status,
    'category', jsonb_build_array(core.fhir_code('hl7.observation-category', 'vital-signs', null, v_org)), 'subject', base.fhir_subject(p),
    'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'), 'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org),
    'performer', jsonb_build_array(base.fhir_ref('PractitionerRole', o ->> 'author_id'))));
  if o -> 'data' ? 'bp' then
    v_id := (p -> 'entries' -> 0 ->> 'item') || '-bp';
    out := out || jsonb_build_array(jsonb_build_object('resourceType', 'Observation', 'id', v_id, 'meta', core.fhir_meta(base.fhir_latest(p), false)) || base_obs ||
      jsonb_build_object('code', core.fhir_code('loinc', '85354-9', null, v_org), 'component', jsonb_build_array(
        jsonb_build_object('code', core.fhir_code('loinc', '8480-6', null, v_org), 'valueQuantity', core.fhir_quantity(o -> 'data' -> 'bp' -> 'sys')),
        jsonb_build_object('code', core.fhir_code('loinc', '8462-4', null, v_org), 'valueQuantity', core.fhir_quantity(o -> 'data' -> 'bp' -> 'dia')))));
    members := members || jsonb_build_array(jsonb_build_object('reference', 'Observation/' || v_id));
  end if;
  for k in select * from base.vital_keys() v where v.key not like 'bp.%' loop
    continue when o -> 'data' #> k.path is null;
    v_id := (p -> 'entries' -> 0 ->> 'item') || '-' || k.key;
    out := out || jsonb_build_array(jsonb_build_object('resourceType', 'Observation', 'id', v_id, 'meta', core.fhir_meta(base.fhir_latest(p), false)) || base_obs ||
      jsonb_build_object('code', core.fhir_code('loinc', split_part(k.code, ':', 2), null, v_org), 'valueQuantity', core.fhir_quantity(o -> 'data' #> k.path)));
    members := members || jsonb_build_array(jsonb_build_object('reference', 'Observation/' || v_id));
  end loop;
  -- consciousness (ACVPU) and air or oxygen, as words (the owner's Q5, 2026-10-08): ACVPU's C has no answer in LOINC's AVPU list, so it
  -- goes as words; 107117-4 has no answer list, so air or the device goes as words too
  if o -> 'data' ? 'consciousness' then
    v_id := (p -> 'entries' -> 0 ->> 'item') || '-consciousness';
    out := out || jsonb_build_array(jsonb_build_object('resourceType', 'Observation', 'id', v_id, 'meta', core.fhir_meta(base.fhir_latest(p), false)) || base_obs ||
      jsonb_build_object('code', core.fhir_code('loinc', '67775-7', null, v_org), 'valueCodeableConcept', case o -> 'data' ->> 'consciousness'
        when 'a' then core.fhir_code('loinc', 'LA9340-6', null, v_org) when 'v' then core.fhir_code('loinc', 'LA17108-4', null, v_org)
        when 'p' then core.fhir_code('loinc', 'LA17107-6', null, v_org) when 'u' then core.fhir_code('loinc', 'LA9343-0', null, v_org)
        else jsonb_build_object('text', 'New confusion') end));
    members := members || jsonb_build_array(jsonb_build_object('reference', 'Observation/' || v_id));
  end if;
  if o -> 'data' ? 'oxygen' then
    v_id := (p -> 'entries' -> 0 ->> 'item') || '-oxygen';
    out := out || jsonb_build_array(jsonb_build_object('resourceType', 'Observation', 'id', v_id, 'meta', core.fhir_meta(base.fhir_latest(p), false)) || base_obs ||
      jsonb_build_object('code', core.fhir_code('loinc', '107117-4', null, v_org), 'valueCodeableConcept', jsonb_build_object('text',
        case when o -> 'data' -> 'oxygen' ->> 'on' = 'air' then 'Room air'
             else coalesce(upper(left(base.o2_device(o -> 'data' -> 'oxygen' ->> 'device'), 1)) || substr(base.o2_device(o -> 'data' -> 'oxygen' ->> 'device'), 2),
                           'Supplemental oxygen') end)));
    members := members || jsonb_build_array(jsonb_build_object('reference', 'Observation/' || v_id));
  end if;
  return jsonb_build_array(base.fhir_head(p, 'Observation') || base_obs || jsonb_build_object('code', core.fhir_code('loinc', '85353-1', null, v_org), 'hasMember', members)) || out;
end $$;

create function base.observation_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Observation') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' when (base.fhir_latest(p) ->> 'item_version')::int > 1 then 'amended' else 'final' end,
    'code', core.fhir_concept(o -> 'data' -> 'code', (p ->> 'org')::uuid), 'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid),
    'valueQuantity', core.fhir_quantity(o -> 'data' -> 'value' -> 'quantity'), 'valueCodeableConcept', core.fhir_concept(o -> 'data' -> 'value' -> 'concept', (p ->> 'org')::uuid),
    'valueString', o -> 'data' -> 'value' ->> 'text', 'valueBoolean', (o -> 'data' -> 'value' ->> 'boolean')::boolean,
    'valueDateTime', o -> 'data' -> 'value' -> 'date' ->> 'value',
    'note', case when o -> 'data' ? 'note' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'note')) end)))
  from (select base.fhir_own(p) o) x
$$;

create function base.problem_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Condition') || jsonb_strip_nulls(jsonb_build_object(
    'clinicalStatus', case when not base.fhir_gone(p) and coalesce(o -> 'data' ->> 'verification', '') <> 'refuted' then core.fhir_code('hl7.condition-clinical', o -> 'data' ->> 'clinical_status', null, (p ->> 'org')::uuid) end,
    'verificationStatus', core.fhir_code('hl7.condition-ver-status', case when base.fhir_gone(p) then 'entered-in-error' else o -> 'data' ->> 'verification' end, null, (p ->> 'org')::uuid),
    'category', jsonb_build_array(core.fhir_code('hl7.condition-category', coalesce(o -> 'data' ->> 'category', 'problem-list-item'), null, (p ->> 'org')::uuid)),
    'severity', case when o -> 'data' ? 'severity' then jsonb_build_object('text', o -> 'data' ->> 'severity') end,
    'code', core.fhir_concept(o -> 'data' -> 'concept', (p ->> 'org')::uuid), 'bodySite', case when o -> 'data' ? 'body_site' then jsonb_build_array(core.fhir_concept(o -> 'data' -> 'body_site', (p ->> 'org')::uuid)) end,
    'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'onsetDateTime', o -> 'data' -> 'onset' ->> 'value', 'abatementDateTime', o -> 'data' -> 'abatement' ->> 'value',
    'recordedDate', core.fhir_instant((p -> 'entries' -> 0 ->> 'recorded_at')::timestamptz),
    'recorder', base.fhir_ref('PractitionerRole', p -> 'entries' -> 0 ->> 'author_id'), 'asserter', base.fhir_ref('PractitionerRole', o ->> 'author_id'),
    'note', case when o -> 'data' ? 'note' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'note')) end)))
  from (select base.fhir_own(p) o) x
$$;

create function base.allergy_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'AllergyIntolerance') || jsonb_strip_nulls(jsonb_build_object(
    'clinicalStatus', case when not base.fhir_gone(p) and coalesce(o -> 'data' ->> 'verification', '') <> 'refuted' then core.fhir_code('hl7.allergy-clinical', o -> 'data' ->> 'clinical_status', null, (p ->> 'org')::uuid) end,
    'verificationStatus', core.fhir_code('hl7.allergy-verification', case when base.fhir_gone(p) then 'entered-in-error' else o -> 'data' ->> 'verification' end, null, (p ->> 'org')::uuid),
    'type', o -> 'data' ->> 'type', 'category', o -> 'data' -> 'category', 'criticality', o -> 'data' ->> 'criticality',
    'code', core.fhir_concept(o -> 'data' -> 'concept', (p ->> 'org')::uuid), 'patient', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'onsetDateTime', o -> 'data' -> 'onset' ->> 'value', 'recordedDate', core.fhir_instant((p -> 'entries' -> 0 ->> 'recorded_at')::timestamptz),
    'recorder', base.fhir_ref('PractitionerRole', p -> 'entries' -> 0 ->> 'author_id'),
    'reaction', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('manifestation', jsonb_build_array(core.fhir_concept(r -> 'manifestation', (p ->> 'org')::uuid)), 'severity', r ->> 'severity')))
      from jsonb_array_elements(coalesce(o -> 'data' -> 'reactions', '[]')) r),
    'note', case when o -> 'data' ? 'note' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'note')) end)))
  from (select base.fhir_own(p) o) x
$$;

-- a dosage as FHIR Dosage (timing codes: BD → BID, TDS → TID, QDS → QID, OD → QD)
create function base.fhir_dosage(d jsonb, p_org uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('text', d ->> 'text',
    'timing', case when d ? 'timing' then jsonb_strip_nulls(jsonb_build_object(
        'code', case upper(d -> 'timing' ->> 'code') when 'BD' then core.fhir_code('hl7.gts', 'BID', null, p_org) when 'BID' then core.fhir_code('hl7.gts', 'BID', null, p_org)
          when 'TDS' then core.fhir_code('hl7.gts', 'TID', null, p_org) when 'TID' then core.fhir_code('hl7.gts', 'TID', null, p_org)
          when 'QDS' then core.fhir_code('hl7.gts', 'QID', null, p_org) when 'QID' then core.fhir_code('hl7.gts', 'QID', null, p_org)
          when 'OD' then core.fhir_code('hl7.gts', 'QD', null, p_org) when 'QD' then core.fhir_code('hl7.gts', 'QD', null, p_org)
          else case when d -> 'timing' ? 'code' then jsonb_build_object('text', d -> 'timing' ->> 'code') end end,
        'repeat', jsonb_strip_nulls(jsonb_build_object('frequency', (d -> 'timing' ->> 'frequency')::int, 'period', (d -> 'timing' ->> 'period')::numeric,
          'periodUnit', d -> 'timing' ->> 'period_unit', 'when', d -> 'timing' -> 'when',
          'boundsDuration', case when d -> 'timing' ? 'bounds_days' then jsonb_build_object('value', (d -> 'timing' ->> 'bounds_days')::int, 'unit', 'd', 'system', 'http://unitsofmeasure.org', 'code', 'd') end))))
      end,
    'asNeededBoolean', case when d ? 'as_needed' and d ->> 'as_needed_for' is null then (d ->> 'as_needed')::boolean end,
    'asNeededCodeableConcept', case when d ->> 'as_needed_for' is not null then jsonb_build_object('text', d ->> 'as_needed_for') end,
    'route', case when d ? 'route' then jsonb_build_object('text', d ->> 'route') end,
    'doseAndRate', case when d ? 'dose' then jsonb_build_array(jsonb_build_object('doseQuantity', core.fhir_quantity(d -> 'dose'))) end))
$$;

-- a medicine: every prescribed version a MedicationRequest (id = the entry); the item a MedicationStatement (id = the item)
create function base.medication_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('resourceType', 'MedicationRequest', 'id', e ->> 'id',
      'meta', core.fhir_meta(e, false),
      'status', case when base.fhir_gone(p) then 'entered-in-error' when e ->> 'id' <> base.fhir_own(p) ->> 'id' then 'stopped'
                     else case e -> 'data' ->> 'status' when 'active' then 'active' when 'on-hold' then 'on-hold' when 'stopped' then 'stopped' else 'completed' end end,
      'intent', 'order', 'medicationCodeableConcept', core.fhir_concept(e -> 'data' -> 'drug', (p ->> 'org')::uuid), 'subject', base.fhir_subject(p),
      'encounter', base.fhir_ref('Encounter', e ->> 'visit_id'), 'authoredOn', core.fhir_instant((e ->> 'recorded_at')::timestamptz),
      'requester', base.fhir_ref('PractitionerRole', e ->> 'author_id'),
      'reasonReference', (select jsonb_agg(jsonb_build_object('reference', 'Condition/' || (r ->> 'id'))) from jsonb_array_elements(coalesce(e -> 'data' -> 'reasons', '[]')) r),
      'priorPrescription', case when n > 1 then (select base.fhir_ref('MedicationRequest', q ->> 'id') from jsonb_array_elements(p -> 'entries') with ordinality y(q, m) where m = n - 1) end,
      'dosageInstruction', case when e -> 'data' ? 'dosage' then jsonb_build_array(base.fhir_dosage(e -> 'data' -> 'dosage', (p ->> 'org')::uuid)) end,
      'dispenseRequest', case when e -> 'data' ? 'duration_days' or e -> 'data' ? 'quantity' then jsonb_strip_nulls(jsonb_build_object(
        'expectedSupplyDuration', case when e -> 'data' ? 'duration_days' then jsonb_build_object('value', (e -> 'data' ->> 'duration_days')::int, 'unit', 'd', 'system', 'http://unitsofmeasure.org', 'code', 'd') end,
        'quantity', core.fhir_quantity(e -> 'data' -> 'quantity'), 'numberOfRepeatsAllowed', (e -> 'data' ->> 'repeats')::int)) end,
      'substitution', case when e -> 'data' ? 'substitution' then jsonb_build_object('allowedBoolean', (e -> 'data' ->> 'substitution')::boolean) end,
      'note', case when e -> 'data' ? 'instructions' then jsonb_build_array(jsonb_build_object('text', e -> 'data' ->> 'instructions')) end)))
    from jsonb_array_elements(p -> 'entries') with ordinality z(e, n) where e ->> 'type' <> 'crossed_out' and e -> 'data' ->> 'basis' = 'prescribed'), '[]')
  || jsonb_build_array(base.fhir_head(p, 'MedicationStatement') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else case o -> 'data' ->> 'status' when 'active' then 'active' when 'on-hold' then 'on-hold' when 'stopped' then 'stopped' else 'completed' end end,
    'medicationCodeableConcept', core.fhir_concept(o -> 'data' -> 'drug', (p ->> 'org')::uuid), 'subject', base.fhir_subject(p),
    'context', base.fhir_ref('Encounter', o ->> 'visit_id'), 'dateAsserted', core.fhir_instant((o ->> 'recorded_at')::timestamptz),
    'informationSource', base.fhir_ref('PractitionerRole', o ->> 'author_id'),
    'basedOn', case when o -> 'data' ->> 'basis' = 'prescribed' then jsonb_build_array(base.fhir_ref('MedicationRequest', o ->> 'id')) end,
    'dosage', case when o -> 'data' ? 'dosage' then jsonb_build_array(base.fhir_dosage(o -> 'data' -> 'dosage', (p ->> 'org')::uuid)) end)))
  from (select base.fhir_own(p) o) x
$$;

create function base.given_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'MedicationAdministration') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' when o -> 'data' ->> 'status' = 'not-done' then 'not-done' else 'completed' end,
    'medicationCodeableConcept', coalesce(core.fhir_concept(o -> 'data' -> 'drug', (p ->> 'org')::uuid), jsonb_build_object('text', 'medication')),
    'subject', base.fhir_subject(p), 'context', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid),
    'performer', jsonb_build_array(jsonb_build_object('actor', base.fhir_ref('PractitionerRole', o ->> 'author_id'))),
    'statusReason', case when o -> 'data' ? 'reason' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'reason')) end,
    'dosage', jsonb_strip_nulls(jsonb_build_object('dose', core.fhir_quantity(o -> 'data' -> 'dose'), 'route', case when o -> 'data' ? 'route' then jsonb_build_object('text', o -> 'data' ->> 'route') end)))))
  from (select base.fhir_own(p) o) x
$$;

-- "none known" is a fact exported with IPS absent-unknown codes, never an empty list (§6.4 rule 9)
create function base.list_review_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when base.fhir_gone(p) then '[]'::jsonb when o -> 'data' ->> 'outcome' = 'none_known' then jsonb_build_array(base.fhir_head(p,
      case o -> 'data' ->> 'list' when 'allergies' then 'AllergyIntolerance' when 'problems' then 'Condition' else 'MedicationStatement' end) ||
    case o -> 'data' ->> 'list'
      when 'allergies' then jsonb_build_object('clinicalStatus', core.fhir_code('hl7.allergy-clinical', 'active', null, (p ->> 'org')::uuid),
        'code', core.fhir_code('hl7.absent-unknown', 'no-known-allergies', null, (p ->> 'org')::uuid), 'patient', base.fhir_subject(p))
      when 'problems' then jsonb_build_object('clinicalStatus', core.fhir_code('hl7.condition-clinical', 'active', null, (p ->> 'org')::uuid),
        'code', core.fhir_code('hl7.absent-unknown', 'no-known-problems', null, (p ->> 'org')::uuid), 'subject', base.fhir_subject(p))
      else jsonb_build_object('status', 'active', 'medicationCodeableConcept', core.fhir_code('hl7.absent-unknown', 'no-known-medications', null, (p ->> 'org')::uuid),
        'subject', base.fhir_subject(p)) end)
  else jsonb_build_array(base.fhir_head(p, 'List') || jsonb_build_object('status', 'current', 'mode', 'snapshot', 'title', initcap(o -> 'data' ->> 'list') || ' reviewed',
      'subject', base.fhir_subject(p), 'date', core.fhir_instant((o ->> 'recorded_at')::timestamptz), 'source', base.fhir_ref('PractitionerRole', o ->> 'author_id'))) end
  from (select base.fhir_own(p) o) x
$$;

create function base.order_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'ServiceRequest') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else coalesce((select case o2.status when 'active' then 'active' when 'on-hold' then 'on-hold'
        when 'revoked' then 'revoked' when 'completed' then 'completed' when 'in-progress' then 'active' else 'revoked' end
        from base.orders o2 where o2.organization_id = (p ->> 'org')::uuid and o2.item = (p -> 'entries' -> 0 ->> 'item')::uuid), o -> 'data' ->> 'status') end,
    'intent', 'order', 'priority', coalesce(o -> 'data' ->> 'priority', 'routine'),
    'code', jsonb_strip_nulls(jsonb_build_object('text', o -> 'data' -> 'service' ->> 'name', 'coding',
      (select jsonb_agg(c) from (select core.fhir_coding(o -> 'data' -> 'service' -> 'coding', (p ->> 'org')::uuid) c where o -> 'data' -> 'service' ? 'coding'
         union all select jsonb_build_object('system', core.fhir_uri('local.service', (p ->> 'org')::uuid), 'code', o -> 'data' -> 'service' ->> 'code') where o -> 'data' -> 'service' ? 'code') q))),
    'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', p -> 'entries' -> 0 ->> 'visit_id'),
    'authoredOn', core.fhir_instant((p -> 'entries' -> 0 ->> 'recorded_at')::timestamptz),
    'requester', base.fhir_ref('PractitionerRole', p -> 'entries' -> 0 ->> 'author_id'),
    'performer', jsonb_build_array(base.fhir_ref('Organization', o -> 'data' ->> 'department_id')),
    'requisition', jsonb_build_object('value', p -> 'entries' -> 0 ->> 'set_id'),
    'reasonCode', case when o -> 'data' ? 'reason' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'reason')) end,
    'note', case when o -> 'data' ? 'question' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'question')) end)))
  from (select base.fhir_own(p) o) x
$$;

-- a step: a Task fulfilling the order; reviewed: a Task reviewing an answer
create function base.step_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Task') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else o -> 'data' ->> 'status' end, 'intent', 'order',
    'businessStatus', case when o -> 'data' ? 'step' then jsonb_build_object('text', o -> 'data' ->> 'step') end,
    'basedOn', (select jsonb_build_array(base.fhir_ref('ServiceRequest', t.item::text)) from core.entries t where t.organization_id = (p ->> 'org')::uuid and t.id = (p -> 'entries' -> 0 ->> 'refers_to')::uuid),
    'for', base.fhir_subject(p), 'authoredOn', core.fhir_instant((p -> 'entries' -> 0 ->> 'recorded_at')::timestamptz),
    'lastModified', core.fhir_instant((o ->> 'recorded_at')::timestamptz), 'owner', base.fhir_ref('Organization', o ->> 'department_id'),
    'statusReason', case when o -> 'data' ? 'reason' then jsonb_build_object('text', o -> 'data' ->> 'reason') end)))
  from (select base.fhir_own(p) o) x
$$;
create function base.reviewed_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Task') || jsonb_strip_nulls(jsonb_build_object('status', 'completed', 'intent', 'order',
    'code', jsonb_build_object('text', 'Review'), 'for', base.fhir_subject(p),
    'focus', (select base.fhir_ref(case when t.type = any (core.kinds('result')) then 'DiagnosticReport' when t.type = any (core.kinds('note')) then 'DocumentReference'
                                     else 'Task' end, t.item::text) from core.entries t
               where t.organization_id = (p ->> 'org')::uuid and t.id = (o ->> 'refers_to')::uuid),
    'authoredOn', core.fhir_instant((o ->> 'recorded_at')::timestamptz), 'owner', base.fhir_ref('PractitionerRole', o ->> 'author_id'))))
  from (select base.fhir_own(p) o) x
$$;

-- a question about an order (spec §5.3): a Communication about the ServiceRequest, from whoever asked to whoever ordered it
create function base.question_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Communication') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else 'completed' end, 'subject', base.fhir_subject(p),
    'about', (select jsonb_build_array(base.fhir_ref('ServiceRequest', t.item::text)) from core.entries t where t.organization_id = (p ->> 'org')::uuid and t.id = (o ->> 'refers_to')::uuid),
    'recipient', (select jsonb_build_array(base.fhir_ref('PractitionerRole', x.requester_id::text)) from core.entries t join base.orders x on x.organization_id = t.organization_id and x.item = t.item
                   where t.organization_id = (p ->> 'org')::uuid and t.id = (o ->> 'refers_to')::uuid),
    'sent', core.fhir_instant((o ->> 'recorded_at')::timestamptz), 'sender', base.fhir_ref('PractitionerRole', o ->> 'author_id'),
    'payload', jsonb_build_array(jsonb_build_object('contentString', o -> 'data' ->> 'text')))))
  from (select base.fhir_own(p) o) x
$$;

-- a result: a DiagnosticReport and one Observation per analyte, id {item}-{key}, or uuid v5(item, key) when that is too long
create function base.result_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o jsonb := base.fhir_own(p); v_org uuid := (p ->> 'org')::uuid; v_item text := p -> 'entries' -> 0 ->> 'item'; v_status text; obs jsonb := '[]'; a jsonb; v_id text; v_order text;
begin
  v_status := case when base.fhir_gone(p) then 'entered-in-error' when (base.fhir_latest(p) ->> 'replaces') is not null then 'corrected' else coalesce(o -> 'data' ->> 'status', 'final') end;
  select t.item::text into v_order from core.entries t where t.organization_id = v_org and t.id = (p -> 'entries' -> 0 ->> 'refers_to')::uuid and p -> 'entries' -> 0 ->> 'relation' = 'answers';
  for a in select * from jsonb_array_elements(coalesce(o -> 'data' -> 'analytes', '[]')) loop
    v_id := v_item || '-' || regexp_replace(coalesce(a ->> 'key', 'x'), '[^A-Za-z0-9.-]', '-', 'g');
    if length(v_id) > 64 then v_id := core.uuid5(v_item::uuid, coalesce(a ->> 'key', 'x'))::text; end if;   -- longer than an id may be (§6.4 rule 1)
    obs := obs || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'Observation', 'id', v_id, 'meta', core.fhir_meta(base.fhir_latest(p), coalesce((p ->> 'private')::boolean, false)),
      'status', v_status, 'category', jsonb_build_array(core.fhir_code('hl7.observation-category', 'laboratory', null, v_org)),
      'code', case when a ? 'code' then jsonb_build_object('text', coalesce(a ->> 'name', a ->> 'key'), 'coding', jsonb_build_array(core.fhir_coding(a -> 'code', v_org)))
                   else jsonb_build_object('text', coalesce(a ->> 'name', a ->> 'key')) end,
      'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
      'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org), 'issued', core.fhir_instant((o ->> 'recorded_at')::timestamptz),
      'basedOn', case when v_order is not null then jsonb_build_array(base.fhir_ref('ServiceRequest', v_order)) end,
      'valueQuantity', core.fhir_quantity(a -> 'value'), 'valueString', a ->> 'text', 'valueCodeableConcept', core.fhir_concept(a -> 'concept', v_org),
      'interpretation', case when a ? 'interpretation' then jsonb_build_array(core.fhir_code('hl7.interpretation', a ->> 'interpretation', null, v_org)) end,
      'referenceRange', case when a ? 'range' then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('low', core.fhir_quantity(a -> 'range' -> 'low'),
        'high', core.fhir_quantity(a -> 'range' -> 'high'), 'text', a -> 'range' ->> 'text'))) end)));
  end loop;
  return jsonb_build_array(base.fhir_head(p, 'DiagnosticReport') || jsonb_strip_nulls(jsonb_build_object('status', v_status,
    'code', coalesce(core.fhir_concept(o -> 'data' -> 'code', v_org), jsonb_build_object('text', coalesce(o -> 'data' -> 'service' ->> 'name', 'Result'))),
    'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org), 'issued', core.fhir_instant((o ->> 'recorded_at')::timestamptz),
    'performer', jsonb_build_array(base.fhir_ref('Organization', o ->> 'department_id')),
    'basedOn', case when v_order is not null then jsonb_build_array(base.fhir_ref('ServiceRequest', v_order)) end,
    'result', (select jsonb_agg(jsonb_build_object('reference', 'Observation/' || (x ->> 'id'))) from jsonb_array_elements(obs) x),
    'conclusion', o -> 'data' ->> 'conclusion'))) || obs;
end $$;

create function base.procedure_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Procedure') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else o -> 'data' ->> 'status' end,
    'code', core.fhir_concept(o -> 'data' -> 'concept', (p ->> 'org')::uuid), 'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'performedDateTime', coalesce(o -> 'data' -> 'performed' ->> 'value', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid)),
    'recorder', base.fhir_ref('PractitionerRole', o ->> 'author_id'),
    'bodySite', case when o -> 'data' ? 'body_site' then jsonb_build_array(core.fhir_concept(o -> 'data' -> 'body_site', (p ->> 'org')::uuid)) end,
    'outcome', case when o -> 'data' ? 'outcome' then jsonb_build_object('text', o -> 'data' ->> 'outcome') end,
    'note', case when o -> 'data' ? 'note' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'note')) end)))
  from (select base.fhir_own(p) o) x
$$;

create function base.alert_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Flag') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' else o -> 'data' ->> 'status' end,
    'code', core.fhir_concept(o -> 'data' -> 'concept', (p ->> 'org')::uuid), 'subject', base.fhir_subject(p),
    'period', jsonb_strip_nulls(jsonb_build_object('start', coalesce(o -> 'data' -> 'period' ->> 'start', core.fhir_instant((p -> 'entries' -> 0 ->> 'recorded_at')::timestamptz)),
      'end', o -> 'data' -> 'period' ->> 'end')), 'author', base.fhir_ref('PractitionerRole', o ->> 'author_id'))))
  from (select base.fhir_own(p) o) x
$$;

-- pregnant and breastfeeding: an Observation each (LOINC 82810-3 with its answer, and 63895-7); an ended fact keeps its period
create function base.fact_effective(p jsonb, o jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when o -> 'data' ->> 'status' = 'ended' then jsonb_build_object('effectivePeriod', jsonb_build_object(
      'start', core.fhir_date((p -> 'entries' -> 0 ->> 'occurred_at')::timestamptz, p -> 'entries' -> 0 ->> 'precision', (p ->> 'org')::uuid),
      'end', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid)))
    else jsonb_build_object('effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid)) end
$$;
create function base.pregnancy_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Observation') || base.fact_effective(p, o) || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' when (base.fhir_latest(p) ->> 'item_version')::int > 1 then 'amended' else 'final' end,
    'code', core.fhir_code('loinc', '82810-3', null, (p ->> 'org')::uuid), 'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'valueCodeableConcept', core.fhir_code('loinc', case when (o -> 'data' ->> 'pregnant')::boolean then 'LA15173-0' else 'LA26683-5' end, null, (p ->> 'org')::uuid),
    'component', case when o -> 'data' ? 'lmp' then jsonb_build_array(jsonb_build_object('code', core.fhir_code('loinc', '8665-2', null, (p ->> 'org')::uuid),
        'valueDateTime', o -> 'data' -> 'lmp' ->> 'value'))
      when o -> 'data' ? 'weeks' then jsonb_build_array(jsonb_build_object('code', core.fhir_code('loinc', '49051-6', null, (p ->> 'org')::uuid),
        'valueQuantity', core.fhir_quantity(jsonb_build_object('value', o -> 'data' ->> 'weeks', 'unit', 'wk', 'ucum', 'wk')))) end,
    'performer', jsonb_build_array(base.fhir_ref('PractitionerRole', o ->> 'author_id')),
    'note', case when o -> 'data' ? 'note' or o -> 'data' ? 'reason' then jsonb_build_array(jsonb_build_object('text', concat_ws(' · ', o -> 'data' ->> 'reason', o -> 'data' ->> 'note'))) end)))
  from (select base.fhir_own(p) o) x
$$;
create function base.breastfeeding_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Observation') || base.fact_effective(p, o) || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' when (base.fhir_latest(p) ->> 'item_version')::int > 1 then 'amended' else 'final' end,
    'code', core.fhir_code('loinc', '63895-7', null, (p ->> 'org')::uuid), 'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'valueBoolean', (o -> 'data' ->> 'breastfeeding')::boolean,
    'performer', jsonb_build_array(base.fhir_ref('PractitionerRole', o ->> 'author_id')),
    'note', case when o -> 'data' ? 'note' then jsonb_build_array(jsonb_build_object('text', o -> 'data' ->> 'note')) end)))
  from (select base.fhir_own(p) o) x
$$;

-- a score: an Observation of its total (the table's coding, else its name), its band in words, a component per item with its points from
-- the version the entry used (a table never changes, so these are the points it was written with)
create function base.score_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(base.fhir_head(p, 'Observation') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when base.fhir_gone(p) then 'entered-in-error' when (base.fhir_latest(p) ->> 'item_version')::int > 1 then 'amended' else 'final' end,
    'category', jsonb_build_array(core.fhir_code('hl7.observation-category', 'survey', 'Survey', (p ->> 'org')::uuid)),
    'code', case when s.coding is not null then core.fhir_code(s.coding ->> 'system', s.coding ->> 'code', s.labels ->> 'en', (p ->> 'org')::uuid)
                 else jsonb_build_object('text', coalesce(s.labels ->> 'en', o -> 'data' ->> 'score')) end,
    'subject', base.fhir_subject(p), 'encounter', base.fhir_ref('Encounter', o ->> 'visit_id'),
    'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid),
    'valueInteger', (o -> 'data' ->> 'total')::int,
    'interpretation', (select jsonb_build_array(jsonb_build_object('text', b -> 'labels' ->> 'en')) from jsonb_array_elements(s.bands) b where b ->> 'key' = o -> 'data' ->> 'band'),
    'method', jsonb_build_object('text', coalesce(s.labels ->> 'en', o -> 'data' ->> 'score') || ', ' || (o -> 'data' ->> 'version')),
    'performer', jsonb_build_array(base.fhir_ref('PractitionerRole', o ->> 'author_id')),
    'component', (select jsonb_agg(jsonb_build_object('code', case when i ? 'coding' then core.fhir_code(i -> 'coding' ->> 'system', i -> 'coding' ->> 'code', i -> 'labels' ->> 'en', (p ->> 'org')::uuid)
                                                                 else jsonb_build_object('text', i -> 'labels' ->> 'en') end,
                                                  'valueInteger', (c ->> 'points')::int) order by n)
                  from jsonb_array_elements(s.items) with ordinality y(i, n)
                  join jsonb_array_elements(core.score(s.key, s.version, o -> 'data' -> 'inputs') -> 'items') c on c ->> 'key' = i ->> 'key'
                 where jsonb_typeof(c -> 'points') = 'number'))))
  from (select base.fhir_own(p) o) x left join core.scores s on s.key = o -> 'data' ->> 'score' and s.version = o -> 'data' ->> 'version'
$$;

-- death is not a resource: it patches the Patient (core merges it in)
create function base.died_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when base.fhir_gone(p) then '[]'::jsonb else jsonb_build_array(jsonb_build_object('patch', 'Patient',
    'deceasedDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', (p ->> 'org')::uuid))) end
  from (select base.fhir_own(p) o) x
$$;

-- a visit or a stay: one Encounter from all its moves
create function base.encounter_fhir(p jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select case when base.fhir_gone(p) then jsonb_build_array(base.fhir_head(p, 'Encounter') || jsonb_build_object('status', 'entered-in-error',
      'class', jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/v3-ActCode', 'code', 'AMB'), 'subject', base.fhir_subject(p)))
  else jsonb_build_array(base.fhir_head(p, 'Encounter') || jsonb_strip_nulls(jsonb_build_object(
    'status', case when pr.state in ('done', 'discharged') then 'finished' when pr.state = 'left' and pr.seen_at is null then 'cancelled' when pr.state = 'left' then 'finished'
                   when pr.state = 'admitted' then 'in-progress'   -- a stay's notes never move it: no 12-hour lapse in bed
                   when pr.state in ('with', 'called', 'back', 'pending') then case when pr.last_at < clock_timestamp() - interval '12 hours' then 'unknown' else 'in-progress' end
                   else case when pr.last_at < clock_timestamp() - interval '12 hours' then 'unknown' else 'arrived' end end,
    'class', jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/v3-ActCode', 'code',
      coalesce(core.setting_at((p ->> 'org')::uuid, 'department.encounter_class', pr.department_id) ->> 'class', case when pr.kind = 'stay' then 'IMP' else 'AMB' end)),
    'priority', case when pr.urgent then core.fhir_code('hl7.act-code', 'UR', 'urgent', (p ->> 'org')::uuid) end,
    'subject', base.fhir_subject(p),
    'participant', (select jsonb_agg(distinct jsonb_build_object('individual', base.fhir_ref('PractitionerRole', u::text))) from unnest(array[pr.seen_by, pr.assigned_id]) u where u is not null),
    'period', jsonb_strip_nulls(jsonb_build_object('start', core.fhir_instant(pr.checked_in_at), 'end', core.fhir_instant(pr.ended_at))),
    'reasonCode', case when pr.reason is not null then jsonb_build_array(jsonb_build_object('text', pr.reason)) end,
    'location', jsonb_build_array(jsonb_build_object('location', base.fhir_ref('Location', pr.department_id::text))) ||
      case when pr.place_id is not null then jsonb_build_array(jsonb_build_object('location', base.fhir_ref('Location', pr.place_id::text), 'status', case when pr.ended_at is null then 'active' else 'completed' end)) else '[]'::jsonb end,
    'hospitalization', case when pr.kind = 'stay' then jsonb_strip_nulls(jsonb_build_object(
      'admitSource', core.fhir_code('hl7.admit-source', f -> 'data' ->> 'admit_source', null, (p ->> 'org')::uuid),
      'dischargeDisposition', (select core.fhir_code('hl7.discharge-disposition', e -> 'data' ->> 'disposition', null, (p ->> 'org')::uuid) from jsonb_array_elements(p -> 'entries') e where e ->> 'type' = 'discharged' limit 1)))
      when pr.state = 'left' and pr.seen_at is not null then jsonb_build_object('dischargeDisposition', core.fhir_code('hl7.discharge-disposition', 'aadvice', null, (p ->> 'org')::uuid)) end,
    'serviceProvider', base.fhir_ref('Organization', pr.department_id::text),
    'partOf', case when pr.came_from is not null then base.fhir_ref('Encounter', pr.came_from::text) end))) end
  from (select p -> 'entries' -> 0 f) x left join base.presence pr on pr.organization_id = (p ->> 'org')::uuid and pr.item = (p -> 'entries' -> 0 ->> 'item')::uuid
$$;

reset role;

select core.declare_fhir('note', 1, 'base.note_fhir(jsonb)');
select core.declare_fhir('vitals', 1, 'base.vitals_fhir(jsonb)');
select core.declare_fhir('observation', 1, 'base.observation_fhir(jsonb)');
select core.declare_fhir('problem', 1, 'base.problem_fhir(jsonb)');
select core.declare_fhir('allergy', 1, 'base.allergy_fhir(jsonb)');
select core.declare_fhir('medication', 1, 'base.medication_fhir(jsonb)');
select core.declare_fhir('given', 1, 'base.given_fhir(jsonb)');
select core.declare_fhir('list_review', 1, 'base.list_review_fhir(jsonb)');
select core.declare_fhir('order', 1, 'base.order_fhir(jsonb)');
select core.declare_fhir('step', 1, 'base.step_fhir(jsonb)');
select core.declare_fhir('result', 1, 'base.result_fhir(jsonb)');
select core.declare_fhir('procedure', 1, 'base.procedure_fhir(jsonb)');
select core.declare_fhir('reviewed', 1, 'base.reviewed_fhir(jsonb)');
select core.declare_fhir('question', 1, 'base.question_fhir(jsonb)');
select core.declare_fhir('alert', 1, 'base.alert_fhir(jsonb)');
select core.declare_fhir('pregnancy', 1, 'base.pregnancy_fhir(jsonb)');
select core.declare_fhir('breastfeeding', 1, 'base.breastfeeding_fhir(jsonb)');
select core.declare_fhir('score', 1, 'base.score_fhir(jsonb)');
select core.declare_fhir('died', 1, 'base.died_fhir(jsonb)');
select core.declare_fhir('checked_in', 1, 'base.encounter_fhir(jsonb)');
select core.declare_fhir('admitted', 1, 'base.encounter_fhir(jsonb)');

-- ── core: a pack's mapping beside its base type's (§5.2 Export) ──
-- R4's choice elements ([x]): each holds one value, so an object never has two keys of one of these with a type after it (valueQuantity
-- and valueString). The names a mapping here may use
create function core.fhir_choices() returns text[] language sql immutable as $$
  select array['value', 'effective', 'onset', 'abatement', 'deceased', 'multipleBirth', 'medication', 'occurrence', 'performed', 'timing',
    'asNeeded', 'born', 'age', 'serviced', 'reported', 'allowed', 'collected', 'statusReason', 'dose', 'rate', 'scheduled', 'answer', 'defaultValue']
$$;
-- what makes a resource not valid R4 for the export: no resourceType, an id FHIR refuses, a choice element holding two values (anywhere
-- inside it, by path). Empty when valid
create function core.fhir_problems(r jsonb, p_path text default null) returns text[] language plpgsql immutable as $$
declare out text[] := '{}'; k text; v jsonb; c text; n int; i int;
begin
  if p_path is null then
    if coalesce(r ->> 'resourceType', '') !~ '^[A-Z][A-Za-z]+$' then out := array_append(out, 'no resourceType'); end if;
    if coalesce(r ->> 'id', '') !~ '^[A-Za-z0-9.-]{1,64}$' then out := out || format('%s has a bad id %s', r ->> 'resourceType', coalesce(r ->> 'id', 'null')); end if;
    p_path := coalesce(r ->> 'resourceType', '?');
  end if;
  if jsonb_typeof(r) = 'object' then
    foreach c in array core.fhir_choices() loop
      select count(*) into n from jsonb_object_keys(r) x where x ~ ('^' || c || '[A-Z]');
      if n > 1 then out := out || format('%s.%s[x] holds %s values', p_path, c, n); end if;
    end loop;
    for k, v in select * from jsonb_each(r) loop
      if jsonb_typeof(v) in ('object', 'array') then out := out || core.fhir_problems(v, p_path || '.' || k); end if;
    end loop;
  elsif jsonb_typeof(r) = 'array' then
    for i in 0 .. jsonb_array_length(r) - 1 loop
      if jsonb_typeof(r -> i) in ('object', 'array') then out := out || core.fhir_problems(r -> i, p_path); end if;
    end loop;
  end if;
  return out;
end $$;
-- a pack type's resources: its base type's mapping as it stands, and beside it what the pack's own mapping adds: new resources, or
-- elements on one of the base's (same resourceType and id). An element the base already set is never overwritten (an array is added
-- to); a choice element ([x]) takes no second value. Anything else raises, so the export refuses rather than drop it silently
create function core.fhir_beside(p_base jsonb, p_adds jsonb) returns jsonb language plpgsql immutable as $$
declare out jsonb := coalesce(p_base, '[]'); a jsonb; i int; k text; v jsonb; b jsonb; c text;
begin
  for a in select * from jsonb_array_elements(coalesce(p_adds, '[]')) loop
    select x.n - 1 into i from jsonb_array_elements(out) with ordinality x(r, n) where x.r ->> 'resourceType' = a ->> 'resourceType' and x.r ->> 'id' = a ->> 'id' limit 1;
    if i is null then out := out || jsonb_build_array(a); continue; end if;
    b := out -> i;
    for k, v in select * from jsonb_each(a) loop
      continue when k in ('resourceType', 'id');
      if b ? k and b -> k = v then continue; end if;
      if b ? k and jsonb_typeof(b -> k) = 'array' and jsonb_typeof(v) = 'array' then b := jsonb_set(b, array[k], (b -> k) || v); continue; end if;
      if b ? k then raise exception 'overwrites %.% of the base''s %', a ->> 'resourceType', k, a ->> 'id' using errcode = 'P0001'; end if;
      foreach c in array core.fhir_choices() loop
        if k ~ ('^' || c || '[A-Z]') and exists (select 1 from jsonb_object_keys(b) x where x ~ ('^' || c || '[A-Z]')) then
          raise exception 'a second value for %.%[x]', a ->> 'resourceType', c using errcode = 'P0001';
        end if;
      end loop;
      b := b || jsonb_build_object(k, v);
    end loop;
    out := jsonb_set(out, array[i::text], b);
  end loop;
  return out;
end $$;

-- ── core: the export (§3.10 shape fhir). Input rows are the reader's; the item's kind is its first entry's type. ──
create or replace function core.read_fhir(me core.users, q jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_org uuid := me.organization_id; v_dept uuid := (q ->> 'department_id')::uuid; p core.patients; fam uuid[]; ids uuid[]; hid uuid[]; priv uuid[];
        it record; t core.types; res jsonb := '[]'; r jsonb; patient jsonb; v_kind text := coalesce(q ->> 'kind', 'bundle'); v_authors uuid[] := '{}';
        v_depts uuid[] := '{}'; prov jsonb := '[]'; v_sets record; sections jsonb; comp jsonb; v_x jsonb; withheld int := 0; v_fn regprocedure; v_add regprocedure; v_in jsonb;
        v_at regprocedure; v_patched text[] := '{}'; v_owner jsonb := '{}'; v_bad text;
begin
  if v_dept is null or not core.may(me.id, 'read:record', v_dept) or not core.may(me.id, 'export:fhir', v_dept) then perform core.refuse('not_allowed', 'export:fhir'); end if;
  select * into p from core.patients x where x.organization_id = v_org and x.id = core.survivor(v_org, (q ->> 'patient_id')::uuid);
  if not found then perform core.refuse('not_found', 'patient'); end if;
  fam := core.family(v_org, p.id);
  select coalesce(array_agg(e.id), '{}') into ids from core.entries e where e.organization_id = v_org and e.patient_id = any (fam);
  hid := core.hidden(v_org, me.id, ids);
  priv := core.hidden(v_org, null, ids);   -- private to someone with no rights at all: meta.security R
  patient := core.fhir_patient(v_org, p.id);
  for it in select e.item, (array_agg(e.type order by e.item_version))[1] kind, jsonb_agg(core.entry_out(e, false) order by e.item_version) rows, array_agg(e.id::text) ids,
                   bool_or(e.id = any (hid)) hidden, bool_or(e.id = any (priv)) private, array_agg(distinct e.author_id) authors, array_agg(distinct e.department_id) depts
              from core.entries e where e.organization_id = v_org and e.patient_id = any (fam) group by e.item loop
    if it.hidden then withheld := withheld + 1; continue; end if;
    select * into t from core.types x where x.key = it.kind order by x.version desc limit 1;
    -- a pack type that extends a base type always maps as its base type; its own mapping only adds beside it (§5.2 Export)
    v_fn := case when t.base_type is not null then (select b.to_fhir from core.types b where b.key = t.base_type order by b.version desc limit 1) else t.to_fhir end;
    v_add := case when t.base_type is not null then t.to_fhir end;
    continue when v_fn is null;
    v_in := jsonb_build_object('org', v_org, 'patient', p.id, 'private', it.private, 'entries', it.rows);
    -- a mapping that fails refuses the export, naming the type and the mapping that failed (never its data): nothing is dropped silently
    begin
      v_at := v_fn;
      execute format('select %s($1)', v_fn::regproc) into r using v_in;
      if v_add is not null then
        v_at := v_add;
        execute format('select %s($1)', v_add::regproc) into v_x using v_in || jsonb_build_object('base', coalesce(r, '[]'));
        -- the pack's patch of the Patient (or the Patient itself) goes beside what is there, like any of its additions
        patient := core.fhir_beside(jsonb_build_array(patient), (select coalesce(jsonb_agg((y - 'patch') || jsonb_build_object('resourceType', 'Patient', 'id', p.id::text)), '[]')
                     from jsonb_array_elements(coalesce(v_x, '[]')) y where y ? 'patch' or (y ->> 'resourceType' = 'Patient' and y ->> 'id' = p.id::text))) -> 0;
        r := core.fhir_beside(r, (select coalesce(jsonb_agg(y), '[]') from jsonb_array_elements(coalesce(v_x, '[]')) y
                                   where not (y ? 'patch' or (y ->> 'resourceType' = 'Patient' and y ->> 'id' = p.id::text))));
        if exists (select 1 from jsonb_array_elements(coalesce(v_x, '[]')) y where y ? 'patch' or y ->> 'resourceType' = 'Patient') then v_patched := v_patched || format('%s: %s', it.kind, v_add); end if;
      end if;
    exception when others then
      perform core.refuse('fhir_failed', format('%s: %s', it.kind, v_at));
    end;
    if exists (select 1 from jsonb_array_elements(coalesce(r, '[]')) y where not y ? 'patch' and cardinality(core.fhir_problems(y)) > 0) then
      perform core.refuse('fhir_invalid', format('%s: %s', it.kind, (select string_agg(pr, '; ') from jsonb_array_elements(r) y, unnest(core.fhir_problems(y)) pr where not y ? 'patch')));
    end if;
    for v_x in select * from jsonb_array_elements(coalesce(r, '[]')) loop
      if v_x ? 'patch' then patient := patient || (v_x - 'patch'); v_patched := v_patched || format('%s: %s', it.kind, v_fn);
      else
        res := res || jsonb_build_array(v_x);
        -- an id that does not start with its item (uuid v5): its set's Provenance finds it here
        if not (left(v_x ->> 'id', 36) = any (it.ids)) then v_owner := v_owner || jsonb_build_object((v_x ->> 'resourceType') || '/' || (v_x ->> 'id'), it.item); end if;
      end if;
    end loop;
    v_authors := v_authors || it.authors; v_depts := v_depts || it.depts ||
      coalesce((select array_agg(distinct (e -> 'data' ->> k)::uuid) from jsonb_array_elements(it.rows) e, unnest(array['department_id', 'to_department_id']) k
                 where e -> 'data' ->> k ~ '^[0-9a-f-]{36}$'), '{}');
  end loop;
  -- one Provenance per set: every resource version it wrote, CREATE, UPDATE or NULLIFY
  for v_sets in select e.set_id, min(e.recorded_at) at, min(e.author_id::text)::uuid author, jsonb_agg(distinct e.item) || jsonb_agg(distinct e.id) items,
                       bool_or(e.type = 'crossed_out') nullify,
                       bool_or(e.item_version > 1) updates
                  from core.entries e where e.organization_id = v_org and e.patient_id = any (fam) and not (e.id = any (hid)) group by e.set_id loop
    prov := prov || jsonb_build_array(jsonb_build_object('resourceType', 'Provenance', 'id', v_sets.set_id,
      'target', (select jsonb_agg(jsonb_build_object('reference', (y ->> 'resourceType') || '/' || (y ->> 'id')))
                   from jsonb_array_elements(res) y where v_sets.items @> to_jsonb(array[left(y ->> 'id', 36)])
                     or v_sets.items @> jsonb_build_array(v_owner -> ((y ->> 'resourceType') || '/' || (y ->> 'id')))),
      'recorded', core.fhir_instant(v_sets.at),
      'activity', jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/v3-DataOperation',
        'code', case when v_sets.nullify then 'NULLIFY' when v_sets.updates then 'UPDATE' else 'CREATE' end))),
      'agent', jsonb_build_array(jsonb_build_object('who', jsonb_build_object('reference', 'PractitionerRole/' || v_sets.author),
        'onBehalfOf', jsonb_build_object('reference', 'Organization/' || v_org)))));
  end loop;
  prov := coalesce((select jsonb_agg(x) from jsonb_array_elements(prov) x where case when jsonb_typeof(x -> 'target') = 'array' then jsonb_array_length(x -> 'target') else 0 end > 0), '[]');   -- a set that wrote no resource (a death patches the Patient) has none
  -- the Patient with every patch, the places, the people and the Provenance are checked like the rest
  select string_agg(pr, '; ') into v_bad from unnest(core.fhir_problems(patient)) pr;
  if v_bad is not null then perform core.refuse('fhir_invalid', format('%s: %s', coalesce(nullif(array_to_string(v_patched, ', '), ''), 'Patient'), v_bad)); end if;
  res := jsonb_build_array(patient) || core.fhir_places(v_org, (select array_agg(distinct d) from unnest(v_depts) d)) ||
         core.fhir_people(v_org, (select array_agg(distinct a) from unnest(v_authors) a)) || res;
  select string_agg((y ->> 'resourceType') || ': ' || pr, '; ') into v_bad from jsonb_array_elements(res || prov) y, unnest(core.fhir_problems(y)) pr;
  if v_bad is not null then perform core.refuse('fhir_invalid', v_bad); end if;
  perform core.log_read(me, v_dept, p.id, coalesce(q ->> 'purpose', 'TREAT'), q ->> 'reason', jsonb_build_object('fhir', jsonb_build_array(v_kind)), withheld);
  if v_kind = 'ips' then
    -- the International Patient Summary: a document; sections by resource; an empty required section says so (§6.4 rule 10)
    sections := jsonb_build_array(
      jsonb_build_object('title', 'Active problems', 'loinc', '11450-4', 'types', jsonb_build_array('Condition')),
      jsonb_build_object('title', 'Medication summary', 'loinc', '10160-0', 'types', jsonb_build_array('MedicationStatement')),
      jsonb_build_object('title', 'Allergies and intolerances', 'loinc', '48765-2', 'types', jsonb_build_array('AllergyIntolerance')),
      jsonb_build_object('title', 'Results', 'loinc', '30954-2', 'types', jsonb_build_array('DiagnosticReport')),
      jsonb_build_object('title', 'Immunizations', 'loinc', '11369-6', 'types', jsonb_build_array('Immunization')),
      jsonb_build_object('title', 'History of procedures', 'loinc', '47519-4', 'types', jsonb_build_array('Procedure')));
    comp := jsonb_build_object('resourceType', 'Composition', 'id', core.uuid5(p.id, 'ips')::text, 'status', 'final',
      'type', core.fhir_code('loinc', '60591-5', null, v_org), 'subject', jsonb_build_object('reference', 'Patient/' || p.id),
      'date', core.fhir_instant(clock_timestamp()), 'author', jsonb_build_array(jsonb_build_object('reference', 'Organization/' || v_org)),
      'title', 'International Patient Summary',
      'section', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('title', s ->> 'title', 'code', core.fhir_code('loinc', s ->> 'loinc', null, v_org),
          'entry', (select jsonb_agg(jsonb_build_object('reference', (y ->> 'resourceType') || '/' || (y ->> 'id'))) from jsonb_array_elements(res) y
                     where s -> 'types' @> to_jsonb(array[y ->> 'resourceType']) and coalesce(y ->> 'status', '') <> 'entered-in-error'
                       and coalesce(y -> 'verificationStatus' -> 'coding' -> 0 ->> 'code', '') <> 'entered-in-error'),
          'emptyReason', case when not exists (select 1 from jsonb_array_elements(res) y where s -> 'types' @> to_jsonb(array[y ->> 'resourceType']))
            then jsonb_build_object('coding', jsonb_build_array(jsonb_build_object('system', 'http://terminology.hl7.org/CodeSystem/list-empty-reason', 'code', 'unavailable'))) end)))
        from jsonb_array_elements(sections) s));
    return jsonb_build_object('resourceType', 'Bundle', 'id', core.uuid5(p.id, 'ips-bundle')::text, 'type', 'document',
      'identifier', jsonb_build_object('system', 'urn:ietf:rfc:3986', 'value', 'urn:uuid:' || core.uuid5(p.id, 'ips-bundle')),
      'timestamp', core.fhir_instant(clock_timestamp()),
      -- a fullUrl urn:uuid: is a plain uuid, once in the bundle: the resource's id when it is one no other resource shares (a department
      -- is an Organization and a Location), else uuid v5 of the patient and Type/id
      'entry', (select jsonb_agg(jsonb_build_object('fullUrl', 'urn:uuid:' || case when z.id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and z.same = 1 then z.id
                  else core.uuid5(p.id, (z.y ->> 'resourceType') || '/' || z.id)::text end, 'resource', z.y) order by z.n)
                  from (select y, n, y ->> 'id' id, count(*) over (partition by y ->> 'id') same from jsonb_array_elements(jsonb_build_array(comp) || res) with ordinality x(y, n)) z));
  end if;
  return jsonb_build_object('resourceType', 'Bundle', 'id', core.uuid5(p.id, 'bundle')::text, 'type', 'collection', 'timestamp', core.fhir_instant(clock_timestamp()),
    'entry', (select jsonb_agg(jsonb_build_object('fullUrl', (select url from core.canon) || '/fhir/' || (y ->> 'resourceType') || '/' || (y ->> 'id'), 'resource', y))
              from jsonb_array_elements(res || prov) y));
end $$;

revoke all on all functions in schema core from public, anon, authenticated;
grant execute on function core.may_listen(text) to authenticated;
grant execute on function core.fhir_uri(text, uuid), core.fhir_coding(jsonb, uuid), core.fhir_concept(jsonb, uuid), core.fhir_code(text, text, text, uuid),
  core.fhir_quantity(jsonb), core.fhir_date(timestamptz, text, uuid), core.fhir_instant(timestamptz), core.fhir_meta(jsonb, boolean) to base_role;
