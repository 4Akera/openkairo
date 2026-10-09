-- 37 · ObGyn's labour ward (spec/openCare.md §5.6), piece L1: the partograph. The pack itself, with its Obstetrician and Midwife, is the
-- clinics' build's (migration 27); the labour ward adds to the same layer here, with no second declare_pack. A labour
-- examination is the pack's own type (obgyn.labour_exam: the cervix, the head in fifths, the position, the liquor, moulding, caput, the
-- contractions; G and P as said); the baby's heart is the base's observation (LOINC 55283-6, the owner's B1) and the mother's signs the
-- base's vitals. The WHO's modified partograph is drawn from them on the Labour tab: active labour from 4 cm (the department's setting,
-- 4 or 5), the alert line at 1 cm an hour, the action line 4 hours to its right; past a line is a notice, never a stop. The labour
-- ward's starter setup (delivery beds, postnatal beds, cots) and the board's words through the pack's own op (the owner's C1, read by
-- the tile through C7). Piece L2: the birth (the pack's own type, obgyn.birth), signed in one Done with each baby's own record (the
-- owner's Q10), Apgar as a declared score, and the board's words after birth. Chosen by
-- Claude in the build, awaiting the owner.

set client_min_messages = warning;

set role pack_obgyn;
-- ── the labour examination in words: "Cervix 6 cm · head 3/5 · OA · liquor clear · moulding + · caput + · contractions 3 in 10 min,
-- 40 s · G2 P1"; the client's examLine (src/packs/obgyn/labour/exam.ts) says the same ──
create function obgyn.liquor_words(p text) returns text language sql immutable as $$
  select case p when 'intact' then 'membranes intact' when 'clear' then 'liquor clear' when 'meconium' then 'liquor meconium-stained'
    when 'blood' then 'liquor blood-stained' when 'absent' then 'liquor absent' end
$$;
create function obgyn.position_words(p text) returns text language sql immutable as $$
  select case when p = 'breech' then 'breech' else upper(p) end
$$;
create function obgyn.exam_words(d jsonb) returns text language sql immutable as $$
  select case when w = '' then 'Labour examination' else upper(left(w, 1)) || substr(w, 2) end
  from (select concat_ws(' · ',
    'cervix ' || (d ->> 'cervix') || ' cm',
    'head ' || (d ->> 'descent') || '/5',
    obgyn.position_words(d ->> 'position'),
    obgyn.liquor_words(d ->> 'liquor'),
    'moulding ' || (d ->> 'moulding'),
    case d ->> 'caput' when 'none' then 'no caput' when '+' then 'caput +' when '++' then 'caput ++' end,
    'contractions ' || (d -> 'contractions' ->> 'per_10') || ' in 10 min' || coalesce(', ' || (d -> 'contractions' ->> 'seconds') || ' s', ''),
    nullif(concat_ws(' ', 'G' || (d ->> 'gravida'), 'P' || (d ->> 'para')), ''),
    nullif(d ->> 'note', '')) w) x
$$;
create function obgyn.labour_exam_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select obgyn.exam_words(e -> 'data')
$$;

-- ── FHIR (§6.4): an Observation "Labour examination" with a component each; the cervix and the contraction's length as quantities ──
create function obgyn.labour_exam_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p ->> 'org')::uuid; l jsonb := p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1); o jsonb; d jsonb; c jsonb := '[]';
begin
  select e into o from jsonb_array_elements(p -> 'entries') with ordinality x(e, n) where e ->> 'type' <> 'crossed_out' order by n desc limit 1;
  if o is null then return '[]'; end if;
  d := o -> 'data';
  if d ? 'cervix' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Cervix'),
    'valueQuantity', core.fhir_quantity(jsonb_build_object('value', d ->> 'cervix', 'unit', 'cm', 'ucum', 'cm')))); end if;
  if d ? 'descent' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Head, fifths above the brim'), 'valueString', (d ->> 'descent') || '/5')); end if;
  if d ? 'position' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Position'), 'valueString', obgyn.position_words(d ->> 'position'))); end if;
  if d ? 'liquor' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Liquor'), 'valueString', obgyn.liquor_words(d ->> 'liquor'))); end if;
  if d ? 'moulding' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Moulding'), 'valueString', d ->> 'moulding')); end if;
  if d ? 'caput' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Caput'), 'valueString', d ->> 'caput')); end if;
  if d ? 'contractions' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Contractions in 10 minutes'),
    'valueInteger', (d -> 'contractions' ->> 'per_10')::int)); end if;
  if d -> 'contractions' ? 'seconds' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Contraction length'),
    'valueQuantity', core.fhir_quantity(jsonb_build_object('value', d -> 'contractions' ->> 'seconds', 'unit', 's', 'ucum', 's')))); end if;
  if d ? 'gravida' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Gravida'), 'valueInteger', (d ->> 'gravida')::int)); end if;
  if d ? 'para' then c := c || jsonb_build_array(jsonb_build_object('code', jsonb_build_object('text', 'Para'), 'valueInteger', (d ->> 'para')::int)); end if;
  return jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'Observation', 'id', o ->> 'item',
    'meta', core.fhir_meta(l, coalesce((p ->> 'private')::boolean, false)),
    'status', case when l ->> 'type' = 'crossed_out' or coalesce((l ->> 'redacted')::boolean, false) then 'entered-in-error' else 'final' end,
    'code', jsonb_build_object('text', 'Labour examination'), 'subject', jsonb_build_object('reference', 'Patient/' || (p ->> 'patient')),
    'encounter', case when o ->> 'visit_id' is not null then jsonb_build_object('reference', 'Encounter/' || (o ->> 'visit_id')) end,
    'effectiveDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org),
    'performer', jsonb_build_array(jsonb_build_object('reference', 'PractitionerRole/' || (o ->> 'author_id'))),
    'component', case when jsonb_array_length(c) > 0 then c end,
    'note', case when coalesce(d ->> 'note', '') <> '' then jsonb_build_array(jsonb_build_object('text', d ->> 'note')) end)));
