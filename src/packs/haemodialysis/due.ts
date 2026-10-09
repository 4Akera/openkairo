// Who is due now (spec/openCare.md §5.6), the rows under the board (the clinics' C5): the pack's op haemodialysis.due reads them from the
// standing schedule and its one-off moves — today's shift on now and every earlier one, the next within the hour — less whoever has a
// session today or a stay here. Each row says the scheduled chair, "due 11:30" (amber from 30 minutes late), HBV or HCV, a chair that
// does not fit, a session moved here for today, the last session's day, and a stay in another department. Start is C5's admission into a
// chair with the session begun in the same set; Missed records the session not done ("Did not come"). Pure: npm run test:haemodialysis.
import { newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { PatientBanner, Place, ServerEntry } from '@core/db/types'
import type { BoardRow } from '@core/screens/ward/rows'
import type { TileWord } from '@core/screens/ward/tiles'
import { dayWord, daysBetween } from './days'
import { chairWarning, keptFor, type Unit } from './unit'

export interface DueRow { patient_id: string; slot_id?: string; move_id?: string; on: string; shift: number; starts?: string; starts_at?: string; place_id: string; hours: number
  isolation: string[]; last_on?: string; elsewhere?: string }
export interface Due { on: string; shift: number; patient_ids: string[]; rows: DueRow[] }

const str = (x: unknown) => typeof x === 'string' && x ? x : undefined
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** the op's answer, read defensively: a row without its patient, day, shift or chair is passed over */
export function dueOf(data: unknown): Due | null {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { rows?: unknown }).rows)) return null
  const d = data as Record<string, unknown>
  const rows = (d.rows as Record<string, unknown>[]).flatMap((r): DueRow[] => {
    if (!r || typeof r !== 'object' || !str(r.patient_id) || !str(r.on) || typeof r.shift !== 'number' || !str(r.place_id)) return []
    const iso = Array.isArray(r.isolation) ? r.isolation.filter((x): x is string => typeof x === 'string') : []
    return [{ patient_id: r.patient_id as string, slot_id: str(r.slot_id), move_id: str(r.move_id), on: r.on as string, shift: r.shift, starts: str(r.starts), starts_at: str(r.starts_at),
      place_id: r.place_id as string, hours: typeof r.hours === 'number' ? r.hours : Number(r.hours) || 4, isolation: iso, last_on: str(r.last_on), elsewhere: str(r.elsewhere) }]
  })
  const ids = Array.isArray(d.patient_ids) ? d.patient_ids.filter((x): x is string => typeof x === 'string') : rows.map((r) => r.patient_id)
  return { on: str(d.on) ?? rows[0]?.on ?? '', shift: typeof d.shift === 'number' ? d.shift : 0, patient_ids: ids, rows }
}

/** a row's key: what Start and Missed write from (C5 hands the pack only its row) */
export const keyOf = (r: Pick<DueRow, 'on' | 'shift' | 'place_id' | 'slot_id' | 'move_id' | 'hours'>) => [r.on, r.shift, r.place_id, r.slot_id ?? '', r.move_id ?? '', r.hours].join('|')
export interface FromKey { on: string; shift: number; chair: string; slot?: string; move?: string; hours: number }
export function fromKey(key: string): FromKey | null {
  const p = key.split('|'); if (p.length !== 6) return null
  const [on, shift, chair, slot, move, hours] = p; const n = Number(shift); const h = Number(hours)
  if (!DAY.test(on) || !Number.isInteger(n) || n < 1 || n > 4 || !chair || !Number.isFinite(h) || h < 0.5 || h > 8) return null
  return { on, shift: n, chair, ...(slot ? { slot } : {}), ...(move ? { move } : {}), hours: h }
}

