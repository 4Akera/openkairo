import { useState } from 'react'
import { create } from 'zustand'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { rpc, Refusal, type FnName } from '../db/rpc'
import { useDepartment, useChoice } from '../hooks/organization'
import { newId } from '../hooks/writes'
import type { Organization } from '../db/types'
import { Button, Card, Centered, Heading, Input, Select, Spinner, Field, cn } from '../ui'
import { Mfa } from '../shell/Mfa'
import { ServicesPage } from './settings/Services'
const PAGES = [['organization', 'Organization'], ['clinic', 'Clinic rules'], ['departments', 'Departments'], ['services', 'Services'], ['users', 'Users'], ['templates', 'Presets'], ['packs', 'Packs']]

/** Settings (spec 02/05): six pages, the practice builds its own clinic here. Owners only. */
export function SettingsScreen() {
  const { org, can } = useDepartment()
  const mfaNeeded = useMfaNeeded((s) => s.needed)
  if (!org) return <Centered><Spinner /></Centered>
  if (!can('manage:organization')) return <Centered><p className="text-sm text-neutral-500">Settings need the owner role.</p></Centered>
  return <div className="mx-auto grid max-w-5xl gap-6 p-4 md:grid-cols-[180px_1fr]">
    <nav className="grid content-start gap-0.5">{PAGES.map(([k, l]) => <NavLink key={k} to={`/settings/${k}`} className={({ isActive }) => `rounded px-3 py-1.5 text-sm ${isActive ? 'bg-teal-50 font-medium text-teal-900' : 'text-neutral-600 hover:bg-neutral-100'}`}>{l}</NavLink>)}</nav>
    <div className="min-w-0 overflow-x-auto">{mfaNeeded && <Mfa onDone={() => useMfaNeeded.getState().set(false)} />}<Routes>
      <Route index element={<Navigate to="organization" replace />} />
      <Route path="organization" element={<OrganizationPage org={org} />} />
      <Route path="clinic" element={<div><H>Clinic rules</H><p className="-mt-2 mb-4 text-sm text-neutral-500">How {org.organization.name} works day to day. Each rule applies to every department.</p><ReviewSetting orgId={org.organization.id} /></div>} />
      <Route path="departments" element={<DepartmentsPage org={org} />} />
      <Route path="services" element={<ServicesPage org={org} />} />
      <Route path="users" element={<UsersPage org={org} />} />
      <Route path="templates" element={<TemplatesPage org={org} />} />
      <Route path="packs" element={<PacksPage org={org} />} />
    </Routes></div>
  </div>
}
const useMfaNeeded = create<{ needed: boolean; set: (v: boolean) => void }>((set) => ({ needed: false, set: (needed) => set({ needed }) }))
function useSave(fn: FnName) {
  const qc = useQueryClient(); const orgId = useChoice((s) => s.organizationId)
  return useMutation({ mutationFn: (a: Record<string, unknown>) => rpc(fn, { organization_id: orgId, ...a }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organization'] }); qc.invalidateQueries({ queryKey: ['settings_changes'] }) },
    onError: (e) => { if (e instanceof Refusal && e.code === 'mfa_required') useMfaNeeded.getState().set(true) } })
}
const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 text-base font-semibold tracking-tight">{children}</h2>
const Err = ({ e }: { e: Error | null }) => e ? <p className="text-sm text-red-700">{e.message}</p> : null

function ReviewSetting({ orgId }: { orgId: string }) {
  const qc = useQueryClient()
  const cur = useQuery({ queryKey: ['org_settings', orgId], queryFn: () => rpc<{ review_results: string }>('read_organization_settings', { organization_id: orgId }) })
  const save = useMutation({ mutationFn: (v: string) => rpc('save_organization_settings', { organization_id: orgId, review_results: v }), onSuccess: () => qc.invalidateQueries({ queryKey: ['org_settings'] }) })
  const opts: [string, string, string][] = [['critical', 'Only critical results', 'Quietest. Abnormal and normal results file into the record.'], ['abnormal', 'Critical and abnormal', 'Anything outside its range.'], ['all', 'Every final result', 'The doctor who asked acknowledges each one.']]
  return <Card className="mb-5 p-4"><Heading className="mb-1">Results to review</Heading>
    <p className="mb-3 text-xs text-neutral-500">Which results land on the requesting doctor’s review list. Whatever the setting, results for a patient who left before being seen again, and corrected results, always go to the list.</p>
    <div className="grid gap-1.5">{opts.map(([v, l, d]) => <label key={v} className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg p-2 ring-1 ring-inset', cur.data?.review_results === v ? 'bg-teal-50 ring-teal-300' : 'ring-neutral-200 hover:bg-neutral-50')}>
      <input type="radio" name="review" className="mt-1" checked={cur.data?.review_results === v} onChange={() => save.mutate(v)} /><span><span className="block text-sm font-medium">{l}{v === 'critical' && <span className="ml-1.5 text-xs font-normal text-neutral-500">default</span>}</span><span className="text-xs text-neutral-500">{d}</span></span></label>)}</div>
    {save.error && <p className="mt-2 text-sm text-red-700">{save.error.message}</p>}</Card>
}

function OrganizationPage({ org }: { org: Organization }) {
  const orgId = org.organization.id
  const ch = useQuery({ queryKey: ['settings_changes', orgId], queryFn: () => rpc<{ id: string; recorded_at: string; table_name: string; changes: Record<string, unknown>; user_name?: string }[]>('read_settings_changes', { organization_id: orgId, limit: 30 }) })
  return <div><H>{org.organization.name}</H>
    <p className="mb-4 text-sm text-neutral-600">{org.departments.length} departments · {org.services.length} services · {org.users.filter((u) => !u.retired_at).length} users · {org.packs.filter((p) => p.enabled).length} packs enabled{org.parked_pack_calls > 0 && <span className="ml-2 text-red-700">· {org.parked_pack_calls} parked pack calls</span>}</p>
    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Recent changes</h3>
    {ch.isLoading ? <Spinner /> : <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white text-xs">{(ch.data ?? []).map((c) => <li key={c.id} className="flex gap-3 px-3 py-1.5"><span className="w-28 font-mono text-neutral-400">{c.recorded_at.slice(0, 16).replace('T', ' ')}</span><span className="w-24 text-neutral-500">{c.table_name}</span><span className="flex-1 truncate">{JSON.stringify(c.changes)}</span></li>)}{(ch.data ?? []).length === 0 && <li className="px-3 py-2 text-neutral-400">nothing yet</li>}</ul>}
  </div>
}

function DepartmentsPage({ org }: { org: Organization }) {
  const save = useSave('save_department'); const retire = useSave('retire_department')
  const [edit, setEdit] = useState<{ id: string; name: string; type: string; site_name: string; serves: string[] } | null>(null)
  const visited = org.departments.filter((d) => d.is_visited)
  return <div><div className="mb-3 flex items-center justify-between"><H>Departments</H><Button size="sm" onClick={() => setEdit({ id: newId(), name: '', type: 'clinic', site_name: '', serves: [] })}>+ Department</Button></div>
    <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">{org.departments.map((d) => <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm"><span className="w-48 font-medium">{d.name}</span><span className="w-24 text-xs text-neutral-500">{d.type}</span><span className="w-32 text-xs text-neutral-400">{d.site_name}</span><span className="flex-1 text-xs text-neutral-400">{(d.serves ?? []).length ? `serves ${(d.serves ?? []).map((s) => s === null ? 'all' : org.departments.find((x) => x.id === s)?.name).join(', ')}` : ''}</span>
      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: d.id, name: d.name, type: d.type, site_name: d.site_name ?? '', serves: (d.serves ?? []).filter((s): s is string => !!s) })}>Edit</Button><Button size="sm" variant="ghost" className="text-red-700" onClick={() => confirm(`Retire ${d.name}?`) && retire.mutate({ id: d.id })}>Retire</Button></li>)}</ul>
    <Err e={retire.error} />
    {edit && <form onSubmit={(e) => { e.preventDefault(); save.mutate({ id: edit.id, name: edit.name, type: edit.type, site_name: edit.site_name || null, serves: edit.type === 'reception' ? edit.serves : null }, { onSuccess: () => setEdit(null) }) }} className="mt-4 grid max-w-lg gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus /></Field>
      <Field label="Type"><Select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{['clinic', 'reception', 'ward', 'ancillary', 'outside'].map((t) => <option key={t}>{t}</option>)}</Select></Field>
      <Field label="Site (label)"><Input value={edit.site_name} onChange={(e) => setEdit({ ...edit, site_name: e.target.value })} placeholder="Main building" /></Field>
      {edit.type === 'reception' && <Field label="Serves (empty = every clinic)"><div className="flex flex-wrap gap-2 text-sm">{visited.map((v) => <label key={v.id} className="flex items-center gap-1"><input type="checkbox" checked={edit.serves.includes(v.id)} onChange={(e) => setEdit({ ...edit, serves: e.target.checked ? [...edit.serves, v.id] : edit.serves.filter((x) => x !== v.id) })} />{v.name}</label>)}</div></Field>}
      <Err e={save.error} /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
    </form>}
  </div>
}

