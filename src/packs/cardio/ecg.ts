// The ECG read in the clinic (spec/openCare.md §5.7; the picture "Cardiology · the ECG in the clinic"): /ecg writes the base's result with
// no order (LOINC 11524-6), each measure an analyte with its LOINC code and range, the rhythm, ST and T and the conclusion as text. The
// typed line: the rhythm (sinus, af, flutter, paced, other), the rate (a bare number, or rate/hr), pr, qrs, qtc, axis, the ST-T words
// (nad, ste, std, twi, lvh, bbb) and "; the conclusion". Pure (npm run test:cardio).
import type { Parsed, Result } from '@core/screens/visit/parse'

export const ECG_CODE = '11524-6'
export const RHYTHMS = ['sinus', 'AF', 'flutter', 'paced', 'other'] as const
export const ST_T = ['no acute change', 'ST elevation', 'ST depression', 'T inversion', 'LVH', 'BBB'] as const
type Rhythm = typeof RHYTHMS[number]
const RHYTHM_WORD: Record<string, Rhythm> = { sinus: 'sinus', sr: 'sinus', nsr: 'sinus', af: 'AF', afib: 'AF', flutter: 'flutter', afl: 'flutter', paced: 'paced', other: 'other' }
const ST_WORD: Record<string, typeof ST_T[number]> = { nad: 'no acute change', normal: 'no acute change', ste: 'ST elevation', stemi: 'ST elevation', std: 'ST depression',
  twi: 'T inversion', lvh: 'LVH', bbb: 'BBB', lbbb: 'BBB', rbbb: 'BBB' }
const RHYTHM_TEXT: Record<Rhythm, string> = { sinus: 'Sinus rhythm', AF: 'Atrial fibrillation', flutter: 'Atrial flutter', paced: 'Paced rhythm', other: 'Rhythm' }

/** each measure: its key, name, LOINC, unit and UCUM, the range read against it (null: none) */
export const MEASURES = [
  { key: 'rate', name: 'Rate', loinc: '8867-4', unit: '/min', ucum: '/min', low: 60, high: 100 },
  { key: 'pr', name: 'PR', loinc: '8625-6', unit: 'ms', ucum: 'ms', low: 120, high: 200 },
  { key: 'qrs', name: 'QRS', loinc: '8633-0', unit: 'ms', ucum: 'ms', low: null, high: 120 },
  { key: 'qtc', name: 'QTc', loinc: '8636-3', unit: 'ms', ucum: 'ms', low: null, high: 450 },
  { key: 'axis', name: 'Axis', loinc: '8632-2', unit: '°', ucum: 'deg', low: -30, high: 90 },
] as const
export type MeasureKey = typeof MEASURES[number]['key']

/** what a card holds: the rhythm, the measures typed, the ST-T findings, the conclusion */
export interface EcgParams { ecg: true; rhythm: Rhythm | null; rate: number | null; pr: number | null; qrs: number | null; qtc: number | null; axis: number | null
  st: string[]; conclusion: string | null; female?: boolean }

/** the conclusion a reading writes when none is typed: "Atrial fibrillation, ventricular rate 108. No acute ST change." */
export function conclusionOf(q: EcgParams): string {
  const head = q.rhythm ? `${RHYTHM_TEXT[q.rhythm]}${q.rate != null ? `, ${q.rhythm === 'AF' || q.rhythm === 'flutter' ? 'ventricular ' : ''}rate ${q.rate}` : ''}.` : q.rate != null ? `Rate ${q.rate}.` : ''
  const st = q.st.length ? q.st.includes('no acute change') ? ' No acute ST change.' : ` ${q.st.join(', ')}.` : ''
  const qt = q.qtc != null && q.qtc > (q.female ? 460 : 450) ? ` QTc long (${q.qtc} ms).` : ''
  return `${head}${st}${qt}`.trim()
}
/** the draft's line: "ECG · AF 108 · QRS 96 · QTc 452 · axis +20° · no acute change" */
export function ecgLine(q: EcgParams): string {
  const sign = (n: number) => n > 0 ? `+${n}` : `${n}`
  return ['ECG', [q.rhythm, q.rate].filter((x) => x != null).join(' ') || null, q.pr != null ? `PR ${q.pr}` : null, q.qrs != null ? `QRS ${q.qrs}` : null,
    q.qtc != null ? `QTc ${q.qtc}` : null, q.axis != null ? `axis ${sign(q.axis)}°` : null, q.st.length ? q.st.join(', ') : null].filter(Boolean).join(' · ')
}

