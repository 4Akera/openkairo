import { Plus } from 'lucide-react'
import { remove, save as saveRow, writeSetting } from '../../db/rpc'
import { mayIn } from '../../db/views'
import { newId } from '../../hooks/writes'
import type { Department, Organization } from '../../db/types'
import type { SettingData } from '../../db/shapes.generated'
import { Badge, Button, Card, Chip, DeleteButton, EditPanel, Empty, Field, Fieldset, FormRow, IconButton, Input, NewCard, PageHead, RetireButton, Row, Section, Segmented, Select, cn, useDraft } from '../../ui'
import { PlacesCount, PlacesEditor } from './Places'
import { SitesSection } from './Sites'
import { useSave } from './save'
import { baseLine, lineForPacks, lineHere } from '../line'
import { PacksAndScreens } from './DepartmentScreens'

const WORKS: [Department['work'], string, string][] = [['visits', 'Clinics', 'Patients are seen here in visits.'], ['stays', 'Wards', 'Patients stay here, in beds.'],
  ['desk', 'Front desks', 'Checks patients in for the clinics it serves.'], ['bench', 'Benches', 'Does work others order: a lab, imaging, a pharmacy.'],
  ['outside', 'Outside', 'Somewhere outside the organization that orders go to.']]
const REVIEW: [Department['review_results'], string][] = [['critical', 'Critical only'], ['abnormal', 'Critical and abnormal'], ['all', 'Every result']]
// Encounter.class (v3 ActCode, §4.2); unset, the FHIR mapping calls a visit AMB and a stay IMP
type EncounterClass = SettingData['department.encounter_class']['class']
const CLASSES: [EncounterClass, string][] = [['AMB', 'Outpatient'], ['EMER', 'Emergency'], ['IMP', 'Inpatient'], ['OBSENC', 'Observation'], ['SS', 'Short stay'], ['VR', 'Virtual'], ['HH', 'Home health']]
const classFor = (work: Department['work']): EncounterClass => work === 'stays' ? 'IMP' : 'AMB'
type DeptDraft = { name: string; work: Department['work']; site_id: string | null; serves: (string | null)[]; patients_wait: boolean; review_results: Department['review_results']; is_private: boolean
  after_done: Department['after_done']; encounter_class: EncounterClass; packs: string[]; screens: string[]; opens: string }
const everyOrSome = (ids: (string | null)[]) => !ids.length || ids.includes(null) ? { all: true } : { departments: ids as string[] }

/** a department is a row (save) and its rules are department.* settings (write_setting), each written only when it changed */
async function saveDepartment(a: { id: string; d: DeptDraft; was: Department | undefined }) {
  const { id, d, was } = a
  if (!was || was.name !== d.name || was.work !== d.work || was.site_id !== d.site_id) await saveRow('department', { id, name: d.name.trim(), work: d.work, site_id: d.site_id })
  const one = <K extends keyof SettingData>(key: K, data: SettingData[K], same: boolean) => !was || !same ? writeSetting({ key, owner_id: id, data }) : Promise.resolve()
  const same = (x: (string | null)[], y: (string | null)[]) => JSON.stringify(everyOrSome(x)) === JSON.stringify(everyOrSome(y))
  if (d.work === 'desk') await one('department.checks_in_for', everyOrSome(d.serves), !!was && same(was.checks_in_for, d.serves))
  if (d.work === 'bench') await one('department.works_for', everyOrSome(d.serves), !!was && same(was.serves, d.serves))
  if (d.work !== 'desk' && d.work !== 'outside') await one('department.after_done', { after: d.after_done }, was?.after_done === d.after_done)
  if (d.work === 'visits' || d.work === 'stays') {
    await one('department.patients_wait', { wait: d.patients_wait }, was?.patients_wait === d.patients_wait)
    await one('department.review_results', { level: d.review_results }, was?.review_results === d.review_results)
    await one('department.private', { private: d.is_private }, was?.is_private === d.is_private)
    // unset, the default of the work holds: written only when the choice differs from what would be read
    const kind = (was?.encounter_class ?? classFor(d.work)) === d.encounter_class
    if (!kind) await writeSetting({ key: 'department.encounter_class', owner_id: id, data: { class: d.encounter_class } })
  }
  // the packs used here, then the Screens line (§4.6, §5.1 rule 1), whose check reads them; a department whose work changed writes its new work's line
  if (d.work !== 'outside' && (was ? JSON.stringify(was.packs) !== JSON.stringify(d.packs) : d.packs.length > 0)) await writeSetting({ key: 'department.packs', owner_id: id, data: { packs: d.packs } })
  if (d.screens.length) await one('department.screens', { screens: d.screens, opens: d.opens },
    !!was && was.work === d.work && JSON.stringify(was.screens) === JSON.stringify(d.screens) && was.opens === d.opens)
}

