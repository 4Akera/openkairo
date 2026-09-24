import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Lock, X } from 'lucide-react'
import { rpc } from '../../db/rpc'
import { useEntries, useEntry, useResultsTable, useVisits } from '../../hooks/reads'
import type { Card as EntryCard, RecordView, ResultRow, Value, VisitCardRow } from '../../db/types'
import { Badge, Button, Card, Heading, IconButton, Input, Kbd, Spinner, cn, errorText, flagClass, hm, ymd, dateTime } from '../../ui'
import { CardLine, FallbackFull } from '../../renderers'

const KEY_TESTS = ['loinc:4548-4', 'loinc:2160-0', 'loinc:718-7', 'loinc:2089-1', 'loinc:8480-6', 'loinc:8462-4', 'loinc:29463-7']
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const COUNT_WORD: Record<string, string> = { note: 'note', request: 'request', prescription: 'prescription', vitals: 'vitals', problem: 'problem', allergy: 'allergy', list_review: 'review' }
/** when a visit last changed: the time today, else the date */
const when = (iso: string) => ymd(iso) === ymd(new Date().toISOString()) ? hm(iso) : day(iso)

/** The record (spec 07): what needs attention on top, then the record the way this department shows it — by visit (newest activity first)
 *  or every entry — with no filters; results over time one tap away; any entry opens in full. */
