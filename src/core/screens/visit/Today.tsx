import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, X } from 'lucide-react'
import { useDepartment } from '../../hooks/organization'
import { useDrafts, useDraftsFor } from '../../hooks/drafts'
import type { RecordView } from '../../db/types'
import { Badge, Button, Card, Heading, IconButton, Input, Kbd, Select, cn } from '../../ui'
import { parse, type Ctx } from './parse'

const KIND_TONE: Record<string, 'brand' | 'amber' | 'red' | 'blue' | 'neutral'> = { note: 'neutral', vitals: 'blue', request: 'amber', consult: 'amber', prescription: 'brand', problem: 'brand', allergy: 'red', review: 'neutral' }
const HELP: [string, string][] = [
  ['bp 148/92 p 84 t 37 w 86', 'vitals'], ['rx metformin 500 bd 30d for dm', 'prescription'], ['lab hba1c, lipid · lab urgent cbc', 'requests or a preset'],
  ['ref cardiology chest pain on effort', 'consult'], ['dx hypertension since 3y ; on amlodipine', 'problem  ( ? = suspected )'], ['al penicillin: rash severe', 'allergy'],
  ['hx … · ex … · plan …', 'note of that kind'], ['anything else', 'added to today’s note'],
]
export interface TodayHandle { focus: () => void }

