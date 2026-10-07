// The laboratory (spec/openCare.md §5.3), as pure decisions: tubes, fasting, the tests a typed line names; the large lab's switches
// (late by section, tickets and chairs, a scan's samples); its order word, /lab (§5.1 rule 1, added).   npm run test:lis
import assert from 'node:assert/strict'
import { MOST_ASKED, needsFasting, testsIn, tubeOf, tubesFor } from '../src/packs/lis/tubes'
import { changeOf, columnsOf, workedOut } from '../src/packs/lis/grid'
import { byArrival, lateBy, nextUp, notFound, nowAt, sampleKey, scanned, sectionKey, targetOf, ticketOf, type Large, type Ticket } from '../src/packs/lis/large'
import type { RequestQueueRow } from '../src/core/db/types'
import '../src/packs/lis/order'
import { lineOf, parse, type Ctx, type Parsed } from '../src/core/screens/visit/parse'
import { suggest } from '../src/core/screens/visit/expand'
import { commandsFor } from '../src/core/screens/visit/commands'

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
test('receive: a scan names the samples collected under its number, whatever its case; one in already says so', () => {
  const R = (item: string, specimen: string, step_key: string, status = 'in-progress') => ({ item, step_data: { specimen }, reply: null, order: { step_key, status } }) as unknown as RequestQueueRow
  const rows = [R('1', 'S-1007-0002', 'collected'), R('2', 'S-1007-0002', 'collected'), R('3', 'S-1007-0003', 'received'), R('4', 'S-1007-0004', 'collected', 'on-hold')]
  assert.equal(sampleKey(' s-1007-0002 '), 'S-1007-0002')
  assert.deepEqual(scanned(rows, 's-1007-0002').toReceive.map((r) => r.item), ['1', '2'])
  assert.deepEqual(scanned(rows, 'S-1007-0003').already.map((r) => r.item), ['3']); assert.equal(scanned(rows, 'S-1007-0003').toReceive.length, 0)
  assert.equal(scanned(rows, 'S-1007-0004').toReceive.length, 0, 'sent back: no longer waiting under its number')
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
console.log(`lis: ${n} groups passed`)
