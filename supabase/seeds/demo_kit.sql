-- The demo kit (spec/openCare.md §5.1 rule 9), local only: the helpers every layer's seed (supabase/seeds/) and demo
-- (supabase/demo/) use. Every write goes through a door (create_organization, save, write_setting, save_patient, erase_patient,
-- write) as the user each step names; core rows are only read, to add what is missing. So a seed run again changes nothing (a
-- holding granted, a pack ticked, a screen on the line, a setting written once), and a demo patient is erased and written again,
-- so a reload leaves a fresh day. Ids per layer: demo.id(layer, name), a uuid v5 in the layer's own namespace.
-- Runs first at a reset (seeds run in name order) and first in every load (supabase/demo/load.sql).
create schema if not exists demo;
revoke all on schema demo from public;

-- local development only: settings changes, erase and redact without a second factor
update core.server_settings set value = 'off' where key = 'require_mfa';

-- ── ids ──
create or replace function demo.id(p_layer text, p_name text) returns uuid language sql immutable as $$
  select core.uuid5(core.uuid5('6d656d6f-6f70-5e63-a172-6564656d6f00', p_layer), p_name)
$$;
-- the base's clinic: fixed ids from before the kit (the seed's own namespace), which a pack's demo writes with
create or replace function demo.base(p_name text) returns uuid language sql immutable as $$
  select (case p_name
    when 'clinic' then '00000000-0000-0000-0000-00000000a001' when 'owner' then '00000000-0000-0000-0000-000000000101'
    when 'desk' then '00000000-0000-0000-0000-00000000d001' when 'gp' then '00000000-0000-0000-0000-00000000d002'
    when 'lab' then '00000000-0000-0000-0000-00000000d003' when 'psychiatry' then '00000000-0000-0000-0000-00000000d005'
    when 'ward' then '00000000-0000-0000-0000-00000000d006' when 'doctor' then '00000000-0000-0000-0000-000000000102'
    when 'nurse' then '00000000-0000-0000-0000-000000000104' when 'tech' then '00000000-0000-0000-0000-000000000105'
    when 'reception' then '00000000-0000-0000-0000-000000000107' when 'psychiatrist' then '00000000-0000-0000-0000-000000000108'
    when 'role:owner' then '00000000-0000-0000-0000-00000000c001' when 'role:doctor' then '00000000-0000-0000-0000-00000000c002'
    when 'role:nurse' then '00000000-0000-0000-0000-00000000c003' when 'role:reception' then '00000000-0000-0000-0000-00000000c004'
    when 'role:lab_technician' then '00000000-0000-0000-0000-00000000c005' end)::uuid
