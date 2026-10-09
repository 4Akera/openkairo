-- 27 · the obgyn pack, its clinic part (spec/openCare.md §5.8; the pictures /pictures.html#anc-visit … #ob-settings). The labour ward's
-- part (the labour examination, the birth, MEOWS, Apgar, the labour ward's setup) is the beds lane's, added later to this same pack
-- (agreed 2026-10-08: no second declare_pack; role ids d310–d31f kept for it). The clinic part: the antenatal check (its own type on
-- the base's observation: the weeks worked out from the EDD, the fundus, the baby's heart, the lie, moves, urine and oedema, and at
-- booking what came before and the blood group), the periods' pattern and the visit after the birth (each on the base's observation);
-- the clinic's scan is the base's result with no order, the contraception method a base observation by the pack's code, an IUD's
-- change the base's procedure, the pregnancy the base's own. EPDS is a declared score. A table of what the queue's one word reads
-- (obgyn.marks: the pregnancy, today's BP, the antenatal check's protein and blood group, the method), the clinic's antenatal schedule,
-- visits and fundus band, notices and gynaecology's intervals as settings with the drawn starter rows; the Obstetrician and Midwife;
-- the ObGyn clinic's starter setup.

set client_min_messages = warning;

select core.declare_pack('obgyn', 1, '{}', '{"en":"ObGyn","ar":"النساء والتوليد"}', role_block => 'd3');
select core.create_pack('obgyn');

-- its own codes: the contraception method and cervical screening (base observations by these codes)
select core.declare_system('obgyn.codes', 'obgyn', 'code', '{canon}/CodeSystem/obgyn', '1', true, null, 'openCare: ObGyn''s own codes', '{"en":"ObGyn codes"}');
insert into core.codes (system, code, labels) values
  ('obgyn.codes', 'contraception', '{"en":"Contraception method"}'), ('obgyn.codes', 'cervical_screening', '{"en":"Cervical screening"}')
on conflict do nothing;

set role pack_obgyn;

-- ── the lines ──
create function obgyn.weeks_text(o jsonb) returns text language sql immutable security definer set search_path = '' as $$
  select case when o ? 'weeks' then (o ->> 'weeks') || '+' || coalesce(o ->> 'days', '0') || ' w' end
$$;
-- "Antenatal visit · 28+3 w · fundus 29 · FHR 144 · cephalic · urine nil"
create function obgyn.anc_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Antenatal visit', obgyn.weeks_text(o), 'fundus ' || (o ->> 'sfh'), 'FHR ' || (o ->> 'fhr'), o ->> 'lie',
    'urine ' || (o ->> 'protein'), case when o ->> 'oedema' is not null and o ->> 'oedema' <> 'none' then 'oedema ' || (o ->> 'oedema') end,
    case when o -> 'booking' is not null then 'booking' end)
  from (select e -> 'data' -> 'obgyn' o) x
$$;
-- "Periods · LMP 21 Sep · every 26–28 days · 8–9 days · heavy, clots · pain moderate"
create function obgyn.periods_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Periods', 'LMP ' || to_char((o ->> 'lmp')::date, 'FMDD Mon'),
    'every ' || (o ->> 'cycle_from') || coalesce('–' || nullif(o ->> 'cycle_to', o ->> 'cycle_from'), '') || ' days',
    (o ->> 'days_from') || coalesce('–' || nullif(o ->> 'days_to', o ->> 'days_from'), '') || ' days',
    nullif(concat_ws(', ', o ->> 'flow', case when (o ->> 'clots')::boolean then 'clots' end), ''), 'pain ' || (o ->> 'pain'))
  from (select e -> 'data' -> 'obgyn' o) x
