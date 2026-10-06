// Starter setups in Settings → Departments (spec/openCare.md §5.2 "Setup and guards"): a new department starts from a setup (or
// blank), and a department compares with its setup, with Apply for each part it is missing. A part staff changed is shown and kept:
// the setup door never overwrites it. Everything opens inline under the row; nothing pops over the page.
import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runSetup } from '../../db/rpc'
import { mayIn } from '../../db/views'
import { newId } from '../../hooks/writes'
import type { Department, Organization, SetupInfo } from '../../db/types'
import { Badge, Button, Chip, Field, FormRow, Input, Select, Skeleton, errorText } from '../../ui'
import { useSave } from './save'
import { compareChoice, missing, rows, summary, type SetupRow } from './setup'

/** a screen's key or a department's id by its name, for the words of a setting or a line */
const namer = (org: Organization) => (k: string) => org.screens.find((s) => s.key === k)?.labels.en ?? org.allDepartments.find((d) => d.id === k)?.name ?? k
const TONE = { add: 'info', differs: 'warn', blocked: 'warn', same: 'neutral' } as const
const STATE = { add: 'to add', differs: 'yours differs', blocked: 'waits', same: 'the same' }
const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}.`
const useSetupKeys = () => { const qc = useQueryClient(); return () => qc.invalidateQueries({ queryKey: ['setup'] }) }

/** the parts as rows: to add (with Apply), what differs and why, what waits; the same folded into one line */
function Rows({ list, onApply, busy }: { list: SetupRow[]; onApply?: (part: string) => void; busy?: boolean }) {
  const [all, setAll] = useState(false)
  const same = list.filter((r) => r.state === 'same'); const shown = all ? list : list.filter((r) => r.state !== 'same')
  return <ul className="divide-y divide-line rounded-lg bg-surface ring-1 ring-line">
    {shown.map((r) => <li key={r.part} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-14">
      <span className="font-medium text-fg">{r.title}</span>
      <Badge tone={TONE[r.state]}>{STATE[r.state]}</Badge>
      {r.detail && <span className="text-12 text-muted">{r.detail}</span>}
      {onApply && r.canApply && <Button type="button" className="ms-auto" size="sm" variant="outline" disabled={busy} onClick={() => onApply(r.part)}>Apply</Button>}
    </li>)}
    {same.length > 0 && <li className="px-3 py-1.5"><button type="button" onClick={() => setAll(!all)} aria-expanded={all}
      className="rounded-sm text-12 text-faint hover:text-fg focus-ring">{all ? 'Fold what is the same' : `${same.length} the same as the setup`}</button></li>}
  </ul>
}

/** a new department: blank (the editor as before) or from one of the setups of the layers on here; made, the new card closes */
export function StartFrom({ org, blank, onMade, onCancel }: { org: Organization; blank: () => ReactNode; onMade: () => void; onCancel: () => void }) {
  const [key, setKey] = useState('')
  const setup = org.setups.find((s) => s.key === key)
  return <>
    {org.setups.length > 0 && <div className="px-4 pb-1 pt-3"><FormRow label="Start from a setup" hint="A setup brings what a kind of department starts with: its screens, rules, beds, services and presets. Blank starts empty.">
      <div className="flex flex-wrap gap-1.5"><Chip variant="check" shape="pill" on={!setup} onClick={() => setKey('')}>Blank</Chip>
        {org.setups.map((s) => <Chip variant="check" shape="pill" key={s.key} on={key === s.key} onClick={() => setKey(s.key)}>{s.labels.en ?? s.key}</Chip>)}</div>
    </FormRow></div>}
    {setup ? <FromSetup key={setup.key} org={org} setup={setup} onMade={onMade} onCancel={onCancel} /> : blank()}
  </>
}

function FromSetup({ org, setup, onMade, onCancel }: { org: Organization; setup: SetupInfo; onMade: () => void; onCancel: () => void }) {
  const [id] = useState(newId); const [name, setName] = useState(setup.labels.en ?? ''); const [site, setSite] = useState('')
  const q = useQuery({ queryKey: ['setup', setup.key, 'new'], queryFn: () => runSetup({ setup: setup.key }) })
  const refresh = useSetupKeys()
  const position = Math.max(0, ...org.allDepartments.map((d) => d.position)) + 1
  const make = useSave(() => runSetup({ setup: setup.key, department_id: id, name: name.trim(), site_id: site || null, position, apply: true }))
  const sites = org.sites.filter((s) => !s.retired_at)
  return <div className="grid gap-3 border-y border-accent-line bg-accent-soft/30 px-4 py-4">
    {setup.help.en && <p className="text-12 text-muted">{setup.help.en}</p>}
    <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
      <Field label="Name"><Input value={name} onChange={(x) => setName(x.target.value)} required autoFocus /></Field>
      {sites.length > 0 && <Field label="Site"><Select value={site} onChange={(x) => setSite(x.target.value)}><option value="">none</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
    </div>
    {q.isLoading ? <Skeleton lines={3} /> : q.error ? <p role="alert" className="text-14 text-danger">{errorText(q.error)}</p>
      : q.data && <><p className="text-14 text-fg">{sentence(summary(q.data.parts))}</p><Rows list={rows(q.data.parts, namer(org))} /></>}
    <div className="flex flex-wrap items-center gap-2 border-t border-accent-line/60 pt-3">
      {make.error && <span role="alert" className="text-14 text-danger">{errorText(make.error)}</span>}
      <Button type="button" className="ms-auto" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="button" size="sm" disabled={!name.trim() || make.isPending} onClick={() => make.mutate(undefined, { onSuccess: () => { void refresh(); onMade() } })}>
        {make.isPending ? 'Making…' : `Make ${name.trim() || 'it'}`}</Button>
    </div>
  </div>
}

/** under a department: Compare with its setup (the one it was made from while still of its work, else one of its work to pick),
 *  folded until asked; locked while the department's editor holds unsaved changes, since Apply changes the department too */
export function CompareSetup({ org, dept, locked }: { org: Organization; dept: Department; locked: boolean }) {
  const [open, setOpen] = useState(false); const [chosen, setChosen] = useState<string | null>(null)
  const { choices, key, pick } = compareChoice(org.setups, dept, chosen)
  const nameOf = (k: string | null) => org.setups.find((s) => s.key === k)?.labels.en ?? k
  if (!choices.length) return null
  return <div className="border-b border-line px-4 py-3">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-11 font-semibold uppercase tracking-[0.08em] text-faint">Setup · {dept.setup ? `made from ${nameOf(dept.setup)}` : 'none recorded'}</p>
      <Button type="button" className="ms-auto" size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Fold' : `Compare with ${pick ? 'a' : 'its'} setup`}</Button>
    </div>
    {open && <div className="mt-3 grid gap-3">
      {pick && <div className="flex flex-wrap gap-1.5">{choices.map((s) =>
        <Chip variant="check" shape="pill" key={s.key} on={key === s.key} onClick={() => setChosen(s.key)}>{s.labels.en ?? s.key}</Chip>)}</div>}
      {key && <Compare key={key} org={org} dept={dept} setup={key} locked={locked} />}
    </div>}
  </div>
}

function Compare({ org, dept, setup, locked }: { org: Organization; dept: Department; setup: string; locked: boolean }) {
  const q = useQuery({ queryKey: ['setup', setup, dept.id], queryFn: () => runSetup({ setup, department_id: dept.id }) })
  const refresh = useSetupKeys()
  const apply = useSave((parts: true | string[]) => runSetup({ setup, department_id: dept.id, apply: parts }))
  const go = (parts: true | string[]) => apply.mutate(parts, { onSettled: () => void refresh() })
  const may = mayIn(org, 'manage:places', null) && !locked
  if (q.isLoading) return <Skeleton lines={3} />
  if (q.error || !q.data) return <p role="alert" className="text-14 text-danger">{errorText(q.error)}</p>
  const todo = missing(q.data.parts)
  return <>
    <p className="text-14 text-fg">{sentence(summary(q.data.parts))}</p>
    <Rows list={rows(q.data.parts, namer(org))} onApply={may ? (p) => go([p]) : undefined} busy={apply.isPending} />
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-12 text-faint">{locked ? 'Save or undo your changes above first: Apply changes this department too.' : 'What staff changed here stays as they set it: a setup only adds what is missing.'}</p>
      {apply.error && <span role="alert" className="text-14 text-danger">{errorText(apply.error)}</span>}
      {may && todo.length > 1 && <Button type="button" className="ms-auto" size="sm" disabled={apply.isPending} onClick={() => go(true)}>Apply all {todo.length} missing</Button>}
    </div>
  </>
}
