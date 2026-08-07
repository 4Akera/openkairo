/**
 * Front Desk — today's patient queue across every queue in the facility.
 *
 * One adaptive view for every clinic shape:
 *  - No stages configured  → a single arrival-ordered list.
 *  - Stages configured     → the same list grouped by stage.
 *  - No bookings ever made → the Upcoming section simply never renders.
 *  - Patient-facing departments exist → a queue switcher appears.
 *
 * Queue rendering lives in VisitQueue and check-in in CheckInDialog — both
 * shared with the per-department Patients tabs.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useVisitQueue } from '../hooks/useVisits'
import { VisitQueue } from '../components/visits/VisitQueue'
import { CheckInDialog } from '../components/visits/CheckInDialog'
import type { Department } from '../types'
import {
  Button, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'
import { ClipboardList, UserPlus, CalendarPlus } from 'lucide-react'

const GENERAL_QUEUE = 'general'

export default function FrontDeskPage() {
  const { user, hasRole } = useAuthStore()
  const { visits, profileNames, loading } = useVisitQueue()

  const [patientDepts, setPatientDepts] = useState<Department[]>([])
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [mode, setMode] = useState<'now' | 'book'>('now')

  useEffect(() => {
    supabase
      .from('departments')
      .select('*')
      .eq('active', true)
      .eq('can_receive_patients', true)
      .order('sort_order')
      .then(({ data }) => setPatientDepts((data ?? []) as Department[]))
  }, [])

  const openCheckIn = (bookMode: 'now' | 'book') => {
    setMode(bookMode)
    setCheckInOpen(true)
  }

  const filtered = useMemo(() => {
    if (deptFilter === 'all') return visits
    if (deptFilter === GENERAL_QUEUE) return visits.filter(v => !v.department_id)
    return visits.filter(v => v.department_id === deptFilter)
  }, [visits, deptFilter])

  const activeCount = filtered.filter(v => v.arrived_at && !v.finished_at).length

  const canUse = hasRole('receptionist') || hasRole('admin') || hasRole('physician') || hasRole('nurse')

  if (!user) return null
  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <ClipboardList className="h-8 w-8 opacity-30" />
        <p className="text-sm">Front Desk is available to clinical and reception staff</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
          <h1 className="text-base font-semibold truncate">Front Desk</h1>
          {!loading && activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">{activeCount} in queue</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Queue switcher — only rendered for multi-clinic institutions */}
          {patientDepts.length > 0 && (
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All queues</SelectItem>
                <SelectItem value={GENERAL_QUEUE}>General</SelectItem>
                {patientDepts.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => openCheckIn('book')}>
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Book</span>
          </Button>
          <Button size="sm" onClick={() => openCheckIn('now')}>
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Check in</span>
          </Button>
        </div>
      </div>

      <VisitQueue
        visits={filtered}
        profileNames={profileNames}
        loading={loading}
        emptyAction={
          <Button size="sm" variant="outline" onClick={() => openCheckIn('now')}>
            Check in the first patient
          </Button>
        }
      />

      <CheckInDialog
        open={checkInOpen}
        onOpenChange={setCheckInOpen}
        mode={mode}
        patientDepts={patientDepts}
        initialDeptId={deptFilter !== 'all' && deptFilter !== GENERAL_QUEUE ? deptFilter : ''}
      />
    </div>
  )
}
