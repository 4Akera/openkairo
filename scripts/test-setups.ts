// Starter setups in words (spec/openCare.md §5.2 "Setup and guards"): the difference view Settings → Departments draws from the setup
// door's parts — the one-line summary ("would add 2 beds, 1 preset; your Screens line differs"), the rows in their order with Apply
// only for what is missing, what a difference says, and the values in words. Pure: no browser, no database.   npm run test:setups
// (the door itself, run on new and changed departments, is supabase/tests/setups.sql)
import assert from 'node:assert/strict'
import { compareChoice, countsToAdd, listWords, missing, rows, summary, valueWords } from '../src/core/screens/settings/setup'
import type { SetupInfo, SetupPart } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const bed = (k: number, state: SetupPart['state'], have?: unknown): SetupPart =>
  ({ part: `place:bed_${k}`, kind: 'place', key: `bed_${k}`, name: `Bed ${k}`, state, want: { id: `id${k}`, name: `Bed ${k}`, label: 'bed', position: k }, have })
const room = (k: number): SetupPart => ({ part: `place:room_${k}`, kind: 'place', key: `room_${k}`, name: `Room ${k}`, state: 'add', want: { name: `Room ${k}`, label: 'room' } })
const setting = (key: string, name: string, state: SetupPart['state'], want: unknown, have?: unknown): SetupPart => ({ part: `setting:${key}`, kind: 'setting', key, name, state, want, have })
const service = (code: string, name: string, state: SetupPart['state'], have?: unknown): SetupPart => ({ part: `service:${code}`, kind: 'service', key: code, name, state, want: { code, name }, have })
const preset = (sc: string, name: string, state: SetupPart['state']): SetupPart => ({ part: `preset:${sc}`, kind: 'preset', key: sc, name, state, want: { name, shortcut: sc } })
const line = (state: SetupPart['state'], want: unknown, have?: unknown): SetupPart => ({ part: 'screens', kind: 'screens', key: 'department.screens', name: 'Screens line', state, want, have })
const pack = (key: string, name: string, state: SetupPart['state']): SetupPart => ({ part: `pack:${key}`, kind: 'pack', key, name, state, why: state === 'blocked' ? 'pack_off' : null })
const NAMES: Record<string, string> = { 'base.beds': 'Bed board', 'base.bench': 'Bench', 'base.worklist': 'Worklist', 'pharmacy.dispensing': 'Dispensing', d1: 'Internal Medicine' }
const name = (k: string) => NAMES[k] ?? k

// the fixture's ward against the Ward setup, as setups.sql finds it: three beds of its own, one retired, four to add, observation
const WARD: SetupPart[] = [setting('department.encounter_class', 'Kind of encounter', 'differs', { class: 'IMP' }, { class: 'OBSENC' }),
  setting('department.review_results', 'Results to review', 'add', { level: 'critical' }),
  bed(1, 'same'), bed(2, 'same'), bed(3, 'same'), bed(4, 'differs', { name: 'Bed 4', retired: true }), bed(5, 'add'), bed(6, 'add'),
  preset('round', 'Ward round', 'add'), line('same', { screens: ['base.beds'], opens: 'base.beds' }, { screens: ['base.beds'] })]

