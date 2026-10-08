// ObGyn's clinic part (spec/openCare.md §5.7), as pure decisions: the weeks and days from the LMP and the EDD, the fundus against the
// weeks, what the clinic's schedule says is due and for whom (worked out from the booking, never ticked), the next visit, G and P,
// the queue's one word (a warning first, then what is due, then the weeks; the birth not written past 42 weeks; an IUD's change for a
// woman not pregnant), Hadlock's fetal weight and its centile, the lines /anc /obus /fp /periods /pn and the drafts they make.
//   npm run test:obgyn
import assert from 'node:assert/strict'
import { dueNow, dueWord, eddOf, efw, efwCentile, fitsWeeks, fundusFits, gestOf, gpOf, markWord, methodDue, nextVisit, type Mark, type ScheduleRow } from '../src/packs/obgyn/pregnancy'
import { ancLine, parseAnc, parseFp, parsePeriods, parsePn, parseScan, scanIn } from '../src/packs/obgyn/lines'
import type { Parsed, Result } from '../src/core/screens/visit/parse'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const now = new Date('2026-10-08T10:30:00')
const DAY = 86_400_000
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (k: number) => ymd(new Date(Date.UTC(2026, 9, 8) - k * DAY))
const ok = (r: Result): Parsed[] => { if (!r || !('ok' in r)) throw new Error(JSON.stringify(r)); return r.ok }
const SCHEDULE: ScheduleRow[] = [{ from: 24, to: 28, what: 'OGTT 75 g · Laboratory', whom: 'everyone', word: 'OGTT' }, { from: 28, to: 28, what: 'Anti-D 1500 IU IM · given here', whom: 'rh_negative', word: 'anti-D' },
  { from: 20, to: 32, what: 'Tetanus toxoid, 2 doses', whom: 'everyone', word: 'tetanus toxoid' }, { from: 36, to: 37, what: 'Plan for the birth', whom: 'previous_caesarean', word: 'birth plan' }]

