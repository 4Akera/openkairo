-- 17 · Ward nursing (spec/openCare.md §5.6). Its key is bedside; a person always reads "Ward nursing". (The spec's `ward` is a word
-- core files already use, so the lint would refuse it as a pack key.) It declares NEWS2 (the Royal College of Physicians, 2017) as two
-- of the server's score tables: SpO₂ scale 1, and scale 2 for a patient whose doctor set a target of 88–92 %. NEWS2 is written by the
-- base's /v, which Ward nursing adds NEWS2 to wherever a department uses the pack (the owner's C3): the base's score beside the base's
-- vitals, in one set. The board shows each stay's latest NEWS2 through the pack's own op (the owner's C1). It also declares its starter
-- setup: a ward with Ward nursing ticked. Still no type, table, action or role of its own. Proposed by Claude, awaiting the owner.

set client_min_messages = warning;

select core.declare_pack('bedside', 1, '{}', '{"en":"Ward nursing","ar":"تمريض الأقسام"}', role_block => 'd0');
select core.create_pack('bedside');

-- ── NEWS2, SpO₂ scale 1: seven items, each with its points; the total 0–20 in three bands (RCP 2017) ──
select core.declare_score('bedside.news2', 'bedside', '2017',
  'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017',
  $j$[
  {"key":"rr","labels":{"en":"Respiration rate","ar":"معدل التنفس"},"input":"number","unit":"/min","decimals":0,"min":1,"max":80,
   "ranges":[{"max":8,"points":3},{"min":9,"max":11,"points":1},{"min":12,"max":20,"points":0},{"min":21,"max":24,"points":2},{"min":25,"points":3}]},
  {"key":"spo2","labels":{"en":"SpO₂ (scale 1)","ar":"تشبع الأكسجين"},"input":"number","unit":"%","decimals":0,"min":50,"max":100,
   "ranges":[{"max":91,"points":3},{"min":92,"max":93,"points":2},{"min":94,"max":95,"points":1},{"min":96,"points":0}]},
  {"key":"oxygen","labels":{"en":"Air or oxygen","ar":"هواء أم أكسجين"},"input":"choice","choices":[
   {"value":"air","points":0,"labels":{"en":"Air","ar":"هواء الغرفة"}},{"value":"oxygen","points":2,"labels":{"en":"Oxygen","ar":"أكسجين"}}]},
  {"key":"sbp","labels":{"en":"Systolic blood pressure","ar":"الضغط الانقباضي"},"input":"number","unit":"mmHg","decimals":0,"min":40,"max":300,
   "ranges":[{"max":90,"points":3},{"min":91,"max":100,"points":2},{"min":101,"max":110,"points":1},{"min":111,"max":219,"points":0},{"min":220,"points":3}]},
  {"key":"pulse","labels":{"en":"Pulse","ar":"النبض"},"input":"number","unit":"/min","decimals":0,"min":20,"max":300,
   "ranges":[{"max":40,"points":3},{"min":41,"max":50,"points":1},{"min":51,"max":90,"points":0},{"min":91,"max":110,"points":1},{"min":111,"max":130,"points":2},{"min":131,"points":3}]},
  {"key":"consciousness","labels":{"en":"Consciousness (ACVPU)","ar":"الوعي"},"input":"choice","choices":[
   {"value":"a","points":0,"labels":{"en":"Alert","ar":"واعٍ"}},{"value":"c","points":3,"labels":{"en":"New confusion","ar":"تشوش جديد"}},
   {"value":"v","points":3,"labels":{"en":"Voice","ar":"يستجيب للصوت"}},{"value":"p","points":3,"labels":{"en":"Pain","ar":"يستجيب للألم"}},
   {"value":"u","points":3,"labels":{"en":"Unresponsive","ar":"لا يستجيب"}}]},
  {"key":"temp","labels":{"en":"Temperature","ar":"الحرارة"},"input":"number","unit":"°C","decimals":1,"min":25.0,"max":45.0,
   "ranges":[{"max":35.0,"points":3},{"min":35.1,"max":36.0,"points":1},{"min":36.1,"max":38.0,"points":0},{"min":38.1,"max":39.0,"points":1},{"min":39.1,"points":2}]}]$j$,
  $j$[{"key":"low","labels":{"en":"Low","ar":"منخفض"},"min":0,"max":4,"tone":null},{"key":"medium","labels":{"en":"Medium","ar":"متوسط"},"min":5,"max":6,"tone":"warn"},
    {"key":"high","labels":{"en":"High","ar":"مرتفع"},"min":7,"max":20,"tone":"danger"}]$j$,
  '{"en":"NEWS2 (SpO₂ scale 1)","ar":"مقياس الإنذار المبكر NEWS2"}', 'NEWS2', 'news2');

-- ── NEWS2, SpO₂ scale 2: the same, its saturation scored against a target of 88–92 % (a choice: on air or on oxygen above 92 %).
-- Its bands say "scale 2", so the record's line reads "NEWS2 3, 2017 · Low · scale 2". No coding on either table: no NEWS2 code is in
-- the base's LOINC subset, and an item's value is its points, not the measurement ──
select core.declare_score('bedside.news2_s2', 'bedside', '2017',
  'Royal College of Physicians. National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS. Updated report of a working party. London: RCP, 2017',
  $j$[
  {"key":"rr","labels":{"en":"Respiration rate","ar":"معدل التنفس"},"input":"number","unit":"/min","decimals":0,"min":1,"max":80,
   "ranges":[{"max":8,"points":3},{"min":9,"max":11,"points":1},{"min":12,"max":20,"points":0},{"min":21,"max":24,"points":2},{"min":25,"points":3}]},
  {"key":"spo2_s2","labels":{"en":"SpO₂ (scale 2)","ar":"تشبع الأكسجين (المقياس ٢)"},"input":"choice","choices":[
   {"value":"le83","points":3,"labels":{"en":"≤ 83 %"}},{"value":"84_85","points":2,"labels":{"en":"84–85 %"}},{"value":"86_87","points":1,"labels":{"en":"86–87 %"}},
   {"value":"88_92","points":0,"labels":{"en":"88–92 %"}},{"value":"ge93_air","points":0,"labels":{"en":"≥ 93 % on air"}},
   {"value":"93_94_o2","points":1,"labels":{"en":"93–94 % on oxygen"}},{"value":"95_96_o2","points":2,"labels":{"en":"95–96 % on oxygen"}},
   {"value":"ge97_o2","points":3,"labels":{"en":"≥ 97 % on oxygen"}}]},
  {"key":"oxygen","labels":{"en":"Air or oxygen","ar":"هواء أم أكسجين"},"input":"choice","choices":[
   {"value":"air","points":0,"labels":{"en":"Air","ar":"هواء الغرفة"}},{"value":"oxygen","points":2,"labels":{"en":"Oxygen","ar":"أكسجين"}}]},
  {"key":"sbp","labels":{"en":"Systolic blood pressure","ar":"الضغط الانقباضي"},"input":"number","unit":"mmHg","decimals":0,"min":40,"max":300,
   "ranges":[{"max":90,"points":3},{"min":91,"max":100,"points":2},{"min":101,"max":110,"points":1},{"min":111,"max":219,"points":0},{"min":220,"points":3}]},
  {"key":"pulse","labels":{"en":"Pulse","ar":"النبض"},"input":"number","unit":"/min","decimals":0,"min":20,"max":300,
   "ranges":[{"max":40,"points":3},{"min":41,"max":50,"points":1},{"min":51,"max":90,"points":0},{"min":91,"max":110,"points":1},{"min":111,"max":130,"points":2},{"min":131,"points":3}]},
  {"key":"consciousness","labels":{"en":"Consciousness (ACVPU)","ar":"الوعي"},"input":"choice","choices":[
   {"value":"a","points":0,"labels":{"en":"Alert","ar":"واعٍ"}},{"value":"c","points":3,"labels":{"en":"New confusion","ar":"تشوش جديد"}},
   {"value":"v","points":3,"labels":{"en":"Voice","ar":"يستجيب للصوت"}},{"value":"p","points":3,"labels":{"en":"Pain","ar":"يستجيب للألم"}},
   {"value":"u","points":3,"labels":{"en":"Unresponsive","ar":"لا يستجيب"}}]},
  {"key":"temp","labels":{"en":"Temperature","ar":"الحرارة"},"input":"number","unit":"°C","decimals":1,"min":25.0,"max":45.0,
   "ranges":[{"max":35.0,"points":3},{"min":35.1,"max":36.0,"points":1},{"min":36.1,"max":38.0,"points":0},{"min":38.1,"max":39.0,"points":1},{"min":39.1,"points":2}]}]$j$,
  $j$[{"key":"low","labels":{"en":"Low · scale 2","ar":"منخفض · المقياس ٢"},"min":0,"max":4,"tone":null},
    {"key":"medium","labels":{"en":"Medium · scale 2","ar":"متوسط · المقياس ٢"},"min":5,"max":6,"tone":"warn"},
    {"key":"high","labels":{"en":"High · scale 2","ar":"مرتفع · المقياس ٢"},"min":7,"max":20,"tone":"danger"}]$j$,
  '{"en":"NEWS2 (SpO₂ scale 2: target 88–92 %)","ar":"مقياس الإنذار المبكر NEWS2 (المقياس ٢)"}', 'NEWS2', 'news2s2');

-- ── its starter setup (§5.2): the base's ward with Ward nursing ticked — eight beds, inpatient stays, the bed board. Served on the
-- base's Medical Ward, its beds, encounter class, review level and Screens line are already the same: only the tick is added ──
select core.declare_setup('bedside.ward', 'bedside', 'stays', '{"en":"Ward with Ward nursing","ar":"قسم داخلي بتمريض الأقسام"}', packs => array['bedside'],
  screens => '{"screens":["base.beds"],"opens":"base.beds"}',
  settings => '{"department.encounter_class":{"class":"IMP"},"department.review_results":{"level":"critical"}}',
  places => (select jsonb_agg(jsonb_build_object('key', 'bed_' || n, 'name', 'Bed ' || n, 'label', 'bed') order by n) from generate_series(1, 8) n),
  help => '{"en":"Eight beds on the board, inpatient stays, and Ward nursing: NEWS2 with every full set of obs on /v."}');

-- ── the board's words (the owner's C1, 2026-10-08): each stay admitted here and its latest NEWS2 written in it, as the reader may see
-- it (the doors mask; a hidden entry comes back without its data and is passed over). This department's stays only, read here, never
-- ids from the client; each patient it names is read-logged by the door ──
set role pack_bedside;
create function bedside.board(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; n record; v_ids uuid[] := '{}'; v_news jsonb := '{}';
begin
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_ids := v_ids || (s ->> 'patient_id')::uuid;
    select x.data, x.occurred_at into n from core.pack_kind(p_org, (s ->> 'patient_id')::uuid, 'score', '{"current":true}'::jsonb) x
     where x.visit_id = (s ->> 'item')::uuid and x.data ->> 'score' in ('bedside.news2', 'bedside.news2_s2')
     order by x.occurred_at desc, x.recorded_at desc, x.id desc limit 1;
    if found then
      v_news := v_news || jsonb_build_object(s ->> 'item', jsonb_build_object('score', n.data ->> 'score', 'version', n.data ->> 'version',
        'total', (n.data ->> 'total')::int, 'band', n.data ->> 'band', 'at', n.occurred_at));
    end if;
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'news2', v_news);
end $$;
reset role;
select core.declare_op('bedside.board', 'bedside', 'bedside.board(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

select core.lock_pack('bedside');
