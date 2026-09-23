import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { rpc } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { useRequestQueue } from '../../hooks/reads'
import { newId, useRequestActions } from '../../hooks/writes'
import type { RequestQueueRow, ServiceField, Value } from '../../db/types'
import { Badge, Button, Card, Centered, Heading, Input, Kbd, Select, Spinner, cn, errorText, flagClass } from '../../ui'
import { ageOf, groupByPatient, STEP_LABEL, STEP_TONE } from './shared'

interface Entry { vals: Record<string, string>; text: string; notDone: boolean; reason: string }
const blank = (): Entry => ({ vals: {}, text: '', notDone: false, reason: '' })
const NUM = /^-?\d+(\.\d+)?$/
/** a typed value that is not a number, or is far outside anything plausible for the field, is held back for a second look */
export function problemOf(f: ServiceField, raw: string): 'not a number' | 'check value' | null {
  if (f.kind !== 'number' || raw === '') return null
  if (!NUM.test(raw.trim())) return 'not a number'
  const n = Number(raw), hi = f.critical_high ?? f.reference_high, lo = f.critical_low ?? f.reference_low
  if ((hi != null && hi > 0 && n > hi * 10) || (lo != null && lo > 0 && n < lo / 10)) return 'check value'
  return null
}
export function flagOf(f: ServiceField, raw: string) {
  if (f.kind !== 'number' || raw === '' || !NUM.test(raw.trim())) return null
  const n = Number(raw)
  if (f.critical_low != null && n < f.critical_low) return 'critical'; if (f.critical_high != null && n > f.critical_high) return 'critical'
  if (f.reference_low != null && n < f.reference_low) return 'low'; if (f.reference_high != null && n > f.reference_high) return 'high'
  return f.reference_low != null || f.reference_high != null ? 'normal' : null
}

