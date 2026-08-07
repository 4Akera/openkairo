import { useState, useEffect } from 'react'
import { Loader2, CheckCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition } from '../../types'
import { Button } from '../../components/ui'
import { cn, getDefinitionColors } from '../../lib/utils'

// ============================================================
// Block Preferences — system + standard block picker
// ============================================================

export function QuickAccessSection() {
  const { preferredBlocks, updatePreferredBlocks, roleSlugs } = useAuthStore()
  const [allDefs, setAllDefs]   = useState<BlockDefinition[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(preferredBlocks))
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { setSelected(new Set(preferredBlocks)) }, [preferredBlocks])

  useEffect(() => {
    Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .eq('is_builtin', true)
        .eq('active', true)
        .eq('is_dept_only', false)
        .order('sort_order', { ascending: true }),
      supabase
        .from('block_definitions')
        .select('*')
        .eq('is_universal', true)
        .eq('active', true)
        .eq('is_dept_only', false)
        .not('is_builtin', 'is', true)
        .order('sort_order', { ascending: true }),
    ]).then(([sys, std]) => {
      const merged = [
        ...((sys.data ?? []) as BlockDefinition[]),
        ...((std.data ?? []) as BlockDefinition[]),
      ].filter((d) =>
        d.visible_to_roles.length === 0 || d.visible_to_roles.some((r: string) => roleSlugs.includes(r)),
      )
      setAllDefs(merged)
      setLoading(false)
    })
  }, [roleSlugs])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    setSaving(true)
    await updatePreferredBlocks([...selected])
    setSaving(false)
  }

  const isDirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...preferredBlocks].sort())

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Block Preferences</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose which system blocks appear in your Add Block menu. Leave all unchecked to show every block.
          </p>
        </div>
        {isDirty && (
          <Button size="sm" onClick={save} disabled={saving} className="shrink-0">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Save
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : allDefs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No blocks available yet.</p>
      ) : (
        <div className="space-y-4">
          {allDefs.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {allDefs.map(def => (
                <BlockToggleCard key={def.id} def={def} on={selected.has(def.id)} onToggle={toggle} />
              ))}
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Clear selection (show all blocks)
        </button>
      )}
    </div>
  )
}

function BlockToggleCard({
  def,
  on,
  onToggle,
}: {
  def: BlockDefinition
  on: boolean
  onToggle: (id: string) => void
}) {
  const colors = getDefinitionColors(def.color)
  return (
    <button
      type="button"
      onClick={() => onToggle(def.id)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all',
        on
          ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/30 hover:bg-accent/40',
      )}
    >
      <div className={cn('h-7 w-7 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
        <span className="text-white text-[10px] font-bold">{def.name[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{def.name}</p>
        {def.description && (
          <p className="text-[10px] text-muted-foreground truncate">{def.description}</p>
        )}
      </div>
      <div className={cn(
        'h-4 w-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors',
        on ? 'bg-primary border-primary' : 'border-muted-foreground/40',
      )}>
        {on && <CheckCheck className="h-2.5 w-2.5 text-white" />}
      </div>
    </button>
  )
}
