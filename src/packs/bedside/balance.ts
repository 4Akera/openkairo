// Ward nursing's fluid balance (spec/openCare.md §5.6, W2): the ward's shifts (bedside.shifts) and the fluid day they make, a measure
// counting in the shift it closes, in the clinic's zone; today's table by shift (in by route, out by kind, in − out, urine mL/kg/h);
// the balance in words on the tile, the banner, the section's chip and Summary line; and the note under /in and /out. Urine mL/kg/h is
// worked out every time, never stored: the measure's mL over the hours since the patient's previous measured urine (any stay, the ICU's
// hourly urine too, at most 24 h back) over the latest weight in kg; "low" below 0.5 (1.0 under 12 years), in words, never a stop.
// The server never decides the day. Pure: npm run test:fluids.
import type { Organization, PresenceRow, ServerEntry, TableRead, ValueRow } from '@core/db/types'
import type { ChipWord, Own, SectionInput } from '@core/screens/chart/sections'
import type { BannerWord, WordsInput } from '@core/screens/chart/words'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import type { Ctx, Parsed } from '@core/screens/visit/parse'
import { settingIn } from '@core/screens/settings/form/model'
import { hm, shortDate, ymd } from '@core/ui/time'
import { CHART_TYPE, CHECK_ML, FLUID_CODES, LOINC_IN, LOINC_OUT, LOINC_URINE } from './fluids'
import { openStay } from './news2'

// ── the shifts and the fluid day ──
export const SHIFTS_DEFAULT = '08:00 14:00 20:00'
const RX = /^([01]\d|2[0-3]):[0-5]\d( ([01]\d|2[0-3]):[0-5]\d){0,5}$/
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }
/** the ward's shift starts as minutes after midnight, earliest first, no repeats; a bad value reads as 08:00 14:00 20:00 */
export function shiftsOf(starts: unknown): number[] {
  const s = typeof starts === 'string' && RX.test(starts.trim()) ? starts.trim() : SHIFTS_DEFAULT
  return [...new Set(s.split(' ').map(toMin))].sort((a, b) => a - b)
}
type Org = Parameters<typeof settingIn>[0]
export const shiftsIn = (org: Org, departmentId: string | null | undefined) => shiftsOf(settingIn(org, 'bedside.shifts', departmentId).starts)
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const head = (m: number) => m % 60 ? clock(m) : String(Math.floor(m / 60)).padStart(2, '0')
/** "08–14", "14–20", "20–08" */
export const shiftLabels = (s: readonly number[]) => s.map((m, i) => `${head(m)}–${head(s[(i + 1) % s.length])}`)
/** "08:00": when the fluid day starts */
export const dayStart = (s: readonly number[]) => clock(s[0])
const dayBefore = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
/** the fluid day (the date it starts on) and the shift a time closes, in the clinic's zone: 14:00 closes 08–14; 08:00 the night before */
export function placeOf(iso: string, s: readonly number[]): { day: string; shift: number } {
  const m = toMin(hm(iso)); const d = ymd(iso)
  if (m <= s[0]) return { day: dayBefore(d), shift: s.length - 1 }
  let i = 0; while (i + 1 < s.length && s[i + 1] < m) i++
  return { day: d, shift: i }
}

// ── the measures ──
export interface Measure { at: string; dir: 'in' | 'out'; how: string; ml: number; urine: boolean }
const HOW_IN = ['iv', 'oral', 'tube']; const HOW_OUT = ['drain', 'tube', 'vomit', 'stool']
/** one measure from a code ('9187-6' or 'loinc:9187-6'), its mL, time and method (a method the chart has no row for, another pack's or
 *  the API's, reads as 'other', so the rows always add up to the day's in and out); any other code: none */
