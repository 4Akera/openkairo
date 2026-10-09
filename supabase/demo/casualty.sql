-- Emergency's day (spec/openCare.md §5.6): three of the pack's own patients, each arrived through the ER's door as the base's admitted
-- with no place, then triaged by Heba Nabil: the vitals (the base's), the triage (the pack's, on the Australasian scale), the base's
-- urgent for a level 1 or 2, a resus bay when one is free. Karim (a road accident, level 2) waits in Resus 2 with no doctor yet, past his
-- ten minutes; Hany (a cut hand, level 4) waits on the chairs past his hour; Nadia has just arrived, not triaged yet. Salwa (COPD, level 3
-- though the vitals suggested 2, the nurse said why) was seen by Dr. Tamer Ezz, and the decision to admit her to the Medical Ward was made
-- forty minutes ago: she is boarding. Mostafa (9, a scorpion sting, observed) is decided for home. Karim is a police case, the report
-- number not come yet. Times relative to the load, all within today's five hours; ids in the pack's namespace; a reload erases these
-- patients first.
select demo.layer('casualty');

-- the ER's place named, when free, else its first free one; none free: null (the chairs). A patient the app admitted since keeps theirs
create or replace function pg_temp.bay(p_key text) returns uuid language sql as $$
  select x.id from core.places x where x.organization_id = demo.base('clinic') and x.department_id = demo.id('casualty', 'department') and x.retired_at is null
     and not exists (select 1 from base.presence p where p.organization_id = x.organization_id and p.place_id = x.id and p.kind = 'stay' and p.state = 'admitted')
   order by x.id = core.setup_id(demo.id('casualty', 'department'), 'place', p_key) desc, x.position limit 1
$$;

-- an arrival p_min minutes ago, by the triage nurse: the base's admitted with no place; returns the stay
create or replace function pg_temp.arrive(p_min int, p_source text, p_reason text) returns uuid language plpgsql as $$
declare er uuid := demo.id('casualty', 'department'); s uuid := gen_random_uuid();
begin
  perform demo.w(demo.id('casualty', 'triage nurse'), jsonb_build_array(demo.e('admitted', er, s, demo.ago(p_min),
    jsonb_strip_nulls(jsonb_build_object('department_id', er, 'admit_source', p_source, 'reason', p_reason)), s)));
  return s;
end $$;

-- a triage p_min minutes ago, as the card signs it: the vitals, the triage on the Australasian scale, the base's urgent for a level 1 or 2,
-- a move to the place named when one is free; returns the stay's latest entry after it
create or replace function pg_temp.triage(p_stay uuid, p_after uuid, p_min int, p_level int, p_vitals jsonb, p_more jsonb, p_note text, p_place text default null)
returns uuid language plpgsql as $$
declare er uuid := demo.id('casualty', 'department'); at timestamptz := demo.ago(p_min); u uuid := gen_random_uuid(); m uuid := gen_random_uuid();
  w text := case p_level when 1 then 'Immediate' when 2 then 'Very urgent' when 3 then 'Urgent' when 4 then 'Standard' else 'Non-urgent' end;
  b uuid := case when p_place is not null then pg_temp.bay(p_place) end; last uuid := p_after; es jsonb;
begin
  es := jsonb_build_array(demo.e('vitals', er, p_stay, at, p_vitals),
    demo.e('casualty.triage', er, p_stay, at, jsonb_strip_nulls(jsonb_build_object(
      'code', jsonb_build_object('text', 'Triage level (Australasian scale)'),
      'value', jsonb_build_object('concept', jsonb_build_object('text', p_level || ' · ' || w,
        'codings', jsonb_build_array(jsonb_build_object('system', 'casualty.ats', 'code', p_level::text, 'display', w)))),
      'note', p_note, 'casualty', jsonb_build_object('scale', 'ats', 'scale_version', 'P06', 'level', p_level) || p_more))));
  if p_level <= 2 then es := es || jsonb_build_array(demo.move('urgent', er, p_stay, at, last, '{"urgent":true}', u)); last := u; end if;
  if b is not null then es := es || jsonb_build_array(demo.move('moved', er, p_stay, at, last, jsonb_build_object('place_id', b), m)); last := m; end if;
  perform demo.w(demo.id('casualty', 'triage nurse'), es);
  return last;
end $$;

