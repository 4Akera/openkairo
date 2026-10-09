// The patient screen's kept behaviours (chart-plan.md §2, build plan 3.10), as pure decisions: whose visit it is, the call on open, ⌘↵,
// the banner's actions, what Done and back to waiting write after the drafts, where Done goes, Wait for results and the back arrow, the
// stay words; and the center's kind filter over sets and the Whole record's two views. Run by npm run test:chart after test-chart.ts.
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import type { Department, OrderRow, PresenceRow, QueueRow, VisitRow } from '../src/core/db/types'
import { afterDone, backOf, backReason, barOf, callsOnOpen, cmdEnter, doneLabel, ordersOut, roleOf, stayWords, visitMoves } from '../src/core/screens/chart/model/visit'
import { byDate, bySet, byVisit, filterSets } from '../src/core/screens/chart/model/encounter'
import { itemsOf } from '../src/core/screens/chart/model/items'
import { E, T0, next, org, presence, types } from './chart-fixtures'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { arabicDigits, arabicDose, arabicSig } from '../src/core/screens/chart/model/arabic'
import { newestRxSet, prescriptionOf, printable } from '../src/core/screens/chart/model/prescription'
import { PrescriptionSheet } from '../src/core/screens/chart/print/PrescriptionSheet'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const visit = (over: Partial<VisitRow> = {}, state: PresenceRow['state'] = 'with'): VisitRow => ({ id: 'v1', patient_id: 'pt', department_id: 'gp', request_id: null, assignee_id: 'dr',
  status: 'in_consult', priority: 'routine', is_first: false, arrived_at: T0, present_at: T0, seen_at: null, ended_at: null, kind: 'visit', place_id: null, latest_entry: 'e0', version: 1,
  wait: null, presence: presence('v1', { state }), ...over })
