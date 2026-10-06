-- permanent test 1 · rebuild = live (spec §8): the demo (supabase/demo/load.sql: the base's day, each pack's, the shared journey)
-- through the writer, then every registered table recomputed from entries (refreshes only, never checks) and compared row by row,
-- for the seed's clinic and the fixture's
select t.fixture();
-- include: supabase/demo/load.sql
select t.ok((select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') > 150, 'the demo wrote ' ||
  (select count(*) from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001') || ' entries');
select t.ok(not exists (select 1 from core.stale), 'no pack is stale');
select core.drain() as drained;
select t.ok(not exists (select 1 from core.outbox), 'the outbox drained');
select t.ok(r = '[]'::jsonb, 'rebuild = live: ' || left(r::text, 300)) from core.rebuild_check() r;
select t.ok(count(*) > 0, 'the rebuilt tables are not empty: ' || count(*) || ' presence rows') from base.presence where organization_id = '00000000-0000-0000-0000-00000000a001';
select t.ok(count(*) > 0, count(*) || ' values') from base.values where organization_id = '00000000-0000-0000-0000-00000000a001';
-- the chart's demo patient (supabase/demo/base.sql): every kind of the base's entries landed, no code unknown, the stay open in its
-- second bed (whichever was free), one critical to review; the pharmacy's dispenses are on its own patients and the shared
-- journey's (§5.1 rule 9)
select t.ok(array(select distinct type from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001' and patient_id = demo.id('base', 'patient:nadia'))
  @> array['admitted', 'alert', 'allergy', 'called', 'checked_in', 'crossed_out', 'done', 'given', 'list_review', 'medication', 'moved', 'note', 'observation', 'order',
           'problem', 'procedure', 'result', 'reviewed', 'step', 'vitals'], 'the full chart has every kind of the base''s entries');
select t.ok(exists (select 1 from core.entries where organization_id = '00000000-0000-0000-0000-00000000a001' and patient_id = demo.id('journey', 'patient:mahmoud')
  and type = 'pharmacy.dispense'), 'the shared journey has the pharmacy''s dispense');
select t.ok(not exists (select 1 from core.entries e, jsonb_array_elements(e.findings) f where e.organization_id = '00000000-0000-0000-0000-00000000a001'
  and e.patient_id = demo.id('base', 'patient:nadia') and f ->> 'code' in ('code_unknown', 'unit_not_ucum')), 'the full chart has no unknown code or unit');
select t.ok(p.place_id = (select (e.data ->> 'place_id')::uuid from core.entries e where e.organization_id = p.organization_id and e.item = p.item and e.type = 'moved')
  and p.place_id <> (select (e.data ->> 'place_id')::uuid from core.entries e where e.organization_id = p.organization_id and e.item = p.item and e.type = 'admitted'),
  'the full chart''s stay is open, moved off her first bed') from base.presence p where p.organization_id = '00000000-0000-0000-0000-00000000a001'
  and p.patient_id = demo.id('base', 'patient:nadia') and p.kind = 'stay' and p.state = 'admitted';
select t.ok((select count(*) filter (where critical) = 1 and count(*) = 1 from base.review where organization_id = '00000000-0000-0000-0000-00000000a001'
  and patient_id = demo.id('base', 'patient:nadia')), 'the full chart has one critical result to review, and nothing else');
