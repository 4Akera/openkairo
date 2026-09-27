import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Plus } from 'lucide-react'
import { Refusal, remove, save as saveRow, writeSetting } from '../../db/rpc'
import { newId } from '../../hooks/writes'
import type { Department, Organization, Place } from '../../db/types'
import { Badge, Button, DeleteButton, EditPanel, Field, FormRow, IconButton, Input, RetireButton, Segmented, Select, cn, errorText, useDraft } from '../../ui'
import { useSave } from './save'

// the word is a label: a bed may sit in a room (spec/openCare.md §3.3)
const LABELS: [string, string][] = [['bed', 'Bed'], ['room', 'Room'], ['chair', 'Chair'], ['cubicle', 'Cubicle']]
const word = (label: string) => LABELS.find(([k]) => k === label)?.[1] ?? label
type PlaceDraft = { label: string; name: string; closed: boolean; reason: string }

/** "8 beds · 1 closed", on the department's row */
export function PlacesCount({ places }: { places: Place[] }) {
  const by = LABELS.map(([k, w]): [number, string] => [places.filter((p) => p.label === k).length, w.toLowerCase()]).filter(([n]) => n)
  const closed = places.filter((p) => p.closed).length
  if (!places.length) return null
  return <span className="text-12 text-faint">{by.map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(' · ')}{closed ? ` · ${closed} closed` : ''}</span>
}

/** a place is a row (save) and closed is its place.closed setting (§4.6), each written only when it changed */
async function savePlace(a: { id: string; d: PlaceDraft; was: Place }) {
  const { id, d, was } = a; const reason = d.reason.trim()
  if (was.label !== d.label || was.name !== d.name.trim()) await saveRow('place', { id, label: d.label, name: d.name.trim() })
  if (was.closed !== d.closed || (d.closed && (was.closed_reason ?? '') !== reason)) await writeSetting({ key: 'place.closed', owner_id: id, data: d.closed && reason ? { closed: true, reason } : { closed: d.closed } })
}

/** A department's places, inline under its editor: in the order its bed board shows them; each change saves at once. Delete is for
 *  a mistake; a place the record names, or one with places inside it, is refused in_use and retired instead. */