test('the weeks and days from the LMP, the EDD 280 days on; from weeks said on a day', () => {
  assert.deepEqual(gestOf({ lmp: daysAgo(199) }, now), { weeks: 28, days: 3 })
  assert.equal(eddOf({ lmp: '2026-03-23' }), '2026-12-28', 'the picture: LMP 23 Mar, EDD 28 Dec')
  assert.deepEqual(gestOf({ weeks: 20, at: daysAgo(14) }, now), { weeks: 22, days: 0 }); assert.equal(gestOf({}, now), null)
})
test('the fundus fits the weeks within the clinic\'s band, from 24 weeks', () => {
  assert.deepEqual(fundusFits(29, { weeks: 28, days: 3 }), { fits: true, words: 'fits 28 w (±2)' })
  assert.deepEqual(fundusFits(28, { weeks: 32, days: 0 }), { fits: false, words: 'under 30–34' }, 'the picture: fundus 28 at 32 w')
  assert.equal(fundusFits(18, { weeks: 20, days: 0 }), null, 'before 24 weeks: not judged')
})
test('what is due: at these weeks, for her (worked out from the booking), not yet taken', () => {
  const rh = { age: 29, booking: { rh: 'negative' as const, risks: ['previous_caesarean'] } }
  assert.deepEqual(dueNow(SCHEDULE, 28, rh).map(dueWord), ['OGTT', 'anti-D', 'tetanus toxoid'])
  assert.deepEqual(dueNow(SCHEDULE, 28, { age: 26, booking: { rh: 'positive' } }).map(dueWord), ['OGTT', 'tetanus toxoid'], 'Rh positive: no anti-D')
  assert.deepEqual(dueNow(SCHEDULE, 28, rh, ['tetanus toxoid', 'OGTT']).map(dueWord), ['anti-D'], 'what was taken is not due again')
  assert.deepEqual(dueNow(SCHEDULE, 36, rh).map(dueWord), ['birth plan'])
  assert.equal(nextVisit(28, [{ until: 28, weeks: 4 }, { until: 36, weeks: 2 }, { until: 42, weeks: 1 }]), 30); assert.equal(nextVisit(20, [{ until: 28, weeks: 4 }]), 24)
  assert.equal(gpOf({ gravida: 3, para: 1, miscarriages: 1 }), 'G3 P1+1'); assert.equal(gpOf({ gravida: 1, para: 0 }), 'G1 P0'); assert.equal(gpOf(null), null)
})
const mk = (kind: Mark['kind'], daysBack: number, data: Record<string, unknown>): Mark => ({ kind, at: new Date(now.getTime() - daysBack * DAY).toISOString(), data })
const X = { schedule: SCHEDULE, notices: { bp_sys: 140, bp_dia: 90, protein: '++' as const }, age: null }
test('the queue\'s word: a warning first, then what is due, then the weeks', () => {
  const preg = (lmp: number) => mk('pregnancy', 100, { status: 'current', pregnant: true, lmp: daysAgo(lmp) })
  assert.deepEqual(markWord([preg(212), mk('bp', 0, { sys: 150, dia: 100 })], now, X), { word: 'BP 150/100', tone: 'warn' })
  assert.deepEqual(markWord([preg(212), mk('bp', 3, { sys: 150, dia: 100 })], now, X), { word: 'tetanus toxoid due', tone: 'info' }, 'a BP of another day warns no more')
  assert.deepEqual(markWord([preg(199), mk('anc', 30, { rh: 'negative', taken: ['OGTT', 'tetanus toxoid'] })], now, X), { word: 'anti-D due', tone: 'info' })
  assert.deepEqual(markWord([preg(256), mk('anc', 30, { rh: 'positive' })], now, X), { word: '36 w' })
  assert.deepEqual(markWord([preg(315)], now, X), { word: 'birth not written', tone: 'info' }, 'past 42 weeks, never ended')
  assert.deepEqual(markWord([preg(199), mk('anc', 0, { protein: '++' })], now, X), { word: 'protein ++', tone: 'warn' })
  const iud = mk('method', 365 * 10 + 214, { method: 'Copper IUD' })
  assert.deepEqual(markWord([iud], now, { ...X, methods: [{ method: 'Copper IUD', every: 10, unit: 'years' }] }), { word: 'IUD change due', tone: 'info' })
  assert.equal(markWord([mk('method', 100, { method: 'Copper IUD' })], now, { ...X, methods: [{ method: 'Copper IUD', every: 10, unit: 'years' }] }), null, 'not pregnant, nothing due: no word')
})
test('a method\'s change: the longest rule its name fits, past or not', () => {
  const rules = [{ method: 'Hormonal IUD', every: 8, unit: 'years' as const }, { method: 'Hormonal IUD, heavy periods', every: 5, unit: 'years' as const }, { method: 'Injection (DMPA 150 mg)', every: 12, unit: 'weeks' as const }]
  assert.equal(methodDue('Hormonal IUD, heavy periods', '2026-10-08', rules, now)?.on, '2031-10-08', 'the picture: change by Oct 2031')
  const inj = methodDue('Injection', daysAgo(90), rules, now)!; assert.equal(inj.past, true); assert.equal(inj.short, 'Injection')
})
test('Hadlock: the picture\'s fetal weight, its centile for the weeks, the weeks each measure fits', () => {
  assert.equal(efw({ bpd: 78, hc: 288, ac: 245, fl: 57 }), 1419, 'EFW 1 419 g')
  const c = efwCentile(1419, { weeks: 32, days: 0 }); assert.ok(c < 10, `small for the weeks (${c})`)
  assert.ok(efwCentile(1953, { weeks: 32, days: 0 }) === 50, 'the mean at 32 weeks is the 50th')
  const ac = fitsWeeks('ac', 245)!; assert.ok(ac.weeks >= 28 && ac.weeks <= 29, `the AC fits 28–29 weeks (${ac.weeks}+${ac.days})`)
  assert.equal(efw({ bpd: 78, hc: 288 }), null, 'all four or none')
})
const facts = (lmpDays: number) => ({ facts: { pregnancy: { entry_id: 'p1', data: { status: 'current', pregnant: true, lmp: { value: daysAgo(lmpDays), precision: 'day' } }, words: 'Pregnant' }, breastfeeding: null, alerts: [] }, now })
test('/anc: the base\'s vitals and the antenatal check, the weeks from the standing pregnancy', () => {
  const ds = ok(parseAnc('bp 118/74 wt 71 sfh 29 fhr 144 ceph nil', facts(199)))
  assert.deepEqual(ds.map((d) => d.function), ['vitals', 'obgyn.anc'])
  assert.deepEqual(ds[0].params, { systolic: 118, diastolic: 74, weight: 71 })
  assert.equal(ds[1].line, 'Antenatal visit · 28+3 w · fundus 29 · FHR 144 · cephalic · urine nil')
  assert.equal(ancLine({ weeks: 28, days: 3, taken: ['anti-D'] }), 'Antenatal visit · 28+3 w · taken: anti-D')
  const r = parseAnc('bp 118/74 sings', facts(199)); assert.ok(r && 'error' in r)
  assert.deepEqual(ok(parseAnc('sfh 20', { now })).map((d) => d.function), ['obgyn.anc'], 'no BP or weight: the check alone, the weeks filled by the card')
})
test('/obus: a base result with no order, the fetal weight worked out, read back by the card', () => {
  const [d] = ok(parseScan('bpd 78 hc 288 ac 245 fl 57 dvp 1.8 post ceph fhr 146', facts(224)))
  assert.equal(d.function, 'result'); const p = d.params as { status: string; analytes: { key: string; interpretation?: string }[]; service: { name: string } }
  assert.equal(p.status, 'final'); assert.equal(p.service.name, 'Scan in the clinic')
  assert.ok(p.analytes.some((a) => a.key === 'efw' && a.interpretation === 'L'), 'the weight low for the weeks: L')
  assert.ok(p.analytes.some((a) => a.key === 'dvp' && a.interpretation === 'L'), 'the pool under 2 cm: L')
  assert.match(d.line, /^Scan in the clinic · 32\+0 w · EFW 1 419 g, \d+(st|nd|rd|th) centile · AC 245 mm · deepest pool 1\.8 cm · posterior · cephalic · FHR 146$/)
  const back = scanIn(d.params); assert.equal(back.ac, 245); assert.equal(back.placenta, 'posterior'); assert.deepEqual(back.weeks, { weeks: 32, days: 0 })
})
test('/fp, /periods, /pn: base entries where the base has the idea, the pack\'s where not', () => {
  const fp = ok(parseFp('hormonal iud')); assert.deepEqual(fp.map((d) => d.function), ['observation', 'procedure'])
  assert.equal((fp[0].params as { value: { text: string } }).value.text, 'Hormonal IUD'); assert.equal(fp[1].line, 'Hormonal IUD inserted · no problems')
  assert.deepEqual(ok(parseFp('mini pill')).map((d) => d.function), ['observation'], 'a pill: no procedure')
  const pe = ok(parsePeriods('lmp 2026-09-21 26-28 8-9 heavy clots moderate'))[0]
  assert.equal(pe.line, 'Periods · LMP 2026-09-21 · every 26–28 days · 8–9 days · heavy, clots · pain moderate')
  const pn = ok(parsePn('bp 122/78 bleeding none wound healed breast', facts(315)))
  assert.deepEqual(pn.map((d) => d.function), ['vitals', 'obgyn.postnatal', 'pregnancy', 'breastfeeding'], 'a pregnancy still standing ends here, once')
  assert.equal((pn[2].params as { action: string; reason: string }).action, 'end')
  assert.deepEqual(ok(parsePn('bleeding light', { facts: { pregnancy: null, breastfeeding: null, alerts: [] } })).map((d) => d.function), ['obgyn.postnatal'], 'no pregnancy standing: nothing to end')
})
console.log(`obgyn: ${n} groups passed`)
