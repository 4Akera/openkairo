import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDepartment } from '../../hooks/organization'
import { useRequestQueue, useToReview, useVisitQueue } from '../../hooks/reads'
import { useWrite } from '../../hooks/writes'
import { oneSet, reviewed } from '../../db/entries'
import type { Card as EntryCard, Department, Flag } from '../../db/types'
import type { ScreenProps } from '../registry'
import { Button, Card, Empty, Input, Kbd, ListSection, ScreenFrame, Tag, cn, flagClass, flagMark, shortDate, type ScreenView, type Tone } from '../../ui'
import { QueueList, RequestList } from '../Queue'

type View = 'queue' | 'requests' | 'review'
/** A clinic's queue (base.queue, spec/openCare.md §4.6): its views are counted filters in the toolbar — the queue, the requests sent
 *  to it when it offers services, and "To review" (in a state colour while results wait) — the queue's filter on the right. */
export function ClinicHome({ dept }: ScreenProps) {
  const { org, can } = useDepartment()
  const offers = !!org?.services.some((s) => s.department_id === dept.id)
  const review = useToReview(null, can('write:reviewed'))
  const q = useVisitQueue(dept.is_visited ? dept.id : null)
  const requests = useRequestQueue(!dept.is_visited || offers ? dept.id : null)
  const toReview = can('write:reviewed') ? review.data ?? [] : []
  const views: ScreenView<View>[] = [
    ...(dept.is_visited ? [{ id: 'queue' as const, label: 'Queue', count: (q.data?.rows ?? []).length }] : []),
    ...(!dept.is_visited || offers ? [{ id: 'requests' as const, label: 'Requests for us', count: requests.data?.requests.length }] : []),
    ...(can('write:reviewed') ? [{ id: 'review' as const, label: 'To review', count: toReview.length, needs: 'danger' as const }] : [])]
  const [chosen, setView] = useState<View | null>(null)
  const view = views.find((v) => v.id === chosen)?.id ?? views[0]?.id ?? 'queue'
  const frame = (search: ReactNode, content: ReactNode) => <ScreenFrame views={views.length > 1 ? views : undefined} view={view} onView={setView} search={search}>{content}</ScreenFrame>
  if (view === 'queue') return <QueueList departmentId={dept.id} keys frame={frame} />
  return frame(null, view === 'requests' ? <RequestList departmentId={dept.id} />
    : toReview.length ? <ToReview cards={toReview} rule={dept.review_results} departmentId={dept.id} /> : <Card><Empty>Nothing to review.</Empty></Card>)
}

const REASON: Record<string, [Tone, string]> = { critical: ['danger', 'critical'], abnormal: ['warn', 'abnormal'], not_seen: ['info', 'patient not seen'], corrected: ['warn', 'corrected'], result: ['neutral', 'result'], rejected: ['warn', 'not done'], no_answer: ['neutral', 'no report'], flag: ['warn', 'flagged'], question: ['warn', 'asks'] }
/** My results to review: the line opens the patient's chart with that result in the center (?at=entry:); Reviewed writes a reviewed
 *  entry about the result and the row closes. An order done with no report (an X-ray nobody reports, spec §5.5 (c)) asks for the
 *  doctor's own reading instead: a line folds out under the row and is kept as the reviewed entry's note */
function ToReview({ cards, rule, departmentId }: { cards: EntryCard[]; rule: Department['review_results']; departmentId: string }) {
  const navigate = useNavigate(); const w = useWrite()
  const [reading, setReading] = useState<string | null>(null); const [text, setText] = useState('')
  const keep = (c: EntryCard) => w.mutate(oneSet([reviewed(c.id, c.patient_id!, departmentId, text.trim())]), { onSuccess: () => { setReading(null); setText('') } })
  const why = `Critical results, corrected results and results for patients who left before being seen come here${rule === 'abnormal' ? ', and abnormal ones' : rule === 'all' ? ', and every final result' : ''}.`
  return <Card className="overflow-hidden ring-1 ring-danger-line"><ul>
    <ListSection title="My results to review" count={cards.length} />
    {cards.map((c) => { const p = (c as unknown as { patient?: { given_name: string; family_name: string } }).patient; const reason = c.request?.review_reason; return <li key={c.id} className="border-t border-line">
      <div className="flex items-center pe-3">
      <button type="button" title={why} onClick={() => navigate(`/patient/${c.patient_id}?at=entry:${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-start text-13 hover:bg-hover focus-ring">
        <span className="w-48 shrink-0 truncate font-medium">{p?.given_name} {p?.family_name}</span>
        {reason && <Tag tone={REASON[reason]?.[0] ?? 'neutral'}>{reason === 'question' ? `${c.department_name ?? ''} asks`.trim() : REASON[reason]?.[1] ?? reason}</Tag>}
        <span className={cn('min-w-0 flex-1 truncate', c.flag && c.flag !== 'normal' && flagClass(c.flag))}>{c.display_line}</span><Compared c={c} /></button>
      {reason === 'question' ? <Button size="sm" variant="outline" onClick={() => navigate(`/patient/${c.patient_id}`)}>Answer</Button>
        : reason === 'no_answer' ? <Button size="sm" variant="outline" aria-expanded={reading === c.id} onClick={() => { setReading(reading === c.id ? null : c.id); setText('') }}>Your reading</Button>
        : <Button size="sm" variant="ghost" disabled={w.isPending} onClick={() => w.mutate(oneSet([reviewed(c.id, c.patient_id!, departmentId)]))}>Reviewed</Button>}</div>
      {reading === c.id && <form className="flex flex-wrap items-center gap-2 bg-sunken px-4 py-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) keep(c) }}>
        <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What you see on the films" aria-label="Your reading" className="min-w-0 flex-1" />
        <Button size="sm" type="submit" disabled={!text.trim()} loading={w.isPending}>Keep<Kbd className="ms-1">↵</Kbd></Button>
        <span className="text-12 text-faint">No report was asked: your reading is kept with the X-ray.</span></form>}</li> })}
  </ul></Card>
}

type Compare = { name: string; value: number; unit: string | null; flag: Flag | null; previous: number | null; previous_at: string | null }
/** a result beside the patient's value before it — "Creatinine 1.9 ↑ · was 1.1 Jun" — so it can be judged here (0032) */
function Compared({ c }: { c: EntryCard }) {
  const list = (c as unknown as { compare?: Compare[] }).compare ?? []
  if (!list.length) return null
  return <span className="flex shrink-0 flex-wrap justify-end gap-x-3 text-12 tnum">{list.map((v) => <span key={v.name}>
    <span className="text-muted">{v.name} </span><b className={cn('font-semibold', v.flag && v.flag !== 'normal' ? flagClass(v.flag) : 'text-fg')}>{v.value}{flagMark(v.flag)}</b>
    {v.previous != null && <span className="text-faint"> · was {v.previous}{v.previous_at ? ` ${shortDate(v.previous_at)}` : ''}</span>}</span>)}</span>
}
