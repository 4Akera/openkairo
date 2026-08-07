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
import { averageWaitMinutes } from '../lib/visits'
import { VisitQueue } from '../components/visits/VisitQueue'
import { CheckInDialog } from '../components/visits/CheckInDialog'
import type { Department } from '../types'
import {
  Button, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'
import { ClipboardList, UserPlus, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

const GENERAL_QUEUE = 'general'

function dateKeyFor(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Today'
  if (offsetDays === 1) return 'Tomorrow'
  if (offsetDays === -1) return 'Yesterday'
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function FrontDeskPage() {
  const { user, hasRole } = useAuthStore()
  // Day navigation: today is the default; arrows reveal booked future days
  const [dayOffset, setDayOffset] = useState(0)
  const { visits, carriedOver, profileNames, loading } = useVisitQueue(dateKeyFor(dayOffset))
  const isToday = dayOffset === 0

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
  const avgWait = averageWaitMinutes(filtered)

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

          {/* Day navigation — today by default, arrows for booked days */}
          <div className="flex items-center gap-0.5 ml-1 shrink-0">
            <button
              onClick={() => setDayOffset(o => o - 1)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDayOffset(0)}
              className={cn(
                'px-2 h-7 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                isToday ? 'text-foreground cursor-default' : 'text-primary hover:bg-accent',
              )}
              title={isToday ? undefined : 'Back to today'}
            >
              {dayLabel(dayOffset)}
            </button>
            <button
              onClick={() => setDayOffset(o => o + 1)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {!loading && isToday && activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">{activeCount} in queue</Badge>
          )}
          {!loading && isToday && avgWait !== null && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              avg visit today {avgWait < 60 ? `${avgWait}m` : `${Math.floor(avgWait / 60)}h ${avgWait % 60}m`}
            </span>
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
          {isToday && (
            <Button size="sm" onClick={() => openCheckIn('now')}>
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Check in</span>
            </Button>
          )}
        </div>
      </div>

      <VisitQueue
        visits={filtered}
        carriedOver={deptFilter === 'all' ? carriedOver
          : carriedOver.filter(v => deptFilter === GENERAL_QUEUE ? !v.department_id : v.department_id === deptFilter)}
        profileNames={profileNames}
        loading={loading}
        emptyLabel={isToday ? 'No patients today yet' : `No visits booked for ${dayLabel(dayOffset).toLowerCase()}`}
        emptyAction={
          isToday ? (
            <Button size="sm" variant="outline" onClick={() => openCheckIn('now')}>
              Check in the first patient
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => openCheckIn('book')}>
              Book a visit
            </Button>
          )
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
