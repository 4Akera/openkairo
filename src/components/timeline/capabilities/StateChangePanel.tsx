import { ArrowRight, AlertCircle } from 'lucide-react'
import type { Block, BlockDefinition } from '../../../types'
import { cn } from '../../../lib/utils'

export function StateChangePanel({
  block,
  definition,
}: {
  block: Block
  definition: BlockDefinition
}) {
  const changes = definition.config.state_changes
  if (!changes) return null

  const allFields = [
    ...(changes.encounter ?? []).map((f) => ({ scope: 'Encounter', field: f })),
    ...(changes.patient ?? []).map((f) => ({ scope: 'Patient Record', field: f })),
  ]

  if (allFields.length === 0) return null

  const isMasked = block.state === 'masked'

  return (
    <div
      className={cn(
        'border-t border-border/50 px-3 py-2',
        isMasked ? 'bg-muted/20' : 'bg-indigo-50/40',
      )}
    >
      <div className="flex items-start gap-2">
        <ArrowRight className="w-3.5 h-3.5 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-indigo-800">State Changes</p>
          <div className="flex flex-wrap gap-1.5">
            {allFields.map(({ scope, field }) => (
              <span
                key={`${scope}:${field}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200"
              >
                <span className="opacity-60">{scope}</span>
                <span>·</span>
                <span className="font-medium capitalize">{field.replace(/_/g, ' ')}</span>
              </span>
            ))}
          </div>
          {!isMasked && (
            <div className="flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3 text-indigo-500" />
              <p className="text-[10px] text-indigo-600">
                State module integration pending. Changes will apply when State Module is active.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
