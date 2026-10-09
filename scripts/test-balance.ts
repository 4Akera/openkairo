// Ward nursing's fluid balance, part two (spec/openCare.md §5.6, W2): the words (always signed, thousands apart), the tile's balance
// last on its line (after NEWS2, obs due and any late dose), through the core's one tile line and read (C7), the board's read and the
// record's values as measures, the note under /in and /out (the shift, a urine's span since the last measured urine and its mL/kg/h,
// "low" by age, a check on an odd amount), the fluid chart with its aim carried forward, the section's chip and Summary line, the
// banner's word (rank 3), and the merged read keeping its identity. Pure: no browser, no database.   npm run test:fluids
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { parseIn, parseOut } from '../src/packs/bedside/fluids'
import { balanceToday, chartOf, fluidChip, fluidHas, fluidNotes, fluidSummary, fluidWords, fluidsOf, latestWeight, lowBelow, measuresOfRead, measuresOfValues, mlWords, rateWords,
  signed, withBalanceWord, type FluidsRead, type FluidsStay, type Measure } from '../src/packs/bedside/balance'
import { tileWords, type News2Board } from '../src/packs/bedside/news2'
import { withDueWord, type ObsDue, type ObsDueRead } from '../src/packs/bedside/obsdue'
import { makeWardMerge } from '../src/packs/bedside/wardread'
import { tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import type { Ctx, Parsed } from '../src/core/screens/visit/parse'
import type { SectionInput } from '../src/core/screens/chart/sections'
import type { Identity, Organization, PresenceRow, ScoreTable, ServerEntry, ValueRow } from '../src/core/db/types'
import { E, presence, record, table, val } from './chart-fixtures'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const C = (t: string, day = '2026-10-09') => new Date(`${day}T${t}:00+03:00`).toISOString()
const NOW = Date.parse(C('19:40')); const MORNING = Date.parse(C('08:05', '2026-10-10'))
const NB = ' '
// the picture's day (#ward-fluids), as the board's read sends it
const READ: FluidsStay['measures'] = [{ at: C('08:00'), code: '9187-6', ml: 150 }, { at: C('11:00'), code: '9103-3', ml: 500, method: 'iv' }, { at: C('12:00'), code: '9103-3', ml: 400, method: 'oral' },
  { at: C('14:00'), code: '9187-6', ml: 1250 }, { at: C('16:00'), code: '9103-3', ml: 250, method: 'iv' }, { at: C('17:00'), code: '9103-3', ml: 150, method: 'oral' },
  { at: C('19:40'), code: '9187-6', ml: 900 }]
const MS: Measure[] = READ.map((x) => ({ at: x.at, dir: x.code === '9103-3' ? 'in' : 'out', how: x.method ?? 'urine', ml: x.ml, urine: x.code === '9187-6' }))
const stay = (measures = READ, chart: FluidsStay['chart'] = { at: C('08:30', '2026-10-08') }): FluidsStay => ({ chart, measures })
const row = (more: Partial<PresenceRow> = {}) => presence('st1', { kind: 'stay', state: 'admitted', department_id: 'ward', has_vitals: true, ...more })
const dept = { id: 'ward', packs: ['bedside'] }
const shiftsOrg = (starts: string) => ({ settings: [{ key: 'bedside.shifts', thing_id: 'ward', owner_id: 'ward', data: { starts }, recorded_at: C('08:00') }], settingKeys: [], datatypes: {} }) as unknown as Organization
const due = (min: number): ObsDue => ({ score: 'bedside.news2', version: '2017', total: 6, band: 'medium', at: new Date(NOW + (min - 60) * 60_000).toISOString(), threes: [], level: 'medium', every: 60,
  due_at: new Date(NOW + min * 60_000).toISOString() })
// the record's values: an observation entry (its method in its data) and its value row, as read() returns them
const obs = (at: string, code: string, ml: number, visit = 'st1', method?: string) => { const e = E('observation', { visit_id: visit, occurred_at: at, data: method ? { method } : {} })
  return { e, r: { ...val('value', `loinc:${code}`, ml, at, e), ucum: 'mL' } as ValueRow } }
const weight = (kg: number, at: string) => { const e = E('vitals', { occurred_at: at }); return { e, r: { ...val('weight', 'loinc:29463-7', kg, at, e), ucum: 'kg' } as ValueRow } }
const values = (xs: { e: ServerEntry; r: ValueRow }[]) => table(xs.map((x) => x.r), xs.map((x) => x.e))
const PICTURE = READ.map((x) => obs(x.at, x.code, x.ml, 'st1', x.method))

test('the words: signed with a minus sign, thousands apart by a no-break space; the rate to one decimal, "low" said', () => {
  assert.equal(signed(-850), '−850'); assert.equal(signed(-1000), `−1${NB}000`); assert.equal(signed(400), '+400'); assert.equal(signed(0), '0')
  assert.equal(mlWords(2150), `2${NB}150`); assert.equal(rateWords(0.44), '0.4 mL/kg/h, low')
  // never a figure at the threshold it says it is below; an infant's one decimal kept, its sign on what is shown
  assert.equal(rateWords(0.46), '0.46 mL/kg/h, low'); assert.equal(rateWords(0.97, 1.0), '0.97 mL/kg/h, low'); assert.equal(rateWords(0.5), '0.5 mL/kg/h')
  assert.equal(mlWords(2.5), '2.5'); assert.equal(mlWords(0.4), '0.4'); assert.equal(signed(-2.5), '−2.5'); assert.equal(signed(2.5), '+2.5'); assert.equal(signed(0.01), '0')
  assert.equal(balanceToday(MS, [480, 840, 1200], NOW), -850); assert.equal(balanceToday(MS, [480, 840, 1200], MORNING), null, 'the next morning, nothing new: none')
})
test('the tile: the balance last, after NEWS2, obs due and a late dose; "nothing measured since 08:00"; only an admitted stay with a chart on', () => {
  const data = { fluids: { st1: stay() } }; const bal = { text: 'balance −850 mL' }; const ctx = { org: undefined, dept }
  assert.deepEqual(withBalanceWord({ words: [] }, row(), ctx, data, NOW), { words: [bal] })
  assert.deepEqual(withBalanceWord({ words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: 'obs due 15:06' }] }, row(), ctx, data, NOW),
    { words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: 'obs due 15:06' }, bal] })
  assert.deepEqual(withBalanceWord({ words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: '1 dose late', tone: 'danger' }] }, row(), ctx, data, NOW),
    { words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: '1 dose late', tone: 'danger' }, bal] })
  assert.deepEqual(withBalanceWord(null, row(), ctx, { fluids: { st1: stay([]) } }, NOW), { words: [{ text: 'nothing measured since 08:00' }] })
  assert.deepEqual(withBalanceWord(null, row(), { org: shiftsOrg('07:00 19:00'), dept }, { fluids: { st1: stay([]) } }, NOW), { words: [{ text: 'nothing measured since 07:00' }] })
  const w = { words: ['NEWS2 3'] }
  for (const [r, d] of [[row(), { fluids: {} }], [row({ state: 'discharged' }), data], [row({ kind: 'visit', state: 'with' }), data]] as const) assert.equal(withBalanceWord(w, r, ctx, d, NOW), w)
  assert.deepEqual(withBalanceWord(null, row(), ctx, data, NOW), { words: [bal] })
})
test('through the core (C7): one line, one read — NEWS2, obs overdue, the balance', () => {
  const band = (key: string, min: number, max: number, tone: 'warn' | 'danger' | null) => ({ key, labels: { en: key }, min, max, tone })
  const N1 = { key: 'bedside.news2', version: '2017', layer: 'bedside', labels: { en: 'NEWS2' }, short: 'NEWS2', alias: 'news2', source: 'RCP', coding: null, items: [],
    bands: [band('low', 0, 4, null), band('medium', 5, 6, 'warn'), band('high', 7, 20, 'danger')], retired_at: null, declared_at: C('08:00') } as ScoreTable
  const tile: TileCtx = { dept, place: null, identity: { gender: 'female', birth_date: '1960-05-01' } as Identity, day: 1, can: () => true, org: { scores: [N1], settings: [], settingKeys: [], datatypes: {} } as unknown as Organization }
  const lines = [{ pack: 'bedside', line: (r: PresenceRow, c: TileCtx) => withBalanceWord(withDueWord(tileWords(r, c, c.read, NOW), r, c, c.read, NOW), r, c, c.read, NOW), useRead: () => undefined }]
  const read = { patient_ids: ['pt'], news2: { st1: { score: 'bedside.news2', version: '2017', total: 6, band: 'medium', at: C('18:00') } }, obs: { st1: due(-20) }, fluids: { st1: stay() } }
  assert.deepEqual(tileLineOf(lines, row(), tile, { bedside: read }),
    [{ pack: 'bedside', words: [{ text: 'NEWS2 6', tone: 'warn' }, { text: 'obs overdue 20 min', tone: 'warn' }, { text: 'balance −850 mL' }] }])
  assert.deepEqual(tileLineOf(lines, row({ has_vitals: false, checked_in_at: C('19:00') }), tile), [{ pack: 'bedside', words: [{ text: 'no obs yet' }] }], 'before the board answers: piece 1\'s words')
})
test('the board\'s fluids: malformed, none; another code is not a measure', () => {
  const good = stay()
  for (const d of [undefined, null, 'x', { fluids: null }, { fluids: { other: good } }, { fluids: { st1: { measures: [] } } }, { fluids: { st1: { chart: { at: C('08:00') }, measures: 'x' } } }])
    assert.equal(fluidsOf(d, 'st1'), undefined, JSON.stringify(d))
  assert.equal(fluidsOf({ fluids: { st1: good } }, 'st1'), good)
  assert.deepEqual(measuresOfRead(stay([{ at: C('09:00'), code: '8478-0', ml: 80 }, { at: C('10:00'), code: '9257-7', ml: 50, method: 'drain' }])),
    [{ at: C('10:00'), dir: 'out', how: 'drain', ml: 50, urine: false }])
})
test('the record\'s values as a stay\'s measures: the method from the entry, in time order; the weight', () => {
  const t = values([obs(C('12:00'), '9187-6', 400), obs(C('09:00'), '9103-3', 500, 'st1', 'oral'), obs(C('10:00'), '9257-7', 50, 'st1', 'drain'), weight(68, C('08:00')),
    obs(C('11:00'), '9187-6', 300, 'st0')])
  assert.deepEqual(measuresOfValues(t, 'st1').map((x) => [x.how, x.ml]), [['oral', 500], ['drain', 50], ['urine', 400]])
  assert.deepEqual(latestWeight([weight(68, C('08:00', '2026-10-08')).r, weight(70, C('08:00')).r]), { kg: 70, at: C('08:00') }, 'the latest weight')
  assert.deepEqual(measuresOfValues(undefined, 'st1'), [])
})
const noteCtx = (rows: ValueRow[], born?: string) => ({ departmentId: 'ward', org: undefined, record: { values: rows, ...(born ? { patient: { born_on: born } } : {}) } }) as unknown as Pick<Ctx, 'record' | 'org' | 'departmentId'>
const items = (r: ReturnType<typeof parseOut>): Parsed[] => (r && 'ok' in r ? r.ok : [])
test('the note under /in and /out: the shift; a urine\'s span and mL/kg/h; no weight; none before; an odd amount', () => {
  const u14 = obs(C('14:00'), '9187-6', 1250).r; const w82 = weight(82, C('08:00', '2026-10-08')).r; const last = ', since the last measured urine'
  assert.deepEqual(fluidNotes(items(parseOut('urine 900')), noteCtx([u14, w82]), NOW), [{ text: `Urine 900 mL · 14:00–19:40, since the last measured urine · 1.9 mL/kg/h at 82 kg · counts in 14–20` }])
  assert.deepEqual(fluidNotes(items(parseOut('urine 900')), noteCtx([u14]), NOW), [{ text: 'Urine 900 mL · 14:00–19:40, since the last measured urine · no weight: /v with the weight gives mL/kg/h · counts in 14–20' }])
  assert.deepEqual(fluidNotes(items(parseOut('urine 900')), noteCtx([w82]), NOW), [{ text: 'Urine 900 mL · the first measured urine in 24 h: no rate · counts in 14–20' }])
  assert.ok(fluidNotes(items(parseOut('urine 900')), noteCtx([u14, w82]), NOW)[0].text.includes(last))
  assert.deepEqual(fluidNotes(items(parseOut('urine 100')), noteCtx([u14, w82]), NOW), [{ text: 'Urine 100 mL · 14:00–19:40, since the last measured urine · 0.2 mL/kg/h, low at 82 kg · counts in 14–20', tone: 'warn' }])
  assert.deepEqual(fluidNotes(items(parseOut('urine 900')), noteCtx([obs(C('14:00'), '9187-6', 1250, 'er').r, w82]), NOW)[0].text,
    'Urine 900 mL · 14:00–19:40, since the last measured urine · 1.9 mL/kg/h at 82 kg · counts in 14–20', 'the previous urine in an earlier stay')
  assert.deepEqual(fluidNotes(items(parseOut('urine 900')), noteCtx([{ ...obs(C('14:00'), '9188-4', 40, 'icu').r, ucum: 'mL/h' }, w82]), NOW)[0].text,
    'Urine 900 mL · 14:00–19:40, since the last measured urine · 1.9 mL/kg/h at 82 kg · counts in 14–20', 'the ICU\'s hourly urine at 14:00')
  assert.deepEqual(fluidNotes(items(parseOut('urine 0')), noteCtx([u14, w82]), NOW), [{ text: 'Urine 0 mL · 14:00–19:40, since the last measured urine · 0.0 mL/kg/h, low at 82 kg · counts in 14–20', tone: 'warn' }])
  assert.deepEqual(fluidNotes(items(parseOut('drain 6500')), noteCtx([]), NOW), [{ text: `Fluid out · drain 6500 mL · 6${NB}500 mL — check the number · counts in 14–20` }])
  assert.deepEqual(fluidNotes(items(parseOut('2 stools')), noteCtx([]), NOW), [{ text: 'Fluid out · stool 2 mL · a count? /out stool 200 · counts in 14–20' }])
  assert.deepEqual(fluidNotes(items(parseIn('250 iv')), noteCtx([]), NOW), [{ text: 'Fluid in · IV 250 mL · counts in 14–20' }])
  // a weight older than a week is dated in the note (a child's old weight overstates the rate); a recent one is not
  const old = fluidNotes(items(parseOut('urine 900')), noteCtx([u14, weight(82, C('08:00', '2026-09-09')).r]), NOW)[0].text
  assert.ok(old.includes('at 82 kg (weighed '), old); assert.ok(!fluidNotes(items(parseOut('urine 900')), noteCtx([u14, w82]), NOW)[0].text.includes('weighed'))
  assert.deepEqual(fluidNotes([{ function: 'vitals', kind: 'v', params: {}, line: 'BP 120/80' }], noteCtx([]), NOW), [])
})
// a fluid chart entry in a stay, newest first in own
const ch = (at: string, data: Record<string, unknown>, visit = 'st1') => E('bedside.fluid_chart', { visit_id: visit, occurred_at: at, recorded_at: at, data })
const own = (...es: ServerEntry[]) => ({ shown: es, hidden: [] })
// the clinic: the ward's Screens line holds Obs due (or not), its shifts saved (or the default)
const wardOrg = (screens = ['base.beds', 'bedside.obs'], starts?: string) => ({ ...(starts ? shiftsOrg(starts) : { settings: [], settingKeys: [], datatypes: {} }),
  departments: [{ id: 'ward', screens }, { id: 'im', screens: ['base.visits'] }] }) as unknown as Organization
