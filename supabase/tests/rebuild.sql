-- permanent test 1 · rebuild = live (spec §8): the demo day through the writer, then every registered table recomputed from entries
-- (refreshes only, never checks) and compared row by row, for the seed's clinic and the fixture's
select t.fixture();
-- include: scripts/demo-day.sql
select t.ok((select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') > 150, 'the demo day wrote ' ||
  (select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') || ' entries');
select t.ok(not exists (select 1 from core.stale), 'no pack is stale');
select core.drain() as drained;
select t.ok(not exists (select 1 from core.outbox), 'the outbox drained');
select t.ok(r = '[]'::jsonb, 'rebuild = live: ' || left(r::text, 300)) from core.rebuild_check() r;
select t.ok(count(*) > 0, 'the rebuilt tables are not empty: ' || count(*) || ' presence rows') from base.presence where organization_id = '00000000-0000-0000-0000-00000000a001';
select t.ok(count(*) > 0, count(*) || ' values') from base.values where organization_id = '00000000-0000-0000-0000-00000000a001';
-- the chart's demo patient (scripts/demo-day.sql): every kind of entry landed, no code unknown, the stay open in its second bed, one critical to review
select t.ok(array(select distinct type from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001' and patient_id = '00000000-0000-0000-0000-0000000fc001')
  @> array['admitted', 'alert', 'allergy', 'called', 'checked_in', 'crossed_out', 'done', 'given', 'list_review', 'medication', 'moved', 'note', 'observation', 'order',
           'pharmacy.dispense', 'problem', 'procedure', 'result', 'reviewed', 'step', 'vitals'], 'the full chart has every kind of entry');
select t.ok(not exists (select 1 from core.entries e, jsonb_array_elements(e.findings) f where e.organization_id = '00000000-0000-0000-0000-00000000a001'
  and e.patient_id = '00000000-0000-0000-0000-0000000fc001' and f ->> 'code' in ('code_unknown', 'unit_not_ucum')), 'the full chart has no unknown code or unit');
select t.ok((select place_id from base.presence where organization_id = '00000000-0000-0000-0000-00000000a001' and patient_id = '00000000-0000-0000-0000-0000000fc001'
  and kind = 'stay' and state = 'admitted') = '00000000-0000-0000-0000-0000000b0005', 'the full chart''s stay is open, moved to Bed 5');
select t.ok((select count(*) filter (where critical) = 1 and count(*) = 1 from base.review where organization_id = '00000000-0000-0000-0000-00000000a001'
  and patient_id = '00000000-0000-0000-0000-0000000fc001'), 'the full chart has one critical result to review, and nothing else');
