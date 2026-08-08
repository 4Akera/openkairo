/**
 * Front Desk — the day, as three lanes behind one switcher:
 *
 *  - Queue   — today's patient queue (day nav, per-queue filter, Mine).
 *  - Cashier — patients who owe money or wait on an insurer; rows open the
 *              money view (/billing?patient=…), a search box covers
 *              walk-ups. This IS the billing surface — the old standalone
 *              Billing landing collapsed into it.
 *  - Open    — every open encounter, any day (the old registry filter).
 *
 * Controls are scoped to the lane they affect: day nav, queue filter and
 * Mine belong to Queue/Open; search belongs to Cashier; Book and
 * "+ Patient" are the day's constant actions on the right. Billing-only
 * staff get the Cashier lane alone (titled "Cashier").
 *
 * Queue rendering lives in VisitQueue and "+ Patient" in CheckInDialog —
 * both shared with the per-department Patients tabs.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Patient } from '../types'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useVisitQueue } from '../hooks/useVisits'
import { averageWaitMinutes, visitPatient } from '../lib/visits'
import type { Visit } from '../types'
import { VisitQueue } from '../components/visits/VisitQueue'
import { CheckInDialog } from '../components/visits/CheckInDialog'
import type { Department } from '../types'
import {
  Button, Badge, Input,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'
import {
  ClipboardList, UserPlus, CalendarPlus, ChevronLeft, ChevronRight, ChevronDown,
  UserCheck, FolderOpen, Loader2, Receipt, Search, Users,
} from 'lucide-react'
import { cn, fullName, formatDateTime, formatMinutes } from '../lib/utils'

const GENERAL_QUEUE = 'general'

type Lane = 'queue' | 'cashier' | 'open'

type CashierRow = {
  patient: Patient
  due: number
  insuranceTotal: number
  insuranceCount: number
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
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function offsetForDateKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  const picked = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Round absorbs DST-shortened/lengthened days
  return Math.round((picked.getTime() - today.getTime()) / 86_400_000)
}

export default function FrontDeskPage() {
  const { user, hasRole, hasBilling } = useAuthStore()
  const { nameFormat, billingEnabled, currencySymbol } = useSettingsStore()
  const navigate = useNavigate()

  const canUse = hasRole('receptionist') || hasRole('admin') || hasRole('physician') || hasRole('nurse')
  const showCashier = billingEnabled && hasBilling
  // Billing-only staff: the Cashier lane IS their day view.
  const billingOnly = !canUse && showCashier

  // Day navigation: today is the default; arrows reveal booked future days
  const [dayOffset, setDayOffset] = useState(0)
  const { visits, carriedOver, profileNames, loading } = useVisitQueue(dateKeyFor(dayOffset))
  const isToday = dayOffset === 0

  const [patientDepts, setPatientDepts] = useState<Department[]>([])
  const [deptFilter, setDeptFilter] = useState<string>('all')
  // "Mine" = visits assigned to me: the clinician's worklist lives in the
  // day view instead of a separate list elsewhere.
  const [mineOnly, setMineOnly] = useState(false)

  const [laneChoice, setLaneChoice] = useState<Lane>('queue')
  const lane: Lane = billingOnly ? 'cashier' : laneChoice

  // "Open" = every open encounter regardless of day — covers what the
  // registry's Open filter used to, now that Patients has no nav entry.
  const [openRows, setOpenRows] = useState<Visit[] | null>(null)
  const [cashierRows, setCashierRows] = useState<CashierRow[] | null>(null)
  // Cashier walk-up search (deposits, old debts — patients not in the list)
  const [cashQuery, setCashQuery] = useState('')
  const [cashResults, setCashResults] = useState<Patient[] | null>(null)

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

  useEffect(() => {
    if (lane !== 'cashier') { setCashierRows(null); return }
    let cancelled = false
    // Same ledger as the money view (patient_balance = charges − payments),
    // so the amount here always matches what Collect will ask for; patients
    // waiting only on an insurer are included with an insurance chip.
    Promise.all([
      supabase
        .from('patient_balance')
        .select('patient_id, balance')
        .gt('balance', 0)
        .order('balance', { ascending: false })
        .limit(200),
      supabase
        .from('charges')
        .select('patient_id, quantity, unit_price')
        .eq('status', 'pending_insurance'),
    ]).then(async ([balRes, insRes]) => {
      if (cancelled) return
      const dueById = new Map<string, number>()
      for (const r of (balRes.data ?? []) as { patient_id: string; balance: number }[]) {
        dueById.set(r.patient_id, Number(r.balance))
      }
      const insById = new Map<string, { total: number; count: number }>()
      for (const r of (insRes.data ?? []) as { patient_id: string; quantity: number; unit_price: number }[]) {
        const agg = insById.get(r.patient_id) ?? { total: 0, count: 0 }
        agg.total += Number(r.quantity) * Number(r.unit_price)
        agg.count += 1
        insById.set(r.patient_id, agg)
      }
      const ids = [...new Set([...dueById.keys(), ...insById.keys()])]
      if (ids.length === 0) { setCashierRows([]); return }
      const { data: pts } = await supabase.from('patients').select('*').in('id', ids)
      if (cancelled) return
      const byId = new Map(((pts ?? []) as Patient[]).map(p => [p.id, p]))
      const rows = ids.flatMap(id => {
        const patient = byId.get(id)
        if (!patient) return []
        return [{
          patient,
          due: dueById.get(id) ?? 0,
          insuranceTotal: insById.get(id)?.total ?? 0,
          insuranceCount: insById.get(id)?.count ?? 0,
        }]
      })
      rows.sort((a, b) =>
        b.due - a.due ||
        b.insuranceTotal - a.insuranceTotal ||
        fullName(a.patient, nameFormat).localeCompare(fullName(b.patient, nameFormat), undefined, { sensitivity: 'base' }))
      setCashierRows(rows)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lane])

  // Walk-up search inside the Cashier lane
  useEffect(() => {
    const q = cashQuery.trim()
    if (lane !== 'cashier' || !q) { setCashResults(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_patients', {
        p_tokens: q.split(/\s+/).filter(Boolean),
        p_limit: 20,
      })
      if (!cancelled) setCashResults((data ?? []) as Patient[])
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [cashQuery, lane])

  useEffect(() => {
    if (lane !== 'open') { setOpenRows(null); return }
    supabase
      .from('encounters')
      .select('*, patients(*)')
      .eq('status', 'open')
      .is('cancelled_at', null)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setOpenRows((data ?? []) as Visit[]))
  }, [lane])

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

  const owingById = useMemo(
    () => new Map((cashierRows ?? []).map(r => [r.patient.id, r])),
    [cashierRows],
  )

  const lanes: { id: Lane; label: string; icon: typeof Users }[] = [
    { id: 'queue', label: 'Queue', icon: Users },
    ...(showCashier ? [{ id: 'cashier' as Lane, label: 'Cashier', icon: Receipt }] : []),
    { id: 'open', label: 'Open', icon: FolderOpen },
  ]

  if (!user) return null
  if (!canUse && !showCashier) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <ClipboardList className="h-8 w-8 opacity-30" />
        <p className="text-sm">Front Desk is available to clinical and reception staff</p>
      </div>
    )
  }

  const renderCashierRow = (patient: Patient, due: number, insuranceTotal: number, insuranceCount: number) => (
    <button
      key={patient.id}
      onClick={() => navigate(`/billing?patient=${patient.id}`)}
      className="w-full flex items-center gap-3 px-4 sm:px-6 py-2.5 text-left hover:bg-accent/40 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{fullName(patient, nameFormat)}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-mono">{patient.mrn}</span>
          {insuranceCount > 0 && (
            <Badge
              variant="outline"
              className="text-[9px] py-0 px-1.5 font-medium bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800"
            >
              insurance {insuranceTotal.toFixed(2)}
            </Badge>
          )}
        </div>
      </div>
      {due > 0 && (
        <span className="font-mono text-sm text-emerald-700 dark:text-emerald-400 shrink-0">
          {currencySymbol}{due.toFixed(2)}
        </span>
      )}
    </button>
  )

  return (
    <div className="h-full flex flex-col">
      {/* Header — row 1: identity, day scope, lane count · the day's actions */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
            <h1 className="text-base font-semibold truncate">{billingOnly ? 'Cashier' : 'Front Desk'}</h1>

            {/* Day navigation — belongs to the Queue lane; Cashier/Open are day-independent */}
            {lane === 'queue' && (
              <div className="flex items-center gap-0.5 ml-1 shrink-0">
                <button
                  onClick={() => setDayOffset(o => o - 1)}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div
                  className={cn(
                    'relative px-2 h-7 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                    'flex items-center gap-1 hover:bg-accent focus-within:ring-2 focus-within:ring-ring',
                    isToday ? 'text-foreground' : 'text-primary',
                  )}
                  title="Pick a date"
                >
                  {dayLabel(dayOffset)}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                  <input
                    type="date"
                    aria-label="Pick a date"
                    value={dateKeyFor(dayOffset)}
                    onChange={e => { if (e.target.value) setDayOffset(offsetForDateKey(e.target.value)) }}
                    onClick={e => {
                      try { (e.target as HTMLInputElement).showPicker?.() } catch { /* arrows still work */ }
                    }}
                    className="absolute inset-0 h-full w-full opacity-0 cursor-pointer"
                  />
                </div>
                <button
                  onClick={() => setDayOffset(o => o + 1)}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                {!isToday && (
                  <button
                    onClick={() => setDayOffset(0)}
                    className="px-2 h-7 rounded-md text-xs font-medium text-primary hover:bg-accent transition-colors whitespace-nowrap"
                    title="Back to today"
                  >
                    Today
                  </button>
                )}
              </div>
            )}

            {/* Count badge — scoped to the active lane */}
            {lane === 'queue' && !loading && isToday && activeCount > 0 && (
              <Badge variant="secondary" className="ml-1">{activeCount} in queue</Badge>
            )}
            {lane === 'queue' && !loading && isToday && avgWait !== null && (
              <span className="text-xs text-muted-foreground hidden sm:inline">
                avg visit today {formatMinutes(avgWait)}
              </span>
            )}
            {lane === 'cashier' && cashierRows !== null && cashierRows.length > 0 && (
              <Badge variant="secondary" className="ml-1">{cashierRows.length} waiting</Badge>
            )}
            {lane === 'open' && openRows !== null && openRows.length > 0 && (
              <Badge variant="secondary" className="ml-1">{openRows.length} open</Badge>
            )}
          </div>

          {/* The day's actions — constant on the right */}
          {!billingOnly && (
            <div className="flex items-center gap-2 shrink-0">
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
          )}
        </div>

        {/* Header — row 2: lane switcher + the filters scoped to that lane */}
        <div className="flex items-center gap-2 flex-wrap">
          {!billingOnly && (
            <div className="flex items-center rounded-lg border border-border p-0.5 gap-0.5">
              {lanes.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setLaneChoice(id)}
                  className={cn(
                    'flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors',
                    lane === id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Queue lane: which queue + my worklist */}
          {lane === 'queue' && patientDepts.length > 0 && (
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
          {(lane === 'queue' || lane === 'open') && (
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
          )}

          {/* Cashier lane: walk-up search (deposit, old debt — anyone, owing or not) */}
          {lane === 'cashier' && (
            <div className="relative flex-1 min-w-[10rem] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={cashQuery}
                onChange={e => setCashQuery(e.target.value)}
                placeholder="Search any patient…"
                className="h-9 pl-8 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {lane === 'cashier' ? (
        <div className="flex-1 overflow-y-auto">
          {cashQuery.trim() ? (
            cashResults === null ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : cashResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No patients found.</p>
            ) : (
              <div className="divide-y divide-border">
                {cashResults.map(pt => {
                  const owing = owingById.get(pt.id)
                  return renderCashierRow(pt, owing?.due ?? 0, owing?.insuranceTotal ?? 0, owing?.insuranceCount ?? 0)
                })}
              </div>
            )
          ) : cashierRows === null ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : cashierRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nobody owes anything. 🎉</p>
          ) : (
            <div className="divide-y divide-border">
              {cashierRows.map(r => renderCashierRow(r.patient, r.due, r.insuranceTotal, r.insuranceCount))}
            </div>
          )}
        </div>
      ) : lane === 'open' ? (
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
                  const pt = visitPatient(v)
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
