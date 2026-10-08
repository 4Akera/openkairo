-- 14 · the radiology pack (spec/openCare.md §5.5; the pictures /pictures.html#rad-*). It answers the base's orders on two screens of
-- its own in place of the bench — Scan, for the radiographer, and Report, for the radiologist — with the base's own types: a step when
-- the patient is scanned (the order stays open for its report, or ends there when no report is asked), a result for the report (the
-- findings and the impression as text, a critical one marked AA so the base's loop raises it as critical). It adds: its order type,
-- which carries radiology's own words on the base's order (the side, portable, a report asked: core change (a), written with the
-- base's write:order wherever the doctor orders from); a table of those words for its screens; its exams (what each needs: a side,
-- contrast, what to tell the patient, reported always or only when asked); its roles, screens and starter setup.

set client_min_messages = warning;

select core.declare_pack('radiology', 1, '{}', '{"en":"Radiology","ar":"الأشعة"}', role_block => 'cc');
select core.create_pack('radiology');

set role pack_radiology;

-- ── the words a doctor said on a radiology order (its own type's data.radiology): the side, portable, a report asked for an X-ray ──
create table radiology.requests (
  organization_id uuid not null,
  item          uuid not null,             -- the order item
  patient_id    uuid not null,
  side          text,                      -- left · right · both
  portable      boolean not null default false,
  report        boolean not null default false,
  source_entries uuid[] not null,
  primary key (organization_id, item)
);
create function radiology.requests_refresh(p_org uuid, p_items uuid[]) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from radiology.requests where organization_id = p_org and item = any (p_items);
  insert into radiology.requests
  select p_org, l.item, core.survivor(p_org, l.patient_id), l.data -> 'radiology' ->> 'side', coalesce((l.data -> 'radiology' ->> 'portable')::boolean, false),
         coalesce((l.data -> 'radiology' ->> 'report')::boolean, false),
         (select coalesce(array_agg(e.id order by e.recorded_at), '{}') from core.pack_entries(p_org, array[l.item]) e where e.item = l.item)
    from (select distinct on (x.item) x.* from core.pack_entries(p_org, p_items) x
           where x.item = any (p_items) and x.type = 'radiology.request' order by x.item, x.item_version desc) l;
end $$;

-- the order's line: the base's words, with the side and portable after the exam ("X-ray knee · left · urgent · ? pain")
create function radiology.request_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'revoked' then 'Cancelled: ' when 'on-hold' then 'On hold: ' else '' end ||
    coalesce(e -> 'data' -> 'service' ->> 'name', 'Order') ||
    coalesce(' · ' || (e -> 'data' -> 'radiology' ->> 'side'), '') ||
    case when (e -> 'data' -> 'radiology' ->> 'portable')::boolean then ' · portable' else '' end ||
    case when (e -> 'data' -> 'radiology' ->> 'report')::boolean then ' · report' else '' end ||
    case when coalesce(e -> 'data' ->> 'priority', 'routine') <> 'routine' then ' · ' || (e -> 'data' ->> 'priority') else '' end ||
    coalesce(' · ' || nullif(e -> 'data' ->> 'question', ''), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'reason', ''), '')
$$;

reset role;

grant select, delete on radiology.requests to core_eraser;
grant execute on function radiology.requests_refresh(uuid, uuid[]) to core_eraser;

select core.declare_table('radiology.requests', 'radiology', 'radiology.requests_refresh(uuid,uuid[])', 'read:bench');
-- its order: the base's order with radiology's words beside it; the base's checks, lists, bench and FHIR apply (base_type)
select core.declare_type('radiology.request', 1, 'radiology',
  jsonb_set((select t.shape from core.types t where t.key = 'order' order by t.version desc limit 1), '{properties,radiology}',
    '{"type":"object","additionalProperties":false,"properties":{"side":{"enum":["left","right","both"]},"portable":{"type":"boolean"},"report":{"type":"boolean"}}}'),
  'radiology.request_line(jsonb)', array['ServiceRequest'], base_type => 'order', feeds => array['radiology.requests'],
  labels => '{"en":"Radiology order","ar":"طلب أشعة"}');

-- the Report tab is the radiologist's: writing a report is a result (the base's write:result), the tab is held by this action
select core.declare_action('report:radiology.studies', 'radiology', 'department', '{"en":"Report studies (the Report tab)"}');
-- its people (§5.2): the radiologist is a doctor who reports; the radiographer a plain role of its own — the list, the patient's
-- record (the facts before contrast), the scan, pregnant asked at the door, the contrast given and a reaction to it, walk-ins
select core.declare_role('00000000-0000-0000-0000-00000000cc01', 'radiology.radiologist', 'radiology', 'Radiologist', array['report:radiology.studies'], '{"en":"Radiologist"}',
  built_on => '00000000-0000-0000-0000-00000000c002');
select core.declare_role('00000000-0000-0000-0000-00000000cc02', 'radiology.radiographer', 'radiology', 'Radiographer', array[
  'read:patients', 'read:record', 'read:bench', 'read:queue', 'write:step', 'write:note', 'write:crossed_out', 'write:order', 'write:question',
  'write:pregnancy', 'write:given', 'write:allergy', 'write:checked_in', 'write:called', 'write:done', 'write:here', 'write:not_here', 'write:left'],
  '{"en":"Radiographer"}');

-- its screens, in place of the bench: Scan (one list for every room, by kind) and Report (the radiologist's)
select core.declare_screen('radiology.scan', 'radiology', 'bench', '{"en":"Scan"}', 'read:bench', array['base.bench']);
select core.declare_screen('radiology.report', 'radiology', 'bench', '{"en":"Report"}', 'report:radiology.studies');

-- its exams (§5.5): what each needs, by the service's code — a side, contrast (with or without is two exams), what to tell the patient
-- (English and Arabic), and whether it is always reported or only when the doctor asks (an X-ray nobody reports: film only)
select core.declare_setting('radiology.exams', 'radiology', 'department',
  '{"type":"object","additionalProperties":false,"required":["exams"],"properties":{"exams":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["code"],
    "properties":{"code":{"type":"string","minLength":1},"side":{"type":"boolean","default":false},"contrast":{"type":"boolean","default":false},
      "prep":{"type":"string"},"prep_ar":{"type":"string"},"report":{"enum":["always","asked"],"default":"always"}}}}}}',
  labels => '{"en":"Exams"}', form => 'department',
  fields => '[{"key":"exams","labels":{"en":"Exams"},"help":{"en":"Each exam by its service code: a side asked, with contrast, what to tell the patient, reported always or only when the doctor asks."}},
    {"key":"exams.code","labels":{"en":"Code"}},{"key":"exams.side","labels":{"en":"Asks a side"}},{"key":"exams.contrast","labels":{"en":"With contrast"}},
    {"key":"exams.prep","labels":{"en":"Tell the patient"}},{"key":"exams.prep_ar","labels":{"en":"In Arabic"}},
    {"key":"exams.report","labels":{"en":"Reported"},"choices":{"always":{"en":"Always"},"asked":{"en":"If the doctor asks"}}}]');
