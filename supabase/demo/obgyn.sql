-- The obgyn pack's day, its clinic part (spec/openCare.md §5.1 rule 9, §5.8, the pictures #anc-visit … #ob-queue): its own patients
-- in the ObGyn clinic. Rania Saad (28+3 weeks, in consult with Dr. Nermeen Fathy: G3 P1+1, a caesarean before, O Rh negative — anti-D
-- and the OGTT due at 28 weeks, Hb 10.4), Nahla Gaber (32+0 weeks, in consult with Dr. Ahmed Zaki: her first pregnancy, her clinic scan
-- at 28 weeks), Eman Abdelaal (42, waiting: heavy periods, a fibroid, her copper IUD ten years and seven months in, a smear due next
-- month), Aya Ramadan (waiting: her pregnancy never ended at 45 weeks — the birth not written) and Reham Nassar (30 weeks, next: BP
-- 150/100 today). Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
-- The labour ward's women follow (§5.6): Salma Ahmed Abdelrahman, Doaa Hassan Mekky and Nesma Galal Badawy in labour on the Labour
-- ward, examined by the midwife Hanan Fouad. Salma Ahmed Abdelrahman, Doaa Hassan Mekky, Nesma Galal Badawy (and in L2 Heba Mostafa
-- Sherif and Marwa Adel Tawfik) are not the demo's other Salma Ali Saleh, Doaa Saber Hamed, Nesma Sabry, Heba Samir Gamal, Heba
-- Abdelwahab (pregnant, 24 weeks) and Marwa Shalaby: the same first names, different women.
select demo.layer('obgyn');

-- a pregnancy standing from its LMP, written on the day it was booked
create or replace function pg_temp.preg(p_lmp_days int) returns jsonb language sql stable as $$
  select jsonb_build_object('status', 'current', 'pregnant', true, 'lmp', jsonb_build_object('value', ((demo.now() at time zone 'Africa/Cairo')::date - p_lmp_days)::text, 'precision', 'day'))
$$;
-- an antenatal check's data: the weeks and days, the pack's words, the visit in words as the observation's value
create or replace function pg_temp.anc(p_w int, p_d int, p_o jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', jsonb_build_object('text', 'Antenatal visit'),
    'value', jsonb_build_object('text', concat_ws(' · ', 'Antenatal visit', p_w || '+' || p_d || ' w', 'fundus ' || (p_o ->> 'sfh'), 'FHR ' || (p_o ->> 'fhr'), p_o ->> 'lie', 'urine ' || (p_o ->> 'protein'))),
    'obgyn', jsonb_build_object('weeks', p_w, 'days', p_d) || p_o)
