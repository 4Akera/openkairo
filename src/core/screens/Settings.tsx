import { useMemo, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Eye, FlaskConical, KeyRound, LayoutGrid, ListChecks, Plus, Puzzle, Users, X } from 'lucide-react'
import { read, remove, save as saveRow, writeSetting } from '../db/rpc'
import { useDepartment } from '../hooks/organization'
import { newId } from '../hooks/writes'
import type { Department, Organization } from '../db/types'
import { Badge, Button, Card, Centered, IconButton, Input, Select, Spinner, cn, dateTime, errorText } from '../ui'
import { Mfa } from '../shell/Mfa'
import { ServicesPage } from './settings/Services'
import { PAGE_ACTION, useMfaNeeded, useSave } from './settings/save'
import { RolesPage } from './settings/Roles'
import { DeleteButton, NewCard, RetireButton, EditPanel, Empty, Filter, Group, Labeled, Line, PageHead, Pick, Row, Saved, Section, Segmented, Unsaved, useDraft } from './settings/parts'
import { ReadsPage } from './settings/Reads'
import { TemplatesPage } from './settings/Presets'

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
  const names = useMemo(() => new Map<string, string>([...org.roles, ...org.users, ...org.allDepartments, ...org.places, ...org.templates, ...org.services].map((x) => [x.id, x.name])), [org])
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
          <span className="text-neutral-400 tnum">{dateTime(c.at)}</span>
          <span className="truncate"><Badge>{c.action} {c.what.replace(/^setting:/, '').replace(/[._]/g, ' ')}</Badge></span>
          <span className="min-w-0">{c.user_id && <span className="mr-2 font-medium text-neutral-700">{names.get(c.user_id) ?? ''}</span>}
            {Object.entries(changed(c)).map(([k, v]) => <span key={k} className="mr-3 inline-block text-neutral-500">{k.replace(/_/g, ' ')} <span className="text-neutral-800">{val(v)}</span></span>)}</span></li>)}</ul>}
    </Section>
  </div>
}

