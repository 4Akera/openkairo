// The chart's banner (spec/openCare.md §5.1 rule 3): its zones in their one order; who without the phone; the safety zone the same in
// every department (allergies, the base alerts never naming HIV, critical results, pregnant or breastfeeding); the pack words (only
// the packs this department uses, ranked, two shown, the rest behind +n on a second line), proven on pharmacy's "1 to collect".
// Pure: no browser, no database.   npm run test:banner
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setClinicTimeZone } from '../src/core/ui/time'
import { ZONES, safetyOf, whoOf } from '../src/core/screens/chart/model/banner'
import { HIV_PATTERN, alertWord, breastfeedingOf, namesHiv, pregnancyOf, weeksOn } from '../src/core/screens/chart/model/facts'
import { SHOWN, packWordsOf, registerBannerWords, wordDefs, wordLines, wordTypes, type WordsDef } from '../src/core/screens/chart/words'
import { collectWords, suppliedOf } from '../src/packs/pharmacy/dispensed'
import type { Identity, ServerEntry } from '../src/core/db/types'
import { E, ctx, listRow, next, record, reviewRow, table } from './chart-fixtures'

setClinicTimeZone('Africa/Cairo')
let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const TODAY = '2026-10-06'
const words = (xs: { word: string }[]) => xs.map((x) => x.word)
const identity = { gender: 'female', birth_date: '1990-05-01' } as Identity
const alert = (text: string, code?: string, status = 'active') => E('alert', { data: { concept: { text, codings: code ? [{ system: 'local.alert', code }] : [] }, status } })
const allergy = (text: string, more: Record<string, unknown> = {}) => E('allergy', { data: { concept: { text }, clinical_status: 'active', verification: 'confirmed', ...more } })
const allergies = (...es: ServerEntry[]) => ({ 'base.lists': table(es.map((e) => listRow('allergies', [e], 'active')), es) })
const nka = () => { const r = E('list_review', { data: { list: 'allergies', outcome: 'none_known' } }); return { 'base.lists': table([listRow('reviews', [r], 'active')], [r]) } }
const preg = (data: Record<string, unknown>, at = '2026-09-06T08:00:00Z') => E('pregnancy', { occurred_at: at, data: { status: 'current', ...data } })
const safety = (o: { tables?: Parameters<typeof record>[0]; facts?: ServerEntry[]; departmentId?: string } = {}) =>
  safetyOf({ rec: record(o.tables ?? {}), ctx: { ...ctx, departmentId: o.departmentId ?? ctx.departmentId }, facts: o.facts, today: TODAY })

