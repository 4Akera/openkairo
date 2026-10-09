-- The laboratory pack's seed (spec/openCare.md §5.3): the clinic turns the pack on, and the demo's own Laboratory takes the pack's
-- starter setup — it ticks lis, opens on Collect (in place of the bench) beside Results, and gains the catalogue of the tests most
-- asked for (what it had stays); the lab technician, Karim Fawzy, holds the pack's technician role there, and its senior, Hala Mansour,
-- approves what another released where a second person checks (the large lab's switches, off here but its sample labels, which print at
-- Collected: Settings turns the others on). Run again, it adds only what is missing. The Laboratory is the base's, which this pack now
-- serves (demo.serve: its own setup, through the door).
select demo.layer('lis');
select demo.pack_on('lis');
select demo.serve(demo.base('lab'), 'lis.laboratory');
select demo.grant(demo.base('tech'), '00000000-0000-0000-0000-00000000cf01', demo.base('lab'));
-- its own person: a second technician, who draws the blood at the collection chair
select demo.person(demo.id('lis', 'collector'), 'collect@demo.com', 'Mona Saber');
select demo.grant(demo.id('lis', 'collector'), '00000000-0000-0000-0000-00000000cf01', demo.base('lab'));
-- its senior: approves on To check (never what she released herself)
select demo.person(demo.id('lis', 'senior'), 'senior@demo.com', 'Hala Mansour');
select demo.grant(demo.id('lis', 'senior'), '00000000-0000-0000-0000-00000000cf02', demo.base('lab'));
-- its sample labels print at Collected (§3.13 Printing, owner 2026-10-08: where the laboratory's Sample labels says printed): the demo's
-- Laboratory says so on its card, the large lab's other switches off; written once through the door as the owner would (a reload leaves
-- what staff changed since). Chosen in the build, awaiting the owner
do $$
begin
  if core.setting_at(demo.base('clinic'), 'lis.large', demo.base('lab')) is not null then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_build_object('key', 'lis.large', 'owner_id', demo.base('lab'), 'data', '{"turnaround":false,"targets":{"haematology":60,"coagulation":60,
    "chemistry":120,"hormones":240,"serology":240,"urine_stool":60},"second_check":false,"scan_receive":false,"chairs":0,"labels":"printed","analysers":false,"auto_release":false}'::jsonb));
end $$;
-- the Blood bank (spec §5.7, Q35): a department using the pack, from its starter setup lis.blood_bank (its four products answered on the base's
-- bench after their steps; it works for every department); its technician, Mahmoud Fekry
select demo.setup(demo.id('lis', 'blood_bank'), 'lis.blood_bank', 'Blood bank', 25);

select demo.person(demo.id('lis', 'blood_tech'), 'bloodbank@demo.com', 'Mahmoud Fekry');
select demo.grant(demo.id('lis', 'blood_tech'), '00000000-0000-0000-0000-00000000cf01', demo.id('lis', 'blood_bank'));
