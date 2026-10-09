// Surgery (spec/openCare.md §5.7), as pure decisions: which orders are operations (by their service's steps, never a pack's name), the
// banner's words ("for op · …", "op today · …"), the surgeon's template for an operation, /opnote's two drafts (the base's procedure
// and the pack's operation note extending the base's note), the note's text and line.   npm run test:surgical
import assert from 'node:assert/strict'
import { isOperation, minutesBetween, noteLine, noteText, shortOp, surgeryWords, templateFor, templatesOf, type OrderLike } from '../src/packs/surgical/model'
import { parseOpnote } from '../src/packs/surgical/line'
import { draftEntries } from '../src/core/db/entries'
import type { Ctx } from '../src/core/screens/visit/parse'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const SVC = [{ id: 's1', code: 'lapchole', name: 'Laparoscopic cholecystectomy', steps: ['scheduled', 'arrived', 'operating', 'recovery'] }, { id: 's2', code: 'cbc', name: 'Complete blood count', steps: ['collected'] }]
const o = (x: Partial<OrderLike>): OrderLike => ({ item: 'o1', service_id: 's1', service_code: 'lapchole', service_name: 'Laparoscopic cholecystectomy', status: 'active', step_key: null, ordered_at: '2026-09-03T09:00:00Z', ...x })
const ctx = { services: [], departments: [], problems: [], departmentId: 'th', templates: [], now: new Date('2026-10-08T10:00:00Z') } as Ctx

test('an operation is an order whose service moves through operating; a blood count is not', () => {
  assert.ok(isOperation(o({}), SVC)); assert.ok(!isOperation(o({ service_id: 's2' }), SVC))
})
test('the banner: "for op" while one waits, "op today" while it is under way or its note was written today', () => {
  assert.deepEqual(surgeryWords([o({})], SVC, [], '2026-10-08'), ['for op · lap chole'])
  assert.deepEqual(surgeryWords([o({ step_key: 'operating' })], SVC, [], '2026-10-08'), ['op today · lap chole'])
  assert.deepEqual(surgeryWords([o({ service_id: 's2' })], SVC, [], '2026-10-08'), [])
  assert.equal(shortOp('Inguinal hernia repair, open mesh (Lichtenstein)'), 'inguinal hernia')
})
test('the surgeon\'s own template for the operation, else anyone\'s', () => {
  const org = { organization: { id: 'c' }, settings: [{ key: 'surgical.templates', thing_id: 'c', data: { templates: [{ surgeon: 'Dr. A', operation: 'lapchole', steps: 'A' }, { operation: 'lapchole', steps: 'any' }] } }] }
  assert.equal(templateFor(templatesOf(org), 'lapchole', 'Dr. A')?.steps, 'A'); assert.equal(templateFor(templatesOf(org), 'lapchole', 'Dr. B')?.steps, 'any')
})
test('/opnote: the base\'s procedure, done today, and the pack\'s operation note from the template; no operation, no note', () => {
  const r = parseOpnote('', ctx, { orders: [o({ step_key: 'operating' })], services: SVC as never, templates: [{ operation: 'lapchole', steps: '1. Ports.', findings: 'Stones.' }] })
  assert.ok(r && 'ok' in r); assert.deepEqual(r.ok.map((p) => p.function), ['procedure', 'surgical.opnote'])
  assert.equal((r.ok[0].params.performed as { value: string }).value, '2026-10-08')
  const note = draftEntries({ id: 'n', function: r.ok[1].function, params: r.ok[1].params }, { patientId: 'p', departmentId: 'th' })[0]
  assert.equal(note.type, 'surgical.opnote'); assert.match(String((note.data as { text: string }).text), /Findings: Stones\./)
  const none = parseOpnote('', ctx, { orders: [], services: SVC as never, templates: [] }); assert.ok(none && 'error' in none)
})
test('the note\'s words: blood loss, drain, complications; the minutes between the times', () => {
  const n0 = { operation: 'Laparoscopic cholecystectomy', times: { from: '08:55', to: '09:40' }, blood_loss: 30, drain: 'none', complications: [] }
  assert.equal(noteLine(n0), 'Operation note · Laparoscopic cholecystectomy · 08:55–09:40 · blood loss 30 mL · no drain · no complications')
  assert.match(noteText({ ...n0, complications: ['bile spilled'] }), /bile spilled/); assert.equal(minutesBetween('08:55', '09:40'), 45)
})
console.log(`surgical: ${n} groups passed`)
