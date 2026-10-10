-- The demo clinic's own choices between its packs (spec/openCare.md §5.1 rule 9, §5.4): no pack names another, so what joins two of
-- them is the clinic's, as its owner sets it in Settings → Departments — here, after every pack's seed. The Pharmacy bills (billing
-- ticked there: its prices show, its Dispensing rows hand their lines) and takes its own payment at its counter, where the pharmacist
-- holds the Cashier's role and has billing's Today on the Pharmacy's line, to count and close their own drawer. Written through the
-- doors as the owner; run again, it adds only what is missing. Skipped while either pack is off. Emergency uses Ward nursing too, after
-- its own pack, so Emergency's words lead each tile's line and its two buttons are the tile's (skipped while either is off). The ICU
-- and the CCU use Ward nursing too, after Critical care in their pack order. The Labour ward uses Ward nursing too, after ObGyn in its
-- pack order. The Children's ward (before paediatrics), the Chemotherapy day unit and Recovery use it too. Its day is
-- supabase/demo/clinic_packs.sql.

select demo.layer('clinic_packs');

do $$
declare c uuid := demo.base('clinic'); ph uuid := demo.id('pharmacy', 'department');
begin
  if not (core.packs_used(c) @> array['pharmacy', 'billing']) then return; end if;
  perform demo.tick(ph, 'billing');
  if core.setting_at(c, 'billing.desk', ph) is null then
    perform demo.as(demo.base('owner'));
    perform public.write_setting(jsonb_build_object('key', 'billing.desk', 'owner_id', ph, 'data', '{"takes":"own","float":"0.00"}'::jsonb));
  end if;
  perform demo.grant(demo.id('pharmacy', 'pharmacist'), '00000000-0000-0000-0000-00000000ce01', ph);
  -- its line as it shows (Dispensing, opening it, and Stock), then billing's Today after them
  perform demo.screen(ph, 'pharmacy.dispensing', true);
  perform demo.screen(ph, 'pharmacy.stock');
  perform demo.screen(ph, 'billing.today');
end $$;

-- the ICU and the CCU use Ward nursing too (its drug round and its handover, later), after Critical care in their pack order, so the
-- tile's two buttons are Critical care's. Skipped while either pack is off.
do $$
begin
  if not (core.packs_used(demo.base('clinic')) @> array['intensive', 'bedside']) then return; end if;
  perform demo.tick(demo.id('intensive', 'icu'), 'bedside');
  perform demo.tick(demo.id('intensive', 'ccu'), 'bedside');
end $$;

-- Family medicine uses chronic care and the immunisation pack too (§5.8 Q16), after its own and in that order, with the immunisation
-- list a tab of its line; the desk asks for a family file at New patient (§5.8 C4), so it ticks the family medicine pack, whose door it writes
-- the file through. Skipped while the family medicine pack is off; each other pack only while it is on.
do $$
declare c uuid := demo.base('clinic'); fm uuid := demo.id('familycare', 'department');
begin
  if not (core.packs_used(c) @> array['familycare']) then return; end if;
  perform demo.tick(demo.base('desk'), 'familycare');
  if core.packs_used(c) @> array['chroniccare'] then perform demo.tick(fm, 'chroniccare'); end if;
  if core.packs_used(c) @> array['vaccines'] then
    -- its line as drawn: the queue, Families, then the immunisation list
    perform demo.tick(fm, 'vaccines');
    perform demo.screen(fm, 'vaccines.room');
  end if;
end $$;

