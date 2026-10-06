// The automatic form (spec/openCare.md §5.1 rule 7): a setting's fields drawn from its declared shape and words, from the kit only.
// A choice as chips, a number with its unit, words, yes/no, a small table with rows to add and remove, a list to add to, a sub-section
// as a group; each error (the form's own check, or the server's refusal that names the field) sits under its field. Disabled, it is the
// same form, read-only (a fieldset: every control inside it).
import { useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Chip, Fieldset, FormRow, IconButton, Input, NumberInput, Segmented, Textarea, cn } from '../../../ui'
import type { Schema } from '../../../db/types'
import { defaultsOf, errorWithin, join, same, type Errors, type FormNode } from './model'
import type { SettingEditorProps } from './registry'

type Obj = Record<string, unknown>
interface At { at: string; errors: Errors; dense?: boolean }
const Err = ({ e }: { e?: string }) => e ? <p role="alert" className="mt-1 text-12 text-danger">{e}</p> : null

export function AutoForm({ nodes, value, onChange, errors, disabled }: SettingEditorProps) {
  return <fieldset disabled={disabled} className="grid min-w-0 gap-5">
    <Fields nodes={nodes} at="" value={value} onChange={onChange} errors={errors} />
  </fieldset>
}

/** an object's fields, one row each: the label and help on the left, the control and its error on the right; a group spans the row */
function Fields({ nodes, at, value, onChange, errors }: At & { nodes: FormNode[]; value: Obj; onChange: (v: Obj) => void }) {
  const set = (k: string) => (v: unknown) => onChange({ ...value, [k]: v })
  return <>{nodes.map((n) => { const p = join(at, n.name)
    if (n.kind === 'group' || (n.kind === 'list' && n.item.kind === 'group')) return <Fieldset key={n.name} title={n.label}>
      {n.help && <p className="-mt-2 text-12 text-faint">{n.help}</p>}
      <Control node={n} at={p} value={value[n.name]} onChange={set(n.name)} errors={errors} /><Err e={errors[p]} />
    </Fieldset>
    return <FormRow key={n.name} label={<span>{n.label}{!n.required && n.kind !== 'yesno' && <span className="ms-1.5 text-12 font-normal text-faint">optional</span>}</span>}
      hint={n.help ?? undefined}>
      <Control node={n} at={p} value={value[n.name]} onChange={set(n.name)} errors={errors} /><Err e={errors[p]} />
    </FormRow> })}</>
}

/** one field's control, by its kind */
function Control({ node: n, at, value, onChange, errors, dense }: At & { node: FormNode; value: unknown; onChange: (v: unknown) => void }) {
  switch (n.kind) {
    case 'choice': return <div role="group" aria-label={n.label} className="flex flex-wrap gap-1.5">{n.options.map((o) => { const on = same(value, o.value)
      return <Chip key={o.key} on={on} onClick={() => onChange(on && !n.required ? undefined : o.value)}>{o.label}</Chip> })}</div>
    case 'number': return <span className="inline-flex items-center gap-2">
      <NumberInput label={n.unit ? `${n.label} (${n.unit})` : n.label} integer={n.integer} dense={dense} value={typeof value === 'number' ? value : null} placeholder={n.placeholder ?? undefined}
        onValue={(x) => onChange(x ?? undefined)} className={dense ? 'w-20' : 'w-28'} />
      {n.unit && !dense && <span aria-hidden className="text-12 text-muted">{n.unit}</span>}</span>
    case 'text': return n.long && !dense
      ? <Textarea aria-label={n.label} autoGrow minRows={2} value={typeof value === 'string' ? value : ''} placeholder={n.placeholder ?? undefined} onChange={(e) => onChange(e.target.value)} aria-invalid={!!errors[at] || undefined} />
      : <Input aria-label={n.label} dense={dense} value={typeof value === 'string' ? value : ''} placeholder={n.placeholder ?? undefined} onChange={(e) => onChange(e.target.value)} aria-invalid={!!errors[at] || undefined} />
    case 'yesno': return <Segmented aria-label={n.label} size={dense ? 'sm' : 'md'} value={value === true ? 'yes' : value === false ? 'no' : null} onChange={(v) => onChange(v === 'yes')}
      options={[['yes', 'Yes'], ['no', 'No']]} />
    case 'table': return <Table node={n} at={at} rows={Array.isArray(value) ? value as Obj[] : []} onChange={onChange} errors={errors} />
    case 'list': return n.item.kind === 'group' ? <Groups node={n} at={at} items={Array.isArray(value) ? value as Obj[] : []} onChange={onChange} errors={errors} />
      : <List node={n} at={at} items={Array.isArray(value) ? value : []} onChange={onChange} errors={errors} />
    case 'group': return <div className="grid gap-4"><Fields nodes={n.children} at={at} value={(value ?? {}) as Obj} onChange={onChange} errors={errors} /></div>
    default: return <p className="text-12 text-faint">Its pack's own editor sets this.</p>
  }
}

const itemsOf = (n: FormNode) => (n.schema.items ?? {}) as Schema
const without = <T,>(xs: T[], i: number) => xs.filter((_, j) => j !== i)

