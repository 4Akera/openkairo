// Ward nursing's one line (spec/openCare.md §5.6, piece 1): /obs 105/68 104 38.4 94 22 air a. The BP first, then pulse, temperature,
// SpO₂ and respiration rate by position (or each by its name, in any order), air or oxygen, and the patient's ACVPU; s2 for SpO₂
// scale 2. One line gives two drafts: the base's vitals, and the base's score for NEWS2 with what the line said. The server adds
// NEWS2 up; the core's score card asks for what the line left out. Under the cards, one line says what to do (RCP 2017's response:
// a notice, never a stop). Pure: npm run test:bedside.
import { lineOf, type Ctx, type Parsed, type Result } from '@core/screens/visit/parse'
import { current, draft, offered, tableOf, type Inputs, type ScoreParams } from '@core/screens/visit/score'

export const NEWS2 = 'bedside.news2'
export const NEWS2_S2 = 'bedside.news2_s2'
export type Oxygen = 'air' | 'oxygen'
export type Acvpu = 'a' | 'c' | 'v' | 'p' | 'u'

/** SpO₂ scale 2's answer for a saturation: from 93 % up it depends on air or oxygen (not yet known: undefined, the card asks) */
export function scale2Choice(spo2: number, oxygen?: Oxygen): string | undefined {
  if (spo2 < 84) return 'le83'
  if (spo2 < 86) return '84_85'
  if (spo2 < 88) return '86_87'
  if (spo2 < 93) return '88_92'
  if (oxygen === 'air') return 'ge93_air'
  if (oxygen !== 'oxygen') return undefined
  return spo2 < 95 ? '93_94_o2' : spo2 < 97 ? '95_96_o2' : 'ge97_o2'
}

type Key = 'pulse' | 'temperature' | 'spo2' | 'respiratory_rate'
/** each value: its label in an error, its name, what is plausible, and whether it is a whole number */
const VALUE: Record<Key, { label: string; name: string; lo: number; hi: number; whole: boolean }> = {
  pulse: { label: 'P', name: 'p', lo: 20, hi: 250, whole: true }, temperature: { label: 'T', name: 't', lo: 30, hi: 45, whole: false },
  spo2: { label: 'SpO₂', name: 'spo2', lo: 50, hi: 100, whole: true }, respiratory_rate: { label: 'RR', name: 'rr', lo: 3, hi: 60, whole: true } }
/** a value by its name: the vitals key */
const NAMED: Record<string, Key> = { p: 'pulse', hr: 'pulse', pulse: 'pulse', t: 'temperature', temp: 'temperature', spo2: 'spo2', sat: 'spo2', sats: 'spo2',
  rr: 'respiratory_rate' }
/** after the BP, bare numbers in this order */
const SLOTS: Key[] = ['pulse', 'temperature', 'spo2', 'respiratory_rate']
const ORDER = 'after the BP the order is P T SpO₂ RR'
const ACVPU: Record<string, Acvpu> = { a: 'a', alert: 'a', c: 'c', confused: 'c', confusion: 'c', v: 'v', voice: 'v', pain: 'p', u: 'u', unresponsive: 'u' }
const OXYGEN: Record<string, Oxygen> = { air: 'air', oxygen: 'oxygen', ox: 'oxygen' }
/** a word's meaning in a table: only the table's own words (never "constructor" or "__proto__") */
const own = <T>(table: Record<string, T>, w: string): T | undefined => Object.hasOwn(table, w) ? table[w] : undefined
const NUMBER = /^\d+(\.\d+)?$/
const BP = /^(\d{2,3})\/(\d{2,3})$/
const GLUED = /^(spo2|sats|sat|pulse|temp|hr|rr|p|t)(\d+(?:\.\d+)?)$/
const EXAMPLE = '/obs 105/68 104 38.4 94 22 air a'

