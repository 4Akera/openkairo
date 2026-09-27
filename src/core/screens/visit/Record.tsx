import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Lock, X } from 'lucide-react'
import { write } from '../../db/rpc'
import { newId, oneSet } from '../../db/entries'
import { useEntries, useEntry, useOpened, useResultsTable } from '../../hooks/reads'
import { useDepartment } from '../../hooks/organization'
import { refresh } from '../../hooks/writes'
import type { Card as EntryCard, Entry, RecordView, ResultRow, Value, VisitCardRow } from '../../db/types'
import type { EntryData } from '../../db/shapes.generated'
import { Badge, Button, Card, Heading, IconButton, Input, Kbd, Spinner, cn, errorText, flagClass, hm, ymd, dateTime, longDate } from '../../ui'
import { CardLine, FallbackFull } from '../../renderers'
import { KEY_TESTS } from './kinds'

const day = (iso: string) => longDate(iso.length === 10 ? iso + 'T12:00:00Z' : iso)
const COUNT_WORD: Record<string, string> = { note: 'note', request: 'request', prescription: 'prescription', vitals: 'vitals', problem: 'problem', allergy: 'allergy', list_review: 'review' }
/** when a visit last changed: the time today, else the date */
const when = (iso: string) => ymd(iso) === ymd(new Date().toISOString()) ? hm(iso) : day(iso)

// the patient and the department the record is read from, for a private note's inline Open anyway
const Where = createContext<{ patientId: string; departmentId: string }>({ patientId: '', departmentId: '' })

/** The record (spec 07): what needs attention on top, then the record the way this department shows it — by visit (newest activity first)
 *  or every entry — with no filters; results over time one tap away; any entry opens in full. */
export function RecordViews({ r, patientId, departmentId, view }: { r: RecordView; patientId: string; departmentId: string; view: 'visits' | 'entries' }) {
  const [params, setParams] = useSearchParams()
  // the full results table is ?view=results, so the Key results box beside the record can open it
  const results = params.get('view') === 'results'
  const setResults = (on: boolean) => { const p = new URLSearchParams(params); if (on) p.set('view', 'results'); else p.delete('view'); setParams(p, { replace: true }) }
  const openId = params.get('entry')
  const openEntry = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set('entry', id); else p.delete('entry'); setParams(p, { replace: true }) }
  const attention = useMemo(() => [...r.open_requests, ...r.entries.filter((c) => c.request?.review_needed_at && c.request.status !== 'open')], [r])
  return <Where.Provider value={{ patientId, departmentId }}><section className="grid gap-3">
    {r.hidden_departments.length > 0 && <PrivateNotes r={r} patientId={patientId} departmentId={departmentId} />}
    {attention.length > 0 && <Card className="overflow-hidden ring-1 ring-warn-line"><Heading tone="muted" count={attention.length} className="border-b border-warn-line bg-warn-soft/60 px-3.5 py-2">Needs attention</Heading>
      <ul className="divide-y divide-line">{attention.map((c) => <li key={c.id}><Row card={c} onOpen={openEntry} /></li>)}</ul></Card>}

    {/* the full table opens from Key results beside the record; here only the way back */}
    <Heading right={results && <button onClick={() => setResults(false)} className="rounded-md bg-accent px-2.5 py-1 text-12 text-accent-fg ring-1 ring-inset ring-accent">Back to the record</button>}>
      {results ? 'Results over time' : 'Record'}</Heading>

    {results ? <ResultsOverTime patientId={patientId} onOpen={openEntry} />
      : view === 'entries' ? <AllEntries patientId={patientId} onOpen={openEntry} />
      : <ByVisit r={r} patientId={patientId} departmentId={departmentId} onOpen={openEntry} />}
    {openId && <EntryPanel id={openId} onClose={() => openEntry(null)} />}
  </section></Where.Provider>
}

