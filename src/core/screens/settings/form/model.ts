// The automatic form of a setting (spec/openCare.md §5.1 rule 7), pure: what it draws from the key's declared shape and its fields'
// words, and the same checks as the server's shape (write_setting refuses what this refuses). No browser, no fetching.
//   formOf     the nodes to draw, in the declared order: a choice (enum) as chips, a number with its unit, text, yes/no, a small table
//              (an array of objects with few plain fields), a list to add to (an array of strings, or of objects), a sub-section
//   validate   errors by the value's path (rows.1.dose), as the server's shape would refuse
//   clean      what the form sends: blank words and unset values left out
//   initialOf  the value to start from: as saved (less what the shape no longer names), else the shape's defaults
//   placeErrors each error where the form draws one: an undrawn path moves to its nearest drawn place, else over the Save
import type { FieldDecl, Schema, SettingKey, SettingRow } from '../../../db/types'
import type { SettingData } from '../../../db/shapes.generated'

type Defs = Record<string, Schema>
interface Base { name: string; path: string; label: string; help: string | null; required: boolean; schema: Schema }
export type FormNode = Base & (
  | { kind: 'choice'; options: { key: string; value: unknown; label: string }[] }
  | { kind: 'number'; integer: boolean; unit: string | null; min: number | null; max: number | null; placeholder: string | null }
  | { kind: 'text'; long: boolean; placeholder: string | null }
  | { kind: 'yesno' }
  | { kind: 'list'; item: FormNode }
  | { kind: 'table'; columns: FormNode[] }
  | { kind: 'group'; children: FormNode[] }
  | { kind: 'other' })
export type Errors = Record<string, string>
/** at most this many plain columns make a small table; more, or a nested one, and each row is a sub-section */
export const TABLE_COLUMNS = 4

