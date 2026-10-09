-- 26 · the paediatrics pack, key paeds (spec/openCare.md §5.8; the pictures /pictures.html#paeds-growth, #paeds-dose, #paeds-develop, #paeds-ward).
-- Growth on the WHO charts from the base's own vitals (weight, length, head: the base's keys), worked out here and nowhere else: each
-- measurement of a child gets its z-scores and centiles for the age on the day and the sex, from the loaded WHO tables (a reference
-- list, `paeds.who_growth`, L, M and S by age or by length; the demo loads birth to 2 years, marked a demo sample), kept with the
-- tables' version in its own table; the composer's line under /v asks the same sums while the doctor types (its op). The dose per kg
-- under /rx reads the clinic's own dose list (a setting) and stores nothing. Development is its own type, extending the base's
-- observation (the age, the list's version, each milestone yes or not yet), the milestones the clinic's list (a setting, started from
-- the CDC's 2022 list). The newborn checks are base entries (observations by its own codes, a bilirubin result). The children's ward
-- is the base's board with its line (the weight and its age, Holliday–Segar's maintenance, worked out in the client from the weight);
-- the Brighton PEWS is a declared score.

set client_min_messages = warning;

select core.declare_pack('paeds', 1, '{}', '{"en":"Paediatrics","ar":"الأطفال"}', role_block => 'e3');
select core.create_pack('paeds');

-- its reference list and its own codes, declared before its functions read them
select core.declare_system('paeds.who_growth', 'paeds', 'code', 'https://www.who.int/tools/child-growth-standards', '2006', true, null,
  'WHO Child Growth Standards 2006 (birth to 5 years; WHO Growth Reference 2007, 5 to 19): free to use with attribution; loaded per installation (L, M, S by age in months or by length in cm)',
  '{"en":"WHO growth tables (LMS)"}');
select core.declare_system('paeds.newborn', 'paeds', 'code', '{canon}/CodeSystem/paeds-newborn', '1', true, null, 'openCare: the newborn checks',
  '{"en":"Newborn checks"}');
insert into core.codes (system, code, labels) values
  ('paeds.newborn', 'birth', '{"en":"Birth"}'), ('paeds.newborn', 'heel_prick', '{"en":"Heel prick"}'),
  ('paeds.newborn', 'hearing', '{"en":"Hearing"}'), ('paeds.newborn', 'hips', '{"en":"Hips"}'),
  ('paeds.newborn', 'eyes', '{"en":"Eyes"}'), ('paeds.newborn', 'jaundice', '{"en":"Jaundice"}')
on conflict do nothing;

set role pack_paeds;

-- ── the WHO sums ──
-- a table's code: the indicator, the sex, the age in whole months (wfa, lfa, hcfa) or the length to half a centimetre (wfl)
create function paeds.code_of(p_ind text, p_sex text, p_x numeric) returns text language sql immutable security definer set search_path = '' as $$
  select p_ind || '.' || p_sex || '.' || case when p_ind = 'wfl' then trim(to_char(p_x, 'FM9990.0')) else (p_x::int)::text end
$$;
-- L, M and S at a point between two rows of the table, in proportion; null outside the loaded table
create function paeds.lms(p_ind text, p_sex text, p_x numeric) returns numeric[] language plpgsql stable security definer set search_path = '' as $$
declare v_step numeric := case when p_ind = 'wfl' then 0.5 else 1 end; v_lo numeric; a jsonb; b jsonb; f numeric;
begin
  if p_x is null or p_x < 0 or p_sex not in ('m', 'f') then return null; end if;
  v_lo := floor(p_x / v_step) * v_step; f := (p_x - v_lo) / v_step;
  select c.props into a from core.pack_codes('paeds.who_growth', array[paeds.code_of(p_ind, p_sex, v_lo)]) c where not c.retired;
  if a is null then return null; end if;
  if f = 0 then return array[(a ->> 'L')::numeric, (a ->> 'M')::numeric, (a ->> 'S')::numeric]; end if;
  select c.props into b from core.pack_codes('paeds.who_growth', array[paeds.code_of(p_ind, p_sex, v_lo + v_step)]) c where not c.retired;
  if b is null then return null; end if;
  return array[(a ->> 'L')::numeric + f * ((b ->> 'L')::numeric - (a ->> 'L')::numeric), (a ->> 'M')::numeric + f * ((b ->> 'M')::numeric - (a ->> 'M')::numeric),
               (a ->> 'S')::numeric + f * ((b ->> 'S')::numeric - (a ->> 'S')::numeric)];
end $$;
-- the z-score by the LMS method; beyond ±3 the WHO's restricted way (the distance between the 2 and 3 SD lines), as its own software does
create function paeds.z(p_v numeric, p numeric[]) returns numeric language plpgsql immutable security definer set search_path = '' as $$
declare l numeric; m numeric; s numeric; z numeric; sd3 numeric; sd2 numeric;
begin
  if p_v is null or p is null or p_v <= 0 then return null; end if;
  l := p[1]; m := p[2]; s := p[3];
  z := case when l = 0 then ln(p_v / m) / s else (power(p_v / m, l) - 1) / (l * s) end;
  if z > 3 then
    sd3 := m * power(1 + l * s * 3, 1 / l); sd2 := m * power(1 + l * s * 2, 1 / l); z := 3 + (p_v - sd3) / (sd3 - sd2);
  elsif z < -3 then
    sd3 := m * power(1 + l * s * -3, 1 / l); sd2 := m * power(1 + l * s * -2, 1 / l); z := -3 + (p_v - sd3) / (sd2 - sd3);
  end if;
  return round(z, 2);
end $$;
-- the centile of a z-score: the normal distribution (Abramowitz and Stegun 26.2.17, within 1 in 10 million), in whole centiles
create function paeds.centile(p_z numeric) returns numeric language plpgsql immutable security definer set search_path = '' as $$
declare x float8 := abs(p_z); t float8; d float8; p float8;
begin
  if p_z is null then return null; end if;
  t := 1 / (1 + 0.2316419 * x); d := 0.3989422804 * exp(-x * x / 2);
  p := d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return round((case when p_z > 0 then 1 - p else p end * 100)::numeric, 1);
end $$;
-- one measurement's z-scores and centiles for a child (the age on the day, by days; the sex): weight-for-age, length-for-age,
-- head-for-age and weight-for-length; an indicator outside the loaded table says so (outside), never a guess
create function paeds.measure(p_sex text, p_age_days int, p_weight numeric, p_length numeric, p_head numeric) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_sex text := case p_sex when 'male' then 'm' when 'female' then 'f' end; v_months numeric; out jsonb := '{}'; v_outside text[] := '{}';
        k text; v numeric; x numeric; p numeric[]; z numeric;
begin
  if v_sex is null or p_age_days is null or p_age_days < 0 then return jsonb_build_object('z', '{}'::jsonb, 'outside', '[]'::jsonb, 'unknown', true); end if;
  v_months := round(p_age_days / 30.4375, 3);
  foreach k in array array['wfa', 'lfa', 'hcfa', 'wfl'] loop
    v := case k when 'wfa' then p_weight when 'lfa' then p_length when 'hcfa' then p_head when 'wfl' then p_weight end;
    x := case when k = 'wfl' then case when p_length is not null and p_age_days < 731 then p_length end else v_months end;
    continue when v is null or x is null;
    p := paeds.lms(k, v_sex, x);
    if p is null then v_outside := v_outside || k; continue; end if;
    z := paeds.z(v, p);
    out := out || jsonb_build_object(k, jsonb_build_object('z', z, 'c', paeds.centile(z)));
  end loop;
  return jsonb_build_object('z', out, 'outside', to_jsonb(v_outside), 'months', v_months, 'sex', v_sex);
end $$;
-- the tables' version, as loaded (each row carries it; the demo's carry sample)
create function paeds.version_of() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select 'WHO 2006' || case when (c.props ->> 'sample')::boolean then ' · demo sample' else '' end
                     from core.pack_codes('paeds.who_growth', array['wfa.m.0']) c limit 1), 'WHO 2006 · not loaded')
