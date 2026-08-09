/**
 * Journey data helpers — the logistics side of ENCOUNTERS.
 *
 * Ground-up restructure: the encounter is the one event object. It carries
 * the clinical record (blocks) AND the journey — scheduled_at set = booked,
 * arrived_at set = in queue, finished_at set = checked out; `stage` is an
 * optional queue label validated against the org's flow_stages setting;
 * department_id is which queue it sits in (null = the general queue).
 * The legacy `visits` table is frozen and no longer read.
 */
import { supabase } from './supabase'
import type { Patient, Visit, VisitReferralRef } from '../types'

// departments must be hinted: encounters carries TWO FKs to departments
// (department_id + ward_id since the wards DDL), so a bare embed is ambiguous.
const JOURNEY_SELECT =
  '*, patients(*), referred_from:encounters!referred_from_encounter_id(department_id, departments!department_id(name))'

export function dayBoundsIso(date = new Date()): { start: string; end: string } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Resolve the joined patient row (PostgREST may return object or array). */
export function visitPatient(v: Visit): Patient | null {
  const raw = v.patients
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
}

/**
 * Where a referred encounter came from: the origin queue's department name,
 * "General" when the origin sat in the default queue, null when it isn't a
 * referral at all.
 */
export function referralSourceLabel(v: Pick<Visit, 'referred_from_encounter_id' | 'referred_from'>): string | null {
  if (!v.referred_from_encounter_id) return null
  const origin: VisitReferralRef | null =
    (Array.isArray(v.referred_from) ? v.referred_from[0] : v.referred_from) ?? null
  if (!origin) return 'General'
  const dept = Array.isArray(origin.departments) ? origin.departments[0] : origin.departments
  return dept?.name ?? 'General'
}

/**
 * All of a day's journey encounters: arrived that day, or booked for it.
 * Finished ones stay included so the front desk sees the whole day.
 */
export async function fetchTodayVisits(date: Date = new Date()): Promise<Visit[]> {
  const { start, end } = dayBoundsIso(date)
  const { data, error } = await supabase
    .from('encounters')
    .select(JOURNEY_SELECT)
    .is('cancelled_at', null)
    .or(`arrived_at.gte.${start},and(scheduled_at.gte.${start},scheduled_at.lt.${end})`)
    .order('arrived_at', { ascending: true, nullsFirst: false })
  if (error) {
    console.error('fetchTodayVisits failed:', error.message)
    return []
  }
  return (data ?? []) as Visit[]
}

/**
 * Encounters that arrived on a previous day and were never checked out or
 * cancelled — the front desk shows these as a quiet "carried over" section
 * instead of letting them vanish at midnight.
 */
export async function fetchCarriedOverVisits(): Promise<Visit[]> {
  const { start } = dayBoundsIso()
  const { data, error } = await supabase
    .from('encounters')
    .select(JOURNEY_SELECT)
    .is('cancelled_at', null)
    .is('finished_at', null)
    .not('arrived_at', 'is', null)
    .lt('arrived_at', start)
    .order('arrived_at', { ascending: true })
    .limit(30)
  if (error) {
    console.error('fetchCarriedOverVisits failed:', error.message)
    return []
  }
  return (data ?? []) as Visit[]
}

/**
 * Average completed time-in-clinic today, in whole minutes: arrival →
 * checkout, over finished encounters only. Null until at least one has
 * completed the full cycle (an in-progress wait would skew low).
 */
export function averageWaitMinutes(visits: Pick<Visit, 'arrived_at' | 'finished_at'>[]): number | null {
  const done = visits.filter(v => v.arrived_at && v.finished_at)
  if (done.length === 0) return null
  const totalMs = done.reduce(
    (sum, v) => sum + (new Date(v.finished_at!).getTime() - new Date(v.arrived_at!).getTime()),
    0,
  )
  return Math.max(0, Math.round(totalMs / done.length / 60000))
}

export interface CheckInInput {
  patientId: string
  departmentId?: string | null
  assignedTo?: string | null
  reason?: string | null
  /** First configured stage, or null when stage tracking is off */
  stage?: string | null
}

/**
 * Walk-in or front-desk check-in: creates the encounter in the queue.
 * Visibility defaults to staff so the desk and clinicians all see the day.
 */
export async function checkInVisit(input: CheckInInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('encounters').insert({
    patient_id: input.patientId,
    status: 'open',
    visibility: 'staff',
    visible_to_roles: [],
    department_id: input.departmentId ?? null,
    assigned_to: input.assignedTo ?? null,
    reason: input.reason?.trim() || null,
    stage: input.stage ?? null,
    arrived_at: new Date().toISOString(),
  })
  return { error: error ? error.message : null }
}

