-- The obgyn pack's day, its clinic part (spec/openCare.md §5.1 rule 9, §5.8, the pictures #anc-visit … #ob-queue): its own patients
-- in the ObGyn clinic. Rania Saad (28+3 weeks, in consult with Dr. Nermeen Fathy: G3 P1+1, a caesarean before, O Rh negative — anti-D
-- and the OGTT due at 28 weeks, Hb 10.4), Nahla Gaber (32+0 weeks, in consult with Dr. Ahmed Zaki: her first pregnancy, her clinic scan
-- at 28 weeks), Eman Abdelaal (42, waiting: heavy periods, a fibroid, her copper IUD ten years and seven months in, a smear due next
-- month), Aya Ramadan (waiting: her pregnancy never ended at 45 weeks — the birth not written) and Reham Nassar (30 weeks, next: BP
-- 150/100 today). Times relative to the load; ids in the pack's namespace; a reload erases these patients first.
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
