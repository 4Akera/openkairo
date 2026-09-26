-- the review loop (spec §4.5), ported from amendments: waiting for results, which results need review (the department's rule),
-- not seen, critical survives Done, a correction goes back to review, answers of the right kind only, ranges on the service
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set cxr  '00000000-0000-0000-0000-0000000000c2'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set rc   '11111111-0000-0000-0000-0000000000b4'
\set lt   '11111111-0000-0000-0000-0000000000b2'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set her  '00000000-0000-0000-0000-0000000000f7'
\set him  '00000000-0000-0000-0000-0000000000f8'
select t.fixture(false);
set role authenticated;

create temp table cbc_order (o jsonb);
grant all on cbc_order to public;
-- an order for a CBC in a visit, the result later
create or replace function pg_temp.order_cbc(p_patient uuid, p_visit uuid, p_id uuid) returns jsonb language sql as $$
  select t.w(t.e('order', p_patient, '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('service', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000c1', 'code', 'cbc', 'name', 'CBC'),
    'department_id', '00000000-0000-0000-0000-0000000000d2', 'priority', 'routine', 'status', 'active'), p_id, p_visit))
$$;
create or replace function pg_temp.hb(p_patient uuid, p_order uuid, p_value text, p_flag text, p_id uuid, p_replaces uuid default null) returns jsonb language sql as $$
  select t.w(t.e('result', p_patient, '00000000-0000-0000-0000-0000000000d2', jsonb_build_object('status', case when p_replaces is null then 'final' else 'corrected' end,
    'analytes', jsonb_build_array(jsonb_build_object('key', 'hb', 'name', 'Hb', 'code', jsonb_build_object('system', 'loinc', 'code', '718-7'),
      'value', jsonb_build_object('value', p_value, 'ucum', 'g/dL'), 'interpretation', p_flag))), p_id, null,
    case when p_replaces is null then p_order end, case when p_replaces is null then 'answers' end, p_replaces))
$$;
create or replace function pg_temp.review_of(p_item uuid) returns text language sql as $$
  select coalesce((select string_agg(r ->> 'why', ',') from t.rows('base.review', '00000000-0000-0000-0000-0000000000d1', jsonb_build_object('item', p_item)) r), 'none')
$$;

\echo '── the owner: CBC ranges by sex live on the service; defaults: critical only, patients wait'
select t.as(:'ow');
select t.ok(jsonb_array_length(s -> 'data' -> 'fields' -> 0 -> 'ranges') = 2, 'ranges by sex saved') from (select public.write_setting(jsonb_build_object('key', 'service', 'owner_id', :'labd',
  'thing_id', :'cbc', 'data', jsonb_build_object('code', 'cbc', 'name', 'CBC', 'answer', 'result', 'fields', jsonb_build_array(jsonb_build_object('key', 'hb', 'name', 'Hb', 'unit', 'g/dL', 'ucum', 'g/dL',
    'low', 12, 'high', 16, 'critical_low', 7, 'critical_high', 20, 'ranges', jsonb_build_array(jsonb_build_object('gender', 'female', 'low', 12, 'high', 15), jsonb_build_object('gender', 'male', 'low', 13, 'high', 17))))))) w) x,
  lateral (select s from jsonb_array_elements(public.read('{"shape":"me"}') -> 'settings') s where s ->> 'thing_id' = :'cbc') y;
select t.refuses($q$select public.write_setting('{"key":"service","owner_id":"00000000-0000-0000-0000-0000000000d2","data":{"code":"x","name":"X","answer":"nothing.here"}}')$q$, 'bad_answer');
select t.as(:'rc');
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'her', 'given', jsonb_build_array('Mona'), 'family', 'Saleh', 'gender', 'female'))) -> 'patient' ->> 'number') as mona;
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'him', 'given', jsonb_build_array('Omar'), 'family', 'Khaled', 'gender', 'male'))) -> 'patient' ->> 'number') as omar;

