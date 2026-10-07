-- The pharmacy pack's day (spec/openCare.md §5.1 rule 9, §5.3): its own three patients on its main path. Each is seen in General
-- Practice this morning (the base's doctor prescribes and sends it to the Pharmacy, supabase/seeds/pharmacy.sql), then the
-- pharmacist works on it: one prescription prepared nearly an hour ago and still not collected, with a second the doctor signed
-- over her penicillin allergy (the pharmacist's check shows it, and the pharmacist has asked the doctor); one given in part ten minutes ago (one box now, the rest owed)
-- with a second still to give; and one given this morning. Times relative to the load; ids in the pack's namespace; a reload
-- erases these patients first (demo.patient).

select demo.layer('pharmacy');

-- a prescription sent to the Pharmacy: the medicine and its order, as the chart's /rx … send writes them
create or replace function pg_temp.rx(p_visit uuid, p_min int, p_med jsonb, p_order uuid) returns jsonb language sql as $$
  select jsonb_build_array(demo.gp('medication', p_visit, p_min, p_med, demo.id('pharmacy', 'med:' || p_order)),
    demo.e('order', demo.base('gp'), p_visit, demo.ago(p_min), jsonb_build_object('service', jsonb_build_object('id', demo.thing(demo.id('pharmacy', 'department'), 'service', 'dispense'),
      'code', 'dispense', 'name', 'Dispensing'), 'department_id', demo.id('pharmacy', 'department'), 'priority', 'routine', 'status', 'active'),
      p_order, demo.id('pharmacy', 'med:' || p_order), 'about'))
$$;
-- the pharmacist's answer: prepared (the service's step), or given with what went out
create or replace function pg_temp.dispense(p_order uuid, p_min int, p_data jsonb) returns jsonb language sql as $$
  select demo.w(demo.id('pharmacy', 'pharmacist'), jsonb_build_array(demo.e('pharmacy.dispense', demo.id('pharmacy', 'department'), null, demo.ago(p_min), p_data, null, p_order, 'answers')))
$$;
create or replace function pg_temp.given(p_drug text, p_atc text, p_quantity int, p_unit text) returns jsonb language sql immutable as $$
  select jsonb_build_object('status', 'completed', 'pharmacy', jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
    'drug', demo.concept('atc', p_atc, p_drug), 'quantity', demo.q(p_quantity, p_unit, '{tbl}')))))
$$;

