-- 06 · base: the layer, its schema and role, the code systems and the committed code rows (spec/openCare.md §4, §6).
-- Licensed files (WHO ICD-10, ATC, the EDA list) are not here: scripts/import-codes.sh loads them per installation, and the demo
-- seed loads only the subset the composer's catalog names (supabase/seeds/codes.sql).

set client_min_messages = warning;

select core.declare_layer('base', 'base_role', 'base', '{"en":"Base"}');
create schema base authorization base_role;
comment on schema base is 'openCare base: every entry type, presence, privacy, checks, derived tables, the review loop, settings keys, FHIR mappings.';
revoke all on schema base from public;
grant usage on schema base to core_eraser;
alter default privileges for role base_role in schema base revoke execute on functions from public;

-- ── code systems (§6.1). closed: an unknown or retired code lands flagged ──
select core.declare_system('icd10', 'base', 'code', 'http://hl7.org/fhir/sid/icd-10', '2019', true, null, 'WHO ICD-10: loaded per installation (scripts/import-codes.sh)', '{"en":"ICD-10 (WHO)"}');
select core.declare_system('loinc', 'base', 'code', 'http://loinc.org', '2.78', true, null, 'LOINC: a committed subset; © Regenstrief Institute, free under the LOINC licence', '{"en":"LOINC"}');
select core.declare_system('ucum', 'base', 'code', 'http://unitsofmeasure.org', '2.1', true, null, 'UCUM: committed common units', '{"en":"UCUM"}');
select core.declare_system('atc', 'base', 'code', 'http://www.whocc.no/atc', '2025', true, null, 'WHO ATC: loaded per installation', '{"en":"ATC"}');
select core.declare_system('eda', 'base', 'code', '{canon}/sid/eg-eda-drug', null, false, null, 'The Egyptian Drug Authority list: loaded per installation', '{"en":"EDA drug"}');
select core.declare_system('hl7.condition-clinical', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/condition-clinical', null, true, null, 'HL7, free', '{"en":"Condition clinical status"}');
select core.declare_system('hl7.condition-ver-status', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/condition-ver-status', null, true, null, 'HL7, free', '{"en":"Condition verification"}');
select core.declare_system('hl7.condition-category', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/condition-category', null, true, null, 'HL7, free', '{"en":"Condition category"}');
select core.declare_system('hl7.allergy-clinical', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', null, true, null, 'HL7, free', '{"en":"Allergy clinical status"}');
select core.declare_system('hl7.allergy-verification', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', null, true, null, 'HL7, free', '{"en":"Allergy verification"}');
select core.declare_system('hl7.observation-category', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/observation-category', null, true, null, 'HL7, free', '{"en":"Observation category"}');
select core.declare_system('hl7.interpretation', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', null, true, null, 'HL7, free', '{"en":"Interpretation"}');
select core.declare_system('hl7.route', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration', null, true, null, 'HL7, free', '{"en":"Route"}');
select core.declare_system('hl7.gts', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation', null, true, null, 'HL7, free', '{"en":"Timing abbreviation"}');
select core.declare_system('hl7.act-code', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v3-ActCode', null, true, null, 'HL7, free', '{"en":"Encounter class"}');
select core.declare_system('hl7.confidentiality', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality', null, true, null, 'HL7, free', '{"en":"Confidentiality"}');
select core.declare_system('hl7.purpose', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v3-ActReason', null, true, null, 'HL7, free', '{"en":"Purpose of use"}');
select core.declare_system('hl7.v2-0203', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/v2-0203', null, true, null, 'HL7, free', '{"en":"Identifier type"}');
select core.declare_system('hl7.admit-source', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/admit-source', null, true, null, 'HL7, free', '{"en":"Admit source"}');
select core.declare_system('hl7.discharge-disposition', 'base', 'code', 'http://terminology.hl7.org/CodeSystem/discharge-disposition', null, true, null, 'HL7, free', '{"en":"Discharge disposition"}');
select core.declare_system('hl7.absent-unknown', 'base', 'code', 'http://hl7.org/fhir/uv/ips/CodeSystem/absent-unknown-uv-ips', null, true, null, 'HL7 IPS, free', '{"en":"Absent or unknown"}');
select core.declare_system('local.allergen', 'base', 'code', '{canon}/CodeSystem/allergen', null, true, null, 'openCare', '{"en":"Allergen"}');
select core.declare_system('local.allergy-class', 'base', 'code', '{canon}/CodeSystem/allergy-class', null, true, null, 'openCare', '{"en":"Allergy class"}');
select core.declare_system('local.reaction', 'base', 'code', '{canon}/CodeSystem/reaction', null, true, null, 'openCare', '{"en":"Reaction"}');
select core.declare_system('local.alert', 'base', 'code', '{canon}/CodeSystem/alert', null, true, null, 'openCare', '{"en":"Alert"}');
select core.declare_system('local.procedure', 'base', 'code', '{canon}/CodeSystem/procedure', null, false, null, 'openCare', '{"en":"Procedure"}');
select core.declare_system('local.service', 'base', 'code', '{canon}/CodeSystem/local/{organization}/service', null, false, null, 'a clinic''s own service codes (settings)', '{"en":"Service"}');

-- identifier systems (§6.3): a check function warns and never refuses
create function base.eg_national_id_check(p_value text, p_patient jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v text := regexp_replace(coalesce(p_value, ''), '\s', '', 'g'); c int; y int; d date; g text; out jsonb := '[]'; gov text; birth date;
begin
  if v !~ '^[0-9]{14}$' then return jsonb_build_array(jsonb_build_object('code', 'national_id_digits', 'level', 'warn')); end if;
  c := substr(v, 1, 1)::int;
  if c not in (2, 3) then out := out || jsonb_build_object('code', 'national_id_century', 'level', 'warn'); end if;
  y := case c when 2 then 1900 when 3 then 2000 else 1900 end + substr(v, 2, 2)::int;
  begin d := make_date(y, substr(v, 4, 2)::int, substr(v, 6, 2)::int); exception when others then d := null; end;
  if d is null then out := out || jsonb_build_object('code', 'national_id_date', 'level', 'warn'); end if;
  gov := substr(v, 8, 2);
  g := case when substr(v, 13, 1)::int % 2 = 1 then 'male' else 'female' end;
  if not (gov = any (array['01','02','03','04','11','12','13','14','15','16','17','18','19','21','22','23','24','25','26','27','28','29','31','32','33','34','35','88'])) then
    out := out || jsonb_build_object('code', 'national_id_governorate', 'level', 'warn');
  end if;
  birth := (p_patient ->> 'birth_date')::date;
  if d is not null and birth is not null and birth <> d then out := out || jsonb_build_object('code', 'national_id_birth_date', 'level', 'warn', 'detail', d::text); end if;
  if p_patient ->> 'gender' in ('male', 'female') and p_patient ->> 'gender' <> g then out := out || jsonb_build_object('code', 'national_id_gender', 'level', 'warn', 'detail', g); end if;
  -- what it tells, for the desk to prefill (the check digit's rule is not published: it is not checked)
  return out || jsonb_build_array(jsonb_build_object('code', 'national_id_reads', 'level', 'info', 'birth_date', d, 'gender', g, 'governorate',
    case gov when '01' then 'EG-C' when '02' then 'EG-ALX' when '03' then 'EG-PTS' when '04' then 'EG-SUZ' when '11' then 'EG-DT' when '12' then 'EG-DK'
      when '13' then 'EG-SHR' when '14' then 'EG-KB' when '15' then 'EG-KFS' when '16' then 'EG-GH' when '17' then 'EG-MNF' when '18' then 'EG-BH'
      when '19' then 'EG-IS' when '21' then 'EG-GZ' when '22' then 'EG-BNS' when '23' then 'EG-FYM' when '24' then 'EG-MN' when '25' then 'EG-AST'
      when '26' then 'EG-SHG' when '27' then 'EG-KN' when '28' then 'EG-ASN' when '29' then 'EG-LX' when '31' then 'EG-BA' when '32' then 'EG-WAD'
      when '33' then 'EG-MT' when '34' then 'EG-SIN' when '35' then 'EG-JS' else null end));
end $$;
alter function base.eg_national_id_check(text, jsonb) owner to base_role;
select core.declare_system('eg-national-id', 'base', 'identifier', '{canon}/sid/eg-national-id', null, false, 'base.eg_national_id_check(text,jsonb)', 'openCare', '{"en":"National ID"}');
select core.declare_system('passport-egy', 'base', 'identifier', 'http://hl7.org/fhir/sid/passport-EGY', null, false, null, null, '{"en":"Passport (Egypt)"}');
select core.declare_system('passport-sdn', 'base', 'identifier', 'http://hl7.org/fhir/sid/passport-SDN', null, false, null, null, '{"en":"Passport (Sudan)"}');
select core.declare_system('passport-syr', 'base', 'identifier', 'http://hl7.org/fhir/sid/passport-SYR', null, false, null, null, '{"en":"Passport (Syria)"}');
select core.declare_system('passport-other', 'base', 'identifier', '{canon}/sid/passport-other', null, false, null, null, '{"en":"Passport (other)"}');
select core.declare_system('mrn', 'base', 'identifier', '{canon}/sid/mrn/{organization}', null, false, null, null, '{"en":"Record number"}');
select core.declare_system('eg-payer-uhia', 'base', 'identifier', '{canon}/sid/eg-payer/uhia', null, false, null, null, '{"en":"UHIA member"}');
select core.declare_system('eg-payer-hio', 'base', 'identifier', '{canon}/sid/eg-payer/hio', null, false, null, null, '{"en":"HIO member"}');
select core.declare_system('unhcr', 'base', 'identifier', '{canon}/sid/unhcr', null, false, null, null, '{"en":"UNHCR registration"}');
select core.declare_system('eg-syndicate-medical', 'base', 'identifier', '{canon}/sid/eg-syndicate/medical', null, false, null, null, '{"en":"Medical syndicate number"}');

-- ── committed rows ──
-- UCUM: common units (the value keeps the unit as written beside its UCUM code)
insert into core.codes (system, code, labels) select 'ucum', c, jsonb_build_object('en', l) from (values
  ('mm[Hg]', 'mmHg'), ('/min', 'per minute'), ('Cel', '°C'), ('[degF]', '°F'), ('%', '%'), ('kg', 'kg'), ('g', 'g'), ('mg', 'mg'), ('ug', 'microgram'),
  ('ng', 'nanogram'), ('cm', 'cm'), ('m', 'm'), ('mm', 'mm'), ('kg/m2', 'kg/m²'), ('{score}', 'score'), ('mg/dL', 'mg/dL'), ('g/dL', 'g/dL'), ('g/L', 'g/L'),
  ('mg/L', 'mg/L'), ('mmol/L', 'mmol/L'), ('umol/L', 'µmol/L'), ('mEq/L', 'mEq/L'), ('10*3/uL', '×10³/µL'), ('10*6/uL', '×10⁶/µL'), ('10*9/L', '×10⁹/L'),
  ('10*12/L', '×10¹²/L'), ('U/L', 'U/L'), ('[IU]/L', 'IU/L'), ('m[IU]/L', 'mIU/L'), ('u[IU]/mL', 'µIU/mL'), ('ng/mL', 'ng/mL'), ('pg/mL', 'pg/mL'),
  ('ug/dL', 'µg/dL'), ('ug/L', 'µg/L'), ('ng/dL', 'ng/dL'), ('fL', 'fL'), ('pg', 'pg'), ('mm/h', 'mm/h'), ('s', 'second'), ('min', 'minute'), ('h', 'hour'),
  ('d', 'day'), ('wk', 'week'), ('mo', 'month'), ('a', 'year'), ('mL', 'mL'), ('L', 'L'), ('mL/min', 'mL/min'), ('mL/min/{1.73_m2}', 'mL/min/1.73m²'),
  ('1', 'unit'), ('{ratio}', 'ratio'), ('{tbl}', 'tablet'), ('{cap}', 'capsule'), ('[drp]', 'drop'), ('[iU]', 'IU'), ('U', 'unit'), ('{puff}', 'puff'),
  ('{sachet}', 'sachet'), ('{ampule}', 'ampoule'), ('{patch}', 'patch'), ('{supp}', 'suppository'), ('{spray}', 'spray'), ('{application}', 'application'),
  ('mg/kg', 'mg/kg'), ('mg/d', 'mg/day'), ('/d', 'per day'), ('[in_i]', 'inch'), ('[lb_av]', 'pound'), ('/uL', 'per µL'), ('/[HPF]', 'per high-power field'),
  ('{titer}', 'titre'), ('{index}', 'index'), ('{copies}/mL', 'copies/mL'), ('meq/L', 'mEq/L'), ('mosm/kg', 'mOsm/kg'), ('g/d', 'g/day'), ('umol/mol', 'µmol/mol'),
  ('mmol/mol', 'mmol/mol'), ('10*3/mL', '×10³/mL')
) v(c, l);

-- LOINC: vitals, the demo laboratory, observations, note kinds and the IPS sections; props.ucum is the canonical unit
insert into core.codes (system, code, labels, props) select 'loinc', c, jsonb_build_object('en', l), p::jsonb from (values
  ('85353-1', 'Vital signs panel', '{}'), ('85354-9', 'Blood pressure panel', '{}'), ('8480-6', 'Systolic blood pressure', '{"ucum":"mm[Hg]","key":"bp.sys"}'),
  ('8462-4', 'Diastolic blood pressure', '{"ucum":"mm[Hg]","key":"bp.dia"}'), ('8867-4', 'Heart rate', '{"ucum":"/min","key":"hr"}'),
  ('9279-1', 'Respiratory rate', '{"ucum":"/min","key":"rr"}'), ('8310-5', 'Body temperature', '{"ucum":"Cel","key":"temp"}'),
  ('2708-6', 'Oxygen saturation in arterial blood', '{"ucum":"%"}'), ('59408-5', 'Oxygen saturation by pulse oximetry', '{"ucum":"%","key":"spo2"}'),
  ('29463-7', 'Body weight', '{"ucum":"kg","key":"weight"}'), ('8302-2', 'Body height', '{"ucum":"cm","key":"height"}'), ('39156-5', 'Body mass index', '{"ucum":"kg/m2","key":"bmi"}'),
  ('9843-4', 'Head circumference', '{"ucum":"cm","key":"head"}'), ('72514-3', 'Pain severity (0-10)', '{"ucum":"{score}","key":"pain"}'),
  ('41653-7', 'Glucose, capillary (glucometer)', '{"ucum":"mg/dL","key":"glucose","allowed":["mg/dL","mmol/L"]}'),
  ('2339-0', 'Glucose, blood', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'), ('2345-7', 'Glucose, serum or plasma', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'),
  ('1558-6', 'Fasting glucose', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'),
  ('58410-2', 'CBC panel', '{}'), ('718-7', 'Haemoglobin', '{"ucum":"g/dL","allowed":["g/dL","g/L"]}'), ('6690-2', 'White cell count', '{"ucum":"10*3/uL","allowed":["10*3/uL","10*9/L"]}'),
  ('777-3', 'Platelets', '{"ucum":"10*3/uL","allowed":["10*3/uL","10*9/L"]}'), ('789-8', 'Red cell count', '{"ucum":"10*6/uL"}'), ('4544-3', 'Haematocrit', '{"ucum":"%"}'),
  ('787-2', 'MCV', '{"ucum":"fL"}'), ('4548-4', 'HbA1c', '{"ucum":"%","allowed":["%","mmol/mol"]}'), ('2160-0', 'Creatinine', '{"ucum":"mg/dL","allowed":["mg/dL","umol/L"]}'),
  ('3094-0', 'Urea nitrogen (BUN)', '{"ucum":"mg/dL"}'), ('62238-1', 'eGFR (CKD-EPI)', '{"ucum":"mL/min/{1.73_m2}"}'),
  ('57698-3', 'Lipid panel', '{}'), ('2093-3', 'Total cholesterol', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'), ('2089-1', 'LDL cholesterol', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'),
  ('2085-9', 'HDL cholesterol', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'), ('2571-8', 'Triglycerides', '{"ucum":"mg/dL","allowed":["mg/dL","mmol/L"]}'),
  ('24323-8', 'Comprehensive metabolic panel', '{}'), ('2951-2', 'Sodium', '{"ucum":"mmol/L"}'), ('2823-3', 'Potassium', '{"ucum":"mmol/L"}'),
  ('2075-0', 'Chloride', '{"ucum":"mmol/L"}'), ('1963-8', 'Bicarbonate', '{"ucum":"mmol/L"}'), ('17861-6', 'Calcium', '{"ucum":"mg/dL"}'),
  ('1742-6', 'ALT', '{"ucum":"U/L"}'), ('1920-8', 'AST', '{"ucum":"U/L"}'), ('6768-6', 'Alkaline phosphatase', '{"ucum":"U/L"}'), ('1975-2', 'Bilirubin, total', '{"ucum":"mg/dL"}'),
  ('1751-7', 'Albumin', '{"ucum":"g/dL"}'), ('2885-2', 'Protein, total', '{"ucum":"g/dL"}'), ('3016-3', 'TSH', '{"ucum":"m[IU]/L"}'), ('3024-7', 'Free T4', '{"ucum":"ng/dL"}'),
  ('2276-4', 'Ferritin', '{"ucum":"ng/mL"}'), ('2498-4', 'Iron', '{"ucum":"ug/dL"}'), ('14334-7', 'Lithium level', '{"ucum":"mmol/L"}'),
  ('1988-5', 'C-reactive protein', '{"ucum":"mg/L"}'), ('30341-2', 'ESR', '{"ucum":"mm/h"}'), ('5902-2', 'Prothrombin time', '{"ucum":"s"}'), ('6301-6', 'INR', '{"ucum":"{ratio}"}'),
  ('3173-2', 'aPTT', '{"ucum":"s"}'), ('2106-3', 'Choriogonadotropin (pregnancy test), urine', '{}'), ('24357-6', 'Urinalysis panel', '{}'),
  ('14959-1', 'Microalbumin/creatinine ratio, urine', '{"ucum":"mg/g"}'), ('3084-1', 'Uric acid', '{"ucum":"mg/dL"}'), ('2132-9', 'Vitamin B12', '{"ucum":"pg/mL"}'),
  ('1989-3', 'Vitamin D (25-OH)', '{"ucum":"ng/mL"}'), ('36643-5', 'Chest X-ray, 2 views', '{}'), ('24627-2', 'CT chest', '{}'), ('11524-6', 'ECG study', '{}'),
  ('72166-2', 'Tobacco smoking status', '{}'), ('82810-3', 'Pregnancy status', '{}'), ('8665-2', 'Last menstrual period start date', '{}'),
  ('11506-3', 'Progress note', '{"note":"progress"}'), ('34117-2', 'History and physical note', '{"note":"history_physical"}'), ('11488-4', 'Consult note', '{"note":"consult"}'),
  ('34111-1', 'Emergency department note', '{"note":"emergency"}'), ('28570-0', 'Procedure note', '{"note":"procedure"}'), ('18842-5', 'Discharge summary', '{"note":"discharge"}'),
  ('18776-5', 'Plan of care note', '{"note":"plan"}'), ('57133-1', 'Referral note', '{"note":"referral"}'), ('34109-9', 'Note', '{"note":"other"}'),
  ('60591-5', 'Patient summary document', '{}'), ('11450-4', 'Problem list', '{}'), ('10160-0', 'History of medication use', '{}'), ('48765-2', 'Allergies and adverse reactions', '{}'),
  ('30954-2', 'Relevant diagnostic tests/laboratory data', '{}'), ('11369-6', 'History of immunization', '{}'), ('47519-4', 'History of procedures', '{}'), ('8716-3', 'Vital signs', '{}')
) v(c, l, p);
insert into core.codes (system, code, labels) values ('ucum', 'mg/g', '{"en":"mg/g"}');

-- HL7 code sets used by the mapping (free)
insert into core.codes (system, code, labels) select s, c, jsonb_build_object('en', l) from (values
  ('hl7.condition-clinical', 'active', 'Active'), ('hl7.condition-clinical', 'recurrence', 'Recurrence'), ('hl7.condition-clinical', 'relapse', 'Relapse'),
  ('hl7.condition-clinical', 'inactive', 'Inactive'), ('hl7.condition-clinical', 'remission', 'Remission'), ('hl7.condition-clinical', 'resolved', 'Resolved'),
  ('hl7.condition-ver-status', 'unconfirmed', 'Unconfirmed'), ('hl7.condition-ver-status', 'provisional', 'Provisional'), ('hl7.condition-ver-status', 'differential', 'Differential'),
  ('hl7.condition-ver-status', 'confirmed', 'Confirmed'), ('hl7.condition-ver-status', 'refuted', 'Refuted'), ('hl7.condition-ver-status', 'entered-in-error', 'Entered in error'),
  ('hl7.condition-category', 'problem-list-item', 'Problem list item'), ('hl7.condition-category', 'encounter-diagnosis', 'Encounter diagnosis'),
  ('hl7.allergy-clinical', 'active', 'Active'), ('hl7.allergy-clinical', 'inactive', 'Inactive'), ('hl7.allergy-clinical', 'resolved', 'Resolved'),
  ('hl7.allergy-verification', 'unconfirmed', 'Unconfirmed'), ('hl7.allergy-verification', 'confirmed', 'Confirmed'), ('hl7.allergy-verification', 'refuted', 'Refuted'),
  ('hl7.allergy-verification', 'entered-in-error', 'Entered in error'),
  ('hl7.observation-category', 'vital-signs', 'Vital signs'), ('hl7.observation-category', 'laboratory', 'Laboratory'), ('hl7.observation-category', 'social-history', 'Social history'),
  ('hl7.observation-category', 'exam', 'Exam'), ('hl7.observation-category', 'imaging', 'Imaging'), ('hl7.observation-category', 'survey', 'Survey'),
  ('hl7.interpretation', 'N', 'Normal'), ('hl7.interpretation', 'L', 'Low'), ('hl7.interpretation', 'H', 'High'), ('hl7.interpretation', 'LL', 'Critical low'),
  ('hl7.interpretation', 'HH', 'Critical high'), ('hl7.interpretation', 'A', 'Abnormal'), ('hl7.interpretation', 'AA', 'Critical abnormal'),
  ('hl7.interpretation', 'POS', 'Positive'), ('hl7.interpretation', 'NEG', 'Negative'),
  ('hl7.route', 'PO', 'Oral'), ('hl7.route', 'SL', 'Sublingual'), ('hl7.route', 'IV', 'Intravenous'), ('hl7.route', 'IM', 'Intramuscular'), ('hl7.route', 'SQ', 'Subcutaneous'),
  ('hl7.route', 'TOPICAL', 'Topical'), ('hl7.route', 'INHL', 'Inhalation'), ('hl7.route', 'NASAL', 'Nasal'), ('hl7.route', 'OPHTHALMIC', 'Ophthalmic'), ('hl7.route', 'OTIC', 'Otic'),
  ('hl7.route', 'RECTAL', 'Rectal'), ('hl7.route', 'VAGINAL', 'Vaginal'), ('hl7.route', 'TRNSDERM', 'Transdermal'),
  ('hl7.gts', 'QD', 'Once a day'), ('hl7.gts', 'BID', 'Twice a day'), ('hl7.gts', 'TID', 'Three times a day'), ('hl7.gts', 'QID', 'Four times a day'),
  ('hl7.gts', 'AM', 'Every morning'), ('hl7.gts', 'PM', 'Every afternoon'), ('hl7.gts', 'QOD', 'Every other day'), ('hl7.gts', 'Q4H', 'Every 4 hours'),
  ('hl7.gts', 'Q6H', 'Every 6 hours'), ('hl7.gts', 'Q8H', 'Every 8 hours'), ('hl7.gts', 'WK', 'Weekly'), ('hl7.gts', 'MO', 'Monthly'),
  ('hl7.act-code', 'AMB', 'Ambulatory'), ('hl7.act-code', 'EMER', 'Emergency'), ('hl7.act-code', 'IMP', 'Inpatient'), ('hl7.act-code', 'OBSENC', 'Observation'),
  ('hl7.act-code', 'SS', 'Short stay'), ('hl7.act-code', 'VR', 'Virtual'), ('hl7.act-code', 'HH', 'Home health'),
  ('hl7.confidentiality', 'N', 'Normal'), ('hl7.confidentiality', 'R', 'Restricted'), ('hl7.confidentiality', 'V', 'Very restricted'),
  ('hl7.purpose', 'TREAT', 'Treatment'), ('hl7.purpose', 'ETREAT', 'Emergency treatment'), ('hl7.purpose', 'PATADMIN', 'Patient administration'),
  ('hl7.purpose', 'HOPERAT', 'Healthcare operations'), ('hl7.purpose', 'HRESCH', 'Research'), ('hl7.purpose', 'PATRQT', 'Patient request'), ('hl7.purpose', 'BTG', 'Break the glass'),
  ('hl7.v2-0203', 'NI', 'National unique individual identifier'), ('hl7.v2-0203', 'PPN', 'Passport number'), ('hl7.v2-0203', 'MR', 'Medical record number'),
  ('hl7.v2-0203', 'MB', 'Member number'), ('hl7.v2-0203', 'MD', 'Medical licence number'), ('hl7.v2-0203', 'PRN', 'Provider number'),
  ('hl7.admit-source', 'emd', 'From accident/emergency department'), ('hl7.admit-source', 'outp', 'From outpatient department'), ('hl7.admit-source', 'hosp-trans', 'Transferred from other hospital'),
  ('hl7.admit-source', 'born', 'Born in hospital'), ('hl7.admit-source', 'gp', 'General practitioner referral'), ('hl7.admit-source', 'other', 'Other'),
  ('hl7.discharge-disposition', 'home', 'Home'), ('hl7.discharge-disposition', 'other-hcf', 'Other healthcare facility'), ('hl7.discharge-disposition', 'hosp', 'Hospice'),
  ('hl7.discharge-disposition', 'aadvice', 'Left against advice'), ('hl7.discharge-disposition', 'exp', 'Expired'), ('hl7.discharge-disposition', 'oth', 'Other'),
  ('hl7.absent-unknown', 'no-known-allergies', 'No known allergies'), ('hl7.absent-unknown', 'no-known-problems', 'No known problems'),
  ('hl7.absent-unknown', 'no-known-medications', 'No known medications'), ('hl7.absent-unknown', 'no-allergy-info', 'No information about allergies'),
  ('hl7.absent-unknown', 'no-problem-info', 'No information about problems'), ('hl7.absent-unknown', 'no-medication-info', 'No information about medications'),
  ('local.alert', 'dnr', 'Do not resuscitate'), ('local.alert', 'isolation', 'Isolation'), ('local.alert', 'fall_risk', 'Fall risk'), ('local.alert', 'violence_risk', 'Violence risk'),
  ('local.alert', 'difficult_airway', 'Difficult airway')
) v(s, c, l);

-- generated by scripts/gen-codes.py from the composer catalog: allergens, allergy classes (with cross rules), reactions
insert into core.codes (system, code, labels, props) values
  ('local.allergen', 'penicillins', '{"en": "Penicillins"}', '{"allergy_class": "penicillin", "kind": "drug_class", "synonyms": ["penicillin", "penicillin antibiotics", "PCN"]}'),
  ('local.allergen', 'cephalosporins', '{"en": "Cephalosporins"}', '{"allergy_class": "cephalosporin", "kind": "drug_class", "synonyms": ["cephalosporin", "cefalosporins"]}'),
  ('local.allergen', 'carbapenems', '{"en": "Carbapenems"}', '{"allergy_class": "carbapenem", "kind": "drug_class", "synonyms": ["carbapenem"]}'),
  ('local.allergen', 'sulfonamide_antibiotics', '{"en": "Sulfonamide antibiotics"}', '{"allergy_class": "sulfonamide_antibiotic", "kind": "drug_class", "synonyms": ["sulfa", "sulfa drugs", "sulpha drugs", "sulfonamides", "sulphonamides", "sulfa antibiotics"]}'),
  ('local.allergen', 'macrolides', '{"en": "Macrolides"}', '{"allergy_class": "macrolide", "kind": "drug_class", "synonyms": ["macrolide", "macrolide antibiotics"]}'),
  ('local.allergen', 'fluoroquinolones', '{"en": "Fluoroquinolones"}', '{"allergy_class": "fluoroquinolone", "kind": "drug_class", "synonyms": ["fluoroquinolone", "quinolones", "quinolone"]}'),
  ('local.allergen', 'tetracyclines', '{"en": "Tetracyclines"}', '{"allergy_class": "tetracycline", "kind": "drug_class", "synonyms": ["tetracycline antibiotics"]}'),
  ('local.allergen', 'aminoglycosides', '{"en": "Aminoglycosides"}', '{"allergy_class": "aminoglycoside", "kind": "drug_class", "synonyms": ["aminoglycoside", "aminoglycoside antibiotics"]}'),
  ('local.allergen', 'nsaids', '{"en": "NSAIDs"}', '{"allergy_class": "nsaid", "kind": "drug_class", "synonyms": ["NSAID", "non-steroidal anti-inflammatory drugs", "anti-inflammatory painkillers"]}'),
  ('local.allergen', 'opioids', '{"en": "Opioids"}', '{"allergy_class": "opioid", "kind": "drug_class", "synonyms": ["opioid", "opiates", "narcotics", "opioid analgesics"]}'),
  ('local.allergen', 'ace_inhibitors', '{"en": "ACE inhibitors"}', '{"allergy_class": "ace_inhibitor", "kind": "drug_class", "synonyms": ["ACE inhibitor", "ACEI", "ACE-I", "angiotensin-converting enzyme inhibitors"]}'),
  ('local.allergen', 'statins', '{"en": "Statins"}', '{"allergy_class": "statin", "kind": "drug_class", "synonyms": ["statin", "HMG-CoA reductase inhibitors"]}'),
  ('local.allergen', 'iodinated_contrast_media', '{"en": "Iodinated contrast media"}', '{"allergy_class": "iodinated_contrast", "kind": "drug_class", "synonyms": ["contrast dye", "IV contrast", "CT contrast", "X-ray contrast", "radiocontrast", "iodine contrast", "iohexol", "iopromide", "iodixanol", "Omnipaque", "Ultravist", "Visipaque"]}'),
  ('local.allergen', 'local_anaesthetics_amide', '{"en": "Local anaesthetics (amide)"}', '{"allergy_class": "local_anaesthetic_amide", "kind": "drug_class", "synonyms": ["local anaesthetic", "local anesthetic", "dental anaesthetic", "amide local anaesthetics", "amide local anesthetics"]}'),
  ('local.allergen', 'local_anaesthetics_ester', '{"en": "Local anaesthetics (ester)"}', '{"allergy_class": null, "kind": "drug_class", "synonyms": ["ester local anaesthetics", "ester local anesthetics", "procaine", "benzocaine", "tetracaine", "amethocaine", "chloroprocaine"]}'),
  ('local.allergen', 'aromatic_anticonvulsants', '{"en": "Aromatic anticonvulsants"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug_class", "synonyms": ["aromatic antiepileptics", "aromatic AEDs", "anticonvulsant hypersensitivity syndrome"]}'),
  ('local.allergen', 'heparins', '{"en": "Heparins"}', '{"allergy_class": "heparin", "kind": "drug_class", "synonyms": ["LMWH", "low-molecular-weight heparin", "heparin-induced thrombocytopenia", "HIT"]}'),
  ('local.allergen', 'insulins', '{"en": "Insulins"}', '{"allergy_class": "insulin", "kind": "drug_class", "synonyms": ["insulin", "human insulin", "insulin analogue"]}'),
  ('local.allergen', 'gadolinium_contrast_media', '{"en": "Gadolinium contrast media"}', '{"allergy_class": null, "kind": "drug_class", "synonyms": ["gadolinium", "MRI contrast", "gadolinium-based contrast agent", "GBCA"]}'),
  ('local.allergen', 'intravenous_iron', '{"en": "Intravenous iron"}', '{"allergy_class": null, "kind": "drug_class", "synonyms": ["IV iron", "iron injection", "iron sucrose", "ferric carboxymaltose", "iron dextran", "Venofer", "Ferinject", "CosmoFer"]}'),
  ('local.allergen', 'amoxicillin', '{"en": "Amoxicillin"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["amoxycillin", "Amoxil"]}'),
  ('local.allergen', 'ampicillin', '{"en": "Ampicillin"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["Penbritin"]}'),
  ('local.allergen', 'co_amoxiclav', '{"en": "Co-amoxiclav"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["amoxicillin-clavulanate", "amoxicillin/clavulanic acid", "Augmentin", "Hibiotic", "Megamox"]}'),
  ('local.allergen', 'ampicillin_sulbactam', '{"en": "Ampicillin-sulbactam"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["ampicillin/sulbactam", "sultamicillin", "Unasyn", "Unictam"]}'),
  ('local.allergen', 'benzylpenicillin', '{"en": "Benzylpenicillin"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["penicillin G", "Pen G", "crystalline penicillin"]}'),
  ('local.allergen', 'benzathine_benzylpenicillin', '{"en": "Benzathine benzylpenicillin"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["benzathine penicillin G", "long-acting penicillin", "Bicillin L-A", "Retarpen"]}'),
  ('local.allergen', 'phenoxymethylpenicillin', '{"en": "Phenoxymethylpenicillin"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["penicillin V", "Pen V", "Pen VK"]}'),
  ('local.allergen', 'flucloxacillin', '{"en": "Flucloxacillin"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["floxacillin", "Floxapen"]}'),
  ('local.allergen', 'piperacillin_tazobactam', '{"en": "Piperacillin-tazobactam"}', '{"allergy_class": "penicillin", "kind": "drug", "synonyms": ["piperacillin/tazobactam", "pip-tazo", "Tazocin", "Zosyn"]}'),
  ('local.allergen', 'cefalexin', '{"en": "Cefalexin"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["cephalexin", "Keflex"]}'),
  ('local.allergen', 'cefadroxil', '{"en": "Cefadroxil"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Duricef"]}'),
  ('local.allergen', 'cefaclor', '{"en": "Cefaclor"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Distaclor", "Ceclor"]}'),
  ('local.allergen', 'cefuroxime', '{"en": "Cefuroxime"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["cefuroxime axetil", "Zinnat", "Zinacef"]}'),
  ('local.allergen', 'cefixime', '{"en": "Cefixime"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Suprax"]}'),
  ('local.allergen', 'cefpodoxime', '{"en": "Cefpodoxime"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["cefpodoxime proxetil", "Orelox", "Vantin"]}'),
  ('local.allergen', 'ceftriaxone', '{"en": "Ceftriaxone"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Rocephin"]}'),
  ('local.allergen', 'cefotaxime', '{"en": "Cefotaxime"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Claforan"]}'),
  ('local.allergen', 'cefoperazone', '{"en": "Cefoperazone"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["cefoperazone-sulbactam", "Cefobid", "Sulperazon"]}'),
  ('local.allergen', 'ceftazidime', '{"en": "Ceftazidime"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Fortum", "Fortaz"]}'),
  ('local.allergen', 'cefepime', '{"en": "Cefepime"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["Maxipime"]}'),
  ('local.allergen', 'cefazolin', '{"en": "Cefazolin"}', '{"allergy_class": "cephalosporin", "kind": "drug", "synonyms": ["cephazolin", "Ancef"]}'),
  ('local.allergen', 'meropenem', '{"en": "Meropenem"}', '{"allergy_class": "carbapenem", "kind": "drug", "synonyms": ["Meronem", "Merrem"]}'),
  ('local.allergen', 'imipenem_cilastatin', '{"en": "Imipenem-cilastatin"}', '{"allergy_class": "carbapenem", "kind": "drug", "synonyms": ["imipenem", "Tienam", "Primaxin"]}'),
  ('local.allergen', 'ertapenem', '{"en": "Ertapenem"}', '{"allergy_class": "carbapenem", "kind": "drug", "synonyms": ["Invanz"]}'),
  ('local.allergen', 'aztreonam', '{"en": "Aztreonam"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["Azactam"]}'),
  ('local.allergen', 'co_trimoxazole', '{"en": "Co-trimoxazole"}', '{"allergy_class": "sulfonamide_antibiotic", "kind": "drug", "synonyms": ["cotrimoxazole", "trimethoprim-sulfamethoxazole", "sulfamethoxazole-trimethoprim", "TMP-SMX", "Bactrim", "Septrin", "Septra"]}'),
  ('local.allergen', 'sulfadiazine', '{"en": "Sulfadiazine"}', '{"allergy_class": "sulfonamide_antibiotic", "kind": "drug", "synonyms": ["sulphadiazine", "silver sulfadiazine", "Flamazine", "Silvadene", "Dermazin"]}'),
  ('local.allergen', 'sulfasalazine', '{"en": "Sulfasalazine"}', '{"allergy_class": "sulfonamide_antibiotic", "kind": "drug", "synonyms": ["sulphasalazine", "Salazopyrin", "Azulfidine"]}'),
  ('local.allergen', 'azithromycin', '{"en": "Azithromycin"}', '{"allergy_class": "macrolide", "kind": "drug", "synonyms": ["Zithromax"]}'),
  ('local.allergen', 'clarithromycin', '{"en": "Clarithromycin"}', '{"allergy_class": "macrolide", "kind": "drug", "synonyms": ["Klacid", "Biaxin"]}'),
  ('local.allergen', 'erythromycin', '{"en": "Erythromycin"}', '{"allergy_class": "macrolide", "kind": "drug", "synonyms": ["Erythrocin"]}'),
  ('local.allergen', 'ciprofloxacin', '{"en": "Ciprofloxacin"}', '{"allergy_class": "fluoroquinolone", "kind": "drug", "synonyms": ["Cipro", "Ciprobay"]}'),
  ('local.allergen', 'levofloxacin', '{"en": "Levofloxacin"}', '{"allergy_class": "fluoroquinolone", "kind": "drug", "synonyms": ["Tavanic", "Levaquin"]}'),
  ('local.allergen', 'moxifloxacin', '{"en": "Moxifloxacin"}', '{"allergy_class": "fluoroquinolone", "kind": "drug", "synonyms": ["Avelox", "Avalox"]}'),
  ('local.allergen', 'ofloxacin', '{"en": "Ofloxacin"}', '{"allergy_class": "fluoroquinolone", "kind": "drug", "synonyms": ["Tarivid"]}'),
  ('local.allergen', 'norfloxacin', '{"en": "Norfloxacin"}', '{"allergy_class": "fluoroquinolone", "kind": "drug", "synonyms": ["Noroxin"]}'),
  ('local.allergen', 'doxycycline', '{"en": "Doxycycline"}', '{"allergy_class": "tetracycline", "kind": "drug", "synonyms": ["Vibramycin"]}'),
  ('local.allergen', 'tetracycline', '{"en": "Tetracycline"}', '{"allergy_class": "tetracycline", "kind": "drug", "synonyms": ["tetracycline hydrochloride"]}'),
  ('local.allergen', 'minocycline', '{"en": "Minocycline"}', '{"allergy_class": "tetracycline", "kind": "drug", "synonyms": ["Minocin"]}'),
  ('local.allergen', 'gentamicin', '{"en": "Gentamicin"}', '{"allergy_class": "aminoglycoside", "kind": "drug", "synonyms": ["gentamycin", "Garamycin"]}'),
  ('local.allergen', 'amikacin', '{"en": "Amikacin"}', '{"allergy_class": "aminoglycoside", "kind": "drug", "synonyms": ["Amikin"]}'),
  ('local.allergen', 'tobramycin', '{"en": "Tobramycin"}', '{"allergy_class": "aminoglycoside", "kind": "drug", "synonyms": ["Tobrex", "Nebcin"]}'),
  ('local.allergen', 'streptomycin', '{"en": "Streptomycin"}', '{"allergy_class": "aminoglycoside", "kind": "drug", "synonyms": []}'),
  ('local.allergen', 'neomycin', '{"en": "Neomycin"}', '{"allergy_class": "aminoglycoside", "kind": "drug", "synonyms": ["neomycin sulfate", "topical neomycin"]}'),
  ('local.allergen', 'metronidazole', '{"en": "Metronidazole"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["Flagyl"]}'),
  ('local.allergen', 'nitrofurantoin', '{"en": "Nitrofurantoin"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["Macrobid", "Macrodantin"]}'),
  ('local.allergen', 'clindamycin', '{"en": "Clindamycin"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["Dalacin C", "Cleocin"]}'),
  ('local.allergen', 'vancomycin', '{"en": "Vancomycin"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["Vancocin"]}'),
  ('local.allergen', 'aspirin', '{"en": "Aspirin"}', '{"allergy_class": "aspirin", "kind": "drug", "synonyms": ["acetylsalicylic acid", "ASA", "Aspocid"]}'),
  ('local.allergen', 'paracetamol', '{"en": "Paracetamol"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["acetaminophen", "APAP", "Panadol", "Tylenol", "Adol"]}'),
  ('local.allergen', 'metamizole', '{"en": "Metamizole"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["dipyrone", "metamizole sodium", "analgin", "Novalgin"]}'),
  ('local.allergen', 'ibuprofen', '{"en": "Ibuprofen"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Brufen", "Advil", "Nurofen", "Motrin"]}'),
  ('local.allergen', 'diclofenac', '{"en": "Diclofenac"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["diclofenac sodium", "diclofenac potassium", "Voltaren", "Cataflam", "Olfen"]}'),
  ('local.allergen', 'aceclofenac', '{"en": "Aceclofenac"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Airtal", "Preservex"]}'),
  ('local.allergen', 'naproxen', '{"en": "Naproxen"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Naprosyn", "Aleve"]}'),
  ('local.allergen', 'ketoprofen', '{"en": "Ketoprofen"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Profenid"]}'),
  ('local.allergen', 'indometacin', '{"en": "Indometacin"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["indomethacin", "Indocid"]}'),
  ('local.allergen', 'mefenamic_acid', '{"en": "Mefenamic acid"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Ponstan", "Ponstel"]}'),
  ('local.allergen', 'piroxicam', '{"en": "Piroxicam"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Feldene"]}'),
  ('local.allergen', 'meloxicam', '{"en": "Meloxicam"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Mobic"]}'),
  ('local.allergen', 'lornoxicam', '{"en": "Lornoxicam"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Xefo"]}'),
  ('local.allergen', 'ketorolac', '{"en": "Ketorolac"}', '{"allergy_class": "nsaid", "kind": "drug", "synonyms": ["Toradol", "Ketolac"]}'),
  ('local.allergen', 'celecoxib', '{"en": "Celecoxib"}', '{"allergy_class": "cox2_inhibitor", "kind": "drug", "synonyms": ["Celebrex"]}'),
  ('local.allergen', 'etoricoxib', '{"en": "Etoricoxib"}', '{"allergy_class": "cox2_inhibitor", "kind": "drug", "synonyms": ["Arcoxia"]}'),
  ('local.allergen', 'codeine', '{"en": "Codeine"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["codeine phosphate", "co-codamol"]}'),
  ('local.allergen', 'morphine', '{"en": "Morphine"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["morphine sulfate", "morphine sulphate", "MST", "Oramorph"]}'),
  ('local.allergen', 'oxycodone', '{"en": "Oxycodone"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["OxyContin", "OxyNorm"]}'),
  ('local.allergen', 'fentanyl', '{"en": "Fentanyl"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["fentanyl patch", "Durogesic"]}'),
  ('local.allergen', 'tramadol', '{"en": "Tramadol"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["Tramal", "Ultram"]}'),
  ('local.allergen', 'pethidine', '{"en": "Pethidine"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["meperidine", "Demerol"]}'),
  ('local.allergen', 'nalbuphine', '{"en": "Nalbuphine"}', '{"allergy_class": "opioid", "kind": "drug", "synonyms": ["Nubain", "Nalufin"]}'),
  ('local.allergen', 'captopril', '{"en": "Captopril"}', '{"allergy_class": "ace_inhibitor", "kind": "drug", "synonyms": ["Capoten"]}'),
  ('local.allergen', 'enalapril', '{"en": "Enalapril"}', '{"allergy_class": "ace_inhibitor", "kind": "drug", "synonyms": ["Renitec", "Vasotec"]}'),
  ('local.allergen', 'lisinopril', '{"en": "Lisinopril"}', '{"allergy_class": "ace_inhibitor", "kind": "drug", "synonyms": ["Zestril", "Prinivil"]}'),
  ('local.allergen', 'ramipril', '{"en": "Ramipril"}', '{"allergy_class": "ace_inhibitor", "kind": "drug", "synonyms": ["Tritace", "Altace"]}'),
  ('local.allergen', 'perindopril', '{"en": "Perindopril"}', '{"allergy_class": "ace_inhibitor", "kind": "drug", "synonyms": ["Coversyl", "Aceon"]}'),
  ('local.allergen', 'atorvastatin', '{"en": "Atorvastatin"}', '{"allergy_class": "statin", "kind": "drug", "synonyms": ["Lipitor"]}'),
  ('local.allergen', 'rosuvastatin', '{"en": "Rosuvastatin"}', '{"allergy_class": "statin", "kind": "drug", "synonyms": ["Crestor"]}'),
  ('local.allergen', 'simvastatin', '{"en": "Simvastatin"}', '{"allergy_class": "statin", "kind": "drug", "synonyms": ["Zocor"]}'),
  ('local.allergen', 'pravastatin', '{"en": "Pravastatin"}', '{"allergy_class": "statin", "kind": "drug", "synonyms": ["Pravachol", "Lipostat"]}'),
  ('local.allergen', 'carbamazepine', '{"en": "Carbamazepine"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug", "synonyms": ["Tegretol", "CBZ"]}'),
  ('local.allergen', 'oxcarbazepine', '{"en": "Oxcarbazepine"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug", "synonyms": ["Trileptal"]}'),
  ('local.allergen', 'phenytoin', '{"en": "Phenytoin"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug", "synonyms": ["phenytoin sodium", "Epanutin", "Dilantin"]}'),
  ('local.allergen', 'phenobarbital', '{"en": "Phenobarbital"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug", "synonyms": ["phenobarbitone", "Luminal"]}'),
  ('local.allergen', 'primidone', '{"en": "Primidone"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug", "synonyms": ["Mysoline"]}'),
  ('local.allergen', 'lamotrigine', '{"en": "Lamotrigine"}', '{"allergy_class": "anticonvulsant_aromatic", "kind": "drug", "synonyms": ["Lamictal"]}'),
  ('local.allergen', 'allopurinol', '{"en": "Allopurinol"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["Zyloric", "Zyloprim"]}'),
  ('local.allergen', 'metformin', '{"en": "Metformin"}', '{"allergy_class": "metformin", "kind": "drug", "synonyms": ["Glucophage", "Cidophage"]}'),
  ('local.allergen', 'heparin', '{"en": "Heparin"}', '{"allergy_class": "heparin", "kind": "drug", "synonyms": ["unfractionated heparin", "UFH", "heparin sodium"]}'),
  ('local.allergen', 'enoxaparin', '{"en": "Enoxaparin"}', '{"allergy_class": "heparin", "kind": "drug", "synonyms": ["Clexane", "Lovenox"]}'),
  ('local.allergen', 'dalteparin', '{"en": "Dalteparin"}', '{"allergy_class": "heparin", "kind": "drug", "synonyms": ["Fragmin"]}'),
  ('local.allergen', 'tinzaparin', '{"en": "Tinzaparin"}', '{"allergy_class": "heparin", "kind": "drug", "synonyms": ["Innohep"]}'),
  ('local.allergen', 'lidocaine', '{"en": "Lidocaine"}', '{"allergy_class": "local_anaesthetic_amide", "kind": "drug", "synonyms": ["lignocaine", "Xylocaine"]}'),
  ('local.allergen', 'bupivacaine', '{"en": "Bupivacaine"}', '{"allergy_class": "local_anaesthetic_amide", "kind": "drug", "synonyms": ["Marcaine"]}'),
  ('local.allergen', 'articaine', '{"en": "Articaine"}', '{"allergy_class": "local_anaesthetic_amide", "kind": "drug", "synonyms": ["Septanest", "Ubistesin"]}'),
  ('local.allergen', 'mepivacaine', '{"en": "Mepivacaine"}', '{"allergy_class": "local_anaesthetic_amide", "kind": "drug", "synonyms": ["Carbocaine", "Scandonest"]}'),
  ('local.allergen', 'prilocaine', '{"en": "Prilocaine"}', '{"allergy_class": "local_anaesthetic_amide", "kind": "drug", "synonyms": ["Citanest", "EMLA"]}'),
  ('local.allergen', 'chlorhexidine', '{"en": "Chlorhexidine"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["chlorhexidine gluconate", "Hibiscrub", "Savlon"]}'),
  ('local.allergen', 'povidone_iodine', '{"en": "Povidone-iodine"}', '{"allergy_class": null, "kind": "drug", "synonyms": ["iodine antiseptic", "topical iodine", "Betadine"]}'),
  ('local.allergen', 'peanut', '{"en": "Peanut"}', '{"allergy_class": null, "kind": "food", "synonyms": ["peanuts", "groundnut", "arachis", "peanut butter"]}'),
  ('local.allergen', 'tree_nuts', '{"en": "Tree nuts"}', '{"allergy_class": null, "kind": "food", "synonyms": ["nuts", "almond", "cashew", "walnut", "hazelnut", "pistachio", "pecan", "Brazil nut", "macadamia"]}'),
  ('local.allergen', 'egg', '{"en": "Egg"}', '{"allergy_class": null, "kind": "food", "synonyms": ["eggs", "hen''s egg", "egg white", "egg yolk"]}'),
  ('local.allergen', 'cow_s_milk', '{"en": "Cow''s milk"}', '{"allergy_class": null, "kind": "food", "synonyms": ["milk", "dairy", "cow''s milk protein", "CMPA", "casein", "whey"]}'),
  ('local.allergen', 'fish', '{"en": "Fish"}', '{"allergy_class": null, "kind": "food", "synonyms": ["finned fish", "cod", "tuna", "salmon", "sardine", "mackerel"]}'),
  ('local.allergen', 'shellfish_crustaceans', '{"en": "Shellfish (crustaceans)"}', '{"allergy_class": null, "kind": "food", "synonyms": ["shellfish", "seafood", "shrimp", "prawn", "crab", "lobster", "crustaceans"]}'),
  ('local.allergen', 'molluscs', '{"en": "Molluscs"}', '{"allergy_class": null, "kind": "food", "synonyms": ["mollusks", "squid", "calamari", "octopus", "mussels", "clams", "oysters"]}'),
  ('local.allergen', 'wheat', '{"en": "Wheat"}', '{"allergy_class": null, "kind": "food", "synonyms": ["wheat flour"]}'),
  ('local.allergen', 'sesame', '{"en": "Sesame"}', '{"allergy_class": null, "kind": "food", "synonyms": ["sesame seed", "tahini", "halawa", "halva"]}'),
  ('local.allergen', 'soy', '{"en": "Soy"}', '{"allergy_class": null, "kind": "food", "synonyms": ["soya", "soybean", "soy protein"]}'),
  ('local.allergen', 'latex', '{"en": "Latex"}', '{"allergy_class": "latex", "kind": "environmental", "synonyms": ["natural rubber latex", "rubber", "latex gloves"]}'),
  ('local.allergen', 'house_dust_mite', '{"en": "House dust mite"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["dust mite", "house dust", "HDM", "Dermatophagoides"]}'),
  ('local.allergen', 'pollen', '{"en": "Pollen"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["hay fever", "grass pollen", "tree pollen", "olive pollen", "weed pollen", "seasonal allergy"]}'),
  ('local.allergen', 'cat', '{"en": "Cat"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["cat dander", "cat hair"]}'),
  ('local.allergen', 'dog', '{"en": "Dog"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["dog dander", "dog hair"]}'),
  ('local.allergen', 'bee_venom', '{"en": "Bee venom"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["bee sting", "honeybee"]}'),
  ('local.allergen', 'wasp_venom', '{"en": "Wasp venom"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["wasp sting", "hornet", "yellow jacket", "vespid"]}'),
  ('local.allergen', 'mould', '{"en": "Mould"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["mold", "mould spores", "Alternaria", "Aspergillus"]}'),
  ('local.allergen', 'cockroach', '{"en": "Cockroach"}', '{"allergy_class": null, "kind": "environmental", "synonyms": ["cockroach allergen"]}'),
  ('local.allergen', 'adhesive_plaster', '{"en": "Adhesive plaster"}', '{"allergy_class": null, "kind": "other", "synonyms": ["plaster", "sticking plaster", "adhesive tape", "medical tape", "dressing adhesive"]}'),
  ('local.allergen', 'nickel', '{"en": "Nickel"}', '{"allergy_class": null, "kind": "other", "synonyms": ["metal allergy", "jewellery", "jewelry"]}'),
  ('local.allergen', 'hair_dye_ppd', '{"en": "Hair dye (PPD)"}', '{"allergy_class": null, "kind": "other", "synonyms": ["paraphenylenediamine", "PPD", "black henna"]}'),
  ('local.allergen', 'polyethylene_glycol_peg', '{"en": "Polyethylene glycol (PEG)"}', '{"allergy_class": null, "kind": "other", "synonyms": ["PEG", "macrogol", "Movicol"]}'),
  ('local.allergen', 'gelatin', '{"en": "Gelatin"}', '{"allergy_class": null, "kind": "other", "synonyms": ["gelatine", "gelatin plasma expander", "Gelofusine"]}'),
  ('local.allergy-class', 'ace_inhibitor', '{"en": "ace inhibitor"}', '{"rules": [{"also": ["arni"], "level": "warn", "note": "Sacubitril/valsartan is contraindicated after ACE-inhibitor angioedema."}, {"also": ["arb"], "level": "caution", "note": "ARBs carry a small risk of recurrence after ACE-inhibitor angioedema; use with caution."}, {"also": ["ace_inhibitor"], "level": "warn", "note": "ACE-inhibitor angioedema is a class (bradykinin) effect, so do not give any ACE inhibitor again. ARBs carry a small risk of recurrence and are used with caution. Sacubitril/valsartan is contraindicated after ACE-inhibitor angioedema. ACE-inhibitor cough is also a class effect but is not an allergy."}]}'),
  ('local.allergy-class', 'aminoglycoside', '{"en": "aminoglycoside"}', '{"rules": []}'),
  ('local.allergy-class', 'anticonvulsant_aromatic', '{"en": "anticonvulsant aromatic"}', '{"rules": [{"also": ["anticonvulsant_aromatic"], "level": "warn", "note": "Hypersensitivity to one aromatic antiepileptic (carbamazepine, oxcarbazepine, phenytoin, phenobarbital, primidone, lamotrigine) often carries over to the others. Older series report 40-80%; recent cohorts report lower rates. After DRESS or SJS/TEN, avoid the whole group. Valproate, levetiracetam, gabapentin/pregabalin and topiramate are non-aromatic alternatives. HLA-B*15:02 (mainly South-East Asian ancestry) is linked to carbamazepine SJS/TEN."}]}'),
  ('local.allergy-class', 'arb', '{"en": "arb"}', '{"rules": []}'),
  ('local.allergy-class', 'arni', '{"en": "arni"}', '{"rules": []}'),
  ('local.allergy-class', 'aspirin', '{"en": "aspirin"}', '{"rules": [{"also": ["nsaid"], "level": "warn", "note": "Aspirin hypersensitivity (asthma or rhinitis flare, urticaria, angioedema) is usually caused by COX-1 inhibition, and other NSAIDs, including metamizole, usually cause the same reaction. Paracetamol is usually tolerated at single doses up to 500 mg, and mostly at 1 g. COX-2 selective drugs (celecoxib, etoricoxib) are usually tolerated. Give the first dose under observation."}, {"also": ["cox2_inhibitor"], "level": "caution", "note": "COX-2 selective drugs (celecoxib, etoricoxib) are usually tolerated after aspirin hypersensitivity; give the first dose under observation."}]}'),
  ('local.allergy-class', 'carbapenem', '{"en": "carbapenem"}', '{"rules": [{"also": ["penicillin", "cephalosporin"], "level": "caution", "note": "Carbapenem allergy: cross-reactivity with penicillins and cephalosporins is low (around 1% or less). Give with monitoring and check the type of reaction."}]}'),
  ('local.allergy-class', 'cephalosporin', '{"en": "cephalosporin"}', '{"rules": [{"also": ["penicillin", "carbapenem"], "level": "caution", "note": "Cephalosporin allergy: cross-reactivity with penicillins is low and depends on the side chain (for example cefalexin/cefadroxil/cefaclor with amoxicillin/ampicillin). Cross-reactivity with carbapenems is under 1%. Ceftazidime shares a side chain with aztreonam. Check the specific drug and the type of reaction."}]}'),
  ('local.allergy-class', 'cox2_inhibitor', '{"en": "cox2 inhibitor"}', '{"rules": [{"also": ["nsaid", "aspirin"], "level": "caution", "note": "Check what the reaction to the COX-2 inhibitor was before giving another NSAID or aspirin."}]}'),
  ('local.allergy-class', 'fluoroquinolone', '{"en": "fluoroquinolone"}', '{"rules": []}'),
  ('local.allergy-class', 'heparin', '{"en": "heparin"}', '{"rules": [{"also": ["heparin"], "level": "warn", "note": "A heparin reaction, especially heparin-induced thrombocytopenia (HIT), applies to unfractionated heparin and all low-molecular-weight heparins (enoxaparin, dalteparin, tinzaparin). Use a non-heparin anticoagulant (for example argatroban or fondaparinux) as haematology advises."}]}'),
  ('local.allergy-class', 'insulin', '{"en": "insulin"}', '{"rules": []}'),
  ('local.allergy-class', 'iodinated_contrast', '{"en": "iodinated contrast"}', '{"rules": [{"also": ["iodinated_contrast"], "level": "warn", "note": "A previous reaction to iodinated contrast raises the risk of another with any iodinated agent. Follow the radiology protocol: consider a different contrast agent, a non-contrast study, or premedication for prior non-severe reactions. Shellfish, fish or povidone-iodine allergy is not a reason to withhold contrast."}]}'),
  ('local.allergy-class', 'latex', '{"en": "latex"}', '{"rules": []}'),
  ('local.allergy-class', 'local_anaesthetic_amide', '{"en": "local anaesthetic amide"}', '{"rules": [{"also": ["local_anaesthetic_amide"], "level": "caution", "note": "True allergy to amide local anaesthetics is rare. Most reactions are vasovagal, adrenaline effects, or reactions to preservatives (parabens, metabisulfite). Cross-reactivity between amides is limited and allergy testing can identify a safe agent. Ester anaesthetics (procaine, benzocaine) are a separate group."}]}'),
  ('local.allergy-class', 'macrolide', '{"en": "macrolide"}', '{"rules": []}'),
  ('local.allergy-class', 'metformin', '{"en": "metformin"}', '{"rules": []}'),
  ('local.allergy-class', 'nsaid', '{"en": "nsaid"}', '{"rules": [{"also": ["aspirin"], "level": "warn", "note": "Most NSAID hypersensitivity is cross-reactive through COX-1 inhibition, so aspirin, including low-dose aspirin, can cause the same reaction. A patient who reacted to only one NSAID (single-drug, often IgE-mediated) may tolerate aspirin, but only after specialist assessment."}, {"also": ["nsaid"], "level": "warn", "note": "NSAID hypersensitivity usually carries over to other non-selective NSAIDs and metamizole. COX-2 selective drugs (celecoxib, etoricoxib) are tolerated by most patients with cross-reactive NSAID hypersensitivity; give the first dose under observation. A single-NSAID (IgE-mediated) reaction may allow a structurally different NSAID after specialist assessment."}, {"also": ["cox2_inhibitor"], "level": "caution", "note": "COX-2 selective drugs (celecoxib, etoricoxib) are tolerated by most patients with cross-reactive NSAID hypersensitivity; give the first dose under observation."}]}'),
  ('local.allergy-class', 'opioid', '{"en": "opioid"}', '{"rules": [{"also": ["opioid"], "level": "caution", "note": "True opioid allergy is rare. Itching, flushing, hives or nausea with morphine, codeine or pethidine are usually direct histamine release or side effects, not allergy. After a true allergic reaction, an opioid from a different structural group is usually tolerated: phenanthrenes (morphine, codeine, oxycodone, hydromorphone, nalbuphine), phenylpiperidines (fentanyl, pethidine), diphenylheptanes (methadone); tramadol is structurally distinct. Give the first dose under observation."}]}'),
  ('local.allergy-class', 'penicillin', '{"en": "penicillin"}', '{"rules": [{"also": ["cephalosporin"], "level": "caution", "note": "Penicillin allergy: cross-reactivity with cephalosporins is about 1-2% overall and comes mainly from shared R1 side chains. It is higher with cephalosporins that share amoxicillin/ampicillin''s side chain (cefalexin, cefadroxil, cefaclor) and low with ceftriaxone, cefuroxime, cefixime, cefotaxime, cefepime and cefazolin. After a mild, non-severe reaction a cephalosporin with a different side chain can usually be given. After anaphylaxis or a severe skin reaction (SJS/TEN, DRESS), get specialist advice."}, {"also": ["carbapenem"], "level": "caution", "note": "Penicillin allergy: cross-reactivity with carbapenems is under 1% (meta-analysis about 0.9%). A carbapenem can usually be given with standard monitoring. After a severe delayed reaction (SJS/TEN, DRESS), get specialist advice first."}]}'),
  ('local.allergy-class', 'statin', '{"en": "statin"}', '{"rules": [{"also": ["statin"], "level": "caution", "note": "Most statin ''allergy'' is intolerance (muscle aches), not immune. A different statin, a lower dose or alternate-day dosing is often tolerated. Check CK if muscle symptoms recur. Avoid all statins after rhabdomyolysis or statin-associated immune-mediated myopathy."}]}'),
  ('local.allergy-class', 'sulfonamide_antibiotic', '{"en": "sulfonamide antibiotic"}', '{"rules": [{"also": [], "level": "caution", "note": "Allergy to a sulfonamide antibiotic (co-trimoxazole, sulfadiazine, sulfasalazine) does not mean allergy to non-antibiotic sulfonamides such as sulfonylureas, thiazides and furosemide. These lack the arylamine group behind the antibiotic reactions, so no cross-warning is raised for them. Patients with any drug allergy are slightly more likely to react to unrelated drugs in general."}]}'),
  ('local.allergy-class', 'tetracycline', '{"en": "tetracycline"}', '{"rules": []}'),
  ('local.reaction', 'rash', '{"en": "Rash"}', '{}'),
  ('local.reaction', 'urticaria_hives', '{"en": "Urticaria (hives)"}', '{}'),
  ('local.reaction', 'itching', '{"en": "Itching"}', '{}'),
  ('local.reaction', 'angioedema_lip_face_or_tongue_swelling', '{"en": "Angioedema (lip, face or tongue swelling)"}', '{}'),
  ('local.reaction', 'anaphylaxis', '{"en": "Anaphylaxis"}', '{}'),
  ('local.reaction', 'wheeze_shortness_of_breath', '{"en": "Wheeze / shortness of breath"}', '{}'),
  ('local.reaction', 'low_blood_pressure', '{"en": "Low blood pressure"}', '{}'),
  ('local.reaction', 'nausea_vomiting', '{"en": "Nausea / vomiting"}', '{}'),
  ('local.reaction', 'diarrhoea', '{"en": "Diarrhoea"}', '{}'),
  ('local.reaction', 'fever', '{"en": "Fever"}', '{}'),
  ('local.reaction', 'stevens_johnson_syndrome_ten', '{"en": "Stevens-Johnson syndrome / TEN"}', '{}'),
  ('local.reaction', 'dress', '{"en": "DRESS"}', '{}'),
  ('local.reaction', 'fixed_drug_eruption', '{"en": "Fixed drug eruption"}', '{}'),
  ('local.reaction', 'contact_dermatitis', '{"en": "Contact dermatitis"}', '{}'),
  ('local.reaction', 'low_platelets_e_g_hit', '{"en": "Low platelets (e.g. HIT)"}', '{}'),
  ('local.reaction', 'cough', '{"en": "Cough"}', '{}'),
  ('local.reaction', 'muscle_pain', '{"en": "Muscle pain"}', '{}'),
  ('local.reaction', 'unknown', '{"en": "Unknown"}', '{}');
