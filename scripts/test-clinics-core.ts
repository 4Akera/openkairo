// The clinics' core changes (spec/openCare.md §5.7, the owner 2026-10-08; spec/build-clinics.md C1–C5), proven with a test-only probe
// pack: C1 a pack's line under the /rx and /v cards and after the draft; C2 /v reading length and head; C3 a pack command that is not an
// order offered by works for; C4 a pack's step in New patient; C5 a pack's rows under the board; and (the owner 2026-10-09) C6 a pack's
// draft that refers to an item, C7 a tile line's own read. Pure: no browser, no database.
// npm run test:clinics-core
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parse, type Ctx } from '../src/core/screens/visit/parse'
import { cardFor, notHere, registerCard, registerCommand, commandsFor, type Command } from '../src/core/screens/visit/commands'
import { cardLineDefs, cardLinesOf, registerCardLine, type CardLineCtx } from '../src/core/screens/visit/lines'
import { CardLines, DraftLine } from '../src/core/screens/visit/CardLines'
import { vitalsFields, monthsOld } from '../src/core/screens/visit/vitals'
import { draftEntries } from '../src/core/db/entries'
import { newPatientStepDefs, newPatientStepsFor, registerNewPatientStep } from '../src/core/shell/newPatientSteps'
import { boardRowsDefs, boardRowsFor, minutesSince, registerBoardRows, rowButtons, rowsNotIn, type BoardRow } from '../src/core/screens/ward/rows'
import { registerTileLine, tileLineDefs, tileLineOf, tileReadsFor, type TileCtx } from '../src/core/screens/ward/tiles'
import type { PresenceRow } from '../src/core/db/types'
import type { Organization } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const quiet = <T,>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn() } finally { console.error = e } }

// ── C1 · a pack's line under a base card ──
const lctx = (packs: string[], more: Partial<CardLineCtx> = {}): CardLineCtx => ({ departmentId: 'paeds', packs, now: new Date('2026-10-08T10:00:00Z'),
  record: { patient: { id: 'p1', record_number: 1, given_name: 'Jana', middle_name: null, family_name: 'Moataz', sex: 'female', born_on: '2023-08-01', age: 3, died_on: null, merged_into_id: null, phone_text: null },
    values: [{ id: 'v1', item: 'v1', key: 'weight', patient_id: 'p1', code: null, name: null, value: 14.2, ucum: 'kg', unit: 'kg', interpretation: null, at: '2026-10-08T08:05:00Z', entry_id: 'e1', visit_id: null, source_entries: [] }],
    medications: [], allergies: [], allergy_review: null }, ...more })
