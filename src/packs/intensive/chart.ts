// The ICU chart's grid (spec/openCare.md §5.6): hours across, a group of rows each for the vitals, the ventilator, the infusions, in and
// out, and who signed. A cell is what was written in that hour; a setting carried on from the hour before (the ventilator's, an
// infusion's dose) is drawn faint and never written again; a MAP nobody typed is worked out from that hour's BP, faint, with a title
// that says so. A low MAP and a low hourly urine carry ↓. The balance is in − urine over the ICU day's hours (other losses are not
// charted yet); the day-start column holds the hour before it, so it closes the day before. The hour now with nothing signed is due.
// Where the cardiac rows are on (piece I3, cardiac.ts), the Heart group comes first (the heart rate and BP move into it) and the Bloods
// come before in and out. Pure.
import type { ServerEntry, ValueRow } from '@core/db/types'
import { initials } from '@core/ui/tone'
import { cardiacGroups, type CardiacInput } from './cardiac'
import { airwayOf, modeWords, obsKeyOf } from './codes'
import { dayStart, hourOf, hoursFrom, plusHours } from './hours'
import { inForce, inHour, itemsOf, latestOf, type Item } from './items'
import { DOSE_UNITS, isDoseUnit } from './rates'

export interface Cell { text: string; carried?: boolean; flag?: 'low' | 'high'; title?: string }
export interface Row { key: string; label: string; unit?: string; title?: string; cells: (Cell | null)[] }
export interface Group { key: string; title: string; rows: Row[] }
export interface ChartModel { hours: string[]; now: string; due: boolean; groups: Group[] }
export interface ChartInput { entries: ServerEntry[]; from: string; now: string; dayStarts: number; kg: number | null; users: { id: string; name: string }[]
  /** the department's cardiac rows, when on: the base's values for the bloods, the needle's time, the unit's heparin target */
  cardiac?: { values: readonly ValueRow[]; needleAt: string | null; heparin?: CardiacInput['heparin'] } }

