// The record panel's sections and their chips (spec/openCare.md §5.1 rule 2, "The section chips"): the registry, the fit, the rule
// (which show, in what order, what waits behind More), private data as the fact only, the chip words and Summary lines, proven on
// pharmacy. Pure: no browser, no database.   npm run test:sections
import assert from 'node:assert/strict'
import { setClinicTimeZone } from '../src/core/ui/time'
import { ANYONE, PRIVATE_WORD, ageIn, arrange, fits, ownOf, packTypes, registerSection, sectionDefs, sectionsOf, type Candidate, type Fit, type SectionDef,
  type SectionIn, type Who } from '../src/core/screens/chart/sections'
import { allergiesWord, countWord, documentsWord, historyWord, medicinesWord, problemsWord, resultsWord, visitsWord } from '../src/core/screens/chart/model/chips'
import { suppliedLine, suppliedOf, suppliedWord, whatText } from '../src/packs/pharmacy/dispensed'
import { fitCount, keptChips } from '../src/core/screens/chart/panel/Chips'
import type { Identity, ServerEntry } from '../src/core/db/types'
import { E, analyte, ctx, listRow, med, next, orderRow, presence, problem, record, result, table, types, val } from './chart-fixtures'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const TODAY = '2026-10-06'
const who = (sex: Who['sex'], birth: string | null): Who => ({ sex, birth, today: TODAY })
const keys = (xs: { key: string }[]) => xs.map((x) => x.key)
const Body = () => null
const def = (s: SectionIn): SectionDef => { const layer = s.key.includes('.') ? s.key.split('.')[0] : 'base'; return { fold: true, ...s, layer, types: s.types ?? [], fit: s.fit ?? ANYONE } }
const PREGNANCY: Fit = { sex: 'female', from: { n: 10, unit: 'years' }, to: { n: 55, unit: 'years' } }
const GROWTH: Fit = { sex: 'any', to: { n: 18, unit: 'years' } }      // under 19
const NEWBORN: Fit = { sex: 'any', to: { n: 28, unit: 'days' } }
const identity = { gender: 'female', birth_date: '1990-05-01' } as Identity
const base = (o: { facts?: ServerEntry[]; packs?: ServerEntry[] } = {}) => ({ rec: record(), ctx, identity, facts: o.facts, packs: o.packs, documents: null })
const INFANT: Fit = { sex: 'any', from: { n: 1, unit: 'months' }, to: { n: 11, unit: 'months' } }

test('age in completed days, months and years, by the clinic day', () => {
  assert.equal(ageIn('2007-10-06', TODAY, 'years'), 19); assert.equal(ageIn('2007-10-07', TODAY, 'years'), 18, 'the day before the birthday')
  assert.equal(ageIn('2026-09-06', TODAY, 'months'), 1); assert.equal(ageIn('2026-09-07', TODAY, 'months'), 0)
  assert.equal(ageIn('2026-09-08', TODAY, 'days'), 28); assert.equal(ageIn('2024-02-29', '2025-02-28', 'years'), 0, 'a leap-day birthday comes on 1 March')
  assert.equal(ageIn(null, TODAY, 'years'), null)
})
test('fit at the age and sex boundaries: from and to inclusive in completed units; other and unknown fit either sex; no age fits every age', () => {
  assert.equal(fits(PREGNANCY, who('female', '2016-10-06')), true, '10 today'); assert.equal(fits(PREGNANCY, who('female', '2016-10-07')), false, '9 until tomorrow')
  assert.equal(fits(PREGNANCY, who('female', '1971-10-07')), true, '55'); assert.equal(fits(PREGNANCY, who('female', '1970-10-06')), false, '56 today')
  assert.equal(fits(PREGNANCY, who('male', '1990-01-01')), false, 'a man'); assert.equal(fits(PREGNANCY, who('unknown', '1990-01-01')), true)
  assert.equal(fits(PREGNANCY, who('other', '1990-01-01')), true); assert.equal(fits({ sex: 'male' }, who('female', null)), false)
  assert.equal(fits(GROWTH, who('male', '2007-10-07')), true, '18'); assert.equal(fits(GROWTH, who('male', '2007-10-06')), false, '19 today')
  assert.equal(fits(NEWBORN, who('female', '2026-09-08')), true, 'day 28'); assert.equal(fits(NEWBORN, who('female', '2026-09-07')), false, 'day 29')
  assert.equal(fits(INFANT, who('female', '2026-09-07')), false, 'not a month yet'); assert.equal(fits(INFANT, who('female', '2026-09-06')), true)
  assert.equal(fits(INFANT, who('female', '2025-10-07')), true, '11 months'); assert.equal(fits(INFANT, who('female', '2025-10-06')), false, 'a year')
  assert.equal(fits(GROWTH, who('female', null)), true, 'an age not known'); assert.equal(fits(ANYONE, who('unknown', null)), true)
})

