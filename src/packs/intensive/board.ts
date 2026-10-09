// The ICU's words on each bed's tile (spec/openCare.md §5.6; the owner's C1, 2026-10-08): from the board's one read (the op
// intensive.board), in this order, at most one of each: the airway (on a ventilator or NIV and since which day of the stay, off it in
// the last day, else air or oxygen); one infusion (the first vasopressor or inotrope in amber, else the first running); the MAP while a
// pressor runs or when it is under 65; the urine when under 0.5 mL/kg/h over the last hours. Pure.
import type { PresenceRow } from '@core/db/types'
import type { TileCtx, TileWord, TileWords } from '@core/screens/ward/tiles'
import { stayDay } from '@core/screens/chart/model/encounter'
import { hm } from '@core/ui/time'
import { AIRWAY, airwayKind } from './codes'
import { DOSE_WORDS, infusionOf, isPressor, shortOf, unitOf, type DoseUnit } from './unit'

/** what the op says of one stay */
export interface StayWords {
  airway?: { code: string; status: string; since?: string; at: string }
  oxygen?: { on?: string; flow?: string }
  infusions?: { key?: string; drug?: string; dose?: string; unit?: string; rate?: string; at?: string }[]
  map?: { value: number; at: string; measured: boolean }
  urine?: { ml: number; hours: number; kg: number | null }
}
type Running = NonNullable<StayWords['infusions']>[number]
export interface IcuBoard { patient_ids: string[]; stays: Record<string, StayWords> }

const DAY = 24 * 3600_000
const num = (x: unknown) => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(n) ? n : null }
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

function airwayWord(w: StayWords, now: number): string | TileWord | null {
  const a = w.airway; const kind = isObj(a) ? airwayKind(a.code) : null
  if (a && kind && a.status === 'in-progress') {
    const since = typeof a.since === 'string' ? a.since : a.at
    return { text: `${AIRWAY[kind].short} d${stayDay(since, new Date(now).toISOString())}`, tone: 'info' }
  }
  // ended (completed or stopped) in the last day; planned or on hold says nothing of the airway
  if (a && kind && (a.status === 'completed' || a.status === 'stopped') && typeof a.at === 'string' && now - Date.parse(a.at) < DAY) {
    return `${AIRWAY[kind].ended} ${hm(a.at)}`
  }
  const o = isObj(w.oxygen) ? w.oxygen : null
  if (o?.on === 'air') return 'On air'
  if (o?.on === 'oxygen') return num(o.flow) !== null ? `O₂ ${num(o.flow)} L/min` : 'On O₂'
  return null
}

/** the tile's words for this stay, from the board's read; null while it has not answered or says nothing */
export function tileWords(row: PresenceRow, ctx: Pick<TileCtx, 'org' | 'dept'>, data: unknown, now: number): TileWords | null {
  if (!isObj(data) || !isObj(data.stays) || row.kind !== 'stay' || !Object.hasOwn(data.stays, row.item)) return null
  const w = data.stays[row.item]; if (!isObj(w)) return null
  const stay = w as StayWords; const words: (string | TileWord)[] = []
  const air = airwayWord(stay, now); if (air) words.push(air)
  // one infusion: the first pressor by drug name, else the first running
  const unit = unitOf(ctx.org, ctx.dept.id)
  const running = (Array.isArray(stay.infusions) ? stay.infusions : []).filter((i): i is Running => isObj(i))
    .map((i) => ({ i, row: infusionOf(unit, i.key) })).sort((a, b) => (a.i.drug ?? '').localeCompare(b.i.drug ?? ''))
  const pressor = running.find((x) => isPressor(x.row))
  const shown = pressor ?? running[0]
  if (shown) {
    const word = shown.row ? shortOf(shown.row) : String(shown.i.drug ?? shown.i.key ?? '')
    const dose = num(shown.i.dose); const rate = num(shown.i.rate)
    if (pressor) words.push({ text: `${word} ${dose ?? ''}`.trim(), tone: 'warn' })
    else words.push(dose !== null ? `${word} ${dose} ${DOSE_WORDS[shown.i.unit as DoseUnit] ?? shown.i.unit ?? ''}`.trim() : rate !== null ? `${word} ${rate} mL/h` : word)
  }
  // the MAP while a pressor runs, or when it is low
  const map = isObj(stay.map) ? num(stay.map.value) : null
  if (map !== null && (pressor || map < 65)) words.push(map < 65 ? { text: `MAP ${Math.round(map)}`, tone: 'warn' } : `MAP ${Math.round(map)}`)
  // the urine over the last hours, against the weight
  const u = isObj(stay.urine) ? stay.urine : null; const ml = num(u?.ml); const hours = num(u?.hours); const kg = num(u?.kg)
  if (ml !== null && hours !== null && hours >= 2 && kg) {
    const rate = ml / hours / kg
    // near the threshold one more decimal, so a low rate never reads as 0.5
    if (rate < 0.5) words.push({ text: `urine ${rate >= 0.45 ? rate.toFixed(2) : rate.toFixed(1)} mL/kg/h`, tone: 'warn' })
  }
  return words.length ? { words } : null
}