function Row({ card, onOpen }: { card: EntryCard; onOpen: (id: string) => void }) {
  const where = useContext(Where); const [anyway, setAnyway] = useState(false)
  if (card.is_hidden) return <div>
    <button onClick={() => setAnyway(!anyway)} aria-expanded={anyway} className="block w-full px-3.5 py-2 text-left text-faint transition-colors hover:bg-hover focus-visible:bg-accent-soft focus-visible:outline-none">
      <span className="flex items-center gap-3 text-13"><span className="w-10 text-12 tnum">{hm(card.occurred_at)}</span><Lock className="h-3.5 w-3.5" /><span className="italic">Private note</span>
        <span className="text-12 not-italic">{card.department_name}</span><span className="ml-auto text-12 text-faint">Open anyway</span></span></button>
    {anyway && card.department_id && <OpenAnyway patientId={where.patientId} departmentId={where.departmentId} openDepartmentId={card.department_id} onDone={() => setAnyway(false)} />}
  </div>
  return <button onClick={() => onOpen(card.id)} className="block w-full px-3.5 py-2 text-left transition-colors hover:bg-hover focus-visible:bg-accent-soft focus-visible:outline-none">
    <CardLine card={card} />
  </button>
}

function ByVisit({ r, patientId, departmentId, onOpen }: { r: RecordView; patientId: string; departmentId: string; onOpen: (id: string) => void }) {
  const { org } = useDepartment()
  // newest activity first; the counts are of what the record's first page holds for each visit
  const counts = (id: string) => r.entries.filter((e) => e.visit_id === id).reduce<Record<string, number>>((m, e) => ({ ...m, [e.type]: (m[e.type] ?? 0) + 1 }), {})
  const visits: VisitCardRow[] = r.visits.map((v) => ({ id: v.id, is_hidden: false, department_id: v.department_id, department_name: org?.allDepartments.find((d) => d.id === v.department_id)?.name ?? '',
    assignee_name: org?.users.find((u) => u.id === (v.assignee_id ?? v.presence.seen_by))?.name ?? null, status: v.status, is_first: v.is_first, arrived_at: v.arrived_at, seen_at: v.seen_at, ended_at: v.ended_at,
    last_activity_at: v.presence.last_at, counts: counts(v.id), first_line: v.presence.reason }))
  const between = r.entries.filter((e) => !e.visit_id).length
  const lastHere = visits.find((v) => v.department_id === departmentId && v.id !== r.visit?.id)?.id
  if (!visits.length && !between) return <Card className="p-6 text-center text-14 text-faint">Nothing in the record yet.</Card>
  return <div className="grid gap-2">
    {visits.map((v) => <VisitCard key={v.id} v={v} patientId={patientId} startOpen={v.id === r.visit?.id || v.id === lastHere} current={v.id === r.visit?.id} onOpen={onOpen} />)}
    {between > 0 && <VisitCard v={null} patientId={patientId} startOpen={false} current={false} count={between} onOpen={onOpen} between={r.entries.filter((e) => !e.visit_id)} />}
  </div>
}