const C = (key: string, o: Partial<Candidate> = {}): Candidate => ({ key, layer: key.includes('.') ? key.split('.')[0] : 'base', fit: ANYONE, data: false, hiddenOnly: false, ...o })
const BASE = ['summary', 'problems', 'medicines', 'allergies', 'history', 'results', 'documents', 'visits'].map((k) => C(k))
const adult = who('female', '1990-05-01')
test('the rule: a pack section shows when this department uses it and the patient fits, or the patient has its data; else behind More', () => {
  const ph = C('pharmacy.dispensed'); const on = ['pharmacy', 'obgyn', 'growth']
  assert.deepEqual(keys(arrange([...BASE, ph], ['pharmacy'], on, adult).lead), ['summary', 'pharmacy.dispensed'], 'used here, fits anyone')
  const away = arrange([...BASE, ph], [], on, adult)
  assert.deepEqual(keys(away.lead), ['summary']); assert.deepEqual(keys(away.more), ['pharmacy.dispensed'], 'not used here, no data: behind More')
  const had = arrange([...BASE, C('pharmacy.dispensed', { data: true })], [], on, adult)
  assert.equal(had.rest.at(-1)?.key, 'pharmacy.dispensed'); assert.equal(had.rest.at(-1)?.why, 'data'); assert.equal(had.more.length, 0)
  const preg = C('obgyn.pregnancy', { fit: PREGNANCY })
  assert.deepEqual(keys(arrange([...BASE, preg], ['obgyn'], on, who('male', '1990-01-01')).more), ['obgyn.pregnancy'], 'used here, does not fit')
  assert.deepEqual(keys(arrange([...BASE, { ...preg, data: true }], ['obgyn'], on, who('male', '1990-01-01')).lead), ['summary', 'obgyn.pregnancy'], 'its data shows it anyway')
  assert.deepEqual(keys(arrange([...BASE, preg], ['obgyn'], on, who('female', '2016-10-07')).more), ['obgyn.pregnancy'], 'a girl of 9')
  assert.deepEqual(arrange([...BASE, C('dental.teeth')], [], on, adult).more, [], 'a pack off for the clinic, no data: nowhere')
  assert.equal(arrange([...BASE, C('dental.teeth', { data: true })], [], on, adult).rest.at(-1)?.key, 'dental.teeth', 'off, with data: still shown')
})
test('the order: Summary, this department\'s packs, the line, the base, other packs\' with data, then More · n', () => {
  const cs = [...BASE, C('growth.chart', { fit: GROWTH }), C('pharmacy.dispensed', { data: true }), C('obgyn.pregnancy', { fit: PREGNANCY }), C('obgyn.births', { data: true }),
    C('growth.milestones', { fit: GROWTH })]
  const a = arrange(cs, ['obgyn'], ['pharmacy', 'obgyn', 'growth'], adult)
  assert.deepEqual(keys(a.lead), ['summary', 'obgyn.pregnancy', 'obgyn.births'], 'registration order inside a group')
  assert.deepEqual(keys(a.rest), ['problems', 'medicines', 'allergies', 'history', 'results', 'documents', 'visits', 'pharmacy.dispensed'])
  assert.deepEqual(keys(a.more), ['growth.chart', 'growth.milestones'], 'More · 2'); assert.equal(a.lead[1].why, 'here')
  assert.ok([...a.lead, ...a.rest].every((x) => x.why !== 'more'))
})
test('private data shows the fact only: the chip says "private", never a count; the pack sees none of it', () => {
  const x = arrange([...BASE, C('psychiatry.mental', { data: true, hiddenOnly: true })], [], ['psychiatry'], adult).rest.at(-1)!
  assert.equal(x.private, true); assert.equal(x.why, 'data')
  assert.equal(arrange([...BASE, C('psychiatry.mental', { data: true })], [], ['psychiatry'], adult).rest.at(-1)!.private, false, 'something it may read')
  const hid = E('psychiatry.assessment', { hidden: true, line: 'Private assessment', data: undefined, department_id: 'psy' })
  const seen = E('psychiatry.assessment', { data: { score: 3 } })
  const mental = def({ key: 'psychiatry.mental', title: 'Mental health', types: ['psychiatry.assessment'], Body, word: (i) => ({ word: `${i.own.shown.length} assessed` }),
    summary: (i) => `${i.own.shown.length} assessed` })
  const only = sectionsOf([mental], base({ packs: [hid] }), { here: [], on: ['psychiatry'], today: TODAY })
  assert.deepEqual(only.rest[0].word, PRIVATE_WORD); assert.deepEqual(only.lines, [], 'no Summary line')
  assert.deepEqual(only.rest[0].own.shown, []); assert.deepEqual(only.rest[0].own.hidden.map((e) => e.line), ['Private assessment'])
  const both = sectionsOf([mental], base({ packs: [hid, seen] }), { here: [], on: ['psychiatry'], today: TODAY })
  assert.deepEqual(both.rest[0].word, { word: '1 assessed' }, 'counted from what the reader sees'); assert.deepEqual(both.lines.map((l) => l.line), ['1 assessed'])
  const used = sectionsOf([mental], base({ packs: [hid] }), { here: ['psychiatry'], on: ['psychiatry'], today: TODAY })
  assert.equal(used.lead[0].private, true, 'shown by the department too: still the fact only')
})

