import { useState, useMemo, useEffect } from 'react'
import type {
  Block,
  BlockDefinition,
  BlockLock,
} from '../../types'
import {
  formatDateTime,
  getBlockPreview,
  getDefinitionColors,
  cn,
} from '../../lib/utils'
import { Badge, Button, Separator } from '../ui'
import {
  Edit2, History, Link2, Lock, ChevronDown, ChevronRight,
  FileText, ClipboardList, Stethoscope, AlertTriangle,
  Zap, ArrowRight, Clock, CheckCheck, Star, Activity,
  Pill, Brain, TestTube, FlaskConical, Camera, BarChart2,
  Clipboard, Heart, Layers, Pin, PinOff, EyeOff, Eye,
  Users, BookOpen,
} from 'lucide-react'
import { BLOCK_REGISTRY } from './BlockRegistry'
import { DynamicBlockView, DynamicBlockEdit } from './DynamicBlock'
import { AttachmentTray } from './capabilities/AttachmentTray'
import { TimeSeriesPanel } from './capabilities/TimeSeriesPanel'
import { supabase } from '../../lib/supabase'

// ============================================================
// Icon registry (slug → component)
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

function BlockIcon({
  iconSlug,
  className,
}: {
  iconSlug: string
  className?: string
}) {
  const Icon = ICON_MAP[iconSlug] ?? FileText
  return <Icon className={className} />
}

// ============================================================
// Capability badges shown in the header
// ============================================================

function CapabilityBadges({ definition }: { definition: BlockDefinition }) {
  const badges: { key: string; icon: React.ComponentType<{ className?: string }>; label: string; color: string }[] = []

  if (definition.cap_immutable)    badges.push({ key: 'immutable',   icon: Lock,          label: 'Locked',    color: 'text-slate-500' })
  if (definition.cap_time_series)  badges.push({ key: 'time_series', icon: Layers,        label: 'Series',    color: 'text-cyan-600' })
  if (definition.cap_co_sign)      badges.push({ key: 'co_sign',     icon: CheckCheck,    label: 'Co-Sign',   color: 'text-green-600' })
  if (definition.cap_required)     badges.push({ key: 'required',    icon: AlertTriangle, label: 'Required',  color: 'text-rose-600' })

  if (badges.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {badges.map(({ key, icon: Icon, label, color }) => (
        <span
          key={key}
          title={label}
          className={cn('flex items-center', color)}
        >
          <Icon className="w-2.5 h-2.5" />
        </span>
      ))}
    </div>
  )
}

// ============================================================
// Fallback header metadata for registered blocks when the DB
// definition hasn't loaded yet (avoids blank icon/name flash)
// ============================================================

const BUILTIN_METADATA: Record<string, { name: string; icon: string; color: string }> = {
  hx_physical: { name: 'History & Physical', icon: 'clipboard-list', color: 'purple' },
  note:        { name: 'Clinical Note',      icon: 'file-text',      color: 'blue'   },
  med_orders:  { name: 'Medications',        icon: 'pill',           color: 'orange' },
  plan:        { name: 'Assessment & Plan',  icon: 'clipboard',      color: 'teal'   },
  vitals:      { name: 'Vitals',             icon: 'activity',       color: 'red'    },
}

const BLOCK_ROLE_OPTIONS = ['physician', 'nurse', 'receptionist', 'admin']

// ============================================================
// Props
// ============================================================

interface Props {
  block: Block
  definition?: BlockDefinition
  encounterId: string
  patientId: string
  lock: BlockLock | undefined
  currentUserId: string
  encounterClosed: boolean
  encounterPortalVisible: boolean
  autoEdit?: boolean
  isUnsaved?: boolean
  onEdit: (block: Block, content: Record<string, unknown>) => Promise<void>
  onDiscard: (blockId: string) => Promise<void>
  onMask: (blockId: string) => Promise<void>
  onTogglePin: (blockId: string) => void
  onAcquireLock: (blockId: string) => Promise<boolean>
  onReleaseLock: (blockId: string) => void
  onViewHistory: (block: Block) => void
}