-- its switches: pregnant asked at the door (women 12–50, before an X-ray or a CT), on unless another place always asks
select core.declare_setting('radiology.options', 'radiology', 'department',
  '{"type":"object","additionalProperties":false,"required":["ask_pregnant"],"properties":{"ask_pregnant":{"type":"boolean","default":true}}}',
  labels => '{"en":"Radiology"}', form => 'department',
  fields => '[{"key":"ask_pregnant","labels":{"en":"Ask pregnant at the door"},"help":{"en":"Women 12–50, before an X-ray or a CT. Off only where another place always asks."}}]');

-- its starter setup (§5.2): Radiology, its two screens, the exams most asked for in Egypt by kind (the kind is the service's section),
-- each answered by a report (the findings and the impression) after one step, scanned
select core.declare_setup('radiology.department', 'radiology', 'bench', '{"en":"Radiology"}', packs => array['radiology'],
  screens => '{"screens":["radiology.scan","radiology.report"],"opens":"radiology.scan"}',
  help => '{"en":"X-ray, ultrasound, CT and MRI: one list to scan by kind, then the report; what to tell the patient for each exam."}',
  -- its report templates are its presets: the line starting "Impression:" the impression, the rest the findings
  presets => $j$[
    {"name":"Normal chest X-ray","shortcut":"cxrnormal","lines":["Findings: The lungs are clear. No consolidation, effusion or pneumothorax.","Heart size is normal. Mediastinum and hila are normal.","Bones and soft tissues are unremarkable.","Impression: Normal chest X-ray."]},
    {"name":"Normal US abdomen","shortcut":"usabdnormal","lines":["Findings: Liver normal in size and echotexture, no focal lesion.","Gallbladder well distended; no stones; normal wall. CBD not dilated.","Pancreas and spleen unremarkable.","Both kidneys normal in size and echogenicity; no stones or hydronephrosis.","No free fluid.","Impression: Normal abdominal ultrasound."]},
    {"name":"Normal US pelvis","shortcut":"uspelvisnormal","lines":["Findings: Urinary bladder well distended with a normal wall.","Uterus normal in size and echotexture; endometrium regular.","Both ovaries normal. No adnexal mass. No free fluid.","Impression: Normal pelvic ultrasound."]},
    {"name":"Normal CT brain","shortcut":"ctbrainnormal","lines":["Findings: No intracranial haemorrhage, mass or midline shift.","Grey–white matter differentiation preserved.","Ventricles and sulci normal for age.","No skull fracture.","Impression: Normal CT brain."]},
    {"name":"Normal CT abdomen","shortcut":"ctabdnormal","lines":["Findings: Liver, gallbladder, pancreas, spleen and adrenals unremarkable.","Both kidneys normal; no stones or hydronephrosis.","Appendix normal. Bowel unremarkable. No free fluid or collection.","No enlarged lymph nodes. Lung bases clear.","Impression: Normal CT abdomen and pelvis."]},
    {"name":"CT renal colic","shortcut":"renalcolic","lines":["Findings: Right kidney: moderate hydronephrosis down to a … mm stone in the … ureter.","Left kidney normal; no stone.","Appendix normal. No free fluid.","Impression: Right … ureteric stone, … mm, with moderate hydronephrosis."]},
    {"name":"Normal MRI lumbar spine","shortcut":"mrlsnormal","lines":["Findings: Normal lumbar lordosis and alignment.","Vertebral bodies normal in height and marrow signal.","Discs normal in height and signal; no protrusion.","Spinal canal and exit foramina patent. Conus normal.","Impression: Normal MRI lumbar spine."]}
  ]$j$::jsonb,
  settings => (jsonb_build_object('department.works_for', '{"all":true}'::jsonb, 'radiology.options', '{"ask_pregnant":true}'::jsonb, 'radiology.exams', jsonb_build_object('exams', $j$[
    {"code":"xrchest","report":"asked"},{"code":"xrabd","report":"asked","prep":"Standing film","prep_ar":"أشعة واقف"},{"code":"xrsinus","report":"asked"},
    {"code":"xrcspine"},{"code":"xrlspine"},{"code":"xrpelvis"},
    {"code":"xrshoulder","side":true},{"code":"xrelbow","side":true},{"code":"xrwrist","side":true},{"code":"xrhand","side":true},
    {"code":"xrhip","side":true},{"code":"xrknee","side":true},{"code":"xrankle","side":true},{"code":"xrfoot","side":true},
    {"code":"usabd","prep":"Fasting 6 hours","prep_ar":"صائم ٦ ساعات"},
    {"code":"uspelvis","prep":"A full bladder: drink a litre of water an hour before","prep_ar":"اشرب لتر ماء قبلها بساعة، والمثانة ممتلئة"},
    {"code":"usap","prep":"Fasting 6 hours, and a full bladder","prep_ar":"صائم ٦ ساعات، والمثانة ممتلئة"},
    {"code":"usthyroid"},{"code":"usbreast","side":true},{"code":"usscrotum"},{"code":"usob"},{"code":"usdvt","side":true},
    {"code":"ctbrain"},{"code":"ctbrainc","contrast":true,"prep":"Fasting 4 hours; bring your creatinine result","prep_ar":"صائم ٤ ساعات، وأحضر تحليل الكرياتينين"},
    {"code":"ctchest"},{"code":"ctchestc","contrast":true,"prep":"Fasting 4 hours; bring your creatinine result","prep_ar":"صائم ٤ ساعات، وأحضر تحليل الكرياتينين"},
    {"code":"ctap"},{"code":"ctapc","contrast":true,"prep":"Fasting 4 hours; bring your creatinine result","prep_ar":"صائم ٤ ساعات، وأحضر تحليل الكرياتينين"},
    {"code":"ctkub"},{"code":"ctsinus"},{"code":"ctlspine"},
    {"code":"mrbrain","prep":"No metal; tell us of any implant or pacemaker","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع"},
    {"code":"mrbrainc","contrast":true,"prep":"No metal; tell us of any implant; bring your creatinine result","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع، وأحضر تحليل الكرياتينين"},
    {"code":"mrcspine","prep":"No metal; tell us of any implant or pacemaker","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع"},
    {"code":"mrlspine","prep":"No metal; tell us of any implant or pacemaker","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع"},
    {"code":"mrknee","side":true,"prep":"No metal; tell us of any implant or pacemaker","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع"},
    {"code":"mrshoulder","side":true,"prep":"No metal; tell us of any implant or pacemaker","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع"},
    {"code":"mrpelvis","prep":"No metal; tell us of any implant or pacemaker","prep_ar":"بدون معادن، وأخبرنا بأي جهاز مزروع"}
  ]$j$::jsonb))),
  services => (select jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'section', x.kind, 'answer', 'result', 'steps', '["scanned"]'::jsonb,
      'fields', '[{"key":"findings","name":"Findings","coding":{"system":"loinc","code":"18782-3"},"kind":"text"},
                  {"key":"impression","name":"Impression","coding":{"system":"loinc","code":"19005-8"},"kind":"text"}]'::jsonb) order by x.n)
    from (values
      (1, 'xrchest', 'X-ray chest', 'X-ray'), (2, 'xrabd', 'X-ray abdomen', 'X-ray'), (3, 'xrsinus', 'X-ray sinuses', 'X-ray'),
      (4, 'xrcspine', 'X-ray cervical spine', 'X-ray'), (5, 'xrlspine', 'X-ray lumbar spine', 'X-ray'), (6, 'xrpelvis', 'X-ray pelvis', 'X-ray'),
      (7, 'xrshoulder', 'X-ray shoulder', 'X-ray'), (8, 'xrelbow', 'X-ray elbow', 'X-ray'), (9, 'xrwrist', 'X-ray wrist', 'X-ray'),
      (10, 'xrhand', 'X-ray hand', 'X-ray'), (11, 'xrhip', 'X-ray hip', 'X-ray'), (12, 'xrknee', 'X-ray knee', 'X-ray'),
      (13, 'xrankle', 'X-ray ankle', 'X-ray'), (14, 'xrfoot', 'X-ray foot', 'X-ray'),
      (20, 'usabd', 'US abdomen', 'Ultrasound'), (21, 'uspelvis', 'US pelvis', 'Ultrasound'), (22, 'usap', 'US abdomen & pelvis', 'Ultrasound'),
      (23, 'usthyroid', 'US thyroid & neck', 'Ultrasound'), (24, 'usbreast', 'US breast', 'Ultrasound'), (25, 'usscrotum', 'US scrotum', 'Ultrasound'),
      (26, 'usob', 'US obstetric', 'Ultrasound'), (27, 'usdvt', 'Doppler leg veins', 'Ultrasound'),
      (30, 'ctbrain', 'CT brain', 'CT'), (31, 'ctbrainc', 'CT brain with contrast', 'CT'), (32, 'ctchest', 'CT chest', 'CT'),
      (33, 'ctchestc', 'CT chest with contrast', 'CT'), (34, 'ctap', 'CT abdomen & pelvis', 'CT'), (35, 'ctapc', 'CT abdomen & pelvis with contrast', 'CT'),
      (36, 'ctkub', 'CT KUB (stones)', 'CT'), (37, 'ctsinus', 'CT sinuses', 'CT'), (38, 'ctlspine', 'CT lumbar spine', 'CT'),
      (40, 'mrbrain', 'MRI brain', 'MRI'), (41, 'mrbrainc', 'MRI brain with contrast', 'MRI'), (42, 'mrcspine', 'MRI cervical spine', 'MRI'),
      (43, 'mrlspine', 'MRI lumbar spine', 'MRI'), (44, 'mrknee', 'MRI knee', 'MRI'), (45, 'mrshoulder', 'MRI shoulder', 'MRI'), (46, 'mrpelvis', 'MRI pelvis', 'MRI')
    ) x(n, code, name, kind)));