end $$;

-- a quantity in words: "350 mL" (the base's base.q is not the pack's to call)
create function obgyn.q(p jsonb) returns text language sql immutable as $$
  select case when p ->> 'value' is null then null else (p ->> 'value') || coalesce(' ' || nullif(coalesce(p ->> 'unit', p ->> 'ucum'), ''), '') end
$$;
create function obgyn.mode_words(p text) returns text language sql immutable as $$
  select case p when 'normal' then 'normal' when 'vacuum' then 'vacuum' when 'forceps' then 'forceps' when 'breech' then 'vaginal breech' when 'caesarean' then 'caesarean' end
$$;
-- ── the birth in words: "Birth · normal · girl 3100 g · perineum: 2nd degree, repaired · placenta complete · blood loss 350 mL";
-- twins "Birth · normal · twins: girl 2400 g, boy 2550 g · …" ──
create function obgyn.birth_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select concat_ws(' · ', 'Birth', obgyn.mode_words(e -> 'data' ->> 'mode'),
    case jsonb_array_length(e -> 'data' -> 'babies') when 1 then '' when 2 then 'twins: ' when 3 then 'triplets: '
      else jsonb_array_length(e -> 'data' -> 'babies') || ' babies: ' end
      || (select string_agg(concat_ws(' ', case b ->> 'sex' when 'female' then 'girl' when 'male' then 'boy' else 'baby' end, (b ->> 'grams') || ' g'), ', ' order by k)
          from jsonb_array_elements(e -> 'data' -> 'babies') with ordinality x(b, k)),
    'perineum: ' || nullif(concat_ws(', ', case e -> 'data' ->> 'perineum' when 'intact' then 'intact' when 'first' then '1st degree'
        when 'second' then '2nd degree' when 'third' then '3rd degree' when 'fourth' then '4th degree' end,
      case when (e -> 'data' ->> 'episiotomy')::boolean then 'episiotomy' end, case when (e -> 'data' ->> 'repaired')::boolean then 'repaired' end), ''),
    'placenta ' || (e -> 'data' ->> 'placenta'),
    'blood loss ' || obgyn.q(e -> 'data' -> 'blood_loss'))
