-- the paediatrics pack (spec §5.7): growth worked out by the server from the base's vitals on the loaded WHO tables (each child's
-- measurement its z-scores and centiles, kept with the tables' version; beyond the loaded table it says so; an adult has no row; the
-- live op the same sums), a development check on the base's observation (written where the department uses the pack, by its
-- paediatrician and, everyday, by the base's Doctor there; never elsewhere; its shape), the Brighton PEWS added up by the server, the
-- clinic's dose list and milestones as settings, its two starter setups, its role
\set org  '00000000-0000-0000-0000-0000000000a1'
\set desk '00000000-0000-0000-0000-0000000000d4'
\set im   '00000000-0000-0000-0000-0000000000d1'
\set pc   '00000000-0000-0000-0000-0000000000e3'
\set cw   '00000000-0000-0000-0000-0000000000e4'
\set dr   '11111111-0000-0000-0000-0000000000b1'
\set pd   '11111111-0000-0000-0000-0000000000e3'
\set ow   '11111111-0000-0000-0000-0000000000b9'
\set baby '00000000-0000-0000-0000-00000000e3f1'
\set man  '00000000-0000-0000-0000-00000000e3f2'
\set boy  '00000000-0000-0000-0000-00000000e3f3'
select t.fixture();
-- the WHO tables the sums need (the demo loads birth to 2 years; these rows as the WHO publishes them, boys, 10 to 12 months)
insert into core.codes (system, code, labels, props) values
  ('paediatrics.who_growth', 'wfa.m.10', '{"en":"wfa boys 10"}', '{"L":0.082,"M":9.1649,"S":0.10891,"sample":true}'),
  ('paediatrics.who_growth', 'wfa.m.11', '{"en":"wfa boys 11"}', '{"L":0.073,"M":9.4122,"S":0.10906,"sample":true}'),
  ('paediatrics.who_growth', 'wfa.m.12', '{"en":"wfa boys 12"}', '{"L":0.0644,"M":9.6479,"S":0.10925,"sample":true}'),
  ('paediatrics.who_growth', 'lfa.m.11', '{"en":"lfa boys 11"}', '{"L":1,"M":74.5388,"S":0.03137,"sample":true}'),
  ('paediatrics.who_growth', 'lfa.m.12', '{"en":"lfa boys 12"}', '{"L":1,"M":75.7488,"S":0.03149,"sample":true}'),
  ('paediatrics.who_growth', 'wfl.m.72.0', '{"en":"wfl boys 72.0"}', '{"L":-0.3521,"M":8.9014,"S":0.08194,"sample":true}'),
  ('paediatrics.who_growth', 'wfl.m.72.5', '{"en":"wfl boys 72.5"}', '{"L":-0.3521,"M":9.0109,"S":0.08187,"sample":true}')
on conflict (system, code) do nothing;
select t.as(:'ow');
select public.write_setting(jsonb_build_object('key', 'organization.packs_used', 'data', jsonb_build_object('packs',
  (select coalesce(s.data -> 'packs', '[]') from core.settings s where s.key = 'organization.packs_used' order by s.recorded_at desc limit 1) || '["paediatrics"]'::jsonb))) ->> 'key' as on;
select public.setup(jsonb_build_object('setup', 'paediatrics.clinic', 'department_id', :'pc', 'name', 'Paediatrics clinic', 'apply', true)) is not null as made;
select public.setup(jsonb_build_object('setup', 'paediatrics.ward', 'department_id', :'cw', 'name', 'Children''s ward', 'apply', true)) is not null as made;
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000e3', 'name', 'Dr Rehab', 'login_id', :'pd', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000e301', 'department_id', :'pc')))) ->> 'id' as paediatrician;
-- Dr Ali (the base's Doctor) works in the Paediatrics clinic too
select public.save('user', jsonb_build_object('id', '00000000-0000-0000-0000-0000000000b1', 'holdings', jsonb_build_array(
  jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'im'), jsonb_build_object('role_id', '00000000-0000-0000-0000-00000000c002', 'department_id', :'pc')))) ->> 'id' as doctor;
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'baby', 'given', jsonb_build_array('Malek'), 'family', 'Shoukry', 'gender', 'male',
  'birth_date', ((now() at time zone 'Africa/Cairo')::date - 335)::text))) -> 'patient' ->> 'id') = :'baby' as baby;
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'boy', 'given', jsonb_build_array('Yassin'), 'family', 'Fawzy', 'gender', 'male',
  'birth_date', ((now() at time zone 'Africa/Cairo')::date - 920)::text))) -> 'patient' ->> 'id') = :'boy' as boy;