function UsersPage({ org }: { org: Organization }) {
  const save = useSave('save_user')
  const [edit, setEdit] = useState<{ id: string; name: string; title: string; kind: string; roles: { role_id: string; department_id: string | null }[]; retired: boolean } | null>(null)
  const roleName = (id: string) => org.roles.find((r) => r.id === id)?.name ?? id
  return <div><div className="mb-3 flex items-center justify-between"><H>Users</H><Button size="sm" onClick={() => setEdit({ id: newId(), name: '', title: '', kind: 'staff', roles: [], retired: false })}>+ User</Button></div>
    <p className="mb-2 text-xs text-neutral-500">A new user gets a login when they accept the invitation (linked by an administrator outside this screen in v1).</p>
    <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">{org.users.map((u) => <li key={u.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${u.retired_at ? 'text-neutral-400' : ''}`}><span className="w-44 font-medium">{u.name}</span><span className="w-20 text-xs text-neutral-500">{u.title}</span><span className="w-16 text-xs text-neutral-500">{u.kind}</span>
      <span className="flex-1 text-xs text-neutral-600">{u.roles.map((r) => `${roleName(r.role_id)}${r.department_id ? ` @ ${org.departments.find((d) => d.id === r.department_id)?.name}` : ''}`).join(', ')}</span>{u.retired_at ? <span className="text-xs">retired</span> : !u.accepted_at && <span className="text-xs text-amber-700">not signed in yet</span>}
      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: u.id, name: u.name, title: u.title ?? '', kind: u.kind, roles: u.roles.map((r) => ({ role_id: r.role_id, department_id: r.department_id })), retired: !!u.retired_at })}>Edit</Button></li>)}</ul>
    {edit && <form onSubmit={(e) => { e.preventDefault(); save.mutate({ id: edit.id, kind: edit.kind, name: edit.name, title: edit.title || null, roles: edit.roles, retired_at: edit.retired ? new Date().toISOString() : null }, { onSuccess: () => setEdit(null) }) }} className="mt-4 grid max-w-xl gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-3 gap-3"><Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus /></Field><Field label="Title"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Dr." /></Field><Field label="Kind"><Select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{['staff', 'pack', 'patient', 'proxy'].map((k) => <option key={k}>{k}</option>)}</Select></Field></div>
      <div><p className="mb-1 text-sm text-neutral-600">Roles</p>{edit.roles.map((r, i) => <div key={i} className="mb-1 flex gap-2"><Select value={r.role_id} onChange={(e) => setEdit({ ...edit, roles: edit.roles.map((x, j) => j === i ? { ...x, role_id: e.target.value } : x) })}>{org.roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        <Select value={r.department_id ?? ''} onChange={(e) => setEdit({ ...edit, roles: edit.roles.map((x, j) => j === i ? { ...x, department_id: e.target.value || null } : x) })}><option value="">every department</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select><button type="button" onClick={() => setEdit({ ...edit, roles: edit.roles.filter((_, j) => j !== i) })} className="text-neutral-400 hover:text-red-700">✕</button></div>)}
        <Button type="button" size="sm" variant="outline" onClick={() => setEdit({ ...edit, roles: [...edit.roles, { role_id: org.roles[0]?.id ?? '', department_id: null }] })}>+ Role</Button></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.retired} onChange={(e) => setEdit({ ...edit, retired: e.target.checked })} />Retired</label>
      <Err e={save.error} /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
    </form>}
  </div>
}