$$;
create or replace function demo.bed(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000b0' || lpad(n::text, 3, '0'))::uuid
$$;
-- an id one file keeps for a later one (the shared journey's patient and stay, each step in its own file), until the load ends
create or replace function demo.keep(p_name text, p_id uuid) returns uuid language sql as $$ select set_config('demo.' || p_name, p_id::text, true)::uuid $$;
create or replace function demo.kept(p_name text) returns uuid language sql stable as $$ select current_setting('demo.' || p_name)::uuid $$;

-- ── the clock: every demo time is before the moment it loads (demo.now(); a test may set demo.now to load as if earlier) ──
create or replace function demo.now() returns timestamptz language sql stable as $$
  select coalesce(nullif(current_setting('demo.now', true), '')::timestamptz, now())
$$;
create or replace function demo.midnight() returns timestamptz language sql stable as $$
  select date_trunc('day', demo.now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'
$$;
-- today's day spans the five hours before the load; loaded earlier than 05:00 it is squeezed in proportion into the time since
-- midnight, so every visit of the day stays today's and keeps its order
create or replace function demo.squeeze() returns float8 language sql stable as $$
  select least(1, extract(epoch from demo.now() - demo.midnight()) / (300 * 60))
$$;
-- p_min minutes before the load: today's minutes (under a day) squeezed, days and months as they are
create or replace function demo.ago(p_min int) returns timestamptz language sql stable as $$
  select demo.now() - p_min * interval '1 minute' * case when p_min < 1440 then demo.squeeze() else 1 end
$$;
-- p_min minutes after a time, squeezed like demo.ago when that time is today, never after the load
create or replace function demo.after(p_at timestamptz, p_min int) returns timestamptz language sql stable as $$
  select least(p_at + p_min * interval '1 minute' * case when p_at >= demo.midnight() then demo.squeeze() else 1 end, demo.now())
$$;

-- ── who writes: the login the JWT names (until the transaction ends) ──
create or replace function demo.as(p_login uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_login::text, true), set_config('request.jwt.claim.session_id', '', true)
$$;

-- ── people ──
-- the demo logins' one password: the sign-in page's one-click buttons read it from logins.generated.ts (npm run gen:logins)
create or replace function demo.password() returns text language sql immutable as $$ select 'Demo123!' $$;
-- a login (password demo.password()): the auth service's own rows, the one thing no door makes
create or replace function demo.login(p_id uuid, p_email text) returns void language plpgsql as $$
begin
  if exists (select 1 from auth.users where id = p_id) then return; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, extensions.crypt(demo.password(), extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
end $$;
-- the clinic: its owner's login makes it (and holds everything everywhere)
create or replace function demo.clinic(p_name text, p_owner_email text, p_owner_name text) returns void language plpgsql as $$
begin
  perform demo.login(demo.base('owner'), p_owner_email);
  if exists (select 1 from core.organizations where id = demo.base('clinic')) then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.create_organization(demo.base('clinic'), p_name, demo.base('owner'), p_owner_name);
end $$;
-- a person with a login (the user's id is the login's)
create or replace function demo.person(p_id uuid, p_email text, p_name text, p_title text default null) returns void language plpgsql as $$
begin
  perform demo.login(p_id, p_email);
  if exists (select 1 from core.users where organization_id = demo.base('clinic') and id = p_id) then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.save('user', jsonb_strip_nulls(jsonb_build_object('id', p_id, 'name', p_name, 'title', p_title, 'login_id', p_id)));
end $$;
-- one holding more: the person's live holdings stay as they are (save takes the whole list, so it is read first)
create or replace function demo.grant(p_user uuid, p_role uuid, p_department uuid) returns void language plpgsql as $$
declare v_now jsonb;
begin
  if exists (select 1 from core.live_holdings(demo.base('clinic')) h where h.user_id = p_user and h.role_id = p_role and h.department_id is not distinct from p_department) then
    return;
  end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('role_id', h.role_id, 'department_id', h.department_id))), '[]') into v_now
    from core.live_holdings(demo.base('clinic')) h where h.user_id = p_user;
  perform demo.as(demo.base('owner'));
  perform public.save('user', jsonb_build_object('id', p_user, 'holdings', v_now || jsonb_strip_nulls(jsonb_build_object('role_id', p_role, 'department_id', p_department))));
end $$;

-- ── places and settings: added when missing, never overwritten (staff may have changed them since) ──
create or replace function demo.department(p_id uuid, p_name text, p_work text, p_position int) returns void language plpgsql as $$
begin
  if exists (select 1 from core.departments where organization_id = demo.base('clinic') and id = p_id) then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.save('department', jsonb_build_object('id', p_id, 'name', p_name, 'work', p_work, 'position', p_position));
end $$;
create or replace function demo.place(p_id uuid, p_department uuid, p_label text, p_name text, p_position int) returns void language plpgsql as $$
begin
  if exists (select 1 from core.places where organization_id = demo.base('clinic') and id = p_id) then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.save('place', jsonb_build_object('id', p_id, 'department_id', p_department, 'label', p_label, 'name', p_name, 'position', p_position));
end $$;
-- a setting written once: its thing is the owner (one per owner), the clinic (an organization key) or the thing named (many)
create or replace function demo.setting(p_key text, p_owner uuid, p_thing uuid, p_data jsonb) returns void language plpgsql as $$
begin
  if exists (select 1 from core.settings where organization_id = demo.base('clinic') and key = p_key
               and thing_id = coalesce(p_thing, p_owner, demo.base('clinic'))) then
    return;
  end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_strip_nulls(jsonb_build_object('key', p_key, 'owner_id', p_owner, 'thing_id', p_thing, 'data', p_data)));
end $$;
-- one more word on a list setting (the clinic's packs, a department's packs): the list as it stands, plus this one
create or replace function demo.append(p_key text, p_owner uuid, p_list text, p_value text) returns void language plpgsql as $$
declare v jsonb := core.setting_at(demo.base('clinic'), p_key, coalesce(p_owner, demo.base('clinic')));
begin
  if coalesce(v -> p_list, '[]') ? p_value then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_strip_nulls(jsonb_build_object('key', p_key, 'owner_id', p_owner,
    'data', coalesce(v, '{}') || jsonb_build_object(p_list, coalesce(v -> p_list, '[]') || to_jsonb(p_value)))));
