// /v's words (spec 05, §4.7): the vitals typed on one line, moved here out of parse.ts. A BP first, then pulse, temperature, weight and
// SpO₂ by position, or any of them by name (p 84 t 37.2 w 86 h 170 spo2 98 rr 16). Since the owner's Q5 (2026-10-08) the base's vitals
// also hold air or oxygen (air · oxygen 2l nasal · venturi fio2 28) and the patient's ACVPU (alert, confused, voice, pain, unresponsive).
// The draft's params stay flat; its line follows them in one fixed order. Pure: npm run test:composer.
import type { Vitals } from '../../db/shapes.generated'
import type { Result } from './parse'

/** ACVPU: Alert · new Confusion · Voice · Pain · Unresponsive */
export type Acvpu = 'a' | 'c' | 'v' | 'p' | 'u'
export const ACVPU: Record<Acvpu, string> = { a: 'Alert', c: 'New confusion', v: 'Voice', p: 'Pain', u: 'Unresponsive' }
export type O2Device = NonNullable<NonNullable<Vitals['oxygen']>['device']>
/** the devices for oxygen in the card's order, in the words the base's line uses (base.o2_device) */
export const O2_DEVICES: readonly (readonly [O2Device, string])[] = [['nasal_cannula', 'nasal cannula'], ['simple_mask', 'simple mask'], ['venturi_mask', 'Venturi mask'],
  ['reservoir_mask', 'reservoir mask'], ['humidified', 'humidified'], ['high_flow_nasal', 'high-flow nasal'], ['tracheostomy_mask', 'tracheostomy mask'], ['cpap', 'CPAP'],
  ['niv', 'NIV'], ['other', 'another device']]
/** a device in words (none: null) */
export const deviceWords = (d: unknown): string | null => O2_DEVICES.find(([k]) => k === d)?.[1] ?? null

/** a word's meaning in a table: only the table's own words (never "constructor" or "__proto__") */
const own = <T>(table: Record<string, T>, w: string): T | undefined => Object.hasOwn(table, w) ? table[w] : undefined
const NAMED: Record<string, [string, string]> = {
  p: ['pulse', 'P'], hr: ['pulse', 'P'], pulse: ['pulse', 'P'], t: ['temperature', 'T'], temp: ['temperature', 'T'],
  w: ['weight', 'Wt'], wt: ['weight', 'Wt'], weight: ['weight', 'Wt'], h: ['height', 'Ht'], ht: ['height', 'Ht'], height: ['height', 'Ht'],
  spo2: ['spo2', 'SpO₂'], sat: ['spo2', 'SpO₂'], sats: ['spo2', 'SpO₂'], rr: ['respiratory_rate', 'RR'],
}
const WORDS: Record<string, Acvpu> = { a: 'a', alert: 'a', c: 'c', confused: 'c', confusion: 'c', v: 'v', voice: 'v', pain: 'p', u: 'u', unresponsive: 'u' }
const AIR: Record<string, 'air' | 'oxygen'> = { air: 'air', oxygen: 'oxygen', ox: 'oxygen' }
const DEVICE: Record<string, O2Device> = { nasal: 'nasal_cannula', nc: 'nasal_cannula', cannula: 'nasal_cannula', mask: 'simple_mask', simple: 'simple_mask',
  venturi: 'venturi_mask', reservoir: 'reservoir_mask', nrb: 'reservoir_mask', humidified: 'humidified', hfno: 'high_flow_nasal', hfnc: 'high_flow_nasal',
  'high-flow': 'high_flow_nasal', trach: 'tracheostomy_mask', tracheostomy: 'tracheostomy_mask', cpap: 'cpap', niv: 'niv', bipap: 'niv' }
/** a word that is also part of another device's name ("venturi mask", "mask venturi", "high-flow nasal"): the other device, in either order */
const PART: Record<string, (d: O2Device) => boolean> = { mask: (d) => d.endsWith('_mask'), nasal: (d) => d === 'high_flow_nasal' || d === 'nasal_cannula' }
const POSITIONAL: [string, string, number, number][] = [['pulse', 'P', 20, 250], ['temperature', 'T', 30, 45], ['weight', 'Wt', 1, 400], ['spo2', 'SpO₂', 50, 100]]
const NUMBER = /^\d+(\.\d+)?$/
const FLOW = /^(\d+(?:\.\d+)?)(l|lpm|l\/min)$/
const EXAMPLE = 'Try bp 140/90 p 80 t 37 w 70 h 170 spo2 98 rr 16 · air, or oxygen 2l nasal · alert'

