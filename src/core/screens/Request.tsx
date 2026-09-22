import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDepartment } from '../hooks/organization'
import { useEntry, useRequestQueue } from '../hooks/reads'
import { useRequestActions } from '../hooks/writes'
import type { Entry, ServiceField, Value } from '../db/types'
import { Button, Centered, Input, Spinner, Select, flagClass } from '../ui'
import { FallbackFull } from '../renderers'

/** The request surface (spec 05): one request, its value grid from the service's fields, a report, not-done, steps; release → next. */
export function RequestScreen() { const { requestId } = useParams(); return <RequestBody key={requestId} requestId={requestId} /> }
function RequestBody({ requestId }: { requestId?: string }) {
  const { org, dept, can } = useDepartment()
  const navigate = useNavigate()
  const queue = useRequestQueue(dept?.id ?? null)
  const row = queue.data?.requests.find((r) => r.id === requestId) ?? null
  // technicians see the request, not the record (spec 02): the full entry is read only by those who may read the record
  const full = useEntry(can('read:record') ? requestId ?? null : null)
  const e = useMemo(() => full.data ? { data: full.data, isLoading: false, error: full.error } : row ? { data: { ...row, data: { question_text: row.question_text } as Record<string, unknown>, patient_id: row.patient.id, patient: { ...row.patient, age: 0 }, replies: [], files: [], steps: [], versions: [] } as Entry, isLoading: false, error: null } : { data: null, isLoading: queue.isLoading || full.isLoading, error: full.error ?? queue.error }, [full.data, full.error, full.isLoading, row, queue.isLoading, queue.error])
  const acts = useRequestActions()
  const service = useMemo(() => org?.services.find((s) => s.id === e.data?.service_id) ?? null, [org, e.data])
  const fields = service?.fields ?? []
  const [vals, setVals] = useState<Record<string, string>>({}); const [text, setText] = useState(''); const [notDone, setNotDone] = useState(false); const [reason, setReason] = useState(''); const [final, setFinal] = useState(true); const [err, setErr] = useState<string | null>(null)
  const req = e.data?.request
  const mine = !!req && req.to_department_id === dept?.id
  const open = req?.status === 'open'
  const next = queue.data?.requests.find((r) => r.id !== requestId) ?? null
  async function release(andNext: boolean) {
    if (!e.data || !dept) return; setErr(null)
    const values: Value[] = fields.flatMap((f) => { const raw = vals[f.code]; if (raw === undefined || raw === '') return []; const v: Value = { code: f.code, name: f.name, unit: f.unit ?? undefined }; if (f.kind === 'number') v.value_number = Number(raw); else v.value_text = raw; return [v] })
    try {
      await acts.result.mutateAsync({ patient_id: e.data.patient_id, visit_id: e.data.visit_id, department_id: dept.id, request_id: e.data.id, values, text: text || null, is_final: final, not_done: notDone, not_done_reason_text: notDone ? reason : null })
      if (andNext && next) navigate(`/request/${next.id}`, { replace: true }); else navigate('/')
    } catch (x) { setErr(x instanceof Error ? x.message : String(x)) }
  }
  useEffect(() => { const k = (ev: KeyboardEvent) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && open && mine) { ev.preventDefault(); void release(true) } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }) // eslint-disable-line react-hooks/exhaustive-deps
  if (e.isLoading || !dept) return <Centered><Spinner label="Opening the request" /></Centered>
  if (e.error || !e.data) return <Centered><p className="text-sm text-red-700">{e.error?.message ?? 'not found'}</p></Centered>
  const d = e.data.data
  const patient = e.data.patient
  const replies = e.data.replies ?? []
  const canReply = mine && open && can('write:result')
  const canStep = mine && open
  return <div className="mx-auto grid max-w-4xl gap-4 p-4">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-2.5">
      <button onClick={() => navigate('/')} className="text-xs text-neutral-500 hover:text-neutral-800">← queue</button>
      <span className="font-medium">{patient?.given_name} {patient?.family_name}</span>
      <span className="text-sm">{e.data.display_line}</span>
      <span className="text-xs text-neutral-500">from {e.data.department_name} · {e.data.author_name} · {e.data.occurred_at.slice(0, 16).replace('T', ' ')}</span>
      {req && <span className={`ml-auto text-xs ${open ? 'text-amber-700' : 'text-neutral-500'}`}>{req.step}{req.priority !== 'routine' && <b className="ml-1.5 text-red-700">{req.priority.toUpperCase()}</b>}</span>}
    </div>
    {typeof d.question_text === 'string' && d.question_text && <p className="rounded-md bg-neutral-100 px-3 py-2 text-sm">“{d.question_text}”</p>}
    {Array.isArray(d.problems) && (d.problems as { name: string }[]).length > 0 && <p className="text-xs text-neutral-500">for: {(d.problems as { name: string }[]).map((p) => p.name).join(', ')}</p>}
    {replies.length > 0 && <section className="grid gap-2">{replies.map((r) => <div key={r.id} className="rounded-lg border border-neutral-200 bg-white p-3"><p className="mb-1 text-xs text-neutral-500">{r.author_name} · {r.occurred_at.slice(0, 16).replace('T', ' ')} {!r.is_final && <b className="text-amber-700">preliminary</b>} <span className={flagClass(r.flag)}>{r.flag !== 'normal' && r.flag}</span></p><FallbackFull card={r} data={r.data} /></div>)}</section>}
    {canReply && <section className="grid gap-3 rounded-lg border border-teal-200 bg-white p-4">
      {fields.length > 0 && <ValueGrid fields={fields} vals={vals} setVals={setVals} />}
      <textarea value={text} onChange={(ev) => setText(ev.target.value)} rows={fields.length ? 2 : 6} placeholder={service?.reply_type === 'note' || fields.length === 0 ? 'Report / answer…' : 'Comment (optional)'} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none" />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={!final} onChange={(ev) => setFinal(!ev.target.checked)} />preliminary</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={notDone} onChange={(ev) => setNotDone(ev.target.checked)} />not done</label>
        {notDone && <Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="Why not (required)" className="w-64" />}
        <div className="flex-1" />
        {err && <span className="text-red-700">{err}</span>}
        <Button onClick={() => release(true)} disabled={acts.result.isPending || (notDone && !reason.trim())}>Release{next ? ' → next' : ''} <kbd className="rounded bg-white/20 px-1 text-[10px]">⌘⏎</kbd></Button>
        <Button variant="outline" onClick={() => release(false)} disabled={acts.result.isPending || (notDone && !reason.trim())}>Release</Button>
      </div>
    </section>}
    {canStep && req && <div className="flex flex-wrap items-center gap-2 text-xs">
      {req.step === 'sent' && can('mark:started') && <Button size="sm" variant="outline" onClick={() => acts.step.mutate({ request_id: e.data!.id, from_step: 'sent', step: 'started' })}>Start</Button>}
      {req.step !== 'held' && can('mark:held') && <Button size="sm" variant="ghost" onClick={() => acts.step.mutate({ request_id: e.data!.id, from_step: req.step, step: 'held', reason: 'held' })}>Hold</Button>}
      {req.step === 'held' && can('mark:sent') && <Button size="sm" variant="outline" onClick={() => acts.step.mutate({ request_id: e.data!.id, from_step: 'held', step: 'sent' })}>Resume</Button>}
      {can('mark:cancelled') && <CancelButton onCancel={(why) => acts.step.mutate({ request_id: e.data!.id, from_step: req.step, step: 'cancelled', reason: why })} />}
      {acts.step.error && <span className="text-red-700">{acts.step.error.message}</span>}
    </div>}
    {req?.review_needed_at && can('mark:reviewed') && <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm"><span className="flex-1">Needs your review{req.reply_flag && req.reply_flag !== 'normal' && <b className={`ml-2 ${flagClass(req.reply_flag)}`}>{req.reply_flag}</b>}</span><Button onClick={() => acts.reviewed.mutate([e.data!.id], { onSuccess: () => navigate('/') })} disabled={acts.reviewed.isPending}>Mark reviewed</Button></div>}
    {e.data.steps.length > 0 && <ol className="text-[11px] text-neutral-400">{e.data.steps.map((s, i) => <li key={i}>{s.recorded_at.slice(0, 16).replace('T', ' ')} · {s.step}{s.reason ? ` · ${s.reason}` : ''}</li>)}</ol>}
    {!mine && <p className="text-xs text-neutral-400">Addressed to {req?.to_department_name}. You are viewing only.</p>}
  </div>
}
function ValueGrid({ fields, vals, setVals }: { fields: ServiceField[]; vals: Record<string, string>; setVals: (v: Record<string, string>) => void }) {
  const flag = (f: ServiceField, raw: string) => { if (f.kind !== 'number' || raw === '') return null; const n = Number(raw); if (f.critical_low != null && n < f.critical_low) return 'critical'; if (f.critical_high != null && n > f.critical_high) return 'critical'; if (f.reference_low != null && n < f.reference_low) return 'low'; if (f.reference_high != null && n > f.reference_high) return 'high'; return 'normal' }
  return <table className="text-sm"><tbody>{fields.map((f, i) => <tr key={f.code}><td className="pr-3 py-0.5 text-neutral-700">{f.name}</td>
    <td className="py-0.5">{f.kind === 'choice' && f.choices ? <Select value={vals[f.code] ?? ''} onChange={(e) => setVals({ ...vals, [f.code]: e.target.value })} className="w-40"><option value="">—</option>{f.choices.map((c) => <option key={c}>{c}</option>)}</Select>
      : <Input autoFocus={i === 0} type={f.kind === 'number' ? 'number' : 'text'} step="any" value={vals[f.code] ?? ''} onChange={(e) => setVals({ ...vals, [f.code]: e.target.value })} className={`w-32 text-right font-mono ${flagClass(flag(f, vals[f.code] ?? ''))}`} />}</td>
    <td className="pl-2 text-xs text-neutral-400">{f.unit}</td><td className="pl-3 font-mono text-[11px] text-neutral-400">{f.reference_low != null || f.reference_high != null ? `${f.reference_low ?? ''}–${f.reference_high ?? ''}` : ''}</td></tr>)}</tbody></table>
}
function CancelButton({ onCancel }: { onCancel: (why: string) => void }) {
  const [why, setWhy] = useState<string | null>(null)
  if (why === null) return <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setWhy('')}>Cancel…</Button>
  return <span className="flex items-center gap-1.5"><Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Reason" className="h-8 w-56" autoFocus /><Button size="sm" variant="danger" disabled={!why.trim()} onClick={() => onCancel(why)}>Cancel request</Button><Button size="sm" variant="ghost" onClick={() => setWhy(null)}>Keep</Button></span>
}
