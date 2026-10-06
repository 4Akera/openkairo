// A score is worked out once (spec/openCare.md §5.1 rule 8): /score and each score's alias, the card's state from the server's answer
// (never added up here), what a draft still needs, the entry Done writes, the debounced preview, and Settings → Scores' words. Pure: no
// browser, no database.   npm run test:scores
import assert from 'node:assert/strict'
import type { ScoreTable, SettingRow } from '../src/core/db/types'
import { parse, type Ctx } from '../src/core/screens/visit/parse'
import { expand } from '../src/core/screens/visit/expand'
import { draftEntries } from '../src/core/db/entries'
import { aliasLine, bandRange, cardState, current, draft, emptyScore, failedNow, inUse, keyOf, offered, previewer, rangeWords, scoreData, scoreLine, scoreMissing, signOffOf,
  type ScoreParams, type ScoreResult, type Timers } from '../src/core/screens/visit/score'

let n = 0
const test = async (name: string, fn: () => void | Promise<void>) => { try { await fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const choice = (v: string, pts: number, en: string) => ({ value: v, points: pts, labels: { en } })
// the base's GCS and the probe score, as the SQL suites declare them (scores.sql)
const GCS: ScoreTable = { key: 'gcs', version: '1974', layer: 'base', labels: { en: 'Glasgow Coma Scale' }, short: 'GCS', alias: 'gcs', source: 'Teasdale G, Jennett B. Lancet 1974',
  coding: { system: 'loinc', code: '9269-2' }, retired_at: null, declared_at: '2026-10-06T00:00:00Z',
  items: [{ key: 'eye', labels: { en: 'Eye opening' }, input: 'choice', choices: [choice('4', 4, 'Spontaneously'), choice('3', 3, 'To speech'), choice('2', 2, 'To pain'), choice('1', 1, 'None')] },
    { key: 'verbal', labels: { en: 'Verbal response' }, input: 'choice', choices: [choice('5', 5, 'Oriented'), choice('4', 4, 'Confused'), choice('3', 3, 'Inappropriate words'), choice('2', 2, 'Incomprehensible sounds'), choice('1', 1, 'None')] },
    { key: 'motor', labels: { en: 'Motor response' }, input: 'choice', choices: [choice('6', 6, 'Obeys commands'), choice('5', 5, 'Localises to pain'), choice('4', 4, 'Withdraws from pain'), choice('3', 3, 'Abnormal flexion'), choice('2', 2, 'Extension'), choice('1', 1, 'None')] }],
  bands: [{ key: 'severe', labels: { en: 'Severe' }, min: 3, max: 8, tone: 'danger' }, { key: 'moderate', labels: { en: 'Moderate' }, min: 9, max: 12, tone: 'warn' }, { key: 'mild', labels: { en: 'Mild' }, min: 13, max: 15, tone: null }] }
const PEW: ScoreTable = { key: 'probe.early', version: '1', layer: 'probe', labels: { en: 'Probe early warning' }, short: 'PEW', alias: 'pew', source: 'tests only', coding: null, retired_at: null, declared_at: '2026-10-06T00:00:00Z',
  items: [{ key: 'rr', labels: { en: 'Respiratory rate' }, input: 'number', unit: '/min', decimals: 0, min: 0, max: 80, ranges: [{ max: 8, points: 3 }, { min: 9, max: 11, points: 1 }, { min: 12, max: 20, points: 0 }, { min: 21, max: 24, points: 2 }, { min: 25, points: 3 }] },
    { key: 'temp', labels: { en: 'Temperature' }, input: 'number', unit: '°C', decimals: 1, ranges: [{ max: 35, points: 3 }, { min: 35.1, max: 36, points: 1 }, { min: 36.1, max: 38, points: 0 }, { min: 38.1, max: 39, points: 1 }, { min: 39.1, points: 2 }] },
    { key: 'avpu', labels: { en: 'Consciousness' }, input: 'choice', choices: [choice('a', 0, 'Alert'), choice('v', 3, 'Voice'), choice('p', 3, 'Pain'), choice('u', 3, 'Unresponsive')] },
    { key: 'oxygen', labels: { en: 'On oxygen' }, input: 'yes_no', points: { yes: 2, no: 0 } }],
  bands: [{ key: 'low', labels: { en: 'Low' }, min: 0, max: 4 }, { key: 'medium', labels: { en: 'Medium' }, min: 5, max: 6, tone: 'warn' }, { key: 'high', labels: { en: 'High' }, min: 7, max: 11, tone: 'danger' }] }
const GCS_OLD: ScoreTable = { ...GCS, version: '1970', retired_at: '2026-01-01T00:00:00Z' }
const ctx: Ctx = { departmentId: 'icu', services: [], templates: [], departments: [], problems: [], scores: [GCS_OLD, GCS, PEW], packs: ['probe'] }
const ok = (line: string, c: Ctx = ctx) => { const r = parse(line, c); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok[0] }
const err = (line: string, c: Ctx = ctx) => { const r = parse(line, c); assert.ok(r && 'error' in r, `${line} should be refused, got ${JSON.stringify(r)}`); return r.error }
const params = (line: string) => ok(line).params as unknown as ScoreParams
/** the server's answer, as core.score sends it */
const answer = (p: ScoreParams, items: [string, number | null][], total: number | null, band: string | null, problems: { item: string; code: string }[] = []): ScoreParams => {
  const t = p.score === 'gcs' ? GCS : PEW
  const r: ScoreResult = { score: t.key, version: t.version, retired: false, items: items.map(([key, points]) => ({ key, points })), so_far: items.reduce((a, [, x]) => a + (x ?? 0), 0),
    total, complete: total !== null, band: t.bands.find((b) => b.key === band) ?? null, missing: [], problems }
  return { ...p, result: { ...r, for: keyOf(p) } }
}

await test('/score and the alias: each kind of input, by place or by name', () => {
  const g = ok('/score gcs 4 4 6'); assert.equal(g.function, 'score'); assert.equal(g.action, 'write:score'); assert.equal(g.kind, 'score')
  assert.deepEqual(params('/score gcs 4 4 6'), { score: 'gcs', version: '1974', short: 'GCS', inputs: { eye: '4', verbal: '4', motor: '6' }, result: null }, 'the version in use, never the retired one')
  assert.deepEqual(params('/gcs e4 v4 m6').inputs, { eye: '4', verbal: '4', motor: '6' }, '/gcs is /score gcs; e4 names the eye')
  assert.deepEqual(params('/gcs eye 3 motor 5').inputs, { eye: '3', motor: '5' }, 'an item by its name, then its value')
  assert.deepEqual(params('/score glasgow 4').inputs, { eye: '4' }, 'the score by the start of its name')
  assert.deepEqual(params('/score pew 16 37.2 a no').inputs, { rr: '16', temp: '37.2', avpu: 'a', oxygen: false }, 'a whole number, a decimal, a choice, yes/no')
  assert.deepEqual(params('/pew rr=8 temp:35.0 oxygen yes').inputs, { rr: '8', temp: '35.0', oxygen: true }, 'key=value, key:value, key value')
  assert.deepEqual(params('/score pew 16 37 voice').inputs, { rr: '16', temp: '37', avpu: 'v' }, 'a choice by the start of its words')
  assert.match(err('/gcs 7'), /Eye opening: “7” — one of 4 · 3 · 2 · 1/)
  assert.match(err('/gcs 4 4 6 1'), /one too many/)
  assert.match(err('/score pew fast'), /Respiratory rate: “fast” — a number/)
  assert.match(err('/score apache'), /No score “apache” — try \/score gcs · \/score pew/)
  assert.match(err('/score pew 16', { ...ctx, packs: [] }), /No score “pew”/, 'a pack\'s score only where the department uses the pack')
  assert.match(err('/pew 16', { ...ctx, packs: [] }), /No command \/pew/)
  assert.match(err('/score gcs', { ...ctx, can: (a) => a !== 'write:score' }), /not open to your role/)
  const e = expand('/gcs 4 5 6', ctx, []); assert.equal(e?.items[0].function, 'score', 'the line expands through the alias too')
  assert.deepEqual(aliasLine(['v', '120/80'], ctx, true), ['v', '120/80'], 'a command keeps its name')
})

await test('/score alone: the one score, or a card that asks which', () => {
  assert.equal((emptyScore({ scores: [GCS], packs: [] })[0].params as unknown as ScoreParams).score, 'gcs')
  assert.equal((emptyScore(ctx)[0].params as unknown as ScoreParams).score, null)
  const e = expand('/score', ctx, []); assert.equal(e?.items.length, 1); assert.match(e!.label ?? '', /fill the card/)
})

await test('the card\'s state is the server\'s: points, total and band only from its answer, for these inputs', () => {
  const p = params('/gcs 4 4 6')
  const before = cardState(GCS, p)
  assert.deepEqual(before.items.map((i) => [i.key, i.value, i.points]), [['eye', '4', null], ['verbal', '4', null], ['motor', '6', null]], 'nothing added up here')
  assert.ok(before.waiting && before.total === null && before.band === null && !before.complete)
  assert.deepEqual(before.items[0].options.map((o) => `${o.label} ${o.points}`), ['Spontaneously 4', 'To speech 3', 'To pain 2', 'None 1'], 'the table\'s points beside each choice')
  const after = cardState(GCS, answer(p, [['eye', 4], ['verbal', 4], ['motor', 6]], 14, 'mild'))
  assert.deepEqual(after.items.map((i) => i.points), [4, 4, 6]); assert.equal(after.total, 14); assert.deepEqual(after.band, { words: 'Mild', tone: 'neutral' }); assert.ok(after.complete && !after.waiting)
  const moderate = cardState(GCS, answer(params('/gcs 3 3 5'), [['eye', 3], ['verbal', 3], ['motor', 5]], 11, 'moderate')); assert.deepEqual(moderate.band, { words: 'Moderate', tone: 'warn' })
  const severe = cardState(GCS, answer(params('/gcs 1 1 1'), [['eye', 1], ['verbal', 1], ['motor', 1]], 3, 'severe')); assert.deepEqual(severe.band, { words: 'Severe', tone: 'danger' })
  const changed = { ...answer(p, [['eye', 4], ['verbal', 4], ['motor', 6]], 14, 'mild'), inputs: { eye: '3', verbal: '4', motor: '6' } }
  assert.ok(!current(changed)); const stale = cardState(GCS, changed); assert.equal(stale.total, null, 'an answer to other inputs is not shown'); assert.ok(stale.waiting)
  const half = cardState(GCS, answer(params('/gcs 3'), [['eye', 3], ['verbal', null], ['motor', null]], null, null)); assert.equal(half.soFar, 3); assert.equal(half.total, null)
  const bad = cardState(PEW, answer(params('/pew 90'), [['rr', null], ['temp', null], ['avpu', null], ['oxygen', null]], null, null, [{ item: 'rr', code: 'out_of_range' }]))
  assert.equal(bad.items[0].problem, 'out of range'); assert.deepEqual(bad.items[3].options.map((o) => o.label), ['Yes', 'No'])
})

await test('what a draft still needs, its line, and the entry Done writes', () => {
  const p = params('/gcs 4')
  assert.equal(scoreMissing({ ...p, score: null }, undefined), 'Choose the score')
  assert.equal(scoreMissing(p, GCS), 'Answer: Verbal response, Motor response')
  const full = params('/gcs 4 4 6'); assert.equal(scoreMissing(full, GCS), 'Working out the total…', 'Done waits for the server')
  const done = answer(full, [['eye', 4], ['verbal', 4], ['motor', 6]], 14, 'mild'); assert.equal(scoreMissing(done, GCS), null)
  assert.equal(scoreMissing(answer(params('/pew 90 37 a no'), [['rr', null]], null, null, [{ item: 'rr', code: 'out_of_range' }]), PEW), 'Respiratory rate: out of range')
  assert.match(scoreMissing(done, GCS_OLD) ?? '', /retired/)
  assert.equal(scoreLine(full), 'GCS'); assert.equal(scoreLine(done), 'GCS 14 · Mild'); assert.equal(scoreLine({ ...done, inputs: { eye: '1' } }), 'GCS', 'a stale answer says nothing')
  assert.deepEqual(scoreData(done), { score: 'gcs', version: '1974', inputs: { eye: '4', verbal: '4', motor: '6' }, total: 14, band: 'mild' })
  const [e] = draftEntries({ id: 'd1', function: 'score', params: done as unknown as Record<string, unknown> }, { patientId: 'p1', departmentId: 'icu' })
  assert.deepEqual({ type: e.type, data: e.data }, { type: 'score', data: { score: 'gcs', version: '1974', inputs: { eye: '4', verbal: '4', motor: '6' }, total: 14, band: 'mild' } }, 'the server\'s total, the version it used')
  assert.equal(draft(GCS).line, 'GCS')
})

await test('the preview asks once the clinician pauses, and drops a late answer to an older question', async () => {
  let clock = 0; const due: { at: number; fn: () => void; id: number }[] = []; let ids = 0
  const timers: Timers = { set: (fn, ms) => { const id = ++ids; due.push({ at: clock + ms, fn, id }); return id }, clear: (h) => { const i = due.findIndex((d) => d.id === h); if (i >= 0) due.splice(i, 1) } }
  const tick = (ms: number) => { clock += ms; for (const d of due.filter((x) => x.at <= clock)) { due.splice(due.indexOf(d), 1); d.fn() } }
  const asked: string[] = []; const pending: ((v: string) => void)[] = []; const got: string[] = []; const fails: string[] = []
  const pv = previewer((i: string) => { asked.push(i); return new Promise<string>((res) => pending.push(res)) }, (i, r) => got.push(`${i}=${r}`), (i) => fails.push(i), 250, timers)
  pv.request('e4'); tick(100); pv.request('e4 v4'); tick(100); pv.request('e4 v4 m6'); tick(249)
  assert.deepEqual(asked, [], 'typing: not yet'); tick(1); assert.deepEqual(asked, ['e4 v4 m6'], 'one question, the last')
  pv.request('e3 v4 m6'); tick(250); assert.deepEqual(asked, ['e4 v4 m6', 'e3 v4 m6'])
  pending[0]('14'); await Promise.resolve(); assert.deepEqual(got, [], 'the answer to the older question is dropped')
  pending[1]('13'); await Promise.resolve(); assert.deepEqual(got, ['e3 v4 m6=13'])
  pv.request('e1'); pv.cancel(); tick(500); assert.equal(asked.length, 2, 'cancelled: never asked')
  const bad = previewer((i: string) => Promise.reject(new Error(`no ${i}`)), () => assert.fail('no answer'), (i) => fails.push(i), 250, timers)
  bad.request('x'); tick(250); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(fails, ['x'], 'a failure is said')
})

await test('a failed preview: the card says so and stops waiting; a retry or a changed answer waits again', () => {
  const full = params('/gcs 4 4 6'); const down: ScoreParams = { ...full, failed: { for: keyOf(full), message: 'Network down' } }
  const st = cardState(GCS, down); assert.equal(st.failed, 'Network down'); assert.ok(!st.waiting, 'nothing is in flight: no …')
  assert.equal(scoreMissing(down, GCS), 'The server could not add it up — try again', 'not "Working out the total…"')
  assert.equal(scoreMissing({ ...down, failed: null }, GCS), 'Working out the total…', 'Try again clears it and waits')
  const moved = { ...down, inputs: { ...down.inputs, eye: '3' } }; assert.equal(failedNow(moved), null); assert.ok(cardState(GCS, moved).waiting, 'a failure for other inputs is not shown')
  const back = answer(down, [['eye', 4], ['verbal', 4], ['motor', 6]], 14, 'mild'); assert.equal(failedNow(back), null); assert.equal(scoreMissing(back, GCS), null, 'an answer wins')
})

await test('Settings → Scores: the versions in use, ranges and bands in words, who signed a version off', () => {
  assert.deepEqual(inUse([GCS_OLD, GCS, PEW]).map((t) => `${t.key} ${t.version}`), ['gcs 1974', 'probe.early 1'], 'a retired version is not in use')
  const v2 = { ...PEW, version: '2' }; assert.equal(inUse([PEW, v2])[0].version, '2', 'the last declared is the latest')
  assert.deepEqual(offered([GCS, PEW], ['pharmacy']).map((t) => t.key), ['gcs'], 'a pack\'s score where its pack is used')
  assert.deepEqual(PEW.items[0].ranges!.map((r) => rangeWords(r)), ['≤ 8', '9–11', '12–20', '21–24', '≥ 25'])
  assert.deepEqual(PEW.items[1].ranges!.map((r) => rangeWords(r, 1)), ['≤ 35.0', '35.1–36.0', '36.1–38.0', '38.1–39.0', '≥ 39.1'])
  assert.deepEqual(GCS.bands.map(bandRange), ['3–8', '9–12', '13–15'])
  const row = (key: string, version: string, at: string, by: string): SettingRow => ({ key: 'score.signed_off', thing_id: `t-${at}`, owner_id: 'o1', data: { score: key, version }, recorded_at: at, author_id: by })
  const settings = [row('gcs', '1970', '2026-01-01', 'u0'), row('gcs', '1974', '2026-10-01', 'u1'), row('probe.early', '1', '2026-10-02', 'u2')]
  assert.equal(signOffOf(settings, 'gcs', '1974')?.author_id, 'u1'); assert.equal(signOffOf(settings, 'probe.early', '2'), undefined, 'a new version is not signed off by the old one\'s')
})

console.log(`✓ test:scores — ${n} groups`)
