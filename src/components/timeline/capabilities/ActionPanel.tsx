import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Zap, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, Flame } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'
import type { BlockAction, BlockDefinition } from '../../../types'
import { formatDateTime } from '../../../lib/utils'
import { Button } from '../../ui'
import { cn } from '../../../lib/utils'

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  pending:      { label: 'Pending',      icon: Clock,         color: 'text-amber-600' },
  submitted:    { label: 'Submitted',    icon: Loader2,       color: 'text-blue-600' },
  acknowledged: { label: 'Acknowledged', icon: AlertCircle,   color: 'text-indigo-600' },
  in_progress:  { label: 'In Progress',  icon: Loader2,       color: 'text-blue-600' },
  completed:    { label: 'Completed',    icon: CheckCircle2,  color: 'text-green-600' },
  cancelled:    { label: 'Cancelled',    icon: XCircle,       color: 'text-red-500' },
}

export function ActionPanel({
  blockId,
  encounterId,
  patientId,
  definition,
  blockContent,
  readOnly = false,
  allowSendOrder = true,
  onSentChange,
  onOrderFulfilledPreferCollapsed,
}: {
  blockId: string
  encounterId: string
  patientId: string
  definition: BlockDefinition
  blockContent?: Record<string, unknown>
  readOnly?: boolean
  /** False until the block is saved (not draft/template) and not actively being edited */
  allowSendOrder?: boolean
  onSentChange?: (sent: boolean) => void
  /** When results are linked (completed + result_block_id) and nothing is in-flight, parent may collapse the request block */
  onOrderFulfilledPreferCollapsed?: () => void
}) {
  const { user } = useAuthStore()
  const [actions, setActions]       = useState<BlockAction[]>([])
  const [triggering, setTriggering] = useState(false)
  const [sendError, setSendError]   = useState<string | null>(null)
  const [deptName, setDeptName]     = useState<string | null>(null)
  const [deptSlug, setDeptSlug]     = useState<string | null>(null)
  const [btId, setBtId]             = useState<string | null>(null)
  const [deptChecked, setDeptChecked] = useState(false)
  const [priority, setPriority]     = useState<'stat' | 'routine'>('routine')
  /** Synchronous guard — React state updates too late to prevent double-submit */
  const sendInFlightRef = useRef(false)
  /** Tracks pending pipeline for one-time collapse when results land */
  const prevHasPendingForCollapseRef = useRef<boolean | null>(null)

  // Look up dept + block type from department_block_types.order_block_def_id
  useEffect(() => {
    if (!definition.id) return
    supabase
      .from('department_block_types')
      .select('id, departments(name, slug)')
      .eq('order_block_def_id', definition.id)
      .eq('active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const row = data as { id: string; departments: unknown }
          const dept = Array.isArray(row.departments)
            ? (row.departments[0] as { name: string; slug: string } | undefined)
            : (row.departments as { name: string; slug: string } | null)
          setDeptName(dept?.name ?? null)
          setDeptSlug(dept?.slug ?? null)
          setBtId(row.id)
        }
        setDeptChecked(true)
      })
  }, [definition.id])

  const [actionsReady, setActionsReady] = useState(false)
  const loadActions = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('block_actions')
        .select('*')
        .eq('block_id', blockId)
        .order('triggered_at', { ascending: false })
      if (data) setActions(data as BlockAction[])
      else setActions([])
    } finally {
      setActionsReady(true)
    }
  }, [blockId])

  useEffect(() => {
    setActionsReady(false)
    prevHasPendingForCollapseRef.current = null
  }, [blockId])

  useEffect(() => {
    loadActions()
    const channel = supabase
      .channel(`actions:${blockId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'block_actions', filter: `block_id=eq.${blockId}` },
        () => loadActions(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [blockId, loadActions])

  const triggerAction = async () => {
    if (!user || !deptSlug || !allowSendOrder) return
    if (sendInFlightRef.current) return
    sendInFlightRef.current = true
    setTriggering(true)
    setSendError(null)

    // Extract order-side data to pre-populate the result block (lab: panels; radiology: studies)
    const orderPanels  = (blockContent?.panels  as string[]  | undefined) ?? undefined
    const orderStudies = (blockContent?.studies as string[]  | undefined) ?? undefined
    const orderCustom  = (blockContent?.custom   as unknown[] | undefined) ?? undefined

    try {
      const { error } = await supabase.from('block_actions').insert({
        block_id:       blockId,
        encounter_id:   encounterId,
        patient_id:     patientId,
        action_type:    deptSlug,
        action_payload: {
          block_type_id: btId,
          module:        definition.config?.action?.module,
          priority,
          ...(orderPanels !== undefined  && { panels:  orderPanels }),
          ...(orderStudies !== undefined && { studies: orderStudies }),
          ...(orderCustom !== undefined  && { custom:  orderCustom }),
        },
        status:         'pending',
        triggered_by:   user.id,
      })
      if (error) {
        setSendError(error.message || 'Could not send order. Try again or check your connection.')
      } else {
        // Refresh before dropping the in-flight UI so Send stays hidden (avoids second click gap)
        await loadActions()
      }
    } finally {
      sendInFlightRef.current = false
      setTriggering(false)
    }
  }

  const hasPending  = actions.some(a => ['pending', 'submitted', 'acknowledged', 'in_progress'].includes(a.status))
  const hasCompletedOrder = actions.some(a => a.status === 'completed')
  const sendLabel   = deptName ? `Send to ${deptName}` : null

  const completedWithResult = useMemo(
    () => actions.some(a => a.status === 'completed' && Boolean(a.result_block_id)),
    [actions],
  )

  // In-flight or completed → treat as sent (locks editing; hides Send after fulfilment)
  useEffect(() => {
    onSentChange?.(hasPending || hasCompletedOrder)
  }, [hasPending, hasCompletedOrder, onSentChange])

  /** Collapse request block once results exist: first snapshot after load, or pending → idle transition */
  useEffect(() => {
    if (!actionsReady || !onOrderFulfilledPreferCollapsed) return
    const prev = prevHasPendingForCollapseRef.current
    if (!hasPending && completedWithResult && (prev === null || prev === true)) {
      onOrderFulfilledPreferCollapsed()
    }
    prevHasPendingForCollapseRef.current = hasPending
  }, [actionsReady, hasPending, completedWithResult, onOrderFulfilledPreferCollapsed])

  // Not a department-linked order block and no history → render nothing
  if (deptChecked && !deptName && actions.length === 0) return null

  return (
    <>
      <div className="border-t border-border/50 bg-amber-50/30 dark:bg-amber-950/10">
        <div className="px-3 py-2 space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-xs font-medium text-amber-800 dark:text-amber-400 flex-1">
              {deptName ? `Order → ${deptName}` : 'Order Block'}
            </span>
            {!readOnly && !hasPending && !sendLabel && (
              <span className="text-[10px] text-muted-foreground italic">Not linked to a department</span>
            )}
          </div>

          {/* Priority + Send row — hide once an order exists (in-flight or completed) */}
          {!readOnly && !hasPending && !hasCompletedOrder && sendLabel && (
            <div className="flex items-center gap-2 flex-wrap">
              {allowSendOrder ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPriority(p => p === 'stat' ? 'routine' : 'stat')}
                    disabled={triggering}
                    className={cn(
                      'flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold border transition-colors',
                      priority === 'stat'
                        ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-700 dark:text-red-400'
                        : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted',
                      triggering && 'opacity-50 pointer-events-none',
                    )}
                  >
                    <Flame className="w-3 h-3" />
                    STAT
                  </button>
                  <span className="text-[10px] text-muted-foreground flex-1 min-w-[120px]">
                    {priority === 'stat' ? 'Urgent — top of queue' : 'Routine priority'}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={triggerAction}
                    disabled={triggering}
                  >
                    {triggering ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</> : sendLabel}
                  </Button>
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Save this block before sending to the department.
                </p>
              )}
              {sendError && (
                <p className="flex items-center gap-1 w-full text-[11px] text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {sendError}
                </p>
              )}
            </div>
          )}

          {/* Action history */}
          {actions.length > 0 && (
            <div className="space-y-1">
              {actions.map(action => {
                const cfg  = STATUS_CONFIG[action.status] ?? STATUS_CONFIG.pending
                const Icon = cfg.icon
                const isStat = action.action_payload?.priority === 'stat'
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-2 text-xs bg-white/60 dark:bg-white/5 rounded border border-amber-200/50 px-2 py-1"
                  >
                    <Icon className={cn('w-3 h-3 mt-0.5 shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <span className={cn('font-medium', cfg.color)}>{cfg.label}</span>
                      {isStat && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                          <Flame className="w-2.5 h-2.5" /> STAT
                        </span>
                      )}
                      <span className="text-muted-foreground ml-1">
                        · {formatDateTime(action.triggered_at)}
                      </span>
                      {action.result_block_id && action.status === 'completed' && (
                        <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                          · result ↓ below
                        </span>
                      )}
                      {action.status === 'cancelled' && action.cancel_reason && (
                        <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">
                          Reason: {action.cancel_reason}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {actions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No orders sent yet.
              {sendLabel && allowSendOrder && ` Click "${sendLabel}" to send.`}
              {sendLabel && !allowSendOrder && !readOnly && ' Save the block first, then send.'}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