$$;
-- BP and weight
create or replace function pg_temp.bpw(p_sys int, p_dia int, p_kg numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('bp', jsonb_build_object('sys', demo.q(p_sys, 'mmHg', 'mm[Hg]'), 'dia', demo.q(p_dia, 'mmHg', 'mm[Hg]')), 'weight', demo.q(p_kg, 'kg', 'kg'))
$$;
-- one past antenatal visit (no queue visit: the check and its vitals at the same moment), at weeks+days of a pregnancy whose LMP was p_lmp days ago
create or replace function pg_temp.visit(p_doc uuid, p_lmp int, p_w int, p_d int, p_sys int, p_dia int, p_kg numeric, p_o jsonb) returns void language sql as $$
  select demo.w(p_doc, jsonb_build_array(
    demo.e('vitals', demo.id('obgyn', 'clinic'), null, demo.ago((p_lmp - (p_w * 7 + p_d)) * 1440), pg_temp.bpw(p_sys, p_dia, p_kg)),
    demo.e('obgyn.anc', demo.id('obgyn', 'clinic'), null, demo.ago((p_lmp - (p_w * 7 + p_d)) * 1440), pg_temp.anc(p_w, p_d, p_o))));
$$;
-- an observation by obgyn's own code (the method, cervical screening)
create or replace function pg_temp.coded(p_code text, p_label text, p_text text, p_note text default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('code', demo.concept('obgyn.codes', p_code, p_label), 'value', jsonb_build_object('text', p_text), 'note', p_note))
$$;

do $$
declare oc uuid := demo.id('obgyn', 'clinic'); nermeen uuid := demo.id('obgyn', 'nermeen'); zaki uuid := demo.id('obgyn', 'zaki');
  day int := 1440; v uuid; cbc uuid := gen_random_uuid();
begin
  -- ── Rania: 28+3 weeks today (LMP 199 days ago), G3 P1+1, a caesarean in a breech before, O Rh negative; in consult 7 minutes ──
  perform demo.patient(demo.id('obgyn', 'patient:rania'), array['Rania'], 'Saad', 'female', demo.born(29, 140), '+201005531902');
  perform demo.w(nermeen, jsonb_build_array(demo.e('pregnancy', oc, null, demo.ago((199 - 85) * day), pg_temp.preg(199))));
  perform pg_temp.visit(nermeen, 199, 12, 1, 112, 70, 62, '{"fhr":158,"protein":"nil","booking":{"gravida":3,"para":1,"miscarriages":1,"before":"caesarean 2 years ago (breech) · miscarriage last year at 9 w","blood_group":"O","rh":"negative","antibodies":"none at 12 w","risks":["previous_caesarean"]}}');
  perform pg_temp.visit(nermeen, 199, 16, 0, 110, 68, 64, '{"fhr":150,"protein":"nil"}');
  perform pg_temp.visit(nermeen, 199, 20, 2, 114, 72, 66, '{"sfh":20,"fhr":148,"protein":"nil","taken":["anomaly scan","tetanus toxoid"]}');
  perform pg_temp.visit(nermeen, 199, 24, 4, 116, 74, 68.5, '{"sfh":25,"fhr":146,"protein":"trace","lie":"cephalic"}');
  perform demo.w(nermeen, jsonb_build_array(demo.lab_order('cbc', oc, null, demo.ago((199 - 172) * day), cbc)));
  perform demo.lab(cbc, demo.ago((199 - 172) * day - 30), demo.cbc(true, 10.4, 7.1, 245));
  perform demo.w(nermeen, jsonb_build_array(demo.e('problem', oc, null, demo.ago((199 - 172) * day - 90), demo.problem('D50.9', 'Iron deficiency anaemia in pregnancy'))));
  v := demo.arrive('antenatal visit', 30, oc);
  perform demo.consult(v, 7, '[]', null, false, oc, nermeen);

  -- ── Nahla: 32+0 weeks (LMP 224 days ago), her first pregnancy, A Rh positive; her clinic scan at 28+1; in consult with Dr. Zaki 12 minutes ──
  perform demo.patient(demo.id('obgyn', 'patient:nahla'), array['Nahla'], 'Gaber', 'female', demo.born(26, 60), '+201117745020');
  perform demo.w(zaki, jsonb_build_array(demo.e('pregnancy', oc, null, demo.ago((224 - 87) * day), pg_temp.preg(224))));
  perform pg_temp.visit(zaki, 224, 16, 1, 106, 66, 61, '{"fhr":152,"protein":"nil","booking":{"gravida":1,"para":0,"before":"her first pregnancy","blood_group":"A","rh":"positive","antibodies":"none"}}');
  perform pg_temp.visit(zaki, 224, 20, 4, 108, 66, 62, '{"sfh":20,"fhr":150,"protein":"nil","taken":["anomaly scan","tetanus toxoid"]}');
  perform pg_temp.visit(zaki, 224, 24, 2, 108, 68, 63, '{"sfh":24,"fhr":148,"protein":"nil"}');
  perform pg_temp.visit(zaki, 224, 28, 1, 110, 70, 65, '{"sfh":27,"fhr":146,"protein":"nil","lie":"cephalic","taken":["OGTT","CBC"]}');
  perform demo.w(zaki, jsonb_build_array(demo.e('result', oc, null, demo.ago((224 - 197) * day - 20), jsonb_build_object('status', 'final', 'service', jsonb_build_object('name', 'Scan in the clinic'),
    'conclusion', 'Scan in the clinic · 28+1 w · EFW 1 090 g, 27th centile · deepest pool 4.1 cm · posterior · cephalic · FHR 146',
    'analytes', jsonb_build_array(jsonb_build_object('key', 'efw', 'name', 'Estimated fetal weight (Hadlock)', 'value', demo.q(1090, 'g', 'g')),
      jsonb_build_object('key', 'efw_centile', 'name', 'Fetal weight centile (Hadlock 1991)', 'text', '27th'), jsonb_build_object('key', 'dvp', 'name', 'Deepest pool', 'value', demo.q(4.1, 'cm', 'cm')),
      jsonb_build_object('key', 'placenta', 'name', 'Placenta', 'text', 'posterior'), jsonb_build_object('key', 'presentation', 'name', 'Presentation', 'text', 'cephalic'),
      jsonb_build_object('key', 'weeks', 'name', 'Weeks', 'text', '28+1 w'))))));
  v := demo.arrive('antenatal visit', 40, oc);
  perform demo.consult(v, 12, '[]', null, false, oc, zaki);

  -- ── Eman: 42, heavy periods, a fibroid, iron deficiency; her copper IUD since ten years and seven months, its change past; waiting 19 minutes ──
  perform demo.patient(demo.id('obgyn', 'patient:eman'), array['Eman'], 'Abdelaal', 'female', demo.born(42, 200), '+201002298814');
  perform demo.w(nermeen, jsonb_build_array(demo.e('observation', oc, null, demo.ago((365 * 10 + 214) * day), pg_temp.coded('contraception', 'Contraception method', 'Copper IUD', 'T380A'))));
  perform demo.w(nermeen, jsonb_build_array(demo.e('observation', oc, null, demo.ago((365 * 2 + 335) * day), pg_temp.coded('cervical_screening', 'Cervical screening', 'Pap smear · normal (NILM)'))));
  perform demo.w(nermeen, jsonb_build_array(
    demo.e('problem', oc, null, demo.ago(300 * day), demo.problem('N92.0', 'Heavy periods')),
    demo.e('problem', oc, null, demo.ago(6 * day), demo.problem('D25.9', 'Fibroid, intramural')),
    demo.e('problem', oc, null, demo.ago(6 * day), demo.problem('D50.9', 'Iron deficiency anaemia'))));
  perform demo.w(nermeen, jsonb_build_array(demo.e('obgyn.periods', oc, null, demo.ago(6 * day), jsonb_build_object('code', jsonb_build_object('text', 'Periods',
    'codings', jsonb_build_array(jsonb_build_object('system', 'loinc', 'code', '8665-2', 'display', 'Last menstrual period start date'))),
    'value', jsonb_build_object('text', 'Periods · every 26–28 days · 8–9 days · heavy, clots · pain moderate'),
    'obgyn', jsonb_build_object('lmp', ((demo.now() at time zone 'Africa/Cairo')::date - 17)::text, 'cycle_from', 26, 'cycle_to', 28, 'days_from', 8, 'days_to', 9,
      'flow', 'heavy', 'clots', true, 'pads', 8, 'pain', 'moderate')))));
  v := demo.arrive('heavy periods, the IUD', 19, oc);
  perform demo.w(nermeen, jsonb_build_array(demo.e('vitals', oc, v, demo.ago(15), demo.vitals(112, 70, 92, 36.8, 99, null, 74))));

  -- ── Aya: her pregnancy never ended (LMP 315 days ago, last seen at 38+2): the birth not written; waiting 12 minutes ──
  perform demo.patient(demo.id('obgyn', 'patient:aya'), array['Aya'], 'Ramadan', 'female', demo.born(27, 90), '+201224461397');
  perform demo.w(zaki, jsonb_build_array(demo.e('pregnancy', oc, null, demo.ago((315 - 64) * day), pg_temp.preg(315))));
  perform pg_temp.visit(zaki, 315, 9, 1, 110, 70, 64, '{"fhr":160,"protein":"nil","booking":{"gravida":2,"para":1,"before":"normal birth 3 years ago, a girl 3.1 kg","blood_group":"B","rh":"positive"}}');
  perform pg_temp.visit(zaki, 315, 34, 1, 116, 74, 72, '{"sfh":33,"fhr":144,"protein":"nil","lie":"cephalic"}');
  perform pg_temp.visit(zaki, 315, 36, 2, 118, 76, 73, '{"sfh":35,"fhr":140,"protein":"nil","lie":"cephalic"}');
  perform pg_temp.visit(zaki, 315, 38, 2, 118, 76, 74, '{"sfh":37,"fhr":138,"protein":"nil","lie":"cephalic"}');
  v := demo.arrive('six weeks after the birth', 12, oc);

  -- ── Reham: 30 weeks, BP 150/100 at the door today: next ──
  perform demo.patient(demo.id('obgyn', 'patient:reham'), array['Reham'], 'Nassar', 'female', demo.born(35, 30), '+201006652248');
  perform demo.w(nermeen, jsonb_build_array(demo.e('pregnancy', oc, null, demo.ago((212 - 70) * day), pg_temp.preg(212))));
  perform pg_temp.visit(nermeen, 212, 10, 0, 118, 76, 70, '{"fhr":162,"protein":"nil","booking":{"gravida":2,"para":1,"before":"normal birth 4 years ago","blood_group":"A","rh":"positive"}}');
  perform pg_temp.visit(nermeen, 212, 26, 2, 132, 84, 76, '{"sfh":26,"fhr":148,"protein":"trace"}');
  v := demo.arrive('headache since yesterday', 24, oc, 'urgent');
  perform demo.w(nermeen, jsonb_build_array(demo.e('vitals', oc, v, demo.ago(20), demo.vitals(150, 100, 96, 36.9, 98, null, 79))));
end $$;

-- ── the labour ward (§5.6): three women in labour, examined by Hanan Fouad, the midwife. Salma (G2 P1, 39+2 weeks, Delivery 1: 4 cm
-- four hours ago, 5 cm two hours ago, 6 cm now — past the alert line), Doaa (G1 P0, 40+5 weeks, Delivery 2: 3 cm, then 4 cm an hour
-- ago, when her active labour began) and Nesma (G3 P2, 38+1 weeks, a caesarean before, Delivery 3, urgent: 8 cm, the baby's heart 100
-- five minutes ago). Each exam with the baby's heart (the base's observation, LOINC 55283-6) and, every hour or two, the mother's signs
-- (the base's vitals). Heba (after a normal birth this morning, in Post 1, her girl in Cot 1) and Marwa (after a caesarean yesterday,
-- in Post 2, her boy in Cot 2), each birth signed in one Done with the baby's own record (the owner's Q10). Times relative to the load;
-- a reload erases these patients first. The women in labour today (Salma, Doaa, Nesma) are admitted at most 300 minutes before the
-- load, so their stays are today's however early it loads (demo.ago squeezes only within the day); the two births from earlier,
-- Heba's this morning and Marwa's yesterday, are filtered out of day_is_today (the labour ward's own block checks them) ──

-- a pregnancy standing from its LMP, so many days before today
create or replace function pg_temp.lw_preg(p_days int) returns jsonb language sql stable as $$
  select jsonb_build_object('status', 'current', 'pregnant', true,
    'lmp', jsonb_build_object('value', ((demo.now() at time zone 'Africa/Cairo')::date - p_days)::text, 'precision', 'day'))
$$;
-- the baby's heart, as /fhr writes it
create or replace function pg_temp.lw_fhr(p_value int) returns jsonb language sql immutable as $$
  select jsonb_build_object('code', demo.concept('loinc', '55283-6', 'Fetal heart rate'), 'value', jsonb_build_object('quantity', demo.q(p_value, 'bpm', '/min')))
$$;
-- a labour examination's data
create or replace function pg_temp.lw_exam(p_cervix numeric, p_descent int, p_position text, p_liquor text, p_moulding text, p_per10 int, p_seconds int,
  p_g int default null, p_p int default null, p_caput text default 'none') returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('cervix', p_cervix, 'descent', p_descent, 'position', p_position, 'liquor', p_liquor, 'moulding', p_moulding,
    'caput', p_caput, 'contractions', case when p_per10 is not null then jsonb_strip_nulls(jsonb_build_object('per_10', p_per10, 'seconds', p_seconds)) end,
    'gravida', p_g, 'para', p_p))