/** the clinic's time zone: every time on screen, and every "today" on the server, is the clinic's */
function ClinicZone({ org }: { org: Organization }) {
  const save = useSave((zone: string) => writeSetting({ key: 'organization.time_zone', data: { zone } })); const saved = org.organization.time_zone; const [tz, setTz] = useState(saved)
  const zones = useMemo(() => { try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return [saved] } }, [saved])
  const now = new Date().toLocaleString(undefined, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return <Line label="Time zone" hint={'Times on every screen, and "today" in queues and counts, follow this clock.'} changed={tz !== saved}>
    <div className="flex flex-wrap items-center gap-2">
      <Select value={tz} onChange={(e) => setTz(e.target.value)} className="w-64">{[...new Set([saved, tz, 'UTC', ...zones])].map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</Select>
      <span className="text-xs text-neutral-500">now {now} there</span>
      <SaveUndo dirty={tz !== saved} save={save} onSave={() => save.mutate(tz)} onUndo={() => setTz(saved)} />
    </div>
  </Line>
}

/** how every department's staff see the record: by visit, or every entry newest first (one choice for the organization) */
function RecordViewSetting({ org }: { org: Organization }) {
  const save = useSave((view: string) => writeSetting({ key: 'organization.record_view', data: { view } })); const saved = org.organization.record_view ?? 'visits'; const [v, setV] = useState(saved)
  return <Line label="The record shows" changed={v !== saved}
    hint={`For everyone in ${org.organization.name}. By visit groups the record into visits, newest activity first; all entries lists every entry newest first.`}>
    <div className="flex flex-wrap items-center gap-2">
      <Segmented value={v} onChange={setV} options={[['visits', 'By visit'], ['entries', 'All entries']]} />
      <SaveUndo dirty={v !== saved} save={save} onSave={() => save.mutate(v)} onUndo={() => setV(saved)} />
    </div>
  </Line>
}

/** a single setting's own save: appears once it differs from what is saved */
function SaveUndo({ dirty, save, onSave, onUndo }: { dirty: boolean; save: { error: Error | null; isSuccess: boolean; isPending: boolean }; onSave: () => void; onUndo: () => void }) {
  if (save.error) return <span className="text-sm text-red-700">{errorText(save.error)}</span>
  if (!dirty) return save.isSuccess ? <Saved /> : null
  return <><Button size="sm" onClick={onSave} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button><Button size="sm" variant="ghost" onClick={onUndo}>Undo</Button><Unsaved /></>
}

// ── Departments ──
const WORKS: [Department['work'], string, string][] = [['visits', 'Clinics', 'Patients are seen here in visits.'], ['stays', 'Wards', 'Patients stay here, in beds.'],
  ['desk', 'Front desks', 'Checks patients in for the clinics it serves.'], ['bench', 'Benches', 'Does work others order: a lab, imaging, a pharmacy.'],
  ['outside', 'Outside', 'Somewhere outside the organization that orders go to.']]
const REVIEW: [Department['review_results'], string][] = [['critical', 'Critical only'], ['abnormal', 'Critical and abnormal'], ['all', 'Every result']]
type DeptDraft = { name: string; work: Department['work']; serves: (string | null)[]; patients_wait: boolean; review_results: Department['review_results']; is_private: boolean; after_done: Department['after_done'] }
const everyOrSome = (ids: (string | null)[]) => !ids.length || ids.includes(null) ? { all: true } : { departments: ids as string[] }

/** a department is a row (save) and its rules are department.* settings (write_setting), each written only when it changed */
async function saveDepartment(a: { id: string; d: DeptDraft; was: Department | undefined }) {
  const { id, d, was } = a
  if (!was || was.name !== d.name || was.work !== d.work) await saveRow('department', { id, name: d.name.trim(), work: d.work })
  const one = (key: string, data: unknown, same: boolean) => !was || !same ? writeSetting({ key, owner_id: id, data }) : Promise.resolve()
  const same = (x: (string | null)[], y: (string | null)[]) => JSON.stringify(everyOrSome(x)) === JSON.stringify(everyOrSome(y))
  if (d.work === 'desk') await one('department.checks_in_for', everyOrSome(d.serves), !!was && same(was.checks_in_for, d.serves))
  if (d.work === 'bench') await one('department.works_for', everyOrSome(d.serves), !!was && same(was.serves, d.serves))
  if (d.work !== 'desk' && d.work !== 'outside') await one('department.after_done', { after: d.after_done }, was?.after_done === d.after_done)
  if (d.work === 'visits' || d.work === 'stays') {
    await one('department.patients_wait', { wait: d.patients_wait }, was?.patients_wait === d.patients_wait)
    await one('department.review_results', { level: d.review_results }, was?.review_results === d.review_results)
    await one('department.private', { private: d.is_private }, was?.is_private === d.is_private)
  }
}

function DepartmentsPage({ org }: { org: Organization }) {
  const save = useSave(saveDepartment); const retire = useSave((id: string) => saveRow('department', { id, retired: true })); const del = useSave((id: string) => remove('department', id)); const e = useDraft<DeptDraft>()
  // whom a desk checks in for, and whom a bench works for: every department, or the ones named
  const served = (ids: (string | null)[] | undefined) => !ids?.length || ids.includes(null) ? [null] : ids
  const every = (w: string) => w === 'desk' ? 'every clinic' : 'every department'
  const nameOf = (id: string | null, w: string) => id === null ? every(w) : org.departments.find((x) => x.id === id)?.name ?? '?'
  const open = (id: string, d: DeptDraft, isNew = false) => { save.reset(); retire.reset(); e.toggle(id, d, isNew) }
  const add = (work: Department['work'] = 'visits') => open(newId(), { name: '', work, serves: [null], patients_wait: true, review_results: 'critical', is_private: false, after_done: 'next' }, true)

  const editor = () => { const d = e.draft!; const rules = d.work === 'visits' || d.work === 'stays'; const flow = d.work !== 'desk' && d.work !== 'outside'; const existing = org.departments.find((x) => x.id === e.id)
    const clients = org.departments.filter((x) => x.is_visited && x.id !== e.id)   // where patients are seen and orders written
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error ?? del.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id!, d, was: existing }, { onSuccess: e.done })}
      aside={existing && <><RetireButton what={existing.name} onRetire={() => retire.mutate(existing.id, { onSuccess: e.done })} /><DeleteButton what={existing.name} onDelete={() => del.mutate(existing.id, { onSuccess: e.done })} /></>}>
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <Labeled label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Cardiology" required autoFocus /></Labeled>
        <Labeled label="Work" changed={e.changed('work')} hint={WORKS.find(([k]) => k === d.work)?.[2]}><Select value={d.work} onChange={(x) => e.set({ work: x.target.value as Department['work'] })}>{WORKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Labeled>
      </div>
      {(d.work === 'desk' || d.work === 'bench') && <Group title="Serves">
        <Line label={d.work === 'desk' ? 'Checks in for' : 'Works for'} changed={e.changed('serves')}
          hint={d.work === 'desk' ? 'Its desk sends patients to these and sees their queues.' : 'Only these send it orders (and prescriptions, for a pharmacy); others are refused. With two labs, each works for its own.'}>
          <div className="flex flex-wrap gap-1.5">
            <Pick on={d.serves.includes(null)} onClick={() => e.set({ serves: [null] })}>{every(d.work)[0].toUpperCase() + every(d.work).slice(1)}</Pick>
            {clients.map((v) => { const on = d.serves.includes(v.id); const rest = d.serves.filter((x): x is string => !!x && x !== v.id)
              return <Pick key={v.id} on={on} onClick={() => e.set({ serves: on ? served(rest) : [...rest, v.id] })}>{v.name}</Pick> })}
            {clients.length === 0 && <span className="text-xs text-neutral-400">No clinics or wards yet.</span>}</div>
        </Line></Group>}
      {flow && <Group title="Rules">
        <Line label="After Done" changed={e.changed('after_done')} hint="Where Done (or Release on a bench) takes you.">
          <Segmented value={d.after_done} onChange={(v) => e.set({ after_done: v })} options={[['next', 'Next patient'], ['queue', 'Back to the queue']]} /></Line>
        {rules && <>
        <Line label="When results are still out at Done" changed={e.changed('patients_wait')} hint="Whether the patient stays for them or is sent home and called back.">
          <Segmented value={d.patients_wait ? 'wait' : 'home'} onChange={(v) => e.set({ patients_wait: v === 'wait' })} options={[['wait', 'Patient waits'], ['home', 'Patient goes home']]} /></Line>
        <Line label="Results to review" changed={e.changed('review_results')} hint="Results for a patient who left before being seen again, and corrected results, always go to review.">
          <Segmented value={d.review_results} onChange={(v) => e.set({ review_results: v })} options={REVIEW} /></Line>
        <Line label="Notes" changed={e.changed('is_private')} hint={'In a private department every note is private: only the people who work here read it, and others see "Private note". Its medicines, results, problems, orders and its name stay visible to everyone who may read the record.'}>
          <Segmented value={d.is_private ? 'private' : 'shared'} onChange={(v) => e.set({ is_private: v === 'private' })} options={[['shared', 'Shared'], ['private', 'Private department']]} /></Line></>}
      </Group>}
    </EditPanel> }

  return <div className="grid gap-4">
    <PageHead title="Departments" hint="Where patients are seen and where work is done. Open one to rename it or change its rules." right={<Button size="sm" onClick={() => add()}><Plus className="h-3.5 w-3.5" />Department</Button>} />
    {e.isNew && <NewCard title="New department">{editor()}</NewCard>}
    {WORKS.map(([w, label]) => { const ds = org.departments.filter((d) => d.work === w); if (!ds.length) return null
      return <Section key={w} id={`dept.${w}`} title={label} count={ds.length} summary={ds.map((d) => d.name).join(', ')}
        right={w !== 'outside' && <IconButton title={`Add to ${label.toLowerCase()}`} onClick={() => add(w)}><Plus className="h-3.5 w-3.5" /></IconButton>}>
        <ul className="divide-y divide-neutral-100">{ds.map((d) => { const serves = d.work === 'desk' ? d.checks_in_for : d.serves
          return <Row key={d.id} open={e.id === d.id && !e.isNew} editor={editor}
          onToggle={() => open(d.id, { name: d.name, work: d.work, serves: served(serves), patients_wait: d.patients_wait, review_results: d.review_results, is_private: d.is_private, after_done: d.after_done ?? 'next' })}>
          <span className="w-48 truncate font-medium">{d.name}</span>
          {d.site_name && <span className="text-xs text-neutral-400">{d.site_name}</span>}
          {d.is_visited && <span className="flex flex-wrap gap-1">
            <Badge>{d.patients_wait ? 'Patient waits' : 'Goes home'}</Badge><Badge>Review: {REVIEW.find(([k]) => k === d.review_results)?.[1].toLowerCase()}</Badge>{d.is_private && <Badge tone="amber">Private department</Badge>}</span>}
          {d.after_done === 'queue' && d.work !== 'desk' && d.work !== 'outside' && <Badge>Then: queue</Badge>}
          {(d.work === 'desk' || d.work === 'bench') && <span className="text-xs text-neutral-500">{d.work === 'desk' ? 'checks in for' : 'works for'} {served(serves).map((x) => nameOf(x, d.work)).join(', ')}</span>}
        </Row> })}</ul>
      </Section> })}
    {org.departments.length === 0 && <Card><Empty>No departments yet. Add the first one.</Empty></Card>}
  </div>
}