export function RecordViews({ r, patientId, departmentId, view }: { r: RecordView; patientId: string; departmentId: string; view: 'visits' | 'entries' }) {
  const [results, setResults] = useState(false)
  const [params, setParams] = useSearchParams()
  const openId = params.get('entry')
  const openEntry = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set('entry', id); else p.delete('entry'); setParams(p, { replace: true }) }
  const [anyway, setAnyway] = useState<VisitCardRow | null>(null)
  const attention = useMemo(() => [...r.open_requests, ...r.entries.filter((c) => c.request?.review_needed_at && c.request.status !== 'open')], [r])
  return <section className="grid gap-3">
    {attention.length > 0 && <Card className="overflow-hidden ring-1 ring-amber-200"><Heading tone="muted" count={attention.length} className="border-b border-amber-100 bg-amber-50/60 px-3.5 py-2">Needs attention</Heading>
      <ul className="divide-y divide-neutral-100">{attention.map((c) => <li key={c.id}><Row card={c} onOpen={openEntry} /></li>)}</ul></Card>}

    <Heading right={<button onClick={() => setResults(!results)} className={cn('rounded-md px-2.5 py-1 text-xs ring-1 ring-inset', results ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-neutral-600 ring-neutral-200 hover:ring-neutral-400')}>{results ? 'Back to the record' : 'Results over time'}</button>}>
      {results ? 'Results over time' : 'Record'}</Heading>

    {results ? <ResultsOverTime patientId={patientId} onOpen={openEntry} />
      : view === 'entries' ? <AllEntries patientId={patientId} onOpen={openEntry} />
      : <ByVisit r={r} patientId={patientId} departmentId={departmentId} onOpen={openEntry} onAnyway={setAnyway} />}
    {openId && <EntryPanel id={openId} onClose={() => openEntry(null)} />}
    {anyway && <OpenAnyway visit={anyway} patientId={patientId} departmentId={departmentId} onClose={() => setAnyway(null)} />}
  </section>
}

function Row({ card, onOpen }: { card: EntryCard; onOpen: (id: string) => void }) {
  return <button onClick={() => onOpen(card.id)} className={cn('block w-full px-3.5 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:bg-teal-50 focus-visible:outline-none', card.is_hidden && 'text-neutral-400')}>
    {card.is_hidden ? <span className="flex items-center gap-3 text-[13.5px]"><span className="w-10 text-xs tnum">{hm(card.occurred_at)}</span><Lock className="h-3.5 w-3.5" /><span className="italic">Private note</span></span> : <CardLine card={card} />}
  </button>
}

function ByVisit({ r, patientId, departmentId, onOpen, onAnyway }: { r: RecordView; patientId: string; departmentId: string; onOpen: (id: string) => void; onAnyway: (v: VisitCardRow) => void }) {
  const q = useVisits(patientId)
  if (q.isLoading) return <Spinner label="Loading visits" />
  if (q.error) return <p className="text-sm text-red-700">{errorText(q.error)}</p>
  const visits = q.data?.visits ?? []           // newest activity first (server)
  const lastHere = visits.find((v) => v.department_id === departmentId && v.id !== r.visit?.id)?.id
  if (!visits.length && !q.data?.between) return <Card className="p-6 text-center text-sm text-neutral-400">No visits yet — this is the first.</Card>
  return <div className="grid gap-2">
    {visits.map((v) => <VisitCard key={v.id} v={v} patientId={patientId} startOpen={v.id === r.visit?.id || v.id === lastHere} current={v.id === r.visit?.id} onOpen={onOpen} onAnyway={onAnyway} />)}
    {(q.data?.between ?? 0) > 0 && <VisitCard v={null} patientId={patientId} startOpen={false} current={false} count={q.data!.between} onOpen={onOpen} onAnyway={onAnyway} />}
  </div>
}

function VisitCard({ v, patientId, startOpen, current, count, onOpen, onAnyway }: { v: VisitCardRow | null; patientId: string; startOpen: boolean; current: boolean; count?: number; onOpen: (id: string) => void; onAnyway: (v: VisitCardRow) => void }) {
  const [open, setOpen] = useState(startOpen)
  const q = useEntries(open ? { patient_id: patientId, visit_ids: v ? [v.id] : null, between_visits: !v, limit: 200 } : null)
  const counts = v ? Object.entries(v.counts).filter(([k]) => k !== 'list_review').map(([k, n]) => `${n} ${COUNT_WORD[k] ?? k.replace(/_/g, ' ')}${n > 1 && !k.endsWith('s') ? 's' : ''}`).join(' · ') : `${count} entries`
  return <Card className={cn('overflow-hidden', current && 'ring-1 ring-teal-300')}>
    <button onClick={() => setOpen(!open)} className={cn('block w-full px-3.5 py-2.5 text-left hover:bg-neutral-50', open && 'border-b border-neutral-100')}>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:flex-nowrap">
      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />}
      {v ? <>
        <span className="w-24 shrink-0 text-sm font-medium tnum">{day(v.arrived_at)}</span>
        <span className="flex items-center gap-1.5 text-sm font-medium">{v.is_hidden && <Lock className="h-3.5 w-3.5 text-neutral-400" />}{v.department_name}</span>
        {v.is_private && !v.is_hidden && <Badge tone="neutral"><Lock className="mr-1 h-3 w-3" />private</Badge>}
        {current && <Badge tone="brand">today</Badge>}
        {v.assignee_name && <span className="min-w-0 truncate text-xs text-neutral-500">{v.assignee_name}</span>}
        <span className="text-xs text-neutral-400">{v.status.replace('_', ' ')}</span>
        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-neutral-500">{counts}</span>
        <span className="shrink-0 whitespace-nowrap text-right text-[11px] text-neutral-400 tnum" title="last updated">{when(v.last_activity_at)}</span>

      </> : <><span className="text-sm font-medium">Between visits</span><span className="ml-auto text-xs text-neutral-500">{counts}</span></>}
      </span>
      {v?.first_line && !open && <span className="mt-0.5 block truncate pl-7 text-xs text-neutral-500">{v.first_line}</span>}
    </button>
    {open && v?.is_hidden && <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50 px-3.5 py-2 text-xs text-neutral-600"><Lock className="h-3.5 w-3.5" />The notes of this visit are private. Prescriptions, results and requests show below.
      <Button size="sm" variant="outline" className="ml-auto" onClick={() => onAnyway(v)}>Open anyway</Button></div>}
    {open && (q.isLoading ? <div className="p-3"><Spinner /></div> : (q.data ?? []).length === 0 ? <p className="px-3.5 py-2.5 text-xs text-neutral-400">Nothing written in this visit yet.</p>
      : <ul className="divide-y divide-neutral-100">{q.data!.map((c) => <li key={c.id}><Row card={c} onOpen={onOpen} /></li>)}</ul>)}
  </Card>
}

function AllEntries({ patientId, onOpen }: { patientId: string; onOpen: (id: string) => void }) {
  const [pages, setPages] = useState<{ before_at: string | null; before_id: string | null }[]>([{ before_at: null, before_id: null }])
  return <Card className="overflow-hidden"><ul className="divide-y divide-neutral-100">
    {pages.map((p, i) => <Page key={`${i}:${p.before_id}`} q={{ patient_id: patientId, before_at: p.before_at, before_id: p.before_id, limit: 100 }} onOpen={onOpen}
      onMore={i === pages.length - 1 ? (last) => setPages([...pages, { before_at: last.occurred_at, before_id: last.id }]) : undefined} />)}
  </ul></Card>
}
function Page({ q, onOpen, onMore }: { q: Parameters<typeof useEntries>[0]; onOpen: (id: string) => void; onMore?: (last: EntryCard) => void }) {
  const r = useEntries(q)
  if (r.isLoading) return <li className="p-3"><Spinner /></li>
  const rows = r.data ?? []
  return <>{rows.map((c, i) => { const head = i === 0 || ymd(c.occurred_at) !== ymd(rows[i - 1].occurred_at); return <li key={c.id}>
    {head && <p className="bg-neutral-50/80 px-3.5 py-1 text-[11px] font-medium text-neutral-500">{day(c.occurred_at)}</p>}<Row card={c} onOpen={onOpen} /></li> })}
    {rows.length === 0 && !q?.before_id && <li className="p-6 text-center text-sm text-neutral-400">Nothing here yet.</li>}
    {onMore && rows.length >= (q?.limit ?? 100) && <li className="p-2 text-center"><Button size="sm" variant="ghost" onClick={() => onMore(rows[rows.length - 1])}>Earlier</Button></li>}</>
}

function ResultsOverTime({ patientId, onOpen }: { patientId: string; onOpen: (id: string) => void }) {
  const q = useResultsTable(patientId); const [graph, setGraph] = useState<string | null>(null)
  if (q.isLoading) return <Spinner label="Loading results" />
  const rows = [...(q.data ?? [])].sort((a, b) => { const ia = KEY_TESTS.indexOf(a.code), ib = KEY_TESTS.indexOf(b.code); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) })
  if (!rows.length) return <Card className="p-6 text-center text-sm text-neutral-400">No results or vitals recorded yet.</Card>
  const dates = [...new Set(rows.flatMap((t) => t.points.map((p) => ymd(p.at))))].sort().reverse().slice(0, 8)
  return <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]">
    <thead><tr className="border-b border-neutral-100 text-left text-[11px] text-neutral-500"><th className="sticky left-0 bg-white px-3.5 py-2 font-medium">Test</th>{dates.map((d) => <th key={d} className="px-2 py-2 text-right font-medium tnum">{day(d + 'T00:00')}</th>)}</tr></thead>
    <tbody>{rows.map((t) => <ResultRowView key={t.code} t={t} dates={dates} open={graph === t.code} onToggle={() => setGraph(graph === t.code ? null : t.code)} onOpen={onOpen} />)}</tbody>
  </table></Card>
}
function ResultRowView({ t, dates, open, onToggle, onOpen }: { t: ResultRow; dates: string[]; open: boolean; onToggle: () => void; onOpen: (id: string) => void }) {
  return <>
    <tr className="border-b border-neutral-100 hover:bg-neutral-50">
      <td className="sticky left-0 bg-white px-3.5 py-1.5"><button onClick={onToggle} className="text-left"><span className="font-medium">{t.name}</span>{t.unit && <span className="ml-1 text-xs text-neutral-400">{t.unit}</span>}</button></td>
      {dates.map((d) => { const p = t.points.find((x) => ymd(x.at) === d); return <td key={d} className="px-2 py-1.5 text-right tnum">
        {p && <button onClick={() => onOpen(p.entry_id)} className={cn('rounded px-1', p.flag && p.flag !== 'normal' ? flagClass(p.flag) + ' font-semibold' : 'text-neutral-800')} title={p.corrected ? 'corrected' : undefined}>
          {p.value_number ?? p.value_text}{p.flag === 'high' ? '↑' : p.flag === 'low' ? '↓' : p.flag === 'critical' ? '‼' : ''}{p.corrected && <sup className="text-amber-700">c</sup>}</button>}</td> })}
    </tr>
    {open && <tr className="border-b border-neutral-100"><td colSpan={dates.length + 1} className="px-3.5 py-2"><Spark points={t.points} /></td></tr>}
  </>
}
function Spark({ points }: { points: ResultRow['points'] }) {
  const ps = points.filter((p) => p.value_number != null).slice().reverse()
  if (ps.length < 2) return <p className="text-xs text-neutral-400">Not enough values for a graph.</p>
  const W = 560, H = 90, xs = ps.map((p) => new Date(p.at).getTime()), ys = ps.map((p) => p.value_number!)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const X = (x: number) => 12 + (W - 24) * (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)), Y = (y: number) => H - 14 - (H - 28) * (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0))
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full max-w-xl text-teal-700" role="img" aria-label="trend">
    <polyline fill="none" stroke="currentColor" strokeWidth="2" points={ps.map((_, i) => `${X(xs[i])},${Y(ys[i])}`).join(' ')} />
    {ps.map((p, i) => <g key={i}><circle cx={X(xs[i])} cy={Y(ys[i])} r="3.5" className={p.flag && p.flag !== 'normal' ? 'fill-amber-600' : 'fill-teal-700'} />
      <text x={X(xs[i])} y={Y(ys[i]) - 7} textAnchor="middle" className="fill-neutral-600 text-[10px]">{p.value_number}</text></g>)}
  </svg>
}

