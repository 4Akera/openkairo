import { Plus } from 'lucide-react'
import { save as saveRow } from '../../db/rpc'
import { newId } from '../../hooks/writes'
import type { Organization } from '../../db/types'
import { Badge, EditPanel, Empty, Field, FormRow, IconButton, Input, NewCard, RetireButton, Row, Section, Segmented, useDraft } from '../../ui'
import { useSave } from './save'

type SiteDraft = { name: string; retired: boolean }

/** Sites (spec/openCare.md §3.3): the buildings an organization works in; a department may name its site. There is no delete:
 *  retired, a site is no longer offered to departments, and those that name it keep it. */
export function SitesSection({ org }: { org: Organization }) {
  // a save without retired brings a retired site back (the save door)
  const save = useSave((r: { id: string; name: string; retired: boolean }) => saveRow('site', { id: r.id, name: r.name, ...(r.retired ? { retired: true } : {}) })); const e = useDraft<SiteDraft>()
  const open = (id: string, d: SiteDraft, isNew = false) => { save.reset(); e.toggle(id, d, isNew) }
  const live = org.sites.filter((s) => !s.retired_at)
  const there = (id: string) => org.departments.filter((d) => d.site_id === id).map((d) => d.name)

  const editor = () => { const d = e.draft!; const was = org.sites.find((s) => s.id === e.id); const ds = was ? there(was.id) : []
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id!, name: d.name.trim(), retired: d.retired }, { onSuccess: e.done })}
      aside={was && !was.retired_at && <RetireButton what={was.name} onRetire={() => save.mutate({ id: was.id, name: was.name, retired: true }, { onSuccess: e.done })} />}>
      <Field label="Name" changed={e.changed('name')} hint={ds.length ? `Departments here: ${ds.join(', ')}.` : 'Name its departments on the Departments page.'}>
        <Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Main building" required autoFocus className="max-w-sm" /></Field>
      {was?.retired_at && <FormRow label="Status" changed={e.changed('retired')} hint="Retired, it is no longer offered to departments.">
        <Segmented value={d.retired ? 'retired' : 'active'} onChange={(v) => e.set({ retired: v === 'retired' })} options={[['active', 'Active'], ['retired', 'Retired']]} /></FormRow>}
    </EditPanel> }

  return <>
    {e.isNew && <NewCard title="New site">{editor()}</NewCard>}
    <Section flush id="org.sites" title="Sites" count={live.length} summary={live.map((s) => s.name).join(', ') || 'none: one place'}
      right={<IconButton title="Add a site" onClick={() => open(newId(), { name: '', retired: false }, true)}><Plus className="h-3.5 w-3.5" /></IconButton>}>
      {org.sites.length === 0 ? <Empty>No sites. With more than one building, add each; a department then names its own.</Empty>
      : <ul className="divide-y divide-line">{org.sites.map((s) => { const ds = there(s.id)
        return <Row key={s.id} open={e.id === s.id && !e.isNew} editor={editor} muted={!!s.retired_at} onToggle={() => open(s.id, { name: s.name, retired: !!s.retired_at })}>
          <span className="w-48 truncate font-medium">{s.name}</span>{s.retired_at && <Badge>retired</Badge>}
          <span className="min-w-0 truncate text-12 text-faint">{ds.length ? ds.join(', ') : 'no departments'}</span>
        </Row> })}</ul>}
    </Section>
  </>
}