$$;
-- "Visit after the birth · 6 w · no bleeding · wound healed · the birth: 27 Aug, 39+0 w, another hospital, caesarean, boy 3400 g"
create function obgyn.postnatal_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Visit after the birth', case when o ? 'days' then ((o ->> 'days')::int / 7) || ' w' end,
    case o ->> 'bleeding' when 'none' then 'no bleeding' when null then null else (o ->> 'bleeding') || ' bleeding' end, 'wound ' || (o ->> 'wound'),
    case when o ? 'birth' then 'the birth: ' || concat_ws(', ', to_char((o -> 'birth' ->> 'on')::date, 'FMDD Mon'), obgyn.weeks_text(o -> 'birth'),
      case o -> 'birth' ->> 'where' when 'elsewhere' then coalesce(o -> 'birth' ->> 'place', 'another hospital') else 'here' end, o -> 'birth' ->> 'how',
      concat_ws(' ', o -> 'birth' ->> 'baby', (o -> 'birth' ->> 'grams') || ' g')) end)
  from (select e -> 'data' -> 'obgyn' o) x
$$;

-- ── what the queue's one word reads, a row per item: the pregnancy (LMP or weeks, current or ended), a woman's BP, an antenatal check's
-- protein and booking, a contraception method; the word itself is the client's, from these and the clinic's schedule (it reads the sex) ──
create table obgyn.marks (
  organization_id uuid not null,
  item          uuid not null,
  patient_id    uuid not null,
  kind          text not null,             -- pregnancy · bp · anc · method
  at            timestamptz not null,
  data          jsonb not null default '{}',
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create index marks_patient on obgyn.marks (organization_id, patient_id, kind, at desc);
create function obgyn.marks_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; l core.entries; d jsonb; v_kind text; v_data jsonb;
begin
  delete from obgyn.marks where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into l from core.pack_entries(p_org, array[k]) x where x.item = k order by x.item_version desc limit 1;
    continue when l.id is null;
    d := l.data; v_kind := null; v_data := null;
    if l.type = any (core.kinds('pregnancy')) then
      v_kind := 'pregnancy'; v_data := jsonb_strip_nulls(jsonb_build_object('status', d ->> 'status', 'pregnant', (d ->> 'pregnant')::boolean, 'lmp', d -> 'lmp' ->> 'value',
        'weeks', (d ->> 'weeks')::int, 'reason', d ->> 'reason'));
    elsif l.type = 'obgyn.anc' then
      v_kind := 'anc'; v_data := jsonb_strip_nulls(jsonb_build_object('weeks', (d -> 'obgyn' ->> 'weeks')::int, 'protein', d -> 'obgyn' ->> 'protein',
        'rh', d -> 'obgyn' -> 'booking' ->> 'rh', 'taken', d -> 'obgyn' -> 'taken'));
    elsif l.type = any (core.kinds('vitals')) and d ? 'bp' then
      v_kind := 'bp'; v_data := jsonb_build_object('sys', (d -> 'bp' -> 'sys' ->> 'value')::numeric, 'dia', (d -> 'bp' -> 'dia' ->> 'value')::numeric);
    elsif l.type = 'observation' and exists (select 1 from jsonb_array_elements(coalesce(d -> 'code' -> 'codings', '[]')) c where c ->> 'system' = 'obgyn.codes' and c ->> 'code' = 'contraception') then
      v_kind := 'method'; v_data := jsonb_strip_nulls(jsonb_build_object('method', coalesce(d -> 'value' -> 'concept' ->> 'text', d -> 'value' ->> 'text'), 'note', d ->> 'note'));
    end if;
    continue when v_kind is null;
    -- a man's BP or method says nothing on ObGyn's list: kept for women (and anyone whose sex is not recorded)
    continue when v_kind in ('bp', 'method') and base.pack_identity(p_org, l.patient_id, l.occurred_at) ->> 'sex' = 'male';
    insert into obgyn.marks values (p_org, k, core.survivor(p_org, l.patient_id), v_kind, l.occurred_at, v_data,
      (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[k]) e where e.item = k));
  end loop;
end $$;

reset role;

