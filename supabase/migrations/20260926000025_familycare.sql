-- 25 · the family pack (spec/openCare.md §5.8; the owner 2026-10-08, Q16, Q49, Q50: drawn; the pictures /pictures.html#family-folder,
-- #family-day, #family-checks). Family medicine ticks five packs (its own, chronic care, vaccines, paediatrics and ObGyn), never copies of
-- them. Its own: the household as the pack's own table (Q49: each member still their own patient; the file, its number by the unit, its
-- address and phone, who belongs to it), not record entries; the checks due by age and sex as a clinic setting, each met by a base entry
-- with one of its codes, never ticked by hand; the Families screen; and the desk's New patient asking to join a file or start one (core
-- change C4, its setting familycare.ask_at_new_patient). Written through its ops: joining a file is the desk's work (manage:patients).

set client_min_messages = warning;

select core.declare_pack('familycare', 1, '{}', '{"en":"Family medicine","ar":"طب الأسرة"}', role_block => 'e2');
select core.create_pack('familycare');

set role pack_familycare;

-- ── the households and who belongs to them ──
create table familycare.households (
  organization_id uuid not null,
  id            uuid not null,
  number        int not null,              -- the file number, by the unit: 1, 2, 3 …
  address       text,
  phone         text,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  primary key (organization_id, id),
  unique (organization_id, number)
);
create table familycare.members (
  organization_id uuid not null,
  household_id  uuid not null,
  patient_id    uuid not null,
  relation      text,                      -- head · wife · husband · son · daughter · mother · father · other
  joined_at     timestamptz not null default now(),
  primary key (organization_id, patient_id),
  foreign key (organization_id, household_id) references familycare.households (organization_id, id) on delete cascade
);
create index members_household on familycare.members (organization_id, household_id);

-- a household as the screens read it: the file, then its members (the head first, then by when they joined)
create function familycare.file_of(p_org uuid, p_id uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', h.id, 'number', h.number, 'address', h.address, 'phone', h.phone,
    'members', coalesce((select jsonb_agg(jsonb_build_object('patient_id', core.survivor(p_org, m.patient_id), 'relation', m.relation, 'joined_at', m.joined_at)
      order by (m.relation = 'head') desc, m.joined_at) from familycare.members m where m.organization_id = p_org and m.household_id = h.id), '[]'))
  from familycare.households h where h.organization_id = p_org and h.id = p_id