/** Today (spec 05): the speed line first, then this visit's drafts, then the longer forms. Nothing is written until Done. */
export const Today = forwardRef<TodayHandle, { r: RecordView; patientId: string; departmentId: string; can: (a: string) => boolean }>(function Today({ r, patientId, departmentId, can }, ref) {
  const { org } = useDepartment()
  const drafts = useDraftsFor(patientId)
  const input = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }))
  const [text, setText] = useState(''); const [history, setHistory] = useState<string[]>([]); const [hi, setHi] = useState(-1); const [help, setHelp] = useState(false); const [tab, setTab] = useState<'note' | 'vitals' | 'request' | null>(null)
  const ctx: Ctx = useMemo(() => ({
    services: org?.services ?? [], templates: org?.templates ?? [], departments: org?.departments ?? [], departmentId,
    problems: [...r.problems.map((p) => ({ id: p.id, name: p.name })), ...drafts.filter((d) => d.function === 'write_problem' && d.params.action === 'add').map((d) => ({ id: d.id, name: String(d.params.name) }))],
  }), [org, departmentId, r.problems, drafts])
  const result = parse(text, ctx)
  // lab/req: suggest services for the word being typed; Tab takes the first
  const head = text.trim().split(/\s+/)[0]?.toLowerCase()
  const partial = /^(lab|labs|req|order|inv|test)$/.test(head ?? '') ? text.split(/[,\s]+/).pop() ?? '' : ''
  const suggest = partial.length >= 1 && !/^(lab|labs|req|order|inv|test|urgent|stat)$/i.test(partial) ? (org?.services ?? []).filter((s) => s.department_id !== departmentId && (s.code.startsWith(partial.toLowerCase()) || s.name.toLowerCase().includes(partial.toLowerCase()))).slice(0, 6) : []
  const allowed = (fn: string) => can({ write_vitals: 'write:vitals', write_prescription: 'write:prescription', write_request: 'write:request', write_problem: 'write:problem', write_allergy: 'write:allergy', write_note: 'write:note' }[fn] ?? 'write:note')
  const blocked = result && 'ok' in result ? result.ok.find((p) => !allowed(p.function)) : undefined
  function commit() {
    if (!result || !('ok' in result) || blocked) return
    for (const p of result.ok) useDrafts.getState().add(patientId, { function: p.function, params: p.params, line: p.line, kind: p.kind, tag: p.tag, append: p.append })
    setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 30)); setText(''); setHi(-1)
  }
  function key(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); commit() }
    else if (e.key === 'Tab' && suggest[0]) { e.preventDefault(); setText(text.slice(0, text.length - partial.length) + suggest[0].code + ', ') }
    else if (e.key === 'ArrowUp' && (text === '' || hi >= 0) && history.length) { e.preventDefault(); const n = Math.min(hi + 1, history.length - 1); setHi(n); setText(history[n]) }
    else if (e.key === 'ArrowDown' && hi >= 0) { e.preventDefault(); const n = hi - 1; setHi(n); setText(n >= 0 ? history[n] : '') }
    else if (e.key === 'Escape') { setText(''); setHi(-1); input.current?.blur() }
  }
  return <Card className="overflow-hidden">
    <div className="border-b border-neutral-100 p-3">
      <div className="relative">
        <Input ref={input} value={text} onChange={(e) => { setText(e.target.value); setHi(-1) }} onKeyDown={key} autoFocus spellCheck={false}
          placeholder="Type to write — bp 140/90 · rx … · lab … · dx … · al … · or the note itself" className="h-11 pr-24 font-mono text-[14px] placeholder:font-sans" />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 text-neutral-400"><button onClick={() => setHelp(!help)} className={cn('rounded px-1.5 text-xs hover:text-neutral-700', help && 'text-teal-800')}>?</button><Kbd>/</Kbd></span>
      </div>
      {text.trim() && <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5 text-[13px]">
        {result && 'error' in result && <span className="text-red-700">{result.error}</span>}
        {blocked && <span className="text-red-700">Your role cannot write a {blocked.kind}.</span>}
        {result && 'ok' in result && !blocked && <>{result.ok.map((p, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-neutral-50 px-2 py-0.5 ring-1 ring-neutral-200"><Badge tone={KIND_TONE[p.kind]}>{p.kind}</Badge>{p.line}</span>)}<span className="ml-1 inline-flex items-center gap-1 text-[11px] text-neutral-400"><CornerDownLeft className="h-3 w-3" />add</span></>}
      </div>}
      {suggest.length > 0 && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">{suggest.map((s, i) => <button key={s.id} onClick={() => { setText(text.slice(0, text.length - partial.length) + s.code + ', '); input.current?.focus() }} className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-neutral-200 hover:ring-teal-600"><span className="font-mono text-neutral-500">{s.code}</span> {s.name}{i === 0 && <Kbd className="ml-1">tab</Kbd>}</button>)}</div>}
      {help && <table className="mt-3 w-full text-xs"><tbody>{HELP.map(([a, b]) => <tr key={a}><td className="py-0.5 pr-4 font-mono text-neutral-800">{a}</td><td className="text-neutral-500">{b}</td></tr>)}<tr><td colSpan={2} className="pt-1.5 text-neutral-400">↑ recalls earlier lines · Alt+P / Alt+M / Alt+A open the problem, medication, allergy forms · ⌘↵ Done</td></tr></tbody></table>}
    </div>

    {drafts.length > 0 && <div className="border-b border-neutral-100 px-3 py-2">
      <Heading count={drafts.length} tone="brand" className="mb-1">This visit · signed on Done</Heading>
      <ul>{drafts.map((d) => <li key={d.id} className="group flex items-start gap-2 py-1 text-[13.5px]"><Badge tone={KIND_TONE[d.kind ?? ''] ?? 'neutral'} className="mt-0.5 w-20 justify-center">{d.kind ?? d.function.replace('write_', '')}</Badge>
        <span className="min-w-0 flex-1 whitespace-pre-wrap">{d.function === 'write_note' ? String(d.params.text) : d.line}</span>
        <IconButton title="Remove" onClick={() => useDrafts.getState().remove(patientId, d.id)} className="opacity-0 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></IconButton></li>)}</ul>
    </div>}

    <div className="flex items-center gap-1 px-3 py-2 text-xs text-neutral-500"><span className="mr-1">Forms:</span>
      {([['note', 'Long note', 'write:note'], ['vitals', 'Vitals', 'write:vitals'], ['request', 'Requests & presets', 'write:request']] as const).filter(([, , a]) => can(a)).map(([k, l]) =>
        <button key={k} onClick={() => setTab(tab === k ? null : k)} className={cn('rounded-md px-2 py-1', tab === k ? 'bg-teal-50 font-medium text-teal-900' : 'hover:bg-neutral-100 hover:text-neutral-800')}>{l}</button>)}
    </div>
    {tab && <div className="border-t border-neutral-100 p-3">
      {tab === 'note' && <NoteForm onAdd={(kind, t) => useDrafts.getState().add(patientId, { function: 'write_note', kind: 'note', tag: `note:${kind}`, append: true, params: { kind, text: t }, line: t })} />}
      {tab === 'vitals' && <VitalsForm onAdd={(params, line) => { useDrafts.getState().add(patientId, { function: 'write_vitals', kind: 'vitals', params, line }); setTab(null) }} />}
      {tab === 'request' && <RequestForm ctx={ctx} onAdd={(ps) => ps.forEach((p) => useDrafts.getState().add(patientId, p))} />}
    </div>}
  </Card>
})

function NoteForm({ onAdd }: { onAdd: (kind: string, text: string) => void }) {
  const [kind, setKind] = useState('progress'); const [text, setText] = useState('')
  return <div className="grid gap-2">
    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus placeholder="Write the note…" className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
      onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.stopPropagation() }} />
    <div className="flex gap-2"><Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-48"><option value="progress">Progress</option><option value="history_physical">History &amp; examination</option><option value="plan">Plan</option><option value="procedure">Procedure</option><option value="nurse">Nurse</option><option value="letter">Letter</option><option value="other">Other</option></Select>
      <Button size="sm" variant="outline" disabled={!text.trim()} onClick={() => { onAdd(kind, text.trim()); setText('') }}>Add to this visit</Button></div>
  </div>
}
function VitalsForm({ onAdd }: { onAdd: (p: Record<string, number>, line: string) => void }) {
  const [v, setV] = useState<Record<string, string>>({})
  const F: [string, string, string][] = [['systolic', 'Systolic', 'mmHg'], ['diastolic', 'Diastolic', 'mmHg'], ['pulse', 'Pulse', 'bpm'], ['temperature', 'Temp', '°C'], ['spo2', 'SpO₂', '%'], ['respiratory_rate', 'RR', '/min'], ['weight', 'Weight', 'kg'], ['height', 'Height', 'cm']]
  const submit = () => { const p = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '').map(([k, x]) => [k, Number(x)])); if (Object.keys(p).length) onAdd(p, F.filter(([k]) => k in p).map(([k, l]) => `${l} ${p[k]}`).join(' · ')) }
  return <form onSubmit={(e) => { e.preventDefault(); submit() }} className="grid grid-cols-4 gap-2">
    {F.map(([k, l, u], i) => <label key={k} className="text-[11px] text-neutral-500">{l} <span className="text-neutral-400">{u}</span><Input autoFocus={i === 0} type="number" step="any" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="mt-0.5 h-8 text-right" /></label>)}
    <div className="col-span-4 flex justify-end"><Button type="submit" size="sm" variant="outline">Add vitals</Button></div>
  </form>
}
function RequestForm({ ctx, onAdd }: { ctx: Ctx; onAdd: (d: { function: string; params: Record<string, unknown>; line: string; kind: string }[]) => void }) {
  const [q, setQ] = useState(''); const [priority, setPriority] = useState('routine'); const [question, setQuestion] = useState(''); const [toDept, setToDept] = useState('')
  const offered = ctx.services.filter((s) => s.department_id !== ctx.departmentId)
  const dname = (id: string | null) => ctx.departments.find((d) => d.id === id)?.name ?? '?'
  const req = (s: { id: string; name: string; department_id: string | null }) => ({ function: 'write_request', kind: 'request', params: { service_id: s.id, priority }, line: `${s.name}${priority !== 'routine' ? ` (${priority})` : ''} → ${dname(s.department_id)}` })
  const hits = q.trim() ? offered.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) || s.code.startsWith(q.toLowerCase())) : offered
  const groups = [...new Set(hits.map((s) => `${dname(s.department_id)}${s.section_name ? ` · ${s.section_name}` : ''}`))]
  return <div className="grid gap-3">
    <div className="flex gap-2"><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter services…" onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); onAdd([req(hits[0])]); setQ('') } }} /><Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-28"><option value="routine">routine</option><option value="urgent">urgent</option><option value="stat">stat</option></Select></div>
    {ctx.templates.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-neutral-500">Presets</span>{ctx.templates.map((t) => <button key={t.id} onClick={() => onAdd(t.items.flatMap((i) => { const s = offered.find((x) => x.id === i.service_id); return s ? [req(s)] : [] }))} className="rounded-md bg-teal-50 px-2 py-1 font-medium text-teal-900 ring-1 ring-teal-200 hover:bg-teal-100">{t.name} <span className="font-normal text-teal-700">· {t.items.length}</span></button>)}</div>}
    <div className="grid gap-2">{groups.map((g) => <div key={g}><p className="mb-1 text-[11px] font-medium text-neutral-500">{g}</p><div className="flex flex-wrap gap-1">{hits.filter((s) => `${dname(s.department_id)}${s.section_name ? ` · ${s.section_name}` : ''}` === g).map((s) =>
      <button key={s.id} onClick={() => onAdd([req(s)])} className="rounded-md bg-white px-2 py-1 text-xs ring-1 ring-neutral-200 hover:bg-teal-50 hover:ring-teal-600">{s.name}</button>)}</div></div>)}</div>
    <div className="flex gap-2 border-t border-neutral-100 pt-3"><Select value={toDept} onChange={(e) => setToDept(e.target.value)} className="w-44"><option value="">Consult…</option>{ctx.departments.filter((d) => d.id !== ctx.departmentId && !ctx.services.some((s) => s.department_id === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question for the consultant" />
      <Button size="sm" variant="outline" disabled={!toDept || !question.trim()} onClick={() => { onAdd([{ function: 'write_request', kind: 'consult', params: { to_department_id: toDept, priority, question_text: question.trim() }, line: `Consult ${dname(toDept)}: ${question.trim()}` }]); setQuestion(''); setToDept('') }}>Ask</Button></div>
  </div>
}
