/**
 * Visit data helpers — the logistics layer of patient flow.
 *
 * A visit row tracks one patient passage through the facility. Timestamps
 * carry the lifecycle (scheduled_at → arrived_at → finished_at); `stage` is
 * an optional queue label validated against the org's flow_stages setting.
 */
import { supabase } from './supabase'
import type { Patient, Visit, VisitEncounterRef, VisitReferralRef } from '../types'

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

/** Resolve the joined encounter ref (PostgREST may return object or array). */
export function visitEncounter(v: Visit): VisitEncounterRef | null {
  const raw = v.encounters
  return (Array.isArray(raw) ? raw[0] : raw) ?? null
}

/**
 * Where a referred visit came from: the origin queue's department name,
 * "General" when the origin sat in the default queue, null when the visit
 * isn't a referral at all.
 */
export function referralSourceLabel(v: Pick<Visit, 'referred_from_visit_id' | 'referred_from'>): string | null {
  if (!v.referred_from_visit_id) return null
  const origin: VisitReferralRef | null =
    (Array.isArray(v.referred_from) ? v.referred_from[0] : v.referred_from) ?? null
  if (!origin) return 'General'
  const dept = Array.isArray(origin.departments) ? origin.departments[0] : origin.departments
  return dept?.name ?? 'General'
}

/**
 * All of a day's non-cancelled visits: arrived that day, or booked for it.
 * Finished visits stay included so the front desk sees the whole day.
 * Defaults to today; pass a date for the Front Desk's day navigation.
 */
export async function fetchTodayVisits(date: Date = new Date()): Promise<Visit[]> {
  const { start, end } = dayBoundsIso(date)
  const { data, error } = await supabase
    .from('visits')
    .select('*, patients(*), encounters(id, status), referred_from:visits!referred_from_visit_id(department_id, departments(name))')
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
 * Visits that arrived on a previous day and were never checked out or
 * cancelled — the front desk shows these as a quiet "carried over" section
 * instead of letting them vanish at midnight.
 */
export async function fetchCarriedOverVisits(): Promise<Visit[]> {
  const { start } = dayBoundsIso()
  const { data, error } = await supabase
    .from('visits')
    .select('*, patients(*), encounters(id, status), referred_from:visits!referred_from_visit_id(department_id, departments(name))')
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

export interface CheckInInput {
  patientId: string
  departmentId?: string | null
  assignedTo?: string | null
  reason?: string | null
  /** First configured stage, or null when stage tracking is off */
  stage?: string | null
}

/** Walk-in or front-desk check-in: patient enters the queue now. */
export async function checkInVisit(input: CheckInInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('visits').insert({
    patient_id: input.patientId,
    department_id: input.departmentId ?? null,
    assigned_to: input.assignedTo ?? null,
    reason: input.reason?.trim() || null,
    stage: input.stage ?? null,
    arrived_at: new Date().toISOString(),
  })
  return { error: error ? error.message : null }
}

/** Book a future visit (an appointment is just a visit with scheduled_at). */
export async function bookVisit(
  input: CheckInInput & { scheduledAt: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('visits').insert({
    patient_id: input.patientId,
    department_id: input.departmentId ?? null,
    assigned_to: input.assignedTo ?? null,
    reason: input.reason?.trim() || null,
    scheduled_at: input.scheduledAt,
  })
  return { error: error ? error.message : null }
}

export async function updateVisit(
  id: string,
  patch: Partial<Pick<Visit, 'stage' | 'assigned_to' | 'department_id' | 'reason' | 'encounter_id' | 'arrived_at' | 'finished_at' | 'cancelled_at' | 'scheduled_at'>>,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('visits').update(patch).eq('id', id)
  return { error: error ? error.message : null }
}

/** Booked visit arrives: enters the queue. */
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
 * Average completed time-in-queue today, in whole minutes: arrival →
 * checkout, over finished visits only. Null until at least one visit has
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

/**
 * Average completed wait per local day for the trailing `days` days
 * (oldest → newest, today last). Days without completed visits are null.
 * Feeds the Front Desk's 7-day trend sparkline.
 */
export function dailyAverageWaits(
  visits: Pick<Visit, 'arrived_at' | 'finished_at'>[],
  days: number,
  today: Date = new Date(),
): (number | null)[] {
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const buckets = new Map<string, Pick<Visit, 'arrived_at' | 'finished_at'>[]>()
  for (const v of visits) {
    if (!v.arrived_at || !v.finished_at) continue
    const key = dayKey(new Date(v.finished_at))
    const arr = buckets.get(key) ?? []
    arr.push(v)
    buckets.set(key, arr)
  }
  const out: (number | null)[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push(averageWaitMinutes(buckets.get(dayKey(d)) ?? []))
  }
  return out
}

/**
 * Referral: an order sent to a patient-facing department also queues the
 * patient there. Chains from the patient's active visit; skipped when the
 * patient is already waiting in that department's queue.
 */
export async function createReferralVisit(
  patientId: string,
  departmentId: string,
  stage: string | null,
): Promise<void> {
  const { data: existing } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', patientId)
    .eq('department_id', departmentId)
    .is('finished_at', null)
    .is('cancelled_at', null)
    .not('arrived_at', 'is', null)
    .limit(1)
  if (existing && existing.length > 0) return

  const { start } = dayBoundsIso()
  const { data: from } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', patientId)
    .is('finished_at', null)
    .is('cancelled_at', null)
    .gte('arrived_at', start)
    .order('arrived_at', { ascending: true })
    .limit(1)

  await supabase.from('visits').insert({
    patient_id: patientId,
    department_id: departmentId,
    referred_from_visit_id: from?.[0]?.id ?? null,
    stage,
    arrived_at: new Date().toISOString(),
  })
}

/**
 * Attach a freshly created encounter to the patient's active visit of today,
 * so the queue reflects that clinical work started. No-op when the patient
 * isn't in the queue — encounters never require a visit.
 */
export async function linkEncounterToActiveVisit(
  patientId: string,
  encounterId: string,
): Promise<void> {
  const { start } = dayBoundsIso()
  const { data } = await supabase
    .from('visits')
    .select('id')
    .eq('patient_id', patientId)
    .is('encounter_id', null)
    .is('finished_at', null)
    .is('cancelled_at', null)
    .gte('arrived_at', start)
    .order('arrived_at', { ascending: true })
    .limit(1)
  const visitId = data?.[0]?.id
  if (visitId) await supabase.from('visits').update({ encounter_id: encounterId }).eq('id', visitId)
}