/** a small table: a column per field, a row per item; rows are added and removed */
function Table({ node, at, rows, onChange, errors }: At & { node: Extract<FormNode, { kind: 'table' }>; rows: Obj[]; onChange: (v: unknown) => void }) {
  const head = (c: FormNode) => `${c.label}${c.kind === 'number' && c.unit ? ` (${c.unit})` : ''}`
  return <div className="grid gap-2">
    {rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-13">
      <thead><tr className="border-b border-line text-11 uppercase tracking-[0.08em] text-faint">
        {node.columns.map((c) => <th key={c.name} className="py-1.5 pe-2 text-start font-medium">{head(c)}</th>)}<th className="w-8"><span className="sr-only">Remove</span></th></tr></thead>
      <tbody>{rows.map((r, i) => { const rp = join(at, i)
        return <tr key={i} className={cn('border-b border-line align-top last:border-0', errorWithin(errors, rp) && 'bg-danger-soft')}>
          {node.columns.map((c) => { const p = join(rp, c.name)
            return <td key={c.name} className="py-1.5 pe-2"><Control node={c} at={p} dense value={r[c.name]} errors={errors}
              onChange={(v) => onChange(rows.map((x, j) => j === i ? { ...x, [c.name]: v } : x))} /><Err e={errors[p]} /></td> })}
          <td className="py-1.5"><IconButton title={`Remove row ${i + 1}`} tone="danger" onClick={() => onChange(without(rows, i))}><X /></IconButton><Err e={errors[rp]} /></td>
        </tr> })}</tbody>
    </table></div>}
    {rows.length === 0 && <p className="text-12 text-faint">No rows yet.</p>}
    <div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...rows, defaultsOf(itemsOf(node))])}><Plus />Row</Button></div>
  </div>
}

/** a list of larger items: each a group of its own fields, removed on its own; added at the end */
function Groups({ node, at, items, onChange, errors }: At & { node: Extract<FormNode, { kind: 'list' }>; items: Obj[]; onChange: (v: unknown) => void }) {
  const item = node.item as Extract<FormNode, { kind: 'group' }>
  return <div className="grid gap-3">
    {items.map((x, i) => <div key={i} className={cn('grid gap-4 rounded-lg p-3 ring-1 ring-line', errorWithin(errors, join(at, i)) && 'ring-danger-line')}>
      <div><div className="flex items-center gap-2"><span className="text-12 font-medium text-muted">{node.label} {i + 1}</span>
        <Button type="button" size="xs" variant="danger-ghost" className="ms-auto" aria-label={`Remove ${node.label} ${i + 1}`} onClick={() => onChange(without(items, i))}>Remove</Button></div>
        <Err e={errors[join(at, i)]} /></div>
      <Fields nodes={item.children} at={join(at, i)} value={x ?? {}} onChange={(v) => onChange(items.map((y, j) => j === i ? v : y))} errors={errors} />
    </div>)}
    {items.length === 0 && <p className="text-12 text-faint">None yet.</p>}
    <div><Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, defaultsOf(itemsOf(node))])}><Plus />{node.label}</Button></div>
  </div>
}

/** a list to add to: choices as chips to tick, else each entry with its remove and a line to add one more (Enter adds) */
function List({ node, at, items, onChange, errors }: At & { node: Extract<FormNode, { kind: 'list' }>; items: unknown[]; onChange: (v: unknown) => void }) {
  const [typed, setTyped] = useState('')
  const item = node.item
  const firstError = items.map((_, i) => errors[join(at, i)]).find(Boolean)
  if (item.kind === 'choice') return <div className="grid gap-1"><div role="group" aria-label={node.label} className="flex flex-wrap gap-1.5">{item.options.map((o) => { const on = items.some((x) => same(x, o.value))
    return <Chip key={o.key} variant="check" on={on} onClick={() => onChange(on ? items.filter((x) => !same(x, o.value)) : [...items, o.value])}>{o.label}</Chip> })}</div><Err e={firstError} /></div>
  const read = (t: string): unknown => item.kind === 'number' ? (t.trim() && !isNaN(Number(t)) ? Number(t) : t) : t.trim()
  const add = () => { if (!typed.trim()) return; onChange([...items, read(typed)]); setTyped('') }
  const shown: ReactNode[] = items.map((x, i) => <span key={i} className={cn('inline-flex items-center gap-1 rounded-md bg-sunken py-0.5 ps-2 pe-0.5 text-12 ring-1 ring-inset ring-line', errors[join(at, i)] && 'ring-danger')}>
    {String(x)}{item.kind === 'number' && item.unit ? ` ${item.unit}` : ''}
    <IconButton title={`Remove ${String(x)}`} onClick={() => onChange(without(items, i))}><X /></IconButton></span>)
  return <div className="grid gap-2">
    {shown.length > 0 ? <div className="flex flex-wrap gap-1.5">{shown}</div> : <p className="text-12 text-faint">None yet.</p>}
    <Err e={firstError} />
    <div className="flex gap-2"><Input dense aria-label={`Add to ${node.label}`} value={typed} onChange={(e) => setTyped(e.target.value)} className="max-w-60"
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder="Add one" />
      <Button type="button" size="sm" variant="outline" disabled={!typed.trim()} onClick={add}><Plus />Add</Button></div>
  </div>
}
