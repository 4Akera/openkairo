import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Copy, Plus, Search, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { writeSetting } from '../../db/rpc'
import { newId } from '../../hooks/writes'
import { ucumOf } from '../../db/entries'
import type { FieldRange, Organization, Service, ServiceField } from '../../db/types'
import type { SettingData } from '../../db/shapes.generated'
import { replyFormFor } from '../../renderers'
import { Badge, Button, Card, IconButton, Input, Kbd, Select, cn, errorText } from '../../ui'
import { PageHead } from './parts'

// a field's code is written system:code (loinc:718-7); known names fill it in from the codes this page is given
interface Code { code: string; name: string; unit: string | null }
interface ReplyType { key: string; name: string; pack: string | null }
type Band = FieldRange
type EField = ServiceField
const KINDS: EField['kind'][] = ['number', 'text', 'choice']   // the kind select offers only these, so its value is one of them
type Draft = { id: string; department_id: string; section_name: string; code: string; name: string; reply_type: string; coding: string; fields: EField[]; steps: string; isNew: boolean }
const blankField = (): ServiceField => ({ position: 0, key: '', code: '', name: '', kind: 'number', unit: null, ucum: null, choices: null, reference_low: null, reference_high: null, critical_low: null, critical_high: null, ranges: [] })
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
// the steps as typed, comma-separated and in order → keys (Sample sent → sample_sent)
const stepKeys = (t: string) => t.split(',').map(slug).filter(Boolean)
// the bench's own words for an order's state: a step named like one would read as that state
const RESERVED = new Set(['sent', 'started', 'held', 'replied', 'reopened'])
/** why a typed step cannot be a key: letters other than a–z (Arabic, accents) would vanish in the key, a key starts with a letter,
 *  and a bench word is taken */
const stepProblem = (part: string) => { const k = slug(part)
  return !/^[A-Za-z0-9 _-]+$/.test(part) ? `${part}: letters a–z only` : !/^[a-z]/.test(k) ? `${part}: start with a letter` : RESERVED.has(k) ? `${part}: a word the bench uses — name it otherwise` : null }
const coding = (c: string) => { const i = c.indexOf(':'); return i > 0 ? { system: c.slice(0, i).trim(), code: c.slice(i + 1).trim() } : undefined }
// drop<Data>({…}): the type argument checks the literal against the service's shape (a null stands for "not set"); the empties go
type Data = SettingData['service']; type FieldData = NonNullable<Data['fields']>[number]; type RangeData = NonNullable<FieldData['ranges']>[number]
const drop = <T extends object>(o: { [K in keyof T]: T[K] | null }): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as T
/** the service as its setting's data (spec/openCare.md §4.6): each field keeps a stable key, so results over time stay one line */
function serviceData(x: Draft): Data {
  const used = new Set<string>()
  const fields = x.reply_type !== 'result' ? [] : x.fields.filter((y) => y.name.trim()).map((y) => {
    let key = y.key || slug(y.name) || 'field'; while (used.has(key)) key = `${key}_`; used.add(key)
    return drop<FieldData>({ key, name: y.name.trim(), coding: coding(y.code), kind: y.kind, unit: y.kind === 'number' ? y.unit : null, ucum: y.kind === 'number' ? y.ucum ?? ucumOf(y.unit) : null,
      choices: y.kind === 'choice' ? (y.choices ?? []).map((c) => c.trim()).filter(Boolean) : null, low: y.reference_low, high: y.reference_high, critical_low: y.critical_low, critical_high: y.critical_high,
      ranges: y.kind === 'number' ? y.ranges.map((r) => drop<RangeData>({ ...r })) : null })
  })
  return drop<Data>({ code: x.code.trim(), name: x.name.trim(), section: x.section_name.trim(), coding: coding(x.coding), answer: x.reply_type, steps: stepKeys(x.steps), fields })
}
const num = (s: string | undefined) => { const t = (s ?? '').trim().replace(',', '.'); return t === '' || Number.isNaN(Number(t)) ? null : Number(t) }
const range = (s: string | undefined): [number | null, number | null] => { const t = (s ?? '').trim(); if (!t) return [null, null]; const m = t.match(/^(-?[\d.,]*)\s*[-–]\s*(-?[\d.,]*)$/); if (m) return [num(m[1]), num(m[2])]; if (t.startsWith('<')) return [null, num(t.slice(1))]; if (t.startsWith('>')) return [num(t.slice(1)), null]; return [null, null] }
const fmtRange = (lo: number | null, hi: number | null) => lo == null && hi == null ? '' : `${lo ?? ''}-${hi ?? ''}`

