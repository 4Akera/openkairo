-- 38 · Ward nursing, obs due (spec/openCare.md §5.6, W1). A department setting, bedside.response, holds the ward's answer to each
-- NEWS2 level: how often the obs are due and whom to tell, with the Royal College of Physicians' 2017 response as its defaults (a 3 in
-- any one sign: hourly). The op bedside.obs_due reads each admitted stay's latest NEWS2, its level by the server's own points, and when
-- the next obs are due; the board's tile says "obs due 15:06" or "obs overdue 20 min", and the Obs due tab lists the ward, the overdue
-- first; only on a department whose line holds the Obs due tab, and only for adults (NEWS2's own rule). Facts shown, never a stop. A
-- migration of its own beside 17 so that two lanes of the pack merge apart; it runs after 17, so it may extend the starter setup 17
-- declares. Proposed by Claude, awaiting the owner.

set client_min_messages = warning;

-- ── the ward's response (§5.1 rule 7): on the department's card; RCP 2017 as its defaults; a level saved replaces RCP's whole ──
select core.declare_setting('bedside.response', 'bedside', 'department',
  $j${"type":"object","additionalProperties":false,"required":["zero","low","single","medium","high"],"properties":{
    "zero":{"type":"object","additionalProperties":false,"required":["every"],"properties":{
      "every":{"type":"integer","minimum":15,"maximum":1440,"default":720},"tell":{"type":"string","maxLength":80}}},
    "low":{"type":"object","additionalProperties":false,"required":["every"],"properties":{
      "every":{"type":"integer","minimum":15,"maximum":1440,"default":240},"tell":{"type":"string","maxLength":80,"default":"the nurse in charge"}}},
    "single":{"type":"object","additionalProperties":false,"required":["every"],"properties":{
      "every":{"type":"integer","minimum":15,"maximum":1440,"default":60},"tell":{"type":"string","maxLength":80,"default":"the doctor caring for the patient"}}},
    "medium":{"type":"object","additionalProperties":false,"required":["every"],"properties":{
      "every":{"type":"integer","minimum":15,"maximum":1440,"default":60},"tell":{"type":"string","maxLength":80,"default":"the doctor now"}}},
    "high":{"type":"object","additionalProperties":false,"required":["every"],"properties":{
      "every":{"type":"integer","minimum":15,"maximum":1440,"default":30},"tell":{"type":"string","maxLength":80,"default":"the doctor now · think of ICU"}}}}}$j$,
  labels => '{"en":"NEWS2 · the response","ar":"الاستجابة لمقياس NEWS2"}', form => 'department',
  fields => $j$[
    {"key":"zero","labels":{"en":"NEWS2 0"},"help":{"en":"RCP 2017: obs at least every 12 hours."}},
    {"key":"zero.every","labels":{"en":"Obs every"},"unit":"min"},
    {"key":"zero.tell","labels":{"en":"Tell"},"help":{"en":"Empty: nobody needs telling."}},
    {"key":"low","labels":{"en":"NEWS2 1–4"},"help":{"en":"RCP 2017: obs at least every 4–6 hours; a registered nurse assesses the patient."}},
    {"key":"low.every","labels":{"en":"Obs every"},"unit":"min"},
    {"key":"low.tell","labels":{"en":"Tell"}},
    {"key":"single","labels":{"en":"A 3 in any one sign"},"help":{"en":"NEWS2 1–4 with 3 points in one sign. RCP 2017: obs at least every hour; tell the medical team caring for the patient."}},
    {"key":"single.every","labels":{"en":"Obs every"},"unit":"min"},
    {"key":"single.tell","labels":{"en":"Tell"}},
    {"key":"medium","labels":{"en":"NEWS2 5–6"},"help":{"en":"RCP 2017: urgent response; obs at least every hour; tell the medical team at once."}},
    {"key":"medium.every","labels":{"en":"Obs every"},"unit":"min"},
    {"key":"medium.tell","labels":{"en":"Tell"}},
    {"key":"high","labels":{"en":"NEWS2 7 or more"},"help":{"en":"RCP 2017: emergency response; watch continuously; think of critical care."}},
    {"key":"high.every","labels":{"en":"Obs every"},"unit":"min"},
    {"key":"high.tell","labels":{"en":"Tell"}}]$j$);

-- ── its tab beside the bed board (§5.1 rules 5 and 6), for whoever may read the record there ──
select core.declare_screen('bedside.obs', 'bedside', 'stays', '{"en":"Obs due","ar":"مواعيد العلامات الحيوية"}', 'read:record');

-- ── the starter setup's Screens line gains the tab at its end, after whatever tabs 17 gives it; it still opens on the board ──
select core.declare_setup(s.key, s.layer, s.work, s.labels, s.packs, jsonb_set(s.screens, '{screens}', (s.screens -> 'screens') || '["bedside.obs"]'::jsonb),
    s.places, s.services, s.presets, s.settings, s.help)
  from core.setups s where s.key = 'bedside.ward' and s.screens is not null and not ((s.screens -> 'screens') ? 'bedside.obs');

set role pack_bedside;
-- RCP 2017's response: the setting's defaults, word for word (the suite checks they agree)
create function bedside.rcp_response() returns jsonb language sql immutable security definer set search_path = '' as $$
  select '{"zero":{"every":720},"low":{"every":240,"tell":"the nurse in charge"},"single":{"every":60,"tell":"the doctor caring for the patient"},
    "medium":{"every":60,"tell":"the doctor now"},"high":{"every":30,"tell":"the doctor now · think of ICU"}}'::jsonb
