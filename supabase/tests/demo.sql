-- spec §5.1 rule 9 · each pack brings its own demo: the load order (supabase/demo/load.sql: the kit, the base, each pack, the shared
-- journey) twice in a row, through the doors. A refusal or a flagged entry stops a load (demo.w), so reaching the checks means none;
-- the second load erases the first's patients and leaves the same day, with every time relative to the moment it loads. Then a
-- third with two of the app's patients in the demo's beds, and a fourth as if loaded just after midnight.
-- include: supabase/demo/load.sql
create temp table first_load as select (select count(*) from core.patients where organization_id = demo.base('clinic')) as patients,
  (select count(*) from core.entries where organization_id = demo.base('clinic')) as entries,
  (select count(*) from core.settings where organization_id = demo.base('clinic')) as settings,
  (select count(*) from core.holdings where organization_id = demo.base('clinic')) as holdings,
  (select count(*) from core.users where organization_id = demo.base('clinic')) as users;
-- include: supabase/demo/load.sql
select core.drain(100000) as drained;  -- the whole queue: a full demo load passes 500 rows

-- the shared journey's steps strictly in order, each at a time of its own: GP, Done, admitted, the round's last note, his
-- medicines for home sent, given, home (spec §5.1 rule 9)
create function pg_temp.journey_in_order() returns text language sql as $$
  with j as (select e.type, e.occurred_at, e.data from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('journey', 'patient:mahmoud')),
  steps as (
    select 1 n, 'checked in' step, min(occurred_at) at from j where type = 'checked_in'
    union all select 2, 'done', min(occurred_at) from j where type = 'done'
    union all select 3, 'admitted', min(occurred_at) from j where type = 'admitted'
    union all select 4, 'the round''s last note', max(occurred_at) from j where type = 'note'
    union all select 5, 'medicines for home sent', min(occurred_at) from j where type = 'order' and data -> 'service' ->> 'code' = 'dispense'
    union all select 6, 'given', min(occurred_at) from j where type = 'pharmacy.dispense'
    union all select 7, 'home', min(occurred_at) from j where type = 'discharged'),
  s as (select n, step, at, lag(at) over (order by n) before from steps)
  select t.ok(bool_and(at is not null and (before is null or at > before)) and max(at) <= demo.now(),
    'the journey in order, each step after the last: ' || string_agg(step || ' ' || coalesce(to_char(at at time zone 'Africa/Cairo', 'DD HH24:MI:SS'), 'missing'), ' → ' order by n)) from s
$$;
-- today's visits, the two base admissions this morning, Ward nursing's Tahany (admitted with no bed yet), Emergency's five arrivals and
-- Marwa's Medical Ward stay passed to Recovery (2026-10-10) are today's, however early
-- it loads; the morning's done count as done today
create function pg_temp.day_is_today() returns setof text language sql as $$
  select t.ok(count(*) = 70 and bool_and(day = (demo.now() at time zone 'Africa/Cairo')::date), count(*) || ' visits and stays of the day, each on today''s date')
    from base.presence where organization_id = demo.base('clinic') and checked_in_at > demo.now() - interval '1 day'
     and department_id is distinct from demo.id('obgyn', 'labour ward')
     and patient_id not in (select id from core.patients where full_name ilike 'walk in%')   -- the app's own (the bed check below)
     and department_id is distinct from demo.id('haemodialysis', 'department')   -- the Dialysis unit's sessions: its own block
  union all
  select t.ok(count(*) = 2, 'both base admissions this morning are today''s') from base.presence where organization_id = demo.base('clinic') and kind = 'stay'
     and patient_id in (demo.id('base', 'patient:ibrahim'), demo.id('base', 'patient:fathiya')) and day = (demo.now() at time zone 'Africa/Cairo')::date
  union all
  select t.ok(count(*) >= 10, count(*) || ' done today') from base.presence where organization_id = demo.base('clinic') and state = 'done'
     and kind = 'visit' and day = (demo.now() at time zone 'Africa/Cairo')::date
$$;

\echo '── loaded twice: no refusal, nothing flagged, the same day again'
select t.ok(not exists (select 1 from core.entries e, jsonb_array_elements(e.findings) f where e.organization_id = demo.base('clinic') and f ->> 'level' = 'flag'),
  'no entry of the demo is flagged');
select t.ok(not exists (select 1 from base.review where organization_id = demo.base('clinic') and why = 'flag'), 'nothing to review for a flag');
select t.ok(not exists (select 1 from core.stale where organization_id = demo.base('clinic')), 'no pack is stale');
select t.ok(f.patients = (select count(*) from core.patients where organization_id = demo.base('clinic')) and f.patients = 117, 'the same ' || f.patients || ' patients, once each')
  from first_load f;
select t.ok(f.entries = (select count(*) from core.entries where organization_id = demo.base('clinic')), 'the same ' || f.entries || ' entries') from first_load f;
select t.ok((select count(*) from core.erasures where organization_id = demo.base('clinic')) = f.patients, 'the reload erased the first load''s patients through the eraser')
  from first_load f;
select t.ok(f.settings = (select count(*) from core.settings where organization_id = demo.base('clinic'))
  and f.holdings = (select count(*) from core.holdings where organization_id = demo.base('clinic'))
  and f.users = (select count(*) from core.users where organization_id = demo.base('clinic')), 'the seeds run again add nothing: settings, holdings and people as they were')
  from first_load f;
\echo '── the demo''s departments are made from starter setups (§5.2), and a reload''s setups add nothing'
select t.ok((select jsonb_object_agg(d.name, core.setting_at(d.organization_id, 'department.setup', d.id) ->> 'setup') from core.departments d
    where d.organization_id = demo.base('clinic') and d.work <> 'outside')
  = '{"Front desk":"front_desk","General Practice":"clinic","Psychiatry":"clinic","Medical Ward":"ward","Laboratory":"laboratory","Pharmacy":"pharmacy.pharmacy","Main store":"pharmacy.store","Cashier":"billing.cashier","Radiology":"radiology.department","ECG room":"bookings.bench","Vaccination room":"vaccines.room","Diabetes clinic":"chroniccare.clinic","Family medicine":"familycare.medicine","Paediatrics clinic":"paeds.clinic","Children''s ward":"paeds.ward","ObGyn clinic":"obgyn.clinic","Cardiology clinic":"cardio.clinic","Echo room":"cardio.echo_room","Nephrology clinic":"nephrology.clinic","Chest clinic":"lungs.clinic","Haematology clinic":"haemato.clinic","Blood bank":"lis.blood_bank","Oncology clinic":"oncology.clinic","Chemotherapy day unit":"oncology.day_unit","Theatre":"theatre.department","Surgery clinic":"surgical.clinic","Pre-op clinic":"anaesthesia.preop_clinic","Recovery":"anaesthesia.recovery","Emergency":"casualty.er","ICU":"intensive.icu","CCU":"intensive.ccu","Dialysis unit":"haemodialysis.unit","Labour ward":"obgyn.labour_ward"}',
  'each department records the setup it was made from');
select t.ok((select count(*) from core.places where organization_id = demo.base('clinic') and department_id = demo.base('ward')
    and id = core.setup_id(demo.base('ward'), 'place', 'bed_' || substr(name, 5))) = 8, 'the ward''s eight beds are the Ward setup''s, ids from their keys');
select t.ok(not exists (select 1 from core.departments d, jsonb_array_elements(core.setup_parts(d.organization_id, core.setting_at(d.organization_id, 'department.setup', d.id) ->> 'setup', d.id)) x
    where d.organization_id = demo.base('clinic') and d.work <> 'outside' and x ->> 'state' in ('add', 'blocked')), 'nothing of any setup is missing after the reload');
select t.ok(core.department_uses(demo.base('clinic'), demo.id('pharmacy', 'department'), 'pharmacy')
  and (select count(*) from core.settings_at(demo.base('clinic'), 'service') s where s.owner_id = demo.id('pharmacy', 'department')) = 1,
  'the Pharmacy ticks its pack and has its one dispensing service, from its setup');
select t.ok((select count(distinct full_name) from core.patients where organization_id = demo.base('clinic')) = 117, 'every patient''s name is their own');
select t.ok(not exists (select 1 from core.patients p join core.users u on u.organization_id = p.organization_id and u.name ilike '%' || p.full_name || '%'
  where p.organization_id = demo.base('clinic')), 'no patient shares a name with the staff');
select t.ok(r = '[]'::jsonb, 'rebuild = live after the reload: ' || left(r::text, 300)) from core.rebuild_check() r;

\echo '── relative times: a working day whenever it loads'
-- (today's minutes are demo.ago's: as they are from 05:00, squeezed into the time since midnight before it)
select t.ok(min(checked_in_at) = demo.ago(40) and max(checked_in_at) = demo.ago(5),
  'waiting: the longest arrived 40 minutes ago, the latest 5: ' || max(now() - checked_in_at)) from base.presence
 where organization_id = demo.base('clinic') and state = 'waiting' and department_id = demo.base('gp');   -- the base's waiting room (a pack's clinic keeps its own day)
select t.ok(bool_and(checked_in_at > now() - interval '12 hours'), 'every open visit arrived within the last 12 hours (none lapses to left)') from base.presence
 where organization_id = demo.base('clinic') and kind = 'visit' and state not in ('done', 'left');
select t.ok(array_agg(distinct state order by state) @> array['back', 'called', 'done', 'pending', 'waiting'], 'the queue has every band: ' || array_agg(distinct state order by state)::text)
  from base.presence where organization_id = demo.base('clinic') and department_id = demo.base('gp');
select t.ok((select called_at from base.presence where organization_id = demo.base('clinic') and state = 'called' and department_id = demo.base('gp')) = demo.ago(8), 'in consult for 8 minutes');
select t.ok(count(*) = 7 and bool_and(checked_in_at between now() - interval '3 days' and now()), count(*) || ' admitted on the Medical Ward (two with no bed yet), all in the last three days')
  from base.presence where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.base('ward');
select t.ok(count(*) = 5 and bool_and(checked_in_at between now() - interval '3 days' and now()), count(*) || ' on the Children''s ward, admitted in the last three days')
  from base.presence where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.id('paeds', 'ward');
select t.ok((select (now() at time zone 'Africa/Cairo')::date - day from base.presence where organization_id = demo.base('clinic') and kind = 'stay'
  and patient_id = demo.id('base', 'patient:nadia') and state = 'admitted') = 2, 'Nadia was admitted two days ago (day 3 today)');
select t.ok(max(e.occurred_at) <= clock_timestamp() and min(e.occurred_at) >= now() - interval '11 years', 'every clinical time within the last 11 years (a child''s doses from birth, a chronic patient''s years, a method in place for ten years), none ahead')
  from core.entries e where e.organization_id = demo.base('clinic');
select t.ok(bool_and(p.birth_date between current_date - interval '90 years' and current_date) and bool_and(p.birth_date is not null), 'birth dates relative to today')
  from core.patients p where p.organization_id = demo.base('clinic');