/** the line as typed → the card's fields; an unknown word is said, never dropped */
export function parseEcg(rest: string, female = false): Result {
  const [main, ...said] = rest.split(';'); const conclusion = said.join(';').trim() || null
  const q: EcgParams = { ecg: true, rhythm: null, rate: null, pr: null, qrs: null, qtc: null, axis: null, st: [], conclusion, female }
  const words = main.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const num = (w: string | undefined) => w !== undefined && /^[+-]?\d+(\.\d+)?$/.test(w) ? Number(w) : null
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (RHYTHM_WORD[w]) { q.rhythm = RHYTHM_WORD[w]; continue }
    if (ST_WORD[w]) { if (!q.st.includes(ST_WORD[w])) q.st.push(ST_WORD[w]); continue }
    const glued = w.match(/^(pr|qrs|qtc|axis|rate|hr)([+-]?\d+)$/)
    const key = glued ? glued[1] : ['pr', 'qrs', 'qtc', 'axis', 'rate', 'hr'].includes(w) ? w : null
    if (key) { const n = glued ? Number(glued[2]) : num(words[++i]); if (n === null) return { error: `${key.toUpperCase()} needs a number` }
      q[key === 'hr' ? 'rate' : key as MeasureKey] = n; continue }
    const n = num(w); if (n !== null && q.rate === null) { q.rate = n; continue }
    return { error: `Not an ECG word: “${w}”. Try sinus 78 pr 164 qrs 92 qtc 418 axis 30 nad` }
  }
  if (q.rhythm === 'AF' || q.rhythm === 'flutter') q.pr = null
  if (!q.rhythm && q.rate === null && !q.st.length) return null
  return { ok: [ecgDraft(q)] }
}
/** the draft: its params are the result's data as Done writes it (the card reads them back with ecgOf) */
export const ecgDraft = (q: EcgParams): Parsed => ({ function: 'result', kind: 'result', params: ecgData(q), line: ecgLine(q) })

type Analyte = { key: string; name: string; code?: { system: string; code: string; display: string }; value?: { value: string; unit: string; ucum: string }; text?: string
  interpretation?: 'N' | 'L' | 'H'; range?: { low?: { value: string; unit: string; ucum: string }; high?: { value: string; unit: string; ucum: string } } }
/** the base's result the reading writes: no order, its code the ECG study, each measure an analyte, the conclusion */
export function ecgData(q: EcgParams): Record<string, unknown> {
  const analytes: Analyte[] = []
  if (q.rhythm) analytes.push({ key: 'rhythm', name: 'Rhythm', text: q.rhythm })
  for (const m of MEASURES) {
    const v = q[m.key]; if (v == null) continue
    const high = m.key === 'qtc' && q.female ? 460 : m.high
    const qv = (n: number) => ({ value: String(n), unit: m.unit, ucum: m.ucum })
    analytes.push({ key: m.key, name: m.name, code: { system: 'loinc', code: m.loinc, display: m.name }, value: qv(v),
      interpretation: m.low != null && v < m.low ? 'L' : high != null && v > high ? 'H' : 'N',
      range: { ...(m.low != null ? { low: qv(m.low) } : {}), ...(high != null ? { high: qv(high) } : {}) } })
  }
  if (q.st.length) analytes.push({ key: 'st', name: 'ST and T', text: q.st.join(', ') })
  const conclusion = (q.conclusion ?? '').trim() || conclusionOf(q)
  return { status: 'final', code: { text: 'ECG · 12 leads', codings: [{ system: 'loinc', code: ECG_CODE, display: 'ECG study' }] }, analytes, ...(conclusion ? { conclusion } : {}) }
}
/** a written reading's fields again (the card edits them; the Heart section reads them) */
export function ecgOf(d: Record<string, unknown> | undefined, female = false): EcgParams {
  const as = (d?.analytes as Analyte[] | undefined) ?? []; const v = (k: string) => { const a = as.find((x) => x.key === k)?.value; return a ? Number(a.value) : null }
  const rhythm = as.find((x) => x.key === 'rhythm')?.text as Rhythm | undefined; const st = as.find((x) => x.key === 'st')?.text
  return { ecg: true, rhythm: rhythm ?? null, rate: v('rate'), pr: v('pr'), qrs: v('qrs'), qtc: v('qtc'), axis: v('axis'), st: st ? st.split(', ') : [],
    conclusion: typeof d?.conclusion === 'string' ? d.conclusion : null, female }
}
/** is this result an ECG (its code the ECG study) */
export const isEcg = (d: Record<string, unknown> | undefined) =>
  !!(d?.code as { codings?: { code: string }[] } | undefined)?.codings?.some((c) => c.code === ECG_CODE)