-- The clinics book their next visits (spec §5.8, the bookings links left out until bookings joined them, 2026-10-10; chosen by Claude at
-- the owner's request): Family medicine (Book on each member of a family file; /book in the consult), the Vaccination room (/vax's
-- next due day, then /book) and the Pre-op clinic (the desk books it for the surgeon's patients) tick bookings and keep a diary, with the
-- Diary on their line; the desk checks in for every department, so it books them too. Each written once; skipped while a pack is off.
do $$
declare c uuid := demo.base('clinic'); d record;
begin
  if not (core.packs_used(c) @> array['bookings']) then return; end if;
  for d in select * from (values
      ('familycare', demo.id('familycare', 'department'), jsonb_build_object('id', demo.id('clinic_packs', 'session:family morning'), 'name', 'Morning',
        'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb, 'from', '08:00', 'to', '14:00', 'how', 'number', 'places', 20, 'overbook', 2, 'walk_ins', 4)),
      ('vaccines', demo.id('vaccines', 'room'), jsonb_build_object('id', demo.id('clinic_packs', 'session:vaccination'), 'name', 'Vaccines',
        'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb, 'from', '09:00', 'to', '13:00', 'how', 'time', 'every', 15, 'overbook', 2, 'walk_ins', 0)),
      ('anaesthesia', demo.id('anaesthesia', 'preop'), jsonb_build_object('id', demo.id('clinic_packs', 'session:preop'), 'name', 'Pre-op',
        'days', '["sat","sun","mon","tue","wed","thu","fri"]'::jsonb, 'from', '10:00', 'to', '14:00', 'how', 'time', 'every', 20, 'overbook', 1, 'walk_ins', 0))) x(pack, dept, session) loop
    if not (core.packs_used(c) @> array[d.pack]) or not exists (select 1 from core.departments x where x.organization_id = c and x.id = d.dept) then continue; end if;
    perform demo.tick(d.dept, 'bookings');
    if core.setting_at(c, 'bookings.sessions', d.dept) is null then
      perform demo.as(demo.base('owner'));
      perform public.write_setting(jsonb_build_object('key', 'bookings.sessions', 'owner_id', d.dept, 'data', jsonb_build_object('sessions', jsonb_build_array(d.session), 'leave', '[]'::jsonb)));
    end if;
    perform demo.screen(d.dept, 'bookings.diary');
  end loop;
end $$;

-- The Theatre (spec §5.8, Q47 drawn: who ticks what): the surgeon's operation note and the anaesthetist's record are written there, so
-- the Theatre ticks surgical and anaesthesia too, its line has the Anaesthetic record beside the theatre list, the surgeon and the
-- anaesthetist hold their roles there; the Laboratory offers histopathology for the specimens sent at Sign out. Skipped while a pack is off.
do $$
declare c uuid := demo.base('clinic'); th uuid := demo.id('theatre', 'department');
begin
  if not (core.packs_used(c) @> array['theatre', 'surgical', 'anaesthesia']) then return; end if;
  perform demo.tick(th, 'surgical');
  perform demo.tick(th, 'anaesthesia');
  perform demo.screen(th, 'theatre.list', true);
  perform demo.screen(th, 'anaesthesia.record');
  perform demo.grant(demo.id('surgical', 'surgeon'), '00000000-0000-0000-0000-00000000e901', th);
  perform demo.grant(demo.id('anaesthesia', 'anaesthetist'), '00000000-0000-0000-0000-00000000eb01', th);
end $$;
do $$
declare c uuid := demo.base('clinic'); h uuid := core.setup_id(demo.base('lab'), 'service', 'histo');
begin
  if not (core.packs_used(c) @> array['theatre']) or core.setting_at(c, 'service', h) is not null then return; end if;
  perform demo.as(demo.base('owner'));
  perform public.write_setting(jsonb_build_object('key', 'service', 'owner_id', demo.base('lab'), 'thing_id', h,
    'data', '{"code":"histo","name":"Histopathology","section":"Histopathology","answer":"note","steps":["received"]}'::jsonb));
end $$;

-- Emergency uses Ward nursing too, after its own pack (skipped while either is off).
do $$
declare c uuid := demo.base('clinic'); er uuid := demo.id('casualty', 'department');
begin
  if not (core.packs_used(c) @> array['casualty', 'bedside']) then return; end if;
  perform demo.tick(er, 'bedside');
end $$;

-- the Labour ward uses Ward nursing too (its drug round, obs and handover, later), after ObGyn in its pack order, so the tile's two
-- buttons are ObGyn's while a woman is in labour. Skipped while either pack is off.
do $$
begin
  if not (core.packs_used(demo.base('clinic')) @> array['obgyn', 'bedside']) then return; end if;
  perform demo.tick(demo.id('obgyn', 'labour ward'), 'bedside');
end $$;

-- the Children's ward, the Chemotherapy day unit and Recovery use Ward nursing too (§5.8 Q27, Q40, Q48 and their pictures #paeds-ward,
-- #onc-unit, #theatre-recovery; chosen by Claude at the owner's request, 2026-10-10, as drawn). The Children's ward ticks it before
-- paediatrics (its words lead each tile, then the weight; Give and Obs are its buttons) and its line is Beds · Drug round · Handover; the
-- day unit after oncology (the cycle's words lead; Give and Obs are Ward nursing's, oncology brings none), Chairs · Drug round · Handover;
-- Recovery after anaesthesia (Aldrete and Record keep the tile's two buttons; doses and obs in the bay's stay), its line Bays as drawn.
-- None lists Obs due (NEWS2's due times are an adult ward's). Skipped while a pack is off.
do $$
declare c uuid := demo.base('clinic'); w uuid := demo.id('paeds', 'ward'); v jsonb;
begin
  if core.packs_used(c) @> array['paeds', 'bedside'] then
    v := coalesce(core.setting_at(c, 'department.packs', w) -> 'packs', '[]');
    if not v ? 'bedside' then
      perform demo.as(demo.base('owner'));
      perform public.write_setting(jsonb_build_object('key', 'department.packs', 'owner_id', w, 'data',
        coalesce(core.setting_at(c, 'department.packs', w), '{}') || jsonb_build_object('packs', '["bedside"]'::jsonb || v)));
    end if;
    perform demo.screen(w, 'bedside.round');
    perform demo.screen(w, 'bedside.handover');
  end if;
  if core.packs_used(c) @> array['oncology', 'bedside'] then
    perform demo.tick(demo.id('oncology', 'day_unit'), 'bedside');
    perform demo.screen(demo.id('oncology', 'day_unit'), 'bedside.round');
    perform demo.screen(demo.id('oncology', 'day_unit'), 'bedside.handover');
  end if;
  if core.packs_used(c) @> array['anaesthesia', 'bedside'] then perform demo.tick(demo.id('anaesthesia', 'recovery'), 'bedside'); end if;
end $$;

-- the ICU, the CCU, Emergency and the Labour ward tick Ward nursing for its words and its round, not for the ward's due times: each keeps
-- the line it has by default, the base's screens of its work and its packs' (as read 'me' builds it), without Obs due, which its setup
-- does not list (Ward nursing's W1: obs_here reads the line, else the default). Written once, where no line is set yet.
do $$
declare c uuid := demo.base('clinic'); d core.departments; v jsonb;
begin
  for d in select * from core.departments x where x.organization_id = c and x.id in (demo.id('intensive', 'icu'), demo.id('intensive', 'ccu'),
             demo.id('casualty', 'department'), demo.id('obgyn', 'labour ward')) and core.department_uses(c, x.id, 'bedside')
             and core.setting_at(c, 'department.screens', x.id) is null loop
    v := (select coalesce(jsonb_agg(s.key order by s.layer <> 'base', s.key), '[]') from core.screens s
      where s.layer <> 'core' and s.work = d.work and core.department_uses(c, d.id, s.layer) and s.key <> 'bedside.obs'
        and not exists (select 1 from core.screens x where x.work = d.work and s.key = any (x.replaces) and core.department_uses(c, d.id, x.layer)));
    perform demo.as(demo.base('owner'));
    perform public.write_setting(jsonb_build_object('key', 'department.screens', 'owner_id', d.id, 'data', jsonb_build_object('screens', v, 'opens', v ->> 0)));
  end loop;
end $$;
