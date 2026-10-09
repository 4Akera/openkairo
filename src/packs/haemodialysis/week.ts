// The Schedule tab's model (spec/openCare.md §5.6): the week as the pack's op haemodialysis.week reads it — the standing slots live on any
// of its six days (Saturday … Thursday), the sessions moved from or to them, each patient's isolation — drawn one shift at a time, a row
// a chair, a column a day. Each cell is a move into the chair that day ("this week only"), else the chair's slot that day (struck through,
// "moved to Thu", when a move takes it away), else "kept for HBV" for a kept chair, else free. A patient in a chair that does not fit
// their HBV or HCV isolation is shown, never stopped. Pure: npm run test:haemodialysis.
import type { PatientBanner, Place } from '@core/db/types'
import { DAYS, dayWord, onDay, weekDays, type Days } from './days'
import { chairWarning, keptFor, type Unit } from './unit'

export interface Slot { id: string; patient_id: string; days: Days; shift: number; place_id: string; starts_on: string; ends_on?: string; note?: string }
export interface Move { id: string; patient_id: string; slot_id?: string; from_on?: string; to_on?: string; shift?: number; place_id?: string; reason: string }
export interface Week { from: string; to: string; today: string; patient_ids: string[]; isolation: Record<string, string[]>; slots: Slot[]; moves: Move[] }

const str = (x: unknown) => typeof x === 'string' && x ? x : undefined
const num = (x: unknown) => typeof x === 'number' ? x : typeof x === 'string' && x ? Number(x) : NaN
const strs = (x: unknown) => Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []
const isDays = (x: unknown): x is Days => DAYS.some(([d]) => d === x)
const obj = (x: unknown): Record<string, unknown> | null => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null

/** the op's answer, read defensively: a slot or a move without what it needs is passed over */
export function weekOfData(data: unknown): Week | null {
  const d = obj(data)
  if (!d || !str(d.from) || !Array.isArray(d.slots) || !Array.isArray(d.moves)) return null
  const slots = d.slots.flatMap((x): Slot[] => {
    const s = obj(x); const shift = num(s?.shift)
    if (!s || !str(s.id) || !str(s.patient_id) || !isDays(s.days) || !Number.isInteger(shift) || !str(s.place_id) || !str(s.starts_on)) return []
    return [{ id: s.id as string, patient_id: s.patient_id as string, days: s.days, shift, place_id: s.place_id as string, starts_on: s.starts_on as string,
      ...(str(s.ends_on) ? { ends_on: s.ends_on as string } : {}), ...(str(s.note) ? { note: s.note as string } : {}) }]
  })
  const moves = d.moves.flatMap((x): Move[] => {
    const m = obj(x)
    if (!m || !str(m.id) || !str(m.patient_id) || (!str(m.from_on) && !str(m.to_on))) return []
    const shift = num(m.shift)
    return [{ id: m.id as string, patient_id: m.patient_id as string, reason: str(m.reason) ?? '', ...(str(m.slot_id) ? { slot_id: m.slot_id as string } : {}),
      ...(str(m.from_on) ? { from_on: m.from_on as string } : {}), ...(str(m.to_on) ? { to_on: m.to_on as string } : {}),
      ...(Number.isInteger(shift) ? { shift } : {}), ...(str(m.place_id) ? { place_id: m.place_id as string } : {}) }]
  })
  const iso: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(obj(d.isolation) ?? {})) iso[k] = strs(v)
  const from = d.from as string
  return { from, to: str(d.to) ?? weekDays(from)[5], today: str(d.today) ?? '', patient_ids: strs(d.patient_ids), isolation: iso, slots, moves }
}

export type Cell = { kind: 'slot'; slot: Slot; warn: string | null } | { kind: 'away'; slot: Slot; move: Move } | { kind: 'in'; move: Move; warn: string | null }
  | { kind: 'free' } | { kind: 'kept'; kept: 'hbv' | 'hcv' }
/** someone in the chair that day and shift: a move in, else its slot (moved away or not); none: null */
type Held = { kind: 'in'; move: Move } | { kind: 'slot'; slot: Slot } | { kind: 'away'; slot: Slot; move: Move } | null