export function measureOf(code: string | null | undefined, ml: number, at: string, method?: unknown): Measure | null {
  const c = (code ?? '').replace(/^loinc:/, ''); const how = (known: string[]) => typeof method === 'string' && known.includes(method) ? method : 'other'
  if (!Number.isFinite(ml) || ml < 0) return null
  return c === LOINC_IN ? { at, dir: 'in', how: how(HOW_IN), ml, urine: false } : c === LOINC_URINE ? { at, dir: 'out', how: 'urine', ml, urine: true }
    : c === LOINC_OUT ? { at, dir: 'out', how: how(HOW_OUT), ml, urine: false } : null
}
const byTime = (a: Measure, b: Measure) => a.at.localeCompare(b.at)
/** a stay's measures from the record's values (each observation's latest; the crossed out gone), method from its source entry */
export function measuresOfValues(t: Pick<TableRead<ValueRow>, 'rows' | 'entries'> | undefined, stay: string): Measure[] {
  return (t?.rows ?? []).filter((r) => r.visit_id === stay && FLUID_CODES.includes(r.code ?? '') && (r.ucum ?? 'mL') === 'mL')
    .map((r) => measureOf(r.code, r.value, r.at, t?.entries[r.entry_id]?.data?.method)).filter((m): m is Measure => !!m).sort(byTime)
}
/** bedside.fluids' answer */
export interface FluidsStay { chart: { at: string; target?: number }; measures: { at: string; code: string; ml: number; method?: string }[] }
export interface FluidsRead { patient_ids: string[]; stays: Record<string, FluidsStay> }
/** a stay's fluids from data carrying them under fluids (the board's); malformed: none */
export function fluidsOf(data: unknown, item: string): FluidsStay | undefined {
  const all = data && typeof data === 'object' ? (data as { fluids?: unknown }).fluids : undefined
  const f = all && typeof all === 'object' && Object.hasOwn(all, item) ? (all as Record<string, FluidsStay>)[item] : undefined
  return f && typeof f === 'object' && f.chart && typeof f.chart.at === 'string' && Array.isArray(f.measures) ? f : undefined
}
export const measuresOfRead = (f: FluidsStay) => f.measures.map((m) => measureOf(m?.code, Number(m?.ml), String(m?.at), m?.method)).filter((m): m is Measure => !!m).sort(byTime)

// ── urine mL/kg/h ──
/** the ICU's hourly urine (mL/h): its time counts as a previous urine, its mL/h is never summed */
export const LOINC_URINE_HOURLY = '9188-4'
/** every measured urine's time in the record, any stay: the ward's 9187-6 and the ICU's 9188-4 */
export const urineTimes = (rows: readonly ValueRow[] | undefined) =>
  (rows ?? []).filter((r) => r.code === `loinc:${LOINC_URINE}` || r.code === `loinc:${LOINC_URINE_HOURLY}`).map((r) => r.at)
/** the measured urine before this time, at most 24 h before; else none */
export function urineBefore(times: readonly string[], at: string): string | null {
  const t = Date.parse(at); let best: string | null = null
  for (const x of times) { const u = Date.parse(x); if (u < t && t - u <= 86_400_000 && (!best || u > Date.parse(best))) best = x }
  return best
}
export const hoursBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 3_600_000
/** the latest weight (the vitals' weight key) in kg: a row in g is divided by 1000, any other unit skipped */
export function latestWeight(rows: readonly ValueRow[] | undefined): { kg: number; at: string } | null {
  const w = (rows ?? []).filter((r) => r.key === 'weight' && r.value > 0 && (r.ucum === 'kg' || r.ucum === 'g')).sort((a, b) => b.at.localeCompare(a.at))[0]
  return w ? { kg: w.ucum === 'g' ? w.value / 1000 : w.value, at: w.at } : null
}
/** "low" below 0.5 mL/kg/h from 12 years, below 1.0 under 12 (paediatric oliguria); no birth date: the adult figure */
export function lowBelow(birth: string | null | undefined, at: string): number {
  if (!birth) return 0.5
  const b = new Date(`${birth.slice(0, 10)}T00:00:00Z`); const t = new Date(at)
  const age = t.getUTCFullYear() - b.getUTCFullYear() - (t.getUTCMonth() * 100 + t.getUTCDate() < b.getUTCMonth() * 100 + b.getUTCDate() ? 1 : 0)
  return Number.isFinite(age) && age < 12 ? 1.0 : 0.5
}
/** "1.9 mL/kg/h", and ", low" below the threshold (the words say it); two decimals where one would round up to the threshold: "0.46" */
export const rateWords = (r: number, low = 0.5) => `${r < low && Number(r.toFixed(1)) >= low ? r.toFixed(2) : r.toFixed(1)} mL/kg/h${r < low ? ', low' : ''}`