const refName = (s: Schema) => typeof s.$ref === 'string' ? s.$ref.replace(/^#\/\$defs\//, '') : null
const resolve = (s: Schema, defs: Defs): Schema => { const r = refName(s); return r ? defs[r] ?? {} : s }
const typesOf = (s: Schema): string[] => Array.isArray(s.type) ? s.type as string[] : typeof s.type === 'string' ? [s.type] : s.properties ? ['object'] : []
const words = (l: Record<string, string> | undefined) => l?.en ?? null
/** a key's own $defs over the datatypes (read 'me' sends both) */
const defsOf = (s: Schema, defs: Defs): Defs => s.$defs ? { ...defs, ...(s.$defs as Defs) } : defs
const humane = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const PLAIN = new Set(['choice', 'number', 'text', 'yesno'])
export const join = (path: string, k: string | number) => path ? `${path}.${k}` : String(k)

/** the nodes of an object's properties, in the order the fields are declared (any the fields do not name last, in the shape's order) */
function childrenOf(s: Schema, path: string, fields: FieldDecl[], defs: Defs): FormNode[] {
  const props = (s.properties ?? {}) as Record<string, Schema>; const req = new Set((s.required as string[] | undefined) ?? [])
  const rank = (k: string) => { const i = fields.findIndex((f) => f.key === join(path, k)); return i < 0 ? fields.length : i }
  return Object.keys(props).map((k, i) => [k, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([k]) => nodeOf(k, join(path, k), props[k], req.has(k), fields, defs))
}
function nodeOf(name: string, path: string, schema: Schema, required: boolean, fields: FieldDecl[], defs: Defs): FormNode {
  const f = fields.find((x) => x.key === path)
  const base: Base = { name, path, label: words(f?.labels) ?? humane(name), help: words(f?.help), required, schema }
  if (refName(schema)) return { ...base, kind: 'other' }    // a datatype (a quantity, a coding): a pack's own editor draws it
  const s = schema; const types = typesOf(s); const dflt = s.default === undefined ? null : String(s.default)
  if (Array.isArray(s.enum)) return { ...base, kind: 'choice', options: (s.enum as unknown[]).filter((v) => v !== null).map((v) => ({ key: String(v), value: v, label: words(f?.choices?.[String(v)]) ?? String(v) })) }
  if (types.includes('integer') || types.includes('number')) return { ...base, kind: 'number', integer: !types.includes('number'), unit: f?.unit ?? null,
    min: typeof s.minimum === 'number' ? s.minimum : null, max: typeof s.maximum === 'number' ? s.maximum : null, placeholder: dflt }
  if (types.includes('boolean')) return { ...base, kind: 'yesno' }
  if (types.includes('string')) return { ...base, kind: 'text', long: typeof s.maxLength !== 'number' || s.maxLength > 120, placeholder: dflt }
  if (types.includes('array') && s.items) {
    const items = resolve(s.items as Schema, defs)
    if (typesOf(items).includes('object') && !refName(s.items as Schema)) {
      const columns = childrenOf(items, path, fields, defs)
      if (columns.length <= TABLE_COLUMNS && columns.every((c) => PLAIN.has(c.kind))) return { ...base, kind: 'table', columns }
      return { ...base, kind: 'list', item: { ...base, required: true, schema: items, kind: 'group', children: columns } }
    }
    return { ...base, kind: 'list', item: nodeOf(name, path, s.items as Schema, true, fields, defs) }
  }
  if (types.includes('object')) return { ...base, kind: 'group', children: childrenOf(s, path, fields, defs) }
  return { ...base, kind: 'other' }
}
/** the form of a setting key: its top-level nodes */
export const formOf = (key: Pick<SettingKey, 'shape' | 'fields'>, defs: Defs = {}) => childrenOf(key.shape, '', key.fields, defsOf(key.shape, defs))
/** every node, depth first (a table's columns, a list's item and a sub-section's children included) */
export const allNodes = (ns: FormNode[]): FormNode[] => ns.flatMap((n) => [n, ...allNodes(n.kind === 'group' ? n.children : n.kind === 'table' ? n.columns : n.kind === 'list' && n.item.kind === 'group' ? n.item.children : [])])

// ── the same checks as the server's shape ──
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isType = (t: string, v: unknown) => t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? typeof v === 'object' && v !== null && !Array.isArray(v)
  : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === t
const TYPE_WORD: Record<string, string> = { integer: 'A whole number', number: 'A number', string: 'Words', boolean: 'Yes or no', array: 'A list', object: 'A group of fields' }
/** what is wrong, by the value's path ('' for the whole); the first fault of each place only */
export function validate(schema: Schema, value: unknown, defs: Defs = {}, path = '', out: Errors = {}): Errors {
  const at = (p: string, m: string) => { if (!(p in out)) out[p] = m; return out }
  if (!path) defs = defsOf(schema, defs)
  const s = resolve(schema, defs)
  const anyOf = (s.anyOf ?? s.oneOf) as Schema[] | undefined
  if (anyOf && !anyOf.some((b) => !Object.keys(validate({ ...b, ...(b.required && !b.type ? { properties: s.properties } : {}) }, value, defs)).length)) at(path, 'Not in the right form')
  if ('const' in s && !same(s.const, value)) return at(path, 'Not in the right form')
  if (Array.isArray(s.enum) && !s.enum.some((x) => same(x, value))) return at(path, 'Pick one of the choices')
  const types = typesOf(s)
  if (types.length && !types.some((t) => isType(t, value))) return at(path, TYPE_WORD[types.find((t) => t !== 'null') ?? ''] ?? 'Not in the right form')
  if (typeof value === 'string') {
    if (typeof s.minLength === 'number' && value.length < s.minLength) return at(path, s.minLength === 1 ? 'Needed' : `At least ${s.minLength} characters`)
    if (typeof s.maxLength === 'number' && value.length > s.maxLength) return at(path, `At most ${s.maxLength} characters`)
    if (typeof s.pattern === 'string' && !new RegExp(s.pattern, 'u').test(value)) return at(path, 'Not in the right form')
  }
  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) return at(path, `At least ${s.minimum}`)
    if (typeof s.maximum === 'number' && value > s.maximum) return at(path, `At most ${s.maximum}`)
    if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) return at(path, `More than ${s.exclusiveMinimum}`)
    if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) return at(path, `Less than ${s.exclusiveMaximum}`)
  }
  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) return at(path, `At least ${s.minItems}`)
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) return at(path, `At most ${s.maxItems}`)
    if (s.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size < value.length) return at(path, 'Each once')
    if (s.items) value.forEach((x, i) => validate(s.items as Schema, x, defs, join(path, i), out))
  }
  if (isType('object', value) && (s.properties || s.required || s.additionalProperties === false)) {
    const o = value as Record<string, unknown>; const props = (s.properties ?? {}) as Record<string, Schema>
    for (const k of (s.required as string[] | undefined) ?? []) if (!(k in o)) at(join(path, k), 'Needed')
    for (const [k, v] of Object.entries(o)) {
      if (props[k]) validate(props[k], v, defs, join(path, k), out)
      else if (s.additionalProperties === false) at(join(path, k), 'Not a field of this setting')
    }
  }
  return out
}

