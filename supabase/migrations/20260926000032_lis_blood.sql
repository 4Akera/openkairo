-- 32 · the Blood bank on the laboratory pack (spec/openCare.md §5.8, Q35, Q36; the pictures /pictures.html#haem-blood, #haem-bedside). It
-- extends the pack lis (declared in 12) inside its own prefix: the Blood bank is a department using the pack, from its starter setup
-- lis.blood_bank (its products answered on the base's bench: the sample received, grouped and screened, crossmatched, then the units issued
-- as the base's result: the group, the antibody screen, the crossmatch and each unit's number); /blood is the pack's order word, its own
-- order type (the product, what the red cells need, the units, why, the consent, the sample: core change (a), written with write:order
-- wherever the doctor orders from); /transfuse is the bedside record, its own type extending the base's given (each unit: the two who
-- checked (the writer and the second, by name), the checks, the start and the end, the signs before, at 15 minutes and at the end, a reaction), offered wherever the Blood bank
-- works for the department (core change C3).

set client_min_messages = warning;

set role pack_lis;
create function lis.blood_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case e -> 'data' ->> 'status' when 'revoked' then 'Cancelled: ' when 'on-hold' then 'On hold: ' else '' end ||
    coalesce(e -> 'data' -> 'service' ->> 'name', 'Blood') || coalesce(' × ' || (e -> 'data' -> 'lis' ->> 'units'), '') ||
    coalesce(' · ' || (select string_agg(x, ', ') from jsonb_array_elements_text(e -> 'data' -> 'lis' -> 'needs') x), '') ||
    case when coalesce(e -> 'data' ->> 'priority', 'routine') <> 'routine' then ' · ' || (e -> 'data' ->> 'priority') else '' end ||
    coalesce(' · ' || nullif(e -> 'data' -> 'lis' ->> 'why', ''), '') || coalesce(' · ' || nullif(e -> 'data' ->> 'question', ''), '')
$$;
create function lis.transfusion_line(e jsonb) returns text language sql stable security definer set search_path = '' as $$
  select coalesce(e -> 'data' -> 'drug' ->> 'text', 'Blood') || coalesce(' · unit ' || (e -> 'data' ->> 'lot'), '') ||
    coalesce(' · ' || (e -> 'data' -> 'dose' ->> 'value') || ' mL', '') ||
    case when e -> 'data' -> 'lis' -> 'reaction' is not null then ' · stopped: ' || coalesce((select string_agg(x, ', ') from jsonb_array_elements_text(e -> 'data' -> 'lis' -> 'reaction' -> 'what') x), 'a reaction')
      || coalesce(', ' || (e -> 'data' -> 'lis' -> 'reaction' ->> 'severity'), '') else '' end
$$;
-- the bedside record is written where the pack serves the department (core change C3): it uses the pack, or the Blood bank works for it
create function lis.transfusion_check(p_entry jsonb, p_set jsonb) returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not core.pack_serves((p_entry ->> 'organization_id')::uuid, (p_entry ->> 'department_id')::uuid, 'lis') then
    return jsonb_build_array(jsonb_build_object('code', 'not_served', 'level', 'refuse', 'detail', 'no Blood bank works for this department'));
  end if;
  return '[]';
end $$;
reset role;

-- /blood's order: the base's order with the Blood bank's words (core change (a)): the product, what it needs, the units, why, the consent, the sample
select core.declare_type('lis.blood', 1, 'lis',
  jsonb_set((select t.shape from core.types t where t.key = 'order' order by t.version desc limit 1), '{properties,lis}',
    '{"type":"object","additionalProperties":false,"properties":{"product":{"enum":["rbc","plt","ffp","cryo"]},
      "needs":{"type":"array","items":{"enum":["leucodepleted","Rh and Kell matched","irradiated","washed"]}},"units":{"type":"integer","minimum":1,"maximum":20},
      "why":{"type":"string"},"consent":{"enum":["on file","signed today","emergency, no time"]},"sample":{"enum":["taken here","the lab collects"]}}}'),
  'lis.blood_line(jsonb)', array['ServiceRequest'], base_type => 'order', labels => '{"en":"Blood order","ar":"طلب دم"}');
