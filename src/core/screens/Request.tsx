import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDepartment } from '../hooks/organization'
import { useEntry, useRequestQueue } from '../hooks/reads'
import { useWrite } from '../hooks/writes'
import { fitField } from '../hooks/ranges'
import { oneSet, resultEntry, stepEntry } from '../db/entries'
import { ageOf } from '../db/views'
import type { Entry, ServiceField } from '../db/types'
import type { EntryData } from '../db/shapes.generated'
import { Button, Centered, Input, Kbd, Spinner, Select, Textarea, flagClass, dateTime } from '../ui'
import { FallbackFull } from '../renderers'
import { fieldTone } from './bench/shared'

/** One order (spec/openCare.md §4.6): the value grid from the service's fields, a report, not done, steps; release → next. */
export function RequestScreen() { const { requestId } = useParams(); return <RequestBody key={requestId} requestId={requestId} /> }
function RequestBody({ requestId }: { requestId?: string }) {
  const { org, dept, can } = useDepartment()
  const navigate = useNavigate()
  const queue = useRequestQueue(dept?.id ?? null)
  // an order this department answers is on its worklist; the worklist row is what an answer is built from
  const row = queue.data?.requests.find((r) => r.id === requestId) ?? null
  // technicians see the order, not the record: the full entry is read only by those who may read the record
  const full = useEntry(can('read:record') ? requestId ?? null : null)
  const e = useMemo(() => full.data ? { data: full.data, isLoading: false, error: full.error } : row ? { data: { ...row, data: { question: row.question_text } as Record<string, unknown>, patient_id: row.patient.id, patient: { ...row.patient, age: ageOf(row.patient.born_on) }, replies: [], files: [], steps: [], versions: [], related: [] } as Entry, isLoading: false, error: null } : { data: null, isLoading: queue.isLoading || full.isLoading, error: full.error ?? queue.error }, [full.data, full.error, full.isLoading, row, queue.isLoading, queue.error])
  const w = useWrite()
  const service = useMemo(() => org?.services.find((s) => s.id === (row?.service_id ?? e.data?.service_id)) ?? null, [org, row, e.data])
  const fields = useMemo(() => (service?.fields ?? []).map((f) => row ? fitField(f, row.patient.sex, ageOf(row.patient.born_on)) : f), [service, row])
  const [vals, setVals] = useState<Record<string, string>>({}); const [text, setText] = useState(''); const [notDone, setNotDone] = useState(false); const [reason, setReason] = useState(''); const [final, setFinal] = useState(true); const [err, setErr] = useState<string | null>(null)
  const req = row?.request ?? e.data?.request
  const mine = !!row
  const open = req?.status === 'open'
  const next = queue.data?.requests.find((r) => r.id !== requestId) ?? null
  const step = (status: EntryData['step']['status'], why?: string) => row && dept && w.mutate(oneSet([stepEntry(row, dept.id, status, why)]), { onError: (x) => setErr(x.message) })
  async function release(andNext: boolean) {
    if (!row || !dept) return; setErr(null)
    try {
      await w.mutateAsync(oneSet([notDone ? stepEntry(row, dept.id, 'failed', reason.trim()) : resultEntry(row, dept.id, fields, vals, text, final)]))
      if (andNext && next) navigate(`/request/${next.id}`, { replace: true }); else navigate('/')
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)) }
  }
  useEffect(() => { const k = (ev: KeyboardEvent) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && open && mine) { ev.preventDefault(); void release(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) })
  if (e.isLoading || !dept) return <Centered><Spinner label="Opening the request" /></Centered>
  if (e.error || !e.data) return <Centered><p className="text-14 text-danger">{e.error?.message ?? 'not found'}</p></Centered>
  const d = e.data.data
  const patient = e.data.patient
  const replies = e.data.replies ?? []
  const canReply = mine && open && can('write:result')
  const canStep = mine && open && can('write:step')
  const question = (d.question ?? d.question_text) as string | undefined
  const held = req?.order?.status === 'on-hold'
  return <div className="mx-auto grid max-w-4xl gap-4 p-4">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
      <button onClick={() => navigate('/')} className="rounded-md text-12 text-faint hover:text-fg focus-ring">← queue</button>
      <span className="font-medium">{patient?.given_name} {patient?.family_name}</span>
      <span className="text-14">{e.data.display_line}</span>
      <span className="text-12 text-faint">from {e.data.department_name} · {e.data.author_name} · {dateTime(e.data.occurred_at)}</span>
      {req && <span className={`ms-auto text-12 ${open ? 'text-warn' : 'text-faint'}`}>{req.step}{req.priority !== 'routine' && <b className="ms-1.5 text-danger">{req.priority.toUpperCase()}</b>}</span>}
    </div>
    {question && <p className="rounded-md bg-sunken px-3 py-2 text-14">“{question}”</p>}
    {replies.length > 0 && <section className="grid gap-2">{replies.map((r) => <div key={r.id} className="rounded-lg border border-line bg-surface p-3"><p className="mb-1 text-12 text-faint">{r.author_name} · {dateTime(r.occurred_at)} {!r.is_final && <b className="text-warn">preliminary</b>} <span className={flagClass(r.flag)}>{r.flag !== 'normal' && r.flag}</span></p><FallbackFull card={r} data={r.data} /></div>)}</section>}
    {canReply && <section className="grid gap-3 rounded-lg border border-accent-line bg-surface p-4">
      {fields.length > 0 && <ValueGrid fields={fields} vals={vals} setVals={setVals} />}
      <Textarea value={text} onChange={(ev) => setText(ev.target.value)} rows={fields.length ? 2 : 6} placeholder={service?.reply_type === 'note' || fields.length === 0 ? 'Report / answer…' : 'Comment (optional)'} />
      <div className="flex flex-wrap items-center gap-3 text-14">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!final} onChange={(ev) => setFinal(!ev.target.checked)} />preliminary</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={notDone} onChange={(ev) => setNotDone(ev.target.checked)} />not done</label>
        {notDone && <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Why not (required)" className="w-64" />}
        <div className="flex-1" />
        {err && <span className="text-danger">{err}</span>}
        <Button onClick={() => release(true)} disabled={w.isPending || (notDone && !reason.trim())}>Release{next ? ' → next' : ''} <Kbd className="ms-1">⌘⏎</Kbd></Button>
        <Button variant="outline" onClick={() => release(false)} disabled={w.isPending || (notDone && !reason.trim())}>Release</Button>
      </div>
    </section>}
    {canStep && req && <div className="flex flex-wrap items-center gap-2 text-12">
      {req.order?.status === 'active' && <Button size="sm" variant="outline" onClick={() => step('in-progress')}>Start</Button>}
      {!held && <Button size="sm" variant="ghost" onClick={() => step('on-hold', 'held')}>Hold</Button>}
      {held && <Button size="sm" variant="outline" onClick={() => step('in-progress')}>Resume</Button>}
      <CancelButton onCancel={(why) => step('rejected', why)} />
      {!canReply && err && <span className="text-danger">{err}</span>}
    </div>}
    {e.data.steps.length > 0 && <ol className="text-11 text-faint">{e.data.steps.map((s, i) => <li key={i}>{dateTime(s.recorded_at)} · {s.step}{s.reason ? ` · ${s.reason}` : ''}</li>)}</ol>}
    {!mine && <p className="text-12 text-faint">Addressed to {req?.to_department_name}. You are viewing only.</p>}
  </div>
}
function ValueGrid({ fields, vals, setVals }: { fields: ServiceField[]; vals: Record<string, string>; setVals: (v: Record<string, string>) => void }) {
  const flag = (f: ServiceField, raw: string) => { if (f.kind !== 'number' || raw === '') return null; const n = Number(raw); if (f.critical_low != null && n < f.critical_low) return 'critical'; if (f.critical_high != null && n > f.critical_high) return 'critical'; if (f.reference_low != null && n < f.reference_low) return 'low'; if (f.reference_high != null && n > f.reference_high) return 'high'; return 'normal' }
  return <table className="text-14"><tbody>{fields.map((f, i) => <tr key={f.key}><td className="pe-3 py-0.5 text-muted">{f.name}</td>
    <td className="py-0.5">{f.kind === 'choice' && f.choices ? <Select value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} className="w-40"><option value="">—</option>{f.choices.map((c) => <option key={c}>{c}</option>)}</Select>
      : <Input autoFocus={i === 0} type={f.kind === 'number' ? 'number' : 'text'} step="any" value={vals[f.key] ?? ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} tone={fieldTone(flag(f, vals[f.key] ?? ''))} className={`w-32 text-end font-mono ${flagClass(flag(f, vals[f.key] ?? ''))}`} />}</td>
    <td className="ps-2 text-12 text-faint">{f.unit}</td><td className="ps-3 font-mono text-11 text-faint">{f.reference_low != null || f.reference_high != null ? `${f.reference_low ?? ''}–${f.reference_high ?? ''}` : ''}</td></tr>)}</tbody></table>
}
function CancelButton({ onCancel }: { onCancel: (why: string) => void }) {
  const [why, setWhy] = useState<string | null>(null)
  if (why === null) return <Button size="sm" variant="ghost" className="text-danger" onClick={() => setWhy('')}>Cancel…</Button>
  return <span className="flex items-center gap-1.5"><Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason" className="h-8 w-56" autoFocus /><Button size="sm" variant="danger" disabled={!why.trim()} onClick={() => onCancel(why)}>Decline</Button><Button size="sm" variant="ghost" onClick={() => setWhy(null)}>Keep</Button></span>
}