/** one field per line: name | unit | ref low-high | critical low-high | code — "|" or tab (a pasted spreadsheet) */
export function parseFields(text: string, codes: Code[]): ServiceField[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const c = l.split(/\t|\|/).map((x) => x.trim())
    const [rl, rh] = range(c[2]); const [cl, ch] = range(c[3])
    const known = codes.find((k) => (c[4] && k.code === c[4]) || k.name.toLowerCase() === c[0].toLowerCase())
    const choice = c[1]?.startsWith('[') ? c[1].slice(1, -1).split('/').map((x) => x.trim()) : null
    return { ...blankField(), name: c[0], unit: choice ? null : c[1] || known?.unit || null, kind: choice ? 'choice' : 'number', choices: choice, reference_low: rl, reference_high: rh, critical_low: cl, critical_high: ch, code: c[4] || known?.code || '' }
  })
}
const toText = (fs: ServiceField[]) => fs.map((f) => [f.name, f.kind === 'choice' ? `[${(f.choices ?? []).join('/')}]` : f.unit ?? '', fmtRange(f.reference_low, f.reference_high), fmtRange(f.critical_low, f.critical_high), f.code].join(' | ').replace(/( \| )+$/, '')).join('\n')

/** Services (spec/openCare.md §4.6): each a setting owned by the department that does it; grouped by department and section, edited in place. */
export function ServicesPage({ org }: { org: Organization }) {
  const qc = useQueryClient()
  // the codes a field name fills in: every field already used on a service here
  const codes = { data: [...new Map(org.services.flatMap((x) => x.fields).filter((x) => x.code).map((x): [string, Code] => [x.name.toLowerCase(), { code: x.code, name: x.name, unit: x.unit }])).values()] }
  // how an order is answered: values, a report, or a pack's own answer (a pack that is on and draws a reply form)
  const replyTypes: ReplyType[] = [{ key: 'result', name: 'values', pack: null }, { key: 'note', name: 'a report', pack: null },
    ...org.types.filter((t) => t.layer !== 'core' && t.layer !== 'base' && org.packs.some((p) => p.key === t.layer && p.enabled) && replyFormFor(t.key)).map((t) => ({ key: t.key, name: t.labels.en ?? t.key, pack: t.layer }))]
  const done = () => qc.invalidateQueries({ queryKey: ['organization'] })
  const save = useMutation({ mutationFn: (x: Draft) => writeSetting({ key: 'service', owner_id: x.department_id, thing_id: x.id, data: serviceData(x) }), onSuccess: done })
  // a service is never deleted: retired, it is no longer offered, and every order and result keeps it
  const retire = useMutation({ mutationFn: (x: Service) => writeSetting({ key: 'service', owner_id: x.department_id, thing_id: x.id, retired: true }), onSuccess: done })
  const [q, setQ] = useState(''); const [open, setOpen] = useState<Draft | null>(null); const [closed, setClosed] = useState<Set<string>>(new Set())
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); box.current?.focus() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  const f = q.trim().toLowerCase()
  const shown = org.services.filter((s) => !f || s.name.toLowerCase().includes(f) || s.code.includes(f) || (s.section_name ?? '').toLowerCase().includes(f) || s.fields.some((x) => x.name.toLowerCase().includes(f)))
  const depts = org.departments.filter((d) => shown.some((s) => s.department_id === d.id) || (!f && org.services.some((s) => s.department_id === d.id)))
  const sections = useMemo(() => [...new Set(org.services.map((s) => s.section_name).filter(Boolean) as string[])].sort(), [org.services])
  const start = (s: Service | null, dept?: string, section?: string, copy = false) => setOpen(s ? { id: copy ? newId() : s.id, department_id: s.department_id ?? '', section_name: s.section_name ?? '', code: copy ? `${s.code}_copy` : s.code, name: copy ? `${s.name} (copy)` : s.name, reply_type: s.reply_type, coding: s.coding ? `${s.coding.system}:${s.coding.code}` : '', fields: s.fields.map((x) => ({ ...x })), steps: s.steps.join(', '), isNew: copy }
    : { id: newId(), department_id: dept ?? org.departments.find((d) => d.work === 'bench')?.id ?? org.departments[0]?.id ?? '', section_name: section ?? '', code: '', name: '', reply_type: 'result', coding: '', fields: [blankField()], steps: '', isNew: true })
  const toggle = (k: string) => setClosed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const editor = (d: Draft) => <Editor key={d.id} draft={d} codes={codes.data} replyTypes={replyTypes} sections={sections} org={org} saving={save.isPending} error={save.error}
    onSave={(x) => save.mutate(x, { onSuccess: () => setOpen(null) })} onClose={() => { save.reset(); setOpen(null) }} />

  return <div className="grid gap-4">
    <PageHead title="Services" hint="What each department does when asked: its fields, ranges and how it replies. Grouped by department and section; open one to edit it in place."
      right={<><div className="relative w-72"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" /><Input ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter services, sections, fields…" className="h-8 pl-8" /><Kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">/</Kbd></div>
      <Button size="sm" onClick={() => start(null)}><Plus className="h-3.5 w-3.5" />Service</Button></>} />
    {open?.isNew && !org.services.some((s) => s.id === open.id) && editor(open)}
    {depts.map((d) => { const ds = shown.filter((s) => s.department_id === d.id); const secs = [...new Set(ds.map((s) => s.section_name ?? ''))].sort(); const k = d.id; return <Card key={d.id} className="overflow-hidden">
      <button onClick={() => toggle(k)} className="flex w-full items-center gap-2 border-b border-neutral-100 bg-neutral-50/60 px-4 py-2.5 text-left">{closed.has(k) ? <ChevronRight className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
        <span className="text-sm font-semibold">{d.name}</span><span className="text-xs text-neutral-400">{ds.length} services</span>
        <span className="ml-auto" onClick={(e) => { e.stopPropagation(); start(null, d.id) }}><Badge tone="brand" className="cursor-pointer">+ add here</Badge></span></button>
      {!closed.has(k) && secs.map((sec) => <div key={sec}>
        {(secs.length > 1 || sec) && <div className="flex items-center gap-2 px-4 pb-1 pt-3"><span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{sec || 'No section'}</span>
          <button onClick={() => start(null, d.id, sec)} className="text-[11px] text-teal-700 hover:underline">+ add</button></div>}
        <ul className="divide-y divide-neutral-100">{ds.filter((s) => (s.section_name ?? '') === sec).map((s) => <li key={s.id}>
          {open?.id === s.id && !open.isNew ? editor(open) : <div className="group flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-neutral-50" onClick={() => start(s)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') start(s) }}>
            <span className="w-28 shrink-0 truncate font-mono text-xs text-neutral-500" title={s.code}>{s.code}</span>
            <span className="w-52 shrink-0 text-[13.5px] font-medium">{s.name}</span>
            <Badge tone={s.reply_type === 'result' ? 'blue' : s.reply_type === 'note' ? 'neutral' : 'amber'}>{s.reply_type}</Badge>
            {s.steps.length > 0 && <span className="shrink-0 text-xs text-neutral-500" title="Steps">{s.steps.map((k) => k.replace(/_/g, ' ')).join(' → ')}</span>}
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{s.fields.map((x) => `${x.name}${x.unit ? ` (${x.unit})` : ''}`).join(' · ')}</span>
            <span className="flex opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
              <IconButton title="Duplicate" onClick={() => start(s, undefined, undefined, true)}><Copy className="h-3.5 w-3.5" /></IconButton>
              <IconButton title="Retire" className="hover:text-red-700" onClick={() => confirm(`Retire ${s.name}? It is no longer offered; existing orders and results keep it.`) && retire.mutate(s)}><Trash2 className="h-3.5 w-3.5" /></IconButton></span>
          </div>}
        </li>)}</ul>
      </div>)}
    </Card> })}
    {retire.error && <p className="text-sm text-red-700">{errorText(retire.error)}</p>}
  </div>
}

function Editor({ draft, codes, replyTypes, sections, org, saving, error, onSave, onClose }: { draft: Draft; codes: Code[]; replyTypes: ReplyType[]; sections: string[]; org: Organization; saving: boolean; error: Error | null; onSave: (d: Draft) => void; onClose: () => void }) {
  const [openBands, setOpenBands] = useState<number | null>(null)
  const [d, setD] = useState(draft); const [bulk, setBulk] = useState(false); const [text, setText] = useState(() => toText(draft.fields))
  const grid = useRef<HTMLDivElement>(null)
  const setF = (i: number, p: Partial<EField>) => setD((x) => ({ ...x, fields: x.fields.map((y, j) => j === i ? { ...y, ...p } : y) }))
  const move = (i: number, by: number) => setD((x) => { const f = [...x.fields]; const [m] = f.splice(i, 1); f.splice(Math.max(0, Math.min(f.length, i + by)), 0, m); return { ...x, fields: f } })
  const codeFor = (name: string) => codes.find((k) => k.name.toLowerCase() === name.trim().toLowerCase())
  // text mode has no ranges by sex/age: a field keeps its bands by name
  const fields: EField[] = bulk ? parseFields(text, codes).map((x) => { const was = d.fields.find((y) => y.name.trim().toLowerCase() === x.name.trim().toLowerCase()); return { ...x, key: was?.key ?? '', ranges: was?.ranges ?? [] } }) : d.fields
  // a step is a key that starts with a letter, listed once
  const steps = stepKeys(d.steps); const twice = steps.find((k, i) => steps.indexOf(k) !== i)
  const odd = d.steps.split(',').map((x) => x.trim()).filter(Boolean).map(stepProblem).find(Boolean)
  const ok = d.name.trim() && d.code.trim() && d.department_id && (d.reply_type !== 'result' || fields.some((x) => x.name.trim())) && !twice && !odd
  const submit = () => { if (!ok) return; onSave({ ...d, fields }) }
  const cell = 'h-7 rounded-md px-2 text-xs'
  return <div className="border-y border-teal-200 bg-teal-50/30 px-4 py-3" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) { e.preventDefault(); submit() } else if (e.key === 'Escape') { e.preventDefault(); onClose() } }}>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-[7rem_1fr_11rem_10rem]">
      <label className="text-[11px] text-neutral-500">Code<Input value={d.code} onChange={(e) => setD({ ...d, code: e.target.value.toLowerCase().replace(/\s+/g, '_') })} placeholder="cbc" className="mt-0.5 h-8 font-mono" autoFocus={!draft.name} /></label>
      <label className="text-[11px] text-neutral-500">Name<Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value, code: draft.isNew && (!d.code || d.code === d.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/, '')) ? e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/, '') : d.code })} placeholder="Complete blood count" className="mt-0.5 h-8" autoFocus={!!draft.name || draft.isNew} /></label>
      <label className="text-[11px] text-neutral-500" title={draft.isNew ? undefined : 'A service stays with its department — duplicate it to offer it elsewhere'}>Department<Select value={d.department_id} disabled={!draft.isNew} onChange={(e) => setD({ ...d, department_id: e.target.value })} className="mt-0.5 h-8">{org.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>
      <label className="text-[11px] text-neutral-500">Section<Input list="sections" value={d.section_name} onChange={(e) => setD({ ...d, section_name: e.target.value })} placeholder="Haematology" className="mt-0.5 h-8" /><datalist id="sections">{sections.map((s) => <option key={s} value={s} />)}</datalist></label>
    </div>
    <div className="mt-2.5 flex items-center gap-2 text-xs"><span className="text-neutral-500">Reply</span>
      {replyTypes.map((t) => <button key={t.key} title={t.pack ? `from the ${t.pack} pack` : 'core'} onClick={() => setD({ ...d, reply_type: t.key })} className={cn('rounded-md px-2 py-0.5 ring-1 ring-inset', d.reply_type === t.key ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-neutral-600 ring-neutral-200')}>{t.name}{t.pack && <span className="ml-1 opacity-60">· {t.pack}</span>}</button>)}
      <label className="ml-3 flex items-center gap-1.5 text-neutral-500">Coded as<Input value={d.coding} onChange={(e) => setD({ ...d, coding: e.target.value })} placeholder="loinc:58410-2" className="h-7 w-36 font-mono text-xs" /></label>
      {!replyTypes.some((t) => t.key === d.reply_type) && <Badge tone="red">{d.reply_type}: no enabled pack answers this</Badge>}
      {d.reply_type === 'result' && <button onClick={() => { if (bulk) setD({ ...d, fields: parseFields(text, codes) }); else setText(toText(d.fields)); setBulk(!bulk) }} className="ml-auto text-teal-700 hover:underline">{bulk ? 'Edit as a grid' : 'Type or paste as text'}</button>}
    </div>
    <div className="mt-2 flex items-center gap-2 text-xs"><label className="flex items-center gap-1.5 text-neutral-500">Steps<Input value={d.steps} onChange={(e) => setD({ ...d, steps: e.target.value })} placeholder="collected, received" className="h-7 w-72 text-xs" /></label>
      {twice || odd ? <Badge tone="red">{twice ? `${twice.replace(/_/g, ' ')} twice` : odd}</Badge>
        : <span className="text-[11px] text-neutral-400">in order, comma-separated: the bench offers each order its next step</span>}
    </div>
    {d.reply_type === 'result' && (bulk ? <div className="mt-2"><textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.max(5, text.split('\n').length + 1)} autoFocus spellCheck={false}
        placeholder={'Haemoglobin | g/dL | 12-16 | 7-20\nWBC | 10^9/L | 4-11 | 1-30\nBlood group | [A/B/AB/O]'} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20" />
      <p className="mt-1 text-[11px] text-neutral-500">One field per line: <span className="font-mono">name | unit | normal low-high | critical low-high | system:code</span>. Tabs work too, so a range pasted from a spreadsheet drops straight in. <span className="font-mono">[a/b/c]</span> in the unit makes a choice list. A name already used here gets its code.</p>
      <p className="mt-1 text-[11px] text-teal-800">{parseFields(text, codes).length} fields · {parseFields(text, codes).filter((x) => x.code).length} matched to a code</p></div>
    : <div ref={grid} className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-neutral-400">
        <th className="w-14" /><th className="px-1 font-medium">Field</th><th className="w-24 px-1 font-medium">Unit</th><th className="w-36 px-1 font-medium">Normal</th><th className="w-36 px-1 font-medium">Critical</th><th className="w-24 px-1 font-medium">Kind</th><th className="w-40 px-1 font-medium">Code</th><th className="w-8" /></tr></thead>
      <tbody>{d.fields.map((x, i) => { const known = !x.code ? codeFor(x.name) : null; return <Fragment key={i}><tr>
        <td className="whitespace-nowrap"><IconButton title="Up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></IconButton><IconButton title="Down" onClick={() => move(i, 1)} disabled={i === d.fields.length - 1}><ArrowDown className="h-3 w-3" /></IconButton></td>
        <td className="p-0.5"><Input list="codenames" value={x.name} onChange={(e) => { const k = codeFor(e.target.value); setF(i, { name: e.target.value, ...(k && !x.code ? { code: k.code, unit: x.unit ?? k.unit } : {}) }) }} placeholder="Haemoglobin" className={cell} autoFocus={i === d.fields.length - 1 && i > 0 && !x.name} /></td>
        <td className="p-0.5"><Input value={x.unit ?? ''} onChange={(e) => setF(i, { unit: e.target.value || null })} placeholder="g/dL" className={cell} disabled={x.kind === 'choice'} /></td>
        <td className="p-0.5">{x.kind === 'choice' ? <Input value={(x.choices ?? []).join('/')} onChange={(e) => setF(i, { choices: e.target.value.split('/') })} placeholder="neg/trace/+/++" className={cell} /> : <RangeInput lo={x.reference_low} hi={x.reference_high} onChange={(lo, hi) => setF(i, { reference_low: lo, reference_high: hi })} className={cell} />}</td>
        <td className="p-0.5">{x.kind !== 'choice' && <RangeInput lo={x.critical_low} hi={x.critical_high} onChange={(lo, hi) => setF(i, { critical_low: lo, critical_high: hi })} className={cell}
          onEnter={() => { if (i === d.fields.length - 1) setD((y) => ({ ...y, fields: [...y.fields, blankField()] })) }} />}</td>
        <td className="p-0.5"><Select value={x.kind} onChange={(e) => setF(i, { kind: e.target.value as EField['kind'], choices: e.target.value === 'choice' ? x.choices ?? [] : null })} className={cn(cell, 'h-7')}>{KINDS.map((k) => <option key={k}>{k}</option>)}</Select></td>
        <td className="p-0.5"><Input value={x.code} onChange={(e) => setF(i, { code: e.target.value.trim() })} placeholder={known ? known.code : 'loinc:718-7'} title="system:code — optional" className={cn(cell, 'font-mono text-[10.5px]')} /></td>
        <td className="whitespace-nowrap">{x.kind === 'number' && <button title="Ranges by sex and age" onClick={() => setOpenBands(openBands === i ? null : i)} className={cn('mr-1 rounded px-1 text-[10.5px]', x.ranges.length > 0 ? 'bg-teal-50 font-medium text-teal-800' : 'text-neutral-400 hover:text-neutral-700')}>♀♂{x.ranges.length ? ` ${x.ranges.length}` : ''}</button>}
          <IconButton title="Remove field" className="hover:text-red-700" onClick={() => setD({ ...d, fields: d.fields.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></IconButton></td>
      </tr>
      {openBands === i && <tr><td /><td colSpan={7} className="pb-2"><Bands bands={x.ranges} onChange={(ranges) => setF(i, { ranges })} /></td></tr>}</Fragment> })}</tbody></table>
      <datalist id="codenames">{codes.map((k) => <option key={k.code} value={k.name}>{k.unit ?? ''}</option>)}</datalist>
      <button onClick={() => setD({ ...d, fields: [...d.fields, blankField()] })} className="mt-1 text-xs text-teal-700 hover:underline">+ field</button><span className="ml-2 text-[11px] text-neutral-400">↵ in the last critical cell adds the next field</span></div>)}
    <div className="mt-3 flex items-center gap-2">{error && <span className="text-sm text-red-700">{errorText(error)}</span>}
      <span className="ml-auto text-[11px] text-neutral-400"><Kbd>⌘S</Kbd> save · <Kbd>esc</Kbd> close</span>
      <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button><Button size="sm" onClick={submit} disabled={!ok || saving}>{saving ? 'Saving…' : 'Save'}</Button></div>
  </div>
}

/** "12-16", "<5", ">40" in one box */
function RangeInput({ lo, hi, onChange, className, onEnter }: { lo: number | null; hi: number | null; onChange: (lo: number | null, hi: number | null) => void; className?: string; onEnter?: () => void }) {
  const [t, setT] = useState(fmtRange(lo, hi))
  return <Input value={t} onChange={(e) => { setT(e.target.value); const [a, b] = range(e.target.value); onChange(a, b) }} onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }} placeholder="low-high" className={cn(className, 'tnum')} />
}

/** ranges that replace the field's own for some patients: by sex, by age (from, up to but not including), or both */
function Bands({ bands, onChange }: { bands: Band[]; onChange: (b: Band[]) => void }) {
  const set = (i: number, p: Partial<Band>) => onChange(bands.map((b, j) => j === i ? { ...b, ...p } : b))
  const cell = 'h-7 rounded-md px-2 text-xs'
  return <div className="rounded-lg bg-white p-2 ring-1 ring-teal-200">
    <p className="mb-1 text-[11px] text-neutral-500">For some patients the range differs. The most specific row that fits wins (sex and age, then sex, then the field’s own range).</p>
    {bands.map((b, i) => <div key={i} className="mb-1 grid grid-cols-[6.5rem_4rem_4rem_8rem_8rem_1.5rem] items-center gap-1.5">
      <Select value={b.gender ?? ''} onChange={(e) => set(i, { gender: (e.target.value || null) as Band['gender'] })} className={cell}><option value="">any sex</option><option value="female">female</option><option value="male">male</option></Select>
      <Input value={b.age_low ?? ''} onChange={(e) => set(i, { age_low: e.target.value === '' ? null : Number(e.target.value) })} placeholder="age ≥" className={cell} />
      <Input value={b.age_high ?? ''} onChange={(e) => set(i, { age_high: e.target.value === '' ? null : Number(e.target.value) })} placeholder="age <" className={cell} />
      <RangeInput lo={b.low} hi={b.high} onChange={(lo, hi) => set(i, { low: lo, high: hi })} className={cell} />
      <RangeInput lo={b.critical_low} hi={b.critical_high} onChange={(lo, hi) => set(i, { critical_low: lo, critical_high: hi })} className={cell} />
      <IconButton title="Remove" onClick={() => onChange(bands.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></IconButton></div>)}
    <button onClick={() => onChange([...bands, { gender: null, age_low: null, age_high: null, low: null, high: null, critical_low: null, critical_high: null }])} className="text-xs text-teal-700 hover:underline">+ range</button>
    <span className="ml-3 text-[10.5px] text-neutral-400">normal · critical as low-high, &lt;x or &gt;x</span>
  </div>
}
