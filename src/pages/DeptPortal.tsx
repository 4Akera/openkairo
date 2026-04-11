import { useState, useEffect, useCallback, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Block, Department, BlockAction, BlockDefinition, Patient, DepartmentBlockType, LabResultContent, RadiologyResultContent, Charge } from '../types'
import {
  syncLabResultBlockCharges,
  syncRadiologyResultBlockCharges,
  usesCustomChargeRules,
  blockAllowsManualBlockFees,
} from '../lib/blockBilling'
import { BlockManualFeesPanel } from '../components/timeline/capabilities/BlockManualFeesPanel'
import { fullName, cn, formatDateTime } from '../lib/utils'
import { Loader2, CheckCircle2, X, Plus, Building2, Clock, History, ChevronRight, ChevronDown, Search, ExternalLink, BookOpen, DollarSign, Flame, XCircle, AlertCircle, UserPlus, Home, Ban } from 'lucide-react'
import { Button, ScrollArea, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle, Separator } from '../components/ui'
import Logo from '../components/Logo'
import { DynamicBlockEdit, DynamicBlockView } from '../components/timeline/DynamicBlock'
import { BLOCK_REGISTRY, orphanRegistryRenderKey, registryRenderKey } from '../components/timeline/BlockRegistry'
import { getRecentPatientIds, pushRecentPatientId } from '../lib/recentItems'
import { parseSearchQuery } from '../lib/patientSearch'
import { readWalkInLastBlockType, writeWalkInLastBlockType } from '../lib/walkInPreferences'
import { CreatePatientDialog } from '../components/patients/CreatePatientDialog'
// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderWithContext extends BlockAction {
  order_block?: {
    content: Record<string, unknown>
    type: string
    definition_id: string | null
    department_block_type_id: string | null
    order_def: BlockDefinition | null
    order_block_type: { name: string } | null
  } | null
  patients?: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'> | null
}

interface PastEntry {
  id: string                    // block_action.id (fulfilled) or blocks.id (direct)
  block_id: string | null       // actual blocks.id — needed for share toggle
  created_by: string | null     // blocks.created_by — needed to gate share toggle
  kind: 'fulfilled_order' | 'direct'
  patient: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'> | null
  service_name: string | null   // department_block_types.name
  block_type: string            // blocks.type slug — used to look up BLOCK_REGISTRY
  registry_slug: string | null // from block_definitions — renderer key before def row loads
  def_id: string | null         // entry block definition id
  content: Record<string, unknown>
  author_name: string | null
  date: string                  // completed_at or created_at
  share_to_record: boolean
}