-- the bedside record: each unit the base's given (the unit number its lot, the volume its dose), with the two who checked, the checks, the
-- start and end, the signs and a reaction (which the base's note also says, so every chart reads it)
select core.declare_type('lis.transfusion', 1, 'lis',
  jsonb_set((select t.shape from core.types t where t.key = 'given' order by t.version desc limit 1), '{properties,lis}',
    '{"type":"object","additionalProperties":false,"required":["unit","second"],"properties":{"unit":{"type":"string","minLength":3},"product":{"enum":["rbc","plt","ffp","cryo"]},
      "group":{"type":"string"},"second":{"type":"string","minLength":2},
      "checks":{"type":"array","items":{"type":"string"}},"started":{"type":"string"},"ended":{"type":"string"},
      "signs":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["when"],"properties":{"when":{"enum":["before","15 min","end","reaction"]},
        "at":{"type":"string"},"temp":{"type":"number"},"sys":{"type":"integer"},"dia":{"type":"integer"},"pulse":{"type":"integer"},"rr":{"type":"integer"},"spo2":{"type":"integer"}}}},
      "reaction":{"type":"object","additionalProperties":false,"properties":{"what":{"type":"array","items":{"enum":["hives, itch","fever, rigors","breathless","BP fell","back pain, dark urine"]}},
        "severity":{"enum":["mild","moderate","severe"]},"doctor":{"enum":["restart slowly when settled","do not restart · return the unit"]},"told":{"type":"string"}}}}}'),
  'lis.transfusion_line(jsonb)', array['MedicationAdministration'], base_type => 'given', checks => array['lis.transfusion_check(jsonb,jsonb)']::regprocedure[],
  labels => '{"en":"Blood at the bedside","ar":"نقل الدم"}');
-- written with the base's write:given wherever the Blood bank works for the department, the ward ticking no laboratory (C3)
select core.declare_served('lis.transfusion');

-- the Blood bank's starter setup (§5.2): a bench using the laboratory pack, working for every department; each product answered by the base's
-- result once crossmatched and issued (the group, the screen, the crossmatch, the units' numbers), after its steps
select core.declare_setup('lis.blood_bank', 'lis', 'bench', '{"en":"Blood bank"}', packs => array['lis'],
  screens => '{"screens":["base.bench"],"opens":"base.bench"}',
  settings => '{"department.works_for":{"all":true},"department.review_results":{"level":"critical"}}',
  help => '{"en":"Blood for the clinics and wards (/blood): the sample received, grouped and screened, crossmatched, each unit issued; the bedside record at the patient (/transfuse)."}',
  services => (select jsonb_agg(jsonb_build_object('code', x.code, 'name', x.name, 'section', 'Blood bank', 'answer', 'result', 'steps', '["received","grouped","crossmatched"]'::jsonb,
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'group', 'name', 'ABO and Rh', 'coding', jsonb_build_object('system', 'loinc', 'code', '882-1'), 'kind', 'choice',
          'choices', '["O Rh positive","O Rh negative","A Rh positive","A Rh negative","B Rh positive","B Rh negative","AB Rh positive","AB Rh negative"]'::jsonb),
        jsonb_build_object('key', 'screen', 'name', 'Antibody screen', 'coding', jsonb_build_object('system', 'loinc', 'code', '890-4'), 'kind', 'choice', 'choices', '["negative","positive"]'::jsonb),
        jsonb_build_object('key', 'crossmatch', 'name', 'Crossmatch', 'kind', 'choice', 'choices', '["compatible","incompatible","not needed"]'::jsonb),
        jsonb_build_object('key', 'units', 'name', 'Units issued', 'kind', 'text'))) order by x.n)
    from (values (1, 'rbc', 'Red cells'), (2, 'plt', 'Platelets'), (3, 'ffp', 'Plasma (FFP)'), (4, 'cryo', 'Cryoprecipitate')) x(n, code, name)));
