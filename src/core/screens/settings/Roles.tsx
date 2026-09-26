import { Copy, Plus, Trash2 } from 'lucide-react'
import { remove, save as saveRow } from '../../db/rpc'
import { newId } from '../../hooks/writes'
import type { Organization } from '../../db/types'
import { Badge, Button, Card, Input } from '../../ui'
import { DeleteButton, EditPanel, Empty, Group, Labeled, PageHead, Pick, Row, Section, useDraft } from './parts'
import { useSave } from './save'

type RoleDraft = { name: string; actions: string[] }
type ActionRow = { key: string; pack: string | null; label: string }
const KINDS: [string, string, string][] = [['write', 'Writes', 'what they may add to the record, and the moves of a visit or an order'],
  ['read', 'Reads', 'what they may see'], ['manage', 'Settings', 'what they may change here — only what you hold yourself'], ['', 'Rare', 'export, erase and redact']]

/** Roles (spec 02): what a person may do where they hold the role. Built-in roles are read-only; copy one to make your own. */
export function RolesPage({ org }: { org: Organization }) {
  // the actions the registry declares; a pack's are its own group (the words are the registry's labels)
  const acts: { data: ActionRow[]; isLoading: boolean } = { data: org.actions.map((a) => ({ key: a.key, pack: a.layer === 'core' || a.layer === 'base' ? null : a.layer, label: a.label })), isLoading: false }
  const actionLabel = (k: string) => acts.data.find((a) => a.key === k)?.label ?? k
  const save = useSave((r: { id: string; name: string; actions: string[] }) => saveRow('role', r)); const retire = useSave((id: string) => saveRow('role', { id, retired: true }))
  const del = useSave((id: string) => remove('role', id)); const e = useDraft<RoleDraft>()
  // only the rights that exist here: a pack that is off has none to give (copying Owner would otherwise never save)
  const here = (xs: string[]) => xs.filter((a) => acts.data.some((x) => x.key === a))
  const open = (id: string, d: RoleDraft, isNew = false) => { save.reset(); retire.reset(); e.toggle(id, { ...d, actions: here(d.actions) }, isNew) }
  const mine = new Set(org.users.find((u) => u.id === org.me.id)?.roles.map((r) => r.role_id) ?? [])   // a role you hold is not yours to change
  const holders = (roleId: string) => org.users.filter((u) => !u.retired_at && u.roles.some((r) => r.role_id === roleId))
  const packName = (k: string) => org.packs.find((p) => p.key === k)?.name ?? k
  const own = org.roles.filter((r) => !r.is_builtin); const builtin = org.roles.filter((r) => r.is_builtin)
  const copy = (r: Organization['roles'][number]) => open(newId(), { name: `${r.name} (copy)`, actions: [...r.actions] }, true)

  const picker = (d: RoleDraft, readOnly: boolean) => {
    const all = acts.data; const flip = (k: string) => e.set({ actions: d.actions.includes(k) ? d.actions.filter((x) => x !== k) : [...d.actions, k] })
    const groups: [string, string, ActionRow[]][] = [...KINDS.map(([k, l, hint]): [string, string, ActionRow[]] => [l, hint, all.filter((a) => !a.pack && (k ? a.key.startsWith(`${k}:`) : !/^(write|read|manage):/.test(a.key)))]),
      ...[...new Set(all.filter((a) => a.pack).map((a) => a.pack!))].map((p): [string, string, ActionRow[]] => [packName(p), 'from the pack', all.filter((a) => a.pack === p)])]
    return <div className="grid gap-3">{groups.filter(([, , xs]) => xs.length).map(([l, hint, xs]) => <div key={l}>
      <p className="mb-1.5 text-[11px] text-neutral-500"><span className="font-medium text-neutral-700">{l}</span> · {hint}</p>
      <div className="flex flex-wrap gap-1.5">{xs.map((a) => readOnly
        ? d.actions.includes(a.key) && <Badge key={a.key} tone="brand">{actionLabel(a.key)}</Badge>
        : <Pick key={a.key} on={d.actions.includes(a.key)} onClick={() => flip(a.key)}>{actionLabel(a.key)}</Pick>)}</div></div>)}</div>
  }
  const editor = () => {
    const d = e.draft!; const existing = own.find((r) => r.id === e.id); const held = existing ? holders(existing.id) : []
    if (existing && mine.has(existing.id)) return <div className="grid gap-3 border-y border-neutral-200 bg-neutral-50/60 px-4 py-4"><p className="text-xs text-neutral-600">You hold this role, so another administrator has to change it.</p>{picker(d, true)}</div>
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error ?? del.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id!, name: d.name.trim(), actions: here(d.actions) }, { onSuccess: e.done })}
      aside={<>{existing && <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => confirm(`Retire ${existing.name}?${held.length ? ` ${held.length} people lose it: ${held.map((u) => u.name).join(', ')}.` : ''}`) && retire.mutate(existing.id, { onSuccess: e.done })}><Trash2 className="h-3.5 w-3.5" />Retire</Button>}{existing && !held.length && <DeleteButton what={existing.name} onDelete={() => del.mutate(existing.id, { onSuccess: e.done })} />}</>}>
      <Labeled label="Name" changed={e.changed('name')} hint={held.length ? `Held by ${held.map((u) => u.name).join(', ')} — they get the change at once.` : 'Give it to people on the Users page, in one department or everywhere.'}>
        <Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Physiotherapist" required autoFocus className="max-w-sm" /></Labeled>
      <Group title={`Can do · ${d.actions.length}`}>{acts.isLoading ? <p className="text-xs text-neutral-400">Loading…</p> : picker(d, false)}</Group>
    </EditPanel>
  }
  const row = (r: Organization['roles'][number]) => { const n = holders(r.id).length
    return <><span className="w-44 truncate font-medium">{r.name}</span><Badge>{r.every_action ? 'every action' : `${r.actions.length} actions`}</Badge>{n > 0 && <Badge tone="brand">{n} {n === 1 ? 'person' : 'people'}</Badge>}
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{r.actions.filter((a) => a.startsWith('write:')).map(actionLabel).join(' · ') || r.actions.slice(0, 4).map(actionLabel).join(' · ')}</span></> }

  return <div className="grid gap-4">
    <PageHead title="Roles" hint="A role is what its holder may do in the department where they hold it: which entries they write, which request steps they mark, what they read and change here."
      right={<Button size="sm" onClick={() => open(newId(), { name: '', actions: ['read:patients', 'read:queue'] }, true)}><Plus className="h-3.5 w-3.5" />Role</Button>} />
    {e.isNew && <Card className="overflow-hidden ring-2 ring-teal-700/15"><p className="px-4 pt-3 text-sm font-semibold">New role</p>{editor()}</Card>}
    <Section id="roles.own" title="This organization's roles" count={own.length} summary={own.map((r) => r.name).join(', ') || 'none yet'}>
      {own.length ? <ul className="divide-y divide-neutral-100">{own.map((r) => <Row key={r.id} open={e.id === r.id && !e.isNew} editor={editor} onToggle={() => open(r.id, { name: r.name, actions: [...r.actions] })}>{row(r)}</Row>)}</ul>
        : <Empty>None yet. Copy a built-in role below, or start one with “Role”.</Empty>}
    </Section>
    <Section id="roles.builtin" title="Built in" count={builtin.length} summary="read-only — copy to change" start={false}>
      <ul className="divide-y divide-neutral-100">{builtin.map((r) => <Row key={r.id} open={e.id === r.id && !e.isNew} onToggle={() => open(r.id, { name: r.name, actions: [...r.actions] })}
        editor={() => <div className="grid gap-3 border-y border-neutral-200 bg-neutral-50/60 px-4 py-4">{picker({ name: r.name, actions: r.actions }, true)}
          <div><Button type="button" size="sm" variant="outline" onClick={() => copy(r)}><Copy className="h-3.5 w-3.5" />Copy to make your own</Button></div></div>}>{row(r)}</Row>)}</ul>
    </Section>
  </div>
}
