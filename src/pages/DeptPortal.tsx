import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Department, BlockAction, BlockDefinition, Patient, DepartmentBlockType } from '../types'
import { fullName, cn, formatDateTime } from '../lib/utils'
import { Loader2, CheckCircle2, X, Plus, Building2, Clock, History, ChevronRight, Search, ExternalLink, BookOpen, DollarSign } from 'lucide-react'
import { Button, ScrollArea, Input, Label, Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui'
import Logo from '../components/Logo'
import { DynamicBlockEdit, DynamicBlockView } from '../components/timeline/DynamicBlock'
import { BLOCK_REGISTRY } from '../components/timeline/BlockRegistry'
import { getRecentPatients, pushRecentPatient } from '../lib/recentItems'
import type { RecentEntry } from '../lib/recentItems'
import { parseSearchQuery } from '../lib/patientSearch'
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
  kind: 'fulfilled_order' | 'direct'
  patient: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'> | null
  service_name: string | null   // department_block_types.name
  block_type: string            // blocks.type slug — used to look up BLOCK_REGISTRY
  def_id: string | null         // entry block definition id
  content: Record<string, unknown>
  author_name: string | null
  date: string                  // completed_at or created_at
  share_to_record: boolean
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending:      { label: 'Pending',     cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  in_progress:  { label: 'In Progress', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  completed:    { label: 'Completed',   cls: 'bg-green-100 text-green-800 border-green-300' },
  acknowledged: { label: 'Acknowledged',cls: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  cancelled:    { label: 'Cancelled',   cls: 'bg-red-100 text-red-800 border-red-300' },
}

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Entry form modal ─────────────────────────────────────────────────────────

function EntryModal({
  dept,
  orderAction,
  patientForWalkIn,
  selectedBTId,
  onClose,
  onDone,
}: {
  dept: Department
  orderAction: OrderWithContext | null
  patientForWalkIn?: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'> | null
  selectedBTId?: string | null       // pre-selected block type for walk-ins
  onClose: () => void
  onDone: (chargeMsg?: string | null) => void
}) {
  const { user, profile } = useAuthStore()
  const { nameFormat, billingEnabled, currencySymbol } = useSettingsStore()
  const { can } = useAuthStore()
  const [blockTypes, setBlockTypes] = useState<DepartmentBlockType[]>([])
  const [chosenBTId, setChosenBTId] = useState<string>(selectedBTId ?? '')
  const [entryDef, setEntryDef]     = useState<BlockDefinition | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [content, setContent]       = useState<Record<string, unknown>>({})

  // Load department block types
  useEffect(() => {
    supabase
      .from('department_block_types')
      .select('*')
      .eq('department_id', dept.id)
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => {
        const bts = (data ?? []) as DepartmentBlockType[]
        setBlockTypes(bts)
        // Auto-select: if fulfilling an order, use block_type_id from action_payload
        const payloadBTId = (orderAction?.action_payload as { block_type_id?: string } | null)?.block_type_id
        const initial = payloadBTId ?? selectedBTId ?? bts[0]?.id ?? ''
        setChosenBTId(initial)
      })
  }, [dept.id, orderAction, selectedBTId])

  // Load entry block def when chosen block type changes
  useEffect(() => {
    if (!chosenBTId) { setEntryDef(null); setLoading(false); return }
    const bt = blockTypes.find(b => b.id === chosenBTId)
    // Built-in type: no block_definition needed
    if (bt?.built_in_type) { setEntryDef(null); setLoading(false); return }
    if (!bt?.entry_block_def_id) { setEntryDef(null); setLoading(false); return }
    setLoading(true)
    supabase
      .from('block_definitions')
      .select('*')
      .eq('id', bt.entry_block_def_id)
      .single()
      .then(({ data }) => {
        if (data) {
          const def = data as BlockDefinition
          setEntryDef(def)
          const init: Record<string, unknown> = {}
          def.fields.forEach(f => {
            if (f.type === 'checkbox') init[f.id] = false
            else if (f.type === 'multiselect') init[f.id] = []
            else if (f.type !== 'section_header') init[f.id] = ''
          })
          setContent(init)
        } else {
          setEntryDef(null)
        }
        setLoading(false)
      })
  }, [chosenBTId, blockTypes])

  const patient = orderAction?.patients ?? patientForWalkIn
  const builtInType = blockTypes.find(b => b.id === chosenBTId)?.built_in_type ?? null

  // When fulfilling a lab_order, seed the lab_result stub with panels from the action payload
  const orderPayload = orderAction?.action_payload as {
    block_type_id?: string
    panels?: string[]
    custom?: { name: string; unit: string; ref_low: string; ref_high: string }[]
  } | null

  const prePopulatedContent = (builtInType === 'lab_result' && orderPayload)
    ? {
        ...(BLOCK_REGISTRY['lab_result']?.emptyContent() ?? {}),
        panels:      orderPayload.panels      ?? [],
        custom_defs: orderPayload.custom       ?? [],
      }
    : null

  // Shared DB write used by both submit paths
  const writeBlock = async (blockContent: Record<string, unknown>, blockType: string, defId: string | null) => {
    if (!user) return
    const bt = blockTypes.find(b => b.id === chosenBTId)
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

    // Auto-charge if dept block type has a service item linked (order or walk-in)
    let chargeMsg: string | null = null
    if (!error && newBlock && bt?.service_item_id && patient?.id) {
      const { data: svc } = await supabase
        .from('service_items')
        .select('name, default_price')
        .eq('id', bt.service_item_id)
        .single()
      if (svc) {
        const chargeStatus = bt.charge_mode === 'confirm' ? 'pending_approval' : 'pending'
        await supabase.from('charges').insert({
          patient_id:      patient.id,
          encounter_id:    orderAction?.encounter_id ?? null,
          block_id:        (newBlock as { id: string }).id,
          service_item_id: bt.service_item_id,
          description:     svc.name,
          quantity:        1,
          unit_price:      svc.default_price,
          status:          chargeStatus,
          source:          'department',
          created_by:      user.id,
        })
        chargeMsg = bt.charge_mode === 'confirm'
          ? `Charge of ${currencySymbol}${svc.default_price.toFixed(2)} for "${svc.name}" created — awaiting approval`
          : `Charge of ${currencySymbol}${svc.default_price.toFixed(2)} for "${svc.name}" approved automatically`
      }
    }
    setSaving(false)
    onDone(chargeMsg)
  }

  // Called by built-in Edit component's own Save button
  const submitBuiltIn = async (newContent: Record<string, unknown>) => {
    await writeBlock(newContent, builtInType!, null)
  }

  // Called by the footer Save button for dynamic (definition-based) block types
  const submit = async () => {
    await writeBlock(content, entryDef?.slug ?? 'dept_entry', entryDef?.id ?? null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
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
          {/* Block type selector — only for walk-in or if multiple types */}
          {blockTypes.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Service / Test</p>
              <div className="flex flex-wrap gap-1.5">
                {blockTypes.map(bt => (
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

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : blockTypes.length === 0 ? (
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
                definition_id: null,
                share_to_record: true,
                visible_to_roles: [],
                is_template_seed: false,
                is_pinned: false,
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
        {!builtInType && (entryDef || blockTypes.length > 0) && (
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

// ─── Patient search for walk-in ───────────────────────────────────────────────

function WalkInPatientPicker({
  onSelect,
  onClose,
}: {
  onSelect: (pt: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'>) => void
  onClose: () => void
}) {
  const [q, setQ]           = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const { nameFormat } = useSettingsStore()

  // Load recents on mount + focus input
  useEffect(() => {
    setRecents(getRecentPatients())
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

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

  const handleSelect = (pt: Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'>) => {
    pushRecentPatient({ id: pt.id, first_name: pt.first_name, middle_name: pt.middle_name, last_name: pt.last_name, mrn: pt.mrn })
    onSelect(pt)
  }

  const showRecents  = !q.trim() && recents.length > 0
  const showResults  = !!q.trim()
  const showEmpty    = q.trim() && !loading && results.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search patient by name, MRN, or phone…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        {/* Recent patients */}
        {showRecents && (
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-1.5">
              <Clock className="h-3 w-3" /> Recent
            </p>
            <ul className="pb-2">
              {recents.map(pt => (
                <li key={pt.id}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-accent text-left"
                    onClick={() => handleSelect(pt as Pick<Patient, 'id' | 'first_name' | 'middle_name' | 'last_name' | 'mrn'>)}
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

        {/* Search results */}
        {showResults && results.length > 0 && (
          <ul className="py-1">
            {results.map(pt => {
              const age = pt.date_of_birth
                ? Math.floor((Date.now() - new Date(pt.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                : null
              const meta = [pt.mrn, age != null ? `${age}y` : null, pt.gender].filter(Boolean).join(' · ')
              return (
                <li key={pt.id}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent text-left"
                    onClick={() => handleSelect(pt)}
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
          <p className="text-sm text-muted-foreground text-center py-6">No patients found</p>
        )}

        {!q.trim() && recents.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Start typing to search…</p>
        )}
      </div>
    </div>
  )
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onClaim,
  onFulfill,
}: {
  order: OrderWithContext
  onClaim: () => void
  onFulfill: () => void
}) {
  const { can } = useAuthStore()
  const { nameFormat } = useSettingsStore()
  const [expanded, setExpanded] = useState(false)
  const badge        = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending
  const pt           = order.patients
  const ob           = order.order_block
  const serviceName  = ob?.order_block_type?.name ?? null
  const blockName    = ob?.order_def?.name ?? null
  const def          = ob?.order_def ?? null
  const content      = ob?.content ?? {}
  const hasContent   = Object.keys(content).length > 0

  const encounterLink =
    order.patient_id && order.encounter_id
      ? `/patients/${order.patient_id}/encounters/${order.encounter_id}`
      : null

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
            <span className="text-[11px] text-muted-foreground shrink-0">{elapsed(order.triggered_at)}</span>
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
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={onClaim}>
              Claim
            </Button>
          )}
          {order.status === 'in_progress' && (
            <Button size="sm" className="h-9 text-xs" onClick={onFulfill}>
              Enter Result
            </Button>
          )}
          {order.status === 'completed' && (
            <span className="flex items-center gap-1 text-[11px] text-green-600">
              <CheckCircle2 className="h-3 w-3" /> Done
            </span>
          )}
        </div>
      </div>

      {/* Expandable order content */}
      {expanded && hasContent && (
        <div className="border-t px-4 pb-3 pt-2.5 bg-muted/20 text-xs">
          {ob && BLOCK_REGISTRY[ob.type] ? (
            // Built-in block — use registry's typed View
            (() => {
              const Renderer = BLOCK_REGISTRY[ob.type].View
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
  const [charge, setCharge]           = useState<{ status: string; quantity: number; unit_price: number; description: string } | null>(null)
  const { nameFormat, currencySymbol } = useSettingsStore()
  const pt = entry.patient

  // Fetch charge for this block once
  useEffect(() => {
    if (!entry.block_id) return
    supabase
      .from('charges')
      .select('status, quantity, unit_price, description')
      .eq('block_id', entry.block_id)
      .not('status', 'in', '(void,waived)')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setCharge(data) })
  }, [entry.block_id])

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
      {/* Header */}
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
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

        <div className="flex-1 min-w-0">
          {/* Row 1: service badge + patient name + MRN */}
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
          {/* Row 2: author + date */}
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {entry.author_name && `${entry.author_name} · `}{formatDateTime(entry.date)}
          </p>
        </div>

        {/* Right: charge badge + privacy indicators + kind badge + chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {charge && (
            <span
              title={charge.description}
              className={cn(
                'inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap leading-none',
                charge.status === 'pending_approval'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
              )}
            >
              <span className="opacity-70">{currencySymbol}</span>{(charge.quantity * charge.unit_price).toFixed(2)}
              <span className="opacity-60 ml-0.5">· {charge.status === 'pending_approval' ? 'Pending' : 'Approved'}</span>
            </span>
          )}
          {shareToRecord && (
            <BookOpen className="h-3 w-3 text-emerald-600" title="Shared to patient record" />
          )}
          <span className={cn(
            'text-[9px] px-1.5 py-0.5 rounded border font-medium',
            isOrder
              ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400'
              : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400',
          )}>
            {isOrder ? 'Order' : 'Direct'}
          </span>
          <ChevronRight className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            expanded && 'rotate-90',
          )} />
        </div>
      </button>

      {/* Expanded: content + privacy controls */}
      {expanded && (
        <div className="border-t bg-muted/20">
          {/* Content */}
          <div className="px-4 pt-2.5 pb-3 text-xs">
            {loadingDef ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : BLOCK_REGISTRY[entry.block_type] ? (
              // Built-in block (vitals, note, …) — use registry's typed View
              (() => {
                const Renderer = BLOCK_REGISTRY[entry.block_type].View
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

          {/* Privacy controls */}
          {entry.block_id && (
            <div className="flex items-center gap-3 px-4 py-2 border-t border-border/50">
              {/* Share to record toggle */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); toggleShare() }}
                className="flex items-center gap-1.5 group"
              >
                <BookOpen className={cn('h-3.5 w-3.5 shrink-0 transition-colors', shareToRecord ? 'text-emerald-600' : 'text-muted-foreground group-hover:text-foreground')} />
                <span className={cn('text-[11px] transition-colors', shareToRecord ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-muted-foreground group-hover:text-foreground')}>
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

function DeptTab({ dept }: { dept: Department }) {
  const { user: _user, can } = useAuthStore()
  const { billingEnabled, currencySymbol } = useSettingsStore()
  const [view, setView]     = useState<'queue' | 'history'>('queue')
  const [orders, setOrders] = useState<OrderWithContext[]>([])
  const [history, setHistory] = useState<PastEntry[]>([])
  const [loading, setLoading]         = useState(true)
  const [chargeNotice, setChargeNotice] = useState<string | null>(null)
  const [loadingHistory, setLoadingH] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)

  // Modal state
  const [fulfillOrder, setFulfillOrder]   = useState<OrderWithContext | null>(null)
  const [walkInPt, setWalkInPt]           = useState<Pick<Patient,'id'|'first_name'|'middle_name'|'last_name'|'mrn'> | null>(null)
  const [selectedBTId, setSelectedBTId]   = useState<string | null>(null)
  const [showPicker, setShowPicker]       = useState(false)
  const [showEntry, setShowEntry]         = useState(false)

  // Quick charge state
  const [showChargePicker, setShowChargePicker] = useState(false)
  const [chargePt, setChargePt]                 = useState<Pick<Patient,'id'|'first_name'|'middle_name'|'last_name'|'mrn'> | null>(null)
  const [quickChargeOpen, setQuickChargeOpen]   = useState(false)
  const [quickChargeDesc, setQuickChargeDesc]   = useState('')
  const [quickChargePrice, setQuickChargePrice] = useState('')
  const [quickChargeSaving, setQCSaving]        = useState(false)
  const [serviceItems, setServiceItems]         = useState<{ id: string; name: string; default_price: number }[]>([])

  useEffect(() => {
    if (billingEnabled && can('billing.charge')) {
      supabase.from('service_items').select('id, name, default_price').eq('active', true).order('name')
        .then(({ data }) => { if (data) setServiceItems(data) })
    }
  }, [billingEnabled, can])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('block_actions')
      .select(`
        *,
        patients(id,first_name,middle_name,last_name,mrn),
        order_block:blocks!block_actions_block_id_fkey(
          content, type, definition_id, department_block_type_id,
          order_def:block_definitions(*),
          order_block_type:department_block_types(name)
        )
      `)
      .eq('action_type', dept.slug)
      .not('status', 'in', '(completed,cancelled)')
      .order('triggered_at', { ascending: true })
    if (data) setOrders(data as unknown as OrderWithContext[])
    setLoading(false)
  }, [dept.slug])

  const loadHistory = useCallback(async (limit = HISTORY_PAGE_SIZE) => {
    setLoadingH(true)

    // Fetch limit+1 to detect whether more pages exist
    const fetchLimit = limit + 1

    // 1. Fulfilled orders (completed block_actions with result_block_id)
      const { data: actions } = await supabase
      .from('block_actions')
      .select(`
        id, completed_at,
        patients(id,first_name,middle_name,last_name,mrn),
        result_block:blocks!block_actions_result_block_id_fkey(id, type, content, author_name, department_block_type_id, definition_id, share_to_record)
      `)
      .eq('action_type', dept.slug)
      .eq('status', 'completed')
      .not('result_block_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(fetchLimit)

    // 2. Direct walk-in blocks for this department
    const { data: directs } = await supabase
      .from('blocks')
      .select(`
        id, type, content, author_name, created_at, definition_id, department_block_type_id,
        share_to_record,
        patients(id,first_name,middle_name,last_name,mrn),
        department_block_types(name)
      `)
      .eq('department_id', dept.id)
      .is('encounter_id', null)
      .eq('state', 'active')
      .order('created_at', { ascending: false })
      .limit(fetchLimit)

    // Collect all department_block_type_ids to resolve names
    const dbtIds = new Set<string>()
    ;(actions ?? []).forEach((a: Record<string, unknown>) => {
      const rb = a.result_block as Record<string, unknown> | null
      if (rb?.department_block_type_id) dbtIds.add(rb.department_block_type_id as string)
    })
    let dbtMap: Record<string, string> = {}
    if (dbtIds.size > 0) {
      const { data: dbts } = await supabase
        .from('department_block_types')
        .select('id, name')
        .in('id', Array.from(dbtIds))
      ;(dbts ?? []).forEach((d: { id: string; name: string }) => { dbtMap[d.id] = d.name })
    }

    const fulfilled: PastEntry[] = (actions ?? []).map((a: Record<string, unknown>) => {
      const rb    = a.result_block as Record<string, unknown> | null
      const dbtId = rb?.department_block_type_id as string | null
      return {
        id:             a.id as string,
        block_id:       (rb?.id as string | null) ?? null,
        kind:           'fulfilled_order' as const,
        patient:        (a.patients as PastEntry['patient']) ?? null,
        service_name:   dbtId ? (dbtMap[dbtId] ?? null) : null,
        block_type:     (rb?.type as string) ?? 'dept_entry',
        def_id:         (rb?.definition_id as string | null) ?? null,
        content:        (rb?.content as Record<string, unknown>) ?? {},
        author_name:    (rb?.author_name as string | null) ?? null,
        date:           a.completed_at as string,
        share_to_record: (rb?.share_to_record as boolean) ?? true,
      }
    })

    const direct: PastEntry[] = (directs ?? []).map((b: Record<string, unknown>) => {
      const dbt = b.department_block_types as { name: string } | null
      return {
        id:             b.id as string,
        block_id:       b.id as string,
        kind:           'direct' as const,
        patient:        (b.patients as PastEntry['patient']) ?? null,
        service_name:   dbt?.name ?? null,
        block_type:     (b.type as string) ?? 'dept_entry',
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
    const channel = supabase
      .channel(`portal:${dept.slug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'block_actions' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dept.slug, load])

  // Load history when tab is first opened
  useEffect(() => {
    if (view === 'history' && history.length === 0 && !loadingHistory) loadHistory(historyLimit)
  }, [view, history.length, loadingHistory, loadHistory, historyLimit])

  const claim = async (order: OrderWithContext) => {
    await supabase
      .from('block_actions')
      .update({ status: 'in_progress' })
      .eq('id', order.id)
    load()
  }

  const handleNewEntry = (btId?: string) => {
    setWalkInPt(null)
    setSelectedBTId(btId ?? null)
    setShowPicker(true)
  }

  const handleLoadMoreHistory = () => {
    const nextLimit = historyLimit + HISTORY_PAGE_SIZE
    setHistoryLimit(nextLimit)
    loadHistory(nextLimit)
  }

  const handlePatientSelected = (pt: Pick<Patient,'id'|'first_name'|'middle_name'|'last_name'|'mrn'>) => {
    setWalkInPt(pt)
    setShowPicker(false)
    setShowEntry(true)
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
              className="gap-1"
              title="Quick charge"
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Charge</span>
            </Button>
          )}
          {dept.can_create_direct && (
            <Button size="sm" variant="outline" onClick={handleNewEntry}>
              <Plus className="h-3.5 w-3.5" /> New Entry
            </Button>
          )}
        </div>
      </div>

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
                  onClaim={() => claim(order)}
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
      {showPicker && !walkInPt && (
        <WalkInPatientPicker
          onSelect={handlePatientSelected}
          onClose={() => setShowPicker(false)}
        />
      )}
      {/* Quick charge: patient picker */}
      {showChargePicker && !chargePt && (
        <WalkInPatientPicker
          onSelect={pt => { setChargePt(pt); setShowChargePicker(false); setQuickChargeDesc(''); setQuickChargePrice(''); setQuickChargeOpen(true) }}
          onClose={() => setShowChargePicker(false)}
        />
      )}
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
          onClose={() => { setShowEntry(false); setFulfillOrder(null); setWalkInPt(null); setSelectedBTId(null) }}
          onDone={(chargeMsg) => {
            setShowEntry(false); setFulfillOrder(null); setWalkInPt(null); setSelectedBTId(null)
            load()
            setHistory([])       // clear so it reloads fresh next time
            setHistoryLimit(HISTORY_PAGE_SIZE)
            setHasMoreHistory(false)
            if (chargeMsg) { setChargeNotice(chargeMsg); setTimeout(() => setChargeNotice(null), 5000) }
          }}
        />
      )}
    </div>
  )
}

// ─── Main portal page ─────────────────────────────────────────────────────────

export default function DeptPortal() {
  const { user, profile, signOut } = useAuthStore()
  const { nameFormat } = useSettingsStore()
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

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{profile?.full_name ?? user?.email}</span>
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
