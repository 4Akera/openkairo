import { useQueries } from '@tanstack/react-query'
import type { Department, PatientHit, QueueRow, VisitStatus } from '../../db/types'
import { useDepartment } from '../../hooks/organization'
import { visitQueueFn } from '../../hooks/reads'
import { minutesSince } from '../../ui'

/** a queue row with the clinic it is in: the desk's lists run across every clinic it serves */
export type ClinicRow = QueueRow & { clinic: Department }

const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
export const ageSex = (age: number, sex: string) => `${age} ${SEX[sex] ?? ''}`.trim()
export const fullName = (p: { given_name: string; family_name: string }) => `${p.given_name} ${p.family_name}`

const VISIT_WORDS: Record<VisitStatus, string> = { waiting: 'waiting', in_consult: 'with a doctor', pending: 'waiting for results', done: 'done', left: 'left', lapsed: 'lapsed', cancelled: 'cancelled', admitted: 'admitted', discharged: 'discharged' }
/** where a found patient is now, in words: "General Practice · waiting", "Medical Ward · away" */
export const whereNow = (v: PatientHit['open_visits'][number]) => `${v.department_name} · ${v.present ? VISIT_WORDS[v.status] ?? v.status : 'away'}`

/** what is happening to a queue row, in words */
export const rowWords = (r: QueueRow) => r.band === 'consult' ? 'with a doctor' : r.band === 'back' ? 'back, results in' : r.band === 'pending' ? 'waiting for results'
  : r.missed_calls > 0 ? `called, not here ×${r.missed_calls}` : 'waiting'
/** minutes waited, counted the way the clinic's own queue counts them */
export const waited = (r: QueueRow) => minutesSince(r.band === 'waiting' ? r.arrived_at : r.present_at)
export const duration = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`

// the clinic this desk last sent someone to: a per-browser convenience, so storage may be missing or blocked
const LAST_KEY = (desk: string) => `opencare.reception.last_clinic:${desk}`
export const readLastClinic = (desk: string): string | null => { try { return localStorage.getItem(LAST_KEY(desk)) } catch { return null } }
export const writeLastClinic = (desk: string, clinicId: string) => { try { localStorage.setItem(LAST_KEY(desk), clinicId) } catch { /* storage blocked */ } }

/** Every served clinic's queue rows, read from the cache that each clinic's line fills with useVisitQueue (which also keeps
 *  them live). This observer never fetches on its own; the query function is the same one so a refetch is always right. */
export function useClinicRows(clinics: Department[]): ClinicRow[] {
  const { dept, org } = useDepartment(); const at = dept?.id ?? null
  return useQueries({
    queries: clinics.map((c) => ({ queryKey: ['visit_queue', c.id, at], queryFn: visitQueueFn(org!, c.id, at!), enabled: false })),
    combine: (rs) => rs.flatMap((r, i) => (r.data?.rows ?? []).map((row: QueueRow) => ({ ...row, clinic: clinics[i] }))),
  })
}
/** how many visits the served clinics finished today, from the same cache */
export function useDoneToday(clinics: Department[]): number {
  const { dept, org } = useDepartment(); const at = dept?.id ?? null
  return useQueries({
    queries: clinics.map((c) => ({ queryKey: ['visit_queue', c.id, at], queryFn: visitQueueFn(org!, c.id, at!), enabled: false })),
    combine: (rs) => rs.reduce((n, r) => n + (r.data?.done_today ?? 0), 0),
  })
}
