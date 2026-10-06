// The chart's pure half (chart-plan.md §7 step 1, build plan 3.1): items, the encounter, the record panel's lists, the Summary.
// npm run test:chart   (no browser, no database; the clinic's time zone is Cairo, as the demo clinic's)
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { FAMILY, KIND_TYPES, countKinds, draftItems, filterKind, groupBlocks, itemsOf, kindOf } from '../src/core/screens/chart/model/items'
import { byDay, bySet, encounterItems, movesOf, outsideOf, sinceDigest, stayDay, startOf } from '../src/core/screens/chart/model/encounter'
import { alertsOf, allergiesOf, changeText, historyOf, medLine, medicinesOf, problemsOf, visitsOf, waitingOf } from '../src/core/screens/chart/model/record'
import { keyResults, resultsByKind, vitalsNow } from '../src/core/screens/chart/model/values'
import { summaryOf } from '../src/core/screens/chart/model/summary'
import { fieldLabel, noteKind, sections, typeLabel } from '../src/core/screens/chart/model/labels'
import { atOf, atParam, sameAt, withAt } from '../src/core/screens/chart/model/at'
import type { ServerEntry } from '../src/core/db/types'
import { E, T0, analyte, ctx, listRow, med, next, orderRow, org, presence, problem, record, result, reviewRow, table, types, val } from './chart-fixtures'
import { PLAIN_SEND, registerSend } from '../src/core/screens/visit/send'
// the fixture's dispensing service answers prescriptions, as its pack would register (the core names none)
registerSend('pharmacy.dispense', { ...PLAIN_SEND, to: 'pharmacy' })

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const T = (d: string) => `2026-09-${d}Z`   // T('26T22:30:00') → an instant
const DAY = (at: string, i: number) => new Date(Date.parse(at) - i * 86_400_000).toISOString()
const FLAG_GLYPHS = /[↑↓‼]/

test('versions fold by item; a later version the page does not hold stays history', () => {
  const v1 = E('problem', { data: problem('Asthma') }); const v2 = next(v1, 'problem', problem('Asthma', 'resolved'))
  const [i] = itemsOf([v1, v2], { types })
  assert.equal(i.entry.id, v2.id); assert.deepEqual(i.versions.map((v) => v.id), [v1.id]); assert.equal(i.corrected, false)   // a change is not a correction
  const [old] = itemsOf([v1], { types, pool: [v2] })
  assert.equal(old.entry.id, v1.id); assert.deepEqual(old.later.map((v) => v.id), [v2.id])
})
test('crossed out: the content struck with who and why; a cross-out alone is still crossed; facts drop it', () => {
  const note = E('note', { data: { kind: 'progress', text: 'Wrong patient' } }); const x = next(note, 'crossed_out', { reason: 'typo', text: 'not mine' }, { author_id: 'dr' }, 'replaces')
  const [i] = itemsOf([note, x], { types })
  assert.equal(i.entry.id, note.id); assert.deepEqual(i.crossed, { reason: 'typo', text: 'not mine', by: 'dr', at: x.recorded_at }); assert.equal(i.family, 'note')
  assert.ok(itemsOf([x], { types })[0].crossed)
  const alert = E('alert', { data: { concept: { text: 'DNR' }, status: 'active' } })
  assert.equal(alertsOf([alert, next(alert, 'crossed_out', { reason: 'wrong_patient' }, {}, 'replaces')], types).active.length, 0)
  assert.equal(alertsOf([alert], types).active[0].text, 'DNR')
})
test('corrected: a replacement version (the bench corrects a result)', () => {
  const r1 = E('result', { data: result('CBC', [analyte('hb', '718-7', '6.1', 'LL')]) }); const r2 = next(r1, 'result', result('CBC', [analyte('hb', '718-7', '11.1', 'L')], 'corrected'), {}, 'replaces')
  const [i] = itemsOf([r1, r2], { types }); assert.equal(i.corrected, true); assert.equal(i.versions[0].id, r1.id)
})
// an order with two steps (the second changes the first), a result answering it, and a dispense order about a medicine
const order = E('order', { visit_id: 'v1', set_id: 'sD', data: { service: { id: 'cbc', name: 'Complete blood count' }, department_id: 'lab', priority: 'routine', status: 'active' } })
const step1 = E('step', { department_id: 'lab', refers_to: order.id, relation: 'answers', recorded_at: T('27T08:10:00'), data: { status: 'in-progress', step: 'collected' } })
const step2 = next(step1, 'step', { status: 'in-progress', step: 'received' }, { department_id: 'lab', recorded_at: T('27T08:20:00') })
const res = E('result', { department_id: 'lab', author_id: 'tech', refers_to: order.id, relation: 'answers', recorded_at: T('27T09:00:00'), occurred_at: T('27T08:15:00'),
  data: result('Complete blood count', [analyte('hb', '718-7', '6.4', 'LL', [12, 15.5])]) })