select pg_temp.day_is_today();
-- an order's times are clinical (§4.2): sent, answered and the result's time as written, so a result an hour ago reads an hour ago
select t.ok(o.answered_at = demo.after(demo.ago(100), 40) and o.ordered_at = demo.ago(144), 'Salma''s lipids: sent 144 minutes ago, back an hour ago')
  from base.orders o where o.organization_id = demo.base('clinic') and o.patient_id = demo.id('base', 'patient:salma') and o.service_code = 'lipids';
select t.ok(not exists (select 1 from base.orders o where o.organization_id = demo.base('clinic') and o.answered_at is distinct from
  (select min(f.occurred_at) from core.entries f where f.organization_id = o.organization_id and f.id = any (o.answers) and f.type = 'result')
  and o.to_department_id = demo.base('lab') and o.status = 'completed'), 'every lab order answered at its result''s clinical time (months-old results are not today''s)');
select t.ok(count(*) = 0, 'no months-old result in the lab''s last day') from base.orders o where o.organization_id = demo.base('clinic') and o.to_department_id = demo.base('lab')
   and o.answered_at >= now() - interval '24 hours' and o.patient_id = demo.id('base', 'patient:nadia') and o.ordered_at < demo.midnight() - interval '30 days';
select t.ok((select ordered_at from base.orders o where o.organization_id = demo.base('clinic') and o.patient_id = demo.id('pharmacy', 'patient:hamdy') and o.status = 'active')
  = demo.ago(47), 'Hamdy''s second prescription has waited 47 minutes to prepare');

\echo '── what the platform built shows'
select t.ok(array_agg(distinct x.code order by x.code) = array['dnr', 'fall_risk', 'isolation_hbv', 'isolation_hcv'], 'alerts: ' || array_agg(distinct x.code order by x.code)::text)
  from core.entries e, jsonb_to_recordset(e.data -> 'concept' -> 'codings') x(code text)
 where e.organization_id = demo.base('clinic') and e.type = 'alert' and e.data ->> 'status' = 'active';
select t.ok(count(*) = 3, 'three critical results waiting (the base''s, and two haemoglobins under 7 asking for blood)') from base.review where organization_id = demo.base('clinic') and critical;
select t.ok(count(*) = 6, 'six pregnant patients (the base''s, ObGyn''s four, and an echo for a murmur at 24 weeks)') from core.entries where organization_id = demo.base('clinic') and type = 'pregnancy' and (data ->> 'pregnant')::boolean
  and department_id is distinct from demo.id('obgyn', 'labour ward');
select t.ok(count(*) = 1, 'a breastfeeding patient') from core.entries where organization_id = demo.base('clinic') and type = 'breastfeeding' and (data ->> 'breastfeeding')::boolean;
select t.ok(count(*) = 1, 'a private note (Psychiatry)') from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'note' and e.department_id = demo.base('psychiatry');
select t.ok(core.setting_at(demo.base('clinic'), 'organization.header', demo.base('clinic')) ->> 'tax_number' = '512-338-907', 'printouts carry the clinic''s header (§3.13)');
select t.ok(core.setting_at(demo.base('clinic'), 'lis.large', demo.base('lab')) ->> 'labels' = 'printed'
  and not (core.setting_at(demo.base('clinic'), 'lis.large', demo.base('lab')) ->> 'scan_receive')::boolean, 'the Laboratory prints its sample labels at Collected; its other large-lab switches off');

\echo '── the packs'' fit: values for each patient''s age and sex'
create temp view aged as select e.*, p.gender, extract(year from age(e.occurred_at::date, p.birth_date)) as years, (e.occurred_at::date - p.birth_date) as days
  from core.entries e join core.patients p on p.organization_id = e.organization_id and p.id = e.patient_id where e.organization_id = demo.base('clinic');
select t.ok(bool_and(gender = 'female' and years between 10 and 55), 'pregnancy only for women 10 to 55') from aged where type = 'pregnancy';
select t.ok(bool_and(gender = 'female' and years between 12 and 55), 'breastfeeding only for women') from aged where type = 'breastfeeding';
select t.ok(bool_and(case when years < 1 then w between 2 and 12 and hr between 100 and 180 when years < 8 then w between 8 and 35 and hr between 70 and 150
                          when years >= 16 then w between 40 and 150 and hr between 45 and 130 else true end), 'weight and heart rate fit the age, babies and children too')
  from (select years, (data -> 'weight' ->> 'value')::numeric w, (data -> 'hr' ->> 'value')::numeric hr from aged where type = 'vitals' and data ? 'weight') v;
select t.ok(not exists (select 1 from aged where type = 'vitals' and years < 3 and data ? 'bp'), 'no blood pressure on a baby');
select t.ok(bool_and((a -> 'range' -> 'low' ->> 'value')::numeric = case when gender = 'female' then 12 else 13.5 end), 'haemoglobin ranges by sex')
  from aged, jsonb_array_elements(data -> 'analytes') a where type = 'result' and a ->> 'key' = 'hb' and data ->> 'status' = 'final';
select t.ok(bool_and(years >= 18 or department_id = demo.id('paeds', 'clinic')), 'adults'' medicines on adults only; a child''s from the Paediatrics clinic') from aged where type = 'medication';

\echo '── logins: a demo person for every built-in role, each with a login'
select t.ok(not exists (select 1 from core.roles r where r.organization_id is null and core.layer_on(demo.base('clinic'), r.layer)
  and not exists (select 1 from core.live_holdings(demo.base('clinic')) h join core.users u on u.organization_id = demo.base('clinic') and u.id = h.user_id
                  join auth.users a on a.id = u.login_id where h.role_id = r.id)), 'every built-in role of the clinic''s layers is held by a demo person with a login');
select t.ok(count(*) = count(distinct name), 'each person''s name is unique') from core.users where organization_id = demo.base('clinic');

\echo '── pharmacy''s own patients; the shared journey'
select t.ok(bool_and(p.id in (demo.id('pharmacy', 'patient:samia'), demo.id('pharmacy', 'patient:hamdy'), demo.id('pharmacy', 'patient:mona'), demo.id('journey', 'patient:mahmoud'))),
  'pharmacy writes only on its own patients and the journey''s') from core.entries e join core.patients p on p.id = e.patient_id
 where e.organization_id = demo.base('clinic') and e.type like 'pharmacy.%';
select t.ok(array_agg(o.last_at order by o.last_at) = array[demo.ago(55)], 'prepared: one 55 minutes ago (late)')
  from base.orders o where o.organization_id = demo.base('clinic') and o.to_department_id = demo.id('pharmacy', 'department') and o.step_key = 'prepared' and o.status = 'in-progress';
select t.ok(q.owed = '30 tablets' and q.status = 'owed', 'Hamdy''s metformin: one box given, 30 tablets owed') from pharmacy.queue q
 where q.organization_id = demo.base('clinic') and q.patient_id = demo.id('pharmacy', 'patient:hamdy') and q.drug = 'Metformin';
select t.ok(q.warnings @> '[{"code":"allergy_clash","confirmed":true}]', 'Samia''s Augmentin: the allergy the doctor signed over reaches the pharmacy') from pharmacy.queue q
 where q.organization_id = demo.base('clinic') and q.patient_id = demo.id('pharmacy', 'patient:samia') and q.drug = 'Augmentin';
select t.ok((select (data ->> 'minutes')::int from core.settings where key = 'pharmacy.late_after' and owner_id = demo.id('pharmacy', 'department')) = 30, 'late after 30 minutes there');
select t.ok(count(*) filter (where status = 'completed') = 2 and count(*) filter (where status = 'active') = 2, 'two given, two still to give')
  from base.orders where organization_id = demo.base('clinic') and to_department_id = demo.id('pharmacy', 'department');
select pg_temp.journey_in_order();
select t.ok(exists (select 1 from base.orders o where o.organization_id = demo.base('clinic') and o.patient_id = demo.id('journey', 'patient:mahmoud')
  and o.to_department_id = demo.base('gp') and o.status = 'active' and (select (data ->> 'due')::timestamptz from core.entries where id = o.latest_entry) > now() + interval '6 days'),
  'a follow-up booked at the clinic in a week');
select t.ok((select state from base.presence where organization_id = demo.base('clinic') and patient_id = demo.id('journey', 'patient:mahmoud') and kind = 'stay') = 'discharged',
  'he went home; his bed is free');

