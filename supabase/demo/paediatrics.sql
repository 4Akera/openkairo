-- The paediatrics pack's day (spec/openCare.md §5.1 rule 9, §5.7, the pictures #paeds-*): its own patients. In the Paediatrics clinic,
-- with Dr. Rehab Shaker: Malek Shoukry (11 months, in consult: his weight has fallen from the 24th centile at 4 months to the 2nd today,
-- weight-for-length below −2), Jana Moataz (3 years 2 months, waiting: fever and a red left ear; her amoxicillin in July) and Kenzy Hafez
-- (10 months, waiting: her checks at 2, 4 and 6 months all yes; her newborn hearing screen said refer in both ears and was never
-- repeated). On the Children's ward, five children in beds 1, 2, 3, 5 and 6 with their latest weights (one weighed 4 days ago) and two
-- Brighton PEWS (3 and 4). Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
select demo.layer('paediatrics');

-- a weight, length and head (a baby's length is measured lying)
create or replace function pg_temp.grow(p_wt numeric, p_len numeric default null, p_head numeric default null, p_more jsonb default '{}') returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('weight', demo.q(p_wt, 'kg', 'kg'), 'height', case when p_len is not null then demo.q(p_len, 'cm', 'cm') end,
    'head', case when p_head is not null then demo.q(p_head, 'cm', 'cm') end, 'method', case when p_len is not null then 'lying' end)) || p_more
$$;
-- a newborn check: an observation by the pack's own code, its value in words or a quantity, a note
create or replace function pg_temp.newborn(p_code text, p_label text, p_value jsonb, p_note text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('code', demo.concept('paediatrics.newborn', p_code, p_label), 'value', p_value, 'note', p_note))
$$;
-- a development check at a list age, every milestone yes (the clinic's list as the seed loads it)
create or replace function pg_temp.dev(p_months int, p_age int) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', jsonb_build_object('text', 'Development check'), 'value', jsonb_build_object('text', '4 yes · all yes'),
    'paediatrics', jsonb_build_object('list', p_months || '-month', 'months', p_months, 'age_months', p_age, 'version', 'CDC 2022 (Learn the Signs. Act Early.)',
      'items', case p_months
        when 2 then '[{"area":"movement","text":"Holds the head up on the tummy","short":"head up","yes":true},{"area":"hands","text":"Opens the hands briefly","short":"opens hands","yes":true},
                      {"area":"talking","text":"Makes sounds other than crying","short":"sounds","yes":true},{"area":"social","text":"Smiles when you talk or smile","short":"smiles","yes":true}]'::jsonb
        when 4 then '[{"area":"movement","text":"Holds the head steady when held","short":"head steady","yes":true},{"area":"hands","text":"Holds a toy put in the hand","short":"holds a toy","yes":true},
                      {"area":"talking","text":"Coos: “oooo”, “aahh”","short":"coos","yes":true},{"area":"social","text":"Chuckles; smiles to get your attention","short":"chuckles","yes":true}]'::jsonb
        else '[{"area":"movement","text":"Rolls from tummy to back","short":"rolls","yes":true},{"area":"hands","text":"Reaches to grab a toy","short":"reaches","yes":true},
               {"area":"talking","text":"Takes turns making sounds with you","short":"turn-taking sounds","yes":true},{"area":"social","text":"Knows familiar people; laughs","short":"knows familiar people","yes":true}]'::jsonb end,
      'plan', '[]'::jsonb))
$$;
-- a stay on the Children's ward: the named bed when free, else the next free one (a child admitted in the app since keeps theirs)
create or replace function pg_temp.admit(p_doctor uuid, p_bed int, p_min int, p_reason text, p_urgent boolean default false) returns uuid language plpgsql as $$
declare s uuid := gen_random_uuid(); w uuid := demo.id('paediatrics', 'ward'); b uuid; r jsonb; v_last uuid;
  e jsonb := demo.e('admitted', w, s, demo.ago(p_min), jsonb_build_object('admit_source', 'outp', 'reason', p_reason), s);
