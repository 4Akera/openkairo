import { useState } from 'react'
import { useDepartment } from '../hooks/organization'
import { useDrafts, useDraftsFor } from '../hooks/drafts'
import type { RecordView } from '../db/types'
import { Button, Input, Select } from '../ui'
type Kind = 'note' | 'vitals' | 'request' | 'prescription' | 'problem' | 'allergy'
const TABS: [Kind, string, string][] = [['note', 'Note', 'write:note'], ['vitals', 'Vitals', 'write:vitals'], ['request', 'Request', 'write:request'], ['prescription', 'Prescription', 'write:prescription'], ['problem', 'Problem', 'write:problem'], ['allergy', 'Allergy', 'write:allergy']]
const FREQ = ['OD', 'BD', 'TDS', 'QDS', 'q4h', 'q6h', 'q8h', 'q12h', 'weekly', 'monthly', 'PRN', 'once', 'stat']

/** Today: everything the visit will write, as drafts; Done signs them in one write_set (spec 05). */
export function Today({ r, patientId, departmentId, can }: { r: RecordView; patientId: string; departmentId: string; can: (a: string) => boolean }) {
  const { org } = useDepartment()
  const tabs = TABS.filter(([, , a]) => can(a))
  const [tab, setTab] = useState<Kind>(tabs[0]?.[0] ?? 'note')
  const drafts = useDraftsFor(patientId)
  const add = (d: { function: string; params: Record<string, unknown>; line: string }) => useDrafts.getState().add(patientId, d)
  const remove = useDrafts((s) => s.remove)
  void r
  return <section className="rounded-lg border border-teal-200 bg-white">
    <div className="flex items-center gap-1 border-b border-neutral-200 px-2 pt-2">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-t px-2.5 py-1.5 text-xs ${tab === k ? 'bg-teal-50 font-medium text-teal-900' : 'text-neutral-500 hover:text-neutral-800'}`}>{l}</button>)}</div>
    <div className="p-3">
      {tab === 'note' && <NoteForm onAdd={add} />}
      {tab === 'vitals' && <VitalsForm onAdd={add} />}
      {tab === 'request' && <RequestForm onAdd={add} services={(org?.services ?? []).filter((s) => s.department_id !== departmentId)} templates={org?.templates ?? []} departments={org?.departments ?? []} problems={r.problems} />}
      {tab === 'prescription' && <PrescriptionForm onAdd={add} />}
      {tab === 'problem' && <ProblemForm onAdd={add} />}
      {tab === 'allergy' && <AllergyForm onAdd={add} />}
    </div>
    {drafts.length > 0 && <ul className="divide-y divide-neutral-100 border-t border-neutral-200">{drafts.map((d) => <li key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm"><span className="w-20 font-mono text-[10px] uppercase text-neutral-400">{d.function.replace('write_', '')}</span><span className="flex-1">{d.line}</span><button onClick={() => remove(patientId, d.id)} className="text-xs text-neutral-400 hover:text-red-700">✕</button></li>)}</ul>}
  </section>
}
type Add = (d: { function: string; params: Record<string, unknown>; line: string }) => void
const enterSubmits = (e: React.KeyboardEvent<HTMLFormElement>) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); e.currentTarget.requestSubmit() } }
function NoteForm({ onAdd }: { onAdd: Add }) {
  const [kind, setKind] = useState('progress'); const [text, setText] = useState('')
  return <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onAdd({ function: 'write_note', params: { kind, text }, line: `${kind}: ${text.slice(0, 80)}` }); setText('') }} onKeyDown={enterSubmits} className="grid gap-2">
    <div className="flex gap-2"><Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40"><option value="progress">Progress</option><option value="history_physical">History &amp; physical</option><option value="plan">Plan</option><option value="procedure">Procedure</option><option value="nurse">Nurse</option><option value="letter">Letter</option><option value="other">Other</option></Select><Button type="submit" size="sm" variant="outline" disabled={!text.trim()}>Add</Button></div>
    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Write…" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.stopPropagation() }} />
  </form>
}
function VitalsForm({ onAdd }: { onAdd: Add }) {
  const [v, setV] = useState<Record<string, string>>({})
  const F: [string, string][] = [['systolic', 'Sys'], ['diastolic', 'Dia'], ['pulse', 'Pulse'], ['temperature', 'Temp'], ['spo2', 'SpO₂'], ['respiratory_rate', 'RR'], ['weight', 'Wt'], ['height', 'Ht']]
  return <form onSubmit={(e) => { e.preventDefault(); const p = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '').map(([k, x]) => [k, Number(x)])); if (!Object.keys(p).length) return; onAdd({ function: 'write_vitals', params: p, line: Object.entries(p).map(([k, x]) => `${k} ${x}`).join(', ') }); setV({}) }} onKeyDown={enterSubmits} className="flex flex-wrap items-end gap-2">
    {F.map(([k, l]) => <label key={k} className="text-xs text-neutral-600">{l}<Input type="number" step="any" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="mt-0.5 w-20" /></label>)}<Button type="submit" size="sm" variant="outline">Add</Button>
  </form>
}
function RequestForm({ onAdd, services, templates, departments, problems }: { onAdd: Add; services: RecordView extends never ? never : { id: string; name: string; department_id: string | null; section_name: string | null }[]; templates: { id: string; name: string; items: { service_id: string }[] }[]; departments: { id: string; name: string; is_outside?: boolean }[]; problems: { id: string; name: string }[] }) {
  const [q, setQ] = useState(''); const [priority, setPriority] = useState('routine'); const [question, setQuestion] = useState(''); const [toDept, setToDept] = useState('')
  const byName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '?'
  const hits = q.length ? services.filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []
  const send = (s: { id: string; name: string; department_id: string | null }) => onAdd({ function: 'write_request', params: { service_id: s.id, priority, question_text: question || null, problems: problems.slice(0, 0) }, line: `${s.name} → ${byName(s.department_id)}${priority !== 'routine' ? ` (${priority})` : ''}` })
  return <div className="grid gap-2">
    <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Service (CBC, HbA1c, Dispensing…)" autoFocus /><Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-28"><option value="routine">routine</option><option value="urgent">urgent</option><option value="stat">stat</option></Select></div>
    {hits.length > 0 && <ul className="flex flex-wrap gap-1.5">{hits.map((s) => <li key={s.id}><button onClick={() => { send(s); setQ('') }} className="rounded-md border border-neutral-200 px-2 py-1 text-xs hover:border-teal-700 hover:bg-teal-50">{s.name} <span className="text-neutral-400">{byName(s.department_id)}</span></button></li>)}</ul>}
    {templates.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">Presets:{templates.map((t) => <button key={t.id} onClick={() => t.items.forEach((i) => { const s = services.find((x) => x.id === i.service_id); if (s) send(s) })} className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-800 hover:bg-teal-50">{t.name}</button>)}</div>}
    <div className="flex gap-2"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Question for a consult (optional)" /><Select value={toDept} onChange={(e) => setToDept(e.target.value)} className="w-44"><option value="">Consult…</option>{departments.filter((d) => !services.some((s) => s.department_id === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      <Button size="sm" variant="outline" disabled={!toDept || !question.trim()} onClick={() => { onAdd({ function: 'write_request', params: { to_department_id: toDept, priority, question_text: question }, line: `Consult ${byName(toDept)}: ${question.slice(0, 60)}` }); setQuestion(''); setToDept('') }}>Ask</Button></div>
  </div>
}
function PrescriptionForm({ onAdd }: { onAdd: Add }) {
  const [drug, setDrug] = useState(''); const [dose, setDose] = useState(''); const [unit, setUnit] = useState('mg'); const [route, setRoute] = useState('oral'); const [freq, setFreq] = useState('OD'); const [days, setDays] = useState(''); const [instr, setInstr] = useState('')
  return <form onSubmit={(e) => { e.preventDefault(); if (!drug.trim()) return; onAdd({ function: 'write_prescription', params: { action: 'start', drug: { name: drug.trim() }, dose_number: dose ? Number(dose) : null, dose_unit: unit, route, frequency: freq, prn: freq === 'PRN', duration_days: days ? Number(days) : null, instructions_text: instr || null }, line: `${drug} ${dose}${unit} ${route} ${freq}${days ? ` × ${days}d` : ''}` }); setDrug(''); setDose(''); setDays(''); setInstr('') }} onKeyDown={enterSubmits} className="grid gap-2">
    <div className="flex flex-wrap gap-2"><Input value={drug} onChange={(e) => setDrug(e.target.value)} placeholder="Drug" className="w-48" autoFocus /><Input type="number" step="any" value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose" className="w-20" /><Input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-16" />
      <Select value={route} onChange={(e) => setRoute(e.target.value)} className="w-24">{['oral', 'sc', 'im', 'iv', 'topical', 'inhaled', 'pr', 'pv'].map((x) => <option key={x}>{x}</option>)}</Select><Select value={freq} onChange={(e) => setFreq(e.target.value)} className="w-24">{FREQ.map((x) => <option key={x}>{x}</option>)}</Select><Input type="number" value={days} onChange={(e) => setDays(e.target.value)} placeholder="days" className="w-20" /></div>
    <div className="flex gap-2"><Input value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Instructions (optional)" /><Button type="submit" size="sm" variant="outline" disabled={!drug.trim()}>Add</Button></div>
  </form>
}
function ProblemForm({ onAdd }: { onAdd: Add }) {
  const [name, setName] = useState(''); const [onset, setOnset] = useState('')
  return <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; onAdd({ function: 'write_problem', params: { action: 'add', name: name.trim(), status: 'active', onset_on: onset || null }, line: `Problem: ${name}` }); setName(''); setOnset('') }} onKeyDown={enterSubmits} className="flex gap-2">
    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Problem" autoFocus /><Input value={onset} onChange={(e) => setOnset(e.target.value)} placeholder="Onset (2024 or 2024-03)" className="w-40" /><Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>Add</Button>
  </form>
}
function AllergyForm({ onAdd }: { onAdd: Add }) {
  const [sub, setSub] = useState(''); const [react, setReact] = useState(''); const [sev, setSev] = useState('moderate'); const [kind, setKind] = useState('allergy')
  return <form onSubmit={(e) => { e.preventDefault(); if (!sub.trim()) return; onAdd({ function: 'write_allergy', params: { action: 'add', substance: { name: sub.trim() }, kind, reactions_text: react || null, severity: sev }, line: `${kind}: ${sub}${react ? ` — ${react}` : ''}` }); setSub(''); setReact('') }} onKeyDown={enterSubmits} className="flex flex-wrap gap-2">
    <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Substance" className="w-44" autoFocus /><Input value={react} onChange={(e) => setReact(e.target.value)} placeholder="Reaction" className="w-44" /><Select value={sev} onChange={(e) => setSev(e.target.value)} className="w-28">{['mild', 'moderate', 'severe'].map((x) => <option key={x}>{x}</option>)}</Select><Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-32"><option value="allergy">allergy</option><option value="intolerance">intolerance</option></Select><Button type="submit" size="sm" variant="outline" disabled={!sub.trim()}>Add</Button>
  </form>
}
