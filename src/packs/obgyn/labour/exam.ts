// The labour ward's lines in the composer (spec/openCare.md §5.6): /ve, the labour examination (the cervix, the head in fifths above
// the brim, the position, the liquor, moulding, caput, the contractions, G and P as said), /ctx the contractions alone (the same type:
// the partograph reads one kind), and /fhr the baby's heart as the base's observation (LOINC 55283-6). The exam's line says what
// obgyn.exam_words says on the server, word for word. A heart rate under 110 or over 160 is a notice under the card, never a stop.
// Pure: npm run test:labour.
import type { Parsed, Result } from '@core/screens/visit/parse'
import { EXAM, FHR_HIGH, FHR_LOW, LIQUOR, POSITIONS, fhrConcept, isFhr, liquorWords, positionWords, type Caput, type ExamData, type Liquor, type Moulding, type Position } from './codes'

const CAPUT_WORDS: Record<Caput, string> = { none: 'no caput', '+': 'caput +', '++': 'caput ++' }
/** the exam in words (obgyn.exam_words): "Cervix 6 cm · head 3/5 · OA · liquor clear · moulding + · caput + · contractions 3 in 10 min,
 *  40 s · G2 P1"; "Labour examination" when it says nothing */
export function examLine(d: ExamData): string {
  const c = d.contractions
  const gp = [d.gravida != null ? `G${d.gravida}` : null, d.para != null ? `P${d.para}` : null].filter(Boolean).join(' ')
  const w = [d.cervix != null ? `cervix ${d.cervix} cm` : null, d.descent != null ? `head ${d.descent}/5` : null, d.position ? positionWords(d.position) : null,
    d.liquor ? liquorWords(d.liquor) : null, d.moulding ? `moulding ${d.moulding}` : null, d.caput ? CAPUT_WORDS[d.caput] : null,
    c ? `contractions ${c.per_10} in 10 min${c.seconds != null ? `, ${c.seconds} s` : ''}` : null, gp || null, d.note || null].filter(Boolean).join(' · ')
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : 'Labour examination'
}

const POS: Record<string, Position> = Object.fromEntries(POSITIONS.map(([k]) => [k, k]))
const LIQ: Record<string, Liquor> = { ...Object.fromEntries(LIQUOR.map(([k]) => [k, k])), mec: 'meconium' }
const MOULD: Record<string, Moulding> = { m0: '0', 'm+': '+', 'm++': '++', 'm+++': '+++', m1: '+', m2: '++', m3: '+++' }
const CAP: Record<string, Caput> = { caput: '+', 'caput+': '+', 'caput++': '++', caput0: 'none' }
const has = (o: object, w: string) => Object.hasOwn(o, w)
const HINT = 'Try /ve 6 3/5 oa clear m+ caput ctx 3/10 40s g2 p1'
const words = (rest: string) => rest.toLowerCase().split(/[\s·,]+/).filter(Boolean)
const draft = (d: ExamData): Parsed => ({ function: EXAM, kind: 'labour', params: { ...d }, line: examLine(d) })

const NO_LENGTH = 'No contractions in 10 min: no length to say'
/** what the exam says that cannot be (the grammar refuses it; the card says it under its fields): the cervix in half centimetres 0–10,
 *  the contractions 0–7 and their length 5–180 s (none with no contraction), G 1–20, P 0–19 and under G */
export function examProblem(d: ExamData): string | null {
  const c = d.contractions
  if (d.cervix != null && (d.cervix < 0 || d.cervix > 10 || !Number.isInteger(d.cervix * 2))) return `Cervix ${d.cervix} cm is not possible: 0–10, in half centimetres`
  if (c && c.per_10 > 7) return `Contractions ${c.per_10} in 10 min is not possible`
  if (c?.seconds != null && (c.seconds < 5 || c.seconds > 180)) return `A contraction of ${c.seconds} s is not possible`
  if (c?.per_10 === 0 && c.seconds != null) return NO_LENGTH
  if (d.gravida != null && (d.gravida < 1 || d.gravida > 20)) return `G${d.gravida} is not possible: 1–20`
  if (d.para != null && (d.para < 0 || d.para > 19)) return `P${d.para} is not possible: 0–19`
  if (d.gravida != null && d.para != null && d.para >= d.gravida) return `P${d.para} with G${d.gravida}: para counts the births before this pregnancy, so it is under G`
  return null
}

/** the contractions from word i: "3/10", or "3" then "in 10" (or "10"); then a length "40s" (or "40 s"; a bare "40" too where loose). The words
 *  read, or an error */
function contractionsAt(ws: string[], i: number, loose: boolean): { next: number; c: NonNullable<ExamData['contractions']> } | { error: string } | null {
  let j = i; const m = ws[j]?.match(/^(\d+)(?:\/10)?$/); if (!m) return null
  const per = Number(m[1]); j++
  if (!ws[i].includes('/')) { if (ws[j] === 'in' && ws[j + 1] === '10') j += 2; else if (ws[j] === '10' || ws[j] === '/10') j += 1 }   // "3 10" is 3 in 10
  if (per > 7) return { error: `Contractions ${per} in 10 min is not possible` }
  const c: NonNullable<ExamData['contractions']> = { per_10: per }
  const s = ws[j]?.match(/^(\d+)(s|sec|secs)$/) ?? (ws[j]?.match(/^\d+$/) && (/^(s|sec|secs)$/.test(ws[j + 1] ?? '') || loose) ? [ws[j], ws[j]] : null)
  if (s) { const n = Number(s[1]); if (n < 5 || n > 180) return { error: `A contraction of ${n} s is not possible` }
    c.seconds = n; j += /^(s|sec|secs)$/.test(ws[j + 1] ?? '') && /^\d+$/.test(ws[j]) ? 2 : 1 }
  if (per === 0 && c.seconds != null) return { error: NO_LENGTH }
  return { next: j, c }
}