// ── Users ──
const KINDS = ['staff', 'pack', 'patient', 'proxy']
const initials = (name: string) => name.split(/\s+/).filter((w) => w && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
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
        <Labeled label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Amina Hassan" required autoFocus /></Labeled>
        <Labeled label="Title" changed={e.changed('title')}><Input value={d.title} onChange={(x) => e.set({ title: x.target.value })} placeholder="Dr." /></Labeled>
        <Labeled label="Kind" changed={e.changed('kind')} hint={was ? 'Set when the user is made.' : undefined}><Select value={d.kind} disabled={!!was} onChange={(x) => e.set({ kind: x.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></Labeled>
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

// ── Packs ──
function PacksPage({ org }: { org: Organization }) {
  // the packs used are one setting: the whole list is written each time
  const used = org.packs.filter((p) => p.enabled).map((p) => p.key)
  const on = useSave((key: string) => writeSetting({ key: 'organization.packs_used', data: { packs: [...used, key] } }))
  const off = useSave((key: string) => writeSetting({ key: 'organization.packs_used', data: { packs: used.filter((k) => k !== key) } }))
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
            onClick={() => p.enabled ? confirm(`Turn off ${p.name}? What it adds stops working here until it is turned on again.`) && off.mutate(p.key) : on.mutate(p.key)}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', p.enabled ? 'bg-teal-700' : 'bg-neutral-300')}>
            <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', p.enabled ? 'left-[18px]' : 'left-0.5')} /></button>
        </li>)}</ul>}
      <Err e={on.error ?? off.error} />
    </Section>
  </div>
}
