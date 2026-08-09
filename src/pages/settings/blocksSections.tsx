import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Loader2, ChevronDown, ChevronRight, Globe,
  Eye, EyeOff, Edit2, Copy,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as adminApi from '../../lib/adminUsers'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition, Role } from '../../types'
import {
  Button, Input, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Label,
} from '../../components/ui'
import { cn, getDefinitionColors } from '../../lib/utils'
import { registryRenderKey } from '../../components/timeline/BlockRegistry'
import { blockDefinitionHasCharging } from '../../lib/blockBilling'
import { blockVisibilitySummary } from '../../lib/blockVisibility'
import { BlockDefinitionModal } from './BlockDefinitionModal'
import { QuickAccessSection } from './QuickAccessSection'
import { BlockTemplatesSection } from './BlockTemplatesSection'

// ============================================================
// My Blocks Section (user preferences & templates — no block-type creation)
// ============================================================

export function CustomBlocksSection() {
  return (
    <div className="space-y-6">
      {/* ── Quick Access (preferred standard blocks) ── */}
      <QuickAccessSection />

      <Separator />

      {/* ── Content Templates ── */}
      <BlockTemplatesSection />
    </div>
  )
}

// ============================================================
// Reusable block visibility card (used in StandardBlocksSection)
// ============================================================

function BlockVisibilityCard({
  def,
  allRoles,
  savingRoles,
  onToggleActive,
  onToggleRole,
  onEdit,
  onDelete,
  onDuplicate,
  isBuiltin = false,
}: {
  def: BlockDefinition
  allRoles: Role[]
  savingRoles: string | null
  onToggleActive: () => void
  onToggleRole: (slug: string) => void
  onEdit?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  isBuiltin?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const colors      = getDefinitionColors(def.color)
  const visibleRoles = def.visible_to_roles ?? []
  const blockAddRoles = allRoles.filter((r) => r.permissions.includes('block.add'))
  const isDeptResultDef = def.config?.dept_role === 'result'
  /** Built-ins and registry variants use Edit for roles/billing — same compact header as built-in */
  const showInlineRoleExpand = !isBuiltin && !def.registry_slug?.trim()

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden transition-opacity', !def.active && 'opacity-60')}>
      {/* ── Compact header row (always visible) ── */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 select-none transition-colors',
          showInlineRoleExpand && 'cursor-pointer hover:bg-accent/30',
        )}
        onClick={showInlineRoleExpand ? () => setExpanded((e) => !e) : undefined}
        role={showInlineRoleExpand ? 'button' : undefined}
        tabIndex={showInlineRoleExpand ? 0 : undefined}
        onKeyDown={showInlineRoleExpand ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((x) => !x)
          }
        } : undefined}
      >
        {!showInlineRoleExpand ? (
          <span className="w-3 shrink-0" aria-hidden />
        ) : (
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}

        <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
          <span className="text-white text-[9px] font-bold">{def.name[0]}</span>
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium block truncate">{def.name}</span>
          {/* One phrase answers "who sees this?" — replaces the Disabled / N-roles badges */}
          <span className={cn(
            'text-[10px] block truncate',
            !def.active ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground',
          )}>
            {blockVisibilitySummary(def, allRoles)}
          </span>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {isBuiltin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
              Built-in
            </span>
          )}
          {!isBuiltin && !!def.registry_slug?.trim() && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300">
              Variant
            </span>
          )}
          {blockDefinitionHasCharging(def) && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
              $ charged
            </span>
          )}
          <Button
            variant="ghost" size="sm"
            className="h-5 text-[10px] px-1.5 ml-1"
            onClick={onToggleActive}
            title={def.active ? 'Disable' : 'Enable'}
          >
            {def.active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          {onDuplicate && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5" onClick={onDuplicate} title="Duplicate as new block type">
              <Copy className="h-3 w-3" />
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5" onClick={onEdit} title="Edit">
              <Edit2 className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5 text-destructive hover:text-destructive" onClick={onDelete} title="Delete">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Expanded controls (custom slugs only; built-ins & variants use the edit modal) ── */}
      {expanded && showInlineRoleExpand && (
        isDeptResultDef ? (
          <div className="border-t bg-muted/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Block is created by department staff in their department workspace — role access is controlled by department membership.
            </p>
          </div>
        ) : (
          <div className="border-t bg-muted/30 px-3 py-1.5 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-24">
              {savingRoles === `${def.id}:vis`
                ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" />
                : 'Can add:'}
            </span>
            {blockAddRoles.map(role => {
              const on = visibleRoles.includes(role.slug)
              return (
                <button key={role.id} type="button" disabled={savingRoles !== null}
                  onClick={() => onToggleRole(role.slug)}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                    on ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                       : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {role.name}
                </button>
              )
            })}
            {visibleRoles.length === 0 && <span className="text-[10px] text-muted-foreground italic">Everyone</span>}
          </div>
        )
      )}
    </div>
  )
}

