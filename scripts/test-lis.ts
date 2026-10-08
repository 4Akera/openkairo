// The laboratory (spec/openCare.md §5.3), as pure decisions: tubes, fasting, the tests a typed line names; the large lab's switches
// (late by section, tickets and chairs, a scan's samples); its order word, /lab (§5.1 rule 1, added).   npm run test:lis
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MOST_ASKED, needsFasting, testsIn, tubeOf, tubesFor } from '../src/packs/lis/tubes'
import { changeOf, columnsOf, workedOut } from '../src/packs/lis/grid'
import { byArrival, lateBy, nextUp, notFound, nowAt, sampleKey, scanned, sectionKey, targetOf, ticketOf, type Large, type Ticket } from '../src/packs/lis/large'
import type { RequestQueueRow } from '../src/core/db/types'
import '../src/packs/lis/order'
import { lineOf, parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { suggest } from '../src/core/screens/visit/expand'
import { commandsFor } from '../src/core/screens/visit/commands'
import { byWord, freeRows, packRowOf, waitsOf, type SoftCheckDef } from '../src/core/screens/rows'
import { groupByPatient } from '../src/core/screens/bench/shared'
import { benchMarkRow } from '../src/core/screens/marks'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { atCollected, labelsOf, printWords, samplesOf } from '../src/packs/lis/labels'
import { LabelSheet } from '../src/packs/lis/LabelSheet'
import { largeOf } from '../src/packs/lis/large'
import { decode128, encode128 } from '../src/core/print/code128'
import { setClinicTimeZone } from '../src/core/ui/time'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const T = (code: string, name: string, section_name: string | null = 'Chemistry') => ({ code, name, section_name })
const CATALOGUE = [T('cbc', 'Complete blood count', 'Haematology'), T('lipids', 'Lipid profile'), T('hba1c', 'HbA1c'), T('fbs', 'Fasting glucose'), T('rbs', 'Random glucose'),
  T('kft', 'Kidney function'), T('lft', 'Liver function'), T('pt', 'Prothrombin time · INR', 'Coagulation'), T('urine', 'Urine analysis', 'Urine & stool'), T('tsh', 'TSH', 'Hormones')]

test('tubes: by the test, else its section; grouped in a fixed order; fasting where it matters', () => {
  assert.deepEqual(['cbc', 'hba1c', 'lipids', 'fbs', 'pt', 'urine', 'tsh'].map((c) => tubeOf(CATALOGUE.find((t) => t.code === c)!).cap), ['purple', 'purple', 'yellow', 'grey', 'blue', 'cup', 'yellow'])
  const g = tubesFor([CATALOGUE[1], CATALOGUE[0], CATALOGUE[3], CATALOGUE[2]])
  assert.deepEqual(g.map((x) => [x.tube.word, x.tests.map((t) => t.code)]), [['Purple · EDTA', ['cbc', 'hba1c']], ['Yellow · gel', ['lipids']], ['Grey · fluoride', ['fbs']]])
  assert.deepEqual(['fbs', 'lipids', 'cbc'].map(needsFasting), [true, true, false])
})
test('a typed line: by code, name or a word labs use, in order, each once; what it cannot place is handed back', () => {
  const r = testsIn('/order cbc, lipid profile, hba1c, fbs', CATALOGUE)
  assert.deepEqual(r.found.map((t) => t.code), ['cbc', 'lipids', 'hba1c', 'fbs']); assert.deepEqual(r.unknown, [])
  assert.deepEqual(testsIn('kidney and liver; thyroid', CATALOGUE).found.map((t) => t.code), ['kft', 'lft', 'tsh'])
  assert.deepEqual(testsIn('CBC, cbc, Random glucose', CATALOGUE).found.map((t) => t.code), ['cbc', 'rbs'], 'once each')
  assert.deepEqual(testsIn('cbc, zinc', CATALOGUE).unknown, ['zinc'])
  assert.equal(MOST_ASKED.length, 6)
})
test('results: the columns once each; LDL and eGFR worked out; the change check against the last within 30 days', () => {
  assert.deepEqual(columnsOf([{ fields: [{ key: 'urea' }, { key: 'creat' }, { key: 'egfr' }] }, { fields: [{ key: 'creat' }, { key: 'egfr' }] }, { fields: [{ key: 'alt' }] }]).map((f) => f.key),
    ['urea', 'creat', 'egfr', 'alt'])
  assert.equal(workedOut('ldl', { chol: '238', hdl: '38', tg: '190' }, { sex: 'female', age: 34 }), 162, 'Friedewald: 238 − 38 − 38')
  assert.equal(workedOut('ldl', { chol: '300', hdl: '40', tg: '450' }, { sex: 'male', age: 50 }), null, 'TG 400 or more: not worked out')
  assert.equal(workedOut('ldl', { chol: '238', hdl: '' }, { sex: 'male', age: 50 }), null)
  assert.equal(workedOut('egfr', { creat: '1.0' }, { sex: 'male', age: 50 }), 92, 'CKD-EPI 2021, a man of 50, creatinine 1.0')
  assert.equal(workedOut('egfr', { creat: '0.8' }, { sex: 'female', age: 60 }), 84)
  assert.equal(workedOut('egfr', { creat: '0.5' }, { sex: 'female', age: 8 }), null, 'a child: none')
  const today = Date.parse('2026-10-07T12:00:00Z'); const ago = (d: number) => new Date(today - d * 86_400_000).toISOString()
  assert.deepEqual(changeOf('creat', 3.9, { value: 1.0, at: ago(4) }, today), { was: 1, days: 4 }, 'creatinine 1.0 → 3.9 in 4 days')
  assert.equal(changeOf('creat', 1.2, { value: 1.0, at: ago(4) }, today), null, 'within its share')
  assert.deepEqual(changeOf('hb', 7.4, { value: 12.9, at: ago(6) }, today), { was: 12.9, days: 6 }, 'Hb down 5.5 g/dL')
  assert.equal(changeOf('hb', 11, { value: 12.9, at: ago(6) }, today), null, 'Hb within 3')
  assert.equal(changeOf('creat', 3.9, { value: 1.0, at: ago(45) }, today), null, 'older than 30 days: no check'); assert.equal(changeOf('creat', 3.9, undefined, today), null)
})
test("turnaround: a section's target, by its key; late only past it, and only with targets on", () => {
  const L: Large = { turnaround: true, targets: { haematology: 60, chemistry: 120, urine_stool: 60 }, second_check: false, scan_receive: false, chairs: 0 }
  assert.deepEqual(['Urine & stool', 'Chemistry', ' Hormones '].map(sectionKey), ['urine_stool', 'chemistry', 'hormones'])
  assert.equal(targetOf(L, 'Urine & stool'), 60); assert.equal(targetOf(L, 'Serology'), null, 'a section with no target'); assert.equal(targetOf({ ...L, turnaround: false }, 'Chemistry'), null)
  const now = Date.parse('2026-10-07T12:00:00Z'); const ago = (m: number) => new Date(now - m * 60_000).toISOString()
  assert.equal(lateBy(ago(150), 120, now), 150); assert.equal(lateBy(ago(90), 120, now), null); assert.equal(lateBy(ago(150), null, now), null); assert.equal(lateBy(null, 120, now), null)
})
test("chairs: numbered as they came; my chair's patient is the last it called still waiting; next is stat first, then the lowest number with no chair", () => {
  const g = (id: string, oldest: string, priority: 'stat' | 'routine' = 'routine') => ({ oldest, priority, rows: [{ item: `o-${id}` }] as RequestQueueRow[] })
  const a = g('a', '2026-10-07T08:00:00Z'); const b = g('b', '2026-10-07T07:30:00Z'); const c = g('c', '2026-10-07T09:00:00Z', 'stat'); const d = g('d', '2026-10-07T08:30:00Z')
  assert.deepEqual(byArrival([a, b, c, d]).map((x) => x.rows[0].item), ['o-b', 'o-a', 'o-d', 'o-c'])
  const T = (number: number, item: string, chair: number | null = null, called_at: string | null = null): Ticket => ({ number, items: [item], chair, called_at })
  const ts = [T(1, 'o-b', 1, '2026-10-07T09:10:00Z'), T(2, 'o-a'), T(3, 'o-d', 2, '2026-10-07T09:12:00Z'), T(4, 'o-c'), T(5, 'o-gone', 1, '2026-10-07T09:20:00Z')]
  assert.equal(ticketOf(d, ts)?.number, 3)
  assert.equal(nowAt(1, [a, b, c, d], ts)?.ticket.number, 1, 'chair 1 called #5 later, but #5 is collected: #1 is still its patient')
  assert.equal(nowAt(3, [a, b, c, d], ts), null)
  assert.equal(nextUp([a, b, c, d], ts)?.ticket.number, 4, 'the stat one jumps the line')
  assert.equal(nextUp([a, b, d], ts)?.ticket.number, 2, 'then the lowest number no chair called')
  assert.equal(nextUp([b, d], ts), null, 'everyone called')
})
test('Collect with a pack holding tests waiting (spec §5.4): per test — free ones to collect, a chair calls a patient with one; the rest in their word\'s view', () => {
  const R = (patient: string, item: string, at: string) => ({ item, id: item, occurred_at: at, patient: { id: patient, given_name: patient, family_name: 'X', record_number: 1, sex: 'female', born_on: '1990-01-01' },
    request: { priority: 'routine' }, order: { item, status: 'active', step_key: null } }) as unknown as RequestQueueRow
  const today = new Date().toISOString().slice(0, 10)
  const rows = [R('amal', 'a-cbc', `${today}T08:00:00Z`), R('amal', 'a-lip', `${today}T08:00:00Z`), R('basma', 'b-cbc', `${today}T07:00:00Z`), R('basma', 'b-hba', `${today}T07:00:00Z`)]
  const hold: SoftCheckDef = { pack: 'till', waiting: () => [{ order: 'a-cbc', word: 'Waiting for payment', tone: 'warn' }, { order: 'a-lip', word: 'Waiting for payment', tone: 'warn' }, { order: 'b-hba', word: 'Waiting for payment', tone: 'warn' }], anyway: () => {} }
  const ctx = { list: 'screen' as const, dept: { id: 'lab', name: 'Laboratory', packs: ['till'] }, can: () => true }
  const waits = new Map(groupByPatient(rows).flatMap((g) => [...waitsOf([hold], packRowOf(g.patient.id, benchMarkRow(g)), ctx, {})]))
  const toCollect = groupByPatient(freeRows(rows, waits, new Set()))
  assert.deepEqual(toCollect.map((g) => [g.patient.id, g.rows.map((r) => r.item)]), [['basma', ['b-cbc']]], 'Basma\'s free test only; Amal has none free')
  const T = (number: number, items: string[]): Ticket => ({ number, items, chair: null, called_at: null })
  assert.equal(nextUp(toCollect, [T(1, ['b-cbc'])])?.group.patient.id, 'basma', 'a chair calls a patient with one free test')
  assert.equal(nextUp(groupByPatient(freeRows(rows.slice(0, 2), waits, new Set())), [T(2, ['a-cbc', 'a-lip'])]), null, 'never one whose every test waits')
  const view = byWord(rows, waits, new Set())
  assert.deepEqual(view.map((v) => [v.word, groupByPatient(v.rows).map((g) => [g.patient.id, g.rows.map((r) => r.item)])]),
    [['Waiting for payment', [['basma', ['b-hba']], ['amal', ['a-cbc', 'a-lip']]]]], 'one view named by its word (who came first, first): Basma there too, for her waiting test')
  assert.deepEqual(groupByPatient(freeRows(rows, waits, new Set(['a-lip']))).map((g) => g.patient.id).sort(), ['amal', 'basma'], 'collected anyway: Amal\'s lipids join To collect')
})
test('receive: a scan names the samples collected under its number, whatever its case; one in already says so', () => {
  const R = (item: string, specimen: string, step_key: string, status = 'in-progress') => ({ item, step_data: { specimen }, reply: null, order: { step_key, status } }) as unknown as RequestQueueRow
  const rows = [R('1', 'S-1007-0002', 'collected'), R('2', 'S-1007-0002', 'collected'), R('3', 'S-1007-0003', 'received'), R('4', 'S-1007-0004', 'collected', 'on-hold')]
  assert.equal(sampleKey(' s-1007-0002 '), 'S-1007-0002')
  assert.deepEqual(scanned(rows, 's-1007-0002').toReceive.map((r) => r.item), ['1', '2'])
  assert.deepEqual(scanned(rows, 'S-1007-0003').already.map((r) => r.item), ['3']); assert.equal(scanned(rows, 'S-1007-0003').toReceive.length, 0)
  assert.equal(scanned(rows, 'S-1007-0004').toReceive.length, 0, 'sent back: no longer waiting under its number')
})
test('receive with a pack holding tests waiting (spec §5.4, any pack list on the core ListRow): a scan takes only the free tests; the row draws the pack\'s word, button and anyway', () => {
  const R = (item: string) => ({ item, id: item, occurred_at: new Date().toISOString(), patient: { id: 'amal', given_name: 'Amal', family_name: 'X', record_number: 1, sex: 'female', born_on: '1990-01-01' },
    request: { priority: 'routine' }, step_data: { specimen: 'S-1007-0002' }, reply: null, order: { item, step_key: 'collected', status: 'in-progress' } }) as unknown as RequestQueueRow
  const rows = [R('a-cbc'), R('a-lip')]
  const hold: SoftCheckDef = { pack: 'till', waiting: () => [{ order: 'a-lip', word: 'Waiting for payment', tone: 'warn' }], anyway: () => {} }
  const ctx = { list: 'screen' as const, dept: { id: 'lab', name: 'Laboratory', packs: ['till'] }, can: () => true }
  const waits = waitsOf([hold], packRowOf('amal', benchMarkRow(groupByPatient(rows)[0])), ctx, {})
  assert.deepEqual(freeRows(scanned(rows, 'S-1007-0002').toReceive, waits, new Set()).map((r) => r.item), ['a-cbc'], 'the scan receives the CBC; the lipids wait')
  const src = readFileSync(new URL('../src/packs/lis/Receive.tsx', import.meta.url), 'utf8')
  assert.match(src, /usePackRows\('screen'/); assert.match(src, /marks=\{packs\.marks\(pr\)\} extra=\{packs\.buttons\(pr\)\} below=\{packs\.below\(pr\)\}/)
  assert.match(src, /toReceive\.filter\(free\)/, 'a scan takes the free ones'); assert.match(src, /packs\.anyway\(pr, hold\.map\(\(r\) => r\.order\.item\), 'Receive'\)/, 'Receive anyway…')
})
test('receive: a number that finds nothing says why, from the orders it was given to', () => {
  const R = (item: string, step_key: string | null, specimen?: string) => ({ item, patient: { given_name: 'Adam', family_name: 'Fouda' }, step_data: specimen ? { specimen } : null, reply: null,
    order: { step_key, status: step_key ? 'in-progress' : 'active' } }) as unknown as RequestQueueRow
  assert.match(notFound([], 's-1007-0009', []), /^S-1007-0009: no sample was given this number/)
  assert.match(notFound([R('a', 'collected', 'S-1007-0005')], 'S-1007-0009', ['a']), /given to Adam Fouda, whose tubes were saved as S-1007-0005/)
  assert.match(notFound([R('a', null)], 'S-1007-0009', ['a']), /Adam Fouda's, but not marked Collected yet/)
  assert.match(notFound([R('b', null)], 'S-1007-0009', ['a']), /no longer waiting/)
})
// /lab: a GP clinic the Laboratory (which uses the pack) works for; Radiology's chest X-ray is not the lab's; Physiotherapy it does not serve
const svc = (id: string, code: string, name: string, department_id: string, section_name = 'Chemistry', steps = ['collected', 'received']) => ({ id, code, name, department_id, section_name, steps })
const LAB = [svc('cbc', 'cbc', 'Complete blood count', 'lab', 'Haematology'), svc('creat', 'creat', 'Creatinine', 'lab'), svc('crp', 'crp', 'CRP', 'lab'), svc('lipids', 'lipids', 'Lipid profile', 'lab'),
  svc('fbs', 'fbs', 'Fasting glucose', 'lab'), svc('tni', 'troponin', 'Troponin I', 'lab'), svc('cxr', 'cxr', 'Chest X-ray', 'rad', 'Imaging')]
const DEPTS = [{ id: 'gp', name: 'General Practice', packs: [] }, { id: 'lab', name: 'Laboratory', packs: ['lis'] }, { id: 'rad', name: 'Radiology', packs: [] }, { id: 'physio', name: 'Physiotherapy', packs: [] }]
const at = (departmentId = 'gp', services = LAB): Ctx => ({ services, departments: DEPTS, problems: [], departmentId, packs: [],
  templates: [{ id: 't1', name: 'DM follow-up', shortcut: 'dm', items: [{ service_id: 'creat' }, { service_id: 'lipids' }, { service_id: 'cxr' }] }] })
const ok = (line: string, c = at()): Parsed[] => { const r = parse(line, c); if (!r || !('ok' in r)) throw new Error(`${line}: ${JSON.stringify(r)}`); return r.ok }
const err = (line: string, c = at()) => { const r = parse(line, c); if (!r || !('error' in r)) throw new Error(`${line}: no error`); return r.error }
test('/lab: only the Laboratory\'s tests; a preset by its name or shortcut (its lab tests); stat and ? the question', () => {
  assert.deepEqual(ok('/lab cbc, creat').map((p) => p.params.service_id), ['cbc', 'creat'])
  assert.match(err('/lab cxr'), /No lab test “cxr”/, 'Radiology\'s, not the lab\'s')
  assert.deepEqual(ok('/lab dm').map((p) => p.params.service_id), ['creat', 'lipids'], 'the preset by its shortcut: its lab tests only')
  assert.deepEqual(ok('/lab dm follow').map((p) => p.params.service_id), ['creat', 'lipids'], 'by its name')
  const [t] = ok('/lab troponin stat ? chest pain since morning')
  assert.deepEqual(t.params, { service_id: 'tni', priority: 'stat', question_text: 'chest pain since morning' })
  assert.equal(t.line, 'Troponin I (stat) ? chest pain since morning → Laboratory')
})
test('never guessed: a word that fits more than one is asked, in /order too; a code is never in doubt', () => {
  const [a] = ok('/lab cr'); assert.deepEqual(a.params.choices, ['creat', 'crp']); assert.equal(a.params.service_id, undefined); assert.equal(a.line, '“cr”: 2 fit — choose one')
  assert.deepEqual(ok('/lab crp').map((p) => p.params.service_id), ['crp'], 'its code')
  assert.deepEqual(ok('/order cr').map((p) => p.params.choices), [['creat', 'crp']], '/order asks too')
  assert.equal(lineOf({ ...a, params: { ...a.params, service_id: 'crp', choices: undefined } }, at()), 'CRP → Laboratory', 'chosen: the line follows')
})
test('where /lab is offered: where the Laboratory takes orders from; elsewhere it says where it orders from', () => {
  assert.ok(commandsFor(at()).some((c) => c.name === 'lab'))
  const physio = at('physio', LAB.filter((s) => s.department_id !== 'lab'))   // the lab does not work for it: its tests are not offered there
  assert.ok(!commandsFor(physio).some((c) => c.name === 'lab'))
  assert.equal(err('/lab cbc', physio), '/lab orders from Laboratory, which does not take orders from Physiotherapy. /order shows what this department can order.')
  assert.match(err('/lab cbc', at('lab')), /^\/lab orders from this department/)
  const sg = suggest('/lab cr', at(), [], new Set())!; const s = sg.items
  assert.deepEqual(s.map((x) => x.label), ['Creatinine', 'CRP']); assert.equal(s[0].detail, 'creat · Chemistry · yellow tube')
  assert.ok(sg.list, 'drawn as a list, one test a row'); assert.equal(s[0].swatch, 'var(--tube-yellow)', 'its tube\'s colour beside it')
  assert.equal(suggest('/', at(), [], new Set())!.items.find((x) => x.label === '/lab')?.group, 'Laboratory', 'the / list: under the pack\'s own name')
  assert.equal(suggest('/lab dm', at(), [], new Set())!.items[0].label, 'DM follow-up', 'a preset offered by its shortcut')
  assert.equal(suggest('/lab troponin ? ch', at(), [], new Set()), null, 'the question: free words')
  assert.equal(suggest('/lab ', at(), [], new Set()), null, 'nothing typed yet: no list'); assert.equal(suggest('/lab cbc, ', at(), [], new Set()), null, 'nor after a comma')
  assert.equal(suggest('/lab c', at(), [], new Set())!.items[0].label, 'Complete blood count', 'from the first letter')
  // every service the Laboratory offers is /lab's, as the department has it: one that takes no sample (its own X-ray) shows no tube
  const lab = at('gp', [...LAB, svc('lcx', 'lcxr', 'Chest X-ray (lab)', 'lab', 'Imaging', [])])
  assert.equal(suggest('/lab lcx', lab, [], new Set())!.items[0].detail, 'lcxr · Imaging', 'offered, with no tube')
  assert.equal(suggest('/lab lcx', lab, [], new Set())!.items[0].swatch, undefined, 'nor a colour')
  assert.deepEqual(ok('/lab lcxr', lab).map((p) => p.params.service_id), ['lcx'], 'ordered like any of its services')
})
// the specimen labels (§3.13 Printing, owner 2026-10-08): Rania's tests, collected under one number, then a second sample later
setClinicTimeZone('Africa/Cairo')
const born = `${new Date().getFullYear() - 26}-01-01`
const LR = (item: string, code: string, name: string, section: string, specimen: string | null, at = '2026-10-08T07:24:00Z', step_key = 'collected', note?: string) => ({ item, id: item,
  service_name: name, section_name: section, display_line: name, patient: { id: 'rania', given_name: 'Rania', family_name: 'Samir', record_number: 1042, sex: 'female', born_on: born },
  step_data: specimen ? { specimen, ...(note ? { note } : {}) } : null, order: { item, status: 'in-progress', step_key, last_at: at } }) as unknown as RequestQueueRow
const svcOf = (r: RequestQueueRow) => ({ code: r.item.split(':')[0] })
test('labels: one a tube — the patient, age and sex, the record number, when collected, the tube\'s word and its tests, fasting where asked, the sample number', () => {
  const rows = [LR('cbc:1', 'cbc', 'Complete blood count', 'Haematology', null), LR('hba1c:1', 'hba1c', 'HbA1c', 'Chemistry', null), LR('lipids:1', 'lipids', 'Lipid profile', 'Chemistry', null),
    LR('fbs:1', 'fbs', 'Fasting glucose', 'Chemistry', null)]
  const ls = labelsOf(rows, svcOf, { sample: 'S-1008-0003', at: '2026-10-08T07:30:00Z', fasting: true })
  assert.deepEqual(ls.map((l) => [l.tube, l.tests.join(', '), l.fasting]), [['Purple · EDTA', 'Complete blood count, HbA1c', null], ['Yellow · gel', 'Lipid profile', 'Fasting'],
    ['Grey · fluoride', 'Fasting glucose', 'Fasting']], 'three tubes, three labels, in the tubes\' order; fasting on the tubes whose tests ask it')
  assert.ok(ls.every((l) => l.sample === 'S-1008-0003' && l.name === 'Rania Samir' && l.age_sex === '26 F' && l.record === 1042 && l.at === '2026-10-08T07:30:00Z'))
  assert.deepEqual(labelsOf(rows, svcOf, { sample: 'S-1008-0003', at: '2026-10-08T07:30:00Z', fasting: false }).map((l) => l.fasting), [null, 'Not fasting', 'Not fasting'])
  assert.equal(printWords(ls), 'Print 3 labels'); assert.equal(printWords(ls.slice(0, 1)), 'Print 1 label'); assert.equal(samplesOf(ls), 'S-1008-0003')
})
test('labels again: each tube its own sample\'s number where a patient has two samples waiting; the same numbers every time; only tubes still at Collected', () => {
  const rows = [LR('cbc:1', 'cbc', 'Complete blood count', 'Haematology', 'S-1008-0001', '2026-10-08T06:10:00Z'),
    LR('lipids:1', 'lipids', 'Lipid profile', 'Chemistry', 'S-1008-0004', '2026-10-08T07:40:00Z', 'collected', 'not fasting'),
    LR('tsh:1', 'tsh', 'TSH', 'Hormones', 'S-1008-0004', '2026-10-08T07:40:00Z'), LR('kft:1', 'kft', 'Kidney function', 'Chemistry', 'S-1008-0002', '2026-10-08T06:30:00Z', 'received'),
    LR('crp:1', 'crp', 'CRP', 'Chemistry', null, '2026-10-08T07:50:00Z', 'collected')]
  const ls = labelsOf(rows.filter(atCollected), svcOf)
  assert.deepEqual(ls.map((l) => `${l.sample} ${l.tube} ${l.tests.join('+')} ${l.fasting ?? ''}`.trim()),
    ['S-1008-0001 Purple · EDTA Complete blood count', 'S-1008-0004 Yellow · gel Lipid profile+TSH Not fasting'], 'two samples, each tube its own number; received or unnumbered: no label')
  assert.deepEqual(ls.map((l) => l.at), ['2026-10-08T06:10:00Z', '2026-10-08T07:40:00Z'], 'each when its sample was collected')
  assert.deepEqual(labelsOf(rows.filter(atCollected), svcOf), ls, 'Print again: the same numbers'); assert.equal(samplesOf(ls), 'S-1008-0001 S-1008-0004')
})
test('a label as it prints: one a page, its words never a colour alone, the barcode Scan to receive reads back; a later copy says so', () => {
  const ls = labelsOf([LR('cbc:1', 'cbc', 'Complete blood count', 'Haematology', 'S-1008-0001'), LR('fbs:1', 'fbs', 'Fasting glucose', 'Chemistry', 'S-1008-0001')], svcOf)
  const html = renderToStaticMarkup(createElement(LabelSheet, { data: ls, header: { name: 'Nile', logo: null, address: null, phone: null, tax_number: null }, reprint: null }))
  assert.equal((html.match(/<section/g) ?? []).length, 2, 'a page each'); assert.match(html, /Rania Samir/); assert.match(html, /26 F/); assert.match(html, /#1042/)
  assert.match(html, /2026-10-08 10:24/, 'collected, in the clinic\'s time'); assert.match(html, /Purple · EDTA/); assert.match(html, /Grey · fluoride/); assert.match(html, />Fasting</)
  assert.equal((html.match(/aria-label="Barcode S-1008-0001"/g) ?? []).length, 2); assert.doesNotMatch(html, /Reprint/); assert.doesNotMatch(html, /Nile/, 'no room for the header')
  assert.match(renderToStaticMarkup(createElement(LabelSheet, { data: ls, header: { name: 'Nile', logo: null, address: null, phone: null, tax_number: null }, reprint: '10:42' })), /Reprint · 10:42/)
  const read = decode128(encode128(ls[0].sample).modules)!
  assert.deepEqual(scanned([{ ...LR('cbc:1', 'cbc', 'CBC', 'Haematology', 'S-1008-0001'), reply: null } as RequestQueueRow], read).toReceive.map((r) => r.item), ['cbc:1'], 'the scanner types it back: received')
})
test('the Sample labels switch: written (a number on each tube) unless the laboratory says printed', () => {
  const org = (labels?: string) => ({ settingKeys: [], datatypes: {}, settings: labels ? [{ key: 'lis.large', thing_id: 'lab', data: { labels } }] : [] }) as never
  assert.equal(largeOf(org(), 'lab').labels, 'written'); assert.equal(largeOf(org('printed'), 'lab').labels, 'printed'); assert.equal(largeOf(org('written'), 'lab').labels, 'written')
  const src = readFileSync(new URL('../src/packs/lis/Collect.tsx', import.meta.url), 'utf8')
  assert.match(src, /const printing = large\.labels === 'printed'/); assert.match(src, /labels ready/); assert.match(src, /<PrintButton label=\{printWords\(ready\.labels\)\} keyed/, 'Print 3 labels (P)')
  assert.match(src, /key: 'lis\.labels', data: labels, thing: samplesOf\(labels\), patientId/, 'the print names the patient: logged like a read')
})
console.log(`lis: ${n} groups passed`)
