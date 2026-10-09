-- 17 · Ward nursing (spec/openCare.md §5.6). Its key is bedside; a person always reads "Ward nursing". (The spec's `ward` is a word
-- core files already use, so the lint would refuse it as a pack key.) NEWS2 (the Royal College of Physicians, 2017) as two of the
-- server's score tables, written by the base's /v wherever a department uses the pack (the owner's C3); the board's words through the
-- pack's own op (the owner's C1). Its drug round (piece 3): each dose the base's given, as Ward nursing's own type bedside.dose, which
-- says the time it is for (and, not given, why, coded); the ward's dose times a setting (bedside.round); one reading, bedside.stay_doses,
-- works out each stay's times and what was given, for the round (the Drug round tab), the stay's treatment sheet and the board's words.
-- Its starter setup: a ward with Ward nursing ticked and the Drug round on its line. No table or role of its own. Proposed by Claude,
-- awaiting the owner.

set client_min_messages = warning;

select core.declare_pack('bedside', 1, '{}', '{"en":"Ward nursing","ar":"تمريض الأقسام"}', role_block => 'd0');
select core.create_pack('bedside');

-- ── NEWS2, SpO₂ scale 1: seven items, each with its points; the total 0–20 in three bands (RCP 2017) ──
select core.declare_score('bedside.news2', 'bedside', '2017',
  'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017',
  $j$[
  {"key":"rr","labels":{"en":"Respiration rate","ar":"معدل التنفس"},"input":"number","unit":"/min","decimals":0,"min":1,"max":80,
   "ranges":[{"max":8,"points":3},{"min":9,"max":11,"points":1},{"min":12,"max":20,"points":0},{"min":21,"max":24,"points":2},{"min":25,"points":3}]},
  {"key":"spo2","labels":{"en":"SpO₂ (scale 1)","ar":"تشبع الأكسجين"},"input":"number","unit":"%","decimals":0,"min":50,"max":100,
   "ranges":[{"max":91,"points":3},{"min":92,"max":93,"points":2},{"min":94,"max":95,"points":1},{"min":96,"points":0}]},
  {"key":"oxygen","labels":{"en":"Air or oxygen","ar":"هواء أم أكسجين"},"input":"choice","choices":[
   {"value":"air","points":0,"labels":{"en":"Air","ar":"هواء الغرفة"}},{"value":"oxygen","points":2,"labels":{"en":"Oxygen","ar":"أكسجين"}}]},
  {"key":"sbp","labels":{"en":"Systolic blood pressure","ar":"الضغط الانقباضي"},"input":"number","unit":"mmHg","decimals":0,"min":40,"max":300,
   "ranges":[{"max":90,"points":3},{"min":91,"max":100,"points":2},{"min":101,"max":110,"points":1},{"min":111,"max":219,"points":0},{"min":220,"points":3}]},
  {"key":"pulse","labels":{"en":"Pulse","ar":"النبض"},"input":"number","unit":"/min","decimals":0,"min":20,"max":300,
   "ranges":[{"max":40,"points":3},{"min":41,"max":50,"points":1},{"min":51,"max":90,"points":0},{"min":91,"max":110,"points":1},{"min":111,"max":130,"points":2},{"min":131,"points":3}]},
  {"key":"consciousness","labels":{"en":"Consciousness (ACVPU)","ar":"الوعي"},"input":"choice","choices":[
   {"value":"a","points":0,"labels":{"en":"Alert","ar":"واعٍ"}},{"value":"c","points":3,"labels":{"en":"New confusion","ar":"تشوش جديد"}},
   {"value":"v","points":3,"labels":{"en":"Voice","ar":"يستجيب للصوت"}},{"value":"p","points":3,"labels":{"en":"Pain","ar":"يستجيب للألم"}},
   {"value":"u","points":3,"labels":{"en":"Unresponsive","ar":"لا يستجيب"}}]},
  {"key":"temp","labels":{"en":"Temperature","ar":"الحرارة"},"input":"number","unit":"°C","decimals":1,"min":25.0,"max":45.0,
   "ranges":[{"max":35.0,"points":3},{"min":35.1,"max":36.0,"points":1},{"min":36.1,"max":38.0,"points":0},{"min":38.1,"max":39.0,"points":1},{"min":39.1,"points":2}]}]$j$,
  $j$[{"key":"low","labels":{"en":"Low","ar":"منخفض"},"min":0,"max":4,"tone":null},{"key":"medium","labels":{"en":"Medium","ar":"متوسط"},"min":5,"max":6,"tone":"warn"},
    {"key":"high","labels":{"en":"High","ar":"مرتفع"},"min":7,"max":20,"tone":"danger"}]$j$,
  '{"en":"NEWS2 (SpO₂ scale 1)","ar":"مقياس الإنذار المبكر NEWS2"}', 'NEWS2', 'news2');