\echo '── Ward nursing''s own patients (§5.6): NEWS2 with the obs on the Medical Ward'
select t.ok(core.department_uses(demo.base('clinic'), demo.base('ward'), 'bedside'), 'the Medical Ward uses Ward nursing');
select t.ok(count(*) = 10 and bool_and(e.patient_id in (demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim'), demo.id('bedside', 'patient:tahany'))),
  count(*) || ' NEWS2 entries, all on Ward nursing''s own patients (Samira, Abdelmoneim and Tahany)')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'score' and e.data ->> 'score' like 'bedside.%';
select t.ok(array_agg((e.data ->> 'total')::int order by e.occurred_at) = array[2, 2, 3, 4, 6] and bool_and(e.data ->> 'score' = 'bedside.news2'),
  'Samira''s NEWS2 on scale 1: ' || array_agg(e.data ->> 'total' order by e.occurred_at)::text)
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'score' and e.patient_id = demo.id('bedside', 'patient:samira');
select t.ok(array_agg((e.data ->> 'total')::int order by e.occurred_at) = array[8, 5, 3, 3] and bool_and(e.data ->> 'score' = 'bedside.news2_s2'),
  'Abdelmoneim''s NEWS2 on scale 2: ' || array_agg(e.data ->> 'total' order by e.occurred_at)::text)
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'score' and e.patient_id = demo.id('bedside', 'patient:abdelmoneim');
select t.ok(not exists (select 1 from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'score' and e.data ->> 'score' like 'bedside.%'
  and not exists (select 1 from core.entries v where v.organization_id = e.organization_id and v.set_id = e.set_id and v.type = 'vitals')),
  'every NEWS2 is signed with the vitals in the same set');
select t.ok(count(*) = 10 and bool_and(e.data -> 'inputs' ->> 'consciousness' = v.data ->> 'consciousness' and e.data -> 'inputs' ->> 'oxygen' = v.data -> 'oxygen' ->> 'on'),
  'every NEWS2''s two answers are its vitals'' own: ' || count(*) || ' sets')
  from core.entries e join core.entries v on v.organization_id = e.organization_id and v.set_id = e.set_id and v.type = 'vitals'
 where e.organization_id = demo.base('clinic') and e.type = 'score' and e.data ->> 'score' like 'bedside.%';
select t.ok(count(*) = 4 and bool_and(v.data -> 'oxygen' -> 'flow' ->> 'ucum' = 'L/min' and v.data -> 'oxygen' ->> 'on' = 'oxygen'),
  'Abdelmoneim''s oxygen: its flow in L/min (UCUM) in every set: ' || count(*))
  from core.entries v where v.organization_id = demo.base('clinic') and v.type = 'vitals' and v.patient_id = demo.id('bedside', 'patient:abdelmoneim');
select t.ok(exists (select 1 from base.values x where x.organization_id = demo.base('clinic') and x.patient_id = demo.id('bedside', 'patient:abdelmoneim')
  and x.key = 'oxygen.flow' and x.code = 'loinc:3151-8'), 'his flow is in the values, LOINC 3151-8');
select t.ok(count(*) = 1 and bool_and(p.place_id is null and p.has_vitals), 'Tahany is admitted with no bed yet; her first obs are in (W1)') from base.presence p
 where p.organization_id = demo.base('clinic') and p.patient_id = demo.id('bedside', 'patient:tahany') and p.kind = 'stay' and p.state = 'admitted';

\echo '── Ward nursing''s drug round (§5.6, piece 3): Nour''s doses, one late, one not given; a first dose waiting; a medicine with no times; one not prescribed in the stay; the base''s admission doses'
select t.ok(core.setting_at(demo.base('clinic'), 'department.screens', demo.base('ward')) = '{"screens":["base.beds","bedside.round","bedside.obs","bedside.handover"],"opens":"base.beds"}'::jsonb,
  'the Medical Ward''s line: Beds, the Drug round, Obs due and Handover');
select t.ok(count(*) >= 15 and bool_and(e.author_id = demo.id('bedside', 'nurse')) and bool_and(e.patient_id in (demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim'))),
  count(*) || ' doses on the round, all by Nour, all on Samira or Abdelmoneim')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'bedside.dose';
select t.ok(count(*) = 1 and bool_and(e.patient_id = demo.id('bedside', 'patient:abdelmoneim') and e.data -> 'bedside' ->> 'not_given' = 'vomiting' and e.data ->> 'reason' = 'Vomiting'
  and (e.data -> 'bedside' ->> 'due')::timestamptz = demo.midnight() - interval '1 day' + interval '8 hours'),
  'one dose not given: Abdelmoneim''s, yesterday at 08:00, vomiting')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'bedside.dose' and e.data ->> 'status' = 'not-done';
create function pg_temp.stay_of(p_patient uuid) returns text language sql stable as $$
  select x.item::text from base.presence x where x.organization_id = demo.base('clinic') and x.patient_id = p_patient and x.kind = 'stay' and x.state = 'admitted' limit 1
$$;
select demo.as(demo.id('bedside', 'nurse'));
create temp table ward_board as select public.pack_op(jsonb_build_object('op', 'bedside.board', 'department_id', demo.base('ward'), 'purpose', 'TREAT',
  'args', jsonb_build_object('now', demo.now()))) b;
create temp table ward_round as select public.pack_op(jsonb_build_object('op', 'bedside.round', 'department_id', demo.base('ward'), 'purpose', 'TREAT',
  'args', jsonb_build_object('now', demo.now()))) r;
select t.ok(coalesce((b -> 'doses' -> pg_temp.stay_of(demo.id('bedside', 'patient:samira')) ->> 'late')::int, 0) = 1
  and coalesce((b -> 'doses' -> pg_temp.stay_of(demo.id('bedside', 'patient:abdelmoneim')) ->> 'late')::int, 0) = 0
  and coalesce((b -> 'doses' -> pg_temp.stay_of(demo.id('bedside', 'patient:tahany')) ->> 'unset')::int, 0) = 1
  and coalesce((b -> 'doses' -> pg_temp.stay_of(demo.id('bedside', 'patient:tahany')) ->> 'late')::int, 0) = 0
  and coalesce((b -> 'doses' -> pg_temp.stay_of(pg_temp.pid('ibrahim')) ->> 'late')::int, 0) = 0
  and coalesce((b -> 'doses' -> pg_temp.stay_of(pg_temp.pid('fathiya')) ->> 'late')::int, 0) = 0
  and (select coalesce(sum((v ->> 'late')::int), 0) from jsonb_each(b -> 'doses') d(k, v)) = 1,
  'the board: Samira 1 late, Abdelmoneim none, Tahany times not set, the base''s ward patients none late, no other dose late on the ward: ' || (b -> 'doses')::text) from ward_board;
select t.ok(exists (select 1 from jsonb_array_elements(r -> 'stays') s, jsonb_array_elements(s -> 'medicines') m, jsonb_array_elements(m -> 'slots') x
    where m ->> 'medication' = demo.id('bedside', 'med:tahany ceftriaxone')::text and (x ->> 'first')::boolean and x ->> 'state' = 'due')
  and exists (select 1 from jsonb_array_elements(r -> 'stays') s, jsonb_array_elements(s -> 'medicines') m
    where m ->> 'medication' = demo.id('bedside', 'med:tahany insulin')::text and (m ->> 'unset')::boolean)
  and exists (select 1 from jsonb_array_elements(r -> 'stays') s, jsonb_array_elements(s -> 'medicines') m
    where s ->> 'patient_id' = demo.id('base', 'patient:nadia')::text and m -> 'drug' ->> 'text' = 'Metformin' and (m ->> 'elsewhere')::boolean and m -> 'slots' = '[]'::jsonb),
  'the round: Tahany''s ceftriaxone a first dose due, her insulin times not set, Nadia''s metformin not prescribed in her stay') from ward_round;
select t.ok((select count(*) from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'given' and e.patient_id = pg_temp.pid('ibrahim')
    and e.data ->> 'medication' in (select m.item::text from core.entries m where m.organization_id = e.organization_id and m.type = 'medication' and m.patient_id = e.patient_id)) = 2
  and (select count(*) from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'given' and e.patient_id = pg_temp.pid('fathiya')
    and e.data ->> 'medication' in (select m.item::text from core.entries m where m.organization_id = e.organization_id and m.type = 'medication' and m.patient_id = e.patient_id)) = 1,
  'the base''s admission doses: Ibrahim 2, Fathiya 1');
\echo '── Emergency''s own patients (§5.6): arrived, triaged with a time to the doctor, one not triaged yet, one boarding, one for home'
select t.ok(core.department_uses(demo.base('clinic'), demo.id('casualty', 'department'), 'casualty') and core.department_uses(demo.base('clinic'), demo.id('casualty', 'department'), 'bedside')
  and core.setting_at(demo.base('clinic'), 'department.packs', demo.id('casualty', 'department')) -> 'packs' = '["casualty","bedside"]'::jsonb,
  'Emergency uses its pack, then Ward nursing, in that order');
select t.ok(core.setting_at(demo.base('clinic'), 'department.encounter_class', demo.id('casualty', 'department')) ->> 'class' = 'EMER'
  and (select count(*) filter (where label = 'bed') = 2 and count(*) filter (where label = 'cubicle') = 6 and count(*) = 8 from core.places
       where organization_id = demo.base('clinic') and department_id = demo.id('casualty', 'department') and retired_at is null),
  'its stays are emergency encounters; two resus bays and six cubicles');
select t.ok(count(*) = 5 and count(*) filter (where place_id is null) = 2
  and bool_or(patient_id = demo.id('casualty', 'patient:karim') and place_id = core.setup_id(demo.id('casualty', 'department'), 'place', 'resus_2'))
  and bool_or(patient_id = demo.id('casualty', 'patient:salwa') and place_id = core.setup_id(demo.id('casualty', 'department'), 'place', 'cubicle_1'))
  and bool_or(patient_id = demo.id('casualty', 'patient:mostafa') and place_id = core.setup_id(demo.id('casualty', 'department'), 'place', 'cubicle_3')),
  'five admitted in Emergency: Karim in Resus 2, Salwa in Cubicle 1, Mostafa in Cubicle 3, two on the chairs') from base.presence
 where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.id('casualty', 'department');
create temp table er_now as
  select p.patient_id, p.urgent, (select (e.data -> 'casualty' ->> 'level')::int from core.entries e where e.organization_id = p.organization_id and e.visit_id = p.item
     and e.type = 'casualty.triage' order by e.occurred_at desc limit 1) lvl
  from base.presence p where p.organization_id = demo.base('clinic') and p.kind = 'stay' and p.state = 'admitted' and p.department_id = demo.id('casualty', 'department');
select t.ok((select lvl = 2 and urgent from er_now where patient_id = demo.id('casualty', 'patient:karim'))
  and (select lvl = 4 and not urgent from er_now where patient_id = demo.id('casualty', 'patient:hany'))
  and (select lvl is null from er_now where patient_id = demo.id('casualty', 'patient:nadia')),
  'the level now: Karim 2 and urgent, Hany 4 and not urgent, Nadia not triaged');
select t.ok(count(*) = 4 and bool_and(e.patient_id in (demo.id('casualty', 'patient:karim'), demo.id('casualty', 'patient:hany'),
    demo.id('casualty', 'patient:salwa'), demo.id('casualty', 'patient:mostafa'))
  and e.author_id = demo.id('casualty', 'triage nurse')
  and e.visit_id in (select item from base.presence p where p.organization_id = e.organization_id and p.department_id = demo.id('casualty', 'department'))
  and exists (select 1 from core.entries v where v.organization_id = e.organization_id and v.set_id = e.set_id and v.type = 'vitals')
  and e.data -> 'casualty' ->> 'scale' = 'ats' and e.data -> 'casualty' ->> 'scale_version' = (select version from core.systems where key = 'casualty.ats')
  and e.data -> 'casualty' ->> 'scale_version' = 'P06'),
  'each triage: on Karim, Hany, Salwa or Mostafa, by the triage nurse, in an Emergency stay, signed with vitals, on the Australasian scale P06')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'casualty.triage';
select t.ok(e.data -> 'casualty' -> 'suggested' = '{"level":2,"signs":["rr","severe_pain"]}'::jsonb and e.data -> 'casualty' ->> 'arrival_ref' = '4471',
  'Karim''s triage: suggested 2 from RR 28 and severe pain; ambulance call 4471')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'casualty.triage' and e.patient_id = demo.id('casualty', 'patient:karim');
select t.ok(coalesce((select count(*) = 1 and bool_and(not (e.data -> 'casualty' ? 'suggested') and (e.data -> 'casualty' ->> 'level')::int = 3)
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'casualty.triage' and e.patient_id = demo.id('casualty', 'patient:mostafa')), false),
  'Mostafa''s triage: level 3, nothing suggested (he is under 16)');
select t.ok(coalesce((select count(*) = 1 and bool_and(e.data -> 'casualty' -> 'suggested' = '{"level":2,"signs":["spo2"]}'::jsonb and (e.data -> 'casualty' ->> 'level')::int = 3
  and e.data -> 'casualty' ->> 'why' like 'known COPD%')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'casualty.triage' and e.patient_id = demo.id('casualty', 'patient:salwa')), false),
  'Salwa''s triage: suggested 2 from SpO₂ 88, level 3, and why');
select t.ok(coalesce((select e.data -> 'casualty' -> 'police' = '{"case":true,"why":"road_accident"}'::jsonb
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'casualty.triage' and e.patient_id = demo.id('casualty', 'patient:karim')
 order by e.occurred_at desc limit 1), false), 'Karim''s latest triage: a police case, a road accident');
select current_setting('request.jwt.claim.sub', true) as was_sub \gset
select demo.as(demo.id('casualty', 'doctor'));
create temp table er_board as select public.pack_op(jsonb_build_object('op', 'casualty.board', 'department_id', demo.id('casualty', 'department'),
  'args', '{}'::jsonb, 'purpose', 'TREAT')) b;
select t.ok((b -> 'stays' -> (k.item::text) -> 'triage' ->> 'level')::int = 2 and (b -> 'stays' -> (k.item::text) -> 'triage' ->> 'at')::timestamptz = demo.ago(12)
  and not (b -> 'stays' -> (k.item::text) ? 'seen_at')
  and (b -> 'stays' -> (h.item::text) -> 'triage' ->> 'level')::int = 4 and (b -> 'stays' -> (h.item::text) -> 'triage' ->> 'at')::timestamptz = demo.ago(72)
  and b -> 'stays' -> (n.item::text) = '{}'::jsonb
  and b -> 'patient_ids' @> jsonb_build_array(demo.id('casualty', 'patient:karim'), demo.id('casualty', 'patient:hany'), demo.id('casualty', 'patient:nadia')),
  'the board, as Dr. Tamer: Karim 2 twelve minutes ago, no doctor yet; Hany 4 seventy-two minutes ago; Nadia not triaged')
  from er_board, base.presence k, base.presence h, base.presence n
 where k.organization_id = demo.base('clinic') and k.kind = 'stay' and k.state = 'admitted' and k.patient_id = demo.id('casualty', 'patient:karim')
   and h.organization_id = demo.base('clinic') and h.kind = 'stay' and h.state = 'admitted' and h.patient_id = demo.id('casualty', 'patient:hany')
   and n.organization_id = demo.base('clinic') and n.kind = 'stay' and n.state = 'admitted' and n.patient_id = demo.id('casualty', 'patient:nadia');
select t.ok(coalesce((select (b -> 'stays' -> (sa.item::text) ->> 'seen_at')::timestamptz = demo.ago(103)
  and b -> 'stays' -> (sa.item::text) -> 'decided' ->> 'to' = 'ward' and b -> 'stays' -> (sa.item::text) -> 'decided' ->> 'department_id' = demo.base('ward')::text
  and (b -> 'stays' -> (sa.item::text) -> 'decided' ->> 'at')::timestamptz = demo.ago(40)
  and (b -> 'stays' -> (m.item::text) ->> 'seen_at')::timestamptz = demo.ago(280) and b -> 'stays' -> (m.item::text) -> 'decided' ->> 'to' = 'home'
  and (b -> 'stays' -> (k.item::text) ->> 'police')::boolean and not (b -> 'stays' -> (k.item::text) ? 'decided')
  from er_board, base.presence sa, base.presence m, base.presence k
 where sa.organization_id = demo.base('clinic') and sa.kind = 'stay' and sa.state = 'admitted' and sa.patient_id = demo.id('casualty', 'patient:salwa')
   and m.organization_id = demo.base('clinic') and m.kind = 'stay' and m.state = 'admitted' and m.patient_id = demo.id('casualty', 'patient:mostafa')
   and k.organization_id = demo.base('clinic') and k.kind = 'stay' and k.state = 'admitted' and k.patient_id = demo.id('casualty', 'patient:karim')), false),
  'the board, as Dr. Tamer: Salwa seen 103 minutes ago, decided for the Medical Ward forty minutes ago; Mostafa seen, decided for home; Karim a police case, undecided');
select set_config('request.jwt.claim.sub', :'was_sub', true) is not null as back;
select t.ok(count(*) = 2 and bool_and(e.author_id = demo.id('casualty', 'doctor') and e.refers_to is null
  and e.visit_id in (select item from base.presence p where p.organization_id = e.organization_id and p.kind = 'stay' and p.state = 'admitted'
                      and p.department_id = demo.id('casualty', 'department'))),
  'each decision is Dr. Tamer''s, in an Emergency stay still admitted')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'casualty.disposition';
select t.ok(not exists (select 1 from base.presence p where p.organization_id = demo.base('clinic') and p.department_id = demo.id('casualty', 'department') and p.state <> 'admitted')
  and not exists (select 1 from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'admitted' and e.relation = 'about'
                   and e.department_id = demo.id('casualty', 'department')),
  'no Emergency stay is discharged in the demo, and none is passed to another department');
\echo '── Critical care''s own patients (§5.6): the ICU''s hourly chart'
select t.ok(core.setting_at(demo.base('clinic'), 'department.packs', demo.id('intensive', 'icu')) -> 'packs' = '["intensive", "bedside"]'::jsonb,
  'the ICU uses Critical care, then Ward nursing (the clinic''s choice)');
\echo '── the Children''s ward, the day unit and Recovery use Ward nursing too (§5.8 Q27, Q40, Q48; 2026-10-10)'
select t.ok(core.setting_at(demo.base('clinic'), 'department.packs', demo.id('paeds', 'ward')) -> 'packs' = '["bedside", "paeds"]'::jsonb
  and core.setting_at(demo.base('clinic'), 'department.screens', demo.id('paeds', 'ward')) -> 'screens' = '["base.beds", "bedside.round", "bedside.handover"]'::jsonb,
  'the Children''s ward: Ward nursing, then paediatrics; Beds · Drug round · Handover');
select t.ok(core.setting_at(demo.base('clinic'), 'department.packs', demo.id('oncology', 'day_unit')) -> 'packs' = '["oncology", "bedside"]'::jsonb
  and core.setting_at(demo.base('clinic'), 'department.screens', demo.id('oncology', 'day_unit')) -> 'screens' = '["base.beds", "bedside.round", "bedside.handover"]'::jsonb,
  'the Chemotherapy day unit: oncology, then Ward nursing; Chairs · Drug round · Handover');
select t.ok(core.setting_at(demo.base('clinic'), 'department.packs', demo.id('anaesthesia', 'recovery')) -> 'packs' = '["anaesthesia", "bedside"]'::jsonb
  and core.setting_at(demo.base('clinic'), 'department.screens', demo.id('anaesthesia', 'recovery')) -> 'screens' = '["base.beds"]'::jsonb,
  'Recovery: anaesthesia, then Ward nursing; its line Bays as drawn');
select t.ok(count(*) = 1 and bool_and(w.department_id = demo.base('ward') and w.state = 'discharged' and w.place_id is null),
  'Marwa came up to Recovery from the Medical Ward, her stay passed on (beds Q3): what /back presets')
  from base.presence r join base.presence w on w.organization_id = r.organization_id and w.item = r.came_from
 where r.organization_id = demo.base('clinic') and r.patient_id = demo.id('anaesthesia', 'patient:marwa') and r.department_id = demo.id('anaesthesia', 'recovery') and r.state = 'admitted';
select t.ok(count(*) = 2 and count(distinct place_id) = 2 and bool_and(place_id is not null) and bool_and(checked_in_at between now() - interval '3 days' and now()),
  count(*) || ' stays admitted in the ICU, in two of its beds, in the last three days')
  from base.presence where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.id('intensive', 'icu');
select t.ok(count(*) > 0 and bool_and(e.patient_id in (demo.id('intensive', 'patient:nabil'), demo.id('intensive', 'patient:samy'), demo.id('intensive', 'patient:maher'))),
  count(*) || ' entries of Critical care''s types, all on its own patients (Nabil, Samy or Maher)')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type like 'intensive.%';
select t.ok(array_agg((e.data -> 'dose' ->> 'value')::numeric order by e.item_version) = array[0.2, 0.25, 0.2, 0.15]::numeric[],
  'Nabil''s noradrenaline: ' || array_agg(e.data -> 'dose' ->> 'value' order by e.item_version)::text)
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'intensive.infusion' and e.patient_id = demo.id('intensive', 'patient:nabil')
   and e.data ->> 'key' = 'noradrenaline';
select t.ok(count(*) = 1 and bool_and(e.data ->> 'status' = 'in-progress'), 'Nabil is on the ventilator: one invasive ventilation, in progress')
  from core.entries e, jsonb_to_recordset(e.data -> 'concept' -> 'codings') c(system text, code text)
 where e.organization_id = demo.base('clinic') and e.type = 'procedure' and e.patient_id = demo.id('intensive', 'patient:nabil')
   and c.system = 'local.procedure' and c.code = 'invasive_ventilation';
select t.ok(array_agg((e.data -> 'fio2' ->> 'value')::int order by e.item_version) = array[80, 60, 50, 45] and count(distinct e.item) = 1,
  'his ventilator''s settings, one item in four versions: FiO2 ' || array_agg(e.data -> 'fio2' ->> 'value' order by e.item_version)::text)
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'intensive.vent' and e.patient_id = demo.id('intensive', 'patient:nabil');
select t.ok(count(*) = 12 and bool_and(extract(minute from at) = 0 and extract(second from at) = 0), count(*) || ' hourly sets by the ICU''s nurse, each at a whole hour')
  from (select e.set_id, min(e.occurred_at) at from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'vitals'
          and e.patient_id in (demo.id('intensive', 'patient:nabil'), demo.id('intensive', 'patient:samy')) and e.author_id = demo.id('intensive', 'nurse')
          and e.occurred_at > demo.now() - interval '7 hours' group by e.set_id) x;
select demo.as(demo.id('intensive', 'nurse'));
create temp table icu_board as select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', demo.id('intensive', 'icu'), 'args', '{}'::jsonb,
  'purpose', 'TREAT')) b;
create temp table icu_stays as select p.patient_id, p.item from base.presence p where p.organization_id = demo.base('clinic') and p.kind = 'stay' and p.state = 'admitted'
  and p.department_id = demo.id('intensive', 'icu');
select t.ok(w -> 'airway' ->> 'code' = 'invasive_ventilation' and w -> 'airway' ->> 'status' = 'in-progress'
  and (select jsonb_object_agg(i ->> 'key', (i ->> 'dose')::numeric) from jsonb_array_elements(w -> 'infusions') i) = '{"noradrenaline":0.15,"propofol":100,"fentanyl":75}'::jsonb
  and (w -> 'map' ->> 'value')::numeric = 67 and (w -> 'map' ->> 'measured')::boolean,
  'the board, Nabil: ventilated, noradrenaline 0.15, propofol 100, fentanyl 75, MAP 67 typed')
  from icu_board, icu_stays s, lateral (select b -> 'stays' -> s.item::text w) x where s.patient_id = demo.id('intensive', 'patient:nabil');
select t.ok(w -> 'oxygen' ->> 'on' = 'air' and jsonb_array_length(w -> 'infusions') = 1 and w -> 'infusions' -> 0 ->> 'key' = 'insulin'
  and (w -> 'infusions' -> 0 ->> 'dose')::numeric = 4 and (w -> 'urine' ->> 'hours')::int between 5 and 6 and (w -> 'urine' ->> 'kg')::numeric = 72
  and (w -> 'urine' ->> 'ml')::numeric / (w -> 'urine' ->> 'hours')::numeric / (w -> 'urine' ->> 'kg')::numeric < 0.5,
  'the board, Samy: on air, insulin 4, urine under 0.5 mL/kg/h: ' || (w -> 'urine')::text)
  from icu_board, icu_stays s, lateral (select b -> 'stays' -> s.item::text w) x where s.patient_id = demo.id('intensive', 'patient:samy');
select t.ok(b -> 'patient_ids' ? demo.id('intensive', 'patient:nabil')::text and b -> 'patient_ids' ? demo.id('intensive', 'patient:samy')::text,
  'the board names both for the read log') from icu_board;
select t.ok(array_agg((e.data ->> 'total')::int order by e.occurred_at) = array[13, 12, 11],
  'Nabil''s SOFAs in his stay: ' || array_agg(e.data ->> 'total' order by e.occurred_at)::text)
  from core.entries e, icu_stays s where e.organization_id = demo.base('clinic') and e.type = 'score' and e.data ->> 'score' = 'intensive.sofa'
   and s.patient_id = demo.id('intensive', 'patient:nabil') and e.patient_id = s.patient_id and e.visit_id = s.item;
select t.ok(g.set_id = f.set_id
  and (select array_agg(l ->> 'item' order by l ->> 'item') from jsonb_array_elements(g.data -> 'lines') l)
    = (select array_agg(p.item::text order by p.item::text) from core.entries p, jsonb_to_recordset(p.data -> 'concept' -> 'codings') c(system text, code text)
        where p.organization_id = demo.base('clinic') and p.type = 'procedure' and p.patient_id = g.patient_id and p.visit_id = g.visit_id
          and p.data ->> 'status' = 'in-progress' and not exists (select 1 from core.entries y where y.organization_id = p.organization_id
            and y.item = p.item and y.item_version > p.item_version)
          and c.system = 'local.procedure' and c.code in ('central_line', 'arterial_line', 'urinary_catheter')),
  'his latest SOFA and his daily goals in one set; the goals decide on his three lines, all in progress')
  from core.entries g, lateral (select e.set_id from core.entries e where e.organization_id = g.organization_id and e.type = 'score' and e.data ->> 'score' = 'intensive.sofa'
    and e.patient_id = g.patient_id order by e.occurred_at desc limit 1) f
 where g.organization_id = demo.base('clinic') and g.type = 'intensive.goals' and g.patient_id = demo.id('intensive', 'patient:nabil');
select t.ok(not exists (select 1 from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'intensive.goals' and e.patient_id = demo.id('intensive', 'patient:samy')),
  'Samy has no daily goals yet');
select demo.as(demo.id('intensive', 'doctor'));
create temp table icu_board2 as select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', demo.id('intensive', 'icu'), 'args', '{}'::jsonb,
  'purpose', 'TREAT')) b;
