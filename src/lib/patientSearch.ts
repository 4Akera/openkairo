import { supabase } from './supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = ReturnType<typeof supabase.from<any, any>> extends { select: (...args: any[]) => infer R } ? R : never

const THIS_YEAR = new Date().getFullYear()

function isYear(token: string): boolean {
  const n = Number(token)
  return /^\d{4}$/.test(token) && n >= 1900 && n <= THIS_YEAR + 1
}

/** Structured params to pass to the search_patients RPC. */
export interface PatientSearchParams {
  tokens: string[] | null  // name / MRN / phone tokens (null = no text filter)
  year:   number  | null   // birth year (null = no year filter)
}

/**
 * Parse a raw search string into structured search params.
 *
 * Token classification:
 *   - 4-digit year (1900–present+1)  →  year field (AND filter on DOB)
 *   - anything else                  →  name / MRN / phone token
 *
 * Example:  "hussien ali 1995"  →  { tokens: ['hussien', 'ali'], year: 1995 }
 */
export function parseSearchQuery(raw: string): PatientSearchParams {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { tokens: null, year: null }

  const tokens: string[] = []
  let year: number | null = null

  for (const t of parts) {
    if (isYear(t)) year = Number(t)
    else tokens.push(t)
  }

  return { tokens: tokens.length > 0 ? tokens : null, year }
}

/**
 * Fallback: applies patient search directly to a PostgREST query builder.
 * Used when the search_patients RPC has not yet been deployed.
 *
 * Mirrors the logic of the SQL RPC so results are consistent.
 */
export function applyPatientSearch(query: AnyQuery, raw: string): AnyQuery {
  const { tokens, year } = parseSearchQuery(raw)

  if (!tokens && year === null) return query

  if (!tokens) {
    const y = year!.toString()
    query = query.or(`mrn.ilike.%${y}%,first_name.ilike.%${y}%,last_name.ilike.%${y}%`)
  } else if (tokens.length === 1) {
    const n = tokens[0]
    query = query.or(
      `first_name.ilike.%${n}%,last_name.ilike.%${n}%,mrn.ilike.%${n}%,phone.ilike.%${n}%`,
    )
  } else if (tokens.length === 2) {
    const [n1, n2] = tokens
    query = query.or(
      `and(first_name.ilike.%${n1}%,last_name.ilike.%${n2}%),` +
      `and(first_name.ilike.%${n2}%,last_name.ilike.%${n1}%)`,
    )
  } else {
    for (const n of tokens) {
      query = query.or(`first_name.ilike.%${n}%,last_name.ilike.%${n}%`)
    }
  }

  if (year !== null && tokens !== null) {
    query = query
      .gte('date_of_birth', `${year}-01-01`)
      .lte('date_of_birth', `${year}-12-31`)
  }

  return query
}
