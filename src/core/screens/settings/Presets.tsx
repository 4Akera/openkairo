import { useState } from 'react'
import { Plus } from 'lucide-react'
import { writeSetting } from '../../db/rpc'
import { newId } from '../../hooks/writes'
import type { Organization } from '../../db/types'
import type { SettingData } from '../../db/shapes.generated'
import { Badge, Button, Card, Chip, EditPanel, Empty, Field, Fieldset, Input, NewCard, PageHead, RetireButton, Row, SearchInput, Section, Select, cn, useDraft } from '../../ui'
import { readPresetLine } from '../visit/expand'
import { replyFormFor } from '../../renderers'
import { PROBLEMS } from '../visit/catalog'
import { useSave } from './save'

// ── Presets ──
type PresetDraft = { name: string; department_id: string; items: string[]; shortcut: string; lines: string }
/** Presets (spec/openCare.md §4.6): what is often written together, run in the visit by its #shortcut; each a preset setting */
export function TemplatesPage({ org }: { org: Organization }) {
  const save = useSave((a: { id: string; data: SettingData['preset'] }) => writeSetting({ key: 'preset', thing_id: a.id, data: a.data }))
  const retire = useSave((id: string) => writeSetting({ key: 'preset', thing_id: id, retired: true })); const e = useDraft<PresetDraft>(); const [pq, setPq] = useState('')
  const svc = (id: string) => org.services.find((s) => s.id === id)
  const open = (id: string, d: PresetDraft, isNew = false) => { save.reset(); retire.reset(); setPq(''); e.toggle(id, d, isNew) }
  const groups: [string, string][] = [['', 'For everyone'], ...org.departments.filter((d) => org.templates.some((t) => t.department_id === d.id)).map((d): [string, string] => [d.id, d.name])]

  const editor = () => { const d = e.draft!; const existing = org.templates.find((t) => t.id === e.id); const f = pq.trim().toLowerCase()
    const flip = (id: string) => e.set({ items: d.items.includes(id) ? d.items.filter((x) => x !== id) : [...d.items, id] })
    const findable = org.services.filter((s) => !d.items.includes(s.id) && (!f || s.name.toLowerCase().includes(f) || s.code.includes(f)))
    const lines = d.lines.split('\n').map((l) => l.trim()).filter(Boolean); const sc = d.shortcut.trim().replace(/^[#/]/, '').toLowerCase()
    const scBad = !!sc && (!/^[a-z0-9_]{1,20}$/.test(sc) || org.templates.some((t) => t.id !== e.id && t.shortcut === sc))   // presets live on #: no command can clash
    // each line as the visit's composer will read it; "for dm" links to the patient's own problem, so it is read against the problem list
    const pctx = { services: org.services.filter((x) => !replyFormFor(x.reply_type)?.automatic), templates: [], departments: org.departments, problems: PROBLEMS.map((p) => ({ id: p.icd10, name: p.name })), departmentId: d.department_id }
    const checked = lines.map((l) => { const r = readPresetLine(l, pctx); return { l, r: r && 'error' in r ? r.error : null, what: r && 'ok' in r ? r.ok.map((p) => p.line).join(' · ') + (/\sfor\s/i.test(l) && /^\/?rx\s/.test(l.trim()) ? ' — linked when the patient has it' : '') : null } })
    return <EditPanel dirty={e.dirty} saving={save.isPending} error={save.error ?? retire.error} canSave={!!d.name.trim() && (d.items.length > 0 || lines.length > 0) && !scBad && !checked.some((c) => c.r) && (!lines.length || !!sc)} onCancel={e.cancel}
      onSave={() => save.mutate({ id: e.id!, data: { name: d.name.trim(), department_id: d.department_id || null, services: d.items, shortcut: sc || null, lines } }, { onSuccess: e.done })}
      aside={existing && <RetireButton what={existing.name} onRetire={() => retire.mutate(existing.id, { onSuccess: e.done })} />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" changed={e.changed('name')}><Input value={d.name} onChange={(x) => e.set({ name: x.target.value })} placeholder="Antenatal booking" required autoFocus /></Field>
        <Field label="Offered to" changed={e.changed('department_id')} hint="Everyone, or only one department's staff."><Select value={d.department_id} onChange={(x) => e.set({ department_id: x.target.value })}><option value="">everyone</option>{org.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Shortcut" changed={e.changed('shortcut')} hint={scBad ? 'Letters, digits and _ only, and not taken by another preset.' : lines.length && !sc ? 'Lines run only from a shortcut — give it one.' : 'Typed in the visit as #dm — runs the services and the lines below. Headings only (S: O: A: P:) open a note to fill.'}>
          <Input aria-label="Shortcut" value={d.shortcut} onChange={(x) => e.set({ shortcut: x.target.value })} placeholder="#dm" className={cn('font-mono', (scBad || (lines.length > 0 && !sc)) && 'border-danger')} /></Field>
      </div>
      <Fieldset title={`Lines · ${lines.length}`}>
        <textarea aria-label="Lines" value={d.lines} onChange={(x) => e.set({ lines: x.target.value })} rows={Math.max(3, lines.length + 1)} spellCheck={false} placeholder={'/rx metformin 500 bd 30d for dm\nplan: review HbA1c in 3 months'}
          className="-mt-1 w-full rounded-lg border border-line-strong px-3 py-2 font-mono text-13 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" />
        <p className="-mt-1 text-12 text-faint">One line each, as typed in the visit’s composer: /rx, /dx, /al, /v, /order, or a note line (plan: …). The slash may be left out here. They become drafts the clinician can change before Done.</p>
        {checked.some((c) => c.r) && <p className="text-12 text-danger">Fix the lines in red first — the visit could not read them.</p>}
        {checked.length > 0 && <ul className="grid gap-0.5 text-12">{checked.map((c, i) => <li key={i} className={c.r ? 'text-danger' : 'text-muted'}><span className="font-mono text-faint">{i + 1}</span> {c.r ?? c.what}</li>)}</ul>}
      </Fieldset>
      <Fieldset title={`Services · ${d.items.length} chosen`}>
        {d.items.length > 0 && <div className="-mt-1 flex flex-wrap gap-1.5">{d.items.map((id) => <Chip variant="check" shape="pill" key={id} on onClick={() => flip(id)}>{svc(id)?.name ?? '?'}</Chip>)}</div>}
        {d.items.length === 0 && lines.length === 0 && <p className="-mt-2 text-12 text-warn">Choose a service or write a line.</p>}
        <SearchInput className="max-w-sm" value={pq} onChange={setPq} placeholder="Find a service… (↵ adds the first)" onEnter={() => { if (f && findable[0]) { flip(findable[0].id); setPq('') } }} />
        <div className="grid max-h-72 gap-3 overflow-y-auto">{org.departments.map((dep) => { const ss = findable.filter((s) => s.department_id === dep.id); if (!ss.length) return null
          return <div key={dep.id}><p className="mb-1 text-11 text-faint">{dep.name}</p><div className="flex flex-wrap gap-1.5">{ss.map((s) => <Chip variant="check" shape="pill" key={s.id} on={false} onClick={() => flip(s.id)}>{s.name}</Chip>)}</div></div> })}</div>
      </Fieldset>
    </EditPanel> }

  return <div className="grid gap-4">
    <PageHead title="Presets" hint="What is often written together — services and speed lines — run by typing its #shortcut in the visit (its services also by /order <name>)." right={<Button size="sm" onClick={() => open(newId(), { name: '', department_id: '', items: [], shortcut: '', lines: '' }, true)}><Plus className="h-3.5 w-3.5" />Preset</Button>} />
    {e.isNew && <NewCard title="New preset">{editor()}</NewCard>}
    {groups.map(([dep, label]) => { const ts = org.templates.filter((t) => (t.department_id ?? '') === dep); if (!ts.length) return null
      return <Section flush key={dep || 'all'} id={`preset.${dep || 'all'}`} title={label} count={ts.length} summary={ts.map((t) => t.name).join(', ')}>
        <ul className="divide-y divide-line">{ts.map((t) => <Row key={t.id} open={e.id === t.id && !e.isNew} editor={editor}
          onToggle={() => open(t.id, { name: t.name, department_id: t.department_id ?? '', items: t.items.map((i) => i.service_id), shortcut: t.shortcut ?? '', lines: (t.lines ?? []).join('\n') })}>
          <span className="w-48 truncate font-medium">{t.name}{t.shortcut && <span className="ms-1.5 font-mono text-12 font-normal text-accent">#{t.shortcut}</span>}</span>
          {t.items.length > 0 && <Badge>{t.items.length} services</Badge>}{(t.lines ?? []).length > 0 && <Badge tone="brand">{t.lines.length} lines</Badge>}
          <span className="min-w-0 flex-1 truncate text-12 text-faint">{[...t.items.map((i) => svc(i.service_id)?.name ?? '?'), ...(t.lines ?? [])].join(' · ')}</span>
        </Row>)}</ul>
      </Section> })}
    {org.templates.length === 0 && !e.isNew && <Card><Empty>No presets yet.</Empty></Card>}
  </div>
}

