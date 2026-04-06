import { useState, useEffect, useCallback } from 'react'
import { Zap, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
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
  onSentChange,
}: {
  blockId: string
  encounterId: string
  patientId: string
  definition: BlockDefinition
  blockContent?: Record<string, unknown>
  readOnly?: boolean
  onSentChange?: (sent: boolean) => void
}) {
  const { user } = useAuthStore()
  const [actions, setActions]       = useState<BlockAction[]>([])
  const [triggering, setTriggering] = useState(false)
  const [deptName, setDeptName]     = useState<string | null>(null)
  const [deptSlug, setDeptSlug]     = useState<string | null>(null)
  const [btId, setBtId]             = useState<string | null>(null)

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
      })
  }, [definition.id])

  const loadActions = useCallback(async () => {
    const { data } = await supabase
      .from('block_actions')
      .select('*')
      .eq('block_id', blockId)
      .order('triggered_at', { ascending: false })
    if (data) setActions(data as BlockAction[])
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
    if (!user || !deptSlug) return
    setTriggering(true)

    // Extract order-side data to pre-populate the result block (e.g. panels for lab_result)
    const orderPanels  = (blockContent?.panels  as string[]  | undefined) ?? undefined
    const orderCustom  = (blockContent?.custom   as unknown[] | undefined) ?? undefined

    await supabase.from('block_actions').insert({
      block_id:       blockId,
      encounter_id:   encounterId,
      patient_id:     patientId,
      action_type:    deptSlug,
      action_payload: {
        block_type_id: btId,
        module:        definition.config?.action?.module,
        ...(orderPanels !== undefined  && { panels:  orderPanels }),
        ...(orderCustom !== undefined  && { custom:  orderCustom }),
      },
      status:         'pending',
      triggered_by:   user.id,
    })
    setTriggering(false)
  }

  const hasPending  = actions.some(a => ['pending', 'submitted', 'in_progress'].includes(a.status))
  const sendLabel   = deptName ? `Send to ${deptName}` : null  // null = not linked to any dept

  // Notify parent when order is sent (locks editing in BlockWrapper)
  useEffect(() => { onSentChange?.(hasPending) }, [hasPending, onSentChange])

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
            {!readOnly && !hasPending && sendLabel && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={triggerAction}
                disabled={triggering}
              >
                {triggering ? <><Loader2 className="h-3 w-3 animate-spin" /> Sending…</> : sendLabel}
              </Button>
            )}
            {!readOnly && !hasPending && !sendLabel && (
              <span className="text-[10px] text-muted-foreground italic">Not linked to a department</span>
            )}
          </div>

          {/* Action history */}
          {actions.length > 0 && (
            <div className="space-y-1">
              {actions.map(action => {
                const cfg  = STATUS_CONFIG[action.status] ?? STATUS_CONFIG.pending
                const Icon = cfg.icon
                return (
                  <div
                    key={action.id}
                    className="flex items-start gap-2 text-xs bg-white/60 dark:bg-white/5 rounded border border-amber-200/50 px-2 py-1"
                  >
                    <Icon className={cn('w-3 h-3 mt-0.5 shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <span className={cn('font-medium', cfg.color)}>{cfg.label}</span>
                      <span className="text-muted-foreground ml-1">
                        · {formatDateTime(action.triggered_at)}
                      </span>
                      {action.result_block_id && action.status === 'completed' && (
                        <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                          · result ↓ below
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {actions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No orders sent yet.{sendLabel && ` Click "${sendLabel}" to send.`}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