function VisitCard({ v, patientId, startOpen, current, count, onOpen, between }: { v: VisitCardRow | null; patientId: string; startOpen: boolean; current: boolean; count?: number; onOpen: (id: string) => void; between?: EntryCard[] }) {
  const [open, setOpen] = useState(startOpen)
  const fetched = useEntries(open && v ? { patient_id: patientId, visit_ids: [v.id], limit: 200 } : null)
  const q = v ? fetched : { isLoading: false, data: between ?? [] }
  const counts = v ? Object.entries(v.counts).filter(([k]) => k !== 'list_review').map(([k, n]) => `${n} ${COUNT_WORD[k] ?? k.replace(/_/g, ' ')}${n > 1 && !k.endsWith('s') ? 's' : ''}`).join(' · ') : `${count} entries`
  return <Card className={cn('overflow-hidden', current && 'ring-1 ring-accent-line')}>
    <button onClick={() => setOpen(!open)} className={cn('block w-full px-3.5 py-2.5 text-left hover:bg-hover', open && 'border-b border-line')}>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 sm:flex-nowrap">
      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-faint" /> : <ChevronRight className="h-4 w-4 shrink-0 text-faint" />}
      {v ? <>
        <span className="w-24 shrink-0 text-14 font-medium tnum">{day(v.arrived_at)}</span>
        <span className="flex items-center gap-1.5 text-14 font-medium">{v.is_hidden && <Lock className="h-3.5 w-3.5 text-faint" />}{v.department_name}</span>
        {current && <Badge tone="brand">today</Badge>}
        {v.assignee_name && <span className="min-w-0 truncate text-12 text-faint">{v.assignee_name}</span>}
        <span className="text-12 text-faint">{v.status.replace('_', ' ')}</span>
        <span className="ml-auto shrink-0 whitespace-nowrap text-12 text-faint">{counts}</span>
        <span className="shrink-0 whitespace-nowrap text-right text-11 text-faint tnum" title="last updated">{when(v.last_activity_at)}</span>

      </> : <><span className="text-14 font-medium">Between visits</span><span className="ml-auto text-12 text-faint">{counts}</span></>}
      </span>
      {v?.first_line && !open && <span className="mt-0.5 block truncate pl-7 text-12 text-faint">{v.first_line}</span>}
    </button>
    {open && v?.is_hidden && <p className="flex items-center gap-2 border-b border-line bg-sunken px-3.5 py-2 text-12 text-muted"><Lock className="h-3.5 w-3.5" />Some notes here are private. Everything else shows below; the notes open from the top of the record.</p>}
    {open && (q.isLoading ? <div className="p-3"><Spinner /></div> : (q.data ?? []).length === 0 ? <p className="px-3.5 py-2.5 text-12 text-faint">Nothing written in this visit yet.</p>
      : <ul className="divide-y divide-line">{q.data!.map((c) => <li key={c.id}><Row card={c} onOpen={onOpen} /></li>)}</ul>)}
  </Card>
}

function AllEntries({ patientId, onOpen }: { patientId: string; onOpen: (id: string) => void }) {
  const [pages, setPages] = useState<{ before_at: string | null; before_id: string | null }[]>([{ before_at: null, before_id: null }])
  return <Card className="overflow-hidden"><ul className="divide-y divide-line">
    {pages.map((p, i) => <Page key={`${i}:${p.before_id}`} q={{ patient_id: patientId, before_at: p.before_at, before_id: p.before_id, limit: 100 }} onOpen={onOpen}
      onMore={i === pages.length - 1 ? (last) => setPages([...pages, { before_at: last.recorded_at, before_id: last.id }]) : undefined} />)}
  </ul></Card>
}
function Page({ q, onOpen, onMore }: { q: Parameters<typeof useEntries>[0]; onOpen: (id: string) => void; onMore?: (last: EntryCard) => void }) {
  const r = useEntries(q)
  if (r.isLoading) return <li className="p-3"><Spinner /></li>
  const rows = r.data ?? []
  return <>{rows.map((c, i) => { const head = i === 0 || ymd(c.recorded_at) !== ymd(rows[i - 1].recorded_at); return <li key={c.id}>
    {head && <p className="bg-sunken px-3.5 py-1 text-11 font-medium text-faint">{day(c.recorded_at)}</p>}<Row card={c} onOpen={onOpen} /></li> })}
    {rows.length === 0 && !q?.before_id && <li className="p-6 text-center text-14 text-faint">Nothing here yet.</li>}
    {onMore && rows.length >= (q?.limit ?? 100) && <li className="p-2 text-center"><Button size="sm" variant="ghost" onClick={() => onMore(rows[rows.length - 1])}>Earlier</Button></li>}</>
}

