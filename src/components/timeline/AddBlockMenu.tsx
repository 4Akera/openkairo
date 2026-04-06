import { useState, useRef, useEffect, useCallback } from 'react'
import type { BlockDefinition, UserBlockTemplate } from '../../types'
import { useEncounterStore } from '../../stores/encounterStore'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { Dialog, DialogContent } from '../ui'
import {
  Plus, FileText, ClipboardList, Stethoscope,
  Activity, Heart, Brain, TestTube, Zap, Clock, AlertTriangle,
  ArrowRight, Camera, BarChart2, Clipboard, FlaskConical, Pill,
  Star, Layers, CheckCheck, Search, Loader2, ChevronRight, ChevronLeft,
  Calculator, Scissors, BookOpen, MessageSquare, LogOut,
} from 'lucide-react'
import { getDefinitionColors, cn } from '../../lib/utils'

// ─── Icon map ────────────────────────────────────────────────────────────────

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
  'calculator':     Calculator,
  'scissors':       Scissors,
  'book-open':      BookOpen,
  'message-square': MessageSquare,
  'log-out':        LogOut,
}

function DefIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICON_MAP[slug] ?? FileText
  return <Icon className={className} />
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  onAdd: (type: string, definitionId?: string, initialContent?: Record<string, unknown>) => Promise<void>
  disabled?: boolean
}

// ─── AddBlockMenu ─────────────────────────────────────────────────────────────