const stay = (state: PresenceRow['state'] = 'admitted', over: Partial<VisitRow> = {}) => visit({ kind: 'stay', status: state === 'admitted' ? 'admitted' : 'discharged', department_id: 'ward', assignee_id: null, ...over }, state)
const dept = (over: Partial<Department> = {}) => ({ id: 'gp', work: 'visits', after_done: 'next', ...over }) as Department
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
test('Done writes seen (unseen, something written) then done, each changing the one before; back to waiting is sent out', () => {
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
test('Done closes now; Wait for results only while this visit has orders out, with those its drafts sign (owner, 2026-10-07)', () => {
  assert.equal(doneLabel(2, dept(), omar), 'Sign 2 · Done → Omar'); assert.equal(doneLabel(0, dept({ after_done: 'queue' }), omar), 'Done')
  const o = (over: Partial<OrderRow> = {}) => ({ visit_id: 'v1', status: 'active', answered_at: null, ...over })
  assert.equal(ordersOut([o(), o({ status: 'in-progress' }), o({ answered_at: T0 }), o({ status: 'completed' }), o({ status: 'revoked' }), o({ visit_id: 'v0' })], 'v1', 0), 2,
    'answered, finished, stopped or another visit\'s: not out')
  assert.equal(ordersOut([], 'v1', 1), 1, 'an order in the drafts goes out with Done'); assert.equal(ordersOut([], 'v1', 0), 0, 'nothing out: no Wait for results')
  assert.deepEqual(visitMoves(visit({ seen_at: T0 }), 'gp', 0, { type: 'done', data: { wait: false } }).map((e) => [e.type, e.data]), [['done', { wait: false }]])
})
test('the back arrow: my patient in consult back to the waiting room, the visit open; nothing written, as before the call (no missed call)', () => {
  assert.equal(backOf(roleOf(visit(), 'gp', 'dr')), 'Back to waiting room')
  assert.equal(backOf(roleOf(visit({ assignee_id: 'dr2' }), 'gp', 'dr')), 'Back to the queue', 'another clinician\'s: only back')
  assert.equal(backOf(roleOf(stay(), 'ward', 'rn')), 'Back to the beds'); assert.equal(backOf(roleOf(null, 'gp', 'dr')), 'Back to the queue')
  assert.equal(backReason(0), 'other', 'opened and nothing written: no missed call (Not here is the desk\'s)'); assert.equal(backReason(2), 'sent_out')
  assert.deepEqual(visitMoves(visit(), 'gp', 0, { type: 'back_to_waiting', data: { reason: backReason(0) } }).map((e) => e.type), ['back_to_waiting'], 'nothing written: not seen')
  const back = visitMoves(visit(), 'gp', 2, { type: 'back_to_waiting', data: { reason: backReason(2) } })
  assert.deepEqual(back.map((e) => e.type), ['seen', 'back_to_waiting'], 'what is written is signed into the visit, seen first')
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
// the prescription on A5 (§3.13 Printing, owner 2026-10-08): written in the visit, for the patient to take away
const rxData = (drug: string, more: Record<string, unknown>) => ({ basis: 'prescribed', drug: { text: drug }, status: 'active', ...more })
const augmentin = rxData('Augmentin', { strength: '1 g', dosage: { dose: { value: '1', unit: 'tablet' }, route: 'oral', timing: { code: 'BD' } }, duration_days: 7,
  quantity: { value: '14', unit: 'tablets' }, instructions: 'after meals' })
const glucophage = rxData('Glucophage', { strength: '500 mg', dosage: { dose: { value: '500', unit: 'mg' }, route: 'oral', timing: { code: 'OD' } }, duration_days: 30 })
const ventolin = rxData('Ventolin', { dosage: { dose: { value: '2', unit: 'puffs' }, route: 'inhaled', timing: { code: 'q6h' }, as_needed: true, as_needed_for: 'wheeze' } })
test('the directions in Arabic, as the base can say them: dose, route, how often, as needed, its own known words, how long; Arabic-Indic digits', () => {
  assert.equal(arabicSig({ dose: '1 tablet', route: 'oral', frequency: 'BD', prn: null, days: 7, instructions: 'after meals' }), 'قرص واحد بالفم مرتين يومياً بعد الأكل لمدة ٧ أيام')
  assert.equal(arabicSig({ dose: '500 mg', route: 'oral', frequency: 'OD', prn: null, days: 30, instructions: null }), '٥٠٠ مجم بالفم مرة واحدة يومياً لمدة ٣٠ يوماً')
  assert.equal(arabicSig({ dose: '2 puffs', route: 'inhaled', frequency: 'q6h', prn: 'when needed for wheeze', days: null, instructions: null }), 'بختين استنشاق كل ٦ ساعات عند اللزوم')
  assert.equal(arabicSig({ dose: 'a pea-sized amount', route: 'topical', frequency: 'PRN', prn: 'when needed', days: 2, instructions: 'thinly' }), 'دهان موضعي على الجلد عند اللزوم لمدة يومين',
    'what it cannot say is left out, never guessed')
  assert.deepEqual(['0.5 tab', '3 caps', '12 drops', '10 ml'].map(arabicDose), ['نصف قرص', '٣ كبسولات', '١٢ نقطة', '١٠ مل']); assert.equal(arabicDigits('1.5'), '١٫٥')
})
test('the Arabic never says what the prescription did not: a dose with no unit names no form; words that say not to are never turned into an order', () => {
  // amoxicillin suspension 5 tds 7d, a drug the composer does not know: the dose is a bare 5
  assert.equal(arabicDose('5'), null, 'not "5 tablets" of a syrup')
  assert.equal(arabicSig({ dose: '5', route: null, frequency: 'TDS', prn: null, days: 7, instructions: null }), '٣ مرات يومياً لمدة ٧ أيام')
  for (const words of ['do not take with food', 'not after meals', 'never with food', 'avoid taking with food', "don't take before meals", 'without food', 'with food or milk'])
    assert.equal(arabicSig({ dose: '1 tablet', route: 'oral', frequency: 'OD', prn: null, days: null, instructions: words }), 'قرص واحد بالفم مرة واحدة يومياً', words)
  assert.equal(arabicSig({ dose: '1 tablet', route: 'oral', frequency: 'OD', prn: null, days: null, instructions: 'empty stomach, never with food' }), 'قرص واحد بالفم مرة واحدة يومياً على معدة فارغة',
    'phrase by phrase: the one wholly known is said, the one saying not to is left to the English')
  assert.equal(arabicSig({ dose: '1 tablet', route: 'oral', frequency: 'BD', prn: null, days: null, instructions: 'Take after meals; with plenty of water.' }), 'قرص واحد بالفم مرتين يومياً بعد الأكل مع كوب ماء')
})
test('the composer\'s own notes for nocte, hs and mane are said: at night, in the morning', () => {
  // amitriptyline 25 mg nocte 30d: the composer writes once a day and "at night"
  assert.equal(arabicSig({ dose: '25 mg', route: 'oral', frequency: 'OD', prn: null, days: 30, instructions: 'at night' }), '٢٥ مجم بالفم مرة واحدة يومياً ليلاً لمدة ٣٠ يوماً')
  assert.equal(arabicSig({ dose: '20 mg', route: 'oral', frequency: 'OD', prn: null, days: null, instructions: 'in the morning; before breakfast' }), '٢٠ مجم بالفم مرة واحدة يومياً صباحاً قبل الفطار')
})
const rxItems = () => itemsOf([E('medication', { id: 'm1', visit_id: 'v1', set_id: 'rx1', data: augmentin }), E('medication', { id: 'm2', visit_id: 'v1', set_id: 'rx1', data: glucophage }),
  E('medication', { id: 'm3', visit_id: 'v1', set_id: 'rx1', data: ventolin }), E('medication', { id: 'm4', visit_id: 'v1', set_id: 'rx1', data: { ...glucophage, basis: 'reported' } }),
  E('medication', { id: 'm5', visit_id: 'v1', set_id: 'rx1', data: { ...augmentin, status: 'stopped' } }), E('medication', { id: 'm6', visit_id: null, set_id: 'rx1', data: augmentin })], { types })
const patient = { full_name: 'نادية كامل', age: 34, sex: 'female', number: 1042 }
test('the prescription: the patient\'s name as written, age and sex, record number, the date, each medicine with its line and its directions in Arabic, the doctor and department', () => {
  const rx = prescriptionOf(rxItems(), { org, patient })!
  assert.deepEqual(rx.patient, { name: 'نادية كامل', age_sex: '34 y · F', record: 1042 }); assert.equal(rx.doctor, 'Dr. Ali Hassan'); assert.equal(rx.department, 'General Practice')
  assert.deepEqual(rx.lines.map((l) => l.drug), printable(rxItems()).map((i) => [(i.entry.data as { drug: { text: string } }).drug.text, i.entry.data?.strength].filter(Boolean).join(' ')),
    'in the block\'s own order')
  assert.deepEqual(rx.lines.map((l) => [l.drug, l.sig, l.quantity, l.arabic]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))), [
    ['Augmentin 1 g', '1 tablet, by mouth, twice a day, 7 days', '14 tablets', 'قرص واحد بالفم مرتين يومياً بعد الأكل لمدة ٧ أيام'],
    ['Glucophage 500 mg', '500 mg, by mouth, once a day, 30 days', null, '٥٠٠ مجم بالفم مرة واحدة يومياً لمدة ٣٠ يوماً'],
    ['Ventolin', '2 puffs, inhaled, every 6 hours, when needed for wheeze', null, 'بختين استنشاق كل ٦ ساعات عند اللزوم']], 'a reported, a stopped, one outside a visit: not on it')
  assert.deepEqual(printable(rxItems()).map((i) => i.id).sort(), ['m1', 'm2', 'm3'])
  assert.equal(prescriptionOf(rxItems().filter((i) => ['m4', 'm5', 'm6'].includes(i.id)), { org, patient }), null, 'nothing to take away: no Print')
  assert.equal(prescriptionOf(rxItems().map((i) => ({ ...i, draft: {} as never })), { org, patient }), null, 'a draft is not printed')
})
test('printed on A5: the header, the patient (Arabic right to left, the numbers kept left to right), the directions right to left, no price; a later copy says so', () => {
  const rx = prescriptionOf(rxItems(), { org, patient })!
  const html = renderToStaticMarkup(createElement(PrescriptionSheet, { data: rx, header: { name: 'Nile Clinic', logo: null, address: 'Cairo', phone: null, tax_number: '123' }, reprint: null }))
  assert.match(html, /Nile Clinic/); assert.match(html, /Tax no\. 123/); assert.match(html, /<span dir="auto"[^>]*>نادية كامل<\/span>/); assert.match(html, /<bdi dir="ltr">#1042<\/bdi>/)
  assert.match(html, /<bdi dir="ltr">2026-09-27 11:00<\/bdi>/, 'the date, in the clinic\'s time'); assert.match(html, /34 y · F/)
  assert.equal((html.match(/<p dir="rtl" lang="ar"[^>]*>[^<]*(يومياً|اللزوم)/g) ?? []).length, 3, 'each medicine\'s directions right to left, in Arabic')
  assert.match(html, /Dr\. Ali Hassan/); assert.match(html, /General Practice/); assert.doesNotMatch(html, /Reprint/)
  assert.doesNotMatch(html, /EGP|price|amount|total/i, 'no price'); assert.doesNotMatch(JSON.stringify(rx), /price|amount|total/i)
  assert.match(renderToStaticMarkup(createElement(PrescriptionSheet, { data: rx, header: { name: 'N', logo: null, address: null, phone: null, tax_number: null }, reprint: '11:05' })), /Reprint · 11:05/)
})
test('P prints this visit\'s newest prescription', () => {
  const es = [E('medication', { visit_id: 'v1', set_id: 'old', recorded_at: '2026-09-27T08:00:00Z', data: augmentin }), E('medication', { visit_id: 'v1', set_id: 'new', recorded_at: '2026-09-27T09:00:00Z', data: glucophage }),
    E('medication', { visit_id: 'v1', set_id: 'told', recorded_at: '2026-09-27T09:30:00Z', data: { ...glucophage, basis: 'reported' } }), E('medication', { visit_id: 'v2', set_id: 'other', recorded_at: '2026-09-27T10:00:00Z', data: augmentin })]
  assert.equal(newestRxSet(es, 'v1', types), 'new'); assert.equal(newestRxSet(es, null, types), null); assert.equal(newestRxSet(es, 'v9', types), null)
  // later in the visit the doctor stops the patient's old omeprazole: the stop has no Print of its own, so P stays with the prescription
  const omep = E('medication', { visit_id: 'v0', set_id: 'long-ago', recorded_at: '2026-08-01T08:00:00Z', data: rxData('Omeprazole', { strength: '20 mg' }) })
  const stop = next(omep, 'medication', { ...rxData('Omeprazole', { strength: '20 mg' }), status: 'stopped' }, { visit_id: 'v1', set_id: 'stop', recorded_at: '2026-09-27T09:45:00Z' })
  assert.equal(newestRxSet([...es, omep, stop], 'v1', types), 'new', 'the newest set with something to take away')
  const done = next(E('medication', { visit_id: 'v1', set_id: 'new2', recorded_at: '2026-09-27T09:50:00Z', data: augmentin }), 'medication', { ...augmentin, status: 'completed' },
    { visit_id: 'v1', set_id: 'finished', recorded_at: '2026-09-27T09:55:00Z' })
  assert.equal(newestRxSet([...es, done], 'v1', types), 'new', 'a medicine finished since: as it stands, nothing to take away')
  const struck = E('crossed_out', { item: es[1].item, item_version: 2, visit_id: 'v1', set_id: 'x', recorded_at: '2026-09-27T09:58:00Z', data: { reason: 'wrong_patient' } })
  assert.equal(newestRxSet([...es, struck], 'v1', types), 'old', 'crossed out: the one before it')
  const src = readFileSync(new URL('../src/core/screens/chart/blocks/Prescription.tsx', import.meta.url), 'utf8')
  assert.match(src, /patientId: c\.patientId, departmentId: c\.departmentId, \.\.\.purposeFor\(c\.patientId\)/, 'its print logged under the chart\'s own purpose: break the glass, with why, where it was opened anyway')
})
console.log(`chart (the patient screen): ${n} groups passed`)