select t.ok((w -> 'sofa' ->> 'total')::int = 11 and (w ->> 'goals_at')::timestamptz >= case when demo.now() >= demo.midnight() + interval '8 hours'
    then demo.midnight() + interval '8 hours' else demo.midnight() - interval '16 hours' end,
  'the board as Dr. Hany, Nabil: SOFA 11, the goals signed this ICU day')
  from icu_board2, icu_stays s, lateral (select b -> 'stays' -> s.item::text w) x where s.patient_id = demo.id('intensive', 'patient:nabil');
select t.ok((w -> 'sofa' ->> 'total')::int = 4 and w -> 'goals_at' = 'null'::jsonb, 'the board as Dr. Hany, Samy: SOFA 4, no goals')
  from icu_board2, icu_stays s, lateral (select b -> 'stays' -> s.item::text w) x where s.patient_id = demo.id('intensive', 'patient:samy');

\echo '── Critical care''s CCU (§5.6, piece I3): Maher in a CCU bed, his reperfusion times, his hours with the cardiac rows'
select t.ok(core.setting_at(demo.base('clinic'), 'department.packs', demo.id('intensive', 'ccu')) -> 'packs' = '["intensive", "bedside"]'::jsonb,
  'the CCU uses Critical care, then Ward nursing (the clinic''s choice)');
