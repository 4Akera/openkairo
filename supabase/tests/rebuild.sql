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