$$;

-- ── each child's measurements with their z-scores (the Growth section, the banner, the line): one row per vitals item that has a
-- weight, a length or a head, for a child under 19 on the day ──
create table paeds.growth (
  organization_id uuid not null,
  item          uuid not null,             -- the vitals item
  patient_id    uuid not null,
  at            timestamptz not null,      -- when measured (clinical time)
  age_days      int not null,
  sex           text,
  weight        numeric,                   -- kg
  length        numeric,                   -- cm (the base's height; lying under 2 or when the method says so)
  head          numeric,                   -- cm
  lying         boolean not null default false,
  z             jsonb not null default '{}',   -- {wfa: {z, c}, lfa, hcfa, wfl}
  outside       text[] not null default '{}',  -- the indicators beyond the loaded table
  version       text not null,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index growth_patient on paeds.growth (organization_id, patient_id, at desc);
create function paeds.growth_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; l core.entries; who jsonb; d jsonb; w numeric; h numeric; hc numeric; m jsonb; v_days int;
begin
  delete from paeds.growth where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into l from core.pack_entries(p_org, array[k]) x where x.item = k order by x.item_version desc limit 1;
    continue when l.id is null or not (l.type = any (core.kinds('vitals')));
    d := l.data;
    w := nullif(d -> 'weight' ->> 'value', '')::numeric; h := nullif(d -> 'height' ->> 'value', '')::numeric; hc := nullif(d -> 'head' ->> 'value', '')::numeric;
    continue when w is null and h is null and hc is null;
    who := base.pack_identity(p_org, l.patient_id, l.occurred_at);
    v_days := (who ->> 'age_days')::int;
    continue when v_days is null or v_days >= 6940;   -- 19 years
    m := paeds.measure(who ->> 'sex', v_days, w, h, hc);
    insert into paeds.growth values (p_org, k, core.survivor(p_org, l.patient_id), l.occurred_at, v_days, who ->> 'sex', w, h, hc,
      coalesce(d ->> 'method', '') ilike '%lying%' or (h is not null and v_days < 731), coalesce(m -> 'z', '{}'),
      array(select jsonb_array_elements_text(coalesce(m -> 'outside', '[]'))), paeds.version_of(),
      (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[k]) e where e.item = k));
  end loop;
end $$;

-- the composer's line under /v (its op): the same sums for the values being typed, for the patient today (the reader's own read)
create function paeds.growth_now(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare who jsonb := base.pack_identity(p_org, (p_args ->> 'patient_id')::uuid, null); v_days int := (who ->> 'age_days')::int;
begin
  if who is null then perform core.refuse('not_found', 'patient'); end if;
  return jsonb_build_object('patient_ids', jsonb_build_array(who ->> 'patient_id'), 'age_days', v_days, 'sex', who ->> 'sex', 'version', paeds.version_of())
    || coalesce(paeds.measure(who ->> 'sex', v_days, nullif(p_args ->> 'weight', '')::numeric, nullif(p_args ->> 'length', '')::numeric,
         nullif(p_args ->> 'head', '')::numeric), '{}');
end $$;

-- a development check's line: "Development · the 9-month list at 10 mo · 7 yes · not yet: babbles, looks to her name"
create function paeds.development_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select 'Development · the ' || coalesce(e -> 'data' -> 'paeds' ->> 'list', '') || ' list' ||
    coalesce(' at ' || (e -> 'data' -> 'paeds' ->> 'age_months') || ' mo', '') ||
    ' · ' || (select count(*) from jsonb_array_elements(coalesce(e -> 'data' -> 'paeds' -> 'items', '[]')) i where (i ->> 'yes')::boolean) || ' yes' ||
    coalesce(' · not yet: ' || (select string_agg(coalesce(i ->> 'short', i ->> 'text'), ', ') from jsonb_array_elements(coalesce(e -> 'data' -> 'paeds' -> 'items', '[]')) i
      where not (i ->> 'yes')::boolean), '') ||
    coalesce(' · plan: ' || (select string_agg(p, ', ') from jsonb_array_elements_text(coalesce(e -> 'data' -> 'paeds' -> 'plan', '[]')) p), '')
$$;

reset role;

grant select, delete on paeds.growth to core_eraser;
grant execute on function paeds.growth_refresh(uuid, uuid[]) to core_eraser;

-- its table reads the age and the sex (refreshed when they change); whoever reads the record reads it (the chart, the banner)
select core.declare_table('paeds.growth', 'paeds', 'paeds.growth_refresh(uuid,uuid[])', 'read:record', reads => '{age,sex}');
select core.declare_listener('paeds', array['vitals'], 'paeds.growth_refresh(uuid,uuid[])');
select core.declare_op('paeds.growth_now', 'paeds', 'paeds.growth_now(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- development: the base's observation (the check in words as its value) with the pack's own words: the list, the age, its version,
-- each milestone yes or not yet, and what was chosen next (the notice's chips)
select core.declare_type('paeds.development', 1, 'paeds',
  jsonb_set((select t.shape from core.types t where t.key = 'observation' order by t.version desc limit 1), '{properties,paeds}',
    '{"type":"object","additionalProperties":false,"required":["list","items"],"properties":{"list":{"type":"string","minLength":1},"months":{"type":"integer","minimum":0},
      "age_months":{"type":"integer","minimum":0},"version":{"type":"string"},
      "items":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["area","text","yes"],"properties":{
        "area":{"enum":["movement","hands","talking","social"]},"text":{"type":"string","minLength":1},"short":{"type":"string"},"yes":{"type":"boolean"}}}},
      "plan":{"type":"array","items":{"type":"string","minLength":1}}}}'),
  'paeds.development_line(jsonb)', array['Observation'], base_type => 'observation', labels => '{"en":"Development check","ar":"فحص النمو والتطور"}');
