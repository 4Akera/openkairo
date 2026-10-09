-- 99 · privileges, asserted once after everything is declared (spec §1, §8): the API reaches only the doors; the base and packs call
-- only the core helpers granted to them. Per-schema default privileges cannot take PUBLIC's EXECUTE away, so it is taken here, from
-- every routine (functions and procedures), and again by core.create_pack for a pack's own schema.

set client_min_messages = warning;

revoke all on all routines in schema core from public, anon, authenticated;
revoke all on all routines in schema base from public, anon, authenticated;
revoke all on all routines in schema pharmacy from public, anon, authenticated;
revoke all on all routines in schema lis from public, anon, authenticated;
revoke all on all routines in schema billing from public, anon, authenticated;
revoke all on all routines in schema radiology from public, anon, authenticated;
revoke all on all routines in schema vaccines from public, anon, authenticated;
revoke all on all routines in schema chroniccare from public, anon, authenticated;
revoke all on all routines in schema familycare from public, anon, authenticated;
revoke all on all routines in schema paeds from public, anon, authenticated;
revoke all on all routines in schema obgyn from public, anon, authenticated;
revoke all on all routines in schema public from public, anon, authenticated;
alter default privileges for role base_role revoke execute on functions from public;
alter default privileges for role pack_pharmacy revoke execute on functions from public;
alter default privileges for role pack_lis revoke execute on functions from public;
alter default privileges for role pack_billing revoke execute on functions from public;
alter default privileges for role pack_radiology revoke execute on functions from public;
alter default privileges for role pack_vaccines revoke execute on functions from public;
alter default privileges for role pack_chroniccare revoke execute on functions from public;
alter default privileges for role pack_familycare revoke execute on functions from public;
alter default privileges for role pack_paeds revoke execute on functions from public;
alter default privileges for role pack_obgyn revoke execute on functions from public;

grant execute on function public.write(jsonb), public.read(jsonb), public.choose_user(uuid), public.create_organization(uuid, text, uuid, text),
  public.save(text, jsonb), public.remove(text, uuid), public.save_patient(jsonb), public.merge_patients(jsonb), public.write_setting(jsonb),
  public.setup(jsonb), public.erase_patient(jsonb), public.redact(jsonb), public.retry_pack(jsonb), public.pack_op(jsonb), public.my_users() to authenticated;
grant execute on function core.may_listen(text), core.may_read_file(text), core.may_upload_file(text) to authenticated;

-- core.lock_pack (a pack's schema: nothing callable by PUBLIC, now and later) is defined in 20260926000010_core_guards.sql, so a pack
-- migration numbered below this one may call it
