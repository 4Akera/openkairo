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
select core.drain() as drained;

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
-- today's visits, the two base admissions this morning, Ward nursing's Tahany (admitted with no bed yet) and Emergency's five arrivals
-- are today's, however early
-- it loads; the morning's done count as done today
create function pg_temp.day_is_today() returns setof text language sql as $$
  select t.ok(count(*) = 33 and bool_and(day = (demo.now() at time zone 'Africa/Cairo')::date), count(*) || ' visits and stays of the day, each on today''s date')
    from base.presence where organization_id = demo.base('clinic') and checked_in_at > demo.now() - interval '1 day'
     and patient_id not in (select id from core.patients where full_name ilike 'walk in%')   -- the app's own (the bed check below)
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
select t.ok(f.patients = (select count(*) from core.patients where organization_id = demo.base('clinic')) and f.patients = 40, 'the same ' || f.patients || ' patients, once each')
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
  = '{"Front desk":"front_desk","General Practice":"clinic","Psychiatry":"clinic","Medical Ward":"ward","Laboratory":"laboratory","Pharmacy":"pharmacy.pharmacy","Main store":"pharmacy.store","Cashier":"billing.cashier","Emergency":"casualty.er"}',
  'each department records the setup it was made from');
select t.ok((select count(*) from core.places where organization_id = demo.base('clinic') and department_id = demo.base('ward')
    and id = core.setup_id(demo.base('ward'), 'place', 'bed_' || substr(name, 5))) = 8, 'the ward''s eight beds are the Ward setup''s, ids from their keys');
select t.ok(not exists (select 1 from core.departments d, jsonb_array_elements(core.setup_parts(d.organization_id, core.setting_at(d.organization_id, 'department.setup', d.id) ->> 'setup', d.id)) x
    where d.organization_id = demo.base('clinic') and d.work <> 'outside' and x ->> 'state' in ('add', 'blocked')), 'nothing of any setup is missing after the reload');
select t.ok(core.department_uses(demo.base('clinic'), demo.id('pharmacy', 'department'), 'pharmacy')
  and (select count(*) from core.settings_at(demo.base('clinic'), 'service') s where s.owner_id = demo.id('pharmacy', 'department')) = 1,
  'the Pharmacy ticks its pack and has its one dispensing service, from its setup');
select t.ok((select count(distinct full_name) from core.patients where organization_id = demo.base('clinic')) = 40, 'every patient''s name is their own');
select t.ok(not exists (select 1 from core.patients p join core.users u on u.organization_id = p.organization_id and u.name ilike '%' || p.full_name || '%'
  where p.organization_id = demo.base('clinic')), 'no patient shares a name with the staff');
select t.ok(r = '[]'::jsonb, 'rebuild = live after the reload: ' || left(r::text, 300)) from core.rebuild_check() r;

\echo '── relative times: a working day whenever it loads'
-- (today's minutes are demo.ago's: as they are from 05:00, squeezed into the time since midnight before it)
select t.ok(min(checked_in_at) = demo.ago(40) and max(checked_in_at) = demo.ago(5),
  'waiting: the longest arrived 40 minutes ago, the latest 5: ' || max(now() - checked_in_at)) from base.presence
 where organization_id = demo.base('clinic') and state = 'waiting';
select t.ok(bool_and(checked_in_at > now() - interval '12 hours'), 'every open visit arrived within the last 12 hours (none lapses to left)') from base.presence
 where organization_id = demo.base('clinic') and kind = 'visit' and state not in ('done', 'left');
select t.ok(array_agg(distinct state order by state) @> array['back', 'called', 'done', 'pending', 'waiting'], 'the queue has every band: ' || array_agg(distinct state order by state)::text)
  from base.presence where organization_id = demo.base('clinic') and department_id = demo.base('gp');
select t.ok((select called_at from base.presence where organization_id = demo.base('clinic') and state = 'called') = demo.ago(8), 'in consult for 8 minutes');
select t.ok(count(*) = 6 and bool_and(checked_in_at between now() - interval '3 days' and now()), count(*) || ' admitted on the ward (one with no bed yet), all in the last three days')
  from base.presence where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.base('ward');
