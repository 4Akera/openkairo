/**
 * DepartmentPage — an order-fulfilling department's workspace inside the main
 * app shell (route /dept/:slug). The sidebar carries ONE Departments entry no
 * matter how many memberships a user has; belonging to several work
 * departments puts a switcher in this header instead — per-dept open counts
 * live on its chips.
 *
 * Patient queues live on Today (the Front Desk) — including a hybrid
 * department's queue — so this page is the work (order/fulfilment) view only.
 * Pure patient queues have no page at all: /dept/<queue> redirects home, and
 * a ward's surface is the census page, never a work view.
 */
import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useDeptPendingCounts } from '../hooks/useDeptPendingCounts'
import { isQueueDept, isWard, isWorkDept } from '../lib/queues'
import { DepartmentWork } from './DepartmentWork'
import { deptIconComponent, deptColorClasses } from '../lib/deptIcons'
import type { Department } from '../types'
import { cn } from '../lib/utils'
import { Building2, Loader2 } from 'lucide-react'

export default function DepartmentPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { myDepartments, hasRole } = useAuthStore()
  const isAdmin = hasRole('admin')

  const memberDept = myDepartments.find(d => d.slug === slug) ?? null
  const [dept, setDept] = useState<Department | null>(memberDept)
  const [loading, setLoading] = useState(!memberDept)

  // Multi-membership switcher: my work departments, with live open counts on
  // the chips. Admins browsing a department they are not in get no switcher.
  const workDepts = myDepartments.filter(isWorkDept)
  const showSwitcher = workDepts.length > 1 && workDepts.some(d => d.id === dept?.id)
  const deptCounts = useDeptPendingCounts(showSwitcher ? workDepts.map(d => d.slug) : [])

  // Admins may open any active department without being a member
  useEffect(() => {
    if (memberDept) { setDept(memberDept); setLoading(false); return }
    if (!slug || !isAdmin) { setDept(null); setLoading(false); return }
    setLoading(true)
    supabase
      .from('departments')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
      .then(({ data }) => {
        setDept((data as Department | null) ?? null)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, memberDept?.id, isAdmin])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  if (!dept) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Building2 className="h-10 w-10 opacity-20" />
        <p className="text-sm">Department not found, or you are not a member.</p>
        <p className="text-xs">Ask an admin to assign you in Settings → Queues &amp; Departments.</p>
      </div>
    )
  }

  // A pure patient queue has no workspace — its lane lives on Today — and a
  // ward's surface is the census page.
  if (isQueueDept(dept)) return <Navigate to="/" replace />
  if (isWard(dept)) return <Navigate to="/wards" replace />

  const Icon = deptIconComponent(dept.icon)

  return (
    <div className="h-full flex flex-col">
      {/* Header — consistent with the rest of the app shell */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2.5 flex-wrap shrink-0">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', deptColorClasses(dept.color))}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate leading-tight">{dept.name}</h1>
          {dept.description && (
            <p className="text-xs text-muted-foreground truncate leading-tight">{dept.description}</p>
          )}
        </div>

        {/* My departments — same segmented control as Today's lane switcher */}
        {showSwitcher && (
          <div className="ml-auto max-w-full flex items-center rounded-lg border border-border p-0.5 gap-0.5 overflow-x-auto no-scrollbar">
            {workDepts.map(d => {
              const n = deptCounts[d.slug] ?? 0
              const active = d.id === dept.id
              return (
                <button
                  key={d.id}
                  onClick={() => { if (!active) navigate(`/dept/${d.slug}`) }}
                  className={cn(
                    'flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {d.name}
                  {n > 0 && (
                    <span
                      className={cn(
                        'flex items-center rounded-full px-1.5 h-4 text-[10px] font-semibold tabular-nums leading-none',
                        active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {n > 99 ? '99+' : n}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <DepartmentWork key={dept.slug} dept={dept} />
      </div>
    </div>
  )
}