grant select, delete on obgyn.marks to core_eraser;
grant execute on function obgyn.marks_refresh(uuid, uuid[]) to core_eraser;
select core.declare_table('obgyn.marks', 'obgyn', 'obgyn.marks_refresh(uuid,uuid[])', 'read:record', reads => '{sex}');
select core.declare_listener('obgyn', array['pregnancy', 'vitals', 'observation'], 'obgyn.marks_refresh(uuid,uuid[])');

-- ── its types, each on the base's observation (its value the visit in words; the base's lists, checks, review and FHIR apply) ──
select core.declare_type('obgyn.anc', 1, 'obgyn',
  jsonb_set((select t.shape from core.types t where t.key = 'observation' order by t.version desc limit 1), '{properties,obgyn}',
    '{"type":"object","additionalProperties":false,"properties":{
      "weeks":{"type":"integer","minimum":0,"maximum":45},"days":{"type":"integer","minimum":0,"maximum":6},
      "sfh":{"type":"number","minimum":5,"maximum":50},"fhr":{"type":"integer","minimum":60,"maximum":220},
      "lie":{"enum":["cephalic","breech","transverse","not sure"]},"moves":{"enum":["felt","less"]},
      "protein":{"enum":["nil","trace","+","++","+++"]},"oedema":{"enum":["none","feet","face, hands"]},
      "booking":{"type":"object","additionalProperties":false,"properties":{"gravida":{"type":"integer","minimum":1},"para":{"type":"integer","minimum":0},
        "miscarriages":{"type":"integer","minimum":0},"before":{"type":"string"},"blood_group":{"enum":["A","B","AB","O"]},"rh":{"enum":["positive","negative"]},
        "antibodies":{"type":"string"},"risks":{"type":"array","items":{"enum":["previous_caesarean","preeclampsia_risk","diabetes"]}},"risk_note":{"type":"string"}}},
      "taken":{"type":"array","items":{"type":"string","minLength":1}},"next_weeks":{"type":"integer","minimum":1,"maximum":45}}}'),
  'obgyn.anc_line(jsonb)', array['Observation'], base_type => 'observation', feeds => array['obgyn.marks'], labels => '{"en":"Antenatal visit","ar":"متابعة الحمل"}');
select core.declare_type('obgyn.periods', 1, 'obgyn',
  jsonb_set((select t.shape from core.types t where t.key = 'observation' order by t.version desc limit 1), '{properties,obgyn}',
    '{"type":"object","additionalProperties":false,"properties":{"lmp":{"type":"string","format":"date"},
      "cycle_from":{"type":"integer","minimum":10,"maximum":120},"cycle_to":{"type":"integer","minimum":10,"maximum":120},
      "days_from":{"type":"integer","minimum":1,"maximum":30},"days_to":{"type":"integer","minimum":1,"maximum":30},
      "flow":{"enum":["light","normal","heavy"]},"clots":{"type":"boolean"},"pads":{"type":"integer","minimum":0,"maximum":40},
      "pain":{"enum":["none","mild","moderate","severe"]},"note":{"type":"string"}}}'),
  'obgyn.periods_line(jsonb)', array['Observation'], base_type => 'observation', labels => '{"en":"Periods","ar":"الدورة الشهرية"}');
select core.declare_type('obgyn.postnatal', 1, 'obgyn',
  jsonb_set((select t.shape from core.types t where t.key = 'observation' order by t.version desc limit 1), '{properties,obgyn}',
    '{"type":"object","additionalProperties":false,"properties":{"days":{"type":"integer","minimum":0,"maximum":365},
      "bleeding":{"enum":["none","light","heavy"]},"wound":{"enum":["healed","red","oozing","opened"]},
      "birth":{"type":"object","additionalProperties":false,"required":["on","where","how"],"properties":{"on":{"type":"string","format":"date"},
        "weeks":{"type":"integer","minimum":20,"maximum":45},"days":{"type":"integer","minimum":0,"maximum":6},"where":{"enum":["here","elsewhere"]},"place":{"type":"string"},
        "how":{"enum":["normal","vacuum","forceps","caesarean"]},"why":{"type":"string"},"baby":{"enum":["boy","girl"]},"grams":{"type":"integer","minimum":300,"maximum":6500},
        "baby_id":{"type":"string","format":"uuid"}}}}}'),
  'obgyn.postnatal_line(jsonb)', array['Observation'], base_type => 'observation', labels => '{"en":"Visit after the birth","ar":"متابعة ما بعد الولادة"}');