-- the doctor takes the stay p_min minutes ago (the base's assigned, to himself); returns its id
create or replace function pg_temp.take(p_stay uuid, p_after uuid, p_min int) returns uuid language plpgsql as $$
declare a uuid := gen_random_uuid();
begin
  perform demo.w(demo.id('casualty', 'doctor'), jsonb_build_array(demo.move('assigned', demo.id('casualty', 'department'), p_stay, demo.ago(p_min), p_after,
    jsonb_build_object('user_id', demo.id('casualty', 'doctor')), a)));
  return a;
end $$;

-- the doctor writes one entry in the stay p_min minutes ago
create or replace function pg_temp.dr(p_type text, p_stay uuid, p_min int, p_data jsonb) returns void language sql as $$
  select demo.w(demo.id('casualty', 'doctor'), jsonb_build_array(demo.e(p_type, demo.id('casualty', 'department'), p_stay, demo.ago(p_min), p_data)));
$$;

do $$
declare s uuid; last uuid;
begin
  -- Karim, 34: a road accident by ambulance; level 2 (suggested 2: RR 28 and severe pain), in Resus 2, no doctor yet
  perform demo.patient(demo.id('casualty', 'patient:karim'), array['Karim', 'Ashraf'], 'Mahmoud', 'male', demo.born(34, 80), '+201009917345');
  s := pg_temp.arrive(16, 'other', 'road accident');
  perform pg_temp.triage(s, s, 12, 2, demo.vitals(96, 60, 124, 36.8, 92, 28) || '{"consciousness":"a","oxygen":{"on":"air"}}',
    '{"arrival":"ambulance","arrival_ref":"4471","complaint":"injury_road","danger":["severe_pain"],"suggested":{"level":2,"signs":["rr","severe_pain"]},"police":{"case":true,"why":"road_accident"}}',
    'motorbike vs microbus, helmet, pain left chest and left thigh', 'resus_2');

  -- Hany, 45: a cut hand, walked in; level 4, on the chairs past his hour
  perform demo.patient(demo.id('casualty', 'patient:hany'), array['Hany', 'Mostafa'], 'Sherif', 'male', demo.born(45, 150), '+201113308264');
  s := pg_temp.arrive(80, 'other', 'cut hand');
  perform pg_temp.triage(s, s, 72, 4, demo.vitals(132, 84, 88, 36.9, 98, 16) || '{"consciousness":"a","oxygen":{"on":"air"}}',
    '{"arrival":"walked_in","complaint":"wound"}', 'glass cut, left palm, bleeding stopped with pressure');

  -- Salwa, 71: COPD, short of breath; suggested 2 from SpO₂ 88, but that is her own baseline, so the nurse chose 3 and said why; Cubicle 1.
  -- Dr. Tamer took her twenty-two minutes after she came; the decision to admit her to the Medical Ward was forty minutes ago: boarding
  perform demo.patient(demo.id('casualty', 'patient:salwa'), array['Salwa', 'Mahmoud'], 'Hamed', 'female', demo.born(71, 40), '+201006632218');
  s := pg_temp.arrive(125, 'other', 'short of breath');
  last := pg_temp.triage(s, s, 122, 3, demo.vitals(142, 86, 108, 37.6, 88, 22) || '{"consciousness":"a","oxygen":{"on":"air"}}',
    '{"arrival":"family","complaint":"breath","suggested":{"level":2,"signs":["spo2"]},"why":"known COPD: her usual SpO₂ is 88 %; talking in full sentences"}',
    'COPD, breathless for two days, worse since last night', 'cubicle_1');
  last := pg_temp.take(s, last, 103);
  perform pg_temp.dr('allergy', s, 100, jsonb_build_object('concept', demo.concept('local.allergen', 'sulfonamide_antibiotics', 'Sulfonamide antibiotics'),
    'type', 'allergy', 'category', '["medication"]'::jsonb, 'criticality', 'high', 'clinical_status', 'active', 'verification', 'confirmed',
    'reactions', jsonb_build_array(jsonb_build_object('manifestation', jsonb_build_object('text', 'rash and lip swelling'), 'severity', 'severe'))));
  perform pg_temp.dr('note', s, 98, demo.note('emergency', E'hx: COPD, oxygen at home at night; two days more breathless, green sputum\nex: wheeze both sides, SpO₂ 88 % on air, alert\nplan: nebulisers, steroids, antibiotics; oxygen by Venturi 24 % only if SpO₂ falls below 88 % (target 88–92 %); blood gas; admit to the Medical Ward'));
  perform pg_temp.dr('casualty.disposition', s, 40, jsonb_build_object('to', 'ward', 'department_id', demo.base('ward')));

  -- Mostafa, 9: a scorpion sting, observed four hours; level 3 (under 16: nothing suggested), Cubicle 3; decided for home
  perform demo.patient(demo.id('casualty', 'patient:mostafa'), array['Mostafa', 'Ahmed'], 'Saeed', 'male', demo.born(9, 200), '+201114490037');
  s := pg_temp.arrive(290, 'other', 'scorpion sting');
  last := pg_temp.triage(s, s, 286, 3, demo.vitals(104, 66, 112, 37.1, 99, 24) || '{"consciousness":"a","oxygen":{"on":"air"}}',
    '{"arrival":"family","complaint":"sting_bite"}', 'scorpion sting on the right foot an hour ago; pain, no sweating, no vomiting', 'cubicle_3');
  last := pg_temp.take(s, last, 280);
  perform pg_temp.dr('note', s, 275, demo.note('emergency', E'hx: scorpion sting right foot, pain only\nex: local swelling; no sweating, no vomiting, no fast breathing\nplan: pain relief, watch four hours; home if well'));
  perform pg_temp.dr('casualty.disposition', s, 15, '{"to":"home"}');

  -- Nadia, 52: just arrived, not triaged yet
  perform demo.patient(demo.id('casualty', 'patient:nadia'), array['Nadia', 'Fathy'], 'Ibrahim', 'female', demo.born(52, 230), '+201220475513');
  perform pg_temp.arrive(6, 'other', null);
end $$;
