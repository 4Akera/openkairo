-- The pharmacy pack's seed (spec/openCare.md §5.1 rule 9): the clinic turns the pack on, the Pharmacy department is made from the
-- pack's starter setup (it ticks the pack; its Dispensing stands in for the bench), and a demo person for each role the pack declares.
-- Ids in the pack's own namespace (demo.id('pharmacy', …)); written through the doors by the kit; run again, it adds only what is
-- missing. Its day is supabase/demo/pharmacy.sql.

select demo.layer('pharmacy');
select demo.pack_on('pharmacy');
-- the Pharmacy department, made from the pack's starter setup (§5.2): it ticks pharmacy, opens on Dispensing (which stands in for the
-- bench), its dispensing service (one step, prepared, then the dispense that gives it), and a prepared dispense reads late after half an
-- hour here
select demo.setup(demo.id('pharmacy', 'department'), 'pharmacy.pharmacy', 'Pharmacy', 6);
-- the clinic's counselling note shown when giving: a clinic-wide setting, on the pack's page (§5.1 rule 7), never a setup's
select demo.setting('pharmacy.counselling', null, null, '{"show":true,"note":"Say how and when to take it, what to watch for, and when to come back."}');

-- its roles' people
select demo.person(demo.id('pharmacy', 'pharmacist'), 'pharm@demo.com', 'Dr. Reem Hamdy', 'Dr');
select demo.grant(demo.id('pharmacy', 'pharmacist'), '00000000-0000-0000-0000-00000000ca01', demo.id('pharmacy', 'department'));
select demo.person(demo.id('pharmacy', 'store keeper'), 'store@demo.com', 'Hesham Ragab');
select demo.grant(demo.id('pharmacy', 'store keeper'), '00000000-0000-0000-0000-00000000ca02', demo.id('pharmacy', 'department'));

-- its stock (spec §5.3): the demo pharmacy keeps stock; the clinic's products, one list, by brand, strength and box; each place that keeps
-- stock has its own minimums (the deliveries and what the store sends are its day). The main store (owner, 2026-10-07) is made from its
-- own setup — the pack, Keep stock, Stock its one tab, no dispensing — where the suppliers deliver and the store keeper sends on
select demo.setup(demo.id('pharmacy', 'store'), 'pharmacy.store', 'Main store', 7);
select demo.grant(demo.id('pharmacy', 'store keeper'), '00000000-0000-0000-0000-00000000ca02', demo.id('pharmacy', 'store'));
select demo.setting('pharmacy.keep_stock', demo.id('pharmacy', 'department'), null, '{"keep":true}');
do $$
declare ps jsonb := '[
    {"brand":"Glucophage 500","generic":"Metformin","atc":"A10BA02","strength":"500 mg","form":"tablet","pack_size":30,"minimum":10,"store":60},
    {"brand":"Cidophage 500","generic":"Metformin","atc":"A10BA02","strength":"500 mg","form":"tablet","pack_size":30,"minimum":20,"store":60},
    {"brand":"Augmentin 1 g","generic":"Amoxicillin + clavulanic acid","atc":"J01CR02","strength":"1 g","form":"tablet","pack_size":14,"minimum":15,"store":40},
    {"brand":"Nexium 40","generic":"Esomeprazole","atc":"A02BC05","strength":"40 mg","form":"tablet","pack_size":14,"minimum":10,"store":30},
    {"brand":"Concor 5","generic":"Bisoprolol","atc":"C07AB07","strength":"5 mg","form":"tablet","pack_size":30,"minimum":10,"store":40},
    {"brand":"Norvasc 10","generic":"Amlodipine","atc":"C08CA01","strength":"10 mg","form":"tablet","pack_size":30,"minimum":10,"store":40},
    {"brand":"Lipitor 20","generic":"Atorvastatin","atc":"C10AA05","strength":"20 mg","form":"tablet","pack_size":30,"minimum":5,"store":20},
    {"brand":"Panadol Extra","generic":"Paracetamol + caffeine","atc":"N02BE51","strength":"500 mg","form":"tablet","pack_size":24,"minimum":30,"store":100}]';
  id text := 'product:';
begin
  perform demo.setting('pharmacy.product', null, demo.id('pharmacy', id || (p ->> 'brand')), p - 'minimum' - 'store') from jsonb_array_elements(ps) p;
  perform demo.setting('pharmacy.minimums', demo.id('pharmacy', 'department'), null, jsonb_build_object('minimums',
    (select jsonb_object_agg(demo.id('pharmacy', id || (p ->> 'brand'))::text, (p ->> 'minimum')::int) from jsonb_array_elements(ps) p)));
  perform demo.setting('pharmacy.minimums', demo.id('pharmacy', 'store'), null, jsonb_build_object('minimums',
    (select jsonb_object_agg(demo.id('pharmacy', id || (p ->> 'brand'))::text, (p ->> 'store')::int) from jsonb_array_elements(ps) p)));
end $$;