-- everyday: a family medicine doctor or nurse where the department ticks obgyn writes them too
select core.declare_action('write:obgyn.anc', 'obgyn', 'department', '{"en":"Write an antenatal visit (/anc)"}', everyday => true);
select core.declare_action('write:obgyn.periods', 'obgyn', 'department', '{"en":"Write the periods (/fp, the Gynaecology section)"}', everyday => true);
select core.declare_action('write:obgyn.postnatal', 'obgyn', 'department', '{"en":"Write the visit after the birth (/pn)"}', everyday => true);

-- ── EPDS (the Edinburgh Postnatal Depression Scale, 1987): ten questions 0–3; 13 or more, possible depression; question 10 asks about
-- harming herself, which the card says on its own whatever the total ──
select core.declare_score('obgyn.epds', 'obgyn', '1987',
  'Cox JL, Holden JM, Sagovsky R. Detection of postnatal depression: development of the 10-item Edinburgh Postnatal Depression Scale. British Journal of Psychiatry 1987;150:782–786',
  (select jsonb_agg(jsonb_build_object('key', k, 'labels', jsonb_build_object('en', l), 'input', 'choice', 'choices', c) order by n) from (values
    (1, 'laughing', 'Able to laugh and see the funny side', '[{"value":"as_always","points":0,"labels":{"en":"As much as always"}},{"value":"not_quite","points":1,"labels":{"en":"Not quite so much"}},{"value":"definitely_not","points":2,"labels":{"en":"Definitely not so much"}},{"value":"not_at_all","points":3,"labels":{"en":"Not at all"}}]'::jsonb),
    (2, 'looking_forward', 'Looked forward with enjoyment', '[{"value":"as_always","points":0,"labels":{"en":"As much as ever"}},{"value":"rather_less","points":1,"labels":{"en":"Rather less"}},{"value":"definitely_less","points":2,"labels":{"en":"Definitely less"}},{"value":"hardly","points":3,"labels":{"en":"Hardly at all"}}]'::jsonb),
    (3, 'blaming', 'Blamed herself unnecessarily', '[{"value":"never","points":0,"labels":{"en":"No, never"}},{"value":"not_often","points":1,"labels":{"en":"Not very often"}},{"value":"some","points":2,"labels":{"en":"Yes, some of the time"}},{"value":"most","points":3,"labels":{"en":"Yes, most of the time"}}]'::jsonb),
    (4, 'anxious', 'Anxious or worried for no good reason', '[{"value":"never","points":0,"labels":{"en":"No, not at all"}},{"value":"hardly","points":1,"labels":{"en":"Hardly ever"}},{"value":"sometimes","points":2,"labels":{"en":"Yes, sometimes"}},{"value":"often","points":3,"labels":{"en":"Yes, very often"}}]'::jsonb),
    (5, 'scared', 'Scared or panicky for no good reason', '[{"value":"never","points":0,"labels":{"en":"No, not at all"}},{"value":"not_much","points":1,"labels":{"en":"No, not much"}},{"value":"sometimes","points":2,"labels":{"en":"Yes, sometimes"}},{"value":"quite","points":3,"labels":{"en":"Yes, quite a lot"}}]'::jsonb),
    (6, 'on_top', 'Things getting on top of her', '[{"value":"coping","points":0,"labels":{"en":"Coping as well as ever"}},{"value":"mostly","points":1,"labels":{"en":"Mostly coping"}},{"value":"sometimes","points":2,"labels":{"en":"Sometimes not coping"}},{"value":"most","points":3,"labels":{"en":"Most of the time not coping"}}]'::jsonb),
    (7, 'sleep', 'So unhappy she has had trouble sleeping', '[{"value":"never","points":0,"labels":{"en":"No, not at all"}},{"value":"not_often","points":1,"labels":{"en":"Not very often"}},{"value":"sometimes","points":2,"labels":{"en":"Yes, sometimes"}},{"value":"most","points":3,"labels":{"en":"Yes, most of the time"}}]'::jsonb),
    (8, 'sad', 'Sad or miserable', '[{"value":"never","points":0,"labels":{"en":"No, not at all"}},{"value":"not_often","points":1,"labels":{"en":"Not very often"}},{"value":"often","points":2,"labels":{"en":"Yes, quite often"}},{"value":"most","points":3,"labels":{"en":"Yes, most of the time"}}]'::jsonb),
    (9, 'crying', 'So unhappy she has been crying', '[{"value":"never","points":0,"labels":{"en":"No, never"}},{"value":"occasionally","points":1,"labels":{"en":"Only occasionally"}},{"value":"often","points":2,"labels":{"en":"Yes, quite often"}},{"value":"most","points":3,"labels":{"en":"Yes, most of the time"}}]'::jsonb),
    (10, 'harming', 'The thought of harming herself', '[{"value":"never","points":0,"labels":{"en":"Never"}},{"value":"hardly","points":1,"labels":{"en":"Hardly ever"}},{"value":"sometimes","points":2,"labels":{"en":"Sometimes"}},{"value":"often","points":3,"labels":{"en":"Yes, quite often"}}]'::jsonb)
  ) q(n, k, l, c)),
  '[{"key":"unlikely","min":0,"max":9,"labels":{"en":"depression unlikely"}},{"key":"watch","min":10,"max":12,"tone":"warn","labels":{"en":"possible depression · ask again in 2 weeks"}},
    {"key":"possible","min":13,"max":30,"tone":"warn","labels":{"en":"13 or more · possible depression"}}]',
  '{"en":"Edinburgh Postnatal Depression Scale"}', 'EPDS', 'epds');

