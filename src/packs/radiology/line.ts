// Radiology's order words as a typed line reads (spec §5.1 rule 1, §5.5): /xr /us /ct /mri, each its kind of Radiology's exams. Pure.
import type { ReactNode } from 'react'
import { ordersFrom, registerCommand } from '@core/screens/visit/commands'
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { examsFor, packOrder, wordsOf, type Kind } from './exams'

type Svc = Ctx['services'][number]
/** with contrast: two exams, the one with contrast named so (the starter's "CT brain with contrast") */
export const contrastOf = (s: Pick<Svc, 'name'>) => /\bwith contrast\b/i.test(s.name)
export const WORD: Record<Kind, [string, string, string, string[]]> = {
  'X-ray': ['xr', 'X-ray', '/xr chest ? pneumonia · /xr knee left', ['xray', 'x']],
  Ultrasound: ['us', 'Ultrasound', '/us abd ? gallstones · /us pelvis', ['sonar', 'u/s']],
  CT: ['ct', 'CT', '/ct abd pelvis +c urgent ? appendicitis · /ct brain stat', []],
  MRI: ['mri', 'MRI', '/mri lumbar spine ? disc · /mri knee right', ['mr']],
}

/** the exams a line names, of this kind, among the departments using the pack that work for this one */
export function parseKind(kind: Kind, rest: string, ctx: Ctx): Result {
  if (!rest.trim()) return null
  const from = ordersFrom('radiology', ctx)
  const pool = ctx.services.filter((s) => s.department_id !== ctx.departmentId && from.has(s.department_id ?? '') && s.section_name === kind)
  const said = wordsOf(rest)
  if (!said.exams.length) return { error: `Type the exam after /${WORD[kind][0]}` }
  const extra = { priority: said.priority, ...(said.question ? { question_text: said.question } : {}), as: packOrder(said.words) }
  const where = (s: Svc) => ctx.departments.find((d) => d.id === s.department_id)?.name ?? '?'
  const tail = [said.words.side, said.words.portable && 'portable', said.words.report && 'report', said.priority !== 'routine' && said.priority, said.question && `? ${said.question}`].filter(Boolean).join(' · ')
  const out: Parsed[] = []; const missing: string[] = []
  for (const seg of said.exams) {
    const hits = examsFor(seg, pool, contrastOf, said.contrast)
    if (hits.length === 1) out.push({ function: 'order', kind: 'request', params: { service_id: hits[0].id, ...extra }, line: `${hits[0].name}${tail ? ` · ${tail}` : ''} → ${where(hits[0])}` })
    else if (hits.length > 1) out.push({ function: 'order', kind: 'request', params: { choices: hits.map((s) => s.id), word: seg, ...extra }, line: `“${seg}”: ${hits.length} fit — choose one` })
    else missing.push(seg)
  }
  if (missing.length) return { error: `No ${WORD[kind][1]} exam “${missing.join('”, “')}”` }
  return { ok: out }
}


/** the four order words, each its kind; note: the card's line under what it holds (order.tsx: what to tell the patient, the facts) */
export function registerKinds(note?: (items: Parsed[], ctx: Ctx) => ReactNode) {
  for (const kind of Object.keys(WORD) as Kind[]) {
    const [name, title, example, aliases] = WORD[kind]
    registerCommand({ name, aliases, pack: 'radiology', orders: true, section: kind, groupTitle: 'Radiology', title, label: `${title} — from Radiology`, example, action: 'write:order', writes: ['order'],
      parse: (rest, ctx) => parseKind(kind, rest, ctx), ...(note ? { note } : {}) })
  }
}
