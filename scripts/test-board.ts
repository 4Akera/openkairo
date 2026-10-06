// One board per place and the packs' marks on the lists (spec/openCare.md §5.1 rules 1 and 4), proven with a test-only probe pack:
// its tile line, two buttons (a third refused) and a row mark, shown only where the department uses it; the base's buttons first and
// always in place; at most two pack buttons; a colour only for a state. Then pharmacy's mark. Pure: no browser, no database.
// npm run test:board
import assert from 'node:assert/strict'
import { PACK_BUTTONS, noBedActions, registerTileButton, registerTileLine, tileActions, tileButtonDefs, tileLineDefs, tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { benchMarkRow, marksOf, registerRowMark, rowMarkDefs, stateTone, visitMarkRow, type MarkCtx, type MarkDef, type MarkRow } from '../src/core/screens/marks'
import { collectMark } from '../src/packs/pharmacy/dispensed'
import type { OrderRow, PresenceRow } from '../src/core/db/types'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PackLine } from '../src/core/screens/ward/Tile'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const quiet = <T,>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn() } finally { console.error = e } }

const stay = (more: Partial<PresenceRow> = {}) => ({ item: 's1', patient_id: 'p1', kind: 'stay', department_id: 'icu', place_id: 'b1', state: 'admitted', urgent: false, reason: null, ...more }) as PresenceRow
const ctx = (packs: string[], more: Partial<TileCtx> = {}): TileCtx => ({ dept: { id: 'icu', packs }, place: null, identity: null, day: 2, can: () => true, ...more })
const taken = (packs: string[], row = stay()) => ({ row, ctx: ctx(packs) })
const labels = (xs: { label: string }[]) => xs.map((x) => x.label)
const free = { closed: false }

// the probe pack, registered once as a pack would be
const clicked: string[] = []
test('the probe pack registers one tile line, two buttons and one mark; a third button, a second line or mark, and the base are refused', () => {
  assert.equal(registerTileLine('probe', (r, c) => ({ words: [`Ventilated d${c.day}`, 'NorAd 0.15', { text: 'MAP 62', tone: r.urgent ? 'danger' : undefined }] })), true)
  assert.equal(registerTileButton('probe', { label: 'Obs', onClick: (r) => clicked.push(r.item) }), true)
  assert.equal(registerTileButton('probe', { label: 'Wean', path: (r) => `/visit/${r.item}?at=wean`, show: (r) => r.reason !== 'no vent' }), true)
  quiet(() => {
    assert.equal(registerTileButton('probe', { label: 'Third', onClick: () => {} }), false, `at most ${PACK_BUTTONS} buttons a pack`)
    assert.equal(registerTileLine('probe', () => ({ words: 'again' })), false, 'one line a pack')
    assert.equal(registerTileLine('base', () => ({ words: 'x' })), false, 'the base adds no pack line')
    assert.equal(registerTileButton('core', { label: 'X', onClick: () => {} }), false)
    assert.equal(registerTileButton('other', { label: 'Neither' }), false, 'onClick or a path')
    assert.equal(registerTileButton('other', { label: 'Both', onClick: () => {}, path: () => '/' }), false, 'not both')
    for (const label of ['Discharge', 'Admit here', ' move ', 'ADMIT']) assert.equal(registerTileButton('labour', { label, path: () => '/' }), false, `${label}: the base's`)
  })
  assert.equal(registerRowMark('probe', (row, c) => row.orders.length ? { word: c.list === 'bench' ? 'probe ready' : 'On probe', tone: 'warn' } : null), true)
  quiet(() => { assert.equal(registerRowMark('probe', () => ({ word: 'again' })), false, 'one mark a pack'); assert.equal(registerRowMark('base', () => null), false) })
  assert.deepEqual(labels(tileButtonDefs().filter((d) => d.pack === 'probe')), ['Obs', 'Wean'])
  assert.deepEqual(tileButtonDefs().filter((d) => d.pack === 'labour'), [], 'no base word was taken')
  assert.equal(tileLineDefs().filter((d) => d.pack === 'probe').length, 1); assert.equal(rowMarkDefs().filter((d) => d.pack === 'probe').length, 1)
})

