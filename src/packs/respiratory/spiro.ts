// Spirometry (spec/openCare.md §5.7; the picture #chest-spiro): /spiro fev1 1.62 fvc 2.86 post 1.72 2.98 writes the base's result with no
// order: FEV1, FVC and FEV1/FVC before and after the bronchodilator, each an analyte (before with its LOINC code), the LLN as each one's
// range, the % predicted and z after, the quality, and the reading as the conclusion. The predicted values come from the server (the
// GLI-2012 list loaded, its LMS for this age, height and sex); worked out here: LLN = M·(1 − 1.645·L·S)^(1/L), z = ((x/M)^L − 1)/(L·S).
// Pure (npm run test:respiratory).
import type { Parsed, Result } from '@core/screens/visit/parse'

export interface Lms { m: number; l: number; s: number }
export interface Predicted { cell?: string; fev1?: Lms; fvc?: Lms; ratio?: Lms; missing?: string }
export const lln = (p: Lms) => p.m * Math.pow(1 - 1.645 * p.l * p.s, 1 / p.l)
export const zOf = (x: number, p: Lms) => (Math.pow(x / p.m, p.l) - 1) / (p.l * p.s)
const r2 = (n: number) => Math.round(n * 100) / 100, r1 = (n: number) => Math.round(n * 10) / 10

export interface Blow { fev1: number | null; fvc: number | null }
export interface SpiroParams { pre: Blow; post: Blow; height: number | null; quality: string | null; predicted: Predicted | null }
export const QUALITY = ['A', 'B', 'C', 'not acceptable'] as const
export const ratio = (b: Blow) => b.fev1 != null && b.fvc ? r2(b.fev1 / b.fvc) : null

export interface Reading { obstruction: boolean | null; reversible: boolean | null; change: { ml: number; pct: number } | null; grade: number | null; pct: number | null
  zFev1: number | null; zFvc: number | null; zRatio: number | null; words: string[] }
/** what the numbers say: obstruction (FEV1/FVC after under the LLN, or under 0.70 with no LLN), reversible (+200 mL and +12 %), the GOLD
 *  grade by FEV1 % predicted after (1 ≥ 80, 2 50–79, 3 30–49, 4 under 30) */
export function readingOf(q: SpiroParams): Reading {
  const b = q.post.fev1 != null ? q.post : q.pre; const rr = ratio(b); const p = q.predicted
  const limit = p?.ratio ? lln(p.ratio) : null
  const obstruction = rr == null ? null : limit != null ? rr < limit : rr < 0.7
  const change = q.pre.fev1 != null && q.post.fev1 != null ? { ml: Math.round((q.post.fev1 - q.pre.fev1) * 1000), pct: Math.round((q.post.fev1 / q.pre.fev1 - 1) * 100) } : null
  const reversible = change ? change.ml >= 200 && change.pct >= 12 : null
  const pct = p?.fev1 && b.fev1 != null ? Math.round(b.fev1 / p.fev1.m * 100) : null
  const grade = obstruction && pct != null ? pct >= 80 ? 1 : pct >= 50 ? 2 : pct >= 30 ? 3 : 4 : null
  const z = (x: number | null, l?: Lms) => x != null && l ? r1(zOf(x, l)) : null
  const words = [obstruction == null ? null : obstruction ? `obstruction: FEV1/FVC ${rr}${limit != null ? ` under the LLN ${r2(limit)}` : ' under 0.70'}` : 'no obstruction',
    change ? `${reversible ? 'reversible' : 'not reversible'}: ${change.ml >= 0 ? '+' : ''}${change.ml} mL, ${change.pct >= 0 ? '+' : ''}${change.pct} %` : null,
    grade ? `GOLD ${grade}: FEV1 ${pct} % of predicted` : pct != null ? `FEV1 ${pct} % of predicted` : null].filter((x): x is string => !!x)
  return { obstruction, reversible, change, grade, pct, zFev1: z(b.fev1, p?.fev1), zFvc: z(b.fvc, p?.fvc), zRatio: z(rr, p?.ratio), words }
}