end $$;
-- the clinic turns a pack on; a department ticks it (§5.1 rule 1)
create or replace function demo.pack_on(p_pack text) returns void language sql as $$ select demo.append('organization.packs_used', null, 'packs', p_pack) $$;
create or replace function demo.tick(p_department uuid, p_pack text) returns void language sql as $$ select demo.append('department.packs', p_department, 'packs', p_pack) $$;
-- a screen on the department's Screens line (§5.1 rules 5 and 6): appended to the line it has, else to the base's screens of its
-- work that this one does not stand in for; opens there when asked
create or replace function demo.screen(p_department uuid, p_screen text, p_opens boolean default false) returns void language plpgsql as $$
declare v jsonb := core.setting_at(demo.base('clinic'), 'department.screens', p_department); v_line jsonb;
begin
  if v is not null and v -> 'screens' ? p_screen and (not p_opens or v ->> 'opens' = p_screen) then return; end if;
  v_line := coalesce(v -> 'screens', (select coalesce(jsonb_agg(s.key order by s.key), '[]') from core.screens s, core.departments d
    where d.organization_id = demo.base('clinic') and d.id = p_department and s.layer = 'base' and s.work = d.work
      and not s.key = any (coalesce((select x.replaces from core.screens x where x.key = p_screen), '{}'))));
  if not v_line ? p_screen then v_line := v_line || to_jsonb(p_screen); end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', p_department, 'data', jsonb_build_object('screens', v_line,
    'opens', case when p_opens then p_screen else coalesce(v ->> 'opens', v_line ->> 0) end)));
end $$;

-- ── patients: erased if a load before wrote them (the eraser's door, as the owner), then registered at the desk ──
create or replace function demo.born(p_years int, p_days int default 0) returns date language sql stable as $$
  select ((demo.now() at time zone 'Africa/Cairo')::date - make_interval(years => p_years))::date - p_days
$$;
create or replace function demo.patient(p_id uuid, p_given text[], p_family text, p_gender text, p_born date, p_phone text default null) returns uuid language plpgsql as $$
begin
  if exists (select 1 from core.patients where organization_id = demo.base('clinic') and id = p_id) then
    perform demo.as(demo.base('owner'));
    perform public.erase_patient(jsonb_build_object('patient_id', p_id, 'reason', 'demo reload'));
  end if;
  perform demo.as(demo.base('reception'));
  perform public.save_patient(jsonb_build_object('department_id', demo.base('desk'), 'patient', jsonb_strip_nulls(jsonb_build_object('id', p_id,
    'given', to_jsonb(p_given), 'family', p_family, 'gender', p_gender, 'birth_date', p_born,
    'telecom', case when p_phone is not null then jsonb_build_array(jsonb_build_object('system', 'phone', 'value', p_phone)) end))));
  perform set_config('demo.patient', p_id::text, true);
  return p_id;
end $$;
-- the patient the next entries are about
create or replace function demo.use(p_id uuid) returns void language sql as $$ select set_config('demo.patient', p_id::text, true) $$;

-- ── entries and sets ──
-- one entry of the current patient, at a clinical time (null: as it is written)
-- a recorded score as the server adds it up (spec §5.1 rule 8): the score's latest version in use, the server's total and band
create or replace function demo.score(p_key text, p_inputs jsonb) returns jsonb language sql as $$
  select jsonb_build_object('score', s.key, 'version', s.version, 'inputs', p_inputs, 'total', (x.r ->> 'total')::int, 'band', x.r -> 'band' ->> 'key')
  from (select key, version from core.scores where key = p_key and retired_at is null order by position desc limit 1) s,
       lateral (select core.score(s.key, s.version, p_inputs) as r) x
$$;

create or replace function demo.e(p_type text, p_dept uuid, p_visit uuid, p_at timestamptz, p_data jsonb, p_id uuid default null, p_refers uuid default null,
  p_relation text default null, p_replaces uuid default null) returns jsonb language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('id', coalesce(p_id, gen_random_uuid()), 'type', p_type, 'patient_id', current_setting('demo.patient')::uuid,
    'department_id', p_dept, 'visit_id', p_visit, 'occurred_at', p_at, 'refers_to', p_refers, 'relation', p_relation, 'replaces', p_replaces))
    || jsonb_build_object('data', p_data)