// ── the day's table ──
export interface Row { dir: 'in' | 'out'; how: string; cells: (number | null)[]; total: number }
type Sums = { in: number; out: number; balance: number }
export interface DayTable { day: string; labels: string[]; current: number; rows: Row[]; ins: number[]; outs: number[]; balance: (number | null)[]
  rate: (number | null)[]; total: Sums; yesterday: Sums | null }
const IN_ORDER = ['iv', 'oral', 'tube', 'other']; const OUT_ORDER = ['urine', 'drain', 'tube', 'vomit', 'stool', 'other']
const sums = (ms: readonly Measure[]): Sums => { const i = ms.filter((m) => m.dir === 'in').reduce((a, m) => a + m.ml, 0); const o = ms.filter((m) => m.dir === 'out').reduce((a, m) => a + m.ml, 0)
  return { in: i, out: o, balance: i - o } }
/** today's fluid day by shift: each route's and kind's mL (IV, by mouth and urine always shown; the rest when used today or yesterday),
 *  in, out and balance by shift and for the day, urine mL/kg/h by shift (the previous urine from the whole record's urine times), and
 *  yesterday's totals */
export function dayTable(ms: readonly Measure[], urines: readonly string[], s: readonly number[], kg: number | null, now: number): DayTable {
  const nowIso = new Date(now).toISOString(); const here = placeOf(nowIso, s); const today = here.day; const yday = dayBefore(today)
  const placed = ms.filter((m) => Date.parse(m.at) <= now).map((m) => ({ m, p: placeOf(m.at, s) }))
  const mine = placed.filter((x) => x.p.day === today); const before = placed.filter((x) => x.p.day === yday).map((x) => x.m)
  const n = s.length; const empty = () => Array.from({ length: n }, () => 0)
  const used = (dir: 'in' | 'out', how: string) => placed.some((x) => (x.p.day === today || x.p.day === yday) && x.m.dir === dir && x.m.how === how)
  const rowOf = (dir: 'in' | 'out', how: string): Row => {
    const cells: (number | null)[] = Array.from({ length: n }, () => null)
    for (const x of mine) if (x.m.dir === dir && x.m.how === how) cells[x.p.shift] = (cells[x.p.shift] ?? 0) + x.m.ml
    return { dir, how, cells, total: cells.reduce<number>((a, c) => a + (c ?? 0), 0) }
  }
  const rows = [...IN_ORDER.filter((h) => h === 'iv' || h === 'oral' || used('in', h)).map((h) => rowOf('in', h)),
    ...OUT_ORDER.filter((h) => h === 'urine' || used('out', h)).map((h) => rowOf('out', h))]
  const ins = empty(); const outs = empty(); const any = Array.from({ length: n }, () => false)
  for (const x of mine) { (x.m.dir === 'in' ? ins : outs)[x.p.shift] += x.m.ml; any[x.p.shift] = true }
  const balance = ins.map((v, i) => i > here.shift && !any[i] ? null : v - outs[i])
  const rate = Array.from({ length: n }, (_, i) => {
    let ml = 0; let h = 0
    for (const x of mine) if (x.m.urine && x.p.shift === i) { const prev = urineBefore(urines, x.m.at); if (prev) { ml += x.m.ml; h += hoursBetween(prev, x.m.at) } }
    return kg && h > 0 ? ml / h / kg : null
  })
  return { day: today, labels: shiftLabels(s), current: here.shift, rows, ins, outs, balance, rate, total: sums(mine.map((x) => x.m)), yesterday: before.length ? sums(before) : null }
}

