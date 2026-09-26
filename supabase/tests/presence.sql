-- presence (spec §4.2): desk → queue → called → seen → orders out → back → done; calling is not seeing; the bed board.
-- Ported from smoke_visits and calling; each move is a new version of the visit.
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set labd '00000000-0000-0000-0000-0000000000d2'
\set ward '00000000-0000-0000-0000-0000000000d6'
\set cbc  '00000000-0000-0000-0000-0000000000c1'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set rc   '11111111-0000-0000-0000-0000000000b4'
\set lt   '11111111-0000-0000-0000-0000000000b2'
\set pt   '00000000-0000-0000-0000-0000000000f1'
\set v1   '00000000-0000-0000-0000-0000000000a0'
select t.fixture();
set role authenticated;

\echo '── reception registers a lookalike and searches: by name (folded), by phone, by record number'
select t.as(:'rc');
select t.ok((public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000f2',
  'given', jsonb_build_array('Ahmad'), 'family', 'Hasan', 'gender', 'male', 'birth_date', '1970-01-01', 'birth_precision', 'year',
  'telecom', jsonb_build_array(jsonb_build_object('system', 'phone', 'value', '+201000000002'))))) -> 'patient' ->> 'number')::int = 2, 'the second patient is number 2');
select t.ok(jsonb_array_length(public.read('{"shape":"patients","q":"ahmed"}') -> 'patients') >= 1, 'found by name');
select t.ok(public.read('{"shape":"patients","q":"000001"}') -> 'patients' -> 0 ->> 'id' = :'pt', 'found by phone');
select t.ok(public.read('{"shape":"patients","q":"2"}') -> 'patients' -> 0 ->> 'id' = '00000000-0000-0000-0000-0000000000f2', 'found by record number');
select t.ok(public.read(jsonb_build_object('shape', 'patients', 'q', 'أحمد')) is not null, 'an Arabic search runs');

\echo '── the desk checks Ahmed in to Internal Medicine, urgent; a second check-in is refused'
select t.landed(t.check_in(:'v1', :'pt', :'desk', :'im', '{"priority":"urgent","reason":"cough"}'), 'checked in');
select t.refused(t.check_in('00000000-0000-0000-0000-0000000000a9', :'pt', :'desk', :'im'), 'already_here', 'Here again uses the open visit');
select t.refused(t.w(t.move('called', :'v1', :'desk')), 'not_allowed', 'reception cannot call');
select t.ok(r ->> 'state' = 'waiting' and (r ->> 'urgent')::boolean and r ->> 'department_id' = :'im' and (r ->> 'here')::boolean, 'waiting, urgent, here, in IM')
  from t.rows('base.presence', :'desk', jsonb_build_object('item', :'v1')) r;

\echo '── the doctor calls him: called, not seen; a second call of the same version is refused'
select t.as(:'dr');
select t.landed(t.w(t.move('called', :'v1', :'im'), null, '{}', jsonb_build_object(:'v1', 1)), 'called');
select t.ok(r ->> 'state' = 'called' and r ->> 'seen_at' is null and (r ->> 'calls')::int = 1, 'called is not seen') from t.rows('base.presence', :'im', jsonb_build_object('item', :'v1')) r;
select t.refused(t.w(t.e('called', :'pt', :'im', '{}', null, :'v1', :'v1', 'changes')), 'already_called', 'a second call');

\echo '── he orders a CBC in the visit (seen: something written for him); Done waits for it'
select t.landed(t.w(jsonb_build_array(
  t.e('order', :'pt', :'im', jsonb_build_object('service', jsonb_build_object('id', :'cbc', 'code', 'cbc', 'name', 'Complete blood count'), 'department_id', :'labd', 'priority', 'routine', 'status', 'active'),
      '00000000-0000-0000-0000-0000000000e1', :'v1'),
  t.move('done', :'v1', :'im'))), 'the order and Done in one set');
select t.ok(r ->> 'state' = 'pending' and r ->> 'seen_at' is not null and (r ->> 'orders_out')::int = 1, 'pending: seen, one order out')
  from t.rows('base.presence', :'im', jsonb_build_object('item', :'v1')) r;

\echo '── the lab answers: he is back, without any visit write'
select t.as(:'lt');
select t.landed(t.w(t.e('result', :'pt', :'labd', '{"status":"final","analytes":[{"key":"hb","name":"Hb","value":{"value":"13.1","ucum":"g/dL"},"interpretation":"N"}]}', null, null,
  '00000000-0000-0000-0000-0000000000e1', 'answers')), 'the result');
select t.as(:'dr');
select t.ok(r ->> 'state' = 'back' and (r ->> 'orders_out')::int = 0, 'back: every order answered') from t.rows('base.presence', :'im', jsonb_build_object('item', :'v1')) r;

\echo '── the doctor calls him again and finishes: done; the queue is empty; done today 1'
select t.landed(t.w(t.move('called', :'v1', :'im')), 'called again');
select t.landed(t.w(t.move('done', :'v1', :'im')), 'done');
select t.ok(r ->> 'state' = 'done' and r ->> 'ended_at' is not null, 'done, ended') from t.rows('base.presence', :'im', jsonb_build_object('item', :'v1')) r;
select t.ok(count(*) = 0, 'nobody waits in IM') from t.rows('base.presence', :'im', jsonb_build_object('department_id', :'im', 'state', jsonb_build_array('waiting', 'called', 'with', 'back', 'pending'))) r;
select t.ok(count(*) = 1, 'done today 1') from t.rows('base.presence', :'im', jsonb_build_object('department_id', :'im', 'state', 'done', 'day', (now() at time zone 'Africa/Cairo')::date)) r;
select t.refused(t.w(t.move('called', :'v1', :'im')), 'visit_closed', 'a closed visit is not called');