function ResultsOverTime({ patientId, onOpen }: { patientId: string; onOpen: (id: string) => void }) {
  const q = useResultsTable(patientId); const [graph, setGraph] = useState<string | null>(null)
  if (q.isLoading) return <Spinner label="Loading results" />
  const rows = [...(q.data ?? [])].sort((a, b) => { const ia = KEY_TESTS.indexOf(a.code), ib = KEY_TESTS.indexOf(b.code); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) })
  if (!rows.length) return <Card className="p-6 text-center text-14 text-faint">No results or vitals recorded yet.</Card>
  const dates = [...new Set(rows.flatMap((t) => t.points.map((p) => ymd(p.at))))].sort().reverse().slice(0, 8)
  return <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-13">
    <thead><tr className="border-b border-line text-left text-11 text-faint"><th className="sticky left-0 bg-surface px-3.5 py-2 font-medium">Test</th>{dates.map((d) => <th key={d} className="px-2 py-2 text-right font-medium tnum">{day(d)}</th>)}</tr></thead>
    <tbody>{rows.map((t) => <ResultRowView key={t.code} t={t} dates={dates} open={graph === t.code} onToggle={() => setGraph(graph === t.code ? null : t.code)} onOpen={onOpen} />)}</tbody>
  </table></Card>
}
function ResultRowView({ t, dates, open, onToggle, onOpen }: { t: ResultRow; dates: string[]; open: boolean; onToggle: () => void; onOpen: (id: string) => void }) {
  return <>
    <tr className="border-b border-line hover:bg-hover">
      <td className="sticky left-0 bg-surface px-3.5 py-1.5"><button onClick={onToggle} className="text-left"><span className="font-medium">{t.name}</span>{t.unit && <span className="ml-1 text-12 text-faint">{t.unit}</span>}</button></td>
      {dates.map((d) => { const p = t.points.find((x) => ymd(x.at) === d); return <td key={d} className="px-2 py-1.5 text-right tnum">
        {p && <button onClick={() => onOpen(p.entry_id)} className={cn('rounded-sm px-1', p.flag && p.flag !== 'normal' ? flagClass(p.flag) + ' font-semibold' : 'text-fg')} title={p.corrected ? 'corrected' : undefined}>
          {p.value_number ?? p.value_text}{p.flag === 'high' ? '↑' : p.flag === 'low' ? '↓' : p.flag === 'critical' ? '‼' : ''}{p.corrected && <sup className="text-warn">c</sup>}</button>}</td> })}
    </tr>
    {open && <tr className="border-b border-line"><td colSpan={dates.length + 1} className="px-3.5 py-2"><Spark points={t.points} /></td></tr>}
  </>
}
function Spark({ points }: { points: ResultRow['points'] }) {
  const ps = points.filter((p) => p.value_number != null).slice().reverse()
  if (ps.length < 2) return <p className="text-12 text-faint">Not enough values for a graph.</p>
  const W = 560, H = 90, xs = ps.map((p) => new Date(p.at).getTime()), ys = ps.map((p) => p.value_number!)
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const X = (x: number) => 12 + (W - 24) * (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)), Y = (y: number) => H - 14 - (H - 28) * (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0))
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full max-w-xl text-accent" role="img" aria-label="trend">
    <polyline fill="none" stroke="currentColor" strokeWidth="2" points={ps.map((_, i) => `${X(xs[i])},${Y(ys[i])}`).join(' ')} />
    {ps.map((p, i) => <g key={i}><circle cx={X(xs[i])} cy={Y(ys[i])} r="3.5" className={p.flag && p.flag !== 'normal' ? 'fill-warn' : 'fill-accent'} />
      <text x={X(xs[i])} y={Y(ys[i]) - 7} textAnchor="middle" className="fill-muted text-11">{p.value_number}</text></g>)}
  </svg>
}

