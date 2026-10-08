// The core names no pack (spec/openCare.md §5.2): what a pack answers, where a prescription is sent and the words on a medicine there,
// its last step, what its requests carry and its refusals' words all come through the registries every pack uses — proven with
// pharmacy's own words; the scan that fails when a core file names a pack; and Settings → Packs' words for a pack's background work.
// Pure: no browser, no database.   npm run test:registries
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PLAIN_SEND, registerSend, sendTarget, sendWordsOf, sendsTo } from '../src/core/screens/visit/send'
import { lineOf } from '../src/core/screens/visit/parse'
import { draftEntries } from '../src/core/db/entries'
import { benchWordsFor, registerBenchWords, registerReplyForm, replyDetails, replyFormFor } from '../src/core/renderers'
import { FINAL_STEP } from '../src/core/screens/chart/model/labels'
import { registerWords, words } from '../src/core/db/words'
import { workOf } from '../src/core/screens/settings/packWork'
import { ANSWER, DONE, QUEUE_DETAILS, REFUSALS, SEND_WORDS } from '../src/packs/pharmacy/answers'
import { packKeys, packNamesIn } from '../eslint/no-pack-names.js'
import type { Organization, PackWork } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const quiet = <T,>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn() } finally { console.error = e } }
const org = (serves: (string | null)[] = [null]) => ({
  services: [{ id: 'cbc', department_id: 'lab', reply_type: 'result', code: 'cbc', name: 'CBC' }, { id: 'disp', department_id: 'ph', reply_type: ANSWER, code: 'dispense', name: 'Dispensing' }],
  allDepartments: [{ id: 'ph', name: 'Pharmacy', serves }, { id: 'lab', name: 'Lab', serves: [null] }, { id: 'gp', name: 'GP', serves: [null] }],
}) as unknown as Organization

test('nothing answers prescriptions until a pack says so: no target, the plain words', () => {
  assert.equal(sendsTo(ANSWER), false); assert.equal(sendTarget(org(), 'gp'), null)
  assert.equal(sendWordsOf(org(), 'disp'), PLAIN_SEND)
  const es = draftEntries({ id: 'd1', function: 'medication', params: { action: 'start', drug: { name: 'Lithium' }, frequency: 'BD', send: true } }, { patientId: 'p', departmentId: 'gp', org: org() })
  assert.deepEqual(es.map((e) => e.type), ['medication'], 'sent nowhere: the medication alone')
})
test('pharmacy registers where prescriptions go and its words; the core finds them by the registry (once per answer)', () => {
  assert.equal(registerSend(ANSWER, SEND_WORDS), true)
  assert.equal(quiet(() => registerSend(ANSWER, PLAIN_SEND)), false, 'once')
  const t = sendTarget(org(), 'gp'); assert.equal(t?.service.id, 'disp'); assert.equal(t?.words.to, 'pharmacy'); assert.equal(t?.words.chip, 'Send to pharmacy')
  assert.equal(sendTarget(org(['im']), 'gp'), null, 'a pharmacy that works only for Internal Medicine'); assert.equal(sendTarget(org(['im']), 'im')?.service.id, 'disp')
  const w = sendWordsOf(org(), 'disp')
  assert.deepEqual([w.draft, w.sent, w.at('prepared'), w.open, w.done, w.notDone, w.stopped],
    ['To the pharmacy', 'Sent to the pharmacy', 'Pharmacy: prepared', 'at the pharmacy', 'Dispensed', 'Not given', 'Not dispensed'])
  assert.equal(sendWordsOf(org(), 'cbc'), PLAIN_SEND, 'a lab answers no prescription')
})
test('a prescription sent on: an order about it to that service; its line says where, in the pack\'s word', () => {
  const es = draftEntries({ id: 'd3', function: 'medication', params: { action: 'start', drug: { name: 'Lithium' }, frequency: 'BD', send: true } }, { patientId: 'p', departmentId: 'gp', org: org() })
  assert.deepEqual(es.map((e) => e.type), ['medication', 'order']); assert.equal(es[1].relation, 'about'); assert.equal(es[1].refers_to, es[0].id)
  assert.deepEqual((es[1].data as { service: unknown; department_id: string }).service, { id: 'disp', code: 'dispense', name: 'Dispensing' })
  const p = { function: 'medication', params: { action: 'start', drug: { name: 'Lithium' }, frequency: 'BD', send: true }, line: '', kind: 'prescription' }
  assert.match(lineOf(p, { services: [], departments: [], send: SEND_WORDS }), /→ pharmacy$/); assert.match(lineOf(p), /→ sent$/, 'no words at hand: the plain ones')
})
test('its answer: the last step\'s word and what each request carries come with its reply form; the core\'s list names no pack', () => {
  assert.equal(replyFormFor(ANSWER), undefined); assert.deepEqual(replyDetails(), [])
  registerReplyForm(ANSWER, { action: 'write:pharmacy.dispense', Editor: () => null, toWrite: () => null, automatic: true, done: DONE, details: QUEUE_DETAILS })
  assert.equal(replyFormFor(ANSWER)?.done, 'Dispensed'); assert.deepEqual(Object.keys(FINAL_STEP), ['result', 'note'])
  const [d] = replyDetails(); assert.equal(d.table, 'pharmacy.queue'); assert.equal(d.action, 'read:pharmacy.queue'); assert.deepEqual(d.where('ph'), { department_id: 'ph' })
  assert.deepEqual(d.of({ item: 'o1', drug: 'Lithium', dose: '400 mg', timing: 'BD', duration_days: 30, quantity: '60', medication_item: 'm1', status: 'to_prepare' }),
    { item: 'o1', details: { drug: { name: 'Lithium' }, dose: '400 mg', frequency: 'BD', duration_days: 30, quantity: '60', medication_item: 'm1',
      instructions: undefined, warnings: [], owed: undefined, status: 'to_prepare', question: undefined, given: [] } })
  assert.deepEqual(d.of({ item: 'o2', status: 'owed', owed: '14 tablets', given: [{ drug: 'Augmentin 1 g', quantity: '14', unit: 'tablets' }] }).details.given,
    [{ drug: 'Augmentin 1 g', quantity: '14', unit: 'tablets' }], 'what was given so far, from its own table (what its row prices)')
})
test('a pack\'s refusal words come from the pack; a core code\'s words never change', () => {
  assert.equal(words('nothing_dispensed'), 'nothing dispensed')
  registerWords({ ...REFUSALS, not_allowed: 'Anything' })
  assert.equal(words('nothing_dispensed'), 'Say what was given'); assert.equal(words('not_allowed'), 'Your role cannot do this here')
})