/** the text after /obs → the vitals draft and the NEWS2 draft (null: no number typed yet) */
export function obsLine(rest: string, ctx: Pick<Ctx, 'scores' | 'packs'>): Result {
  const words = rest.toLowerCase().split(/\s+/).filter(Boolean)
  const v: Partial<Record<Key | 'systolic' | 'diastolic', number>> = {}
  let s2 = false; let oxygen: Oxygen | undefined; let acvpu: Acvpu | undefined; let bp = false; let pos = 0
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === 's2' || w === 'scale2') { s2 = true; continue }
    const ox = own(OXYGEN, w)
    if (ox) { if (oxygen) return { error: 'Air or oxygen said twice' }; oxygen = ox; continue }
    const ac = own(ACVPU, w)
    if (ac) { if (acvpu) return { error: 'ACVPU said twice' }; acvpu = ac; continue }
    if (w === 'o2') return { error: 'o2: type spo2 94 for the saturation, or oxygen when the patient is on oxygen' }
    const b = (w === 'bp' ? words[i + 1] ?? '' : w).match(BP)
    if (w === 'bp' && !b) return { error: 'BP needs both sides: bp 120/80' }
    if (b) { if (bp) return { error: 'BP said twice' }; if (w === 'bp') i++; v.systolic = +b[1]; v.diastolic = +b[2]; bp = true; continue }
    const glued = w.match(GLUED); const named = own(NAMED, w) ?? (glued ? NAMED[glued[1]] : undefined)
    if (named) {
      const { label, lo, hi, whole } = VALUE[named]
      const raw = glued ? glued[2] : words[i + 1]
      if (raw === undefined || !NUMBER.test(raw)) return { error: `${label} needs a number` }
      if (!glued) i++
      if (v[named] !== undefined) return { error: `${label} said twice` }
      const n = Number(raw)
      if (whole && !Number.isInteger(n)) return { error: `${label} ${raw} is not a whole number` }
      if (n < lo || n > hi) return { error: `${label} ${n} is not plausible` }
      v[named] = n; continue
    }
    if (NUMBER.test(w)) {
      const n = Number(w)
      if (!bp) return { error: `${w}: type the BP first (105/68 104 38.4 94 22), or say what it is (p ${w})` }
      while (pos < SLOTS.length && v[SLOTS[pos]] !== undefined) pos++
      if (pos >= SLOTS.length) return { error: `Too many numbers after the BP: ${w}` }
      const key = SLOTS[pos]; const { label, lo, hi, whole } = VALUE[key]
      if (whole && !Number.isInteger(n)) return { error: v.temperature === undefined ? `${w} in the ${label} place: ${ORDER} — or name it (t ${w})` : `${label} ${w} is not a whole number` }
      if (n < lo || n > hi) return { error: `${label} ${n} is not plausible — ${ORDER}, or name each value (p 104 t 38.4 spo2 94 rr 22)` }
      v[key] = n; pos++; continue
    }
    return { error: `Not an obs: “${w}”. Try ${EXAMPLE}` }
  }
  if (!Object.keys(v).length) return null
  const t = offered(ctx.scores, ctx.packs).find((x) => x.key === (s2 ? NEWS2_S2 : NEWS2))
  if (!t) return { error: 'NEWS2 is not declared here: Settings → Scores' }
  const params: Record<string, number> = {}
  for (const k of ['systolic', 'diastolic', 'pulse', 'temperature', 'spo2', 'respiratory_rate'] as const) if (v[k] !== undefined) params[k] = v[k]!
  const vitals: Parsed = { function: 'vitals', kind: 'vitals', action: 'write:vitals', params, line: lineOf({ function: 'vitals', kind: 'vitals', params, line: '' }) }
  const inputs: Inputs = {}
  const put = (k: string, n: number | undefined) => { if (n !== undefined) inputs[k] = String(n) }
  put('rr', v.respiratory_rate)
  if (!s2) put('spo2', v.spo2)
  else if (v.spo2 !== undefined) { const c = scale2Choice(v.spo2, oxygen); if (c) inputs.spo2_s2 = c }
  if (oxygen) inputs.oxygen = oxygen
  put('sbp', v.systolic); put('pulse', v.pulse)
  if (acvpu) inputs.consciousness = acvpu
  put('temp', v.temperature)
  return { ok: [vitals, draft(t, inputs)] }
}

export interface ObsNote { text: string; tone?: 'warn' | 'danger' }
/** the score input each vitals key answers, and its word in the differ line */
const SAME: [string, string, string][] = [['respiratory_rate', 'rr', 'Respiration rate'], ['systolic', 'sbp', 'Systolic BP'], ['pulse', 'pulse', 'Pulse'],
  ['temperature', 'temp', 'Temperature'], ['spo2', 'spo2', 'SpO₂']]
const en = (l?: Record<string, string>) => l?.en ?? ''

/** the lines under the cards: scale 2's reminder, pregnancy's caution, a number the two cards no longer agree on, and once the server
 *  has added it up, RCP 2017's response for the total */