/** an entry in full, beside the record: text, values, request and replies, steps, earlier versions */
function EntryPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useEntry(id)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const e = q.data
  return <div className="fixed inset-y-0 right-0 z-popover flex w-full max-w-xl flex-col border-l border-line bg-raised shadow-md">
    <div className="flex items-center gap-2 border-b border-line px-4 py-3"><span className="text-14 font-semibold capitalize">{e?.type.replace(/_/g, ' ') ?? 'Entry'}</span>
      {e && <span className="text-12 text-faint tnum">{day(e.occurred_at)} {hm(e.occurred_at)} · {e.author_name ?? '—'} · {e.department_name}</span>}
      <span className="ml-auto flex items-center gap-2 text-11 text-faint"><Kbd>esc</Kbd><IconButton title="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton></span></div>
    <div className="flex-1 overflow-y-auto p-4">
      {q.isLoading ? <Spinner /> : q.error ? <p className="text-14 text-danger">{errorText(q.error)}</p> : e && <div className="grid gap-4">
        {e.is_hidden ? <p className="flex items-center gap-2 text-14 text-faint"><Lock className="h-4 w-4" />A private note from {e.department_name ?? 'another department'}. Open it anyway from the record, with a reason.</p> : <>
          {e.can_mark_private && <NotePrivacy e={{ ...e, is_private: e.related.filter((x) => x.type === 'private' || x.type === 'not_private').sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0]?.type === 'private' }} />}
          <p className={cn('text-16 font-medium', e.replaced_by_id && 'line-through text-faint')}>{e.display_line}</p>
          {e.replaced_by_id && <Badge tone="amber">replaced by a correction</Badge>}
          <FallbackFull card={e} data={e.data} />
          {e.request && <Section title="Request"><p className="text-14">To {e.request.to_department_name ?? 'outside'} · <b>{e.request.step}</b>{e.request.priority !== 'routine' && <Badge tone="red" className="ml-1.5">{e.request.priority}</Badge>}</p></Section>}
          {e.replies.length > 0 && <Section title="Replies">{e.replies.map((x) => <div key={x.id} className="rounded-lg bg-sunken p-2.5"><p className="mb-1 text-12 text-faint">{x.author_name} · {day(x.occurred_at)} {hm(x.occurred_at)}{!x.is_final && <b className="ml-1 text-warn">preliminary</b>}</p>
            {x.is_hidden ? <p className="text-14 italic text-faint">Private note</p> : <FallbackFull card={x} data={x.data} />}</div>)}</Section>}
          {e.steps.length > 0 && <Section title="Steps"><ol className="text-12 text-muted">{e.steps.map((s, i) => <li key={i} className="tnum">{dateTime(s.recorded_at)} · {s.step}{s.reason ? ` · ${s.reason}` : ''}</li>)}</ol></Section>}
          {e.versions.length > 0 && <Section title="Other versions">{e.versions.map((x) => <div key={x.id} className="rounded-lg bg-sunken p-2.5 text-14"><p className="mb-1 text-12 text-faint tnum">{dateTime(x.recorded_at)} · {x.author_name}{x.replaced_by_id ? ' · replaced' : ' · current'}</p>
            <p className={x.replaced_by_id ? 'text-faint line-through' : ''}>{x.display_line}</p>{Array.isArray(x.data?.values) ? <div className="mt-1"><FallbackFull card={x} data={{ values: x.data!.values as Value[] }} /></div> : null}</div>)}</Section>}
        </>}
      </div>}
    </div>
  </div>
}
const Section = ({ title, children }: { title: string; children: ReactNode }) => <div><Heading className="mb-1.5">{title}</Heading><div className="grid gap-2">{children}</div></div>

const REASONS = ['Direct care', 'Emergency', 'Admin', 'Other']
const REASON_CODE: Record<string, EntryData['opened_anyway']['reason']> = { 'Direct care': 'TREAT', Emergency: 'ETREAT', Admin: 'PATADMIN', Other: 'other' }

/** private notes hidden from me, one line per department, on top of the record (spec 07) */
function PrivateNotes({ r, patientId, departmentId }: { r: RecordView; patientId: string; departmentId: string }) {
  const [dept, setDept] = useState<string | null>(null)
  return <Card className="overflow-hidden">
    {r.hidden_departments.map((h) => <div key={h.department_id} className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-2 px-3.5 py-2 text-14 text-muted"><Lock className="h-3.5 w-3.5 text-faint" />
        <span>{h.notes} private {h.notes === 1 ? 'note' : 'notes'} from <b className="font-medium text-fg">{h.department_name}</b></span>
        {dept !== h.department_id && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setDept(h.department_id)}>Open anyway</Button>}</div>
      {dept === h.department_id && <OpenAnyway patientId={patientId} departmentId={departmentId} openDepartmentId={h.department_id} onDone={() => setDept(null)} />}
    </div>)}
  </Card>
}