-- ── NEWS2, SpO₂ scale 2: the same, its saturation scored against a target of 88–92 % (a choice: on air or on oxygen above 92 %).
-- Its bands say "scale 2", so the record's line reads "NEWS2 3, 2017 · Low · scale 2". No coding on either table: no NEWS2 code is in
-- the base's LOINC subset, and an item's value is its points, not the measurement ──
select core.declare_score('bedside.news2_s2', 'bedside', '2017',
  'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017',
  $j$[
  {"key":"rr","labels":{"en":"Respiration rate","ar":"معدل التنفس"},"input":"number","unit":"/min","decimals":0,"min":1,"max":80,
   "ranges":[{"max":8,"points":3},{"min":9,"max":11,"points":1},{"min":12,"max":20,"points":0},{"min":21,"max":24,"points":2},{"min":25,"points":3}]},
  {"key":"spo2_s2","labels":{"en":"SpO₂ (scale 2)","ar":"تشبع الأكسجين (المقياس ٢)"},"input":"choice","choices":[
   {"value":"le83","points":3,"labels":{"en":"≤ 83 %"}},{"value":"84_85","points":2,"labels":{"en":"84–85 %"}},{"value":"86_87","points":1,"labels":{"en":"86–87 %"}},
   {"value":"88_92","points":0,"labels":{"en":"88–92 %"}},{"value":"ge93_air","points":0,"labels":{"en":"≥ 93 % on air"}},
   {"value":"93_94_o2","points":1,"labels":{"en":"93–94 % on oxygen"}},{"value":"95_96_o2","points":2,"labels":{"en":"95–96 % on oxygen"}},
   {"value":"ge97_o2","points":3,"labels":{"en":"≥ 97 % on oxygen"}}]},
  {"key":"oxygen","labels":{"en":"Air or oxygen","ar":"هواء أم أكسجين"},"input":"choice","choices":[
   {"value":"air","points":0,"labels":{"en":"Air","ar":"هواء الغرفة"}},{"value":"oxygen","points":2,"labels":{"en":"Oxygen","ar":"أكسجين"}}]},
  {"key":"sbp","labels":{"en":"Systolic blood pressure","ar":"الضغط الانقباضي"},"input":"number","unit":"mmHg","decimals":0,"min":40,"max":300,
   "ranges":[{"max":90,"points":3},{"min":91,"max":100,"points":2},{"min":101,"max":110,"points":1},{"min":111,"max":219,"points":0},{"min":220,"points":3}]},
  {"key":"pulse","labels":{"en":"Pulse","ar":"النبض"},"input":"number","unit":"/min","decimals":0,"min":20,"max":300,
   "ranges":[{"max":40,"points":3},{"min":41,"max":50,"points":1},{"min":51,"max":90,"points":0},{"min":91,"max":110,"points":1},{"min":111,"max":130,"points":2},{"min":131,"points":3}]},
  {"key":"consciousness","labels":{"en":"Consciousness (ACVPU)","ar":"الوعي"},"input":"choice","choices":[
   {"value":"a","points":0,"labels":{"en":"Alert","ar":"واعٍ"}},{"value":"c","points":3,"labels":{"en":"New confusion","ar":"تشوش جديد"}},
   {"value":"v","points":3,"labels":{"en":"Voice","ar":"يستجيب للصوت"}},{"value":"p","points":3,"labels":{"en":"Pain","ar":"يستجيب للألم"}},
   {"value":"u","points":3,"labels":{"en":"Unresponsive","ar":"لا يستجيب"}}]},
  {"key":"temp","labels":{"en":"Temperature","ar":"الحرارة"},"input":"number","unit":"°C","decimals":1,"min":25.0,"max":45.0,
   "ranges":[{"max":35.0,"points":3},{"min":35.1,"max":36.0,"points":1},{"min":36.1,"max":38.0,"points":0},{"min":38.1,"max":39.0,"points":1},{"min":39.1,"points":2}]}]$j$,
  $j$[{"key":"low","labels":{"en":"Low · scale 2","ar":"منخفض · المقياس ٢"},"min":0,"max":4,"tone":null},
    {"key":"medium","labels":{"en":"Medium · scale 2","ar":"متوسط · المقياس ٢"},"min":5,"max":6,"tone":"warn"},
    {"key":"high","labels":{"en":"High · scale 2","ar":"مرتفع · المقياس ٢"},"min":7,"max":20,"tone":"danger"}]$j$,
  '{"en":"NEWS2 (SpO₂ scale 2: target 88–92 %)","ar":"مقياس الإنذار المبكر NEWS2 (المقياس ٢)"}', 'NEWS2', 'news2s2');

-- ── the drug round (spec §5.6, piece 3): each dose the base's given as Ward nursing's dose, naming the time it is for; the ward's
-- dose times a setting; one reading of a stay's medicines and doses for the round, the sheet and the board ──
set role pack_bedside;