select t.ok(count(*) = 1 and bool_and(place_id is not null) and bool_and(patient_id = demo.id('intensive', 'patient:maher'))
  and bool_and(checked_in_at between now() - interval '3 days' and now()), count(*) || ' stay admitted in the CCU, Maher''s, in a CCU bed, in the last three days')
  from base.presence where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.id('intensive', 'ccu');
create temp table ccu_stay as select p.patient_id, p.item, p.checked_in_at from base.presence p where p.organization_id = demo.base('clinic') and p.kind = 'stay'
  and p.state = 'admitted' and p.department_id = demo.id('intensive', 'ccu') and p.patient_id = demo.id('intensive', 'patient:maher');
create temp table ccu_hours as select e.set_id, min(e.occurred_at) at from core.entries e, ccu_stay s where e.organization_id = demo.base('clinic') and e.type = 'vitals'
  and e.patient_id = s.patient_id and e.visit_id = s.item and e.author_id = demo.id('intensive', 'nurse') and e.occurred_at > s.checked_in_at group by e.set_id;
select t.ok(count(*) between 0 and 4 and coalesce(bool_and(extract(minute from at) = 0 and extract(second from at) = 0), true),
  count(*) || ' of his hours charted by Mariam, each at a whole hour after his admission') from ccu_hours;
select t.ok((select count(*) from ccu_hours) = 0 or (
    (select e.data -> 'value' -> 'concept' -> 'codings' -> 0 ->> 'code' from core.entries e, ccu_stay s, jsonb_array_elements(e.data -> 'code' -> 'codings') c
      where e.organization_id = demo.base('clinic') and e.type = 'observation' and e.patient_id = s.patient_id and e.visit_id = s.item
        and c ->> 'system' = 'intensive.cardiac' and c ->> 'code' = 'rhythm' order by e.occurred_at desc limit 1) = 'af'
    and not exists (select 1 from core.entries e, jsonb_array_elements(e.findings) f where e.organization_id = demo.base('clinic')
      and e.patient_id = demo.id('intensive', 'patient:maher') and f ->> 'level' = 'flag')),
  'his latest rhythm is AF, and none of his entries is flagged (when an hour is charted)');
select t.ok(count(*) = 1 and bool_and(e.data ->> 'diagnosis' = 'stemi_anterior') and bool_and((e.data ->> 'needle_at')::timestamptz < s.checked_in_at),
  count(*) || ' reperfusion record in his stay: anterior STEMI, lysed before he came up')
  from core.entries e, ccu_stay s where e.organization_id = demo.base('clinic') and e.type = 'intensive.reperfusion' and e.patient_id = s.patient_id and e.visit_id = s.item;
select demo.as(demo.id('intensive', 'ccu doctor'));
select t.ok((select count(*) from ccu_hours) = 0 or w -> 'rhythm' ->> 'code' = 'af', 'the board as Dr. Tarek, Maher: rhythm AF: ' || coalesce((w -> 'rhythm')::text, 'none'))
  from ccu_stay s, lateral (select public.pack_op(jsonb_build_object('op', 'intensive.board', 'department_id', demo.id('intensive', 'ccu'), 'args', '{}'::jsonb,
    'purpose', 'TREAT')) -> 'stays' -> s.item::text w) x;
reset role;

\echo '── Dialysis''s own patients (§5.6): the unit, its standing schedule, three on dialysis, two due, one on the other days'
create temp view hd_day as select demo.id('haemodialysis', 'department') hd, (demo.now() at time zone 'Africa/Cairo')::date today,
  extract(dow from (demo.now() at time zone 'Africa/Cairo')::date)::int dow,
  case when extract(dow from (demo.now() at time zone 'Africa/Cairo')::date)::int in (0, 2, 4) then 'sun_tue_thu' else 'sat_mon_wed' end days,
  (demo.now() at time zone 'Africa/Cairo')::date - case when extract(dow from (demo.now() at time zone 'Africa/Cairo')::date)::int in (6, 0) then 3 else 2 end past;
select t.ok(core.department_uses(demo.base('clinic'), d.hd, 'haemodialysis') and core.setting_at(demo.base('clinic'), 'department.packs', d.hd) -> 'packs' = '["haemodialysis"]'
  and core.setting_at(demo.base('clinic'), 'department.encounter_class', d.hd) ->> 'class' = 'AMB'
  and (select count(*) filter (where p.label = 'chair') = 8 and count(*) = 8 from core.places p where p.organization_id = demo.base('clinic') and p.department_id = d.hd and p.retired_at is null),
  'the Dialysis unit ticks only its own pack, is outpatient, and has eight chairs') from hd_day d;
select t.ok(count(*) = 6 and count(*) filter (where s.days = (select days from hd_day) and s.patient_id <> demo.id('haemodialysis', 'patient:magdy')) = 5
  and count(distinct s.shift) filter (where s.patient_id <> demo.id('haemodialysis', 'patient:magdy')) = 1
  and bool_or(s.patient_id = demo.id('haemodialysis', 'patient:magdy') and s.days <> (select days from hd_day) and s.shift = 2
    and s.place_id = core.setup_id((select hd from hd_day), 'place', 'hbv_chair_8')),
  'six live slots: five on today''s pattern at one shift, Magdy on the other days in the HBV chair, shift 2')
  from haemodialysis.slots s where s.organization_id = demo.base('clinic') and s.department_id = (select hd from hd_day) and s.ends_on is null;
select t.ok(count(*) = case when (select dow from hd_day) = 5 then 5 else 0 end
  and coalesce(bool_and(m.to_on = (select today from hd_day) and m.from_on = (select today from hd_day) + 1 and m.undone_at is null), true),
  case when (select dow from hd_day) = 5 then 'a Friday: the five moved one-off from tomorrow to today' else 'no session moved' end)
  from haemodialysis.moves m where m.organization_id = demo.base('clinic') and m.department_id = (select hd from hd_day);
-- today's three: one session each, on dialysis, from the slots' shift; begun at or after its start (when loaded after 09:40)
create temp view hd_on as select p.patient_id, p.place_id, p.checked_in_at, p.day, p.item, e.data from base.presence p, hd_day d, core.entries e
 where p.organization_id = demo.base('clinic') and p.department_id = d.hd and p.kind = 'stay' and p.state = 'admitted'
   and e.organization_id = p.organization_id and e.visit_id = p.item and e.type = 'haemodialysis.session'
   and not exists (select 1 from core.entries y where y.organization_id = e.organization_id and y.item = e.item and y.item_version > e.item_version);   -- as it stands (Before changed it)
select t.ok(count(*) = 3 and count(distinct item) = 3 and bool_and(data ->> 'status' = 'in-progress' and (data -> 'haemodialysis' ->> 'hours')::numeric = 4
  and (data -> 'haemodialysis' ->> 'on')::date = (select today from hd_day)
  and (data -> 'haemodialysis' ->> 'shift')::int = (select min(s.shift) from haemodialysis.slots s where s.organization_id = demo.base('clinic') and s.patient_id = hd_on.patient_id))
  and bool_and((demo.ago(160) at time zone 'Africa/Cairo')::time < time '07:00'
    or (checked_in_at at time zone 'Africa/Cairo')::time >= (array[time '07:00', time '11:30', time '16:00'])[(data -> 'haemodialysis' ->> 'shift')::int]),
  'three on dialysis, one session each, 4 hours, today, at their slots'' shift and not before its start') from hd_on;
select t.ok(bool_or(patient_id = demo.id('haemodialysis', 'patient:mohamed') and (place_id = core.setup_id((select hd from hd_day), 'place', 'hcv_chair_7')
    or exists (select 1 from base.presence q where q.organization_id = demo.base('clinic') and q.place_id = core.setup_id((select hd from hd_day), 'place', 'hcv_chair_7')
               and q.state = 'admitted' and q.patient_id <> demo.id('haemodialysis', 'patient:mohamed')))), 'Mohamed (HCV) in the HCV chair') from hd_on;