test('a section\'s own entries: each item\'s latest, the crossed out gone, a pack type extending a base one, hidden ones apart', () => {
  const d1 = E('pharmacy.dispense', { data: { status: 'in-progress', step: 'prepared' } }); const d2 = next(d1, 'pharmacy.dispense', { status: 'completed' })
  const wrong = E('pharmacy.dispense', { data: { status: 'completed' } }); const x = next(wrong, 'crossed_out', { reason: 'wrong_patient' }, {}, 'replaces')
  const own = ownOf([d1, d2, wrong, x, E('alert'), E('pharmacy.dispense', { hidden: true })], ['pharmacy.dispense'], types)
  assert.deepEqual(own.shown.map((e) => e.id), [d2.id]); assert.equal(own.hidden.length, 1)
  assert.equal(ownOf([d2], ['step'], types).shown.length, 1, 'by its base type'); assert.deepEqual(ownOf(undefined, ['x'], types), { shown: [], hidden: [] })
})
test('the Summary shows a pack\'s line only while its section shows; More holds no line', () => {
  const ph = def({ key: 'pharmacy.dispensed', title: 'Pharmacy', types: ['pharmacy.dispense'], Body, word: (i) => suppliedWord(suppliedOf(i.own)),
    summary: (i) => suppliedLine(suppliedOf(i.own)) ?? 'nothing yet' })
  const none = sectionsOf([ph], base(), { here: [], on: ['pharmacy'], today: TODAY })
  assert.deepEqual(keys(none.more), ['pharmacy.dispensed']); assert.deepEqual(none.lines, [])
  const here = sectionsOf([ph], base(), { here: ['pharmacy'], on: ['pharmacy'], today: TODAY })
  assert.deepEqual(here.lines.map((l) => `${l.label}: ${l.line}`), ['Pharmacy: nothing yet']); assert.equal(here.lead[0].word, null)
})
test('the registry: a key once, the layer from the key, the packs\' types read with the facts', () => {
  const err = console.error; console.error = () => {}
  try {
    registerSection({ key: 'problems', title: 'Problems', Body, word: () => null })
    registerSection({ key: 'pharmacy.dispensed', title: 'Pharmacy', types: ['pharmacy.dispense'], Body, word: () => null })
    registerSection({ key: 'pharmacy.dispensed', title: 'Again', types: ['pharmacy.other'], Body, word: () => null })
  } finally { console.error = err }
  assert.deepEqual(sectionDefs().map((d) => `${d.key}:${d.layer}:${d.title}`), ['problems:base:Problems', 'pharmacy.dispensed:pharmacy:Pharmacy'])
  assert.deepEqual(packTypes(), ['pharmacy.dispense']); assert.deepEqual(sectionDefs()[1].fit, ANYONE)
})

