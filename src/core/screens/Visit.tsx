import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDepartment } from '../hooks/organization'
import { useRecord, useVisitQueue } from '../hooks/reads'
import { useVisitActions, useWriteSet } from '../hooks/writes'
import { useDrafts, useDraftsFor } from '../hooks/drafts'
import type { RecordView, VisitRow, Value } from '../db/types'
import { Button, Centered, Spinner, flagClass } from '../ui'
import { PatientLine } from '../renderers/PatientLine'
import { CardLine } from '../renderers'
import { Today } from './Today'

/** The visit screen (spec 05): banner, record panel, Today, timeline; Done → Next. Also the plain record when reached from search. */
export function VisitScreen() {
  const { visitId, patientId: paramPatient } = useParams()
  const { dept, can } = useDepartment()
  const navigate = useNavigate()
  const queue = useVisitQueue(dept?.id ?? null)
  const fromQueue = queue.data?.rows.find((r) => r.id === visitId)
  const patientId = paramPatient ?? fromQueue?.patient.id ?? null
  const rec = useRecord(patientId, dept?.id ?? null)
  const visits = useVisitActions()
  const ws = useWriteSet(dept?.id ?? null, patientId)
  const drafts = useDraftsFor(patientId)
  const clear = useDrafts((s) => s.clear)
  const [err, setErr] = useState<string | null>(null)
  const visit = rec.data?.visit ?? null
  const mine = !!visit && visit.department_id === dept?.id
  // opening a waiting/pending patient from the queue starts the consult (nurses hold mark:in_consult too)
  const started = useRef<string | null>(null)
  useEffect(() => { if (visit && mine && (visit.status === 'waiting' || visit.status === 'pending') && can('mark:in_consult') && visitId && started.current !== visit.id) { started.current = visit.id; visits.move.mutate({ visit_id: visit.id, from_status: visit.status, status: 'in_consult' }) } }, [visit?.id, visit?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  const next = useMemo(() => queue.data?.rows.find((r) => r.id !== visitId && (r.band === 'back' || r.band === 'waiting')) ?? null, [queue.data, visitId])
  // no open visit here (reached from search): the drafts still sign as one set, against the record alone
  async function sign() {
    if (!patientId || !drafts.length) return; setErr(null)
    try { await ws.mutateAsync(drafts.map((d) => ({ function: d.function, params: { ...d.params, id: d.id, patient_id: patientId, department_id: dept!.id } }))); clear(patientId) }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  async function done(andNext: boolean) {
    if (!patientId || !visit) return; setErr(null)
    try {
      if (drafts.length) await ws.mutateAsync(drafts.map((d) => ({ function: d.function, params: { ...d.params, id: d.id, patient_id: patientId, visit_id: visit.id, department_id: dept!.id } })))
      clear(patientId)
      const v = await visits.move.mutateAsync({ visit_id: visit.id, from_status: visit.status, status: 'done' })
      if (andNext && next) navigate(`/visit/${next.id}`, { replace: true }); else if (v.status === 'pending') navigate('/'); else navigate('/')
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && visit?.status === 'in_consult') { e.preventDefault(); void done(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }) // eslint-disable-line react-hooks/exhaustive-deps
  if (!dept) return <Centered><Spinner /></Centered>
  if (!patientId && queue.isLoading) return <Centered><Spinner label="Opening the visit" /></Centered>
  if (!patientId) return <Centered><p className="text-sm text-neutral-500">This visit is not in your queue. <button className="text-teal-800" onClick={() => navigate('/')}>Back to the queue</button></p></Centered>
  if (rec.isLoading) return <Centered><Spinner label="Opening the record" /></Centered>
  if (rec.error || !rec.data) return <Centered><p className="text-sm text-red-700">{rec.error?.message ?? 'no record'}</p></Centered>
  const r = rec.data
  return <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[300px_1fr]">
    <Banner r={r} visit={visit} mine={mine} onBack={() => navigate('/')} />
    <RecordPanel r={r} patientId={patientId} departmentId={dept.id} can={can} />
    <div className="grid content-start gap-4">
      {can('write:note') || can('write:vitals') || can('write:request') ? <Today r={r} patientId={patientId} departmentId={dept.id} can={can} /> : null}
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</p>}
      {mine && visit && visit.status === 'in_consult' && <div className="flex items-center gap-2">
        <Button onClick={() => done(true)} disabled={ws.isPending || visits.move.isPending}>{drafts.length ? `Sign ${drafts.length} & ` : ''}Done{next ? ` → ${next.patient.given_name}` : ''} <kbd className="rounded bg-white/20 px-1 text-[10px]">⌘⏎</kbd></Button>
        <Button variant="outline" onClick={() => done(false)} disabled={ws.isPending || visits.move.isPending}>Done, back to queue</Button>
        <Button variant="ghost" onClick={() => visits.move.mutate({ visit_id: visit.id, from_status: 'in_consult', status: 'waiting' }, { onSuccess: () => navigate('/') })}>Return to waiting</Button>
      </div>}
      {!mine && drafts.length > 0 && <div><Button onClick={sign} disabled={ws.isPending}>Sign {drafts.length}</Button></div>}
      <Timeline r={r} />
    </div>
  </div>
}

function Banner({ r, visit, mine, onBack }: { r: RecordView; visit: VisitRow | null; mine: boolean; onBack: () => void }) {
  const v = r.latest_vitals ?? []
  const pick = (c: string) => v.find((x) => x.code === c)
  return <div className="lg:col-span-2">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-neutral-200 bg-white px-4 py-2.5">
      <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-800">← queue</button>
      <PatientLine p={r.patient} className="text-base" />
      {r.allergies.filter((a) => a.status === 'active').length > 0 ? <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">⚠ {r.allergies.filter((a) => a.status === 'active').map((a) => a.substance_name).join(', ')}</span> : <span className="text-xs text-neutral-400">no known allergies</span>}
      {visit && <span className={`text-xs ${mine ? 'text-teal-800' : 'text-neutral-500'}`}>{visit.status.replace('_', ' ')} · {visit.is_first ? 'new' : 'follow-up'}{visit.priority !== 'routine' && <b className="ml-1 text-red-700">{visit.priority}</b>}</span>}
      {!visit && <span className="text-xs text-neutral-400">no open visit here</span>}
      {v.length > 0 && <span className="ml-auto font-mono text-[11px] text-neutral-500">{['8480-6', '8462-4'].every(pick) ? `BP ${pick('8480-6')!.value_number}/${pick('8462-4')!.value_number} ` : ''}{pick('8867-4') ? `HR ${pick('8867-4')!.value_number} ` : ''}{pick('29463-7') ? `Wt ${pick('29463-7')!.value_number}kg` : ''}</span>}
    </div>
  </div>
}

function RecordPanel({ r, patientId, departmentId, can }: { r: RecordView; patientId: string; departmentId: string; can: (a: string) => boolean }) {
  const add = useDrafts((s) => s.add)
  const canWrite = can('write:list_review')
  const review = (list: 'allergies' | 'problems' | 'medications', at: { reviewed_at: string } | null) => <button title="Mark reviewed" onClick={() => add(patientId, { function: 'write_list_review', params: { list, outcome: 'reviewed' }, line: `${list} reviewed` })} className={`text-[11px] ${at ? 'text-neutral-400' : 'text-amber-700'}`}>✓ {at ? `reviewed ${at.reviewed_at.slice(0, 10)}` : 'not reviewed'}</button>
  void departmentId
  return <aside className="grid content-start gap-3">
    <Sect title="Allergies" right={canWrite && review('allergies', r.allergy_review)}>{r.allergies.length === 0 ? <p className="text-xs text-neutral-400">none recorded</p> : <ul className="text-sm">{r.allergies.map((a) => <li key={a.id} className={`flex justify-between ${a.status !== 'active' ? 'text-neutral-400 line-through' : ''}`}><span>{a.substance_name}<span className="ml-1 text-xs text-neutral-500">{a.reactions_text}</span></span>{can('write:allergy') && a.status === 'active' && <button className="text-xs text-neutral-400 hover:text-red-700" title="Remove" onClick={() => add(patientId, { function: 'write_allergy', params: { action: 'refute', allergy_id: a.id, substance: { name: a.substance_name } }, line: `Allergy refuted: ${a.substance_name}` })}>✕</button>}</li>)}</ul>}</Sect>
    <Sect title="Problems" right={canWrite && review('problems', r.problem_review)}>{r.problems.length === 0 ? <p className="text-xs text-neutral-400">none</p> : <ul className="text-sm">{r.problems.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}<span className="ml-1 text-xs text-neutral-400">{p.onset_on}</span></span>{can('write:problem') && <button className="text-xs text-neutral-400 hover:text-neutral-800" title="Resolve" onClick={() => add(patientId, { function: 'write_problem', params: { action: 'resolve', problem_id: p.id, name: p.name, status: 'resolved' }, line: `Problem resolved: ${p.name}` })}>✓</button>}</li>)}</ul>}</Sect>
    <Sect title="Medications" right={canWrite && review('medications', r.medication_review)}>{r.medications.length === 0 ? <p className="text-xs text-neutral-400">none active</p> : <ul className="text-sm">{r.medications.map((m) => <li key={m.id} className="flex justify-between"><span>{m.drug_name} <span className="text-xs text-neutral-500">{m.dose_number}{m.dose_unit} {m.route} {m.frequency}{m.prn ? ' PRN' : ''}</span></span>{can('write:prescription') && <span className="flex gap-1.5"><button className="text-xs text-neutral-400 hover:text-neutral-800" title="Repeat" onClick={() => add(patientId, { function: 'write_prescription', params: { action: 'repeat', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name }, dose_number: m.dose_number, dose_unit: m.dose_unit, route: m.route, frequency: m.frequency }, line: `Repeat ${m.drug_name}` })}>↻</button><button className="text-xs text-neutral-400 hover:text-red-700" title="Stop" onClick={() => add(patientId, { function: 'write_prescription', params: { action: 'stop', medication_id: m.id, drug: { code: m.drug_code, name: m.drug_name } }, line: `Stop ${m.drug_name}` })}>✕</button></span>}</li>)}</ul>}</Sect>
    {r.open_requests.length > 0 && <Sect title="Open requests"><ul className="text-sm">{r.open_requests.map((c) => <li key={c.id} className="flex justify-between py-0.5"><span>{c.display_line}</span><span className="text-xs text-amber-700">{c.request?.step} · {c.request?.to_department_name ?? 'outside'}</span></li>)}</ul></Sect>}
    {r.latest_vitals && <Sect title="Latest vitals"><VitalsLine values={r.latest_vitals} /></Sect>}
  </aside>
}
function Sect({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) { return <section className="rounded-lg border border-neutral-200 bg-white p-3"><div className="mb-1.5 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{title}</h3>{right}</div>{children}</section> }
function VitalsLine({ values }: { values: Value[] }) { return <p className="font-mono text-[12px]">{values.map((v) => <span key={v.code} className={`mr-2 ${flagClass(v.flag)}`}>{v.name.split(' ')[0]} {v.value_number}{v.unit}</span>)}</p> }

function Timeline({ r }: { r: RecordView }) {
  const days = new Map<string, typeof r.entries>()
  for (const c of r.entries) { const d = c.occurred_at.slice(0, 10); days.set(d, [...(days.get(d) ?? []), c]) }
  if (r.entries.length === 0) return <p className="rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-400">Empty record.</p>
  return <section className="grid gap-3">{[...days.entries()].map(([d, cs]) => <div key={d}><h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{d}</h3><ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">{cs.map((c) => <li key={c.id} className="px-3 py-2"><CardLine card={c} /></li>)}</ul></div>)}</section>
}