// ── the words ──
/** whole mL, or one decimal when it has one (an infant's 2.5 mL); thousands apart by a no-break space */
const group = (n: number) => { const [i, d] = String(Math.round(Math.abs(n) * 10) / 10).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (d ? `.${d}` : '') }
/** "−850" (a minus sign), "+400", "0", "−2.5"; thousands apart by a no-break space: "−1 000" */
export const signed = (n: number) => { const t = Math.round(n * 10); return `${t < 0 ? '−' : t > 0 ? '+' : ''}${group(n)}` }
export const mlWords = (n: number) => group(n)
/** today's balance (in − out) up to now, or null when nothing is measured today */
export function balanceToday(ms: readonly Measure[], s: readonly number[], now: number): number | null {
  const today = placeOf(new Date(now).toISOString(), s).day
  const mine = ms.filter((m) => Date.parse(m.at) <= now && placeOf(m.at, s).day === today)
  return mine.length ? mine.reduce((b, m) => b + (m.dir === 'in' ? m.ml : -m.ml), 0) : null
}
/** the tile's last word, for an admitted stay with a chart on (the board's fluids read): "balance +390 mL"; "nothing measured since 08:00" */
export function withBalanceWord(w: TileWords | null | undefined, row: PresenceRow, ctx: Pick<TileCtx, 'org' | 'dept'>, data: unknown, now: number): TileWords | null | undefined {
  const f = row.kind === 'stay' && row.state === 'admitted' ? fluidsOf(data, row.item) : undefined
  if (!f) return w
  const s = shiftsIn(ctx.org, ctx.dept.id); const b = balanceToday(measuresOfRead(f), s, now)
  const word: TileWord = { text: b === null ? `nothing measured since ${dayStart(s)}` : `balance ${signed(b)} mL` }
  return { words: [...(w ? (typeof w.words === 'string' ? [w.words] : w.words) : []), word] }
}

// ── the chart, the section and the banner ──
export interface ChartNow { entry: ServerEntry; active: boolean; at: string; target: number | null }
/** a stay's fluid chart (own is newest first): on or off by its latest entry; while on, "since" the run's oldest entry after the last
 *  stop, and the aim from the latest entry that sets one (target) or clears it (no_target) since then (the op's rule); none: null */
export function chartOf(own: Own, stay: string | undefined): ChartNow | null {
  const es = stay ? own.shown.filter((x) => x.type === CHART_TYPE && x.visit_id === stay) : []
  if (!es.length) return null
  const active = es[0].data?.status === 'active'; let since = es[0]; let target: number | null = null; let set = false
  if (active) for (const e of es) {
    if (e.data?.status === 'stopped') break
    since = e
    if (!set && e.data?.no_target === true) set = true
    const t = (e.data?.target as { value?: string } | undefined)?.value
    if (!set && typeof t === 'string' && /^[+-]?\d{1,5}$/.test(t)) { target = Number(t); set = true }
  }
  return { entry: es[0], active, at: since.occurred_at, target }
}
/** whether a department's Screens line holds Obs due (W1's rule, as ward2.ts's obsHere): the ward's own words only on a ward; an ICU or
 *  ER that ticks the pack for NEWS2 keeps its own fluid chart (its hourly urine is not summed here) */
export const wardHere = (org: Pick<Organization, 'departments'> | undefined, departmentId: string) =>
  !!org?.departments?.find((d) => d.id === departmentId)?.screens.includes('bedside.obs')
type Here = Pick<SectionInput, 'rec' | 'own' | 'ctx'> & { identity?: SectionInput['identity'] }
/** the open stay, only on a ward (the stay's own department, whoever reads), with that ward's shifts: the same day as the board's tile */
const here = (x: Here) => { const st = openStay(x.rec); const v = x.rec.tables['base.values']
  return st && wardHere(x.ctx.org, st.department_id) ? { st, chart: chartOf(x.own, st.item), ms: measuresOfValues(v, st.item), urines: urineTimes(v?.rows),
    birth: x.identity?.birth_date, s: shiftsIn(x.ctx.org, st.department_id) } : null }
