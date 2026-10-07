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

-- its stock (spec §5.3): the demo pharmacy keeps stock; the products it stocks, by brand, strength and box (the deliveries are its day)
select demo.setting('pharmacy.keep_stock', demo.id('pharmacy', 'department'), null, '{"keep":true}');
select demo.setting('pharmacy.product', demo.id('pharmacy', 'department'), demo.id('pharmacy', 'product:' || (p ->> 'brand')), p)
  from jsonb_array_elements('[
    {"brand":"Glucophage 500","generic":"Metformin","atc":"A10BA02","strength":"500 mg","form":"tablet","pack_size":30,"minimum":10},
    {"brand":"Cidophage 500","generic":"Metformin","atc":"A10BA02","strength":"500 mg","form":"tablet","pack_size":30,"minimum":20},
    {"brand":"Augmentin 1 g","generic":"Amoxicillin + clavulanic acid","atc":"J01CR02","strength":"1 g","form":"tablet","pack_size":14,"minimum":15},
    {"brand":"Nexium 40","generic":"Esomeprazole","atc":"A02BC05","strength":"40 mg","form":"tablet","pack_size":14,"minimum":10},
    {"brand":"Concor 5","generic":"Bisoprolol","atc":"C07AB07","strength":"5 mg","form":"tablet","pack_size":30,"minimum":10},
    {"brand":"Norvasc 10","generic":"Amlodipine","atc":"C08CA01","strength":"10 mg","form":"tablet","pack_size":30,"minimum":10},
    {"brand":"Lipitor 20","generic":"Atorvastatin","atc":"C10AA05","strength":"20 mg","form":"tablet","pack_size":30,"minimum":5},
    {"brand":"Panadol Extra","generic":"Paracetamol + caffeine","atc":"N02BE51","strength":"500 mg","form":"tablet","pack_size":24,"minimum":30}]'::jsonb) p;