$$;
-- contractions alone, as /ctx writes them
create or replace function pg_temp.lw_ctx(p_per10 int, p_seconds int) returns jsonb language sql immutable as $$
  select jsonb_build_object('contractions', jsonb_build_object('per_10', p_per10, 'seconds', p_seconds))
$$;
-- the mother's signs, each only when given (demo.vitals writes a temperature with no value when it is null: bad_shape)
create or replace function pg_temp.lw_vit(sys int, dia int, hr int, t numeric default null) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'bp', case when sys is not null then jsonb_build_object('sys', demo.q(sys, 'mmHg', 'mm[Hg]'), 'dia', demo.q(dia, 'mmHg', 'mm[Hg]')) end,
    'hr', case when hr is not null then demo.q(hr, 'bpm', '/min') end, 'temp', case when t is not null then demo.q(t, '°C', 'Cel') end))
$$;
-- one moment of a labour, as the midwife signs it: the exam (when given), the baby's heart (when given), the mother's signs (when given)
create or replace function pg_temp.lw_at(p_stay uuid, p_at timestamptz, p_exam jsonb, p_fhr int, p_vitals jsonb default null) returns void language sql as $$
  select demo.w(demo.id('obgyn', 'hanan'), (select jsonb_agg(e order by k) from (
      select 1 k, demo.e('obgyn.labour_exam', demo.id('obgyn', 'labour ward'), p_stay, p_at, p_exam) e where p_exam is not null
      union all select 2, demo.e('observation', demo.id('obgyn', 'labour ward'), p_stay, p_at, pg_temp.lw_fhr(p_fhr)) where p_fhr is not null
      union all select 3, demo.e('vitals', demo.id('obgyn', 'labour ward'), p_stay, p_at, p_vitals) where p_vitals is not null) x));
