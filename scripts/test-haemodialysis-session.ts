// Dialysis's session groups (spec/openCare.md §5.6, D2b), run by scripts/test-haemodialysis.ts: the fluid to take off and its notices,
// Before's set, the standing prescription's form, the machine readings (the card's numbers, the notices, the grid), the stay's model, the
// tile's fluid and gain words, and the due row's access. Pure: no browser, no database.
import assert from 'node:assert/strict'
import type { Organization, Place } from '../src/core/db/types'
import { tileWords, type Board } from '../src/packs/haemodialysis/board'
import { boardRow, reasonOf, type DueRow } from '../src/packs/haemodialysis/due'
import { gridOf, inputProblems, placeholders, readingData, readingEntry, readingMissing, readingNotices, type Reading } from '../src/packs/haemodialysis/reading'
import { RX_FIELDS, accessWords, blankRx, rxData, rxEntry, rxForm, rxMissing, rxNotices, rxWords, type RxForm } from '../src/packs/haemodialysis/rx'
import { beforeNotices, beforeSet, beforeVit, elapsed, fluidOf, hmWords, inChairOrder, lastWeight, latest, left, partsWords, preOf, readingsOf, sessionOf, targetOf,
  ufRate, weightWords, type SessionData } from '../src/packs/haemodialysis/session'
import { unitOf } from '../src/packs/haemodialysis/unit'
import { E, next, presence } from './chart-fixtures'

type Test = (name: string, fn: () => void) => void
const NOW = Date.parse('2026-10-10T08:00:00Z')
const ago = (m: number) => new Date(NOW - m * 60_000).toISOString()
const q = (value: number | string, unit: string, ucum?: string) => ({ value: String(value), unit, ...(ucum ? { ucum } : {}) })
const SAID: RxForm = { ...blankRx(), hours: 4, blood_flow: 300, dialysate_flow: 500, dialyser: 'FX80', k: 2, ca: 1.5, hco3: 32, bolus: 2000, rate: 1000, dry: 72, access: 'fistula', site: 'left forearm' }
const session = (more: Partial<SessionData['haemodialysis']> = {}): SessionData => ({ concept: { text: 'Haemodialysis', codings: [] }, status: 'in-progress',
  performed: { value: ago(150), precision: 'minute' }, haemodialysis: { on: '2026-10-10', shift: 1, chair: 'c1', hours: 4, ...more } })
const reading = (sys: number, dia: number, hr: number, bf: number, ap: number, vp: number, tmp: number, uf: number, hep?: number): Reading =>
  ({ bp: { sys: q(sys, 'mmHg', 'mm[Hg]'), dia: q(dia, 'mmHg', 'mm[Hg]') }, hr: q(hr, 'bpm', '/min'), haemodialysis: { blood_flow: q(bf, 'mL/min', 'mL/min'), arterial: q(ap, 'mmHg', 'mm[Hg]'),
    venous: q(vp, 'mmHg', 'mm[Hg]'), tmp: q(tmp, 'mmHg', 'mm[Hg]'), uf: q(uf, 'mL', 'mL'), ...(hep !== undefined ? { heparin: q(hep, 'units/h') } : {}) } }) as Reading

