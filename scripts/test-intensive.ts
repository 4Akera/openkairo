// Critical care (spec/openCare.md §5.6), piece I1: the ICU's words on each bed's tile from the board's one read (the owner's C1): the
// airway, one infusion, the MAP and a low urine, in that order. Pure: no browser, no database.   npm run test:intensive
import assert from 'node:assert/strict'
import { setClinicTimeZone, hm } from '../src/core/ui/time'
import { tileWords, type IcuBoard, type StayWords } from '../src/packs/intensive/board'
import { registerTileLine, tileLineDefs, tileLineOf, type TileCtx } from '../src/core/screens/ward/tiles'
import { presence } from './chart-fixtures'
import type { Organization, PresenceRow } from '../src/core/db/types'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }

// the ICU's setting as its starter setup writes it
const INFUSIONS = [
  { key: 'noradrenaline', name: 'Noradrenaline', short: 'noradrenaline', kind: 'vasopressor', dose_unit: 'ug/kg/min', amount: 4, amount_unit: 'mg', volume: 50 },
  { key: 'adrenaline', name: 'Adrenaline', short: 'adrenaline', kind: 'vasopressor', dose_unit: 'ug/kg/min', amount: 4, amount_unit: 'mg', volume: 50 },
  { key: 'dopamine', name: 'Dopamine', short: 'dopamine', kind: 'vasopressor', dose_unit: 'ug/kg/min', amount: 200, amount_unit: 'mg', volume: 50 },
  { key: 'dobutamine', name: 'Dobutamine', short: 'dobutamine', kind: 'inotrope', dose_unit: 'ug/kg/min', amount: 250, amount_unit: 'mg', volume: 50 },
  { key: 'propofol', name: 'Propofol 1%', short: 'propofol', kind: 'sedative', dose_unit: 'mg/h', amount: 500, amount_unit: 'mg', volume: 50 },
  { key: 'midazolam', name: 'Midazolam', short: 'midazolam', kind: 'sedative', dose_unit: 'mg/h', amount: 50, amount_unit: 'mg', volume: 50 },
  { key: 'fentanyl', name: 'Fentanyl', short: 'fentanyl', kind: 'opioid', dose_unit: 'ug/h', amount: 2500, amount_unit: 'ug', volume: 50 },
  { key: 'insulin', name: 'Soluble insulin', short: 'insulin', kind: 'insulin', dose_unit: 'units/h', amount: 50, amount_unit: 'units', volume: 50 },
  { key: 'magnesium', name: 'Magnesium sulfate', short: 'MgSO₄', kind: 'electrolyte', dose_unit: 'g/h', amount: 10, amount_unit: 'g', volume: 100 },
]
const org = { settings: [{ key: 'intensive.unit', thing_id: 'icu', owner_id: 'icu', data: { day_starts: 8, infusions: INFUSIONS }, recorded_at: '2026-10-01T00:00:00Z' }],
  settingKeys: [], datatypes: {} } as unknown as Organization

