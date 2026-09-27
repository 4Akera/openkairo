// The patient screen's kept behaviours (chart-plan.md §2, build plan 3.10), as pure decisions: whose visit it is, the call on open, ⌘↵,
// the banner's actions, what Done and Return to waiting write after the drafts, where Done goes, Done's other choices (owner D5), the
// stay words; and the center's kind filter over sets and the Whole record's two views. Run by npm run test:chart after test-chart.ts.
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import type { Department, PresenceRow, QueueRow, VisitRow } from '../src/core/db/types'
import { afterDone, barOf, callsOnOpen, cmdEnter, doneChoices, doneLabel, roleOf, stayWords, visitMoves } from '../src/core/screens/chart/model/visit'
import { byDate, bySet, byVisit, filterSets } from '../src/core/screens/chart/model/encounter'
import { itemsOf } from '../src/core/screens/chart/model/items'
import { E, T0, presence, types } from './chart-fixtures'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const visit = (over: Partial<VisitRow> = {}, state: PresenceRow['state'] = 'with'): VisitRow => ({ id: 'v1', patient_id: 'pt', department_id: 'gp', request_id: null, assignee_id: 'dr',
  status: 'in_consult', priority: 'routine', is_first: false, arrived_at: T0, present_at: T0, seen_at: null, ended_at: null, kind: 'visit', place_id: null, latest_entry: 'e0', version: 1,
  wait: null, presence: presence('v1', { state }), ...over })
const stay = (state: PresenceRow['state'] = 'admitted', over: Partial<VisitRow> = {}) => visit({ kind: 'stay', status: state === 'admitted' ? 'admitted' : 'discharged', department_id: 'ward', assignee_id: null, ...over }, state)
const dept = (over: Partial<Department> = {}) => ({ id: 'gp', work: 'visits', after_done: 'next', patients_wait: false, ...over }) as Department
const omar = { id: 'v2', patient: { given_name: 'Omar' } } as QueueRow
const yes = () => true