test(`the spec's line: "would add 2 beds, 1 preset; your Screens line differs"`, () => {
  const parts = [bed(1, 'same'), bed(7, 'add'), bed(8, 'add'), preset('round', 'Ward round', 'add'), line('differs', { screens: ['base.beds'] }, { screens: ['base.beds', 'x'] })]
  assert.equal(summary(parts), 'would add 2 beds, 1 preset; your Screens line differs')
})
test('what to add is counted by kind, in the order a setup applies it, each place by its own word, one or many', () => {
  assert.deepEqual(countsToAdd(WARD), ['1 setting', '2 beds', '1 preset'])
  assert.deepEqual(countsToAdd([room(1), bed(1, 'add'), room(2), service('cbc', 'CBC', 'add'), service('a1c', 'HbA1c', 'add'), service('x', 'X', 'same')]),
    ['1 bed', '2 rooms', '2 services'])
  assert.deepEqual(countsToAdd([bed(1, 'differs'), bed(2, 'blocked')]), [], 'only what is to add counts')
})
test('a pack to tick and a line to set are said as what the setup would do', () => {
  assert.equal(summary([pack('pharmacy', 'Pharmacy', 'add'), setting('pharmacy.late_after', 'Late to collect', 'add', { minutes: 30 }), line('add', { screens: ['pharmacy.dispensing'] })]),
    'would tick Pharmacy, add 1 setting and set the Screens line')
  assert.equal(listWords(['a']), 'a'); assert.equal(listWords(['a', 'b']), 'a and b'); assert.equal(listWords(['a', 'b', 'c']), 'a, b and c'); assert.equal(listWords([]), '')
})
test('what differs is named, never offered: one, two, then "n more"', () => {
  assert.equal(summary(WARD), 'would add 1 setting, 2 beds, 1 preset; your Kind of encounter and Bed 4 differ')
  assert.equal(summary([setting('a', 'A', 'differs', 1, 2), setting('b', 'B', 'differs', 1, 2), service('c', 'CBC', 'differs', {}), line('differs', {}, {})]),
    'nothing missing; your A, B and 2 more differ')
})
test('run twice: everything the same, nothing missing, nothing to apply', () => {
  const after = WARD.map((p) => p.state === 'add' ? { ...p, state: 'same' as const } : p)
  assert.equal(summary(after), 'nothing missing; your Kind of encounter and Bed 4 differ')
  assert.deepEqual(missing(after), [])
  assert.equal(summary(after.filter((p) => p.state === 'same')), 'nothing missing')
})
test('a pack off for the clinic: its tick waits, and the line says so', () => {
  const parts = [pack('spare', 'Spare', 'blocked'), line('blocked', { screens: ['spare.board'] })]
  assert.equal(summary(parts), 'nothing missing; Spare is off for the clinic')
  assert.deepEqual(rows(parts).map((r) => [r.state, r.canApply, r.detail]), [['blocked', false, 'its pack is off for the clinic: turn it on under Packs'],
    ['blocked', false, 'its pack is off for the clinic: turn it on under Packs']])
  assert.deepEqual(missing(parts), [])
})
test("the rows: what to add first (with Apply), then what differs, what waits, and what is the same; each kept in the setup's order", () => {
  const r = rows([...WARD, pack('spare', 'Spare', 'blocked')], name)
  assert.deepEqual(r.map((x) => x.state), ['add', 'add', 'add', 'add', 'differs', 'differs', 'blocked', 'same', 'same', 'same', 'same'])
  assert.deepEqual(r.filter((x) => x.canApply).map((x) => x.part), ['setting:department.review_results', 'place:bed_5', 'place:bed_6', 'preset:round'])
  assert.ok(r.every((x) => x.canApply === (x.state === 'add')), 'Apply only for a part to add')
  assert.deepEqual(r.slice(0, 4).map((x) => x.title), ['Setting · Results to review', 'Bed 5', 'Bed 6', 'Preset · Ward round'])
  assert.deepEqual(missing(WARD), ['setting:department.review_results', 'place:bed_5', 'place:bed_6', 'preset:round'], 'Apply all: every part to add, in order')
})
test("what a difference says: here and the setup's, in words; a place renamed or retired; a service changed or removed", () => {
  const r = rows([...WARD, bed(2, 'differs', { name: 'Side room', retired: false }), service('cbc', 'Complete blood count', 'differs', { code: 'cbc' }),
    service('a1c', 'HbA1c', 'differs', null), line('differs', { screens: ['base.bench'], opens: 'base.bench' }, { screens: ['base.bench', 'base.worklist'], opens: 'base.bench' }),
    setting('department.works_for', 'Works for', 'differs', { all: true }, { departments: ['d1'] })], name)
  const at = (title: string) => r.find((x) => x.title === title)?.detail
  assert.equal(at('Setting · Kind of encounter'), 'here OBSENC; the setup IMP')
  assert.equal(r.find((x) => x.part === 'place:bed_4')?.detail, 'retired here; kept so')
  assert.equal(r.find((x) => x.part === 'place:bed_2' && x.state === 'differs')?.detail, 'here "Side room"; kept as it is')
  assert.equal(at('Complete blood count'), 'changed here; kept as it is')
  assert.equal(at('HbA1c'), 'removed here; not added again')
  assert.equal(at('Screens · Screens line'), 'here Bench, Worklist; the setup Bench')
  assert.equal(at('Setting · Works for'), 'here Internal Medicine; the setup all')
  assert.equal(r.find((x) => x.part === 'setting:department.review_results')?.detail, 'critical', 'a setting to add says its value')
  assert.equal(r.find((x) => x.part === 'preset:round')?.detail, '/round', 'a preset its shortcut')
})
test('values in words: yes and no, a list, all, the line and where it opens, nothing set', () => {
  assert.equal(valueWords({ wait: true }), 'yes'); assert.equal(valueWords({ private: false }), 'no')
  assert.equal(valueWords({ minutes: 30 }), '30'); assert.equal(valueWords({ all: true }), 'all')
  assert.equal(valueWords({ screens: ['base.bench', 'base.worklist'], opens: 'base.worklist' }, name), 'Bench, Worklist, opens on Worklist')
  assert.equal(valueWords({ screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' }, name), 'Dispensing', 'opening on the first is not said')
  assert.equal(valueWords(null), 'not set'); assert.equal(valueWords({ departments: [] }), 'none')
})
test('what staff removed differs and is never offered: a bed deleted, a pack unticked', () => {
  const unticked: SetupPart = { ...pack('pharmacy', 'Pharmacy', 'differs'), want: { packs: ['pharmacy'] }, have: { packs: [], unticked: true } }
  const parts = [unticked, bed(8, 'differs', { id: 'id8', name: 'Bed 8', label: 'bed', removed: true }), bed(7, 'add')]
  const r = rows(parts, name)
  assert.equal(r.find((x) => x.part === 'place:bed_8')?.detail, 'removed here; not added again')
  assert.equal(r.find((x) => x.part === 'pack:pharmacy')?.detail, 'unticked here; not ticked again')
  assert.deepEqual(r.filter((x) => x.canApply).map((x) => x.part), ['place:bed_7'])
  assert.deepEqual(missing(parts), ['place:bed_7'], 'Apply all leaves them alone')
  assert.equal(summary(parts), 'would add 1 bed; your Pharmacy tick and Bed 8 differ')
})
test('which setup a department compares with: its own while still of its work, else one to pick', () => {
  const s = (key: string, work: SetupInfo['work']): SetupInfo => ({ key, layer: 'base', work, labels: { en: key }, help: {}, packs: [], screens: null, places: 0, services: 0, presets: 0, settings: 0 })
  const all = [s('clinic', 'visits'), s('ward', 'stays'), s('laboratory', 'bench'), s('pharmacy.pharmacy', 'bench')]
  assert.deepEqual(compareChoice(all, { work: 'visits', setup: 'clinic' }, null), { choices: [all[0]], key: 'clinic', pick: false }, 'made from the Clinic: compared with it, no chips')
  const moved = compareChoice(all, { work: 'stays', setup: 'clinic' }, null)
  assert.equal(moved.key, 'ward', 'a clinic turned into a ward: the Ward setup, never the Clinic (wrong_work)')
  assert.equal(moved.pick, true, 'and the chips show, so another can be picked')
  const bench = compareChoice(all, { work: 'bench', setup: 'laboratory' }, null)
  assert.equal(bench.key, 'laboratory'); assert.equal(bench.pick, true, 'two of its work: the chips show')
  assert.equal(compareChoice(all, { work: 'bench', setup: null }, null).key, null, 'none recorded and two to pick: none until picked')
  assert.equal(compareChoice(all, { work: 'bench', setup: 'laboratory' }, 'pharmacy.pharmacy').key, 'pharmacy.pharmacy', 'the one picked')
})

console.log(`setups: ${n} groups passed`)
