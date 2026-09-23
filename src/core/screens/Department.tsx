import { useNavigate } from 'react-router-dom'
import { Stethoscope } from 'lucide-react'
import { useDepartment } from '../hooks/organization'
import { useToReview, useVisitQueue } from '../hooks/reads'
import { Card, Centered, Heading, Spinner, cn, flagClass } from '../ui'
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
  if (offers && !dept.is_visited) return <Bench departmentId={dept.id} name={dept.name} />
  const rows = q.data?.rows ?? []
  const count = (b: string) => rows.filter((r) => r.band === b).length
  return <div className="mx-auto grid max-w-5xl gap-5 p-4">
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      <div><h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight"><Stethoscope className="h-5 w-5 text-teal-700" />{dept.name}</h1><p className="text-sm text-neutral-500">Today’s patients</p></div>
      {dept.is_visited && <div className="ml-auto flex gap-5 text-sm tnum">{([['Back', count('back'), 'text-teal-700'], ['Waiting', count('waiting'), ''], ['In consult', count('consult'), ''], ['Pending', count('pending'), 'text-neutral-500'], ['Done', q.data?.done_today ?? 0, 'text-teal-700']] as const).map(([l, n, cls]) =>
        <div key={l} className="text-right"><p className={cn('text-xl font-semibold leading-none', cls)}>{n}</p><p className="mt-1 text-[11px] text-neutral-500">{l}</p></div>)}</div>}
    </div>
    {can('mark:reviewed') && (review.data?.length ?? 0) > 0 && <Card className="overflow-hidden ring-1 ring-red-200"><Heading tone="alert" count={review.data!.length} className="border-b border-red-100 bg-red-50/60 px-4 py-2">Results to review</Heading>
      <ul className="divide-y divide-neutral-100">{review.data!.map((c) => <li key={c.id}><button onClick={() => navigate(`/request/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13.5px] hover:bg-neutral-50">
        <span className="w-48 truncate font-medium">{(c as unknown as { patient?: { given_name: string; family_name: string } }).patient?.given_name} {(c as unknown as { patient?: { family_name: string } }).patient?.family_name}</span>
        <span className="min-w-0 flex-1 truncate">{c.display_line}</span><span className={cn('text-xs tnum', flagClass(c.request?.reply_flag))}>{c.request?.reply_line}</span></button></li>)}</ul></Card>}
    {dept.is_visited && <QueueList departmentId={dept.id} keys />}
    {!dept.is_visited && <section><Heading className="mb-2">Requests for us</Heading><RequestList departmentId={dept.id} /></section>}
    {dept.is_visited && offers && <section><Heading className="mb-2">Requests for us</Heading><RequestList departmentId={dept.id} /></section>}
  </div>
}
