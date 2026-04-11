import { useState, useMemo, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import type {
  Block,
  BlockDefinition,
  BlockLock,
  Charge,
} from '../../types'
import {
  formatDateTime,
  getBlockPreview,
  getDefinitionColors,
  cn,
} from '../../lib/utils'
import { Badge, Button, Separator, Tooltip, TooltipContent, TooltipTrigger } from '../ui'
import {
  Edit2, History, Link2, Lock, ChevronDown, ChevronRight,
  FileText, ClipboardList, Stethoscope, AlertTriangle,
  Zap, ArrowRight, Clock, CheckCheck, Star, Activity,
  Pill, Brain, TestTube, FlaskConical, Camera, BarChart2,
  Clipboard, Heart, Layers, Pin, PinOff, EyeOff, Eye,
  Users, BookOpen, MoreHorizontal, ShieldCheck, Loader2, Building2,
  CheckCircle2, Ban, Copy, Trash2,
} from 'lucide-react'
import { BLOCK_REGISTRY, orphanRegistryRenderKey, registryRenderKey } from './BlockRegistry'
import { DynamicBlockView, DynamicBlockEdit } from './DynamicBlock'
import { AttachmentTray } from './capabilities/AttachmentTray'
import { TimeSeriesPanel } from './capabilities/TimeSeriesPanel'
import { ActionPanel } from './capabilities/ActionPanel'
import { BlockManualFeesPanel } from './capabilities/BlockManualFeesPanel'
import { AcknowledgmentPanel } from './capabilities/AcknowledgmentPanel'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useEncounterStore } from '../../stores/encounterStore'
import { blockAllowsManualBlockFees } from '../../lib/blockBilling'

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
  note:        { name: 'Note',               icon: 'file-text',      color: 'blue'   },
  med_orders:  { name: 'Medications',        icon: 'pill',           color: 'orange' },
  meds:        { name: 'Medications',        icon: 'pill',           color: 'lime'   },
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
  deptName?: string
  /** All non-void charges for this block; badge shows sum */
  charges?: Charge[] | null
  autoEdit?: boolean
  isUnsaved?: boolean
  onEdit: (block: Block, content: Record<string, unknown>) => Promise<void>
  onDuplicate: (blockId: string) => Promise<void>
  onDiscard: (blockId: string) => Promise<void>
  onMask: (blockId: string) => Promise<void>
  onTogglePin: (blockId: string) => void
  onAcquireLock: (blockId: string) => Promise<boolean>
  onReleaseLock: (blockId: string) => void
  onViewHistory: (block: Block) => void
  onApproveCharge?: (chargeId: string) => void
  onVoidCharge?: (chargeId: string) => void
  canCharge?: boolean
  /** When true, show per-block catalogue fee panel (still requires canCharge to add lines) */
  billingEnabled?: boolean
  onRefreshBlockCharges?: (blockId: string) => Promise<void>
  isAdmin?: boolean
  onHardDelete?: (blockId: string) => Promise<void>
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
  deptName,
  charges,
  autoEdit,
  isUnsaved,
  onEdit,
  onDuplicate,
  onDiscard,
  onMask,
  onTogglePin,
  onAcquireLock,
  onReleaseLock,
  onViewHistory,
  onApproveCharge,
  onVoidCharge,
  canCharge,
  billingEnabled,
  onRefreshBlockCharges,
  isAdmin,
  onHardDelete,
}: Props) {
  const { currencySymbol } = useSettingsStore()

  const chargeList = useMemo(() => {
    if (!charges?.length) return []
    return charges.filter(c => c.status !== 'void' && c.status !== 'waived')
  }, [charges])

  const chargeLinesAwaitingApproval = useMemo(
    () => chargeList.filter(c => c.status === 'pending_approval'),
    [chargeList],
  )

  const chargeLinesPosted = useMemo(
    () => chargeList.filter(c => c.status !== 'pending_approval'),
    [chargeList],
  )

  const totalPosted = useMemo(
    () => chargeLinesPosted.reduce((s, c) => s + c.quantity * c.unit_price, 0),
    [chargeLinesPosted],
  )

  const totalAwaitingApproval = useMemo(
    () => chargeLinesAwaitingApproval.reduce((s, c) => s + c.quantity * c.unit_price, 0),
    [chargeLinesAwaitingApproval],
  )

  const postedChargeTooltip = useMemo(
    () =>
      chargeLinesPosted
        .map(
          c =>
            `${c.description} · ${c.quantity}× ${currencySymbol}${c.unit_price.toFixed(2)} · ${c.source} · ${c.status}`,
        )
        .join('\n'),
    [chargeLinesPosted, currencySymbol],
  )

  const approvalChargeTooltip = useMemo(
    () =>
      chargeLinesAwaitingApproval
        .map(
          c =>
            `${c.description} · ${c.quantity}× ${currencySymbol}${c.unit_price.toFixed(2)} · ${c.source} · ${c.status}`,
        )
        .join('\n'),
    [chargeLinesAwaitingApproval, currencySymbol],
  )

  const anyPendingApproval = chargeLinesAwaitingApproval.length > 0
  const { roleSlugs } = useAuthStore()
  const updateBlock = useEncounterStore((s) => s.updateBlock)
  const [editing, setEditing] = useState(false)
  const editingRef = useRef(editing)
  useEffect(() => { editingRef.current = editing }, [editing])

  const [expanded, setExpanded] = useState(block.state === 'active')
  const [orderSent, setOrderSent] = useState(false)

  const collapseOrderBlockAfterResults = useCallback(() => {
    if (editingRef.current) return
    setExpanded(false)
  }, [])

  // Block actions menu
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuTriggerRect, setMenuTriggerRect] = useState<{ triggerTop: number; triggerBottom: number; right: number } | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    if (menuTriggerRef.current) {
      const r = menuTriggerRef.current.getBoundingClientRect()
      setMenuTriggerRect({
        triggerTop: r.top,
        triggerBottom: r.bottom,
        right: window.innerWidth - r.right,
      })
    }
    setDraftRoles(block.visible_to_roles ?? [])
    setRolesSaveError(null)
    setHardDeleteConfirm(false)
    setMenuOpen(true)
  }

  // After menu renders, measure actual height and clamp to viewport
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !menuTriggerRect) return
    const el = menuRef.current
    const menuHeight = el.offsetHeight
    const { triggerTop, triggerBottom, right } = menuTriggerRect
    const spaceBelow = window.innerHeight - triggerBottom - 8
    const spaceAbove = triggerTop - 8

    el.style.right = `${right}px`

    if (spaceBelow >= menuHeight) {
      el.style.top = `${triggerBottom + 8}px`
      el.style.bottom = 'auto'
      el.style.maxHeight = ''
    } else if (spaceAbove >= menuHeight) {
      el.style.top = 'auto'
      el.style.bottom = `${window.innerHeight - triggerTop + 8}px`
      el.style.maxHeight = ''
    } else if (spaceBelow >= spaceAbove) {
      el.style.top = `${triggerBottom + 8}px`
      el.style.bottom = 'auto'
      el.style.maxHeight = `${spaceBelow}px`
    } else {
      el.style.top = '8px'
      el.style.bottom = 'auto'
      el.style.maxHeight = `${spaceAbove}px`
    }
  }, [menuOpen, menuTriggerRect])

  // Block privacy — role restriction
  const [draftRoles, setDraftRoles] = useState<string[]>(block.visible_to_roles ?? [])
  const [savingRoles, setSavingRoles] = useState(false)
  const [rolesSaveError, setRolesSaveError] = useState<string | null>(null)
  const [hardDeleteConfirm, setHardDeleteConfirm] = useState(false)

  // Optimistic local share state — syncs from prop after realtime arrives
  const [localShare, setLocalShare] = useState(block.share_to_record)
  useEffect(() => { setLocalShare(block.share_to_record) }, [block.share_to_record])

  useEffect(() => {
    if (!menuOpen) setDraftRoles(block.visible_to_roles ?? [])
  }, [block.visible_to_roles, menuOpen])
  const [hardDeleting, setHardDeleting] = useState(false)

  const handleSaveRoles = async () => {
    setSavingRoles(true)
    setRolesSaveError(null)
    const { error } = await supabase.from('blocks').update({ visible_to_roles: draftRoles }).eq('id', block.id)
    setSavingRoles(false)
    if (error) {
      setRolesSaveError(error.message)
      return
    }
    updateBlock({ ...block, visible_to_roles: draftRoles })
    setMenuOpen(false)
  }

  const handleToggleShareToRecord = async () => {
    const newVal = !localShare
    setLocalShare(newVal)
    const { error } = await supabase
      .from('blocks')
      .update({ share_to_record: newVal })
      .eq('id', block.id)
    if (error) setLocalShare(!newVal) // revert on failure
  }

  // Use DB definition when available; fall back to BUILTIN_METADATA for the header
  const def = definition ?? null
  /** Department-originated blocks on the encounter timeline: charges/fees are managed in the department portal */
  const hideDeptBlockChargeUi = Boolean(block.department_id)
  const headerMeta = useMemo(() => {
    if (definition) return { name: definition.name, icon: definition.icon, color: definition.color }
    return BUILTIN_METADATA[block.type] ?? { name: block.type, icon: 'file', color: 'slate' }
  }, [definition, block.type])

  const colors = getDefinitionColors(headerMeta.color)
  const isLockedByOther = lock && lock.locked_by !== currentUserId
  const isLockedByMe   = lock && lock.locked_by === currentUserId
  const isImmutable    = def?.cap_immutable ?? false
  const isMasked       = block.state === 'masked'
  // Match DB triggers: only roles allowed to add a block type may edit it (admins always).
  // If we have no definition row (unknown type / RLS / inactive), deny mutation except admin.
  const mayMutateBlockType = useMemo(() => {
    if (isAdmin) return true
    if (!def) return false
    const gate = def.visible_to_roles
    if (!gate || gate.length === 0) return true
    return gate.some((r) => roleSlugs.includes(r))
  }, [def, roleSlugs, isAdmin])
  // Immutable blocks are editable only on first insertion (isUnsaved); locked forever after first save
  const canEdit        = mayMutateBlockType && !encounterClosed && (!isImmutable || !!isUnsaved) && !isMasked && !isLockedByOther && !orderSent

  // Auto-open in edit mode for template-seeded / freshly added blocks
  useEffect(() => {
    if (!autoEdit || !canEdit) return
    setExpanded(true)
    onAcquireLock(block.id).then((acquired) => {
      if (acquired) setEditing(true)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount

  const preview = getBlockPreview(
    {
      type: block.type,
      content: block.content as Record<string, unknown>,
    },
    def ? registryRenderKey(def) : orphanRegistryRenderKey(block.type),
  )

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
        'border rounded-lg bg-card shadow-sm border-l-4 transition-opacity w-full overflow-hidden',
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
              'h-5 w-5 rounded flex items-center justify-center shrink-0',
              colors.iconBg,
            )}
          >
            <BlockIcon iconSlug={headerMeta.icon} className="w-2 h-2 text-white" />
          </div>

          <span className="text-[11px] font-semibold truncate">
            {headerMeta.name}
          </span>

          {deptName && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800 shrink-0 whitespace-nowrap leading-none">
              <Building2 className="h-2 w-2 shrink-0" />
              {deptName}
            </span>
          )}

          {!hideDeptBlockChargeUi && chargeList.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1 shrink-0 flex-wrap leading-none">
                {totalPosted > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap',
                      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
                    )}
                    title={postedChargeTooltip || undefined}
                  >
                    <span className="opacity-70">{currencySymbol}</span>
                    {totalPosted.toFixed(2)}
                    <span className="opacity-60 font-medium">
                      {chargeLinesPosted.length > 1 ? ` · ${chargeLinesPosted.length} lines` : ''}
                      · Active
                    </span>
                  </span>
                )}
                {totalAwaitingApproval > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap',
                      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
                    )}
                    title={approvalChargeTooltip || undefined}
                  >
                    <span className="opacity-70">{currencySymbol}</span>
                    {totalAwaitingApproval.toFixed(2)}
                    <span className="opacity-60 font-medium">
                      {chargeLinesAwaitingApproval.length > 1
                        ? ` · ${chargeLinesAwaitingApproval.length} lines`
                        : ''}
                      · Approval
                    </span>
                  </span>
                )}
              </span>

              {anyPendingApproval && canCharge && (
                <span className="inline-flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                  {chargeLinesAwaitingApproval.length === 1 ? (
                    <>
                      {onApproveCharge && (
                        <button
                          type="button"
                          onClick={() => onApproveCharge(chargeLinesAwaitingApproval[0]!.id)}
                          title={`Approve: ${chargeLinesAwaitingApproval[0]!.description}`}
                          className={cn(
                            'h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0 transition-all',
                            'bg-emerald-100 text-emerald-600 border border-emerald-300',
                            'hover:bg-emerald-500 hover:text-white hover:border-emerald-500 hover:scale-110',
                            'dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700',
                          )}
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {onVoidCharge && (
                        <button
                          type="button"
                          onClick={() => onVoidCharge(chargeLinesAwaitingApproval[0]!.id)}
                          title={`Void: ${chargeLinesAwaitingApproval[0]!.description}`}
                          className={cn(
                            'h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0 transition-all',
                            'bg-red-50 text-red-400 border border-red-200',
                            'hover:bg-red-500 hover:text-white hover:border-red-500 hover:scale-110',
                            'dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                          )}
                        >
                          <Ban className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {onApproveCharge && (
                        <button
                          type="button"
                          onClick={async () => {
                            for (const c of chargeLinesAwaitingApproval) {
                              await Promise.resolve(onApproveCharge(c.id))
                            }
                          }}
                          title={`Approve all ${chargeLinesAwaitingApproval.length} charges`}
                          className={cn(
                            'h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0 transition-all',
                            'bg-emerald-100 text-emerald-600 border border-emerald-300',
                            'hover:bg-emerald-500 hover:text-white hover:border-emerald-500 hover:scale-110',
                            'dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700',
                          )}
                        >
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                      {onVoidCharge && (
                        <button
                          type="button"
                          onClick={async () => {
                            for (const c of chargeLinesAwaitingApproval) {
                              await Promise.resolve(onVoidCharge(c.id))
                            }
                          }}
                          title={`Void all ${chargeLinesAwaitingApproval.length} charges`}
                          className={cn(
                            'h-[18px] w-[18px] rounded-full flex items-center justify-center shrink-0 transition-all',
                            'bg-red-50 text-red-400 border border-red-200',
                            'hover:bg-red-500 hover:text-white hover:border-red-500 hover:scale-110',
                            'dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                          )}
                        >
                          <Ban className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </>
                  )}
                </span>
              )}
            </>
          )}

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

          {orderSent && !editing && (
            <Badge variant="secondary" className="text-[10px] shrink-0 py-0 whitespace-nowrap text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800">
              Sent · locked
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

              {/* Edit — primary inline action */}
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

              {/* Masked block: only show unmask button, skip full menu */}
              {isMasked ? (
                !encounterClosed && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onMask(block.id)}
                    title="Unmask block"
                    className="h-5 w-5 text-muted-foreground hover:text-emerald-600"
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                )
              ) : (
              <div className="relative">
                <Button
                  ref={menuTriggerRef}
                  variant="ghost"
                  size="icon-sm"
                  onClick={openMenu}
                  title="More options"
                  className={cn(
                    'h-5 w-5',
                    (block.is_pinned || localShare || (block.visible_to_roles?.length ?? 0) > 0)
                      && 'text-primary/70',
                  )}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-[90]" onClick={() => setMenuOpen(false)} />
                    <div
                      ref={menuRef}
                      className="fixed z-[200] w-64 rounded-xl border bg-card shadow-xl overflow-hidden flex flex-col"
                    >

                      {/* Header */}
                      <div className="px-3.5 py-2.5 border-b bg-muted/30 shrink-0">
                        <p className="text-[11px] font-semibold">Block Options</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{headerMeta.name}</p>
                      </div>

                      <div className="overflow-y-auto flex-1 min-h-0">
                        {/* ── Block actions ── */}
                        <div className="p-2 space-y-0.5">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-2 pb-1">Actions</p>

                          {/* Pin */}
                          <button
                            type="button"
                            disabled={!mayMutateBlockType}
                            onClick={() => { onTogglePin(block.id); setMenuOpen(false) }}
                            className={cn(
                              'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/60',
                              block.is_pinned && 'text-amber-600',
                              !mayMutateBlockType && 'opacity-50',
                            )}
                          >
                            <div className={cn(
                              'h-6 w-6 rounded-md flex items-center justify-center shrink-0',
                              block.is_pinned ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted',
                            )}>
                              {block.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                            </div>
                            <div>
                              <p className="text-xs font-medium">{block.is_pinned ? 'Unpin block' : 'Pin to HUD'}</p>
                              <p className="text-[10px] text-muted-foreground">{block.is_pinned ? 'Remove from pinned panel' : 'Keep visible at top'}</p>
                            </div>
                          </button>

                          {/* History */}
                          <button
                            type="button"
                            onClick={() => { onViewHistory(block); setMenuOpen(false) }}
                            className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/60"
                          >
                            <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <History className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <p className="text-xs font-medium">Version history</p>
                              <p className="text-[10px] text-muted-foreground">View past revisions</p>
                            </div>
                          </button>

                          {/* Duplicate */}
                          {!isMasked && !encounterClosed && mayMutateBlockType && (
                            <button
                              type="button"
                              onClick={() => { onDuplicate(block.id); setMenuOpen(false) }}
                              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/60"
                            >
                              <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Copy className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <p className="text-xs font-medium">Duplicate block</p>
                                <p className="text-[10px] text-muted-foreground">Copy to end of timeline</p>
                              </div>
                            </button>
                          )}

                          {/* Mask / Unmask */}
                          {!isMasked && canEdit && (
                            <button
                              type="button"
                              onClick={() => { onMask(block.id); setMenuOpen(false) }}
                              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-orange-50 dark:hover:bg-orange-950/20 text-orange-600 dark:text-orange-400"
                            >
                              <div className="h-6 w-6 rounded-md bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                                <EyeOff className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <p className="text-xs font-medium">Mask block</p>
                                <p className="text-[10px] opacity-70">Hide from standard view</p>
                              </div>
                            </button>
                          )}
                          {isMasked && !encounterClosed && mayMutateBlockType && (
                            <button
                              type="button"
                              onClick={() => { onMask(block.id); setMenuOpen(false) }}
                              className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400"
                            >
                              <div className="h-6 w-6 rounded-md bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0">
                                <Eye className="h-3.5 w-3.5" />
                              </div>
                              <div>
                                <p className="text-xs font-medium">Unmask block</p>
                                <p className="text-[10px] opacity-70">Restore to view</p>
                              </div>
                            </button>
                          )}
                          {isImmutable && !encounterClosed && (
                            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-muted-foreground">
                              <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                                <Lock className="h-3.5 w-3.5" />
                              </div>
                              <p className="text-[11px]">Block is immutable</p>
                            </div>
                          )}
                        </div>

                        {/* ── Privacy & Sharing — creator or admin, and role must be allowed to mutate this block type ── */}
                        {(isAdmin || currentUserId === block.created_by) && mayMutateBlockType && (
                        <div className="border-t p-2 space-y-0.5">
                          <div className="flex items-center gap-1.5 px-2 pb-1">
                            <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Privacy & Sharing</p>
                          </div>

                          {/* Share to Results & Reports */}
                          <div className="rounded-lg border bg-muted/20 px-2.5 py-2 space-y-0">
                            <button
                              type="button"
                              onClick={handleToggleShareToRecord}
                              className="w-full flex items-center gap-2 text-left"
                            >
                              <BookOpen className={cn('h-3.5 w-3.5 shrink-0', localShare ? 'text-emerald-600' : 'text-muted-foreground')} />
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-[11px] font-medium', localShare && 'text-emerald-700 dark:text-emerald-400')}>
                                  Share to Results & Reports
                                </p>
                                <p className="text-[10px] text-muted-foreground leading-tight">Appear in patient record tab</p>
                              </div>
                              <div className={cn(
                                'h-4 w-7 rounded-full transition-colors relative shrink-0',
                                localShare ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                              )}>
                                <div className={cn(
                                  'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform',
                                  localShare ? 'translate-x-3.5' : 'translate-x-0.5',
                                )} />
                              </div>
                            </button>
                          </div>

                          {/* Role restriction */}
                          <div className="rounded-lg border bg-muted/20 px-2.5 py-2 space-y-2">
                            <div className="flex items-start gap-2">
                              <Users className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', (draftRoles.length > 0) ? 'text-amber-600' : 'text-muted-foreground')} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium">Restrict to roles</p>
                                <p className="text-[10px] text-muted-foreground leading-tight">This block only — empty means all encounter viewers can see it</p>
                              </div>
                            </div>
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
                                    'text-[10px] px-2 py-0.5 rounded-full border capitalize transition-all font-medium',
                                    draftRoles.includes(role)
                                      ? 'border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
                                      : 'border-border text-muted-foreground hover:border-amber-300',
                                  )}
                                >
                                  {role}
                                </button>
                              ))}
                            </div>
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-5 text-[10px] px-2" onClick={() => { setDraftRoles(block.visible_to_roles ?? []); setRolesSaveError(null) }}>Reset</Button>
                              <Button size="sm" className="h-5 text-[10px] px-2" onClick={handleSaveRoles} disabled={savingRoles}>
                                {savingRoles ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'Save'}
                              </Button>
                            </div>
                            {rolesSaveError && (
                              <p className="text-[10px] text-red-600 dark:text-red-400 leading-snug">{rolesSaveError}</p>
                            )}
                          </div>
                        </div>
                        )}
                      </div>

                      {/* ── Admin: Danger zone ── */}
                      {isAdmin && onHardDelete && (
                        <div className="border-t border-rose-100 dark:border-rose-900/40 p-2 bg-rose-50/40 dark:bg-rose-950/10">
                          <div className="flex items-center gap-1.5 px-2 pb-1.5">
                            <div className="h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center shrink-0">
                              <Trash2 className="h-2 w-2 text-white" />
                            </div>
                            <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-widest">Admin only</p>
                          </div>
                          {!hardDeleteConfirm ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setHardDeleteConfirm(true)}
                                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all hover:bg-rose-100 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 group border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
                                >
                                  <div className="h-7 w-7 rounded-md bg-rose-100 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0 group-hover:bg-rose-200 dark:group-hover:bg-rose-900/60 transition-colors">
                                    <Trash2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold">Permanently delete block</p>
                                    <p className="text-[10px] text-rose-500/70 dark:text-rose-400/60">Irreversible — removes block forever</p>
                                  </div>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs max-w-[180px] text-center">
                                Admin action — permanently deletes this block and all its history
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-100/80 dark:bg-rose-950/40 px-3 py-3 space-y-2.5">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[11px] font-bold text-rose-700 dark:text-rose-300">Permanently delete this block?</p>
                                  <p className="text-[10px] text-rose-600/80 dark:text-rose-400/70 mt-0.5">This cannot be undone. All content and history will be lost.</p>
                                </div>
                              </div>
                              <div className="flex gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-[11px] px-3 flex-1 border-rose-200 dark:border-rose-800 hover:bg-white dark:hover:bg-rose-950/60"
                                  onClick={() => setHardDeleteConfirm(false)}
                                  disabled={hardDeleting}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-[11px] px-3 flex-1 bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 text-white border-0 shadow-sm"
                                  disabled={hardDeleting}
                                  onClick={async () => {
                                    setHardDeleting(true)
                                    await onHardDelete(block.id)
                                    setHardDeleting(false)
                                    setMenuOpen(false)
                                  }}
                                >
                                  {hardDeleting
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <><Trash2 className="h-3 w-3" /><span>Delete forever</span></>
                                  }
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      {expanded && (
        <>
          <Separator />
          <div className="px-4 py-3 overflow-x-auto">
            {editing
              ? renderEdit(block, def, handleSave, handleCancel)
              : renderView(block, def)}
          </div>
          {billingEnabled &&
            !hideDeptBlockChargeUi &&
            blockAllowsManualBlockFees(def) &&
            (canCharge || chargeList.length > 0) && (
            <>
              <Separator />
              <BlockManualFeesPanel
                blockId={block.id}
                patientId={_patientId}
                encounterId={block.encounter_id}
                definition={def}
                charges={chargeList}
                allowFeeEdits={Boolean(canCharge && !encounterClosed && !isMasked)}
                onVoidCharge={onVoidCharge}
                onPosted={async () => {
                  await onRefreshBlockCharges?.(block.id)
                }}
              />
            </>
          )}
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
      {def?.cap_co_sign && (
        <AcknowledgmentPanel blockId={block.id} readOnly={encounterClosed || isMasked} />
      )}

      {/* ── Dept order action panel ──────────────────────── */}
      {def && block.definition_id && block.encounter_id && (
        <ActionPanel
          blockId={block.id}
          encounterId={block.encounter_id}
          patientId={_patientId}
          definition={def}
          blockContent={block.content as Record<string, unknown>}
          readOnly={encounterClosed}
          allowSendOrder={
            !encounterClosed &&
            !isUnsaved &&
            !editing &&
            !block.is_template_seed
          }
          onSentChange={setOrderSent}
          onOrderFulfilledPreferCollapsed={collapseOrderBlockAfterResults}
        />
      )}
    </div>
  )
}

// ============================================================
// Render helpers — registry-first, DynamicBlock as fallback
// ============================================================

function renderView(block: Block, def: BlockDefinition | null) {
  const key = def ? registryRenderKey(def) : orphanRegistryRenderKey(block.type)
  const renderer = BLOCK_REGISTRY[key]
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
  const key = def ? registryRenderKey(def) : orphanRegistryRenderKey(block.type)
  const renderer = BLOCK_REGISTRY[key]
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
            try {
              await onSave(content)
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
