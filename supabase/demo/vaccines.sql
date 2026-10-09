-- The vaccines pack's day (spec/openCare.md §5.1 rule 9, §5.7; pictures #vax-chart, #vax-room): its own children, given their doses in
-- the Vaccination room by Rokaya Ghoneim or copied from the mother's card. Here today: Farida Bassem (13 months: her 12-month OPV 5 and
-- MMR 1 not given four weeks ago for a fever, so overdue; the pneumococcal booster due) and Talia Nassef (2 months: her birth doses from
-- the card, the 2-month ones due). Overdue · to call: Layan Hegab (18 months and five weeks: the 18-month row). A walk-in to find:
-- Seif Yehia (4 months, never here, by his mother's phone 0109 772 4410). Times relative to the load; ids in the pack's namespace; a
-- reload erases these children first.
select demo.layer('vaccines');

-- one dose of the pack's type: the base's given with the vaccine as its drug, and the pack's words
create or replace function pg_temp.dose(p_at timestamptz, p_series text, p_name text, p_cvx text, p_dose int, p_route text, p_site text,
  p_source text default 'here', p_on date default null, p_status text default 'completed', p_reason text default null, p_lot text default null, p_exp text default null)
returns jsonb language sql as $$
  select demo.e('vaccines.dose', demo.id('vaccines', 'room'), null, p_at, jsonb_strip_nulls(jsonb_build_object('status', p_status,
    'drug', jsonb_build_object('text', p_name, 'codings', case when p_cvx is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('system', 'vaccines.cvx', 'code', p_cvx, 'display', p_name)) end),
    'route', p_route, 'site', case when p_status = 'completed' and p_source = 'here' then p_site end, 'lot', p_lot, 'expiry', p_exp, 'reason', p_reason,
    'vaccines', jsonb_strip_nulls(jsonb_build_object('vaccine', p_series, 'dose', p_dose, 'source', p_source, 'given_on', p_on::text)))))
$$;

