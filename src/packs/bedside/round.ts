// The Drug round's views (spec/openCare.md §5.6, piece 3), from the one read of the ward (bedside.round): Due now (a first dose at the
// top, then by time, bed and medicine), Late (the oldest first), As needed, and Given this round (every dose recorded since the round
// opened, the newest first, a dose not given among them); the medicines whose times are not set, and those not prescribed in this stay,
// folded apart and counted in none. Beside each row the last dose given, a fact shown and never a stop. Pure.
import { hm } from '@core/ui/time'
import { drugWords, type DoseRead, type MedicineRead, type RoundRead, type SlotState } from './doses'
import { halfHours, nextTime, type Round } from './schedule'

export type View = 'due' | 'late' | 'prn' | 'given'
export interface RoundRow { key: string; stay: string; patient_id: string; place_id: string | null; med: MedicineRead
  due: string | null; state: SlotState | 'prn' | 'unset' | 'elsewhere' | 'extra'; first: boolean; dose?: DoseRead }
type Order = (placeId: string | null) => number
const at = (iso: string | null | undefined) => iso ? new Date(iso).getTime() : 0
const byBed = (order: Order | undefined) => (a: RoundRow, b: RoundRow) => (order ? order(a.place_id) - order(b.place_id) : 0) || drugWords(a.med).localeCompare(drugWords(b.med))

/** every medicine of every stay, with its stay */
function meds(r: RoundRead) {
  return r.stays.flatMap((s) => s.medicines.map((med) => ({ s, med })))
}
const row = (s: RoundRead['stays'][number], med: MedicineRead, due: string | null, state: RoundRow['state'], first = false, dose?: DoseRead): RoundRow =>
  ({ key: `${s.stay}|${med.medication}|${due ?? state}${dose ? `|${dose.dose}` : ''}`, stay: s.stay, patient_id: s.patient_id, place_id: s.place_id, med, due, state, first, ...(dose ? { dose } : {}) })

/** a view's rows */
export function rowsOf(r: RoundRead, view: View, order?: Order): RoundRow[] {
  const all = meds(r).filter((x) => !x.med.elsewhere)
  if (view === 'due' || view === 'late') {
    const rows = all.flatMap(({ s, med }) => med.slots.filter((x) => x.state === view).map((x) => row(s, med, x.due, x.state, !!x.first)))
    return view === 'late' ? rows.sort((a, b) => at(a.due) - at(b.due) || byBed(order)(a, b))
      : rows.sort((a, b) => Number(b.first) - Number(a.first) || at(a.due) - at(b.due) || byBed(order)(a, b))
  }
  if (view === 'prn') return all.filter(({ med }) => med.prn && med.status === 'active').map(({ s, med }) => row(s, med, null, 'prn')).sort(byBed(order))
  const opens = at(r.opens_at)
  const done = all.flatMap(({ s, med }) => [
    ...med.slots.filter((x) => x.dose && x.at && at(x.at) >= opens).map((x) => row(s, med, x.due, x.state, !!x.first,
      { dose: x.dose!, at: x.at!, by: x.by, status: x.state === 'not_given' ? 'not-done' : 'completed', ...(x.not_given ? { not_given: x.not_given } : {}), ...(x.site ? { site: x.site } : {}) })),
    ...med.extra.filter((x) => at(x.at) >= opens).map((x) => row(s, med, null, 'extra', false, x))])
  return done.sort((a, b) => at(b.dose?.at) - at(a.dose?.at))
}
/** the medicines whose times are not set (none for their timing on this ward), by bed then medicine */
export const unsetOf = (r: RoundRead, order?: Order): RoundRow[] =>
  meds(r).filter(({ med }) => med.unset && med.status === 'active' && !med.elsewhere).map(({ s, med }) => row(s, med, null, 'unset')).sort(byBed(order))
/** the current prescriptions not prescribed in this stay, by bed then medicine */
export const elsewhereOf = (r: RoundRead, order?: Order): RoundRow[] =>
  meds(r).filter(({ med }) => med.elsewhere).map(({ s, med }) => row(s, med, null, 'elsewhere')).sort(byBed(order))
/** each view's count: the unset and the not prescribed here counted in none */
export function countsOf(r: RoundRead): Record<View, number> {
  return { due: rowsOf(r, 'due').length, late: rowsOf(r, 'late').length, prn: rowsOf(r, 'prn').length, given: rowsOf(r, 'given').length }
}

/** the last dose given (a time given, or a dose given with no time), at or before now, from the read's 25 hours; near while within half
 *  the timing's interval (as needed, 4 hours): the fact one-key Give needs beside it, never a stop */
export function lastGiven(m: MedicineRead, now: number): { at: string; by?: string; near: boolean } | null {
  const given = [...m.slots.filter((x) => x.state === 'given' && x.at).map((x) => ({ at: x.at!, by: x.by })),
    ...m.extra.filter((x) => x.status !== 'not-done' && x.at).map((x) => ({ at: x.at, by: x.by }))].filter((x) => at(x.at) <= now)
  if (!given.length) return null
  const last = given.reduce((a, b) => at(b.at) > at(a.at) ? b : a)
  const half = m.prn ? 4 : halfHours(m.timing)
  return { at: last.at, ...(last.by ? { by: last.by } : {}), near: now - at(last.at) < half * 3_600_000 }
}
/** a medicine's time due now ("14:00"), for its late row */
export function nowDue(m: MedicineRead): string | null {
  const d = m.slots.find((x) => x.state === 'due')
  return d ? hm(d.due) : null
}
/** the search box: bed, name or medicine, case aside */
export function matches(row: RoundRow, q: string, words: { bed: (placeId: string | null) => string; name: (patientId: string) => string }): boolean {
  const f = q.trim().toLowerCase(); if (!f) return true
  return [words.bed(row.place_id), words.name(row.patient_id), drugWords(row.med)].some((w) => w.toLowerCase().includes(f))
}
/** "14:00 round · now 14:06"; no round yet: "now 14:06" */
export const roundWords = (r: RoundRead) => r.round_at ? `${hm(r.round_at)} round · now ${hm(r.now)}` : `now ${hm(r.now)}`
/** the next ward time after now, "18:00" */
export function nextRound(round: Round, now: number, zone: string): string | null {
  const t = nextTime(round, now, zone)
  return t === null ? null : hm(new Date(t).toISOString())
}