select core.declare_action('write:paeds.development', 'paeds', 'department', '{"en":"Write a development check (/dev)"}', everyday => true);

-- the Brighton PEWS (Q27): behaviour, heart and circulation, breathing 0–3 each, 2 more for nebulisers every 15 minutes and 2 for
-- persistent vomiting after an operation; the children's ward's early warning score in NEWS2's place
select core.declare_score('paeds.pews', 'paeds', '2005',
  'Monaghan A. Detecting and managing deterioration in children. Paediatric Nursing 2005;17(1):32–35 (the Brighton Paediatric Early Warning Score)',
  '[{"key":"behaviour","labels":{"en":"Behaviour"},"input":"choice","choices":[
      {"value":"playing","points":0,"labels":{"en":"Playing, appropriate"}},{"value":"sleeping","points":1,"labels":{"en":"Sleeping"}},
      {"value":"irritable","points":2,"labels":{"en":"Irritable"}},{"value":"lethargic","points":3,"labels":{"en":"Lethargic, confused, or less response to pain"}}]},
    {"key":"circulation","labels":{"en":"Heart and circulation"},"input":"choice","choices":[
      {"value":"pink","points":0,"labels":{"en":"Pink, or refill 1–2 s"}},{"value":"pale","points":1,"labels":{"en":"Pale, or refill 3 s"}},
      {"value":"grey","points":2,"labels":{"en":"Grey, or refill 4 s, or heart rate 20 above normal"}},
      {"value":"mottled","points":3,"labels":{"en":"Grey and mottled, or refill 5 s or more, or heart rate 30 above normal or slow"}}]},
    {"key":"breathing","labels":{"en":"Breathing"},"input":"choice","choices":[
      {"value":"normal","points":0,"labels":{"en":"Normal, no recession"}},{"value":"raised","points":1,"labels":{"en":"10 above normal, accessory muscles, or 30% oxygen or 4 L/min"}},
      {"value":"recessing","points":2,"labels":{"en":"20 above normal, recessing, or 40% oxygen or 6 L/min"}},
      {"value":"grunting","points":3,"labels":{"en":"5 below normal with recession, tracheal tug or grunting, or 50% oxygen or 8 L/min"}}]},
    {"key":"nebulisers","labels":{"en":"Nebulisers every 15 minutes"},"input":"yes_no","points":{"yes":2,"no":0}},
    {"key":"vomiting","labels":{"en":"Persistent vomiting after an operation"},"input":"yes_no","points":{"yes":2,"no":0}}]',
  '[{"key":"routine","min":0,"max":2,"labels":{"en":"routine obs"}},{"key":"raised","min":3,"max":3,"tone":"warn","labels":{"en":"obs hourly, tell the nurse in charge"}},
    {"key":"doctor","min":4,"max":4,"tone":"danger","labels":{"en":"tell the doctor"}},{"key":"urgent","min":5,"max":13,"tone":"danger","labels":{"en":"urgent review"}}]',
  '{"en":"Brighton PEWS"}', 'PEWS', 'pews');

