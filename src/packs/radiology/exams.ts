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
// whole words only: a single l or r is part of an exam's words ("l spine" is the lumbar spine), never a side
const SIDE: Record<string, Side> = { left: 'left', lt: 'left', right: 'right', rt: 'right', both: 'both', bilateral: 'both', bil: 'both' }
const FILLER = new Set(['with', 'without', 'contrast', 'and', '&', 'of', 'the'])
const KIND_WORDS = new Set(['x-ray', 'xray', 'xr', 'us', 'ct', 'mri', 'mr'])
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+−-]+/g, ' ').trim()
const nameWords = (name: string) => norm(name).split(/\s+/).filter((w) => w && !FILLER.has(w))

export interface Said { exams: string[]; words: Words; contrast: 'with' | 'without' | 'both' | null; priority: 'routine' | 'urgent' | 'stat'; question: string }
/** the words of a line: the exams (segments split by commas), and what is said for them all */
export function wordsOf(rest: string): Said {
  const at = rest.indexOf('?'); const question = at >= 0 ? rest.slice(at + 1).trim() : ''
  const words: Words = {}; let contrast: Said['contrast'] = null; let priority: Said['priority'] = 'routine'
  // contrast spelled out, the longer sayings first: with and without (±, +/-, with/without, with or without, w/wo) is asked; without
  // (w/o, non-contrast, plain, -contrast) is −c; with (+contrast, "with contrast", or "contrast" alone) is +c
  const C = '(?:\\s+contrast)?'
  const before = (at >= 0 ? rest.slice(0, at) : rest)
    .replace(new RegExp(`\\b(?:with\\s*(?:and|&|/|or)\\s*(?:without|w/o)|without\\s*(?:and|&|/|or)\\s*with|w/wo)${C}\\b|(?:^|\\s)(?:±|\\+/-|\\+-)\\s*(?:contrast\\b|c\\b)?`, 'gi'), ' ±c ')
    .replace(/(?:^|\s)[-−]\s*contrast\b|\bnon-?contrast\b|\bwithout\s+contrast\b|\bw\/o(?:\s+contrast)?(?=\s|$)|\bplain\b/gi, ' -c ')
    .replace(/(?:^|\s)\+\s*contrast\b|\bwith\s+contrast\b|\bcontrast\b/gi, ' +c ')
  const exams = before.split(',').map((seg) => seg.trim().split(/\s+/).filter((w) => {
    const x = w.toLowerCase()
    if (SIDE[x]) { words.side = SIDE[x]; return false }
    if (x === '±c') { contrast = 'both'; return false }
    if (x === '+c' || x === 'c+' || x === '+contrast') { if (contrast !== 'both') contrast = 'with'; return false }
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
 *  abdomen & pelvis, with and without contrast); then +c takes those with contrast (none of them with contrast: all are asked),
 *  nothing or −c those without, where both fit. A +c no exam with contrast fits is the caller's to refuse (contrastMissed) */
export function examsFor<S extends Named>(seg: string, pool: S[], withContrast: (s: S) => boolean, contrast: Said['contrast']): S[] {
  const q = norm(seg); if (!q) return []
  const exact = pool.filter((s) => s.code.toLowerCase() === q.replace(/\s+/g, ''))
  if (exact.length) return exact
  const typed = q.split(/\s+/).filter((w) => !FILLER.has(w))
  let hits = pool.filter((s) => { const ws = nameWords(s.name); return typed.every((t) => ws.some((w) => w.startsWith(t))) })
  // the kind's own word typed ("ct brain" under /ct) fits every exam of it: drop that word, and only that word, when the rest finds some
  if (!hits.length && typed.length > 1 && KIND_WORDS.has(typed[0])) hits = pool.filter((s) => { const ws = nameWords(s.name); return typed.slice(1).every((t) => ws.some((w) => w.startsWith(t))) })
  if (hits.length > 1) {
    const pick = hits.filter((s) => contrast === 'with' ? withContrast(s) : !withContrast(s))
    if (pick.length) hits = pick
    else if (contrast === 'with') return hits   // +c and none marked with contrast: asked, never the one without
  }
  // still more than one: the one whose every word was typed ("us abd" is the abdomen, not the abdomen & pelvis); else asked
  if (hits.length > 1) {
    const whole = hits.filter((s) => nameWords(s.name).filter((w) => !KIND_WORDS.has(w)).every((w) => typed.some((t) => w.startsWith(t))))
    if (whole.length === 1) hits = whole
  }
  return hits
}
/** +c said and none of the exams found is with contrast, −c said and every one is, or "with and without" said (one exam here, with or
 *  without): refused rather than ordered otherwise, or guessed */
export const contrastMissed = <S>(hits: S[], withContrast: (s: S) => boolean, contrast: Said['contrast']) =>
  hits.length > 0 && (contrast === 'both' || (contrast === 'with' && hits.every((h) => !withContrast(h))) || (contrast === 'without' && hits.every((h) => withContrast(h))))
/** the pack's words on an order (spec §5.5, core change (a)) */
export const packOrder = (w: Words): PackOrder => ({ type: ORDER_TYPE, words: Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined && v !== false)) })
/** "left knee", "both" — the side in words for a line */
export const sideWord = (w: Words | null | undefined) => w?.side ? w.side : ''
/** two exams of the same part of the body, whatever their kind: a word of the part in both names (abdomen, knee, lumbar), the kind,
 *  contrast and filler words aside ("CT abdomen & pelvis" and "US abdomen" are; "CT brain" and "CT chest" are not) */
export function samePart(a: string, b: string): boolean {
  // "spine" alone is no part: the cervical and the lumbar spine are two
  const part = (n: string) => new Set(nameWords(n).filter((w) => !KIND_WORDS.has(w) && !['doppler', 'spine'].includes(w)))
  const x = part(a); return [...part(b)].some((w) => x.has(w))
}
