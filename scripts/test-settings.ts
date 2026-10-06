// Every setting editable in the app (spec/openCare.md §5.1 rule 7): the automatic form drawn from each kind of shape, its checks (the
// same as the server's shape), a refusal shown next to its field, what it sends, the defaults, the history's words, a pack's own
// editor, and pharmacy's two settings as Dispensing reads them. Pure: no browser, no database.   npm run test:settings
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { allNodes, clean, defaultsOf, errorsFrom, formOf, initialOf, placeErrors, settingIn, summary, validate, valueWords, type FormNode } from '../src/core/screens/settings/form/model'
import { registerSettingEditor, settingEditor, type SettingEditorProps } from '../src/core/screens/settings/form/registry'
import { AutoForm } from '../src/core/screens/settings/form/AutoForm'
import { counselling, lateAfter, lateBy, preparedSince } from '../src/packs/pharmacy/settings'
import type { Organization, SettingKey } from '../src/core/db/types'

let n = 0
const test = (name: string, fn: () => void) => { try { fn(); n++ } catch (e) { console.error(`✗ ${name}`); throw e } }
const by = (ns: FormNode[], path: string) => { const x = allNodes(ns).find((y) => y.path === path); assert.ok(x, `no node ${path}`); return x! }
const DEFS = { quantity: { type: 'object', required: ['value'], properties: { value: { type: 'string' }, unit: { type: 'string' } } } }

// the probe: one setting with every kind of field (the SQL suite settings.sql declares the same shape)
const PROBE: SettingKey = { key: 'probe.everything', layer: 'probe', owner_kind: 'organization', many: false, labels: { en: 'Everything' }, form: 'pack',
  shape: { type: 'object', additionalProperties: false, required: ['scale'], properties: {
    contact: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, phone: { type: 'string', pattern: '^[+0-9 ]+$' } } },
    scale: { enum: ['news2', 'pews'] }, wait: { type: 'integer', minimum: 0, maximum: 120, default: 15 }, greeting: { type: 'string', maxLength: 40 }, strict: { type: 'boolean' },
    rows: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['drug'], properties: { drug: { type: 'string', minLength: 1 }, dose: { type: 'number', minimum: 0 } } } },
    tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    shifts: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, nurses: { type: 'integer' }, note: { type: 'string' } } } },
    units: { type: 'array', items: { enum: ['mg', 'mL'] } }, amount: { $ref: '#/$defs/quantity' },
    note: { type: 'string' }, level: { enum: [1, 2, 3] } } },
  fields: [{ key: 'scale', labels: { en: 'Scale' }, choices: { news2: { en: 'NEWS2' }, pews: { en: 'PEWS' } } }, { key: 'wait', labels: { en: 'Wait' }, unit: 'min', help: { en: 'Before the alert.' } },
    { key: 'greeting', labels: { en: 'Greeting' } }, { key: 'strict', labels: { en: 'Strict' } }, { key: 'rows', labels: { en: 'Rows' } }, { key: 'rows.drug', labels: { en: 'Drug' } },
    { key: 'rows.dose', labels: { en: 'Dose' }, unit: 'mg' }, { key: 'tags', labels: { en: 'Tags' } }, { key: 'contact', labels: { en: 'Contact' } },
    { key: 'contact.name', labels: { en: 'Name' } }, { key: 'contact.phone', labels: { en: 'Phone' } },
    { key: 'units', labels: { en: 'Units' }, choices: { mg: { en: 'Milligrams' }, mL: { en: 'Millilitres' } } },
    { key: 'level', labels: { en: 'Level' }, choices: { 1: { en: 'Low' }, 2: { en: 'Medium' }, 3: { en: 'High' } } }] }
const nodes = formOf(PROBE, DEFS)