/** the line → the card's fields: fev1, fvc (before), post and its two numbers, ht, quality */
export function parseSpiro(rest: string, height: number | null): Result {
  const w = rest.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) return null
  const q: SpiroParams = { pre: { fev1: null, fvc: null }, post: { fev1: null, fvc: null }, height, quality: null, predicted: null }
  const num = (x?: string) => x !== undefined && /^\d+(\.\d+)?$/.test(x) ? Number(x) : null
  let side: 'pre' | 'post' = 'pre'
  for (let i = 0; i < w.length; i++) {
    const x = w[i]
    if (x === 'post' || x === 'after') { side = 'post'; const a = num(w[i + 1]), b = num(w[i + 2]); if (a !== null) { q.post.fev1 = a; i++; if (b !== null) { q.post.fvc = b; i++ } } continue }
    if (x === 'pre' || x === 'before') { side = 'pre'; continue }
    if (x === 'fev1' || x === 'fvc') { const n = num(w[++i]); if (n === null || n > 9) return { error: `${x.toUpperCase()} needs litres (1.62)` }; q[side][x] = n; continue }
    if (x === 'ht' || x === 'height') { const n = num(w[++i]); if (n === null || n < 90 || n > 230) return { error: 'The height needs cm' }; q.height = n; continue }
    if (x === 'quality' || x === 'q') { const g = (w[++i] ?? '').toUpperCase(); if (!['A', 'B', 'C'].includes(g)) return { error: 'Quality is A, B or C' }; q.quality = g; continue }
    return { error: `Not a spirometry word: “${x}”. Try fev1 1.62 fvc 2.86 post 1.72 2.98 ht 170` }
  }
  if (q.pre.fev1 == null && q.post.fev1 == null) return { error: 'Type FEV1 (fev1 1.62)' }
  return { ok: [spiroDraft(q)] }
}
export const spiroLine = (q: SpiroParams) => { const r = readingOf(q); const b = q.post.fev1 != null ? q.post : q.pre
  return ['Spirometry', q.post.fev1 != null ? 'after bronchodilator' : null, b.fev1 != null ? `FEV1 ${b.fev1} L${r.pct != null ? ` (${r.pct} %)` : ''}` : null, ratio(b) != null ? `FEV1/FVC ${ratio(b)}` : null,
    r.reversible == null ? null : r.reversible ? 'reversible' : 'not reversible', r.grade ? `GOLD ${r.grade}` : null].filter(Boolean).join(' · ') }
export const spiroDraft = (q: SpiroParams): Parsed => ({ function: 'result', kind: 'result', params: spiroData(q), line: spiroLine(q) })

type Q = { value: string; unit: string; ucum: string }
const L = (n: number): Q => ({ value: String(n), unit: 'L', ucum: 'L' }), RATIO = (n: number): Q => ({ value: String(n), unit: '', ucum: '{ratio}' })
export const SPIRO_CODE = 'spirometry'
/** the base's result: no order, its code the pack's spirometry term, the six analytes, the LLN as each range, % predicted and z after */
export function spiroData(q: SpiroParams): Record<string, unknown> {
  const p = q.predicted; const r = readingOf(q); const as: Record<string, unknown>[] = []
  const add = (key: string, name: string, v: number | null, mk: (n: number) => Q, l: Lms | undefined, loinc?: string) => { if (v == null) return
    const low = l ? (key.startsWith('ratio') ? r2(lln(l)) : r2(lln(l))) : null
    as.push({ key, name, ...(loinc ? { code: { system: 'loinc', code: loinc, display: name } } : {}), value: mk(v), ...(low != null ? { interpretation: v < low ? 'L' : 'N', range: { low: mk(low) } } : {}) }) }
  add('fev1', 'FEV1 before', q.pre.fev1, L, p?.fev1, '20150-9'); add('fvc', 'FVC before', q.pre.fvc, L, p?.fvc, '19870-5'); add('ratio', 'FEV1/FVC before', ratio(q.pre), RATIO, p?.ratio, '19926-5')
  add('fev1_post', 'FEV1 after', q.post.fev1, L, p?.fev1); add('fvc_post', 'FVC after', q.post.fvc, L, p?.fvc); add('ratio_post', 'FEV1/FVC after', ratio(q.post), RATIO, p?.ratio)
  if (r.pct != null) as.push({ key: 'fev1_pct', name: 'FEV1 % predicted', value: { value: String(r.pct), unit: '%', ucum: '%' } })
  if (r.zFev1 != null) as.push({ key: 'fev1_z', name: 'FEV1 z', value: { value: String(r.zFev1), unit: '', ucum: '{score}' } })
  if (q.quality) as.push({ key: 'quality', name: 'Quality', text: q.quality })
  if (q.height != null) as.push({ key: 'height', name: 'Height', value: { value: String(q.height), unit: 'cm', ucum: 'cm' } })
  const conclusion = [r.words.join(' · '), p?.cell ? 'GLI-2012' : p?.missing ? `no predicted values: ${p.missing}` : null].filter(Boolean).join(' · ')
  return { status: 'final', code: { text: 'Spirometry · before and after salbutamol', codings: [{ system: 'respiratory.terms', code: SPIRO_CODE, display: 'Spirometry' }] }, analytes: as,
    ...(conclusion ? { conclusion } : {}) }
}
type A = { key: string; value?: { value: string }; text?: string }
/** a written spirometry's fields again (the card edits them, the Chest section reads them) */
export function spiroOf(d: Record<string, unknown> | undefined): SpiroParams {
  const as = (d?.analytes as A[] | undefined) ?? []; const v = (k: string) => { const x = as.find((a) => a.key === k)?.value; return x ? Number(x.value) : null }
  return { pre: { fev1: v('fev1'), fvc: v('fvc') }, post: { fev1: v('fev1_post'), fvc: v('fvc_post') }, height: v('height'), quality: as.find((a) => a.key === 'quality')?.text ?? null, predicted: null }
}
export const isSpiro = (d: Record<string, unknown> | undefined) =>
  !!(d?.code as { codings?: { system: string; code: string }[] } | undefined)?.codings?.some((c) => c.system === 'respiratory.terms' && c.code === SPIRO_CODE)
