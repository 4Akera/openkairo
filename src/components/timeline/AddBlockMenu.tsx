import { useState } from 'react'
import type { BlockDefinition } from '../../types'
import { useEncounterStore } from '../../stores/encounterStore'
import { useAuthStore } from '../../stores/authStore'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui'
import {
  Plus, FileText, ClipboardList, Stethoscope,
  Activity, Heart, Brain, TestTube, Zap, Clock, AlertTriangle,
  ArrowRight, Camera, BarChart2, Clipboard, FlaskConical, Pill,
  Star, Layers, CheckCheck,
} from 'lucide-react'
import { getDefinitionColors, cn } from '../../lib/utils'

// ============================================================
// Icon resolver
// ============================================================

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-text':      FileText,
  'clipboard-list': ClipboardList,
  'stethoscope':    Stethoscope,
  'activity':       Activity,
  'heart':          Heart,
  'brain':          Brain,
  'test-tube':      TestTube,
  'zap':            Zap,
  'clock':          Clock,
  'alert-triangle': AlertTriangle,
  'arrow-right':    ArrowRight,
  'camera':         Camera,
  'bar-chart-2':    BarChart2,
  'clipboard':      Clipboard,
  'flask-conical':  FlaskConical,
  'pill':           Pill,
  'star':           Star,
  'layers':         Layers,
  'check-check':    CheckCheck,
}

function DefIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICON_MAP[slug] ?? FileText
  return <Icon className={className} />
}

// ============================================================
// Capability chips on definition card
// ============================================================

const CAP_CHIPS: { key: keyof BlockDefinition; label: string }[] = [
  { key: 'cap_media',       label: 'Media' },
  { key: 'cap_time_series', label: 'Series' },
  { key: 'cap_immutable',   label: 'Immutable' },
  { key: 'cap_co_sign',     label: 'Co-Sign' },
  { key: 'cap_required',    label: 'Required' },
]

function CapChips({ definition }: { definition: BlockDefinition }) {
  const active = CAP_CHIPS.filter((c) => definition[c.key] === true)
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {active.map((c) => (
        <span key={c.key} className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground border">
          {c.label}
        </span>
      ))}
    </div>
  )
}

// ============================================================
// Props
// ============================================================

interface Props {
  onAdd: (type: string, definitionId?: string) => Promise<void>
  disabled?: boolean
}

// ============================================================
// AddBlockMenu
// ============================================================

export default function AddBlockMenu({ onAdd, disabled }: Props) {
  const { definitions } = useEncounterStore()
  const { roleSlugs } = useAuthStore()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)

  const systemDefs = definitions.filter((d) => d.is_builtin)

  const standardDefs = definitions.filter(
    (d) =>
      d.is_universal &&
      !d.is_builtin &&
      (d.visible_to_roles.length === 0 ||
        d.visible_to_roles.some((r) => roleSlugs.includes(r))),
  )

  const customDefs = definitions.filter(
    (d) => !d.is_builtin && !d.is_universal,
  )

  const handleSelect = async (def: BlockDefinition) => {
    setAdding(def.id)
    await onAdd(def.slug, def.id)
    setAdding(null)
    setPickerOpen(false)
  }

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        disabled={disabled}
        className="w-full border-2 border-dashed border-border rounded-lg py-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
        Add Block
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose block type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {systemDefs.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  System Blocks
                </p>
                <div className="space-y-1.5">
                  {systemDefs.map((def) => (
                    <DefinitionCard
                      key={def.id}
                      definition={def}
                      loading={adding === def.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            )}

            {standardDefs.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Standard Blocks
                </p>
                <div className="space-y-1.5">
                  {standardDefs.map((def) => (
                    <DefinitionCard
                      key={def.id}
                      definition={def}
                      loading={adding === def.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            )}

            {customDefs.length > 0 && (
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  My Custom Blocks
                </p>
                <div className="space-y-1.5">
                  {customDefs.map((def) => (
                    <DefinitionCard
                      key={def.id}
                      definition={def}
                      loading={adding === def.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </section>
            )}

            {definitions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No block types found. Run the schema SQL to seed built-in blocks.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================
// Definition card in the picker
// ============================================================

function DefinitionCard({
  definition,
  loading,
  onSelect,
}: {
  definition: BlockDefinition
  loading: boolean
  onSelect: (d: BlockDefinition) => void
}) {
  const colors = getDefinitionColors(definition.color)
  return (
    <button
      disabled={loading}
      className={cn(
        'w-full flex items-start gap-3 border rounded-lg p-3 hover:bg-accent hover:border-primary/50 transition-all text-left',
        loading && 'opacity-60 cursor-wait',
      )}
      onClick={() => onSelect(definition)}
    >
      <div
        className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center shrink-0 mt-0.5',
          colors.iconBg,
        )}
      >
        <DefIcon slug={definition.icon} className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{definition.name}</p>
        {definition.description && (
          <p className="text-xs text-muted-foreground">{definition.description}</p>
        )}
        <CapChips definition={definition} />
      </div>
    </button>
  )
}