test('each kind of shape draws its own field', () => {
  assert.deepEqual(nodes.map((x) => x.kind), ['choice', 'number', 'text', 'yesno', 'table', 'list', 'group', 'list', 'choice', 'list', 'other', 'text'], 'in the declared order, the rest after')
  const scale = by(nodes, 'scale'); assert.ok(scale.kind === 'choice' && scale.required); assert.deepEqual(scale.kind === 'choice' && scale.options.map((o) => o.label), ['NEWS2', 'PEWS'], 'choices with their words')
  const wait = by(nodes, 'wait'); assert.ok(wait.kind === 'number' && wait.integer && wait.unit === 'min' && wait.min === 0 && wait.max === 120 && wait.placeholder === '15')
  assert.equal(wait.help, 'Before the alert.')
  const g = by(nodes, 'greeting'); assert.ok(g.kind === 'text' && !g.long, 'short words: one line'); const note = by(nodes, 'note'); assert.ok(note.kind === 'text' && note.long, 'no limit: a box')
  assert.equal(note.label, 'Note', 'a field without words reads its key')
  assert.equal(by(nodes, 'strict').kind, 'yesno')
  const rows = by(nodes, 'rows'); assert.ok(rows.kind === 'table'); assert.deepEqual(rows.kind === 'table' && rows.columns.map((c) => `${c.label}${c.kind === 'number' ? ` ${c.unit}` : ''}`), ['Drug', 'Dose mg'], 'a small table')
  const tags = by(nodes, 'tags'); assert.ok(tags.kind === 'list' && tags.item.kind === 'text', 'a list of words to add to')
  const units = nodes.find((x) => x.name === 'units')!; assert.ok(units.kind === 'list' && units.item.kind === 'choice', 'a list of choices: chips to tick')
  assert.deepEqual(units.kind === 'list' && units.item.kind === 'choice' && units.item.options.map((o) => o.label), ['Milligrams', 'Millilitres'], 'with their words')
  const level = by(nodes, 'level'); assert.deepEqual(level.kind === 'choice' && level.options.map((o) => [o.value, o.label]), [[1, 'Low'], [2, 'Medium'], [3, 'High']], 'a numeric choice keeps its number')
  const shifts = nodes.find((x) => x.name === 'shifts')!; assert.ok(shifts.kind === 'list' && shifts.item.kind === 'group' && shifts.item.children.length === 5, 'five fields a row: a group each, not a table')
  const contact = by(nodes, 'contact'); assert.ok(contact.kind === 'group'); assert.deepEqual(contact.kind === 'group' && contact.children.map((c) => c.label), ['Name', 'Phone'], 'a sub-section')
  assert.equal(nodes.find((x) => x.name === 'amount')!.kind, 'other', 'a datatype: its pack\'s own editor')
})

test('the checks are the shape\'s, by the value\'s path', () => {
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews' }, DEFS), {})
  assert.deepEqual(validate(PROBE.shape, {}, DEFS), { scale: 'Needed' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'x' }, DEFS), { scale: 'Pick one of the choices' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', wait: 121 }, DEFS), { wait: 'At most 120' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', wait: 2.5 }, DEFS), { wait: 'A whole number' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', greeting: 'x'.repeat(41) }, DEFS), { greeting: 'At most 40 characters' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', strict: 'yes' }, DEFS), { strict: 'Yes or no' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', rows: [{ drug: 'a', dose: 1 }, { dose: -1 }] }, DEFS), { 'rows.1.drug': 'Needed', 'rows.1.dose': 'At least 0' }, 'a table: the row and its column')
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', tags: ['a', 'a'] }, DEFS), { tags: 'Each once' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', contact: { phone: 'call me' } }, DEFS), { 'contact.phone': 'Not in the right form' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', extra: 1 }, DEFS), { extra: 'Not a field of this setting' })
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', amount: { unit: 'mg' } }, DEFS), { 'amount.value': 'Needed' }, 'a datatype through $defs')
  assert.deepEqual(validate({ anyOf: [{ required: ['a'] }, { required: ['b'] }], properties: { a: { type: 'string' }, b: { type: 'string' } } }, {}), { '': 'Not in the right form' })
})