test('the zones, in their one order: who, where, safety, this department\'s words', () => {
  assert.deepEqual([...ZONES], ['who', 'where', 'safety', 'packs'])
})
test('who: name, age, sex and record number; no phone; deceased said', () => {
  const p = { given_name: 'Mona', family_name: 'Fathy', age: 32, sex: 'female', record_number: 10482, died_on: null, phone_text: '010 1234 5678' }
  assert.deepEqual(whoOf(p), { name: 'Mona Fathy', sub: '32 y · F · #10482', deceased: false }); assert.ok(!whoOf(p).sub.includes('010'), 'the phone lives in the Summary')
  assert.equal(whoOf({ ...p, died_on: '2026-10-01' }).deceased, true)
})
test('safety: allergies — severe by name, the others counted; none known; not asked in warn', () => {
  const s = safety({ tables: allergies(allergy('Penicillin', { criticality: 'high' }), allergy('Latex', { reactions: [{ manifestation: { text: 'rash' }, severity: 'mild' }] }), allergy('Dust')) })
  assert.deepEqual(s.map((x) => [x.kind, x.word, x.tone]), [['allergy', 'Penicillin', 'danger'], ['allergies', '+2 allergies', 'neutral']])
  assert.deepEqual(words(safety({ tables: allergies(allergy('Dust')) })), ['1 allergy'])
  assert.deepEqual(safety({ tables: nka() }).map((x) => [x.word, x.tone]), [['No known allergies', 'neutral']])
  assert.deepEqual(safety().map((x) => [x.word, x.tone]), [['Allergies not asked', 'warn']])
})
test('safety: the base alerts in short words; a fall risk is a caution; an ended alert is gone; HIV is never named', () => {
  const ended = alert('Isolation · HCV', 'isolation_hcv'); const facts = [alert('Do not resuscitate', 'dnr'), alert('Isolation · HBV', 'isolation_hbv'), alert('Fall risk', 'fall_risk'),
    ended, next(ended, 'alert', { concept: { text: 'Isolation · HCV' }, status: 'inactive' })]
  const s = safety({ tables: nka(), facts }).filter((x) => x.kind === 'alert')
  assert.deepEqual(s.map((x) => [x.word, x.tone]).sort(), [['DNR', 'danger'], ['Fall risk', 'warn'], ['Isolation · HBV', 'danger']])
  for (const f of [alert('Isolation (HIV)'), alert('HIV positive — isolate', 'isolation'), alert('hiv')]) {
    const w = words(safety({ facts: [f] })).join(' | '); assert.ok(!/hiv/i.test(w), `never named: ${w}`); assert.ok(w.includes('Isolation'), w)
  }
  assert.equal(alertWord('Violence risk', 'local.alert:violence_risk'), 'Violence risk', 'other alerts keep their words')
  for (const t of ['Isolation AIDS', 'Isolation - human immunodeficiency virus', 'Isolation HIV1', 'isolation_hiv', 'B20', 'b24.0', 'Z21', 'Isolation · الإيدز'])
    { assert.ok(namesHiv(t), t); assert.equal(alertWord(t, null), 'Isolation', t) }
  for (const t of ['DNR', 'Isolation · HBV', 'Fall risk', 'Shivering', 'Bed B201', 'Archive']) assert.ok(!namesHiv(t), t)
  assert.ok(words(safety({ facts: [alert('Isolation AIDS'), alert('Isolation', 'B20')] })).every((w) => !/aids|b20/i.test(w)), 'AIDS and B20 never reach the banner')
})
test('one HIV pattern: the server\'s base.names_hiv holds the client\'s', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260926000008_base_types.sql', import.meta.url), 'utf8')
  assert.ok(sql.includes(`~* '${HIV_PATTERN}'`), 'base.names_hiv and namesHiv differ')
})
test('safety: critical results waiting, whoever they wait for (one per result)', () => {
  const r = E('result', { data: { status: 'final' } })
  const tables = { ...nka(), 'base.review': table([reviewRow(r, { critical: true, why: 'critical' }), reviewRow(r, { item: 'r2', entry_id: r.id }),
    reviewRow(r, { critical: true, why: 'flag', for_user: null, for_department: 'gp' })], [r]) }
  assert.deepEqual(words(safety({ tables }).filter((x) => x.kind === 'critical')), ['1 critical to review'])
})
test('pregnant and breastfeeding: the latest current fact, weeks from the LMP or from the weeks said; not pregnant or ended says nothing', () => {
  assert.equal(weeksOn({ lmp: '2026-07-07', at: '2026-09-06T08:00:00Z' }, TODAY), 13, 'from the LMP: 91 days')
  assert.equal(weeksOn({ weeks: 12, at: '2026-09-06T08:00:00Z' }, TODAY), 16, 'the weeks said a month ago, and the weeks since')
  assert.deepEqual(words(safety({ tables: nka(), facts: [preg({ pregnant: true, lmp: { value: '2026-07-07', precision: 'day' } })] })), ['No known allergies', 'Pregnant · 13 wk'])
  assert.deepEqual(words(safety({ tables: nka(), facts: [preg({ pregnant: true })] })), ['No known allergies', 'Pregnant'])
  const was = preg({ pregnant: true, weeks: 30 }); const over = next(was, 'pregnancy', { status: 'ended', pregnant: true, weeks: 30, reason: 'Delivered' })
  assert.equal(pregnancyOf([was, over], ctx.org.types, TODAY), null, 'ended'); assert.deepEqual(words(safety({ tables: nka(), facts: [preg({ pregnant: false })] })), ['No known allergies'])
  const bf = E('breastfeeding', { data: { status: 'current', breastfeeding: true } })
  assert.deepEqual(words(safety({ tables: nka(), facts: [over, was, bf] })), ['No known allergies', 'Breastfeeding'])
  assert.equal(breastfeedingOf([bf, next(bf, 'breastfeeding', { status: 'ended', breastfeeding: true })], ctx.org.types), null)
})
test('safety is the same in every department and for every reader: pregnant and critical results in pharmacy, the ward and psychiatry alike', () => {
  const facts = [preg({ pregnant: true, weeks: 20 }), alert('DNR', 'dnr')]; const r1 = E('result', { data: { status: 'final' } }); const r2 = E('result', { data: { status: 'final' } })
  const tables = { ...allergies(allergy('Penicillin', { criticality: 'high' })), 'base.review': table([reviewRow(r1, { critical: true, why: 'critical', for_user: 'er-doctor', for_department: 'er' }),
    reviewRow(r2, { critical: true, why: 'flag', for_user: null, for_department: 'er' })], [r1, r2]) }
  const here = words(safety({ tables, facts })); assert.ok(here.includes('Pregnant · 24 wk')); assert.ok(here.includes('2 critical to review'), here.join(' | '))
  for (const d of ['er', 'ph', 'ward', 'psy', 'lab']) assert.deepEqual(words(safety({ tables, facts, departmentId: d })), here, d)
  assert.deepEqual(words(safetyOf({ rec: record(tables), ctx: { ...ctx, me: 'er-doctor', departmentId: 'er' }, facts, today: TODAY })), here, 'the reader they wait for')
})
test('a pregnancy never ended past 44 weeks is to check (warn), never counting on as a plain pregnancy', () => {
  const old = preg({ pregnant: true, weeks: 30 }, '2025-06-01T08:00:00Z'); const p = pregnancyOf([old], ctx.org.types, TODAY)
  assert.equal(p?.overdue, true); const s = safety({ tables: nka(), facts: [old] }).find((x) => x.kind === 'pregnant')
  assert.deepEqual([s?.word, s?.tone], ['Pregnancy · check (100 wk)', 'warn'])
  const lmp = preg({ pregnant: true, lmp: { value: '2025-11-20', precision: 'day' } }); assert.equal(pregnancyOf([lmp], ctx.org.types, TODAY)?.overdue, true, '45 weeks from the LMP')
  const undated = preg({ pregnant: true }, '2025-09-01T08:00:00Z'); assert.equal(words(safety({ tables: nka(), facts: [undated] }))[1], 'Pregnancy · check', 'undated, recorded 57 weeks ago')
  const term = preg({ pregnant: true, lmp: { value: '2026-01-01', precision: 'day' } }); assert.equal(pregnancyOf([term], ctx.org.types, TODAY)?.overdue, false, '39 weeks: a plain pregnancy')
})

