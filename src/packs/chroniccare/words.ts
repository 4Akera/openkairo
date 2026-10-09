// Chronic care's words in the chart (spec/openCare.md §5.1 rules 2–3; picture #chronic-visit): the section's state from the one record
// read — the problem list, the latest values, the observations and procedures on the facts page — and the pack's own targets. The chip
// ("3 due"), the Summary line ("BP 146/90 ↑ · HbA1c 8.2 ↑") and the banner ("HbA1c 8.2 ↑", "3 checks due"). Pure.
import type { ServerEntry } from '@core/db/types'
import type { SectionInput } from '@core/screens/chart/sections'
import { problemsOf } from '@core/screens/chart/model/record'
import { careOf, conditionsOf, offWords, summaryOf, type Done, type OwnTarget, type ProblemIn, type Value } from './model'

type In = Pick<SectionInput, 'rec' | 'ctx' | 'facts'> & { own: { shown: ServerEntry[] } }
/** a target entry as the model reads it */
export function ownOf(entries: ServerEntry[]): OwnTarget[] {
  return entries.flatMap((e) => { const d = e.data as { condition?: string; measure?: string; op?: OwnTarget['op']; value?: number; value2?: number; reason?: string; status?: string } | undefined
    return d?.condition && d.measure && d.op && d.value != null && d.status !== 'ended' ? [{ condition: d.condition, measure: d.measure, op: d.op, value: d.value, value2: d.value2, reason: d.reason ?? null, at: e.occurred_at }] : [] })
}
/** what the record holds for chronic care: problems, values, coded observations and procedures */
export function recordOf(x: In): { problems: ProblemIn[]; values: Value[]; done: Done[] } {
  const p = problemsOf(x.rec, x.ctx)
  const problems = [...p.active, ...p.past].map((r) => ({ code: r.code, status: r.status, onset: r.onset_on, name: r.name }))
  const values = (x.rec.tables['base.values']?.rows ?? []).map((v) => ({ code: v.code, value: v.value, at: v.at }))
  const done = (x.facts ?? []).filter((e) => !e.hidden && e.type !== 'crossed_out').map((e) => ({ codes: e.codes ?? [], at: e.occurred_at, text: String(((e.data as { value?: { text?: string } } | undefined)?.value?.text) ?? '') }))
  return { problems, values, done }
}
export const stateOf = (x: In) => { const r = recordOf(x); return careOf(conditionsOf(x.ctx.org).conditions, r.problems, r.values, r.done, ownOf(x.own.shown), x.ctx.now ?? new Date()) }
export function chipWord(x: In): { word: string } | null {
  const st = stateOf(x); if (!st.length) return null
  const s = summaryOf(st); return s.due.length ? { word: `${s.due.length} due` } : s.offTarget.length ? { word: 'off target' } : { word: 'on target' }
}
export function summaryLine(x: In): string | null {
  const st = stateOf(x); if (!st.length) return null
  const s = summaryOf(st); const off = s.offTarget.map(offWords)
  return [...off, s.due.length ? `${s.due.length} ${s.due.length === 1 ? 'check' : 'checks'} due` : null].filter(Boolean).join(' · ') || `${s.conditions.join(', ')} · on target`
}
export function bannerWords(x: In): { word: string; rank: number; tone?: 'warn' }[] {
  const st = stateOf(x); if (!st.length) return []
  const s = summaryOf(st)
  return [...s.offTarget.slice(0, 1).map((m) => ({ word: offWords(m), rank: 1, tone: 'warn' as const })),
    ...(s.due.length ? [{ word: `${s.due.length} ${s.due.length === 1 ? 'check' : 'checks'} due`, rank: 2, tone: 'warn' as const }] : []),
    ...s.offTarget.slice(1).map((m) => ({ word: offWords(m), rank: 3, tone: 'warn' as const }))]
}