test('the base chips\' words: Problems active, Medicines current, a count of none says nothing', () => {
  const dm = E('problem', { data: problem('Diabetes') }); const old = E('problem', { data: problem('Asthma', 'resolved') })
  const m = E('medication', { data: med('Metformin', '500', 'BD') }); const st = E('medication', { data: med('Aspirin', '75', 'OD', { status: 'stopped' }) })
  const rec = record({ 'base.lists': table([listRow('problems', [dm], 'active'), listRow('problems', [old], 'resolved'), listRow('medications', [m], 'active'),
    listRow('medications', [st], 'stopped')], [dm, old, m, st]) })
  assert.deepEqual(problemsWord(rec, ctx), { word: '1' }); assert.deepEqual(medicinesWord(rec, ctx), { word: '1' })
  assert.equal(problemsWord(record(), ctx), null); assert.equal(countWord(0), null); assert.equal(countWord(null), null); assert.deepEqual(countWord(3), { word: '3' })
})
test('Allergies: not asked (warn), none known, a count, the severe ones danger and in words', () => {
  assert.deepEqual(allergiesWord(record(), ctx), { word: 'not asked', tone: 'warn' })
  const nka = E('list_review', { data: { list: 'allergies', outcome: 'none_known' } })
  assert.deepEqual(allergiesWord(record({ 'base.lists': table([listRow('reviews', [nka], 'active')], [nka]) }), ctx), { word: 'none known' })
  const pen = E('allergy', { data: { concept: { text: 'Penicillins' }, clinical_status: 'active', verification: 'confirmed', criticality: 'high' } })
  const nuts = E('allergy', { data: { concept: { text: 'Peanuts' }, clinical_status: 'active', verification: 'confirmed', criticality: 'low' } })
  assert.deepEqual(allergiesWord(record({ 'base.lists': table([listRow('allergies', [nuts], 'active')], [nuts]) }), ctx), { word: '1' })
  assert.deepEqual(allergiesWord(record({ 'base.lists': table([listRow('allergies', [pen], 'active'), listRow('allergies', [nuts], 'active')], [pen, nuts]) }), ctx),
    { word: '2, 1 severe', tone: 'danger' })
})
test('Results: a count, or "n critical" in the danger tone; History and Visits a count', () => {
  const cbc = E('result', { data: result('CBC', [analyte('hb', '718-7', '6.1', 'LL'), analyte('wbc', '6690-2', '7.1', 'N')]) })
  const crit = record({ 'base.values': table([val('hb', '718-7', 6.1, cbc.recorded_at, cbc, 'LL', 'Hb'), val('wbc', '6690-2', 7.1, cbc.recorded_at, cbc, 'N', 'WBC')], [cbc]) })
  assert.deepEqual(resultsWord(crit, types), { word: '1 critical', tone: 'danger' })
  const fine = record({ 'base.values': table([val('wbc', '6690-2', 7.1, cbc.recorded_at, cbc, 'N', 'WBC')], [cbc]) })
  assert.deepEqual(resultsWord(fine, types), { word: '1' }); assert.equal(resultsWord(record(), types), null)
  const pr = E('procedure', { data: { concept: { text: 'Appendicectomy' }, status: 'completed' } })
  assert.deepEqual(historyWord([pr, E('alert', { data: { concept: { text: 'DNR' }, status: 'active' } })], types), { word: '1' }); assert.equal(historyWord(undefined, types), null)
  assert.deepEqual(visitsWord(record({ 'base.presence': table([presence('v1'), presence('v2')]) }), ctx), { word: '2' })
})
test('Pharmacy proves it: what was dispensed (product, quantity, when), "n supplied", its Summary line', () => {
  const q = (value: string, unit?: string) => ({ value, unit })
  const prep = E('pharmacy.dispense', { occurred_at: '2026-10-01T09:00:00Z', data: { status: 'in-progress', step: 'prepared' } })
  const gave = next(prep, 'pharmacy.dispense', { status: 'completed', pharmacy: { items: [{ drug: { text: 'Metformin 1 g' }, quantity: q('60', 'tablets') }] } }, { occurred_at: '2026-10-01T10:00:00Z' })
  const no = E('pharmacy.dispense', { occurred_at: '2026-09-20T10:00:00Z', data: { status: 'cancelled', reason: 'Out of stock' } })
  const rows = suppliedOf(ownOf([prep, gave, no], ['pharmacy.dispense'], types))
  assert.deepEqual(rows.map((r) => `${r.state}:${r.items.map((i) => `${i.product} ${i.quantity}`).join()}:${r.reason ?? ''}`), ['given:Metformin 1 g 60 tablets:', 'not_given::Out of stock'])
  assert.deepEqual(suppliedWord(rows), { word: '1 supplied' }); assert.match(suppliedLine(rows)!, /^Metformin 1 g × 60 tablets · \S/)
  assert.deepEqual(suppliedWord(suppliedOf(ownOf([prep], ['pharmacy.dispense'], types))), { word: '1 prepared' })
  assert.deepEqual(suppliedWord(suppliedOf(ownOf([no], ['pharmacy.dispense'], types))), { word: 'not given' }); assert.equal(suppliedLine([]), null)
  const again = E('pharmacy.dispense', { occurred_at: '2026-10-05T10:00:00Z', data: { status: 'completed', pharmacy: { items: [{ drug: { text: 'Amlodipine 5 mg' }, quantity: q('30') }] } } })
  const two = suppliedOf(ownOf([gave, again], ['pharmacy.dispense'], types))
  assert.deepEqual(suppliedWord(two), { word: '2 supplied' }); assert.match(suppliedLine(two)!, /^Amlodipine 5 mg × 30 · .+ · 2 supplied$/, 'the last supply first')
})
// ── the review's findings ──
const PH = def({ key: 'pharmacy.dispensed', title: 'Pharmacy', types: ['pharmacy.dispense'], Body, word: (i) => suppliedWord(suppliedOf(i.own)),
  summary: (i) => suppliedLine(suppliedOf(i.own, i.rec)) })
