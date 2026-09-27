import { useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Eye, FlaskConical, KeyRound, LayoutGrid, ListChecks, Palette, Plus, Puzzle, Users, X } from 'lucide-react'
import { read, remove, save as saveRow, writeSetting } from '../db/rpc'
import { useDepartment } from '../hooks/organization'
import { newId } from '../hooks/writes'
import type { Organization } from '../db/types'
import { Avatar, Badge, Button, Callout, Centered, DeleteButton, EditPanel, Empty, Field, Fieldset, FormRow, IconButton, Input, NavItem, NewCard, PageHead, Row, SaveState, SearchInput, Section, Segmented, Select, Spinner, Switch, dateTime, errorText, useDraft } from '../ui'
import { Mfa } from '../shell/Mfa'
import { ServicesPage } from './settings/Services'
import { PAGE_ACTION, useMfaNeeded, useSave } from './settings/save'
import { RolesPage } from './settings/Roles'
import { ReadsPage } from './settings/Reads'
import { DepartmentsPage } from './settings/Departments'
import { TemplatesPage } from './settings/Presets'

const PAGES = [['organization', 'Organization', Building2], ['departments', 'Departments', LayoutGrid], ['services', 'Services', FlaskConical], ['users', 'Users', Users],
  ['roles', 'Roles', KeyRound], ['templates', 'Presets', ListChecks], ['packs', 'Packs', Puzzle], ['reads', 'Record reads', Eye]] as const