test('what the form sends: blank words and unset values left out; it starts from what is saved, else the defaults', () => {
  assert.deepEqual(clean({ scale: 'pews', greeting: '  ', wait: undefined, rows: [{ drug: 'a', dose: undefined }], contact: { name: '' } }), { scale: 'pews', rows: [{ drug: 'a' }], contact: {} })
  assert.deepEqual(validate(PROBE.shape, clean({ scale: 'pews', rows: [{ drug: '' }] }), DEFS), { 'rows.0.drug': 'Needed' }, 'a blank cell is missing, so needed')
  assert.deepEqual(defaultsOf(PROBE.shape), { wait: 15 })
  assert.deepEqual(defaultsOf({ type: 'object', required: ['show', 'x'], properties: { show: { type: 'boolean' }, x: { type: 'object', properties: { n: { type: 'integer', default: 3 } } } } }), { show: false, x: { n: 3 } },
    'a required yes/no starts at no; a required sub-section with its own defaults')
  assert.deepEqual(initialOf(PROBE, undefined), { wait: 15 }); assert.deepEqual(initialOf(PROBE, { scale: 'news2' }), { scale: 'news2' }, 'saved wins whole')
})

test('a refusal from the server sits next to the field it names, else over the Save', () => {
  assert.deepEqual(errorsFrom({ message: 'Write the note to show, or turn it off', field: 'note' }), { note: 'Write the note to show, or turn it off' })
  assert.deepEqual(errorsFrom({ message: 'Your role cannot do this here' }), { '': 'Your role cannot do this here' })
  const props = (errors: Record<string, string>, value: Record<string, unknown> = { scale: 'pews', rows: [{ drug: 'a', dose: -1 }] }): SettingEditorProps =>
    ({ decl: PROBE, nodes, value, onChange: () => {}, errors, disabled: false })
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AutoForm, props({ note: 'Write the note to show, or turn it off', 'rows.0.dose': 'At least 0' }))))
  const at = (s: string) => html.indexOf(s)
  assert.ok(at('Write the note to show') > at('>Note<'), 'the note\'s refusal comes after its label')
  assert.ok(at('Write the note to show') > at('aria-label="Note"'), 'and after its box')
  assert.ok(at('At least 0') > at('aria-label="Dose (mg)"') && at('At least 0') < at('Remove row 1'), 'a cell\'s, in its own row')
  assert.equal((html.match(/role="alert"/g) ?? []).length, 2, 'one line each, no more')
  assert.ok(/<fieldset[^>]*disabled/.test(renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AutoForm, { ...props({}), disabled: true })))), 'read-only: the whole form')
  for (const w of ['NEWS2', 'min', 'Before the alert.', '>Yes<', 'Row', 'Add', 'Contact', 'Phone', 'optional', 'Its pack']) assert.ok(html.includes(w), `drawn: ${w}`)
})

const pressed = (html: string, label: string) => html.split('<button').find((b) => b.includes(`>${label}<`))?.includes('aria-pressed="true"')

test('a numeric choice keeps its number: shown chosen, sent as a number; a list of choices ticks its own words', () => {
  const lvl = by(nodes, 'level'); assert.deepEqual(validate(PROBE.shape, { scale: 'pews', level: 2 }, DEFS), {}, 'the number the chip sends passes the shape')
  assert.deepEqual(validate(PROBE.shape, { scale: 'pews', level: '2' }, DEFS), { level: 'Pick one of the choices' }, 'its words never would')
  assert.equal(valueWords(lvl, 2), 'Medium')
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AutoForm, { decl: PROBE, nodes, value: { scale: 'pews', level: 2, units: ['mL'] }, onChange: () => {}, errors: {}, disabled: false })))
  assert.ok(pressed(html, 'Medium') && !pressed(html, 'Low'), 'a saved 2 shows Medium chosen'); assert.ok(pressed(html, 'Millilitres') && !pressed(html, 'Milligrams'), 'a list of choices, by its words')
  assert.ok(!/radiogroup[^>]*aria-label="(Level|Scale)"/.test(html) && html.includes('role="group" aria-label="Level"'), 'chips are buttons in a named group, not a radio group')
  assert.ok(html.includes('aria-label="Wait (min)"') && /aria-hidden="true"[^>]*>min</.test(html), 'a number\'s name carries its unit; the unit shown is not read twice')
})