-- the clinic's zone (its days and the ward's times are the clinic's)
create function bedside.tz(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo')
$$;
-- a prescription's timing in the round's words: the composer's codes (OD, BD, TDS, QDS, q6h) and HL7's (QD, BID, TID, QID, Q6H) alike,
-- as the base's FHIR reads them; anything else as written (weekly has no ward times); none, null
create function bedside.timing(p_code text) returns text language sql immutable security definer set search_path = '' as $$
  select case upper(coalesce(p_code, '')) when '' then null when 'OD' then 'OD' when 'QD' then 'OD' when 'BD' then 'BD' when 'BID' then 'BD'
    when 'TDS' then 'TDS' when 'TID' then 'TDS' when 'QDS' then 'QDS' when 'QID' then 'QDS' when 'Q4H' then 'q4h' when 'Q6H' then 'q6h'
    when 'Q8H' then 'q8h' when 'Q12H' then 'q12h' when 'STAT' then 'stat' when 'ONCE' then 'once' else p_code end
$$;
-- half the time between two doses of a timing: a dose recorded without its time counts for the nearest time within it
create function bedside.half(p_timing text) returns interval language sql immutable security definer set search_path = '' as $$
  select make_interval(hours => case p_timing when 'BD' then 6 when 'q12h' then 6 when 'TDS' then 4 when 'q8h' then 4
    when 'QDS' then 3 when 'q6h' then 3 when 'q4h' then 2 else 12 end)
$$;
-- how long after a first dose its own ward times stand under it (R5): three quarters of the interval; once a day half a day, so a
-- first dose after 14:00 keeps the next morning's (three quarters would leave 40 hours between two doses)
create function bedside.cover(p_timing text) returns interval language sql immutable security definer set search_path = '' as $$
  select make_interval(mins => case p_timing when 'OD' then 720 when 'BD' then 540 when 'q12h' then 540 when 'TDS' then 360 when 'q8h' then 360
    when 'QDS' then 270 when 'q6h' then 270 when 'q4h' then 180 else 0 end)
$$;
-- doses a day of a timing (once 1, twice and every 12 hours 2, three times and every 8 hours 3, four times and every 6 hours 4, every
-- 4 hours 6): the ward's times it takes, and a course of n days is n times it; any other, null
create function bedside.per_day(p_timing text) returns int language sql immutable security definer set search_path = '' as $$
  select case p_timing when 'OD' then 1 when 'BD' then 2 when 'q12h' then 2 when 'TDS' then 3 when 'q8h' then 3 when 'QDS' then 4
    when 'q6h' then 4 when 'q4h' then 6 end
$$;
-- the ward's drug round as it stands: its setting over the starter's (the setting's own defaults: the suite holds the two equal)
create function bedside.round_of(p_org uuid, p_department uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select $j${"times":[{"timing":"OD","at":"08:00"},{"timing":"BD","at":"08:00 20:00"},{"timing":"q12h","at":"08:00 20:00"},
    {"timing":"TDS","at":"06:00 14:00 22:00"},{"timing":"q8h","at":"06:00 14:00 22:00"},{"timing":"QDS","at":"06:00 12:00 18:00 00:00"},
    {"timing":"q6h","at":"02:00 08:00 14:00 20:00"}],"late_after":60,"night":"22:00"}$j$::jsonb
    || coalesce(core.setting_at(p_org, 'bedside.round', p_department), '{}'::jsonb)
$$;
-- the dose times as a ward sets them: each timing once; as many times as it gives in a day (once 1, twice and every 12 hours 2, three
-- times and every 8 hours 3, four times and every 6 hours 4, every 4 hours 6); each time once; every n hours n hours apart
create function bedside.round_check(p_where jsonb, p_data jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; i int := -1; n int; v_seen text[] := '{}'; v_mins int[]; out jsonb := '[]';
begin
  for r in select x from jsonb_array_elements(coalesce(p_data -> 'times', '[]'::jsonb)) x loop
    i := i + 1;
    if r ->> 'timing' = any (v_seen) then
      out := out || jsonb_build_object('code', 'duplicate', 'level', 'refuse', 'field', format('times.%s.timing', i)); continue;
    end if;
    v_seen := v_seen || (r ->> 'timing');
    n := bedside.per_day(r ->> 'timing');
    v_mins := array(select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int from regexp_split_to_table(trim(r ->> 'at'), '\s+') t order by 1);
    if cardinality(v_mins) <> n then
      out := out || jsonb_build_object('code', 'wrong_count', 'level', 'refuse', 'field', format('times.%s.at', i), 'detail', n::text); continue;
    end if;
    if (select count(distinct m) from unnest(v_mins) m) <> n then
      out := out || jsonb_build_object('code', 'duplicate', 'level', 'refuse', 'field', format('times.%s.at', i)); continue;
    end if;
    if r ->> 'timing' in ('q4h', 'q6h', 'q8h', 'q12h') and exists (select 1 from generate_subscripts(v_mins, 1) k
        where coalesce(v_mins[k + 1], v_mins[1] + 1440) - v_mins[k] <> 1440 / n) then
      out := out || jsonb_build_object('code', 'not_every', 'level', 'refuse', 'field', format('times.%s.at', i));
    end if;
  end loop;
  return out;
end $$;

-- one stay's medicines and their times between two moments, as the reader may see them (the round's rule, spec §5.6, piece 3):
--  · its medicines: prescribed, still on the list, with a version written in this stay; from that version on, each version holds
--    from its time until the next. Every other current prescription is listed with no times (not prescribed in this stay);
--  · their times: the ward's for the timing each day (a once-a-day one prescribed "at night" at the ward's night time), within an
--    active version, at or after its time; a course is its days times the timing's doses a day, counted from its first time here;
--    as needed, none;
--  · a medicine first prescribed in this stay, not at night, starts with its first dose when it was signed, standing for its own
--    times from the late time before it to the greater of twice the late time and the timing's cover after it; stat and once are
--    that dose alone;
--  · a dose recorded for it takes the time it names (a dose given before one not given, then the first), else the nearest free time
--    within half the timing's interval; one dose a time, the nearest; the rest are extra;
--  · each time: given · not given · upcoming (until an hour before it; a first dose, until it was signed) · due (until the late
--    time after it) · late (within a day) · missed; a time of a medicine no longer active, unrecorded, is missed (never due or late).
-- now is the caller's. It names no table: the doors read for the reader
create function bedside.stay_doses(p_org uuid, p_patient uuid, p_stay uuid, p_from timestamptz, p_to timestamptz, p_now timestamptz,
  p_round jsonb, p_zone text) returns jsonb language sql stable security definer set search_path = '' as $$
  with cfg as (
    select make_interval(mins => coalesce((p_round ->> 'late_after')::int, 60)) as late, coalesce(nullif(p_round ->> 'night', ''), '22:00')::time as night),
  tim as (
    select r ->> 'timing' as timing, t::time as hm
      from jsonb_array_elements(coalesce(p_round -> 'times', '[]'::jsonb)) r, regexp_split_to_table(trim(r ->> 'at'), '\s+') t where t <> ''),
  live as (    -- each medicine still on the list, its latest version
    select x.item, x.id, x.occurred_at, x.data from core.pack_kind(p_org, p_patient, 'medication', '{"current":true}'::jsonb) x),
  ver as (
    select x.id, x.item, x.item_version, x.occurred_at, x.visit_id, x.data, bedside.timing(x.data -> 'dosage' -> 'timing' ->> 'code') as timing,
           coalesce((x.data -> 'dosage' ->> 'as_needed')::boolean, false) as prn
      from core.pack_kind(p_org, p_patient, 'medication', '{"limit":2000}'::jsonb) x
     where x.item in (select l.item from live l) and x.data ->> 'basis' = 'prescribed'),
  mine as (
    select v.item, min(v.item_version) as first_v from ver v where v.visit_id = p_stay group by v.item),
  per as (     -- night_dose is never null: a medicine with no timing is not a night one (it is "times not set")
    select v.*, lead(v.occurred_at) over (partition by v.item order by v.item_version) as until,
           coalesce(v.timing = 'OD', false) and lower(coalesce(v.data ->> 'instructions', '')) like 'at night%' as night_dose
      from ver v join mine m on m.item = v.item and v.item_version >= m.first_v),
  med as (
    select l.item, l.id as version, l.occurred_at as since, l.data, l.timing, l.prn, l.night_dose, m.first_v = 1 as new_here,
           (select min(v.occurred_at) from ver v where v.item = m.item) as started,
           bedside.per_day(l.timing) * case when l.data ->> 'duration_days' ~ '^\d+$' then (l.data ->> 'duration_days')::int end as course_n
      from mine m join lateral (select p.* from per p where p.item = m.item order by p.item_version desc limit 1) l on true),
  away as (    -- a current prescription with no version in this stay: listed, never timed, never late
    select l.item, l.id as version, l.occurred_at as since, l.data, bedside.timing(l.data -> 'dosage' -> 'timing' ->> 'code') as timing,
           coalesce((l.data -> 'dosage' ->> 'as_needed')::boolean, false) as prn
      from live l where l.data ->> 'basis' = 'prescribed' and l.data ->> 'status' = 'active' and not exists (select 1 from mine m where m.item = l.item)),
  days as (    -- from the stay's first prescribing (a course counts from it), or two days before the window, to a day after it
    select g::date as d
      from generate_series(least((p_from at time zone p_zone)::date - 2,
                                 coalesce(((select min(p.occurred_at) from per p) at time zone p_zone)::date, (p_from at time zone p_zone)::date - 2))::timestamp,
                           ((p_to at time zone p_zone)::date + 1)::timestamp, interval '1 day') g),
  sch as (
    select p.item, ((dd.d + t.hm) at time zone p_zone) as due
      from per p cross join cfg c cross join days dd
      join lateral (select x.hm from tim x where x.timing = p.timing and not p.night_dose union all select c.night where p.night_dose) t on true
     where p.data ->> 'status' = 'active' and not p.prn
       and ((dd.d + t.hm) at time zone p_zone) >= p.occurred_at and (p.until is null or ((dd.d + t.hm) at time zone p_zone) < p.until)),
  fst as (     -- the first dose: signed in this stay, not as needed, not at night
    select p.item, p.occurred_at as due, p.timing from per p
     where p.item_version = 1 and p.data ->> 'status' = 'active' and not p.prn and not p.night_dose
       and (p.timing in ('stat', 'once') or exists (select 1 from tim x where x.timing = p.timing))),
  slot as (
    select s.item, s.due, false as is_first from sch s cross join cfg c
     where not exists (select 1 from fst f where f.item = s.item and s.due > f.due - c.late
                         and s.due <= f.due + greatest(2 * c.late, bedside.cover(f.timing)))
    union all
    select f.item, f.due, true from fst f),
  win as (     -- the course's times (counted from its first), those doses are matched to: the window and a day each side
    select r.item, r.due, r.is_first
      from (select s.*, row_number() over (partition by s.item order by s.due) as n from slot s) r join med m on m.item = r.item
     where (m.course_n is null or r.n <= m.course_n) and r.due >= p_from - interval '1 day' and r.due < p_to + interval '1 day'),
  dose as (    -- the doses naming one of these medicines (a transfusion or a vaccine dose, extending given too, never does)
    select x.id, x.occurred_at as given_at, x.author_id, x.data, (x.data ->> 'medication')::uuid as medication,
           case when x.data -> 'bedside' ->> 'due' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then (x.data -> 'bedside' ->> 'due')::timestamptz end as named
      from core.pack_kind(p_org, p_patient, 'given', jsonb_build_object('current', true, 'from', p_from - interval '2 days', 'to', p_to + interval '2 days', 'limit', 2000)) x
     where x.data ->> 'medication' in (select m.item::text from mine m union all select a.item::text from away a)),
  took1 as (   -- a dose that names its time takes it; two naming one: a dose given before one not given, then the first given
    select distinct on (w.item, w.due) w.item, w.due, d.id as dose
      from win w join dose d on d.medication = w.item and d.named = w.due
     order by w.item, w.due, (d.data ->> 'status' = 'completed') desc, d.given_at, d.id),
  near as (    -- each other dose: the nearest free time of its medicine within half the interval; a dose naming one of its times that
               -- another dose outranked is extra, never matched by nearness
    select distinct on (d.id) d.id as dose, w.item, w.due, abs(extract(epoch from d.given_at - w.due)) as gap, d.given_at
      from dose d join win w on w.item = d.medication join med m on m.item = w.item
     where not exists (select 1 from took1 k where k.dose = d.id) and not exists (select 1 from took1 k where k.item = w.item and k.due = w.due)
       and (d.named is null or not exists (select 1 from win w2 where w2.item = d.medication and w2.due = d.named))
       and abs(extract(epoch from d.given_at - w.due)) <= extract(epoch from bedside.half(m.timing))
     order by d.id, gap, w.due),
  took2 as (   -- one dose a time: the nearest
    select distinct on (n.item, n.due) n.item, n.due, n.dose from near n order by n.item, n.due, n.gap, n.given_at, n.dose),
  took as (
    select item, due, dose from took1 union all select item, due, dose from took2),
  res as (
    select w.item, w.due, w.is_first, t.dose, d.data as dd, d.given_at, d.author_id,
           case when t.dose is not null then case when d.data ->> 'status' = 'not-done' then 'not_given' else 'given' end
                when p_now < case when w.is_first then w.due else w.due - interval '1 hour' end then 'upcoming'
                when md.data ->> 'status' <> 'active' then 'missed'   -- a medicine since stopped or held: never due or late
                when p_now < w.due + c.late then 'due'
                when w.due >= p_now - interval '24 hours' then 'late'
                else 'missed' end as state
      from win w cross join cfg c join med md on md.item = w.item left join took t on t.item = w.item and t.due = w.due left join dose d on d.id = t.dose
     where w.due >= p_from and w.due < p_to),
  extra as (   -- each medicine's doses that took no time, within the window
    select d.medication, jsonb_agg(jsonb_strip_nulls(jsonb_build_object('dose', d.id, 'at', d.given_at, 'by', d.author_id, 'status', d.data ->> 'status',
             'not_given', d.data -> 'bedside' ->> 'not_given', 'site', d.data ->> 'site')) order by d.given_at) as doses
      from dose d where not exists (select 1 from took t where t.dose = d.id) and d.given_at >= p_from and d.given_at < p_to group by d.medication)
  select coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'medication', m.item, 'version', m.version, 'since', m.since, 'started', m.started, 'new', m.new_here,
      'drug', m.data -> 'drug', 'dose', m.data -> 'dosage' -> 'dose', 'route', m.data -> 'dosage' ->> 'route', 'text', m.data -> 'dosage' ->> 'text',
      'timing', m.timing, 'night', m.night_dose, 'prn', m.prn, 'prn_for', m.data -> 'dosage' ->> 'as_needed_for',
      'instructions', m.data ->> 'instructions', 'status', m.data ->> 'status', 'course', m.course_n,
      'unset', m.data ->> 'status' = 'active' and not m.prn and coalesce(m.timing, '') not in ('stat', 'once') and not m.night_dose
               and not exists (select 1 from tim x where x.timing = m.timing),
      'slots', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('due', o.due, 'first', nullif(o.is_first, false), 'state', o.state,
                  'dose', o.dose, 'at', o.given_at, 'by', o.author_id, 'not_given', o.dd -> 'bedside' ->> 'not_given', 'site', o.dd ->> 'site')) order by o.due), '[]'::jsonb)
                  from res o where o.item = m.item),
      'extra', coalesce((select e.doses from extra e where e.medication = m.item), '[]'::jsonb)
    )) order by lower(m.data -> 'drug' ->> 'text'), m.item) from med m), '[]'::jsonb)
  || coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'medication', a.item, 'version', a.version, 'since', a.since, 'elsewhere', true,
      'drug', a.data -> 'drug', 'dose', a.data -> 'dosage' -> 'dose', 'route', a.data -> 'dosage' ->> 'route', 'text', a.data -> 'dosage' ->> 'text',
      'timing', a.timing, 'prn', a.prn, 'prn_for', a.data -> 'dosage' ->> 'as_needed_for', 'instructions', a.data ->> 'instructions',
      'status', a.data ->> 'status', 'slots', '[]'::jsonb,
      'extra', coalesce((select e.doses from extra e where e.medication = a.item), '[]'::jsonb)
    )) order by lower(a.data -> 'drug' ->> 'text'), a.item) from away a), '[]'::jsonb)