/** an entry in full, beside the record: text, values, request and replies, steps, earlier versions */
function EntryPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useEntry(id)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const e = q.data
  return <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-neutral-200 bg-white shadow-2xl">
    <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3"><span className="text-sm font-semibold capitalize">{e?.type.replace(/_/g, ' ') ?? 'Entry'}</span>
      {e && <span className="text-xs text-neutral-500 tnum">{day(e.occurred_at)} {hm(e.occurred_at)} · {e.author_name ?? '—'} · {e.department_name}</span>}
      <span className="ml-auto flex items-center gap-2 text-[11px] text-neutral-400"><Kbd>esc</Kbd><IconButton title="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton></span></div>
    <div className="flex-1 overflow-y-auto p-4">
      {q.isLoading ? <Spinner /> : q.error ? <p className="text-sm text-red-700">{errorText(q.error)}</p> : e && <div className="grid gap-4">
        {e.is_hidden ? <p className="flex items-center gap-2 text-sm text-neutral-500"><Lock className="h-4 w-4" />A note from a private visit. Open the visit anyway from the record to read it.</p> : <>
          <p className={cn('text-[15px] font-medium', e.replaced_by_id && 'line-through text-neutral-400')}>{e.display_line}</p>
          {e.replaced_by_id && <Badge tone="amber">replaced by a correction</Badge>}
          <FallbackFull card={e} data={e.data} />
          {e.request && <Section title="Request"><p className="text-sm">To {e.request.to_department_name ?? 'outside'} · <b>{e.request.step}</b>{e.request.priority !== 'routine' && <Badge tone="red" className="ml-1.5">{e.request.priority}</Badge>}</p></Section>}
          {e.replies.length > 0 && <Section title="Replies">{e.replies.map((x) => <div key={x.id} className="rounded-lg bg-neutral-50 p-2.5"><p className="mb-1 text-xs text-neutral-500">{x.author_name} · {day(x.occurred_at)} {hm(x.occurred_at)}{!x.is_final && <b className="ml-1 text-amber-700">preliminary</b>}</p>
            {x.is_hidden ? <p className="text-sm italic text-neutral-400">Private note</p> : <FallbackFull card={x} data={x.data} />}</div>)}</Section>}
          {e.steps.length > 0 && <Section title="Steps"><ol className="text-xs text-neutral-600">{e.steps.map((s, i) => <li key={i} className="tnum">{dateTime(s.recorded_at)} · {s.step}{s.reason ? ` · ${s.reason}` : ''}</li>)}</ol></Section>}
          {e.versions.length > 0 && <Section title="Other versions">{e.versions.map((x) => <div key={x.id} className="rounded-lg bg-neutral-50 p-2.5 text-sm"><p className="mb-1 text-xs text-neutral-500 tnum">{dateTime(x.recorded_at)} · {x.author_name}{x.replaced_by_id ? ' · replaced' : ' · current'}</p>
            <p className={x.replaced_by_id ? 'text-neutral-500 line-through' : ''}>{x.display_line}</p>{Array.isArray(x.data?.values) ? <div className="mt-1"><FallbackFull card={x} data={{ values: x.data!.values as Value[] }} /></div> : null}</div>)}</Section>}
        </>}
      </div>}
    </div>
  </div>
}
const Section = ({ title, children }: { title: string; children: ReactNode }) => <div><Heading className="mb-1.5">{title}</Heading><div className="grid gap-2">{children}</div></div>

