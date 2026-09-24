-- 0029 · presets as shortcuts: a preset may carry a slash shortcut (/dm) and speed lines ("rx metformin 500 bd 30d for dm") that the
--   visit's composer runs through its parser, besides its services; a preset may be lines only
alter table core.templates add column if not exists shortcut text check (shortcut is null or shortcut ~ '^[a-z0-9_]{1,20}$'),
  add column if not exists lines text[] not null default '{}';
create unique index if not exists templates_shortcut on core.templates (organization_id, shortcut) where shortcut is not null and retired_at is null;

drop function if exists public.save_template(uuid, uuid, text, jsonb, uuid, uuid);
create function public.save_template(id uuid, organization_id uuid, name text, items jsonb default '[]', department_id uuid default null, seen_change_id uuid default null,
  shortcut text default null, lines text[] default '{}')
returns core.templates language plpgsql security definer set search_path = '' as $$
declare u uuid; t core.templates;
begin
  u := core.require_access(organization_id, 'manage:templates', null, null);
  perform core.require_fresh('templates', id, seen_change_id);
  if pg_catalog.jsonb_array_length(coalesce(items, '[]')) = 0 and coalesce(pg_catalog.array_length(lines, 1), 0) = 0 then perform core.refuse('preset_empty'); end if;
  shortcut := nullif(lower(pg_catalog.btrim(pg_catalog.ltrim(coalesce(shortcut, ''), '/'))), '');
  if shortcut is not null and exists (select 1 from core.templates x where x.organization_id = save_template.organization_id and x.shortcut = save_template.shortcut
                                      and x.retired_at is null and x.id <> save_template.id) then perform core.refuse('shortcut_taken', shortcut); end if;
  insert into core.templates (id, organization_id, department_id, name, items, shortcut, lines)
  values (id, organization_id, department_id, trim(name), coalesce(items, '[]'), shortcut, coalesce((select pg_catalog.array_agg(pg_catalog.btrim(l)) from pg_catalog.unnest(lines) l where pg_catalog.btrim(l) <> ''), '{}'))
  on conflict on constraint templates_pkey do update set name = excluded.name, items = excluded.items, department_id = excluded.department_id,
    shortcut = excluded.shortcut, lines = excluded.lines returning * into t;
  perform core.record_settings_change(organization_id, u, 'templates', t.id, pg_catalog.jsonb_build_object('name', t.name, 'items', pg_catalog.jsonb_array_length(t.items), 'shortcut', t.shortcut, 'lines', coalesce(pg_catalog.array_length(t.lines, 1), 0)));
  return t;
end $$;
grant execute on function public.save_template(uuid, uuid, text, jsonb, uuid, uuid, text, text[]) to authenticated;
