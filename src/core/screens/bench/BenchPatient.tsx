import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { rpc } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { useRequestQueue } from '../../hooks/reads'
import { newId, useRequestActions } from '../../hooks/writes'
import { fitField, useRanges } from '../../hooks/ranges'
import { benchStepsFor, replyFormFor } from '../../renderers'
import type { RequestQueueRow, ServiceField, Value } from '../../db/types'
import { Badge, Button, Card, Centered, Heading, Input, Kbd, Select, Spinner, cn, errorText, flagClass, hm } from '../../ui'
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
  const q = useRequestQueue(dept?.id ?? null); const acts = useRequestActions(); const ranges = useRanges(org?.organization.id ?? null)
  const groups = useMemo(() => groupByPatient(q.data?.requests ?? []), [q.data])
  const g = groups.find((x) => x.patient.id === patientId)
  const next = groups.find((x) => x.patient.id !== patientId)
  const [entries, setEntries] = useState<Record<string, Entry>>({}); const [packVals, setPackVals] = useState<Record<string, unknown>>({}); const [checked, setChecked] = useState(false); const [prelim, setPrelim] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const e = (id: string) => entries[id] ?? blank()
  const set = (id: string, patch: Partial<Entry>) => setEntries((s) => ({ ...s, [id]: { ...(s[id] ?? blank()), ...patch } }))
  // each field carries the range that fits this patient, as the server will flag it
  const fieldsOf = (r: RequestQueueRow) => (org?.services.find((s) => s.id === r.service_id)?.fields ?? []).map((f) => fitField(f, r.service_id!, ranges.data ?? [], r.patient.sex, ageOf(r.patient.born_on)))
  const formOf = (r: RequestQueueRow) => replyFormFor(r.reply_type)
  const ready = (g?.rows ?? []).filter((r) => { const pf = formOf(r); if (pf) return !!pf.toWrite(r, packVals[r.id]); const x = e(r.id); return x.notDone ? !!x.reason.trim() : Object.values(x.vals).some((v) => v !== '') || !!x.text.trim() })
  const problems = ready.flatMap((r) => fieldsOf(r).map((f) => problemOf(f, e(r.id).vals[f.code] ?? '')).filter(Boolean))
  const invalid = problems.includes('not a number'); const toCheck = problems.filter((p) => p === 'check value').length
  const flagged = ready.flatMap((r) => fieldsOf(r).map((f) => flagOf(f, e(r.id).vals[f.code] ?? ''))).filter((f) => f && f !== 'normal')
  async function release() {
    if (!g || !dept || !ready.length || invalid) return
    if (toCheck && !checked) { setChecked(true); setErr(`${toCheck} value${toCheck > 1 ? 's look' : ' looks'} implausible — check, then release again`); return }
    setErr(null); setBusy(true)
    try {
      const items = ready.map((r) => { const pf = formOf(r); if (pf) { const w = pf.toWrite(r, packVals[r.id])!; return { function: w.function, params: { ...w.params, id: newId(), patient_id: g.patient.id, request_id: r.id } } } const x = e(r.id); const values: Value[] = fieldsOf(r).flatMap((f) => { const raw = x.vals[f.code]; if (raw === undefined || raw === '') return []; return [f.kind === 'number' ? { code: f.code, name: f.name, value_number: Number(raw) } : { code: f.code, name: f.name, value_text: raw }] })
        return { function: 'write_result', params: { id: newId(), patient_id: g.patient.id, request_id: r.id, values, text: x.text.trim() || null, is_final: !prelim, not_done: x.notDone, not_done_reason_text: x.notDone ? x.reason.trim() : null } } })
      await rpc('write_set', { department_id: dept.id, items })
      qc.invalidateQueries({ queryKey: ['request_queue'] })
      setEntries({}); setPackVals({}); setChecked(false)
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
  const packSteps = benchStepsFor(dept.type)
  const bySection = [...new Set(g.rows.map((r) => r.section_name ?? 'Other'))]
  return <div ref={root} onKeyDown={onKey} className="pb-24">
    <div className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
      <button onClick={() => navigate('/')} className="-ml-1 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title="Back to the bench"><ArrowLeft className="h-4 w-4" /></button>
      <div><p className="flex items-baseline gap-2"><span className="text-lg font-semibold tracking-tight">{g.patient.given_name} {g.patient.family_name}</span><span className="text-sm text-neutral-600 tnum">{ageOf(g.patient.born_on)} y · {g.patient.sex[0].toUpperCase()}</span></p>
        <p className="text-xs text-neutral-500 tnum">#{g.patient.record_number} · {g.rows.length} open · from {g.from.join(', ')}</p></div>
      {g.priority !== 'routine' && <Badge tone="red">{g.priority.toUpperCase()}</Badge>}
      <div className="ml-auto flex items-center gap-2">
        {packSteps.map((ps) => { const rs = g.rows.filter((r) => ps.from.includes(r.request?.step ?? 'sent')); return rs.length > 0 && <Button key={ps.step} variant="outline" onClick={() => rs.forEach((r) => acts.step.mutate({ request_id: r.id, from_step: r.request!.step, step: ps.step }))}>{ps.label} {rs.length}</Button> })}
        {next && <Button variant="ghost" onClick={() => navigate(`/bench/${next.patient.id}`)}>Skip →</Button>}
      </div>
    </div></div>

    <div className="mx-auto mt-4 grid max-w-5xl gap-4 px-4">
      {bySection.map((sec) => <section key={sec}><Heading className="mb-1.5">{sec}</Heading><div className="grid gap-3">
        {g.rows.filter((r) => (r.section_name ?? 'Other') === sec).map((r) => { const x = e(r.id); const fields = fieldsOf(r); return <Card key={r.id} className={cn('p-4', x.notDone && 'bg-neutral-50')}>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[15px] font-semibold">{r.type === 'request' ? (r.service_name ?? r.display_line) : r.display_line}</span>
            <Badge tone={STEP_TONE[r.request?.step ?? 'sent'] ?? 'neutral'}>{STEP_LABEL[r.request?.step ?? 'sent'] ?? r.request?.step}</Badge>
            {r.request?.priority !== 'routine' && <Badge tone="red">{r.request?.priority}</Badge>}
            <span className="text-xs text-neutral-500">{r.requester_name} · {r.from_department_name} · {hm(r.occurred_at)}</span>
            {!formOf(r) && <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-600"><input type="checkbox" checked={x.notDone} onChange={(ev) => set(r.id, { notDone: ev.target.checked })} />not done</label>}
          </div>
          {r.question_text && <p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">“{r.question_text}”</p>}
          {formOf(r) ? (() => { const F = formOf(r)!.Editor; return <F request={r} value={packVals[r.id]} onChange={(v) => setPackVals((p) => ({ ...p, [r.id]: v }))} /> })()
          : x.notDone ? <Input data-v value={x.reason} onChange={(ev) => set(r.id, { reason: ev.target.value })} placeholder="Why not — haemolysed, insufficient sample, patient left…" /> : <>
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
      {g.rows.some((r) => !formOf(r)) && <label className="flex items-center gap-1.5 text-xs text-neutral-600"><input type="checkbox" checked={prelim} onChange={(ev) => setPrelim(ev.target.checked)} />preliminary</label>}
      {err && <span className="text-sm text-red-700">{err}</span>}
      <span className="ml-auto text-[11px] text-neutral-400"><Kbd>↵</Kbd> next field</span>
      <Button onClick={release} disabled={busy || !ready.length || invalid || !ready.every((r) => can(formOf(r)?.action ?? 'write:result'))}>Release {ready.length || ''}{ready.length === g.rows.length && next ? ' → next patient' : ''}<Kbd className="ml-1 border-white/40">⌘↵</Kbd></Button>
    </div></div>
  </div>
}

/** Correct a released result: the same grid, filled with what was released; the correction replaces it (spec 01), the record keeps both,
 *  and the requesting doctor is asked to look again (amendments 2026-09-23 · 6). */
export function BenchCorrect() {
  const { requestId } = useParams(); const navigate = useNavigate(); const qc = useQueryClient()
  const { org, dept, can } = useDepartment()
  const q = useRequestQueue(dept?.id ?? null); const ranges = useRanges(org?.organization.id ?? null)
  const row = q.data?.recent.find((r) => r.id === requestId)
  const svc = org?.services.find((s) => s.id === row?.service_id)
  const fields = (svc?.fields ?? []).map((f) => fitField(f, svc!.id, ranges.data ?? [], row?.patient.sex ?? '', row ? ageOf(row.patient.born_on) : 0))
  const old = (row?.reply?.data.values as Value[] | undefined) ?? []
  const [vals, setVals] = useState<Record<string, string> | null>(null); const [text, setText] = useState<string | null>(null); const [why, setWhy] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const v = vals ?? Object.fromEntries(old.map((x) => [x.code, String(x.value_number ?? x.value_text ?? '')]))
  const t = text ?? String(row?.reply?.data.text ?? '')
  const invalid = fields.some((f) => problemOf(f, v[f.code] ?? '') === 'not a number')
  const changed = fields.some((f) => (v[f.code] ?? '') !== String(old.find((x) => x.code === f.code)?.value_number ?? old.find((x) => x.code === f.code)?.value_text ?? '')) || t !== String(row?.reply?.data.text ?? '')
  async function save() {
    if (!row?.reply || !dept || invalid || !changed || !why.trim()) return; setBusy(true); setErr(null)
    try {
      const values: Value[] = fields.flatMap((f) => { const raw = v[f.code]; if (raw === undefined || raw === '') return []; return [f.kind === 'number' ? { code: f.code, name: f.name, value_number: Number(raw) } : { code: f.code, name: f.name, value_text: raw }] })
      await rpc('write_result', { id: newId(), patient_id: row.patient.id, department_id: dept.id, request_id: row.id, replaces_id: row.reply.id, values, text: [t.trim(), `Corrected: ${why.trim()}`].filter(Boolean).join('\n') })
      qc.invalidateQueries({ queryKey: ['request_queue'] }); navigate('/')
    } catch (x) { setErr(errorText(x)) } finally { setBusy(false) }
  }
  if (!dept || q.isLoading) return <Centered><Spinner label="Opening" /></Centered>
  if (!row) return <Centered><div className="text-center text-sm text-neutral-500"><p>This result is no longer in the last day’s list.</p><Button className="mt-3" variant="outline" onClick={() => navigate('/')}>Back to the bench</Button></div></Centered>
  return <div className="mx-auto grid max-w-3xl gap-4 p-4" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save() } }}>
    <div className="flex items-center gap-3"><button onClick={() => navigate('/')} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"><ArrowLeft className="h-4 w-4" /></button>
      <div><p className="text-lg font-semibold tracking-tight">Correct: {row.service_name}</p><p className="text-xs text-neutral-500 tnum">#{row.patient.record_number} · {row.patient.given_name} {row.patient.family_name} · released {(row.reply ? hm(row.reply.recorded_at) : '')} by {row.reply?.author_name}</p></div></div>
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">The corrected result replaces the released one. The record keeps both, and the requesting doctor gets it on their review list.</p>
    <Card className="p-4">
      {fields.length > 0 && <table className="w-full text-sm"><thead><tr className="text-left text-[10.5px] uppercase tracking-wider text-neutral-400"><th className="font-medium">Field</th><th className="font-medium">Released</th><th className="font-medium">Corrected</th><th /><th /></tr></thead><tbody>{fields.map((f) => { const raw = v[f.code] ?? ''; const fl = flagOf(f, raw); const was = old.find((x) => x.code === f.code); return <tr key={f.code} className="border-b border-neutral-100 last:border-0">
        <td className="w-48 py-1 pr-3 text-neutral-700">{f.name}</td><td className="w-28 py-1 text-neutral-400 line-through tnum">{was?.value_number ?? was?.value_text ?? '—'}</td>
        <td className="w-36 py-1"><Input inputMode={f.kind === 'number' ? 'decimal' : undefined} value={raw} onFocus={(e) => e.target.select()} onChange={(e) => setVals({ ...v, [f.code]: f.kind === 'number' ? e.target.value.replace(',', '.').replace(/[^\d.-]/g, '') : e.target.value })} className={cn('h-8 text-right font-medium tnum', flagClass(fl))} /></td>
        <td className="w-20 py-1 pl-2 text-xs text-neutral-500">{f.unit}</td><td className="py-1 text-xs text-neutral-400 tnum">{f.reference_low ?? ''} – {f.reference_high ?? ''}</td></tr> })}</tbody></table>}
      <Input value={t} onChange={(e) => setText(e.target.value)} placeholder={fields.length ? 'Comment' : 'Report'} className="mt-2 h-8" />
      <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why the correction — transcription error, wrong sample…" className="mt-2 h-8 border-amber-300" />
    </Card>
    <div className="flex items-center gap-2">{err && <span className="text-sm text-red-700">{err}</span>}<span className="ml-auto text-[11px] text-neutral-400"><Kbd>⌘↵</Kbd> release the correction</span>
      <Button onClick={save} disabled={busy || invalid || !changed || !why.trim() || !can('write:result')}>Release correction</Button></div>
  </div>
}