select t.ok((select (now() at time zone 'Africa/Cairo')::date - day from base.presence where organization_id = demo.base('clinic') and kind = 'stay'
  and patient_id = demo.id('base', 'patient:nadia') and state = 'admitted') = 2, 'Nadia was admitted two days ago (day 3 today)');
select t.ok(max(e.occurred_at) <= clock_timestamp() and min(e.occurred_at) >= now() - interval '200 days', 'every clinical time within the last 200 days, none ahead')
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
select t.ok(array_agg(distinct x.code order by x.code) = array['dnr', 'fall_risk', 'isolation_hbv'], 'alerts: ' || array_agg(distinct x.code order by x.code)::text)
  from core.entries e, jsonb_to_recordset(e.data -> 'concept' -> 'codings') x(code text)
 where e.organization_id = demo.base('clinic') and e.type = 'alert' and e.data ->> 'status' = 'active';
select t.ok(count(*) = 1, 'one critical result waiting') from base.review where organization_id = demo.base('clinic') and critical;
select t.ok(count(*) = 1, 'a pregnant patient') from core.entries where organization_id = demo.base('clinic') and type = 'pregnancy' and (data ->> 'pregnant')::boolean;
select t.ok(count(*) = 1, 'a breastfeeding patient') from core.entries where organization_id = demo.base('clinic') and type = 'breastfeeding' and (data ->> 'breastfeeding')::boolean;
select t.ok(count(*) = 1, 'a private note (Psychiatry)') from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'note' and e.department_id = demo.base('psychiatry');

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
select t.ok(bool_and(years >= 18), 'adults'' medicines on adults only') from aged where type = 'medication';

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
select t.ok(count(*) = 9 and bool_and(e.patient_id in (demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim'))),
  count(*) || ' NEWS2 entries, all on Ward nursing''s own patients (Samira and Abdelmoneim)')
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
select t.ok(count(*) = 9 and bool_and(e.data -> 'inputs' ->> 'consciousness' = v.data ->> 'consciousness' and e.data -> 'inputs' ->> 'oxygen' = v.data -> 'oxygen' ->> 'on'),
  'every NEWS2''s two answers are its vitals'' own: ' || count(*) || ' sets')
  from core.entries e join core.entries v on v.organization_id = e.organization_id and v.set_id = e.set_id and v.type = 'vitals'
 where e.organization_id = demo.base('clinic') and e.type = 'score' and e.data ->> 'score' like 'bedside.%';
select t.ok(count(*) = 4 and bool_and(v.data -> 'oxygen' -> 'flow' ->> 'ucum' = 'L/min' and v.data -> 'oxygen' ->> 'on' = 'oxygen'),
  'Abdelmoneim''s oxygen: its flow in L/min (UCUM) in every set: ' || count(*))
  from core.entries v where v.organization_id = demo.base('clinic') and v.type = 'vitals' and v.patient_id = demo.id('bedside', 'patient:abdelmoneim');
select t.ok(exists (select 1 from base.values x where x.organization_id = demo.base('clinic') and x.patient_id = demo.id('bedside', 'patient:abdelmoneim')
  and x.key = 'oxygen.flow' and x.code = 'loinc:3151-8'), 'his flow is in the values, LOINC 3151-8');
select t.ok(count(*) = 1 and bool_and(p.place_id is null and not p.has_vitals), 'Tahany is admitted with no bed yet and no obs') from base.presence p
 where p.organization_id = demo.base('clinic') and p.patient_id = demo.id('bedside', 'patient:tahany') and p.kind = 'stay' and p.state = 'admitted';

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
select t.ok(count(*) = 8 and count(distinct place_id) = 7, 'seven in seven beds — the demo''s five and the app''s two — and one admitted with no bed yet') from base.presence
 where organization_id = demo.base('clinic') and kind = 'stay' and state = 'admitted' and department_id = demo.base('ward');
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
select core.drain() as drained;
select t.ok(r = '[]'::jsonb, 'rebuild = live after the early load: ' || left(r::text, 300)) from core.rebuild_check() r;
select set_config('demo.now', '', true) is not null as clock_back;
