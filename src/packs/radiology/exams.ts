// Radiology's exams as its screens and order words read them (spec/openCare.md §5.5): each exam is a service of a department using the
// pack, its kind the service's section (X-ray, Ultrasound, CT, MRI); what it needs is the department's radiology.exams (a side, with
// contrast, what to tell the patient, reported always or only when the doctor asks). A typed line names exams by code or by the words
// of their names, with the side, +c / −c, portable, report, urgent or stat and "? the question". With and without contrast are two exams:
// +c takes the one with contrast, nothing (or −c) the one without; then the one whose every word was typed; anything else fitting two is
// asked, never guessed. Pure.
import type { Organization, Service } from '@core/db/types'
import type { PackOrder } from '@core/db/entries'
import { settingIn } from '@core/screens/settings/form/model'

export const KINDS = ['X-ray', 'Ultrasound', 'CT', 'MRI'] as const
export type Kind = typeof KINDS[number]
/** the kinds that use X-rays: pregnant is asked before them */
export const IONIZING: readonly string[] = ['X-ray', 'CT']
export const ORDER_TYPE = 'radiology.request'

export interface Exam { code: string; side: boolean; contrast: boolean; prep: string | null; prep_ar: string | null; report: 'always' | 'asked' }
export type Side = 'left' | 'right' | 'both'
export interface Words { side?: Side; portable?: boolean; report?: boolean }

/** what an exam needs, by its code, as its department says (an exam it does not name: nothing special, always reported) */
export function examIn(list: Partial<Exam>[] | undefined, code: string): Exam {
  const x = (list ?? []).find((e) => e.code?.toLowerCase() === code.toLowerCase())
  return { code, side: !!x?.side, contrast: !!x?.contrast, prep: x?.prep || null, prep_ar: x?.prep_ar || null, report: x?.report === 'asked' ? 'asked' : 'always' }
}
export function examOf(org: Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> | undefined, s: Pick<Service, 'code' | 'department_id'>): Exam {
  return examIn((settingIn(org, 'radiology.exams', s.department_id).exams as Partial<Exam>[] | undefined), s.code)
}
/** does this order end at its scan (no report): an exam reported only when asked, and not asked */
export const filmOnly = (e: Pick<Exam, 'report'>, w: Words | null | undefined) => e.report === 'asked' && !w?.report

// ── the typed line ──
const SIDE: Record<string, Side> = { left: 'left', lt: 'left', l: 'left', right: 'right', rt: 'right', r: 'right', both: 'both', bilateral: 'both', bil: 'both' }
const FILLER = new Set(['with', 'without', 'contrast', 'and', '&', 'of', 'the'])
const KIND_WORDS = new Set(['x-ray', 'xray', 'us', 'ct', 'mri'])
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+−-]+/g, ' ').trim()
const nameWords = (name: string) => norm(name).split(/\s+/).filter((w) => w && !FILLER.has(w))

export interface Said { exams: string[]; words: Words; contrast: 'with' | 'without' | null; priority: 'routine' | 'urgent' | 'stat'; question: string }
/** the words of a line: the exams (segments split by commas), and what is said for them all */
export function wordsOf(rest: string): Said {
  const at = rest.indexOf('?'); const question = at >= 0 ? rest.slice(at + 1).trim() : ''
  const words: Words = {}; let contrast: Said['contrast'] = null; let priority: Said['priority'] = 'routine'
  const exams = (at >= 0 ? rest.slice(0, at) : rest).split(',').map((seg) => seg.trim().split(/\s+/).filter((w) => {
    const x = w.toLowerCase()
    if (SIDE[x]) { words.side = SIDE[x]; return false }
    if (x === '+c' || x === 'c+' || x === '+contrast') { contrast = 'with'; return false }
    if (x === '-c' || x === '−c' || x === 'c-' || x === '-contrast') { contrast = 'without'; return false }
    if (x === 'portable' || x === 'port') { words.portable = true; return false }
    if (x === 'report' || x === 'rep') { words.report = true; return false }
    if (x === 'urgent' || x === 'stat') { priority = x; return false }
    return !!x
  }).join(' ')).filter(Boolean)
  return { exams, words, contrast, priority, question }
}

type Named = Pick<Service, 'id' | 'code' | 'name'>
/** the exams a segment names among these: its code exactly, else every word the start of a word of the name ("abd pelvis" → CT
 *  abdomen & pelvis, with and without contrast); then +c takes those with contrast, nothing or −c those without, where both fit */
export function examsFor<S extends Named>(seg: string, pool: S[], withContrast: (s: S) => boolean, contrast: Said['contrast']): S[] {
  const q = norm(seg); if (!q) return []
  const exact = pool.filter((s) => s.code.toLowerCase() === q.replace(/\s+/g, ''))
  if (exact.length) return exact
  const typed = q.split(/\s+/).filter((w) => !FILLER.has(w))
  let hits = pool.filter((s) => { const ws = nameWords(s.name); return typed.every((t) => ws.some((w) => w.startsWith(t))) })
  // the kind's own word typed ("ct brain" under /ct) fits every exam of it: drop it when the rest still finds some
  if (!hits.length && typed.length > 1) hits = pool.filter((s) => { const ws = nameWords(s.name); return typed.slice(1).every((t) => ws.some((w) => w.startsWith(t))) })
  if (hits.length > 1) {
    const pick = hits.filter((s) => contrast === 'with' ? withContrast(s) : !withContrast(s))
    if (pick.length) hits = pick
  }
  // still more than one: the one whose every word was typed ("us abd" is the abdomen, not the abdomen & pelvis); else asked
  if (hits.length > 1) {
    const whole = hits.filter((s) => nameWords(s.name).filter((w) => !KIND_WORDS.has(w)).every((w) => typed.some((t) => w.startsWith(t))))
    if (whole.length === 1) hits = whole
  }
  return hits
}
/** the pack's words on an order (spec §5.5, core change (a)) */
export const packOrder = (w: Words): PackOrder => ({ type: ORDER_TYPE, words: Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined && v !== false)) })
/** "left knee", "both" — the side in words for a line */
export const sideWord = (w: Words | null | undefined) => w?.side ? w.side : ''
