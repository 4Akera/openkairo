-- Ward nursing's obs due in the demo (spec §5.6, W1): the Medical Ward's line holds Obs due, its response is RCP 2017's, and the op, as
-- Nour Adel, says when each of the three patients' obs are due: Tahany's first set (a 3 in systolic, hourly), Samira's 6 (hourly) and
-- Abdelmoneim's 3 on scale 2 (every 4 hours). Times against demo.ago(), exact at any hour of the load.
-- include: supabase/demo/load.sql
select t.ok(core.setting_at(demo.base('clinic'), 'department.screens', demo.base('ward')) -> 'screens' ? 'bedside.obs'
  and core.setting_at(demo.base('clinic'), 'department.screens', demo.base('ward')) ->> 'opens' = 'base.beds', 'the Medical Ward''s line holds Obs due and opens on the board');
select t.ok(core.setting_at(demo.base('clinic'), 'bedside.response', demo.base('ward')) is null, 'the Medical Ward keeps RCP 2017''s response: no setting written');
select t.ok(count(*) = 2 and count(*) filter (where e.type = 'vitals' and e.data ->> 'consciousness' = 'a' and e.data -> 'oxygen' ->> 'on' = 'air') = 1
  and count(*) filter (where e.type = 'score' and (e.data ->> 'total')::int = 4) = 1 and count(distinct e.set_id) = 1
  and bool_and(e.author_id = demo.id('bedside', 'nurse') and e.occurred_at = demo.ago(80)),
  'Tahany''s first obs: the vitals (alert, on air) and NEWS2 4 in one set by Nour, 80 minutes before the load')
  from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:tahany') and e.type in ('vitals', 'score');

select demo.as(demo.id('bedside', 'nurse'));
create temp table due as select public.pack_op(jsonb_build_object('op', 'bedside.obs_due', 'department_id', demo.base('ward'), 'args', '{}'::jsonb, 'purpose', 'TREAT')) d;
create function pg_temp.stay_of(p_patient uuid) returns jsonb language sql as $$
  select d -> 'stays' -> p.item::text from due, base.presence p where p.organization_id = demo.base('clinic') and p.patient_id = p_patient and p.kind = 'stay' and p.state = 'admitted'
$$;
select t.ok(s ->> 'level' = 'single' and (s ->> 'total')::int = 4 and s -> 'threes' = '["sbp"]' and (s ->> 'every')::int = 60 and s ->> 'tell' = 'the doctor caring for the patient'
  and (s ->> 'at')::timestamptz = demo.ago(80) and (s ->> 'due_at')::timestamptz = demo.ago(80) + interval '60 minutes',
  'Tahany: NEWS2 4 with a 3 in systolic, hourly, tell the doctor caring for her; due an hour after her first obs') from (select pg_temp.stay_of(demo.id('bedside', 'patient:tahany')) s) x;
select t.ok(s ->> 'level' = 'medium' and (s ->> 'total')::int = 6 and (s ->> 'every')::int = 60 and (s ->> 'at')::timestamptz = demo.ago(50)
  and (s ->> 'due_at')::timestamptz = demo.ago(50) + interval '60 minutes', 'Samira: NEWS2 6, medium, hourly; due an hour after her last obs')
  from (select pg_temp.stay_of(demo.id('bedside', 'patient:samira')) s) x;
select t.ok(s ->> 'score' = 'bedside.news2_s2' and s ->> 'level' = 'low' and (s ->> 'total')::int = 3 and (s ->> 'every')::int = 240 and (s ->> 'at')::timestamptz = demo.ago(120)
  and (s ->> 'due_at')::timestamptz = demo.ago(120) + interval '240 minutes', 'Abdelmoneim: NEWS2 3 on scale 2, low, every 4 hours')
  from (select pg_temp.stay_of(demo.id('bedside', 'patient:abdelmoneim')) s) x;