function TemplatesPage({ org }: { org: Organization }) {
  const save = useSave('save_template'); const retire = useSave('retire_template')
  const [edit, setEdit] = useState<{ id: string; name: string; department_id: string; items: string[] } | null>(null)
  return <div><div className="mb-3 flex items-center justify-between"><H>Presets</H><Button size="sm" onClick={() => setEdit({ id: newId(), name: '', department_id: '', items: [] })}>+ Preset</Button></div>
    <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">{org.templates.map((t) => <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm"><span className="w-48 font-medium">{t.name}</span><span className="flex-1 text-xs text-neutral-500">{t.items.map((i) => org.services.find((s) => s.id === i.service_id)?.name ?? '?').join(', ')}</span>
      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: t.id, name: t.name, department_id: t.department_id ?? '', items: t.items.map((i) => i.service_id) })}>Edit</Button><Button size="sm" variant="ghost" className="text-red-700" onClick={() => confirm(`Retire ${t.name}?`) && retire.mutate({ id: t.id })}>Retire</Button></li>)}</ul>
    {edit && <form onSubmit={(e) => { e.preventDefault(); save.mutate({ id: edit.id, name: edit.name, department_id: edit.department_id || null, items: edit.items.map((service_id) => ({ service_id })) }, { onSuccess: () => setEdit(null) }) }} className="mt-4 grid max-w-xl gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required autoFocus /></Field>
      <Field label="Department (optional)"><Select value={edit.department_id} onChange={(e) => setEdit({ ...edit, department_id: e.target.value })}><option value="">everyone</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
      <div className="flex flex-wrap gap-2 text-sm">{org.services.map((s) => <label key={s.id} className="flex items-center gap-1"><input type="checkbox" checked={edit.items.includes(s.id)} onChange={(e) => setEdit({ ...edit, items: e.target.checked ? [...edit.items, s.id] : edit.items.filter((x) => x !== s.id) })} />{s.name}</label>)}</div>
      <Err e={save.error} /><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={save.isPending || !edit.items.length}>Save</Button></div>
    </form>}
  </div>
}

function PacksPage({ org }: { org: Organization }) {
  const on = useSave('save_organization_pack'); const off = useSave('retire_organization_pack')
  return <div><H>Packs</H>
    {org.packs.length === 0 ? <p className="text-sm text-neutral-400">No packs installed on this server yet.</p> : <ul className="divide-y divide-neutral-100 rounded-md border border-neutral-200 bg-white">{org.packs.map((p) => <li key={p.key} className="flex items-center gap-3 px-3 py-2 text-sm"><span className="flex-1 font-medium">{p.name} <span className="font-mono text-xs text-neutral-400">{p.key}</span></span>
      {p.enabled ? <Button size="sm" variant="outline" onClick={() => off.mutate({ pack: p.key })}>Disable</Button> : <Button size="sm" onClick={() => on.mutate({ pack: p.key })}>Enable</Button>}</li>)}</ul>}
    <Err e={on.error ?? off.error} />
  </div>
}
