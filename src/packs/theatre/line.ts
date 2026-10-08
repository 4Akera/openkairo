// /op on the composer's line (spec/openCare.md §5.7, Q41; the picture #surg-clinic): the operation from the Theatre's operations, the
// side (asked big; with none typed for an operation that has one, the card asks it first), elective · urgent · emergency, day case or
// admitted, the anaesthetic wanted, the surgeon ("by …"), "? the question". The order carries theatre's words (its own order type,
// the order door of §5.5 a): the side, the anaesthetic wanted, the stay, the surgeon, the usual time and the risks told (the Theatre's
// settings, as its card last read them). Offered wherever the Theatre works for this department. Pure.
import { ordersFrom } from '@core/screens/visit/commands'
import { matchesOf, type Ctx, type Parsed, type Result } from '@core/screens/visit/parse'
import type { Operation } from './model'

export interface OpSaid { words: string[]; side: 'left' | 'right' | 'both' | null; priority: 'routine' | 'urgent' | 'stat'; stay: 'day' | 'admitted' | null
  technique: 'general' | 'spinal' | 'local' | 'anaesthetist' | null; surgeon: string | null; question: string | null }
const PRIORITY: Record<string, OpSaid['priority']> = { elective: 'routine', routine: 'routine', urgent: 'urgent', emergency: 'stat', stat: 'stat' }
const ANAES: Record<string, OpSaid['technique']> = { ga: 'general', general: 'general', spinal: 'spinal', sa: 'spinal', local: 'local', la: 'local' }
export function opWords(rest: string): OpSaid {
  const [main, ...q] = rest.split('?'); const question = q.join('?').trim() || null
  const parts = main.trim().split(/\s+/).filter(Boolean)
  const s: OpSaid = { words: [], side: null, priority: 'routine', stay: null, technique: null, surgeon: null, question }
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i].toLowerCase()
    if (w === 'by') { s.surgeon = parts.slice(i + 1).join(' ') || null; break }
    if (w === 'left' || w === 'right' || w === 'both' || w === 'bilateral') { s.side = w === 'bilateral' ? 'both' : w; continue }
    if (PRIORITY[w]) { s.priority = PRIORITY[w]; continue }
    if (w === 'day' || w === 'daycase') { s.stay = 'day'; if (parts[i + 1]?.toLowerCase() === 'case') i++; continue }
    if (w === 'admitted' || w === 'admit' || w === 'inpatient') { s.stay = 'admitted'; continue }
    if (ANAES[w]) { s.technique = ANAES[w]; continue }
    if (w === 'anaesthetist' || w === 'anesthetist') { s.technique = 'anaesthetist'; continue }
    s.words.push(parts[i])
  }
  return s
}
/** the line again with one thing changed: the card's chips rewrite it */
export function opLine(code: string, s: OpSaid, change: Partial<OpSaid> = {}): string {
  const x = { ...s, ...change }
  return ['/op', code, x.side ?? '', x.priority === 'stat' ? 'emergency' : x.priority === 'urgent' ? 'urgent' : '', x.stay === 'day' ? 'day' : x.stay === 'admitted' ? 'admitted' : '',
    x.technique ?? '', x.surgeon ? `by ${x.surgeon}` : '', x.question ? `? ${x.question}` : ''].filter(Boolean).join(' ') + ' '
}

/** the operations as the Theatre's card last read them, by code */
const known = new Map<string, Operation>()
export const knowOperations = (ops: Operation[]) => { for (const o of ops) known.set(o.code, o) }
export const knownOperation = (code: string | null | undefined) => code ? known.get(code) : undefined

export function parseOp(rest: string, ctx: Ctx): Result {
  if (!rest.trim()) return null
  const s = opWords(rest); const said = s.words.join(' ')
  if (!said) return { error: 'Type the operation after /op: /op lichtenstein right' }
  const from = ordersFrom('theatre', ctx)
  const pool = ctx.services.filter((x) => x.department_id && x.department_id !== ctx.departmentId && from.has(x.department_id))
  // by its code or name (the core's matching), else every word typed the start of a word of its name ("lap chole")
  const typed = said.toLowerCase().split(/\s+/)
  const byWords = (x: (typeof pool)[number]) => { const ws = x.name.toLowerCase().split(/[\s,()·-]+/).filter(Boolean); return typed.every((t) => ws.some((w) => w.startsWith(t))) }
  const found = matchesOf(pool, said); const hits = found.length ? found : pool.filter(byWords)
  const where = (id: string | null) => ctx.departments.find((d) => d.id === id)?.name ?? 'Theatre'
  if (!hits.length) return { error: `No operation “${said}” on the Theatre's list` }
  const base = { priority: s.priority, ...(s.question ? { question_text: s.question } : {}) }
  if (hits.length > 1) return { ok: [{ function: 'order', kind: 'request', params: { choices: hits.map((h) => h.id), word: said, ...base }, line: `“${said}”: ${hits.length} fit — choose one` }] }
  const svc = hits[0]; const op = knownOperation(svc.code)
  const words = { ...(s.side ? { side: s.side } : op && !op.side ? { side: 'none' } : {}), ...(s.technique ? { technique: s.technique } : {}), ...(s.stay ? { stay: s.stay } : {}),
    ...(s.surgeon ? { surgeon: s.surgeon } : {}), ...(op?.usual_min ? { usual_min: op.usual_min } : {}), ...(op?.risks?.length ? { risks: op.risks } : {}) }
  const tail = [s.side, s.priority === 'stat' ? 'emergency' : s.priority === 'urgent' ? 'urgent' : 'elective', s.stay === 'day' ? 'day case' : s.stay, s.surgeon, s.question && `? ${s.question}`].filter(Boolean).join(' · ')
  const item: Parsed = { function: 'order', kind: 'request', params: { service_id: svc.id, ...base, as: { type: 'theatre.op', words } }, line: `${svc.name}${tail ? ` · ${tail}` : ''} → ${where(svc.department_id)}` }
  return { ok: [item] }
}