const input = (es: ServerEntry[], vals = PICTURE, open = true, org = wardOrg(), departmentId = 'ward'): SectionInput => ({
  rec: record({ 'base.presence': table([row(open ? {} : { state: 'discharged' })]), 'base.values': values(vals) }),
  ctx: { org, me: 'rn', departmentId }, identity: { gender: 'female', birth_date: '1960-05-01' } as Identity, own: own(...es) })
test('the chart, its section and the banner: on by its latest entry, the aim carried forward until a stop', () => {
  const st1 = [ch(C('12:00'), { status: 'stopped' }), ch(C('08:30'), { status: 'active', target: { value: '-1000', unit: 'mL', ucum: 'mL' } })]
  const both = own(...st1, ch(C('09:00'), { status: 'active' }, 'st2'))
  assert.equal(chartOf(both, 'st1')!.active, false); assert.equal(chartOf(both, 'st2')!.active, true); assert.equal(chartOf(both, undefined), null)
  const aim = { status: 'active', target: { value: '-1000', unit: 'mL', ucum: 'mL' } }
  assert.deepEqual([chartOf(own(ch(C('10:00'), { status: 'active' }), ch(C('08:30'), aim)), 'st1')].map((c) => [c!.target, c!.at]), [[-1000, C('08:30')]])
  assert.equal(chartOf(own(ch(C('10:00'), { status: 'active', no_target: true }), ch(C('08:30'), aim)), 'st1')!.target, null)
  const after = chartOf(own(ch(C('10:00'), { status: 'active' }), ch(C('09:00'), { status: 'stopped' }), ch(C('08:30'), aim)), 'st1')!
  assert.deepEqual([after.target, after.at], [null, C('10:00')], 'a stop ends the aim and the run')
  const on = [ch(C('08:30'), aim)]; const nothing = PICTURE.slice(0, 1)   // only the 08:00 urine, yesterday's fluid day
  assert.deepEqual(fluidWords(input(on), NOW), [{ word: 'balance −850 since 08:00', rank: 3 }])
  assert.deepEqual(fluidWords(input(on, nothing), NOW), [{ word: 'nothing measured since 08:00', rank: 3 }])
  assert.deepEqual(fluidWords(input([ch(C('19:00'), { status: 'stopped' }), ...on]), NOW), [])
  assert.deepEqual(fluidWords(input(on, PICTURE, false), NOW), [], 'no stay open')
  assert.equal(fluidSummary(input(on), NOW), `balance −850 mL since 08:00 · balance aim −1${NB}000 mL`)
  assert.equal(fluidSummary(input([ch(C('08:30'), { status: 'active' })]), NOW), 'balance −850 mL since 08:00 · no balance aim')
  assert.equal(fluidSummary(input(on, nothing), NOW), `nothing measured since 08:00 · balance aim −1${NB}000 mL`)
  assert.deepEqual(fluidChip(input(on), NOW), { word: '−850 mL' }); assert.deepEqual(fluidChip(input(on, nothing), NOW), { word: 'nothing measured' })
  assert.deepEqual(fluidChip(input([ch(C('19:00'), { status: 'stopped' }), ...on]), NOW), { word: 'stopped' })
  assert.equal(fluidHas(input([])), true, 'measures and no chart'); assert.equal(fluidHas(input([], [])), false, 'neither')
  // only on a ward: a stay whose department's line has no Obs due (an ICU, an ER) gets no ward balance
  const icu = wardOrg(['base.beds'])
  assert.deepEqual(fluidWords(input(on, PICTURE, true, icu), NOW), []); assert.equal(fluidChip(input(on, PICTURE, true, icu), NOW), null)
  assert.equal(fluidSummary(input(on, PICTURE, true, icu), NOW), null); assert.equal(fluidHas(input(on, PICTURE, true, icu)), false)
  // the stay's ward's shifts, whoever reads: a doctor from Internal Medicine sees the ward's day, as the board does
  const seven = wardOrg(undefined, '07:00 19:00')
  assert.equal(fluidSummary(input(on, PICTURE.slice(0, 1), true, seven, 'im'), NOW), `balance −150 mL since 07:00 · balance aim −1${NB}000 mL`)
})
test('a child\'s low urine: below 1.0 mL/kg/h under 12 years, 0.5 from 12', () => {
  const d = C('12:00')
  assert.equal(lowBelow('2020-01-01', d), 1.0); assert.equal(lowBelow('2014-10-09', d), 0.5, '12 today'); assert.equal(lowBelow('2014-10-10', d), 1.0); assert.equal(lowBelow(null, d), 0.5)
  assert.equal(rateWords(0.8, 1.0), '0.8 mL/kg/h, low'); assert.equal(rateWords(0.8), '0.8 mL/kg/h')
  // 0.8 mL/kg/h: 20 kg over 5 h since 14:40 is 80 mL
  const prior = [obs(C('14:40'), '9187-6', 100).r, weight(20, C('08:00')).r]
  const kid = fluidNotes(items(parseOut('urine 80')), noteCtx(prior, '2020-01-01'), NOW)[0]
  assert.ok(kid.text.includes('0.8 mL/kg/h, low')); assert.equal(kid.tone, 'warn')
  const adult = fluidNotes(items(parseOut('urine 80')), noteCtx(prior, '1960-01-01'), NOW)[0]
  assert.ok(adult.text.includes('0.8 mL/kg/h at')); assert.equal(adult.tone, undefined)
})
test('the merged read keeps its identity (C7): the same object while the three answers are the same', () => {
  const m = makeWardMerge(); const b: News2Board = { patient_ids: ['pt'], news2: {} }; const o: ObsDueRead = { patient_ids: ['pt'], stays: { st1: due(10) } }
  const f: FluidsRead = { patient_ids: ['pt'], stays: { st1: stay() } }
  const one = m(b, o, f); assert.equal(m(b, o, f), one)
  assert.notEqual(m(b, { ...o }, f), one, 'a new obs due answer: a new object')
  assert.equal(m(null, o, f), null); assert.equal(m(undefined, o, f), undefined)
  const bare = m(b, undefined, f)!; assert.ok(!('obs' in bare)); assert.equal(bare.news2, b.news2)
  const all = m(b, o, f)!; assert.equal(all.fluids, f.stays); assert.equal(all.obs, o.stays)
})
console.log(`balance: ${n} groups passed`)
