// The patient screen's decisions (chart-plan.md §2, moved from visit/VisitScreen.tsx as they were): whose visit it is, what ⌘↵ does,
// which actions the banner offers, what Done, Return to waiting and Discharge write after the drafts, where Done goes next, whether
// opening another patient sends this one back, and the banner's encounter words. Pure, so each kept behaviour is tested
// (npm run test:chart); useChartActions only wires them to the writer and the router.
import type { EntryIn } from '../../../db/rpc'
import type { Department, QueueRow, VisitRow } from '../../../db/types'
import type { EntryData } from '../../../db/shapes.generated'
import { move } from '../../../db/entries'
import { minutesSince, shortDate } from '../../../ui/time'
import { stayDay } from './encounter'

/** stay: a stay takes only its own moves (§4.2); mine: this department's visit, unless another clinician has it in consult (theirs to
 *  finish); consult: mine and in consult, so Done is offered */
export interface Role { stay: boolean; admitted: boolean; mine: boolean; withOther: boolean; consult: boolean }
export function roleOf(v: VisitRow | null, departmentId: string | null | undefined, me: string | null | undefined): Role {
  const stay = v?.kind === 'stay'; const admitted = stay && v!.presence.state === 'admitted'
  const here = !!v && v.department_id === departmentId
  const withOther = here && v!.status === 'in_consult' && !!v!.assignee_id && v!.assignee_id !== me
  const mine = here && !stay && !withOther
  return { stay, admitted, mine, withOther, consult: mine && v!.status === 'in_consult' }
}

/** opening a waiting or back patient of mine from a visit link calls him, once (calling is not seeing) */
export const callsOnOpen = (v: VisitRow | null, role: Role, canCall: boolean, fromVisitLink: boolean) =>
  !!v && role.mine && (v.presence.state === 'waiting' || v.presence.state === 'back') && canCall && fromVisitLink

/** ⌘↵: Sign in a stay; Done with my patient in consult; Sign N for someone else's patient or with no visit (new: only the button did) */
export function cmdEnter(role: Role, drafts: number): 'sign' | 'done' | null {
  if (role.stay) return 'sign'
  if (role.consult) return 'done'
  return !role.mine && drafts > 0 ? 'sign' : null
}

/** the banner's actions: a stay's (Discharge, Sign), a clinic visit of mine in consult (Done and its choices), or the rest — "with Dr. X,
 *  theirs to finish", Sign N (written outside the visit), Start visit (a clinic, no visit open here) */
export type Bar = { kind: 'stay'; discharge: boolean } | { kind: 'clinic' } | { kind: 'other'; withOther: boolean; signN: number; start: boolean }
export function barOf(role: Role, v: VisitRow | null, drafts: number, dept: Pick<Department, 'id' | 'work'>, can: (a: string) => boolean, discharging = false): Bar {
  if (role.stay && v) return { kind: 'stay', discharge: role.admitted && v.department_id === dept.id && can('write:discharged') && !discharging }
  if (role.consult) return { kind: 'clinic' }
  return { kind: 'other', withOther: role.withOther, signN: !role.mine ? drafts : 0, start: !v && dept.work === 'visits' && can('write:checked_in') }
}

type Last = { type: 'done'; data: EntryData['done'] } | { type: 'back_to_waiting'; data: EntryData['back_to_waiting'] }
/** the visit's moves after the drafts: seen when nobody saw him yet and something is written, then the move asked for; each changes the
 *  one before (so two people moving one visit at once are told) */
export function visitMoves(v: Pick<VisitRow, 'id' | 'patient_id' | 'latest_entry' | 'seen_at'>, departmentId: string, written: number, last: Last): EntryIn[] {
  const seen = !v.seen_at && written ? [move('seen', v, departmentId, {})] : []
  return [...seen, last.type === 'done' ? move('done', v, departmentId, last.data, seen[0]?.id) : move('back_to_waiting', v, departmentId, last.data, seen[0]?.id)]
}
/** Done → the next patient unless the department goes back to the queue (department.after_done) */
export const doneNext = (dept: Pick<Department, 'after_done'>) => dept.after_done !== 'queue'
/** where Done lands: the next patient in place of this one, else the queue */
export const afterDone = (andNext: boolean, next: Pick<QueueRow, 'id'> | null) => andNext && next ? { to: `/visit/${next.id}`, replace: true } : { to: '/', replace: false }
/** another patient from the strip: one only called, with nothing written, goes back to his place */
export const sendsBack = (v: VisitRow | null, role: Role, written: number) => !!v && role.mine && v.status === 'in_consult' && !v.seen_at && !written
/** the Done button: "Sign 3 · Done → Omar" */
export const doneLabel = (drafts: number, dept: Pick<Department, 'after_done'>, next: QueueRow | null) =>
  `${drafts ? `Sign ${drafts} · ` : ''}Done${doneNext(dept) && next ? ` → ${next.patient.given_name}` : ''}`

/** Done's other choices, in a strip under the banner (owner decision D5: never a menu over the record) */
export interface Choice { key: 'home' | 'wait' | 'next' | 'queue' | 'not_here' | 'return'; label: string; hint?: string }
export function doneChoices(dept: Pick<Department, 'after_done' | 'patients_wait'>, v: Pick<VisitRow, 'seen_at'>, next: QueueRow | null, drafts: number): Choice[] {
  const out: Choice[] = [dept.patients_wait ? { key: 'home', label: 'Done — patient goes home', hint: 'The visit closes now; results go to your review list' }
    : { key: 'wait', label: 'Done — patient waits for results', hint: 'The patient comes back when the results are in' }]
  if (!doneNext(dept)) { if (next) out.push({ key: 'next', label: `Done → next patient (${next.patient.given_name})` }) } else out.push({ key: 'queue', label: 'Done, back to the queue' })
  if (!v.seen_at) out.push({ key: 'not_here', label: 'Not here', hint: 'Called but not here: he keeps his place, and the desk sees the missed call' })
  out.push({ key: 'return', label: 'Return to waiting', hint: drafts ? `Signs the ${drafts} written so far; the visit stays open` : 'The visit stays open; call the patient in again later' })
  return out
}

/** "Admitted · Bed 3 · day 2": day 1 is the day of admission, in the clinic's time zone (start: when it began in clinical time — an
 *  admission written late keeps its day, as the center's days do); a stay that ended, its length */
export function stayWords(v: Pick<VisitRow, 'arrived_at' | 'ended_at' | 'presence'>, bed: string | null | undefined, start = v.arrived_at, now = new Date().toISOString()) {
  const day = stayDay(start, v.ended_at ?? now)
  return v.presence.state === 'admitted' ? `Admitted · ${bed ?? 'no bed'} · day ${day}` : `Discharged ${shortDate(v.ended_at ?? v.presence.last_at)} · ${day} day${day > 1 ? 's' : ''}`
}
/** a clinic visit in words: in consult · follow-up · 12 min */
export const visitWords = (v: Pick<VisitRow, 'status' | 'is_first' | 'seen_at'>) =>
  [v.status.replace('_', ' '), v.is_first ? 'new' : 'follow-up', v.seen_at ? `${minutesSince(v.seen_at)} min` : null].filter(Boolean).join(' · ')