$$;
-- a move of a visit or stay: changes its latest version, which the caller names
create or replace function demo.move(p_type text, p_dept uuid, p_visit uuid, p_at timestamptz, p_after uuid, p_data jsonb default '{}', p_id uuid default null) returns jsonb
language sql as $$ select demo.e(p_type, p_dept, p_visit, p_at, p_data, p_id, p_after, 'changes') $$;
-- one set as the user named; the warnings a clinician would confirm are confirmed (the demo's Sign anyway). A refusal or a flag stops
-- the load: the demo lands clean or not at all
create or replace function demo.send(p_user uuid, p_entries jsonb) returns jsonb language sql as $$
  select demo.as(p_user);
  select public.write(jsonb_build_object('set_id', gen_random_uuid(), 'entries', p_entries,
    'confirmed', '["allergy_clash","allergy_caution","duplicate_medication","duplicate_class","already_on_list"]'::jsonb))
$$;
create or replace function demo.landed(r jsonb, p_entries jsonb) returns jsonb language plpgsql as $$
begin
  if r ->> 'outcome' <> 'landed' then raise exception 'demo: a % set did not land: %', p_entries -> 0 ->> 'type', r; end if;
  if jsonb_path_exists(coalesce(r -> 'findings', '[]'), '$[*] ? (@.level == "flag")') then
    raise exception 'demo: a % set landed flagged: %', p_entries -> 0 ->> 'type', r -> 'findings';
  end if;
  return r;
end $$;
create or replace function demo.w(p_user uuid, p_entries jsonb) returns jsonb language sql as $$ select demo.landed(demo.send(p_user, p_entries), p_entries) $$;
-- a set whose first entry takes a ward bed (admitted, moved): the bed named, else the next free by position, as the writer finds
-- them (a patient admitted in the app since keeps theirs, so a reload never stops on bed_taken); never p_not. Returns the bed
create or replace function demo.w_bed(p_user uuid, p_entries jsonb, p_bed int, p_not uuid default null) returns uuid language plpgsql as $$
declare b uuid; r jsonb;
begin
  for b in select x.id from core.places x where x.organization_id = demo.base('clinic') and x.department_id = demo.base('ward') and x.retired_at is null
              and x.id is distinct from p_not order by x.id = demo.bed(p_bed) desc, x.position loop
    r := demo.send(p_user, jsonb_set(p_entries, '{0,data,place_id}', to_jsonb(b)));
    continue when r ->> 'outcome' <> 'landed' and jsonb_path_exists(coalesce(r -> 'findings', '[]'), '$[*] ? (@.code == "bed_taken")');
    perform demo.landed(r, p_entries);
    return b;
  end loop;
  raise exception 'demo: no free bed on the ward';
end $$;

-- ── data ──
create or replace function demo.q(v numeric, unit text, ucum text) returns jsonb language sql immutable as $$
  select jsonb_build_object('value', v::text, 'unit', unit, 'ucum', ucum)
$$;
create or replace function demo.concept(p_system text, p_code text, p_text text) returns jsonb language sql immutable as $$
  select jsonb_build_object('text', p_text, 'codings', jsonb_build_array(jsonb_build_object('system', p_system, 'code', p_code, 'display', p_text)))
$$;
-- vitals by stable key; a baby's or a child's leave out what is not taken at that age
create or replace function demo.vitals(sys int, dia int, hr int, t numeric, spo2 int default null, rr int default null, wt numeric default null, ht numeric default null,
  glu int default null, head numeric default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'bp', case when sys is not null then jsonb_build_object('sys', demo.q(sys, 'mmHg', 'mm[Hg]'), 'dia', demo.q(dia, 'mmHg', 'mm[Hg]')) end,
    'hr', demo.q(hr, 'bpm', '/min'), 'temp', demo.q(t, '°C', 'Cel'), 'spo2', case when spo2 is not null then demo.q(spo2, '%', '%') end,
    'rr', case when rr is not null then demo.q(rr, '/min', '/min') end, 'weight', case when wt is not null then demo.q(wt, 'kg', 'kg') end,
    'height', case when ht is not null then demo.q(ht, 'cm', 'cm') end, 'glucose', case when glu is not null then demo.q(glu, 'mg/dL', 'mg/dL') end,
    'head', case when head is not null then demo.q(head, 'cm', 'cm') end))