/** All of one patient's open tests for this department on one screen; Enter walks every field; ⌘↵ releases them together. */
export function BenchPatient() {
  const { patientId } = useParams(); const navigate = useNavigate(); const qc = useQueryClient()
  const { org, dept, can } = useDepartment()
  const q = useRequestQueue(dept?.id ?? null); const acts = useRequestActions()
  const groups = useMemo(() => groupByPatient(q.data?.requests ?? []), [q.data])
  const g = groups.find((x) => x.patient.id === patientId)
  const next = groups.find((x) => x.patient.id !== patientId)
  const [entries, setEntries] = useState<Record<string, Entry>>({}); const [checked, setChecked] = useState(false); const [prelim, setPrelim] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const e = (id: string) => entries[id] ?? blank()
  const set = (id: string, patch: Partial<Entry>) => setEntries((s) => ({ ...s, [id]: { ...(s[id] ?? blank()), ...patch } }))
  const fieldsOf = (r: RequestQueueRow) => org?.services.find((s) => s.id === r.service_id)?.fields ?? []
  const ready = (g?.rows ?? []).filter((r) => { const x = e(r.id); return x.notDone ? !!x.reason.trim() : Object.values(x.vals).some((v) => v !== '') || !!x.text.trim() })
  const problems = ready.flatMap((r) => fieldsOf(r).map((f) => problemOf(f, e(r.id).vals[f.code] ?? '')).filter(Boolean))
  const invalid = problems.includes('not a number'); const toCheck = problems.filter((p) => p === 'check value').length
  const flagged = ready.flatMap((r) => fieldsOf(r).map((f) => flagOf(f, e(r.id).vals[f.code] ?? ''))).filter((f) => f && f !== 'normal')
  async function release() {
    if (!g || !dept || !ready.length || invalid) return
    if (toCheck && !checked) { setChecked(true); setErr(`${toCheck} value${toCheck > 1 ? 's look' : ' looks'} implausible — check, then release again`); return }
    setErr(null); setBusy(true)
    try {
      const items = ready.map((r) => { const x = e(r.id); const values: Value[] = fieldsOf(r).flatMap((f) => { const raw = x.vals[f.code]; if (raw === undefined || raw === '') return []; return [f.kind === 'number' ? { code: f.code, name: f.name, value_number: Number(raw) } : { code: f.code, name: f.name, value_text: raw }] })
        return { function: 'write_result', params: { id: newId(), patient_id: g.patient.id, request_id: r.id, values, text: x.text.trim() || null, is_final: !prelim, not_done: x.notDone, not_done_reason_text: x.notDone ? x.reason.trim() : null } } })
      await rpc('write_set', { department_id: dept.id, items })
      qc.invalidateQueries({ queryKey: ['request_queue'] })
      setEntries({}); setChecked(false)
      if (ready.length === g.rows.length) navigate(next ? `/bench/${next.patient.id}` : '/', { replace: true })
    } catch (x) { setErr(errorText(x)) } finally { setBusy(false) }
  }
  // Enter in a field moves to the next field of the whole screen; ⌘↵ releases
  function onKey(ev: React.KeyboardEvent) {
    const t = ev.target as HTMLElement
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); void release(); return }
    if (ev.key === 'Enter' && t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'checkbox') {
      ev.preventDefault(); const all = [...(root.current?.querySelectorAll<HTMLInputElement>('input[data-v]') ?? [])]; const i = all.indexOf(t as HTMLInputElement); all[i + 1]?.focus()
    }
  }
  useEffect(() => { root.current?.querySelector<HTMLInputElement>('input[data-v]')?.focus() }, [patientId, g?.rows.length])
  if (!dept || q.isLoading) return <Centered><Spinner label="Opening" /></Centered>
  if (!g) return <Centered><div className="text-center text-sm text-neutral-500"><p>No open requests for this patient.</p><Button className="mt-3" variant="outline" onClick={() => navigate('/')}>Back to the bench</Button></div></Centered>
  const sent = g.rows.filter((r) => r.request?.step === 'sent')
  const bySection = [...new Set(g.rows.map((r) => r.section_name ?? 'Other'))]
  return <div ref={root} onKeyDown={onKey} className="pb-24">
    <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <button onClick={() => navigate('/')} className="-ml-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title="Back to the bench"><ArrowLeft className="h-4 w-4" /></button>
      <div><p className="flex items-baseline gap-2"><span className="text-lg font-semibold tracking-tight">{g.patient.given_name} {g.patient.family_name}</span><span className="text-sm text-neutral-600 tnum">{ageOf(g.patient.born_on)} y · {g.patient.sex[0].toUpperCase()}</span></p>
        <p className="text-xs text-neutral-500 tnum">#{g.patient.record_number} · {g.rows.length} tests · from {g.from.join(', ')}</p></div>
      {g.priority !== 'routine' && <Badge tone="red">{g.priority.toUpperCase()}</Badge>}
      <div className="ml-auto flex items-center gap-2">
        {sent.length > 0 && can('mark:started') && <Button variant="outline" onClick={() => sent.forEach((r) => acts.step.mutate({ request_id: r.id, from_step: 'sent', step: 'started' }))}>Collect {sent.length}</Button>}
        {next && <Button variant="ghost" onClick={() => navigate(`/bench/${next.patient.id}`)}>Skip →</Button>}
      </div>
    </div></div>

    <div className="mx-auto mt-4 grid max-w-5xl gap-4 px-4">
      {bySection.map((sec) => <section key={sec}><Heading className="mb-1.5">{sec}</Heading><div className="grid gap-3">
        {g.rows.filter((r) => (r.section_name ?? 'Other') === sec).map((r) => { const x = e(r.id); const fields = fieldsOf(r); return <Card key={r.id} className={cn('p-4', x.notDone && 'bg-neutral-50')}>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[15px] font-semibold">{r.service_name ?? r.display_line}</span>
            <Badge tone={STEP_TONE[r.request?.step ?? 'sent'] ?? 'neutral'}>{STEP_LABEL[r.request?.step ?? 'sent'] ?? r.request?.step}</Badge>
            {r.request?.priority !== 'routine' && <Badge tone="red">{r.request?.priority}</Badge>}
            <span className="text-xs text-neutral-500">{r.requester_name} · {r.from_department_name} · {r.occurred_at.slice(11, 16)}</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-600"><input type="checkbox" checked={x.notDone} onChange={(ev) => set(r.id, { notDone: ev.target.checked })} />not done</label>
          </div>
          {r.question_text && <p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">“{r.question_text}”</p>}
          {x.notDone ? <Input data-v value={x.reason} onChange={(ev) => set(r.id, { reason: ev.target.value })} placeholder="Why not — haemolysed, insufficient sample, patient left…" /> : <>
            {fields.length > 0 && <table className="w-full text-sm"><tbody>{fields.map((f) => { const raw = x.vals[f.code] ?? ''; const fl = flagOf(f, raw); return <tr key={f.code} className="border-b border-neutral-100 last:border-0">
              <td className="w-56 py-1 pr-3 text-neutral-700">{f.name}</td>
              <td className="w-36 py-1">{f.kind === 'choice' && f.choices ? <Select data-v="" value={raw} onChange={(ev) => set(r.id, { vals: { ...x.vals, [f.code]: ev.target.value } })} className="h-8">{['', ...f.choices].map((o) => <option key={o} value={o}>{o || '—'}</option>)}</Select>
                : <Input data-v inputMode={f.kind === 'number' ? 'decimal' : undefined} autoComplete="off" value={raw} onFocus={(ev) => ev.target.select()} onChange={(ev) => { setChecked(false); set(r.id, { vals: { ...x.vals, [f.code]: f.kind === 'number' ? ev.target.value.replace(',', '.').replace(/[^\d.-]/g, '') : ev.target.value } }) }}
                    className={cn('h-8 text-right font-medium tnum', fl && fl !== 'normal' && 'border-amber-400 bg-amber-50', fl === 'critical' && 'border-red-500 bg-red-50', problemOf(f, raw) && 'border-red-500 ring-2 ring-red-200', flagClass(fl))} />}</td>
              <td className="w-20 py-1 pl-2 text-xs text-neutral-500">{f.unit}</td>
              <td className="py-1 text-xs text-neutral-400 tnum">{f.reference_low != null || f.reference_high != null ? `${f.reference_low ?? ''} – ${f.reference_high ?? ''}` : ''}</td>
              <td className="w-24 py-1 text-right text-xs font-semibold">{problemOf(f, raw) ? <span className="text-red-700">{problemOf(f, raw)}</span> : fl && fl !== 'normal' && <span className={flagClass(fl)}>{fl === 'low' ? '↓ low' : fl === 'high' ? '↑ high' : fl === 'critical' ? '‼ critical' : fl}</span>}</td>
            </tr> })}</tbody></table>}
            <Input data-v value={x.text} onChange={(ev) => set(r.id, { text: ev.target.value })} placeholder={fields.length ? 'Comment (optional)' : 'Report / answer'} className="mt-2 h-8" />
          </>}
        </Card> })}
      </div></section>)}
    </div>

    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
      <span className="text-sm text-neutral-600 tnum">{ready.length} of {g.rows.length} ready{flagged.length > 0 && <span className="ml-2 font-medium text-amber-700">· {flagged.length} abnormal{flagged.includes('critical') && <b className="ml-1 text-red-700">· critical</b>}</span>}</span>
      <label className="flex items-center gap-1.5 text-xs text-neutral-600"><input type="checkbox" checked={prelim} onChange={(ev) => setPrelim(ev.target.checked)} />preliminary</label>
      {err && <span className="text-sm text-red-700">{err}</span>}
      <span className="ml-auto text-[11px] text-neutral-400"><Kbd>↵</Kbd> next field</span>
      <Button onClick={release} disabled={busy || !ready.length || invalid || !can('write:result')}>Release {ready.length || ''}{ready.length === g.rows.length && next ? ' → next patient' : ''}<Kbd className="ml-1 border-white/40">⌘↵</Kbd></Button>
    </div></div>
  </div>
}