export function obsNotes(items: Parsed[], ctx: Pick<Ctx, 'scores' | 'facts'>): ObsNote[] {
  const out: ObsNote[] = []
  const sp = items.find((x) => x.function === 'score' && (x.params.score === NEWS2 || x.params.score === NEWS2_S2))
  const p = sp?.params as unknown as ScoreParams | undefined
  const vit = items.find((x) => x.function === 'vitals')?.params as Record<string, unknown> | undefined
  if (p?.score === NEWS2_S2) out.push({ text: 'SpO₂ scale 2: only for a patient whose doctor set a target of 88–92 % (hypercapnic respiratory failure)' })
  if (ctx.facts?.pregnancy?.data.pregnant === true) out.push({ text: 'Pregnant: NEWS2 is not made for pregnancy — read it with care', tone: 'warn' })
  if (p && vit) for (const [vk, sk, label] of SAME) {
    if (sk === 'spo2' && p.score !== NEWS2) continue
    const a = given(vit[vk]) ? vit[vk] : undefined; const b = typeof p.inputs[sk] === 'string' ? p.inputs[sk] : undefined
    if (a === undefined && b === undefined) continue
    if (a === undefined) out.push({ text: `The ${label} is on NEWS2 (${b}) but not on the vitals: type the line again`, tone: 'warn' })
    else if (b === undefined) out.push({ text: `The ${label} is on the vitals (${a}) but not on NEWS2: type the line again`, tone: 'warn' })
    else if (Number(a) !== Number(b)) out.push({ text: `The ${label} on the vitals (${a}) and on NEWS2 (${b}) differ: type the line again`, tone: 'warn' })
  }
  if (p?.score === NEWS2_S2) out.push(...scale2Notes(p, vit, ctx))
  if (p && current(p) && p.result?.complete) out.push(response(p, ctx))
  return out
}

const given = (x: unknown) => x != null && x !== ''
/** scale 2's answer against air or oxygen, and against the saturation on the vitals: the one choice holds both, so they can part */
function scale2Notes(p: ScoreParams, vit: Record<string, unknown> | undefined, ctx: Pick<Ctx, 'scores'>): ObsNote[] {
  const out: ObsNote[] = []; const c = p.inputs.spo2_s2; const ox = p.inputs.oxygen
  const choice = typeof c === 'string' ? c : undefined
  const words = (k: string, value: string) => en(tableOf(ctx.scores, p.score, p.version)?.items.find((x) => x.key === k)?.choices?.find((x) => x.value === value)?.labels) || value
  if (choice && ((choice === 'ge93_air' && ox === 'oxygen') || (choice.endsWith('_o2') && ox === 'air')))
    return [{ text: `NEWS2's SpO₂ answer (${words('spo2_s2', choice)}) does not fit its air or oxygen answer (${words('oxygen', String(ox))}): choose again`, tone: 'warn' }]
  const n = vit && given(vit.spo2) ? Number(vit.spo2) : undefined
  if (n === undefined) { if (choice) out.push({ text: `The SpO₂ is on NEWS2 (${words('spo2_s2', choice)}) but not on the vitals: type the line again`, tone: 'warn' }) }
  else if (choice) {
    const want = scale2Choice(n, ox === 'air' || ox === 'oxygen' ? ox : undefined)
    if (want !== undefined && want !== choice)
      out.push({ text: `The SpO₂ on the vitals (${n}) and NEWS2's scale 2 answer (${words('spo2_s2', choice)}) differ: type the line again`, tone: 'warn' })
  }
  return out
}

/** RCP 2017's response to a total (piece 4 gives the ward its own) */
function response(p: ScoreParams, ctx: Pick<Ctx, 'scores'>): ObsNote {
  const r = p.result!; const t = r.total ?? 0; const band = r.band?.key
  if (band === 'high') return { text: `NEWS2 ${t} · high · emergency response: watch continuously; tell the doctor now; think of ICU`, tone: 'danger' }
  if (band === 'medium') return { text: `NEWS2 ${t} · medium · urgent response: obs every hour; tell the doctor now`, tone: 'warn' }
  const threes = r.items.filter((i) => i.points === 3)
  if (threes.length) {
    const table = tableOf(ctx.scores, p.score, p.version)
    const names = threes.map((i) => en(table?.items.find((x) => x.key === i.key)?.labels) || i.key)
    return { text: `3 in one sign (${names.join(', ')}) · obs every hour; tell the doctor caring for the patient`, tone: 'warn' }
  }
  if (t === 0) return { text: 'NEWS2 0 · obs at least every 12 hours' }
  return { text: `NEWS2 ${t} · low · obs every 4–6 hours; tell the nurse in charge` }
}
