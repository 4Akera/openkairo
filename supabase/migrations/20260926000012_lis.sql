-- 12 · the laboratory pack (spec/openCare.md §5.3). Its key is lis (a laboratory information system; "Laboratory" in every word a
-- person reads). It answers the base's result orders on screens of its own — Collect and Results, in place of the bench — with the
-- base's own types (steps for collected and received, results), so the order's status, the review loop and FHIR stay the base's. It
-- adds: its starter setup (the tests most asked for in Egypt, with ranges by sex and age and critical limits for the laboratory's
-- director to confirm); the sample number a collection gets (a counter of its own, through public.pack_op); and each value a patient
-- had, for the change check (a derived table, fed by a listener on the base's results).

set client_min_messages = warning;

select core.declare_pack('lis', 1, '{}', '{"en":"Laboratory","ar":"المعمل"}', role_block => 'cf');
select core.create_pack('lis');

set role pack_lis;

-- ── the sample numbers: one counter per laboratory and day; S-MMDD-NNNN, written on the tubes until labels print ──
create table lis.samples (
  organization_id uuid not null,
  department_id uuid not null,
  day           date not null,
  last          int not null default 0,
  primary key (organization_id, department_id, day)
);
create function lis.next_sample(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_day date := (now() at time zone coalesce(core.setting_at(p_org, 'organization.time_zone', p_org) ->> 'zone', 'Africa/Cairo'))::date; n int;
begin
  insert into lis.samples as s (organization_id, department_id, day, last) values (p_org, p_department, v_day, 1)
  on conflict (organization_id, department_id, day) do update set last = s.last + 1 returning s.last into n;
  return jsonb_build_object('sample', 'S-' || to_char(v_day, 'MMDD') || '-' || lpad(n::text, 4, '0'));
end $$;

-- ── each value a patient had (the change check): every final, corrected or amended result's numbers, by analyte key ──
create table lis.values (
  organization_id uuid not null,
  item          uuid not null,             -- the result item
  key           text not null,             -- the analyte's key (hb, creat)
  patient_id    uuid not null,
  value         numeric not null,
  unit          text,
  at            timestamptz not null,      -- when it was taken (clinical time)
  source_entries uuid[] not null,
  primary key (organization_id, item, key)
);
create index values_patient on lis.values (organization_id, patient_id, key, at desc);
create function lis.values_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
declare k uuid; l core.entries;
begin
  delete from lis.values where organization_id = p_org and item = any (p_items);
  foreach k in array p_items loop
    select x.* into l from core.pack_entries(p_org, array[k]) x where x.item = k order by x.item_version desc limit 1;
    continue when l.id is null or not (l.type = any (core.kinds('result'))) or coalesce(l.data ->> 'status', 'final') not in ('final', 'corrected', 'amended');
    insert into lis.values
    select p_org, k, a ->> 'key', core.survivor(p_org, l.patient_id), (a -> 'value' ->> 'value')::numeric, a -> 'value' ->> 'ucum', l.occurred_at,
           (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[k]) e where e.item = k)
      from jsonb_array_elements(coalesce(l.data -> 'analytes', '[]')) a
     where a ? 'key' and (a -> 'value' ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$'
    on conflict do nothing;
  end loop;
end $$;

reset role;

grant select, delete on lis.values to core_eraser;
grant execute on function lis.values_refresh(uuid, uuid[]) to core_eraser;

select core.declare_action('read:lis.values', 'lis', 'department', '{"en":"Read a patient''s earlier values (the change check)"}');
select core.declare_table('lis.values', 'lis', 'lis.values_refresh(uuid,uuid[])', 'read:lis.values');
select core.declare_listener('lis', array['result'], 'lis.values_refresh(uuid,uuid[])');
select core.declare_op('lis.sample', 'lis', 'lis.next_sample(uuid,uuid,uuid,jsonb)', 'write:step');
-- its technician (§5.2: a role built on a base role): all a lab technician holds, and the earlier values for the change check
select core.declare_role('00000000-0000-0000-0000-00000000cf01', 'lis.technician', 'lis', 'Lab technician', array['read:lis.values'], '{"en":"Lab technician"}',
  built_on => '00000000-0000-0000-0000-00000000c005');

-- its two screens, in place of the bench: Collect (whose sample is next: tubes, the sample number, collected) and Results (by section)
select core.declare_screen('lis.collect', 'lis', 'bench', '{"en":"Collect"}', 'read:bench', array['base.bench']);
select core.declare_screen('lis.results', 'lis', 'bench', '{"en":"Results"}', 'read:bench');

-- its starter setup (§5.2): the Laboratory, its two screens, and the tests most asked for in Egypt (mg/dL as Egyptian labs report). The
-- ranges are adults' by sex, with a child's where it differs; the critical limits are a common starting list (spec §5.3): the
-- laboratory's director confirms or changes each in Settings
select core.declare_setup('lis.laboratory', 'lis', 'bench', '{"en":"Laboratory"}', packs => array['lis'],
  screens => '{"screens":["lis.collect","lis.results"],"opens":"lis.collect"}',
  settings => '{"department.works_for":{"all":true}}',
  help => '{"en":"Collects samples (tubes by colour, a sample number) and reports results by section, with ranges, the change check and critical values."}',
  services => $j$[
  {"code":"cbc","name":"Complete blood count","section":"Haematology","coding":{"system":"loinc","code":"58410-2"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"hb","name":"Haemoglobin","coding":{"system":"loinc","code":"718-7"},"kind":"number","unit":"g/dL","ucum":"g/dL","low":12,"high":16,"critical_low":7,"critical_high":20,
     "ranges":[{"age_high":12,"low":11,"high":14.5},{"gender":"female","low":12,"high":15.5},{"gender":"male","low":13.5,"high":17.5}]},
    {"key":"wbc","name":"WBC","coding":{"system":"loinc","code":"6690-2"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":4,"high":11,"critical_low":2,"critical_high":30,
     "ranges":[{"age_high":12,"low":5,"high":14.5}]},
    {"key":"plt","name":"Platelets","coding":{"system":"loinc","code":"777-3"},"kind":"number","unit":"10^9/L","ucum":"10*3/uL","low":150,"high":400,"critical_low":20,"critical_high":1000},
    {"key":"rbc","name":"RBC","coding":{"system":"loinc","code":"789-8"},"kind":"number","unit":"10^12/L","ucum":"10*6/uL","low":4.2,"high":6.1,
     "ranges":[{"gender":"female","low":4.2,"high":5.4},{"gender":"male","low":4.7,"high":6.1}]},
    {"key":"hct","name":"Haematocrit","coding":{"system":"loinc","code":"4544-3"},"kind":"number","unit":"%","ucum":"%","low":36,"high":53,
     "ranges":[{"gender":"female","low":36,"high":46},{"gender":"male","low":41,"high":53}]},
    {"key":"mcv","name":"MCV","coding":{"system":"loinc","code":"787-2"},"kind":"number","unit":"fL","ucum":"fL","low":80,"high":100}]},
  {"code":"esr","name":"ESR","section":"Haematology","coding":{"system":"loinc","code":"4537-7"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"esr","name":"ESR","coding":{"system":"loinc","code":"4537-7"},"kind":"number","unit":"mm/h","ucum":"mm/h","high":20,"ranges":[{"gender":"male","high":15}]}]},
  {"code":"pt","name":"Prothrombin time · INR","section":"Coagulation","coding":{"system":"loinc","code":"34714-6"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"pt","name":"PT","coding":{"system":"loinc","code":"5902-2"},"kind":"number","unit":"s","ucum":"s","low":11,"high":13.5},
    {"key":"inr","name":"INR","coding":{"system":"loinc","code":"6301-6"},"kind":"number","low":0.8,"high":1.2,"critical_high":5}]},
  {"code":"aptt","name":"APTT","section":"Coagulation","coding":{"system":"loinc","code":"3173-2"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"aptt","name":"APTT","coding":{"system":"loinc","code":"3173-2"},"kind":"number","unit":"s","ucum":"s","low":25,"high":35,"critical_high":100}]},
  {"code":"fbs","name":"Fasting glucose","section":"Chemistry","coding":{"system":"loinc","code":"1558-6"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"fbs","name":"Fasting glucose","coding":{"system":"loinc","code":"1558-6"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":70,"high":100,"critical_low":40,"critical_high":450}]},
  {"code":"rbs","name":"Random glucose","section":"Chemistry","coding":{"system":"loinc","code":"2345-7"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"rbs","name":"Random glucose","coding":{"system":"loinc","code":"2345-7"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":70,"high":140,"critical_low":40,"critical_high":450}]},
  {"code":"hba1c","name":"HbA1c","section":"Chemistry","coding":{"system":"loinc","code":"4548-4"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"hba1c","name":"HbA1c","coding":{"system":"loinc","code":"4548-4"},"kind":"number","unit":"%","ucum":"%","low":4,"high":5.6}]},
  {"code":"kft","name":"Kidney function","section":"Chemistry","coding":{"system":"loinc","code":"24362-6"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"urea","name":"Urea","coding":{"system":"loinc","code":"22664-7"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":15,"high":45},
    {"key":"creat","name":"Creatinine","coding":{"system":"loinc","code":"2160-0"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":0.6,"high":1.3,
     "ranges":[{"age_high":12,"low":0.3,"high":0.7},{"gender":"female","low":0.5,"high":1.1},{"gender":"male","low":0.7,"high":1.3}]},
    {"key":"egfr","name":"eGFR (worked out)","coding":{"system":"loinc","code":"98979-8"},"kind":"number","unit":"mL/min/1.73m2","ucum":"mL/min/{1.73_m2}","low":90}]},
  {"code":"creat","name":"Creatinine","section":"Chemistry","coding":{"system":"loinc","code":"2160-0"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"creat","name":"Creatinine","coding":{"system":"loinc","code":"2160-0"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":0.6,"high":1.3,
     "ranges":[{"age_high":12,"low":0.3,"high":0.7},{"gender":"female","low":0.5,"high":1.1},{"gender":"male","low":0.7,"high":1.3}]},
    {"key":"egfr","name":"eGFR (worked out)","coding":{"system":"loinc","code":"98979-8"},"kind":"number","unit":"mL/min/1.73m2","ucum":"mL/min/{1.73_m2}","low":90}]},
  {"code":"uric","name":"Uric acid","section":"Chemistry","coding":{"system":"loinc","code":"3084-1"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"uric","name":"Uric acid","coding":{"system":"loinc","code":"3084-1"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":2.4,"high":7,
     "ranges":[{"gender":"female","low":2.4,"high":6},{"gender":"male","low":3.4,"high":7}]}]},
  {"code":"lft","name":"Liver function","section":"Chemistry","coding":{"system":"loinc","code":"24325-3"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"alt","name":"ALT","coding":{"system":"loinc","code":"1742-6"},"kind":"number","unit":"U/L","ucum":"U/L","high":40},
    {"key":"ast","name":"AST","coding":{"system":"loinc","code":"1920-8"},"kind":"number","unit":"U/L","ucum":"U/L","high":40},
    {"key":"alp","name":"ALP","coding":{"system":"loinc","code":"6768-6"},"kind":"number","unit":"U/L","ucum":"U/L","low":44,"high":147},
    {"key":"tbil","name":"Total bilirubin","coding":{"system":"loinc","code":"1975-2"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":0.3,"high":1.2,
     "ranges":[{"age_high":0.08,"high":12,"critical_high":15}]},
    {"key":"dbil","name":"Direct bilirubin","coding":{"system":"loinc","code":"1968-7"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":0.3},
    {"key":"alb","name":"Albumin","coding":{"system":"loinc","code":"1751-7"},"kind":"number","unit":"g/dL","ucum":"g/dL","low":3.5,"high":5.2},
    {"key":"tp","name":"Total protein","coding":{"system":"loinc","code":"2885-2"},"kind":"number","unit":"g/dL","ucum":"g/dL","low":6.4,"high":8.3}]},
  {"code":"lipids","name":"Lipid profile","section":"Chemistry","coding":{"system":"loinc","code":"57698-3"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"chol","name":"Cholesterol","coding":{"system":"loinc","code":"2093-3"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":200},
    {"key":"tg","name":"Triglycerides","coding":{"system":"loinc","code":"2571-8"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":150},
    {"key":"hdl","name":"HDL","coding":{"system":"loinc","code":"2085-9"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":40,"ranges":[{"gender":"female","low":50}]},
    {"key":"ldl","name":"LDL (worked out)","coding":{"system":"loinc","code":"13457-7"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","high":130}]},
  {"code":"lytes","name":"Electrolytes","section":"Chemistry","coding":{"system":"loinc","code":"24326-1"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"na","name":"Sodium","coding":{"system":"loinc","code":"2951-2"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":135,"high":145,"critical_low":120,"critical_high":160},
    {"key":"k","name":"Potassium","coding":{"system":"loinc","code":"2823-3"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":3.5,"high":5.1,"critical_low":2.8,"critical_high":6.2},
    {"key":"cl","name":"Chloride","coding":{"system":"loinc","code":"2075-0"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":98,"high":107}]},
  {"code":"ca","name":"Calcium","section":"Chemistry","coding":{"system":"loinc","code":"17861-6"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"ca","name":"Calcium","coding":{"system":"loinc","code":"17861-6"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":8.6,"high":10.3,"critical_low":6.5,"critical_high":13}]},
  {"code":"mg","name":"Magnesium","section":"Chemistry","coding":{"system":"loinc","code":"19123-9"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"mg","name":"Magnesium","coding":{"system":"loinc","code":"19123-9"},"kind":"number","unit":"mg/dL","ucum":"mg/dL","low":1.7,"high":2.4,"critical_low":1,"critical_high":4.7}]},
  {"code":"crp","name":"CRP","section":"Chemistry","coding":{"system":"loinc","code":"1988-5"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"crp","name":"CRP","coding":{"system":"loinc","code":"1988-5"},"kind":"number","unit":"mg/L","ucum":"mg/L","high":5}]},
  {"code":"ferritin","name":"Ferritin","section":"Chemistry","coding":{"system":"loinc","code":"2276-4"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"ferritin","name":"Ferritin","coding":{"system":"loinc","code":"2276-4"},"kind":"number","unit":"ng/mL","ucum":"ng/mL","low":15,"high":400,
     "ranges":[{"gender":"female","low":15,"high":150},{"gender":"male","low":30,"high":400}]}]},
  {"code":"troponin","name":"Troponin I","section":"Chemistry","coding":{"system":"loinc","code":"10839-9"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"tni","name":"Troponin I","coding":{"system":"loinc","code":"10839-9"},"kind":"number","unit":"ng/mL","ucum":"ng/mL","high":0.04,"critical_high":0.04}]},
  {"code":"tsh","name":"TSH","section":"Hormones","coding":{"system":"loinc","code":"3016-3"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"tsh","name":"TSH","coding":{"system":"loinc","code":"3016-3"},"kind":"number","unit":"mIU/L","ucum":"m[IU]/L","low":0.4,"high":4}]},
  {"code":"ft4","name":"Free T4","section":"Hormones","coding":{"system":"loinc","code":"3024-7"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"ft4","name":"Free T4","coding":{"system":"loinc","code":"3024-7"},"kind":"number","unit":"ng/dL","ucum":"ng/dL","low":0.8,"high":1.8}]},
  {"code":"vitd","name":"Vitamin D","section":"Hormones","coding":{"system":"loinc","code":"1989-3"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"vitd","name":"25-OH vitamin D","coding":{"system":"loinc","code":"1989-3"},"kind":"number","unit":"ng/mL","ucum":"ng/mL","low":30,"high":100}]},
  {"code":"psa","name":"PSA","section":"Hormones","coding":{"system":"loinc","code":"2857-1"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"psa","name":"PSA","coding":{"system":"loinc","code":"2857-1"},"kind":"number","unit":"ng/mL","ucum":"ng/mL","high":4}]},
  {"code":"bhcg","name":"Pregnancy test","section":"Hormones","coding":{"system":"loinc","code":"21198-7"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"bhcg","name":"β-hCG","coding":{"system":"loinc","code":"21198-7"},"kind":"choice","choices":["Negative","Positive"]}]},
  {"code":"hbsag","name":"HBsAg","section":"Serology","coding":{"system":"loinc","code":"5196-1"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"hbsag","name":"HBsAg","coding":{"system":"loinc","code":"5196-1"},"kind":"choice","choices":["Non-reactive","Reactive"]}]},
  {"code":"hcv","name":"HCV antibody","section":"Serology","coding":{"system":"loinc","code":"16128-1"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"hcv","name":"HCV antibody","coding":{"system":"loinc","code":"16128-1"},"kind":"choice","choices":["Non-reactive","Reactive"]}]},
  {"code":"bloodgroup","name":"Blood group","section":"Serology","coding":{"system":"loinc","code":"882-1"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"abo","name":"ABO and Rh","coding":{"system":"loinc","code":"882-1"},"kind":"choice","choices":["A+","A−","B+","B−","AB+","AB−","O+","O−"]}]},
  {"code":"urine","name":"Urine analysis","section":"Urine & stool","coding":{"system":"loinc","code":"24356-8"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"sg","name":"Specific gravity","coding":{"system":"loinc","code":"2965-2"},"kind":"number","low":1.005,"high":1.03},
    {"key":"ph","name":"pH","coding":{"system":"loinc","code":"2756-5"},"kind":"number","low":5,"high":8},
    {"key":"protein","name":"Protein","kind":"choice","choices":["Nil","Trace","+","++","+++"]},
    {"key":"glucose","name":"Glucose","kind":"choice","choices":["Nil","Trace","+","++","+++"]},
    {"key":"pus","name":"Pus cells","kind":"text","unit":"/HPF"},
    {"key":"rbcs","name":"RBCs","kind":"text","unit":"/HPF"},
    {"key":"crystals","name":"Crystals","kind":"text"}]},
  {"code":"stool","name":"Stool analysis","section":"Urine & stool","answer":"result","steps":["collected","received"],"fields":[
    {"key":"consistency","name":"Consistency","kind":"choice","choices":["Formed","Soft","Loose","Watery"]},
    {"key":"ova","name":"Ova and parasites","kind":"text"},
    {"key":"pus","name":"Pus cells","kind":"text","unit":"/HPF"},
    {"key":"occult","name":"Occult blood","kind":"choice","choices":["Negative","Positive"]}]},
  {"code":"lithium","name":"Lithium level","section":"Chemistry","coding":{"system":"loinc","code":"14334-7"},"answer":"result","steps":["collected","received"],"fields":[
    {"key":"li","name":"Lithium","coding":{"system":"loinc","code":"14334-7"},"kind":"number","unit":"mmol/L","ucum":"mmol/L","low":0.6,"high":1.2,"critical_high":1.5}]}
  ]$j$);