test('the tile line: the probe\'s words where the department uses it; nothing where it does not', () => {
  assert.deepEqual(tileLineOf(tileLineDefs(), stay(), ctx(['probe'])), [{ pack: 'probe', words: [{ text: 'Ventilated d2' }, { text: 'NorAd 0.15' }, { text: 'MAP 62' }] }])
  assert.deepEqual(tileLineOf(tileLineDefs(), stay(), ctx([])), [], 'not used here')
  assert.deepEqual(tileLineOf(tileLineDefs(), stay(), ctx(['pharmacy'])), [], 'another pack, with no line')
})
test('the tile line is one line: each pack used says its words in the department\'s pack order; a failing or empty one says nothing', () => {
  const list = [...tileLineDefs(), { pack: 'labour', line: () => ({ words: ['6 cm', { text: 'past alert line', tone: 'warn' as const }] }) },
    { pack: 'broken', line: () => { throw new Error('no') } }, { pack: 'blank', line: () => ({ words: '  ' }) }]
  const line = quiet(() => tileLineOf(list, stay(), ctx(['labour', 'broken', 'blank', 'probe'])))
  assert.deepEqual(line.map((s) => s.pack), ['labour', 'probe'])
  assert.deepEqual(line[0], { pack: 'labour', words: [{ text: '6 cm' }, { text: 'past alert line', tone: 'warn' }] })
})
test('a pack word takes a state colour only: ok, info, warn, danger; anything else is no colour; only that word, never the line', () => {
  assert.deepEqual(tileLineOf(tileLineDefs(), stay({ urgent: true }), ctx(['probe']))[0].words.map((w) => w.tone), [undefined, undefined, 'danger'], 'MAP 62 alone')
  for (const t of ['ok', 'info', 'warn', 'danger']) assert.equal(stateTone(t), t)
  for (const t of ['accent', 'neutral', 'pink', '', undefined, 3]) assert.equal(stateTone(t), undefined, String(t))
  const pink = [{ pack: 'probe', line: () => ({ words: [{ text: 'Ventilated', tone: 'accent' }] }) }] as unknown as Parameters<typeof tileLineOf>[0]
  assert.deepEqual(tileLineOf(pink, stay(), ctx(['probe'])), [{ pack: 'probe', words: [{ text: 'Ventilated' }] }], 'a pack has no colour of its own')
  const whole = [{ pack: 'probe', line: () => ({ words: 'Ventilated d2 · MAP 62', tone: 'danger' }) }] as unknown as Parameters<typeof tileLineOf>[0]
  assert.deepEqual(tileLineOf(whole, stay(), ctx(['probe'])), [{ pack: 'probe', words: [{ text: 'Ventilated d2 · MAP 62' }] }], 'a colour for the whole line is dropped')
  // drawn: the one word in its state colour, the line and the other words plain
  const html = renderToStaticMarkup(createElement(PackLine, { line: [...tileLineOf(tileLineDefs(), stay({ urgent: true }), ctx(['probe'])),
    { pack: 'labour', words: [{ text: '6 cm' }, { text: 'past alert line', tone: 'warn' }] }] }))
  assert.deepEqual([...html.matchAll(/<span class="([^"]*)">([^<]*)<\/span>/g)].filter((m) => /text-(danger|warn|ok|info)/.test(m[1])).map((m) => m[2]), ['MAP 62', 'past alert line'])
  assert.ok(!/<p class="[^"]*text-(danger|warn)/.test(html), 'the line itself takes no state colour')
  assert.match(html, /Ventilated d2/); assert.match(html, /NorAd 0\.15/)
})