$$;
-- the birth's check: a baby is a patient (its own, never the mother) and the one who delivered a user; no perineum, episiotomy or
-- repair with a caesarean, no episiotomy on an intact perineum; the blood loss in mL, 0 or more
create function obgyn.birth_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d jsonb := p_entry -> 'data';
begin
  if d ? 'delivered_by' and d -> 'delivered_by' ->> 'to' is distinct from 'user' then
    return jsonb_build_array(jsonb_build_object('code', 'wrong_reference', 'level', 'refuse', 'detail', 'delivered by: a user'));
  end if;
  if exists (select 1 from jsonb_array_elements(d -> 'babies') b where b -> 'patient' ->> 'to' is distinct from 'patient') then
    return jsonb_build_array(jsonb_build_object('code', 'wrong_reference', 'level', 'refuse', 'detail', 'a baby: a patient'));
  end if;
  -- each baby its own patient, never the mother, none listed twice (the writer does not resolve a reference in data)
  if exists (select 1 from jsonb_array_elements(d -> 'babies') b where b -> 'patient' ->> 'id' = p_entry ->> 'patient_id')
     or (select count(distinct b -> 'patient' ->> 'id') from jsonb_array_elements(d -> 'babies') b) <> jsonb_array_length(d -> 'babies') then
    return jsonb_build_array(jsonb_build_object('code', 'wrong_reference', 'level', 'refuse', 'detail', 'each baby its own patient, never the mother'));
  end if;
  if d ->> 'mode' = 'caesarean' and (d ? 'perineum' or d ? 'episiotomy' or coalesce((d ->> 'repaired')::boolean, false)) then
    return jsonb_build_array(jsonb_build_object('code', 'perineum_after_caesarean', 'level', 'refuse', 'detail', 'no perineum, episiotomy or repair after a caesarean'));
  end if;
  if d ->> 'perineum' = 'intact' and coalesce((d ->> 'episiotomy')::boolean, false) then
    return jsonb_build_array(jsonb_build_object('code', 'perineum_intact', 'level', 'refuse', 'detail', 'an episiotomy: the perineum is not intact'));
  end if;
  if d ? 'blood_loss' and (d -> 'blood_loss' ->> 'ucum' is distinct from 'mL' or (d -> 'blood_loss' ->> 'value')::numeric < 0) then
    return jsonb_build_array(jsonb_build_object('code', 'blood_loss_unit', 'level', 'refuse', 'detail', 'the blood loss in mL, 0 or more'));
  end if;
  return '[]';
end $$;
-- ── FHIR (§6.4): the delivery as a Procedure, its words as the outcome; recorded by whoever signed it (as the base's Procedure), and
-- performed by them only when they also delivered: the bundle's people are the entries' authors, so someone else who delivered is
-- kept in the birth and not exported (a reference to them would not resolve) ──
create function obgyn.birth_fhir(p jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := (p ->> 'org')::uuid; l jsonb := p -> 'entries' -> (jsonb_array_length(p -> 'entries') - 1); o jsonb; d jsonb;
begin
  select e into o from jsonb_array_elements(p -> 'entries') with ordinality x(e, n) where e ->> 'type' <> 'crossed_out' order by n desc limit 1;
  if o is null then return '[]'; end if;
  d := o -> 'data';
  return jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('resourceType', 'Procedure', 'id', o ->> 'item',
    'meta', core.fhir_meta(l, coalesce((p ->> 'private')::boolean, false)),
    'status', case when l ->> 'type' = 'crossed_out' or coalesce((l ->> 'redacted')::boolean, false) then 'entered-in-error' else 'completed' end,
    'code', jsonb_build_object('text', 'Delivery, ' || obgyn.mode_words(d ->> 'mode')), 'subject', jsonb_build_object('reference', 'Patient/' || (p ->> 'patient')),
    'encounter', case when o ->> 'visit_id' is not null then jsonb_build_object('reference', 'Encounter/' || (o ->> 'visit_id')) end,
    'performedDateTime', core.fhir_date((o ->> 'occurred_at')::timestamptz, o ->> 'precision', v_org),
    'recorder', jsonb_build_object('reference', 'PractitionerRole/' || (o ->> 'author_id')),
    'performer', case when d -> 'delivered_by' ->> 'id' = o ->> 'author_id'
      then jsonb_build_array(jsonb_build_object('actor', jsonb_build_object('reference', 'PractitionerRole/' || (o ->> 'author_id')))) end,
    'outcome', jsonb_build_object('text', obgyn.birth_line(o)),
    'note', case when coalesce(d ->> 'note', '') <> '' then jsonb_build_array(jsonb_build_object('text', d ->> 'note')) end)));
end $$;