$$;
-- the file a patient belongs to (none: null)
create function familycare.of_patient(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_h uuid; f jsonb;
begin
  select m.household_id into v_h from familycare.members m where m.organization_id = p_org and m.patient_id = core.survivor(p_org, (p_args ->> 'patient_id')::uuid);
  f := case when v_h is null then null else familycare.file_of(p_org, v_h) end;
  return jsonb_build_object('file', f, 'patient_ids', coalesce((select jsonb_agg(x -> 'patient_id') from jsonb_array_elements(f -> 'members') x), '[]'));
end $$;
-- files found by number, phone or address (the member's name is the desk's search: a patient's file follows from of_patient)
create function familycare.find(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare q text := trim(coalesce(p_args ->> 'q', '')); digits text := regexp_replace(q, '[^0-9]', '', 'g'); out jsonb;
begin
  select coalesce(jsonb_agg(familycare.file_of(p_org, h.id) order by h.number), '[]') into out from (
    select h.id, h.number from familycare.households h where h.organization_id = p_org and (
      q = '' or (digits = q and h.number::text = digits) or (length(digits) >= 4 and regexp_replace(coalesce(h.phone, ''), '[^0-9]', '', 'g') like '%' || digits || '%')
      or (length(q) >= 3 and h.address ilike '%' || q || '%')
      or exists (select 1 from familycare.members m where m.organization_id = p_org and m.household_id = h.id
                   and m.patient_id::text in (select jsonb_array_elements_text(coalesce(p_args -> 'patient_ids', '[]')))))
    order by h.number limit 50) h;
  return jsonb_build_object('files', out, 'patient_ids', coalesce((select jsonb_agg(m -> 'patient_id') from jsonb_array_elements(out) f, jsonb_array_elements(f -> 'members') m), '[]'));
end $$;
-- start a file with this patient (its head unless said), the next number by the unit
create function familycare.start(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid := coalesce((p_args ->> 'id')::uuid, gen_random_uuid()); v_p uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid); n int;
begin
  if v_p is null then perform core.refuse('bad_args', 'patient_id'); end if;
  if exists (select 1 from familycare.members m where m.organization_id = p_org and m.patient_id = v_p) then perform core.refuse('already_in_a_file', v_p::text); end if;
  perform pg_advisory_xact_lock(hashtextextended('familycare.households ' || p_org::text, 0));
  select coalesce(max(h.number), 0) + 1 into n from familycare.households h where h.organization_id = p_org;
  insert into familycare.households (organization_id, id, number, address, phone, created_by) values (p_org, v_id, coalesce((p_args ->> 'number')::int, n),
    nullif(trim(p_args ->> 'address'), ''), nullif(trim(p_args ->> 'phone'), ''), p_user)
  on conflict (organization_id, id) do update set address = coalesce(excluded.address, familycare.households.address), phone = coalesce(excluded.phone, familycare.households.phone);
  insert into familycare.members (organization_id, household_id, patient_id, relation) values (p_org, v_id, v_p, coalesce(nullif(p_args ->> 'relation', ''), 'head'));
  return jsonb_build_object('file', familycare.file_of(p_org, v_id), 'patient_ids', jsonb_build_array(v_p));
end $$;
-- join a file: one file a patient (a second join moves them)
create function familycare.join(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_h uuid := (p_args ->> 'household_id')::uuid; v_p uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid);
begin
  if not exists (select 1 from familycare.households h where h.organization_id = p_org and h.id = v_h) then perform core.refuse('not_found', 'file'); end if;
  if v_p is null then perform core.refuse('bad_args', 'patient_id'); end if;
  insert into familycare.members (organization_id, household_id, patient_id, relation) values (p_org, v_h, v_p, nullif(p_args ->> 'relation', ''))
  on conflict (organization_id, patient_id) do update set household_id = excluded.household_id, relation = excluded.relation, joined_at = now();
  return jsonb_build_object('file', familycare.file_of(p_org, v_h), 'patient_ids', jsonb_build_array(v_p));
end $$;
-- leave a file (a file with nobody left stays, its number kept)
create function familycare.leave(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_p uuid := core.survivor(p_org, (p_args ->> 'patient_id')::uuid);
begin
  delete from familycare.members m where m.organization_id = p_org and m.patient_id = v_p;
  return jsonb_build_object('left', true, 'patient_ids', jsonb_build_array(v_p));
end $$;

reset role;

grant select, delete on familycare.members to core_eraser;
select core.declare_store('familycare.members', 'familycare');

-- the pack's ops: reading a file is anyone who finds patients; changing one the desk's work (registering, manage:patients)
select core.declare_op('familycare.of_patient', 'familycare', 'familycare.of_patient(uuid,uuid,uuid,jsonb)', 'read:patients', patients => true);
select core.declare_op('familycare.find', 'familycare', 'familycare.find(uuid,uuid,uuid,jsonb)', 'read:patients', patients => true);
select core.declare_op('familycare.start', 'familycare', 'familycare.start(uuid,uuid,uuid,jsonb)', 'manage:patients', patients => true);
select core.declare_op('familycare.join', 'familycare', 'familycare.join(uuid,uuid,uuid,jsonb)', 'manage:patients', patients => true);
select core.declare_op('familycare.leave', 'familycare', 'familycare.leave(uuid,uuid,uuid,jsonb)', 'manage:patients', patients => true);

-- the Families screen: find a file by its number, its members, who is due
select core.declare_screen('familycare.files', 'familycare', 'visits', '{"en":"Families"}', 'read:patients');

-- the checks due by age and sex (Q49's picture): who (a sex, an age from and to, and optionally a BMI from), how often (years, or once),
-- met by the base entries with one of its codes — the clinic's own list; the values in the setup are examples, not advice
select core.declare_setting('familycare.checks', 'familycare', 'organization',
  jsonb_set('{"type":"object","additionalProperties":false,"required":["checks"],"properties":{"checks":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["name","codes"],"properties":{"name":{"type":"string","minLength":1},"who":{"type":"string"},"sex":{"enum":["any","female","male"],"default":"any"},
      "from":{"type":"integer","minimum":0},"to":{"type":"integer","minimum":0},"bmi_from":{"type":"number"},"bmi_age_from":{"type":"integer","minimum":0},
      "every_years":{"type":"integer","minimum":1},"once":{"type":"boolean","default":false},"codes":{"type":"array","items":{"type":"string"}},"met_by":{"type":"string"},
      "order":{"type":"string"}}}}}}'::jsonb, '{properties,checks,default}', $j$[
    {"name":"Blood pressure","who":"everyone 18 and over","sex":"any","from":18,"every_years":1,"codes":["loinc:8480-6"],"met_by":"a BP in the vitals"},
    {"name":"Sugar","who":"35 and over; younger with BMI 25+","sex":"any","from":35,"bmi_from":25,"bmi_age_from":18,"every_years":3,"codes":["loinc:4548-4","loinc:1558-6"],"met_by":"HbA1c or fasting glucose","order":"hba1c"},
    {"name":"Lipids","who":"men 40+","sex":"male","from":40,"every_years":5,"codes":["loinc:2089-1"],"met_by":"an LDL result","order":"lipids"},
    {"name":"Lipids","who":"women 50+","sex":"female","from":50,"every_years":5,"codes":["loinc:2089-1"],"met_by":"an LDL result","order":"lipids"},
    {"name":"Cervical screening","who":"women 25–65","sex":"female","from":25,"to":65,"every_years":3,"codes":["loinc:10524-7","loinc:21440-3","familycare.check:cervical"],"met_by":"a cervical smear or HPV result"},
    {"name":"Breast","who":"women 40–74","sex":"female","from":40,"to":74,"every_years":2,"codes":["loinc:24606-6"],"met_by":"a mammogram"},
    {"name":"Bowel","who":"45–75","sex":"any","from":45,"to":75,"every_years":1,"codes":["loinc:2335-8","loinc:29771-3"],"met_by":"a stool blood test"},
    {"name":"Hepatitis C","who":"everyone 18 and over","sex":"any","from":18,"once":true,"codes":["loinc:16128-1","loinc:13955-0"],"met_by":"an HCV antibody result"}
  ]$j$::jsonb),
  labels => '{"en":"Checks due by age and sex"}', form => 'pack',
  fields => '[{"key":"checks","labels":{"en":"Checks"},"help":{"en":"The clinic''s own list. Who is a sex, an age from and to, and optionally a BMI (25+ from an age); met by the base entries with one of its codes, so nothing is ticked by hand. The values here are examples, not advice."}},
    {"key":"checks.name","labels":{"en":"Check"}},{"key":"checks.who","labels":{"en":"Who, in words"}},{"key":"checks.sex","labels":{"en":"Sex"},"choices":{"any":{"en":"Everyone"},"female":{"en":"Women"},"male":{"en":"Men"}}},
    {"key":"checks.from","labels":{"en":"From age"}},{"key":"checks.to","labels":{"en":"To age"}},{"key":"checks.bmi_from","labels":{"en":"Or a BMI from"}},{"key":"checks.bmi_age_from","labels":{"en":"… from age"}},
    {"key":"checks.every_years","labels":{"en":"Every"},"unit":"years"},{"key":"checks.once","labels":{"en":"Once"}},{"key":"checks.codes","labels":{"en":"Met by (codes)"}},
    {"key":"checks.met_by","labels":{"en":"Met by, in words"}},{"key":"checks.order","labels":{"en":"Ordered as (a service code)"}}]');