test('C1: a pack registers one line under /rx and one under /v; a second, another card, the base and the core are refused', () => {
  assert.equal(registerCardLine('probe', 'medication', 'Paediatrics', (q, c) => {
    const kg = c.record?.values.find((v) => v.key === 'weight')?.value; const mg = Number(q.dose_number) * 3
    if (!kg || !q.dose_number) return null
    const perKg = Math.round(mg / kg)
    return { rows: [[`${kg} kg today`, `${mg} mg a day = ${perKg} mg/kg/day`], [{ text: 'in the clinic’s range', tone: perKg <= 90 ? 'ok' : 'warn' }, 'usual 40–90 mg/kg a day']],
      short: [{ text: `${perKg} mg/kg/day`, tone: perKg <= 90 ? 'ok' : 'warn' }] }
  }), true)
  assert.equal(registerCardLine('probe', 'vitals', 'Paediatrics', (q) => q.weight ? { rows: [[{ text: 'weight z −2.07', tone: 'warn' }, 'length z −0.92'], ['WHO 2006, girls']], short: 'weight z −2.07' } : null), true)
  assert.equal(registerCardLine('other', 'medication', 'Nephrology', () => { throw new Error('boom') }), true)
  assert.equal(registerCardLine('loud', 'medication', 'Loud', () => ({ rows: [[{ text: 'shouted', tone: 'accent' as never }]] })), true)
  quiet(() => {
    assert.equal(registerCardLine('probe', 'medication', 'Again', () => null), false, 'one line a pack and card')
    assert.equal(registerCardLine('probe', 'problem' as never, 'Dx', () => null), false, 'only under /rx and /v')
    assert.equal(registerCardLine('base', 'vitals', 'Base', () => null), false)
    assert.equal(registerCardLine('core', 'vitals', 'Core', () => null), false)
  })
})
test('C1: only the packs this department uses speak, in its pack order; a failing pack says nothing; a colour only for a state', () => {
  const rx = { action: 'start', drug: { name: 'Amoxicillin' }, dose_number: 375, dose_unit: 'mg', frequency: 'TDS' }
  assert.deepEqual(cardLinesOf(cardLineDefs(), 'medication', rx, lctx([])), [], 'a department not using the pack hears nothing')
  const lines = quiet(() => cardLinesOf(cardLineDefs(), 'medication', rx, lctx(['loud', 'other', 'probe'])))
  assert.deepEqual(lines.map((l) => l.pack), ['loud', 'probe'], 'the failing pack is left out, the order is the department’s')
  assert.deepEqual(lines[0].rows[0], [{ text: 'shouted' }], 'a tone that is not a state is dropped')
  const p = lines[1]
  assert.equal(p.title, 'Paediatrics')
  assert.deepEqual(p.rows[0], [{ text: '14.2 kg today' }, { text: '1125 mg a day = 79 mg/kg/day' }])
  assert.deepEqual(p.short, [{ text: '79 mg/kg/day', tone: 'ok' }])
  assert.deepEqual(cardLinesOf(cardLineDefs(), 'problem', rx, lctx(['probe'])), [], 'no line under another card')
  assert.deepEqual(cardLinesOf(cardLineDefs(), 'medication', { ...rx, dose_number: null }, lctx(['probe'])), [], 'a pack with nothing to say says nothing')
  const html = renderToStaticMarkup(createElement(CardLines, { lines: [p] }))
  assert.match(html, /Paediatrics/); assert.match(html, /79 mg\/kg\/day/); assert.match(html, /text-ok/)
  const draft = renderToStaticMarkup(createElement(DraftLine, { lines: [p] }))
  assert.match(draft, /79 mg\/kg\/day/); assert.doesNotMatch(draft, /14.2 kg today/, 'after the draft only the short words')
  assert.equal(renderToStaticMarkup(createElement(DraftLine, { lines: [{ ...p, short: [] }] })), '', 'no short words, nothing after the draft')
})

// ── C2 · /v reads length and head ──
const ctx: Ctx = { departmentId: 'paeds', now: new Date('2026-10-08T10:00:00Z'), services: [], templates: [], problems: [],
  departments: [{ id: 'paeds', name: 'Paediatrics clinic', packs: [] }, { id: 'bb', name: 'Blood bank', packs: ['probe'] }, { id: 'ward', name: 'Surgical ward', packs: [] }] }