/** open a private visit anyway: a reason, one tap for an emergency; logged, and open for 12 hours */
function OpenAnyway({ visit, patientId, departmentId, onClose }: { visit: VisitCardRow; patientId: string; departmentId: string; onClose: () => void }) {
  const qc = useQueryClient(); const [reason, setReason] = useState<string | null>(null); const [other, setOther] = useState('')
  const go = useMutation({ mutationFn: (why: string) => rpc('read_record', { patient_id: patientId, department_id: departmentId, open_visit_id: visit.id, reason: why }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['record'] }); onClose() } })
  const why = reason === 'Other' ? other.trim() : reason
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={onClose}>
    <Card className="w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}>
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Lock className="h-4 w-4" />Open a private visit</h2>
      <p className="mb-4 text-sm text-neutral-600">Private visit of {day(visit.arrived_at)}. Its notes open for you for 12 hours. Your name, the time and your reason are recorded and reviewed.</p>
      <div className="grid gap-1.5">{['Direct care', 'Emergency', 'Admin', 'Other'].map((r) => <label key={r} className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset', reason === r ? 'bg-teal-50 ring-teal-300' : 'ring-neutral-200 hover:bg-neutral-50')}>
        <input type="radio" name="why" checked={reason === r} onChange={() => { setReason(r); if (r === 'Emergency') go.mutate('Emergency') }} />{r}{r === 'Emergency' && <span className="ml-auto text-xs text-neutral-400">opens at once</span>}</label>)}</div>
      {reason === 'Other' && <Input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="A few words" className="mt-2" />}
      {go.error && <p className="mt-2 text-sm text-red-700">{errorText(go.error)}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => why && go.mutate(why)} disabled={!why || go.isPending}>Open</Button></div>
    </Card>
  </div>
}