do $$
declare v uuid; o1 uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid(); o5 uuid := gen_random_uuid();
begin
  -- prepared 55 minutes ago, not collected: late; and Augmentin, which the doctor signed over her penicillin allergy (a rash, last spring)
  perform demo.patient(demo.id('pharmacy', 'patient:samia'), array['Samia', 'Hosny'], 'Fathallah', 'female', demo.born(64, 23), '+201098812240');
  perform demo.w(demo.base('doctor'), jsonb_build_array(demo.e('allergy', demo.base('gp'), null, demo.ago(60 * 24 * 150), '{"concept":{"text":"Penicillins",
    "codings":[{"system":"local.allergen","code":"penicillins","display":"Penicillins"}]},"type":"allergy","category":["medication"],"clinical_status":"active",
    "verification":"confirmed","reactions":[{"manifestation":{"text":"Rash"},"severity":"mild"}]}')));
  v := demo.arrive('blood pressure high at the pharmacy', 150);
  perform demo.consult(v, 130, jsonb_build_array(
    demo.gp('vitals', v, 128, demo.vitals(162, 96, 78, 36.7, 97, 16, 79)),
    demo.gp('problem', v, 126, demo.problem('I10', 'Essential hypertension'))) || pg_temp.rx(v, 125, demo.med('Amlodipine', 'C08CA01', 10, 'mg', 'OD', '{"duration_days":30}'), o1)
    || pg_temp.rx(v, 124, demo.med('Augmentin', 'J01CR02', 1, 'g', 'BID', '{"duration_days":7,"instructions":"after meals"}'), o5), 120);
  perform pg_temp.dispense(o1, 55, '{"status":"in-progress","step":"prepared"}');
  -- the pharmacist asked the doctor about the Augmentin five minutes ago: on Dr. Ali's To review and in Samia's chart until he answers
  perform demo.w(demo.id('pharmacy', 'pharmacist'), jsonb_build_array(demo.e('question', demo.id('pharmacy', 'department'), null, demo.ago(5),
    '{"text":"Allergy: Penicillins (a rash last spring). Change Augmentin 1 g twice a day?"}', null, o5, 'about')));

  -- given in part ten minutes ago (one box of thirty now, thirty owed); a second prescription still to give
  perform demo.patient(demo.id('pharmacy', 'patient:hamdy'), array['Hamdy', 'Lotfi'], 'Shalaby', 'male', demo.born(51, 180), '+201225560913');
  v := demo.arrive('new diabetes, sugar 240 at work', 70);
  perform demo.consult(v, 55, jsonb_build_array(
    demo.gp('vitals', v, 53, demo.vitals(134, 84, 82, 36.8, 98, 16, 101, 175, 238)),
    demo.gp('problem', v, 51, demo.problem('E11.9', 'Type 2 diabetes mellitus')))
    || pg_temp.rx(v, 48, demo.med('Metformin', 'A10BA02', 500, 'mg', 'BD', '{"duration_days":30,"instructions":"with meals"}'), o2)
    || pg_temp.rx(v, 47, demo.med('Atorvastatin', 'C10AA05', 20, 'mg', 'OD', '{"duration_days":30}'), o3), 45);
  perform pg_temp.dispense(o2, 10, jsonb_build_object('status', 'in-progress', 'pharmacy', jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
    'drug', demo.concept('atc', 'A10BA02', 'Metformin 500 mg'), 'quantity', demo.q(30, 'tablets', '{tbl}'))), 'owed', demo.q(30, 'tablets', '{tbl}'), 'received_by', 'the patient')));

  -- given this morning
  perform demo.patient(demo.id('pharmacy', 'patient:mona'), array['Mona', 'Gaber'], 'Abdelhamid', 'female', demo.born(35, 302), '+201014478826');
  v := demo.arrive('sore throat and fever', 200);
  perform demo.consult(v, 185, jsonb_build_array(
    demo.gp('vitals', v, 183, demo.vitals(118, 76, 96, 38.2, 98, 18, 66)),
    demo.gp('problem', v, 181, demo.problem('J02.9', 'Acute pharyngitis', '{"category":"encounter-diagnosis"}')),
    demo.gp('list_review', v, 181, '{"list":"allergies","outcome":"none_known"}'))
    || pg_temp.rx(v, 180, demo.med('Amoxicillin', 'J01CA04', 500, 'mg', 'TID', '{"duration_days":7}'), o4), 175);
  perform pg_temp.dispense(o4, 150, pg_temp.given('Amoxicillin 500 mg', 'J01CA04', 21, 'capsules'));
end $$;

-- the stock's day (spec §5.3): the store keeper received this morning's delivery — Augmentin below its minimum, Nexium's batch
-- expiring in five weeks, nothing of Cidophage (out of stock); through the pack's door, as the screen writes it
do $$
declare dept uuid := demo.id('pharmacy', 'department');
begin
  perform demo.as(demo.id('pharmacy', 'store keeper'));
  perform public.pack_op(jsonb_build_object('op', 'pharmacy.stock_write', 'department_id', dept, 'args', jsonb_build_object('do', 'receive',
    'supplier', 'Ibn Sina Pharma', 'invoice', 'INV-55821', 'lines', (select jsonb_agg(jsonb_build_object('product_id', demo.id('pharmacy', 'product:' || l.brand), 'batch', l.batch,
      'expiry', to_char(demo.now() + make_interval(days => l.days), 'YYYY-MM'), 'boxes', l.boxes)) from (values
      ('Glucophage 500', '23K114', 240, 12), ('Augmentin 1 g', 'AUG2309', 120, 8), ('Nexium 40', 'NX4471', 40, 31), ('Concor 5', 'C5-778', 700, 44),
      ('Norvasc 10', 'NV2201', 420, 20), ('Lipitor 20', 'LP0901', 540, 10), ('Panadol Extra', 'PX0912', 520, 120)) l(brand, batch, days, boxes)))));
end $$;