const LATE_MIN = 30
/** the row's words, in order: the chair, when it is due, the isolation, a chair that does not fit, a move, the last session, a stay elsewhere */
export function dueWords(r: DueRow, chair: Pick<Place, 'name'> | undefined, u: Pick<Unit, 'shifts' | 'hbv' | 'hcv'>, now: number): (string | TileWord)[] {
  const out: (string | TileWord)[] = []
  if (chair?.name) out.push(chair.name)
  const starts = r.starts ?? u.shifts[r.shift - 1]
  if (starts) {
    const late = r.starts_at ? now - Date.parse(r.starts_at) >= LATE_MIN * 60_000 : false
    out.push(late ? { text: `due ${starts}`, tone: 'warn' } : `due ${starts}`)
  }
  for (const k of ['hbv', 'hcv']) if (r.isolation.includes(k)) out.push({ text: k.toUpperCase(), tone: 'info' })
  const warn = chair?.name ? chairWarning(r.isolation, keptFor(chair, u), chair.name) : null
  if (warn) out.push({ text: warn, tone: 'warn' })
  if (r.move_id) out.push('moved here for today')
  if (r.last_on) { const n = daysBetween(r.last_on, r.on); out.push(n <= 6 ? `last session ${dayWord(r.last_on)}` : `last session ${n} days ago`) }
  else out.push('first session here')
  if (r.elsewhere) out.push({ text: `in ${r.elsewhere}`, tone: 'warn' })
  return out
}
/** C5's row: who, the words, the minutes from the shift's start, the stay's reason once started */
export function boardRow(r: DueRow, who: PatientBanner | undefined, chair: Pick<Place, 'name'> | undefined, u: Pick<Unit, 'shifts' | 'hbv' | 'hcv'>, now: number): BoardRow {
  return { key: keyOf(r), patientId: r.patient_id, number: who?.record_number ?? null, name: who ? `${who.given_name} ${who.family_name}` : 'Patient',
    sexAge: who ? `${who.sex[0]?.toUpperCase() ?? ''} ${who.age}`.trim() : '', words: dueWords(r, chair, u, now), since: r.starts_at ?? null, reason: 'Haemodialysis' }
}
/** by shift, then the chair's place on the board */
export function orderRows<R extends Pick<BoardRow, 'key'>>(rows: R[], chairs: Pick<Place, 'id' | 'position'>[]): R[] {
  const pos = (r: R) => { const k = fromKey(r.key); return [k?.shift ?? 9, chairs.find((c) => c.id === k?.chair)?.position ?? Number.MAX_SAFE_INTEGER] }
  return [...rows].sort((a, b) => { const x = pos(a); const y = pos(b); return x[0] - y[0] || x[1] - y[1] })
}

/** the session's concept: the base's open list of procedures, the pack's code */
export const SESSION = { text: 'Haemodialysis', codings: [{ system: 'local.procedure', code: 'haemodialysis', display: 'Haemodialysis' }] }
type Session = EntryData['haemodialysis.session']
const facts = (k: FromKey): Session['haemodialysis'] => ({ on: k.on, shift: k.shift, chair: k.chair, ...(k.slot ? { slot: k.slot } : {}), hours: k.hours })
/** Start's own entry (C5's set, with the base's admitted into the chair): the session begun now, in the stay just opened */
export function startEntries(row: BoardRow, stay: { id: string; place_id: string; department_id: string }): EntryIn[] {
  const k = fromKey(row.key); if (!k) return []
  const data: Session = { concept: SESSION, status: 'in-progress', performed: { value: new Date().toISOString(), precision: 'minute' }, haemodialysis: facts(k) }
  return [{ id: newId(), type: 'haemodialysis.session', patient_id: row.patientId, department_id: stay.department_id, visit_id: stay.id, data }]
}
/** Missed shows once the row's shift has begun (the next shift is listed up to an hour early; nobody misses a session not yet due); a row
 *  with no start time shows it */
export const missedShows = (row: Pick<BoardRow, 'since'>, now: number) => !row.since || !(Date.parse(row.since) > now)
/** Missed: the session not done, in no stay, "Did not come" (its reason can be changed later) */
export function missedEntry(row: BoardRow, departmentId: string): EntryIn {
  const k = fromKey(row.key); if (!k) throw new Error('This row is not one of the schedule')
  const data: Session = { concept: SESSION, status: 'not-done', performed: { value: k.on, precision: 'day' }, reason: 'Did not come', haemodialysis: { ...facts(k), missed: 'not_came' } }
  return { id: newId(), type: 'haemodialysis.session', patient_id: row.patientId, department_id: departmentId, data }
}

const ISOLATION: Record<string, string> = { isolation_hbv: 'hbv', isolation_hcv: 'hcv' }
/** a patient's isolation from their alerts (each item's latest version, active, not crossed out): ['hbv'], ['hcv'], both or none */
export function isolationOf(entries: readonly Pick<ServerEntry, 'item' | 'item_version' | 'type' | 'data' | 'hidden'>[]): string[] {
  const latest = new Map<string, (typeof entries)[number]>()
  for (const e of entries) if ((latest.get(e.item)?.item_version ?? 0) < e.item_version) latest.set(e.item, e)
  const out = new Set<string>()
  for (const e of latest.values()) {
    if (e.type !== 'alert' || e.hidden || (e.data as { status?: unknown } | undefined)?.status !== 'active') continue
    const codings = (e.data as { concept?: { codings?: { system?: string; code?: string }[] } }).concept?.codings ?? []
    for (const c of codings) if (c.system === 'local.alert' && c.code && ISOLATION[c.code]) out.add(ISOLATION[c.code])
  }
  return [...out].sort()
}
