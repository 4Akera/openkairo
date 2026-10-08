-- 27 · the obgyn pack (spec/openCare.md §5.7; the pictures /pictures.html#anc-visit … #ob-settings, and the labour ward's in §5.6). Created
-- here first, alone, so the labour ward's part can build on it (agreed with the beds lane 2026-10-08: clinics L2 creates the pack in
-- this migration, role block d3; the labour ward adds its types, scores and setup in its own later migration for layer 'obgyn', with no
-- second declare_pack; role ids d310–d31f kept for it). The clinic part's types, settings, score and setup follow in this file.

set client_min_messages = warning;

select core.declare_pack('obgyn', 1, '{}', '{"en":"ObGyn","ar":"النساء والتوليد"}', role_block => 'd3');
select core.create_pack('obgyn');

-- its people (§5.2): the obstetrician a doctor, the midwife a nurse; their own actions come with the parts that declare them
select core.declare_role('00000000-0000-0000-0000-00000000d301', 'obgyn.obstetrician', 'obgyn', 'Obstetrician', '{}', '{"en":"Obstetrician"}',
  built_on => '00000000-0000-0000-0000-00000000c002');
select core.declare_role('00000000-0000-0000-0000-00000000d302', 'obgyn.midwife', 'obgyn', 'Midwife', '{}', '{"en":"Midwife"}',
  built_on => '00000000-0000-0000-0000-00000000c003');