test('whose visit: mine in consult, another clinician\'s (theirs to finish), a waiting one, another department\'s, a stay', () => {
  assert.deepEqual(roleOf(visit(), 'gp', 'dr'), { stay: false, admitted: false, mine: true, withOther: false, consult: true })
  assert.deepEqual(roleOf(visit({ assignee_id: 'dr2' }), 'gp', 'dr'), { stay: false, admitted: false, mine: false, withOther: true, consult: false })
  assert.deepEqual(roleOf(visit({ status: 'waiting', assignee_id: null }, 'waiting'), 'gp', 'dr'), { stay: false, admitted: false, mine: true, withOther: false, consult: false })
  assert.deepEqual(roleOf(visit(), 'lab', 'dr'), { stay: false, admitted: false, mine: false, withOther: false, consult: false })
  assert.deepEqual(roleOf(stay(), 'ward', 'rn'), { stay: true, admitted: true, mine: false, withOther: false, consult: false })
  assert.equal(roleOf(stay('discharged'), 'ward', 'rn').admitted, false); assert.equal(roleOf(null, 'gp', 'dr').mine, false)
})
test('opening a waiting or back patient of mine from a visit link calls him; nothing else does', () => {
  const w = visit({ status: 'waiting', assignee_id: null }, 'waiting'); const back = visit({ status: 'pending', assignee_id: 'dr' }, 'back')
  assert.ok(callsOnOpen(w, roleOf(w, 'gp', 'dr'), true, true)); assert.ok(callsOnOpen(back, roleOf(back, 'gp', 'dr'), true, true))
  assert.ok(!callsOnOpen(w, roleOf(w, 'gp', 'dr'), false, true)); assert.ok(!callsOnOpen(w, roleOf(w, 'gp', 'dr'), true, false))   // no right to call · /patient/:id
  assert.ok(!callsOnOpen(visit(), roleOf(visit(), 'gp', 'dr'), true, true)); assert.ok(!callsOnOpen(stay(), roleOf(stay(), 'ward', 'rn'), true, true))
})
test('⌘↵: Sign in a stay, Done in my consult, Sign N for someone else\'s patient or with no visit (new), nothing while mine waits', () => {
  assert.equal(cmdEnter(roleOf(stay(), 'ward', 'rn'), 0), 'sign'); assert.equal(cmdEnter(roleOf(visit(), 'gp', 'dr'), 2), 'done')
  assert.equal(cmdEnter(roleOf(visit({ assignee_id: 'dr2' }), 'gp', 'dr'), 1), 'sign'); assert.equal(cmdEnter(roleOf(null, 'gp', 'dr'), 1), 'sign')
  assert.equal(cmdEnter(roleOf(null, 'gp', 'dr'), 0), null); assert.equal(cmdEnter(roleOf(visit({ status: 'pending' }, 'pending'), 'gp', 'dr'), 3), null)
})
test('the banner\'s actions: a stay\'s Discharge (admitted, here, allowed, not open), Done, with another, Sign N, Start visit', () => {
  assert.deepEqual(barOf(roleOf(stay(), 'ward', 'rn'), stay(), 0, dept({ id: 'ward', work: 'stays' }), yes), { kind: 'stay', discharge: true })
  assert.deepEqual(barOf(roleOf(stay(), 'ward', 'rn'), stay(), 0, dept({ id: 'ward', work: 'stays' }), yes, true), { kind: 'stay', discharge: false })
  assert.deepEqual(barOf(roleOf(stay('discharged'), 'ward', 'rn'), stay('discharged'), 0, dept({ id: 'ward', work: 'stays' }), yes), { kind: 'stay', discharge: false })
  assert.deepEqual(barOf(roleOf(stay(), 'ward', 'rn'), stay(), 0, dept({ id: 'ward', work: 'stays' }), (a) => a !== 'write:discharged'), { kind: 'stay', discharge: false })
  assert.deepEqual(barOf(roleOf(visit(), 'gp', 'dr'), visit(), 2, dept(), yes), { kind: 'clinic' })
  assert.deepEqual(barOf(roleOf(visit({ assignee_id: 'dr2' }), 'gp', 'dr'), visit({ assignee_id: 'dr2' }), 2, dept(), yes), { kind: 'other', withOther: true, signN: 2, start: false })
  assert.deepEqual(barOf(roleOf(null, 'gp', 'dr'), null, 0, dept(), yes), { kind: 'other', withOther: false, signN: 0, start: true })
  assert.equal((barOf(roleOf(null, 'ward', 'dr'), null, 0, dept({ id: 'ward', work: 'stays' }), yes) as { start: boolean }).start, false)
  assert.equal((barOf(roleOf(null, 'gp', 'dr'), null, 0, dept(), (a) => a !== 'write:checked_in') as { start: boolean }).start, false)
})
test('Done writes seen (unseen, something written) then done, each changing the one before; Return to waiting is sent out', () => {
  const [seen, done] = visitMoves(visit(), 'gp', 3, { type: 'done', data: { wait: true } })
  assert.deepEqual([seen.type, seen.refers_to, seen.relation, done.type, done.refers_to, done.visit_id], ['seen', 'e0', 'changes', 'done', seen.id, 'v1']); assert.deepEqual(done.data, { wait: true })
  assert.deepEqual(visitMoves(visit({ seen_at: T0 }), 'gp', 3, { type: 'done', data: {} }).map((e) => [e.type, e.refers_to]), [['done', 'e0']])
  assert.deepEqual(visitMoves(visit(), 'gp', 0, { type: 'done', data: {} }).map((e) => e.type), ['done'])                    // nothing written: not seen
  const back = visitMoves(visit(), 'gp', 1, { type: 'back_to_waiting', data: { reason: 'sent_out' } }); assert.deepEqual(back.map((e) => e.type), ['seen', 'back_to_waiting'])
  assert.deepEqual(back[1].data, { reason: 'sent_out' })
})
test('Done goes to the next patient in place of this one, else the queue; another from the strip sends back one only called', () => {
  assert.deepEqual(afterDone(true, omar), { to: '/visit/v2', replace: true }); assert.deepEqual(afterDone(true, null), { to: '/', replace: false })
  assert.deepEqual(afterDone(false, omar), { to: '/', replace: false })
})
test('Done\'s label and its other choices (D5: in a strip, by department.patients_wait and after_done; Not here before seen)', () => {
  assert.equal(doneLabel(2, dept(), omar), 'Sign 2 · Done → Omar'); assert.equal(doneLabel(0, dept({ after_done: 'queue' }), omar), 'Done')
  assert.deepEqual(doneChoices(dept({ patients_wait: true }), visit(), omar, 0).map((c) => c.key), ['home', 'queue', 'not_here', 'return'])
  const q = doneChoices(dept({ after_done: 'queue' }), visit({ seen_at: T0 }), omar, 2)
  assert.deepEqual(q.map((c) => c.key), ['wait', 'next', 'return']); assert.equal(q[1].label, 'Done → next patient (Omar)'); assert.match(q[2].hint!, /Signs the 2 written/)
  assert.deepEqual(doneChoices(dept({ after_done: 'queue' }), visit({ seen_at: T0 }), null, 0).map((c) => c.key), ['wait', 'return'])
})
test('a stay in words: day 1 is the admission day in the clinic\'s zone; a discharged stay says how long', () => {
  const s = stay('admitted', { arrived_at: '2026-09-24T22:30:00Z' })                                     // 25 Sep in Cairo
  assert.equal(stayWords(s, 'Bed 3', undefined, '2026-09-27T10:00:00Z'), 'Admitted · Bed 3 · day 3'); assert.equal(stayWords(s, null, undefined, '2026-09-27T10:00:00Z'), 'Admitted · no bed · day 3')
  assert.equal(stayWords({ ...s, arrived_at: '2026-09-27T09:00:00Z' }, 'Bed 3', '2026-09-24T22:30:00Z', '2026-09-27T10:00:00Z'), 'Admitted · Bed 3 · day 3')   // written late: its clinical start
  assert.match(stayWords(stay('discharged', { arrived_at: '2026-09-24T22:30:00Z', ended_at: '2026-09-26T09:00:00Z' }), 'Bed 3'), /^Discharged .* · 2 days$/)
})
test('the kind filter over sets; the Whole record by visit (outside last) and by day', () => {
  const note = E('note', { visit_id: 'v1', set_id: 'a', recorded_at: '2026-09-26T08:00:00Z' }); const vit = E('vitals', { visit_id: 'v1', set_id: 'a', recorded_at: '2026-09-26T08:00:00Z' })
  const other = E('note', { visit_id: 'v2', set_id: 'b', recorded_at: '2026-09-27T09:00:00Z' }); const alone = E('result', { set_id: 'c', recorded_at: '2026-09-27T11:00:00Z' })
  const sets = bySet(itemsOf([note, vit, other, alone], { types }), [], types)
  assert.equal(filterSets(sets, 'all'), sets); assert.deepEqual(filterSets(sets, 'vitals').map((s) => s.set_id), ['a'])
  assert.deepEqual(filterSets(sets, 'notes').map((s) => [s.set_id, s.items.length]), [['b', 1], ['a', 1]]); assert.deepEqual(filterSets(sets, 'orders'), [])
  assert.deepEqual(byVisit(sets).map((g) => g.visit_id), ['v2', 'v1', null])
  assert.deepEqual(byDate(sets).map((d) => [d.day, d.sets.length]), [['2026-09-27', 2], ['2026-09-26', 1]])
})
console.log(`chart (the patient screen): ${n} groups passed`)