$$;

-- a dose on the round: not given says why, in one of the round's six reasons, and a dose given has none; the medicine it names is
-- this patient's. Nothing clinical stops it: a late dose, a dose unlike the prescription, a medicine since stopped, all land (spec §5.6: shown, never a stop)
create function bedside.dose_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := p_entry -> 'data'; v_org uuid := (p_entry ->> 'organization_id')::uuid; v_med text := p_entry -> 'data' ->> 'medication'; out jsonb := '[]';
begin
  if d ->> 'status' = 'not-done' and coalesce(d -> 'bedside' ->> 'not_given', '') = '' then
    out := out || jsonb_build_object('code', 'reason_missing', 'level', 'refuse');
  end if;
  if d ->> 'status' = 'completed' and d -> 'bedside' ? 'not_given' then
    out := out || jsonb_build_object('code', 'reason_on_given', 'level', 'refuse');
  end if;
  if coalesce(v_med, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    out := out || jsonb_build_object('code', 'not_a_medicine', 'level', 'refuse');
  elsif not exists (select 1 from core.pack_entries(v_org, array[v_med::uuid]) m where m.item = v_med::uuid and m.type = any (core.kinds('medication'))
                      and m.patient_id = any (core.family(v_org, (p_entry ->> 'patient_id')::uuid)))
    and not exists (select 1 from jsonb_array_elements(p_set) x where x ->> 'id' = v_med and core.base_of(x ->> 'type') = 'medication') then
    out := out || jsonb_build_object('code', 'not_a_medicine', 'level', 'refuse');
  end if;
  return out;
end $$;
-- its line: "Given: Paracetamol 1 g iv · the 14:00 dose"; "Not given: Paracetamol iv · Refused · the 20:00 dose"
create function bedside.dose_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when e -> 'data' ->> 'status' = 'not-done' then 'Not given: ' else 'Given: ' end || coalesce(e -> 'data' -> 'drug' ->> 'text', 'medication')
    || coalesce(' ' || (e -> 'data' -> 'dose' ->> 'value') || coalesce(' ' || nullif(coalesce(e -> 'data' -> 'dose' ->> 'unit', e -> 'data' -> 'dose' ->> 'ucum'), ''), ''), '')
    || coalesce(' ' || nullif(e -> 'data' ->> 'route', ''), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'site', ''), '')
    || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
    || case when e -> 'data' -> 'bedside' ->> 'due' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
         then ' · the ' || to_char((e -> 'data' -> 'bedside' ->> 'due')::timestamptz at time zone bedside.tz((e ->> 'organization_id')::uuid), 'HH24:MI') || ' dose'
         else '' end