-- ── the board's words (the owner's C1, 2026-10-08): for each stay admitted here, its labour examinations (the cervix and the head for
-- the partograph, G and P as said), the latest heart rate of the baby, the pregnancy standing now, the birth in the stay, and a baby's
-- Apgar scores, weight and doses — as the reader may see them (the doors mask). The babies are this department's admitted stays too.
-- This department's stays only, read here, never ids from the client; each patient it names is read-logged by the door ──
create function obgyn.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; v_pt uuid; v_stay uuid; v_ids uuid[] := '{}'; v_out jsonb := '{}'; v jsonb; n record; v_apgar jsonb;
begin
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_pt := (s ->> 'patient_id')::uuid; v_stay := (s ->> 'item')::uuid; v_ids := v_ids || v_pt;
    v := jsonb_build_object('exams', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('at', x.occurred_at, 'cervix', x.data -> 'cervix',
        'descent', x.data -> 'descent', 'gravida', x.data -> 'gravida', 'para', x.data -> 'para')) order by x.occurred_at, x.recorded_at)
      from core.pack_kind(p_org, v_pt, 'obgyn.labour_exam', '{"current":true,"limit":200}'::jsonb) x
      where x.visit_id = v_stay and (x.data ? 'cervix' or x.data ? 'gravida')), '[]'::jsonb));
    select (x.data -> 'value' -> 'quantity' ->> 'value')::numeric as value, x.occurred_at as at into n
      from core.pack_kind(p_org, v_pt, 'observation', '{"current":true,"codes":["loinc:55283-6"],"limit":50}'::jsonb) x
     where x.visit_id = v_stay order by x.occurred_at desc, x.recorded_at desc limit 1;
    if found then v := v || jsonb_build_object('fhr', jsonb_build_object('value', n.value, 'at', n.at)); end if;
    select x.data, x.occurred_at into n from core.pack_kind(p_org, v_pt, 'pregnancy', '{"current":true,"limit":10}'::jsonb) x
     where x.data ->> 'status' = 'current' and (x.data ->> 'pregnant')::boolean order by x.occurred_at desc, x.recorded_at desc limit 1;
    if found then
      v := v || jsonb_build_object('pregnancy', jsonb_strip_nulls(jsonb_build_object('lmp', n.data -> 'lmp' ->> 'value', 'weeks', n.data -> 'weeks', 'at', n.occurred_at)));
    end if;
    -- the birth in this stay: when, how, the blood loss, each baby's sex and weight
    select x.data, x.occurred_at into n from core.pack_kind(p_org, v_pt, 'obgyn.birth', '{"current":true,"limit":10}'::jsonb) x
     where x.visit_id = v_stay order by x.occurred_at desc, x.recorded_at desc limit 1;
    if found then
      v := v || jsonb_build_object('birth', jsonb_strip_nulls(jsonb_build_object('at', n.occurred_at, 'mode', n.data ->> 'mode',
        'blood_loss', (n.data -> 'blood_loss' ->> 'value')::numeric,
        'babies', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('sex', b ->> 'sex', 'grams', b -> 'grams', 'born_at', b ->> 'born_at')) order by k)
                   from jsonb_array_elements(n.data -> 'babies') with ordinality y(b, k)))));
    end if;
    -- a baby's stay (admitted as born here, or with Apgar scores in it): its Apgar scores (their notes say 1 min and 5 min, none when
    -- the card left them out), its latest weight, the doses given in it
    select coalesce(jsonb_agg(jsonb_build_object('note', x.data ->> 'note', 'total', (x.data ->> 'total')::int) order by x.occurred_at), '[]'::jsonb) into v_apgar
      from core.pack_kind(p_org, v_pt, 'score', '{"current":true,"data":{"score":"obgyn.apgar"},"limit":10}'::jsonb) x where x.visit_id = v_stay;
    if jsonb_array_length(v_apgar) > 0
       or exists (select 1 from core.pack_visit(p_org, v_stay, 'admitted') x where x.item = v_stay and x.data ->> 'admit_source' = 'born') then
      v := v || jsonb_build_object('baby', jsonb_strip_nulls(jsonb_build_object('apgar', v_apgar,
        'kg', (select (x.data -> 'weight' ->> 'value')::numeric from core.pack_kind(p_org, v_pt, 'vitals', '{"current":true,"limit":20}'::jsonb) x
               where x.visit_id = v_stay and x.data ? 'weight' order by x.occurred_at desc limit 1),
        'given', (select jsonb_agg(jsonb_build_object('drug', x.data -> 'drug' ->> 'text', 'at', x.occurred_at) order by x.occurred_at)
                  from core.pack_kind(p_org, v_pt, 'given', '{"current":true,"limit":50}'::jsonb) x
                  where x.visit_id = v_stay and x.data ->> 'status' = 'completed'))));
    end if;
    v_out := v_out || jsonb_build_object(v_stay::text, v);
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'stays', v_out);
end $$;