export function sessionGroups(test: Test) {
  test('Before: the fluid to take off, its parts, the hourly rate, the notices, the time on the machine', () => {
    assert.equal(targetOf(74.9, 72.0), 2800, 'Said: 2.9 + 0.3 − 0.4'); assert.equal(targetOf(58.6, 56.0), 2500, 'Nadia'); assert.equal(targetOf(81.3, 78.5), 2700)
    assert.equal(targetOf(60.8, 58.0), 2700, 'Shaimaa'); assert.equal(targetOf(71.0, 72.0), 0, 'under dry: none'); assert.equal(targetOf(null, 72), null); assert.equal(targetOf(74.9, undefined), null)
    assert.equal(ufRate(2800, 4, 72), 9.7); assert.equal(ufRate(2700, 3.5, 58), 13.3); assert.equal(ufRate(null, 4, 72), null); assert.equal(ufRate(2800, 4, null), null)
    assert.deepEqual(fluidOf(74.9, 72.0), { above: 2.9, given: 300, left: 400, target: 2800, typed: false })
    assert.deepEqual(fluidOf(74.9, 72.0, 2500), { above: 2.9, given: 300, left: 400, target: 2500, typed: true }, 'the nurse\'s figure')
    assert.equal(fluidOf(74.9, 72.0, 2800).typed, false, 'typed as worked out: not the nurse\'s own')
    assert.equal(partsWords(fluidOf(74.9, 72.0)), '2.9 above dry + 0.3 given back − 0.4 left above dry'); assert.equal(partsWords(fluidOf(null, 72)), null)
    assert.equal(weightWords(74.9, 72.0, 72.4), 'dry 72.0 · 2.9 above dry · after the last session 72.4, gained 2.5'); assert.equal(weightWords(71.6, 72, null), 'dry 72.0 · 0.4 under dry')
    assert.equal(weightWords(71.8, 72.0, 72.4), 'dry 72.0 · 0.2 under dry · after the last session 72.4, lost 0.6', 'a loss is said as one')
    assert.equal(partsWords(fluidOf(71.6, 72.0)), '0.4 under dry: nothing to take off', 'under dry: the parts do not add up to 0'); assert.equal(fluidOf(71.6, 72.0).target, 0)
    assert.equal(partsWords(fluidOf(72.1, 72.0)), '0.1 above dry: nothing to take off')
    assert.deepEqual(beforeNotices({ rx: null, rate: null, gained: null, dry: null }), [{ text: 'No standing prescription: the doctor writes one', tone: 'warn' }])
    assert.deepEqual(beforeNotices({ rx: {}, rate: 14, gained: 2.4, dry: 56 }).map((n) => n.text), ['Taking off 14 mL/kg/h: above 13', 'Gained 2.4 kg since the last session: over 4 % of the dry weight'])
    assert.deepEqual(beforeNotices({ rx: {}, rate: 13, gained: 2.5, dry: 72 }), [], '13 is not above 13; 2.5 is under 4 % of 72')
    assert.equal(elapsed(ago(150), NOW), 150); assert.equal(left(ago(150), 4, NOW), 90); assert.equal(left(ago(250), 4, NOW), -10)
    assert.equal(hmWords(ago(150), 4, NOW), '2:30 of 4:00'); assert.equal(hmWords(ago(150), 3.5, NOW), '2:30 of 3:30'); assert.equal(hmWords(ago(150), undefined, NOW), '2:30')
  })

  test('Before\'s set: the base\'s vitals with the weight, and the session changed with the prescription copied, the target in mL, the access', () => {
    const rx = rxData(SAID)!
    const es = beforeSet({ patientId: 'pt', departmentId: 'hd', stay: 'st1', session: { entry_id: 'h1v1', data: session() }, rx, target: 2800,
      vitals: { weight: 74.9, sys: 146, dia: 84, pulse: 82, temp: 36.8 }, access: { kind: 'fistula', site: ' left forearm ', ok: true, note: '' } })
    assert.equal(es.length, 2); const [v, s] = es
    assert.equal(v.type, 'vitals'); assert.equal(v.visit_id, 'st1'); assert.equal(v.department_id, 'hd')
    const vd = v.data as { weight: unknown; bp: unknown; hr: unknown; temp: unknown }
    assert.deepEqual(vd.weight, { value: '74.9', unit: 'kg', ucum: 'kg' }); assert.deepEqual(vd.bp, { sys: q(146, 'mmHg', 'mm[Hg]'), dia: q(84, 'mmHg', 'mm[Hg]') })
    assert.deepEqual(vd.hr, q(82, 'bpm', '/min')); assert.deepEqual(vd.temp, q(36.8, '°C', 'Cel'))
    assert.equal(s.type, 'haemodialysis.session'); assert.equal(s.refers_to, 'h1v1'); assert.equal(s.relation, 'changes'); assert.equal(s.visit_id, 'st1')
    const h = (s.data as SessionData).haemodialysis
    assert.equal((s.data as SessionData).status, 'in-progress', 'still on'); assert.equal(h.chair, 'c1'); assert.equal(h.hours, 4)
    assert.deepEqual(h.target, { value: '2800', unit: 'mL', ucum: 'mL' }); assert.deepEqual(h.prescription, rx); assert.deepEqual(h.access, { kind: 'fistula', site: 'left forearm', ok: true })
    assert.ok(!('weight' in h), 'the weight is the base\'s vitals, never the session\'s')
    const only = beforeSet({ patientId: 'pt', departmentId: 'hd', stay: 'st1', session: { entry_id: 'h1v1', data: session() }, rx: null, target: 0, vitals: null, access: { kind: 'catheter' } })
    assert.equal(only.length, 1, 'the stay\'s first weight shown and nothing changed: no second vitals'); assert.ok(!('prescription' in (only[0].data as SessionData).haemodialysis))
    const bpOnly = beforeSet({ patientId: 'pt', departmentId: 'hd', stay: 'st1', session: { entry_id: 'h1v1', data: session() }, rx, target: 2800, vitals: { sys: 150, dia: 88 },
      access: { kind: 'fistula' } })
    assert.equal(bpOnly.length, 2); assert.deepEqual(bpOnly[0].data, { bp: { sys: q(150, 'mmHg', 'mm[Hg]'), dia: q(88, 'mmHg', 'mm[Hg]') } }, 'the stay has its weight: the BP alone, no second weight')
  })

  test('the prescription: the form and the data both ways, heparin none, the units, the lines, the ranges, the entry new or changed', () => {
    const d = rxData(SAID)!
    assert.deepEqual(d, { hours: 4, dry_weight: { value: '72.0', unit: 'kg', ucum: 'kg' }, blood_flow: { value: '300', unit: 'mL/min', ucum: 'mL/min' },
      dialysate_flow: { value: '500', unit: 'mL/min', ucum: 'mL/min' }, dialyser: 'FX80', bath: { k: 2, ca: 1.5, hco3: 32 },
      heparin: { bolus: { value: '2000', unit: 'units', ucum: '[iU]' }, rate: { value: '1000', unit: 'units/h' } }, access: { kind: 'fistula', site: 'left forearm' } }, 'the rate has no UCUM code')
    assert.deepEqual(rxForm(d), SAID, 'round trip')
    const none = rxData({ ...SAID, none: true }); assert.deepEqual(none?.heparin, { none: true }, 'none: no dose beside it')
    assert.equal(rxForm(none).none, true); assert.equal(rxData({ ...SAID, dry: 72.25 })?.dry_weight.value, '72.25')
    assert.equal(rxData({ ...SAID, hours: null }), null); assert.deepEqual(rxMissing(blankRx()), ['the hours', 'the dry weight', 'the heparin dose (or None)'])
    assert.deepEqual(rxMissing({ ...SAID, bolus: null, rate: null }), ['the heparin dose (or None)'], 'A dose with no dose'); assert.deepEqual(rxMissing({ ...SAID, bolus: null, rate: null, none: true }), [])
    assert.deepEqual(rxMissing({ ...SAID, bolus: null }), [], 'a rate alone is a dose')
    assert.deepEqual(rxWords(d), [['Time', '4 h'], ['Blood flow', '300 mL/min'], ['Dialysate', '500 mL/min'], ['Bath', 'K 2 · Ca 1.5 · HCO₃ 32'], ['Dialyser', 'FX80'],
      ['Heparin', '2000 units then 1000 units/h'], ['Dry weight', '72.0 kg'], ['Access', 'AV fistula · left forearm']])
    assert.deepEqual(rxWords(none).find(([k]) => k === 'Heparin'), ['Heparin', 'none'])
    assert.deepEqual(rxNotices(SAID), []); assert.deepEqual(rxNotices({ ...SAID, hours: 6, blood_flow: 500 }), ['Time 6 h: usually 2–5.5', 'Blood flow 500 mL/min: usually 200–450'])
    assert.deepEqual(rxNotices({ ...SAID, none: true, bolus: 9000 }), [], 'none: the doses are not read'); assert.equal(RX_FIELDS.length, 9)
    const v1 = rxEntry(SAID, 'pt', 'hd')!
    assert.equal(v1.type, 'haemodialysis.prescription'); assert.equal(v1.visit_id, undefined); assert.equal(v1.refers_to, undefined); assert.equal(v1.patient_id, 'pt')
    const ch = rxEntry({ ...SAID, hours: 3.5 }, 'pt', 'hd', { entry_id: 'rx1' })!
    assert.equal(ch.refers_to, 'rx1'); assert.equal(ch.relation, 'changes'); assert.equal((ch.data as { hours: number }).hours, 3.5); assert.equal(rxEntry(blankRx(), 'pt', 'hd'), null)
    assert.equal(accessWords('graft'), 'AV graft'); assert.equal(accessWords('x'), null)
  })

  test('the due row\'s reason: the access from the standing prescription', () => {
    const u = unitOf(undefined, 'hd')
    const r = (access?: string): DueRow => ({ patient_id: 'pt', on: '2026-10-10', shift: 1, place_id: 'c1', hours: 3.5, isolation: [], ...(access ? { access } : {}) })
    assert.equal(boardRow(r('fistula'), undefined, undefined, u, NOW).reason, 'Haemodialysis · AV fistula')
    assert.equal(reasonOf('graft'), 'Haemodialysis · AV graft'); assert.equal(reasonOf('catheter'), 'Haemodialysis · catheter'); assert.equal(reasonOf(undefined), 'Haemodialysis')
  })

  test('readings: a blank machine field keeps the last, the fluid in litres, the notices, the grid by time', () => {
    const last = reading(112, 70, 88, 300, -190, 150, 70, 1400, 1000)
    const d = readingData({ bp: '110/68', hr: '88', arterial: '-190', venous: '150', tmp: '70', uf: '1.6' }, last)!
    assert.deepEqual(d.haemodialysis.blood_flow, q(300, 'mL/min', 'mL/min'), 'a blank blood flow keeps the last')
    assert.deepEqual(d.haemodialysis.heparin, q(1000, 'units/h'), 'and the heparin rate'); assert.deepEqual(d.haemodialysis.uf, q(1600, 'mL', 'mL'), '1.6 L → 1600 mL')
    assert.deepEqual(d.haemodialysis.arterial, q(-190, 'mmHg', 'mm[Hg]')); assert.deepEqual(d.bp, { sys: q(110, 'mmHg', 'mm[Hg]'), dia: q(68, 'mmHg', 'mm[Hg]') })
    assert.equal(readingData({ uf: '1.4' }, last)?.haemodialysis.uf?.value, undefined, 'no BP or pulse: none'); assert.equal(readingData({ uf: '1.4' }, last), null)
    assert.deepEqual(readingData({ hr: '90', uf: '1.4' }, null)?.haemodialysis, { uf: q(1400, 'mL', 'mL') }, 'the first reading: only what is typed')
    assert.equal(readingData({ hr: '90' }, null), null, 'no machine number at all')
    assert.deepEqual(inputProblems({ bp: '110', hr: 'x' }), ['BP as 128/76', 'Pulse: a number']); assert.deepEqual(inputProblems({ bp: '110/68', uf: '1.4' }), [])
    assert.deepEqual(inputProblems({ uf: '1400' }), ['Taken off in litres, e.g. 1.4'], 'the machine\'s millilitres typed'); assert.deepEqual(inputProblems({ uf: '10' }), [])
    assert.deepEqual(inputProblems({ uf: '-0.2', blood_flow: '-300', heparin: '-5', hr: '-80' }), ['Pulse: a number from 0', 'Blood flow: a number from 0', 'Taken off: a number from 0',
      'Heparin: a number from 0']); assert.deepEqual(inputProblems({ arterial: '-190', venous: '-10', tmp: '-5' }), [], 'the pressures may be under 0')
    assert.equal(readingMissing({ bp: '140/80' }, null), 'machine', 'the first reading: the BP typed, no machine number to keep')
    assert.equal(readingMissing({ uf: '1.4' }, last), 'vitals'); assert.equal(readingMissing({ bp: '140/80' }, last), null); assert.equal(readingMissing({ hr: '80', tmp: '60' }, null), null)
    assert.deepEqual(readingNotices(readingData({ bp: '120/74', arterial: '190' }, last), { sys: 130 }).map((n) => n.text), ['Arterial pressure 190: the machine shows it negative (-190)'])
    assert.deepEqual(readingNotices(readingData({ bp: '120/74', uf: '1.2' }, last), { sys: 130 }, last).map((n) => n.text), ['Taken off is less than the last reading'])
    assert.deepEqual(readingNotices(readingData({ bp: '120/74', uf: '1.6' }, last), { sys: 130 }, last), [])
    assert.deepEqual(placeholders(last), { bp: '112/70', hr: '88', blood_flow: '300', arterial: '-190', venous: '150', tmp: '70', uf: '1.4', heparin: '1000' })
    assert.deepEqual(readingNotices(reading(88, 54, 104, 250, -150, 120, 40, 1100), { sys: 142 }).map((n) => [n.text, n.tone]),
      [['BP 88/54: low', 'danger'], ['BP fell 54 since the start', 'warn']])
    assert.deepEqual(readingNotices(reading(112, 70, 88, 300, -190, 150, 70, 1400), { sys: 146 }).map((n) => n.text), ['BP fell 34 since the start'])
    assert.deepEqual(readingNotices(reading(120, 74, 86, 300, -260, 260, 70, 1200), { sys: 146 }).map((n) => n.text),
      ['Venous pressure 260: check the needle and the line', 'Arterial pressure -260: check the needle and the flow'])
    assert.deepEqual(readingNotices(reading(140, 80, 80, 300, -190, 150, 70, 400), { sys: 146 }), []); assert.deepEqual(readingNotices(null, null), [])
    const es = [E('haemodialysis.reading', { occurred_at: '2026-10-10T07:40:00Z', data: reading(96, 58, 90, 300, -190, 150, 70, 900, 1000) }),
      E('haemodialysis.reading', { occurred_at: '2026-10-10T07:10:00Z', data: reading(146, 84, 82, 300, -180, 140, 60, 0, 1000) })]
    const g = gridOf(es)
    assert.deepEqual(g.columns.map((c) => c.hm), ['10:10', '10:40'], 'by time, in the clinic\'s zone')
    assert.deepEqual(g.rows.map((r) => r.row.label), ['BP', 'Pulse', 'Blood flow', 'Arterial', 'Venous', 'TMP', 'Taken off', 'Heparin'])
    assert.deepEqual(g.rows[0].cells, [{ text: '146/84' }, { text: '96/58', flag: 'warn' }]); assert.deepEqual(g.rows[6].cells.map((c) => c.text), ['0', '0.9'])
    assert.equal(gridOf([E('haemodialysis.reading', { data: reading(88, 54, 104, 250, -150, 120, 40, 1100) })]).rows[0].cells[0].flag, 'low')
    const e = readingEntry(d, { item: 'st1', patient_id: 'pt' }, 'hd')
    assert.equal(e.type, 'haemodialysis.reading'); assert.equal(e.visit_id, 'st1'); assert.equal(e.department_id, 'hd'); assert.ok(e.id)
  })

  test('the stay: its session as it stands, the readings by time, the weight before, the last weight, the stays in chair order', () => {
    const sd = (more: Partial<SessionData['haemodialysis']> = {}) => session(more) as unknown as Record<string, unknown>
    const v1 = E('haemodialysis.session', { visit_id: 'st1', recorded_at: ago(150), occurred_at: ago(150), data: sd() })
    const v2 = E('haemodialysis.session', { item: v1.item, item_version: 2, visit_id: 'st1', recorded_at: ago(145), occurred_at: ago(145), refers_to: v1.id, relation: 'changes',
      data: sd({ target: q(2800, 'mL', 'mL') }) })
    const other = E('haemodialysis.session', { visit_id: 'st9', data: sd() })
    const w1 = E('vitals', { visit_id: 'st1', occurred_at: ago(150), data: { weight: q(74.9, 'kg', 'kg'), bp: { sys: q(146, 'mmHg'), dia: q(84, 'mmHg') }, hr: q(82, 'bpm') } })
    const w2 = E('vitals', { visit_id: 'st1', occurred_at: ago(10), data: { weight: q(73.1, 'kg', 'kg') } })
    const r2 = E('haemodialysis.reading', { visit_id: 'st1', occurred_at: ago(20), data: reading(120, 74, 86, 300, -190, 150, 70, 1200) })
    const r1 = E('haemodialysis.reading', { visit_id: 'st1', occurred_at: ago(140), data: reading(146, 84, 82, 300, -180, 140, 60, 0) })
    const hid = E('haemodialysis.reading', { visit_id: 'st1', occurred_at: ago(30), hidden: true, data: undefined })
    const all = [v2, other, w2, r2, v1, w1, r1, hid]
    const s = sessionOf(all, 'st1')!
    assert.equal(s.entry_id, v2.id); assert.equal(s.item, v1.item); assert.equal(s.status, 'in-progress'); assert.equal(s.at, ago(145)); assert.equal(sessionOf(all, 'st2'), null)
    assert.deepEqual(readingsOf(all, 'st1').map((e) => e.id), [r1.id, r2.id], 'by time; a hidden one left out')
    assert.deepEqual(preOf(all, 'st1'), { weight: 74.9, bp: { sys: 146, dia: 84 }, hr: 82, at: ago(150) }, 'the stay\'s first weight'); assert.equal(preOf([], 'st1'), null)
    const pre = preOf(all, 'st1')
    assert.deepEqual(beforeVit(all, s, pre), { bp: { sys: 146, dia: 84 }, hr: 82 }, 'Before wrote no vitals: the weight before\'s own')
    const bv = E('vitals', { visit_id: 'st1', occurred_at: ago(145), set_id: v2.set_id, data: { bp: { sys: q(150, 'mmHg'), dia: q(88, 'mmHg') }, hr: q(80, 'bpm') } })
    assert.deepEqual(beforeVit([...all, bv], s, pre), { bp: { sys: 150, dia: 88 }, hr: 80 }, 'Before\'s own vitals, in its set'); assert.deepEqual(preOf([...all, bv], 'st1'), pre)
    // crossed out (the item's next version; a cross-out may carry no visit): left out everywhere
    const x = (e: typeof v1) => next(e, 'crossed_out', { reason: 'typo' }, { visit_id: null }, 'replaces')
    assert.deepEqual(readingsOf([...all, x(r2)], 'st1').map((e) => e.id), [r1.id], 'a reading crossed out: not in the grid, not the last to keep')
    assert.deepEqual(preOf([...all, x(w1)], 'st1')?.weight, 73.1, 'the first weight crossed out: the next one'); assert.equal(sessionOf([...all, x(v2)], 'st1'), null, 'the session crossed out')
    const rx1 = E('haemodialysis.prescription', { data: rxData(SAID) as unknown as Record<string, unknown> })
    assert.equal(latest([rx1], 'haemodialysis.prescription').length, 1); assert.deepEqual(latest([rx1, x(rx1)], 'haemodialysis.prescription'), [], 'a prescription crossed out: none current')
    const rows = [{ value: 72.4, at: '2026-10-07T12:00:00Z' }, { value: 74.9, at: '2026-10-10T05:30:00Z' }, { value: 71.9, at: '2026-10-05T12:00:00Z' }]
    assert.equal(lastWeight(rows, '2026-10-10T05:30:00Z'), 72.4, 'the newest before the stay began'); assert.equal(lastWeight(rows, '2026-10-01T00:00:00Z'), null)
    const chairs: Pick<Place, 'id' | 'position'>[] = [{ id: 'c1', position: 1 }, { id: 'c7', position: 7 }, { id: 'c3', position: 3 }]
    const st = (item: string, place: string | null, more = {}) => presence(item, { kind: 'stay', state: 'admitted', department_id: 'hd', place_id: place, ...more })
    assert.deepEqual(inChairOrder([st('a', 'c7'), st('b', null), st('c', 'c1'), st('d', 'c3'), st('e', 'c3', { department_id: 'ward' }), presence('f', { department_id: 'hd' })], chairs, 'hd')
      .map((r) => r.item), ['c', 'd', 'a', 'b'], 'by chair; no chair last; another unit\'s and a visit left out')
  })

  test('the tile: the fluid taken off of the fluid to take off, then the BP, then a gain over 4 % of the dry weight', () => {
    const org = { places: [], settings: [], settingKeys: [], datatypes: {} } as unknown as Organization
    const ctx = { dept: { id: 'hd', packs: ['haemodialysis'] }, place: null, org }
    const st = presence('st1', { kind: 'stay', state: 'admitted', department_id: 'hd' })
    const on = (more = {}) => ({ item: 'h1', status: 'in-progress', hours: 4, started: ago(150), target: 2800, dry: 72, ...more })
    const words = (f: Board['stays'][string]) => tileWords(st, ctx, { patient_ids: [], stays: { st1: f } }, NOW)?.words
    assert.deepEqual(words({ session: on(), uf: { ml: 1400, at: ago(20) }, bp: { sys: 112, dia: 70, at: ago(20) } }), ['on · 1:30 left', 'off 1.4 of 2.8 L', 'BP 112/70'])
    assert.deepEqual(words({ session: on() }), ['on · 1:30 left', 'off 0 of 2.8 L'], 'no reading yet')
    assert.deepEqual(words({ session: on({ target: undefined }) }), ['on · 1:30 left'], 'before Before: no fluid words')
    assert.deepEqual(words({ session: on({ target: 2500, dry: 56 }), uf: { ml: 1100, at: ago(20) }, bp: { sys: 88, dia: 54, at: ago(20) }, pre: 58.6, last: 56.3 }),
      ['on · 1:30 left', 'off 1.1 of 2.5 L', { text: 'BP 88/54', tone: 'danger' }, { text: 'gained 2.3 kg', tone: 'warn' }], 'Nadia: 2.3 over 4 % of 56')
    assert.deepEqual(words({ session: on(), pre: 74.9, last: 72.4 }), ['on · 1:30 left', 'off 0 of 2.8 L'], 'Said: 2.5 is under 4 % of 72')
    assert.deepEqual(words({ session: on({ dry: undefined }), pre: 74.9, last: 60 }), ['on · 1:30 left', 'off 0 of 2.8 L'], 'no dry weight copied: no gain words')
  })
}