/** open anyway, inline: a reason (Emergency opens at once); one department's private notes of this patient open to me for 12 hours,
 *  and the read is logged */
function OpenAnyway({ patientId, departmentId, openDepartmentId, onDone }: { patientId: string; departmentId: string; openDepartmentId: string; onDone: () => void }) {
  const qc = useQueryClient(); const [reason, setReason] = useState<string | null>(null); const [other, setOther] = useState('')
  const go = useMutation({ mutationFn: async (why: string) => {
      const code = REASON_CODE[reason === 'Other' || !REASON_CODE[why] ? 'Other' : why]
      await write(oneSet([{ id: newId(), type: 'opened_anyway', patient_id: patientId, department_id: departmentId, data: { department_id: openDepartmentId, reason: code, ...(code === 'other' ? { text: why } : {}) } }]))
      useOpened.getState().open(patientId, why)
    }, onSuccess: () => { refresh(qc); onDone() } })
  const why = reason === 'Other' ? other.trim() : reason
  return <div className="grid gap-2 bg-sunken px-3.5 py-2.5">
    <p className="text-12 text-muted">They open for you for 12 hours. Your name, the time and your reason are recorded and reviewed.</p>
    <div className="flex flex-wrap gap-1.5">{REASONS.map((x) => <button key={x} type="button" onClick={() => { setReason(x); if (x === 'Emergency') go.mutate('Emergency') }}
      className={cn('rounded-lg px-2.5 py-1 text-12 ring-1 ring-inset', reason === x ? 'bg-accent-soft text-accent ring-accent-line' : 'bg-surface ring-line hover:ring-line-strong')}>{x}{x === 'Emergency' && <span className="ml-1 text-faint">opens at once</span>}</button>)}</div>
    {reason === 'Other' && <Input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="A few words" className="h-8 text-14" />}
    {go.error && <p className="text-14 text-danger">{errorText(go.error)}</p>}
    <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      <Button size="sm" onClick={() => why && go.mutate(why)} disabled={!why || go.isPending}>Open</Button></div>
  </div>
}

/** a note's privacy, for its author and the people who work in its department: Private, or Not private with a reason (logged) */
function NotePrivacy({ e }: { e: Entry }) {
  const qc = useQueryClient(); const [asking, setAsking] = useState(false); const [reason, setReason] = useState(''); const { dept } = useDepartment()
  // not private needs its reason (the shape requires it), so the argument cannot leave it out
  const set = useMutation({ mutationFn: (a: { is_private: true } | { is_private: false; reason: string }) => { const at = { id: newId(), patient_id: e.patient_id, department_id: dept!.id, refers_to: e.id, relation: 'about' as const }
      return write(oneSet([a.is_private ? { ...at, type: 'private', data: {} } : { ...at, type: 'not_private', data: { reason: a.reason } }])) },
    onSuccess: () => { setAsking(false); setReason(''); refresh(qc) } })
  return <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-12 text-muted">
    <Lock className="h-3.5 w-3.5 text-faint" />{e.is_private ? 'Private note: only its department reads it.' : 'Not private.'}
    {!asking && <Button size="sm" variant="outline" className="ml-auto" disabled={set.isPending}
      onClick={() => e.is_private ? setAsking(true) : set.mutate({ is_private: true })}>{e.is_private ? 'Make not private' : 'Make private'}</Button>}
    {asking && <form className="ml-auto flex items-center gap-1.5" onSubmit={(x) => { x.preventDefault(); if (reason.trim()) set.mutate({ is_private: false, reason: reason.trim() }) }}>
      <Input autoFocus value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why" className="h-7 w-44 text-12" />
      <Button size="sm" type="submit" disabled={!reason.trim() || set.isPending}>Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button></form>}
    {set.error && <span className="w-full text-danger">{errorText(set.error)}</span>}
  </div>
}
