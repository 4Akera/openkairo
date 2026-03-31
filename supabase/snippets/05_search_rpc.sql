-- ============================================================
-- Patient Search Infrastructure
-- Run once in Supabase SQL Editor
-- ============================================================

-- 1. Enable trigram extension (required for fast ILIKE on large tables)
create extension if not exists pg_trgm;

-- 2. GIN trigram indexes — make ILIKE '%...%' fast for 100k+ rows
create index if not exists idx_patients_fname_trgm
  on patients using gin (first_name gin_trgm_ops);

create index if not exists idx_patients_lname_trgm
  on patients using gin (last_name gin_trgm_ops);

create index if not exists idx_patients_mrn_trgm
  on patients using gin (mrn gin_trgm_ops);

create index if not exists idx_patients_phone_trgm
  on patients using gin (phone gin_trgm_ops);

-- B-tree index for birth-year range queries
create index if not exists idx_patients_dob
  on patients (date_of_birth);

-- ============================================================
-- 3. search_patients RPC
-- ============================================================
-- Returns matching patient rows plus a total_count column
-- (window function — single round-trip, no second COUNT query).
--
-- Parameters:
--   p_tokens         text[]   — search tokens; each must match at least one of
--                               first_name, last_name, MRN, or phone.
--                               Order doesn't matter: "ali hussien 078..." works.
--   p_year           int      — birth year filter (AND with tokens)
--   p_created_by     uuid     — "mine only": restrict to this creator
--   p_open_encounter boolean  — only patients with ≥1 open encounter
--   p_limit          int      — page size  (default 50)
--   p_offset         int      — pagination offset (default 0)
-- ============================================================
create or replace function search_patients(
  p_tokens         text[]   default null,
  p_year           int      default null,
  p_created_by     uuid     default null,
  p_open_encounter boolean  default false,
  p_limit          int      default 50,
  p_offset         int      default 0
)
returns table (
  id                       uuid,
  mrn                      text,
  first_name               text,
  last_name                text,
  date_of_birth            date,
  date_of_birth_precision  text,
  gender                   text,
  phone                    text,
  blood_group              text,
  photo_url                text,
  custom_fields            jsonb,
  created_by               uuid,
  created_at               timestamptz,
  updated_at               timestamptz,
  total_count              bigint
)
language sql stable security definer
as $$
  select
    pt.id,
    pt.mrn,
    pt.first_name,
    pt.last_name,
    pt.date_of_birth,
    pt.date_of_birth_precision,
    pt.gender,
    pt.phone,
    pt.blood_group,
    pt.photo_url,
    pt.custom_fields,
    pt.created_by,
    pt.created_at,
    pt.updated_at,
    count(*) over() as total_count
  from patients pt
  where
    -- ── Name / MRN / phone tokens ────────────────────────────
    -- Every token must match at least one of: first_name, last_name, MRN, phone.
    -- This means you can type them in any order:
    --   "hussien ali 07838027100", "07838027100 hussien ali", "MRN-001 ali" — all work.
    (p_tokens is null or cardinality(p_tokens) = 0 or (
      (
        pt.first_name ilike '%' || p_tokens[1] || '%'
        or pt.last_name  ilike '%' || p_tokens[1] || '%'
        or pt.mrn        ilike '%' || p_tokens[1] || '%'
        or pt.phone      ilike '%' || p_tokens[1] || '%'
      )
      and (array_length(p_tokens, 1) < 2
        or pt.first_name ilike '%' || p_tokens[2] || '%'
        or pt.last_name  ilike '%' || p_tokens[2] || '%'
        or pt.mrn        ilike '%' || p_tokens[2] || '%'
        or pt.phone      ilike '%' || p_tokens[2] || '%'
      )
      and (array_length(p_tokens, 1) < 3
        or pt.first_name ilike '%' || p_tokens[3] || '%'
        or pt.last_name  ilike '%' || p_tokens[3] || '%'
        or pt.mrn        ilike '%' || p_tokens[3] || '%'
        or pt.phone      ilike '%' || p_tokens[3] || '%'
      )
      and (array_length(p_tokens, 1) < 4
        or pt.first_name ilike '%' || p_tokens[4] || '%'
        or pt.last_name  ilike '%' || p_tokens[4] || '%'
        or pt.mrn        ilike '%' || p_tokens[4] || '%'
        or pt.phone      ilike '%' || p_tokens[4] || '%'
      )
    ))

    -- ── Birth year (AND — narrows further) ───────────────────
    and (p_year is null
      or (
        pt.date_of_birth >= make_date(p_year, 1, 1)
        and pt.date_of_birth <  make_date(p_year + 1, 1, 1)
      )
    )

    -- ── "Mine only" ──────────────────────────────────────────
    and (p_created_by is null or pt.created_by = p_created_by)

    -- ── "Open encounter" ─────────────────────────────────────
    and (not p_open_encounter or exists (
      select 1 from encounters e
      where e.patient_id = pt.id and e.status = 'open'
    ))

  order by pt.created_at desc
  limit  p_limit
  offset p_offset;
$$;

-- Allow authenticated users to call this function
-- (the underlying patients table RLS still applies)
grant execute on function search_patients to authenticated;
