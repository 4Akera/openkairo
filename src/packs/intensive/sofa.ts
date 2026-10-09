// SOFA at the morning round (spec/openCare.md §5.6, piece I2): each of its six rows filled from the record's worst of the last 24 hours,
// with the words that say where it came from. Nothing is suggested where the record cannot say it: the breathing row (PaO₂ has no code
// in the base's subset, so the blood gas cannot be read), and a GCS when none was scored or one was scored under a sedative. The doctor
// checks each row and changes any; the server adds them up. The earlier SOFAs of the stay in words: admission, yesterday, a date.
// Pure: npm run test:intensive.
import type { ServerEntry, ValueRow } from '@core/db/types'
import { hm, shortDate } from '@core/ui/time'
import { computedMap } from './chart'
import { dayStart, hourOf, plusHours } from './hours'
import { inForce, itemsOf, latestOf, type Item } from './items'
import { infusionOf, shortOf, type UnitInfusion, type UnitSetting } from './unit'

export const SOFA = 'intensive.sofa'
export type SofaItem = 'resp' | 'coag' | 'liver' | 'cardio' | 'cns' | 'renal'
export const SOFA_ITEMS: SofaItem[] = ['resp', 'coag', 'liver', 'cardio', 'cns', 'renal']
/** a row's suggestion (null: the doctor picks it) and the words it rests on; warn: those of them shown in amber */
export interface Evidence { choice: string | null; words: string[]; warn?: string[] }
export interface SofaInput { values: ValueRow[]; infusions: Item[]; unit: UnitSetting; gcs: ServerEntry[]; airway: boolean; fio2: number | null
  oxygen: string | null; since: string; now: string }

const CODE = { plt: 'loinc:777-3', bili: 'loinc:1975-2', creat: 'loinc:2160-0', map: 'loinc:8478-0', urine: 'loinc:9188-4' } as const
export const PAO2_WORDS = 'PaO₂ is not in the record\'s codes yet: score it from the blood gas'
/** a number to at most two decimals, as people write it */
const fmt = (n: number) => String(Math.round(n * 100) / 100)
const band = (v: number, cuts: number[], up: boolean) => {
  // up: the higher the worse (cuts are the lower bounds of 1…4); else the lower the worse (cuts are the lower bounds of 0…3)
  if (up) { let c = 0; cuts.forEach((x, i) => { if (v >= x) c = i + 1 }); return String(c) }
  const i = cuts.findIndex((x) => v >= x); return String(i < 0 ? 4 : i)
}
const worse = (a: string | null, b: string | null) => a === null ? b : b === null ? a : String(Math.max(Number(a), Number(b)))
const num = (x: unknown) => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(n) ? n : null }
const dataOf = (e: ServerEntry | null | undefined): Record<string, unknown> => (e?.data ?? {}) as Record<string, unknown>

/** a value's number in mg/dL: µmol/L by the analyte's factor */
const mgdl = (r: ValueRow, factor: number) => (r.ucum ?? '').toLowerCase() === 'umol/l' ? Number(r.value) / factor : Number(r.value)

/** the versions of an infusion that ran in the window: the one in force at its start and every running one written after it */
function ranIn(it: Item, since: string, now: string): ServerEntry[] {
  const t0 = Date.parse(since); const t1 = Date.parse(now)
  const out = [inForce(it, since), ...it.versions.filter((v) => { const t = Date.parse(v.occurred_at); return t >= t0 && t <= t1 })]
  return out.filter((v): v is ServerEntry => !!v && dataOf(v).status === 'running')
}
const rowOf = (it: Item, unit: UnitSetting): UnitInfusion | null => infusionOf(unit, String(dataOf(it.versions[0]).key ?? ''))

