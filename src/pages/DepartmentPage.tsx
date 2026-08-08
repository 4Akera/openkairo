/**
 * DepartmentPage — a department's workspace inside the main app shell,
 * one sidebar entry per membership department (route /dept/:slug).
 *
 * "Work" is the order/fulfilment queue (DepartmentWork).
 * Departments flagged can_receive_patients also get a "Patient queue" tab —
 * their slice of the same visit system the Front Desk uses.
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useVisitQueue } from '../hooks/useVisits'
import { DepartmentWork } from './DepartmentWork'
import { VisitQueue } from '../components/visits/VisitQueue'
import { CheckInDialog } from '../components/visits/CheckInDialog'
import { deptIconComponent, deptColorClasses } from '../lib/deptIcons'
import type { Department } from '../types'
import { cn } from '../lib/utils'
import { Badge, Button } from '../components/ui'
import { Building2, Loader2, ClipboardList, Zap, UserPlus } from 'lucide-react'

export default function DepartmentPage() {
  const { slug } = useParams<{ slug: string }>()
  const { myDepartments, hasRole } = useAuthStore()
  const isAdmin = hasRole('admin')

  const memberDept = myDepartments.find(d => d.slug === slug) ?? null
  const [dept, setDept] = useState<Department | null>(memberDept)
  const [loading, setLoading] = useState(!memberDept)
  const [tab, setTab] = useState<'work' | 'patients'>('work')
  const [checkInOpen, setCheckInOpen] = useState(false)

  /** Tabs follow capabilities: pure clinics open on their patient queue. */
  const defaultTab = (d: Department | null): 'work' | 'patients' =>
    d && !d.can_receive_orders && !d.can_create_direct && d.can_receive_patients
      ? 'patients'
      : 'work'

  // Admins may open any active department without being a member
  useEffect(() => {
    if (memberDept) { setDept(memberDept); setTab(defaultTab(memberDept)); setLoading(false); return }
    if (!slug || !isAdmin) { setDept(null); setLoading(false); return }
    setLoading(true)
    supabase
      .from('departments')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()
      .then(({ data }) => {
        const d = (data as Department | null) ?? null
        setDept(d)
        setTab(defaultTab(d))
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, memberDept?.id, isAdmin])

  const showPatients = !!dept?.can_receive_patients
  const showWork = !!dept && (dept.can_receive_orders || dept.can_create_direct)
  const { visits, profileNames, loading: visitsLoading } = useVisitQueue()
  const deptVisits = useMemo(
    () => (dept ? visits.filter(v => v.department_id === dept.id) : []),
    [visits, dept],
  )
  const waitingCount = deptVisits.filter(v => v.arrived_at && !v.finished_at).length

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
        <p className="text-xs">Ask an admin to assign you in Settings → Departments.</p>
      </div>
    )
  }

  const Icon = deptIconComponent(dept.icon)

  return (
    <div className="h-full flex flex-col">
      {/* Header — consistent with the rest of the app shell */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', deptColorClasses(dept.color))}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate leading-tight flex items-center gap-1.5">
              {dept.name}
              {dept.can_receive_patients && (
                <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 text-primary px-1.5 py-px text-[10px] font-medium shrink-0">
                  Clinic
                </span>
              )}
            </h1>
            {dept.description && (
              <p className="text-xs text-muted-foreground truncate leading-tight">{dept.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showPatients && tab === 'patients' && (
            <Button size="sm" onClick={() => setCheckInOpen(true)}>
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Check in</span>
            </Button>
          )}
          {/* Tab toggle only exists when the department genuinely does both */}
          {showWork && showPatients && (
            <div className="flex items-center rounded-lg border p-0.5 shrink-0">
              {([
                { id: 'work' as const, label: 'Work', icon: <Zap className="h-3.5 w-3.5" /> },
                { id: 'patients' as const, label: 'Patients', icon: <ClipboardList className="h-3.5 w-3.5" /> },
              ]).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors',
                    tab === t.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.icon}{t.label}
                  {t.id === 'patients' && waitingCount > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">{waitingCount}</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPatients && (tab === 'patients' || !showWork) ? (
        <VisitQueue
          visits={deptVisits}
          profileNames={profileNames}
          loading={visitsLoading}
          emptyLabel="No patients in this queue today"
          emptyAction={
            <Button size="sm" variant="outline" onClick={() => setCheckInOpen(true)}>
              Check in a walk-in
            </Button>
          }
        />
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          <DepartmentWork key={dept.slug} dept={dept} />
        </div>
      )}

      {showPatients && (
        <CheckInDialog
          open={checkInOpen}
          onOpenChange={setCheckInOpen}
          mode="now"
          fixedDepartmentId={dept.id}
        />
      )}
    </div>
  )
}