// ── this department's words ──
const def = (key: string, ws: [string, number][]): WordsDef => ({ key, layer: key.split('.')[0], types: [], words: () => ws.map(([word, rank]) => ({ word, rank })) })
const x = { rec: record(), ctx, identity }
test('pack words: only the packs this department uses; ranked (1 first; ties by the department\'s pack order); two shown, the rest behind +n', () => {
  const list = [def('obgyn.anc', [['ANC due', 2], ['GDM', 1]]), def('pharmacy.collect', [['1 to collect', 1]]), def('growth.z', [['Underweight', 1]])]
  assert.deepEqual(packWordsOf(list, x, []), { shown: [], more: [] }, 'a department that uses none says nothing')
  assert.deepEqual(words(packWordsOf(list, x, ['pharmacy']).shown), ['1 to collect'])
  const w = packWordsOf(list, x, ['pharmacy', 'obgyn'])
  assert.equal(SHOWN, 2); assert.deepEqual(words(w.shown), ['1 to collect', 'GDM'], 'rank 1 first, the department\'s first pack before its second'); assert.deepEqual(words(w.more), ['ANC due'])
  assert.deepEqual(words(packWordsOf(list, x, ['obgyn', 'pharmacy']).shown), ['GDM', '1 to collect'])
  assert.ok(!words([...w.shown, ...w.more]).includes('Underweight'), 'growth is not used here')
  const failing: WordsDef = { key: 'broken.x', layer: 'broken', types: [], words: () => { throw new Error('boom') } }
  const err = console.error; console.error = () => {}
  try { assert.deepEqual(words(packWordsOf([failing, ...list], x, ['broken', 'pharmacy']).shown), ['1 to collect'], 'a pack whose words fail says nothing') } finally { console.error = err }
})
test('the second line: +n opens the rest in place and folds it again; with nothing more, no +n', () => {
  const w = packWordsOf([def('obgyn.anc', [['a', 1], ['b', 2], ['c', 3], ['d', 4]])], x, ['obgyn'])
  const shut = wordLines(w, false); const open = wordLines(w, true)
  assert.deepEqual(words(shut.first), ['a', 'b']); assert.equal(shut.toggle, '+2'); assert.equal(shut.second, null)
  assert.deepEqual(words(open.first), ['a', 'b']); assert.deepEqual(words(open.second ?? []), ['c', 'd'], 'open: the rest on the second line')
  const few = wordLines(packWordsOf([def('obgyn.anc', [['a', 1]])], x, ['obgyn']), true); assert.equal(few.toggle, null); assert.equal(few.second, null)
})
test('the registry: a pack\'s key, taken once; its types read with the sections\'', () => {
  const err = console.error; const said: string[] = []; console.error = (m: string) => { said.push(m) }
  try {
    registerBannerWords({ key: 'test.words', types: ['test.thing'], words: () => [] }); registerBannerWords({ key: 'test.words', types: [], words: () => [] })
    registerBannerWords({ key: 'nopack', types: [], words: () => [] })
  } finally { console.error = err }
  assert.equal(wordDefs().filter((d) => d.key === 'test.words').length, 1); assert.ok(!wordDefs().some((d) => d.key === 'nopack')); assert.equal(said.length, 2)
  assert.ok(wordTypes().includes('test.thing'))
})
test('pharmacy: a prepared dispense says "1 to collect" in a department that uses pharmacy, and nothing once given or elsewhere', () => {
  const prep = E('pharmacy.dispense', { data: { status: 'in-progress', step: 'prepared' } }); const other = E('pharmacy.dispense', { data: { status: 'in-progress' } })
  const pharmacy: WordsDef = { key: 'pharmacy.collect', layer: 'pharmacy', types: ['pharmacy.dispense'], words: (y) => collectWords(suppliedOf(y.own)) }
  assert.deepEqual(words(packWordsOf([pharmacy], { ...x, packs: [prep] }, ['pharmacy']).shown), ['1 to collect'])
  assert.deepEqual(words(packWordsOf([pharmacy], { ...x, packs: [prep, other] }, ['pharmacy']).shown), ['2 to collect'])
  assert.deepEqual(packWordsOf([pharmacy], { ...x, packs: [prep] }, []).shown, [], 'a clinic that does not use pharmacy: nothing')
  const given = next(prep, 'pharmacy.dispense', { status: 'completed', pharmacy: { items: [] } })
  assert.deepEqual(packWordsOf([pharmacy], { ...x, packs: [prep, given] }, ['pharmacy']).shown, [], 'given: nothing to collect')
  assert.deepEqual(collectWords([]), [])
})
console.log(`banner: ${n} groups passed`)
