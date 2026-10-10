-- Ward nursing's going home (spec §5.6, W3b): the department setting bedside.home_words with its five Egyptian Arabic phrases; the
-- going-home set as a doctor writes it from /home — the letter (the base's note, kind discharge), a ward medicine kept signed again in
-- this visit, a medicine stopped with its reason, a new one, and the base's discharge, in one set — the stay closed and the list as it
-- should be; the same set refused for a nurse; after Discharge closed the stay first, the letter and a medicine change still land in it,
-- and a second discharge is refused.
\set org   '00000000-0000-0000-0000-0000000000a1'
\set ward  '00000000-0000-0000-0000-0000000000d6'
\set pt    '00000000-0000-0000-0000-0000000000f1'
\set pt2   '00000000-0000-0000-0000-0000000000f2'
\set stay  '00000000-0000-0000-0000-00000000ea01'
\set stay2 '00000000-0000-0000-0000-00000000ea02'
\set m1    '00000000-0000-0000-0000-00000000ea11'
\set m2    '00000000-0000-0000-0000-00000000ea12'
\set rec   '11111111-0000-0000-0000-0000000000b4'
\set ow    '11111111-0000-0000-0000-0000000000b9'
\set dr    '11111111-0000-0000-0000-0000000000b1'
\set nurse '11111111-0000-0000-0000-0000000000b3'
select t.fixture();
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["bedside"]'::jsonb))) ->> 'key' as on;
select public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', :'ward', 'data', '{"packs":["bedside"]}'::jsonb)) ->> 'key' as ticked;

\echo '── the words for the patient: a setting on the department''s card, five Egyptian Arabic phrases as its defaults'
select t.ok(k.layer = 'bedside' and k.owner_kind = 'department' and k.form = 'department' and not k.many and k.labels ->> 'en' = 'Going home · words for the patient',
  'bedside.home_words: Ward nursing''s, one per department, on its card') from core.setting_keys k where k.key = 'bedside.home_words';
select t.ok((select array_agg(f ->> 'key' order by n) from jsonb_array_elements(k.fields) with ordinality x(f, n)) = array['phrases', 'phrases.label', 'phrases.ar'],
  'its form: the phrases, each a name and its Arabic') from core.setting_keys k where k.key = 'bedside.home_words';
select t.ok(jsonb_array_length(d) = 5 and d -> 0 ->> 'label' = 'Come back if' and (select bool_and(length(p ->> 'ar') between 1 and 400 and p ->> 'ar' ~ '[ء-ي]') from jsonb_array_elements(d) p),
  'five defaults, the first "Come back if", each in Arabic and under 400 characters') from (select k.shape -> 'properties' -> 'phrases' -> 'default' d from core.setting_keys k where k.key = 'bedside.home_words') x;
select public.write_setting(jsonb_build_object('key', 'bedside.home_words', 'owner_id', :'ward', 'data',
  '{"phrases":[{"label":"Come back if","ar":"ارجع لو تعبت"},{"label":"Diet","ar":"كل أكل خفيف"}]}'::jsonb)) ->> 'key' as saved;
select t.ok(jsonb_array_length(core.setting_at(:'org', 'bedside.home_words', :'ward') -> 'phrases') = 2, 'the ward''s own two phrases are saved');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.home_words','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  (select jsonb_build_object('phrases', jsonb_agg(jsonb_build_object('label', 'P' || i, 'ar', 'كلمة'))) from generate_series(1, 21) i)), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.home_words','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"phrases":[{"label":"","ar":"كلمة"}]}'), 'bad_shape');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.home_words','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  jsonb_build_object('phrases', jsonb_build_array(jsonb_build_object('label', 'Long', 'ar', repeat('ك', 401))))), 'bad_shape');
select t.as(:'nurse');
select t.refuses(format($q$select public.write_setting(jsonb_build_object('key','bedside.home_words','owner_id',%L,'data',%L::jsonb))$q$, :'ward',
  '{"phrases":[{"label":"Diet","ar":"كل"}]}'), 'not_allowed');

set role authenticated;
\echo '── a stay with two ward medicines'
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"emd","reason":"COPD exacerbation"}', :'stay', :'stay')), 'admitted to the ward');
select t.landed(t.w(t.e('medication', :'pt', :'ward', '{"basis":"prescribed","drug":{"text":"Prednisolone","codings":[{"system":"atc","code":"H02AB06","display":"Prednisolone"}]},
  "dosage":{"dose":{"value":"40","unit":"mg","ucum":"mg"},"timing":{"code":"OD"},"route":"oral"},"duration_days":5,"status":"active"}', :'m1', :'stay'),
  null, array['allergy_clash','allergy_caution','duplicate_medication','duplicate_class','already_on_list']), 'prednisolone in the stay');
select t.landed(t.w(t.e('medication', :'pt', :'ward', '{"basis":"prescribed","drug":{"text":"Salbutamol nebuliser","codings":[{"system":"atc","code":"R03AC02","display":"Salbutamol nebuliser"}]},
  "dosage":{"dose":{"value":"5","unit":"mg","ucum":"mg"},"timing":{"code":"q6h"},"route":"inhaled"},"status":"active"}', :'m2', :'stay'),
  null, array['allergy_clash','allergy_caution','duplicate_medication','duplicate_class','already_on_list']), 'the salbutamol nebuliser in the stay');

