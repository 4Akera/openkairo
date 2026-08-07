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
  visitPatient, visitEncounter, arriveVisit, finishVisit, cancelVisit, updateVisit,
  referralSourceLabel,
} from '../../lib/visits'
import type { Visit } from '../../types'
import { fullName, formatDateTime } from '../../lib/utils'
import {
  Button, Input, ScrollArea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui'
import {
  ClipboardList, Clock, Loader2, LogOut, XCircle, Stethoscope,
  ChevronRight, AlertTriangle, CheckCircle2, UserPlus,
} from 'lucide-react'

type CheckoutInfo = {
  visit: Visit
  pendingCharges: { id: string; description: string; status: string }[]
  openOrders: { id: string; action_type: string; status: string }[]
  loading: boolean
}

export function VisitQueue({
  visits,
  profileNames,
  loading,
  emptyLabel = 'No patients today yet',
  emptyAction,
}: {
  visits: Visit[]
  profileNames: Record<string, string>
  loading: boolean
  emptyLabel?: string
  emptyAction?: React.ReactNode
}) {
  const navigate = useNavigate()
  const { user, hasRole } = useAuthStore()
  const { nameFormat, flowStages } = useSettingsStore()
  const now = useNow()
  const [checkout, setCheckout] = useState<CheckoutInfo | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  // Physician + reason are assigned inline on the row, after check-in
  const [physicians, setPhysicians] = useState<{ id: string; full_name: string }[]>([])
  const [reasonEditId, setReasonEditId] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')

  useEffect(() => {
    supabase.rpc('get_physicians_list').then(({ data }) => {
      setPhysicians((data ?? []) as { id: string; full_name: string }[])
    })
  }, [])

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

  const openCheckout = async (visit: Visit) => {
    setCheckout({ visit, pendingCharges: [], openOrders: [], loading: true })
    const patient = visitPatient(visit)
    const enc = visitEncounter(visit)
    const [chargesRes, ordersRes] = await Promise.all([
      patient
        ? supabase
            .from('charges')
            .select('id, description, status')
            .eq('patient_id', patient.id)
            .in('status', ['pending', 'pending_approval', 'invoiced'])
        : Promise.resolve({ data: [] }),
      enc
        ? supabase
            .from('block_actions')
            .select('id, action_type, status')
            .eq('encounter_id', enc.id)
            .not('status', 'in', '("completed","cancelled")')
        : Promise.resolve({ data: [] }),
    ])
    setCheckout(prev => prev && prev.visit.id === visit.id
      ? {
          visit,
          pendingCharges: (chargesRes.data ?? []) as CheckoutInfo['pendingCharges'],
          openOrders: (ordersRes.data ?? []) as CheckoutInfo['openOrders'],
          loading: false,
        }
      : prev)
  }

  const confirmCheckout = async () => {
    if (!checkout) return
    await finishVisit(checkout.visit.id)
    setCheckout(null)
  }

  /**
   * One-tap journey step: waiting visit → open encounter. Creates the
   * encounter (physician carried over from the visit, or self for
   * physicians), links it to the visit, advances the stage to the second
   * configured stage ("With doctor" in the default preset), and navigates
   * straight in — no patient-page detour.
   */
  const startEncounter = async (v: Visit) => {
    const pt = visitPatient(v)
    if (!pt || !user || startingId) return
    const assigned = v.assigned_to ?? (hasRole('physician') ? user.id : null)
    if (!assigned && !hasRole('admin')) return
    setStartingId(v.id)
    const encounterId = crypto.randomUUID()
    const { error } = await supabase.from('encounters').insert({
      id: encounterId,
      patient_id: pt.id,
      status: 'open',
      visibility: 'private',
      visible_to_roles: [],
      assigned_to: assigned,
      created_by: user.id,
    })
    if (!error) {
      const nextStage =
        flowStages.length > 1 && (!v.stage || v.stage === flowStages[0])
          ? flowStages[1]
          : v.stage
      await updateVisit(v.id, { encounter_id: encounterId, assigned_to: assigned, stage: nextStage })
      navigate(`/patients/${pt.id}/encounters/${encounterId}`)
    }
    setStartingId(null)
  }

  const renderVisit = (v: Visit) => {
    const pt = visitPatient(v)
    const enc = visitEncounter(v)
    const isActive = !!v.arrived_at && !v.finished_at
    const readyForCheckout = isActive && enc?.status === 'closed'
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
                ? <>checked out {formatDateTime(v.finished_at)}</>
                : v.arrived_at
                  ? <>waiting <span className="font-medium text-foreground/70">{waitTime(v.arrived_at)}</span></>
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
          <Select onValueChange={(id) => { void updateVisit(v.id, { assigned_to: id }) }}>
            <SelectTrigger className="h-8 w-[110px] text-xs shrink-0 text-muted-foreground">
              <span className="flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Assign
              </span>
            </SelectTrigger>
            <SelectContent>
              {physicians.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
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
          {!v.arrived_at && v.scheduled_at && (
            <Button size="sm" variant="outline" onClick={() => void arriveVisit(v.id, firstStage)}>
              Check in
            </Button>
          )}
          {isActive && enc && (
            <Button
              size="sm"
              variant="ghost"
              className="text-primary"
              onClick={() => pt && navigate(`/patients/${pt.id}/encounters/${enc.id}`)}
            >
              <Stethoscope className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Encounter</span>
            </Button>
          )}
          {isActive && !enc && (
            <Button
              size="sm"
              variant="outline"
              className="text-primary border-primary/40"
              disabled={startingId === v.id || (!v.assigned_to && !hasRole('physician') && !hasRole('admin'))}
              title={!v.assigned_to && !hasRole('physician') && !hasRole('admin')
                ? 'Assign a physician first'
                : 'Create the encounter and open it'}
              onClick={() => void startEncounter(v)}
            >
              {startingId === v.id
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Stethoscope className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Start encounter</span>
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="ghost" onClick={() => void openCheckout(v)}>
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Check out</span>
            </Button>
          )}
          {!v.finished_at && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground opacity-0 group-hover:opacity-100"
              onClick={() => void cancelVisit(v.id)}
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
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
        ) : visits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
            <ClipboardList className="h-8 w-8 opacity-30" />
            <p className="text-sm">{emptyLabel}</p>
            {emptyAction}
          </div>
        ) : (
          <div className="pb-6">
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
                {sectionHeader('Checked out', finished.length, <CheckCircle2 className="h-3.5 w-3.5" />)}
                <div className="divide-y divide-border border-y border-border opacity-60">
                  {finished.map(renderVisit)}
                </div>
              </>
            )}
          </div>
        )}
      </ScrollArea>

      {/* ── Checkout dialog ── */}
      <Dialog open={!!checkout} onOpenChange={(o) => { if (!o) setCheckout(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check out</DialogTitle>
            <DialogDescription>
              {checkout && visitPatient(checkout.visit)
                ? fullName(visitPatient(checkout.visit)!, nameFormat)
                : ''}
            </DialogDescription>
          </DialogHeader>
          {checkout?.loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking charges and orders…
            </div>
          ) : checkout && (
            <div className="space-y-3">
              {checkout.pendingCharges.length === 0 && checkout.openOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  No pending charges or open orders.
                </p>
              ) : (
                <div className="space-y-2">
                  {checkout.pendingCharges.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {checkout.pendingCharges.length} unsettled charge{checkout.pendingCharges.length > 1 ? 's' : ''}
                      </p>
                      <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                        {checkout.pendingCharges.slice(0, 5).map(c => (
                          <li key={c.id} className="truncate">{c.description} · {c.status}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {checkout.openOrders.length > 0 && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {checkout.openOrders.length} order{checkout.openOrders.length > 1 ? 's' : ''} still in progress
                      </p>
                      <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                        {checkout.openOrders.slice(0, 5).map(o => (
                          <li key={o.id} className="capitalize truncate">{o.action_type} · {o.status.replace('_', ' ')}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    You can still check the patient out — this is only a heads-up.
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCheckout(null)}>Cancel</Button>
                <Button onClick={() => void confirmCheckout()}>
                  <LogOut className="h-3.5 w-3.5" /> Check out
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