// ============================================================
// BlockWrapper
// ============================================================

export default function BlockWrapper({
  block,
  definition,
  encounterId: _encounterId,
  patientId: _patientId,
  lock,
  currentUserId,
  encounterClosed,
  encounterPortalVisible,
  autoEdit,
  isUnsaved,
  onEdit,
  onDiscard,
  onMask,
  onTogglePin,
  onAcquireLock,
  onReleaseLock,
  onViewHistory,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(
    block.state === 'active' && !block.supersedes_block_id,
  )

  // Block privacy flags
  const [rolesPopoverOpen, setRolesPopoverOpen] = useState(false)
  const [draftRoles, setDraftRoles] = useState<string[]>(block.visible_to_roles ?? [])
  const [savingRoles, setSavingRoles] = useState(false)

  const handleSaveRoles = async () => {
    setSavingRoles(true)
    await supabase.from('blocks').update({ visible_to_roles: draftRoles }).eq('id', block.id)
    setSavingRoles(false)
    setRolesPopoverOpen(false)
  }

  const handleTogglePortalVisible = async () => {
    await supabase.from('blocks').update({ portal_visible: !block.portal_visible }).eq('id', block.id)
  }

  const handleToggleShareToRecord = async () => {
    await supabase.from('blocks').update({ share_to_record: !block.share_to_record }).eq('id', block.id)
  }

  // Use DB definition when available; fall back to BUILTIN_METADATA for the header
  const def = definition ?? null
  const headerMeta = useMemo(() => {
    if (definition) return { name: definition.name, icon: definition.icon, color: definition.color }
    return BUILTIN_METADATA[block.type] ?? { name: block.type, icon: 'file', color: 'slate' }
  }, [definition, block.type])

  const colors = getDefinitionColors(headerMeta.color)
  const isLockedByOther = lock && lock.locked_by !== currentUserId
  const isLockedByMe   = lock && lock.locked_by === currentUserId
  const isImmutable    = def?.cap_immutable ?? false
  const isMasked       = block.state === 'masked'
  // Immutable blocks are editable only on first insertion (isUnsaved); locked forever after first save
  const canEdit        = !encounterClosed && (!isImmutable || !!isUnsaved) && !isMasked && !isLockedByOther

  // Auto-open in edit mode for template-seeded / freshly added blocks
  useEffect(() => {
    if (!autoEdit || !canEdit) return
    setExpanded(true)
    onAcquireLock(block.id).then((acquired) => {
      if (acquired) setEditing(true)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount

  const preview = getBlockPreview({
    type: block.type,
    content: block.content as Record<string, unknown>,
  })

  const handleEditClick = async () => {
    if (!canEdit) return
    if (!expanded) setExpanded(true)
    const acquired = await onAcquireLock(block.id)
    if (acquired) setEditing(true)
  }

  const handleCancel = () => {
    if (isUnsaved) {
      onReleaseLock(block.id)
      onDiscard(block.id)
      return
    }
    setEditing(false)
    onReleaseLock(block.id)
  }

  const handleSave = async (content: Record<string, unknown>) => {
    await onEdit(block, content)
    setEditing(false)
    onReleaseLock(block.id)
  }

  return (
    <div
      id={`block-${block.id}`}
      className={cn(
        'border rounded-lg bg-card shadow-sm border-l-4 transition-opacity',
        colors.border,
        isMasked && 'opacity-50',
      )}
    >
      {/* ── Header ──────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 cursor-pointer select-none hover:bg-accent/30 transition-colors"
        onClick={() => !editing && setExpanded((e) => !e)}
      >
        {/* Left: chevron + icon + name + badges */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-muted-foreground shrink-0">
            {expanded
              ? <ChevronDown className="h-3 w-3" />
              : <ChevronRight className="h-3 w-3" />}
          </span>

          <div
            className={cn(
              'h-4.5 w-4.5 rounded-full flex items-center justify-center shrink-0',
              colors.iconBg,
            )}
          >
            <BlockIcon iconSlug={headerMeta.icon} className="w-2 h-2 text-white" />
          </div>

          <span className="text-[11px] font-semibold truncate">
            {headerMeta.name}
          </span>

          {def && <CapabilityBadges definition={def} />}

          {block.supersedes_block_id && (
            <Badge variant="secondary" className="text-[10px] gap-0.5 shrink-0 py-0 whitespace-nowrap">
              <Link2 className="h-2 w-2" />
              Rev
            </Badge>
          )}
          {isMasked && (
            <Badge variant="muted" className="text-[10px] shrink-0 py-0 whitespace-nowrap">
              Masked
            </Badge>
          )}
          {isLockedByOther && (
            <Badge variant="warning" className="text-[10px] gap-0.5 shrink-0 py-0 whitespace-nowrap">
              <Lock className="h-2 w-2" />
              {lock.user_email.split('@')[0]}
            </Badge>
          )}
          {isLockedByMe && editing && (
            <Badge variant="muted" className="text-[10px] gap-0.5 shrink-0 py-0 whitespace-nowrap">
              <Edit2 className="h-2 w-2" />
              Editing
            </Badge>
          )}

          {isUnsaved && !editing && (
            <Badge variant="warning" className="text-[10px] shrink-0 py-0 whitespace-nowrap">
              Unsaved
            </Badge>
          )}

          {!expanded && !editing && preview && (
            <p className="text-[11px] text-muted-foreground truncate min-w-0 italic">
              {preview}
            </p>
          )}
        </div>

        {/* Right: author + actions — wraps to second line on tight viewports */}
        <div
          className="flex items-center gap-1 shrink-0 ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Author · time */}
          <span className="hidden md:inline text-[10px] text-muted-foreground truncate max-w-[100px]">
            {block.author_name || 'Unknown'}
          </span>
          <span className="hidden md:inline text-[10px] text-muted-foreground">·</span>
          <span className="hidden sm:inline text-[10px] text-muted-foreground whitespace-nowrap">
            {formatDateTime(block.created_at)}
          </span>

          {/* Action buttons */}
          {!editing && (
            <>
              <div className="w-px h-3.5 bg-border mx-0.5 hidden sm:block" />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onTogglePin(block.id)}
                title={block.is_pinned ? 'Unpin block' : 'Pin to HUD'}
                className={cn('h-5 w-5', block.is_pinned && 'text-amber-500 hover:text-amber-600')}
              >
                {block.is_pinned
                  ? <PinOff className="h-3 w-3" />
                  : <Pin className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onViewHistory(block)}
                title="View version history"
                className="h-5 w-5"
              >
                <History className="h-3 w-3" />
              </Button>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleEditClick}
                  title="Edit block"
                  className="h-5 w-5"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
              {!isMasked && canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onMask(block.id)}
                  title="Mask block"
                  className="h-5 w-5 hover:text-orange-500"
                >
                  <EyeOff className="h-3 w-3" />
                </Button>
              )}
              {isMasked && !encounterClosed && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onMask(block.id)}
                  title="Unmask block"
                  className="h-5 w-5 hover:text-emerald-500"
                >
                  <Eye className="h-3 w-3" />
                </Button>
              )}
              {isImmutable && !encounterClosed && (
                <span title="This block cannot be edited" className="p-0.5">
                  <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                </span>
              )}

              {/* Privacy flags */}
              <div className="w-px h-3.5 bg-border mx-0.5" />

              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => { setDraftRoles(block.visible_to_roles ?? []); setRolesPopoverOpen(o => !o) }}
                  title="Restrict block visibility to specific roles"
                  className={cn('h-5 w-5', (block.visible_to_roles?.length ?? 0) > 0 && 'text-amber-600')}
                >
                  <Users className="h-3 w-3" />
                </Button>
                {rolesPopoverOpen && (
                  <div className="absolute right-0 top-full mt-1 z-[100] w-52 rounded-lg border bg-card shadow-lg p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Restrict to roles</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Empty = visible to anyone who can see the encounter
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {BLOCK_ROLE_OPTIONS.map(role => (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            setDraftRoles(prev =>
                              prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
                            )
                          }
                          className={cn(
                            'text-[11px] px-2 py-0.5 rounded border capitalize transition-colors',
                            draftRoles.includes(role)
                              ? 'border-primary/50 bg-primary/5 text-primary font-medium'
                              : 'border-border text-muted-foreground hover:border-primary/30',
                          )}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end gap-1.5 border-t pt-2">
                      <Button variant="ghost" size="sm" className="h-5 text-[11px]" onClick={() => setRolesPopoverOpen(false)}>Cancel</Button>
                      <Button size="sm" className="h-5 text-[11px]" onClick={handleSaveRoles} disabled={savingRoles}>Save</Button>
                    </div>
                  </div>
                )}
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleToggleShareToRecord}
                title={block.share_to_record ? 'Remove from Results & Reports' : 'Share to Results & Reports'}
                className={cn('h-5 w-5', block.share_to_record && 'text-emerald-600')}
              >
                <BookOpen className="h-3 w-3" />
              </Button>

              {encounterPortalVisible && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleTogglePortalVisible}
                  title={block.portal_visible ? 'Hide from patient portal' : 'Show in patient portal'}
                  className={cn('h-5 w-5', block.portal_visible && 'text-blue-500')}
                >
                  <Eye className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      {expanded && (
        <>
          <Separator />
          <div className="px-4 py-3">
            {editing
              ? renderEdit(block, def, handleSave, handleCancel)
              : renderView(block, def)}
          </div>
        </>
      )}

      {/* ── Capability panels (always rendered outside expand toggle) ── */}
      {def?.cap_media && (
        <AttachmentTray blockId={block.id} readOnly={encounterClosed || isMasked} />
      )}
      {def?.cap_time_series && (
        <TimeSeriesPanel
          blockId={block.id}
          definition={def}
          readOnly={encounterClosed}
        />
      )}
    </div>
  )
}

// ============================================================
// Render helpers — registry-first, DynamicBlock as fallback
// ============================================================

function renderView(block: Block, def: BlockDefinition | null) {
  const renderer = BLOCK_REGISTRY[block.type]
  if (renderer) return <renderer.View block={block} />

  // Unknown / bespoke block → DynamicBlock (reads field schema from definition)
  if (def && def.fields.length > 0) {
    return (
      <DynamicBlockView
        definition={def}
        content={block.content as Record<string, unknown>}
      />
    )
  }
  return (
    <p className="text-sm text-muted-foreground italic">
      No renderer registered for "{block.type}".
    </p>
  )
}

function renderEdit(
  block: Block,
  def: BlockDefinition | null,
  onSave: (c: Record<string, unknown>) => Promise<void>,
  onCancel: () => void,
) {
  const renderer = BLOCK_REGISTRY[block.type]
  if (renderer) return <renderer.Edit block={block} onSave={onSave} onCancel={onCancel} />

  // Unknown / bespoke block → DynamicBlock
  if (def) {
    return (
      <DynamicBlockEditWrapper
        block={block}
        definition={def}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
  }
  return null
}

// Wrapper to manage local state for DynamicBlockEdit
function DynamicBlockEditWrapper({
  block,
  definition,
  onSave,
  onCancel,
}: {
  block: Block
  definition: BlockDefinition
  onSave: (c: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const [content, setContent] = useState<Record<string, unknown>>(
    block.content as Record<string, unknown>,
  )
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-4">
      <DynamicBlockEdit definition={definition} content={content} onChange={setContent} />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave(content)
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
