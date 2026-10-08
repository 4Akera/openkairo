// Bookings' reads and writes (spec/openCare.md §5.7), each through the pack's one door (public.pack_op): the free places, the bookings
// a screen lists, the places on a list (the queue's and the bench's: core changes (h), (l), (m)), and booking, cancelling, here and a
// call's answer. Patients' names through the reader, one read each, kept a while. Every list reads again on the clinic's hint.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { packOp, read } from '@core/db/rpc'
import { banner } from '@core/db/views'
import { useLive } from '@core/hooks/live'
import type { Department, Identity, Organization, PatientBanner } from '@core/db/types'

import type { FreeSession, How, Places, Session, State } from './logic'
export { addDays, dayWords, placeWords, timeWords, todayOf, type FreeSession, type How, type Places, type Session, type State } from './logic'

export const KEY = 'bookings'
export interface Free { department: { id: string; name: string; work: string }; sessions: FreeSession[]; today: string; ahead: number }
export interface Booking { id: string; patient_id: string; department_id: string; session_id: string; session: string; how: How; doctor_id: string | null; place_id: string | null
  day: string; starts_at: string; number: number | null; order_item: string | null; service?: string | null; service_id?: string | null; note: string | null; moved_from: string | null; booked_from: string
  booked_in: string | null; author_id: string; at: string; state: State; cancelled: { reason: string; at: string; author_id: string } | null; here: { visit_id: string | null; at: string } | null
  call: { outcome: Outcome; at: string; author_id: string } | null }
export type Outcome = 'confirmed' | 'will_cancel' | 'no_answer' | 'wrong_number'

/** the clinic's hint: any booking, cancel, here or call reads every bookings list again */
export const useBookingsLive = (orgId: string | null | undefined) => useLive(orgId ? `organization:${orgId}` : null, [[KEY]])
/** after a write: every bookings list, and the lists' places, read again (the places' short cache emptied first, so none reads the old) */
export const useBookingsDone = () => { const qc = useQueryClient(); return () => { placesCache.clear(); void qc.invalidateQueries({ queryKey: [KEY] }); void qc.invalidateQueries({ queryKey: ['pack-rows'] }) } }

/** the free places of a department, from a day, for a few days (as this department may book there) */
export const useFree = (from: string, to: string | null, args: { from?: string; days?: number; doctor_id?: string | null; service_id?: string | null }, enabled = true) =>
  useQuery({ queryKey: [KEY, 'free', from, to, args], enabled: enabled && !!to, placeholderData: (p) => p, staleTime: 5_000,
    queryFn: () => packOp<Free>('bookings.free', from, { department_id: to, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v != null)) }) })
export const packFree = (from: string, args: Record<string, unknown>) => packOp<Free>('bookings.free', from, args)
/** the bookings of these departments from a day to a day (at most 14), or a patient's from today */
export const useBookings = (from: string, args: { departments?: string[]; from?: string; to?: string; patient_id?: string }, enabled = true) =>
  useQuery({ queryKey: [KEY, 'list', from, args], enabled, placeholderData: (p) => p, refetchInterval: 30_000,
    queryFn: () => packOp<{ bookings: Booking[]; today: string }>('bookings.list', from, args) })

export const book = (from: string, args: Record<string, unknown>) => packOp<{ id: string; day: string; starts_at: string; number: number | null; session: string; department: string; order: string | null }>('bookings.book', from, args)
export const cancel = (from: string, booking_id: string, reason: string) => packOp('bookings.cancel', from, { booking_id, reason })
export const here = (from: string, booking_id: string, visit_id?: string) => packOp('bookings.here', from, { booking_id, ...(visit_id ? { visit_id } : {}) })
export const call = (from: string, booking_id: string, outcome: Outcome) => packOp('bookings.call', from, { booking_id, outcome })

/** the places on a list, read once a few seconds for the same rows (the queue's place, the words and the view each ask) */
const placesCache = new Map<string, { at: number; p: Promise<Places> }>()
export function places(department: string, visits: string[], orders: string[]): Promise<Places> {
  const k = `${department}|${[...visits].sort().join(',')}|${[...orders].sort().join(',')}`
  const hit = placesCache.get(k); if (hit && Date.now() - hit.at < 3_000) return hit.p
  const p = packOp<Places>('bookings.places', department, { visits, orders }); placesCache.set(k, { at: Date.now(), p })
  if (placesCache.size > 50) for (const key of [...placesCache.keys()].slice(0, 25)) placesCache.delete(key)
  p.catch(() => placesCache.delete(k))
  return p
}

/** patients' names: one reader read each, kept a minute */
export function usePatients(departmentId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort()
  return useQuery({ queryKey: [KEY, 'patients', departmentId, sorted], enabled: sorted.length > 0, staleTime: 60_000, placeholderData: (p) => p,
    queryFn: async (): Promise<Record<string, PatientBanner>> => {
      const out: Record<string, PatientBanner> = {}
      await Promise.all(sorted.map(async (id) => {
        try { const p = await read<{ patient: Identity }>({ shape: 'patient', patient_id: id, department_id: departmentId }); out[id] = banner(p.patient) }
        catch { /* gone (erased): no name */ }
      }))
      return out
    } })
}

// ── a department's settings, as the clinic keeps them ──
/** the sessions a department keeps */
export const sessionsOf = (org: Organization | undefined, departmentId: string): Session[] =>
  ((org?.settings.find((s) => s.key === 'bookings.sessions' && s.thing_id === departmentId)?.data as { sessions?: Session[] } | undefined)?.sessions) ?? []
/** what to tell the patient when booked here: the service's line, else the department's own */
export function tellOf(org: Organization | undefined, departmentId: string, serviceId?: string | null): { en: string; ar?: string } | null {
  const lines = ((org?.settings.find((s) => s.key === 'bookings.tell' && s.thing_id === departmentId)?.data as { lines?: { service_id?: string; en: string; ar?: string }[] } | undefined)?.lines) ?? []
  return lines.find((l) => serviceId && l.service_id === serviceId) ?? lines.find((l) => !l.service_id) ?? null
}
/** the departments a desk (or a clinic, itself) may book into: those that use bookings, it or the ones it checks in for */
export function bookable(org: Organization | undefined, from: Pick<Department, 'id' | 'work' | 'checks_in_for'>): Department[] {
  const all = (org?.allDepartments ?? []).filter((d) => d.packs.includes(KEY) && (d.work === 'visits' || d.work === 'bench'))
  if (from.work !== 'desk') return all.filter((d) => d.id === from.id)
  return all.filter((d) => (from.checks_in_for ?? [null]).some((s) => s === null || s === d.id))
}
export const OUTCOMES: [Outcome, string][] = [['confirmed', 'confirmed'], ['will_cancel', 'will cancel'], ['no_answer', 'no answer'], ['wrong_number', 'wrong number']]
export const REASONS = ['patient asked', 'doctor away', 'clinic closed', 'entered by mistake']