-- ── the clinic's settings, on the pack's page, each with the drawn starter rows (Q21: the visits as most Egyptian clinics run them) ──
select core.declare_setting('obgyn.schedule', 'obgyn', 'organization',
  $j${"type":"object","additionalProperties":false,"required":["rows"],"properties":{"rows":{"type":"array","items":{"type":"object","additionalProperties":false,
    "required":["from","to","what","whom"],"properties":{"from":{"type":"integer","minimum":0,"maximum":42},"to":{"type":"integer","minimum":0,"maximum":42},
      "what":{"type":"string","minLength":1},"whom":{"enum":["everyone","rh_negative","previous_caesarean","age_35","preeclampsia_risk","diabetes"]},
      "word":{"type":"string"}}},
    "default":[
      {"from":6,"to":13,"what":"Booking bloods (the lab preset) · Laboratory","whom":"everyone","word":"booking bloods"},
      {"from":11,"to":14,"what":"Dating and nuchal scan · here","whom":"everyone","word":"dating scan"},
      {"from":11,"to":14,"what":"Combined screening (NT, PAPP-A, hCG) · Laboratory","whom":"age_35","word":"combined screening"},
      {"from":12,"to":16,"what":"Aspirin 150 mg at night, to 36 w · a prescription","whom":"preeclampsia_risk","word":"aspirin"},
      {"from":20,"to":22,"what":"Anomaly scan · Radiology","whom":"everyone","word":"anomaly scan"},
      {"from":20,"to":32,"what":"Tetanus toxoid, 2 doses 4 weeks apart · given here","whom":"everyone","word":"tetanus toxoid"},
      {"from":24,"to":28,"what":"OGTT 75 g · Laboratory","whom":"everyone","word":"OGTT"},
      {"from":28,"to":28,"what":"CBC · Laboratory","whom":"everyone","word":"CBC"},
      {"from":28,"to":28,"what":"Anti-D 1500 IU IM · given here","whom":"rh_negative","word":"anti-D"},
      {"from":32,"to":34,"what":"Growth scan · here","whom":"everyone","word":"growth scan"},
      {"from":36,"to":37,"what":"Plan for the birth · a check","whom":"previous_caesarean","word":"birth plan"}]}}}$j$,
  labels => '{"en":"Antenatal schedule"}', form => 'pack',
  fields => '[{"key":"rows","labels":{"en":"What is due"},"help":{"en":"What is due at which weeks, and for whom. The antenatal card offers each as a chip to take or leave and the queue says it. For whom is worked out from the record."}},
    {"key":"rows.from","labels":{"en":"From (w)"}},{"key":"rows.to","labels":{"en":"To (w)"}},{"key":"rows.what","labels":{"en":"What"}},
    {"key":"rows.whom","labels":{"en":"For whom"},"choices":{"everyone":{"en":"Everyone"},"rh_negative":{"en":"Rh negative"},"previous_caesarean":{"en":"Previous caesarean"},"age_35":{"en":"35 or older"},"preeclampsia_risk":{"en":"Pre-eclampsia risk"},"diabetes":{"en":"Diabetes"}}},
    {"key":"rows.word","labels":{"en":"The queue''s word"}}]');