test('the buttons: the base\'s first and in the same place — a free bed Admit here; a taken one Move, Discharge, then the probe\'s two', () => {
  assert.deepEqual(labels(tileActions(tileButtonDefs(), free, null, true)), ['Admit here'])
  assert.deepEqual(labels(tileActions(tileButtonDefs(), free, taken(['probe']), true)), ['Move', 'Discharge', 'Obs', 'Wean'])
  assert.deepEqual(tileActions(tileButtonDefs(), free, taken(['probe']), true).map((a) => a.base), [true, true, false, false])
  assert.deepEqual(labels(tileActions(tileButtonDefs(), free, taken([]), true)), ['Move', 'Discharge'], 'not used here: the base\'s only')
  assert.deepEqual(labels(tileActions(tileButtonDefs(), { closed: true }, null, true)), [], 'a closed bed admits nobody')
  const off = (xs: ReturnType<typeof tileActions>) => xs.map((a) => a.base && a.off)
  assert.deepEqual(labels(tileActions(tileButtonDefs(), free, null, false)), ['Admit here'], 'a free bed has no pack buttons')
  assert.deepEqual(off(tileActions(tileButtonDefs(), free, null, false)), [true], 'Admit is for whoever may admit: off for the rest')
  const nurse = tileActions(tileButtonDefs(), free, taken(['probe']), false)
  assert.deepEqual(labels(nurse), ['Move', 'Discharge', 'Obs', 'Wean'], 'without write:admitted the base buttons keep their place')
  assert.deepEqual(off(nurse), [true, true, false, false], 'off for this role; the pack\'s are not')
  assert.deepEqual(off(tileActions(tileButtonDefs(), free, taken(['probe']), true)), [false, false, false, false])
})
test('a stay with no bed here: the packs\' buttons as on a bed (none of the base\'s), only where the department uses the pack', () => {
  const nobed = { row: stay({ place_id: null }), ctx: ctx(['probe']) }
  assert.deepEqual(labels(noBedActions(tileButtonDefs(), nobed, true)), ['Obs', 'Wean'])
  assert.deepEqual(labels(noBedActions(tileButtonDefs(), nobed, false)), ['Obs', 'Wean'])
  assert.deepEqual(labels(noBedActions(tileButtonDefs(), { ...nobed, ctx: ctx([]) }, true)), [], 'not used here')
  assert.deepEqual(labels(noBedActions(tileButtonDefs(), { ...nobed, row: stay({ place_id: null, reason: 'no vent' }) }, true)), ['Obs'], 'show() as on a bed')
})
test('at most two pack buttons on a tile: the department\'s pack order first; show() hides one; a failing show hides it', () => {
  const more = [...tileButtonDefs(), { pack: 'labour', key: 'labour:Partogram', label: 'Partogram', path: () => '/p' }, { pack: 'broken', key: 'broken:X', label: 'X', path: () => '/', show: () => { throw new Error('no') } }]
  assert.deepEqual(labels(tileActions(more, free, taken(['labour', 'probe']), true)), ['Move', 'Discharge', 'Partogram', 'Obs'])
  assert.deepEqual(labels(tileActions(more, free, taken(['probe', 'labour']), true)), ['Move', 'Discharge', 'Obs', 'Wean'])
  assert.deepEqual(labels(tileActions(more, free, taken(['probe', 'labour'], stay({ reason: 'no vent' })), true)), ['Move', 'Discharge', 'Obs', 'Partogram'])
  assert.deepEqual(labels(quiet(() => tileActions(more, free, taken(['broken', 'labour']), true))), ['Move', 'Discharge', 'Partogram'])
})
test('a pack button does its own thing or opens its path, with the row and the tile\'s context', () => {
  const [obs, wean] = tileActions(tileButtonDefs(), free, taken(['probe']), true).filter((a) => !a.base)
  if (obs.base || wean.base) throw new Error('pack buttons')
  obs.def.onClick!(stay(), ctx(['probe'])); assert.deepEqual(clicked, ['s1'])
  assert.equal(wean.def.path!(stay(), ctx(['probe'])), '/visit/s1?at=wean')
})

