-- 37 · ObGyn's labour ward (spec/openCare.md §5.6), piece L1: the partograph. The pack itself, with its Obstetrician and Midwife, is the
-- clinics' build's (migration 27); the labour ward adds to the same layer here, with no second declare_pack. A labour
-- examination is the pack's own type (obgyn.labour_exam: the cervix, the head in fifths, the position, the liquor, moulding, caput, the
-- contractions; G and P as said); the baby's heart is the base's observation (LOINC 55283-6, the owner's B1) and the mother's signs the
-- base's vitals. The WHO's modified partograph is drawn from them on the Labour tab: active labour from 4 cm (the department's setting,
-- 4 or 5), the alert line at 1 cm an hour, the action line 4 hours to its right; past a line is a notice, never a stop. The labour
-- ward's starter setup (delivery beds, postnatal beds, cots) and the board's words through the pack's own op (the owner's C1, read by
-- the tile through C7). Chosen by
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

-- ── the board's words (the owner's C1, 2026-10-08): for each stay admitted here, its labour examinations (the cervix and the head for
-- the partograph, G and P as said), the latest heart rate of the baby, and the pregnancy standing now — as the reader may see them (the
-- doors mask). This department's stays only, read here, never ids from the client; each patient it names is read-logged by the door ──
create function obgyn.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; v_pt uuid; v_stay uuid; v_ids uuid[] := '{}'; v_out jsonb := '{}'; v jsonb; n record;
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

-- the Midwife (the clinics' build, d302, built on Nurse) admits a woman in labour and discharges her; the labour examination is
-- everyday, so she and the Obstetrician (d301, built on Doctor) hold it where a department uses ObGyn
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d302', 'write:admitted');
select core.declare_role_action('obgyn', '00000000-0000-0000-0000-00000000d302', 'write:discharged');

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