const one = (line: string, c: Ctx = ctx) => { const r = parse(line, c); assert.ok(r && 'ok' in r, `${line} → ${JSON.stringify(r)}`); return r.ok[0] }
test('C2: /v wt len hc: the base keys weight, height measured lying and head', () => {
  const d = one('/v wt 7.5 len 72.4 hc 45.4')
  assert.deepEqual(d.params, { weight: 7.5, length: 72.4, head: 45.4 })
  assert.equal(d.line, 'Wt 7.5 · Length 72.4 (lying) · Head 45.4')
  const [e] = draftEntries({ id: 'x', function: 'vitals', params: d.params }, { patientId: 'p1', departmentId: 'paeds' })
  assert.deepEqual(e.data, { weight: { value: '7.5', unit: 'kg', ucum: 'kg' }, height: { value: '72.4', unit: 'cm', ucum: 'cm' }, head: { value: '45.4', unit: 'cm', ucum: 'cm' }, method: 'lying' })
  assert.deepEqual(one('/v length 80 head 47 ofc 47.5').params, { length: 80, head: 47.5 })
  const [h] = draftEntries({ id: 'y', function: 'vitals', params: one('/v ht 120 hc 50').params }, { patientId: 'p1', departmentId: 'paeds' })
  assert.equal((h.data as { method?: string }).method, undefined, 'a height typed as height is standing: no method')
  const r = parse('/v ht 80 len 79', ctx); assert.ok(r && 'error' in r && /not both/.test(r.error))
  assert.deepEqual(one('/v 148/92 84 37 86').params, { systolic: 148, diastolic: 92, pulse: 84, temperature: 37, weight: 86 }, 'the adult line as before')
})
test('C2: the card shows Length and Head for a child under two, the adult card otherwise (with length or head when said)', () => {
  const now = new Date('2026-10-08T10:00:00Z')
  assert.equal(monthsOld('2025-11-02', now), 11); assert.equal(monthsOld(null, now), null)
  assert.deepEqual(vitalsFields({}, '2025-11-02', now).map(([k]) => k), ['weight', 'length', 'head', 'temperature', 'pulse', 'respiratory_rate', 'spo2'])
  const adult = vitalsFields({}, '1968-03-01', now).map(([k]) => k)
  assert.ok(adult.includes('systolic') && adult.includes('height') && !adult.includes('head'))
  const said = vitalsFields({ length: 98, head: 50 }, '2023-06-01', now).map(([k]) => k)
  assert.ok(said.includes('length') && said.includes('head') && !said.includes('height'), 'a three-year-old measured lying: length in place of height')
})

// ── C3 · a pack command that is not an order, offered by works for ──
const transfuse: Command = { name: 'probefuse', pack: 'probe', worksFor: true, label: 'Transfusion', example: '/probefuse', action: 'write:given', writes: ['probe.given'],
  parse: (rest) => ({ ok: [{ function: 'probe.given', params: { units: Number(rest) || 1 }, line: `Transfusion ${rest}`, kind: 'given' }] }) }
registerCommand(transfuse)
test('C3: offered where a department using the pack works for this one, or where it is ticked; elsewhere it says where', () => {
  const served = { ...ctx, packs: [], servedBy: ['bb'] }
  assert.ok(commandsFor(served).some((c) => c.name === 'probefuse'), 'the Blood bank works for the paediatrics clinic')
  assert.equal(one('/probefuse 2', served).function, 'probe.given')
  const alone = { ...ctx, packs: [], servedBy: ['ward'] }
  assert.ok(!commandsFor(alone).some((c) => c.name === 'probefuse'))
  const away = notHere(transfuse, alone)
  assert.match(away ?? '', /offered where Blood bank works for the department; it does not work for Paediatrics clinic/)
  const r = parse('/probefuse 2', alone); assert.ok(r && 'error' in r && /Blood bank/.test(r.error))
  assert.ok(commandsFor({ ...ctx, departmentId: 'bb', packs: ['probe'], servedBy: [] }).some((c) => c.name === 'probefuse'), 'ticked here: offered')
  const none = { ...ctx, departments: ctx.departments.map((d) => ({ ...d, packs: [] })), packs: [], servedBy: ['bb'] }
  assert.match(notHere(transfuse, none) ?? '', /not used in any department/)
})
test('C3: the pack’s card for what that command writes draws wherever the command is offered by works for', () => {
  const Editor = () => null
  registerCard({ function: 'probe.given', Editor, pack: 'probe' })
  assert.equal(cardFor('probe.given', { ...ctx, packs: [], servedBy: ['bb'] })?.Editor, Editor, 'the ward the Blood bank works for')
  assert.equal(cardFor('probe.given', { ...ctx, departmentId: 'bb', packs: ['probe'], servedBy: [] })?.Editor, Editor, 'the Blood bank itself')
  assert.equal(cardFor('probe.given', { ...ctx, packs: [], servedBy: ['ward'] }), undefined, 'not where the pack neither is used nor serves')
  registerCard({ function: 'other.thing', Editor, pack: 'other' })
  assert.equal(cardFor('other.thing', { ...ctx, departments: [...ctx.departments, { id: 'o', name: 'Other', packs: ['other'] }], packs: [], servedBy: ['o'] }), undefined,
    'a pack with no works-for command serves nobody’s cards')
})