select t.ok(count(*) = 3 and bool_and(day = (select today from hd_day)) and bool_and(checked_in_at = case patient_id when demo.id('haemodialysis', 'patient:said') then demo.ago(150)
    when demo.id('haemodialysis', 'patient:nadia') then demo.ago(160) when demo.id('haemodialysis', 'patient:mohamed') then demo.ago(140) end),
  'Said began 150 minutes ago, Nadia 160, Mohamed 140, today') from hd_on;
select t.ok(count(*) = 5 and count(distinct e.patient_id) = 5 and bool_and((e.data -> 'haemodialysis' ->> 'on')::date = d.past and p.state = 'discharged' and p.department_id = d.hd
  and haemodialysis.on_day(s.days, d.past) and (e.data -> 'haemodialysis' ->> 'ended')::timestamptz = (e.data -> 'performed' ->> 'value')::timestamptz
    + make_interval(mins => ((e.data -> 'haemodialysis' ->> 'hours')::numeric * 60)::int)
  and (e.data -> 'haemodialysis' ->> 'hours')::numeric = (e.data -> 'haemodialysis' -> 'prescription' ->> 'hours')::numeric),
  'five sessions done on the last pattern day, each in a stay since discharged, each for its prescription''s hours')
  from core.entries e join hd_day d on true join base.presence p on p.organization_id = e.organization_id and p.item = e.visit_id
  join haemodialysis.slots s on s.organization_id = e.organization_id and s.id = (e.data -> 'haemodialysis' ->> 'slot')::uuid
 where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.session' and e.data ->> 'status' = 'completed';
-- a week ago (on a Friday, the Saturday six days back: a week ago is a Friday, in neither pattern), on his slot's pattern
select t.ok(count(*) = 1 and bool_and(e.visit_id is null and e.data ->> 'reason' = 'Did not come'
  and (e.data -> 'haemodialysis' ->> 'on')::date = d.today - case when d.dow = 5 then 6 else 7 end and haemodialysis.on_day(s.days, (e.data -> 'haemodialysis' ->> 'on')::date)
  and e.patient_id = demo.id('haemodialysis', 'patient:hassan')), 'Hassan missed a session a week ago, on one of his days: did not come')
  from core.entries e join hd_day d on true join haemodialysis.slots s on s.organization_id = e.organization_id and s.id = (e.data -> 'haemodialysis' ->> 'slot')::uuid
 where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.session' and e.data ->> 'status' = 'not-done';
select demo.as(demo.id('haemodialysis', 'nurse'));
select t.ok(jsonb_array_length(r -> 'rows') = 2 and r -> 'patient_ids' @> jsonb_build_array(demo.id('haemodialysis', 'patient:hassan'), demo.id('haemodialysis', 'patient:shaimaa'))
  and jsonb_array_length(r -> 'patient_ids') = 2
  and exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'patient_id' = demo.id('haemodialysis', 'patient:hassan')::text
    and x ->> 'place_id' = core.setup_id(d.hd, 'place', 'chair_4')::text and (x ->> 'hours')::numeric = 4 and (x ->> 'last_on')::date = d.past)
  and exists (select 1 from jsonb_array_elements(r -> 'rows') x where x ->> 'patient_id' = demo.id('haemodialysis', 'patient:shaimaa')::text
    and x ->> 'place_id' = core.setup_id(d.hd, 'place', 'chair_6')::text and (x ->> 'hours')::numeric = 3.5),
  'as Rasha, due now: Hassan (Chair 4, 4 h, last session on the last pattern day) and Shaimaa (Chair 6, 3.5 h by her prescription)')
  from hd_day d, public.pack_op(jsonb_build_object('op', 'haemodialysis.due', 'department_id', d.hd, 'args', '{}'::jsonb)) r;
select demo.as(demo.id('haemodialysis', 'doctor'));
select t.ok((select count(*) from jsonb_each(b -> 'stays')) = 3 and (select bool_and(v -> 'session' ->> 'status' = 'in-progress' and (v -> 'session' ->> 'hours')::numeric = 4
    and v -> 'bp' ? 'sys') from jsonb_each(b -> 'stays') x(k, v))
  and (select v -> 'isolation' from jsonb_each(b -> 'stays') x(k, v) join base.presence p on p.item = x.k::uuid where p.patient_id = demo.id('haemodialysis', 'patient:mohamed')) = '["hcv"]',
  'as Dr. Walid, the board: three on dialysis, each with a blood pressure; Mohamed HCV')
  from hd_day d, public.pack_op(jsonb_build_object('op', 'haemodialysis.board', 'department_id', d.hd, 'args', '{}'::jsonb, 'purpose', 'TREAT')) b;
select t.ok(count(*) = 2 and bool_or(e.patient_id = demo.id('haemodialysis', 'patient:mohamed') and e.codes @> array['local.alert:isolation_hcv'])
  and bool_or(e.patient_id = demo.id('haemodialysis', 'patient:magdy') and e.codes @> array['local.alert:isolation_hbv']),
  'Mohamed''s HCV and Magdy''s HBV isolation, active; no other alert of the unit')
  from core.entries e, hd_day d where e.organization_id = demo.base('clinic') and e.type = 'alert' and e.department_id = d.hd and e.data ->> 'status' = 'active';
-- D2: the standing prescriptions, Before, the readings, Nadia's event, Said's EPO, the past sessions' fluid
select t.ok(count(*) = 6 and count(distinct e.patient_id) = 6 and bool_and(e.item_version = 1 and e.visit_id is null and e.department_id = d.hd
  and e.author_id = (select u.id from core.users u where u.organization_id = e.organization_id and u.login_id = demo.id('haemodialysis', 'doctor'))),
  'six standing prescriptions, one each, all Dr. Walid''s, in the unit')
  from core.entries e, hd_day d where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.prescription';
select demo.as(demo.id('haemodialysis', 'nurse'));
select t.ok((x ->> 'hours')::numeric = 3.5 and x ->> 'access' = 'fistula', 'as Rasha, due: Shaimaa''s row reads 3.5 h (her prescription), a fistula')
  from hd_day d, public.pack_op(jsonb_build_object('op', 'haemodialysis.due', 'department_id', d.hd, 'args', '{}'::jsonb)) r, jsonb_array_elements(r -> 'rows') x
 where x ->> 'patient_id' = demo.id('haemodialysis', 'patient:shaimaa')::text;
reset role;
select t.ok(count(*) filter (where o.patient_id = demo.id('haemodialysis', 'patient:said')) = 5 and count(*) filter (where o.patient_id = demo.id('haemodialysis', 'patient:nadia')) = 5
  and count(*) filter (where o.patient_id = demo.id('haemodialysis', 'patient:mohamed')) = 4 and count(*) = 14,
  'readings: Said 5, Nadia 5, Mohamed 4, each in their stay today')
  from core.entries e join hd_on o on o.item = e.visit_id where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.reading';
select t.ok(count(*) = 0, 'no reading outside a stay of today''s three')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.reading' and e.visit_id not in (select item from hd_on);
select t.ok(bool_and(s.status = 'in-progress' and e.occurred_at >= o.checked_in_at and e.occurred_at <= demo.now()), 'each reading while its session is in progress')
  from core.entries e join hd_on o on o.item = e.visit_id,
  lateral (select x.data ->> 'status' status from core.entries x where x.organization_id = e.organization_id and x.visit_id = e.visit_id and x.type = 'haemodialysis.session'
            and x.recorded_at <= e.recorded_at order by x.recorded_at desc limit 1) s
 where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.reading';
select t.ok(count(*) = 14 and not bool_or(jsonb_path_exists(coalesce(to_jsonb(e.findings), '[]'), '$[*] ? (@.level == "flag")')), 'none flagged')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.reading';
create temp view hd_latest as select distinct on (e.item) e.patient_id, e.visit_id, e.data from core.entries e
 where e.organization_id = demo.base('clinic') and e.type = 'haemodialysis.session' order by e.item, e.item_version desc;
select t.ok(bool_and((l.data -> 'haemodialysis' -> 'target' ->> 'value')::numeric = case l.patient_id when demo.id('haemodialysis', 'patient:said') then 2800
    when demo.id('haemodialysis', 'patient:nadia') then 2500 when demo.id('haemodialysis', 'patient:mohamed') then 2700 end
  and l.data -> 'haemodialysis' -> 'prescription' ? 'dry_weight' and (l.data -> 'haemodialysis' -> 'access' ->> 'ok')::boolean) and count(*) = 3,
  'Before: Said 2.8 L to take off, Nadia 2.5, Mohamed 2.7, the prescription copied, the access fine')
  from hd_latest l join hd_on o on o.item = l.visit_id;
select t.ok(count(*) = 5 and bool_and((l.data -> 'haemodialysis' -> 'removed' ->> 'value')::numeric = case l.patient_id when demo.id('haemodialysis', 'patient:said') then 2500
    when demo.id('haemodialysis', 'patient:nadia') then 2000 when demo.id('haemodialysis', 'patient:mohamed') then 2700 when demo.id('haemodialysis', 'patient:hassan') then 2500
    when demo.id('haemodialysis', 'patient:shaimaa') then 2100 end and l.data -> 'haemodialysis' ->> 'needles' = 'Dry, no bleeding'),
  'the past sessions'' fluid taken off: 2.5, 2.0, 2.7, 2.5, 2.1 L, the needles dry') from hd_latest l where l.data ->> 'status' = 'completed';
select t.ok(count(distinct e.set_id) = 1 and count(*) = 3 and bool_or(e.type = 'note' and e.data ->> 'heading' = 'Low BP · Cramps')
  and bool_or(e.type = 'given' and e.data -> 'dose' ->> 'value' = '200' and e.data -> 'dose' ->> 'unit' = 'mL')
  and bool_or(e.type = 'haemodialysis.reading' and e.data -> 'bp' -> 'sys' ->> 'value' = '88' and e.data -> 'bp' -> 'dia' ->> 'value' = '54'),
  'Nadia''s event: the note, the saline given and the 88/54 reading, one set')
  from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('haemodialysis', 'patient:nadia')
   and e.set_id = (select x.set_id from core.entries x where x.organization_id = demo.base('clinic') and x.patient_id = demo.id('haemodialysis', 'patient:nadia')
                    and x.type = 'note' and x.data ->> 'kind' = 'dialysis_event');
select t.ok(count(*) = 1 and bool_and(m.codes @> array['atc:B03XA01'] and m.data -> 'dosage' ->> 'route' = 'iv' and m.data ->> 'status' = 'active'
  and exists (select 1 from core.entries g join hd_on o on o.item = g.visit_id where g.organization_id = m.organization_id and g.type = 'given' and g.data ->> 'medication' = m.item::text
                and o.patient_id = m.patient_id)),
  'Said''s Epoetin alfa: active, IV, given today in his stay, linked to it')
  from core.entries m where m.organization_id = demo.base('clinic') and m.type = 'medication' and m.patient_id = demo.id('haemodialysis', 'patient:said');