-- the files (Q49): the desk's New patient asks to join a file or start one; home visits later
select core.declare_setting('familycare.files', 'familycare', 'organization',
  '{"type":"object","additionalProperties":false,"properties":{"ask_at_new_patient":{"type":"boolean","default":true}}}',
  labels => '{"en":"Family files"}', form => 'pack',
  fields => '[{"key":"ask_at_new_patient","labels":{"en":"New patient asks for a file"},"help":{"en":"The desk''s New patient joins a family file or starts one (file numbers by the unit: 1, 2, 3 …)."}}]');

-- its starter setup (§5.2): Family medicine — a clinic ticking the family pack (the others it uses, chronic care, vaccines, paediatrics
-- and ObGyn, the clinic ticks as it turns them on); its queue and Families. The checks and the files are clinic-wide, their defaults
-- in their shapes until the clinic saves its own
select core.declare_setup('familycare.medicine', 'familycare', 'visits', '{"en":"Family medicine"}', packs => array['familycare'],
  screens => '{"screens":["base.queue","familycare.files"],"opens":"base.queue"}',
  help => '{"en":"The household''s file and what each member is due; the checks by age and sex; the family packs together."}');

select core.declare_system('familycare.check', 'familycare', 'code', '{canon}/CodeSystem/family-check', null, false, null, 'openCare', '{"en":"Family medicine checks"}');
