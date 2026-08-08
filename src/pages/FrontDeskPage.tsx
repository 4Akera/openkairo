/**
 * Front Desk — today's patient queue across every queue in the facility.
 *
 * One adaptive view for every clinic shape:
 *  - No stages configured  → a single arrival-ordered list.
 *  - Stages configured     → the same list grouped by stage.
 *  - No bookings ever made → the Upcoming section simply never renders.
 *  - Patient-facing departments exist → a queue switcher appears.
 *
 * Queue rendering lives in VisitQueue and "+ Patient" in CheckInDialog — both
 * shared with the per-department Patients tabs.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useVisitQueue } from '../hooks/useVisits'
import { averageWaitMinutes, dailyAverageWaits } from '../lib/visits'
import type { Visit } from '../types'
import { VisitQueue } from '../components/visits/VisitQueue'
import { CheckInDialog } from '../components/visits/CheckInDialog'
import type { Department } from '../types'
import {
  Button, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'
import {
  ClipboardList, UserPlus, CalendarPlus, ChevronLeft, ChevronRight,
  UserCheck, FolderOpen, Loader2,
} from 'lucide-react'
import { cn, fullName, formatDateTime } from '../lib/utils'

const GENERAL_QUEUE = 'general'

/** Tiny 7-day trend of avg visit duration; renders nothing without data. */
function WaitTrend({ values }: { values: (number | null)[] }) {
  const present = values.filter((v): v is number => v !== null)
  if (present.length < 2) return null
  const max = Math.max(...present, 1)
  const W = 56, H = 16, bw = W / values.length
  return (
    <svg width={W} height={H} className="shrink-0 opacity-80" aria-label="7-day avg visit trend">
      {values.map((v, i) =>
        v === null ? null : (
          <rect
            key={i}
            x={i * bw + 1}
            y={H - Math.max(2, (v / max) * H)}
            width={bw - 2}
            height={Math.max(2, (v / max) * H)}
            rx={1}
            className={i === values.length - 1 ? 'fill-primary' : 'fill-muted-foreground/40'}
          />
        ),
      )}
    </svg>
  )
}

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
  const { nameFormat } = useSettingsStore()
  const navigate = useNavigate()
  // Day navigation: today is the default; arrows reveal booked future days
  const [dayOffset, setDayOffset] = useState(0)
  const { visits, carriedOver, profileNames, loading } = useVisitQueue(dateKeyFor(dayOffset))
  const isToday = dayOffset === 0

  const [patientDepts, setPatientDepts] = useState<Department[]>([])
  const [deptFilter, setDeptFilter] = useState<string>('all')
  // "Mine" = visits assigned to me: the clinician's worklist lives in the
  // day view instead of a separate list elsewhere.
  const [mineOnly, setMineOnly] = useState(false)
  // "Open" = every open encounter regardless of day — covers what the
  // registry's Open filter used to, now that Patients has no nav entry.
  const [openOnly, setOpenOnly] = useState(false)
  const [openRows, setOpenRows] = useState<Visit[] | null>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [mode, setMode] = useState<'now' | 'book'>('now')

  const [trend, setTrend] = useState<(number | null)[]>([])

  useEffect(() => {
    supabase
      .from('departments')
      .select('*')
      .eq('active', true)
      .eq('can_receive_patients', true)
      .order('sort_order')
      .then(({ data }) => setPatientDepts((data ?? []) as Department[]))

    // Trailing week of completed visits → avg-duration trend
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 6)
    weekAgo.setHours(0, 0, 0, 0)
    supabase
      .from('encounters')
      .select('arrived_at, finished_at')
      .gte('finished_at', weekAgo.toISOString())
      .not('arrived_at', 'is', null)
      .then(({ data }) => {
        setTrend(dailyAverageWaits((data ?? []) as Pick<Visit, 'arrived_at' | 'finished_at'>[], 7))
      })
  }, [])

  useEffect(() => {
    if (!openOnly) { setOpenRows(null); return }
    supabase
      .from('encounters')
      .select('*, patients(*)')
      .eq('status', 'open')
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setOpenRows((data ?? []) as Visit[]))
  }, [openOnly])

  const openCheckIn = (bookMode: 'now' | 'book') => {
    setMode(bookMode)
    setCheckInOpen(true)
  }

  const filtered = useMemo(() => {
    let rows = visits
    if (deptFilter === GENERAL_QUEUE) rows = rows.filter(v => !v.department_id)
    else if (deptFilter !== 'all') rows = rows.filter(v => v.department_id === deptFilter)
    if (mineOnly && user) rows = rows.filter(v => v.assigned_to === user.id)
    return rows
  }, [visits, deptFilter, mineOnly, user])

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
          {isToday && <span className="hidden md:inline-flex"><WaitTrend values={trend} /></span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* My worklist, inside the day view */}
          <button
            onClick={() => setMineOnly(m => !m)}
            className={cn(
              'flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors',
              mineOnly
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30',
            )}
            title="Only visits assigned to me"
          >
            <UserCheck className="h-3.5 w-3.5" />
            Mine
          </button>
          {/* Every open encounter, any day — the old registry Open filter */}
          <button
            onClick={() => setOpenOnly(o => !o)}
            className={cn(
              'flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors',
              openOnly
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30',
            )}
            title="All open encounters, any day"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Open
          </button>
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
              <span className="hidden sm:inline">Patient</span>
            </Button>
          )}
        </div>
      </div>

      {openOnly ? (
        <div className="flex-1 overflow-y-auto">
          {openRows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (() => {
            const rows = openRows.filter(v => !mineOnly || v.assigned_to === user?.id)
            return rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No open encounters.</p>
            ) : (
              <div className="divide-y divide-border">
                {rows.map(v => {
                  const pt = v.patients ?? null
                  return (
                    <button
                      key={v.id}
                      onClick={() => pt && navigate(`/patients/${pt.id}/encounters/${v.id}`)}
                      className="w-full flex items-center gap-3 px-4 sm:px-6 py-2.5 text-left hover:bg-accent/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{pt ? fullName(pt, nameFormat) : 'Unknown patient'}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {v.title?.trim() || 'Encounter'} · {formatDateTime(v.arrived_at ?? v.created_at)}
                        </p>
                      </div>
                      {v.assigned_to && (
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                          {profileNames[v.assigned_to] ?? ''}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </div>
      ) : (
        <VisitQueue
          visits={filtered}
          carriedOver={carriedOver.filter(v =>
            (deptFilter === 'all' || (deptFilter === GENERAL_QUEUE ? !v.department_id : v.department_id === deptFilter))
            && (!mineOnly || v.assigned_to === user?.id))}
          profileNames={profileNames}
          loading={loading}
          emptyLabel={isToday ? 'No patients today yet' : `No visits booked for ${dayLabel(dayOffset).toLowerCase()}`}
          emptyAction={
            isToday ? (
              <Button size="sm" variant="outline" onClick={() => openCheckIn('now')}>
                Add the first patient
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => openCheckIn('book')}>
                Book a visit
              </Button>
            )
          }
        />
      )}

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
