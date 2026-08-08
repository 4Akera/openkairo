/**
 * DepartmentPage — an order-fulfilling department's workspace inside the main
 * app shell, one sidebar entry per membership department (route /dept/:slug).
 *
 * Patient queues live on Today (the Front Desk) — including a hybrid
 * department's queue — so this page is the work (order/fulfilment) view only.
 * Pure patient queues have no page at all: /dept/<queue> redirects home.
 */
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { isQueueDept } from '../lib/queues'
import { DepartmentWork } from './DepartmentWork'
import { deptIconComponent, deptColorClasses } from '../lib/deptIcons'
import type { Department } from '../types'
import { cn } from '../lib/utils'
import { Building2, Loader2 } from 'lucide-react'

export default function DepartmentPage() {
  const { slug } = useParams<{ slug: string }>()
  const { myDepartments, hasRole } = useAuthStore()
  const isAdmin = hasRole('admin')

  const memberDept = myDepartments.find(d => d.slug === slug) ?? null
  const [dept, setDept] = useState<Department | null>(memberDept)
  const [loading, setLoading] = useState(!memberDept)

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

  // A pure patient queue has no workspace — its lane lives on Today.
  if (isQueueDept(dept)) return <Navigate to="/" replace />

  const Icon = deptIconComponent(dept.icon)

  return (
    <div className="h-full flex flex-col">
      {/* Header — consistent with the rest of the app shell */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-2.5 shrink-0">
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', deptColorClasses(dept.color))}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold truncate leading-tight">{dept.name}</h1>
          {dept.description && (
            <p className="text-xs text-muted-foreground truncate leading-tight">{dept.description}</p>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <DepartmentWork key={dept.slug} dept={dept} />
      </div>
    </div>
  )
}
