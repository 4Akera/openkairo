// The heart failure visit as typed (spec/openCare.md §5.7; the picture #cardio-hf): /hf nyha 2 wt 71.4 oedema ankles flat. No type of its
// own: NYHA is the base's observation (this pack's term, the note saying the oedema and lying flat), the weight the base's vitals, and
// "dry 70" the dry weight the doctor sets, an observation that stands until the next. Pure (npm run test:cardio).
import type { Parsed, Result } from '@core/screens/visit/parse'
import { TERMS, nyhaWord } from './heart'

export const OEDEMA = ['none', 'ankles', 'to the knees', 'higher'] as const
export const FLAT = ['flat', '2 pillows or more', 'wakes breathless'] as const
const OEDEMA_WORD: Record<string, typeof OEDEMA[number]> = { none: 'none', no: 'none', ankle: 'ankles', ankles: 'ankles', knee: 'to the knees', knees: 'to the knees', higher: 'higher', sacral: 'higher' }
const FLAT_WORD: Record<string, typeof FLAT[number]> = { flat: 'flat', pillows: '2 pillows or more', orthopnoea: '2 pillows or more', orthopnea: '2 pillows or more', pnd: 'wakes breathless' }
const term = (code: string, display: string) => ({ text: display, codings: [{ system: TERMS, code, display }] })

export interface HfParams { nyha: number | null; oedema: string | null; flat: string | null }
/** the NYHA observation's data: the class, and the oedema and lying flat in its note */
export const nyhaData = (q: HfParams) => ({ code: term('nyha', 'NYHA class'), value: { text: nyhaWord(q.nyha ?? 0) },
  ...(q.oedema || q.flat ? { note: [q.oedema && `oedema: ${q.oedema}`, q.flat && `lying flat: ${q.flat}`].filter(Boolean).join(' · ') } : {}) })
/** the card's fields from the observation's data */
export function hfOf(d: Record<string, unknown>): HfParams {
  const t = String((d.value as { text?: string } | undefined)?.text ?? ''); const note = typeof d.note === 'string' ? d.note : ''
  const part = (k: string) => note.split(' · ').find((x) => x.startsWith(`${k}: `))?.slice(k.length + 2) ?? null
  return { nyha: ['I', 'II', 'III', 'IV'].indexOf(t) + 1 || null, oedema: part('oedema'), flat: part('lying flat') }
}
export const hfLine = (q: HfParams) => ['Heart failure visit', q.nyha ? `NYHA ${nyhaWord(q.nyha)}` : null, q.oedema && q.oedema !== 'none' ? `${q.oedema} oedema` : q.oedema === 'none' ? 'no oedema' : null,
  q.flat === 'flat' ? 'lies flat' : q.flat].filter(Boolean).join(' · ')
export const isNyha = (d: Record<string, unknown>) => ((d.code as { codings?: { system: string; code: string }[] } | undefined)?.codings ?? []).some((c) => c.system === TERMS && c.code === 'nyha')
export const dryData = (kg: number) => ({ code: term('dry_weight', 'Dry weight'), value: { quantity: { value: String(kg), unit: 'kg', ucum: 'kg' } } })

/** the line → the visit's drafts: NYHA (with oedema and lying flat), the weight, the dry weight when said */
export function parseHf(rest: string): Result {
  const words = rest.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return null
  const q: HfParams = { nyha: null, oedema: null, flat: null }; let wt: number | null = null; let dry: number | null = null
  const num = (w?: string) => w !== undefined && /^\d+(\.\d+)?$/.test(w) ? Number(w) : null
  for (let i = 0; i < words.length; i++) {
    const w = words[i]; const glued = w.match(/^(nyha|wt|w|dry)(\d+(?:\.\d+)?)$/)
    if (w === 'nyha' || glued?.[1] === 'nyha') { const n = glued ? Number(glued[2]) : num(words[++i]) ?? ['i', 'ii', 'iii', 'iv'].indexOf(words[i] ?? '') + 1
      if (!n || n < 1 || n > 4) return { error: 'NYHA is 1 to 4' }; q.nyha = n; continue }
    if (['wt', 'w', 'weight'].includes(w) || glued?.[1] === 'wt' || glued?.[1] === 'w') { const n = glued ? Number(glued[2]) : num(words[++i])
      if (n === null || n < 20 || n > 300) return { error: 'The weight needs a number in kg' }; wt = n; continue }
    if (w === 'dry' || glued?.[1] === 'dry') { const n = glued ? Number(glued[2]) : num(words[++i]); if (n === null || n < 20 || n > 300) return { error: 'The dry weight needs a number in kg' }; dry = n; continue }
    if (w === 'oedema' || w === 'edema') { const x = OEDEMA_WORD[words[i + 1] ?? '']; if (x) { q.oedema = x; i++ } else q.oedema = 'ankles'; continue }
    if (OEDEMA_WORD[w]) { q.oedema = OEDEMA_WORD[w]; continue }
    if (FLAT_WORD[w]) { q.flat = FLAT_WORD[w]; continue }
    return { error: `Not a heart failure word: “${w}”. Try nyha 2 wt 71.4 oedema ankles flat · dry 70` }
  }
  const out: Parsed[] = []
  if (q.nyha) out.push({ function: 'observation', kind: 'observation', params: nyhaData(q), line: hfLine(q) })
  if (wt !== null) out.push({ function: 'vitals', kind: 'vitals', params: { weight: wt }, line: `Wt ${wt}` })
  if (dry !== null) out.push({ function: 'observation', kind: 'observation', params: dryData(dry), line: `Dry weight ${dry} kg` })
  return out.length ? { ok: out } : { error: 'Type NYHA (nyha 2) or the weight (wt 71.4)' }
}
