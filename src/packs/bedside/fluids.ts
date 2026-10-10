// Ward nursing's fluid in and out (spec/openCare.md §5.6, W2). /in and /out write the base's own observation, with the LOINC codes and
// the mL the owner approved (B1): fluid in is 9103-3 (the route, iv, oral or tube, in method), urine 9187-6, any other output 9257-7 (the
// drain, tube, vomit or stool in method). The base's observation, not a ward type, so the ICU and the ward keep one fluid record per
// patient: a ward patient's urine is the ICU's after a transfer, and back. /fluids starts, re-aims or stops the stay's fluid chart, the
// pack's own bedside.fluid_chart, with the day's balance aim always signed. Any amount from 0 up lands, a decimal and a large one too: a
// measure is a fact; only a missing number or route asks what to type. Pure: npm run test:fluids.
import type { EntryData } from '@core/db/shapes.generated'
import type { Result } from '@core/screens/visit/parse'

export const LOINC_IN = '9103-3'; export const LOINC_URINE = '9187-6'; export const LOINC_OUT = '9257-7'
/** the three codes as the record keys them (base.values' code, core.entries' codes) */
export const FLUID_CODES: readonly string[] = [`loinc:${LOINC_IN}`, `loinc:${LOINC_URINE}`, `loinc:${LOINC_OUT}`]
const DISPLAY: Record<string, string> = { [LOINC_IN]: 'Fluid intake total Measured', [LOINC_URINE]: 'Urine output', [LOINC_OUT]: 'Fluid output total Measured' }
export type InHow = 'iv' | 'oral' | 'tube'
export type OutWhat = 'urine' | 'drain' | 'tube' | 'vomit' | 'stool'
const IN_WORDS: Record<string, InHow> = { iv: 'iv', ivf: 'iv', drip: 'iv', infusion: 'iv', oral: 'oral', po: 'oral', mouth: 'oral', drink: 'oral',
  tube: 'tube', ng: 'tube', ngt: 'tube', peg: 'tube', feed: 'tube' }
const OUT_WORDS: Record<string, OutWhat> = { urine: 'urine', u: 'urine', pu: 'urine', drain: 'drain', tube: 'tube', ng: 'tube', ngt: 'tube', aspirate: 'tube',
  vomit: 'vomit', vomitus: 'vomit', emesis: 'vomit', stool: 'stool', stools: 'stool', bo: 'stool', diarrhoea: 'stool', diarrhea: 'stool' }
/** the chart's row words */
export const IN_LABEL: Record<string, string> = { iv: 'IV fluids', oral: 'By mouth', tube: 'By tube', other: 'Other' }
export const OUT_LABEL: Record<string, string> = { urine: 'Urine', drain: 'Drain', tube: 'Tube (NG)', vomit: 'Vomit', stool: 'Stool', other: 'Other' }
const TEXT_IN: Record<InHow, string> = { iv: 'Fluid in · IV', oral: 'Fluid in · by mouth', tube: 'Fluid in · by tube' }
const TEXT_OUT: Record<OutWhat, string> = { urine: 'Urine', drain: 'Fluid out · drain', tube: 'Fluid out · tube', vomit: 'Fluid out · vomit', stool: 'Fluid out · stool' }
/** above this, the note says "check the number" (a 24 h bag, a large ascitic drain): words, never a refusal */
export const CHECK_ML = 5000

/** one measure as the base's observation: its LOINC code, mL, the route or kind in method (none for urine), the words left in note */
export function fluidData(dir: 'in' | 'out', how: InHow | OutWhat, ml: number, note?: string): EntryData['observation'] {
  const code = dir === 'in' ? LOINC_IN : how === 'urine' ? LOINC_URINE : LOINC_OUT
  return { code: { text: dir === 'in' ? TEXT_IN[how as InHow] : TEXT_OUT[how as OutWhat], codings: [{ system: 'loinc', code, display: DISPLAY[code] }] },
    value: { quantity: { value: String(ml), unit: 'mL', ucum: 'mL' } }, ...(how === 'urine' ? {} : { method: how }), ...(note ? { note } : {}) }
}
/** "Fluid in · IV 250 mL · ns" */
export const fluidLine = (d: EntryData['observation']) => `${d.code.text} ${d.value.quantity?.value ?? ''} mL${d.note ? ` · ${d.note}` : ''}`
const ML = /^(\d+(?:\.\d+)?)(ml)?$/i
/** litres typed: "1 L", "1.5l", "litre" — the amount is asked in mL, never read as 1 mL */
const LITRE = /^(\d+(?:\.\d+)?)?(l|litres?|liters?)$/i
type Words = { error: string } | { ml: number | null; raw: string; how: string | null; note: string }
function words(rest: string, known: Record<string, string>, eg: string): Words {
  let ml: number | null = null; let raw = ''; let how: string | null = null; const note: string[] = []
  for (const w of rest.trim().split(/\s+/).filter(Boolean)) {
    const k = w.toLowerCase(); const m = w.match(ML)
    if (LITRE.test(w)) return { error: `Type the amount in mL: ${eg.replace(/\d+/, '1000')}` }
    // a second number is never put in the note silently ("ns 0.9 500" is not 0.9 mL; "drain 2 150" not 2 mL)
    if (m && ml !== null) return { error: `Two numbers: type the mL once, the rest as words: ${eg.startsWith('/in') ? '/in 500 iv NS 0.9%' : '/out drain 150 left drain'}` }
    if (m) { ml = Number(m[1]); raw = m[1]; continue }
    if (k === 'ml' && ml !== null) continue
    if (!how && known[k]) { how = known[k]; continue }
    note.push(w)
  }
  return { ml, raw, how, note: note.join(' ') }
}
/** a missing amount, or more than one decimal, asks what to type (as /rx does); any amount from 0 up lands: a measure is a fact */
const mlProblem = (ml: number | null, raw: string, eg: string) => ml === null ? `How much? Type the mL: ${eg}`
  : !/^\d+(\.\d)?$/.test(raw) ? `Type the mL with at most one decimal: ${eg.replace(/\d+/, '2.5')}` : null