select core.declare_setting('obgyn.visits', 'obgyn', 'organization',
  '{"type":"object","additionalProperties":false,"required":["every","fundus_band","fundus_from"],"properties":{
    "every":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["until","weeks"],"properties":{"until":{"type":"integer","minimum":1,"maximum":42},"weeks":{"type":"integer","minimum":1,"maximum":8}}},
      "default":[{"until":28,"weeks":4},{"until":36,"weeks":2},{"until":42,"weeks":1}]},
    "fundus_band":{"type":"number","minimum":0,"maximum":5,"default":2},"fundus_from":{"type":"integer","minimum":16,"maximum":30,"default":24}}}',
  labels => '{"en":"Visits and the fundus"}', form => 'pack',
  fields => '[{"key":"every","labels":{"en":"How often"},"help":{"en":"The antenatal card''s next visit."}},{"key":"every.until","labels":{"en":"Until (w)"}},{"key":"every.weeks","labels":{"en":"Every (w)"}},
    {"key":"fundus_band","labels":{"en":"The fundus fits the weeks, ±"},"unit":"cm","help":{"en":"Outside the band the card says so in amber."}},{"key":"fundus_from","labels":{"en":"From"},"unit":"w"}]');
select core.declare_setting('obgyn.notices', 'obgyn', 'organization',
  '{"type":"object","additionalProperties":false,"required":["bp_sys","bp_dia","protein","efw_low","efw_high","dvp_low","dvp_high"],"properties":{
    "bp_sys":{"type":"integer","minimum":100,"maximum":200,"default":140},"bp_dia":{"type":"integer","minimum":60,"maximum":130,"default":90},
    "protein":{"enum":["+","++","+++"],"default":"++"},"efw_low":{"type":"integer","minimum":1,"maximum":50,"default":10},"efw_high":{"type":"integer","minimum":50,"maximum":99,"default":90},
    "dvp_low":{"type":"number","minimum":0,"maximum":5,"default":2},"dvp_high":{"type":"number","minimum":5,"maximum":15,"default":8}}}',
  labels => '{"en":"Notices on the cards"}', form => 'pack',
  fields => '[{"key":"bp_sys","labels":{"en":"BP from, systolic"},"unit":"mmHg"},{"key":"bp_dia","labels":{"en":"BP from, diastolic"},"unit":"mmHg"},
    {"key":"protein","labels":{"en":"Urine protein from"},"choices":{"+":{"en":"+"},"++":{"en":"++"},"+++":{"en":"+++"}}},
    {"key":"efw_low","labels":{"en":"Baby''s weight under the centile"}},{"key":"efw_high","labels":{"en":"Baby''s weight over the centile"}},
    {"key":"dvp_low","labels":{"en":"Liquor, deepest pool under"},"unit":"cm"},{"key":"dvp_high","labels":{"en":"Liquor, deepest pool over"},"unit":"cm"}]');
