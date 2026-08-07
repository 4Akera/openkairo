/**
 * Visit data helpers — the logistics layer of patient flow.
 *
 * A visit row tracks one patient passage through the facility. Timestamps
 * carry the lifecycle (scheduled_at → arrived_at → finished_at); `stage` is
 * an optional queue label validated against the org's flow_stages setting.
 */
import { supabase } from './supabase'
import type { Patient, Visit, VisitEncounterRef } from '../types'

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
 * All of today's non-cancelled visits: arrived today, or booked for today.
 * Finished visits stay included so the front desk sees the whole day.
 */
export async function fetchTodayVisits(): Promise<Visit[]> {
  const { start, end } = dayBoundsIso()
  const { data, error } = await supabase
    .from('visits')
    .select('*, patients(*), encounters(id, status)')
    .is('cancelled_at', null)
    .or(`arrived_at.gte.${start},and(scheduled_at.gte.${start},scheduled_at.lt.${end})`)
    .order('arrived_at', { ascending: true, nullsFirst: false })
  if (error || !data) return []
  return data as Visit[]
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