const orders = table([orderRow(order, { visit_id: 'v1', answers: [res.id], status: 'completed', step_key: 'received', source_entries: [order.id, step1.id, step2.id, res.id] })], [order, step1, step2, res])
test('steps and answers join their order; an orphan step stays an item', () => {
  const items = itemsOf([order, step1, step2, res], { types, orders, services: org.services })
  assert.deepEqual(items.map((i) => i.family).sort(), ['order', 'result'])
  const o = items.find((i) => i.family === 'order')!; assert.equal(o.order!.steps.length, 2); assert.deepEqual(o.order!.answers.map((a) => a.id), [res.id])
  assert.deepEqual(o.order!.stepKeys, ['collected', 'received']); assert.equal(items.find((i) => i.family === 'result')!.answers_order, order.item)
  assert.equal(itemsOf([step1], { types })[0].family, 'other')
})
test('answers written with no visit_id join the encounter; presence moves head their set', () => {
  const called = E('called', { visit_id: 'v1', set_id: 'sD' }); const done = E('done', { visit_id: 'v1', set_id: 'sD' }); const alone = E('called', { visit_id: 'v1' })
  const rec = record({ 'base.orders': orders, 'base.presence': table([presence('v1', { source_entries: ['v1', called.id, done.id, alone.id] })], [E('checked_in', { id: 'v1' }), called, done, alone]) })
  const items = encounterItems([order], rec, 'v1', { types })
  assert.ok(items.some((i) => i.entry.id === res.id && i.visit_id === null))
  const sets = bySet(items, movesOf(rec, 'v1'), types)
  assert.deepEqual(sets.find((s) => s.set_id === 'sD')!.moves.map((m) => m.type), ['called', 'done'])
  assert.ok(!sets.some((s) => s.set_id === alone.set_id))                                  // a call alone is no set of its own
  assert.ok(bySet([], [E('moved', { visit_id: 'v1' })], types).length === 1)               // a bed move is
})
test('a signed set as paper forms: problems, a prescription with its dispense order, a requisition', () => {
  const m1 = E('medication', { data: med('Metformin', '500', 'BD') }); const m2 = E('medication', { data: med('Amlodipine', '5', 'OD') })
  const ph = E('order', { refers_to: m1.id, relation: 'about', data: { service: { id: 'rx', name: 'Dispensing' }, department_id: 'ph', priority: 'routine', status: 'active' } })
  const g = groupBlocks(itemsOf([E('vitals'), E('note'), E('problem'), E('problem'), m1, m2, ph, E('order')], { types }))
  assert.deepEqual(g.map((x) => `${x.kind}:${x.items.length}`), ['single:1', 'problems:2', 'rx:3', 'orders:1', 'single:1'])
  assert.equal(g[0].items[0].family, 'vitals'); assert.equal(g[4].items[0].family, 'note')
})
test('kinds: counts, the filter, a list review goes with its list', () => {
  const items = itemsOf([E('note'), E('note'), E('result'), E('medication'), E('given'), E('list_review', { data: { list: 'medications', outcome: 'reviewed' } }), E('procedure')], { types })
  const c = countKinds(items); assert.equal(c.all, 7); assert.equal(c.notes, 2); assert.equal(c.medicines, 3); assert.equal(c.other, 1); assert.equal(c.vitals, 0)
  assert.equal(filterKind(items, 'medicines').length, 3); assert.equal(filterKind(items, 'all').length, 7); assert.equal(kindOf(items.find((i) => i.family === 'review')!), 'medicines')
})
test('kinds: every base type a kind counts is one the Whole record reads for that kind (a score under Other)', () => {
  for (const t of Object.keys(FAMILY)) {
    const [i] = itemsOf([E(t, t === 'list_review' ? { data: { list: 'problems', outcome: 'reviewed' } } : {})], { types })
    assert.ok(KIND_TYPES[kindOf(i)].includes(t), `${t} counts under ${kindOf(i)} but the filter does not read it`)
  }
  assert.equal(kindOf(itemsOf([E('score')], { types })[0]), 'other')
})
test('a stay: day 1 is the admission day in the clinic time zone; every day listed; since yesterday by clinical day', () => {
  const adm = T('24T22:30:00')                                    // 25 Sep in Cairo (the 24th in UTC)
  const v = (at: string) => E('vitals', { visit_id: 'st', occurred_at: at, recorded_at: at })
  const late = E('vitals', { visit_id: 'st', occurred_at: T('26T22:30:00'), recorded_at: T('27T09:00:00') })   // the 27th in Cairo, the 26th in UTC
  const items = itemsOf([v(T('25T06:00:00')), late, v(T('27T08:00:00'))], { types })
  const days = byDay(bySet(items), adm, T('27T10:00:00'))
  assert.deepEqual(days.map((d) => `${d.n}:${d.day}:${d.sets.length}`), ['3:2026-09-27:2', '2:2026-09-26:0', '1:2026-09-25:1'])
  assert.equal(stayDay(adm, T('27T10:00:00')), 3); assert.equal(stayDay(adm, adm), 1)
  const d = sinceDigest(items, [E('moved', { occurred_at: T('26T12:00:00') }), E('called', { occurred_at: T('26T12:00:00') })], { since: 'yesterday', now: T('27T10:00:00') }, types)
  assert.equal(d.from, '2026-09-26'); assert.equal(d.items.length, 2); assert.deepEqual(d.moves.map((m) => m.type), ['moved']); assert.equal(d.counts.vitals, 2)
  const start = startOf(presence('st', { kind: 'stay', checked_in_at: T0 }), table([presence('st')], [E('admitted', { id: 'st', occurred_at: adm })]))
  assert.equal(start, adm)                                          // an admission written late keeps its clinical day
})
test('since Done: what arrived after Done, critical results called out', () => {
  const doneAt = T('27T08:30:00')
  const d = sinceDigest(itemsOf([order, step1, step2, res, E('note', { recorded_at: T('27T08:00:00') })], { types, orders }), [], { since: 'done', at: doneAt }, types)
  assert.deepEqual(d.items.map((i) => i.entry.id), [res.id]); assert.deepEqual(d.critical.map((i) => i.id), [res.id])   // occurred before Done, came after
  assert.ok(itemsOf([res], { types, newSince: doneAt })[0].isNew)
})
test('problems: active (chronic first), past with its date, diagnoses; medicines current, reported, past, a change, where it was sent on', () => {
  const dm = E('problem', { data: problem('Diabetes', 'active', { onset: { value: '2019', precision: 'year' } }) })
  const cough = E('problem', { data: problem('Cough') }); const pn1 = E('problem', { occurred_at: DAY(T0, 90), data: problem('Pneumonia') })
  const pn2 = next(pn1, 'problem', problem('Pneumonia', 'resolved', { abatement: { value: '2026-07', precision: 'month' } }))
  const dx = E('problem', { data: problem('Anaemia', 'active', { category: 'encounter-diagnosis' }) })
  const m1 = E('medication', { occurred_at: DAY(T0, 180), data: med('Metformin', '500', 'BD') }); const m2 = next(m1, 'medication', med('Metformin', '1000', 'BD'))
  const glic = E('medication', { data: med('Gliclazide', '80', 'OD') }); const stop = next(glic, 'medication', med('Gliclazide', '80', 'OD', { status: 'stopped', status_reason: 'hypoglycaemia' }))
  const asp = E('medication', { data: med('Aspirin', '75', 'OD', { basis: 'reported' }) })
  const disp = E('order', { refers_to: m2.id, relation: 'about' })
  const lists = table([listRow('problems', [dm], 'active'), listRow('problems', [cough], 'active'), listRow('problems', [pn1, pn2], 'resolved'), listRow('diagnoses', [dx], 'active'),
    listRow('medications', [m1, m2], 'active'), listRow('medications', [glic, stop], 'stopped'), listRow('medications', [asp], 'active')], [dm, cough, pn1, pn2, dx, m1, m2, glic, stop, asp])
  const rec = record({ 'base.lists': lists, 'base.orders': table([orderRow(disp, { about_item: m1.item, to_department_id: 'ph', service_name: 'Dispensing', status: 'in-progress', step_key: 'prepared' })]) })
  const p = problemsOf(rec, ctx)
  assert.deepEqual(p.active.map((x) => x.name), ['Diabetes', 'Cough']); assert.deepEqual(p.past.map((x) => `${x.name}:${x.resolved_on}`), ['Pneumonia:2026-07'])
  assert.deepEqual(p.diagnoses.map((x) => x.name), ['Anaemia']); assert.equal(p.review, null)
  const m = medicinesOf(rec, ctx)
  assert.deepEqual(m.current.map((x) => x.drug_name), ['Metformin']); assert.deepEqual(m.reported.map((x) => x.drug_name), ['Aspirin'])
  assert.deepEqual(m.past.map((x) => `${x.drug_name}:${x.status_reason}`), ['Gliclazide:hypoglycaemia'])
  const met = m.current[0]; assert.equal(met.started_on, '2026-03-31'); assert.equal(met.before?.dose_number, 500); assert.equal(changeText(medLine(met.before!.data), met.line), '500 mg BD → 1000 mg BD')
  assert.equal(met.sent?.word, 'Prepared'); assert.equal(met.sent?.open, true); assert.equal(met.line.frequency_words, 'twice a day')
})
test('allergies: active, ruled out, checked or not asked', () => {
  const pen = E('allergy', { data: { concept: { text: 'Penicillins' }, clinical_status: 'active', verification: 'confirmed', criticality: 'high', reactions: [{ manifestation: { text: 'Rash' }, severity: 'severe' }] } })
  const sul = E('allergy', { data: { concept: { text: 'Sulfonamides' }, clinical_status: 'inactive', verification: 'refuted' } })
  const a = allergiesOf(record({ 'base.lists': table([listRow('allergies', [pen], 'active'), listRow('allergies', [sul], 'inactive')], [pen, sul]) }), ctx)
  assert.deepEqual(a.active.map((x) => `${x.substance_name}:${x.severity}:${x.high_risk}`), ['Penicillins:severe:true']); assert.equal(a.other[0].ruled_out, true)
  assert.equal(a.asked, true); assert.equal(a.nka, false)
  const none = allergiesOf(record(), ctx); assert.equal(none.asked, false)
})
test('history by code, procedures newest first; alerts active or over', () => {
  const obs = (code: string, text: string) => E('observation', { data: { code: { text, codings: [{ system: 'loinc', code }] }, value: { text: 'x' } } })
  const h = historyOf([obs('10157-6', 'Family history'), obs('72166-2', 'Smoking'), obs('11331-6', 'Alcohol'), obs('8665-2', 'LMP'),
    E('procedure', { data: { concept: { text: 'Appendicectomy' }, status: 'completed', performed: { value: '2010', precision: 'year' } } }),
    E('procedure', { data: { concept: { text: 'Cholecystectomy' }, status: 'completed', performed: { value: '2018-04', precision: 'month' } } })], types)
  assert.deepEqual([h.family.length, h.social.length, h.other.length], [1, 2, 1]); assert.deepEqual(h.procedures.map((p) => p.when), ['2018-04', '2010'])
  const over = E('alert', { data: { concept: { text: 'Isolation' }, status: 'active', period: { start: T('01T00:00:00'), end: T('10T00:00:00') } } })
  assert.equal(alertsOf([over], types, ctx.now).inactive.length, 1)
})
// values: vitals on two readings, results over three dates
const r1 = E('result', { data: result('HbA1c', [analyte('hba1c', '4548-4', '7.4', 'H', [4, 5.6])]) }); const r2 = E('result', { data: result('HbA1c', [analyte('hba1c', '4548-4', '8.1', 'H', [4, 5.6])]) })
const c1 = E('result', { data: result('Creatinine', [analyte('creat', '2160-0', '0.8', 'N')]) }); const c2 = E('result', { data: result('Creatinine', [analyte('creat', '2160-0', '0.9', 'N')]) })
const hb = E('result', { data: result('Complete blood count', [analyte('hb', '718-7', '6.4', 'LL', [12, 15.5])]) }); const k = E('result', { data: result('Chemistry', [analyte('k', '2823-3', '6.9', 'HH')]) })
const va = E('vitals'); const vb = E('vitals')
const values = [val('hba1c', 'loinc:4548-4', 7.4, DAY(T0, 180), r1, 'H', 'HbA1c'), val('hba1c', 'loinc:4548-4', 8.1, T0, r2, 'H', 'HbA1c'),
  val('creat', 'loinc:2160-0', 0.8, DAY(T0, 90), c1, 'N', 'Creatinine'), val('creat', 'loinc:2160-0', 0.9, T0, c2, 'N', 'Creatinine'),
  val('hb', 'loinc:718-7', 6.4, T0, hb, 'LL', 'Haemoglobin'), val('k', 'loinc:2823-3', 6.9, T0, k, 'HH', 'Potassium'),
  val('bp.sys', 'loinc:8480-6', 140, DAY(T0, 1), va), val('bp.dia', 'loinc:8462-4', 90, DAY(T0, 1), va), val('hr', 'loinc:8867-4', 90, DAY(T0, 1), va),
  val('bp.sys', 'loinc:8480-6', 150, T0, vb), val('bp.dia', 'loinc:8462-4', 95, T0, vb), val('weight', 'loinc:29463-7', 86, DAY(T0, 1), va)]
