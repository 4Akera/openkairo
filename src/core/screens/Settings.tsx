import { useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Eye, FlaskConical, KeyRound, LayoutGrid, ListChecks, Plus, Puzzle, Trash2, Users, X } from 'lucide-react'
import { rpc } from '../db/rpc'
import { useDepartment } from '../hooks/organization'
import { newId } from '../hooks/writes'
import type { Department, Organization } from '../db/types'
import { Badge, Button, Card, Centered, IconButton, Input, Select, Spinner, cn, dateTime, errorText } from '../ui'
import { Mfa } from '../shell/Mfa'
import { ServicesPage } from './settings/Services'
import { PAGE_ACTION, useMfaNeeded, useSave } from './settings/save'
import { RolesPage } from './settings/Roles'
import { EditPanel, Empty, Filter, Group, Labeled, Line, PageHead, Pick, Row, Saved, Section, Segmented, Unsaved, useDraft } from './settings/parts'
import { ReadsPage } from './settings/Reads'
import { readPresetLine } from './visit/expand'
import { commandNamed } from './visit/commands'
import { replyFormFor } from '../renderers'
import { PROBLEMS } from './visit/catalog'

const PAGES = [['organization', 'Organization', Building2], ['departments', 'Departments', LayoutGrid], ['services', 'Services', FlaskConical], ['users', 'Users', Users],
  ['roles', 'Roles', KeyRound], ['templates', 'Presets', ListChecks], ['packs', 'Packs', Puzzle], ['reads', 'Record reads', Eye]] as const

/** Settings (spec 02/05): the practice builds its own clinic here, a page per kind of thing, every list folds and every row edits in place. Owners only. */
export function SettingsScreen() {
  const { org, can } = useDepartment()
  const mfaNeeded = useMfaNeeded((s) => s.needed)
  if (!org) return <Centered><Spinner /></Centered>
  const pages = PAGES.filter(([k]) => can(PAGE_ACTION[k]))
  if (!pages.length) return <Centered><p className="text-sm text-neutral-500">Settings need a role that manages something here.</p></Centered>
  const counts: Record<string, number | string> = { departments: org.departments.length, services: org.services.length, users: org.users.filter((u) => !u.retired_at).length, roles: org.roles.length,
    templates: org.templates.length, packs: `${org.packs.filter((p) => p.enabled).length}/${org.packs.length}` }
  return <div className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[200px_1fr]">
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:grid md:content-start md:gap-0.5 md:overflow-visible md:px-0 print:hidden">
      <p className="hidden px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500 md:block">Settings</p>
      {pages.map(([k, l, Icon]) => <NavLink key={k} to={`/settings/${k}`} className={({ isActive }) => cn('flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors', isActive ? 'bg-teal-50 font-medium text-teal-900' : 'text-neutral-600 hover:bg-neutral-100')}>
        <Icon className="h-4 w-4 shrink-0 opacity-70" />{l}{counts[k] !== undefined && <span className="ml-auto pl-2 text-[11px] text-neutral-400 tnum">{counts[k]}</span>}</NavLink>)}
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
const Err = ({ e }: { e: Error | null }) => e ? <p className="px-4 py-2 text-sm text-red-700">{errorText(e)}</p> : null
/** a new thing's editor, above the lists until it is saved */
const NewCard = ({ title, children }: { title: string; children: React.ReactNode }) => <Card className="overflow-hidden ring-2 ring-teal-700/15"><p className="px-4 pt-3 text-sm font-semibold">{title}</p>{children}</Card>
/** retire from inside the editor, never by a stray click on a row */
const RetireButton = ({ what, onRetire }: { what: string; onRetire: () => void }) => <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => confirm(`Retire ${what}?`) && onRetire()}><Trash2 className="h-3.5 w-3.5" />Retire</Button>