/** Departments (spec/openCare.md §3.3, §4.6): grouped by work; each opens into its rules, its Screens line and its places. */
export function DepartmentsPage({ org }: { org: Organization }) {
  const save = useSave(saveDepartment); const retire = useSave((id: string) => saveRow('department', { id, retired: true })); const del = useSave((id: string) => remove('department', id)); const e = useDraft<DeptDraft>()
  // whom a desk checks in for, and whom a bench works for: every department, or the ones named
  const served = (ids: (string | null)[] | undefined) => !ids?.length || ids.includes(null) ? [null] : ids
  const every = (w: string) => w === 'desk' ? 'every clinic' : 'every department'
  const nameOf = (id: string | null, w: string) => id === null ? every(w) : org.departments.find((x) => x.id === id)?.name ?? '?'
  const open = (id: string, d: DeptDraft, isNew = false) => { save.reset(); retire.reset(); e.toggle(id, d, isNew) }
  const add = (work: Department['work'] = 'visits') => open(newId(), { name: '', work, site_id: null, serves: [null], patients_wait: true, review_results: 'critical', is_private: false, after_done: 'next',
    encounter_class: classFor(work), packs: [], screens: baseLine(work, org.screens), opens: baseLine(work, org.screens)[0] ?? '' }, true)
  const screenName = (k: string) => org.screens.find((s) => s.key === k)?.labels.en ?? `${k} (pack off)`
  const packName = (k: string) => org.packs.find((p) => p.key === k)?.name ?? k

  const editor = () => { const d = e.draft!; const saved = e.initial!; const rules = d.work === 'visits' || d.work === 'stays'; const flow = d.work !== 'desk' && d.work !== 'outside'; const existing = org.departments.find((x) => x.id === e.id)
    const clients = org.departments.filter((x) => x.is_visited && x.id !== e.id)   // where patients are seen and orders written
    const sites = org.sites.filter((s) => !s.retired_at || s.id === d.site_id)
    // another work starts from that work's own screens (and the ticked packs' of that work) and kind of encounter; back to the saved work, from what was saved
    const lineOf = (w: Department['work']) => lineForPacks({ screens: baseLine(w, org.screens), opens: null }, w, org.screens, [], d.packs)
    const setWork = (w: Department['work']) => e.set(w === saved.work ? { work: w, screens: saved.screens, opens: saved.opens, encounter_class: saved.encounter_class }
      : { work: w, screens: lineOf(w).screens, opens: lineOf(w).opens ?? '', encounter_class: d.encounter_class === classFor(d.work) ? classFor(w) : d.encounter_class })
    return <><EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error ?? del.error} canSave={!!d.name.trim() && (d.screens.length > 0 || d.work === 'outside')} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id!, d, was: existing }, { onSuccess: e.done })}
      aside={existing && <><RetireButton what={existing.name} onRetire={() => retire.mutate(existing.id, { onSuccess: e.done })} /><DeleteButton what={existing.name} onDelete={() => del.mutate(existing.id, { onSuccess: e.done })} /></>}>
      <div className={cn('grid gap-3', sites.length ? 'sm:grid-cols-[1fr_11rem_11rem]' : 'sm:grid-cols-[1fr_11rem]')}>
        <Field label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Cardiology" required autoFocus /></Field>
        <Field label="Work" changed={e.changed('work')} hint={WORKS.find(([k]) => k === d.work)?.[2]}><Select value={d.work} onChange={(x) => setWork(x.target.value as Department['work'])}>{WORKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        {sites.length > 0 && <Field label="Site" changed={e.changed('site_id')}><Select value={d.site_id ?? ''} onChange={(x) => e.set({ site_id: x.target.value || null })}>
          <option value="">none</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.retired_at ? ' (retired)' : ''}</option>)}</Select></Field>}
      </div>
      {(d.work === 'desk' || d.work === 'bench') && <Fieldset title="Serves">
        <FormRow label={d.work === 'desk' ? 'Checks in for' : 'Works for'} changed={e.changed('serves')}
          hint={d.work === 'desk' ? 'Its desk sends patients to these and sees their queues.' : 'Only these send it orders (and prescriptions, for a pharmacy); others are refused. With two labs, each works for its own.'}>
          <div className="flex flex-wrap gap-1.5">
            <Chip variant="check" shape="pill" on={d.serves.includes(null)} onClick={() => e.set({ serves: [null] })}>{every(d.work)[0].toUpperCase() + every(d.work).slice(1)}</Chip>
            {clients.map((v) => { const on = d.serves.includes(v.id); const rest = d.serves.filter((x): x is string => !!x && x !== v.id)
              return <Chip variant="check" shape="pill" key={v.id} on={on} onClick={() => e.set({ serves: on ? served(rest) : [...rest, v.id] })}>{v.name}</Chip> })}
            {clients.length === 0 && <span className="text-12 text-faint">No clinics or wards yet.</span>}</div>
        </FormRow></Fieldset>}
      {flow && <Fieldset title="Rules">
        <FormRow label="After Done" changed={e.changed('after_done')} hint="Where Done (or Release on a bench) takes you.">
          <Segmented value={d.after_done} onChange={(v) => e.set({ after_done: v })} options={[['next', 'Next patient'], ['queue', 'Back to the queue']]} /></FormRow>
        {rules && <>
        <FormRow label="When results are still out at Done" changed={e.changed('patients_wait')} hint="Whether the patient stays for them or is sent home and called back.">
          <Segmented value={d.patients_wait ? 'wait' : 'home'} onChange={(v) => e.set({ patients_wait: v === 'wait' })} options={[['wait', 'Patient waits'], ['home', 'Patient goes home']]} /></FormRow>
        <FormRow label="Results to review" changed={e.changed('review_results')} hint="Results for a patient who left before being seen again, and corrected results, always go to review.">
          <Segmented value={d.review_results} onChange={(v) => e.set({ review_results: v })} options={REVIEW} /></FormRow>
        <FormRow label="Notes" changed={e.changed('is_private')} hint={'In a private department every note is private: only the people who work here read it, and others see "Private note". Its medicines, results, problems, orders and its name stay visible to everyone who may read the record.'}>
          <Segmented value={d.is_private ? 'private' : 'shared'} onChange={(v) => e.set({ is_private: v === 'private' })} options={[['shared', 'Shared'], ['private', 'Private department']]} /></FormRow>
        <FormRow label="Kind of encounter" changed={e.changed('encounter_class')} hint={`What its ${d.work === 'stays' ? 'stays' : 'visits'} are called in a FHIR export (Encounter.class). Unless set, ${d.work === 'stays' ? 'a ward\'s are inpatient' : 'a clinic\'s are outpatient'}.`}>
          <Select value={d.encounter_class} onChange={(x) => e.set({ encounter_class: x.target.value as EncounterClass })} className="max-w-60">{CLASSES.map(([k, l]) => <option key={k} value={k}>{l} · {k}</option>)}</Select></FormRow></>}
      </Fieldset>}
      <PacksAndScreens org={org} d={d} set={(x) => e.set(x)} changed={(k) => e.changed(k)} />
    </EditPanel>
    {existing && existing.work !== 'outside' && <PlacesEditor org={org} dept={existing} />}</> }

  return <div className="grid gap-4">
    <PageHead title="Departments" hint="Where patients are seen and where work is done. Open one to rename it or change its rules, its screens and its places." right={<Button size="sm" onClick={() => add()}><Plus className="h-3.5 w-3.5" />Department</Button>} />
    {e.isNew && <NewCard title="New department">{editor()}</NewCard>}
    {mayIn(org, 'manage:places', null) && <SitesSection org={org} />}
    {WORKS.map(([w, label]) => { const ds = org.departments.filter((d) => d.work === w); if (!ds.length) return null
      return <Section flush key={w} id={`dept.${w}`} title={label} count={ds.length} summary={ds.map((d) => d.name).join(', ')}
        right={w !== 'outside' && <IconButton title={`Add to ${label.toLowerCase()}`} onClick={() => add(w)}><Plus className="h-3.5 w-3.5" /></IconButton>}>
        <ul className="divide-y divide-line">{ds.map((d) => { const serves = d.work === 'desk' ? d.checks_in_for : d.serves
          // the line as the department shows it: a pack screen not used here is back to what it stood in for, so it can be saved
          const line = lineHere(d, org.screens)
          return <Row key={d.id} open={e.id === d.id && !e.isNew} editor={editor}
          onToggle={() => open(d.id, { name: d.name, work: d.work, site_id: d.site_id, serves: served(serves), patients_wait: d.patients_wait, review_results: d.review_results, is_private: d.is_private,
            after_done: d.after_done ?? 'next', encounter_class: d.encounter_class ?? classFor(d.work), packs: d.packs, screens: line.screens, opens: line.opens ?? '' })}>
          <span className="w-48 truncate font-medium">{d.name}</span>
          {d.site_name && <span className="text-12 text-faint">{d.site_name}</span>}
          {d.is_visited && <span className="flex flex-wrap gap-1">
            <Badge>{d.patients_wait ? 'Patient waits' : 'Goes home'}</Badge><Badge>Review: {REVIEW.find(([k]) => k === d.review_results)?.[1].toLowerCase()}</Badge>{d.is_private && <Badge tone="warn">Private department</Badge>}
            {d.encounter_class && d.encounter_class !== classFor(d.work) && <Badge>{CLASSES.find(([k]) => k === d.encounter_class)?.[1] ?? d.encounter_class}</Badge>}</span>}
          {d.after_done === 'queue' && d.work !== 'desk' && d.work !== 'outside' && <Badge>Then: queue</Badge>}
          {d.packs.length > 0 && <Badge>Uses {d.packs.map(packName).join(', ')}</Badge>}
          {JSON.stringify(line.screens) !== JSON.stringify(baseLine(d.work, org.screens)) && <Badge>{line.screens.map(screenName).join(' · ')}</Badge>}
          {(d.work === 'desk' || d.work === 'bench') && <span className="text-12 text-faint">{d.work === 'desk' ? 'checks in for' : 'works for'} {served(serves).map((x) => nameOf(x, d.work)).join(', ')}</span>}
          <PlacesCount places={org.places.filter((p) => p.department_id === d.id)} />
        </Row> })}</ul>
      </Section> })}
    {org.departments.length === 0 && <Card><Empty>No departments yet. Add the first one.</Empty></Card>}
  </div>
}