select demo.as(demo.id('haemodialysis', 'doctor'));
select t.ok((select (v -> 'session' ->> 'target')::numeric = 2800 and (v -> 'uf' ->> 'ml')::numeric = 1400 from jsonb_each(b -> 'stays') x(k, v)
    join base.presence p on p.item = x.k::uuid where p.patient_id = demo.id('haemodialysis', 'patient:said'))
  and (select v -> 'event' ->> 'heading' = 'Low BP · Cramps' and (v -> 'bp' ->> 'sys')::numeric = 88 and (v -> 'bp' ->> 'dia')::numeric = 54
    and (v ->> 'pre')::numeric = 58.6 and (v ->> 'last')::numeric = 56.3 from jsonb_each(b -> 'stays') x(k, v)
    join base.presence p on p.item = x.k::uuid where p.patient_id = demo.id('haemodialysis', 'patient:nadia')),
  'as Dr. Walid, the board: Said 2.8 L to take off, 1.4 off; Nadia Low BP · Cramps, BP 88/54, 58.6 kg before, 56.3 last time')
  from hd_day d, public.pack_op(jsonb_build_object('op', 'haemodialysis.board', 'department_id', d.hd, 'args', '{}'::jsonb, 'purpose', 'TREAT')) b;
reset role;

\echo '── ObGyn''s labour ward (§5.6): three women in labour, their partographs'' points and the baby''s heart; two births and their babies'
create temp view lw as select demo.id('obgyn', 'labour ward') id, demo.id('obgyn', 'patient:salma') salma, demo.id('obgyn', 'patient:doaa') doaa,
  demo.id('obgyn', 'patient:nesma') nesma, demo.id('obgyn', 'patient:heba') heba, demo.id('obgyn', 'patient:marwa') marwa,
  demo.id('obgyn', 'patient:baby heba') bheba, demo.id('obgyn', 'patient:baby marwa') bmarwa;
select t.ok(core.setting_at(demo.base('clinic'), 'department.packs', lw.id) -> 'packs' = '["obgyn", "bedside"]'::jsonb, 'the Labour ward uses ObGyn, then Ward nursing') from lw;
select t.ok(count(*) = 7 and count(distinct p.place_id) = 7, count(*) || ' admitted on the Labour ward, in seven places') from base.presence p, lw
 where p.organization_id = demo.base('clinic') and p.department_id = lw.id and p.kind = 'stay' and p.state = 'admitted';
select t.ok(count(*) = 3 and bool_and(p.day = (demo.now() at time zone 'Africa/Cairo')::date), 'the three in labour admitted today') from base.presence p, lw
 where p.organization_id = demo.base('clinic') and p.department_id = lw.id and p.kind = 'stay' and p.state = 'admitted' and p.patient_id in (lw.salma, lw.doaa, lw.nesma);
select t.ok(array_agg(p.place_id order by p.place_id) = (select array_agg(x order by x) from unnest(array[demo.thing(lw.id, 'place', 'delivery_1'),
    demo.thing(lw.id, 'place', 'delivery_2'), demo.thing(lw.id, 'place', 'delivery_3')]) x), 'in Delivery 1, 2 and 3') from base.presence p, lw
 where p.organization_id = demo.base('clinic') and p.department_id = lw.id and p.kind = 'stay' and p.state = 'admitted' and p.patient_id in (lw.salma, lw.doaa, lw.nesma) group by lw.id;
select t.ok(count(*) > 0 and bool_and(e.patient_id in (lw.salma, lw.doaa, lw.nesma, lw.heba, lw.marwa)), count(*) || ' labour examinations, all on the Labour ward''s five women') from core.entries e, lw
 where e.organization_id = demo.base('clinic') and e.type = 'obgyn.labour_exam';
select t.ok(array_agg((e.data ->> 'cervix')::numeric order by e.occurred_at) filter (where e.patient_id = lw.salma) = array[4, 5, 6]::numeric[]
  and array_agg((e.data ->> 'cervix')::numeric order by e.occurred_at) filter (where e.patient_id = lw.doaa) = array[3, 4]::numeric[]
  and array_agg((e.data ->> 'cervix')::numeric order by e.occurred_at) filter (where e.patient_id = lw.nesma) = array[5, 7, 8]::numeric[],
  'the partographs'' points: Salma 4, 5, 6 cm; Doaa 3, 4; Nesma 5, 7, 8') from core.entries e, lw
 where e.organization_id = demo.base('clinic') and e.type = 'obgyn.labour_exam' and e.data ? 'cervix';
select t.ok(array_agg((e.data ->> 'gravida') || '/' || (e.data ->> 'para')) filter (where e.patient_id = lw.salma) = array['2/1']
  and array_agg((e.data ->> 'gravida') || '/' || (e.data ->> 'para')) filter (where e.patient_id = lw.doaa) = array['1/0']
  and array_agg((e.data ->> 'gravida') || '/' || (e.data ->> 'para')) filter (where e.patient_id = lw.nesma) = array['3/2'],
  'G and P said once each: Salma G2 P1, Doaa G1 P0, Nesma G3 P2') from core.entries e, lw
 where e.organization_id = demo.base('clinic') and e.type = 'obgyn.labour_exam' and e.data ? 'gravida';
select t.ok((select (e.data -> 'value' -> 'quantity' ->> 'value')::numeric from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = lw.nesma
    and e.type = 'observation' and e.codes @> array['loinc:55283-6'] order by e.occurred_at desc limit 1) = 100
  and exists (select 1 from base.values v where v.organization_id = demo.base('clinic') and v.patient_id = lw.nesma and v.code = 'loinc:55283-6'),
  'Nesma''s baby''s heart 100 last, the base''s observation (LOINC 55283-6) in the values') from lw;
select t.ok(count(*) = 3 and bool_and(e.data -> 'lmp' ? 'value'), count(*) || ' current pregnancies on the Labour ward''s women, each with an LMP') from core.entries e, lw
 where e.organization_id = demo.base('clinic') and e.type = 'pregnancy' and e.data ->> 'status' = 'current' and (e.data ->> 'pregnant')::boolean
   and e.patient_id in (lw.salma, lw.doaa, lw.nesma);
select t.ok(p.urgent, 'Nesma''s stay is urgent') from base.presence p, lw
 where p.organization_id = demo.base('clinic') and p.patient_id = lw.nesma and p.kind = 'stay' and p.state = 'admitted';
select t.ok(not exists (select 1 from core.entries e, lw where e.organization_id = demo.base('clinic') and e.patient_id in (lw.salma, lw.doaa, lw.nesma)
  and e.type in ('obgyn.labour_exam', 'observation', 'vitals') and e.department_id <> lw.id), 'every exam, heart rate and set of signs of theirs is the Labour ward''s');
select demo.as(demo.id('obgyn', 'hanan'));
create temp table lw_board as select public.pack_op(jsonb_build_object('op', 'obgyn.board', 'department_id', lw.id, 'args', '{}'::jsonb, 'purpose', 'TREAT')) b from lw;
select t.ok((select count(*) from jsonb_object_keys(b -> 'stays')) = 7, 'the board, as Hanan Fouad: seven stays') from lw_board;
select t.ok((select jsonb_agg(x -> 'cervix' order by n) from jsonb_array_elements(s -> 'exams') with ordinality y(x, n)) = '[4, 5, 6]'::jsonb and s -> 'pregnancy' ? 'lmp',
  'Salma''s exams'' cervixes 4, 5, 6 in order, her pregnancy with its LMP')
  from lw_board, lw, base.presence p, lateral (select b -> 'stays' -> p.item::text s) z
 where p.organization_id = demo.base('clinic') and p.patient_id = lw.salma and p.kind = 'stay' and p.state = 'admitted';
select t.ok((s -> 'fhr' ->> 'value')::numeric = 100, 'Nesma''s baby''s heart on the board: 100')
  from lw_board, lw, base.presence p, lateral (select b -> 'stays' -> p.item::text s) z
 where p.organization_id = demo.base('clinic') and p.patient_id = lw.nesma and p.kind = 'stay' and p.state = 'admitted';
select t.ok(b -> 'patient_ids' @> jsonb_build_array(lw.salma, lw.doaa, lw.nesma, lw.heba, lw.marwa, lw.bheba, lw.bmarwa) and jsonb_array_length(b -> 'patient_ids') = 7,
  'the board names the five women and the two babies') from lw_board, lw;
-- the two births, each in one Done with the baby's own record (the owner's Q10)
create temp view lw_birth as select e.*, (select count(*) from core.entries x where x.set_id = e.set_id and x.type = 'admitted' and x.patient_id <> e.patient_id
    and x.data ->> 'admit_source' = 'born') born from core.entries e, lw where e.organization_id = demo.base('clinic') and e.type = 'obgyn.birth';
select t.ok(count(*) = 2 and array_agg(b.patient_id order by b.patient_id) = (select array_agg(x order by x) from unnest(array[lw.heba, lw.marwa]) x) and bool_and(b.born = 1)
  and bool_or(b.patient_id = lw.marwa and b.author_id = demo.id('obgyn', 'nermeen')), 'two births, on Heba and Marwa, each one set with one baby admitted, born; Marwa''s by Dr. Nermeen')
  from lw_birth b, lw group by lw.heba, lw.marwa;
select t.ok((select count(*) from core.patient_relations r where r.relation = 'mother_of' and ((r.patient_id = lw.heba and r.other_id = lw.bheba) or (r.patient_id = lw.marwa and r.other_id = lw.bmarwa))) = 2
  and (select array_agg(p.full_name || ' ' || p.gender order by p.full_name) from core.patients p where p.id in (lw.bheba, lw.bmarwa))
    = array['Baby of Heba Mostafa Sherif female', 'Baby of Marwa Adel Tawfik male'], 'each mother "mother of" her baby, its record named so') from lw;
select t.ok((select place_id from base.presence where patient_id = lw.bheba and state = 'admitted') = demo.thing(lw.id, 'place', 'cot_1')
  and (select place_id from base.presence where patient_id = lw.bmarwa and state = 'admitted') = demo.thing(lw.id, 'place', 'cot_2'), 'the babies in Cot 1 and Cot 2') from lw;
select t.ok(array_agg((e.data ->> 'total')::int order by e.occurred_at) filter (where e.patient_id = lw.bheba) = array[8, 9]
  and array_agg((e.data ->> 'total')::int order by e.occurred_at) filter (where e.patient_id = lw.bmarwa) = array[8, 9]
  and array_agg(e.data ->> 'note' order by e.occurred_at) filter (where e.patient_id = lw.bheba) = array['1 min', '5 min'], 'Apgar 8 then 9 on each baby, at 1 and 5 min')
  from core.entries e, lw where e.organization_id = demo.base('clinic') and e.type = 'score' and e.data ->> 'score' = 'obgyn.apgar';
select t.ok(count(*) = 2 and bool_and(e.data ->> 'status' = 'ended' and e.data ->> 'reason' = 'delivered'), 'both mothers'' pregnancies ended: delivered') from core.entries e, lw
 where e.organization_id = demo.base('clinic') and e.type = 'pregnancy' and e.patient_id in (lw.heba, lw.marwa)
   and not exists (select 1 from core.entries y where y.item = e.item and y.item_version > e.item_version);