select (public.save_patient(jsonb_build_object('department_id', :'desk', 'patient', jsonb_build_object('id', :'man', 'given', jsonb_build_array('Samir'), 'family', 'Badr', 'gender', 'male',
  'birth_date', '1970-05-01'))) -> 'patient' ->> 'id') = :'man' as man;
set role authenticated;

\echo '── growth: the server works out each measurement of a child on the WHO tables, kept with their version'
select t.as(:'pd');
select t.landed(t.w(t.e('vitals', :'baby', :'pc', '{"weight":{"value":"7.5","unit":"kg","ucum":"kg"},"height":{"value":"72.4","unit":"cm","ucum":"cm"},"method":"lying"}',
  '00000000-0000-0000-0000-00000000e301')), 'weight and length, 11 months');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'pd');
create temp table g1 as select r from t.rows('paediatrics.growth', :'pc', jsonb_build_object('patient_id', :'baby')) r;
grant select on g1 to authenticated;
select t.ok((select (r -> 'z' -> 'wfa' ->> 'z')::numeric from g1) = -2.07 and (select (r -> 'z' -> 'wfa' ->> 'c')::numeric from g1) = 1.9, 'weight-for-age z −2.07, the 2nd centile (the picture)');
select t.ok((select (r -> 'z' -> 'lfa' ->> 'z')::numeric from g1) = -0.92, 'length-for-age z −0.92');
select t.ok((select (r -> 'z' -> 'wfl' ->> 'z')::numeric from g1) = -2.22, 'weight-for-length z −2.22: moderate wasting, worked out, never typed');
select t.ok((select r ->> 'version' from g1) = 'WHO 2006 · demo sample' and (select (r ->> 'lying')::boolean from g1), 'the tables'' version kept; the length lying');
select t.ok(not (select r -> 'z' ? 'hcfa' from g1) and (select r -> 'outside' from g1) = '[]'::jsonb, 'no head measured: nothing said of it');

\echo '── beyond the loaded table it says so, and an adult has no row'
select t.landed(t.w(t.e('vitals', :'boy', :'pc', '{"weight":{"value":"13.0","unit":"kg","ucum":"kg"}}')), 'a boy of two and a half weighed');
reset role;
select core.drain() as drained;
select exists (select 1 from core.codes c where c.system = 'paediatrics.who_growth' and c.code = 'wfa.m.30') as loaded30 \gset
set role authenticated;
select t.as(:'pd');
select t.ok((select case when :'loaded30' then r -> 'z' ? 'wfa' else r -> 'outside' ? 'wfa' end
  from t.rows('paediatrics.growth', :'pc', jsonb_build_object('patient_id', :'boy')) r), 'at 30 months: worked out where the table is loaded, else said to be beyond it, never guessed');
select t.as(:'dr');
select t.landed(t.w(t.e('vitals', :'man', :'im', '{"weight":{"value":"82","unit":"kg","ucum":"kg"}}')), 'an adult weighed in Internal Medicine');
reset role;
select core.drain() as drained;
set role authenticated;
select t.as(:'pd');
select t.ok(not exists (select 1 from t.rows('paediatrics.growth', :'pc', jsonb_build_object('patient_id', :'man'))), 'no growth row for a man of 56');
select t.as(:'pd');

\echo '── the line under /v asks the same sums while the doctor types (its op), only where the department uses the pack'
select t.ok((public.pack_op(jsonb_build_object('op', 'paediatrics.growth_now', 'department_id', :'pc', 'args', jsonb_build_object('patient_id', :'baby', 'weight', '7.5', 'length', '72.4')))
  -> 'z' -> 'wfa' ->> 'z')::numeric = -2.07, 'the op: weight z −2.07 for the values being typed');
select t.as(:'dr');
select t.refuses($$select public.pack_op(jsonb_build_object('op', 'paediatrics.growth_now', 'department_id', '00000000-0000-0000-0000-0000000000d1',
  'args', jsonb_build_object('patient_id', '00000000-0000-0000-0000-00000000e3f1', 'weight', '7')))$$, 'not_used_here');

\echo '── development: the pack''s check on the base''s observation, where the department uses the pack'
create function pg_temp.dev(p_items jsonb) returns jsonb language sql as $$
  select jsonb_build_object('code', jsonb_build_object('text', 'Development check'), 'value', jsonb_build_object('text', '1 yes · not yet: babbles'),
    'paediatrics', jsonb_build_object('list', '9-month', 'months', 9, 'age_months', 10, 'version', 'CDC 2022', 'items', p_items))