/** /ve: the labour examination, any of its findings in any order */
export function parseExam(rest: string): Result {
  const ws = words(rest); if (!ws.length) return null
  const d: ExamData = {}
  const twice = (k: keyof ExamData, what: string) => d[k] !== undefined ? { error: `${what} said twice` } : null
  for (let i = 0; i < ws.length;) {
    const w = ws[i]
    const cm = w.match(/^(\d+(?:\.\d+)?)(cm)?$/)
    if (cm || w === 'full' || w === 'fd') {
      const t = twice('cervix', 'Cervix'); if (t) return t
      const n = cm ? Number(cm[1]) : 10
      if (n > 10 || !Number.isInteger(n * 2)) return { error: `Cervix ${cm?.[1] ?? n} cm is not possible: 0–10, in half centimetres` }
      d.cervix = n; i += cm && !cm[2] && ws[i + 1] === 'cm' ? 2 : 1; continue
    }
    const head = w.match(/^(\d+)\/5$/)
    if (head) { const t = twice('descent', 'The head'); if (t) return t
      const n = Number(head[1]); if (n > 5) return { error: 'The head is in fifths: 0/5 to 5/5' }
      d.descent = n; i++; continue }
    if (w === 'ctx' || /^\d+\/10$/.test(w)) {
      const t = twice('contractions', 'Contractions'); if (t) return t
      const r = contractionsAt(ws, w === 'ctx' ? i + 1 : i, false)
      if (!r) return { error: 'Contractions after ctx: ctx 3/10 40s' }
      if ('error' in r) return r
      d.contractions = r.c; i = r.next; continue
    }
    if (has(POS, w)) { const t = twice('position', 'Position'); if (t) return t; d.position = POS[w]; i++; continue }
    if (has(LIQ, w)) { const t = twice('liquor', 'Liquor'); if (t) return t; d.liquor = LIQ[w]; i++; continue }
    if (has(MOULD, w)) { const t = twice('moulding', 'Moulding'); if (t) return t; d.moulding = MOULD[w]; i++; continue }
    if (has(CAP, w)) { const t = twice('caput', 'Caput'); if (t) return t; d.caput = CAP[w]; i++; continue }
    const gp = w.match(/^(?:g(\d+))?(?:p(\d+))?$/)
    if (gp && (gp[1] || gp[2])) {
      if (gp[1]) { const t = twice('gravida', 'G'); if (t) return t; d.gravida = Number(gp[1]) }
      if (gp[2]) { const t = twice('para', 'P'); if (t) return t; d.para = Number(gp[2]) }
      i++; continue
    }
    return { error: `Not a labour finding: “${w}”. ${HINT}` }
  }
  const problem = examProblem(d); if (problem) return { error: problem }
  return { ok: [draft(d)] }
}

/** /ctx: the contractions alone — "3/10 40s", "3 in 10 45s", "3 10 45s", "3 40s", "3 40" */
export function parseCtx(rest: string): Result {
  const ws = words(rest); if (!ws.length) return null
  const r = contractionsAt(ws, 0, true)
  if (r && 'error' in r) return r
  if (!r || r.next !== ws.length) return { error: 'Contractions: /ctx 3/10 40s' }
  return { ok: [draft({ contractions: r.c })] }
}

/** /fhr: the baby's heart rate, the base's observation (LOINC 55283-6) */
export function parseFhr(rest: string): Result {
  const ws = words(rest); if (!ws.length) return null
  const m = ws.length <= 2 && (ws.length === 1 || /^(bpm|\/min)$/.test(ws[1])) ? ws[0].match(/^(\d+)$/) : null
  if (!m) return { error: 'The baby\'s heart rate: /fhr 142' }
  const n = Number(m[1]); if (n < 50 || n > 220) return { error: `FHR ${n} is not plausible: 50–220` }
  return { ok: [{ function: 'observation', kind: 'labour', params: { code: fhrConcept(), value: { quantity: { value: String(n), unit: 'bpm', ucum: '/min' } } }, line: `Fetal heart rate: ${n} bpm` }] }
}

/** under the card: a heart rate under 110 or over 160 — tell the doctor now; a notice only */
export function fhrNote(items: Parsed[]): { text: string; tone: 'danger' } | null {
  for (const p of items) {
    if (p.function !== 'observation' || !isFhr({ type: 'observation', data: p.params })) continue
    const n = Number((p.params.value as { quantity?: { value?: unknown } } | undefined)?.quantity?.value)
    if (!Number.isFinite(n)) continue
    if (n < FHR_LOW) return { text: `FHR ${n}: under ${FHR_LOW} — tell the doctor now. Only a notice.`, tone: 'danger' }
    if (n > FHR_HIGH) return { text: `FHR ${n}: over ${FHR_HIGH} — tell the doctor now. Only a notice.`, tone: 'danger' }
  }
  return null
}
