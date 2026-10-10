// Dialysis's end-of-session groups (spec/openCare.md §5.6, D2c), run by scripts/test-haemodialysis.ts: an event (the note, the saline
// given, a reading), its words on the tile, the unit's drugs (the IV and SC medicines, when last given, the given linked), End (the
// vitals, the session completed or stopped, the base's Discharge) and the banner's word. Pure: no browser, no database.
import assert from 'node:assert/strict'
import type { Organization, ServerEntry } from '../src/core/db/types'
import { ownOf } from '../src/core/screens/chart/sections'
import { sessionBanner } from '../src/packs/haemodialysis/banner'
import { tileWords, type Board } from '../src/packs/haemodialysis/board'
import { givenEntry, lastWords, unitDrugs } from '../src/packs/haemodialysis/drugs'
import { endProblems, endSet, endWords, endedAt, needlesText, offPreset } from '../src/packs/haemodialysis/end'
import { eventProblems, eventSet, eventText, eventWords, eventsOf, headingOf } from '../src/packs/haemodialysis/event'
import type { Reading } from '../src/packs/haemodialysis/reading'
import type { SessionData } from '../src/packs/haemodialysis/session'
import { E, listRow, next, presence, record, table } from './chart-fixtures'

type Test = (name: string, fn: () => void) => void
const NOW = Date.parse('2026-10-10T08:00:00Z')   // 11:00 in Cairo
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
const q = (value: number | string, unit: string, ucum?: string) => ({ value: String(value), unit, ...(ucum ? { ucum } : {}) })
const LAST = { bp: { sys: q(108, 'mmHg', 'mm[Hg]'), dia: q(66, 'mmHg', 'mm[Hg]') }, hr: q(96, 'bpm', '/min'),
  haemodialysis: { blood_flow: q(250, 'mL/min', 'mL/min'), arterial: q(-170, 'mmHg', 'mm[Hg]'), venous: q(140, 'mmHg', 'mm[Hg]'), tmp: q(60, 'mmHg', 'mm[Hg]'), uf: q(1100, 'mL', 'mL') } } as Reading
const STAY = { item: 'st1', patient_id: 'pt' }
const session = (status: SessionData['status'] = 'in-progress', more: Partial<SessionData['haemodialysis']> = {}): SessionData => ({ concept: { text: 'Haemodialysis', codings: [] }, status,
  performed: { value: ago(150), precision: 'minute' }, haemodialysis: { on: '2026-10-10', shift: 1, chair: 'c1', hours: 4, target: q(2800, 'mL', 'mL'), ...more } })