select core.declare_setting('obgyn.gynaecology', 'obgyn', 'organization',
  '{"type":"object","additionalProperties":false,"required":["screening","methods"],"properties":{
    "screening":{"enum":["pap3","hpv5","both5"],"default":"pap3"},
    "methods":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["method","every","unit"],"properties":{"method":{"type":"string","minLength":1},
      "every":{"type":"integer","minimum":1,"maximum":120},"unit":{"enum":["weeks","months","years"]}}},
      "default":[{"method":"Copper IUD","every":10,"unit":"years"},{"method":"Hormonal IUD","every":8,"unit":"years"},{"method":"Hormonal IUD, heavy periods","every":5,"unit":"years"},
        {"method":"Implant","every":3,"unit":"years"},{"method":"Injection (DMPA 150 mg)","every":12,"unit":"weeks"}]}}}',
  labels => '{"en":"Gynaecology"}', form => 'pack',
  fields => '[{"key":"screening","labels":{"en":"Cervical screening"},"help":{"en":"The next smear, worked out from the last."},"choices":{"pap3":{"en":"Pap every 3 years, 21–65"},"hpv5":{"en":"HPV every 5 years, 30–65"},"both5":{"en":"Pap and HPV every 5 years, 30–65"}}},
    {"key":"methods","labels":{"en":"Contraception · when due"}},{"key":"methods.method","labels":{"en":"Method"}},{"key":"methods.every","labels":{"en":"Every"}},
    {"key":"methods.unit","labels":{"en":"Unit"},"choices":{"weeks":{"en":"weeks"},"months":{"en":"months"},"years":{"en":"years"}}}]');

-- ── its people (§5.2): the obstetrician a doctor with obgyn's actions; the midwife a nurse with the antenatal and postnatal checks
-- (the labour ward's births come with its part; d310–d31f are kept for its roles) ──
select core.declare_role('00000000-0000-0000-0000-00000000d301', 'obgyn.obstetrician', 'obgyn', 'Obstetrician',
  array['write:obgyn.anc', 'write:obgyn.periods', 'write:obgyn.postnatal'], '{"en":"Obstetrician"}', built_on => '00000000-0000-0000-0000-00000000c002');
select core.declare_role('00000000-0000-0000-0000-00000000d302', 'obgyn.midwife', 'obgyn', 'Midwife',
  array['write:obgyn.anc', 'write:obgyn.postnatal'], '{"en":"Midwife"}', built_on => '00000000-0000-0000-0000-00000000c003');

-- ── its starter setup: the ObGyn clinic (the base's queue; antenatal and gynaecology presets) ──
select core.declare_setup('obgyn.clinic', 'obgyn', 'visits', '{"en":"ObGyn clinic"}', packs => array['obgyn'],
  screens => '{"screens":["base.queue"],"opens":"base.queue"}',
  settings => '{"department.review_results":{"level":"critical"},"department.after_done":{"after":"next"}}',
  presets => '[{"name":"Antenatal visit","shortcut":"antenatal","lines":["Complaints:","Examination:","Plan:"]},{"name":"Gynaecology visit","shortcut":"gynae","lines":["Complaint:","Periods:","Examination:","Plan:"]}]',
  help => '{"en":"Antenatal visits with the weeks worked out from the EDD and what is due, the clinic''s own scan, gynaecology and the visit after the birth."}');
