import type { PatientHit } from '../db/types'
import { useAuth } from '../auth'
// the last patients this browser opened, newest first (a per-viewer convenience, spec 05)
// per login, so the next person at a shared computer never sees the last one's patients; only who, never visits or departments (spec 07)
const RECENT_KEY = () => `opencare.recent_patients:${useAuth.getState().session?.user.id ?? 'none'}`
try { localStorage.removeItem('opencare.recent_patients') } catch { /* the old shared list, which could hold visit details: gone */ }
export type Recent = Pick<PatientHit, 'id' | 'record_number' | 'given_name' | 'family_name' | 'sex' | 'age' | 'died_on' | 'phone_text'>
export const readRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY()) ?? '[]') } catch { return [] } }
const ageOf = (born?: string) => { if (!born) return 0; const [y, m = 1, d = 1] = born.split('-').map(Number); const n = new Date(); return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0) }
export function rememberPatient(p: Recent & { born_on?: string }) {
  p = { id: p.id, record_number: p.record_number, given_name: p.given_name, family_name: p.family_name, sex: p.sex, age: p.age ?? ageOf(p.born_on), died_on: p.died_on, phone_text: p.phone_text }
  try { localStorage.setItem(RECENT_KEY(), JSON.stringify([p, ...readRecent().filter((x) => x.id !== p.id)].slice(0, 6))) } catch { /* no storage */ }
}