function cardio(x: SofaInput, inWindow: (r: ValueRow) => boolean): Evidence {
  const most: Partial<Record<NonNullable<UnitInfusion['sofa']>, { dose: number; name: string }>> = {}
  for (const it of x.infusions) {
    const row = rowOf(it, x.unit); if (!row?.sofa) continue
    for (const v of ranIn(it, x.since, x.now)) {
      const d = dataOf(v); const dose = num((d.dose as { value?: unknown } | undefined)?.value)
      // a pump at 0 gives nothing: no point for a drug not given
      if (d.dose_unit !== 'ug/kg/min' || dose === null || dose <= 0) continue
      if (!most[row.sofa] || most[row.sofa]!.dose < dose) most[row.sofa] = { dose, name: shortOf(row) }
    }
  }
  const dose = (k: keyof typeof most) => most[k]?.dose
  const drugs = Object.values(most)
  if (drugs.length) {
    const nor = dose('noradrenaline'); const adr = dose('adrenaline'); const dop = dose('dopamine')
    const choice = (dop ?? 0) > 15 || (adr ?? 0) > 0.1 || (nor ?? 0) > 0.1 ? '4' : (dop ?? 0) > 5 || adr !== undefined || nor !== undefined ? '3' : '2'
    return { choice, words: drugs.map((m) => `${m.name} ${fmt(m.dose)} µg/kg/min, the most in 24 h`) }
  }
  // no pressor: the lowest MAP, typed or worked out from a blood pressure
  const maps: { v: number; at: string }[] = x.values.filter((r) => r.code === CODE.map && inWindow(r)).map((r) => ({ v: Number(r.value), at: r.at }))
  const bp = new Map<string, { sys?: number; dia?: number; at: string }>()
  for (const r of x.values) {
    if (!inWindow(r) || (r.key !== 'bp.sys' && r.key !== 'bp.dia')) continue
    const b = bp.get(r.entry_id) ?? { at: r.at }; if (r.key === 'bp.sys') b.sys = Number(r.value); else b.dia = Number(r.value); bp.set(r.entry_id, b)
  }
  for (const b of bp.values()) if (b.sys !== undefined && b.dia !== undefined) maps.push({ v: computedMap(b.sys, b.dia), at: b.at })
  if (!maps.length) return { choice: null, words: ['no MAP or blood pressure in 24 h'] }
  const low = maps.reduce((a, b) => b.v < a.v ? b : a)
  return { choice: low.v < 70 ? '1' : '0', words: [`MAP ${fmt(low.v)} at ${hm(low.at)}`] }
}

function renal(x: SofaInput, inWindow: (r: ValueRow) => boolean): Evidence {
  const words: string[] = []; let choice: string | null = null
  const cr = x.values.filter((r) => r.code === CODE.creat && inWindow(r))
  if (cr.length) {
    const top = cr.reduce((a, b) => mgdl(b, 88.4) > mgdl(a, 88.4) ? b : a); const v = mgdl(top, 88.4)
    choice = band(v, [1.2, 2.0, 3.5, 5.0], true); words.push(`creatinine ${fmt(v)} mg/dL at ${hm(top.at)}`)
  } else words.push('no creatinine in 24 h')
  // the day's urine only when each of the 24 whole hours before the current one is charted (an hour's value is kept at the hour's start,
  // and the current hour is still being typed): a part of a day is never held to a day's limits
  const t1 = Date.parse(hourOf(x.now)); const t0 = t1 - 24 * 3600_000; const hours = new Map<string, number>()
  for (const r of x.values) {
    const t = Date.parse(r.at); if (r.code !== CODE.urine || !(t >= t0 && t < t1)) continue
    const h = hourOf(r.at); hours.set(h, (hours.get(h) ?? 0) + Number(r.value))
  }
  if (hours.size >= 24) {
    const ml = [...hours.values()].reduce((a, b) => a + b, 0)
    choice = worse(choice, ml < 200 ? '4' : ml < 500 ? '3' : null); words.push(`urine ${fmt(ml)} mL in 24 h`)
  } else if (hours.size > 0) words.push(`urine charted ${hours.size} of 24 hours: not enough to score`)
  return { choice, words }
}

