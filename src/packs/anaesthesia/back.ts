// Recovery's leaving (spec/openCare.md §5.8, Q48; Recovery's picture): back to the ward is the stay passing on (beds Q3, the
// base's pass: one Done ends the Recovery stay and opens the ward's about it), not a discharge and a new admission; a day case goes home
// from the same card. /back drafts it in the bay's stay; its card says where the patient came from (the stay Recovery's came from, its ward and
// bed, preset) and the latest Aldrete (under 9 a notice, never a stop: the nurse decides); Sign writes one set through the pack's save
// (backsave.ts, the core's (k) path): the base's discharged on the Recovery stay (disposition oth, "to <ward>"; home: home) and, for a
// ward, the base's admitted about that stay, its bed or none (the ward chooses), admit source other. Chosen by Claude at the owner's
// request, 2026-10-10: the picture draws this inside the base's Discharge, which has no door for a pack's card, so it is the pack's
// command in the bay's stay (as Emergency's Where to is its own). Pure: npm run test:anaesthesia.
import { move, newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { Department, Place, PresenceRow } from '@core/db/types'
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'

export const BACK = 'anaesthesia.back'
export type BackTo = 'ward' | 'home'
/** the draft: where to; a ward's department and its name; the bed (null: the ward chooses) and its name; the department and bed the
 *  patient came from, as the card read them (preset once) */
export interface BackParams { to: BackTo; department_id?: string; department?: string; place_id?: string | null; place?: string; came?: { department_id: string; place_id: string | null } | null }

/** where Recovery may send a patient back to: every other department of stays here, by name */
export const wardsFor = (departments: readonly Pick<Department, 'id' | 'name' | 'work'>[], here: string) =>
  departments.filter((d) => d.work === 'stays' && d.id !== here).sort((a, b) => a.name.localeCompare(b.name))
/** a department's free beds: its places not closed that no admitted stay holds, in order */
export const freeBeds = (places: readonly Place[], departmentId: string, taken: readonly Pick<PresenceRow, 'place_id' | 'state'>[]) => {
  const held = new Set(taken.filter((r) => r.state === 'admitted' && r.place_id).map((r) => r.place_id!))
  return places.filter((p) => p.department_id === departmentId && !p.closed && !held.has(p.id)).sort((a, b) => a.position - b.position)
}

/** "Back to Medical Ward · Bed 6", "Back to Medical Ward · the ward chooses", "Back to a ward: choose it", "Home from Recovery" */
export function backLine(q: Partial<BackParams>): string {
  if (q.to === 'home') return 'Home from Recovery'
  if (!q.department_id) return 'Back to a ward: choose it'
  return `Back to ${q.department ?? 'the ward'} · ${q.place_id ? q.place ?? 'a bed' : 'the ward chooses'}`
}
const draft = (q: BackParams): Parsed => ({ function: BACK, kind: 'Back to the ward', action: 'write:discharged', params: q as unknown as Record<string, unknown>, line: backLine(q) })
/** /back alone: where the patient came from (the card presets it); /back home: a day case; /back <words>: the ward whose name holds them */
export function parseBack(rest: string, ctx: Pick<Ctx, 'departments' | 'departmentId'>): Result {
  const w = rest.trim().toLowerCase()
  if (!w) return { ok: [draft({ to: 'ward' })] }
  if (w === 'home') return { ok: [draft({ to: 'home' })] }
  const hits = ctx.departments.filter((d) => d.id !== ctx.departmentId && d.name.toLowerCase().includes(w))
  if (hits.length === 1) return { ok: [draft({ to: 'ward', department_id: hits[0].id, department: hits[0].name })] }
  return { error: hits.length ? `"${rest.trim()}" fits ${hits.map((d) => d.name).join(', ')}: type more of its name` : 'Back to the ward: /back, /back home, or /back and the ward’s name' }
}

/** the latest Aldrete in this stay under 9: a notice, never a stop */
export const aldreteNotice = (aldrete: number | null | undefined) => aldrete == null ? 'No Aldrete yet in this bay: the nurse decides'
  : aldrete < 9 ? `Aldrete ${aldrete}, under 9: the nurse decides` : null

type Stay = Pick<PresenceRow, 'item' | 'patient_id' | 'latest_entry' | 'reason'>
/** the one set: the base's discharged on the Recovery stay and, for a ward, the next department's admitted about it (the base's pass, Q3) */
export function backEntries(q: BackParams, stay: Stay, here: string): EntryIn[] {
  const v = { id: stay.item, patient_id: stay.patient_id, latest_entry: stay.latest_entry }
  if (q.to === 'home') return [move('discharged', v, here, { disposition: 'home' })]
  if (!q.department_id) throw new Error('Choose the ward the patient goes back to')
  if (q.department_id === here) throw new Error('Back to another department, not Recovery')
  const n = newId()
  return [move('discharged', v, here, { disposition: 'oth', note: `to ${q.department ?? 'the ward'}` }),
    { id: n, type: 'admitted', patient_id: stay.patient_id, department_id: here, visit_id: n, refers_to: stay.item, relation: 'about',
      data: { department_id: q.department_id, ...(q.place_id ? { place_id: q.place_id } : {}), admit_source: 'other', ...(stay.reason ? { reason: stay.reason } : {}) } as EntryData['admitted'] }]
}
