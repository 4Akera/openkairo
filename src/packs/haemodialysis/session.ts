// One dialysis stay on the Session tab (spec/openCare.md §5.6, D2b): its session as it stands now (the latest version), the machine
// readings by time, the weight before (the stay's first weight: the base's vitals, never copied into the session), the fluid to take off
// and its parts, the hourly rate and the notices (shown, never a stop), the time on the machine, and Before as one set: the base's vitals
// and the session changed with the standing prescription copied as given, the fluid to take off and the access checked. Pure: npm run
// test:haemodialysis.
import { draftEntries, newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { KeyboardEvent } from 'react'
import type { Place, PresenceRow, ServerEntry, ValueRow } from '@core/db/types'
import { GAIN_SHARE, hmm, litres } from './board'

export type SessionData = EntryData['haemodialysis.session']
export type RxData = EntryData['haemodialysis.prescription']
export type Access = NonNullable<SessionData['haemodialysis']['access']>
export interface SessionNow { item: string; entry_id: string; status: string; at: string; data: SessionData }
export interface Pre { weight: number; bp?: { sys: number; dia: number }; hr?: number; temp?: number; at: string }

const num = (x: unknown): number | undefined => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(n) ? n : undefined }
/** a quantity's number */
export const qv = (q: unknown): number | undefined => q && typeof q === 'object' ? num((q as { value?: unknown }).value) : undefined
/** the items crossed out (a cross-out is the item's next version; it may carry no visit, so it is read without the stay's filter) */
export const crossedOf = (entries: readonly ServerEntry[]) => new Set(entries.filter((e) => e.type === 'crossed_out').map((e) => e.item))
/** each item's latest version among what the reader may see (a hidden entry has no data); an item crossed out is left out */
export function latest(entries: readonly ServerEntry[], type: string, stay?: string): ServerEntry[] {
  const out = new Map<string, ServerEntry>(); const crossed = crossedOf(entries)
  for (const e of entries) {
    if (e.type !== type || e.hidden || !e.data || crossed.has(e.item) || (stay !== undefined && e.visit_id !== stay)) continue
    const was = out.get(e.item); if (!was || was.item_version < e.item_version) out.set(e.item, e)
  }
  return [...out.values()]
}
/** a time as a number (the server's times differ in their fractions of a second, so never compared as text) */
const ms = (iso: string) => Date.parse(iso)
const byTime = (a: ServerEntry, b: ServerEntry) => ms(a.occurred_at) - ms(b.occurred_at) || ms(a.recorded_at) - ms(b.recorded_at)

/** the stay's session as it stands now (the latest version of its latest item) */
export function sessionOf(entries: readonly ServerEntry[], stay: string): SessionNow | null {
  const e = latest(entries, 'haemodialysis.session', stay).sort((a, b) => ms(b.recorded_at) - ms(a.recorded_at))[0]
  if (!e) return null
  const data = e.data as unknown as SessionData
  return { item: e.item, entry_id: e.id, status: data.status, at: e.occurred_at, data }
}
/** the stay's machine readings, by time */
export const readingsOf = (entries: readonly ServerEntry[], stay: string): ServerEntry[] => latest(entries, 'haemodialysis.reading', stay).sort(byTime)
/** the weight before: the stay's first vitals with a weight, and the BP, pulse and temperature taken with it */
export function preOf(entries: readonly ServerEntry[], stay: string): Pre | null {
  const e = latest(entries, 'vitals', stay).filter((x) => qv(x.data?.weight) !== undefined).sort(byTime)[0]
  return e?.data ? { weight: qv(e.data.weight)!, ...vitOf(e), at: e.occurred_at } : null
}
export type Vit = Pick<Pre, 'bp' | 'hr' | 'temp'>
/** one vitals entry's BP, pulse and temperature */
function vitOf(e: ServerEntry): Vit {
  const d = (e.data ?? {}) as EntryData['vitals']; const sys = qv(d.bp?.sys); const dia = qv(d.bp?.dia)
  return { ...(sys !== undefined && dia !== undefined ? { bp: { sys, dia } } : {}), ...(qv(d.hr) !== undefined ? { hr: qv(d.hr) } : {}),
    ...(qv(d.temp) !== undefined ? { temp: qv(d.temp) } : {}) }
}
/** the BP, pulse and temperature Before wrote (the vitals in the set of the session's first version with a target); none written: the
 *  weight before's own */