test('an error where the form draws none moves to the nearest place it does, else over the Save; a saved key the shape dropped goes', () => {
  assert.deepEqual(placeErrors(nodes, { extra: 'Not a field of this setting' }), { '': 'Not a field of this setting' }, 'a key the shape does not name: over the Save')
  assert.deepEqual(placeErrors(nodes, validate(PROBE.shape, { scale: 'pews', amount: { unit: 'mg' } }, DEFS)), { amount: 'Needed' }, 'inside a datatype: at the datatype')
  assert.deepEqual(placeErrors(nodes, errorsFrom({ message: 'No', field: 'contact.phone.x' })), { 'contact.phone': 'No' }, 'a server refusal too')
  assert.deepEqual(placeErrors(nodes, { 'contact.0': 'x' }), { contact: 'x' }, 'an index on a sub-section: the sub-section')
  const drawn = { 'rows.1': 'a', 'rows.1.drug': 'b', 'tags.0': 'c', 'shifts.1': 'd', 'shifts.0.name': 'e', 'units.0': 'f', scale: 'g', '': 'h' }
  assert.deepEqual(placeErrors(nodes, drawn), drawn, 'a node, a row, an item: where they are')
  assert.deepEqual(placeErrors(nodes, { 'amount.value': 'first', amount: 'second' }), { amount: 'first' }, 'one each')
  assert.deepEqual(initialOf(PROBE, { scale: 'news2', gone: 1, contact: { name: 'D', fax: '1' }, shifts: [{ name: 'a', more: 1 }] }, DEFS),
    { scale: 'news2', contact: { name: 'D' }, shifts: [{ name: 'a', more: 1 }] }, 'what the shape no longer names is left out where it allows no others')
  const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AutoForm, { decl: PROBE, nodes, onChange: () => {}, disabled: false,
    value: { scale: 'pews', shifts: [{ name: 'a' }, { name: 'a' }], units: ['mg', 'mg'] }, errors: { 'shifts.1': 'Each once', 'units.1': 'Each once more' } })))
  assert.ok(html.indexOf('Each once<') > html.indexOf('Shifts 2') && html.indexOf('Each once<') < html.indexOf('aria-label="Name"', html.indexOf('Shifts 2')), 'a whole item\'s, under its head')
  assert.ok(html.includes('Each once more'), 'a list of choices draws its items\' error')
  assert.ok(html.includes('aria-label="Remove Shifts 1"') && html.includes('aria-label="Remove Shifts 2"'), 'each Remove names its item')
})

test('a key\'s own $defs: drawn and checked as the server does', () => {
  const OWN = { shape: { type: 'object', $defs: { band: { type: 'object', required: ['lo'], properties: { lo: { type: 'integer', default: 1 } } } }, required: ['b'], properties: { b: { $ref: '#/$defs/band' } } }, fields: [] }
  assert.deepEqual(validate(OWN.shape, { b: {} }), { 'b.lo': 'Needed' }); assert.deepEqual(validate(OWN.shape, { b: { lo: 'x' } }), { 'b.lo': 'A whole number' })
  assert.deepEqual(defaultsOf(OWN.shape), { b: { lo: 1 } }); assert.equal(formOf(OWN)[0].kind, 'other')
})

test('the history in words: each value field by field, in the form\'s order', () => {
  assert.equal(summary(nodes, { scale: 'news2', wait: 30, strict: true, rows: [{ drug: 'a' }], tags: ['x', 'y'], contact: { name: 'Desk' } }),
    'Scale NEWS2 · Wait 30 min · Strict Yes · Rows 1 row · Tags x, y · Contact Name Desk')
  assert.equal(summary(nodes, {}), 'Nothing set'); assert.equal(valueWords(by(nodes, 'strict'), false), 'No')
})