export function endGroups(test: Test) {
  test('an event: the note (its heading, what was done), the saline given, a reading only when a BP or pulse is typed', () => {
    assert.equal(headingOf(['cramps', 'low_bp']), 'Low BP · Cramps', 'in the list\'s order')
    const x = { patientId: 'pt', departmentId: 'hd', stay: STAY, events: ['low_bp', 'cramps'], done: ['saline_200', 'paused'], words: ' blood flow down to 250 ', last: LAST }
    const es = eventSet(x)
    assert.deepEqual(es.map((e) => e.type), ['note', 'given'], 'no BP typed: no reading')
    assert.deepEqual(es[0].data, { kind: 'dialysis_event', heading: 'Low BP · Cramps', text: 'Saline 200 mL, Taking off paused, blood flow down to 250' })
    assert.deepEqual(es[1].data, { drug: { text: 'Sodium chloride 0.9 %' }, dose: { value: '200', unit: 'mL', ucum: 'mL' }, route: 'IV', status: 'completed' })
    assert.ok(es.every((e) => e.visit_id === 'st1' && e.department_id === 'hd' && e.patient_id === 'pt'))
    const withBp = eventSet({ ...x, done: ['saline_100'], bp: '88/54', pulse: 104 })
    assert.deepEqual(withBp.map((e) => e.type), ['note', 'given', 'haemodialysis.reading'])
    assert.equal((withBp[1].data as { dose: { value: string } }).dose.value, '100')
    const r = withBp[2].data as Reading
    assert.deepEqual(r.bp, { sys: q(88, 'mmHg', 'mm[Hg]'), dia: q(54, 'mmHg', 'mm[Hg]') }); assert.deepEqual(r.hr, q(104, 'bpm', '/min'))
    assert.deepEqual(r.haemodialysis, LAST.haemodialysis, 'the machine\'s numbers carried from the last reading')
    assert.deepEqual(eventSet({ ...x, done: [], words: '', bp: '90/60', last: null }).map((e) => e.type), ['note', 'vitals'], 'no reading to carry: the base\'s vitals')
    assert.equal(eventText({ events: ['cramps'], done: [], words: '' }), 'Cramps', 'nothing done or said: the heading')
    assert.deepEqual(eventProblems({ events: [] }), ['Choose what happened']); assert.deepEqual(eventProblems({ events: ['cramps'], bp: '88' }), ['BP as 88/54'])
    assert.deepEqual(eventProblems({ events: ['other'], words: ' ' }), ['Say what happened'], 'Other needs words'); assert.deepEqual(eventProblems({ events: ['other'], words: 'Itching' }), [])
    assert.deepEqual(eventSet({ ...x, events: [] }), [], 'nothing happened: nothing written')
    assert.deepEqual(eventWords('Low BP · Cramps'), { text: 'low BP, cramps', tone: 'danger' }); assert.deepEqual(eventWords('Cramps · Headache'), { text: 'cramps, headache', tone: 'warn' })
    assert.equal(eventWords(''), null)
    const n1 = E('note', { visit_id: 'st1', occurred_at: ago(20), data: { kind: 'dialysis_event', heading: 'Low BP · Cramps', text: 'Saline 200 mL' } })
    const n2 = E('note', { visit_id: 'st1', occurred_at: ago(5), data: { kind: 'progress', text: 'Comfortable' } })
    const n3 = E('note', { visit_id: 'st9', occurred_at: ago(5), data: { kind: 'dialysis_event', heading: 'Cramps', text: 'x' } })
    assert.deepEqual(eventsOf([n1, n2, n3], 'st1'), [{ id: n1.id, at: ago(20), heading: 'Low BP · Cramps', text: 'Saline 200 mL' }], 'this stay\'s events only')
  })

  test('the tile: the event of the last hour before the BP, both red for Nadia; 61 minutes on, the BP alone', () => {
    const org = { places: [], settings: [], settingKeys: [], datatypes: {} } as unknown as Organization
    const ctx = { dept: { id: 'hd', packs: ['haemodialysis'] }, place: null, org }
    const st = presence('st1', { kind: 'stay', state: 'admitted', department_id: 'hd' })
    const words = (f: Board['stays'][string]) => tileWords(st, ctx, { patient_ids: [], stays: { st1: f } }, NOW)?.words
    const nadia = (min: number) => ({ session: { item: 'h1', status: 'in-progress', hours: 4, started: ago(160), target: 2500, dry: 56 }, uf: { ml: 1100, at: ago(20) },
      bp: { sys: 88, dia: 54, at: ago(20) }, event: { heading: 'Low BP · Cramps', at: ago(min) } })
    assert.deepEqual(words(nadia(20)), ['on · 1:20 left', 'off 1.1 of 2.5 L', { text: 'low BP, cramps', tone: 'danger' }, { text: 'BP 88/54', tone: 'danger' }])
    assert.deepEqual(words(nadia(61)), ['on · 1:20 left', 'off 1.1 of 2.5 L', { text: 'BP 88/54', tone: 'danger' }], 'an hour on: the BP alone')
    assert.deepEqual(words({ ...nadia(10), event: { heading: 'Cramps', at: ago(10) } })?.[2], { text: 'cramps', tone: 'warn' })
  })

  test('the unit\'s drugs: the IV and SC medicines (an oral one left out), when last given, the given linked to its medicine', () => {
    const epo = E('medication', { data: { basis: 'prescribed', drug: { text: 'Epoetin alfa', codings: [{ system: 'atc', code: 'B03XA01' }] }, status: 'active',
      dosage: { dose: q(4000, 'IU', '[iU]'), route: 'iv', timing: { frequency: 2, period: 1, period_unit: 'wk', text: 'twice a week, with dialysis' } } } })
    const metformin = E('medication', { data: { basis: 'prescribed', drug: { text: 'Metformin' }, status: 'active', dosage: { dose: q(500, 'mg', 'mg'), route: 'oral' } } })
    const heparin = E('medication', { data: { basis: 'prescribed', drug: { text: 'Enoxaparin' }, status: 'stopped', dosage: { dose: q(40, 'mg', 'mg'), route: 'SC' } } })
    const lists = table([listRow('medications', [epo], 'active'), listRow('medications', [metformin], 'active'), listRow('medications', [heparin], 'stopped')], [epo, metformin, heparin])
    const g1 = E('given', { occurred_at: '2026-10-07T07:20:00Z', data: { medication: epo.item, status: 'completed' } })
    const g2 = E('given', { occurred_at: ago(130), data: { medication: epo.item, status: 'completed' } })
    const gNot = E('given', { occurred_at: ago(10), data: { medication: epo.item, status: 'not-done' } })
    const d = unitDrugs(lists, [g1, g2, gNot])
    assert.deepEqual(d.map((x) => x.words), ['Epoetin alfa 4000 IU IV'], 'oral out; a stopped one out')
    assert.equal(d[0].timing, 'twice a week, with dialysis'); assert.equal(d[0].last, ago(130), 'the newest given, a not-done one aside')
    assert.equal(lastWords(d[0].last, NOW), 'last given today 08:50'); assert.equal(lastWords(null, NOW), 'not given yet')
    assert.match(lastWords('2026-10-07T07:20:00Z', NOW), /^last given \S+ \S+$/)
    assert.deepEqual(unitDrugs(undefined, []), [])
    const crossed = E('crossed_out', { item: g2.item, item_version: 2 })
    assert.equal(unitDrugs(lists, [g1, g2, crossed])[0].last, '2026-10-07T07:20:00Z', 'a given crossed out is not the last given')
    assert.equal(unitDrugs(lists, [g1, g2, next(g2, 'given', { medication: epo.item, status: 'not-done' })])[0].last, '2026-10-07T07:20:00Z', 'corrected to not done: not counted')
    const sc = E('medication', { data: { basis: 'prescribed', drug: { text: 'Enoxaparin' }, status: 'active', dosage: { dose: q(40, 'mg', 'mg'), route: ' SC ' } } })
    assert.deepEqual(unitDrugs(table([listRow('medications', [sc], 'active')], [sc]), []).map((x) => x.words), ['Enoxaparin 40 mg SC'], 'SC, case and spaces aside')
    const g = givenEntry(d[0], STAY, 'hd')
    assert.equal(g.type, 'given'); assert.equal(g.visit_id, 'st1'); assert.equal(g.department_id, 'hd')
    assert.deepEqual(g.data, { medication: epo.item, drug: (epo.data as { drug: unknown }).drug, dose: q(4000, 'IU', '[iU]'), route: 'iv', status: 'completed' })
  })

  test('End: the vitals, the session completed with the fluid off and the time, the base\'s Discharge changing the stay\'s latest entry; stopped early', () => {
    const stay = { item: 'st1', patient_id: 'pt', latest_entry: 'adm1' }
    const s = { entry_id: 'h1v2', status: 'in-progress', data: session() }
    const x = { patientId: 'pt', departmentId: 'hd', stay, session: s, weight: 72.6, bp: '118/72', pulse: 84, removed: 2800, needles: ['dry'], needleWords: '', ended: ago(0) }
    const es = endSet(x)
    assert.deepEqual(es.map((e) => e.type), ['vitals', 'haemodialysis.session', 'discharged'])
    const v = es[0].data as { weight: unknown; bp: unknown; hr: unknown }
    assert.deepEqual(v.weight, q(72.6, 'kg', 'kg')); assert.deepEqual(v.bp, { sys: q(118, 'mmHg', 'mm[Hg]'), dia: q(72, 'mmHg', 'mm[Hg]') }); assert.deepEqual(v.hr, q(84, 'bpm', '/min'))
    const sd = es[1].data as SessionData
    assert.equal(es[1].refers_to, 'h1v2'); assert.equal(es[1].relation, 'changes'); assert.equal(es[1].visit_id, 'st1')
    assert.equal(sd.status, 'completed'); assert.deepEqual(sd.haemodialysis.removed, q(2800, 'mL', 'mL')); assert.equal(sd.haemodialysis.needles, 'Dry, no bleeding')
    assert.equal(sd.haemodialysis.ended, ago(0)); assert.deepEqual(sd.haemodialysis.target, q(2800, 'mL', 'mL'), 'the rest as it was'); assert.ok(!('weight' in sd.haemodialysis))
    assert.deepEqual(es[2], { ...es[2], type: 'discharged', visit_id: 'st1', refers_to: 'adm1', relation: 'changes', data: { disposition: 'home' } })
    const st = endSet({ ...x, stopped: true, reason: ' Cramps, could not go on ', outcome: 'Went home well', removed: 1500 })[1].data as SessionData
    assert.equal(st.status, 'stopped'); assert.equal(st.reason, 'Cramps, could not go on'); assert.equal(st.outcome, 'Went home well'); assert.equal(st.haemodialysis.removed?.value, '1500')
    assert.deepEqual(endProblems({ ...x, stopped: true, reason: '' }), ['Needs why it ended early'])
    assert.deepEqual(endProblems({ ...x, weight: null, bp: '118' }), ['Needs the weight after', 'BP as 118/72']); assert.deepEqual(endSet({ ...x, weight: null }), [])
    assert.deepEqual(endProblems({ ...x, ended: ago(200) }), ['It came off before it began: check the time'])
    assert.deepEqual(endProblems({ ...x, removed: 2_800_000 }), ['Taken off in litres, e.g. 2.8'], 'the machine\'s mL typed as litres'); assert.deepEqual(endSet({ ...x, removed: 2_800_000 }), [])
    assert.deepEqual(endProblems({ ...x, removed: -100 }), ['Taken off in litres, e.g. 2.8']); assert.deepEqual(endProblems({ ...x, removed: 10_000 }), [])
    assert.equal(offPreset(1450), 1.45, 'the last reading\'s uf as written, not rounded'); assert.equal(offPreset(null), null)
    assert.equal((endSet({ ...x, removed: Math.round(offPreset(1450)! * 1000) })[1].data as SessionData).haemodialysis.removed?.value, '1450', 'left as preset: the machine\'s 1450 mL')
    assert.deepEqual(endSet({ ...x, session: { ...s, status: 'completed' } }).map((e) => e.type), ['vitals', 'discharged'], 'ended already: discharged with the vitals')
    assert.deepEqual(endSet({ ...x, session: null }).map((e) => e.type), ['vitals', 'discharged'])
    assert.equal(needlesText(['haematoma', 'dry'], ' small '), 'Dry, no bleeding, Haematoma, small')
    assert.equal(endedAt('', NOW), ago(0)); assert.equal(endedAt('10:45', NOW), ago(15), 'the clinic\'s 10:45, today'); assert.equal(endedAt('11:30', NOW), ago(1410), 'a later time: yesterday\'s')
    assert.equal(endedAt('25:00', NOW), null); assert.equal(endedAt('soon', NOW), null)
    assert.deepEqual(endWords(72.6, 72), { text: '72.6 kg: 0.6 above dry' }); assert.deepEqual(endWords(71.6, 72), { text: '71.6 kg: 0.4 under dry', tone: 'warn' })
    assert.deepEqual(endWords(72, 72), { text: '72.0 kg: at dry' }); assert.deepEqual(endWords(72.6, null), { text: '72.6 kg' }); assert.equal(endWords(null, 72), null)
  })

  test('the banner: "off 1.4 of 2.8 L" while the session is on here, "on dialysis" before Before, nothing in another department or once ended', () => {
    const ctx = { me: 'rn', departmentId: 'hd' }
    const rec = (dept = 'hd', state: 'admitted' | 'discharged' = 'admitted') => record({ 'base.presence': table([presence('st1', { kind: 'stay', state, department_id: dept })]) })
    const s1 = E('haemodialysis.session', { visit_id: 'st1', occurred_at: ago(150), data: session() as unknown as Record<string, unknown> })
    const r = (min: number, uf?: number) => E('haemodialysis.reading', { visit_id: 'st1', occurred_at: ago(min),
      data: { hr: q(80, 'bpm'), haemodialysis: uf !== undefined ? { uf: q(uf, 'mL', 'mL') } : { blood_flow: q(300, 'mL/min') } } })
    const own = (es: ServerEntry[]) => ownOf(es, ['haemodialysis.session', 'haemodialysis.reading'])
    const words = (es: ServerEntry[], rc = rec()) => sessionBanner({ rec: rc, ctx, own: own(es) })
    assert.deepEqual(words([s1, r(40, 900), r(20, 1400), r(10)]), [{ word: 'off 1.4 of 2.8 L', rank: 1 }], 'the latest reading with a fluid figure')
    assert.deepEqual(words([s1]), [{ word: 'off 0 of 2.8 L', rank: 1 }])
    const s0 = E('haemodialysis.session', { visit_id: 'st1', occurred_at: ago(150), data: session('in-progress', { target: undefined }) as unknown as Record<string, unknown> })
    assert.deepEqual(words([s0]), [{ word: 'on dialysis', rank: 1 }])
    assert.deepEqual(words([s1], rec('ward')), [], 'a stay in another department'); assert.deepEqual(words([s1], rec('hd', 'discharged')), [], 'the stay ended')
    const done = E('haemodialysis.session', { visit_id: 'st1', occurred_at: ago(150), data: session('completed') as unknown as Record<string, unknown> })
    assert.deepEqual(words([done]), [], 'the session ended'); assert.deepEqual(words([]), [])
  })
}