do $$
declare room uuid := demo.id('vaccines', 'room'); rk uuid := demo.id('vaccines', 'vaccinator'); day int := 60 * 24; b date; v uuid;
begin
  -- Farida Bassem, 13 months: birth, 2 and 4 months from the card; 6 months not given (fever 39 °C), given a week later; 9 months here;
  -- the 12-month OPV 5 and MMR 1 not given four weeks ago (fever 39.2 °C); pneumococcal 2, 4, 6 months and rotavirus 2, 4 months here
  b := demo.born(1, 32);
  perform demo.patient(demo.id('vaccines', 'patient:farida'), array['Farida'], 'Bassem', 'female', b, '+201005531842');
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(336 * day), 'hepb', 'Hepatitis B', '08', 0, 'im', null, 'card', b),
    pg_temp.dose(demo.ago(336 * day), 'opv', 'OPV', '02', 0, 'oral', null, 'card', b),
    pg_temp.dose(demo.ago(336 * day), 'bcg', 'BCG', '19', 1, 'id', null, 'card', b),
    pg_temp.dose(demo.ago(336 * day), 'opv', 'OPV', '02', 1, 'oral', null, 'card', b + 62),
    pg_temp.dose(demo.ago(336 * day), 'penta', 'Penta', '102', 1, 'im', null, 'card', b + 62)));
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(275 * day), 'opv', 'OPV', '02', 2, 'oral', null, 'card', b + 123),
    pg_temp.dose(demo.ago(275 * day), 'ipv', 'IPV', '10', 1, 'im', null, 'card', b + 123),
    pg_temp.dose(demo.ago(275 * day), 'penta', 'Penta', '102', 2, 'im', null, 'card', b + 123),
    pg_temp.dose(demo.ago(336 * day), 'pcv', 'Pneumococcal', '133', 1, 'im', 'left thigh', 'here', null, 'completed', null, 'PN2210', '08/2026'),
    pg_temp.dose(demo.ago(336 * day), 'rota', 'Rotavirus', '119', 1, 'oral', null, 'here', null, 'completed', null, 'RX5521', '06/2026'),
    pg_temp.dose(demo.ago(275 * day), 'pcv', 'Pneumococcal', '133', 2, 'im', 'left thigh', 'here', null, 'completed', null, 'PN2210', '08/2026'),
    pg_temp.dose(demo.ago(275 * day), 'rota', 'Rotavirus', '119', 2, 'oral', null, 'here', null, 'completed', null, 'RX5521', '06/2026')));
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(215 * day), 'opv', 'OPV', '02', 3, 'oral', null, 'here', null, 'not-done', 'fever 39 °C'),
    pg_temp.dose(demo.ago(215 * day), 'penta', 'Penta', '102', 3, 'im', null, 'here', null, 'not-done', 'fever 39 °C')));
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(208 * day), 'opv', 'OPV', '02', 3, 'oral', null, 'here', null, 'completed', null, 'B1874', '11/2026'),
    pg_temp.dose(demo.ago(208 * day), 'penta', 'Penta', '102', 3, 'im', 'right thigh', 'here', null, 'completed', null, 'PT4410', '09/2026'),
    pg_temp.dose(demo.ago(208 * day), 'pcv', 'Pneumococcal', '133', 3, 'im', 'left thigh', 'here', null, 'completed', null, 'PN2210', '08/2026')));
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(122 * day), 'opv', 'OPV', '02', 4, 'oral', null, 'here', null, 'completed', null, 'B2219', '12/2026'),
    pg_temp.dose(demo.ago(122 * day), 'vita', 'Vitamin A', null, 1, 'oral', null, 'here')));
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(28 * day), 'opv', 'OPV', '02', 5, 'oral', null, 'here', null, 'not-done', 'fever 39.2 °C'),
    pg_temp.dose(demo.ago(28 * day), 'mmr', 'MMR', '03', 1, 'sc', null, 'here', null, 'not-done', 'fever 39.2 °C')));
  -- here today, 5 minutes ago, through the desk
  v := demo.arrive('vaccines', 5, room);

  -- Talia Nassef, 2 months: her birth doses from the card; the 2-month OPV 1 and Penta 1 due (pneumococcal and rotavirus offered)
  b := demo.born(0, 62);
  perform demo.patient(demo.id('vaccines', 'patient:talia'), array['Talia'], 'Nassef', 'female', b, '+201143320975');
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(40 * day), 'hepb', 'Hepatitis B', '08', 0, 'im', null, 'card', b),
    pg_temp.dose(demo.ago(40 * day), 'opv', 'OPV', '02', 0, 'oral', null, 'card', b),
    pg_temp.dose(demo.ago(40 * day), 'bcg', 'BCG', '19', 1, 'id', null, 'card', b + 2)));
  v := demo.arrive('vaccines', 12, room);

  -- Layan Hegab, 18 months and five weeks: everything to 12 months given; the 18-month OPV, DTP booster, MMR 2 and vitamin A overdue
  b := demo.born(1, 218);
  perform demo.patient(demo.id('vaccines', 'patient:layan'), array['Layan'], 'Hegab', 'female', b, '+201229871154');
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(500 * day), 'hepb', 'Hepatitis B', '08', 0, 'im', null, 'card', b),
    pg_temp.dose(demo.ago(500 * day), 'opv', 'OPV', '02', 0, 'oral', null, 'card', b),
    pg_temp.dose(demo.ago(500 * day), 'bcg', 'BCG', '19', 1, 'id', null, 'card', b),
    pg_temp.dose(demo.ago(500 * day), 'opv', 'OPV', '02', 1, 'oral', null, 'card', b + 60),
    pg_temp.dose(demo.ago(500 * day), 'penta', 'Penta', '102', 1, 'im', null, 'card', b + 60),
    pg_temp.dose(demo.ago(460 * day), 'opv', 'OPV', '02', 2, 'oral', null, 'here', null, 'completed', null, 'B1650', '04/2026'),
    pg_temp.dose(demo.ago(460 * day), 'ipv', 'IPV', '10', 1, 'im', 'left thigh', 'here', null, 'completed', null, 'IP0932', '05/2026'),
    pg_temp.dose(demo.ago(460 * day), 'penta', 'Penta', '102', 2, 'im', 'right thigh', 'here', null, 'completed', null, 'PT3381', '05/2026')));
  perform demo.w(rk, jsonb_build_array(
    pg_temp.dose(demo.ago(400 * day), 'opv', 'OPV', '02', 3, 'oral', null, 'here', null, 'completed', null, 'B1650', '04/2026'),
    pg_temp.dose(demo.ago(400 * day), 'penta', 'Penta', '102', 3, 'im', 'right thigh', 'here', null, 'completed', null, 'PT3381', '05/2026'),
    pg_temp.dose(demo.ago(306 * day), 'opv', 'OPV', '02', 4, 'oral', null, 'here', null, 'completed', null, 'B1874', '11/2026'),
    pg_temp.dose(demo.ago(306 * day), 'vita', 'Vitamin A', null, 1, 'oral', null, 'here'),
    pg_temp.dose(demo.ago(215 * day), 'opv', 'OPV', '02', 5, 'oral', null, 'here', null, 'completed', null, 'B2219', '12/2026'),
    pg_temp.dose(demo.ago(215 * day), 'mmr', 'MMR', '03', 1, 'sc', 'right arm', 'here', null, 'completed', null, '4K21M07', '03/2027')));

  -- Seif Yehia, 4 months, never here: the walk-in found by his mother's phone
  perform demo.patient(demo.id('vaccines', 'patient:seif'), array['Seif'], 'Yehia', 'male', demo.born(0, 122), '01097724410');
end $$;