$$;
create or replace function demo.problem(p_code text, p_text text, p_more jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('concept', demo.concept('icd10', p_code, p_text), 'category', 'problem-list-item', 'clinical_status', 'active', 'verification', 'confirmed') || p_more
$$;
create or replace function demo.med(p_drug text, p_atc text, p_dose numeric, p_unit text, p_timing text, p_more jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_build_object('basis', 'prescribed', 'drug', demo.concept('atc', p_atc, p_drug),
    'dosage', jsonb_build_object('dose', demo.q(p_dose, p_unit, case p_unit when 'mcg' then 'ug' else p_unit end), 'timing', jsonb_build_object('code', p_timing), 'route', 'oral'),
    'status', 'active') || p_more
$$;
create or replace function demo.note(p_kind text, p_text text) returns jsonb language sql immutable as $$
  select jsonb_build_object('kind', p_kind, 'text', p_text)
$$;
-- an analyte as the bench writes it: its value, the interpretation from the range, and the range copied in
create or replace function demo.analyte(k text, nm text, code text, v numeric, unit text, ucum text, lo numeric, hi numeric, clo numeric default null, chi numeric default null)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('key', k, 'name', nm, 'code', jsonb_build_object('system', 'loinc', 'code', code, 'display', nm), 'value', demo.q(v, unit, ucum),
    'interpretation', case when v < clo then 'LL' when v > chi then 'HH' when v < lo then 'L' when v > hi then 'H' else 'N' end,
    'range', jsonb_strip_nulls(jsonb_build_object('low', case when lo is not null then demo.q(lo, unit, ucum) end, 'high', case when hi is not null then demo.q(hi, unit, ucum) end)),
    'critical', case when clo is not null or chi is not null then jsonb_strip_nulls(jsonb_build_object('low', case when clo is not null then demo.q(clo, unit, ucum) end,
      'high', case when chi is not null then demo.q(chi, unit, ucum) end)) end))
$$;
-- the base's lab services, as an order names them and a result answers them (ranges by sex where the service has them)
create or replace function demo.service(p_code text) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', ('00000000-0000-0000-0000-00000000' || case p_code when 'cbc' then 'c001' when 'hba1c' then 'c002' when 'creat' then 'c003'
    when 'lipids' then 'c004' when 'lithium' then 'c006' end)::uuid, 'code', p_code,
    'name', case p_code when 'cbc' then 'Complete blood count' when 'hba1c' then 'HbA1c' when 'creat' then 'Creatinine' when 'lipids' then 'Lipid panel' when 'lithium' then 'Lithium level' end)
$$;
create or replace function demo.lab_order(p_code text, p_dept uuid, p_visit uuid, p_at timestamptz, p_id uuid, p_priority text default 'routine') returns jsonb language sql as $$
  select demo.e('order', p_dept, p_visit, p_at, jsonb_build_object('service', demo.service(p_code), 'department_id', demo.base('lab'), 'priority', p_priority, 'status', 'active'), p_id)
$$;
create or replace function demo.cbc(female boolean, hb numeric, wbc numeric, plt numeric, status text default 'final') returns jsonb language sql immutable as $$
  select jsonb_build_object('status', status, 'service', demo.service('cbc') - 'code', 'analytes', jsonb_build_array(
    demo.analyte('hb', 'Haemoglobin', '718-7', hb, 'g/dL', 'g/dL', case when female then 12 else 13.5 end, case when female then 15.5 else 17.5 end, 7, 20),
    demo.analyte('wbc', 'WBC', '6690-2', wbc, '10^9/L', '10*3/uL', 4, 11, 1, 30), demo.analyte('plt', 'Platelets', '777-3', plt, '10^9/L', '10*3/uL', 150, 400, 50)))
$$;
create or replace function demo.a1c(v numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'final', 'service', demo.service('hba1c') - 'code', 'analytes', jsonb_build_array(demo.analyte('hba1c', 'HbA1c', '4548-4', v, '%', '%', 4, 5.6)))
$$;
create or replace function demo.creat(v numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'final', 'service', demo.service('creat') - 'code', 'analytes', jsonb_build_array(demo.analyte('creat', 'Creatinine', '2160-0', v, 'mg/dL', 'mg/dL', 0.6, 1.2, null, 5)))
$$;
create or replace function demo.lipids(chol numeric, ldl numeric, hdl numeric, tg numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'final', 'service', demo.service('lipids') - 'code', 'analytes', jsonb_build_array(
    demo.analyte('chol', 'Total cholesterol', '2093-3', chol, 'mg/dL', 'mg/dL', null, 200), demo.analyte('ldl', 'LDL', '2089-1', ldl, 'mg/dL', 'mg/dL', null, 100),
    demo.analyte('hdl', 'HDL', '2085-9', hdl, 'mg/dL', 'mg/dL', 40, null), demo.analyte('tg', 'Triglycerides', '2571-8', tg, 'mg/dL', 'mg/dL', null, 150)))
