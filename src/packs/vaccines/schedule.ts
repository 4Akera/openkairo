// The vaccines pack's schedule and what is due (spec/openCare.md §5.7, Q25, Q26; the pictures #vax-chart, #vax-room). The schedule is the
// national rows (the MOHP's, loaded read-only: vaccines.national) and the clinic's optional rows (vaccines.optional); a dose is due from
// the later of its earliest age and the interval after the last dose of its series, overdue four weeks after, and too late past its
// latest age (rotavirus). Worked out from the birth date, the doses and the schedule, never typed; a dose too early is a notice, never
// a stop. Pure: a node test imports it.
import type { Organization, ServerEntry } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'

export const PACK = 'vaccines'
export const DOSE_TYPE = 'vaccines.dose'
/** one row of the schedule: a dose of a series */
export interface Row { key: string; vaccine: string; name: string; dose: number; age: string; earliest_days?: number; interval_days?: number; latest_days?: number
  how?: string; route?: string; site?: string; cvx?: string; national: boolean; pregnancy?: boolean }
/** one dose as recorded (the pack's table, or the chart's entries) */
export interface Dose { item: string; vaccine: string; dose: number | null; status: 'completed' | 'not-done'; given_at: string; source: 'here' | 'card'; reason?: string | null; department_id?: string | null }
export type State = 'given' | 'overdue' | 'due' | 'later' | 'too_late'
export interface RowState { row: Row; state: State; given?: Dose; notGiven: Dose[]; dueOn: string; weeksLate: number }
export interface Schedule { rows: Row[]; version: string | null; source: string | null; sample: boolean }

/** the clinic's settings (a clinic-wide key is kept under the clinic's own id) */
type Org = (Pick<Organization, 'settings' | 'settingKeys' | 'datatypes'> & { organization?: { id: string } }) | undefined
/** the schedule as the clinic has it now: the national rows, then its optional ones */
export function scheduleOf(org: Org): Schedule {
  const n = settingIn(org, 'vaccines.national' as never, org?.organization?.id ?? null) as { rows?: Omit<Row, 'national'>[]; version?: string; source?: string; sample?: boolean }
  const o = settingIn(org, 'vaccines.optional' as never, org?.organization?.id ?? null) as { rows?: Omit<Row, 'national' | 'key'>[] }
  const national = (n.rows ?? []).map((r) => ({ ...r, national: true }))
  const optional = (o.rows ?? []).map((r) => ({ ...r, key: `${r.vaccine}${r.dose}`, national: false }))
  return { rows: [...national, ...optional], version: n.version ?? null, source: n.source ?? null, sample: !!n.sample }
}

// ── days ──
const DAY = 86_400_000
const toDay = (iso: string) => iso.slice(0, 10)
const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY
const fromNum = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => fromNum(dayNum(d) + n)
export const daysBetween = (from: string, to: string) => dayNum(toDay(to)) - dayNum(toDay(from))
/** completed months of age on a day */
export const monthsAt = (birth: string, day: string) => { const [by, bm, bd] = birth.split('-').map(Number); const [ty, tm, td] = day.split('-').map(Number)
  return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0) }
/** an age in the clinic's words: 3 wk, 4 mo, 2 y */
export function ageWords(birth: string | null | undefined, day: string): string {
  if (!birth) return ''
  const days = daysBetween(birth, day); if (days < 56) return `${Math.max(0, Math.floor(days / 7))} wk`
  const m = monthsAt(birth.slice(0, 10), day); return m < 24 ? `${m} mo` : `${Math.floor(m / 12)} y`
}

/** each row's state for a child: given (its dose, here or from the card), not given (each time, with why), its due day worked out, overdue
 *  four weeks after it, too late past its latest age. A series' later dose counts from the last one given */