const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.generated\.ts$/.test(f) ? [p] : [] })
test('no core file names a pack (the scan the ESLint rule opencare/no-pack-names runs), and the scan catches every way of writing one', () => {
  assert.ok(packKeys().includes('pharmacy'), 'the packs: ' + packKeys().join(', '))
  const named = files('src/core').flatMap((f) => packNamesIn(readFileSync(f, 'utf8')).map((h) => `${f}: ${h.key}`))
  assert.deepEqual(named, [], 'core files naming a pack')
  assert.deepEqual(packNamesIn("// sent to the Pharmacy\nconst t = 'pharmacy.dispense'; read('PHARMACY.queue')").map((h) => h.key), ['pharmacy', 'pharmacy', 'pharmacy'])
  assert.deepEqual(packNamesIn('pharmacyx · a_pharmacy · pharmacist · dispensary'), [], 'only the key as a word')
})
test('no pack names another pack, nor imports one (opencare/no-pack-names with its own key, and the import guards): spec §5, §5.4', () => {
  for (const own of packKeys()) {
    const mine = files(`src/packs/${own}`)
    const others = packKeys().filter((k) => k !== own)
    assert.deepEqual(mine.flatMap((f) => packNamesIn(readFileSync(f, 'utf8'), others).map((h) => `${f}: ${h.key}`)), [], `${own} names another pack`)
    // every import is the core's (@core/…), a library's, or a file of its own folder: never @packs, never a path climbing out of it
    const out = mine.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
      .filter((x) => x.startsWith('@packs') || (x.startsWith('.') && !join(f, '..', x).startsWith(join('src', 'packs', own)))).map((x) => `${f}: ${x}`))
    assert.deepEqual(out, [], `${own} imports outside its folder other than through @core`)
  }
  assert.deepEqual(packNamesIn('the pharmacy hands its lines', packKeys().filter((k) => k !== 'pharmacy')), [], 'its own key is its own')
  assert.ok(packKeys().filter((k) => k !== 'lis').every((k) => packNamesIn(`a word about ${k}`, packKeys().filter((x) => x !== 'lis')).length === 1), 'any other key is caught')
})

const work = (w: Partial<PackWork>): PackWork => ({ stale: 0, failing: 0, parked: 0, waiting: 0, catchUp: null, ...w })
test('Settings → Packs: catching up with its progress; failures and parked work with Retry; nothing to say when all is well', () => {
  assert.deepEqual(workOf(work({})), { lines: [], retry: false })
  assert.deepEqual(workOf(work({ waiting: 400, catchUp: { patients: 400, left: 280 } })), { lines: [{ text: 'catching up · 120 of 400 patients', tone: 'info' }], retry: false })
  assert.deepEqual(workOf(work({ stale: 3, failing: 2, waiting: 1 })).lines.map((l) => `${l.tone}:${l.text}`), ['warn:2 refreshes failed · trying again', 'warn:3 patients to refresh'])
  assert.equal(workOf(work({ stale: 3, failing: 2 })).retry, true)
  const parked = workOf(work({ stale: 1, parked: 1 })); assert.deepEqual(parked.lines[0], { text: '1 refresh failed five times and stopped', tone: 'danger' }); assert.equal(parked.retry, true)
  assert.equal(workOf(work({ stale: 1, waiting: 3 })).retry, false, 'stale with work waiting: it will run')
  assert.equal(workOf(work({ stale: 1 })).retry, true, 'stale with nothing waiting: Retry queues it again')
})
test("the bench speaks generally; a pack's own words show only where its department uses it", () => {
  assert.deepEqual(benchWordsFor([]), {}, 'no pack: the base\'s own words (To do · In progress · Done today)')
  registerBenchWords('probe_lab', { todo: 'To collect', done: 'Collected today', older: 'Not collected, older days' })
  assert.equal(benchWordsFor(['probe_lab']).todo, 'To collect', 'a department that uses the pack gets its words')
  assert.deepEqual(benchWordsFor(['pharmacy']), {}, 'a department that does not use it keeps the general words')
  assert.equal(benchWordsFor(['pharmacy', 'probe_lab']).older, 'Not collected, older days', 'the first used pack with words gives them')
})
console.log(`registries: ${n} groups passed`)
