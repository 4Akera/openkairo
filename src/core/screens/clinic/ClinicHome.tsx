import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDepartment } from '../../hooks/organization'
import { useToReview, useVisitQueue } from '../../hooks/reads'
import { useWrite } from '../../hooks/writes'
import { oneSet, reviewed } from '../../db/entries'
import type { Card as EntryCard, Department, Flag } from '../../db/types'
import { Button, Card, ListSection, Tag, cn, flagClass, flagMark, shortDate, type Tone } from '../../ui'
import { QueueList, RequestList } from '../Queue'

/** A clinic's home (spec 05): one line of counts, "N to review" only when something waits, then the list. Departments
 *  without visits show the requests addressed to them. */
export function ClinicHome({ dept, offers }: { dept: Department; offers: boolean }) {
  const { can } = useDepartment()
  const review = useToReview(null, can('write:reviewed'))
  const q = useVisitQueue(dept.is_visited ? dept.id : null)
  const [reviewing, setReviewing] = useState(false)
  const rows = q.data?.rows ?? []
  const count = (b: string) => rows.filter((r) => r.band === b).length
  const waitingForResults = count('pending'); const withDoctor = count('consult')
  const counts = dept.is_visited && q.data ? [`${count('waiting')} waiting`, withDoctor > 0 && `${withDoctor} with a doctor`,
    waitingForResults > 0 && `${waitingForResults} waiting for results`, `${q.data.done_today} done`].filter(Boolean).join(' · ') : null
  const toReview = can('write:reviewed') ? review.data ?? [] : []
  return <div className="mx-auto grid max-w-5xl gap-3 p-4">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="text-18 font-semibold tracking-tight">{dept.name}</h1>
      {counts && <p className="text-14 text-faint tnum">{counts}</p>}
      {toReview.length > 0 && <button type="button" onClick={() => setReviewing(!reviewing)} aria-expanded={reviewing}
        className="ms-auto rounded-md text-14 font-medium text-danger hover:underline focus-ring">{toReview.length} to review</button>}
    </div>
    {reviewing && toReview.length > 0 && <ToReview cards={toReview} rule={dept.review_results} departmentId={dept.id} />}
    {dept.is_visited && <QueueList departmentId={dept.id} keys />}
    {(!dept.is_visited || offers) && <section className="grid gap-1.5"><h2 className="px-1 text-11 font-medium text-faint">Requests for us</h2><RequestList departmentId={dept.id} /></section>}
  </div>
}

const REASON: Record<string, [Tone, string]> = { critical: ['danger', 'critical'], abnormal: ['warn', 'abnormal'], not_seen: ['info', 'patient not seen'], corrected: ['warn', 'corrected'], result: ['neutral', 'result'], rejected: ['warn', 'not done'], flag: ['warn', 'flagged'] }
/** My results to review: the line opens the patient's chart with that result in the center (?at=entry:); Reviewed writes a reviewed
 *  entry about the result and the row closes */
function ToReview({ cards, rule, departmentId }: { cards: EntryCard[]; rule: Department['review_results']; departmentId: string }) {
  const navigate = useNavigate(); const w = useWrite()
  const why = `Critical results, corrected results and results for patients who left before being seen come here${rule === 'abnormal' ? ', and abnormal ones' : rule === 'all' ? ', and every final result' : ''}.`
  return <Card className="overflow-hidden ring-1 ring-danger-line"><ul>
    <ListSection title="My results to review" count={cards.length} />
    {cards.map((c) => { const p = (c as unknown as { patient?: { given_name: string; family_name: string } }).patient; const reason = c.request?.review_reason; return <li key={c.id} className="flex items-center border-t border-line pe-3">
      <button type="button" title={why} onClick={() => navigate(`/patient/${c.patient_id}?at=entry:${c.id}`)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2 text-start text-13 hover:bg-hover focus-ring">
        <span className="w-48 shrink-0 truncate font-medium">{p?.given_name} {p?.family_name}</span>
        {reason && <Tag tone={REASON[reason]?.[0] ?? 'neutral'}>{REASON[reason]?.[1] ?? reason}</Tag>}
        <span className={cn('min-w-0 flex-1 truncate', c.flag && c.flag !== 'normal' && flagClass(c.flag))}>{c.display_line}</span><Compared c={c} /></button>
      <Button size="sm" variant="ghost" disabled={w.isPending} onClick={() => w.mutate(oneSet([reviewed(c.id, c.patient_id!, departmentId)]))}>Reviewed</Button></li> })}
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
