import { useNavigate } from 'react-router-dom'
import { Stethoscope } from 'lucide-react'
import { useDepartment } from '../hooks/organization'
import { useToReview, useVisitQueue } from '../hooks/reads'
import { Badge, Card, Centered, Heading, Spinner, cn, flagClass } from '../ui'
const REASON: Record<string, ['red' | 'amber' | 'blue' | 'neutral', string]> = { critical: ['red', 'critical'], abnormal: ['amber', 'abnormal'], 'not seen': ['blue', 'patient not seen'], corrected: ['amber', 'corrected'], result: ['neutral', 'result'] }
import { ReceptionScreen } from './Reception'
import { QueueList, RequestList } from './Queue'
import { Bench } from './bench/Bench'

/** The department's home (spec 05): reception searches, service departments work the bench, clinics work their queue. */
export function DepartmentScreen() {
  const { dept, org, can } = useDepartment()
  const review = useToReview(null, can('mark:reviewed'))
  const q = useVisitQueue(dept?.is_visited ? dept.id : null)
  const navigate = useNavigate()
  if (!dept || !org) return <Centered><Spinner /></Centered>
  if (dept.type === 'reception') return <ReceptionScreen departmentId={dept.id} />
  const offers = org.services.some((s) => s.department_id === dept.id)
  if (offers && !dept.is_visited) return <Bench departmentId={dept.id} name={dept.name} type={dept.type} />
  const rows = q.data?.rows ?? []
  const count = (b: string) => rows.filter((r) => r.band === b).length
  return <div className="mx-auto grid max-w-5xl gap-5 p-4">
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Stethoscope className="h-5 w-5 text-teal-700" />{dept.name}</h1><p className="text-sm text-neutral-500">Today’s patients</p></div>
      {dept.is_visited && <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm tnum sm:ml-auto">{([['To review', review.data?.length ?? 0, (review.data?.length ?? 0) > 0 ? 'text-red-700' : 'text-neutral-400'], ['Back', count('back'), 'text-teal-700'], ['Waiting', count('waiting'), ''], ['In consult', count('consult'), ''], ['Pending', count('pending'), 'text-neutral-500'], ['Done', q.data?.done_today ?? 0, 'text-teal-700']] as const).map(([l, n, cls]) =>
        <div key={l} className="text-right"><p className={cn('text-xl font-semibold leading-none', cls)}>{n}</p><p className="mt-1 text-[11px] text-neutral-500">{l}</p></div>)}</div>}
    </div>
    {can('mark:reviewed') && <Card className={cn('overflow-hidden', (review.data?.length ?? 0) > 0 ? 'ring-1 ring-red-200' : '')}><Heading tone={(review.data?.length ?? 0) > 0 ? 'alert' : 'muted'} count={review.data?.length ?? 0} className={cn('border-b px-4 py-2', (review.data?.length ?? 0) > 0 ? 'border-red-100 bg-red-50/60' : 'border-neutral-100')}>My results to review</Heading>
      {(review.data?.length ?? 0) === 0 && <p className="px-4 py-2.5 text-xs text-neutral-400">Nothing to review. Critical results, corrected results and results for patients who left before being seen come here{dept.review_results === 'abnormal' ? ', and abnormal ones' : dept.review_results === 'all' ? ', and every final result' : ''}.</p>}
      <ul className="divide-y divide-neutral-100">{(review.data ?? []).map((c) => <li key={c.id}><button onClick={() => navigate(`/request/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13.5px] hover:bg-neutral-50">
        <span className="w-48 truncate font-medium">{(c as unknown as { patient?: { given_name: string; family_name: string } }).patient?.given_name} {(c as unknown as { patient?: { family_name: string } }).patient?.family_name}</span>
        {c.request?.review_reason && <Badge tone={REASON[c.request.review_reason]?.[0] ?? 'neutral'} className="w-28 justify-center">{REASON[c.request.review_reason]?.[1] ?? c.request.review_reason}</Badge>}
        <span className="min-w-0 flex-1 truncate">{c.display_line}</span><span className={cn('text-xs tnum', flagClass(c.request?.reply_flag))}>{c.request?.reply_line}</span></button></li>)}</ul></Card>}
    {dept.is_visited && <QueueList departmentId={dept.id} keys />}
    {!dept.is_visited && <section><Heading className="mb-2">Requests for us</Heading><RequestList departmentId={dept.id} /></section>}
    {dept.is_visited && offers && <section><Heading className="mb-2">Requests for us</Heading><RequestList departmentId={dept.id} /></section>}
  </div>
}