select t.ok(bool_or(e.patient_id = lw.heba and e.data -> 'dose' ->> 'value' = '10' and e.data ->> 'route' = 'im') and bool_or(e.patient_id = lw.marwa and e.data -> 'dose' ->> 'value' = '5'
  and e.data ->> 'route' = 'iv'), 'the oxytocin: Heba 10 units IM, Marwa 5 units IV (a caesarean)') from core.entries e, lw
 where e.organization_id = demo.base('clinic') and e.type = 'given' and e.data -> 'drug' ->> 'text' = 'Oxytocin';
select t.ok(count(*) filter (where e.patient_id = lw.bheba) = 2 and count(*) filter (where e.patient_id = lw.bmarwa) = 3 and bool_and(e.codes = '{}' and e.data ->> 'status' = 'completed')
  and bool_and(e.data -> 'dose' ->> 'value' = '1') filter (where e.data -> 'drug' ->> 'text' like 'Vitamin K%'), 'the babies'' doses: two and three, text only, completed; vitamin K 1 mg')
  from core.entries e, lw where e.organization_id = demo.base('clinic') and e.type = 'given' and e.patient_id in (lw.bheba, lw.bmarwa);
select t.ok(s -> 'birth' ->> 'mode' = 'normal' and (s -> 'birth' ->> 'blood_loss')::numeric = 350 and s -> 'birth' -> 'babies' @> '[{"sex":"female","grams":3100}]'
  and (select (b -> 'stays' -> p2.item::text -> 'baby' ->> 'kg')::numeric from base.presence p2 where p2.patient_id = lw.bheba and p2.state = 'admitted') = 3.1
  and (select (b -> 'stays' -> p2.item::text -> 'baby' ->> 'kg')::numeric from base.presence p2 where p2.patient_id = lw.bmarwa and p2.state = 'admitted') = 3.35
  and (select jsonb_array_length(b -> 'stays' -> p2.item::text -> 'baby' -> 'apgar') from base.presence p2 where p2.patient_id = lw.bheba and p2.state = 'admitted') = 2,
  'the board: Heba''s birth normal, 350 mL, a girl 3100 g; the babies'' Apgar and 3.1 and 3.35 kg')
  from lw_board, lw, base.presence p, lateral (select b -> 'stays' -> p.item::text s) z
 where p.organization_id = demo.base('clinic') and p.patient_id = lw.heba and p.kind = 'stay' and p.state = 'admitted';

\echo '── billing''s demo and the clinic''s choices between its packs (§5.4): the Cashier and its person, Pay first at the Laboratory, the Pharmacy taking its own payment; one paid, one waiting, one sent from the Pharmacy'
select t.ok(core.setting_at(demo.base('clinic'), 'billing.desk', demo.id('billing', 'cashier')) ->> 'takes' = 'everyone'
  and exists (select 1 from core.live_holdings(demo.base('clinic')) h where h.user_id = demo.id('billing', 'cashier person') and h.department_id = demo.id('billing', 'cashier')),
  'the main Cashier takes everyone''s payments, Mona Saad at its desk');
select t.ok((core.setting_at(demo.base('clinic'), 'billing.pay_first', demo.base('lab')) ->> 'on')::boolean, 'Pay first at the Laboratory');
select t.ok(core.department_uses(demo.base('clinic'), demo.id('pharmacy', 'department'), 'billing')
  and core.setting_at(demo.base('clinic'), 'billing.desk', demo.id('pharmacy', 'department')) ->> 'takes' = 'own'
  and exists (select 1 from core.live_holdings(demo.base('clinic')) h where h.user_id = demo.id('pharmacy', 'pharmacist') and h.department_id = demo.id('pharmacy', 'department')
    and h.role_id = '00000000-0000-0000-0000-00000000ce01'), 'the Pharmacy bills and takes its own payment, the pharmacist at its counter');
select t.ok(core.setting_at(demo.base('clinic'), 'department.screens', demo.id('pharmacy', 'department'))
  = '{"opens": "pharmacy.dispensing", "screens": ["pharmacy.dispensing", "pharmacy.stock", "billing.today"]}'::jsonb,
  'the Pharmacy''s line: Dispensing (it opens there), Stock, and billing''s Today, where the pharmacist closes their own drawer');
select t.ok((select count(*) from billing.payments p where p.patient_id = demo.id('billing', 'patient:hoda') and p.refund_of is null) = 1, 'Hoda paid at the Cashier');
select t.ok((select count(*) from billing.sent s where s.patient_id = demo.id('pharmacy', 'patient:hamdy') and s.department_id = demo.id('pharmacy', 'department')
  and s.order_item is not null and billing.sent_owed(s.organization_id, s.id)) = 1, 'one open bill: Hamdy''s box of Glucophage, sent to the cashier from the Pharmacy with its order');
select demo.as(demo.base('tech'));
select t.ok(w -> 'waiting' @> jsonb_build_array(demo.id('billing', 'order:magdy cbc'), demo.id('billing', 'order:magdy hba1c')) and (w -> 'pay_first')::boolean,
  'Magdy''s blood count and HbA1c wait for payment at the Laboratory')
  from public.pack_op(jsonb_build_object('op', 'billing.waiting', 'department_id', demo.base('lab'), 'args', jsonb_build_object('orders',
    jsonb_build_array(demo.id('billing', 'order:magdy cbc'), demo.id('billing', 'order:magdy hba1c'), demo.id('billing', 'order:hoda lipids'))))) w;
select t.ok(not (w -> 'waiting') ? demo.id('billing', 'order:hoda lipids')::text and w -> 'patient_ids' = jsonb_build_array(demo.id('billing', 'patient:hoda')), 'Hoda''s lipid profile, paid, does not wait')
  from public.pack_op(jsonb_build_object('op', 'billing.waiting', 'department_id', demo.base('lab'), 'args', jsonb_build_object('orders',
    jsonb_build_array(demo.id('billing', 'order:hoda lipids'))))) w;
select demo.as(demo.base('doctor'));
select t.ok(w -> 'waiting' @> jsonb_build_array(demo.id('billing', 'order:magdy cbc'), demo.id('billing', 'order:magdy hba1c')) and jsonb_array_length(w -> 'waiting') = 2,
  'on Magdy''s chart in General Practice, the word on both tests'' lines (owner, 2026-10-08)')
  from public.pack_op(jsonb_build_object('op', 'billing.chart', 'department_id', demo.base('gp'), 'args', jsonb_build_object('patient_id', demo.id('billing', 'patient:magdy'),
    'orders', jsonb_build_array(demo.id('billing', 'order:magdy cbc'), demo.id('billing', 'order:magdy hba1c'))))) w;
select t.ok(c.open and c.at = (select min(e.occurred_at) from core.entries e where e.organization_id = c.organization_id and e.item = c.item),
  'Heba, waiting at General Practice and not yet called, owes its visit fee already: charged at check-in (owner, 2026-10-08)')
  from billing.charges c where c.organization_id = demo.base('clinic') and c.patient_id = demo.id('base', 'patient:heba') and c.kind = 'visit' and c.department_id = demo.base('gp');

\echo '── reloaded with two patients of the app in the beds the demo names (3 and 4): each demo stay takes a free bed'
do $$
declare p uuid; s uuid;
begin
  for n in 3 .. 4 loop
    -- registered at the desk as the app does (the kit's demo.patient takes only the demo's own ids)
    p := gen_random_uuid(); s := gen_random_uuid();
    perform demo.as(demo.base('reception'));
    perform public.save_patient(jsonb_build_object('department_id', demo.base('desk'), 'patient', jsonb_build_object('id', p, 'given', jsonb_build_array('Walk', 'In'),
      'family', 'Patient ' || n, 'gender', 'male', 'birth_date', demo.born(50 + n))));
    perform demo.use(p);
    perform demo.w(demo.base('doctor'), jsonb_build_array(demo.e('admitted', demo.base('ward'), s, null, jsonb_build_object('department_id', demo.base('ward'),
      'admit_source', 'outp', 'reason', 'admitted in the app', 'place_id', demo.bed(n)), s)));
  end loop;
end $$;
-- include: supabase/demo/load.sql
select t.ok(count(*) = 2, 'the app''s two patients are still in Beds 3 and 4') from base.presence where organization_id = demo.base('clinic') and kind = 'stay'
   and state = 'admitted' and place_id in (demo.bed(3), demo.bed(4)) and patient_id in (select id from core.patients where full_name ilike 'walk in%');
select t.ok(count(*) = 9 and count(distinct place_id) = 7 and count(*) filter (where place_id is null) = 2,
  'seven in seven beds — the demo''s five and the app''s two — and Ward nursing''s two admitted with no bed yet') from base.presence
 where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.base('ward');
select t.ok(count(*) = 2 and count(distinct place_id) = 2 and bool_and(place_id is not null), 'the ICU''s two beds still held by its two stays') from base.presence
 where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.id('intensive', 'icu');
select t.ok(count(*) = 1 and bool_and(place_id is not null and patient_id = demo.id('intensive', 'patient:maher')), 'the CCU''s bed still held by Maher') from base.presence
 where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.id('intensive', 'ccu');
select t.ok(p.place_id is distinct from (select (e.data ->> 'place_id')::uuid from core.entries e where e.organization_id = p.organization_id and e.item = p.item and e.type = 'admitted'),
  'Nadia was moved off her first bed') from base.presence p where p.organization_id = demo.base('clinic') and p.patient_id = demo.id('base', 'patient:nadia') and p.kind = 'stay' and p.state = 'admitted';
select pg_temp.journey_in_order();

\echo '── loaded just after midnight: the day is today''s and the journey keeps its order'
select set_config('demo.now', least(demo.midnight() + interval '30 minutes', now())::text, true) is not null as early;
-- include: supabase/demo/load.sql
select pg_temp.day_is_today();
select pg_temp.journey_in_order();
select t.ok(min(checked_in_at) = demo.ago(40) and min(checked_in_at) >= demo.midnight(), 'the longest wait is still the first to arrive, after midnight')
  from base.presence where organization_id = demo.base('clinic') and state = 'waiting';
select t.ok(not exists (select 1 from core.entries e, jsonb_array_elements(e.findings) f where e.organization_id = demo.base('clinic') and f ->> 'level' = 'flag'),
  'nothing flagged loaded early');
select demo.as(demo.id('bedside', 'nurse'));
select t.ok(coalesce((b -> 'doses' -> pg_temp.stay_of(demo.id('bedside', 'patient:samira')) ->> 'late')::int, 0) = 1
  and (select coalesce(sum((v ->> 'late')::int), 0) from jsonb_each(b -> 'doses') d(k, v)) = 1, 'loaded just after midnight: Samira''s one late dose, the only one on the ward: ' || (b -> 'doses')::text)
  from (select public.pack_op(jsonb_build_object('op', 'bedside.board', 'department_id', demo.base('ward'), 'purpose', 'TREAT', 'args', jsonb_build_object('now', demo.now()))) b) x;
select core.drain(100000) as drained;  -- the whole queue: a full demo load passes 500 rows
select t.ok(r = '[]'::jsonb, 'rebuild = live after the early load: ' || left(r::text, 300)) from core.rebuild_check() r;
select set_config('demo.now', '', true) is not null as clock_back;