$$;
-- the ward's response as it stands: each level as the ward saved it, else RCP's
create function bedside.response_rules(p_org uuid, p_department uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_object_agg(d.key, coalesce(core.setting_at(p_org, 'bedside.response', p_department) -> d.key, d.value)) from jsonb_each(bedside.rcp_response()) d
$$;
-- a NEWS2's level: its band first (high, medium), then a 3 in any one sign, then 0, else low
create function bedside.level(p_total int, p_band text, p_threes int) returns text language sql immutable security definer set search_path = '' as $$
  select case when p_band = 'high' then 'high' when p_band = 'medium' then 'medium' when p_threes > 0 then 'single' when p_total = 0 then 'zero' else 'low' end
$$;
-- whether the department's Screens line holds Obs due: the line set there, else its default line (read 'me' builds it from the base's
-- screens of its work and those of the packs it uses), which holds the tab on a stays department that uses the pack: a ward made from the
-- starter setup keeps the default, since it is the same
create function bedside.obs_here(p_org uuid, p_department uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(core.setting_at(p_org, 'department.screens', p_department) -> 'screens' ? 'bedside.obs',
    core.department_uses(p_org, p_department, 'bedside') and core.pack_department(p_org, p_department) ->> 'work' = 'stays', false)
$$;
-- obs due: each stay admitted here and its latest NEWS2 as the reader may see it (as bedside.board reads it), its level by the server's
-- own points, the ward's rule for that level and when the next obs are due; a stay with no NEWS2 is left out. This department's stays
-- only, read here, never ids from the client; each patient is named for the read log
create function bedside.obs_due(p_org uuid, p_department uuid, p_user uuid, p_args jsonb) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare s jsonb; n record; v_rules jsonb; v_ids uuid[] := '{}'; v_out jsonb := '{}';
        v_threes jsonb; v_level text; v_every int;
begin
  -- only where the ward uses it: a department that ticks bedside for NEWS2 alone (an ICU, an ER) has no Obs due on its line
  if not bedside.obs_here(p_org, p_department) then
    return '{"patient_ids":[],"stays":{}}'::jsonb;
  end if;
  v_rules := bedside.response_rules(p_org, p_department);
  for s in select r from core.pack_rows(p_org, 'base.presence', jsonb_build_object('where', jsonb_build_object('department_id', p_department, 'state', 'admitted'))) r loop
    v_ids := v_ids || (s ->> 'patient_id')::uuid;
    select x.data, x.occurred_at into n from core.pack_kind(p_org, (s ->> 'patient_id')::uuid, 'score', '{"current":true}'::jsonb) x
     where x.visit_id = (s ->> 'item')::uuid and x.data ->> 'score' in ('bedside.news2', 'bedside.news2_s2')
     order by x.occurred_at desc, x.recorded_at desc, x.id desc limit 1;
    continue when not found;
    select coalesce(jsonb_agg(i ->> 'key' order by o), '[]') into v_threes
      from jsonb_array_elements(core.score(n.data ->> 'score', n.data ->> 'version', n.data -> 'inputs') -> 'items') with ordinality x(i, o)
     where (i ->> 'points')::int = 3;
    v_level := bedside.level((n.data ->> 'total')::int, n.data ->> 'band', jsonb_array_length(v_threes));
    v_every := (v_rules -> v_level ->> 'every')::int;
    v_out := v_out || jsonb_build_object(s ->> 'item', jsonb_strip_nulls(jsonb_build_object('score', n.data ->> 'score', 'version', n.data ->> 'version',
      'total', (n.data ->> 'total')::int, 'band', n.data ->> 'band', 'at', n.occurred_at, 'threes', v_threes, 'level', v_level, 'every', v_every,
      'tell', v_rules -> v_level ->> 'tell', 'due_at', n.occurred_at + make_interval(mins => v_every))));
  end loop;
  return jsonb_build_object('patient_ids', to_jsonb(v_ids), 'stays', v_out);
end $$;
reset role;
select core.declare_op('bedside.obs_due', 'bedside', 'bedside.obs_due(uuid,uuid,uuid,jsonb)', 'read:record', patients => true);

select core.lock_pack('bedside');