export default function AddBlockMenu({ onAdd, disabled }: Props) {
  const { definitions } = useEncounterStore()
  const { user, roleSlugs, preferredBlocks, pinnedBlocks, updatePinnedBlocks } = useAuthStore()

  const [open, setOpen]               = useState(false)
  const [query, setQuery]             = useState('')
  const [activeIdx, setActiveIdx]     = useState(0)
  const [adding, setAdding]           = useState<string | null>(null)
  const [savingPin, setSavingPin]     = useState<string | null>(null)

  // Template sub-menu
  const [templates, setTemplates]                       = useState<UserBlockTemplate[]>([])
  const [loadingTpls, setLoadingTpls]                   = useState(false)
  const [selectedDef, setSelectedDef]                   = useState<BlockDefinition | null>(null)

  const searchRef  = useRef<HTMLInputElement>(null)
  const listRef    = useRef<HTMLDivElement>(null)

  // ── Fetch templates when menu opens ──────────────────────────────────────
  useEffect(() => {
    if (!open || !user) return
    setLoadingTpls(true)
    supabase
      .from('user_block_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')
      .then(({ data }) => {
        setTemplates((data ?? []) as UserBlockTemplate[])
        setLoadingTpls(false)
      })
  }, [open, user])

  // ── Visible pool ──────────────────────────────────────────────────────────
  const visibleDefs = definitions.filter((d) => {
    if (d.is_dept_only) return false
    if (d.is_universal && !d.is_builtin) {
      if (
        d.visible_to_roles.length > 0 &&
        !d.visible_to_roles.some((r) => roleSlugs.includes(r))
      ) return false
    }
    if (preferredBlocks.length > 0 && !preferredBlocks.includes(d.id)) return false
    return true
  })

  const pinnedSet  = new Set(pinnedBlocks)
  const tplsByDef  = templates.reduce<Record<string, UserBlockTemplate[]>>((acc, t) => {
    ;(acc[t.definition_id] ??= []).push(t)
    return acc
  }, {})

  const pinnedDefs = visibleDefs.filter((d) => pinnedSet.has(d.id))

  // ── Search-filtered list ──────────────────────────────────────────────────
  const filtered = (() => {
    const q = query.trim().toLowerCase()
    if (q) return visibleDefs.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      (d.description ?? '').toLowerCase().includes(q),
    )
    return [
      ...visibleDefs.filter((d) => pinnedSet.has(d.id)),
      ...visibleDefs.filter((d) => !pinnedSet.has(d.id)),
    ]
  })()

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setSelectedDef(null)
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSelectDef = useCallback((def: BlockDefinition) => {
    const tpls = tplsByDef[def.id] ?? []
    const defaultTpl = tpls.find((t) => t.is_default)
    if (defaultTpl) {
      // Auto-apply: skip sub-menu
      doAdd(def, defaultTpl.content)
    } else if (tpls.length > 0) {
      // Show template picker
      setSelectedDef(def)
    } else {
      doAdd(def, undefined)
    }
  }, [tplsByDef]) // eslint-disable-line react-hooks/exhaustive-deps

  const doAdd = async (def: BlockDefinition, initialContent: Record<string, unknown> | undefined) => {
    setAdding(def.id)
    await onAdd(def.slug, def.id, initialContent)
    setAdding(null)
    setOpen(false)
  }

  const handleTogglePin = async (e: React.MouseEvent, def: BlockDefinition) => {
    e.stopPropagation()
    setSavingPin(def.id)
    const next = pinnedSet.has(def.id)
      ? pinnedBlocks.filter((id) => id !== def.id)
      : [...pinnedBlocks, def.id]
    await updatePinnedBlocks(next)
    setSavingPin(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (selectedDef) {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); setSelectedDef(null) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const def = filtered[activeIdx]
      if (def && adding === null) handleSelectDef(def)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="w-full border-2 border-dashed border-border rounded-lg py-3 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
        Add Block
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs p-0 gap-0 overflow-hidden">

          {/* ── Template sub-menu view ────────────────────────────────────── */}
          {selectedDef ? (
            <TemplatePicker
              def={selectedDef}
              templates={tplsByDef[selectedDef.id] ?? []}
              adding={adding}
              onBack={() => setSelectedDef(null)}
              onSelectBlank={() => doAdd(selectedDef, undefined)}
              onSelectTemplate={(tpl) => doAdd(selectedDef, tpl.content)}
            />
          ) : (
            <>
              {/* ── Search bar ───────────────────────────────────────────── */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search blocks…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
                )}
              </div>

              {/* ── Pinned chips ─────────────────────────────────────────── */}
              {!query && pinnedDefs.length > 0 && (
                <div className="px-3 py-2 border-b flex flex-wrap gap-1.5">
                  {pinnedDefs.map((def) => {
                    const colors = getDefinitionColors(def.color)
                    const hasTpls = (tplsByDef[def.id]?.length ?? 0) > 0
                    return (
                      <button
                        key={def.id}
                        onClick={() => handleSelectDef(def)}
                        disabled={adding === def.id}
                        title={def.name}
                        className={cn(
                          'flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-all',
                          'hover:border-primary/60 hover:bg-primary/5',
                          adding === def.id && 'opacity-60 cursor-wait',
                        )}
                      >
                        <div className={cn('h-4 w-4 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
                          <DefIcon slug={def.icon} className="w-2.5 h-2.5 text-white" />
                        </div>
                        {def.name}
                        {hasTpls && <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />}
                        {adding === def.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ── Block list ───────────────────────────────────────────── */}
              <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
                {loadingTpls && templates.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    {query ? `No blocks matching "${query}"` : 'No block types available.'}
                  </p>
                ) : (
                  filtered.map((def, idx) => {
                    const colors   = getDefinitionColors(def.color)
                    const isActive = idx === activeIdx
                    const isPinned = pinnedSet.has(def.id)
                    const isAdding = adding === def.id
                    const isSaving = savingPin === def.id
                    const tpls     = tplsByDef[def.id] ?? []
                    const hasTpls  = tpls.length > 0
                    const hasDefault = tpls.some((t) => t.is_default)

                    return (
                      <div
                        key={def.id}
                        data-active={isActive}
                        className={cn(
                          'group flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
                          isActive ? 'bg-accent' : 'hover:bg-accent/60',
                        )}
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => !isAdding && handleSelectDef(def)}
                      >
                        <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', colors.iconBg)}>
                          {isAdding
                            ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                            : <DefIcon slug={def.icon} className="w-3.5 h-3.5 text-white" />
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{def.name}</p>
                          {def.description && (
                            <p className="text-[11px] text-muted-foreground truncate leading-tight">{def.description}</p>
                          )}
                        </div>

                        {/* Template indicator / sub-menu access */}
                        {hasTpls && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedDef(def) }}
                            title="Choose template"
                            className={cn(
                              'flex items-center gap-0.5 text-[9px] border rounded px-1 py-px shrink-0 transition-colors',
                              hasDefault
                                ? 'text-primary border-primary/30 bg-primary/5 hover:bg-primary/10'
                                : 'text-muted-foreground border-border hover:border-primary/40 hover:text-primary',
                            )}
                          >
                            {hasDefault && <Zap className="h-2.5 w-2.5 fill-current" />}
                            {tpls.length} tpl{tpls.length !== 1 ? 's' : ''}
                          </button>
                        )}

                        {/* Chevron for templates, or pin toggle */}
                        {!hasTpls && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={(e) => handleTogglePin(e, def)}
                            title={isPinned ? 'Unpin' : 'Pin to favourites'}
                            className={cn(
                              'shrink-0 p-1 rounded transition-all',
                              isPinned
                                ? 'text-amber-400 hover:text-amber-500 opacity-100'
                                : 'text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100',
                              isSaving && 'opacity-50 cursor-wait',
                            )}
                          >
                            {isSaving
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Star className={cn('h-3 w-3', isPinned && 'fill-current')} />
                            }
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* ── Footer hint ──────────────────────────────────────────── */}
              <div className="flex items-center gap-3 px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
                <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                <span><kbd className="font-mono">↵</kbd> select</span>
                <span><kbd className="font-mono">esc</kbd> close</span>
              </div>
            </>
          )}

        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Template picker sub-view ─────────────────────────────────────────────────

function TemplatePicker({
  def,
  templates,
  adding,
  onBack,
  onSelectBlank,
  onSelectTemplate,
}: {
  def: BlockDefinition
  templates: UserBlockTemplate[]
  adding: string | null
  onBack: () => void
  onSelectBlank: () => void
  onSelectTemplate: (tpl: UserBlockTemplate) => void
}) {
  const colors = getDefinitionColors(def.color)
  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className={cn('h-5 w-5 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
          <DefIcon slug={def.icon} className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-medium flex-1 truncate">{def.name}</span>
      </div>

      {/* Options */}
      <div className="py-1 max-h-72 overflow-y-auto">
        {/* Blank */}
        <div
          className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-accent/60 transition-colors"
          onClick={onSelectBlank}
        >
          <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 bg-muted border">
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Blank</p>
        </div>

        {/* Divider */}
        <div className="mx-3 my-1 border-t" />

        {/* Templates */}
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-accent/60 transition-colors',
              adding === def.id && 'opacity-60 pointer-events-none',
            )}
            onClick={() => onSelectTemplate(tpl)}
          >
            <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', colors.iconBg)}>
              {adding === def.id
                ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                : <DefIcon slug={def.icon} className="w-3.5 h-3.5 text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">{tpl.name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-1.5 border-t bg-muted/30 text-[10px] text-muted-foreground">
        <span><kbd className="font-mono">esc</kbd> / <kbd className="font-mono">←</kbd> back</span>
      </div>
    </>
  )
}