$$;
-- its FHIR beside the base's MedicationAdministration (§5.2 Export: the base maps it as the given it extends; this only adds): request,
-- the prescription it was given on: the medicine's version standing when it was given, else its first
create function bedside.dose_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p ->> 'org')::uuid; o jsonb; v_med uuid; v_rx uuid;
begin
  select e into o from jsonb_array_elements(p -> 'entries') with ordinality x(e, n) where e ->> 'type' <> 'crossed_out' order by n desc limit 1;
  if o is null or coalesce(o -> 'data' ->> 'medication', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return '[]'; end if;
  v_med := (o -> 'data' ->> 'medication')::uuid;
  select m.id into v_rx from core.pack_entries(v_org, array[v_med]) m
   where m.item = v_med and m.type = any (core.kinds('medication')) and m.data ->> 'basis' = 'prescribed'
   order by (m.occurred_at <= (o ->> 'occurred_at')::timestamptz) desc,
            case when m.occurred_at <= (o ->> 'occurred_at')::timestamptz then m.occurred_at end desc nulls last, m.item_version
   limit 1;
  if v_rx is null then return '[]'; end if;
  return jsonb_build_array(jsonb_build_object('resourceType', 'MedicationAdministration', 'id', p -> 'entries' -> 0 ->> 'item',
    'request', jsonb_build_object('reference', 'MedicationRequest/' || v_rx)));
end $$;

-- the Drug round tab's read: every stay admitted here (read here, never ids from the client) and its medicines' times from 25 hours ago
-- to 2 hours ahead; the round's time (the latest of the ward's times whose hour has come) and when it opened; each patient read-logged
create function bedside.round(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; v_now timestamptz := coalesce((p_args ->> 'now')::timestamptz, now()); v_round jsonb := bedside.round_of(p_org, p_department);
        v_zone text := bedside.tz(p_org); v_today date; v_at timestamptz; v_ids uuid[] := '{}'; v_stays jsonb := '[]';
begin
  v_today := (v_now at time zone v_zone)::date;
  select max(x.t) into v_at from (
    select ((v_today + k) + h.hm) at time zone v_zone as t from generate_series(-1, 1) k,
      (select distinct z::time as hm from jsonb_array_elements(coalesce(v_round -> 'times', '[]'::jsonb)) r, regexp_split_to_table(trim(r ->> 'at'), '\s+') z
       union select coalesce(nullif(v_round ->> 'night', ''), '22:00')::time) h) x
   where x.t - interval '1 hour' <= v_now;
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_ids := v_ids || (s ->> 'patient_id')::uuid;
    v_stays := v_stays || jsonb_build_array(jsonb_build_object('stay', s ->> 'item', 'patient_id', s ->> 'patient_id', 'place_id', s ->> 'place_id',
      'medicines', bedside.stay_doses(p_org, (s ->> 'patient_id')::uuid, (s ->> 'item')::uuid, v_now - interval '25 hours', v_now + interval '2 hours', v_now, v_round, v_zone)));
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'now', v_now, 'round_at', v_at, 'opens_at', coalesce(v_at, v_now) - interval '1 hour',
    'late_after', coalesce((v_round ->> 'late_after')::int, 60), 'stays', v_stays);
