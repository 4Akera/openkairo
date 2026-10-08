// Respiratory (spec/openCare.md §5.7), as pure decisions: /spiro before and after, worked out against the server's GLI-2012 LMS (LLN,
// % predicted, z), what the numbers say (obstruction under the LLN, reversible at 200 mL and 12 %, the GOLD grade); the result it writes
// (no order, LOINC on the before values, the LLN as each range); /technique, /flare, /plan; the Chest section's reads.   npm run test:respiratory
import assert from 'node:assert/strict'
import { lln, parseSpiro, readingOf, spiroData, spiroOf, zOf, type Predicted, type SpiroParams } from '../src/packs/respiratory/spiro'
import { flare, planDraft, registerCommands, technique } from '../src/packs/respiratory/commands'
import { flaresOf, planOf, scoresOf, techniqueOk } from '../src/packs/respiratory/airways'
import { parse, type Ctx } from '../src/core/screens/visit/parse'
import type { ServerEntry } from '../src/core/db/types'
registerCommands()

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
// the demo sample's cell for a man of 61, 170 cm (as the picture reads it)
const P: Predicted = { cell: 'male:61:170', fev1: { m: 3.05, l: 1, s: 0.1495 }, fvc: { m: 3.98, l: 1, s: 0.139 }, ratio: { m: 0.77, l: 1, s: 0.0948 } }
const pic: SpiroParams = { pre: { fev1: 1.62, fvc: 2.86 }, post: { fev1: 1.72, fvc: 2.98 }, height: 170, quality: 'A', predicted: P }

test('LMS: the LLN and z as GLI-2012 works them out (the picture: FEV1 LLN 2.30, z −2.9; FVC 3.07, −1.8; ratio 0.65, −2.6)', () => {
  assert.equal(lln(P.fev1!).toFixed(2), '2.30'); assert.equal(lln(P.fvc!).toFixed(2), '3.07'); assert.equal(lln(P.ratio!).toFixed(2), '0.65')
  assert.equal(zOf(1.72, P.fev1!).toFixed(1), '-2.9'); assert.equal(zOf(2.98, P.fvc!).toFixed(1), '-1.8'); assert.equal(zOf(0.58, P.ratio!).toFixed(1), '-2.6')
})
test('what the numbers say: obstruction under the LLN, not reversible (+100 mL, +6 %), GOLD 2 at 56 %', () => {
  const r = readingOf(pic); assert.equal(r.obstruction, true); assert.equal(r.reversible, false); assert.deepEqual(r.change, { ml: 100, pct: 6 }); assert.equal(r.grade, 2); assert.equal(r.pct, 56)
  assert.deepEqual(r.words, ['obstruction: FEV1/FVC 0.58 under the LLN 0.65', 'not reversible: +100 mL, +6 %', 'GOLD 2: FEV1 56 % of predicted'])
  assert.equal(readingOf({ ...pic, post: { fev1: 1.95, fvc: 3.1 } }).reversible, true, '+330 mL and +20 %: reversible')
  assert.equal(readingOf({ ...pic, predicted: null }).obstruction, true, 'no predicted values: under 0.70')
})
test('/spiro: the line, the result it writes (no order; before with LOINC, the LLN as each range, % and z after), read back', () => {
  const r = parseSpiro('fev1 1.62 fvc 2.86 post 1.72 2.98', 170); assert.ok(r && 'ok' in r); const d = r.ok[0]
  assert.equal(d.function, 'result'); assert.deepEqual(spiroOf(d.params).post, { fev1: 1.72, fvc: 2.98 }); assert.equal(spiroOf(d.params).height, 170)
  const data = spiroData(pic); const as = data.analytes as { key: string; code?: { code: string }; range?: { low: { value: string } }; interpretation?: string; value?: { value: string } }[]
  assert.deepEqual(as.filter((a) => a.code).map((a) => a.code!.code), ['20150-9', '19870-5', '19926-5'])
  assert.equal(as.find((a) => a.key === 'fev1_post')!.range!.low.value, '2.3'); assert.equal(as.find((a) => a.key === 'ratio_post')!.interpretation, 'L')
  assert.equal(as.find((a) => a.key === 'fev1_pct')!.value!.value, '56'); assert.equal(as.find((a) => a.key === 'fev1_z')!.value!.value, '-2.9')
  assert.match(String(data.conclusion), /GOLD 2.*GLI-2012/)
  const bad = parseSpiro('fev1 162', 170); assert.ok(bad && 'error' in bad)
})
test('/technique, /flare, /plan: the base\'s observations in the pack\'s terms', () => {
  const t = technique('breezhaler: breathed out into it'); assert.ok(t && 'ok' in t); assert.deepEqual(t.ok[0].params.value, { text: 'Breezhaler: breathed out into it' })
  const c = technique('breezhaler: correct'); assert.ok(c && 'ok' in c); assert.deepEqual(c.ok[0].params.value, { text: 'correct · Breezhaler' })
  const f = flare('prednisolone 5 days ; at home'); assert.ok(f && 'ok' in f); assert.equal(f.ok[0].params.note, 'at home')
  assert.equal(planOf({ data: planDraft().params } as unknown as ServerEntry).length, 3, 'three zones')
})
const e = (type: string, data: Record<string, unknown>, at: string): ServerEntry => ({ id: `${type}${at}`, type, data, occurred_at: at } as unknown as ServerEntry)
test('the Chest section\'s reads: the latest of each score, the flares of the last year, the technique', () => {
  const s = scoresOf([e('score', { score: 'respiratory.gold', total: 3, band: 'e' }, '2026-09-02'), e('score', { score: 'respiratory.cat', total: 18, band: 'medium' }, '2026-09-02'),
    e('score', { score: 'respiratory.cat', total: 12, band: 'medium' }, '2026-01-02')])
  assert.equal(s.gold?.band, 'e'); assert.equal(s.cat?.total, 18)
  const term = (code: string, text: string, note?: string) => ({ code: { codings: [{ system: 'respiratory.terms', code }] }, value: { text }, ...(note ? { note } : {}) })
  const fl = flaresOf([e('observation', term('flare', 'prednisolone', 'at home'), '2026-02-01'), e('observation', term('flare', 'old'), '2024-01-01')], new Date('2026-10-08'))
  assert.deepEqual(fl.map((x) => x.treated), ['prednisolone'])
  assert.equal(techniqueOk(e('observation', term('inhaler_technique', 'correct · Breezhaler'), '2026-10-08')), true)
  assert.equal(techniqueOk(e('observation', term('inhaler_technique', 'Breezhaler: breathed out into it'), '2026-10-08')), false)
})
test('/spiro only where the department ticks the pack', () => {
  const ctx = (packs: string[]): Ctx => ({ services: [], departments: [{ id: 'chest', name: 'Chest clinic', packs: ['respiratory'] }], problems: [], departmentId: 'x', packs, templates: [], usedIn: () => ['Chest clinic'] })
  const r = parse('/spiro fev1 1.6', ctx([])); assert.ok(r && 'error' in r && /Chest clinic/.test(r.error))
  assert.ok((parse('/spiro fev1 1.6', ctx(['respiratory'])) as { ok?: unknown[] }).ok)
})
console.log(`✓ respiratory: ${n} groups of checks`)