-- the clinic's dose list (Q23 b): per drug and route, the usual mg/kg a day or a dose, the doses a day and the most a dose; the line
-- under /rx reads it (the EDA list carries no children's doses)
select core.declare_setting('paeds.doses', 'paeds', 'organization',
  '{"type":"object","additionalProperties":false,"required":["doses"],"properties":{"doses":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["drug","per","from","to"],"properties":{"drug":{"type":"string","minLength":1},"route":{"enum":["oral","iv","im","pr","inhaled"],"default":"oral"},
      "per":{"enum":["day","dose"],"default":"day"},"from":{"type":"number","exclusiveMinimum":0},"to":{"type":"number","exclusiveMinimum":0},
      "times_from":{"type":"integer","minimum":1,"maximum":24},"times_to":{"type":"integer","minimum":1,"maximum":24},"most":{"type":"number","exclusiveMinimum":0}}}}}}',
  labels => '{"en":"Children''s doses"}', form => 'pack',
  fields => '[{"key":"doses","labels":{"en":"Doses per kg"},"help":{"en":"The clinic''s own list: the line under /rx says the mg/kg a prescription comes to and this range. Shown, never a stop."}},
    {"key":"doses.drug","labels":{"en":"Drug"}},{"key":"doses.route","labels":{"en":"Route"},"choices":{"oral":{"en":"Oral"},"iv":{"en":"IV"},"im":{"en":"IM"},"pr":{"en":"Rectal"},"inhaled":{"en":"Inhaled"}}},
    {"key":"doses.per","labels":{"en":"Per"},"choices":{"day":{"en":"a day"},"dose":{"en":"a dose"}}},
    {"key":"doses.from","labels":{"en":"From"},"unit":"mg/kg"},{"key":"doses.to","labels":{"en":"To"},"unit":"mg/kg"},
    {"key":"doses.times_from","labels":{"en":"Doses a day, from"}},{"key":"doses.times_to","labels":{"en":"Doses a day, to"}},
    {"key":"doses.most","labels":{"en":"Most a dose"},"unit":"mg"}]');