\echo '── her: waits for a CBC; 15.5 is high for a woman; she is here, so it needs no review (rule: critical)'
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a1', :'her', :'desk', :'im'), 'checked in');
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a1', :'im')), 'called');
select t.landed(pg_temp.order_cbc(:'her', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1'), 'CBC ordered');
select t.landed(t.w(t.move('done', '00000000-0000-0000-0000-0000000000a1', :'im')), 'Done');
select t.ok(r ->> 'state' = 'pending', 'Done waits for results') from t.rows('base.presence', :'im', '{"item":"00000000-0000-0000-0000-0000000000a1"}') r;
select t.as(:'lt');
select t.landed(pg_temp.hb(:'her', '00000000-0000-0000-0000-0000000000e1', '15.5', 'H', '00000000-0000-0000-0000-0000000000e2'), 'Hb 15.5 H');
select t.as(:'dr');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000e2') = 'none', 'high for her, no review while she waits');

\echo '── she leaves before being seen again: the desk marks her gone → the result is not seen'
select t.as(:'rc');
select t.landed(t.w(t.move('not_here', '00000000-0000-0000-0000-0000000000a1', :'desk')), 'gone');
select t.as(:'dr');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000e2') = 'not_seen', 'not seen → review');

\echo '── him: Done, not waiting → the visit closes although the CBC is out; his normal result later is not seen'
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a2', :'him', :'desk', :'im'), 'checked in');
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a2', :'im')), 'called');
select t.landed(pg_temp.order_cbc(:'him', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e3'), 'CBC ordered');
select t.landed(t.w(t.move('done', '00000000-0000-0000-0000-0000000000a2', :'im', '{"wait":false}')), 'Done, not waiting');
select t.ok(r ->> 'state' = 'done', 'not waiting → done') from t.rows('base.presence', :'im', '{"item":"00000000-0000-0000-0000-0000000000a2"}') r;
select t.as(:'lt');
select t.landed(pg_temp.hb(:'him', '00000000-0000-0000-0000-0000000000e3', '16.5', 'N', '00000000-0000-0000-0000-0000000000e4'), 'Hb 16.5 N');
select t.as(:'dr');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000e4') = 'not_seen', 'normal for him; not seen → review');

\echo '── him again: waits; a critical Hb; he comes back, is seen, Done → the critical still needs its review'
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a3', :'him', :'desk', :'im'), 'checked in');
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a3', :'im')), 'called');
select t.landed(pg_temp.order_cbc(:'him', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000e5'), 'CBC ordered');
select t.landed(t.w(t.move('done', '00000000-0000-0000-0000-0000000000a3', :'im')), 'Done, waiting');
select t.as(:'lt');
select t.landed(pg_temp.hb(:'him', '00000000-0000-0000-0000-0000000000e5', '5.1', 'LL', '00000000-0000-0000-0000-0000000000e6'), 'Hb 5.1 LL');
select t.as(:'dr');
select t.ok(r ->> 'state' = 'back', 'back') from t.rows('base.presence', :'im', '{"item":"00000000-0000-0000-0000-0000000000a3"}') r;
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a3', :'im')), 'called again');
select t.landed(t.w(t.move('done', '00000000-0000-0000-0000-0000000000a3', :'im')), 'done');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000e6') = 'critical', 'critical survives Done');

\echo '── the lab corrects it: a corrected result always goes back to review'
select t.as(:'lt');
select t.landed(pg_temp.hb(:'him', null, '15.1', 'N', '00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000e6'), 'corrected');
select t.as(:'dr');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000e6') = 'corrected', 'corrected → review');

\echo '── a note cannot answer a CBC; a result cannot answer an X-ray; a note answers the X-ray'
select t.landed(t.w(t.e('order', :'him', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cxr', 'code', 'cxr', 'name', 'Chest X-ray'), 'department_id', :'labd',
  'priority', 'routine', 'status', 'active'), '00000000-0000-0000-0000-0000000000e8')), 'an X-ray ordered');
select t.landed(pg_temp.order_cbc(:'him', null, '00000000-0000-0000-0000-0000000000eb'), 'another CBC');
select t.as(:'lt');
select t.refused(t.w(t.e('note', :'him', :'labd', '{"text":"looks fine"}', null, null, '00000000-0000-0000-0000-0000000000eb', 'answers')), 'wrong_answer', 'a note for a CBC');
select t.refused(t.w(t.e('result', :'him', :'labd', '{"status":"final","conclusion":"clear lungs"}', null, null, '00000000-0000-0000-0000-0000000000e8', 'answers')), 'wrong_answer', 'a result for an X-ray');
select t.ok(r ->> 'outcome' = 'landed', 'a note answers the X-ray') from t.w(t.e('note', :'him', :'labd', '{"kind":"report","text":"Clear lungs"}', '00000000-0000-0000-0000-0000000000e9', null, '00000000-0000-0000-0000-0000000000e8', 'answers')) r;
select t.refused(t.w(t.e('result', :'him', :'im', '{"status":"final","conclusion":"x"}', null, null, '00000000-0000-0000-0000-0000000000eb', 'answers')), 'not_allowed', 'the lab answers from the lab');

\echo '── Internal Medicine switches to "abnormal": she comes back to her open visit, a high result needs review while she waits'
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'department.review_results', 'owner_id', :'im', 'data', jsonb_build_object('level', 'abnormal'))) ->> 'key' as setting;
select t.as(:'rc');
select t.refused(t.check_in('00000000-0000-0000-0000-0000000000a4', :'her', :'desk', :'im'), 'already_here', 'her open visit');
select t.landed(t.w(t.move('here', '00000000-0000-0000-0000-0000000000a1', :'desk')), 'Here: back in her open visit');
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a1', :'im')), 'called');
select t.landed(pg_temp.order_cbc(:'her', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000ec'), 'CBC again');
select t.landed(t.w(t.move('done', '00000000-0000-0000-0000-0000000000a1', :'im')), 'done, waiting');
select t.as(:'lt');
select t.landed(pg_temp.hb(:'her', '00000000-0000-0000-0000-0000000000ec', '15.8', 'H', '00000000-0000-0000-0000-0000000000ed'), 'Hb 15.8 H');
select t.as(:'dr');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000ed') = 'abnormal', 'abnormal → review under the new setting');
select t.ok(pg_temp.review_of('00000000-0000-0000-0000-0000000000e2') = 'none', 'her first result: seen when she came back, and judged by the rule of its own time (critical)');