// ── C4 · a pack's step in the desk's New patient ──
const org = (packs: { key: string; enabled: boolean }[], ask = true) => ({ packs: packs.map((p) => ({ ...p, name: p.key, stale: 0, work: { stale: 0, failing: 0, parked: 0, waiting: 0, catchUp: null } })),
  settings: [{ key: 'probe.ask', value: { ask } }] }) as unknown as Organization
test('C4: one step a pack, asked only where its pack is on and its own setting says so; one that fails is left out', () => {
  const Part = () => null
  assert.equal(registerNewPatientStep('probe', { show: (o) => !!(o.settings as unknown as { key: string; value: { ask: boolean } }[]).find((s) => s.key === 'probe.ask')?.value.ask,
    Part, missing: (v) => v ? null : 'Join a family file or start one', after: async () => 'joined file 12' }), true)
  assert.equal(registerNewPatientStep('broken', { show: () => { throw new Error('boom') }, Part, after: async () => null }), true)
  quiet(() => {
    assert.equal(registerNewPatientStep('probe', { show: () => true, Part, after: async () => null }), false, 'once per pack')
    assert.equal(registerNewPatientStep('base', { show: () => true, Part, after: async () => null }), false)
  })
  const on = org([{ key: 'probe', enabled: true }, { key: 'broken', enabled: true }])
  assert.deepEqual(quiet(() => newPatientStepsFor(newPatientStepDefs(), on)).map((s) => s.pack), ['probe'])
  assert.deepEqual(newPatientStepsFor(newPatientStepDefs(), org([{ key: 'probe', enabled: false }])), [], 'a pack off asks nothing')
  assert.deepEqual(newPatientStepsFor(newPatientStepDefs(), org([{ key: 'probe', enabled: true }], false)), [], 'its setting off asks nothing')
  assert.deepEqual(newPatientStepsFor(newPatientStepDefs(), undefined), [])
  const step = newPatientStepDefs().find((s) => s.pack === 'probe')!
  assert.equal(step.missing!(null), 'Join a family file or start one'); assert.equal(step.missing!({ file: 12 }), null)
})

// ── C5 · a pack's rows under the board ──
const row = (k: string, patientId: string, more: Partial<BoardRow> = {}): BoardRow => ({ key: k, patientId, name: k, words: ['FOLFIRI C2 D1', { text: 'ANC 1.2', tone: 'warn' }], ...more })
const useNone = () => ({ rows: [] })
test('C5: one registration a pack, at most two buttons of its own, never a base word; listed in the department’s pack order', () => {
  assert.equal(registerBoardRows('probe', { title: 'Today’s cycles not in a chair yet', view: 'Not in a chair yet', useRows: useNone,
    start: (r, stay) => [{ id: 'z', type: 'probe.session', patient_id: r.patientId, department_id: stay.department_id, visit_id: stay.id, data: { place: stay.place_id } } as never],
    buttons: [{ label: 'Not today', onClick: () => {} }, { label: 'Call', show: (r) => r.patientId !== 'p9', onClick: () => {} }] }), true)
  assert.equal(registerBoardRows('dial', { title: 'Due this shift', view: 'Due', useRows: useNone, buttons: [{ label: 'Broken', show: () => { throw new Error('x') }, onClick: () => {} }] }), true)
  quiet(() => {
    assert.equal(registerBoardRows('probe', { title: 'x', view: 'x', useRows: useNone }), false, 'once a pack')
    assert.equal(registerBoardRows('three', { title: 'x', view: 'x', useRows: useNone, buttons: [1, 2, 3].map((i) => ({ label: `B${i}`, onClick: () => {} })) }), false, 'at most two buttons')
    assert.equal(registerBoardRows('mine', { title: 'x', view: 'x', useRows: useNone, buttons: [{ label: 'Start', onClick: () => {} }] }), false, 'Start is the base’s')
    assert.equal(registerBoardRows('base', { title: 'x', view: 'x', useRows: useNone }), false)
  })
  assert.deepEqual(boardRowsFor(boardRowsDefs(), { packs: ['dial', 'ward', 'probe'] }).map((d) => d.pack), ['dial', 'probe'])
  assert.deepEqual(boardRowsFor(boardRowsDefs(), { packs: ['ward'] }), [], 'a department not using the pack has no rows')
})
test('C5: a patient already in a place here is not listed again; the minutes; a button whose show fails is hidden', () => {
  assert.deepEqual(rowsNotIn([row('a', 'p1'), row('b', 'p2')], new Set(['p2'])).map((r) => r.key), ['a'])
  assert.equal(minutesSince('2026-10-08T10:00:00Z', Date.parse('2026-10-08T10:35:30Z')), 35); assert.equal(minutesSince(null), null)
  const [probe, dial] = [boardRowsDefs().find((d) => d.pack === 'probe')!, boardRowsDefs().find((d) => d.pack === 'dial')!]
  const c = { dept: { id: 'du', packs: ['probe'] }, can: () => true }
  assert.deepEqual(rowButtons(probe, row('a', 'p1'), c).map((b) => b.label), ['Not today', 'Call'])
  assert.deepEqual(rowButtons(probe, row('a', 'p9'), c).map((b) => b.label), ['Not today'])
  assert.deepEqual(quiet(() => rowButtons(dial, row('a', 'p1'), c)), [])
  const [e] = probe.start!(row('a', 'p1'), { id: 'stay', place_id: 'chair2', department_id: 'du' })
  assert.equal((e as { visit_id: string }).visit_id, 'stay', 'the pack’s entries go in Start’s own set, in the stay just opened')
})