/** Book a future visit (an appointment is an encounter with scheduled_at). */
export async function bookVisit(
  input: CheckInInput & { scheduledAt: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('encounters').insert({
    patient_id: input.patientId,
    status: 'open',
    visibility: 'staff',
    visible_to_roles: [],
    department_id: input.departmentId ?? null,
    assigned_to: input.assignedTo ?? null,
    reason: input.reason?.trim() || null,
    scheduled_at: input.scheduledAt,
  })
  return { error: error ? error.message : null }
}

export async function updateVisit(
  id: string,
  patch: Partial<Pick<Visit, 'stage' | 'assigned_to' | 'department_id' | 'reason' | 'arrived_at' | 'finished_at' | 'cancelled_at' | 'scheduled_at'>>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('encounters').update(patch).eq('id', id)
  return { error: error ? error.message : null }
}

/** Booked encounter arrives: enters the queue. */
export function arriveVisit(id: string, stage: string | null) {
  return updateVisit(id, { arrived_at: new Date().toISOString(), stage })
}

/** Checkout: the patient has left. */
export function finishVisit(id: string) {
  return updateVisit(id, { finished_at: new Date().toISOString() })
}

/** Cancel a booking / remove a queue entry (no-show, mistake). */
export function cancelVisit(id: string) {
  return updateVisit(id, { cancelled_at: new Date().toISOString() })
}

/**
 * Referral: an order sent to a patient-facing department also queues the
 * patient there — as a fresh encounter chained to the origin. Skipped when
 * the patient is already waiting in that department's queue.
 */
export async function createReferralVisit(
  patientId: string,
  departmentId: string,
  stage: string | null,
  originEncounterId?: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from('encounters')
    .select('id')
    .eq('patient_id', patientId)
    .eq('department_id', departmentId)
    .is('finished_at', null)
    .is('cancelled_at', null)
    .not('arrived_at', 'is', null)
    .limit(1)
  if (existing && existing.length > 0) return

  await supabase.from('encounters').insert({
    patient_id: patientId,
    status: 'open',
    visibility: 'staff',
    visible_to_roles: [],
    department_id: departmentId,
    referred_from_encounter_id: originEncounterId ?? null,
    stage,
    arrived_at: new Date().toISOString(),
  })
}

/**
 * Escalation for the queue's waited label — the front desk's core signal.
 * Quiet under 30 minutes, 'long' from 30, 'critical' from an hour.
 */
export function waitSeverity(arrivedAtIso: string, nowMs: number): 'ok' | 'long' | 'critical' {
  const mins = (nowMs - new Date(arrivedAtIso).getTime()) / 60000
  if (mins >= 60) return 'critical'
  if (mins >= 30) return 'long'
  return 'ok'
}

/**
 * A booking can be arrived only on its own day — never early (the existing
 * rule) and never from a stale past-day view, where tapping Arrived would
 * start a wait clock today against a visit dated last week.
 */
export function isArrivableBooking(
  v: Pick<Visit, 'arrived_at' | 'scheduled_at'>,
  date: Date = new Date(),
): boolean {
  if (v.arrived_at || !v.scheduled_at) return false
  const { start, end } = dayBoundsIso(date)
  return v.scheduled_at >= start && v.scheduled_at < end
}

/** Carried-over journeys auto-finish after this many days — the patient
 * obviously left; only the JOURNEY closes, never the clinical record. */
export const AUTO_FINISH_AFTER_DAYS = 3

/** A booking whose day has fully passed without an arrival — a no-show. */
export function isNoShowBooking(
  v: Pick<Visit, 'scheduled_at' | 'arrived_at' | 'cancelled_at'>,
  todayStartIso: string,
): boolean {
  return !!v.scheduled_at && !v.arrived_at && !v.cancelled_at && v.scheduled_at < todayStartIso
}

/** Arrived long enough ago that the visit is plainly over. */
export function isStaleCarriedOver(arrivedAtIso: string, nowMs: number): boolean {
  return nowMs - new Date(arrivedAtIso).getTime() >= AUTO_FINISH_AFTER_DAYS * 86_400_000
}

/**
 * End-of-day hygiene, run idempotently when Today loads: cancel yesterday's
 * never-arrived bookings (no-shows) and finish journeys carried over for
 * 3+ days. Clinical status is never touched — an open note stays the
 * clinician's loose end. RLS silently skips rows the caller can't update.
 */
export async function sweepStaleJourneys(): Promise<{ noShows: number; autoFinished: number }> {
  const { start } = dayBoundsIso()
  const nowIso = new Date().toISOString()
  const finishCutoff = new Date(Date.now() - AUTO_FINISH_AFTER_DAYS * 86_400_000).toISOString()
  const [noShowRes, finishRes] = await Promise.all([
    supabase
      .from('encounters')
      .update({ cancelled_at: nowIso })
      .is('arrived_at', null)
      .is('cancelled_at', null)
      .not('scheduled_at', 'is', null)
      .lt('scheduled_at', start)
      .select('id'),
    supabase
      .from('encounters')
      .update({ finished_at: nowIso })
      .is('finished_at', null)
      .is('cancelled_at', null)
      .not('arrived_at', 'is', null)
      .lt('arrived_at', finishCutoff)
      .select('id'),
  ])
  return {
    noShows: noShowRes.data?.length ?? 0,
    autoFinished: finishRes.data?.length ?? 0,
  }
}