begin
  for b in select x.id from core.places x where x.organization_id = demo.base('clinic') and x.department_id = w and x.retired_at is null
              order by x.id = demo.thing(w, 'place', 'bed_' || p_bed) desc, x.position loop
    r := demo.send(p_doctor, jsonb_build_array(jsonb_set(e, '{data,place_id}', to_jsonb(b))));
    continue when r ->> 'outcome' <> 'landed' and jsonb_path_exists(coalesce(r -> 'findings', '[]'), '$[*] ? (@.code == "bed_taken")');
    perform demo.landed(r, jsonb_build_array(e));
    v_last := (r -> 'entries' -> 0 ->> 'id')::uuid;
    if p_urgent then v_last := (demo.w(p_doctor, jsonb_build_array(demo.move('urgent', w, s, demo.ago(p_min - 5), v_last, '{"urgent":true}'))) -> 'entries' -> 0 ->> 'id')::uuid; end if;
    -- the responsible clinician on the tile
    perform demo.w(p_doctor, jsonb_build_array(demo.move('assigned', w, s, demo.ago(p_min - 6), v_last, jsonb_build_object('user_id', p_doctor))));
    return s;
  end loop;
  raise exception 'demo: no free bed on the Children''s ward';
end $$;

do $$
declare pc uuid := demo.id('paediatrics', 'clinic'); ward uuid := demo.id('paediatrics', 'ward');
  rehab uuid := demo.id('paediatrics', 'rehab'); kandil uuid := demo.id('paediatrics', 'kandil'); doha uuid := demo.id('paediatrics', 'doha');
  day int := 60 * 24; v uuid; s uuid;
