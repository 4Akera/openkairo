// The department's tab row and the Screens line editor (spec/openCare.md §5.1 rules 1, 4, 5 and 6): pure, no browser, no database.
// npm run test:screens
import assert from 'node:assert/strict'
import { BOARD, baseLine, flipScreen, lineForPacks, lineHere, screenChoices, screensOf, tabRow, tabSearch, TAB_LIMIT, type Declared } from '../src/core/screens/line'
import type { Department } from '../src/core/db/types'

const S = (key: string, work: string, action: string | null = null, replaces: string[] = []): Declared =>
  ({ key, layer: key.split('.')[0], work, action, replaces, labels: { en: key.split('.')[1] } })
const declared: Declared[] = [S('base.desk', 'desk', 'read:patients'), S('base.queue', 'visits', 'read:queue'), S('base.bench', 'bench', 'read:bench'),
  S('base.beds', 'stays', 'read:queue'), S('pharmacy.dispensing', 'bench', 'read:pharmacy.queue', ['base.bench'])]
// a long line, for the limit: seven screens of a bench, some for any work
const many: Declared[] = [...declared, ...['a', 'b', 'c', 'd', 'e', 'f'].map((k) => S(`base.x${k}`, k === 'f' ? 'any' : 'bench'))]
const all = () => true
const dept = (d: Partial<Department>): Pick<Department, 'work' | 'screens' | 'packs' | 'opens'> => ({ work: 'bench', screens: ['base.bench'], packs: [], opens: null, ...d })
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const keys = (t: { key: string }[]) => t.map((x) => x.key)