-- the clinic's milestones (Q24): by age in months and area, what 3 in 4 children do by that age (the CDC's 2022 list to start)
select core.declare_setting('paeds.milestones', 'paeds', 'organization',
  '{"type":"object","additionalProperties":false,"required":["source","milestones"],"properties":{"source":{"type":"string"},"milestones":{"type":"array","items":{"type":"object",
    "additionalProperties":false,"required":["months","area","text"],"properties":{"months":{"type":"integer","minimum":0,"maximum":72},
      "area":{"enum":["movement","hands","talking","social"]},"text":{"type":"string","minLength":1},"short":{"type":"string"}}}}}}',
  labels => '{"en":"Milestones"}', form => 'pack',
  fields => '[{"key":"source","labels":{"en":"Started from"}},{"key":"milestones","labels":{"en":"Milestones"},"help":{"en":"Each one what 3 in 4 children do by that age, so not yet past it is worth acting on. /dev asks the list for the child''s age."}},
    {"key":"milestones.months","labels":{"en":"By (months)"}},{"key":"milestones.area","labels":{"en":"Area"},"choices":{"movement":{"en":"Movement"},"hands":{"en":"Hands"},"talking":{"en":"Talking"},"social":{"en":"Social"}}},
    {"key":"milestones.text","labels":{"en":"Milestone"}},{"key":"milestones.short","labels":{"en":"In short"}}]');

-- its people (§5.2): the paediatrician is a doctor with paediatrics' actions; a children's ward's nurses are the base's Nurse
select core.declare_role('00000000-0000-0000-0000-00000000e301', 'paeds.paediatrician', 'paeds', 'Paediatrician', array['write:paeds.development'],
  '{"en":"Paediatrician"}', built_on => '00000000-0000-0000-0000-00000000c002');

-- its starter setups (§5.2): the paediatrics clinic (the base's queue, a well-child preset) and the children's ward (the base's board,
-- six beds); a clinic ticking more packs (vaccines, ward nursing) ticks them on the department
select core.declare_setup('paeds.clinic', 'paeds', 'visits', '{"en":"Paediatrics clinic"}', packs => array['paeds'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  presets => '[{"name":"Well-child visit","shortcut":"wellchild","lines":["Feeding:","Development:","Examination:","Plan:"]}]',
  help => '{"en":"Children seen in visits: growth on the WHO charts from the vitals, a dose per kg under /rx, development with /dev, the newborn checks."}');
select core.declare_setup('paeds.ward', 'paeds', 'stays', '{"en":"Children''s ward"}', packs => array['paeds'],
  screens => '{"screens":["base.beds"],"opens":"base.beds"}',
  settings => '{"department.encounter_class":{"class":"IMP"},"department.review_results":{"level":"critical"}}',
  places => (select jsonb_agg(jsonb_build_object('key', 'bed_' || n, 'name', 'Bed ' || n, 'label', 'bed') order by n) from generate_series(1, 6) n),
  presets => '[{"name":"Ward round","shortcut":"round","lines":["Overnight:","Feeds and fluids:","Examination:","Plan:"]}]',
  help => '{"en":"Children stay in beds: each tile says the weight and its age and the day''s maintenance fluid; the Brighton PEWS."}');
