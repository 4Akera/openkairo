import type { PatientHit } from '../db/types'
// the last patients this browser opened, newest first (a per-viewer convenience, spec 05)
const RECENT_KEY = 'opencare.recent_patients'
export type Recent = Pick<PatientHit, 'id' | 'record_number' | 'given_name' | 'family_name' | 'sex' | 'age' | 'died_on' | 'phone_text'>
export const readRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] } }
const ageOf = (born?: string) => { if (!born) return 0; const [y, m = 1, d = 1] = born.split('-').map(Number); const n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0) }
export function rememberPatient(p: Recent & { born_on?: string }) {
  p = { ...p, age: p.age ?? ageOf(p.born_on) }
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([p, ...readRecent().filter((x) => x.id !== p.id)].slice(0, 6))) } catch { /* no storage */ }
}