export function beforeVit(entries: readonly ServerEntry[], session: Pick<SessionNow, 'item'>, pre: Pre | null): Vit {
  const signed = entries.filter((e) => e.item === session.item && e.type === 'haemodialysis.session' && qv((e.data as SessionData | undefined)?.haemodialysis?.target) !== undefined)
    .sort((a, b) => a.item_version - b.item_version)[0]
  const v = signed && entries.find((e) => e.type === 'vitals' && e.set_id === signed.set_id && !e.hidden && e.data && !crossedOf(entries).has(e.item))
  return v ? vitOf(v) : pre ? { ...(pre.bp ? { bp: pre.bp } : {}), ...(pre.hr !== undefined ? { hr: pre.hr } : {}), ...(pre.temp !== undefined ? { temp: pre.temp } : {}) } : {}
}
/** the last session's weight after: the patient's newest weight before the stay began */
export function lastWeight(rows: readonly Pick<ValueRow, 'value' | 'at'>[], before: string): number | null {
  const r = rows.filter((x) => ms(x.at) < ms(before) && Number.isFinite(x.value)).sort((a, b) => ms(b.at) - ms(a.at))[0]
  return r ? r.value : null
}

// ── the fluid to take off ──
export const GIVEN_BACK = 300
export const LEFT_ABOVE = 400
export interface Fluid { above: number | null; given: number; left: number; target: number | null; typed: boolean }
/** (the weight before − the dry weight) × 1000 + given back − left above dry, to 100 mL, never under 0; null when a weight is missing */
export function targetOf(preKg: number | null | undefined, dryKg: number | null | undefined, given = GIVEN_BACK, left = LEFT_ABOVE): number | null {
  if (preKg == null || dryKg == null || !Number.isFinite(preKg) || !Number.isFinite(dryKg)) return null
  return Math.max(0, Math.round(((preKg - dryKg) * 1000 + given - left) / 100) * 100)
}
/** the parts and the target: the one typed, else worked out */
export function fluidOf(preKg: number | null | undefined, dryKg: number | null | undefined, typed?: number | null): Fluid {
  const above = preKg != null && dryKg != null ? Math.round((preKg - dryKg) * 10) / 10 : null
  const worked = targetOf(preKg, dryKg)
  const t = typed != null && Number.isFinite(typed) ? typed : null
  return { above, given: GIVEN_BACK, left: LEFT_ABOVE, target: t ?? worked, typed: t !== null && t !== worked }
}
/** the parts in words: "2.9 above dry + 0.3 given back − 0.4 left above dry" (none while a weight is missing); when they come to nothing
 *  (at or under dry), "0.4 under dry: nothing to take off" */
export function partsWords(f: Fluid): string | null {
  if (f.above === null) return null
  const at = `${kg(Math.abs(f.above))} ${f.above < 0 ? 'under' : 'above'} dry`
  if (f.above * 1000 + f.given - f.left <= 0) return `${at}: nothing to take off`
  return `${at} + ${litres(f.given)} given back − ${litres(f.left)} left above dry`
}
/** the weight's words: "dry 72.0 · 2.9 above dry · after the last session 72.4, gained 2.5" */
export function weightWords(pre: number | null | undefined, dry: number | null | undefined, last: number | null | undefined): string {
  const out: string[] = []
  if (dry != null) out.push(`dry ${kg(dry)}`)
  if (pre != null && dry != null) { const a = Math.round((pre - dry) * 10) / 10; out.push(a < 0 ? `${kg(-a)} under dry` : `${kg(a)} above dry`) }
  if (last != null) { const g = pre != null ? Math.round((pre - last) * 10) / 10 : null
    out.push(`after the last session ${kg(last)}${g == null ? '' : g < 0 ? `, lost ${kg(-g)}` : `, gained ${kg(g)}`}`) }
  return out.join(' · ')
}
/** mL/kg/h, one decimal; null when any is missing */
export function ufRate(targetMl: number | null | undefined, hours: number | null | undefined, dryKg: number | null | undefined): number | null {
  if (!targetMl && targetMl !== 0) return null
  if (!hours || !dryKg || hours <= 0 || dryKg <= 0) return null
  return Math.round(targetMl / hours / dryKg * 10) / 10
}
/** kilograms with one decimal */
export const kg = (n: number) => n.toFixed(1)