/** "balance aim −1 000 mL" — always signed; never "target 1000" (it reads as a fluid restriction) */
export const targetWords = (t: number | null) => t === null ? 'no balance aim' : `balance aim ${signed(t)} mL`
export const fluidHas = (x: SectionInput) => { const h = here(x); return !!h && (!!h.chart || h.ms.length > 0) }
export function fluidChip(x: SectionInput, now = Date.now()): ChipWord | null {
  const h = here(x); if (!h?.chart) return null
  if (!h.chart.active) return { word: 'stopped' }
  const b = balanceToday(h.ms, h.s, now); return { word: b === null ? 'nothing measured' : `${signed(b)} mL` }
}
export function fluidSummary(x: SectionInput, now = Date.now()): string | null {
  const h = here(x); if (!h?.chart?.active) return null
  const b = balanceToday(h.ms, h.s, now)
  return `${b === null ? 'nothing measured' : `balance ${signed(b)} mL`} since ${dayStart(h.s)} · ${targetWords(h.chart.target)}`
}
/** the banner's word while a chart is on in the open stay: "balance +390 since 08:00" (rank 3: NEWS2, late doses and "times not set"
 *  come first; §3.8) */
export function fluidWords(x: WordsInput, now = Date.now()): BannerWord[] {
  const h = here(x); if (!h?.chart?.active) return []
  const b = balanceToday(h.ms, h.s, now)
  return [{ word: b === null ? `nothing measured since ${dayStart(h.s)}` : `balance ${signed(b)} since ${dayStart(h.s)}`, rank: 3 }]
}

// ── the note under /in and /out ──
export interface FluidNoteLine { text: string; tone?: 'warn' }
/** each fluid draft's words: which shift it counts in; a check on an odd amount; a urine's span since the last measured urine (any
 *  stay, the ICU's hourly urine too) and its mL/kg/h (the record's values; "low" by the patient's age) */
export function fluidNotes(items: readonly Parsed[], ctx: Pick<Ctx, 'record' | 'org' | 'departmentId'>, now: number): FluidNoteLine[] {
  const iso = new Date(now).toISOString(); const s = shiftsIn(ctx.org, ctx.departmentId)
  const where = `counts in ${shiftLabels(s)[placeOf(iso, s).shift]}`; const out: FluidNoteLine[] = []
  for (const p of items) {
    if (p.function !== 'observation') continue
    const d = p.params as { code?: { codings?: { code?: string }[] }; value?: { quantity?: { value?: string } }; method?: string }
    const m = measureOf(d.code?.codings?.[0]?.code, Number(d.value?.quantity?.value), iso, d.method); if (!m) continue
    const odd = m.ml > CHECK_ML ? ` · ${mlWords(m.ml)} mL — check the number`
      : (m.how === 'stool' || m.how === 'vomit') && m.ml < 10 ? ` · a count? /out ${m.how} 200` : ''
    if (!m.urine) { out.push({ text: `${p.line}${odd} · ${where}` }); continue }
    const values = ctx.record?.values ?? []
    const prev = urineBefore(urineTimes(values), iso)
    const wt = latestWeight(values); const kg = wt?.kg ?? null
    // a weight older than a week is dated: a child's old weight overstates the rate
    const wd = wt && now - Date.parse(wt.at) > 7 * 86_400_000 ? ` (weighed ${shortDate(wt.at)})` : ''
    if (!prev) { out.push({ text: `${p.line}${odd} · the first measured urine in 24 h: no rate · ${where}` }); continue }
    const span = `${hm(prev)}–${hm(iso)}, since the last measured urine`
    if (!kg) { out.push({ text: `${p.line}${odd} · ${span} · no weight: /v with the weight gives mL/kg/h · ${where}` }); continue }
    const r = m.ml / hoursBetween(prev, iso) / kg; const low = lowBelow(ctx.record?.patient?.born_on, iso)
    out.push({ text: `${p.line}${odd} · ${span} · ${rateWords(r, low)} at ${kg} kg${wd} · ${where}`, ...(r < low ? { tone: 'warn' as const } : {}) })
  }
  return out
}