\echo '── going home as one set: the letter, the ward medicine kept, one stopped, one new, the discharge (no warning confirmed)'
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', :'ward', '{"kind":"discharge","text":"Diagnoses: COPD exacerbation\nMedicines for home: continue Prednisolone (40 mg · OD) · stop Salbutamol nebuliser (home on his inhalers) · new Amoxicillin-clavulanate 1 g BD × 5d"}',
    '00000000-0000-0000-0000-00000000ea13', :'stay'),
  t.e('medication', :'pt', :'ward', '{"basis":"prescribed","drug":{"text":"Prednisolone","codings":[{"system":"atc","code":"H02AB06","display":"Prednisolone"}]},"dosage":{"dose":{"value":"40","unit":"mg","ucum":"mg"},"timing":{"code":"OD"},"route":"oral"},"duration_days":5,"status":"active"}', '00000000-0000-0000-0000-00000000ea17', :'stay', :'m1', 'changes'),
  t.e('medication', :'pt', :'ward', '{"basis":"prescribed","drug":{"text":"Salbutamol nebuliser","codings":[{"system":"atc","code":"R03AC02","display":"Salbutamol nebuliser"}]},"dosage":{"dose":{"value":"5","unit":"mg","ucum":"mg"},"timing":{"code":"q6h"},"route":"inhaled"},"status":"stopped","status_reason":"home on his inhalers"}',
    '00000000-0000-0000-0000-00000000ea14', :'stay', :'m2', 'changes'),
  t.e('medication', :'pt', :'ward', '{"basis":"prescribed","drug":{"text":"Amoxicillin-clavulanate","codings":[{"system":"atc","code":"J01CR02","display":"Amoxicillin-clavulanate"}]},
    "dosage":{"dose":{"value":"1","unit":"g","ucum":"g"},"timing":{"code":"BD"},"route":"oral"},"duration_days":5,"status":"active"}', '00000000-0000-0000-0000-00000000ea15', :'stay'),
  t.e('discharged', :'pt', :'ward', '{"disposition":"home"}', '00000000-0000-0000-0000-00000000ea16', :'stay', t.latest(:'stay'), 'changes')),
  '00000000-0000-0000-0000-00000000ea20'), 'the going-home set lands as the doctor''s, nothing to confirm');
reset role;
select t.ok(count(*) = 5 and bool_and(e.set_id = '00000000-0000-0000-0000-00000000ea20'), 'the five share one set') from core.entries e
 where e.id in ('00000000-0000-0000-0000-00000000ea13', '00000000-0000-0000-0000-00000000ea14', '00000000-0000-0000-0000-00000000ea15', '00000000-0000-0000-0000-00000000ea16', '00000000-0000-0000-0000-00000000ea17');
select t.ok((select l.status from base.lists l where l.item = :'m2') = 'stopped' and (select l.status = 'active' and l.entry_id = '00000000-0000-0000-0000-00000000ea17' from base.lists l where l.item = :'m1')
  and (select l.status from base.lists l where l.item = '00000000-0000-0000-0000-00000000ea15') = 'active',
  'the list: the nebuliser stopped, prednisolone active at its repeat (signed in this visit), the new one active');
set role authenticated;
select t.as(:'dr');
select t.ok(r ->> 'state' = 'discharged', 'the stay is discharged') from t.rows('base.presence', :'ward', jsonb_build_object('item', :'stay')) r;
select t.ok(e ->> 'line' like 'Discharge · Diagnoses: COPD exacerbation · Medicines for home:%' and e -> 'data' ->> 'kind' = 'discharge',
  'the letter in the record: "Discharge · Diagnoses: …", kind discharge') from (select t.entry(t.record(:'pt', :'ward'), '00000000-0000-0000-0000-00000000ea13') e) x;

\echo '── a nurse may not send a patient home'
select t.as(:'rec');
select public.save_patient(jsonb_build_object('department_id', '00000000-0000-0000-0000-0000000000d4', 'patient', jsonb_build_object('id', :'pt2', 'given', jsonb_build_array('Mona'),
  'family', 'Saleh', 'gender', 'female', 'birth_date', '1975-06-02'))) is not null as registered;
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt2', :'ward', '{"admit_source":"emd","reason":"cellulitis"}', :'stay2', :'stay2')), 'another patient admitted');
select t.as(:'nurse');
select t.refused(t.w(jsonb_build_array(
  t.e('note', :'pt2', :'ward', '{"kind":"discharge","text":"Diagnoses: cellulitis"}', '00000000-0000-0000-0000-00000000ea21', :'stay2'),
  t.e('discharged', :'pt2', :'ward', '{"disposition":"home"}', '00000000-0000-0000-0000-00000000ea22', :'stay2', t.latest(:'stay2'), 'changes'))), 'not_allowed',
  'the nurse''s going-home set is refused');

\echo '── Discharge first: the letter and a medicine change still land in the closed stay; a second discharge does not'
select t.as(:'dr');
select t.landed(t.w(jsonb_build_array(
  t.e('note', :'pt', :'ward', '{"kind":"discharge","text":"Diagnoses: COPD exacerbation\nMedicines for home: stop Prednisolone"}', '00000000-0000-0000-0000-00000000ea23', :'stay'),
  t.e('medication', :'pt', :'ward', '{"basis":"prescribed","drug":{"text":"Prednisolone","codings":[{"system":"atc","code":"H02AB06","display":"Prednisolone"}]},"dosage":{"dose":{"value":"40","unit":"mg","ucum":"mg"},"timing":{"code":"OD"},"route":"oral"},"duration_days":5,"status":"stopped"}',
    '00000000-0000-0000-0000-00000000ea24', :'stay', '00000000-0000-0000-0000-00000000ea17', 'changes'))), 'the letter and a stop land in the discharged stay');
select t.refused(t.w(t.e('discharged', :'pt', :'ward', '{"disposition":"home"}', '00000000-0000-0000-0000-00000000ea25', :'stay', t.latest(:'stay'), 'changes')), 'visit_closed',
  'a second discharge is refused');
select t.as(null);