test('a redacted dispense (misfiled: its data blanked) is no data and no word; a dispense with no state is left out', () => {
  const red = E('pharmacy.dispense', { redacted: true, data: {} })
  assert.deepEqual(ownOf([red], ['pharmacy.dispense'], types), { shown: [], hidden: [] })
  const away = sectionsOf([PH], base({ packs: [red] }), { here: [], on: ['pharmacy'], today: TODAY })
  assert.deepEqual(keys(away.rest), [], 'not brought onto the chart'); assert.deepEqual(keys(away.more), ['pharmacy.dispensed'])
  const here = sectionsOf([PH], base({ packs: [red] }), { here: ['pharmacy'], on: ['pharmacy'], today: TODAY })
  assert.equal(here.lead[0].word, null, 'never "1 prepared"'); assert.deepEqual(here.lines, [])
  assert.deepEqual(suppliedOf({ shown: [E('pharmacy.dispense', { data: {} })], hidden: [] }), [], 'no status: no row')
  assert.equal(suppliedOf({ shown: [E('pharmacy.dispense', { data: { status: 'in-progress' } })], hidden: [] })[0].state, 'prepared')
})
test('a pack\'s data comes from its own read, never the facts page, so its volume cannot push the facts (the alerts) off', () => {
  const d = E('pharmacy.dispense', { data: { status: 'completed', pharmacy: { items: [{ drug: { text: 'Metformin 1 g' } }] } } })
  assert.deepEqual(keys(sectionsOf([PH], base({ facts: [d] }), { here: [], on: ['pharmacy'], today: TODAY }).rest), [], 'the facts page is not read for it')
  const had = sectionsOf([PH], base({ packs: [d] }), { here: [], on: ['pharmacy'], today: TODAY })
  assert.deepEqual(keys(had.rest), ['pharmacy.dispensed']); assert.deepEqual(had.rest[0].word, { word: '1 supplied' })
  const x = next(d, 'crossed_out', { reason: 'wrong_value' }, {}, 'replaces')
  assert.deepEqual(keys(sectionsOf([PH], base({ packs: [d, x] }), { here: [], on: ['pharmacy'], today: TODAY }).rest), [], 'crossed out in the same read')
})
test('Documents: a count of the files read, "n+" while earlier pages remain; nothing before it is read', () => {
  assert.equal(documentsWord(null), null); assert.deepEqual(documentsWord({ n: 2, more: false }), { word: '2' })
  assert.deepEqual(documentsWord({ n: 2, more: true }), { word: '2+' }, 'a lower bound, never the whole'); assert.equal(documentsWord({ n: 0, more: true }), null)
})
test('the list chips count the drafts as their heads do: a drafted allergy clears "not asked", a drafted none known says so', () => {
  const dm = E('problem', { data: problem('Diabetes') }); const m = E('medication', { data: med('Metformin', '500', 'BD') })
  const rec = record({ 'base.lists': table([listRow('problems', [dm], 'active'), listRow('medications', [m], 'active')], [dm, m]) })
  const drafted = { problem: 1, medication: 2, allergy: 1, nka: false }
  assert.deepEqual(problemsWord(rec, ctx, drafted), { word: '2' }); assert.deepEqual(medicinesWord(rec, ctx, drafted), { word: '3' })
  assert.deepEqual(allergiesWord(record(), ctx, drafted), { word: '1' }, 'no longer not asked')
  assert.deepEqual(allergiesWord(record(), ctx, { ...drafted, allergy: 0, nka: true }), { word: 'none known' })
  assert.deepEqual(problemsWord(record(), ctx, { ...drafted, problem: 0 }), null)
})
test('a dispense not given names the medicine it answers (its order is about the medication); "Dispense" only when neither is known', () => {
  const m = E('medication', { data: med('Amoxicillin 500 mg', '500', 'TDS') })
  const o = E('order', { refers_to: m.id, relation: 'about', data: { service: { name: 'Dispense' }, status: 'active' } })
  const no = E('pharmacy.dispense', { refers_to: o.id, relation: 'answers', data: { status: 'cancelled', reason: 'Out of stock' } })
  const rec = record({ 'base.orders': table([orderRow(o, { about_item: m.item, to_department_id: 'ph' })], [o]), 'base.lists': table([listRow('medications', [m], 'active')], [m]) })
  const [row] = suppliedOf({ shown: [no], hidden: [] }, rec)
  assert.equal(row.state, 'not_given'); assert.equal(whatText(row), 'Amoxicillin 500 mg')
  assert.equal(whatText(suppliedOf({ shown: [no], hidden: [] })[0]), '', 'no record at hand: the row says Dispense')
  const hid = record({ 'base.orders': table([orderRow(o, { about_item: m.item })], [o]), 'base.lists': table([listRow('medications', [m], 'active')], [{ ...m, hidden: true, data: undefined }]) })
  assert.equal(whatText(suppliedOf({ shown: [no], hidden: [] }, hid)[0]), '')
})
test('chips that do not fit fold into More from the end, More always in sight, the Summary never folds', () => {
  const w = [80, 90, 100, 110, 120]                                    // Summary, then four more chips, 2 px apart
  assert.equal(fitCount(w, 10_000, 0, -1), 5, 'all fit, nothing left: no room kept for More')
  assert.equal(fitCount(w, 510, 0, -1), 5, 'exactly fits')
  assert.equal(fitCount(w, 400, 0, -1), 3, 'not all fit: room kept for More (72) leaves 328 → three (82 + 92 + 102)')
  assert.equal(fitCount(w, 500, 3, -1), 4, 'sections already behind More: room kept for it from the start')
  assert.equal(fitCount(w, 40, 0, -1), 1, 'a row narrower than the Summary still shows the Summary')
  assert.equal(fitCount([80, 90, 100], 270, 0, 1), 2, "the thin line after this department's chips takes its room")
})
test('a chip with a state word never folds: critical results stay in sight on a narrow row', () => {
  const c = (key: string, tone?: 'warn' | 'danger') => ({ key, title: key, word: tone ? { word: tone === 'danger' ? '1 critical' : 'not asked', tone } : null })
  const line = [c('summary'), c('problems'), c('medicines'), c('allergies', 'warn'), c('history'), c('results', 'danger'), c('visits')]
  const kept = keptChips(line, () => 80, 400, 0, false)             // 400 − 72 for More = 328: four chips of 82
  assert.deepEqual([...kept].sort(), ['allergies', 'problems', 'results', 'summary'], 'the Summary, both state words, then the first quiet chip')
  assert.deepEqual([...keptChips(line, () => 80, 320, 0, false)].sort(), ['allergies', 'results', 'summary'], 'narrower: the quiet chip folds first')
  assert.ok(keptChips(line, () => 80, 10_000, 0, false).size === 7, 'wide: all stay')
})
console.log(`sections: ${n} groups passed`)