reset role;

select core.declare_action('write:obgyn.labour_exam', 'obgyn', 'department', '{"en":"Write a labour examination (/ve, /ctx)"}', everyday => true);
select core.declare_type('obgyn.labour_exam', 1, 'obgyn', $j${"type":"object","additionalProperties":false,"minProperties":1,
  "properties":{"cervix":{"type":"number","minimum":0,"maximum":10},"descent":{"type":"integer","minimum":0,"maximum":5},
    "position":{"enum":["oa","loa","roa","lot","rot","op","lop","rop","breech"]},
    "liquor":{"enum":["intact","clear","meconium","blood","absent"]},"moulding":{"enum":["0","+","++","+++"]},"caput":{"enum":["none","+","++"]},
    "contractions":{"type":"object","additionalProperties":false,"required":["per_10"],
      "properties":{"per_10":{"type":"integer","minimum":0,"maximum":7},"seconds":{"type":"integer","minimum":5,"maximum":180}}},
    "gravida":{"type":"integer","minimum":1,"maximum":20},"para":{"type":"integer","minimum":0,"maximum":19},"note":{"type":"string","minLength":1}}}$j$::jsonb,
  'obgyn.labour_exam_line(jsonb)', array['Observation'], to_fhir => 'obgyn.labour_exam_fhir(jsonb)',
  labels => '{"en":"Labour examination","ar":"فحص المخاض"}');

select core.declare_setting('obgyn.partograph', 'obgyn', 'department', $j${"type":"object","additionalProperties":false,"required":["active_from"],
  "properties":{"active_from":{"type":"integer","enum":[4,5],"default":4}}}$j$::jsonb,
  labels => '{"en":"Partograph","ar":"مخطط المخاض"}', form => 'department',
  fields => $j$[{"key":"active_from","labels":{"en":"Active labour from"},"help":{"en":"The cervix, in cm, from which the partograph starts and its alert line runs at 1 cm an hour, the action line 4 hours to its right. 4 cm: the WHO's modified partograph. 5 cm: the same alert and action lines, started at 5 cm (not the Labour Care Guide, which has no alert or action line)."},
    "choices":{"4":{"en":"4 cm"},"5":{"en":"5 cm"}}}]$j$::jsonb);