export function statusOf(rows: Row[], doses: Dose[], birth: string | null | undefined, today: string, pregnant = false): RowState[] {
  if (!birth) return []
  const b = birth.slice(0, 10)
  const given = doses.filter((d) => d.status === 'completed')
  const out: RowState[] = []
  // the national rows are the children's: from 19 years nothing of them is due (a dose recorded still shows)
  const adult = monthsAt(b, today.slice(0, 10)) >= 19 * 12
  for (const row of rows) {
    if (row.pregnancy && !pregnant && !given.some((d) => d.vaccine === row.vaccine)) continue
    if (adult && !row.pregnancy && !doses.some((d) => d.vaccine === row.vaccine && d.dose === row.dose)) continue
    const mine = given.find((d) => d.vaccine === row.vaccine && d.dose === row.dose)
    const notGiven = doses.filter((d) => d.status === 'not-done' && d.vaccine === row.vaccine && d.dose === row.dose)
    const before = given.filter((d) => d.vaccine === row.vaccine && (d.dose ?? 0) < row.dose).sort((x, y) => x.given_at.localeCompare(y.given_at)).at(-1)
    const earliest = row.pregnancy ? toDay(today) : addDays(b, row.earliest_days ?? 0)
    const after = before && row.interval_days ? addDays(toDay(before.given_at), row.interval_days) : earliest
    const dueOn = after > earliest ? after : earliest
    const late = daysBetween(dueOn, today)
    const state: State = mine ? 'given' : row.latest_days != null && daysBetween(b, today) > row.latest_days ? 'too_late'
      : late >= 28 ? 'overdue' : late >= 0 ? 'due' : 'later'
    out.push({ row, state, given: mine, notGiven, dueOn, weeksLate: Math.max(0, Math.floor(late / 7)) })
  }
  return out
}
/** the national rows by age, in order: "Birth · Hepatitis B 0 · OPV 0 · BCG" */
export function byAge(states: RowState[]): { age: string; states: RowState[] }[] {
  const out: { age: string; states: RowState[] }[] = []
  for (const s of states) { const g = out.find((x) => x.age === s.row.age); if (g) g.states.push(s); else out.push({ age: s.row.age, states: [s] }) }
  return out
}
export interface Summary { overdue: RowState[]; due: RowState[]; next: RowState | null; done: boolean; nationalTo: string | null }
/** what the chip, the banner and the marks say: overdue, due now, the next dose ahead, done to the last national age */
export function summaryOf(states: RowState[]): Summary {
  const nat = states.filter((s) => s.row.national)
  const overdue = nat.filter((s) => s.state === 'overdue'); const due = nat.filter((s) => s.state === 'due')
  const next = nat.filter((s) => s.state === 'later').sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0] ?? null
  const done = nat.length > 0 && nat.every((s) => s.state === 'given' || s.state === 'too_late')
  const lastGiven = [...nat].reverse().find((s) => s.state === 'given')
  return { overdue, due, next, done, nationalTo: lastGiven?.row.age ?? null }
}
/** the vaccines' names, joined: "OPV 5, MMR 1" */
export const names = (xs: RowState[]) => xs.map((s) => s.row.name).join(', ')

/** a row's age in months as its label says it ("Birth" 0, "4 mo" 4, "12–15 mo" 12; none for "in pregnancy") */
export const nominalMonths = (age: string) => /birth/i.test(age) ? 0 : Number(age.match(/\d+/)?.[0] ?? NaN)
/** what a child is due today and which earlier doses the card may show: today's are the national rows of the latest age the child has
 *  reached that are due, and of each optional series its first dose not given; the earlier national rows due are the card's to copy */
export function whatFor(s: Schedule, birth: string | null | undefined, doses: Dose[], today: string) {
  const states = statusOf(s.rows, doses, birth, today)
  if (!birth) return { now: [] as RowState[], earlier: [] as RowState[], tooLate: [] as RowState[] }
  const months = monthsAt(birth.slice(0, 10), today)
  const due = states.filter((x) => x.state === 'due' || x.state === 'overdue')
  const nat = due.filter((x) => x.row.national)
  const reached = nat.map((x) => nominalMonths(x.row.age)).filter((m) => !Number.isNaN(m) && m <= months)
  const age = reached.length ? Math.max(...reached) : Math.max(-1, ...nat.map((x) => nominalMonths(x.row.age)).filter((m) => !Number.isNaN(m)))
  const firstOf = (series: string) => states.filter((x) => !x.row.national && x.row.vaccine === series && x.state !== 'given').sort((a, b) => a.row.dose - b.row.dose)[0]
  const optional = [...new Set(states.filter((x) => !x.row.national).map((x) => x.row.vaccine))].map(firstOf).filter((x): x is RowState => !!x)
  return { now: [...nat.filter((x) => nominalMonths(x.row.age) === age), ...optional.filter((x) => x.state === 'due' || x.state === 'overdue')],
    earlier: nat.filter((x) => nominalMonths(x.row.age) < age), tooLate: optional.filter((x) => x.state === 'too_late') }
}
/** the live vaccines: none in the four weeks before another live one */
export const LIVE = new Set(['mmr', 'opv', 'bcg', 'var', 'rota', 'yf'])

type DoseEntryData = { status?: string; reason?: string; vaccines?: { vaccine?: string; dose?: number; source?: string; given_on?: string } }
/** a dose entry as the schedule reads it (a card's copy at its card date) */
export function doseOf(e: ServerEntry): Dose | null {
  const d = e.data as DoseEntryData | undefined
  if (!d?.vaccines?.vaccine) return null
  return { item: e.item, vaccine: d.vaccines.vaccine, dose: d.vaccines.dose ?? null, status: d.status === 'not-done' ? 'not-done' : 'completed',
    given_at: d.vaccines.given_on ?? e.occurred_at, source: d.vaccines.source === 'card' ? 'card' : 'here', reason: d.reason ?? null, department_id: e.department_id }
}
export const dosesOf = (entries: ServerEntry[] | undefined) => (entries ?? []).filter((e) => !e.hidden).map(doseOf).filter((d): d is Dose => !!d)