$$;
-- the lab walks an order through its steps (collected, received) and answers it, each at its clinical time, never ahead of now (the
-- bench writes no visit); a null result leaves the sample collected. Returns the result's id
create or replace function demo.lab(p_order uuid, p_at timestamptz, p_result jsonb) returns uuid language plpgsql as $$
declare lab uuid := demo.base('lab'); st uuid := gen_random_uuid(); rs uuid := gen_random_uuid(); tech uuid := demo.base('tech');
begin
  perform demo.w(tech, jsonb_build_array(demo.e('step', lab, null, least(p_at, demo.now()), '{"status":"in-progress","step":"collected"}', st, p_order, 'answers')));
  if p_result is null then return null; end if;
  perform demo.w(tech, jsonb_build_array(demo.e('step', lab, null, demo.after(p_at, 10), '{"status":"in-progress","step":"received"}', null, st, 'changes')));
  perform demo.w(tech, jsonb_build_array(demo.e('result', lab, null, demo.after(p_at, 40), p_result, rs, p_order, 'answers')));
  return rs;
end $$;

-- ── a clinic day: the desk, the nurse, the doctor, the ward (each at a clinical time, minutes before the load) ──
-- the desk checks a patient in, p_min minutes ago; returns the visit
create or replace function demo.arrive(p_reason text, p_min int, p_to uuid default null, p_priority text default 'routine') returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  perform demo.w(demo.base('reception'), jsonb_build_array(demo.e('checked_in', demo.base('desk'), v, demo.ago(p_min),
    jsonb_build_object('department_id', coalesce(p_to, demo.base('gp')), 'reason', p_reason, 'priority', p_priority), v)));
  return v;
end $$;
-- the nurse's vitals while the patient waits
create or replace function demo.triage(p_visit uuid, p_min int, p_vitals jsonb) returns void language sql as $$
  select demo.w(demo.base('nurse'), jsonb_build_array(demo.e('vitals', demo.base('gp'), p_visit, demo.ago(p_min), p_vitals)))
$$;
-- the doctor calls the patient p_called minutes ago and signs what the consult found, with Done p_done minutes ago when given (one
-- set, as the chart's Done writes it); returns the call
create or replace function demo.consult(p_visit uuid, p_called int, p_entries jsonb, p_done int default null, p_wait boolean default false,
  p_dept uuid default null, p_doctor uuid default null) returns uuid language plpgsql as $$
declare c uuid := gen_random_uuid(); d uuid := coalesce(p_dept, demo.base('gp'));
begin
  perform demo.w(coalesce(p_doctor, demo.base('doctor')), jsonb_build_array(demo.move('called', d, p_visit, demo.ago(p_called), p_visit, '{}', c)) || p_entries
    || case when p_done is not null then jsonb_build_array(demo.move('done', d, p_visit, demo.ago(p_done), c, jsonb_build_object('wait', p_wait))) else '[]' end);
  return c;
end $$;
-- an entry in a GP visit, p_min minutes ago
create or replace function demo.gp(p_type text, p_visit uuid, p_min int, p_data jsonb, p_id uuid default null) returns jsonb language sql as $$
  select demo.e(p_type, demo.base('gp'), p_visit, demo.ago(p_min), p_data, p_id)
$$;
-- admitted to the ward from a visit, into a bed (the one named when free, demo.w_bed); returns the stay
create or replace function demo.admit(p_from uuid, p_bed int, p_min int, p_reason text) returns uuid language plpgsql as $$
declare s uuid := gen_random_uuid();
begin
  perform demo.w_bed(demo.base('doctor'), jsonb_build_array(demo.e('admitted', demo.base('ward'), s, demo.ago(p_min), jsonb_build_object('department_id', demo.base('ward'),
    'admit_source', 'outp', 'reason', p_reason), s, p_from, 'about')), p_bed);
  return s;
end $$;
revoke all on all functions in schema demo from public;