begin
  -- ── Malek: 11 months; the weight from the 24th centile at 4 months to the 2nd today; in consult 6 minutes ──
  perform demo.patient(demo.id('paediatrics', 'patient:malek'), array['Malek'], 'Shoukry', 'male', demo.born(0, 335), '+201014473281');
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(335 * day - 60), pg_temp.grow(3.3, 50.0, 34.5, '{"note":"at birth, from the card"}'))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(274 * day), pg_temp.grow(5.4, 57.5, 39.0))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(213 * day), pg_temp.grow(6.5, 62.6, 41.4))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(152 * day), pg_temp.grow(7.0, 66.0, 43.0))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(61 * day), pg_temp.grow(7.3, 70.0, 44.6))));
  perform demo.w(rehab, jsonb_build_array(demo.e('note', pc, null, demo.ago(61 * day - 10), demo.note('progress', 'Breastfed, porridge twice a day. Diarrhoea twice since 6 months. Vaccines to 9 months.'))));
  v := demo.arrive('weight check, poor appetite', 30, pc);
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, v, demo.ago(20), pg_temp.grow(7.5, 72.4, 45.4))));
  perform demo.consult(v, 6, '[]', null, false, pc, rehab);

  -- ── Jana: 3 years 2 months; fever and a red left ear; amoxicillin in July; waiting 25 minutes ──
  perform demo.patient(demo.id('paediatrics', 'patient:jana'), array['Jana'], 'Moataz', 'female', demo.born(3, 61), '+201227716540');
  perform demo.w(rehab, jsonb_build_array(demo.e('medication', pc, null, demo.ago(90 * day), demo.med('Amoxicillin', 'J01CA04', 5, 'mL', 'TDS',
    '{"duration_days":7,"status":"stopped","status_reason":"Course complete","instructions":"250 mg/5 ml suspension"}'))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(90 * day), pg_temp.grow(13.6, null, null))));
  v := demo.arrive('fever, pulling her left ear', 25, pc);
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, v, demo.ago(18), demo.vitals(null, null, 128, 38.6, 98, 28, 14.2, 96.0))));

  -- ── Kenzy: 10 months; her development to 6 months all yes; the newborn hearing screen to repeat; waiting 15 minutes ──
  perform demo.patient(demo.id('paediatrics', 'patient:kenzy'), array['Kenzy'], 'Hafez', 'female', demo.born(0, 310), '+201153328876');
  perform demo.w(rehab, jsonb_build_array(
    demo.e('observation', pc, null, demo.ago(310 * day - 60), pg_temp.newborn('birth', 'Birth', '{"text":"39 wk · 3.1 kg · normal birth at another hospital"}')),
    demo.e('observation', pc, null, demo.ago(309 * day), pg_temp.newborn('hips', 'Hips', '{"text":"Ortolani and Barlow negative"}', 'day 1 and 6 wk')),
    demo.e('observation', pc, null, demo.ago(309 * day), pg_temp.newborn('eyes', 'Eyes', '{"text":"red reflex present, both"}', 'day 1 and 6 wk')),
    demo.e('procedure', pc, null, demo.ago(308 * day), jsonb_build_object('concept', demo.concept('paediatrics.newborn', 'hearing', 'Newborn hearing screen (OAE)'),
      'status', 'completed', 'outcome', 'refer, both ears', 'note', 'OAE on day 2 · repeat not done')),
    demo.e('observation', pc, null, demo.ago(307 * day), pg_temp.newborn('jaundice', 'Jaundice', jsonb_build_object('quantity', demo.q(11.6, 'mg/dL', 'mg/dL')), 'day 3 bilirubin · no phototherapy')),
    demo.e('observation', pc, null, demo.ago(306 * day), pg_temp.newborn('heel_prick', 'Heel prick', '{"text":"thyroid (TSH) normal"}', 'day 4 · the health unit''s slip'))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(249 * day), pg_temp.grow(5.0, 56.5, 38.0)),
    demo.e('paediatrics.development', pc, null, demo.ago(249 * day - 5), pg_temp.dev(2, 2))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(188 * day), pg_temp.grow(6.3, 62.0, 40.5)),
    demo.e('paediatrics.development', pc, null, demo.ago(188 * day - 5), pg_temp.dev(4, 4))));
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, null, demo.ago(127 * day), pg_temp.grow(7.2, 65.5, 42.0)),
    demo.e('paediatrics.development', pc, null, demo.ago(127 * day - 5), pg_temp.dev(6, 6))));
  v := demo.arrive('10-month check', 15, pc);
  perform demo.w(rehab, jsonb_build_array(demo.e('vitals', pc, v, demo.ago(10), pg_temp.grow(8.4, 71.0, 43.6))));

  -- ── the Children's ward: five children, each with the latest weight the board reads ──
  perform demo.patient(demo.id('paediatrics', 'patient:ziad'), array['Ziad'], 'Barakat', 'male', demo.born(2, 40), '+201006631174');
  s := pg_temp.admit(kandil, 1, 2 * day - 120, 'pneumonia');
  perform demo.w(doha, jsonb_build_array(demo.e('vitals', ward, s, demo.ago(day + 300), demo.vitals(null, null, 132, 38.2, 95, 38, 12.4))));
  perform demo.w(doha, jsonb_build_array(demo.e('score', ward, s, demo.ago(180), demo.score('paediatrics.pews', '{"behaviour":"sleeping","circulation":"pink","breathing":"normal","nebulisers":false,"vomiting":false}'))));

  perform demo.patient(demo.id('paediatrics', 'patient:rawan'), array['Rawan'], 'Mekky', 'female', demo.born(6, 100), '+201114490023');
  s := pg_temp.admit(rehab, 2, 300, 'gastroenteritis, dehydration');
  perform demo.w(doha, jsonb_build_array(demo.e('vitals', ward, s, demo.ago(280), demo.vitals(92, 58, 138, 38.4, 98, 26, 20.0))));
  perform demo.w(doha, jsonb_build_array(demo.e('score', ward, s, demo.ago(60), demo.score('paediatrics.pews', '{"behaviour":"irritable","circulation":"pale","breathing":"normal","nebulisers":false,"vomiting":false}'))));

  perform demo.patient(demo.id('paediatrics', 'patient:adam'), array['Adam'], 'Abdelmoneim', 'male', demo.born(0, 152), '+201228875519');
  s := pg_temp.admit(kandil, 3, 3 * day - 200, 'bronchiolitis', true);
  perform demo.w(doha, jsonb_build_array(demo.e('vitals', ward, s, demo.ago(2 * day + 120), demo.vitals(null, null, 168, 37.9, 92, 64, 6.8))));
  perform demo.w(doha, jsonb_build_array(demo.e('score', ward, s, demo.ago(40), demo.score('paediatrics.pews', '{"behaviour":"irritable","circulation":"pink","breathing":"recessing","nebulisers":false,"vomiting":false}'))));

  perform demo.patient(demo.id('paediatrics', 'patient:retaj'), array['Retaj'], 'Zidan', 'female', demo.born(9, 70), '+201009926631');
  s := pg_temp.admit(rehab, 5, 200, 'β-thalassaemia, transfusion');
  perform demo.w(doha, jsonb_build_array(demo.e('vitals', ward, s, demo.ago(190), demo.vitals(104, 62, 96, 36.8, 99, 20, 24.0))));

  perform demo.patient(demo.id('paediatrics', 'patient:yehia'), array['Yehia'], 'Sallam', 'male', demo.born(4, 20), '+201143367708');
  s := pg_temp.admit(kandil, 6, 4 * day - 60, 'UTI, febrile convulsion');
  perform demo.w(doha, jsonb_build_array(demo.e('vitals', ward, s, demo.ago(4 * day - 90), demo.vitals(98, 60, 124, 39.1, 97, 24, 16.0))));
end $$;