const measure = (dir: 'in' | 'out', how: InHow | OutWhat, ml: number, note: string): Result => {
  const d = fluidData(dir, how, ml, note || undefined)
  return { ok: [{ function: 'observation', kind: dir, params: d as unknown as Record<string, unknown>, line: fluidLine(d) }] }
}
/** /in 250 iv ns · /in 150 oral · /in 200 tube */
export function parseIn(rest: string): Result {
  if (!rest.trim()) return null
  const w = words(rest, IN_WORDS, '/in 250 iv'); if ('error' in w) return { error: w.error }
  const bad = mlProblem(w.ml, w.raw, '/in 250 iv'); if (bad) return { error: bad }
  if (!w.how) return { error: 'How was it taken? iv, oral or tube: /in 250 iv' }
  return measure('in', w.how as InHow, w.ml!, w.note)
}
/** /out urine 300 · /out drain 50 · /out ng 200 · /out vomit 100 · /out stool 200 */
export function parseOut(rest: string): Result {
  if (!rest.trim()) return null
  const w = words(rest, OUT_WORDS, '/out urine 300'); if ('error' in w) return { error: w.error }
  const bad = mlProblem(w.ml, w.raw, '/out urine 300'); if (bad) return { error: bad }
  if (!w.how) return { error: 'What came out? urine, drain, tube, vomit or stool: /out urine 300' }
  return measure('out', w.how as OutWhat, w.ml!, w.note)
}

export const CHART_TYPE = 'bedside.fluid_chart'
type Chart = EntryData['bedside.fluid_chart']
/** signed, a minus sign (U+2212), thousands apart by a no-break space: "−1 000", "+500" */
const sign = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
/** the chart's draft line; the aim always signed: "Fluid chart · balance aim −1 000 mL a day" */
export const chartLine = (d: Chart) => d.status === 'stopped' ? 'Stop the fluid chart'
  : d.no_target ? 'Fluid chart · no balance aim'
  : d.target ? `Fluid chart · balance aim ${sign(Number(d.target.value))} mL a day` : 'Start a fluid chart (the aim already set is kept)'
const chart = (d: Chart): Result => ({ ok: [{ function: CHART_TYPE, kind: 'fluids', params: d as unknown as Record<string, unknown>, line: chartLine(d) }] })
/** /fluids or /fluids start (start, or keep on: the aim set before is kept) · /fluids target -1000 (start, or a new aim: −1 000 mL a day)
 *  · /fluids +500 · /fluids target none (clear the aim) · /fluids stop (or off, end) */
export function parseChart(rest: string): Result {
  const w = rest.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!w.length || (w.length === 1 && w[0] === 'start')) return chart({ status: 'active' })
  if (w.length === 1 && w[0] === 'stop') return chart({ status: 'stopped' })
  // a bare "off" or "end" stops the chart; "none" or "off" clears the aim only after "target" (never a silent clearing of the doctor's aim)
  if (w.length === 1 && (w[0] === 'off' || w[0] === 'end')) return chart({ status: 'stopped' })
  const aimed = w[0] === 'target'; const t = (aimed ? w.slice(1) : w).join('').replace(/^−/, '-').replace(/ml$/, '')
  if (aimed && (t === 'none' || t === 'off')) return chart({ status: 'active', no_target: true })
  if (!/^[+-]?\d+$/.test(t) || Math.abs(Number(t)) > 10000) return { error: 'Type the day’s balance aim in mL, signed: /fluids target -1000, /fluids target +500, /fluids target none, or /fluids stop' }
  return chart({ status: 'active', target: { value: String(Number(t)), unit: 'mL', ucum: 'mL' } })
}