$$;
-- admitted into a bed of the labour ward by its key, else the next free one there (a patient admitted in the app keeps hers); the
-- admission and the pregnancy in one set, as the midwife writes them
create or replace function pg_temp.lw_admit(p_stay uuid, p_at timestamptz, p_bed text, p_reason text, p_lmp_days int, p_preg uuid default null) returns uuid language plpgsql as $$
declare lw uuid := demo.id('obgyn', 'labour ward'); b uuid; r jsonb; v jsonb;
begin
  for b in select x.id from core.places x where x.organization_id = demo.base('clinic') and x.department_id = lw and x.retired_at is null
             order by x.id = demo.thing(lw, 'place', p_bed) desc, x.position loop
    v := jsonb_build_array(demo.e('admitted', lw, p_stay, p_at, jsonb_build_object('department_id', lw, 'place_id', b, 'admit_source', 'emd', 'reason', p_reason), p_stay),
      demo.e('pregnancy', lw, p_stay, p_at, pg_temp.lw_preg(p_lmp_days), p_preg));
    r := demo.send(demo.id('obgyn', 'hanan'), v);
    continue when r ->> 'outcome' <> 'landed' and jsonb_path_exists(coalesce(r -> 'findings', '[]'), '$[*] ? (@.code == "bed_taken")');
    perform demo.landed(r, v);
    return b;
  end loop;
  raise exception 'demo: no free bed on the labour ward';