test('the line as drawn: used here, of the work, drawable; a replaced base screen never beside its stand-in', () => {
  assert.deepEqual(keys(screensOf(dept({ screens: ['pharmacy.dispensing'] }), declared, all)), ['base.bench'], 'a pack not used here gives back the bench')
  assert.deepEqual(keys(screensOf(dept({ screens: ['pharmacy.dispensing'], packs: ['pharmacy'] }), declared, (k) => k !== 'pharmacy.dispensing')), ['base.bench'], 'and so does one with no client code')
  assert.deepEqual(keys(screensOf(dept({ screens: ['pharmacy.dispensing'], packs: ['pharmacy'] }), declared, all)), ['pharmacy.dispensing'])
  assert.deepEqual(keys(screensOf(dept({ screens: ['base.bench', 'pharmacy.dispensing'], packs: ['pharmacy'] }), declared, all)), ['pharmacy.dispensing'], 'the bench leaves')
  assert.deepEqual(keys(screensOf(dept({ screens: ['base.bench', 'pharmacy.dispensing'] }), declared, all)), ['base.bench'], 'unticked: the bench stays')
  assert.deepEqual(keys(screensOf(dept({ screens: ['base.queue', 'base.bench'] }), declared, all)), ['base.bench'], 'another work')
  assert.deepEqual(keys(screensOf(dept({ screens: ['base.bench', 'base.gone'] }), declared, all)), ['base.bench'], 'not declared here (a pack off)')
  assert.deepEqual(keys(screensOf(dept({ screens: ['base.bench'] }), declared, (k) => k !== 'base.bench')), [], 'no client code for it')
})
test('the tab row shows only the tabs whose action the user holds here; none named: anyone working here', () => {
  const d = dept({ screens: ['base.bench', 'base.xa', 'base.xf'] })
  const may = (a: string) => a === 'read:bench'
  assert.deepEqual(keys(tabRow(d, many, may, all).first), ['base.bench', 'base.xa', 'base.xf'])
  assert.deepEqual(keys(tabRow(d, many, () => false, all).first), ['base.xa', 'base.xf'], 'the bench needs read:bench')
  const ph = dept({ screens: ['pharmacy.dispensing'], packs: ['pharmacy'], opens: 'pharmacy.dispensing' })
  assert.deepEqual(tabRow(ph, declared, (a) => a === 'read:patients', all).first, [], 'a receptionist holds no tab in the pharmacy')
  assert.deepEqual(keys(tabRow(ph, declared, (a) => a === 'read:bench', all).first), [], 'nor a lab technician: Dispensing needs read:pharmacy.queue')
  assert.equal(tabRow(ph, declared, (a) => a === 'read:pharmacy.queue', all).current, 'pharmacy.dispensing')
})
test(`at most ${TAB_LIMIT} tabs in the line's order, then More · n, which opens in the row`, () => {
  const d = dept({ screens: ['base.xe', 'base.bench', 'base.xa', 'base.xb', 'base.xc', 'base.xd', 'base.xf'] })
  const r = tabRow(d, many, all, all)
  assert.deepEqual(keys(r.first), ['base.xe', 'base.bench', 'base.xa', 'base.xb', 'base.xc'])
  assert.deepEqual(keys(r.rest), ['base.xd', 'base.xf']); assert.equal(r.open, false)
  assert.equal(tabRow(d, many, all, all, null, true).open, true, 'More · 2 opened')
  const hidden = tabRow(d, many, all, all, 'base.xf')
  assert.equal(hidden.current, 'base.xf'); assert.equal(hidden.open, true, 'a selected tab behind More opens the row')
  assert.equal(hidden.pinned, true, 'and keeps it open: no Fewer while it is selected')
  assert.equal(tabRow(d, many, all, all, 'base.xf', false).open, true, 'Fewer cannot fold it')
  assert.equal(tabRow(d, many, all, all, null, true).pinned, false, 'More opened by hand folds again')
  const five = tabRow(dept({ screens: ['base.bench', 'base.xa', 'base.xb', 'base.xc', 'base.xd'] }), many, all, all)
  assert.equal(five.first.length, 5); assert.deepEqual(five.rest, [], 'five: no More')
  const filtered = tabRow(d, many, (a) => a !== 'read:bench', all)
  assert.deepEqual(keys(filtered.first), ['base.xe', 'base.xa', 'base.xb', 'base.xc', 'base.xd'], 'the limit counts only the tabs this user sees')
})
test('it opens on the link (?tab=), else on the line\'s opens, else the first', () => {
  const d = dept({ screens: ['base.bench', 'base.xa', 'base.xb'], opens: 'base.xa' })
  assert.equal(tabRow(d, many, all, all).current, 'base.xa')
  assert.equal(tabRow(d, many, all, all, 'base.xb').current, 'base.xb')
  assert.equal(tabRow(d, many, all, all, 'base.queue').current, 'base.xa', 'a link to a tab not here falls back')
  assert.equal(tabRow({ ...d, opens: 'base.bench' }, many, (a) => a !== 'read:bench', all).current, 'base.xa', 'opens on a tab this role lacks: the first it has')
  assert.equal(tabRow({ ...d, opens: null }, many, all, all).current, 'base.bench')
})
test('the selected tab is kept in the link; the one it opens on is the plain link', () => {
  assert.equal(tabSearch('', 'base.xb', 'base.xa'), '?tab=base.xb')
  assert.equal(tabSearch('?tab=base.xb', 'base.xa', 'base.xa'), '')
  assert.equal(tabSearch('?at=entry%3A1&tab=base.xb', 'base.xc', 'base.xa'), '?at=entry%3A1&tab=base.xc', 'other parameters stay')
  assert.equal(tabSearch('?tab=base.xb', 'base.xa', null), '?tab=base.xa')
})
test('the editor: base screens of the work and the ticked packs\' screens; a stand-in drops the screen it replaces', () => {
  assert.deepEqual(baseLine('bench', declared), ['base.bench']); assert.deepEqual(baseLine('outside', declared), [])
  assert.deepEqual(keys(screenChoices('bench', declared, [], ['base.bench'])), ['base.bench'], 'unticked: no pack screen offered')
  assert.deepEqual(keys(screenChoices('bench', declared, ['pharmacy'], ['base.bench'])), ['base.bench', 'pharmacy.dispensing'])
  assert.deepEqual(keys(screenChoices('bench', declared, ['pharmacy'], ['pharmacy.dispensing'])), ['pharmacy.dispensing'], 'the bench is replaced')
  assert.deepEqual(keys(screenChoices('visits', declared, ['pharmacy'], ['base.queue'])), ['base.queue'], 'its screen is for a bench')
  assert.deepEqual(keys(screenChoices('bench', declared, [], ['pharmacy.dispensing'])), ['base.bench'], 'a pack screen not used here (off or unticked) replaces nothing: the bench is offered')
})
test('ticking a pack brings its screens onto the line; unticking takes them off; a line never empties', () => {
  const ticked = lineForPacks({ screens: ['base.bench'], opens: 'base.bench' }, 'bench', declared, [], ['pharmacy'])
  assert.deepEqual(ticked, { screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' })
  assert.deepEqual(lineForPacks(ticked, 'bench', declared, ['pharmacy'], []), { screens: ['base.bench'], opens: 'base.bench' })
  assert.deepEqual(lineForPacks({ screens: ['base.queue'], opens: 'base.queue' }, 'visits', declared, [], ['pharmacy']), { screens: ['base.queue'], opens: 'base.queue' }, 'no screen for a clinic')
  const two = lineForPacks({ screens: ['base.bench', 'base.xa'], opens: 'base.xa' }, 'bench', many, [], ['pharmacy'])
  assert.deepEqual(two, { screens: ['base.xa', 'pharmacy.dispensing'], opens: 'base.xa' }, 'it keeps opening where it did')
})
test('flipping one screen: on, it drops what it stands in for; the last one stays', () => {
  assert.deepEqual(flipScreen({ screens: ['base.bench'], opens: 'base.bench' }, 'pharmacy.dispensing', declared, ['pharmacy']), { screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' })
  assert.equal(flipScreen({ screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' }, 'pharmacy.dispensing', declared, ['pharmacy']), null)
  assert.deepEqual(flipScreen({ screens: ['base.bench', 'base.xa'], opens: 'base.bench' }, 'base.bench', many, []), { screens: ['base.xa'], opens: 'base.xa' })
  assert.deepEqual(flipScreen({ screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' }, 'base.bench', declared, []),
    { screens: ['pharmacy.dispensing', 'base.bench'], opens: 'pharmacy.dispensing' }, 'a pack screen not used here does not push the bench off')
})
test('the editor starts from the line as the department shows it: a pack screen not used here is back to the bench', () => {
  const ph = dept({ screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' })
  assert.deepEqual(lineHere(ph, declared), { screens: ['base.bench'], opens: 'base.bench' }, 'pharmacy off or unticked: the bench, which can be saved')
  assert.deepEqual(lineHere({ ...ph, packs: ['pharmacy'] }, declared), { screens: ['pharmacy.dispensing'], opens: 'pharmacy.dispensing' }, 'used here: as stored')
  assert.deepEqual(lineHere(dept({ screens: ['base.bench', 'base.xa'], opens: 'base.xa' }), many), { screens: ['base.bench', 'base.xa'], opens: 'base.xa' })
  assert.deepEqual(lineHere(dept({ screens: ['base.gone'] }), declared), { screens: ['base.bench'], opens: 'base.bench' }, 'nothing left: the base\'s line')
})
test('one board per place: a ward\'s line keeps the bed board, and a line that left it out still draws it first', () => {
  const list = [...declared, S('icu.fluids', 'stays')]
  assert.equal(flipScreen({ screens: [BOARD, 'icu.fluids'], opens: BOARD }, BOARD, list, ['icu']), null, 'the board cannot be taken off')
  assert.deepEqual(flipScreen({ screens: [BOARD], opens: BOARD }, 'icu.fluids', list, ['icu']), { screens: [BOARD, 'icu.fluids'], opens: BOARD }, 'a pack list of other work sits beside it')
  assert.deepEqual(keys(screensOf(dept({ work: 'stays', screens: ['icu.fluids'], packs: ['icu'] }), list, all)), [BOARD, 'icu.fluids'])
  assert.deepEqual(keys(screensOf(dept({ work: 'stays', screens: [] }), list, all)), [BOARD])
})
console.log(`screens: ${n} groups passed`)
