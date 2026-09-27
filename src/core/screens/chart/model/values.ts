// Vitals and results over time (chart-plan.md §3.2, §4 items 4–5), from base.values (vitals by key, analytes, quantity observations)
// and each value's source entry. Vitals carry no interpretation (base.values_refresh writes null for them), so a vitals tile is never
// flagged: it shows the change against the value before (trendMark ↗ ↘ →). A result keeps its analyte's own interpretation, so LL and HH
// keep their direction (interpMark, interpWord); the flag arrows ↑ ↓ ‼ are never used for a trend. Pure.
import type { Flag, OrderRow, Organization, ServerEntry, ServerRecord, ValueRow } from '../../../db/types'
import { dataOf, interp } from '../../../db/views'
import { interpMark, interpWord, trendMark } from '../../../ui/tone'
import { KEY_TESTS } from '../../visit/kinds'
import { baseOf } from './items'
import { SHORT, VITAL_CODES, VITALS } from './labels'

type Types = Organization['types'] | undefined
const UNIT: Record<string, string> = { Cel: '°C', 'mm[Hg]': 'mmHg', 'kg/m2': 'kg/m²', '{score}': '/10', '10*3/uL': '×10⁹/L' }
export const unitOf = (v: Pick<ValueRow, 'unit' | 'ucum'>) => v.unit ?? (v.ucum ? UNIT[v.ucum] ?? v.ucum : null)
const isVital = (v: ValueRow) => VITAL_CODES.has(v.code ?? '')
const newestFirst = (a: ValueRow, b: ValueRow) => b.at.localeCompare(a.at) || b.entry_id.localeCompare(a.entry_id)
const abnormal = (i: string | null) => !!i && i !== 'N' && i !== 'NEG'
/** values by test (LOINC code, else the key), newest first */
function series(values: ValueRow[]) {
  const by = new Map<string, ValueRow[]>()
  for (const v of [...values].sort(newestFirst)) by.set(v.code ?? v.key, [...(by.get(v.code ?? v.key) ?? []), v])
  return by
}

// ── Last vitals ──
export interface VitalTile { key: string; label: string; value: string; unit: string | null; at: string; entry_id: string; before: string | null; trend: string; own: boolean }
export interface VitalsNow { at: string | null; entry_id: string | null; tiles: VitalTile[] }
/** one reading's worth: the latest value of each key (BP · HR · T · SpO₂ · RR · Wt, BMI when a height exists); a tile older than the
 *  latest reading carries its own date (own) */
export function vitalsNow(values: ValueRow[]): VitalsNow {
  const vs = values.filter(isVital).sort(newestFirst)
  if (!vs.length) return { at: null, entry_id: null, tiles: [] }
  const latest = vs[0]; const of = (key: string) => vs.filter((v) => v.key === key)
  const tile = (key: string, label: string, now: ValueRow, value: string, before: ValueRow | undefined, was: string | null, unit = unitOf(now)): VitalTile =>
    ({ key, label, value, unit, at: now.at, entry_id: now.entry_id, before: was, trend: trendMark(now.value, before?.value), own: now.entry_id !== latest.entry_id })
  const tiles: VitalTile[] = []
  const [sys, prev] = [of('bp.sys')[0], of('bp.sys').find((v) => v.entry_id !== of('bp.sys')[0]?.entry_id)]
  const dia = (s: ValueRow | undefined) => s && of('bp.dia').find((d) => d.entry_id === s.entry_id)
  const bp = (s: ValueRow) => dia(s) ? `${s.value}/${dia(s)!.value}` : `${s.value}`
  if (sys) tiles.push(tile('bp', 'BP', sys, bp(sys), prev, prev ? bp(prev) : null, 'mmHg'))
  for (const key of ['hr', 'temp', 'spo2', 'rr', 'weight']) {
    const [now, ...rest] = of(key); const before = rest.find((v) => v.entry_id !== now?.entry_id)
    if (now) tiles.push(tile(key, VITALS.find((v) => v.key === key)!.short, now, `${now.value}`, before, before ? `${before.value}` : null))
  }
  const bmi = of('bmi')[0]; const h = of('height')[0]; const w = of('weight')[0]
  if (bmi) tiles.push(tile('bmi', 'BMI', bmi, `${bmi.value}`, of('bmi')[1], of('bmi')[1] ? `${of('bmi')[1].value}` : null))
  else if (h && w && h.value > 0) tiles.push({ ...tile('bmi', 'BMI', w, (w.value / (h.value / 100) ** 2).toFixed(1), undefined, null, 'kg/m²'), key: 'bmi' })
  return { at: latest.at, entry_id: latest.entry_id, tiles: tiles.slice(0, 7) }
}

// ── Key results ──
export interface KeyResult { code: string; name: string; value: number; unit: string | null; interpretation: string | null; flag: Flag | null; mark: string; word: string
  at: string; entry_id: string; before: { value: number; at: string } | null; trend: string; points: number[] }
/** the key tests in KEY_TESTS order (HbA1c, creatinine, Hb, LDL — BP and weight are in Last vitals), then any other test whose latest
 *  value is flagged; any: whether there is a result value at all (none: the Summary leaves the item out) */