/** the words after /v → the vitals draft (null: nothing typed) */
export function parseVitals(words: string[]): Result {
  const params: Record<string, number | string> = {}; let pos = -1; let afterTemp = false
  let said: 'air' | 'oxygen' | undefined; let device: O2Device | undefined; let part: string | undefined; let flow: number | undefined; let fio2: number | undefined
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase(); const justTemp = afterTemp; afterTemp = false
    if (!w || w === 'vitals') continue
    if (pos >= 0 && NUMBER.test(w)) {                    // 148/92 84 37 86: after a BP, bare numbers go in order
      const n = Number(w)
      while (pos < POSITIONAL.length && params[POSITIONAL[pos][0]] !== undefined) pos++
      if (pos >= POSITIONAL.length) return { error: `Too many numbers after the BP: ${w}` }
      const [k, l, lo, hi] = POSITIONAL[pos]
      if (n < lo || n > hi) return { error: `${l} ${n} is not plausible — type it with its name (e.g. ${l.toLowerCase().replace('₂', '2')} ${n})` }
      params[k] = n; pos++; afterTemp = k === 'temperature'; continue
    }
    if (w === 'pain' && NUMBER.test(words[i + 1] ?? '')) return { error: `pain ${words[i + 1]}: ACVPU's P is pain on its own — a pain score is not typed on /v` }
    const ac = own(WORDS, w)
    if (ac) {
      if (w === 'c' && justTemp) return { error: 'c after the temperature: °C goes without saying — for new confusion type confused' }
      if (params.consciousness !== undefined) return { error: 'ACVPU said twice' }
      params.consciousness = ac; continue
    }
    if (w === 'o2') return { error: 'o2: type spo2 94 for the saturation, or oxygen (oxygen 2l) for oxygen' }
    const ox = own(AIR, w)
    if (ox) { if (said) return { error: 'Air or oxygen said twice' }; said = ox; continue }
    const dv = own(DEVICE, w)
    if (dv) {
      // "nasal cannula", "venturi mask", "mask venturi", "simple mask": one device in two words
      if (!device || device === dv) { part = own(PART, w) ? (device ? part : w) : undefined; device = dv; continue }   // part: said only in part so far
      if (own(PART, w)?.(device)) continue
      if (part && PART[part](dv)) { device = dv; part = undefined; continue }
      return { error: 'Two oxygen devices: say one' }
    }
    const fl = w.match(FLOW)
    if (fl || w === 'flow') {
      const raw = fl ? fl[1] : words[i + 1]
      if (!fl && (raw === undefined || !NUMBER.test(raw))) return { error: 'Oxygen flow needs a number' }
      if (!fl) i++
      if (flow !== undefined) return { error: 'Oxygen flow said twice' }
      const n = Number(raw); if (n < 0.5 || n > 60) return { error: `Oxygen flow ${n} L/min is not plausible` }
      flow = n; continue
    }
    if (w === 'fio2') {
      const raw = words[i + 1]
      if (raw === undefined || !NUMBER.test(raw)) return { error: 'FiO₂ needs a number' }
      i++
      if (fio2 !== undefined) return { error: 'FiO₂ said twice' }
      const n = Number(raw)
      if (n >= 0.21 && n <= 1) return { error: 'FiO₂ is a percentage: fio2 40' }
      if (!Number.isInteger(n) || n < 21 || n > 100) return { error: `FiO₂ ${n} is not plausible` }
      fio2 = n; continue
    }
    const bp = (w === 'bp' ? words[++i]?.toLowerCase() ?? '' : w).match(/^(\d{2,3})\/(\d{2,3})$/)
    if (bp) { params.systolic = +bp[1]; params.diastolic = +bp[2]; pos = 0; continue }
    const glued = w.match(/^([a-z]+[a-z0-9]*?)(\d+(?:\.\d+)?)$/)          // p84 · t37.2 · spo2 is a key, so check key first
    const key = own(NAMED, w) ? w : glued && own(NAMED, glued[1]) ? glued[1] : null
    if (!key) return { error: `Not a vital: “${words[i]}”. ${EXAMPLE}` }
    const raw = own(NAMED, w) ? words[++i] : glued![2]
    const n = Number(raw); if (raw === undefined || Number.isNaN(n)) return { error: `${NAMED[key][1]} needs a number` }
    params[NAMED[key][0]] = n; afterTemp = NAMED[key][0] === 'temperature'
  }
  const oxygen = said ?? (device || flow !== undefined || fio2 !== undefined ? 'oxygen' : undefined)
  if (said === 'air' && (device || flow !== undefined || fio2 !== undefined)) return { error: 'Air and oxygen at once: say air, or the oxygen (oxygen 2l nasal)' }
  if (oxygen) params.oxygen = oxygen
  if (device) params.o2_device = device
  if (flow !== undefined) params.o2_flow = flow
  if (fio2 !== undefined) params.fio2 = fio2
  if (!Object.keys(params).length) return null
  return { ok: [{ function: 'vitals', params, line: vitalsWords(params), kind: 'vitals' }] }
}

/** air or oxygen in words: Air, or O₂ with its flow, its device and FiO₂ */
function oxygenWords(q: Record<string, unknown>): string | null {
  if (q.oxygen === 'air') return 'Air'
  if (q.oxygen !== 'oxygen') return null
  return ['O₂', q.o2_flow != null ? `${q.o2_flow} L/min` : null, deviceWords(q.o2_device), q.fio2 != null ? `FiO₂ ${q.fio2}%` : null].filter(Boolean).join(' ')
}
/** the vitals draft's one line, from its fields: BP · P · T · Wt · Ht · SpO₂ · air or oxygen · RR · ACVPU */
export function vitalsWords(q: Record<string, unknown>): string {
  const num = (k: string, l: string) => q[k] != null ? `${l} ${q[k]}` : null
  return [q.systolic != null ? `BP ${q.systolic}/${q.diastolic ?? '?'}` : null, num('pulse', 'P'), num('temperature', 'T'), num('weight', 'Wt'), num('height', 'Ht'),
    num('spo2', 'SpO₂'), oxygenWords(q), num('respiratory_rate', 'RR'), typeof q.consciousness === 'string' && q.consciousness ? `ACVPU ${q.consciousness.toUpperCase()}` : null]
    .filter(Boolean).join(' · ')
}