test('vitals: no flag, only a trend; a tile older than the reading keeps its own date', () => {
  const v = vitalsNow(values)
  assert.deepEqual(v.tiles.map((t) => `${t.label} ${t.value}${t.trend}${t.own ? '*' : ''}`), ['BP 150/95↗', 'HR 90*', 'Wt 86*'])
  assert.ok(v.tiles.every((t) => !('flag' in t) && !FLAG_GLYPHS.test(t.trend))); assert.equal(v.tiles[0].before, '140/90')
})
test('key results: LL and HH keep their direction; trend glyphs are never flag glyphs', () => {
  const k6 = keyResults(values)
  assert.deepEqual(k6.rows.map((r) => r.name), ['HbA1c', 'Creatinine', 'Hb', 'Potassium'])
  const [a1c, cr, h, kk] = k6.rows
  assert.deepEqual([a1c.mark, a1c.trend, a1c.before?.value], ['↑', '↗', 7.4]); assert.deepEqual([cr.mark, cr.word, cr.trend], ['', 'Normal', '↗'])   // normal and rising: no "High"
  assert.deepEqual([h.word, h.mark, h.flag], ['Critically low', '↓‼', 'critical']); assert.deepEqual([kk.word, kk.mark, kk.flag], ['Critically high', '↑‼', 'critical'])
  assert.ok(k6.rows.every((r) => !FLAG_GLYPHS.test(r.trend))); assert.deepEqual(a1c.points, [7.4, 8.1])
  assert.equal(keyResults(values.filter((x) => x.code === 'loinc:8480-6')).any, false)
})
test('results by kind: vitals (BP as one), each service with the value before and its range; reports', () => {
  const vt = table(values, [r1, r2, c1, c2, hb, k, va, vb])
  const note = E('result', { data: { status: 'final', service: { name: 'Chest X-ray' }, conclusion: 'Clear' } })
  const g = resultsByKind(record({ 'base.values': vt, 'base.orders': table([orderRow(E('order'), { answers: [note.id] })], [note]) }), types)
  assert.deepEqual(g.groups.map((x) => x.name), ['Vitals', 'Chemistry', 'Complete blood count', 'Creatinine', 'HbA1c'])
  const bp = g.groups[0].tests[0]; assert.deepEqual([bp.name, bp.latest.value, bp.latest.value2, bp.previous?.value], ['Blood pressure', 150, 95, 140])
  const a1c = g.groups[4].tests[0]; assert.deepEqual([a1c.latest.value, a1c.previous?.value, a1c.range?.low, a1c.range?.high], [8.1, 7.4, 4, 5.6])
  assert.deepEqual(g.reports.map((r) => r.entry.id), [note.id])
})
test('still waiting: reviews for me or my department, critical first; orders out', () => {
  const mine = reviewRow(hb, { critical: true, level: 'critical' }); const flag = reviewRow(c1, { for_user: null, why: 'flag' }); const other = reviewRow(r1, { for_user: 'someone' })
  const elsewhere = reviewRow(r2, { for_user: null, for_department: 'psy' })
  const w = waitingOf(record({ 'base.review': table([flag, other, elsewhere, mine], [hb, c1, r1, r2]), 'base.orders': orders }), ctx, { state: 'pending' })
  assert.deepEqual(w.reviews.map((r) => r.row.entry_id), [hb.id, c1.id]); assert.equal(w.reviews[0].name, 'Complete blood count'); assert.equal(w.pending, true)
  assert.equal(w.orders.length, 0)
})
test('visits and stays: by when they began (clinical time), days and bed, what was new, locked, who', () => {
  const old = E('checked_in', { id: 'v0', occurred_at: DAY(T0, 90) }); const stay = E('admitted', { id: 'st', occurred_at: DAY(T0, 2) })
  const dx = E('problem', { visit_id: 'v0', data: problem('Pneumonia') })
  const rec = record({ 'base.presence': table([presence('v0', { department_id: 'psy' }), presence('st', { kind: 'stay', department_id: 'ward', state: 'admitted', place_id: 'bed5' })], [old, stay]),
    'base.lists': table([listRow('problems', [dx], 'active')], [dx]) }, [{ department_id: 'psy', items: 1 }])
  const v = visitsOf(rec, ctx, 'st')
  assert.deepEqual(v.map((x) => `${x.kind}:${x.department}:${x.days}:${x.bed}:${x.locked}:${x.current}`), ['stay:Medical Ward:3:Bed 5:false:true', 'visit:Psychiatry:null:null:true:false'])
  assert.deepEqual(v[1].new_there, ['Pneumonia']); assert.equal(v[1].who, 'Dr. Ali Hassan')
})
test('outside a visit: no visit, not an answer drawn in its visit, not a step', () => {
  const alone = E('note'); const rec = record({ 'base.orders': orders })
  assert.deepEqual(outsideOf([alone, res, step1, E('note', { visit_id: 'v1' }), E('called')], rec, types).map((e) => e.id), [alone.id])
})
test('the Summary: limits, the half glance, empties, the to-review chip', () => {
  const empty = summaryOf(record(), ctx)
  assert.equal(empty.problems.rows.length, 0); assert.equal(empty.results.show, false); assert.equal(empty.vitals.tiles.length, 0); assert.equal(empty.waiting.empty, true)
  assert.equal(empty.allergies.asked, false); assert.equal(empty.visits.rows.length, 0); assert.deepEqual(empty.to_review, { n: 0, critical: 0 })
  const ps = Array.from({ length: 8 }, (_, i) => E('problem', { data: problem(`P${i}`) })); const ms = Array.from({ length: 10 }, (_, i) => E('medication', { data: med(`M${i}`, '1', 'OD') }))
  const rs = Array.from({ length: 6 }, () => E('result', { data: result('X', []) })); const os = Array.from({ length: 7 }, () => E('order'))
  const rec = record({ 'base.lists': table([...ps.map((p) => listRow('problems', [p], 'active')), ...ms.map((m) => listRow('medications', [m], 'active'))], [...ps, ...ms]),
    'base.review': table(rs.map((r, i) => reviewRow(r, { critical: i === 0 })), rs), 'base.orders': table(os.map((o) => orderRow(o))),
    'base.values': table([val('creat', 'loinc:2160-0', 1, T0, c1, 'N'), val('na', 'loinc:2951-2', 140, T0, c2, 'N')]) })
  const s = summaryOf(rec, ctx)
  assert.deepEqual([s.problems.rows.length, s.problems.more, s.medicines.rows.length, s.medicines.more], [6, 2, 8, 2])
  assert.deepEqual([s.waiting.reviews.length, s.waiting.more_reviews, s.waiting.orders.rows.length, s.waiting.orders.more], [4, 2, 5, 2]); assert.deepEqual(s.to_review, { n: 6, critical: 1 })
  assert.deepEqual([s.results.show, s.results.none, s.results.rows.length], [true, false, 1])
  assert.deepEqual([summaryOf(rec, ctx, { half: true }).problems.rows.length, summaryOf(rec, ctx, { half: true }).medicines.rows.length], [3, 4])
  const noKey = summaryOf(record({ 'base.values': table([val('na', 'loinc:2951-2', 140, T0, c2, 'N')]) }), ctx); assert.deepEqual([noKey.results.show, noKey.results.none], [true, true])
})
test('drafts drawn as blocks: the composer builds them; a sent medicine is a prescription with its dispense order; a change draws the dose before', () => {
  const where = { patientId: 'pt', departmentId: 'gp', visitId: 'v1', org }
  const sent = draftItems([{ id: 'd1', function: 'medication', line: 'Metformin 500 mg BD', params: { action: 'start', drug: { name: 'Metformin' }, dose_number: 500, dose_unit: 'mg', frequency: 'BD', send: true } }], where, { types })
  assert.deepEqual(sent.map((i) => i.family), ['medication', 'order']); assert.ok(sent.every((i) => i.draft?.id === 'd1' && i.entry.visit_id === 'v1'))
  assert.deepEqual(groupBlocks(sent).map((g) => `${g.kind}:${g.items.length}`), ['rx:2'])
  const was = E('medication', { data: med('Amlodipine', '5', 'OD') }) as ServerEntry
  const rec = { medications: [{ id: was.item, entry_id: was.id, data: was.data }] } as never
  const [ch] = draftItems([{ id: 'd2', function: 'medication', line: 'Change', params: { action: 'change', medication_id: was.item, drug: { name: 'Amlodipine' }, dose_number: 10, dose_unit: 'mg', frequency: 'OD' } }],
    { ...where, record: rec }, { types, pool: [was] })
  assert.equal(ch.item, was.item); assert.equal(ch.entry.item_version, 2); assert.deepEqual(ch.versions.map((v) => v.id), [was.id])
})
test('words: note kinds, sections, labels', () => {
  assert.equal(noteKind('history_physical'), 'History & examination'); assert.equal(noteKind('progress', true), 'Consult reply'); assert.equal(noteKind('report', true), 'Report')
  assert.deepEqual(sections('hx: thirst 3 months\nworse at night\nex: BMI 31\nplan: HbA1c'), [{ label: 'History', text: 'thirst 3 months\nworse at night' }, { label: 'Examination', text: 'BMI 31' }, { label: 'Plan', text: 'HbA1c' }])
  assert.deepEqual(sections('Seen today.\nS: cough'), [{ label: null, text: 'Seen today.' }, { label: 'Subjective', text: 'cough' }])
  assert.equal(typeLabel('pharmacy.dispense', types), 'Dispense'); assert.equal(typeLabel('pharmacy.dispense'), 'Dispense'); assert.equal(fieldLabel('reason_text'), 'Reason')
})
test('the center\'s scope in the URL: at=, and the old entry= and view=results still land', () => {
  const q = (s: string) => new URLSearchParams(s)
  assert.deepEqual(atOf(q('')), { scope: 'encounter' }); assert.deepEqual(atOf(q('at=visit:v1')), { scope: 'visit', id: 'v1' })
  assert.deepEqual(atOf(q('at=outside')), { scope: 'outside' }); assert.deepEqual(atOf(q('at=nonsense')), { scope: 'encounter' })
  assert.deepEqual(atOf(q('entry=e1')), { scope: 'entry', id: 'e1' }); assert.deepEqual(atOf(q('view=results')), { scope: 'results' })
  assert.deepEqual(atOf(q('at=record&entry=e1')), { scope: 'record' })
  assert.equal(atParam({ scope: 'encounter' }), null); assert.equal(atParam({ scope: 'entry', id: 'e1' }), 'entry:e1')
  assert.equal(withAt(q('entry=e1&kind=notes'), { scope: 'visit', id: 'v2' }).toString(), 'kind=notes&at=visit%3Av2')
  assert.equal(withAt(q('at=record&tab=record'), { scope: 'encounter' }).toString(), 'tab=record')
  assert.ok(sameAt({ scope: 'visit', id: 'a' }, atOf(q('at=visit:a')))); assert.ok(!sameAt({ scope: 'visit', id: 'a' }, { scope: 'visit', id: 'b' }))
})
console.log(`chart: ${n} groups passed`)