select t.ok(d -> 'patient_ids' @> jsonb_build_array(demo.id('bedside', 'patient:tahany'), demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim')),
  'the three are named for the read log, among the ward''s patients') from due;

-- W2 · the fluid balance in the demo: Samira's chart since yesterday 08:30 with her ten measures and her weight, Tahany's with a balance
-- aim of +1 000 mL and her two, Abdelmoneim with none; each stay found from its admission, as the demo finds it. No balance "today":
-- the load's hour moves the day's split.
select set_config('request.jwt.claim.sub', '', false);
create function pg_temp.admitted(p_patient uuid) returns uuid language sql as $$
  select e.visit_id from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = p_patient and e.type = 'admitted' order by e.recorded_at desc limit 1
$$;
create function pg_temp.fluid(p_stay uuid, p_code text) returns table (n bigint, ml numeric, clean boolean) language sql as $$
  select count(*), sum((e.data -> 'value' -> 'quantity' ->> 'value')::numeric), coalesce(bool_and(coalesce(e.findings, '[]'::jsonb) = '[]'::jsonb), true)
    from core.entries e where e.organization_id = demo.base('clinic') and e.visit_id = p_stay and e.type = 'observation' and e.codes @> array['loinc:' || p_code]
$$;
select t.ok(pg_temp.admitted(demo.id('bedside', 'patient:samira')) is not null and pg_temp.admitted(demo.id('bedside', 'patient:tahany')) is not null
  and (select count(*) from base.presence p where p.organization_id = demo.base('clinic') and p.kind = 'stay' and p.state = 'admitted'
    and p.item in (pg_temp.admitted(demo.id('bedside', 'patient:samira')), pg_temp.admitted(demo.id('bedside', 'patient:tahany')))) = 2,
  'Samira''s and Tahany''s stays, found from their admissions, are the admitted stays');
select t.ok(count(*) = 1 and bool_and(e.author_id = demo.base('doctor') and e.occurred_at = demo.midnight() - interval '1 day' + interval '8 hours 30 minutes'
  and e.data ->> 'status' = 'active' and not (e.data ? 'target')), 'Samira: one fluid chart, by Dr. Ali Hassan, yesterday 08:30, on, no balance aim')
  from core.entries e where e.organization_id = demo.base('clinic') and e.visit_id = pg_temp.admitted(demo.id('bedside', 'patient:samira')) and e.type = 'bedside.fluid_chart';
select t.ok(i.n = 5 and i.ml = 3000 and i.clean and u.n = 5 and u.ml = 1360 and u.clean,
  'Samira''s measures: 5 in (3 000 mL), 5 urines (350, 400, 300, 250, 60: 1 360 mL), none flagged')
  from pg_temp.fluid(pg_temp.admitted(demo.id('bedside', 'patient:samira')), '9103-3') i, pg_temp.fluid(pg_temp.admitted(demo.id('bedside', 'patient:samira')), '9187-6') u;
select t.ok((select v.value from base.values v where v.organization_id = demo.base('clinic') and v.patient_id = demo.id('bedside', 'patient:samira') and v.key = 'weight'
  order by v.at desc limit 1) = 68, 'Samira''s latest weight: 68 kg');
select t.ok(count(*) = 1 and bool_and(e.data ->> 'status' = 'active' and e.data -> 'target' ->> 'value' = '+1000'), 'Tahany: one chart, on, a balance aim of +1000')
  from core.entries e where e.organization_id = demo.base('clinic') and e.visit_id = pg_temp.admitted(demo.id('bedside', 'patient:tahany')) and e.type = 'bedside.fluid_chart';
select t.ok(i.n = 1 and i.ml = 500 and u.n = 1 and u.ml = 200, 'Tahany''s measures: IV 500, urine 200')
  from pg_temp.fluid(pg_temp.admitted(demo.id('bedside', 'patient:tahany')), '9103-3') i, pg_temp.fluid(pg_temp.admitted(demo.id('bedside', 'patient:tahany')), '9187-6') u;
select t.ok(not exists (select 1 from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:abdelmoneim')
  and e.type = 'bedside.fluid_chart'), 'Abdelmoneim: no fluid chart');
select demo.as(demo.id('bedside', 'nurse'));
create temp table fluids as select public.pack_op(jsonb_build_object('op', 'bedside.fluids', 'department_id', demo.base('ward'),
  'args', jsonb_build_object('from', demo.now() - interval '3 days'), 'purpose', 'TREAT')) d;
select t.ok(d -> 'patient_ids' @> jsonb_build_array(demo.id('bedside', 'patient:tahany'), demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim'))
  and (select array_agg(k order by k) from jsonb_object_keys(d -> 'stays') k)
    = (select array_agg(x::text order by x::text) from unnest(array[pg_temp.admitted(demo.id('bedside', 'patient:samira')), pg_temp.admitted(demo.id('bedside', 'patient:tahany'))]) x),
  'as Nour, the fluids name the three, and hold exactly Samira''s and Tahany''s stays') from fluids;
select t.ok(jsonb_array_length(d -> 'stays' -> pg_temp.admitted(demo.id('bedside', 'patient:samira'))::text -> 'measures') = 10
  and jsonb_array_length(d -> 'stays' -> pg_temp.admitted(demo.id('bedside', 'patient:tahany'))::text -> 'measures') = 2
  and (d -> 'stays' -> pg_temp.admitted(demo.id('bedside', 'patient:tahany'))::text -> 'chart' ->> 'target')::int = 1000,
  'Samira: 10 measures; Tahany: 2, with the aim 1000') from fluids;

-- W3a · the handover in the demo: the Medical Ward's line ends with Handover, after Obs due; the last shift's handover for Samira and
-- Abdelmoneim by Nour, before the load; Abdelmoneim's fall-risk alert; the op as Nour. Not which shift: the load's hour decides it.
select set_config('request.jwt.claim.sub', '', false);
select t.ok(core.setting_at(demo.base('clinic'), 'department.screens', demo.base('ward')) -> 'screens' ->> -1 = 'bedside.handover'
  and core.setting_at(demo.base('clinic'), 'department.screens', demo.base('ward')) -> 'screens' ? 'bedside.obs', 'the Medical Ward''s line: Handover last, Obs due kept');
select t.ok(count(*) = 2 and count(distinct e.patient_id) = 2 and bool_and(e.author_id = demo.id('bedside', 'nurse') and e.occurred_at < demo.now() and e.data ->> 'heading' like 'Handover %'
  and e.visit_id = pg_temp.admitted(e.patient_id)), 'two handovers, Samira''s and Abdelmoneim''s, each in the admitted stay, by Nour, before the load')
  from core.entries e where e.organization_id = demo.base('clinic') and e.type = 'note' and e.data ->> 'kind' = 'handover'
   and e.patient_id in (demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim'));
select t.ok(count(*) = 1 and bool_and(e.data -> 'concept' ->> 'text' = 'Fall risk' and e.data ->> 'status' = 'active'), 'Abdelmoneim: one active alert, Fall risk')
  from core.entries e where e.organization_id = demo.base('clinic') and e.patient_id = demo.id('bedside', 'patient:abdelmoneim') and e.type = 'alert';
select demo.as(demo.id('bedside', 'nurse'));
create temp table ho as select public.pack_op(jsonb_build_object('op', 'bedside.handover', 'department_id', demo.base('ward'), 'args', '{}'::jsonb, 'purpose', 'TREAT')) d;
create function pg_temp.ho_of(p_patient uuid) returns jsonb language sql as $$
  select d -> 'stays' -> p.item::text from ho, base.presence p where p.organization_id = demo.base('clinic') and p.patient_id = p_patient and p.kind = 'stay' and p.state = 'admitted'
$$;
select t.ok(pg_temp.ho_of(demo.id('bedside', 'patient:samira')) -> 'last' ->> 'text' like 'This shift: febrile%', 'as Nour: Samira''s last handover, "This shift: febrile …"');
select t.ok(s -> 'alerts' = '["Fall risk"]'::jsonb and s ? 'last', 'Abdelmoneim: Fall risk, and his last handover') from (select pg_temp.ho_of(demo.id('bedside', 'patient:abdelmoneim')) s) x;
select t.ok(s = '{"alerts":[]}'::jsonb, 'Tahany: no handover yet, no alert') from (select pg_temp.ho_of(demo.id('bedside', 'patient:tahany')) s) x;
select t.ok(d -> 'patient_ids' @> jsonb_build_array(demo.id('bedside', 'patient:tahany'), demo.id('bedside', 'patient:samira'), demo.id('bedside', 'patient:abdelmoneim')),
  'the three are named for the read log') from ho;
