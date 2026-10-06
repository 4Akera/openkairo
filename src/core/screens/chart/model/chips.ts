// The base sections' chip words (spec/openCare.md §5.1 "The section chips"): a count, or a state in words. Problems the active ones,
// Medicines the current ones, Allergies "not asked" (warn), "none known" or a count (danger with the severe ones counted in words),
// Results a count or "n critical" (danger), History, Documents and Visits a count. A count of none says nothing. The list chips count
// this patient's list drafts too, as their section heads do. Pure.
import type { Organization, ServerEntry } from '../../../db/types'
import type { ChipWord, DocCount, Drafted } from '../sections'
import { allergiesOf, historyOf, medicinesOf, problemsOf, visitsOf, type ChartCtx, type Rec } from './record'
import { resultsByKind } from './values'

type Types = Organization['types'] | undefined
/** a count: nothing for none */
export const countWord = (n: number | null | undefined): ChipWord | null => n ? { word: String(n) } : null

/** the files read so far; "3+" while earlier pages remain unread */
export const documentsWord = (d: DocCount | null | undefined): ChipWord | null => d?.n ? { word: d.more ? `${d.n}+` : String(d.n) } : null

export const problemsWord = (rec: Rec, ctx: ChartCtx, drafted?: Drafted) => countWord(problemsOf(rec, ctx).active.length + (drafted?.problem ?? 0))
export const medicinesWord = (rec: Rec, ctx: ChartCtx, drafted?: Drafted) => countWord(medicinesOf(rec, ctx).current.length + (drafted?.medication ?? 0))

/** not asked (warn: it asks for a question), none known (signed or drafted), or how many with the drafted; severe ones (high
 *  criticality or a severe reaction) danger, counted in words */
export function allergiesWord(rec: Rec, ctx: ChartCtx, drafted?: Drafted): ChipWord {
  const a = allergiesOf(rec, ctx); const n = a.active.length + (drafted?.allergy ?? 0)
  if (!n) return a.nka || drafted?.nka ? { word: 'none known' } : { word: 'not asked', tone: 'warn' }
  const severe = a.active.filter((x) => x.high_risk || x.severity === 'severe').length
  return severe ? { word: `${n}, ${severe} severe`, tone: 'danger' } : { word: String(n) }
}

/** how many tests, or how many of them are critical now (their latest value) */
export function resultsWord(rec: Rec, types?: Types): ChipWord | null {
  const tests = resultsByKind(rec, types).groups.flatMap((g) => g.tests)
  const critical = tests.filter((t) => t.latest.flag === 'critical').length
  return critical ? { word: `${critical} critical`, tone: 'danger' } : countWord(tests.length)
}

export function historyWord(facts: ServerEntry[] | undefined, types?: Types) {
  const h = historyOf(facts ?? [], types)
  return countWord(h.procedures.length + h.family.length + h.social.length + h.other.length)
}
export const visitsWord = (rec: Rec, ctx: ChartCtx) => countWord(visitsOf(rec, ctx).length)