$$;
select t.as(:'pd');
select t.landed(t.w(t.e('paediatrics.development', :'baby', :'pc', pg_temp.dev('[{"area":"movement","text":"Sits without support","yes":true},{"area":"talking","text":"Babbles","short":"babbles","yes":false}]'),
  '00000000-0000-0000-0000-00000000e302')), 'the paediatrician writes a check');
reset role;
select t.ok((select paediatrics.development_line(jsonb_build_object('data', x.data)) from core.entries x where x.id = '00000000-0000-0000-0000-00000000e302')
  = 'Development · the 9-month list at 10 mo · 1 yes · not yet: babbles', 'its line says the list, the age, yes and not yet');
set role authenticated;
select t.as(:'pd');
select t.refused(t.w(t.e('paediatrics.development', :'baby', :'pc', pg_temp.dev('[]'))), 'bad_shape', 'a check names its milestones');
select t.refused(t.w(t.e('paediatrics.development', :'baby', :'pc', pg_temp.dev('[{"area":"singing","text":"Sings","yes":true}]'))), 'bad_shape', 'four areas only');
select t.as(:'dr');
select t.landed(t.w(t.e('paediatrics.development', :'baby', :'pc', pg_temp.dev('[{"area":"social","text":"Laughs at peek-a-boo","yes":true}]'))), 'everyday: the base''s Doctor where the department uses the pack');
select t.refused(t.w(t.e('paediatrics.development', :'baby', :'im', pg_temp.dev('[{"area":"social","text":"Laughs at peek-a-boo","yes":true}]'))), 'not_allowed', 'never where it is not used');

\echo '── the Brighton PEWS, added up by the server; its bands'
reset role;
select t.ok((core.score('paediatrics.pews', null, '{"behaviour":"irritable","circulation":"pink","breathing":"recessing","nebulisers":false,"vomiting":false}') -> 'band' ->> 'key') = 'doctor'
  and (core.score('paediatrics.pews', null, '{"behaviour":"irritable","circulation":"pink","breathing":"recessing","nebulisers":false,"vomiting":false}') ->> 'total')::int = 4, 'PEWS 4: tell the doctor');
select t.ok((core.score('paediatrics.pews', null, '{"behaviour":"irritable","circulation":"pale","breathing":"normal","nebulisers":false,"vomiting":false}') -> 'band' ->> 'tone') = 'warn', 'PEWS 3 in amber');
select t.ok((select s.alias from core.scores s where s.key = 'paediatrics.pews') = 'pews', '/pews in the composer');

\echo '── its settings, its setups, its role'
set role authenticated;
select t.as(:'ow');
select t.ok(public.write_setting('{"key":"paediatrics.doses","data":{"doses":[{"drug":"Amoxicillin","route":"oral","per":"day","from":40,"to":90,"times_from":2,"times_to":3,"most":1000}]}}') ->> 'key' = 'paediatrics.doses', 'the clinic''s dose list');
select t.refuses($$select public.write_setting('{"key":"paediatrics.doses","data":{"doses":[{"drug":"Amoxicillin","per":"week","from":40,"to":90}]}}')$$, 'bad_shape');
select t.ok(public.write_setting('{"key":"paediatrics.milestones","data":{"source":"CDC 2022","milestones":[{"months":9,"area":"talking","text":"Babbles","short":"babbles"}]}}') ->> 'key' = 'paediatrics.milestones', 'the clinic''s milestones');
reset role;
select t.ok((select count(*) from core.places p where p.department_id = '00000000-0000-0000-0000-0000000000e4' and p.retired_at is null) = 6, 'the Children''s ward: six beds from its setup');
select t.ok(core.department_uses(:'org', :'cw', 'paediatrics') and core.department_uses(:'org', :'pc', 'paediatrics'), 'both setups tick paediatrics');
select t.ok(core.may('00000000-0000-0000-0000-0000000000e3', 'write:result', :'pc') and core.may('00000000-0000-0000-0000-0000000000e3', 'write:paediatrics.development', :'pc'),
  'the paediatrician is built on Doctor, with its own check');
select t.ok(exists (select 1 from core.listeners l where l.layer = 'paediatrics' and 'vitals' = any (l.types)), 'growth listens to the base''s vitals');
