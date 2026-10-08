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
import { ListRow } from '../src/core/ui/patient'
import { readFileSync } from 'node:fs'
import { anywayCalls, byWord, chargesHere, chartRowOf, chartWait, dueLines, dueTotal, freeRows, goAhead, isStop, packRowOf, reasonReady, registerRowAction, registerSoftCheck,
  rowActionDefs, rowButtonsOf, rowsKey, softCheckDefs, waitsOf, waitWords, type Anyway, type DueLine, type RowActionDef, type RowCtx, type SoftCheckDef } from '../src/core/screens/rows'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const testAsync = async (name: string, fn: () => Promise<void>) => { try { await fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
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

// ── spec §5.4 (owner, 2026-10-08): a pack's row action (a), the lines a screen hands (b), a soft check (c), a pack that charges (d) ──
const rctx = (packs: string[], more: Partial<RowCtx> = {}): RowCtx => ({ list: 'bench', dept: { id: 'lab', name: 'Laboratory', packs, declared: {} }, can: () => true, ...more })
const prow = (orders: OrderRow[] = [order({ item: 'o1' }), order({ item: 'o2' })], lines?: DueLine[]) => packRowOf('p1', { patient_id: 'p1', visit_id: null, orders }, lines)
const Card = () => null
test('row actions: one a pack, never the core\'s or the base\'s; a button and a card', () => {
  assert.equal(registerRowAction('probe', { load: async () => ({}), Card,
    button: (r, c, data) => !c.can('write:probe') ? null : r.lines?.length ? 'Send to cashier' : (data as { owes?: boolean } | undefined)?.owes ? 'Pay' : null }), true)
  quiet(() => {
    assert.equal(registerRowAction('probe', { button: () => 'Again', Card }), false, 'one a pack')
    assert.equal(registerRowAction('base', { button: () => 'Pay', Card }), false); assert.equal(registerRowAction('core', { button: () => 'Pay', Card }), false)
    assert.equal(registerRowAction('other', { button: () => 'Pay' } as never), false, 'a card to fold out')
  })
  assert.equal(rowActionDefs().filter((d) => d.pack === 'probe').length, 1)
})
test('row actions: only the packs the department uses, in its pack order, one each; loading, failing or wordless says nothing', () => {
  assert.deepEqual(rowButtonsOf(rowActionDefs(), prow(), rctx(['probe']), { probe: { owes: true } }), [{ pack: 'probe', label: 'Pay' }])
  assert.deepEqual(rowButtonsOf(rowActionDefs(), prow(), rctx([]), { probe: { owes: true } }), [], 'not used here')
  assert.deepEqual(rowButtonsOf(rowActionDefs(), prow(), rctx(['probe']), {}), [], 'its data not here yet (loading, or failed): nothing')
  assert.deepEqual(rowButtonsOf(rowActionDefs(), prow(), rctx(['probe']), { probe: {} }), [], 'nothing to pay: no button')
  assert.deepEqual(rowButtonsOf(rowActionDefs(), prow(), rctx(['probe'], { can: () => false }), { probe: { owes: true } }), [], 'nor for a role that may not')
  const more: RowActionDef[] = [...rowActionDefs(), { pack: 'till', button: () => '  Pay  here ', Card }, { pack: 'broken', button: () => { throw new Error('no') }, Card },
    { pack: 'blank', button: () => '   ', Card }]
  assert.deepEqual(quiet(() => rowButtonsOf(more, prow(), rctx(['broken', 'till', 'blank', 'probe']), { probe: { owes: true } })), [{ pack: 'till', label: 'Pay here' }, { pack: 'probe', label: 'Pay' }])
  assert.deepEqual(rowButtonsOf(more, prow(), rctx(['probe', 'till']), { probe: { owes: true } }).map((b) => b.pack), ['probe', 'till'], 'the department\'s pack order')
})
test('lines due: a name, a quantity, an amount — plain numbers to the hundredth, the order where there is one; anything else is dropped', () => {
  const handed = [{ name: ' Augmentin 1 g ·  box ', quantity: 1, amount: 145, order: 'o1' }, { name: 'Nexium 40 · strip', quantity: 2, amount: 95.005 },
    { name: '', quantity: 1, amount: 1 }, { name: 'free', quantity: 1, amount: 0 }, { name: 'x', quantity: 0, amount: 3 }, { name: 'y', quantity: 1, amount: -1 },
    { name: 'z', quantity: 1, amount: '12' }, { name: 'w', quantity: Number.NaN, amount: 1 }, null, 'EGP 12']
  assert.deepEqual(dueLines(handed), [{ name: 'Augmentin 1 g · box', quantity: 1, amount: 145, order: 'o1' }, { name: 'Nexium 40 · strip', quantity: 2, amount: 95.01 }, { name: 'free', quantity: 1, amount: 0 }])
  assert.equal(dueTotal(dueLines(handed)), 240.01); assert.equal(dueTotal([]), 0)
  assert.deepEqual(dueLines(undefined), [])
  const r = prow([order()], dueLines(handed)); assert.equal(r.lines?.length, 3, 'a row carries them for a row action to read')
  assert.ok(!('lines' in prow([order()], [])), 'a row with none carries none')
  assert.deepEqual(rowButtonsOf(rowActionDefs(), r, rctx(['probe']), { probe: {} }), [{ pack: 'probe', label: 'Send to cashier' }], 'the row action reads them')
})
test('the words of the row are kept beside the packs\' buttons: who (the doctor on a Back row), the card folded out under the row', () => {
  const html = renderToStaticMarkup(createElement(ListRow, { number: 7, name: 'Nadia Kamel', age: '34 F', status: 'back', who: 'Dr. Ali Hassan',
    extra: createElement('button', null, 'Pay'), below: createElement('div', null, 'the payment card') }))
  assert.match(html, /Dr\. Ali Hassan/, 'the doctor\'s name stays'); assert.match(html, /<button>Pay<\/button>/)
  assert.ok(html.indexOf('Dr. Ali Hassan') < html.indexOf('>Pay<'), 'after the row\'s own words'); assert.match(html, /the payment card<\/div><\/li>$/, 'inline, under the row')
  const own = renderToStaticMarkup(createElement(ListRow, { number: 7, name: 'Nadia Kamel', age: '34 F', who: 'Laboratory', actions: createElement('button', null, 'Collect'), extra: createElement('button', null, 'Pay') }))
  assert.match(own, /Collect<\/button><button>Pay/, 'the row\'s own actions first, then the pack\'s')
  assert.doesNotMatch(renderToStaticMarkup(createElement(ListRow, { number: 7, name: 'N', age: '1', who: 'Dr. Ali' })), /<button/, 'no pack: nothing added')
})

const recorded: Anyway[] = []
test('soft checks: one a pack, never the core\'s or the base\'s; waiting and anyway', () => {
  assert.equal(registerSoftCheck('probe', { load: async () => ({}), anyway: async (a) => { recorded.push(a) },
    waiting: (r, _c, data) => ((data as { due?: string[] } | undefined)?.due ?? []).map((o) => ({ order: o, word: 'Waiting for payment', tone: 'warn' as const })) }), true)
  quiet(() => {
    assert.equal(registerSoftCheck('probe', { waiting: () => [], anyway: () => {} }), false, 'one a pack')
    assert.equal(registerSoftCheck('base', { waiting: () => [], anyway: () => {} }), false)
    assert.equal(registerSoftCheck('other', { waiting: () => [] } as never), false, 'it records going ahead')
  })
  assert.equal(softCheckDefs().filter((d) => d.pack === 'probe').length, 1)
})
test('soft checks mark single orders: only orders on the row, from packs used here, in pack order; a word, a state tone, never a number', () => {
  const w = waitsOf(softCheckDefs(), prow(), rctx(['probe']), { probe: { due: ['o2', 'elsewhere'] } })
  assert.deepEqual([...w], [['o2', { word: 'Waiting for payment', tone: 'warn', packs: ['probe'] }]], 'o2 waits; an order not on the row is ignored')
  assert.equal(waitsOf(softCheckDefs(), prow(), rctx([]), { probe: { due: ['o2'] } }).size, 0, 'not used here: nothing waits')
  assert.equal(waitsOf(softCheckDefs(), prow(), rctx(['probe']), {}).size, 0, 'its data not here (loading, failed): nothing waits')
  const more: SoftCheckDef[] = [...softCheckDefs(), { pack: 'cover', waiting: () => [{ order: 'o2', word: 'Waiting for approval · Misr Insurance', tone: 'accent' as never },
      { order: 'o1', word: 'Pay 120 first' }, { order: 'o1', word: '  ' }], anyway: () => {} },
    { pack: 'broken', waiting: () => { throw new Error('no') }, anyway: () => {} }]
  const both = quiet(() => waitsOf(more, prow(), rctx(['broken', 'cover', 'probe']), { probe: { due: ['o2'] } }))
  assert.deepEqual([...both], [['o2', { word: 'Waiting for approval · Misr Insurance', packs: ['cover', 'probe'] }]],
    'the first pack\'s word (no colour but a state\'s), every pack holding it; a word with a number, or none, is dropped; a failing pack says nothing')
})
test('per order: the free ones stay workable, the waiting ones go to their word\'s view; going ahead frees them', () => {
  const rows = [{ order: order({ item: 'o1' }) }, { order: order({ item: 'o2' }) }, { order: order({ item: 'o3' }) }]
  const w = waitsOf(softCheckDefs(), prow(rows.map((r) => r.order)), rctx(['probe']), { probe: { due: ['o2', 'o3'] } })
  assert.deepEqual(freeRows(rows, w, new Set()).map((r) => r.order.item), ['o1'], 'To do keeps the free one: the row opens with it')
  assert.deepEqual(byWord(rows, w, new Set()).map((g) => [g.word, g.tone, g.rows.map((r) => r.order.item)]), [['Waiting for payment', 'warn', ['o2', 'o3']]], 'a view named by its word')
  assert.deepEqual(freeRows(rows, w, new Set(['o2'])).map((r) => r.order.item), ['o1', 'o2'], 'gone ahead anyway: free')
  assert.deepEqual(byWord(rows, w, new Set(['o2', 'o3'])), [])
  assert.deepEqual(waitWords(['o1', 'o2', 'o3'], w, new Set()), [{ word: 'Waiting for payment', tone: 'warn' }], 'the row says it once')
  assert.deepEqual(waitWords(['o1'], w, new Set()), [], 'a free order says nothing')
})
await testAsync('…anyway: a reason is required, one line; each pack holding an order records it for its own orders only', async () => {
  assert.equal(reasonReady(''), false); assert.equal(reasonReady('   '), false); assert.equal(reasonReady('Emergency'), true); assert.equal(reasonReady('x'.repeat(201)), false)
  const w = waitsOf([...softCheckDefs(), { pack: 'cover', waiting: () => [{ order: 'o1', word: 'Waiting for approval' }], anyway: (a) => { recorded.push({ ...a, reason: `cover: ${a.reason}` }) } }],
    prow(), rctx(['probe', 'cover']), { probe: { due: ['o2'] } })
  assert.deepEqual(anywayCalls(['o1', 'o2'], w), [{ pack: 'cover', orders: ['o1'] }, { pack: 'probe', orders: ['o2'] }])
  const defs: SoftCheckDef[] = [...softCheckDefs(), { pack: 'cover', waiting: () => [], anyway: (a) => { recorded.push({ ...a, reason: `cover: ${a.reason}` }) } }]
  await assert.rejects(goAhead(defs, prow(), ['o2'], '  ', w, rctx(['probe'])), /why/, 'no reason, nothing recorded')
  assert.equal(recorded.length, 0)
  assert.deepEqual(await goAhead(defs, prow(), ['o1', 'o2'], '  patient will pay   after ', w, rctx(['probe', 'cover'])), ['o1', 'o2'])
  assert.deepEqual(recorded.map((a) => [a.orders, a.reason]), [[['o1'], 'cover: patient will pay after'], [['o2'], 'patient will pay after']])
})
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
test('a stop is never greyed: what a form writes on a waiting order counts only when it is a stop (not done, not given, declined)', () => {
  assert.equal(isStop({ type: 'pharmacy.dispense', data: { status: 'cancelled', reason: 'Patient declined' } }), true)
  assert.equal(isStop({ type: 'step', data: { status: 'failed', reason: 'haemolysed' } }), true); assert.equal(isStop({ data: { status: 'rejected' } }), true)
  assert.equal(isStop({ type: 'pharmacy.dispense', data: { status: 'completed' } }), false, 'given: waits'); assert.equal(isStop({ data: { status: 'in-progress' } }), false)
  assert.equal(isStop(null), false); assert.equal(isStop({}), false)
})
test('the wait wiring on the pages (spec §5.4, core change (c)): the bench\'s patient page and the page that answers one request', () => {
  const bp = src('src/core/screens/bench/BenchPatient.tsx')
  assert.match(bp, /return !!w && \(free\(r\) \|\| isStop\(w\)\)/, 'a pack\'s form on a waiting order is ready only with a stop')
  assert.match(bp, /disabled=\{held && !x\.notDone && !formOf\(r\)\}/, 'its form stays open (Not given can be chosen); the base\'s grid is greyed until not done')
  assert.match(bp, /x\.notDone \? !!x\.reason\.trim\(\) : free\(r\)/, 'not done works on a waiting order; a result does not')
  assert.match(bp, /held && can\('read:bench'\) && packs\.anyway\(or, \[r\.order\.item\], 'Go ahead'\)/,
    'Go ahead anyway… on the order, for anyone working the bench (read:bench there; owner, 2026-10-08)')
  assert.doesNotMatch(bp, /mayWork/, 'no longer narrowed to whoever may do the work')
  const bench = src('src/core/screens/bench/Bench.tsx')
  assert.match(bench, /const ahead = can\('read:bench'\) && packs\.anyway\(pr, waiting\.map\(\(r\) => r\.order\.item\), 'Go ahead'\)/, 'the bench\'s row: the same')
  assert.doesNotMatch(bench, /mayWork/)
  const collect = src('src/packs/lis/Collect.tsx'); const receive = src('src/packs/lis/Receive.tsx')
  assert.match(collect, /can\('read:bench'\) && packs\.anyway\(pr, hold\.map\(\(r\) => r\.order\.item\), 'Collect'\)/, 'Collect anyway…: anyone working the bench, not only who collects')
  assert.match(receive, /can\('read:bench'\) && packs\.anyway\(pr, hold\.map\(\(r\) => r\.order\.item\), 'Receive'\)/, 'Receive anyway…: the same')
  const rq = src('src/core/screens/Request.tsx')
  assert.match(rq, /disabled=\{w\.isPending \|\| \(notDone && !reason\.trim\(\)\) \|\| \(!!wait && !notDone\)\}/, 'Release greyed while it waits, unless not done')
  assert.match(rq, /disabled=\{!!wait\} title=\{wait\?\.word\} onClick=\{\(\) => step\('in-progress'\)\}>Start/, 'Start greyed with the word')
  assert.match(rq, /packs\.anyway\(prow, \[row!\.order\.item\], 'Answer'\)/, 'Answer anyway…, for whoever may answer')
  assert.match(rq, /<CancelButton onCancel=\{\(why\) => step\('rejected', why\)\} \/>/, 'Decline (a stop) is never greyed')
  assert.doesNotMatch(src('src/core/screens/chart/blocks/Orders.tsx'), /softCheck|useRowWaits/, 'the chart draws no soft-check card, button or …anyway: only words (c on the chart, owner 2026-10-08; l, §5.7)')
  assert.match(src('src/core/screens/chart/blocks/Orders.tsx'), /useOrderWords\('chart'/, 'only a pack\'s words on an order\'s line: core change (l), approved for the chart (§5.7)')
  assert.doesNotMatch(src('src/core/screens/useRows.tsx'), /refetchInterval/, 'the packs\' data is read on hints and changes, never on a timer (a list left open logs no reads)')
})
test('the doctor\'s chart (owner, 2026-10-08, (c) extended to the order\'s line): one row of the record\'s open orders; nothing open, nothing asked', () => {
  const os = [order({ item: 'o1' }), order({ item: 'o2', status: 'completed' }), order({ item: 'o3', status: 'on-hold' }), order({ item: 'o4', status: 'revoked' }),
    order({ item: 'o5', status: 'in-progress' }), order({ item: 'o6', status: 'cancelled' })]
  const rows = chartRowOf('pt', os)
  assert.equal(rows.length, 1); assert.equal(rows[0].key, 'chart pt'); assert.deepEqual(rows[0].orders.map((o) => o.item), ['o1', 'o3', 'o5'], 'sent, held, started: open')
  assert.ok(!('lines' in rows[0]), 'the chart hands no lines: it prices nothing')
  assert.deepEqual(chartRowOf('pt', os.filter((o) => o.item === 'o2' || o.item === 'o4')), [], 'none open: no row, so no pack is asked')
  assert.deepEqual(chartRowOf('pt', undefined), [], 'the record not read: nothing')
})
test('on the chart, the word follows the hook\'s rules: only where the reader\'s department uses the pack, an open order on the row, a word and a state tone, never a number', () => {
  const row = chartRowOf('pt', [order({ item: 'o1' }), order({ item: 'o3', status: 'on-hold' })])[0]
  const chart = (packs: string[]) => rctx(packs, { list: 'chart', dept: { id: 'gp', name: 'General Practice', packs, declared: {} } })
  const w = waitsOf(softCheckDefs(), row, chart(['probe']), { probe: { due: ['o1', 'o2'] } })
  assert.deepEqual([...w.keys()], ['o1'], 'an order not on the chart\'s row is never answered')
  assert.deepEqual(chartWait('o1', 'active', w, new Set()), { word: 'Waiting for payment', tone: 'warn', packs: ['probe'] }, 'the word and its tone')
  assert.equal(waitsOf(softCheckDefs(), row, chart([]), { probe: { due: ['o1'] } }).size, 0, 'the reader\'s department does not use the pack: no word')
  assert.equal(chartWait('o1', 'completed', w, new Set()), null, 'answered: no word')
  assert.equal(chartWait('o1', 'revoked', w, new Set()), null, 'stopped: no word')
  assert.equal(chartWait('o1', 'active', w, new Set(['o1'])), null, 'gone ahead anyway: no word')
  assert.equal(chartWait('o3', 'on-hold', w, new Set()), null, 'held by nobody: no word')
  const more: SoftCheckDef[] = [{ pack: 'cover', waiting: () => [{ order: 'o3', word: 'Pay 120 first' }, { order: 'o1', word: 'Waiting for approval · Misr Insurance', tone: 'warn' }], anyway: () => {} }]
  const w2 = waitsOf(more, row, chart(['cover']), { cover: {} })
  assert.equal(chartWait('o3', 'on-hold', w2, new Set()), null, 'a word with a number never reaches the chart')
  assert.equal(chartWait('o1', 'active', w2, new Set())?.word, 'Waiting for approval · Misr Insurance')
})
test('the chart\'s wiring: one live read a chart (the center), its word and tone on the order\'s line and the prescription\'s, never a button, a card or …anyway', () => {
  const pane = src('src/core/screens/chart/center/EncounterPane.tsx'); const rowsTsx = src('src/core/screens/useRows.tsx')
  assert.match(pane, /useOrderWaits\(useMemo\(\(\) => chartRowOf\(c\.patientId, orders\), \[c\.patientId, orders\]\)\)/, 'the record\'s open orders, read once for the center')
  assert.match(pane, /tables: c\.r\.server\.tables, waitOf,/, 'handed to the blocks')
  assert.match(rowsTsx, /list === 'chart' \? \[\] : rowActionDefs\(\)/, 'on the chart no row action is asked, so none loads or draws')
  assert.match(rowsTsx, /export function useOrderWaits\(rows: PackRow\[\]\)[^]*usePackData\('chart', rows, null\)/, 'the reader\'s department, as on a list')
  const orders = src('src/core/screens/chart/blocks/Orders.tsx'); const rx = src('src/core/screens/chart/blocks/Prescription.tsx')
  assert.match(orders, /const wait = row \? env\.waitOf\?\.\(row\.item, row\.status\) \?\? null : null/)
  assert.match(orders, /\{wait && <p className="text-13"><Tag tone=\{wait\.tone \?\? 'warn'\}>\{wait\.word\}<\/Tag><\/p>\}/, 'the word in its tone, alone')
  assert.match(rx, /const wait = env\.waitOf\?\.\(row\.item, row\.status\) \?\? null/)
  assert.match(rx, /\{wait && <Tag tone=\{wait\.tone \?\? 'warn'\}>\{wait\.word\}<\/Tag>\}/, 'and on the prescription\'s line, beside where it was sent')
  for (const f of [orders, rx]) assert.doesNotMatch(f, /anyway|usePackRows|\.buttons\(|\.below\(/, 'no …anyway, no pack button or card')
})
test('a pack that charges (core change (d)): asked of the department without naming the pack; only a pack used there counts', () => {
  assert.equal(chargesHere({ packs: ['pharmacy', 'till'], declared: { pharmacy: { charges: false }, till: { charges: true } } }), true)
  assert.equal(chargesHere({ packs: ['pharmacy'], declared: { pharmacy: { charges: false }, till: { charges: true } } }), false, 'declared, not used here')
  assert.equal(chargesHere({ packs: ['pharmacy'] }), false); assert.equal(chargesHere(null), false)
})
test('a list\'s pack data is read once for its patients and orders, whatever their order', () => {
  const a = [prow([order({ item: 'o1' })]), packRowOf('p2', { patient_id: 'p2', visit_id: null, orders: [order({ item: 'o9', patient_id: 'p2' })] })]
  assert.equal(rowsKey(a), rowsKey([...a].reverse())); assert.notEqual(rowsKey(a), rowsKey(a.slice(0, 1)))
})
console.log(`board: ${n} groups passed`)
