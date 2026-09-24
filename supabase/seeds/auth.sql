-- auth users for the dev seed (password Demo123!). Runs before dev.sql (alphabetical). Local only.
do $$
declare u record;
begin
  for u in select * from (values
    ('00000000-0000-0000-0000-000000000101'::uuid, 'admin@demo.com'),
    ('00000000-0000-0000-0000-000000000102'::uuid, 'dr.ali@demo.com'),
    ('00000000-0000-0000-0000-000000000104'::uuid, 'nurse@demo.com'),
    ('00000000-0000-0000-0000-000000000105'::uuid, 'lab@demo.com'),
    ('00000000-0000-0000-0000-000000000107'::uuid, 'reception@demo.com'),
    ('00000000-0000-0000-0000-000000000108'::uuid, 'psych@demo.com')
  ) as t(id, email) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change, email_change_token_new)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, extensions.crypt('Demo123!', extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
  end loop;
end $$;
