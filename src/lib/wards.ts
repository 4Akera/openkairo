/**
 * Wards — admission is a PHASE of the same encounter, never a separate
 * inpatient record. A ward is a department with kind='ward' (explicit
 * discriminator); `ward_id` set + `finished_at` null = in a bed. Beds are
 * free text; capacity is optional census garnish ("4 / 12").
 *
 * Pure helpers stay Supabase-free so they can be unit-tested.
 */
import { supabase } from './supabase'
import type { Department, Visit } from '../types'

/** "Day n" of an admission: day 1 on the admission day itself. */
export function admissionDayN(admittedAtIso: string, nowMs: number): number {
  const ms = nowMs - new Date(admittedAtIso).getTime()
  if (ms < 0) return 1
  return Math.floor(ms / 86_400_000) + 1
}

/** "4 / 12" when the ward declares capacity, plain "4" otherwise. */
export function occupancyLabel(count: number, capacity: number | null | undefined): string {
  return capacity ? `${count} / ${capacity}` : `${count}`
}

/** Census rows grouped by ward, in ward sort order; longest-stay first. */
export function groupCensus<T extends Pick<Visit, 'ward_id' | 'admitted_at'>>(
  wards: Department[],
  rows: T[],
): { ward: Department; rows: T[] }[] {
  return wards.map(ward => ({
    ward,
    rows: rows
      .filter(r => r.ward_id === ward.id)
      .sort((a, b) => (a.admitted_at ?? '').localeCompare(b.admitted_at ?? '')),
  }))
}

/** Active wards, in Settings order. */
export async function fetchWards(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('kind', 'ward')
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    console.error('fetchWards failed:', error.message)
    return []
  }
  return (data ?? []) as Department[]
}

/** The census: open admitted encounters with their patient rows. */
export async function fetchCensus(): Promise<Visit[]> {
  const { data, error } = await supabase
    .from('encounters')
    .select('*, patients(*)')
    .not('ward_id', 'is', null)
    .is('finished_at', null)
    .is('cancelled_at', null)
    .order('admitted_at', { ascending: true })
  if (error) {
    console.error('fetchCensus failed:', error.message)
    return []
  }
  return (data ?? []) as Visit[]
}

/**
 * Admit: stamps the ward phase onto the encounter. An encounter admitted
 * from the queue already arrived; a direct admission gets arrived_at now
 * so stay math has a start.
 */
export async function admitEncounter(
  encounterId: string,
  wardId: string,
  bed: string | null,
  alreadyArrived: boolean,
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {
    ward_id: wardId,
    admitted_at: new Date().toISOString(),
    bed: bed?.trim() || null,
  }
  if (!alreadyArrived) patch.arrived_at = new Date().toISOString()
  const { error } = await supabase.from('encounters').update(patch).eq('id', encounterId)
  return { error: error ? error.message : null }
}

/**
 * Discharge = the ONE ending, ward flavor: ends the journey and closes the
 * record unless orders are still in flight (then the record stays open and
 * waits in Loose ends, same as the queue's Done).
 */
export async function dischargeEncounter(
  encounterId: string,
): Promise<{ error: string | null; recordClosed: boolean }> {
  const { count } = await supabase
    .from('block_actions')
    .select('id', { count: 'exact', head: true })
    .eq('encounter_id', encounterId)
    .in('status', ['pending', 'submitted', 'acknowledged', 'in_progress'])
  const ordersInFlight = (count ?? 0) > 0

  const patch: Record<string, unknown> = { finished_at: new Date().toISOString() }
  if (!ordersInFlight) {
    patch.status = 'closed'
    patch.closed_at = new Date().toISOString()
  }
  const { error } = await supabase.from('encounters').update(patch).eq('id', encounterId)
  return { error: error ? error.message : null, recordClosed: !ordersInFlight && !error }
}