// ============================================================
// Standard Blocks Section (admin)
// ============================================================

export function StandardBlocksSection() {
  const { user } = useAuthStore()
  const [defs, setDefs] = useState<BlockDefinition[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [serviceItemsList, setServiceItemsList] = useState<{ id: string; name: string; code: string; default_price: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BlockDefinition | 'new' | undefined>()
  const [savingRoles, setSavingRoles] = useState<string | null>(null)  // def.id being saved

  const [dupSource, setDupSource] = useState<BlockDefinition | null>(null)
  const [dupSlug, setDupSlug] = useState('')
  const [dupName, setDupName] = useState('')
  const [dupError, setDupError] = useState<string | null>(null)
  const [dupSaving, setDupSaving] = useState(false)

  const load = useCallback(async () => {
    const [defsRes, rolesRes, svcRes] = await Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .or('is_builtin.eq.true,is_universal.eq.true')
        .order('sort_order', { ascending: true }),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('service_items').select('id, name, code, default_price').eq('active', true).order('sort_order'),
    ])
    if (defsRes.data) setDefs(defsRes.data as BlockDefinition[])
    if (rolesRes.data) setAllRoles(rolesRes.data as Role[])
    if (svcRes.data) setServiceItemsList(svcRes.data as typeof serviceItemsList)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = (def: BlockDefinition) => {
    setDefs((prev) => {
      const exists = prev.find((d) => d.id === def.id)
      return exists ? prev.map((d) => (d.id === def.id ? def : d)) : [...prev, def]
    })
    setEditing(undefined)
  }

  const handleDelete = async (def: BlockDefinition) => {
    if (def.is_builtin) {
      if (!window.confirm(
        'DESTRUCTIVE ACTION — SYSTEM BUILT-IN\n\n'
        + 'You are about to delete a core block type from the database. This is almost never appropriate in production.\n\n'
        + 'Likely consequences:\n'
        + '• Patient timelines and department workspaces may error or show broken blocks\n'
        + '• Templates, orders, charges, and automation tied to this slug can fail\n'
        + '• Foreign keys may block the delete, or orphans may be left if constraints differ\n\n'
        + 'There is no undo. Prefer leaving built-ins alone or using a duplicate + disable workflow.\n\n'
        + 'Click OK only for a controlled fix (e.g. bad seed / dev reset).',
      )) return
      if (!window.confirm(
        'Second confirmation: Delete this built-in block definition anyway?\n\n'
        + 'If you are not 100% sure, click Cancel now.',
      )) return
      const typed = window.prompt(
        `Final step — type the block name exactly (case-sensitive) to delete:\n\n"${def.name}"`,
      )
      if (typed !== def.name) return
    } else if (def.registry_slug?.trim()) {
      if (!window.confirm(
        `PERMANENT DELETE — VARIANT: "${def.name}"\n\n`
        + 'This removes the definition row. Existing blocks that use this type slug may become hard to edit, '
        + 'mis-render, or lose their schema in the UI. Department services and templates referencing it can break.\n\n'
        + 'Safer option: disable the block (eye icon) so it stays out of menus but history stays coherent.\n\n'
        + 'Delete permanently?',
      )) return
    } else if (!window.confirm(
      `PERMANENT DELETE — CUSTOM BLOCK: "${def.name}"\n\n`
      + 'It will be removed from every user\'s Add Block menu. Encounters that already contain this block type '
      + 'may show a missing-editor warning until settings_ui is fixed; data in those blocks is not automatically deleted.\n\n'
      + 'Disabling is usually enough. Continue with full delete?',
    )) {
      return
    }
    const res = await adminApi.deleteStandardBlock(def.id)
    if (res.error) { alert(res.error); return }
    setDefs((prev) => prev.filter((d) => d.id !== def.id))
  }

  const openDuplicateModal = (def: BlockDefinition) => {
    const taken = new Set(defs.map((d) => d.slug))
    let candidate = `${def.slug}__copy`
    let n = 1
    while (taken.has(candidate)) {
      n += 1
      candidate = `${def.slug}__copy${n}`
    }
    setDupSource(def)
    setDupSlug(candidate)
    setDupName(`${def.name} (copy)`)
    setDupError(null)
  }

  const closeDuplicateModal = () => {
    setDupSource(null)
    setDupSlug('')
    setDupName('')
    setDupError(null)
    setDupSaving(false)
  }

  const confirmDuplicate = async () => {
    if (!user || !dupSource) return
    const slug = dupSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!slug) {
      setDupError('Slug is required.')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
      setDupError('Slug must start with a letter and use only lowercase letters, numbers, and underscores.')
      return
    }
    if (defs.some((d) => d.slug === slug)) {
      setDupError('That slug is already in use.')
      return
    }
    const nameTrim = dupName.trim()
    if (!nameTrim) {
      setDupError('Display name is required.')
      return
    }
    setDupSaving(true)
    setDupError(null)
    try {
      const maxSort = defs.length ? Math.max(...defs.map((d) => d.sort_order)) : 0
      const { id: _id, created_at: _ca, ...rest } = dupSource
      const payload: Omit<BlockDefinition, 'id' | 'created_at'> = {
        ...rest,
        slug,
        name: nameTrim,
        registry_slug: registryRenderKey(dupSource),
        is_builtin: false,
        is_universal: true,
        sort_order: maxSort + 10,
        created_by: user.id,
      }
      const res = await adminApi.createStandardBlock(payload)
      if (res.error) {
        setDupError(res.error)
        return
      }
      if (res.data) setDefs((prev) => [...prev, res.data!])
      closeDuplicateModal()
    } finally {
      setDupSaving(false)
    }
  }

  const handleToggleActive = async (def: BlockDefinition) => {
    const res = await adminApi.updateStandardBlock(def.id, { active: !def.active })
    if (!res.error && res.data) setDefs((prev) => prev.map((d) => (d.id === def.id ? res.data! : d)))
  }

  const handleToggleRole = async (def: BlockDefinition, slug: string) => {
    setSavingRoles(`${def.id}:vis`)
    const current = def.visible_to_roles ?? []
    const next = current.includes(slug) ? current.filter(r => r !== slug) : [...current, slug]
    const res = await adminApi.updateStandardBlock(def.id, { visible_to_roles: next })
    if (!res.error && res.data) setDefs((prev) => prev.map((d) => (d.id === def.id ? res.data! : d)))
    setSavingRoles(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Block Library</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            All block types available org-wide. Custom block types: click the row to set role access inline.
            Built-ins and variants: use Edit for roles, billing, and visibility.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> New Block Type
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {defs.length === 0 ? (
            <div className="border border-dashed rounded-lg py-8 text-center text-muted-foreground space-y-1">
              <Globe className="w-7 h-7 mx-auto opacity-40" />
              <p className="text-sm">No block types found.</p>
            </div>
          ) : (
            defs.map(def => (
              <BlockVisibilityCard
                key={def.id}
                def={def}
                allRoles={allRoles}
                savingRoles={savingRoles}
                onToggleActive={() => handleToggleActive(def)}
                onToggleRole={(slug) => handleToggleRole(def, slug)}
                onEdit={() => setEditing(def)}
                onDuplicate={() => openDuplicateModal(def)}
                onDelete={() => handleDelete(def)}
                isBuiltin={def.is_builtin}
              />
            ))
          )}
        </div>
      )}

      {editing !== undefined && (
        <BlockDefinitionModal
          initial={editing !== 'new' ? editing : undefined}
          isStandard
          isBuiltin={editing !== 'new' && editing.is_builtin}
          allRoles={allRoles}
          allServiceItems={serviceItemsList}
          allDefs={defs}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}

      <Dialog open={!!dupSource} onOpenChange={(o) => { if (!o && !dupSaving) closeDuplicateModal() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate block type</DialogTitle>
          </DialogHeader>
          {dupSource && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Copying from <span className="font-medium text-foreground">{dupSource.name}</span>
                {' · '}
                Renderer <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">{registryRenderKey(dupSource)}</code>
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">New slug (unique)</Label>
                <Input
                  value={dupSlug}
                  onChange={(e) => {
                    setDupSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    setDupError(null)
                  }}
                  placeholder="e.g. lab_result_icu"
                  className="font-mono text-sm"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Display name</Label>
                <Input
                  value={dupName}
                  onChange={(e) => { setDupName(e.target.value); setDupError(null) }}
                  placeholder="Shown in Add Block menu"
                />
              </div>
              {dupError && <p className="text-xs text-destructive">{dupError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={closeDuplicateModal} disabled={dupSaving}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={confirmDuplicate} disabled={dupSaving || !dupSlug.trim() || !dupName.trim()}>
                  {dupSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Create duplicate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