/** Settings (spec 02/05): the practice builds its own clinic here, a page per kind of thing, every list folds and every row edits in place. Owners only. */
export function SettingsScreen() {
  const { org, can } = useDepartment()
  const mfaNeeded = useMfaNeeded((s) => s.needed)
  if (!org) return <Centered><Spinner /></Centered>
  const pages = PAGES.filter(([k]) => can(PAGE_ACTION[k]))
  if (!pages.length) return <Centered><p className="text-14 text-faint">Settings need a role that manages something here.</p></Centered>
  const counts: Record<string, number | string> = { departments: org.departments.length, services: org.services.length, users: org.users.filter((u) => !u.retired_at).length, roles: org.roles.length,
    templates: org.templates.length, packs: `${org.packs.filter((p) => p.enabled).length}/${org.packs.length}` }
  return <div className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[200px_1fr]">
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:grid md:content-start md:gap-0.5 md:overflow-visible md:px-0 print:hidden">
      <p className="hidden px-3 pb-2 text-11 font-semibold uppercase tracking-[0.08em] text-faint md:block">Settings</p>
      {pages.map(([k, l, Icon]) => <NavItem key={k} to={`/settings/${k}`} icon={Icon} count={counts[k]} className="shrink-0">{l}</NavItem>)}
      <NavItem to="/design" icon={Palette} className="shrink-0 md:mt-3">Design system</NavItem>
    </nav>
    <div className="min-w-0">{mfaNeeded && <Mfa onDone={() => useMfaNeeded.getState().set(false)} />}<Routes>
      <Route index element={<Navigate to={pages[0][0]} replace />} />
      <Route path="organization" element={can(PAGE_ACTION.organization) ? <OrganizationPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="departments" element={can(PAGE_ACTION.departments) ? <DepartmentsPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="services" element={can(PAGE_ACTION.services) ? <ServicesPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="users" element={can(PAGE_ACTION.users) ? <UsersPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="roles" element={can(PAGE_ACTION.roles) ? <RolesPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="templates" element={can(PAGE_ACTION.templates) ? <TemplatesPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="packs" element={can(PAGE_ACTION.packs) ? <PacksPage org={org} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
      <Route path="reads" element={can(PAGE_ACTION.reads) ? <ReadsPage orgId={org.organization.id} /> : <Navigate to={`/settings/${pages[0][0]}`} replace />} />
    </Routes></div>
  </div>
}
const Err = ({ e }: { e: Error | null }) => e ? <p className="px-4 py-2 text-14 text-danger">{errorText(e)}</p> : null

// ── Organization ──
type Change = { id: string; at: string; action: string; what: string; user_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }
/** what a change changed: the fields that differ between before and after (all of after for a new thing) */
const changed = (c: Change) => { const a = c.after ?? {}; const b = c.before ?? {}
  return Object.fromEntries(Object.entries(a).filter(([k, v]) => !['id', 'organization_id', 'created_at'].includes(k) && JSON.stringify(v) !== JSON.stringify(b[k]))) }
function OrganizationPage({ org }: { org: Organization }) {
  const orgId = org.organization.id
  const ch = useQuery({ queryKey: ['settings_changes', orgId], queryFn: async () => (await read<{ changes: Change[] }>({ shape: 'audit', limit: 30 })).changes })
  const tiles: [string, string, number][] = [['departments', 'Departments', org.departments.length], ['services', 'Services', org.services.length],
    ['users', 'Users', org.users.filter((u) => !u.retired_at).length], ['packs', 'Packs on', org.packs.filter((p) => p.enabled).length]]
  // ids read as the names of what they point at
  const names = useMemo(() => new Map<string, string>([...org.roles, ...org.users, ...org.allDepartments, ...org.places, ...org.sites, ...org.templates, ...org.services].map((x) => [x.id, x.name])), [org])
  const val = (v: unknown) => { const s = (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).replace(/[{}"[\]]/g, '').replace(/,/g, ', ').replace(/:/g, ': ').replace(/_id\b/g, '') : String(v))
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => names.get(id) ?? `${id.slice(0, 8)}…`); return s.length > 60 ? `${s.slice(0, 60)}…` : s || '—' }
  return <div className="grid gap-4">
    <PageHead title={org.organization.name} hint="Settings that hold for the whole organization, and what changed lately." />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tiles.map(([k, l, n]) => <Link key={k} to={`/settings/${k}`} className="rounded-xl border border-line bg-surface px-4 py-3 shadow-xs transition-colors hover:border-accent-line">
      <p className="text-22 font-semibold tnum">{n}</p><p className="text-12 text-faint">{l}</p></Link>)}</div>
    {org.parked_pack_calls > 0 && <Callout tone="danger"><Link to="/settings/packs" className="rounded-sm hover:underline focus-ring">{org.parked_pack_calls} pack calls are parked and waiting. Check the packs.</Link></Callout>}
    <Section flush id="org.general" title="The clinic" summary={`${org.organization.time_zone.replace(/_/g, ' ')} · record ${org.organization.record_view === 'entries' ? 'as all entries' : 'by visit'}`}>
      <div className="grid gap-6 p-4"><ClinicZone org={org} /><RecordViewSetting org={org} /></div>
    </Section>
    <Section flush id="org.changes" title="Recent changes" count={ch.data?.length} summary="the last 30 changes to settings, newest first">
      {ch.isLoading ? <div className="p-4"><Spinner /></div> : (ch.data ?? []).length === 0 ? <Empty>Nothing changed yet.</Empty>
      : <ul className="divide-y divide-line text-12">{ch.data!.map((c) => <li key={c.id} className="grid gap-1 px-4 py-2 sm:grid-cols-[8.5rem_7.5rem_1fr] sm:gap-3">
          <span className="text-faint tnum">{dateTime(c.at)}</span>
          <span className="truncate"><Badge>{c.action} {c.what.replace(/^setting:/, '').replace(/[._]/g, ' ')}</Badge></span>
          <span className="min-w-0">{c.user_id && <span className="me-2 font-medium text-muted">{names.get(c.user_id) ?? ''}</span>}
            {Object.entries(changed(c)).map(([k, v]) => <span key={k} className="me-3 inline-block text-faint">{k.replace(/_/g, ' ')} <span className="text-fg">{val(v)}</span></span>)}</span></li>)}</ul>}
    </Section>
  </div>
}

/** the clinic's time zone: every time on screen, and every "today" on the server, is the clinic's */
function ClinicZone({ org }: { org: Organization }) {
  const save = useSave((zone: string) => writeSetting({ key: 'organization.time_zone', data: { zone } })); const saved = org.organization.time_zone; const [tz, setTz] = useState(saved)
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return [saved] } }, [saved])
  const now = new Date().toLocaleString(undefined, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return <FormRow label="Time zone" hint={'Times on every screen, and "today" in queues and counts, follow this clock.'} changed={tz !== saved}>
    <div className="flex flex-wrap items-center gap-2">
      <Select value={tz} onChange={(e) => setTz(e.target.value)} className="w-64">{[...new Set([saved, tz, 'UTC', ...zones])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select>
      <span className="text-12 text-faint">now {now} there</span>
      <SaveUndo dirty={tz !== saved} save={save} onSave={() => save.mutate(tz)} onUndo={() => setTz(saved)} />
    </div>
  </FormRow>
}

/** how every department's staff see the record: by visit, or every entry newest first (one choice for the organization) */
function RecordViewSetting({ org }: { org: Organization }) {
  const save = useSave((view: Organization['organization']['record_view']) => writeSetting({ key: 'organization.record_view', data: { view } })); const saved = org.organization.record_view ?? 'visits'; const [v, setV] = useState(saved)
  return <FormRow label="The record shows" changed={v !== saved}
    hint={`For everyone in ${org.organization.name}. By visit groups the record into visits, newest activity first; all entries lists every entry newest first.`}>
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={v} onChange={setV} options={[['visits', 'By visit'], ['entries', 'All entries']]} />
      <SaveUndo dirty={v !== saved} save={save} onSave={() => save.mutate(v)} onUndo={() => setV(saved)} />
    </div>
  </FormRow>
}

/** a single setting's own save: appears once it differs from what is saved */
function SaveUndo({ dirty, save, onSave, onUndo }: { dirty: boolean; save: { error: Error | null; isSuccess: boolean; isPending: boolean }; onSave: () => void; onUndo: () => void }) {
  if (save.error) return <span className="text-14 text-danger">{errorText(save.error)}</span>
  if (!dirty) return save.isSuccess ? <SaveState state="saved" /> : null
  return <><Button size="sm" onClick={onSave} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button><Button size="sm" variant="ghost" onClick={onUndo}>Undo</Button><SaveState state="unsaved" /></>
}

// ── Users ──
const KINDS = ['staff', 'pack', 'patient', 'proxy']
type UserDraft = { name: string; title: string; kind: string; roles: { role_id: string; department_id: string | null }[]; retired: boolean }
function UsersPage({ org }: { org: Organization }) {
  const save = useSave((r: Record<string, unknown>) => saveRow('user', r)); const del = useSave((id: string) => remove('user', id)); const e = useDraft<UserDraft>(); const [q, setQ] = useState('')
  const roleName = (id: string) => org.roles.find((r) => r.id === id)?.name ?? id
  const deptName = (id: string | null) => id ? org.departments.find((d) => d.id === id)?.name ?? '?' : 'every department'
  const f = q.trim().toLowerCase()
  const shown = org.users.filter((u) => !f || u.name.toLowerCase().includes(f) || (u.title ?? '').toLowerCase().includes(f) || u.roles.some((r) => roleName(r.role_id).toLowerCase().includes(f)))
  const open = (id: string, d: UserDraft, isNew = false) => { save.reset(); e.toggle(id, d, isNew) }

  const editor = () => { const d = e.draft!; const was = org.users.find((u) => u.id === e.id)
    const setRole = (i: number, p: Partial<UserDraft['roles'][number]>) => e.set({ roles: d.roles.map((x, j) => j === i ? { ...x, ...p } : x) })
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? del.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      aside={was && !was.accepted_at && <DeleteButton what={was.name} onDelete={() => del.mutate(was.id, { onSuccess: e.done })} />}
      // the holdings go only when they changed: nobody may send their own (self_change)
      onSave={() => save.mutate({ id: e.id, ...(was ? {} : { kind: d.kind }), name: d.name.trim(), title: d.title || null, retired: d.retired,
        ...(!was || e.changed('roles') ? { holdings: d.roles } : {}) }, { onSuccess: e.done })}>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_9rem]">
        <Field label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Amina Hassan" required autoFocus /></Field>
        <Field label="Title" changed={e.changed('title')}><Input value={d.title} onChange={(x) => e.set({ title: x.target.value })} placeholder="Dr." /></Field>
        <Field label="Kind" changed={e.changed('kind')} hint={was ? 'Set when the user is made.' : undefined}><Select value={d.kind} disabled={!!was} onChange={(x) => e.set({ kind: x.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Field>
      </div>
      <Fieldset title="Roles">
        <p className="-mt-2 text-12 text-faint">What this user may do, and where. A role for every department holds everywhere.</p>
        {d.roles.length === 0 && <p className="text-12 text-warn">No roles: this user can sign in but do nothing.</p>}
        {d.roles.map((r, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1.5rem] items-center gap-2">
          <Select value={r.role_id} onChange={(x) => setRole(i, { role_id: x.target.value })}>{org.roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <Select value={r.department_id ?? ''} onChange={(x) => setRole(i, { department_id: x.target.value || null })}><option value="">every department</option>{org.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <IconButton type="button" title="Remove role" tone="danger" onClick={() => e.set({ roles: d.roles.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></IconButton></div>)}
        <div><Button type="button" size="sm" variant="outline" onClick={() => e.set({ roles: [...d.roles, { role_id: org.roles[0]?.id ?? '', department_id: null }] })}><Plus className="h-3.5 w-3.5" />Role</Button></div>
      </Fieldset>
      <FormRow label="Status" changed={e.changed('retired')} hint="A retired user can no longer sign in. Everything they wrote stays on the record.">
        <Segmented value={d.retired ? 'retired' : 'active'} onChange={(v) => e.set({ retired: v === 'retired' })} options={[['active', 'Active'], ['retired', 'Retired']]} /></FormRow>
    </EditPanel> }

  const list = (us: Organization['users']) => <ul className="divide-y divide-line">{us.map((u) => <Row key={u.id} open={e.id === u.id && !e.isNew} editor={editor} muted={!!u.retired_at}
    onToggle={() => open(u.id, { name: u.name, title: u.title ?? '', kind: u.kind, roles: u.roles.map((r) => ({ role_id: r.role_id, department_id: r.department_id })), retired: !!u.retired_at })}>
    <Avatar name={u.name} muted={!!u.retired_at} />
    <span className="w-48 truncate"><span className="font-medium">{u.name}</span>{u.title && <span className="ms-1.5 text-12 text-faint">{u.title}</span>}</span>
    {u.kind !== 'staff' && <Badge tone="info">{u.kind}</Badge>}
    <span className="flex flex-wrap gap-1">{u.roles.map((r, i) => <Badge key={i} tone="accent">{roleName(r.role_id)}{r.department_id && <span className="ms-1 font-normal opacity-70">· {deptName(r.department_id)}</span>}</Badge>)}
      {u.roles.length === 0 && <span className="text-12 text-faint">no roles</span>}</span>
    {!u.retired_at && !u.accepted_at && <Badge tone="warn">not signed in yet</Badge>}
  </Row>)}</ul>
  const active = shown.filter((u) => !u.retired_at); const retired = shown.filter((u) => u.retired_at)

  return <div className="grid gap-4">
    <PageHead title="Users" hint="Who works here and what each may do. A new user gets a login when they accept the invitation (linked by an administrator outside this screen in v1)."
      right={<Button size="sm" onClick={() => open(newId(), { name: '', title: '', kind: 'staff', roles: [], retired: false }, true)}><Plus className="h-3.5 w-3.5" />User</Button>} />
    <SearchInput className="max-w-sm" value={q} onChange={setQ} placeholder="Filter by name, title or role…" />
    {e.isNew && <NewCard title="New user">{editor()}</NewCard>}
    <Section flush id="users.active" title="Active" count={active.length} summary={active.slice(0, 6).map((u) => u.name).join(', ')}>{active.length ? list(active) : <Empty>{f ? 'No one matches.' : 'No active users.'}</Empty>}</Section>
    {retired.length > 0 && <Section flush id="users.retired" title="Retired" count={retired.length} start={false} summary="can no longer sign in">{list(retired)}</Section>}
  </div>
}

// ── Packs ──
function PacksPage({ org }: { org: Organization }) {
  // the packs used are one setting: the whole list is written each time
  const used = org.packs.filter((p) => p.enabled).map((p) => p.key)
  const on = useSave((key: string) => writeSetting({ key: 'organization.packs_used', data: { packs: [...used, key] } }))
  const off = useSave((key: string) => writeSetting({ key: 'organization.packs_used', data: { packs: used.filter((k) => k !== key) } }))
  const busy = on.isPending || off.isPending
  return <div className="grid gap-4">
    <PageHead title="Packs" hint="Add-ons installed on this server. Turn one on to use it in this organization." />
    {org.parked_pack_calls > 0 && <Callout tone="danger">{org.parked_pack_calls} pack calls are parked and waiting.</Callout>}
    <Section flush id="packs" title="Installed" count={org.packs.length} summary={org.packs.filter((p) => p.enabled).map((p) => p.name).join(', ') || 'none on'}>
      {org.packs.length === 0 ? <Empty>No packs installed on this server yet.</Empty>
      : <ul className="divide-y divide-line">{org.packs.map((p) => <li key={p.key} className="flex items-center gap-3 px-4 py-2.5 text-14">
          <span className="min-w-0 flex-1"><span className="font-medium">{p.name}</span> <span className="font-mono text-12 text-faint">{p.key}</span></span>
          <Badge tone={p.enabled ? 'accent' : 'neutral'}>{p.enabled ? 'On' : 'Off'}</Badge>
          <Switch checked={p.enabled} label={p.name} disabled={busy}
            onChange={() => p.enabled ? confirm(`Turn off ${p.name}? What it adds stops working here until it is turned on again.`) && off.mutate(p.key) : on.mutate(p.key)} />
        </li>)}</ul>}
      <Err e={on.error ?? off.error} />
    </Section>
  </div>
}
