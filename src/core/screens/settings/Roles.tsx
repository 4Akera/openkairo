import { Copy, Plus, Trash2 } from 'lucide-react'
import { remove, save as saveRow } from '../../db/rpc'
import { newId } from '../../hooks/writes'
import type { Organization } from '../../db/types'
import { Badge, Button, Card, Chip, DeleteButton, EditPanel, Empty, Field, Fieldset, Input, PageHead, Row, Section, useDraft } from '../../ui'
import { useSave } from './save'

type RoleDraft = { name: string; actions: string[] }
type ActionRow = { key: string; pack: string | null; label: string; everyday: boolean }
type Role = Organization['roles'][number]
const KINDS: [string, string, string][] = [['write', 'Writes', 'what they may add to the record, and the moves of a visit or an order'],
  ['read', 'Reads', 'what they may see'], ['manage', 'Settings', 'what they may change here — only what you hold yourself'], ['', 'Rare', 'export, erase and redact']]

/** Roles (spec 02): what a person may do where they hold the role. Built-in roles are read-only; copy one to make your own. */
export function RolesPage({ org }: { org: Organization }) {
  // the actions the registry declares; a pack's are its own group (the words are the registry's labels)
  const acts: { data: ActionRow[]; isLoading: boolean } = { data: org.actions.map((a) => ({ key: a.key, pack: a.layer === 'core' || a.layer === 'base' ? null : a.layer, label: a.label, everyday: a.everyday })), isLoading: false }
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
  const copy = (r: Role) => open(newId(), { name: `${r.name} (copy)`, actions: [...r.actions] }, true)
  const baseOf = (r: Role) => (r.built_on ? org.roles.find((x) => x.id === r.built_on) : undefined)

  const picker = (d: RoleDraft, readOnly: boolean) => {
    const all = acts.data; const flip = (k: string) => e.set({ actions: d.actions.includes(k) ? d.actions.filter((x) => x !== k) : [...d.actions, k] })
    const groups: [string, string, ActionRow[]][] = [...KINDS.map(([k, l, hint]): [string, string, ActionRow[]] => [l, hint, all.filter((a) => !a.pack && (k ? a.key.startsWith(`${k}:`) : !/^(write|read|manage):/.test(a.key)))]),
      ...[...new Set(all.filter((a) => a.pack).map((a) => a.pack!))].map((p): [string, string, ActionRow[]] => [packName(p), 'from the pack', all.filter((a) => a.pack === p)])]
    return <div className="grid gap-3">{groups.filter(([, , xs]) => xs.length).map(([l, hint, xs]) => <div key={l}>
      <p className="mb-1.5 text-11 text-faint"><span className="font-medium text-muted">{l}</span> · {hint}</p>
      <div className="flex flex-wrap gap-1.5">{xs.map((a) => readOnly
        ? d.actions.includes(a.key) && <Badge key={a.key} tone="accent">{actionLabel(a.key)}</Badge>
        : <Chip variant="check" shape="pill" key={a.key} on={d.actions.includes(a.key)} onClick={() => flip(a.key)}>{actionLabel(a.key)}</Chip>)}</div></div>)}</div>
  }
  const editor = () => {
    const d = e.draft!; const existing = own.find((r) => r.id === e.id); const held = existing ? holders(existing.id) : []
    if (existing && mine.has(existing.id)) return <div className="grid gap-3 border-y border-line bg-sunken px-4 py-4"><p className="text-12 text-muted">You hold this role, so another administrator has to change it.</p>{picker(d, true)}</div>
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error ?? del.error} canSave={!!d.name.trim()} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id!, name: d.name.trim(), actions: here(d.actions) }, { onSuccess: e.done })}
      aside={<>{existing && <Button type="button" size="sm" variant="danger-ghost" onClick={() => confirm(`Retire ${existing.name}?${held.length ? ` ${held.length} people lose it: ${held.map((u) => u.name).join(', ')}.` : ''}`) && retire.mutate(existing.id, { onSuccess: e.done })}><Trash2 className="h-3.5 w-3.5" />Retire</Button>}{existing && !held.length && <DeleteButton what={existing.name} onDelete={() => del.mutate(existing.id, { onSuccess: e.done })} />}</>}>
      <Field label="Name" changed={e.changed('name')} hint={held.length ? `Held by ${held.map((u) => u.name).join(', ')} — they get the change at once.` : 'Give it to people on the Users page, in one department or everywhere.'}>
        <Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Physiotherapist" required autoFocus className="max-w-sm" /></Field>
      <Fieldset title={`Can do · ${d.actions.length}`}>{acts.isLoading ? <p className="text-12 text-faint">Loading…</p> : picker(d, false)}</Fieldset>
    </EditPanel>
  }
  // a built-in role read-only: what it is built on (whatever that role gains, it gains), its own actions by kind and by pack, and a
  // pack's everyday actions where it holds them, as an everyday role or built on one (§5.2)
  const builtinView = (r: Role) => { const base = baseOf(r); const everyday = (r.everyday || base?.everyday) ? acts.data.filter((a) => a.everyday && a.pack) : []
    return <div className="grid gap-3 border-y border-line bg-sunken px-4 py-4">
      {base && <p className="text-12 text-muted">Built on <span className="font-medium text-fg">{base.name}</span>: it holds everything a {base.name} holds, as that role stands now, and its own below.</p>}
      {picker({ name: r.name, actions: base ? r.own : r.actions }, true)}
      {everyday.length > 0 && <div><p className="mb-1.5 text-11 text-faint"><span className="font-medium text-muted">Everyday</span> · held in a department that uses the pack</p>
        <div className="flex flex-wrap gap-1.5">{everyday.map((a) => <Badge key={a.key}>{packName(a.pack!)} · {a.label}</Badge>)}</div></div>}
      <div><Button type="button" size="sm" variant="outline" onClick={() => copy(r)}><Copy className="h-3.5 w-3.5" />Copy to make your own</Button></div></div> }
  const row = (r: Role) => { const n = holders(r.id).length; const base = baseOf(r)
    return <><span className="w-44 truncate font-medium">{r.name}</span><Badge>{r.every_action ? 'every action' : `${r.actions.length} actions`}</Badge>{base && <Badge>Built on {base.name}</Badge>}{n > 0 && <Badge tone="accent">{n} {n === 1 ? 'person' : 'people'}</Badge>}
      <span className="min-w-0 flex-1 truncate text-12 text-faint">{r.actions.filter((a) => a.startsWith('write:')).map(actionLabel).join(' · ') || r.actions.slice(0, 4).map(actionLabel).join(' · ')}</span></> }

  return <div className="grid gap-4">
    <PageHead title="Roles" hint="A role is what its holder may do in the department where they hold it: which entries they write, which request steps they mark, what they read and change here."
      right={<Button size="sm" onClick={() => open(newId(), { name: '', actions: ['read:patients', 'read:queue'] }, true)}><Plus className="h-3.5 w-3.5" />Role</Button>} />
    {e.isNew && <Card className="overflow-hidden ring-2 ring-accent/15"><p className="px-4 pt-3 text-14 font-semibold">New role</p>{editor()}</Card>}
    <Section flush id="roles.own" title="This organization's roles" count={own.length} summary={own.map((r) => r.name).join(', ') || 'none yet'}>
      {own.length ? <ul className="divide-y divide-line">{own.map((r) => <Row key={r.id} open={e.id === r.id && !e.isNew} editor={editor} onToggle={() => open(r.id, { name: r.name, actions: [...r.actions] })}>{row(r)}</Row>)}</ul>
        : <Empty>None yet. Copy a built-in role below, or start one with “Role”.</Empty>}
    </Section>
    <Section flush id="roles.builtin" title="Built in" count={builtin.length} summary="read-only — copy to change" start={false}>
      <ul className="divide-y divide-line">{builtin.map((r) => <Row key={r.id} open={e.id === r.id && !e.isNew} onToggle={() => open(r.id, { name: r.name, actions: [...r.actions] })}
        editor={() => builtinView(r)}>{row(r)}</Row>)}</ul>
    </Section>
  </div>
}