test('the tile: the airway, one infusion, the MAP and a low urine, from the board\'s read', () => {
  const NOW = Date.parse('2026-10-09T12:20:00Z'); const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString()
  const row = (item: string): PresenceRow => presence(item, { kind: 'stay', state: 'admitted', department_id: 'icu', checked_in_at: ago(55) })
  const tc = { org, dept: { id: 'icu', packs: ['intensive'] } }
  const board = (item: string, w: StayWords): IcuBoard => ({ patient_ids: ['pt'], stays: { [item]: w } })
  const nabil: StayWords = { airway: { code: 'invasive_ventilation', status: 'in-progress', since: ago(55), at: ago(55) },
    infusions: [{ key: 'fentanyl', drug: 'Fentanyl', dose: '75', unit: 'ug/h', rate: '1.5' }, { key: 'noradrenaline', drug: 'Noradrenaline', dose: '0.15', unit: 'ug/kg/min', rate: '8.8' },
      { key: 'propofol', drug: 'Propofol', dose: '100', unit: 'mg/h', rate: '10' }], map: { value: 67, at: ago(1), measured: true } }
  assert.deepEqual(tileWords(row('st1'), tc, board('st1', nabil), NOW)?.words, [{ text: 'Ventilated d3', tone: 'info' }, { text: 'noradrenaline 0.15', tone: 'warn' }, 'MAP 67'])
  const samy: StayWords = { oxygen: { on: 'air' }, infusions: [{ key: 'insulin', drug: 'Soluble insulin (human)', dose: '4', unit: 'units/h', rate: '4' }],
    map: { value: 88, at: ago(1), measured: false }, urine: { ml: 137, hours: 5, kg: 72 } }
  assert.deepEqual(tileWords(row('st3'), tc, board('st3', samy), NOW)?.words, ['On air', 'insulin 4 units/h', { text: 'urine 0.4 mL/kg/h', tone: 'warn' }])
  const off: StayWords = { airway: { code: 'invasive_ventilation', status: 'completed', since: ago(50), at: ago(3) }, oxygen: { on: 'oxygen', flow: '2' } }
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', off), NOW)?.words, [`Extubated ${hm(ago(3))}`], 'extubated 3 h ago: the hour, not the oxygen')
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', { ...off, airway: { ...off.airway!, at: ago(25) } }), NOW)?.words, ['O₂ 2 L/min'], 'a day later: the oxygen')
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', { oxygen: { on: 'oxygen' } }), NOW)?.words, ['On O₂'])
  for (const status of ['preparation', 'on-hold', 'not-done']) {
    assert.deepEqual(tileWords(row('st2'), tc, board('st2', { airway: { code: 'invasive_ventilation', status, since: ago(1), at: ago(1) }, oxygen: { on: 'air' } }), NOW)?.words,
      ['On air'], `an airway ${status}: not extubated, the oxygen word`)
  }
  assert.deepEqual(tileWords(row('st2'), tc, board('st2', { airway: { code: 'non_invasive_ventilation', status: 'in-progress', since: ago(2), at: ago(2) } }), NOW)?.words,
    [{ text: 'NIV d1', tone: 'info' }])
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { map: { value: 62, at: ago(1), measured: false } }), NOW)?.words, [{ text: 'MAP 62', tone: 'warn' }], 'MAP 62 with no pressor')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { map: { value: 80, at: ago(1), measured: true } }), NOW), null, 'MAP 80 with no pressor: nothing')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { urine: { ml: 30, hours: 1, kg: 72 } }), NOW), null, 'one hour of urine is not enough')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { urine: { ml: 300, hours: 5, kg: 72 } }), NOW), null, 'enough urine: nothing')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { urine: { ml: 167, hours: 5, kg: 72 } }), NOW)?.words, [{ text: 'urine 0.46 mL/kg/h', tone: 'warn' }],
    'just under 0.5: two decimals')
  assert.deepEqual(tileWords(row('st4'), tc, board('st4', { infusions: [{ key: 'vasopressin', drug: 'Vasopressin', dose: '2', unit: 'units/h' }] }), NOW)?.words,
    ['Vasopressin 2 units/h'], 'a drug the unit\'s list lacks: not a pressor, its own words')
  for (const d of [undefined, null, 'x', { stays: null }, board('other', nabil)]) assert.equal(tileWords(row('st1'), tc, d, NOW), null)
  assert.equal(tileWords({ ...row('st1'), kind: 'visit' }, tc, board('st1', nabil), NOW), null, 'only a stay')
  // through the core's line
  registerTileLine('intensive', (r, c, d) => tileWords(r, c, d, NOW))
  const ctx: TileCtx = { dept: { id: 'icu', packs: ['intensive'] }, place: null, identity: null, day: 3, can: () => true, org }
  assert.deepEqual(tileLineOf(tileLineDefs(), row('st1'), ctx, { intensive: board('st1', nabil) }),
    [{ pack: 'intensive', words: [{ text: 'Ventilated d3', tone: 'info' }, { text: 'noradrenaline 0.15', tone: 'warn' }, { text: 'MAP 67' }] }])
  assert.deepEqual(tileLineOf(tileLineDefs(), row('st1'), ctx), [], 'before the board answers: nothing')
})
console.log(`intensive: ${n} groups passed`)