// ── Organization ──
type Change = { id: string; recorded_at: string; table_name: string; changes: Record<string, unknown>; user_name?: string }
function OrganizationPage({ org }: { org: Organization }) {
  const orgId = org.organization.id
  const ch = useQuery({ queryKey: ['settings_changes', orgId], queryFn: () => rpc<Change[]>('read_settings_changes', { organization_id: orgId, limit: 30 }) })
  const tiles: [string, string, number][] = [['departments', 'Departments', org.departments.length], ['services', 'Services', org.services.length],
    ['users', 'Users', org.users.filter((u) => !u.retired_at).length], ['packs', 'Packs on', org.packs.filter((p) => p.enabled).length]]
  // ids read as the names of what they point at
  const names = useMemo(() => new Map<string, string>([...org.departments, ...org.services, ...org.roles, ...org.users, ...org.templates].map((x) => [x.id, x.name])), [org])
  const val = (v: unknown) => { const s = (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).replace(/[{}"[\]]/g, '').replace(/,/g, ', ').replace(/:/g, ': ').replace(/_id\b/g, '') : String(v))
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => names.get(id) ?? `${id.slice(0, 8)}…`); return s.length > 60 ? `${s.slice(0, 60)}…` : s || '—' }
  return <div className="grid gap-4">
    <PageHead title={org.organization.name} hint="Settings that hold for the whole organization, and what changed lately." />
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{tiles.map(([k, l, n]) => <Link key={k} to={`/settings/${k}`} className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3 shadow-xs transition-colors hover:border-teal-300">
      <p className="text-xl font-semibold tnum">{n}</p><p className="text-xs text-neutral-500">{l}</p></Link>)}</div>
    {org.parked_pack_calls > 0 && <Link to="/settings/packs" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">{org.parked_pack_calls} pack calls are parked and waiting. Check the packs.</Link>}
    <Section id="org.general" title="The clinic" summary={`${org.organization.time_zone.replace(/_/g, ' ')} · record ${org.organization.record_view === 'entries' ? 'as all entries' : 'by visit'}`}>
      <div className="grid gap-6 p-4"><ClinicZone org={org} /><RecordViewSetting org={org} /></div>
    </Section>
    <Section id="org.changes" title="Recent changes" count={ch.data?.length} summary="the last 30 changes to settings, newest first">
      {ch.isLoading ? <div className="p-4"><Spinner /></div> : (ch.data ?? []).length === 0 ? <Empty>Nothing changed yet.</Empty>
      : <ul className="divide-y divide-neutral-100 text-xs">{ch.data!.map((c) => <li key={c.id} className="grid gap-1 px-4 py-2 sm:grid-cols-[8.5rem_7.5rem_1fr] sm:gap-3">
          <span className="text-neutral-400 tnum">{dateTime(c.recorded_at)}</span>
          <span className="truncate"><Badge>{c.table_name.replace(/_/g, ' ')}</Badge></span>
          <span className="min-w-0">{c.user_name && <span className="mr-2 font-medium text-neutral-700">{c.user_name}</span>}
            {Object.entries(c.changes ?? {}).map(([k, v]) => <span key={k} className="mr-3 inline-block text-neutral-500">{k.replace(/_/g, ' ')} <span className="text-neutral-800">{val(v)}</span></span>)}</span></li>)}</ul>}
    </Section>
  </div>
}

/** the clinic's time zone: every time on screen, and every "today" on the server, is the clinic's */
function ClinicZone({ org }: { org: Organization }) {
  const save = useSave('save_organization'); const saved = org.organization.time_zone; const [tz, setTz] = useState(saved)
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return [saved] } }, [saved])
  const now = new Date().toLocaleString(undefined, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return <Line label="Time zone" hint={'Times on every screen, and "today" in queues and counts, follow this clock.'} changed={tz !== saved}>
    <div className="flex flex-wrap items-center gap-2">
      <Select value={tz} onChange={(e) => setTz(e.target.value)} className="w-64">{[...new Set([saved, tz, 'UTC', ...zones])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select>
      <span className="text-xs text-neutral-500">now {now} there</span>
      <SaveUndo dirty={tz !== saved} save={save} onSave={() => save.mutate({ time_zone: tz })} onUndo={() => setTz(saved)} />
    </div>
  </Line>
}

/** how every department's staff see the record: by visit, or every entry newest first (one choice for the organization) */
function RecordViewSetting({ org }: { org: Organization }) {
  const save = useSave('save_organization'); const saved = org.organization.record_view ?? 'visits'; const [v, setV] = useState(saved)
  return <Line label="The record shows" changed={v !== saved}
    hint={`For everyone in ${org.organization.name}. By visit groups the record into visits, newest activity first; all entries lists every entry newest first.`}>
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={v} onChange={setV} options={[['visits', 'By visit'], ['entries', 'All entries']]} />
      <SaveUndo dirty={v !== saved} save={save} onSave={() => save.mutate({ record_view: v })} onUndo={() => setV(saved)} />
    </div>
  </Line>
}

/** a single setting's own save: appears once it differs from what is saved */
function SaveUndo({ dirty, save, onSave, onUndo }: { dirty: boolean; save: ReturnType<typeof useSave>; onSave: () => void; onUndo: () => void }) {
  if (save.error) return <span className="text-sm text-red-700">{errorText(save.error)}</span>
  if (!dirty) return save.isSuccess ? <Saved /> : null
  return <><Button size="sm" onClick={onSave} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button><Button size="sm" variant="ghost" onClick={onUndo}>Undo</Button><Unsaved /></>
}

// ── Departments ──
const TYPES: [string, string][] = [['clinic', 'Clinics'], ['ward', 'Wards'], ['reception', 'Reception'], ['ancillary', 'Ancillary'], ['outside', 'Outside']]
const TYPE_HINT: Record<string, string> = { clinic: 'Patients are seen here in visits.', ward: 'Patients stay here.', reception: 'Checks patients in for the clinics it serves.',
  ancillary: 'Does work others request: a lab, imaging, a pharmacy.', outside: 'Somewhere outside the organization that requests go to.' }
const REVIEW: [Department['review_results'], string][] = [['critical', 'Critical only'], ['abnormal', 'Critical and abnormal'], ['all', 'Every result']]
type DeptDraft = { name: string; type: string; site_name: string; serves: string[]; patients_wait: boolean; review_results: Department['review_results']; private_visits: boolean; after_done: Department['after_done'] }

function DepartmentsPage({ org }: { org: Organization }) {
  const save = useSave('save_department'); const retire = useSave('retire_department'); const e = useDraft<DeptDraft>()
  const visited = org.departments.filter((d) => d.is_visited)
  const nameOf = (id: string | null) => id === null ? 'every clinic' : org.departments.find((x) => x.id === id)?.name ?? '?'
  const types = [...TYPES, ...[...new Set(org.departments.map((d) => d.type))].filter((t) => !TYPES.some(([k]) => k === t)).map((t): [string, string] => [t, t[0].toUpperCase() + t.slice(1)])]
  const open = (id: string, d: DeptDraft, isNew = false) => { save.reset(); retire.reset(); e.toggle(id, d, isNew) }
  const add = (type = 'clinic') => open(newId(), { name: '', type, site_name: '', serves: [], patients_wait: true, review_results: 'critical', private_visits: false, after_done: 'next' }, true)

  const editor = () => { const d = e.draft!; const rules = ['clinic', 'ward'].includes(d.type); const flow = !['reception', 'outside'].includes(d.type); const existing = org.departments.find((x) => x.id === e.id)
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id, name: d.name, type: d.type, site_name: d.site_name || null, serves: d.type === 'reception' ? d.serves : null,
        patients_wait: d.patients_wait, review_results: d.review_results, private_visits: d.private_visits, after_done: d.after_done }, { onSuccess: e.done })}
      aside={existing && <RetireButton what={existing.name} onRetire={() => retire.mutate({ id: existing.id }, { onSuccess: e.done })} />}>
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem_1fr]">
        <Labeled label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Cardiology" required autoFocus /></Labeled>
        <Labeled label="Type" changed={e.changed('type')} hint={TYPE_HINT[d.type]}><Select value={d.type} onChange={(x) => e.set({ type: x.target.value })}>{types.map(([k]) => <option key={k}>{k}</option>)}</Select></Labeled>
        <Labeled label="Site" changed={e.changed('site_name')} hint="Optional, a label for where it is."><Input value={d.site_name} onChange={(x) => e.set({ site_name: x.target.value })} placeholder="Main building" /></Labeled>
      </div>
      {d.type === 'reception' && <Group title="Serves">
        <Line label="Checks in for" changed={e.changed('serves')} hint="Choose none to serve every clinic.">
          <div className="flex flex-wrap gap-1.5">{visited.map((v) => { const on = d.serves.includes(v.id); return <Pick key={v.id} on={on} onClick={() => e.set({ serves: on ? d.serves.filter((x) => x !== v.id) : [...d.serves, v.id] })}>{v.name}</Pick> })}
            {visited.length === 0 && <span className="text-xs text-neutral-400">No clinics or wards yet.</span>}</div>
        </Line></Group>}
      {flow && <Group title="Rules">
        <Line label="After Done" changed={e.changed('after_done')} hint="Where Done (or Release on a bench) takes you.">
          <Segmented value={d.after_done} onChange={(v) => e.set({ after_done: v })} options={[['next', 'Next patient'], ['queue', 'Back to the queue']]} /></Line>
        {rules && <>
        <Line label="When results are still out at Done" changed={e.changed('patients_wait')} hint="Whether the patient stays for them or is sent home and called back.">
          <Segmented value={d.patients_wait ? 'wait' : 'home'} onChange={(v) => e.set({ patients_wait: v === 'wait' })} options={[['wait', 'Patient waits'], ['home', 'Patient goes home']]} /></Line>
        <Line label="Results to review" changed={e.changed('review_results')} hint="Results for a patient who left before being seen again, and corrected results, always go to review.">
          <Segmented value={d.review_results} onChange={(v) => e.set({ review_results: v })} options={REVIEW} /></Line>
        <Line label="Visits" changed={e.changed('private_visits')} hint={'A private visit\'s notes show as "Private note" outside this department; its prescriptions, results and requests stay visible to everyone.'}>
          <Segmented value={d.private_visits ? 'private' : 'shared'} onChange={(v) => e.set({ private_visits: v === 'private' })} options={[['shared', 'Shared'], ['private', 'Private from the start']]} /></Line></>}
      </Group>}
    </EditPanel> }

  return <div className="grid gap-4">
    <PageHead title="Departments" hint="Where patients are seen and where work is done. Open one to rename it or change its rules." right={<Button size="sm" onClick={() => add()}><Plus className="h-3.5 w-3.5" />Department</Button>} />
    {e.isNew && <NewCard title="New department">{editor()}</NewCard>}
    {types.map(([t, label]) => { const ds = org.departments.filter((d) => d.type === t); if (!ds.length) return null
      return <Section key={t} id={`dept.${t}`} title={label} count={ds.length} summary={ds.map((d) => d.name).join(', ')}
        right={<IconButton title={`Add to ${label.toLowerCase()}`} onClick={() => add(t)}><Plus className="h-3.5 w-3.5" /></IconButton>}>
        <ul className="divide-y divide-neutral-100">{ds.map((d) => <Row key={d.id} open={e.id === d.id && !e.isNew} editor={editor}
          onToggle={() => open(d.id, { name: d.name, type: d.type, site_name: d.site_name ?? '', serves: (d.serves ?? []).filter((s): s is string => !!s), patients_wait: d.patients_wait, review_results: d.review_results, private_visits: d.private_visits, after_done: d.after_done ?? 'next' })}>
          <span className="w-48 truncate font-medium">{d.name}</span>
          {d.site_name && <span className="text-xs text-neutral-400">{d.site_name}</span>}
          {['clinic', 'ward'].includes(d.type) && <span className="flex flex-wrap gap-1">
            <Badge>{d.patients_wait ? 'Patient waits' : 'Goes home'}</Badge><Badge>Review: {REVIEW.find(([k]) => k === d.review_results)?.[1].toLowerCase()}</Badge>{d.private_visits && <Badge tone="amber">Private visits</Badge>}</span>}
          {d.after_done === 'queue' && !['reception', 'outside'].includes(d.type) && <Badge>Then: queue</Badge>}
          {d.type === 'reception' && <span className="text-xs text-neutral-500">serves {(d.serves ?? []).length ? (d.serves ?? []).map(nameOf).join(', ') : 'every clinic'}</span>}
        </Row>)}</ul>
      </Section> })}
    {org.departments.length === 0 && <Card><Empty>No departments yet. Add the first one.</Empty></Card>}
  </div>
}