select core.declare_screen('obgyn.labour', 'obgyn', 'stays', '{"en":"Labour","ar":"المخاض"}', 'read:record');
select core.declare_op('obgyn.board', 'obgyn', 'obgyn.board(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

-- the birth (spec §5.6: the pack's own type): the mother's, in her stay, occurred at the first baby's birth; each baby's record made in
-- the same Done (the owner's Q10). Not everyday: the Midwife and the Obstetrician hold it (below)
select core.declare_action('write:obgyn.birth', 'obgyn', 'department', '{"en":"Sign a birth and make each baby''s record"}');
select core.declare_type('obgyn.birth', 1, 'obgyn', $j${"type":"object","additionalProperties":false,"required":["mode","babies"],
  "properties":{"mode":{"enum":["normal","vacuum","forceps","breech","caesarean"]},
    "perineum":{"enum":["intact","first","second","third","fourth"]},"episiotomy":{"type":"boolean"},"repaired":{"type":"boolean"},
    "placenta":{"enum":["complete","incomplete"]},"blood_loss":{"$ref":"#/$defs/quantity"},"delivered_by":{"$ref":"#/$defs/reference"},
    "babies":{"type":"array","minItems":1,"maxItems":8,"items":{"type":"object","additionalProperties":false,"required":["patient","born_at","sex"],
      "properties":{"patient":{"$ref":"#/$defs/reference"},"born_at":{"$ref":"#/$defs/datetime"},"sex":{"enum":["female","male","unknown"]},
        "grams":{"type":"integer","minimum":300,"maximum":6500},"breathing":{"enum":["cried","rubbed","bag_mask"]}}}},
    "note":{"type":"string"}}}$j$::jsonb,
  'obgyn.birth_line(jsonb)', array['Procedure'], to_fhir => 'obgyn.birth_fhir(jsonb)', checks => array['obgyn.birth_check(jsonb,jsonb)']::regprocedure[],
  labels => '{"en":"Birth","ar":"ولادة"}');

-- Apgar (1953): five signs, 0, 1 or 2 each, at 1 and 5 minutes (the score's note says which)
select core.declare_score('obgyn.apgar', 'obgyn', '1953',
  'Apgar V. A proposal for a new method of evaluation of the newborn infant. Current Researches in Anesthesia and Analgesia 1953;32(4):260–267',
  $j$[
  {"key":"colour","labels":{"en":"Colour"},"input":"choice","choices":[{"value":"0","points":0,"labels":{"en":"Blue or pale all over"}},
    {"value":"1","points":1,"labels":{"en":"Blue hands and feet"}},{"value":"2","points":2,"labels":{"en":"Pink all over"}}]},
  {"key":"heart","labels":{"en":"Heart rate"},"input":"choice","choices":[{"value":"0","points":0,"labels":{"en":"None"}},
    {"value":"1","points":1,"labels":{"en":"Under 100"}},{"value":"2","points":2,"labels":{"en":"100 or more"}}]},
  {"key":"grimace","labels":{"en":"Grimace"},"input":"choice","choices":[{"value":"0","points":0,"labels":{"en":"No response"}},
    {"value":"1","points":1,"labels":{"en":"Grimace"}},{"value":"2","points":2,"labels":{"en":"Cries or pulls away"}}]},
  {"key":"activity","labels":{"en":"Activity"},"input":"choice","choices":[{"value":"0","points":0,"labels":{"en":"Limp"}},
    {"value":"1","points":1,"labels":{"en":"Some flexion"}},{"value":"2","points":2,"labels":{"en":"Active movement"}}]},
  {"key":"breathing","labels":{"en":"Breathing"},"input":"choice","choices":[{"value":"0","points":0,"labels":{"en":"None"}},
    {"value":"1","points":1,"labels":{"en":"Slow or irregular"}},{"value":"2","points":2,"labels":{"en":"Good, crying"}}]}]$j$,
  $j$[{"key":"low","labels":{"en":"Low"},"min":0,"max":3,"tone":"danger"},{"key":"moderate","labels":{"en":"Moderately abnormal"},"min":4,"max":6,"tone":"warn"},
    {"key":"reassuring","labels":{"en":"Reassuring"},"min":7,"max":10,"tone":null}]$j$,
  '{"en":"Apgar score","ar":"مقياس أبجار"}', 'Apgar', 'apgar');

-- the Midwife (the clinics' build, d302, built on Nurse) admits a woman in labour and discharges her; the labour examination is
-- everyday, so she and the Obstetrician (d301, built on Doctor) hold it where a department uses ObGyn
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d302', 'write:admitted');
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d302', 'write:discharged');
-- the birth is the Midwife's and the Obstetrician's (not everyday): it makes each baby's record, so they register patients too
-- (manage:patients is a core action: they hold it wherever they hold the role, whether or not the department uses ObGyn — in the
-- demo the Labour ward and the ObGyn clinic — so they can register, merge and edit patients there: awaiting the owner)
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d301', 'write:obgyn.birth');
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d302', 'write:obgyn.birth');
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d301', 'manage:patients');
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d302', 'manage:patients');

-- its starter setup (§5.2): four delivery beds, four postnatal beds and six cots (each a place labelled bed, named so), inpatient
-- stays, the board and the Labour tab, active labour from 4 cm
select core.declare_setup('obgyn.labour_ward', 'obgyn', 'stays', '{"en":"Labour ward","ar":"قسم الولادة"}', packs => array['obgyn'],
  screens => '{"screens":["base.beds","obgyn.labour"],"opens":"base.beds"}',
  settings => '{"department.encounter_class":{"class":"IMP"},"department.review_results":{"level":"critical"},"obgyn.partograph":{"active_from":4}}',
  places => (select jsonb_agg(p order by k) from (
      select n k, jsonb_build_object('key', 'delivery_' || n, 'name', 'Delivery ' || n, 'label', 'bed') p from generate_series(1, 4) n
      union all select 4 + n, jsonb_build_object('key', 'post_' || n, 'name', 'Post ' || n, 'label', 'bed') from generate_series(1, 4) n
      union all select 8 + n, jsonb_build_object('key', 'cot_' || n, 'name', 'Cot ' || n, 'label', 'bed') from generate_series(1, 6) n) x),
  help => '{"en":"Four delivery beds, four postnatal beds and six cots on the board; the labour examinations drawn on the WHO''s modified partograph, on the Labour tab."}');

select core.lock_pack('obgyn');
