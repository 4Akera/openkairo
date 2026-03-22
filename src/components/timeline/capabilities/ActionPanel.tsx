import { useState, useEffect } from 'react'
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
  readOnly = false,
}: {
  blockId: string
  encounterId: string
  patientId: string
  definition: BlockDefinition
  readOnly?: boolean
}) {
  const { user, profile } = useAuthStore()
  const [actions, setActions] = useState<BlockAction[]>([])
  const [triggering, setTriggering] = useState(false)

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
  }, [blockId])

  const loadActions = async () => {
    const { data } = await supabase
      .from('block_actions')
      .select('*')
      .eq('block_id', blockId)
      .order('triggered_at', { ascending: false })
    if (data) setActions(data as BlockAction[])
  }

  const triggerAction = async () => {
    if (!user || !definition.config.action) return
    setTriggering(true)
    await supabase.from('block_actions').insert({
      block_id: blockId,
      encounter_id: encounterId,
      patient_id: patientId,
      action_type: definition.config.action.event,
      action_payload: { module: definition.config.action.module },
      status: 'pending',
      triggered_by: user.id,
    })
    setTriggering(false)
  }

  const hasPending = actions.some((a) => ['pending', 'submitted', 'in_progress'].includes(a.status))
  const actionConfig = definition.config.action

  return (
    <div className="border-t border-border/50 bg-amber-50/30">
      <div className="px-3 py-2 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-xs font-medium text-amber-800">
            {actionConfig ? `Action: ${actionConfig.event}` : 'Action Block'}
          </span>
          {!readOnly && !hasPending && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 text-xs"
              onClick={triggerAction}
              disabled={triggering}
            >
              {triggering ? 'Triggering…' : 'Trigger'}
            </Button>
          )}
        </div>

        {/* Action history */}
        {actions.length > 0 && (
          <div className="space-y-1">
            {actions.map((action) => {
              const cfg = STATUS_CONFIG[action.status] ?? STATUS_CONFIG.pending
              const Icon = cfg.icon
              return (
                <div
                  key={action.id}
                  className="flex items-start gap-2 text-xs bg-white/60 rounded border border-amber-200/50 px-2 py-1"
                >
                  <Icon className={cn('w-3 h-3 mt-0.5 flex-shrink-0', cfg.color)} />
                  <div className="flex-1 min-w-0">
                    <span className={cn('font-medium', cfg.color)}>{cfg.label}</span>
                    <span className="text-muted-foreground ml-1">
                      · {formatDateTime(action.triggered_at)}
                    </span>
                    {action.result_data && (
                      <p className="text-muted-foreground truncate mt-0.5">
                        {JSON.stringify(action.result_data)}
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
            No actions triggered yet.
            {!readOnly && !profile && ' Set your profile to enable triggering.'}
          </p>
        )}

        <p className="text-[10px] text-muted-foreground/60">
          Full order module integration coming soon.
        </p>
      </div>
    </div>
  )
}