const live = (s: Slot, on: string) => s.starts_on <= on && (!s.ends_on || on <= s.ends_on) && onDay(s.days, on)
function held(week: Week, chairId: string, on: string, shift: number): Held {
  const move = week.moves.find((m) => m.to_on === on && m.shift === shift && m.place_id === chairId)
  if (move) return { kind: 'in', move }
  const slot = week.slots.find((s) => s.place_id === chairId && s.shift === shift && live(s, on))
  if (!slot) return null
  const away = week.moves.find((m) => m.slot_id === slot.id && m.from_on === on)
  return away ? { kind: 'away', slot, move: away } : { kind: 'slot', slot }
}

/** the shift's table: a row a chair, a cell a day of the week (Saturday … Thursday) */
export function grid(week: Week, shift: number, chairs: Place[], u: Pick<Unit, 'hbv' | 'hcv'>): { chair: Place; cells: { on: string; cell: Cell }[] }[] {
  const days = weekDays(week.from)
  return chairs.map((chair) => {
    const kept = keptFor(chair, u)
    const warn = (pid: string) => chairWarning(week.isolation[pid] ?? [], kept, chair.name)
    return { chair, cells: days.map((on): { on: string; cell: Cell } => {
      const h = held(week, chair.id, on, shift)
      const cell: Cell = h?.kind === 'in' ? { kind: 'in', move: h.move, warn: warn(h.move.patient_id) }
        : h?.kind === 'slot' ? { kind: 'slot', slot: h.slot, warn: warn(h.slot.patient_id) }
        : h?.kind === 'away' ? h
        : kept ? { kind: 'kept', kept } : { kind: 'free' }
      return { on, cell }
    }) }
  })
}

/** a session moved away, in its old cell: 'moved to Thu', or 'off this day' */
export const awayWords = (m: Pick<Move, 'to_on'>) => m.to_on ? `moved to ${dayWord(m.to_on)}` : 'off this day'
/** a session moved in, in its new cell */
export const inWords = 'this week only'

/** someone sits in that chair that day and shift (a slot not moved away, or a move in), as far as the week read says */
export function taken(week: Week, chair: Pick<Place, 'id'> | string, on: string, shift: number): boolean {
  const h = held(week, typeof chair === 'string' ? chair : chair.id, on, shift)
  return h?.kind === 'slot' || h?.kind === 'in'
}
/** a new slot of that chair, pattern and shift from a day would be refused chair_taken, as far as the week read says (the server checks the
 *  rest): a slot there on the same pattern and shift not ended before that day (one ended the day before it started was never used), or a
 *  session moved into the chair at that shift on a day of the pattern from that day on */
export const patternTaken = (week: Week, chairId: string, days: Days, shift: number, from = week.from) =>
  week.slots.some((s) => s.place_id === chairId && s.days === days && s.shift === shift && (!s.ends_on || (s.ends_on >= from && s.ends_on >= s.starts_on)))
  || week.moves.some((m) => m.place_id === chairId && m.shift === shift && !!m.to_on && m.to_on >= from && onDay(days, m.to_on))

/** undoing a move brings the session back to its slot's chair and shift on the day it left: refused when another session was moved into
 *  that chair then (chair_taken) or the patient comes that day by another move (already_due), as far as the week read says (the server
 *  checks the rest); else null */
export function undoBlocked(week: Week, move: Move): 'chair_taken' | 'already_due' | null {
  const slot = move.slot_id && move.from_on ? week.slots.find((s) => s.id === move.slot_id) : undefined
  if (!slot) return null
  const there = week.moves.filter((m) => m.id !== move.id && m.to_on === move.from_on)
  if (there.some((m) => m.shift === slot.shift && m.place_id === slot.place_id)) return 'chair_taken'
  return there.some((m) => m.patient_id === move.patient_id) ? 'already_due' : null
}

/** the week's sessions over every shift: each slot on its live days not moved away, and each move into one of the six days */
export function slotCount(week: Week): number {
  const days = weekDays(week.from)
  const slots = week.slots.reduce((n, s) => n + days.filter((on) => live(s, on) && !week.moves.some((m) => m.slot_id === s.id && m.from_on === on)).length, 0)
  return slots + week.moves.filter((m) => m.to_on && days.includes(m.to_on)).length
}
/** a patient's name in a cell */
export const nameOf = (p: Pick<PatientBanner, 'given_name' | 'family_name'> | undefined) => p ? `${p.given_name} ${p.family_name}` : 'Patient'