end $$;
-- the stay's treatment sheet: one stay of this department (read here) and its medicines' times today, yesterday or the whole stay, by the
-- clinic's days; a stay elsewhere answers nothing
create function bedside.sheet(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; v_now timestamptz := coalesce((p_args ->> 'now')::timestamptz, now()); v_zone text := bedside.tz(p_org); v_day text := coalesce(p_args ->> 'day', 'today');
        v_today date; v_from timestamptz; v_to timestamptz;
begin
  if v_day not in ('today', 'yesterday', 'stay') then perform core.refuse('unknown_day', v_day); end if;
  if coalesce(p_args ->> 'stay', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform core.refuse('unknown_stay', coalesce(p_args ->> 'stay', 'none'));
  end if;
  select r into s from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('item', p_args ->> 'stay', 'department_id', p_department, 'kind', 'stay'))) r limit 1;
  if s is null then return jsonb_build_object('patient_ids', '[]'::jsonb, 'stay', null); end if;
  v_today := (v_now at time zone v_zone)::date;
  v_from := case v_day when 'today' then v_today::timestamp at time zone v_zone when 'yesterday' then (v_today - 1)::timestamp at time zone v_zone
                       else (s ->> 'checked_in_at')::timestamptz end;
  v_to := case v_day when 'yesterday' then v_today::timestamp at time zone v_zone else (v_today + 1)::timestamp at time zone v_zone end;
  return jsonb_build_object('patient_ids', jsonb_build_array(s ->> 'patient_id'), 'stay', s ->> 'item', 'day', v_day, 'from', v_from, 'to', v_to, 'now', v_now,
    'medicines', bedside.stay_doses(p_org, (s ->> 'patient_id')::uuid, (s ->> 'item')::uuid, v_from, v_to, v_now, bedside.round_of(p_org, p_department), v_zone));