/** what the form sends: blank words and unset values left out, inside objects (a table's rows keep their place) */
export function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean)
  if (isType('object', v)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => x === undefined || x === null || (typeof x === 'string' && !x.trim()) ? [] : [[k, clean(x)]]))
  return v
}
/** the shape's defaults: each property's own, a required yes/no as no, a required sub-section's defaults */
export function defaultsOf(schema: Schema, defs: Defs = {}): Record<string, unknown> {
  defs = defsOf(schema, defs); const s = resolve(schema, defs); const props = (s.properties ?? {}) as Record<string, Schema>; const req = new Set((s.required as string[] | undefined) ?? [])
  const out: Record<string, unknown> = {}
  for (const [k, p] of Object.entries(props)) {
    const r = resolve(p, defs)
    if (r.default !== undefined) out[k] = r.default
    else if (req.has(k) && typesOf(r).includes('boolean')) out[k] = false
    else if (req.has(k) && typesOf(r).includes('object')) out[k] = defaultsOf(r, defs)
  }
  return out
}
/** a value less the properties its shape no longer names (where it allows no others): a key a pack's upgrade dropped never blocks a save */
export function prune(schema: Schema, v: unknown, defs: Defs = {}): unknown {
  defs = defsOf(schema, defs); const s = resolve(schema, defs)
  if (Array.isArray(v)) return s.items ? v.map((x) => prune(s.items as Schema, x, defs)) : v
  if (!isType('object', v)) return v
  const props = (s.properties ?? {}) as Record<string, Schema>
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => props[k] ? [[k, prune(props[k], x, defs)]] : s.additionalProperties === false ? [] : [[k, x]]))
}
/** the value a form starts from: as saved (less what the shape no longer names), else the shape's defaults */
export const initialOf = (key: Pick<SettingKey, 'shape'>, saved: Record<string, unknown> | undefined, defs: Defs = {}) =>
  saved ? prune(key.shape, saved, defs) as Record<string, unknown> : defaultsOf(key.shape, defs)
/** a setting as it stands for a thing (an organization, a department), its defaults filled in: what a pack reads */
export function settingIn<K extends keyof SettingData>(o: { settings: SettingRow[]; settingKeys: SettingKey[]; datatypes: Defs } | undefined, key: K, thing: string | null | undefined): Partial<SettingData[K]> {
  const decl = o?.settingKeys.find((k) => k.key === key); const row = o?.settings.find((s) => s.key === key && s.thing_id === thing)
  return { ...(decl ? defaultsOf(decl.shape, o?.datatypes) : {}), ...(row?.data ?? {}) } as Partial<SettingData[K]>
}

// ── words ──
/** a value in words, by its node: "45 min", "Yes", "NEWS2", "2 rows" */
export function valueWords(n: FormNode, v: unknown): string {
  if (v === undefined || v === null || v === '') return '—'
  switch (n.kind) {
    case 'choice': return n.options.find((o) => same(o.value, v))?.label ?? String(v)
    case 'number': return `${v}${n.unit ? ` ${n.unit}` : ''}`
    case 'yesno': return v ? 'Yes' : 'No'
    case 'text': { const t = String(v); return t.length > 60 ? `${t.slice(0, 60)}…` : t }
    case 'list': case 'table': { const xs = v as unknown[]; return n.kind === 'list' && n.item.kind !== 'group' ? xs.map((x) => valueWords(n.item, x)).join(', ') || 'none'
      : `${xs.length} ${xs.length === 1 ? 'row' : 'rows'}` }
    case 'group': return n.children.map((c) => (v as Record<string, unknown>)[c.name] === undefined ? null : `${c.label} ${valueWords(c, (v as Record<string, unknown>)[c.name])}`).filter(Boolean).join(', ') || '—'
    default: return 'set'
  }
}
/** a whole value in a line, field by field in the form's order: "Prepared reads late after 45 min" */
export const summary = (nodes: FormNode[], v: Record<string, unknown> | null | undefined) =>
  nodes.filter((n) => v?.[n.name] !== undefined).map((n) => `${n.label} ${valueWords(n, v![n.name])}`).join(' · ') || 'Nothing set'

/** a refusal as the form shows it: next to the field the server named, else above the Save */
export const errorsFrom = (e: unknown): Errors => {
  const x = e as { message?: string; field?: string } | null
  return { [x?.field ?? '']: x?.message ?? String(e) }
}
const bare = (p: string) => p.split('.').filter((x) => !/^\d+$/.test(x)).join('.')
/** each error where the form draws one: at a node's path, or at an item of a list or table (rows.1); any other (a key the shape does
 *  not name, inside a datatype, a check's own field) moves to its nearest drawn place, else to '' (over the Save). First one kept. */
export function placeErrors(nodes: FormNode[], errors: Errors): Errors {
  const drawn = new Map(allNodes(nodes).map((n) => [n.path, n] as const))
  const shown = (p: string) => { const n = drawn.get(bare(p)); return !!n && (!/\.\d+$/.test(p) || n.kind === 'list' || n.kind === 'table') }
  const place = (p: string): string => !p || shown(p) ? p : place(p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '')
  const out: Errors = {}
  for (const [p, m] of Object.entries(errors)) { const q = place(p); if (!(q in out)) out[q] = m }
  return out
}
/** an error of this place or of anything inside it (a table's cell), to say a folded part needs a look */
export const errorWithin = (errors: Errors, path: string) => Object.keys(errors).some((k) => k === path || k.startsWith(`${path}.`))