end $$;

do $$
declare lw uuid := demo.id('obgyn', 'labour ward'); dr uuid := demo.id('obgyn', 'nermeen'); zaki uuid := demo.id('obgyn', 'zaki'); s uuid; a uuid;
begin
  -- Salma, 27: G2 P1 at 39+2 weeks; active labour from 4 cm four hours ago, 5 cm at two hours, 6 cm now: right of the alert line
  perform demo.patient(demo.id('obgyn', 'patient:salma'), array['Salma', 'Ahmed'], 'Abdelrahman', 'female', demo.born(27, 140), '+201014432907');
  s := gen_random_uuid(); a := gen_random_uuid();
  perform pg_temp.lw_admit(s, demo.ago(290), 'delivery_1', 'labour', 275);
  perform demo.w(dr, jsonb_build_array(demo.move('assigned', lw, s, demo.ago(285), s, jsonb_build_object('user_id', dr), a)));
  perform pg_temp.lw_at(s, demo.ago(240), pg_temp.lw_exam(4, 5, 'oa', 'intact', '0', 3, 30, 2, 1), 140, pg_temp.lw_vit(118, 76, 88, 37.1));
  perform pg_temp.lw_at(s, demo.ago(210), null, 138);
  perform pg_temp.lw_at(s, demo.ago(180), pg_temp.lw_ctx(3, 35), 144, pg_temp.lw_vit(null, null, 90));
  perform pg_temp.lw_at(s, demo.ago(150), null, 142);
  perform pg_temp.lw_at(s, demo.ago(120), pg_temp.lw_exam(5, 4, 'oa', 'clear', '0', 3, 35), 136, pg_temp.lw_vit(122, 78, 92, 37.2));
  perform pg_temp.lw_at(s, demo.ago(90), null, 140);
  perform pg_temp.lw_at(s, demo.ago(60), pg_temp.lw_ctx(3, 40), 148, pg_temp.lw_vit(null, null, 90));
  perform pg_temp.lw_at(s, demo.ago(30), null, 146);
  perform pg_temp.lw_at(s, demo.ago(5), pg_temp.lw_exam(6, 3, 'oa', 'clear', '+', 3, 40), 142, pg_temp.lw_vit(124, 80, 94, 37.4));

  -- Doaa, 22: G1 P0 at 40+5 weeks; 3 cm two hours ago (latent), 4 cm an hour ago: her active labour began then
  perform demo.patient(demo.id('obgyn', 'patient:doaa'), array['Doaa', 'Hassan'], 'Mekky', 'female', demo.born(22, 60), '+201117730215');
  s := gen_random_uuid(); a := gen_random_uuid();
  perform pg_temp.lw_admit(s, demo.ago(150), 'delivery_2', 'labour', 285);
  perform demo.w(dr, jsonb_build_array(demo.move('assigned', lw, s, demo.ago(145), s, jsonb_build_object('user_id', dr), a)));
  perform pg_temp.lw_at(s, demo.ago(120), pg_temp.lw_exam(3, 5, 'loa', 'intact', '0', 2, 25, 1, 0), 136, pg_temp.lw_vit(112, 70, 84, 36.9));
  perform pg_temp.lw_at(s, demo.ago(60), pg_temp.lw_exam(4, 5, 'loa', 'intact', '0', 3, 30), 140, pg_temp.lw_vit(116, 72, 86, 37.0));
  perform pg_temp.lw_at(s, demo.ago(30), null, 138);

  -- Nesma, 33: G3 P2 at 38+1 weeks, a caesarean before; 5 cm three hours ago, 7, then 8 cm; the baby's heart 128, then 100 five
  -- minutes ago (under 110: the tile says it in red). Urgent, with Dr. Ahmed Zaki
  perform demo.patient(demo.id('obgyn', 'patient:nesma'), array['Nesma', 'Galal'], 'Badawy', 'female', demo.born(33, 210), '+201009917348');
  s := gen_random_uuid(); a := gen_random_uuid();
  perform pg_temp.lw_admit(s, demo.ago(200), 'delivery_3', 'labour, previous caesarean', 267);
  perform demo.w(zaki, jsonb_build_array(demo.move('assigned', lw, s, demo.ago(195), s, jsonb_build_object('user_id', zaki), a)));
  perform demo.w(zaki, jsonb_build_array(demo.move('urgent', lw, s, demo.ago(194), a, '{"urgent":true}'::jsonb)));
  perform pg_temp.lw_at(s, demo.ago(180), pg_temp.lw_exam(5, 4, 'roa', 'clear', '0', 3, 40, 3, 2), 138, pg_temp.lw_vit(120, 76, 90, 37.0));
  perform pg_temp.lw_at(s, demo.ago(90), pg_temp.lw_exam(7, 3, 'oa', 'clear', '0', 4, 45), 132, pg_temp.lw_vit(124, 78, 94, 37.1));
  perform pg_temp.lw_at(s, demo.ago(20), pg_temp.lw_exam(8, 2, 'oa', 'clear', '+', 4, 45), 128);
  perform pg_temp.lw_at(s, demo.ago(5), null, 100);