/** Registry View/Edit key for portal previews (variants, joined registry_slug, orphaned defs). */
function portalRegistryRenderKey(
  def: BlockDefinition | null,
  blockType: string,
  registrySlugWhenNoDef: string | null = null,
): string {
  if (def) return registryRenderKey(def)
  const fromJoin = registryRenderKey({
    slug: blockType,
    registry_slug: registrySlugWhenNoDef,
  })
  if (fromJoin in BLOCK_REGISTRY) return fromJoin
  return orphanRegistryRenderKey(blockType)
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:      { label: 'Pending',     cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  in_progress:  { label: 'In Progress', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  completed:    { label: 'Completed',   cls: 'bg-green-100 text-green-800 border-green-300' },
  acknowledged: { label: 'Acknowledged',cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  cancelled:    { label: 'Cancelled',   cls: 'bg-red-100 text-red-800 border-red-300' },
}

function applyEmptyContentForDef(def: BlockDefinition): Record<string, unknown> {
  const init: Record<string, unknown> = {}
  def.fields.forEach(f => {
    if (f.type === 'checkbox') init[f.id] = false
    else if (f.type === 'multiselect') init[f.id] = []
    else if (f.type !== 'section_header') init[f.id] = ''
  })
  return init
}

// ─── Entry modal: post-save charge actions (shared with history card pattern) ─

type PortalChargeAct =
  | { mode: 'single'; id: string; op: 'approve' | 'void' }
  | { mode: 'bulk'; op: 'approve' | 'void' }

/** Read-only request / order block while staff enter the department result (lab_order, radiology_request, etc.). */
function OrderRequestPreviewPanel({ order }: { order: OrderWithContext }) {
  const [open, setOpen] = useState(true)
  const ob = order.order_block
  if (!ob) return null

  const def = ob.order_def ?? null
  const content = ob.content ?? {}
  const hasContent = Object.keys(content).length > 0
  const serviceLabel = ob.order_block_type?.name?.trim() || def?.name?.trim() || 'Request'

  const stubBase: Omit<Block, 'id' | 'type' | 'content'> = {
    state: 'active',
    sequence_order: 0,
    created_at: order.triggered_at,
    author_name: null,
    encounter_id: order.encounter_id ?? null,
    patient_id: order.patient_id ?? null,
    department_id: null,
    department_block_type_id: ob.department_block_type_id ?? null,
    definition_id: ob.definition_id ?? null,
    share_to_record: false,
    visible_to_roles: [],
    is_template_seed: false,
    is_pinned: false,
    supersedes_block_id: null,
    locked_by: null,
    locked_at: null,
    created_by: null,
    updated_at: '',
  }

  return (
    <div className="rounded-lg border border-violet-200/80 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-violet-100/50 dark:hover:bg-violet-950/40 transition-colors"
        aria-expanded={open}
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="text-foreground">Original request</span>
        <span className="text-muted-foreground font-normal truncate">— {serviceLabel}</span>
      </button>
      {open && (
        <div className="border-t border-violet-200/60 dark:border-violet-900/40 px-3 py-2.5 max-h-[min(40vh,18rem)] overflow-y-auto text-xs bg-background/60">
          {hasContent && BLOCK_REGISTRY[portalRegistryRenderKey(def, ob.type, null)] ? (
            (() => {
              const regKey = portalRegistryRenderKey(def, ob.type, null)
              const Renderer = BLOCK_REGISTRY[regKey].View
              const stub = {
                ...stubBase,
                id: order.block_id ?? order.id,
                type: ob.type,
                content,
              } as Block
              return <Renderer block={stub} />
            })()
          ) : hasContent && def ? (
            <DynamicBlockView definition={def} content={content} />
          ) : hasContent ? (
            <dl className="space-y-1">
              {Object.entries(content).map(([k, v]) => v !== '' && v != null ? (
                <div key={k} className="flex gap-1.5">
                  <dt className="text-muted-foreground capitalize shrink-0">{k.replace(/_/g, ' ')}:</dt>
                  <dd className="font-medium break-words">{String(v)}</dd>
                </div>
              ) : null)}
            </dl>
          ) : (
            <p className="text-muted-foreground italic">No details recorded on the request.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Entry form modal ─────────────────────────────────────────────────────────

function EntryModal({
  dept,
  orderAction,
  patientForWalkIn,
  selectedBTId,
  onClose,
  onDone,
  deptBlockTypes,
  deptBlockTypesLoading,
  prefetchedDefinitions,
}: {
  dept: Department
  orderAction: OrderWithContext | null
  patientForWalkIn?: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'> | null
  selectedBTId?: string | null       // pre-selected block type for walk-ins
  onClose: () => void
  onDone: (chargeMsg?: string | null) => void
  deptBlockTypes: DepartmentBlockType[]
  deptBlockTypesLoading: boolean
  prefetchedDefinitions: Record<string, BlockDefinition>
}) {
  const { user, profile, can } = useAuthStore()
  const { billingEnabled, currencySymbol, nameFormat } = useSettingsStore()
  const userId = user?.id
  const canApproveCharges = can('billing.charge')
  const [chosenBTId, setChosenBTId] = useState<string>(selectedBTId ?? '')
  const [entryDef, setEntryDef]     = useState<BlockDefinition | null>(null)
  /** block_definitions row for built-in lab_result or radiology_result (billing + definition_id on save) */
  const [departmentResultDef, setDepartmentResultDef] = useState<BlockDefinition | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [content, setContent]       = useState<Record<string, unknown>>({})
  const [phase, setPhase]           = useState<'form' | 'billing'>('form')
  const [savedBlockId, setSavedBlockId] = useState<string | null>(null)
  const [savedEncounterId, setSavedEncounterId] = useState<string | null>(null)
  const [savedChargeMsg, setSavedChargeMsg] = useState<string | null>(null)
  const [blockCharges, setBlockCharges] = useState<Charge[]>([])
  const [billingDefinition, setBillingDefinition] = useState<BlockDefinition | null>(null)
  const [chargeAct, setChargeAct] = useState<PortalChargeAct | null>(null)
  const formBusy = deptBlockTypesLoading || loading

  // Sync chosen block type when department block types finish loading
  useEffect(() => {
    if (deptBlockTypesLoading) return
    const payloadBTId = (orderAction?.action_payload as { block_type_id?: string } | null)?.block_type_id
    let fromStorage: string | null = null
    if (!orderAction && userId) {
      const raw = readWalkInLastBlockType(dept.id, userId)
      if (raw && deptBlockTypes.some(b => b.id === raw)) fromStorage = raw
    }
    const initial = payloadBTId ?? selectedBTId ?? fromStorage ?? deptBlockTypes[0]?.id ?? ''
    setChosenBTId(initial)
  }, [deptBlockTypesLoading, deptBlockTypes, orderAction, selectedBTId, dept.id, userId])

  // Load entry block def when chosen block type changes
  useEffect(() => {
    if (deptBlockTypesLoading) return
    if (!chosenBTId) { setEntryDef(null); setLoading(false); return }
    const bt = deptBlockTypes.find(b => b.id === chosenBTId)
    if (bt?.built_in_type) { setEntryDef(null); setLoading(false); return }
    if (!bt?.entry_block_def_id) { setEntryDef(null); setLoading(false); return }

    const defId = bt.entry_block_def_id
    const prefetched = prefetchedDefinitions[defId]
    if (prefetched) {
      setEntryDef(prefetched)
      setContent(applyEmptyContentForDef(prefetched))
      setLoading(false)
      return
    }

    setLoading(true)
    let cancelled = false
    supabase
      .from('block_definitions')
      .select('*')
      .eq('id', defId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          const def = data as BlockDefinition
          setEntryDef(def)
          setContent(applyEmptyContentForDef(def))
        } else {
          setEntryDef(null)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [chosenBTId, deptBlockTypes, prefetchedDefinitions, deptBlockTypesLoading])

  useEffect(() => {
    const bt = deptBlockTypes.find(b => b.id === chosenBTId)
    const slug =
      bt?.built_in_type === 'lab_result' ? 'lab_result'
      : bt?.built_in_type === 'radiology_result' ? 'radiology_result'
      : null
    if (!slug) {
      setDepartmentResultDef(null)
      return
    }
    let cancelled = false
    supabase
      .from('block_definitions')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setDepartmentResultDef(data as BlockDefinition)
      })
    return () => { cancelled = true }
  }, [chosenBTId, deptBlockTypes])

  const patient = orderAction?.patients ?? patientForWalkIn
  const builtInType = deptBlockTypes.find(b => b.id === chosenBTId)?.built_in_type ?? null

  // When fulfilling an order, seed the result stub from the action payload
  const orderPayload = orderAction?.action_payload as {
    block_type_id?: string
    panels?: string[]
    studies?: string[]
    custom?: unknown[]
  } | null

  const prePopulatedContent =
    builtInType === 'lab_result' && orderPayload
      ? {
          ...(BLOCK_REGISTRY['lab_result']?.emptyContent() ?? {}),
          panels:      orderPayload.panels ?? [],
          custom_defs: (orderPayload.custom ?? []) as LabResultContent['custom_defs'],
        }
      : builtInType === 'radiology_result' && orderPayload
        ? {
            ...(BLOCK_REGISTRY['radiology_result']?.emptyContent() ?? {}),
            studies: orderPayload.studies ?? [],
            custom_defs: (orderPayload.custom ?? []).map(x =>
              x && typeof x === 'object' && 'name' in x
                ? {
                    name:     String((x as { name: string }).name),
                    modality:
                      'modality' in x && (x as { modality?: unknown }).modality != null
                        ? String((x as { modality: string }).modality)
                        : undefined,
                  }
                : { name: '' },
            ),
          }
        : null

  // Shared DB write used by both submit paths
  const writeBlock = async (blockContent: Record<string, unknown>, blockType: string, defId: string | null) => {
    if (!user) return
    const bt = deptBlockTypes.find(b => b.id === chosenBTId)
    setSaving(true)
    const blockRow = {
      encounter_id:             null,
      department_id:            dept.id,
      department_block_type_id: bt?.id ?? null,
      patient_id:               patient?.id ?? null,
      type:                     blockType,
      definition_id:            defId,
      content:                  blockContent,
      state:                    'active',
      sequence_order:           0,
      share_to_record:          true,
      visible_to_roles:         [] as string[],
      is_template_seed:         false,
      is_pinned:                false,
      author_name:              profile?.full_name ?? null,
      created_by:               user.id,
    }
    const { data: newBlock, error } = await supabase.from('blocks').insert(blockRow).select('id').single()
    if (!error && newBlock && orderAction) {
      await supabase.from('block_actions').update({
        status:          'completed',
        result_block_id: (newBlock as { id: string }).id,
        completed_at:    new Date().toISOString(),
      }).eq('id', orderAction.id)
    }

    const newId = (newBlock as { id: string } | null)?.id
    if (
      !error &&
      newId &&
      blockType === 'lab_result' &&
      departmentResultDef &&
      usesCustomChargeRules(departmentResultDef) &&
      patient?.id &&
      user &&
      billingEnabled &&
      can('billing.charge')
    ) {
      await syncLabResultBlockCharges({
        blockId: newId,
        patientId: patient.id,
        encounterId: orderAction?.encounter_id ?? null,
        userId: user.id,
        definition: departmentResultDef,
        content: blockContent as unknown as LabResultContent,
      })
    }

    if (
      !error &&
      newId &&
      blockType === 'radiology_result' &&
      departmentResultDef &&
      usesCustomChargeRules(departmentResultDef) &&
      patient?.id &&
      user &&
      billingEnabled &&
      can('billing.charge')
    ) {
      await syncRadiologyResultBlockCharges({
        blockId: newId,
        patientId: patient.id,
        encounterId: orderAction?.encounter_id ?? null,
        userId: user.id,
        definition: departmentResultDef,
        content: blockContent as unknown as RadiologyResultContent,
      })
    }

    // Auto-charge from result block definition (same rules as timeline add-block)
    let chargeMsg: string | null = null
    const chargeDef =
      blockType === 'lab_result' || blockType === 'radiology_result'
        ? departmentResultDef
        : entryDef
    if (
      !error &&
      newBlock &&
      patient?.id &&
      user &&
      billingEnabled &&
      can('billing.charge') &&
      chargeDef?.service_item_id &&
      chargeDef.charge_mode &&
      !usesCustomChargeRules(chargeDef)
    ) {
      const { data: svc } = await supabase
        .from('service_items')
        .select('name, default_price')
        .eq('id', chargeDef.service_item_id)
        .single()
      if (svc) {
        const chargeStatus = chargeDef.charge_mode === 'confirm' ? 'pending_approval' : 'pending'
        await supabase.from('charges').insert({
          patient_id:      patient.id,
          encounter_id:    orderAction?.encounter_id ?? null,
          block_id:        (newBlock as { id: string }).id,
          service_item_id: chargeDef.service_item_id,
          description:     svc.name,
          quantity:        1,
          unit_price:      svc.default_price,
          status:          chargeStatus,
          source:          'block_auto',
          created_by:      user.id,
        })
        chargeMsg = chargeDef.charge_mode === 'confirm'
          ? `Charge of ${currencySymbol}${svc.default_price.toFixed(2)} for "${svc.name}" created — awaiting approval`
          : `Charge of ${currencySymbol}${svc.default_price.toFixed(2)} for "${svc.name}" approved automatically`
      }
    }
    if (!error && newBlock && !orderAction && userId && chosenBTId) {
      writeWalkInLastBlockType(dept.id, userId, chosenBTId)
    }
    setSaving(false)
    if (error) return
    if (!newId) {
      onDone(chargeMsg)
      return
    }

    const { data: chData } = await supabase
      .from('charges')
      .select('*')
      .eq('block_id', newId)
      .not('status', 'in', '(void,waived)')
      .order('created_at', { ascending: true })
    const chList = (chData ?? []) as Charge[]
    const pendingApproval = chList.filter(c => c.status === 'pending_approval')
    const manualDef =
      builtInType === 'lab_result' || builtInType === 'radiology_result' ? departmentResultDef : entryDef
    const showBillingReview =
      billingEnabled &&
      !!patient?.id &&
      (pendingApproval.length > 0 ||
        (blockAllowsManualBlockFees(manualDef) && canApproveCharges))

    if (showBillingReview) {
      setSavedBlockId(newId)
      setSavedEncounterId(orderAction?.encounter_id ?? null)
      setSavedChargeMsg(chargeMsg)
      setBlockCharges(chList)
      setBillingDefinition(manualDef)
      setPhase('billing')
    } else {
      onDone(chargeMsg)
    }
  }

  // Called by built-in Edit component's own Save button
  const submitBuiltIn = async (newContent: Record<string, unknown>) => {
    const defId =
      builtInType === 'lab_result' || builtInType === 'radiology_result'
        ? (departmentResultDef?.id ?? null)
        : null
    await writeBlock(newContent, builtInType!, defId)
  }

  // Called by the footer Save button for dynamic (definition-based) block types
  const submit = async () => {
    await writeBlock(content, entryDef?.slug ?? 'dept_entry', entryDef?.id ?? null)
  }

  const refreshBlockCharges = useCallback(async () => {
    if (!savedBlockId) return
    const { data } = await supabase
      .from('charges')
      .select('*')
      .eq('block_id', savedBlockId)
      .not('status', 'in', '(void,waived)')
      .order('created_at', { ascending: true })
    setBlockCharges((data ?? []) as Charge[])
  }, [savedBlockId])

  const pendingInModal = useMemo(
    () => blockCharges.filter(c => c.status === 'pending_approval'),
    [blockCharges],
  )

  const approveChargeInModal = async (chargeId: string) => {
    setChargeAct({ mode: 'single', id: chargeId, op: 'approve' })
    await supabase.from('charges').update({ status: 'pending' }).eq('id', chargeId).eq('status', 'pending_approval')
    setChargeAct(null)
    void refreshBlockCharges()
  }

  const voidPendingInModal = async (chargeId: string) => {
    setChargeAct({ mode: 'single', id: chargeId, op: 'void' })
    await supabase
      .from('charges')
      .update({ status: 'void', voided_reason: 'Voided from department portal' })
      .eq('id', chargeId)
    setChargeAct(null)
    void refreshBlockCharges()
  }

  const voidManualInModal = async (chargeId: string) => {
    await supabase
      .from('charges')
      .update({ status: 'void', voided_reason: 'Voided from department portal' })
      .eq('id', chargeId)
    void refreshBlockCharges()
  }

  const dismissBackdrop = () => {
    if (phase === 'form') onClose()
  }

  if (phase === 'billing' && savedBlockId && patient) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div>
              <p className="text-sm font-medium">Entry saved</p>
              <p className="text-xs text-muted-foreground">Confirm charges and add any additional fees</p>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
            {pendingInModal.length > 0 && (
              <div className="rounded-md border border-blue-200/80 bg-blue-50/60 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/25">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">
                  Confirm payment
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {canApproveCharges
                    ? 'Approve to post these charges to billing, or void to discard them.'
                    : 'These charges are waiting for someone with billing permission to approve them.'}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {pendingInModal.map(c => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-background/80 px-2 py-1.5 text-[11px]"
                    >
                      <span className="min-w-0 font-medium">
                        {c.description}{' '}
                        <span className="text-muted-foreground font-normal">
                          · {c.quantity}× {currencySymbol}{c.unit_price.toFixed(2)}
                        </span>
                      </span>
                      {canApproveCharges && (
                        <span className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] gap-1 px-2"
                            disabled={chargeAct !== null}
                            onClick={() => approveChargeInModal(c.id)}
                          >
                            {chargeAct?.mode === 'single' && chargeAct.id === c.id && chargeAct.op === 'approve'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <CheckCircle2 className="h-3 w-3" />}
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] gap-1 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                            disabled={chargeAct !== null}
                            onClick={() => voidPendingInModal(c.id)}
                          >
                            {chargeAct?.mode === 'single' && chargeAct.id === c.id && chargeAct.op === 'void'
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Ban className="h-3 w-3" />}
                            Void
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {canApproveCharges && pendingInModal.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      disabled={chargeAct !== null}
                      onClick={async () => {
                        setChargeAct({ mode: 'bulk', op: 'approve' })
                        try {
                          const rows = blockCharges.filter(c => c.status === 'pending_approval')
                          for (const c of rows) {
                            await supabase
                              .from('charges')
                              .update({ status: 'pending' })
                              .eq('id', c.id)
                              .eq('status', 'pending_approval')
                          }
                          await refreshBlockCharges()
                        } finally {
                          setChargeAct(null)
                        }
                      }}
                    >
                      {chargeAct?.mode === 'bulk' && chargeAct.op === 'approve'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <CheckCircle2 className="h-3 w-3" />}
                      Approve all
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1 text-destructive border-destructive/30"
                      disabled={chargeAct !== null}
                      onClick={async () => {
                        setChargeAct({ mode: 'bulk', op: 'void' })
                        try {
                          const rows = blockCharges.filter(c => c.status === 'pending_approval')
                          for (const c of rows) {
                            await supabase
                              .from('charges')
                              .update({ status: 'void', voided_reason: 'Voided from department portal' })
                              .eq('id', c.id)
                          }
                          await refreshBlockCharges()
                        } finally {
                          setChargeAct(null)
                        }
                      }}
                    >
                      {chargeAct?.mode === 'bulk' && chargeAct.op === 'void'
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Ban className="h-3 w-3" />}
                      Void all
                    </Button>
                  </div>
                )}
              </div>
            )}

            {blockAllowsManualBlockFees(billingDefinition) &&
              (canApproveCharges || blockCharges.length > 0) && (
              <>
                <Separator />
                <BlockManualFeesPanel
                  blockId={savedBlockId}
                  patientId={patient.id}
                  encounterId={savedEncounterId}
                  definition={billingDefinition}
                  charges={blockCharges}
                  allowFeeEdits={canApproveCharges}
                  onVoidCharge={voidManualInModal}
                  onPosted={refreshBlockCharges}
                />
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0 bg-card">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const stillPending = blockCharges.some(c => c.status === 'pending_approval')
                onDone(stillPending ? savedChargeMsg : null)
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) dismissBackdrop() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismissBackdrop} />
      <div
        className={cn(
          'relative w-full bg-card border border-border rounded-xl shadow-2xl overflow-hidden',
          orderAction?.order_block ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="text-sm font-medium">
              {orderAction ? 'Enter Result' : 'New Entry'}
              {patient && <span className="text-muted-foreground font-normal"> — {fullName(patient as Patient, nameFormat)}</span>}
            </p>
            {entryDef && <p className="text-xs text-muted-foreground">{entryDef.name}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 max-h-[65vh] overflow-y-auto space-y-4">
          {orderAction?.order_block && <OrderRequestPreviewPanel order={orderAction} />}

          {/* Block type selector — only when loaded and multiple types */}
          {!deptBlockTypesLoading && deptBlockTypes.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Service / Test</p>
              <div className="flex flex-wrap gap-1.5">
                {deptBlockTypes.map(bt => (
                  <button
                    key={bt.id}
                    onClick={() => setChosenBTId(bt.id)}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-full border transition-colors',
                      chosenBTId === bt.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50',
                    )}
                  >
                    {bt.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formBusy ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !deptBlockTypesLoading && deptBlockTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No services configured for this department. Ask an admin to add block types in Settings → Departments.
            </p>
          ) : builtInType && BLOCK_REGISTRY[builtInType] ? (
            // Built-in block (e.g. vitals, note, lab_result) — the Edit component owns Save/Cancel
            (() => {
              const Renderer = BLOCK_REGISTRY[builtInType].Edit
              const stub = {
                id: 'new',
                type: builtInType,
                content: prePopulatedContent ?? BLOCK_REGISTRY[builtInType].emptyContent(),
                state: 'active',
                sequence_order: 0,
                created_at: new Date().toISOString(),
                author_name: profile?.full_name ?? null,
                encounter_id: null,
                patient_id: patient?.id ?? null,
                department_id: dept.id,
                department_block_type_id: chosenBTId || null,
                definition_id:
                  builtInType === 'lab_result' || builtInType === 'radiology_result'
                    ? (departmentResultDef?.id ?? null)
                    : null,
                share_to_record: true,
                visible_to_roles: [],
                is_template_seed: false,
                is_pinned: false,
                supersedes_block_id: null,
                locked_by: null,
                locked_at: null,
                created_by: null,
                updated_at: '',
              } as import('../types').Block
              return <Renderer block={stub} onSave={submitBuiltIn} onCancel={onClose} />
            })()
          ) : !entryDef ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No result block configured for this service.
            </p>
          ) : (
            <DynamicBlockEdit
              definition={entryDef}
              content={content}
              onChange={setContent}
            />
          )}
        </div>

        {/* Footer: only shown for dynamic (non built-in) block types */}
        {!builtInType && (entryDef || deptBlockTypes.length > 0) && (
          <div className="flex justify-end gap-2 px-4 py-3 border-t">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={submit} disabled={saving || !patient || !entryDef}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {orderAction ? 'Submit Result' : 'Save Entry'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Patient search (shared: quick charge picker + walk-in intake) ────────────

type WalkInPatientPick = Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'>

function DeptPatientSearchPanel({
  onSelect,
  onRequestClose,
  closeOnEscape = true,
  showRegisterButton,
  onRegisterClick,
  autoFocus = true,
  hideCloseButton,
}: {
  onSelect: (pt: WalkInPatientPick) => void
  onRequestClose?: () => void
  closeOnEscape?: boolean
  showRegisterButton?: boolean
  onRegisterClick?: () => void
  autoFocus?: boolean
  hideCloseButton?: boolean
}) {
  const [q, setQ]               = useState('')
  const [results, setResults]   = useState<Patient[]>([])
  const [recents, setRecents]   = useState<Patient[]>([])
  const [loading, setLoading]   = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRefs  = useRef<(HTMLButtonElement | null)[]>([])
  const seq = useRef(0)
  const { nameFormat } = useSettingsStore()

  useEffect(() => {
    const ids = getRecentPatientIds().map(r => r.id)
    if (ids.length) {
      supabase.from('patients').select('*').in('id', ids).then(({ data }) => {
        if (!data) return
        const map = Object.fromEntries((data as Patient[]).map(p => [p.id, p]))
        setRecents(ids.map(id => map[id]).filter(Boolean) as Patient[])
      })
    } else {
      setRecents([])
    }
  }, [])

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 50)
  }, [autoFocus])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return }
      const req = ++seq.current
      setLoading(true)
      const { tokens, year } = parseSearchQuery(q)
      const { data } = await supabase.rpc('search_patients', {
        p_tokens: tokens ?? undefined,
        p_year:   year   ?? undefined,
        p_limit:  10,
        p_offset: 0,
      })
      if (req !== seq.current) return
      setResults((data ?? []) as Patient[])
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const flatList = useMemo((): Patient[] => {
    if (q.trim()) return results
    return recents
  }, [q, results, recents])

  useEffect(() => {
    setHighlight(h => {
      if (flatList.length === 0) return -1
      if (h >= flatList.length) return flatList.length - 1
      return h
    })
  }, [flatList])

  useEffect(() => {
    const el = rowRefs.current[highlight]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const handleSelect = (pt: WalkInPatientPick) => {
    pushRecentPatientId(pt.id)
    onSelect(pt)
  }

  const showRecents  = !q.trim() && recents.length > 0
  const showResults  = !!q.trim()
  const showEmpty    = q.trim() && !loading && results.length === 0

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (closeOnEscape && e.key === 'Escape') {
      e.preventDefault()
      onRequestClose?.()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (flatList.length === 0) return
      setHighlight(i => (i < 0 ? 0 : Math.min(i + 1, flatList.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (flatList.length === 0) return
      setHighlight(i => (i <= 0 ? 0 : i - 1))
      return
    }
    if (e.key === 'Enter' && highlight >= 0 && flatList[highlight]) {
      e.preventDefault()
      handleSelect(flatList[highlight])
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setHighlight(-1) }}
          onKeyDown={onInputKeyDown}
          placeholder="Search patient by name, MRN, or phone…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {!hideCloseButton && onRequestClose && (
          <button type="button" aria-label="Close" onClick={onRequestClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        )}
      </div>

      <div className="overflow-y-auto max-h-[min(50vh,320px)]">
        {showRecents && (
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1.5">
              <Clock className="h-3 w-3" /> Recent
            </p>
            <ul className="pb-2">
              {recents.map((pt, idx) => (
                <li key={pt.id}>
                  <button
                    ref={el => { rowRefs.current[idx] = el }}
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                      highlight === idx ? 'bg-accent' : 'hover:bg-accent/70',
                    )}
                    onClick={() => handleSelect(pt as WalkInPatientPick)}
                    onMouseEnter={() => setHighlight(idx)}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                      {pt.first_name[0]}{nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{fullName(pt as Patient, nameFormat)}</p>
                      <p className="text-xs text-muted-foreground">{pt.mrn}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showResults && results.length > 0 && (
          <ul className="py-1">
            {results.map((pt, idx) => {
              const age = pt.date_of_birth
                ? Math.floor((Date.now() - new Date(pt.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                : null
              const meta = [pt.mrn, age != null ? `${age}y` : null, pt.gender].filter(Boolean).join(' · ')
              const rowIdx = showRecents ? recents.length + idx : idx
              return (
                <li key={pt.id}>
                  <button
                    ref={el => { rowRefs.current[rowIdx] = el }}
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      highlight === rowIdx ? 'bg-accent' : 'hover:bg-accent/70',
                    )}
                    onClick={() => handleSelect(pt)}
                    onMouseEnter={() => setHighlight(rowIdx)}
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
                      {pt.first_name[0]}{nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{fullName(pt, nameFormat)}</p>
                      <p className="text-xs text-muted-foreground">{meta}</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {showEmpty && (
          <div className="px-4 py-4 space-y-3 text-center">
            <p className="text-sm text-muted-foreground">No patients found</p>
            {showRegisterButton && onRegisterClick && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onRegisterClick}>
                <UserPlus className="h-3.5 w-3.5" />
                Register new patient
              </Button>
            )}
          </div>
        )}

        {!q.trim() && recents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6 px-4">Start typing to search…</p>
        )}
      </div>
    </div>
  )
}

function WalkInPatientPicker({
  onSelect,
  onClose,
  showRegisterButton,
  onRegisterClick,
}: {
  onSelect: (pt: WalkInPatientPick) => void
  onClose: () => void
  showRegisterButton?: boolean
  onRegisterClick?: () => void
}) {
  useEffect(() => {
    const h = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <DeptPatientSearchPanel
          onSelect={onSelect}
          onRequestClose={onClose}
          closeOnEscape
          showRegisterButton={showRegisterButton}
          onRegisterClick={onRegisterClick}
        />
      </div>
    </div>
  )
}

function WalkInIntakeModal({
  dept,
  deptBlockTypes,
  deptBlockTypesLoading,
  preselectBlockTypeId,
  onClose,
  onContinue,
}: {
  dept: Department
  deptBlockTypes: DepartmentBlockType[]
  deptBlockTypesLoading: boolean
  preselectBlockTypeId: string | null
  onClose: () => void
  onContinue: (pt: WalkInPatientPick, blockTypeId: string) => void
}) {
  const { nameFormat } = useSettingsStore()
  const [chosenBt, setChosenBt] = useState<string>('')

  useEffect(() => {
    if (deptBlockTypesLoading) return
    if (preselectBlockTypeId && deptBlockTypes.some(b => b.id === preselectBlockTypeId)) {
      setChosenBt(preselectBlockTypeId)
      return
    }
    if (deptBlockTypes.length === 1) {
      setChosenBt(deptBlockTypes[0].id)
      return
    }
    setChosenBt('')
  }, [deptBlockTypesLoading, deptBlockTypes, preselectBlockTypeId])

  const [selectedPatient, setSelectedPatient] = useState<WalkInPatientPick | null>(null)
  const [createPatientOpen, setCreatePatientOpen] = useState(false)

  useEffect(() => {
    if (createPatientOpen) return
    const h = (ev: globalThis.KeyboardEvent) => { if (ev.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, createPatientOpen])

  const canContinue = (patient: WalkInPatientPick | null): patient is WalkInPatientPick => {
    if (!patient) return false
    if (deptBlockTypesLoading || deptBlockTypes.length === 0) return false
    return !!chosenBt && deptBlockTypes.some(b => b.id === chosenBt)
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] px-4 pb-8"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div>
              <p className="text-sm font-medium">New walk-in entry</p>
              <p className="text-xs text-muted-foreground">{dept.name} — select patient and service, then continue</p>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 md:divide-x divide-border min-h-0 flex-1 overflow-hidden">
            <div className="flex flex-col min-h-[220px] md:min-h-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1">Patient</p>
              <DeptPatientSearchPanel
                onSelect={pt => { setSelectedPatient(pt); setCreatePatientOpen(false) }}
                closeOnEscape={false}
                hideCloseButton
                showRegisterButton
                onRegisterClick={() => setCreatePatientOpen(true)}
              />
              {selectedPatient && (
                <div className="px-4 py-2 border-t bg-muted/30 text-xs shrink-0">
                  Selected: <span className="font-medium">{fullName(selectedPatient as Patient, nameFormat)}</span>
                  <span className="text-muted-foreground font-mono ml-1">{selectedPatient.mrn}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col p-4 gap-3 min-h-0 overflow-y-auto">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Service</p>
              {deptBlockTypesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : deptBlockTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No services configured for this department.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {deptBlockTypes.map(bt => (
                    <button
                      key={bt.id}
                      type="button"
                      onClick={() => setChosenBt(bt.id)}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-full border transition-colors',
                        chosenBt === bt.id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:border-primary/50',
                      )}
                    >
                      {bt.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1" />
              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2 border-t border-border">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canContinue(selectedPatient)}
                  onClick={() => {
                    if (!canContinue(selectedPatient)) return
                    onContinue(selectedPatient, chosenBt)
                  }}
                >
                  Continue to entry
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreatePatientDialog
        open={createPatientOpen}
        onOpenChange={setCreatePatientOpen}
        title="Register new patient"
        onCreated={p => {
          pushRecentPatientId(p.id)
          setSelectedPatient({
            id: p.id,
            first_name: p.first_name,
            middle_name: p.middle_name,
            last_name: p.last_name,
            mrn: p.mrn,
          })
          setCreatePatientOpen(false)
        }}
      />
    </>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onStart,
  onFulfill,
  onCancel,
}: {
  order: OrderWithContext
  onStart: () => Promise<void>
  onFulfill: () => void
  onCancel: (reason: string) => void
}) {
  const { nameFormat } = useSettingsStore()
  const [expanded, setExpanded]             = useState(false)
  const [rejectOpen, setRejectOpen]         = useState(false)
  const [rejectReason, setRejectReason]     = useState('')
  const [rejecting, setRejecting]           = useState(false)
  const [starting, setStarting]             = useState(false)
  const badge        = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
  const pt           = order.patients
  const ob           = order.order_block
  const serviceName  = ob?.order_block_type?.name ?? null
  const blockName    = ob?.order_def?.name ?? null
  const def          = ob?.order_def ?? null
  const content      = ob?.content ?? {}
  const hasContent   = Object.keys(content).length > 0
  const isStat       = (order.action_payload as { priority?: string } | null)?.priority === 'stat'

  const encounterLink =
    order.patient_id && order.encounter_id
      ? `/patients/${order.patient_id}/encounters/${order.encounter_id}`
      : null

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    setRejecting(true)
    await onCancel(rejectReason.trim())
    setRejecting(false)
    setRejectOpen(false)
    setRejectReason('')
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 p-3">
        {/* Patient avatar */}
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
          {pt ? `${pt.first_name[0]}${nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}` : '?'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {pt ? fullName(pt as Patient, nameFormat) : 'Unknown patient'}
            </span>
            {pt && <span className="text-xs text-muted-foreground font-mono">{pt.mrn}</span>}
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border font-medium', badge.cls)}>
              {badge.label}
            </span>
            {isStat && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-700">
                <Flame className="h-2.5 w-2.5" /> STAT
              </span>
            )}
            {encounterLink && (
              <Link
                to={encounterLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium"
                title="Open encounter"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Encounter
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {serviceName && (
              <span className="text-[10px] px-1.5 py-0 rounded border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 font-medium shrink-0">
                {serviceName}
              </span>
            )}
            {blockName && (
              <span className="text-[11px] text-muted-foreground truncate">{blockName}</span>
            )}
            <span className="text-[11px] text-muted-foreground shrink-0">{formatDateTime(order.triggered_at)}</span>
            {hasContent && (
              <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
                {expanded ? 'Hide order' : 'View order'}
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {order.status === 'pending' && (
            <>
              <Button
                size="sm"
                className="h-9 text-xs"
                disabled={starting}
                onClick={async () => {
                  setStarting(true)
                  try {
                    await onStart()
                  } finally {
                    setStarting(false)
                  }
                }}
              >
                {starting ? <><Loader2 className="h-3 w-3 animate-spin" /> Starting…</> : 'Start'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => setRejectOpen(r => !r)}
              >
                <XCircle className="h-3 w-3" /> Reject
              </Button>
            </>
          )}
          {order.status === 'in_progress' && (
            <>
              <Button size="sm" className="h-9 text-xs" onClick={onFulfill}>
                Enter Result
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => setRejectOpen(r => !r)}
              >
                <XCircle className="h-3 w-3" /> Cancel
              </Button>
            </>
          )}
          {order.status === 'completed' && (
            <span className="flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 className="h-3 w-3" /> Done
            </span>
          )}
        </div>
      </div>

      {/* Reject / Cancel reason input */}
      {rejectOpen && (
        <div className="border-t px-3 pb-3 pt-2.5 bg-red-50/50 dark:bg-red-950/10 space-y-2">
          <p className="text-[11px] font-medium text-red-700 dark:text-red-400">
            {order.status === 'pending' ? 'Reject order' : 'Cancel order'} — provide a reason
          </p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleReject(); if (e.key === 'Escape') setRejectOpen(false) }}
              placeholder="e.g. Duplicate, patient declined, wrong department…"
              className="flex-1 rounded-md border border-red-200 bg-white dark:bg-background dark:border-red-800 px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-red-400"
            />
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              disabled={!rejectReason.trim() || rejecting}
              onClick={handleReject}
            >
              {rejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setRejectOpen(false)}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Expandable order content */}
      {expanded && hasContent && (
        <div className="border-t px-4 pb-3 pt-2.5 bg-muted/20 text-xs">
          {ob && BLOCK_REGISTRY[portalRegistryRenderKey(def, ob.type, null)] ? (
            // Built-in block — use registry's typed View
            (() => {
              const regKey = portalRegistryRenderKey(def, ob.type, null)
              const Renderer = BLOCK_REGISTRY[regKey].View
                const stub = {
                  id: order.id,
                  type: ob.type,
                content,
                state: 'active',
                sequence_order: 0,
                created_at: order.triggered_at,
                author_name: null,
                encounter_id: order.encounter_id ?? null,
                patient_id: order.patient_id ?? null,
                department_id: null,
                department_block_type_id: ob.department_block_type_id ?? null,
                definition_id: ob.definition_id ?? null,
                share_to_record: false,
                visible_to_roles: [],
                is_template_seed: false,
                is_pinned: false,
                supersedes_block_id: null,
                locked_by: null,
                locked_at: null,
                created_by: null,
                updated_at: '',
                } as import('../types').Block
              return <Renderer block={stub} />
            })()
          ) : def ? (
            <DynamicBlockView definition={def} content={content} />
          ) : (
            <dl className="space-y-1">
              {Object.entries(content).map(([k, v]) => v !== '' && v != null ? (
                <div key={k} className="flex gap-1.5">
                  <dt className="text-muted-foreground capitalize shrink-0">{k.replace(/_/g, ' ')}:</dt>
                  <dd className="font-medium break-words">{String(v)}</dd>
                </div>
              ) : null)}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Past entry card ─────────────────────────────────────────────────────────

function PastEntryCard({ entry }: { entry: PastEntry }) {
  const [expanded, setExpanded]       = useState(false)
  const [def, setDef]                 = useState<BlockDefinition | null>(null)
  const [loadingDef, setLoadingDef]   = useState(false)
  const [shareToRecord, setShare]     = useState(entry.share_to_record)
  const [blockCharges, setBlockCharges] = useState<Charge[]>([])
  const [chargeAct, setChargeAct] = useState<PortalChargeAct | null>(null)
  const { nameFormat, currencySymbol, billingEnabled } = useSettingsStore()
  const { user, hasRole, can }        = useAuthStore()
  const canEditShare = !!user && (entry.created_by === null || user.id === entry.created_by || hasRole('admin'))
  const canApproveCharges = can('billing.charge')
  const pt = entry.patient

  const loadCharges = useCallback(() => {
    if (!entry.block_id) {
      setBlockCharges([])
      return
    }
    supabase
      .from('charges')
      .select('*')
      .eq('block_id', entry.block_id)
      .not('status', 'in', '(void,waived)')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setBlockCharges((data ?? []) as Charge[])
      })
  }, [entry.block_id])

  useEffect(() => {
    loadCharges()
  }, [loadCharges])

  const chargeSummary = useMemo(() => {
    if (blockCharges.length === 0) return null
    const total = blockCharges.reduce((s, r) => s + r.quantity * r.unit_price, 0)
    const anyPending = blockCharges.some(r => r.status === 'pending_approval')
    const tooltip = blockCharges
      .map(
        r =>
          `${r.description} · ${r.quantity}× ${currencySymbol}${r.unit_price.toFixed(2)}` +
          (r.status === 'pending_approval' ? ' · awaiting approval' : ''),
      )
      .join('\n')
    return { total, anyPending, tooltip }
  }, [blockCharges, currencySymbol])

  const pendingCharges = useMemo(
    () => blockCharges.filter(r => r.status === 'pending_approval'),
    [blockCharges],
  )

  const voidManualBlockFee = async (chargeId: string) => {
    await supabase
      .from('charges')
      .update({ status: 'void', voided_reason: 'Voided from department portal' })
      .eq('id', chargeId)
    loadCharges()
  }

  const approveCharge = async (chargeId: string) => {
    setChargeAct({ mode: 'single', id: chargeId, op: 'approve' })
    await supabase
      .from('charges')
      .update({ status: 'pending' })
      .eq('id', chargeId)
      .eq('status', 'pending_approval')
    setChargeAct(null)
    loadCharges()
  }

  const voidPendingCharge = async (chargeId: string) => {
    setChargeAct({ mode: 'single', id: chargeId, op: 'void' })
    await supabase
      .from('charges')
      .update({ status: 'void', voided_reason: 'Voided from department portal' })
      .eq('id', chargeId)
    setChargeAct(null)
    loadCharges()
  }

  const loadDef = async () => {
    if (def || loadingDef || !entry.def_id) return
    setLoadingDef(true)
    const { data } = await supabase.from('block_definitions').select('*').eq('id', entry.def_id).single()
    if (data) setDef(data as BlockDefinition)
    setLoadingDef(false)
  }

  const toggle = () => {
    if (!expanded) loadDef()
    setExpanded(e => !e)
  }

  const toggleShare = async () => {
    const next = !shareToRecord
    setShare(next)
    if (entry.block_id) await supabase.from('blocks').update({ share_to_record: next }).eq('id', entry.block_id)
  }

  const isOrder = entry.kind === 'fulfilled_order'

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Header: main row toggles expand; charge approve/void are separate controls (no nested buttons) */}
      <div className="flex w-full items-start gap-2 p-3 hover:bg-accent/30 transition-colors">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          {/* Avatar — tinted by kind */}
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center font-semibold text-xs shrink-0',
            isOrder
              ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
          )}>
            {pt ? `${pt.first_name[0]}${nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}` : '?'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {entry.service_name && (
                <span className="text-[10px] px-1.5 py-0 rounded border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 font-medium shrink-0">
                  {entry.service_name}
                </span>
              )}
              <span className="text-sm font-medium truncate">
                {pt ? fullName(pt as Patient, nameFormat) : 'Unknown'}
              </span>
              {pt?.mrn && (
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">{pt.mrn}</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {entry.author_name && `${entry.author_name} · `}{formatDateTime(entry.date)}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {chargeSummary && (
            <span
              title={chargeSummary.tooltip}
              className={cn(
                'inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap leading-none',
                chargeSummary.anyPending
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
              )}
            >
              <span className="opacity-70">{currencySymbol}</span>{chargeSummary.total.toFixed(2)}
              <span className="opacity-60 ml-0.5">· {chargeSummary.anyPending ? 'Pending' : 'Approved'}</span>
            </span>
          )}
          {chargeSummary?.anyPending && canApproveCharges && entry.block_id && (
            <>
              {pendingCharges.length === 1 ? (
                <>
                  <button
                    type="button"
                    title={`Approve charge: ${pendingCharges[0]!.description}`}
                    disabled={chargeAct !== null}
                    onClick={() => approveCharge(pendingCharges[0]!.id)}
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors border',
                      'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
                      'dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700',
                      chargeAct && 'opacity-50 pointer-events-none',
                    )}
                  >
                    {chargeAct?.mode === 'single' &&
                    chargeAct.id === pendingCharges[0]!.id &&
                    chargeAct.op === 'approve'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    title={`Void charge: ${pendingCharges[0]!.description}`}
                    disabled={chargeAct !== null}
                    onClick={() => voidPendingCharge(pendingCharges[0]!.id)}
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors border',
                      'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600',
                      'dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                      chargeAct && 'opacity-50 pointer-events-none',
                    )}
                  >
                    {chargeAct?.mode === 'single' &&
                    chargeAct.id === pendingCharges[0]!.id &&
                    chargeAct.op === 'void'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Ban className="h-3.5 w-3.5" />}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    title={`Approve all ${pendingCharges.length} charges`}
                    disabled={chargeAct !== null}
                    onClick={async () => {
                      setChargeAct({ mode: 'bulk', op: 'approve' })
                      try {
                        for (const c of pendingCharges) {
                          await supabase
                            .from('charges')
                            .update({ status: 'pending' })
                            .eq('id', c.id)
                            .eq('status', 'pending_approval')
                        }
                        loadCharges()
                      } finally {
                        setChargeAct(null)
                      }
                    }}
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors border',
                      'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
                      'dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700',
                      chargeAct && 'opacity-50 pointer-events-none',
                    )}
                  >
                    {chargeAct?.mode === 'bulk' && chargeAct.op === 'approve'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    title={`Void all ${pendingCharges.length} pending charges`}
                    disabled={chargeAct !== null}
                    onClick={async () => {
                      setChargeAct({ mode: 'bulk', op: 'void' })
                      try {
                        for (const c of pendingCharges) {
                          await supabase
                            .from('charges')
                            .update({ status: 'void', voided_reason: 'Voided from department portal' })
                            .eq('id', c.id)
                        }
                        loadCharges()
                      } finally {
                        setChargeAct(null)
                      }
                    }}
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors border',
                      'bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600',
                      'dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                      chargeAct && 'opacity-50 pointer-events-none',
                    )}
                  >
                    {chargeAct?.mode === 'bulk' && chargeAct.op === 'void'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Ban className="h-3.5 w-3.5" />}
                  </button>
                </>
              )}
            </>
          )}
          {shareToRecord && (
            <BookOpen className="h-3 w-3 text-emerald-600" aria-label="Shared to patient record" />
          )}
          <span className={cn(
            'text-[9px] px-1.5 py-0.5 rounded border font-medium',
            isOrder
              ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400'
              : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
          )}>
            {isOrder ? 'Order' : 'Direct'}
          </span>
          <button
            type="button"
            onClick={toggle}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse entry' : 'Expand entry'}
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
          </button>
        </div>
      </div>

      {/* Expanded: content + privacy controls */}
      {expanded && (
        <div className="border-t bg-muted/20">
          {/* Content */}
          <div className="px-4 pt-2.5 pb-3 text-xs">
            {loadingDef ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : BLOCK_REGISTRY[portalRegistryRenderKey(def, entry.block_type, entry.registry_slug)] ? (
              // Built-in block (vitals, note, …) — use registry's typed View
              (() => {
                const regKey = portalRegistryRenderKey(def, entry.block_type, entry.registry_slug)
                const Renderer = BLOCK_REGISTRY[regKey].View
                const stub = {
                  id: entry.block_id ?? entry.id,
                  type: entry.block_type,
                  content: entry.content,
                  state: 'active',
                  sequence_order: 0,
                  created_at: entry.date,
                  author_name: entry.author_name,
                  encounter_id: null,
                  patient_id: entry.patient?.id ?? null,
                  department_id: null,
                  department_block_type_id: null,
                  definition_id: entry.def_id,
                  share_to_record: entry.share_to_record,
                  visible_to_roles: [],
                  is_template_seed: false,
                  is_pinned: false,
                  supersedes_block_id: null,
                  locked_by: null,
                  locked_at: null,
                  created_by: null,
                  updated_at: '',
                } as import('../types').Block
                return <Renderer block={stub} />
              })()
            ) : def ? (
              <DynamicBlockView definition={def} content={entry.content} />
            ) : Object.keys(entry.content).length > 0 ? (
              <dl className="space-y-1">
                {Object.entries(entry.content).map(([k, v]) => v !== '' && v != null ? (
                  <div key={k} className="flex gap-1.5">
                    <dt className="text-muted-foreground capitalize shrink-0">{k.replace(/_/g, ' ')}:</dt>
                    <dd className="font-medium break-words">{String(v)}</dd>
                  </div>
                ) : null)}
              </dl>
            ) : (
              <p className="text-muted-foreground italic">No content</p>
            )}
          </div>

          {entry.block_id && pendingCharges.length > 0 && canApproveCharges && (
            <div className="mx-4 mb-2 rounded-md border border-blue-200/80 bg-blue-50/60 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/25">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">
                Confirm payment
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Approve to post these charges to billing, or void to discard them.
              </p>
              <ul className="mt-2 space-y-1.5">
                {pendingCharges.map(c => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-background/80 px-2 py-1.5 text-[11px]"
                  >
                    <span className="min-w-0 font-medium">
                      {c.description}{' '}
                      <span className="text-muted-foreground font-normal">
                        · {c.quantity}× {currencySymbol}{c.unit_price.toFixed(2)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] gap-1 px-2"
                        disabled={chargeAct !== null}
                        onClick={() => approveCharge(c.id)}
                      >
                        {chargeAct?.mode === 'single' && chargeAct.id === c.id && chargeAct.op === 'approve'
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <CheckCircle2 className="h-3 w-3" />}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] gap-1 px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={chargeAct !== null}
                        onClick={() => voidPendingCharge(c.id)}
                      >
                        {chargeAct?.mode === 'single' && chargeAct.id === c.id && chargeAct.op === 'void'
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Ban className="h-3 w-3" />}
                        Void
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {billingEnabled &&
            !loadingDef &&
            entry.block_id &&
            pt?.id &&
            blockAllowsManualBlockFees(def) &&
            (canApproveCharges || blockCharges.length > 0) && (
              <>
                <Separator />
                <BlockManualFeesPanel
                  blockId={entry.block_id}
                  patientId={pt.id}
                  encounterId={null}
                  definition={def}
                  charges={blockCharges}
                  allowFeeEdits={canApproveCharges}
                  onVoidCharge={voidManualBlockFee}
                  onPosted={async () => {
                    loadCharges()
                  }}
                />
              </>
            )}

          {/* Privacy controls */}
          {entry.block_id && (
            <div className="flex items-center gap-3 px-4 py-2 border-t border-border/50">
              {/* Share to record toggle — editable by block creator or admin only */}
              <button
                type="button"
                onClick={canEditShare ? (e => { e.stopPropagation(); toggleShare() }) : undefined}
                disabled={!canEditShare}
                className={cn(
                  'flex items-center gap-1.5',
                  canEditShare ? 'group' : 'cursor-default opacity-70',
                )}
              >
                <BookOpen className={cn('h-3.5 w-3.5 shrink-0 transition-colors', shareToRecord ? 'text-emerald-600' : 'text-muted-foreground', canEditShare && !shareToRecord && 'group-hover:text-foreground')} />
                <span className={cn('text-[11px] transition-colors', shareToRecord ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-muted-foreground', canEditShare && !shareToRecord && 'group-hover:text-foreground')}>
                  {shareToRecord ? 'In record' : 'Not in record'}
                </span>
                <div className={cn('h-3.5 w-6 rounded-full transition-colors relative shrink-0', shareToRecord ? 'bg-emerald-500' : 'bg-muted-foreground/30')}>
                  <div className={cn('absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-transform', shareToRecord ? 'translate-x-2.5' : 'translate-x-0.5')} />
                </div>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Department tab ───────────────────────────────────────────────────────────

const HISTORY_PAGE_SIZE = 20

/** Shared select for portal queue (full load + single-row realtime hydrate) */
const PORTAL_QUEUE_SELECT = `
  *,
  patients(id,first_name,middle_name,last_name,mrn),
  order_block:blocks!block_actions_block_id_fkey(
    content, type, definition_id, department_block_type_id,
    order_def:block_definitions(*),
    order_block_type:department_block_types(name)
  )
`

const QUEUE_DONE = new Set<string>(['completed', 'cancelled'])

function mergeQueueOrder(prev: OrderWithContext[], row: OrderWithContext): OrderWithContext[] {
  const next = prev.filter((o) => o.id !== row.id)
  next.push(row)
  next.sort((a, b) => new Date(a.triggered_at).getTime() - new Date(b.triggered_at).getTime())
  return next
}

function DeptTab({ dept }: { dept: Department }) {
  const { user: _user, can } = useAuthStore()
  const { billingEnabled, currencySymbol } = useSettingsStore()
  const [view, setView]     = useState<'queue' | 'history'>('queue')
  const [orders, setOrders] = useState<OrderWithContext[]>([])
  const [history, setHistory] = useState<PastEntry[]>([])
  const [loading, setLoading]         = useState(true)
  const [chargeNotice, setChargeNotice] = useState<string | null>(null)
  const [queueActionError, setQueueActionError] = useState<string | null>(null)
  const [loadingHistory, setLoadingH] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)

  // Modal state
  const [fulfillOrder, setFulfillOrder]   = useState<OrderWithContext | null>(null)
  const [walkInPt, setWalkInPt]           = useState<Pick<Patient,'id'|'first_name'|'middle_name'|'last_name'|'mrn'> | null>(null)
  const [selectedBTId, setSelectedBTId]   = useState<string | null>(null)
  const [walkInIntakeOpen, setWalkInIntakeOpen] = useState(false)
  const [walkInPreselectBt, setWalkInPreselectBt] = useState<string | null>(null)
  const [showEntry, setShowEntry]         = useState(false)

  const [deptBlockTypes, setDeptBlockTypes] = useState<DepartmentBlockType[]>([])
  const [deptBlockTypesLoading, setDeptBlockTypesLoading] = useState(true)
  const [prefetchedDefinitions, setPrefetchedDefinitions] = useState<Record<string, BlockDefinition>>({})

  // Quick charge state
  const [showChargePicker, setShowChargePicker] = useState(false)
  const [chargePt, setChargePt]                 = useState<Pick<Patient,'id'|'first_name'|'middle_name'|'last_name'|'mrn'> | null>(null)
  const [quickChargeOpen, setQuickChargeOpen]   = useState(false)
  const [quickChargeDesc, setQuickChargeDesc]   = useState('')
  const [quickChargePrice, setQuickChargePrice] = useState('')
  const [quickChargeSaving, setQCSaving]        = useState(false)
  const [serviceItems, setServiceItems]         = useState<{ id: string; name: string; default_price: number }[]>([])
  const [createPatientChargeOpen, setCreatePatientChargeOpen] = useState(false)

  useEffect(() => {
    if (billingEnabled && can('billing.charge')) {
      supabase.from('service_items').select('id, name, default_price').eq('active', true).order('name')
        .then(({ data }) => { if (data) setServiceItems(data) })
    }
  }, [billingEnabled, can])

  useEffect(() => {
    setDeptBlockTypesLoading(true)
    setDeptBlockTypes([])
    supabase
      .from('department_block_types')
      .select('*')
      .eq('department_id', dept.id)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        setDeptBlockTypes((data ?? []) as DepartmentBlockType[])
        setDeptBlockTypesLoading(false)
      })
  }, [dept.id])

  useEffect(() => {
    const ids = [...new Set(deptBlockTypes.map(bt => bt.entry_block_def_id).filter((id): id is string => !!id))]
    if (ids.length === 0) {
      setPrefetchedDefinitions({})
      return
    }
    supabase
      .from('block_definitions')
      .select('*')
      .in('id', ids)
      .then(({ data }) => {
        const map: Record<string, BlockDefinition> = {}
        for (const row of (data ?? []) as BlockDefinition[]) {
          map[row.id] = row
        }
        setPrefetchedDefinitions(map)
      })
  }, [deptBlockTypes])

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true
    if (!quiet) setLoading(true)
    try {
      const { data } = await supabase
        .from('block_actions')
        .select(PORTAL_QUEUE_SELECT)
        .eq('action_type', dept.slug)
        .not('status', 'in', '(completed,cancelled)')
        .order('triggered_at', { ascending: true })
      if (data) setOrders(data as unknown as OrderWithContext[])
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [dept.slug])

  const dismissEntryModal = useCallback(
    (chargeMsg?: string | null) => {
      void load({ quiet: true })
      setShowEntry(false)
      setFulfillOrder(null)
      setWalkInPt(null)
      setSelectedBTId(null)
      setHistory([])
      setHistoryLimit(HISTORY_PAGE_SIZE)
      setHasMoreHistory(false)
      if (chargeMsg) {
        setChargeNotice(chargeMsg)
        setTimeout(() => setChargeNotice(null), 5000)
      }
    },
    [load],
  )

  const fetchOrderWithContext = useCallback(async (actionId: string): Promise<OrderWithContext | null> => {
    const { data, error } = await supabase
      .from('block_actions')
      .select(PORTAL_QUEUE_SELECT)
      .eq('id', actionId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as unknown as OrderWithContext
    if (row.action_type !== dept.slug || QUEUE_DONE.has(row.status)) return null
    return row
  }, [dept.slug])

  const applyBlockActionRealtime = useCallback(
    async (payload: {
      eventType: 'INSERT' | 'UPDATE' | 'DELETE'
      new: Record<string, unknown> | null
      old: Record<string, unknown> | null
    }) => {
      const slug = dept.slug
      const n = payload.new as { id?: string; action_type?: string; status?: string } | null
      const o = payload.old as { id?: string; action_type?: string; status?: string } | null

      if (payload.eventType === 'INSERT') {
        if (n?.action_type !== slug || !n.id) return
        if (n.status && QUEUE_DONE.has(n.status)) return
        const row = await fetchOrderWithContext(n.id)
        if (!row) {
          await load()
          return
        }
        setOrders((prev) => mergeQueueOrder(prev, row))
        return
      }

      if (payload.eventType === 'UPDATE') {
        const id = n?.id ?? o?.id
        if (!id) return
        const wasOurs = o?.action_type === slug
        const isOurs = n?.action_type === slug
        if (!wasOurs && !isOurs) return

        if (isOurs && n?.status && QUEUE_DONE.has(n.status)) {
          setOrders((prev) => prev.filter((x) => x.id !== id))
          return
        }
        if (!isOurs && wasOurs) {
          setOrders((prev) => prev.filter((x) => x.id !== id))
          return
        }
        if (isOurs) {
          const row = await fetchOrderWithContext(id)
          if (!row) {
            await load()
            return
          }
          setOrders((prev) => mergeQueueOrder(prev, row))
        }
        return
      }

      if (payload.eventType === 'DELETE' && o?.action_type === slug && o.id) {
        setOrders((prev) => prev.filter((x) => x.id !== o.id))
      }
    },
    [dept.slug, fetchOrderWithContext, load],
  )

  const loadHistory = useCallback(async (limit = HISTORY_PAGE_SIZE) => {
    setLoadingH(true)

    // Fetch limit+1 to detect whether more pages exist
    const fetchLimit = limit + 1

    const [{ data: actions }, { data: directs }, { data: linkedResults }] = await Promise.all([
      supabase
        .from('block_actions')
        .select(`
          id, completed_at,
          patients(id,first_name,middle_name,last_name,mrn),
          result_block:blocks!block_actions_result_block_id_fkey(
            id, type, content, author_name, created_by, department_block_type_id, definition_id, share_to_record,
            department_block_types(name),
            block_definitions(registry_slug)
          )
        `)
        .eq('action_type', dept.slug)
        .eq('status', 'completed')
        .not('result_block_id', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(fetchLimit),
      supabase
        .from('blocks')
        .select(`
          id, type, content, author_name, created_by, created_at, definition_id, department_block_type_id,
          share_to_record,
          patients(id,first_name,middle_name,last_name,mrn),
          department_block_types(name),
          block_definitions(registry_slug)
        `)
        .eq('department_id', dept.id)
        .is('encounter_id', null)
        .eq('state', 'active')
        .order('created_at', { ascending: false })
        .limit(fetchLimit),
      supabase
        .from('block_actions')
        .select('result_block_id')
        .eq('action_type', dept.slug)
        .not('result_block_id', 'is', null),
    ])

    const linkedResultIds = new Set(
      (linkedResults ?? [])
        .map((r: { result_block_id: string | null }) => r.result_block_id)
        .filter(Boolean) as string[],
    )

    const fulfilled: PastEntry[] = (actions ?? []).map((a: Record<string, unknown>) => {
      const rb  = a.result_block as Record<string, unknown> | null
      const dbt = rb?.department_block_types as { name: string } | null
      const bd  = rb?.block_definitions as { registry_slug: string | null } | null
      return {
        id:             a.id as string,
        block_id:       (rb?.id as string | null) ?? null,
        created_by:     (rb?.created_by as string | null) ?? null,
        kind:           'fulfilled_order' as const,
        patient:        (a.patients as PastEntry['patient']) ?? null,
        service_name:   dbt?.name ?? null,
        block_type:     (rb?.type as string) ?? 'dept_entry',
        registry_slug:  bd?.registry_slug ?? null,
        def_id:         (rb?.definition_id as string | null) ?? null,
        content:        (rb?.content as Record<string, unknown>) ?? {},
        author_name:    (rb?.author_name as string | null) ?? null,
        date:           a.completed_at as string,
        share_to_record: (rb?.share_to_record as boolean) ?? true,
      }
    })

    // True walk-ins only: omit blocks that are already a completed order’s result (those show under fulfilled)
    const direct: PastEntry[] = (directs ?? [])
      .filter((b: Record<string, unknown>) => !linkedResultIds.has(b.id as string))
      .map((b: Record<string, unknown>) => {
        const dbt = b.department_block_types as { name: string } | null
        const bd  = b.block_definitions as { registry_slug: string | null } | null
        return {
          id:             b.id as string,
          block_id:       b.id as string,
          created_by:     (b.created_by as string | null) ?? null,
          kind:           'direct' as const,
          patient:        (b.patients as PastEntry['patient']) ?? null,
          service_name:   dbt?.name ?? null,
          block_type:     (b.type as string) ?? 'dept_entry',
          registry_slug:  bd?.registry_slug ?? null,
          def_id:         (b.definition_id as string | null) ?? null,
          content:        (b.content as Record<string, unknown>) ?? {},
          author_name:    (b.author_name as string | null) ?? null,
          date:           b.created_at as string,
          share_to_record: (b.share_to_record as boolean) ?? true,
        }
      })

    const all = [...fulfilled, ...direct].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    const hasMore = all.length > limit
    setHistory(all.slice(0, limit))
    setHasMoreHistory(hasMore)
    setLoadingH(false)
  }, [dept.slug, dept.id])

  useEffect(() => {
    load()
    const isThisDeptRow = (payload: { new?: unknown; old?: unknown }) => {
      const slug = dept.slug
      const n = payload.new as { action_type?: string } | null | undefined
      const o = payload.old as { action_type?: string } | null | undefined
      return n?.action_type === slug || o?.action_type === slug
    }
    const channel = supabase
      .channel(`portal:${dept.slug}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'block_actions' },
        (payload) => {
          if (!isThisDeptRow(payload)) return
          void applyBlockActionRealtime({
            eventType: payload.eventType,
            new: (payload.new as Record<string, unknown> | null) ?? null,
            old: (payload.old as Record<string, unknown> | null) ?? null,
          })
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dept.slug, load, applyBlockActionRealtime])

  // Load history when tab is first opened
  useEffect(() => {
    if (view === 'history' && history.length === 0 && !loadingHistory) loadHistory(historyLimit)
  }, [view, history.length, loadingHistory, loadHistory, historyLimit])

  const startOrder = async (order: OrderWithContext) => {
    setQueueActionError(null)
    const { error } = await supabase
      .from('block_actions')
      .update({ status: 'in_progress' })
      .eq('id', order.id)
    if (error) {
      setQueueActionError(error.message)
      return
    }
    const btId = (order.action_payload as { block_type_id?: string } | null)?.block_type_id ?? null
    setFulfillOrder({ ...order, status: 'in_progress' })
    setSelectedBTId(btId)
    setShowEntry(true)
    await load({ quiet: true })
  }

  const cancelOrder = async (order: OrderWithContext, reason: string) => {
    await supabase
      .from('block_actions')
      .update({ status: 'cancelled', cancel_reason: reason, completed_at: new Date().toISOString() })
      .eq('id', order.id)
    load()
  }

  const handleNewEntry = (btId?: string) => {
    setWalkInPt(null)
    setWalkInPreselectBt(btId ?? null)
    setWalkInIntakeOpen(true)
  }

  const handleLoadMoreHistory = () => {
    const nextLimit = historyLimit + HISTORY_PAGE_SIZE
    setHistoryLimit(nextLimit)
    loadHistory(nextLimit)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">{dept.name}</span>

          {/* Queue / History toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted text-xs">
            <button
              onClick={() => setView('queue')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
                view === 'queue'
                  ? 'bg-background text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Clock className="h-3 w-3" />
              Queue
              {!loading && orders.length > 0 && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded-full font-medium">
                  {orders.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setView('history')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
                view === 'history'
                  ? 'bg-background text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <History className="h-3 w-3" />
              History
              {history.length > 0 && (
                <span className="text-[10px] bg-muted-foreground/20 text-muted-foreground px-1 rounded-full">
                  {hasMoreHistory ? `${history.length}+` : history.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {billingEnabled && can('billing.charge') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setChargePt(null); setShowChargePicker(true) }}
              className="h-6 gap-0.5 px-2 text-[10px] font-medium"
              title="Quick charge"
            >
              <DollarSign className="h-3 w-3 shrink-0" />
              <span className="hidden sm:inline">Charge</span>
            </Button>
          )}
          {dept.can_create_direct && (
            <Button size="sm" variant="outline" onClick={() => handleNewEntry()}>
              <Plus className="h-3.5 w-3.5" /> New Entry
            </Button>
          )}
        </div>
      </div>

      {queueActionError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-800 text-xs dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{queueActionError}</span>
          <button type="button" onClick={() => setQueueActionError(null)} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Charge notice */}
      {chargeNotice && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
          <DollarSign className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{chargeNotice}</span>
          <button onClick={() => setChargeNotice(null)} className="text-emerald-600 hover:text-emerald-800"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3">

          {/* ── Queue ── */}
          {view === 'queue' && (
            loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <CheckCircle2 className="h-8 w-8 opacity-20" />
                <p className="text-sm">No pending orders</p>
              </div>
            ) : (
              orders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onStart={() => startOrder(order)}
                  onCancel={(reason) => cancelOrder(order, reason)}
                  onFulfill={() => {
                    const btId = (order.action_payload as { block_type_id?: string } | null)?.block_type_id ?? null
                    setFulfillOrder(order)
                    setSelectedBTId(btId)
                    setShowEntry(true)
                  }}
                />
              ))
            )
          )}

          {/* ── History ── */}
          {view === 'history' && (
            loadingHistory ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <History className="h-8 w-8 opacity-20" />
                <p className="text-sm">No past entries yet</p>
                <p className="text-xs">Fulfilled orders and direct entries will appear here.</p>
              </div>
            ) : (
              <>
                {history.map(entry => (
                  <PastEntryCard key={`${entry.kind}-${entry.id}`} entry={entry} />
                ))}
                {hasMoreHistory && (
                  <div className="flex justify-center pt-2 pb-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={handleLoadMoreHistory}
                      disabled={loadingHistory}
                    >
                      {loadingHistory
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</>
                        : 'Load more'}
                    </Button>
                  </div>
                )}
                {!hasMoreHistory && history.length >= HISTORY_PAGE_SIZE && (
                  <p className="text-center text-[11px] text-muted-foreground py-3">All entries loaded</p>
                )}
              </>
            )
          )}

        </div>
      </ScrollArea>

      {/* Modals */}
      {walkInIntakeOpen && dept.can_create_direct && (
        <WalkInIntakeModal
          dept={dept}
          deptBlockTypes={deptBlockTypes}
          deptBlockTypesLoading={deptBlockTypesLoading}
          preselectBlockTypeId={walkInPreselectBt}
          onClose={() => { setWalkInIntakeOpen(false); setWalkInPreselectBt(null) }}
          onContinue={(pt, btId) => {
            setWalkInPt(pt)
            setSelectedBTId(btId)
            setWalkInIntakeOpen(false)
            setWalkInPreselectBt(null)
            setShowEntry(true)
          }}
        />
      )}
      {/* Quick charge: patient picker */}
      {showChargePicker && !chargePt && (
        <WalkInPatientPicker
          showRegisterButton
          onRegisterClick={() => setCreatePatientChargeOpen(true)}
          onSelect={pt => { setChargePt(pt); setShowChargePicker(false); setQuickChargeDesc(''); setQuickChargePrice(''); setQuickChargeOpen(true) }}
          onClose={() => setShowChargePicker(false)}
        />
      )}
      <CreatePatientDialog
        open={createPatientChargeOpen}
        onOpenChange={setCreatePatientChargeOpen}
        title="Register new patient"
        onCreated={p => {
          pushRecentPatientId(p.id)
          setChargePt({
            id: p.id,
            first_name: p.first_name,
            middle_name: p.middle_name,
            last_name: p.last_name,
            mrn: p.mrn,
          })
          setShowChargePicker(false)
          setCreatePatientChargeOpen(false)
          setQuickChargeDesc('')
          setQuickChargePrice('')
          setQuickChargeOpen(true)
        }}
      />
      {/* Quick charge dialog */}
      <Dialog open={quickChargeOpen} onOpenChange={v => { if (!v) { setQuickChargeOpen(false); setChargePt(null) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Quick Charge{chargePt ? ` — ${chargePt.first_name} ${chargePt.last_name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {serviceItems.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Quick pick</Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {serviceItems.slice(0, 10).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setQuickChargeDesc(s.name); setQuickChargePrice(String(s.default_price)) }}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-lg border transition-colors',
                        quickChargeDesc === s.name
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-primary/30',
                      )}
                    >
                      {s.name} — {currencySymbol}{s.default_price.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={quickChargeDesc} onChange={e => setQuickChargeDesc(e.target.value)} placeholder="Charge description" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amount</Label>
              <Input type="number" value={quickChargePrice} onChange={e => setQuickChargePrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setQuickChargeOpen(false); setChargePt(null) }}>Cancel</Button>
              <Button
                size="sm"
                disabled={quickChargeSaving || !quickChargeDesc || !quickChargePrice || !chargePt}
                onClick={async () => {
                  if (!chargePt || !quickChargeDesc || !quickChargePrice) return
                  setQCSaving(true)
                  const { user } = useAuthStore.getState()
                  await supabase.from('charges').insert({
                    patient_id:  chargePt.id,
                    description: quickChargeDesc,
                    quantity:    1,
                    unit_price:  parseFloat(quickChargePrice) || 0,
                    status:      'pending',
                    source:      'manual',
                    created_by:  user!.id,
                  })
                  setQCSaving(false)
                  setQuickChargeOpen(false)
                  setChargePt(null)
                }}
              >
                {quickChargeSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />}
                Add Charge
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {showEntry && (
        <EntryModal
          dept={dept}
          orderAction={fulfillOrder}
          patientForWalkIn={walkInPt}
          selectedBTId={selectedBTId}
          deptBlockTypes={deptBlockTypes}
          deptBlockTypesLoading={deptBlockTypesLoading}
          prefetchedDefinitions={prefetchedDefinitions}
          onClose={() => dismissEntryModal()}
          onDone={chargeMsg => dismissEntryModal(chargeMsg)}
        />
      )}
    </div>
  )
}

// ─── Main portal page ─────────────────────────────────────────────────────────

export default function DeptPortal() {
  const { user, profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('department_members')
      .select('department_id, departments(*)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) {
          const depts = data
            .map((m: { departments: unknown }) => m.departments as Department)
            .filter(Boolean)
            .filter(d => d.active)
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
          setDepartments(depts)
          if (depts.length > 0) setActiveTab(depts[0].slug)
        }
        setLoading(false)
      })
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const activeDept = departments.find(d => d.slug === activeTab) ?? null

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2.5">
          <Logo size={28} className="rounded-lg" />
          <div>
            <p className="text-sm font-semibold leading-tight">Department Portal</p>
            <p className="text-[11px] text-muted-foreground leading-tight">OpenKairo</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground shrink-0"
            title="Home"
            aria-label="Go to home"
            onClick={() => navigate('/')}
          >
            <Home className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground truncate max-w-[160px] sm:max-w-none">{profile?.full_name ?? user?.email}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-xs h-7">
            Sign out
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : departments.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Building2 className="h-10 w-10 opacity-20" />
          <p className="text-sm">You are not assigned to any department.</p>
          <p className="text-xs">Ask an admin to assign you in Settings → Departments.</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile: horizontal department chips */}
          <div className="md:hidden flex overflow-x-auto border-b bg-card shrink-0 px-2 py-2 gap-1.5 no-scrollbar">
            {departments.map(dept => (
              <button
                key={dept.slug}
                onClick={() => setActiveTab(dept.slug)}
                className={cn(
                  'flex items-center gap-1.5 px-3 min-h-[36px] rounded-full text-sm whitespace-nowrap transition-colors shrink-0',
                  activeTab === dept.slug
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                {dept.name}
              </button>
            ))}
          </div>

          <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Department tabs (left sidebar, desktop only) */}
          <nav className="hidden md:flex w-48 border-r flex-col py-3 shrink-0 bg-muted/20">
            {departments.map(dept => (
              <button
                key={dept.slug}
                onClick={() => setActiveTab(dept.slug)}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors relative',
                  activeTab === dept.slug
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {activeTab === dept.slug && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                )}
                <Building2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{dept.name}</span>
              </button>
            ))}
          </nav>

          {/* Active department content */}
          {activeDept && <DeptTab key={activeDept.slug} dept={activeDept} />}
          </div>
        </div>
      )}
    </div>
  )
}