test('a pack registers its own editor for a complex setting; the automatic form is the default', () => {
  assert.equal(settingEditor('probe.everything'), null)
  const Mine = () => null; registerSettingEditor('probe.everything', Mine)
  assert.equal(settingEditor('probe.everything'), Mine); assert.equal(settingEditor('pharmacy.late_after'), null)
})

// pharmacy's settings, as read 'me' sends them
const LATE: SettingKey = { key: 'pharmacy.late_after', layer: 'pharmacy', owner_kind: 'department', many: false, labels: { en: 'Late to collect' }, form: 'department',
  shape: { type: 'object', additionalProperties: false, required: ['minutes'], properties: { minutes: { type: 'integer', minimum: 5, maximum: 1440, default: 30 } } },
  fields: [{ key: 'minutes', labels: { en: 'Prepared reads late after' }, unit: 'min' }] }
const TALK: SettingKey = { key: 'pharmacy.counselling', layer: 'pharmacy', owner_kind: 'organization', many: false, labels: { en: 'Counselling when giving' }, form: 'pack',
  shape: { type: 'object', additionalProperties: false, required: ['show'], properties: { show: { type: 'boolean', default: false }, note: { type: 'string', maxLength: 400 } } },
  fields: [{ key: 'show', labels: { en: 'Show a counselling note' } }, { key: 'note', labels: { en: 'Note' } }] }
const org = (settings: Organization['settings']) => ({ organization: { id: 'o1' }, settings, settingKeys: [LATE, TALK], datatypes: {} }) as unknown as Organization
const row = (key: string, thing: string, data: Record<string, unknown>) => ({ key, thing_id: thing, owner_id: thing, data, recorded_at: '2026-10-06T08:00:00Z', author_id: 'u1' })

test('pharmacy: the late limit per pharmacy (unset, the shape\'s 30 min), and Dispensing\'s late mark', () => {
  assert.equal(lateAfter(org([]), 'ph'), 30)
  assert.equal(lateAfter(org([row('pharmacy.late_after', 'ph', { minutes: 45 })]), 'ph'), 45); assert.equal(lateAfter(org([row('pharmacy.late_after', 'ph', { minutes: 45 })]), 'ph2'), 30, 'per pharmacy')
  assert.equal(settingIn(org([]), 'pharmacy.late_after', 'ph').minutes, 30)
  const now = Date.parse('2026-10-06T10:00:00Z')
  const since = preparedSince([{ order: { last_at: '2026-10-06T09:20:00Z' } }, { order: { last_at: '2026-10-06T09:05:00Z' } }] as never)
  assert.equal(since, '2026-10-06T09:05:00Z', 'the earliest prepared')
  assert.equal(lateBy(since, 45, now), 55, 'waited 55 min, the limit 45: late'); assert.equal(lateBy(since, 60, now), null, 'within the limit'); assert.equal(lateBy(null, 5, now), null)
  assert.deepEqual(formOf(LATE).map((x) => x.kind === 'number' && `${x.label} · ${x.unit} · ${x.min}–${x.max}`), ['Prepared reads late after · min · 5–1440'])
  assert.deepEqual(validate(LATE.shape, { minutes: 2 }), { minutes: 'At least 5' }, 'the form refuses what the server would')
})

test('pharmacy: the counselling note shows only when the clinic turned it on with words', () => {
  assert.equal(counselling(org([])), null, 'unset: none')
  assert.equal(counselling(org([row('pharmacy.counselling', 'o1', { show: true, note: ' Take with food. ' })])), 'Take with food.')
  assert.equal(counselling(org([row('pharmacy.counselling', 'o1', { show: false, note: 'Take with food.' })])), null, 'turned off')
  assert.deepEqual(formOf(TALK).map((x) => x.kind), ['yesno', 'text'])
})

console.log(`settings: ${n} groups passed`)