test('C6: a pack draft\'s `refers` becomes refers_to and relation, never its data; without it, as before', () => {
  const where = { patientId: 'p', departmentId: 'd' }
  const [changed] = draftEntries({ id: 'x', function: 'probe.thing', params: { a: 1, refers: { entry_id: 'e1', relation: 'changes' } } }, where)
  assert.equal(changed.refers_to, 'e1'); assert.equal(changed.relation, 'changes'); assert.deepEqual(changed.data, { a: 1 })
  const [about] = draftEntries({ id: 'y', function: 'probe.thing', params: { a: 2, refers: { entry_id: 'op', relation: 'about' } } }, where)
  assert.equal(about.refers_to, 'op'); assert.equal(about.relation, 'about'); assert.deepEqual(about.data, { a: 2 })
  const [plain] = draftEntries({ id: 'z', function: 'probe.thing', params: { a: 3 } }, where)
  assert.equal(plain.refers_to, undefined); assert.equal(plain.relation, undefined); assert.deepEqual(plain.data, { a: 3 })
})

test('C7: a tile line\'s read reaches its own line only, where the department uses the pack; none yet, the line says what it can', () => {
  const useRead = () => ['p1']
  assert.equal(registerTileLine('reader', (r, c) => ({ words: (c.read as string[] | undefined)?.includes(r.patient_id) ? 'read' : 'not yet' }), useRead), true)
  assert.equal(registerTileLine('other', (_r, c) => ({ words: c.read === undefined ? 'nothing' : 'leak' })), true)
  assert.deepEqual(tileReadsFor(tileLineDefs(), { packs: ['reader', 'other'] }).map((d) => d.pack), ['reader'], 'only a line that reads')
  assert.deepEqual(tileReadsFor(tileLineDefs(), { packs: ['other'] }), [], 'not where the pack is not used')
  const ctx = { dept: { id: 'w', packs: ['reader', 'other'] }, place: null, identity: null, day: 1, can: () => true } as TileCtx
  const row = { patient_id: 'p1' } as PresenceRow
  assert.deepEqual(tileLineOf(tileLineDefs(), row, ctx, { reader: ['p1'], other: 'x' }).map((s) => s.words[0].text), ['read', 'nothing'], 'each pack sees only its own read (none was asked for other)')
  assert.deepEqual(tileLineOf(tileLineDefs(), row, ctx).map((s) => s.words[0].text), ['not yet', 'nothing'], 'before the read lands')
})

console.log(`✓ clinics core: ${n} checks passed`)