end $$;
reset role;

select core.declare_action('write:bedside.dose', 'bedside', 'department', '{"en":"Give doses on the drug round","ar":"إعطاء الجرعات"}', everyday => true);
select core.declare_type('bedside.dose', 1, 'bedside', $j${"type":"object","additionalProperties":false,"required":["status","medication"],
    "properties":{"medication":{"type":"string","format":"uuid"},"drug":{"$ref":"#/$defs/concept"},"dose":{"$ref":"#/$defs/quantity"},
      "route":{"type":"string"},"site":{"type":"string"},"lot":{"type":"string"},"expiry":{"type":"string"},"status":{"enum":["completed","not-done"]},
      "reason":{"type":"string"},"note":{"type":"string"},
      "bedside":{"type":"object","additionalProperties":false,"properties":{"due":{"$ref":"#/$defs/datetime"},
        "not_given":{"enum":["refused","fasting","vomiting","not_in_stock","held","away"]}}}}}$j$::jsonb,
  'bedside.dose_line(jsonb)', array['MedicationAdministration'], base_type => 'given', to_fhir => 'bedside.dose_fhir(jsonb)',
  checks => array['bedside.dose_check(jsonb,jsonb)']::regprocedure[], labels => '{"en":"Dose","ar":"جرعة"}');
