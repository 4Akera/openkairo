// The vaccines pack's words (spec/openCare.md §5.1 rules 2–4; picture #vax-chart): the chip ("2 overdue", "9 mo", "done"), the Summary
// line, the banner ("2 vaccines overdue", "vaccines up to date") and the row mark ("9-month vaccines due", "overdue 3 wk"), each worked
// out from the birth date, the doses and the schedule. Pure.
import type { ServerEntry } from '@core/db/types'
import { ymd } from '@core/ui/time'
import { dosesOf, scheduleOf, statusOf, summaryOf, type Dose, type Schedule } from './schedule'

/** pregnant now, by the base's standing fact (tetanus in pregnancy is due then) */
export function pregnantOf(facts: ServerEntry[] | undefined): boolean {
  const p = (facts ?? []).filter((e) => e.type === 'pregnancy' && !e.hidden).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]
  const d = p?.data as { status?: string; pregnant?: boolean } | undefined
  return !!d && d.status === 'current' && !!d.pregnant
}
export interface Said { overdue: number; due: number; next: string | null; done: boolean; nationalTo: string | null; dueNames: string; overdueWeeks: number }
/** a child's schedule in a few numbers */
export function saidOf(schedule: Schedule, doses: Dose[], birth: string | null | undefined, today = ymd(new Date().toISOString()), pregnant = false): Said | null {
  if (!birth || !schedule.rows.length) return null
  const s = summaryOf(statusOf(schedule.rows, doses, birth, today, pregnant))
  return { overdue: s.overdue.length, due: s.due.length, next: s.next?.row.age ?? null, done: s.done, nationalTo: s.nationalTo,
    dueNames: [...s.overdue, ...s.due].map((x) => x.row.name).join(', '), overdueWeeks: Math.max(0, ...s.overdue.map((x) => x.weeksLate)) }
}
type Org = Parameters<typeof scheduleOf>[0]
/** the chip's word: overdue in amber, else due now, else the next age, else done */
export function chipWord(org: Org, entries: ServerEntry[], birth: string | null | undefined, pregnant = false): { word: string; tone?: 'warn' } | null {
  const s = saidOf(scheduleOf(org), dosesOf(entries), birth, undefined, pregnant); if (!s) return null
  if (s.overdue) return { word: `${s.overdue} overdue`, tone: 'warn' }
  if (s.due) return { word: `${s.due} due` }
  if (s.done) return { word: 'done' }
  return s.next ? { word: s.next } : null
}
/** the Summary line */
export function summaryLine(org: Org, entries: ServerEntry[], birth: string | null | undefined, pregnant = false): string | null {
  const s = saidOf(scheduleOf(org), dosesOf(entries), birth, undefined, pregnant); if (!s) return null
  if (s.overdue) return `${s.overdue} overdue: ${s.dueNames}`
  if (s.due) return `due now: ${s.dueNames}`
  if (s.done) return `national schedule done${s.nationalTo ? ` to ${s.nationalTo}` : ''}`
  return s.nationalTo ? `national schedule done to ${s.nationalTo}${s.next ? ` · next at ${s.next}` : ''}` : s.next ? `next at ${s.next}` : null
}
/** the banner's words: overdue in amber (rank 1), up to date once given to the last age due */
export function bannerWords(org: Org, entries: ServerEntry[], birth: string | null | undefined, pregnant = false): { word: string; rank: number; tone?: 'warn' }[] {
  const s = saidOf(scheduleOf(org), dosesOf(entries), birth, undefined, pregnant); if (!s) return []
  if (s.overdue) return [{ word: `${s.overdue} ${s.overdue === 1 ? 'vaccine' : 'vaccines'} overdue`, rank: 1, tone: 'warn' }]
  if (s.due) return [{ word: `${s.due} ${s.due === 1 ? 'vaccine' : 'vaccines'} due`, rank: 2 }]
  return entries.length ? [{ word: 'vaccines up to date', rank: 3 }] : []
}
/** the row's mark: "overdue 3 wk", or "9-month vaccines due" */
export function markWord(schedule: Schedule, doses: Dose[], birth: string | null | undefined, today?: string): { word: string; tone?: 'warn' } | null {
  const s = saidOf(schedule, doses, birth, today); if (!s) return null
  if (s.overdue) return { word: `overdue ${s.overdueWeeks} wk`, tone: 'warn' }
  if (s.due) { const st = statusOf(schedule.rows, doses, birth, today ?? ymd(new Date().toISOString())).find((x) => x.state === 'due' && x.row.national)
    return { word: st ? `${st.row.age.replace(/ mo$/, '-month')} vaccines due`.replace(/^Birth vaccines due$/, 'birth vaccines due') : 'vaccines due' } }
  return null
}