// ── Users ──
const KINDS = ['staff', 'pack', 'patient', 'proxy']
const initials = (name: string) => name.split(/\s+/).filter((w) => w && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
type UserDraft = { name: string; title: string; kind: string; roles: { role_id: string; department_id: string | null }[]; retired: boolean }
function UsersPage({ org }: { org: Organization }) {
  const save = useSave('save_user'); const e = useDraft<UserDraft>(); const [q, setQ] = useState('')
  const roleName = (id: string) => org.roles.find((r) => r.id === id)?.name ?? id
  const deptName = (id: string | null) => id ? org.departments.find((d) => d.id === id)?.name ?? '?' : 'every department'
  const f = q.trim().toLowerCase()
  const shown = org.users.filter((u) => !f || u.name.toLowerCase().includes(f) || (u.title ?? '').toLowerCase().includes(f) || u.roles.some((r) => roleName(r.role_id).toLowerCase().includes(f)))
  const open = (id: string, d: UserDraft, isNew = false) => { save.reset(); e.toggle(id, d, isNew) }

  const editor = () => { const d = e.draft!; const was = org.users.find((u) => u.id === e.id)
    const setRole = (i: number, p: Partial<UserDraft['roles'][number]>) => e.set({ roles: d.roles.map((x, j) => j === i ? { ...x, ...p } : x) })
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id, kind: d.kind, name: d.name, title: d.title || null, roles: d.roles, retired_at: d.retired ? was?.retired_at ?? new Date().toISOString() : null }, { onSuccess: e.done })}>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_9rem]">
        <Labeled label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Amina Hassan" required autoFocus /></Labeled>
        <Labeled label="Title" changed={e.changed('title')}><Input value={d.title} onChange={(x) => e.set({ title: x.target.value })} placeholder="Dr." /></Labeled>
        <Labeled label="Kind" changed={e.changed('kind')}><Select value={d.kind} onChange={(x) => e.set({ kind: x.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Labeled>
      </div>
      <Group title="Roles">
        <p className="-mt-2 text-xs text-neutral-500">What this user may do, and where. A role for every department holds everywhere.</p>
        {d.roles.length === 0 && <p className="text-xs text-amber-700">No roles: this user can sign in but do nothing.</p>}
        {d.roles.map((r, i) => <div key={i} className="grid grid-cols-[1fr_1fr_1.5rem] items-center gap-2">
          <Select value={r.role_id} onChange={(x) => setRole(i, { role_id: x.target.value })}>{org.roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <Select value={r.department_id ?? ''} onChange={(x) => setRole(i, { department_id: x.target.value || null })}><option value="">every department</option>{org.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
          <IconButton type="button" title="Remove role" className="hover:text-red-700" onClick={() => e.set({ roles: d.roles.filter((_, j) => j !== i) })}><X className="h-3.5 w-3.5" /></IconButton></div>)}
        <div><Button type="button" size="sm" variant="outline" onClick={() => e.set({ roles: [...d.roles, { role_id: org.roles[0]?.id ?? '', department_id: null }] })}><Plus className="h-3.5 w-3.5" />Role</Button></div>
      </Group>
      <Line label="Status" changed={e.changed('retired')} hint="A retired user can no longer sign in. Everything they wrote stays on the record.">
        <Segmented value={d.retired ? 'retired' : 'active'} onChange={(v) => e.set({ retired: v === 'retired' })} options={[['active', 'Active'], ['retired', 'Retired']]} /></Line>
    </EditPanel> }

  const list = (us: Organization['users']) => <ul className="divide-y divide-neutral-100">{us.map((u) => <Row key={u.id} open={e.id === u.id && !e.isNew} editor={editor} muted={!!u.retired_at}
    onToggle={() => open(u.id, { name: u.name, title: u.title ?? '', kind: u.kind, roles: u.roles.map((r) => ({ role_id: r.role_id, department_id: r.department_id })), retired: !!u.retired_at })}>
    <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold', u.retired_at ? 'bg-neutral-100 text-neutral-400' : 'bg-teal-50 text-teal-800')}>{initials(u.name)}</span>
    <span className="w-48 truncate"><span className="font-medium">{u.name}</span>{u.title && <span className="ml-1.5 text-xs text-neutral-400">{u.title}</span>}</span>
    {u.kind !== 'staff' && <Badge tone="blue">{u.kind}</Badge>}
    <span className="flex flex-wrap gap-1">{u.roles.map((r, i) => <Badge key={i} tone="brand">{roleName(r.role_id)}{r.department_id && <span className="ml-1 font-normal opacity-70">· {deptName(r.department_id)}</span>}</Badge>)}
      {u.roles.length === 0 && <span className="text-xs text-neutral-400">no roles</span>}</span>
    {!u.retired_at && !u.accepted_at && <Badge tone="amber">not signed in yet</Badge>}
  </Row>)}</ul>
  const active = shown.filter((u) => !u.retired_at); const retired = shown.filter((u) => u.retired_at)

  return <div className="grid gap-4">
    <PageHead title="Users" hint="Who works here and what each may do. A new user gets a login when they accept the invitation (linked by an administrator outside this screen in v1)."
      right={<Button size="sm" onClick={() => open(newId(), { name: '', title: '', kind: 'staff', roles: [], retired: false }, true)}><Plus className="h-3.5 w-3.5" />User</Button>} />
    <Filter value={q} onChange={setQ} placeholder="Filter by name, title or role…" />
    {e.isNew && <NewCard title="New user">{editor()}</NewCard>}
    <Section id="users.active" title="Active" count={active.length} summary={active.slice(0, 6).map((u) => u.name).join(', ')}>{active.length ? list(active) : <Empty>{f ? 'No one matches.' : 'No active users.'}</Empty>}</Section>
    {retired.length > 0 && <Section id="users.retired" title="Retired" count={retired.length} start={false} summary="can no longer sign in">{list(retired)}</Section>}
  </div>
}

// ── Presets ──
type PresetDraft = { name: string; department_id: string; items: string[]; shortcut: string; lines: string }
function TemplatesPage({ org }: { org: Organization }) {
  const save = useSave('save_template'); const retire = useSave('retire_template'); const e = useDraft<PresetDraft>(); const [pq, setPq] = useState('')
  const svc = (id: string) => org.services.find((s) => s.id === id)
  const open = (id: string, d: PresetDraft, isNew = false) => { save.reset(); retire.reset(); setPq(''); e.toggle(id, d, isNew) }
  const groups: [string, string][] = [['', 'For everyone'], ...org.departments.filter((d) => org.templates.some((t) => t.department_id === d.id)).map((d): [string, string] => [d.id, d.name])]

  const editor = () => { const d = e.draft!; const existing = org.templates.find((t) => t.id === e.id); const f = pq.trim().toLowerCase()
    const flip = (id: string) => e.set({ items: d.items.includes(id) ? d.items.filter((x) => x !== id) : [...d.items, id] })
    const findable = org.services.filter((s) => !d.items.includes(s.id) && (!f || s.name.toLowerCase().includes(f) || s.code.includes(f)))
    const lines = d.lines.split('\n').map((l) => l.trim()).filter(Boolean); const sc = d.shortcut.trim().replace(/^\//, '').toLowerCase()
    const scBad = !!sc && (!/^[a-z0-9_]{1,20}$/.test(sc) || !!commandNamed(sc) || org.templates.some((t) => t.id !== e.id && t.shortcut === sc))   // a command's name or alias would win
    // each line as the visit's composer will read it; "for dm" links to the patient's own problem, so it is read against the problem list
    const pctx = { services: org.services.filter((x) => !replyFormFor(x.reply_type)?.automatic), templates: [], departments: org.departments, problems: PROBLEMS.map((p) => ({ id: p.icd10, name: p.name })), departmentId: d.department_id }
    const checked = lines.map((l) => { const r = readPresetLine(l, pctx); return { l, r: r && 'error' in r ? r.error : null, what: r && 'ok' in r ? r.ok.map((p) => p.line).join(' · ') + (/\sfor\s/i.test(l) && /^\/?rx\s/.test(l.trim()) ? ' — linked when the patient has it' : '') : null } })
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error} canSave={!!d.name.trim() && (d.items.length > 0 || lines.length > 0) && !scBad && !checked.some((c) => c.r) && (!lines.length || !!sc)} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id, name: d.name, department_id: d.department_id || null, items: d.items.map((service_id) => ({ service_id })), shortcut: sc || null, lines }, { onSuccess: e.done })}
      aside={existing && <RetireButton what={existing.name} onRetire={() => retire.mutate({ id: existing.id }, { onSuccess: e.done })} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Antenatal booking" required autoFocus /></Labeled>
        <Labeled label="Offered to" changed={e.changed('department_id')} hint="Everyone, or only one department's staff."><Select value={d.department_id} onChange={(x) => e.set({ department_id: x.target.value })}><option value="">everyone</option>{org.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Labeled>
        <Labeled label="Shortcut" changed={e.changed('shortcut')} hint={scBad ? `Letters, digits and _ only, and not taken: ${commandNamed(sc) ? `/${sc} is the ${commandNamed(sc)!.label.toLowerCase()} command` : 'another preset has it'}.` : lines.length && !sc ? 'Lines run only from a shortcut — give it one.' : 'Typed in the visit as /dm — runs the services and the lines below.'}>
          <Input aria-label="Shortcut" value={d.shortcut} onChange={(x) => e.set({ shortcut: x.target.value })} placeholder="/dm" className={cn('font-mono', (scBad || (lines.length > 0 && !sc)) && 'border-red-400')} /></Labeled>
      </div>
      <Group title={`Lines · ${lines.length}`}>
        <textarea aria-label="Lines" value={d.lines} onChange={(x) => e.set({ lines: x.target.value })} rows={Math.max(3, lines.length + 1)} spellCheck={false} placeholder={'/rx metformin 500 bd 30d for dm\n/plan review HbA1c in 3 months'}
          className="-mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-[13px] focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20" />
        <p className="-mt-1 text-xs text-neutral-500">One line each, as typed in the visit’s composer: /rx, /dx, /al, /v, /plan … (the slash may be left out here). They become drafts the clinician can change before Done.</p>
        {checked.some((c) => c.r) && <p className="text-xs text-red-700">Fix the lines in red first — the visit could not read them.</p>}
        {checked.length > 0 && <ul className="grid gap-0.5 text-xs">{checked.map((c, i) => <li key={i} className={c.r ? 'text-red-700' : 'text-neutral-600'}><span className="font-mono text-neutral-400">{i + 1}</span> {c.r ?? c.what}</li>)}</ul>}
      </Group>
      <Group title={`Services · ${d.items.length} chosen`}>
        {d.items.length > 0 && <div className="-mt-1 flex flex-wrap gap-1.5">{d.items.map((id) => <Pick key={id} on onClick={() => flip(id)}>{svc(id)?.name ?? '?'}</Pick>)}</div>}
        {d.items.length === 0 && lines.length === 0 && <p className="-mt-2 text-xs text-amber-700">Choose a service or write a line.</p>}
        <Filter value={pq} onChange={setPq} placeholder="Find a service… (↵ adds the first)" onEnter={() => { if (f && findable[0]) { flip(findable[0].id); setPq('') } }} />
        <div className="grid max-h-72 gap-3 overflow-y-auto">{org.departments.map((dep) => { const ss = findable.filter((s) => s.department_id === dep.id); if (!ss.length) return null
          return <div key={dep.id}><p className="mb-1 text-[11px] text-neutral-500">{dep.name}</p><div className="flex flex-wrap gap-1.5">{ss.map((s) => <Pick key={s.id} on={false} onClick={() => flip(s.id)}>{s.name}</Pick>)}</div></div> })}</div>
      </Group>
    </EditPanel> }

  return <div className="grid gap-4">
    <PageHead title="Presets" hint="What is often written together — services and speed lines — run by typing its /shortcut in the visit (its services also by /order <name>)." right={<Button size="sm" onClick={() => open(newId(), { name: '', department_id: '', items: [], shortcut: '', lines: '' }, true)}><Plus className="h-3.5 w-3.5" />Preset</Button>} />
    {e.isNew && <NewCard title="New preset">{editor()}</NewCard>}
    {groups.map(([dep, label]) => { const ts = org.templates.filter((t) => (t.department_id ?? '') === dep); if (!ts.length) return null
      return <Section key={dep || 'all'} id={`preset.${dep || 'all'}`} title={label} count={ts.length} summary={ts.map((t) => t.name).join(', ')}>
        <ul className="divide-y divide-neutral-100">{ts.map((t) => <Row key={t.id} open={e.id === t.id && !e.isNew} editor={editor}
          onToggle={() => open(t.id, { name: t.name, department_id: t.department_id ?? '', items: t.items.map((i) => i.service_id), shortcut: t.shortcut ?? '', lines: (t.lines ?? []).join('\n') })}>
          <span className="w-48 truncate font-medium">{t.name}{t.shortcut && <span className={cn('ml-1.5 font-mono text-xs font-normal', commandNamed(t.shortcut) ? 'text-red-700' : 'text-teal-800')} title={commandNamed(t.shortcut) ? `/${t.shortcut} is a command now — give this preset another shortcut` : undefined}>/{t.shortcut}{commandNamed(t.shortcut) && ' ⚠'}</span>}</span>
          {t.items.length > 0 && <Badge>{t.items.length} services</Badge>}{(t.lines ?? []).length > 0 && <Badge tone="brand">{t.lines.length} lines</Badge>}
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{[...t.items.map((i) => svc(i.service_id)?.name ?? '?'), ...(t.lines ?? [])].join(' · ')}</span>
        </Row>)}</ul>
      </Section> })}
    {org.templates.length === 0 && !e.isNew && <Card><Empty>No presets yet.</Empty></Card>}
  </div>
}

// ── Packs ──
function PacksPage({ org }: { org: Organization }) {
  const on = useSave('save_organization_pack'); const off = useSave('retire_organization_pack')
  const busy = on.isPending || off.isPending
  return <div className="grid gap-4">
    <PageHead title="Packs" hint="Add-ons installed on this server. Turn one on to use it in this organization." />
    {org.parked_pack_calls > 0 && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-800 ring-1 ring-red-200">{org.parked_pack_calls} pack calls are parked and waiting.</p>}
    <Section id="packs" title="Installed" count={org.packs.length} summary={org.packs.filter((p) => p.enabled).map((p) => p.name).join(', ') || 'none on'}>
      {org.packs.length === 0 ? <Empty>No packs installed on this server yet.</Empty>
      : <ul className="divide-y divide-neutral-100">{org.packs.map((p) => <li key={p.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1"><span className="font-medium">{p.name}</span> <span className="font-mono text-xs text-neutral-400">{p.key}</span></span>
          <Badge tone={p.enabled ? 'brand' : 'neutral'}>{p.enabled ? 'On' : 'Off'}</Badge>
          <button type="button" role="switch" aria-checked={p.enabled} aria-label={`${p.name} ${p.enabled ? 'on' : 'off'}`} disabled={busy}
            onClick={() => p.enabled ? confirm(`Turn off ${p.name}? What it adds stops working here until it is turned on again.`) && off.mutate({ pack: p.key }) : on.mutate({ pack: p.key })}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', p.enabled ? 'bg-teal-700' : 'bg-neutral-300')}>
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', p.enabled ? 'left-[18px]' : 'left-0.5')} /></button>
        </li>)}</ul>}
      <Err e={on.error ?? off.error} />
    </Section>
  </div>
}
