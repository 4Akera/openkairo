import { useDepartment } from '../hooks/organization'
import { useToReview } from '../hooks/reads'
import { useNavigate } from 'react-router-dom'
import { Centered, Spinner, flagClass } from '../ui'
import { ReceptionScreen } from './Reception'
import { QueueList, RequestList } from './Queue'

/** The department's home: its queues (spec 05). Reception gets the search-first screen. */
export function DepartmentScreen() {
  const { dept, org, can } = useDepartment()
  const review = useToReview(null, can('mark:reviewed'))
  const navigate = useNavigate()
  if (!dept || !org) return <Centered><Spinner /></Centered>
  if (dept.type === 'reception') return <ReceptionScreen departmentId={dept.id} />
  const offers = org.services.some((s) => s.department_id === dept.id)
  return <div className="mx-auto grid max-w-4xl gap-6 p-4">
    <h1 className="text-lg font-semibold tracking-tight">{dept.name}</h1>
    {dept.is_visited && <section><h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Patients</h2><QueueList departmentId={dept.id} /></section>}
    {(offers || !dept.is_visited) && <section><h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Requests for us</h2><RequestList departmentId={dept.id} /></section>}
    {can('mark:reviewed') && (review.data?.length ?? 0) > 0 && <section><h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-red-700">My results to review · {review.data!.length}</h2>
      <ul className="divide-y divide-neutral-100 rounded-md border border-red-200 bg-white">{review.data!.map((c) => <li key={c.id}><button onClick={() => navigate(`/request/${c.id}`)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-50">
        <span className="flex-1">{c.display_line}</span><span className={`text-xs ${flagClass(c.request?.reply_flag)}`}>{c.request?.reply_line}</span></button></li>)}</ul></section>}
  </div>
}
