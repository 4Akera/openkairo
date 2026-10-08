import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { write, type EntryIn } from '../../db/rpc'
import { useDepartment } from '../../hooks/organization'
import { useRequestQueue } from '../../hooks/reads'
import { refresh } from '../../hooks/writes'
import { fitField } from '../../hooks/ranges'
import { answerEntry, oneSet, resultEntry, stepEntry } from '../../db/entries'
import { replyFormFor } from '../../renderers'
import type { RequestQueueRow, ServiceField } from '../../db/types'
import { Badge, Button, Callout, Card, Centered, Heading, IconButton, Input, Kbd, Select, Spinner, Tag, Toolbar, cn, errorText, flagClass, hm } from '../../ui'
import { ageOf, fieldTone, groupByPatient, nextSteps, phaseOf, STEP_TONE, stepLabel, stepName, todayYmd } from './shared'
import { ChartGlance } from '../chart/glance/ChartGlance'
import { benchMarkRow } from '../marks'
import { isStop, packRowOf } from '../rows'
import { usePackRows } from '../useRows'

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

/** ≥ 1280 px: the glance stands beside the grid; narrower, it folds under the header */
function useWide() {
  const q = '(min-width: 80rem)'
  const [wide, setWide] = useState(() => { try { return matchMedia(q).matches } catch { return true } })
  useEffect(() => { const m = matchMedia(q); const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f) }, [])
  return wide
}

/** All of one patient's open tests for this department on one screen; Enter walks every field; ⌘↵ releases them together. Beside them,
 *  for a reader who holds read:record at this bench, the patient's glance (chart-plan.md §1.5): problems, medicines, allergies, the
 *  last vitals, key results, visits — read-only (a bench's plain roles, a lab technician, hold no read:record, so they see none: owner D13). */