end $$;

-- a birth as the one who delivered signs it, in one Done (the owner's Q10): the mother's birth, her oxytocin (10 units IM, or 5 units
-- slow IV at a caesarean) and her pregnancy's end; then the baby's new record, its stay in the cot (born here), its weight, its Apgar
-- at 1 and 5 minutes and its doses (text-only drugs: none is in the demo's ATC subset). The baby's entries refer to nothing of the
-- mother's, so a reload erases her, then demo.w_born erases the baby before making it again
create or replace function pg_temp.lw_birth(p_by uuid, p_mother uuid, p_stay uuid, p_preg uuid, p_lmp_days int, p_at timestamptz, p_birth jsonb,
  p_baby uuid, p_baby_stay uuid, p_sex text, p_grams int, p_cot text, p_name text, p_apgar1 jsonb, p_apgar5 jsonb, p_doses text[]) returns void language plpgsql as $$
declare lw uuid := demo.id('obgyn', 'labour ward'); v jsonb; d text;
begin
  perform demo.use(p_mother);
  v := jsonb_build_array(
    demo.e('obgyn.birth', lw, p_stay, p_at, p_birth || jsonb_build_object('babies', jsonb_build_array(jsonb_build_object(
      'patient', jsonb_build_object('to', 'patient', 'id', p_baby), 'born_at', p_at, 'sex', p_sex, 'grams', p_grams, 'breathing', 'cried')))),
    demo.e('given', lw, p_stay, demo.after(p_at, 1), jsonb_build_object('drug', jsonb_build_object('text', 'Oxytocin', 'codings', '[]'::jsonb), 'status', 'completed')
      || case when p_birth ->> 'mode' = 'caesarean' then jsonb_build_object('dose', demo.q(5, 'units', '[iU]'), 'route', 'iv', 'note', 'slow IV')
         else jsonb_build_object('dose', demo.q(10, 'units', '[iU]'), 'route', 'im') end),
    demo.e('pregnancy', lw, p_stay, p_at, pg_temp.lw_preg(p_lmp_days) || '{"status":"ended","reason":"delivered"}'::jsonb, null, p_preg, 'changes'));
  perform demo.use(p_baby);
  v := v || jsonb_build_array(
    demo.e('admitted', lw, p_baby_stay, p_at, jsonb_build_object('department_id', lw, 'place_id', demo.thing(lw, 'place', p_cot), 'admit_source', 'born',
      'reason', 'born here'), p_baby_stay),
    demo.e('vitals', lw, p_baby_stay, p_at, jsonb_build_object('weight', demo.q(trim_scale(round(p_grams / 1000.0, 3)), 'kg', 'kg'))),
    demo.e('score', lw, p_baby_stay, demo.after(p_at, 1), demo.score('obgyn.apgar', p_apgar1) || '{"note":"1 min"}'::jsonb),
    demo.e('score', lw, p_baby_stay, demo.after(p_at, 5), demo.score('obgyn.apgar', p_apgar5) || '{"note":"5 min"}'::jsonb));
  foreach d in array p_doses loop
    v := v || jsonb_build_array(demo.e('given', lw, p_baby_stay, demo.after(p_at, 10), jsonb_build_object('status', 'completed') || case d
      when 'vitamin_k' then jsonb_build_object('drug', jsonb_build_object('text', 'Vitamin K (phytomenadione)'),
        'dose', demo.q(case when p_grams < 1500 then 0.5 else 1 end, 'mg', 'mg'), 'route', 'im')
      when 'eye' then jsonb_build_object('drug', jsonb_build_object('text', 'Eye ointment (tetracycline 1%)'), 'route', 'eye')
      when 'hep_b' then jsonb_build_object('drug', jsonb_build_object('text', 'Hepatitis B vaccine'), 'dose', demo.q(0.5, 'mL', 'mL'), 'route', 'im') end));
  end loop;
  perform demo.w_born(p_by, v, jsonb_build_array(jsonb_build_object('id', p_baby, 'mother', p_mother, 'full_name', p_name, 'gender', p_sex,
    'birth_date', ((p_at at time zone 'Africa/Cairo')::date)::text, 'department_id', lw)));
  perform demo.use(p_mother);
end $$;

do $$
declare lw uuid := demo.id('obgyn', 'labour ward'); hanan uuid := demo.id('obgyn', 'hanan'); dr uuid := demo.id('obgyn', 'nermeen'); zaki uuid := demo.id('obgyn', 'zaki');
  d1 timestamptz := demo.midnight() - interval '1 day'; s uuid; a uuid; preg uuid;
begin
  -- Marwa, 35: G3 P2 (two caesareans before), a caesarean yesterday by Dr. Nermeen Fathy, her boy 3350 g in Cot 2; she is in Post 2
  -- now (written first: her stay frees Delivery 4 before Heba's)
  perform demo.patient(demo.id('obgyn', 'patient:marwa'), array['Marwa', 'Adel'], 'Tawfik', 'female', demo.born(35, 20), '+201006631174');
  s := gen_random_uuid(); a := gen_random_uuid(); preg := gen_random_uuid();
  perform pg_temp.lw_admit(s, d1 + interval '8 hours', 'delivery_4', 'labour, two caesareans before', 274, preg);
  perform demo.w(dr, jsonb_build_array(demo.move('assigned', lw, s, d1 + interval '8 hours 5 minutes', s, jsonb_build_object('user_id', dr), a)));
  perform pg_temp.lw_at(s, d1 + interval '8 hours 10 minutes', pg_temp.lw_exam(3, 4, 'lot', 'intact', '0', 2, 30, 3, 2), 136);
  perform pg_temp.lw_birth(dr, demo.id('obgyn', 'patient:marwa'), s, preg, 274, d1 + interval '10 hours 30 minutes',
    jsonb_build_object('mode', 'caesarean', 'placenta', 'complete', 'blood_loss', demo.q(700, 'mL', 'mL'), 'delivered_by', jsonb_build_object('to', 'user', 'id', dr)),
    demo.id('obgyn', 'patient:baby marwa'), gen_random_uuid(), 'male', 3350, 'cot_2', 'Baby of Marwa Adel Tawfik',
    '{"colour":"1","heart":"2","grimace":"2","activity":"1","breathing":"2"}', '{"colour":"2","heart":"2","grimace":"2","activity":"1","breathing":"2"}',
    array['vitamin_k', 'eye', 'hep_b']);
  perform demo.w(hanan, jsonb_build_array(demo.move('moved', lw, s, d1 + interval '12 hours', a, jsonb_build_object('place_id', demo.thing(lw, 'place', 'post_2')))));

  -- Heba, 30: G2 P1, a normal birth this morning, delivered and signed by Hanan Fouad; her girl 3100 g in Cot 1 (hepatitis B not yet);
  -- she is in Post 1 now
  perform demo.patient(demo.id('obgyn', 'patient:heba'), array['Heba', 'Mostafa'], 'Sherif', 'female', demo.born(30, 75), '+201112274406');
  s := gen_random_uuid(); a := gen_random_uuid(); preg := gen_random_uuid();
  perform pg_temp.lw_admit(s, demo.ago(720), 'delivery_4', 'labour', 280, preg);
  perform demo.w(zaki, jsonb_build_array(demo.move('assigned', lw, s, demo.ago(715), s, jsonb_build_object('user_id', zaki), a)));
  perform pg_temp.lw_at(s, demo.ago(660), pg_temp.lw_exam(4, 4, 'oa', 'intact', '0', 3, 35, 2, 1), 140);
  perform pg_temp.lw_at(s, demo.ago(420), pg_temp.lw_exam(8, 2, 'oa', 'clear', '0', 4, 45), 138);
  perform pg_temp.lw_at(s, demo.ago(340), pg_temp.lw_exam(10, 0, 'oa', 'clear', '+', 5, 50), 132);
  perform pg_temp.lw_birth(hanan, demo.id('obgyn', 'patient:heba'), s, preg, 280, demo.ago(320),
    jsonb_build_object('mode', 'normal', 'perineum', 'second', 'repaired', true, 'placenta', 'complete', 'blood_loss', demo.q(350, 'mL', 'mL'),
      'delivered_by', jsonb_build_object('to', 'user', 'id', hanan)),
    demo.id('obgyn', 'patient:baby heba'), gen_random_uuid(), 'female', 3100, 'cot_1', 'Baby of Heba Mostafa Sherif',
    '{"colour":"1","heart":"2","grimace":"2","activity":"1","breathing":"2"}', '{"colour":"2","heart":"2","grimace":"2","activity":"1","breathing":"2"}',
    array['vitamin_k', 'eye']);
  perform demo.w(hanan, jsonb_build_array(demo.move('moved', lw, s, demo.ago(240), a, jsonb_build_object('place_id', demo.thing(lw, 'place', 'post_1')))));
end $$;