const order = (more: Partial<OrderRow> = {}) => ({ item: 'o1', patient_id: 'p1', visit_id: 'v1', service_id: 'disp', status: 'in-progress', step_key: 'prepared', ...more }) as OrderRow
const row = (orders: OrderRow[] = [order()]): MarkRow => ({ patient_id: 'p1', visit_id: 'v1', orders })
const mctx = (packs: string[], list: MarkCtx['list'] = 'queue'): MarkCtx => ({ list, dept: { id: 'gp', packs }, org: { services: [{ id: 'disp', reply_type: 'pharmacy.dispense' }, { id: 'cbc', reply_type: 'result' }] } as unknown as MarkCtx['org'] })
test('row marks: the probe\'s mark where the department uses it, one per pack in its pack order; none where it does not', () => {
  assert.deepEqual(marksOf(rowMarkDefs(), row(), mctx(['probe'])), [{ key: 'probe', word: 'On probe', tone: 'warn' }])
  assert.deepEqual(marksOf(rowMarkDefs(), row(), mctx([])), [], 'not used here')
  assert.deepEqual(marksOf(rowMarkDefs(), row([]), mctx(['probe'])), [], 'nothing to say')
  assert.deepEqual(marksOf(rowMarkDefs(), row(), mctx(['probe'], 'bench'))[0].word, 'probe ready', 'the list is in the context')
  const list: MarkDef[] = [...rowMarkDefs(), { pack: 'labour', mark: () => ({ word: 'Labour', tone: 'accent' as never }) }, { pack: 'broken', mark: () => { throw new Error('no') } }]
  assert.deepEqual(quiet(() => marksOf(list, row(), mctx(['labour', 'broken', 'probe']))), [{ key: 'labour', word: 'Labour' }, { key: 'probe', word: 'On probe', tone: 'warn' }])
})
test('a list row as a mark reads it: the queue\'s and the desk\'s visit with its orders; the bench\'s patient with the orders sent here', () => {
  assert.deepEqual(visitMarkRow({ id: 'v1', patient: { id: 'p1' }, orders: [order()] }), row())
  assert.deepEqual(benchMarkRow({ patient: { id: 'p1' }, rows: [{ order: order() }, { order: order({ item: 'o2' }) }] }), { patient_id: 'p1', visit_id: null, orders: [order(), order({ item: 'o2' })] })
})
test('pharmacy\'s mark: a prescription prepared at the pharmacy, on the clinic queue where the department uses the pharmacy', () => {
  assert.deepEqual(collectMark(row(), mctx(['pharmacy'])), { word: 'Rx to collect' })
  assert.deepEqual(collectMark(row([order(), order({ item: 'o2', status: 'active' })]), mctx(['pharmacy'])), { word: '2 Rx to collect' })
  assert.equal(collectMark(row([order({ status: 'completed' })]), mctx(['pharmacy'])), null, 'given')
  assert.equal(collectMark(row([order({ status: 'active', step_key: null })]), mctx(['pharmacy'])), null, 'sent, not started')
  assert.equal(collectMark(row([order({ status: 'on-hold' })]), mctx(['pharmacy'])), null, 'held')
  assert.equal(collectMark(row([order({ service_id: 'cbc' })]), mctx(['pharmacy'])), null, 'a lab\'s step named prepared is not a supply')
  assert.equal(collectMark(row(), mctx(['pharmacy'], 'bench')), null, 'the bench says prepared itself')
  assert.equal(collectMark(row(), mctx(['pharmacy'], 'desk')), null, 'the desk reads no orders (Reception holds no read:bench): none there')
  const ph: MarkDef[] = [{ pack: 'pharmacy', mark: collectMark }]
  assert.deepEqual(marksOf(ph, row(), mctx(['pharmacy'])), [{ key: 'pharmacy', word: 'Rx to collect' }])
  assert.deepEqual(marksOf(ph, row(), mctx(['probe'])), [], 'a department that does not use the pharmacy shows none')
})
test('pharmacy\'s mark follows its own Prepared, whatever the service calls its steps: any step reached, or started with none', () => {
  for (const step_key of ['ready', 'counted', 'packed']) assert.deepEqual(collectMark(row([order({ step_key })]), mctx(['pharmacy'])), { word: 'Rx to collect' }, step_key)
  assert.deepEqual(collectMark(row([order({ status: 'active', step_key: 'checked' })]), mctx(['pharmacy'])), { word: 'Rx to collect' }, 'a step reached, the order still active')
  assert.deepEqual(collectMark(row([order({ step_key: null })]), mctx(['pharmacy'])), { word: 'Rx to collect' }, 'in progress with no step, as the banner\'s "to collect"')
})
console.log(`board: ${n} groups passed`)