export interface Notice { text: string; tone: 'warn' | 'danger' }
export const RATE_MAX = 13
/** Before's notices, in order (shown, never a stop) */
export function beforeNotices(x: { rx: unknown; rate: number | null; gained: number | null; dry: number | null }): Notice[] {
  const out: Notice[] = []
  if (!x.rx) out.push({ text: 'No standing prescription: the doctor writes one', tone: 'warn' })
  if (x.rate != null && x.rate > RATE_MAX) out.push({ text: `Taking off ${x.rate} mL/kg/h: above ${RATE_MAX}`, tone: 'warn' })
  if (x.gained != null && x.dry != null && x.gained > GAIN_SHARE * x.dry) out.push({ text: `Gained ${kg(x.gained)} kg since the last session: over 4 % of the dry weight`, tone: 'warn' })
  return out
}

// ── the time on the machine ──
/** minutes since the session began */
export const elapsed = (started: string, now: number) => { const t = Date.parse(started); return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60_000)) : 0 }
/** minutes left of the hours (under 0: over) */
export const left = (started: string, hours: number, now: number) => Math.round(hours * 60) - elapsed(started, now)
/** "2:30 of 4:00" (no hours: "2:30") */
export const hmWords = (started: string, hours: number | null | undefined, now: number) => hours ? `${hmm(elapsed(started, now))} of ${hmm(hours * 60)}` : hmm(elapsed(started, now))

// ── Before ──
export interface BeforeIn {
  patientId: string; departmentId: string; stay: string; session: Pick<SessionNow, 'entry_id' | 'data'>
  /** the base's vitals taken now: with the weight only when the stay has none yet (then it is the weight before); left out when the
   *  stay's first vitals are the ones shown and nothing was changed */
  vitals?: { weight?: number | null; sys?: number | null; dia?: number | null; pulse?: number | null; temp?: number | null } | null
  rx: RxData | null; target: number; access: Access
}
/** Before in one set: the base's vitals, and the session changed with the prescription copied as given, the target in mL, the access */
export function beforeSet(x: BeforeIn): EntryIn[] {
  const out: EntryIn[] = []
  const v = x.vitals
  if (v) out.push(...draftEntries({ id: newId(), function: 'vitals', params: { systolic: v.sys ?? undefined, diastolic: v.dia ?? undefined, pulse: v.pulse ?? undefined,
    temperature: v.temp ?? undefined, weight: v.weight ?? undefined } }, { patientId: x.patientId, departmentId: x.departmentId, visitId: x.stay }))
  const was = x.session.data
  const access: Access = { kind: x.access.kind, ...(x.access.site?.trim() ? { site: x.access.site.trim() } : {}), ...(x.access.ok !== undefined ? { ok: x.access.ok } : {}),
    ...(x.access.note?.trim() ? { note: x.access.note.trim() } : {}) }
  const data: SessionData = { ...was, haemodialysis: { ...was.haemodialysis, ...(x.rx ? { prescription: x.rx } : {}),
    target: { value: String(x.target), unit: 'mL', ucum: 'mL' }, access } }
  out.push({ id: newId(), type: 'haemodialysis.session', patient_id: x.patientId, department_id: x.departmentId, visit_id: x.stay, refers_to: x.session.entry_id, relation: 'changes', data })
  return out
}

// ── the tab ──
/** the unit's stays in chair order (a stay in no chair last) */
export function inChairOrder(rows: readonly PresenceRow[], chairs: readonly Pick<Place, 'id' | 'position'>[], departmentId: string): PresenceRow[] {
  const pos = (r: PresenceRow) => chairs.find((c) => c.id === r.place_id)?.position ?? Number.MAX_SAFE_INTEGER
  return rows.filter((r) => r.kind === 'stay' && r.state === 'admitted' && r.department_id === departmentId)
    .sort((a, b) => pos(a) - pos(b) || ms(a.checked_in_at) - ms(b.checked_in_at))
}
/** ⌘↵ (or Ctrl+↵) signs a card */
export const onSign = (go: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go() } }