type Data = Record<string, unknown>
const obj = (x: unknown): Data => x && typeof x === 'object' && !Array.isArray(x) ? x as Data : {}
/** a quantity's number */
const qv = (x: unknown): number | null => { const v = obj(x).value; const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null }
const qs = (x: unknown): string | null => { const n = qv(x); return n === null ? null : String(n) }
/** a MAP worked out from a BP */
export const computedMap = (sys: number, dia: number) => Math.round((sys + 2 * dia) / 3)
const pad = (n: number) => String(n).padStart(2, '0')
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n))}`
const cell = (text: string | null, more: Omit<Cell, 'text'> = {}): Cell | null => text === null ? null : { text, ...more }
const hasAny = (r: Row) => r.cells.some((c) => c !== null)

const VITALS: [string, string, string?][] = [['hr', 'Heart rate', '/min'], ['bp', 'BP', 'mmHg'], ['map', 'MAP', 'mmHg'], ['spo2', 'SpO₂', '%'], ['rr', 'RR', '/min'],
  ['temp', 'Temperature', '°C'], ['glucose', 'Glucose', 'mg/dL'], ['cvp', 'CVP', 'cmH₂O'], ['gcs', 'GCS'], ['acvpu', 'ACVPU'], ['o2', 'Air or O₂']]
const ALWAYS = new Set(['hr', 'bp', 'map', 'spo2'])

/** a vitals key's words in a cell */
function vitalText(key: string, d: Data): string | null {
  if (key === 'bp') { const b = obj(d.bp); const s = qs(b.sys); const di = qs(b.dia); return s && di ? `${s}/${di}` : null }
  if (key === 'acvpu') return typeof d.consciousness === 'string' ? d.consciousness.toUpperCase() : null
  if (key === 'o2') { const o = obj(d.oxygen); if (o.on === 'air') return 'Air'; if (o.on !== 'oxygen') return null; const f = qs(o.flow); return f ? `O₂ ${f} L/min` : 'O₂' }
  return qs(d[key])
}

/** the hour's latest of each thing: by column, by key */
function byColumn(items: Item[], col: (iso: string) => number | undefined, pick: (e: ServerEntry) => [string, string | number | Data][] | null) {
  const out = new Map<number, Map<string, { v: string | number | Data; at: string }>>()
  for (const it of items) {
    const e = latestOf(it); const i = col(e.occurred_at); if (i === undefined) continue
    const m = out.get(i) ?? new Map(); out.set(i, m)
    for (const [k, v] of pick(e) ?? []) { const was = m.get(k); if (!was || was.at <= e.occurred_at) m.set(k, { v, at: e.occurred_at }) }
  }
  return out
}

function vitalsGroup(items: Item[], hours: string[], col: (iso: string) => number | undefined): Group {
  const vit = byColumn(items.filter((i) => i.type === 'vitals'), col, (e) => { const d = obj(e.data); const out: [string, string][] = []
    for (const [k] of VITALS) { const t = vitalText(k, d); if (t !== null) out.push([k, t]) }
    const b = obj(d.bp); const s = qv(b.sys); const di = qv(b.dia); if (s !== null && di !== null) out.push(['bp_n', String(computedMap(s, di))])
    return out })
  const obs = byColumn(items.filter((i) => i.type === 'observation'), col, (e) => { const k = obsKeyOf(e); const n = qv(obj(obj(e.data).value).quantity)
    return k && n !== null && (k === 'map' || k === 'cvp') ? [[k, String(n)]] : null })
  const gcs = byColumn(items.filter((i) => i.type === 'score'), col, (e) => { const d = obj(e.data); if (d.score !== 'gcs') return null; const x = obj(d.inputs)
    return [['gcs', `E${x.eye ?? '?'} V${x.verbal ?? '?'} M${x.motor ?? '?'} · ${d.total}`], ['gcs_n', Number(d.total)]] })
  const rows: Row[] = VITALS.map(([key, label, unit]) => ({ key, label, unit, cells: hours.map((_, i): Cell | null => {
    if (key === 'map') {
      const typed = obs.get(i)?.get('map')?.v
      if (typed !== undefined) return cell(String(typed), Number(typed) < 65 ? { flag: 'low' } : {})
      const worked = vit.get(i)?.get('bp_n')?.v
      return worked === undefined ? null : cell(String(worked), { carried: true, title: 'worked out from the BP', ...(Number(worked) < 65 ? { flag: 'low' as const } : {}) })
    }
    if (key === 'cvp') { const v = obs.get(i)?.get('cvp')?.v; return v === undefined ? null : cell(String(v)) }
    if (key === 'gcs') { const v = gcs.get(i)?.get('gcs')?.v; const n = Number(gcs.get(i)?.get('gcs_n')?.v); return v === undefined ? null : cell(String(v), n < 9 ? { flag: 'low' } : {}) }
    const v = vit.get(i)?.get(key)?.v; return v === undefined ? null : cell(String(v))
  }) }))
  return { key: 'vitals', title: 'Vitals', rows: rows.filter((r) => ALWAYS.has(r.key) || hasAny(r)) }
}

function ventGroup(items: Item[], hours: string[]): Group | null {
  const airways = items.filter((i) => i.type === 'procedure' && airwayOf(i.versions[0]))
  const vents = items.filter((i) => i.type === 'intensive.vent')
  let shown = false
  const at = hours.map((h) => {
    const end = plusHours(h, 1)
    const open = airways.some((a) => obj(inForce(a, end)?.data).status === 'in-progress')
    const ended = airways.some((a) => { const v = inHour(a, h); return !!v && obj(v.data).status !== 'in-progress' && v.item_version > 1 })
    if (!open) { if (ended) shown = true; return ended ? 'off' as const : null }
    shown = true
    let best: { e: ServerEntry; it: Item } | null = null
    for (const it of vents) { const e = inForce(it, end); if (e && (!best || best.e.occurred_at < e.occurred_at)) best = { e, it } }
    return best ? { d: obj(best.e.data), carried: !inHour(best.it, h) } : { d: null, carried: false }
  })
  if (!shown) return null
  const two = (a: unknown, b: unknown) => qs(a) === null && qs(b) === null ? null : `${qs(a) ?? '–'} · ${qs(b) ?? '–'}`
  const row = (key: string, label: string, text: (d: Data) => string | null): Row => ({ key, label, cells: at.map((x) => {
    if (x === null) return null
    if (x === 'off') return key === 'mode' ? cell('off') : null
    return x.d ? cell(text(x.d), x.carried ? { carried: true } : {}) : null
  }) })
  const rows = [row('mode', 'Mode', (d) => modeWords(d) || null), row('fio2peep', 'FiO₂ · PEEP', (d) => two(d.fio2, d.peep)),
    row('vtrate', 'Vt · rate', (d) => two(d.vt, d.rate)), row('ps', 'PS', (d) => qs(d.ps))]
  return { key: 'vent', title: 'Ventilator', rows: rows.filter((r) => r.key !== 'ps' || hasAny(r)) }
}

function infusionGroup(items: Item[], hours: string[]): Group | null {
  const rows: Row[] = []
  for (const it of items.filter((i) => i.type === 'intensive.infusion')) {
    const first = obj(it.versions[0].data); const u = isDoseUnit(first.dose_unit) ? first.dose_unit : null
    const cells = hours.map((h): Cell | null => {
      const v = inForce(it, plusHours(h, 1)); if (!v) return null
      const d = obj(v.data); const written = inHour(it, h)
      if (d.status === 'stopped') return written && obj(written.data).status === 'stopped' ? cell('off') : null
      // a version with no dose (a rate typed with no bag) shows its rate with the unit, never under the row's dose unit
      const rate = qs(d.rate); const text = qs(d.dose) ?? (rate ? `${rate} mL/h` : null)
      return cell(text, { ...(written ? {} : { carried: true }), ...(rate ? { title: `${rate} mL/h` } : {}) })
    })
    if (cells.some((c) => c !== null)) rows.push({ key: it.item, label: String(obj(first.drug).text ?? ''), unit: u ? DOSE_UNITS[u].words : 'mL/h', cells })
  }
  rows.sort((a, b) => a.label.localeCompare(b.label))
  return rows.length ? { key: 'infusions', title: 'Infusions', rows } : null
}

function fluidGroup(items: Item[], hours: string[], dayStarts: number, kg: number | null): Group {
  // every volume of the stay by its hour (the balance counts from before the window's first column)
  const by = new Map<string, { intake: number; urine: number; output: number; has: Set<string> }>()
  for (const it of items) {
    if (it.type !== 'observation') continue
    const e = latestOf(it); const k = obsKeyOf(e); const n = qv(obj(obj(e.data).value).quantity)
    if (n === null || !k || k === 'map' || k === 'cvp') continue
    const h = hourOf(e.occurred_at); const x = by.get(h) ?? { intake: 0, urine: 0, output: 0, has: new Set<string>() }; by.set(h, x)
    const key = k === 'intake' ? 'intake' : k === 'output' ? 'output' : 'urine'
    x[key] += n; x.has.add(key)
  }
  const sum = (h: string, key: 'intake' | 'urine' | 'output') => by.get(h)?.has.has(key) ? by.get(h)![key] : null
  const intake: Row = { key: 'intake', label: 'In', unit: 'mL', cells: hours.map((h) => cell(sum(h, 'intake') === null ? null : String(sum(h, 'intake')))) }
  const urine: Row = { key: 'urine', label: 'Urine', unit: 'mL', cells: hours.map((h) => { const n = sum(h, 'urine'); if (n === null) return null
    return cell(String(n), kg ? { title: `${(n / kg).toFixed(1)} mL/kg/h`, ...(n < 0.5 * kg ? { flag: 'low' as const } : {}) } : {}) }) }
  const output: Row = { key: 'output', label: 'Output total', unit: 'mL', cells: hours.map((h) => cell(sum(h, 'output') === null ? null : String(sum(h, 'output')))) }
  const balance: Row = { key: 'balance', label: 'Balance', unit: `since ${pad(dayStarts)}:00`, title: 'in − urine; other losses are not charted', cells: hours.map((h) => {
    // a column holds the hour up to it, so the day-start column closes the day before: the day counts the hours after its start
    const start = dayStart(plusHours(h, -1), dayStarts); const from = Date.parse(start); const to = Date.parse(h); let n = 0; let any = false
    for (const [at, x] of by) { const t = Date.parse(at); if (t > from && t <= to && (x.has.has('intake') || x.has.has('urine'))) { any = true; n += x.intake - x.urine } }
    return any ? cell(signed(n), dayStart(h, dayStarts) === h ? { title: `the ICU day that ends at ${pad(dayStarts)}:00` } : {}) : null
  }) }
  return { key: 'fluids', title: 'In and out', rows: [intake, urine, ...(hasAny(output) ? [output] : []), balance] }
}

/** the grid: a column an hour from `from` to the hour now */
export function chartOf(x: ChartInput): ChartModel {
  const hours = hoursFrom(x.from, x.now); const now = hourOf(x.now)
  const index = new Map(hours.map((h, i) => [h, i])); const col = (iso: string) => index.get(hourOf(iso))
  const items = itemsOf(x.entries)
  // who signed each hour: the authors of what the chart draws, written at that hour
  const names = new Map(x.users.map((u) => [u.id, u.name]))
  const by = hours.map(() => new Set<string>())
  for (const it of items) {
    if ((it.type === 'procedure' && !airwayOf(it.versions[0])) || (it.type === 'score' && obj(it.versions[0].data).score !== 'gcs')) continue
    for (const v of it.versions) { const i = col(v.occurred_at); if (i !== undefined && v.author_id) by[i].add(initials(names.get(v.author_id) ?? '?')) }
  }
  const signedRow: Row = { key: 'by', label: 'By', cells: by.map((s) => s.size ? cell([...s].join(', ')) : null) }
  const nowAt = index.get(now)
  // the cardiac rows: the heart rate and BP move out of the vitals into the Heart group
  const vitals = vitalsGroup(items, hours, col); const take = (key: string) => vitals.rows.find((r) => r.key === key) ?? null
  const cardiac = x.cardiac ? cardiacGroups({ entries: x.entries, values: x.cardiac.values, hours, needleAt: x.cardiac.needleAt, heparin: x.cardiac.heparin ?? null, hr: take('hr'), bp: take('bp') }) : []
  if (x.cardiac) vitals.rows = vitals.rows.filter((r) => r.key !== 'hr' && r.key !== 'bp')
  const heart = cardiac.find((g) => g.key === 'heart') ?? null; const bloods = cardiac.find((g) => g.key === 'bloods') ?? null
  const groups = [heart, vitals, ventGroup(items, hours), infusionGroup(items, hours), bloods, fluidGroup(items, hours, x.dayStarts, x.kg),
    { key: 'signed', title: 'Signed', rows: [signedRow] }].filter((g): g is Group => g !== null)
  return { hours, now, due: nowAt !== undefined && signedRow.cells[nowAt] === null, groups }
}
