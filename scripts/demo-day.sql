-- A realistic clinic morning for the Demo Clinic, written through the public functions as real users (never into tables):
-- reception registers and checks in :n patients to Internal Medicine; the doctor sends lab requests for every third one.
-- Run:  npm run db:demo      (after npm run db:reset)
\set n 30
select set_config('opencare.demo_n', :'n', false);
do $$
declare
  org uuid := '00000000-0000-0000-0000-00000000a001'; im uuid := '00000000-0000-0000-0000-00000000d002'; lab uuid := '00000000-0000-0000-0000-00000000d003';
  given text[] := array['Ahmed','Mona','Omar','Salma','Karim','Nour','Hany','Laila','Youssef','Dina','Tarek','Rania','Mostafa','Heba','Amr','Yasmin','Khaled','Mariam','Sherif','Aya'];
  family text[] := array['Hassan','Saleh','Khaled','Fathy','Nabil','Adel','Saeed','Mahmoud','Ibrahim','Farouk','Mansour','Samir','Gamal','Helmy','Zaki'];
  n int := current_setting('opencare.demo_n')::int; i int; pid uuid; svcs uuid[];
begin
  select array_agg(id order by code) into svcs from core.services where department_id = lab and retired_at is null;
  for i in 1..n loop
    pid := gen_random_uuid();
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000107","role":"authenticated"}', true);
    perform public.register_patient(id => pid, organization_id => org, given_name => given[1 + i % array_length(given, 1)], family_name => family[1 + (i * 7) % array_length(family, 1)],
      sex => (case when given[1 + i % array_length(given, 1)] = any(array['Mona','Salma','Nour','Laila','Dina','Rania','Heba','Yasmin','Mariam','Aya']) then 'female' else 'male' end)::core.sex, born_on => (1945 + (i * 13) % 60)::text, phone_text => '010' || lpad((i * 7919 % 100000000)::text, 8, '0'));
    perform public.open_visit(id => gen_random_uuid(), patient_id => pid, department_id => im, priority => (case when i % 11 = 0 then 'urgent' else 'routine' end)::core.request_priority);
    if i % 3 = 0 then
      perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}', true);
      perform public.read_record(pid, im);
      perform public.write_request(id => gen_random_uuid(), patient_id => pid, department_id => im, service_id => svcs[1 + (i + k) % array_length(svcs, 1)],
        priority => (case when i % 9 = 0 then 'urgent' else 'routine' end)::core.request_priority) from generate_series(0, 1 + i % 3) k;
    end if;
  end loop;
end $$;
select (select count(*) from core.visits where ended_at is null) as open_visits, (select count(*) from core.requests where status = 'open') as open_requests;