select core.declare_setting('bedside.round', 'bedside', 'department', $j${"type":"object","additionalProperties":false,"required":["times","late_after"],
    "properties":{"times":{"type":"array","maxItems":8,"items":{"type":"object","additionalProperties":false,"required":["timing","at"],
        "properties":{"timing":{"enum":["OD","BD","q12h","TDS","q8h","QDS","q6h","q4h"]},
          "at":{"type":"string","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]( ([01][0-9]|2[0-3]):[0-5][0-9]){0,5}$"}}},
      "default":[{"timing":"OD","at":"08:00"},{"timing":"BD","at":"08:00 20:00"},{"timing":"q12h","at":"08:00 20:00"},{"timing":"TDS","at":"06:00 14:00 22:00"},
        {"timing":"q8h","at":"06:00 14:00 22:00"},{"timing":"QDS","at":"06:00 12:00 18:00 00:00"},{"timing":"q6h","at":"02:00 08:00 14:00 20:00"}]},
      "late_after":{"type":"integer","minimum":30,"maximum":180,"default":60},
      "night":{"type":"string","pattern":"^([01][0-9]|2[0-3]):[0-5][0-9]$","default":"22:00"}}}$j$::jsonb,
  'bedside.round_check(jsonb,jsonb)', labels => '{"en":"Drug round","ar":"جولة الأدوية"}', form => 'department',
  fields => $j$[{"key":"times","labels":{"en":"Dose times"},"help":{"en":"The ward's times for each timing a doctor writes. A dose shows as due from an hour before its time."}},
    {"key":"times.timing","labels":{"en":"Timing"},"choices":{"OD":{"en":"Once a day"},"BD":{"en":"Twice a day"},"q12h":{"en":"Every 12 hours"},
      "TDS":{"en":"Three times a day"},"q8h":{"en":"Every 8 hours"},"QDS":{"en":"Four times a day"},"q6h":{"en":"Every 6 hours"},"q4h":{"en":"Every 4 hours"}}},
    {"key":"times.at","labels":{"en":"At"},"help":{"en":"Times as 08:00, a space between: 06:00 14:00 22:00"}},
    {"key":"late_after","labels":{"en":"A dose is late after"},"unit":"min","help":{"en":"After its time: 30 to 180 minutes."}},
    {"key":"night","labels":{"en":"At night"},"help":{"en":"When a once-a-day medicine prescribed at night is given."}}]$j$::jsonb);
select core.declare_screen('bedside.round', 'bedside', 'stays', '{"en":"Drug round","ar":"جولة الأدوية"}', 'read:record');
select core.declare_op('bedside.round', 'bedside', 'bedside.round(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);
select core.declare_op('bedside.sheet', 'bedside', 'bedside.sheet(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- ── its starter setup (§5.2): the base's ward with Ward nursing ticked — eight beds, inpatient stays, the bed board and the Drug round
-- tab. Served on the base's Medical Ward, its beds, encounter class and review level are already the same: only the tick and the line
-- are added ──
select core.declare_setup('bedside.ward', 'bedside', 'stays', '{"en":"Ward with Ward nursing","ar":"قسم داخلي بتمريض الأقسام"}', packs => array['bedside'],
  screens => '{"screens":["base.beds","bedside.round"],"opens":"base.beds"}',
  settings => '{"department.encounter_class":{"class":"IMP"},"department.review_results":{"level":"critical"}}',
  places => (select jsonb_agg(jsonb_build_object('key', 'bed_' || n, 'name', 'Bed ' || n, 'label', 'bed') order by n) from generate_series(1, 8) n),
  help => '{"en":"Eight beds on the board, inpatient stays, and Ward nursing: NEWS2 with every full set of obs on /v, and the drug round on its own tab."}');

-- ── the board's words (the owner's C1, 2026-10-08): each stay admitted here and its latest NEWS2 written in it, as the reader may see
-- it (the doors mask; a hidden entry comes back without its data and is passed over). This department's stays only, read here, never
-- ids from the client; each patient it names is read-logged by the door. And its doses (piece 3): how many are late (within a day)
-- and due (within the hour), and how many of its medicines have no times set ──
set role pack_bedside;
create function bedside.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; n record; v_ids uuid[] := '{}'; v_news jsonb := '{}'; v_doses jsonb := '{}'; v_md jsonb; v_late int; v_due int; v_unset int;
        v_now timestamptz := coalesce((p_args ->> 'now')::timestamptz, now()); v_round jsonb := bedside.round_of(p_org, p_department); v_zone text := bedside.tz(p_org);
begin
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_ids := v_ids || (s ->> 'patient_id')::uuid;
    select x.data, x.occurred_at into n from core.pack_kind(p_org, (s ->> 'patient_id')::uuid, 'score', '{"current":true}'::jsonb) x
     where x.visit_id = (s ->> 'item')::uuid and x.data ->> 'score' in ('bedside.news2', 'bedside.news2_s2')
     order by x.occurred_at desc, x.recorded_at desc, x.id desc limit 1;
    if found then
      v_news := v_news || jsonb_build_object(s ->> 'item', jsonb_build_object('score', n.data ->> 'score', 'version', n.data ->> 'version',
        'total', (n.data ->> 'total')::int, 'band', n.data ->> 'band', 'at', n.occurred_at));
    end if;
    v_md := bedside.stay_doses(p_org, (s ->> 'patient_id')::uuid, (s ->> 'item')::uuid, v_now - interval '25 hours', v_now + interval '2 hours', v_now, v_round, v_zone);
    select count(*) filter (where x ->> 'state' = 'late'), count(*) filter (where x ->> 'state' = 'due') into v_late, v_due
      from jsonb_array_elements(v_md) md, jsonb_array_elements(md -> 'slots') x;
    select count(*) into v_unset from jsonb_array_elements(v_md) md where (md ->> 'unset')::boolean;
    if v_late + v_due + v_unset > 0 then
      v_doses := v_doses || jsonb_build_object(s ->> 'item', jsonb_build_object('late', v_late, 'due', v_due, 'unset', v_unset));
    end if;
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'news2', v_news, 'doses', v_doses);
end $$;
reset role;
select core.declare_op('bedside.board', 'bedside', 'bedside.board(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

select core.lock_pack('bedside');
