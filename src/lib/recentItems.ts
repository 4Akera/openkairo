// Recent items are stored in sessionStorage (not localStorage) so they are
// automatically cleared when the browser tab/window closes. This prevents
// PHI from persisting on shared or unattended workstations.
//
// Only non-PHI fields (IDs, status, timestamp) are stored. Names and MRNs
// are fetched from the database at display time, which also enforces RLS so
// a user can only see patients they are authorised to access.

// ─── Recent Patients ─────────────────────────────────────────────────────────

export type RecentPatientRef = {
  id: string
}

const RECENT_PTS_KEY = 'ok_recent_pts'

export function getRecentPatientIds(): RecentPatientRef[] {
  try { return JSON.parse(sessionStorage.getItem(RECENT_PTS_KEY) ?? '[]') }
  catch { return [] }
}

export function pushRecentPatientId(id: string) {
  const prev = getRecentPatientIds().filter(p => p.id !== id)
  sessionStorage.setItem(RECENT_PTS_KEY, JSON.stringify([{ id }, ...prev].slice(0, 6)))
}

// ─── Recent Encounters ────────────────────────────────────────────────────────

export type RecentEncounterRef = {
  encounterId: string
  patientId:   string
  status:      'open' | 'closed'
  visitedAt:   string
}

const RECENT_ENC_KEY = 'ok_recent_encounters'

export function getRecentEncounterRefs(): RecentEncounterRef[] {
  try { return JSON.parse(sessionStorage.getItem(RECENT_ENC_KEY) ?? '[]') }
  catch { return [] }
}

export function pushRecentEncounterRef(ref: RecentEncounterRef) {
  const prev = getRecentEncounterRefs().filter(e => e.encounterId !== ref.encounterId)
  sessionStorage.setItem(RECENT_ENC_KEY, JSON.stringify([ref, ...prev].slice(0, 20)))
}