export function keyResults(values: ValueRow[], limit = 6): { rows: KeyResult[]; any: boolean } {
  const tests = series(values.filter((v) => !isVital(v)))
  const row = (code: string, vs: ValueRow[]): KeyResult => { const [now] = vs; const before = vs.find((v) => v.entry_id !== now.entry_id)
    return { code, name: SHORT[code] ?? now.name ?? now.key, value: now.value, unit: unitOf(now), interpretation: now.interpretation, flag: interp(now.interpretation),
      mark: interpMark(now.interpretation), word: interpWord(now.interpretation), at: now.at, entry_id: now.entry_id, before: before ? { value: before.value, at: before.at } : null,
      trend: trendMark(now.value, before?.value), points: vs.slice(0, 8).map((v) => v.value).reverse() } }
  const keys = KEY_TESTS.filter((c) => !VITAL_CODES.has(c) && tests.has(c))
  const flagged = [...tests.entries()].filter(([c, vs]) => !KEY_TESTS.includes(c) && abnormal(vs[0].interpretation)).sort(([, a], [, b]) => newestFirst(a[0], b[0]))
  return { rows: [...keys.map((c) => row(c, tests.get(c)!)), ...flagged.map(([c, vs]) => row(c, vs))].slice(0, limit), any: tests.size > 0 }
}

// ── Results by kind ──
export interface Point { at: string; value: number; value2?: number; interpretation: string | null; flag: Flag | null; mark: string; entry_id: string }
export interface Series { key: string; name: string; unit: string | null; points: Point[]; latest: Point; previous: Point | null; trend: string
  range: { low: number | null; high: number | null; text: string | null } | null }
export interface ResultGroup { name: string; vitals: boolean; tests: Series[] }
const point = (v: ValueRow, dia?: ValueRow): Point => ({ at: v.at, value: v.value, value2: dia?.value, interpretation: v.interpretation, flag: interp(v.interpretation),
  mark: interpMark(v.interpretation), entry_id: v.entry_id })
/** Vitals (BP drawn as sys/dia), each laboratory service by name (the value's source entry), Other; per test the points newest first, the
 *  value before, and the reference range copied into the latest result. Reports: answers with a conclusion and no number. */
export function resultsByKind(rec: Pick<ServerRecord, 'tables'>, types?: Types): { groups: ResultGroup[]; reports: { order: OrderRow; entry: ServerEntry }[] } {
  const t = rec.tables['base.values']; const vals = t?.rows ?? []
  const make = (key: string, vs: ValueRow[], points: Point[]): Series => { const e = t?.entries[vs[0].entry_id]
    const a = dataOf(e, 'result', types)?.analytes?.find((x) => x.key === vs[0].key || (x.code && `${x.code.system}:${x.code.code}` === vs[0].code))
    const n = (q: { value: string } | undefined) => q ? Number(q.value) : null
    return { key, name: VITALS.find((v) => v.code === key)?.name ?? vs[0].name ?? vs[0].key, unit: key === 'bp' ? 'mmHg' : unitOf(vs[0]), points, latest: points[0], previous: points[1] ?? null,
      trend: trendMark(points[0].value, points[1]?.value), range: a?.range ? { low: n(a.range.low), high: n(a.range.high), text: a.range.text ?? null } : null }
  }
  const groups: ResultGroup[] = []
  const vit = series(vals.filter(isVital)); const vitals: Series[] = []
  const sys = vit.get('loinc:8480-6'); const dia = vit.get('loinc:8462-4') ?? []
  if (sys) vitals.push({ ...make('bp', sys, sys.map((v) => point(v, dia.find((d) => d.entry_id === v.entry_id)))), name: 'Blood pressure' })
  for (const v of VITALS) { const vs = vit.get(v.code); if (vs && !v.key.startsWith('bp.')) vitals.push(make(v.code, vs, vs.map((x) => point(x)))) }
  if (vitals.length) groups.push({ name: 'Vitals', vitals: true, tests: vitals })
  const lab = new Map<string, Series[]>()
  for (const [code, vs] of series(vals.filter((v) => !isVital(v)))) {
    const e = t?.entries[vs[0].entry_id]; const name = baseOf(e?.type ?? '', types) === 'result' ? dataOf(e, 'result', types)?.service?.name ?? 'Other' : 'Other'
    lab.set(name, [...(lab.get(name) ?? []), make(code, vs, vs.map((x) => point(x)))])
  }
  for (const name of [...lab.keys()].sort((a, b) => Number(a === 'Other') - Number(b === 'Other') || a.localeCompare(b))) groups.push({ name, vitals: false, tests: lab.get(name)! })
  const o = rec.tables['base.orders']
  const reports = (o?.rows ?? []).flatMap((order) => order.answers.map((id) => o!.entries[id]).filter((e): e is ServerEntry => !!e && !e.hidden && baseOf(e.type, types) === 'result'
    && !(dataOf(e, 'result', types)?.analytes ?? []).some((x) => x.value)).map((entry) => ({ order, entry }))).sort((a, b) => b.entry.occurred_at.localeCompare(a.entry.occurred_at))
  return { groups, reports }
}
