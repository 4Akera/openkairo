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