export function BenchPatient() {
  const { patientId } = useParams(); const navigate = useNavigate(); const qc = useQueryClient()
  const { org, dept, can } = useDepartment()
  const q = useRequestQueue(dept?.id ?? null)
  const groups = useMemo(() => groupByPatient(q.data?.requests ?? []), [q.data])
  const g = groups.find((x) => x.patient.id === patientId)
  // the next patient as the bench lists them (§5.7): a booked patient at their place, and never an order a pack's own view holds (To
  // book, booked for another day) nor one a pack holds waiting
  const listRows = useMemo(() => groups.map((x) => packRowOf(x.patient.id, benchMarkRow(x))), [groups])
  const list = usePackRows('bench', listRows, dept)
  const held = new Set(list.views(listRows).flatMap((v) => [...v.groups.keys()]))
  const next = groupByPatient((q.data?.requests ?? []).filter((r) => list.isFree(r.order.item) && !(phaseOf(r.request?.step) === 'todo' && held.has(r.order.item))),
    todayYmd(), (x) => list.place(packRowOf(x.patient.id, benchMarkRow(x)))).find((x) => x.patient.id !== patientId)
  // the packs on the page (spec §5.4): a pack's button and card under the header; an order a pack holds waiting is greyed with its word
  // and goes ahead anyway with a reason, while the patient's other orders stay workable; a stop is never greyed — not done, and a pack's
  // own form stays open on it so its stop (not given) can be written; only what is not a stop waits
  const prow = useMemo(() => g ? packRowOf(g.patient.id, benchMarkRow(g)) : null, [g])
  const packs = usePackRows('patient', useMemo(() => prow ? [prow] : [], [prow]), dept)
  const free = (r: RequestQueueRow) => packs.isFree(r.order.item)
  const orderRow = (r: RequestQueueRow) => packRowOf(`${r.patient.id} ${r.order.item}`, { patient_id: r.patient.id, visit_id: null, orders: [r.order] })
  const [entries, setEntries] = useState<Record<string, Entry>>({}); const [packVals, setPackVals] = useState<Record<string, unknown>>({}); const [checked, setChecked] = useState(false); const [prelim, setPrelim] = useState(false); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const root = useRef<HTMLDivElement>(null); const wide = useWide(); const [record, setRecord] = useState(false)
  const glance = can('read:record'); const width = glance ? 'max-w-7xl' : 'max-w-5xl'   // the glance widens the screen beside the grid
  const e = (id: string) => entries[id] ?? blank()
  const set = (id: string, patch: Partial<Entry>) => setEntries((s) => ({ ...s, [id]: { ...(s[id] ?? blank()), ...patch } }))
  // each field carries the range that fits this patient, as the server will flag it
  const fieldsOf = (r: RequestQueueRow) => (org?.services.find((s) => s.id === r.service_id)?.fields ?? []).map((f) => fitField(f, r.patient.sex, ageOf(r.patient.born_on)))
  const formOf = (r: RequestQueueRow) => replyFormFor(r.reply_type)
  const ready = (g?.rows ?? []).filter((r) => { const pf = formOf(r); if (pf) { const w = pf.toWrite(r, packVals[r.id]); return !!w && (free(r) || isStop(w)) } const x = e(r.id)
    return x.notDone ? !!x.reason.trim() : free(r) && (Object.values(x.vals).some((v) => v !== '') || !!x.text.trim()) })
  const problems = ready.flatMap((r) => fieldsOf(r).map((f) => problemOf(f, e(r.id).vals[f.key] ?? '')).filter(Boolean))
  const invalid = problems.includes('not a number'); const toCheck = problems.filter((p) => p === 'check value').length
  const flagged = ready.flatMap((r) => fieldsOf(r).map((f) => flagOf(f, e(r.id).vals[f.key] ?? ''))).filter((f) => f && f !== 'normal')
  async function release() {
    if (!g || !dept || !ready.length || invalid) return
    if (toCheck && !checked) { setChecked(true); setErr(`${toCheck} value${toCheck > 1 ? 's look' : ' looks'} implausible — check, then release again`); return }
    setErr(null); setBusy(true)
    try {
      // every answer for this patient in one set: a result (or a report) answering its order, a step when not done, a pack's own answer
      const items: EntryIn[] = ready.map((r) => { const pf = formOf(r)
        if (pf) return answerEntry(r, dept.id, pf.toWrite(r, packVals[r.id])!)
        const x = e(r.id)
        return x.notDone ? stepEntry(r, dept.id, 'failed', x.reason.trim()) : resultEntry(r, dept.id, fieldsOf(r), x.vals, x.text, !prelim) })
      await write(oneSet(items))
      refresh(qc)
      setEntries({}); setPackVals({}); setChecked(false)
      if (ready.length === g.rows.length) navigate(next && dept.after_done !== 'queue' ? `/bench/${next.patient.id}` : '/', { replace: true })
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
  if (!g) return <Centered><div className="text-center text-14 text-faint"><p>No open requests for this patient.</p><Button className="mt-3" variant="outline" onClick={() => navigate('/')}>Back to the bench</Button></div></Centered>
  const bySection = [...new Set(g.rows.map((r) => r.section_name ?? 'Other'))]
  return <div ref={root} onKeyDown={onKey} className="pb-24">
    <div className="sticky top-0 z-sticky border-b border-line bg-surface/95 backdrop-blur"><div className={cn('mx-auto flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5', width)}>
      <IconButton size="md" onClick={() => navigate('/')} className="-ms-1" title="Back to the bench" aria-label="Back to the bench"><ArrowLeft className="rtl:-scale-x-100" /></IconButton>
      <div><p className="flex items-baseline gap-2"><span className="text-18 font-semibold tracking-tight">{g.patient.given_name} {g.patient.family_name}</span><span className="text-14 text-muted tnum">{ageOf(g.patient.born_on)} y · {g.patient.sex[0].toUpperCase()}</span></p>
        <p className="text-12 text-faint tnum">#{g.patient.record_number} · {g.rows.length} open · from {g.from.join(', ')}</p></div>
      {g.priority !== 'routine' && <Badge tone="danger">{g.priority.toUpperCase()}</Badge>}
      <div className="ms-auto flex items-center gap-2">
        {nextSteps(g.rows.filter(free), org, can).map((s) => <Button key={`${s.type} ${s.key}`} variant="outline" onClick={() => void write(oneSet(s.rows.map((r) => stepEntry(r, dept.id, 'in-progress', undefined, s.key, s.type))))
          .then(() => refresh(qc), (x) => setErr(errorText(x)))}>{stepName(s.key)} {s.rows.length}</Button>)}
        {prow && packs.buttons(prow)}
        {next && <Button variant="ghost" onClick={() => navigate(`/bench/${next.patient.id}`)}>Skip →</Button>}
      </div>
    </div></div>

    {prow && packs.below(prow) && <div className={cn('mx-auto mt-4 px-4', width)}><Card className="overflow-hidden">{packs.below(prow)}</Card></div>}
    <div className={cn('mx-auto mt-4 grid gap-4 px-4', width, glance && 'xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start')}>
      {glance && <aside aria-label="Record" className="order-first grid content-start gap-2 xl:sticky xl:top-20 xl:order-last xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto">
        {!wide && <button type="button" aria-expanded={record} onClick={() => setRecord(!record)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-13 font-medium text-muted ring-1 ring-inset ring-line transition-colors hover:bg-hover hover:text-fg focus-ring">
          <ChevronRight aria-hidden className={cn('size-4 text-faint transition-transform duration-base rtl:-scale-x-100', record && 'rotate-90')} />Record<span className="font-normal text-faint">problems, medicines, allergies, results, visits</span></button>}
        {(wide || record) && <ChartGlance patientId={g.patient.id} />}
      </aside>}
      <div className="grid min-w-0 content-start gap-4">
      {bySection.map((sec) => <section key={sec}><Heading className="mb-1.5">{sec}</Heading><div className="grid gap-3">
        {g.rows.filter((r) => (r.section_name ?? 'Other') === sec).map((r) => { const x = e(r.id); const fields = fieldsOf(r); const held = !free(r); const or = orderRow(r)
          const mayWork = can(formOf(r)?.action ?? 'write:result') || nextSteps([r], org, can).length > 0
          return <Card key={r.id} className={cn('p-4', (x.notDone || held) && 'bg-sunken')}>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-16 font-semibold">{r.type === 'request' ? (r.service_name ?? r.display_line) : r.display_line}</span>
            <Badge tone={STEP_TONE[r.request?.step ?? 'sent'] ?? 'neutral'}>{stepLabel(r.request?.step)}</Badge>
            {r.request?.priority !== 'routine' && <Badge tone="danger">{r.request?.priority}</Badge>}
            <span className="text-12 text-faint">{r.requester_name} · {r.from_department_name} · {hm(r.occurred_at)}</span>
            {held && <Tag tone={packs.waits.get(r.order.item)?.tone ?? 'warn'}>{packs.waits.get(r.order.item)?.word}</Tag>}
            {held && mayWork && packs.anyway(or, [r.order.item], 'Go ahead')}
            {!formOf(r) && <label className="ms-auto flex items-center gap-1.5 text-12 text-muted"><input type="checkbox" checked={x.notDone} onChange={(ev) => set(r.id, { notDone: ev.target.checked })} />not done</label>}
          </div>
          {r.question_text && <p className="mb-2 rounded-md bg-warn-soft px-2.5 py-1.5 text-14 text-warn">“{r.question_text}”</p>}
          {packs.below(or)}
          <fieldset disabled={held && !x.notDone && !formOf(r)} className="contents">
          {formOf(r) ? (() => { const F = formOf(r)!.Editor; return <F request={r} value={packVals[r.id]} onChange={(v) => setPackVals((p) => ({ ...p, [r.id]: v }))} /> })()
          : x.notDone ? <Input data-v value={x.reason} onChange={(ev) => set(r.id, { reason: ev.target.value })} placeholder="Why not — haemolysed, insufficient sample, patient left…" /> : <>
            {fields.length > 0 && <table className="w-full text-14"><tbody>{fields.map((f) => { const raw = x.vals[f.key] ?? ''; const fl = flagOf(f, raw); return <tr key={f.key} className="border-b border-line last:border-0">
              <td className="w-56 py-1 pe-3 text-muted">{f.name}</td>
              <td className="w-36 py-1">{f.kind === 'choice' && f.choices ? <Select data-v="" value={raw} onChange={(ev) => set(r.id, { vals: { ...x.vals, [f.key]: ev.target.value } })} className="h-8">{['', ...f.choices].map((o) => <option key={o} value={o}>{o || '—'}</option>)}</Select>
                : <Input data-v inputMode={f.kind === 'number' ? 'decimal' : undefined} autoComplete="off" value={raw} onFocus={(ev) => ev.target.select()} onChange={(ev) => { setChecked(false); set(r.id, { vals: { ...x.vals, [f.key]: f.kind === 'number' ? ev.target.value.replace(',', '.').replace(/[^\d.-]/g, '') : ev.target.value } }) }}
                    tone={problemOf(f, raw) ? 'danger' : fieldTone(fl)} aria-invalid={!!problemOf(f, raw) || undefined} className={cn('h-8 text-end font-medium tnum', problemOf(f, raw) && 'ring-2 ring-danger-line', flagClass(fl))} />}</td>
              <td className="w-20 py-1 ps-2 text-12 text-faint">{f.unit}</td>
              <td className="py-1 text-12 text-faint tnum">{f.reference_low != null || f.reference_high != null ? `${f.reference_low ?? ''} – ${f.reference_high ?? ''}` : ''}</td>
              <td className="w-24 py-1 text-end text-12 font-semibold">{problemOf(f, raw) ? <span className="text-danger">{problemOf(f, raw)}</span> : fl && fl !== 'normal' && <span className={flagClass(fl)}>{fl === 'low' ? '↓ low' : fl === 'high' ? '↑ high' : fl === 'critical' ? '‼ critical' : fl}</span>}</td>
            </tr> })}</tbody></table>}
            <Input data-v value={x.text} onChange={(ev) => set(r.id, { text: ev.target.value })} placeholder={fields.length ? 'Comment (optional)' : 'Report / answer'} className="mt-2 h-8" />
          </>}
          </fieldset>
        </Card> })}
      </div></section>)}
      </div>
    </div>

    <Toolbar position="bottom" inner={width}>
      <span className="text-14 text-muted tnum">{ready.length} of {g.rows.length} ready{flagged.length > 0 && <span className="ms-2 font-medium text-warn">· {flagged.length} abnormal{flagged.includes('critical') && <b className="ms-1 text-danger">· critical</b>}</span>}</span>
      {g.rows.some((r) => !formOf(r)) && <label className="flex items-center gap-1.5 text-12 text-muted"><input type="checkbox" checked={prelim} onChange={(ev) => setPrelim(ev.target.checked)} />preliminary</label>}
      {err && <span className="text-14 text-danger">{err}</span>}
      <span className="ms-auto text-11 text-faint"><Kbd>↵</Kbd> next field</span>
      <Button onClick={release} disabled={busy || !ready.length || invalid || !ready.every((r) => can(formOf(r)?.action ?? 'write:result'))}>Release {ready.length || ''}{ready.length === g.rows.length && next && dept.after_done !== 'queue' ? ' → next patient' : ''}<Kbd className="ms-1">⌘↵</Kbd></Button>
    </Toolbar>
  </div>
}

/** Correct a released result: the same grid, filled with what was released; the correction replaces it (spec 01), the record keeps both,
 *  and the requesting doctor is asked to look again (amendments 2026-09-23 · 6). */
export function BenchCorrect() {
  const { requestId } = useParams(); const navigate = useNavigate(); const qc = useQueryClient()
  const { org, dept, can } = useDepartment()
  const q = useRequestQueue(dept?.id ?? null)
  const row = q.data?.recent.find((r) => r.id === requestId)
  const svc = org?.services.find((s) => s.id === row?.service_id)
  const fields = (svc?.fields ?? []).map((f) => fitField(f, row?.patient.sex ?? '', row ? ageOf(row.patient.born_on) : 0))
  const old = ((row?.reply?.data.analytes as { key: string; value?: { value: string }; text?: string }[] | undefined) ?? []).map((a) => ({ code: a.key, value_number: a.value ? Number(a.value.value) : undefined, value_text: a.text }))
  const [vals, setVals] = useState<Record<string, string> | null>(null); const [text, setText] = useState<string | null>(null); const [why, setWhy] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  const said = String(row?.reply?.data.conclusion ?? row?.reply?.data.text ?? '')
  const v = vals ?? Object.fromEntries(old.map((x) => [x.code, String(x.value_number ?? x.value_text ?? '')]))
  const t = text ?? said
  const invalid = fields.some((f) => problemOf(f, v[f.key] ?? '') === 'not a number')
  const changed = fields.some((f) => (v[f.key] ?? '') !== String(old.find((x) => x.code === f.key)?.value_number ?? old.find((x) => x.code === f.key)?.value_text ?? '')) || t !== said
  async function save() {
    if (!row?.reply || !dept || invalid || !changed || !why.trim()) return; setBusy(true); setErr(null)
    try {
      // the correction is the next version of the released result: it replaces it; the requester is asked to look again
      await write(oneSet([resultEntry(row, dept.id, fields, v, [t.trim(), `Corrected: ${why.trim()}`].filter(Boolean).join('\n'), true, row.reply.id)]))
      refresh(qc); navigate('/')
    } catch (x) { setErr(errorText(x)) } finally { setBusy(false) }
  }
  if (!dept || q.isLoading) return <Centered><Spinner label="Opening" /></Centered>
  if (!row) return <Centered><div className="text-center text-14 text-faint"><p>This result is no longer in the last day’s list.</p><Button className="mt-3" variant="outline" onClick={() => navigate('/')}>Back to the bench</Button></div></Centered>
  return <div className="mx-auto grid max-w-3xl gap-4 p-4" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save() } }}>
    <div className="flex items-center gap-3"><IconButton size="md" onClick={() => navigate('/')} title="Back to the bench" aria-label="Back to the bench"><ArrowLeft className="rtl:-scale-x-100" /></IconButton>
      <div><p className="text-18 font-semibold tracking-tight">Correct: {row.service_name}</p><p className="text-12 text-faint tnum">#{row.patient.record_number} · {row.patient.given_name} {row.patient.family_name} · released {(row.reply ? hm(row.reply.recorded_at) : '')} by {row.reply?.author_name}</p></div></div>
    <Callout tone="warn" role="status">The corrected result replaces the released one. The record keeps both, and the requesting doctor gets it on their review list.</Callout>
    <Card className="p-4">
      {fields.length > 0 && <table className="w-full text-14"><thead><tr className="text-start text-11 uppercase tracking-wider text-faint"><th className="font-medium">Field</th><th className="font-medium">Released</th><th className="font-medium">Corrected</th><th /><th /></tr></thead><tbody>{fields.map((f) => { const raw = v[f.key] ?? ''; const fl = flagOf(f, raw); const was = old.find((x) => x.code === f.key); return <tr key={f.key} className="border-b border-line last:border-0">
        <td className="w-48 py-1 pe-3 text-muted">{f.name}</td><td className="w-28 py-1 text-faint line-through tnum">{was?.value_number ?? was?.value_text ?? '—'}</td>
        <td className="w-36 py-1"><Input inputMode={f.kind === 'number' ? 'decimal' : undefined} value={raw} onFocus={(e) => e.target.select()} onChange={(e) => setVals({ ...v, [f.key]: f.kind === 'number' ? e.target.value.replace(',', '.').replace(/[^\d.-]/g, '') : e.target.value })} tone={fieldTone(fl)} className={cn('h-8 text-end font-medium tnum', flagClass(fl))} /></td>
        <td className="w-20 py-1 ps-2 text-12 text-faint">{f.unit}</td><td className="py-1 text-12 text-faint tnum">{f.reference_low ?? ''} – {f.reference_high ?? ''}</td></tr> })}</tbody></table>}
      <Input value={t} onChange={(e) => setText(e.target.value)} placeholder={fields.length ? 'Comment' : 'Report'} className="mt-2 h-8" />
      <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why the correction — transcription error, wrong sample…" className="mt-2 h-8 border-warn-line" />
    </Card>
    <div className="flex items-center gap-2">{err && <span className="text-14 text-danger">{err}</span>}<span className="ms-auto text-11 text-faint"><Kbd>⌘↵</Kbd> release the correction</span>
      <Button onClick={save} disabled={busy || invalid || !changed || !why.trim() || !can('write:result')}>Release correction</Button></div>
  </div>
}
