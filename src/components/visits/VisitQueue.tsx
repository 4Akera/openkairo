/**
 * VisitQueue — the one queue renderer for patient flow, shared by the Front
 * Desk (all queues) and each department page (its own queue). Sections adapt
 * to configuration: stages configured → grouped by stage; none → a single
 * arrival-ordered list; bookings appear only when they exist.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useNow } from '../../hooks/useNow'
import {
  visitPatient, arriveVisit, cancelVisit, updateVisit,
  referralSourceLabel, waitSeverity, isArrivableBooking,
} from '../../lib/visits'
import { CheckoutDialog } from './CheckoutDialog'
import { SearchSelect } from '../ui/SearchSelect'
import type { Visit } from '../../types'
import { fullName, formatDateTime, minutesBetween, formatMinutes, cn } from '../../lib/utils'
import {
  Button, Input, ScrollArea,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui'
import {
  ClipboardList, Clock, Loader2, LogOut, XCircle, Stethoscope,
  ChevronRight, CheckCircle2, UserPlus, History,
} from 'lucide-react'

export function VisitQueue({
  visits,
  carriedOver = [],
  profileNames,
  loading,
  emptyLabel = 'No patients today yet',
  emptyAction,
}: {
  visits: Visit[]
  /** Unfinished visits from previous days — shown as a quiet section */
  carriedOver?: Visit[]
  profileNames: Record<string, string>
  loading: boolean
  emptyLabel?: string
  emptyAction?: React.ReactNode
}) {
  const navigate = useNavigate()
  const { user, hasRole } = useAuthStore()
  const { nameFormat, flowStages } = useSettingsStore()
  const now = useNow()
  const [checkoutVisit, setCheckoutVisit] = useState<Visit | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  // Physician + reason are assigned inline on the row, after arrival
  const [physicians, setPhysicians] = useState<{ id: string; full_name: string }[]>([])
  const [reasonEditId, setReasonEditId] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')
  // Removing from the queue is the row's one destructive action — it takes
  // two taps: the X arms ("Remove?"), a second tap within 4s confirms.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmCancelId) return
    const t = setTimeout(() => setConfirmCancelId(null), 4000)
    return () => clearTimeout(t)
  }, [confirmCancelId])

  useEffect(() => {
    supabase.rpc('get_physicians_list').then(({ data }) => {
      setPhysicians((data ?? []) as { id: string; full_name: string }[])
    })
  }, [])

  const physicianItems = useMemo(
    () => physicians.map(p => ({ value: p.id, label: p.full_name })),
    [physicians],
  )

  const saveReason = (v: Visit) => {
    setReasonEditId(null)
    if (reasonDraft.trim() !== (v.reason ?? '')) {
      void updateVisit(v.id, { reason: reasonDraft.trim() || null })
    }
  }

  const firstStage = flowStages[0] ?? null

  const upcoming = visits.filter(v => !v.arrived_at && v.scheduled_at)
  const active   = visits.filter(v => v.arrived_at && !v.finished_at)
  const finished = visits.filter(v => !!v.finished_at)

  /** Stage groups preserve the configured order; unknown stages tail the list. */
  const stageGroups = useMemo(() => {
    if (flowStages.length === 0) return null
    const groups = new Map<string, Visit[]>()
    for (const s of flowStages) groups.set(s, [])
    for (const v of active) {
      const key = v.stage && groups.has(v.stage) ? v.stage : (v.stage || flowStages[0])
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(v)
    }
    return groups
  }, [active, flowStages])

  function waitTime(iso: string): string {
    const m = Math.floor((now - new Date(iso).getTime()) / 60000)
    if (m < 1) return 'now'
    if (m < 60) return `${m}m`
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }

  /**
   * One-tap journey step: the queue row IS the encounter. Opening it
   * self-assigns physicians when unassigned and advances the stage to the
   * second configured stage ("With doctor" in the default preset).
   */
  const openEncounter = async (v: Visit) => {
    const pt = visitPatient(v)
    if (!pt || startingId) return
    setStartingId(v.id)
    const patch: Parameters<typeof updateVisit>[1] = {}
    if (!v.assigned_to && user && hasRole('physician')) patch.assigned_to = user.id
    if (v.status === 'open' && flowStages.length > 1 && (!v.stage || v.stage === flowStages[0])) {
      patch.stage = flowStages[1]
    }
    if (Object.keys(patch).length > 0) await updateVisit(v.id, patch)
    setStartingId(null)
    navigate(`/patients/${pt.id}/encounters/${v.id}`)
  }

  const renderVisit = (v: Visit) => {
    const pt = visitPatient(v)
    const isActive = !!v.arrived_at && !v.finished_at
    const readyForCheckout = isActive && v.status === 'closed'
    const assignedName = v.assigned_to ? profileNames[v.assigned_to] : null
    const referredFrom = referralSourceLabel(v)
    return (
      <div
        key={v.id}
        className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors group"
      >
        <button
          className="flex items-center gap-3 min-w-0 text-left shrink-0"
          onClick={() => pt && navigate(`/patients/${pt.id}`)}
        >
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
            {pt ? `${pt.first_name[0] ?? ''}${pt.last_name[0] ?? ''}` : '?'}
          </div>
        </button>
        <div className="flex-1 min-w-0">
          <button
            className="block max-w-full text-left"
            onClick={() => pt && navigate(`/patients/${pt.id}`)}
          >
            <p className="font-medium text-sm truncate">
              {pt ? fullName(pt, nameFormat) : 'Unknown patient'}
              {readyForCheckout && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> ready for checkout
                </span>
              )}
            </p>
          </button>
          {reasonEditId === v.id ? (
            <Input
              autoFocus
              value={reasonDraft}
              placeholder="Reason for visit…"
              className="h-6 mt-0.5 text-xs max-w-[280px]"
              onChange={e => setReasonDraft(e.target.value)}
              onBlur={() => saveReason(v)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveReason(v)
                if (e.key === 'Escape') setReasonEditId(null)
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground truncate">
              {v.finished_at
                ? (() => {
                    const mins = minutesBetween(v.arrived_at, v.finished_at)
                    return (
                      <>
                        finished {formatDateTime(v.finished_at)}
                        {mins != null && mins > 0 && <> · {formatMinutes(mins)} visit</>}
                      </>
                    )
                  })()
                : v.arrived_at
                  ? (() => {
                      const severity = waitSeverity(v.arrived_at, now)
                      return (
                        <>waiting <span className={cn(
                          'font-medium',
                          severity === 'ok' && 'text-foreground/70',
                          severity === 'long' && 'text-amber-600 dark:text-amber-400',
                          severity === 'critical' && 'text-red-600 dark:text-red-400',
                        )}>{waitTime(v.arrived_at)}</span></>
                      )
                    })()
                  : v.scheduled_at ? formatDateTime(v.scheduled_at) : null}
              {referredFrom && <> · <span className="text-primary/80">← from {referredFrom}</span></>}
              {assignedName && <> · {assignedName}</>}
              {!v.finished_at ? (
                <button
                  className="ml-1 hover:text-foreground hover:underline decoration-dotted"
                  onClick={() => { setReasonDraft(v.reason ?? ''); setReasonEditId(v.id) }}
                >
                  {v.reason || <span className="opacity-60">+ reason</span>}
                </button>
              ) : (
                v.reason && <> · {v.reason}</>
              )}
            </p>
          )}
        </div>

        {/* Inline physician assignment — appears until someone is assigned */}
        {!v.finished_at && !v.assigned_to && physicians.length > 0 && (
          <SearchSelect
            items={physicianItems}
            onSelect={(id) => { if (id) void updateVisit(v.id, { assigned_to: id }) }}
            placeholder={<span className="flex items-center gap-1"><UserPlus className="h-3 w-3" /> Assign</span>}
            searchPlaceholder="Search physician…"
            className="w-[110px] shrink-0 text-muted-foreground"
          />
        )}

        {/* Stage selector (only when stages are configured and visit is in queue) */}
        {isActive && flowStages.length > 0 && (
          <Select
            value={v.stage && flowStages.includes(v.stage) ? v.stage : flowStages[0]}
            onValueChange={(s) => { void updateVisit(v.id, { stage: s }) }}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {flowStages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {/* Bookings arrive only on their own day — never early, never from a stale past-day view */}
          {isArrivableBooking(v) && (
            <Button size="sm" variant="outline" onClick={() => void arriveVisit(v.id, firstStage)}>
              Arrived
            </Button>
          )}
          {isActive && (
            <Button
              size="sm"
              variant="outline"
              className="text-primary border-primary/40"
              disabled={startingId === v.id}
              title="Open the encounter"
              onClick={() => void openEncounter(v)}
            >
              {startingId === v.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Stethoscope className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Open</span>
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="ghost" onClick={() => setCheckoutVisit(v)}>
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Done</span>
            </Button>
          )}
          {!v.finished_at && (
            confirmCancelId === v.id ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 dark:text-red-400 hover:text-red-600"
                onClick={() => { setConfirmCancelId(null); void cancelVisit(v.id) }}
              >
                <XCircle className="h-3.5 w-3.5" />
                Remove?
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground/60 hover:text-foreground"
                title="Remove from queue"
                onClick={() => setConfirmCancelId(v.id)}
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            )
          )}
          {v.finished_at && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
    )
  }

  const sectionHeader = (label: string, count: number, icon: React.ReactNode) => (
    <div className="flex items-center gap-1.5 px-4 pt-4 pb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {icon}{label}
      {count > 0 && (
        <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
          {count}
        </span>
      )}
    </div>
  )

  return (
    <>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
          </div>
        ) : visits.length === 0 && carriedOver.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <ClipboardList className="h-8 w-8 opacity-30" />
            <p className="text-sm">{emptyLabel}</p>
            {emptyAction}
          </div>
        ) : (
          <div className="pb-6">
            {/* Unfinished visits from previous days — finish or cancel */}
            {carriedOver.length > 0 && (
              <>
                {sectionHeader('Carried over', carriedOver.length, <History className="h-3.5 w-3.5 text-amber-600" />)}
                <p className="px-4 pb-1.5 -mt-1 text-[11px] text-muted-foreground">
                  Arrived on a previous day and never finished.
                </p>
                <div className="divide-y divide-border border-y border-border bg-amber-500/[0.04]">
                  {carriedOver.map(renderVisit)}
                </div>
              </>
            )}

            {upcoming.length > 0 && (
              <>
                {sectionHeader('Upcoming', upcoming.length, <Clock className="h-3.5 w-3.5" />)}
                <div className="divide-y divide-border border-y border-border">
                  {upcoming.map(renderVisit)}
                </div>
              </>
            )}

            {stageGroups
              ? [...stageGroups.entries()].map(([stage, rows]) =>
                  rows.length === 0 ? null : (
                    <div key={stage}>
                      {sectionHeader(stage, rows.length, <Stethoscope className="h-3.5 w-3.5" />)}
                      <div className="divide-y divide-border border-y border-border">
                        {rows.map(renderVisit)}
                      </div>
                    </div>
                  ),
                )
              : active.length > 0 && (
                  <>
                    {sectionHeader('In queue', active.length, <Stethoscope className="h-3.5 w-3.5" />)}
                    <div className="divide-y divide-border border-y border-border">
                      {active.map(renderVisit)}
                    </div>
                  </>
                )}

            {finished.length > 0 && (
              <>
                {sectionHeader('Done', finished.length, <CheckCircle2 className="h-3.5 w-3.5" />)}
                <div className="divide-y divide-border border-y border-border opacity-60">
                  {finished.map(renderVisit)}
                </div>
              </>
            )}
          </div>
        )}
      </ScrollArea>

      <CheckoutDialog visit={checkoutVisit} onClose={() => setCheckoutVisit(null)} />
    </>
  )
}
