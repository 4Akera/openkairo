// ─── Recent Patients ─────────────────────────────────────────────────────────

export type RecentEntry = {
  id:          string
  first_name:  string
  middle_name: string | null
  last_name:   string
  mrn:         string
}

const RECENT_PTS_KEY = 'ok_recent_pts'

export function getRecentPatients(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENT_PTS_KEY) ?? '[]') }
  catch { return [] }
}

export function pushRecentPatient(pt: RecentEntry) {
  const prev = getRecentPatients().filter(p => p.id !== pt.id)
  localStorage.setItem(RECENT_PTS_KEY, JSON.stringify([pt, ...prev].slice(0, 6)))
}

// ─── Recent Encounters ────────────────────────────────────────────────────────

export type RecentEncounterEntry = {
  encounterId: string
  patientId:   string
  patientName: string
  mrn:         string
  title:       string | null
  status:      'open' | 'closed'
  visitedAt:   string
}

const RECENT_ENC_KEY = 'ok_recent_encounters'

export function getRecentEncounters(): RecentEncounterEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENT_ENC_KEY) ?? '[]') }
  catch { return [] }
}

export function pushRecentEncounter(enc: RecentEncounterEntry) {
  const prev = getRecentEncounters().filter(e => e.encounterId !== enc.encounterId)
  localStorage.setItem(RECENT_ENC_KEY, JSON.stringify([enc, ...prev].slice(0, 20)))
}