/** each row's suggestion from the record's worst of the window [since, now], and its words */
export function sofaFrom(x: SofaInput): Record<SofaItem, Evidence> {
  const t0 = Date.parse(x.since); const t1 = Date.parse(x.now)
  const inWindow = (r: { at: string }) => { const t = Date.parse(r.at); return t >= t0 && t <= t1 }
  // platelets: the lowest
  const plt = x.values.filter((r) => r.code === CODE.plt && inWindow(r))
  const low = plt.length ? plt.reduce((a, b) => Number(b.value) < Number(a.value) ? b : a) : null
  const coag: Evidence = low ? { choice: band(Number(low.value), [150, 100, 50, 20], false), words: [`Platelets ${fmt(Number(low.value))} ×10³/µL at ${hm(low.at)}`] }
    : { choice: null, words: ['no platelets in 24 h'] }
  // bilirubin: the highest
  const bili = x.values.filter((r) => r.code === CODE.bili && inWindow(r))
  const top = bili.length ? bili.reduce((a, b) => mgdl(b, 17.1) > mgdl(a, 17.1) ? b : a) : null
  const liver: Evidence = top ? { choice: band(mgdl(top, 17.1), [1.2, 2.0, 6.0, 12.0], true), words: [`Bilirubin ${fmt(mgdl(top, 17.1))} mg/dL at ${hm(top.at)}`] }
    : { choice: null, words: ['no bilirubin in 24 h'] }
  // GCS: the lowest scored; under a sedative it is shown but not chosen, since SOFA scores the GCS before sedation
  const gcs = x.gcs.filter((e) => dataOf(e).score === 'gcs' && inWindow({ at: e.occurred_at }) && num(dataOf(e).total) !== null)
  const g = gcs.length ? gcs.reduce((a, b) => num(dataOf(b).total)! < num(dataOf(a).total)! ? b : a) : null
  const gt = g ? num(dataOf(g).total)! : null
  const cns: Evidence = g && gt !== null ? { choice: gt >= 15 ? '0' : gt >= 13 ? '1' : gt >= 10 ? '2' : gt >= 6 ? '3' : '4', words: [`GCS ${gt} at ${hm(g.occurred_at)}`] }
    : { choice: null, words: ['no GCS in 24 h'] }
  const sedative = x.infusions.map((it) => ({ it, row: rowOf(it, x.unit) })).find((s) => s.row?.kind === 'sedative' && ranIn(s.it, x.since, x.now).length > 0)
  if (sedative?.row) { const w = `sedated (${shortOf(sedative.row)}): score the GCS before sedation`; cns.choice = null; cns.words.push(w); cns.warn = [w] }
  // breathing: never suggested
  const support = x.airway ? `on the ventilator${x.fio2 !== null ? `, FiO₂ ${fmt(x.fio2)} %` : ''}`
    : x.oxygen ? `on ${x.oxygen === 'Air' ? 'air' : x.oxygen}` : null
  const resp: Evidence = { choice: null, words: [...(support ? [support] : []), PAO2_WORDS], warn: [PAO2_WORDS] }
  return { resp, coag, liver, cardio: cardio(x, inWindow), cns, renal: renal(x, inWindow) }
}

/** the suggestions as the score card's inputs: only the rows the record supports */
export const suggested = (ev: Record<SofaItem, Evidence>): Record<string, string> =>
  Object.fromEntries(SOFA_ITEMS.filter((k) => ev[k].choice !== null).map((k) => [k, ev[k].choice!]))

/** the stay's SOFAs, the newest first: the first of the stay is 'admission', one in the ICU day before 'yesterday', else its date */
export function sofaHistory(scores: ServerEntry[], now: string, dayStarts = 8): { total: number; at: string; words: string; entry: string }[] {
  const all = itemsOf(scores).map(latestOf).filter((e) => e.type === 'score' && dataOf(e).score === SOFA && num(dataOf(e).total) !== null)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  const today = Date.parse(dayStart(now, dayStarts)); const yesterday = Date.parse(plusHours(dayStart(now, dayStarts), -24))
  return all.map((e, i) => {
    const t = Date.parse(e.occurred_at)
    return { total: num(dataOf(e).total)!, at: e.occurred_at, entry: e.id, words: i === 0 ? 'admission' : t >= yesterday && t < today ? 'yesterday' : shortDate(e.occurred_at) }
  }).reverse()
}