export function PlacesEditor({ org, dept }: { org: Organization; dept: Department }) {
  const places = org.places.filter((p) => p.department_id === dept.id).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  const e = useDraft<PlaceDraft>()
  const edit = useSave(savePlace); const del = useSave((id: string) => remove('place', id)); const retire = useSave((id: string) => saveRow('place', { id, retired: true }))
  const add = useSave((p: { id: string; label: string; name: string; position: number }) => saveRow('place', { ...p, department_id: dept.id }))
  // up or down: the new order's positions are written again, only where they moved
  const reorder = useSave(async (xs: Place[]) => { for (const [i, p] of xs.entries()) if (p.position !== i + 1) await saveRow('place', { id: p.id, position: i + 1 }) })
  const move = (i: number, by: number) => { const xs = [...places]; [xs[i], xs[i + by]] = [xs[i + by], xs[i]]; reorder.mutate(xs) }
  const [label, setLabel] = useState(places.at(-1)?.label ?? (dept.work === 'stays' ? 'bed' : 'room'))
  const [typed, setTyped] = useState<string | null>(null)   // null: the suggestion
  // the next of its kind: "Bed 9" after Bed 8
  const next = `${word(label)} ${Math.max(0, ...places.filter((p) => p.label === label).map((p) => Number(p.name.match(/(\d+)\s*$/)?.[1] ?? 0))) + 1}`
  const name = (typed ?? next).trim()
  const taken = (n: string, id?: string) => places.some((p) => p.id !== id && p.name.toLowerCase() === n.trim().toLowerCase())
  const open = (p: Place) => { edit.reset(); del.reset(); retire.reset(); e.toggle(p.id, { label: p.label, name: p.name, closed: p.closed, reason: p.closed_reason ?? '' }) }
  const inUse = del.error instanceof Refusal && del.error.code === 'in_use'

  const editor = (p: Place) => { const d = e.draft!
    return <EditPanel dirty={e.dirty} saving={edit.isPending} error={edit.error ?? del.error ?? retire.error} canSave={!!d.name.trim() && !taken(d.name, p.id)} onCancel={e.cancel}
      onSave={() => edit.mutate({ id: p.id, d, was: p }, { onSuccess: e.done })}
      aside={inUse ? <RetireButton what={p.name} onRetire={() => retire.mutate(p.id, { onSuccess: e.done })} /> : <DeleteButton what={p.name} onDelete={() => del.mutate(p.id, { onSuccess: e.done })} />}>
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field label="Kind" changed={e.changed('label')}><Select value={d.label} onChange={(x) => e.set({ label: x.target.value })}>{LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Name" changed={e.changed('name')} hint={taken(d.name, p.id) ? `There is already a ${d.name.trim()} here.` : undefined}>
          <Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} required autoFocus /></Field>
      </div>
      <FormRow label="Open for patients" changed={e.changed('closed') || e.changed('reason')} hint="Closed, it shows greyed and takes no one new; a patient already in it stays.">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={d.closed ? 'closed' : 'open'} onChange={(v) => e.set({ closed: v === 'closed' })} options={[['open', 'Open'], ['closed', 'Closed']]} />
          {d.closed && <Input value={d.reason} onChange={(x) => e.set({ reason: x.target.value })} placeholder="Why: cleaning, repair…" className="h-8 max-w-64" />}</div></FormRow>
      {inUse && <p className="text-12 text-muted">Retired, it leaves the bed board and the lists of places; every entry that names it keeps it.</p>}
    </EditPanel> }

  return <div className="border-b border-accent-line bg-accent-soft/30 px-4 py-4">
    <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-line">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-2 pt-3">
        <p className="text-11 font-semibold uppercase tracking-wider text-faint">Places · {places.length}</p>
        <p className="text-12 text-faint">Beds, rooms, chairs and cubicles, in the order {dept.work === 'stays' ? 'the bed board shows them' : 'they are listed'}.</p>
        {reorder.error && <p className="text-14 text-danger">{errorText(reorder.error)}</p>}
      </div>
      {places.length > 0 && <ul className="divide-y divide-line border-t border-line">{places.map((p, i) => { const on = e.id === p.id; const parent = p.parent_id && places.find((x) => x.id === p.parent_id)?.name
        return <li key={p.id}>
          <div className={cn('flex items-center gap-2 px-2 text-14', on && 'bg-accent-soft/50')}>
            <span className="flex shrink-0"><IconButton type="button" title="Up" onClick={() => move(i, -1)} disabled={i === 0 || reorder.isPending}><ArrowUp className="h-3 w-3" /></IconButton>
              <IconButton type="button" title="Down" onClick={() => move(i, 1)} disabled={i === places.length - 1 || reorder.isPending}><ArrowDown className="h-3 w-3" /></IconButton></span>
            <button type="button" onClick={() => open(p)} aria-expanded={on} className="group flex min-w-0 flex-1 items-center gap-3 py-2 text-start">
              <span className="w-16 shrink-0 text-12 text-faint">{word(p.label)}</span>
              <span className={cn('truncate font-medium', p.closed && 'text-faint')}>{p.name}</span>
              {parent && <span className="text-12 text-faint">in {parent}</span>}
              {p.closed && <Badge tone="amber">closed{p.closed_reason ? ` · ${p.closed_reason}` : ''}</Badge>}
              <ChevronRight className={cn('ms-auto h-4 w-4 shrink-0 text-faint transition-transform group-hover:text-faint', on && 'rotate-90 text-accent')} />
            </button>
          </div>
          {on && editor(p)}
        </li> })}</ul>}
      <form className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5"
        onSubmit={(x) => { x.preventDefault(); if (name && !taken(name) && !add.isPending) add.mutate({ id: newId(), label, name, position: Math.max(0, ...places.map((p) => p.position)) + 1 }, { onSuccess: () => setTyped(null) }) }}>
        <Select value={label} onChange={(x) => { setLabel(x.target.value); setTyped(null) }} className="h-8 w-28" aria-label="Kind">{LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Input value={typed ?? next} onChange={(x) => setTyped(x.target.value)} className="h-8 w-40" aria-label="Name" />
        <Button type="submit" size="sm" variant="outline" disabled={!name || taken(name) || add.isPending}><Plus className="h-3.5 w-3.5" />{add.isPending ? 'Adding…' : 'Add'}</Button>
        {add.error ? <span className="text-14 text-danger">{errorText(add.error)}</span> : taken(name) && <span className="text-12 text-warn">There is already a {name} here.</span>}
      </form>
    </div>
  </div>
}