\echo '── the visit''s history is its item: every move a version'
select t.ok(string_agg(e ->> 'type', ' > ' order by (e ->> 'item_version')::int) = 'checked_in > called > done > called > done', 'history: ' || string_agg(e ->> 'type', ' > ' order by (e ->> 'item_version')::int))
  from jsonb_array_elements(public.read(jsonb_build_object('shape', 'item', 'item', :'v1', 'department_id', :'im')) -> 'entries') e where e ->> 'item' = :'v1';

\echo '── calling is not seeing: called, not here → back in his place with a missed call; he can be marked left'
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f2', :'desk', :'im'), 'Ahmad checked in');
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a1', :'im')), 'called');
select t.landed(t.w(t.move('back_to_waiting', '00000000-0000-0000-0000-0000000000a1', :'im', '{"reason":"not_here"}')), 'not here');
select t.ok(r ->> 'state' = 'waiting' and (r ->> 'missed')::int = 1 and r ->> 'seen_at' is null, 'waiting with a missed call, not seen') from t.rows('base.presence', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000a1')) r;
select t.as(:'rc');
select t.landed(t.w(t.move('left', '00000000-0000-0000-0000-0000000000a1', :'desk')), 'an unseen patient can be marked left');
select t.ok(r ->> 'state' = 'left' and r ->> 'seen_at' is null, 'left, never seen') from t.rows('base.presence', :'desk', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000a1')) r;

\echo '── called, vitals written, sent out: seen, and Back when he returns'
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000f2', :'desk', :'im'), 'checked in again');
select t.as(:'dr');
select t.landed(t.w(t.move('called', '00000000-0000-0000-0000-0000000000a2', :'im')), 'called');
select t.landed(t.w(t.e('vitals', '00000000-0000-0000-0000-0000000000f2', :'im', '{"bp":{"sys":{"value":"150","ucum":"mm[Hg]"},"dia":{"value":"95","ucum":"mm[Hg]"}}}', null, '00000000-0000-0000-0000-0000000000a2')), 'vitals');
select t.landed(t.w(t.move('back_to_waiting', '00000000-0000-0000-0000-0000000000a2', :'im', '{"reason":"sent_out"}')), 'sent out');
select t.ok(r ->> 'state' = 'back' and r ->> 'seen_at' is not null and (r ->> 'has_vitals')::boolean, 'Back means he was seen and came back')
  from t.rows('base.presence', :'im', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000a2')) r;

\echo '── the desk sends a waiting patient on: the same visit, another department'
select t.as(:'rc');
select t.landed(t.check_in('00000000-0000-0000-0000-0000000000a3', :'pt', :'desk', :'im'), 'Ahmed again');
select t.landed(t.w(t.move('transferred', '00000000-0000-0000-0000-0000000000a3', :'desk', '{"to_department_id":"00000000-0000-0000-0000-0000000000d5"}')), 'sent to Psychiatry');
select t.ok(r ->> 'department_id' = '00000000-0000-0000-0000-0000000000d5' and r ->> 'state' = 'waiting' and r ->> 'from_department_id' = :'im', 'waiting in Psychiatry, from IM')
  from t.rows('base.presence', :'desk', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000a3')) r;
select t.landed(t.w(t.move('urgent', '00000000-0000-0000-0000-0000000000a3', :'desk', '{"urgent":true}')), 'made urgent without moving');
select t.ok((r ->> 'urgent')::boolean, 'urgent') from t.rows('base.presence', :'desk', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000a3')) r;
select t.landed(t.w(t.move('not_here', '00000000-0000-0000-0000-0000000000a3', :'desk')), 'gone out');
select t.ok(not (r ->> 'here')::boolean, 'not here') from t.rows('base.presence', :'desk', jsonb_build_object('item', '00000000-0000-0000-0000-0000000000a3')) r;

\echo '── a stay: admitted to bed 1; a second patient cannot take bed 1; moved to bed 2; discharged frees it'
select t.as(:'dr');
select t.landed(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"outp","place_id":"00000000-0000-0000-0000-000000000001","reason":"pneumonia"}',
  '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000b0')), 'admitted to bed 1');
select t.refused(t.w(t.e('admitted', '00000000-0000-0000-0000-0000000000f2', :'ward', '{"admit_source":"emd","place_id":"00000000-0000-0000-0000-000000000001"}',
  '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1')), 'bed_taken', 'bed 1 is taken');
select t.refused(t.w(t.e('admitted', :'pt', :'ward', '{"admit_source":"outp"}', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2')), 'already_admitted');
select t.landed(t.w(t.move('moved', '00000000-0000-0000-0000-0000000000b0', :'ward', '{"place_id":"00000000-0000-0000-0000-000000000002"}')), 'moved to bed 2');
select t.landed(t.w(t.e('admitted', '00000000-0000-0000-0000-0000000000f2', :'ward', '{"admit_source":"emd","place_id":"00000000-0000-0000-0000-000000000001"}',
  '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1')), 'bed 1 is free again');
select t.landed(t.w(t.move('discharged', '00000000-0000-0000-0000-0000000000b0', :'ward', '{"disposition":"home"}')), 'discharged home');
select t.ok(string_agg(r ->> 'place_id' || ':' || (r ->> 'state'), ' ' order by r ->> 'place_id') = '00000000-0000-0000-0000-000000000001:admitted 00000000-0000-0000-0000-000000000002:discharged',
  'the bed board') from t.rows('base.presence', :'ward', jsonb_build_object('department_id', :'ward')) r;
