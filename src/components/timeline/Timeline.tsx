import { useEffect, useRef, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useEncounterStore } from '../../stores/encounterStore'
import type { Block, BlockDefinition, Charge } from '../../types'
import { ScrollArea, Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui'
import {
  Loader2,
  Eye,
  EyeOff,
  History,
  Pin,
  PinOff,
  FileText,
  UserCog,
  Shield,
  CheckCircle,
  Type,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import BlockWrapper from './BlockWrapper'
import AddBlockMenu from './AddBlockMenu'
import { formatDateTime, getDefinitionColors, cn } from '../../lib/utils'
import { registryRenderKey, orphanRegistryRenderKey } from './BlockRegistry'
import {
  usesCustomChargeRules,
  syncLabResultBlockCharges,
  syncRadiologyResultBlockCharges,
  fetchActiveChargesForBlock,
} from '../../lib/blockBilling'
import type { LabResultContent, RadiologyResultContent } from '../../types'
import { format, isToday, isYesterday, parseISO } from 'date-fns'

interface Props {
  encounterId: string
  patientId: string
  encounterStatus: 'open' | 'closed'
}

type AuditEntry = {
  id: string
  actor_id: string | null
  action: string
  old_value: string | null
  new_value: string | null
  created_at: string
  actorName?: string
}

export type TimelineHandle = {
  refreshAuditLog: () => Promise<void>
}

// ── Day-grouping helpers ─────────────────────────────────────────────────────

function dayKey(iso: string) {
  return iso.slice(0, 10) // YYYY-MM-DD
}

function dayLabel(key: string) {
  const d = parseISO(key)
  if (isToday(d))     return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'd MMMM yyyy')
}

const Timeline = forwardRef<TimelineHandle, Props>(function Timeline(
  { encounterId, patientId, encounterStatus }: Props,
  ref,
) {
  const { user, profile, can, hasRole } = useAuthStore()
  const { billingEnabled } = useSettingsStore()
  const {
    blocks, setBlocks, appendBlock, updateBlock,
    removeBlock, maskBlock,
    showMasked, setShowMasked,
    lockMap, applyLock, releaseLock,
    definitions,
    definitionMap, setDefinitions,
    togglePin,
  } = useEncounterStore()

  const definitionById = useMemo(() => {
    const m: Record<string, BlockDefinition> = {}
    for (const d of definitions) {
      m[d.id] = d
    }
    return m
  }, [definitions])

  const resolveBlockDefinition = useCallback(
    (block: Block): BlockDefinition | undefined =>
      definitionMap[block.type] ?? (block.definition_id ? definitionById[block.definition_id] : undefined),
    [definitionMap, definitionById],
  )

  const [loading, setLoading] = useState(true)
  const [historyBlock, setHistoryBlock] = useState<Block | null>(null)
  const [blockVersions, setBlockVersions] = useState<Block[]>([])
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const [deptNameMap, setDeptNameMap] = useState<Record<string, string>>({})
  const [chargeMap, setChargeMap] = useState<Record<string, Charge[]>>({}) // blockId → charges
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lockChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Load block definitions once
  useEffect(() => {
    supabase
      .from('block_definitions')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setDefinitions(data as BlockDefinition[])
      })
  }, [setDefinitions])

  // Standalone audit log refresh — exposed to EncounterPage via ref
  const fetchAuditLog = useCallback(async () => {
    const { data: logs } = await supabase
      .from('encounter_audit_log')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })
    if (!logs || logs.length === 0) { setAuditLogs([]); return }
    const toResolve = new Set<string>()
    for (const l of logs as AuditEntry[]) {
      if (l.actor_id) toResolve.add(l.actor_id)
      if (l.action === 'assignment') {
        if (l.old_value) toResolve.add(l.old_value)
        if (l.new_value) toResolve.add(l.new_value)
      }
    }
    const ids = [...toResolve]
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('id, full_name').in('id', ids)
      : { data: [] }
    const profMap = Object.fromEntries(
      ((profs ?? []) as { id: string; full_name: string }[]).map(p => [p.id, p.full_name]),
    )
    setAuditLogs((logs as AuditEntry[]).map(l => ({
      ...l,
      actorName: l.actor_id ? (profMap[l.actor_id] ?? 'Unknown') : 'System',
      old_value: l.action === 'assignment' && l.old_value ? (profMap[l.old_value] ?? l.old_value) : l.old_value,
      new_value: l.action === 'assignment' && l.new_value ? (profMap[l.new_value] ?? l.new_value) : l.new_value,
    })))
  }, [encounterId])

  useImperativeHandle(ref, () => ({ refreshAuditLog: fetchAuditLog }), [fetchAuditLog])

  // Fetch blocks + charges + audit log
  const fetchBlocks = useCallback(async () => {
    const [{ data: encounterBlocks }, { data: actions }] = await Promise.all([
      supabase
        .from('blocks')
        .select('*')
        .eq('encounter_id', encounterId)
        .order('sequence_order', { ascending: true }),
      supabase
        .from('block_actions')
        .select('result_block_id')
        .eq('encounter_id', encounterId)
        .not('result_block_id', 'is', null),
    ])

    let resultBlocks: Block[] = []
    if (actions && actions.length > 0) {
      const ids = actions.map((a: { result_block_id: string }) => a.result_block_id).filter(Boolean)
      if (ids.length > 0) {
        const { data } = await supabase
          .from('blocks')
          .select('*, departments(name, slug)')
          .in('id', ids)
          .order('created_at', { ascending: true })
        if (data) {
          resultBlocks = data as Block[]
          const nameMap: Record<string, string> = {}
          for (const b of data as Array<Block & { departments?: { name: string; slug: string } | null }>) {
            if (b.departments?.name) nameMap[b.id] = b.departments.name
          }
          setDeptNameMap(nameMap)
        }
      }
    }

    const all = [...(encounterBlocks ?? []), ...resultBlocks]
    all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    setBlocks(all)

    if (billingEnabled) {
      const blockIds = all.map(b => b.id)
      if (blockIds.length > 0) {
        const { data: ch } = await supabase
          .from('charges')
          .select('id, block_id, description, quantity, unit_price, status, source, created_by')
          .in('block_id', blockIds)
          .not('status', 'in', '(void,waived)')
        const map: Record<string, Charge[]> = {}
        for (const c of (ch ?? []) as Charge[]) {
          if (!c.block_id) continue
          if (!map[c.block_id]) map[c.block_id] = []
          map[c.block_id].push(c)
        }
        setChargeMap(map)
      } else {
        setChargeMap({})
      }
    } else {
      setChargeMap({})
    }

    setLoading(false)
    await fetchAuditLog()
  }, [encounterId, setBlocks, billingEnabled, can, fetchAuditLog])

  // Stable ref for fetchBlocks so the channel useEffect doesn't depend on it
  const fetchBlocksRef = useRef(fetchBlocks)
  useEffect(() => { fetchBlocksRef.current = fetchBlocks }, [fetchBlocks])

  const handleApproveCharge = useCallback(async (chargeId: string) => {
    await supabase.from('charges').update({ status: 'pending' }).eq('id', chargeId).eq('status', 'pending_approval')
    setChargeMap(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        next[key] = next[key].map(c =>
          c.id === chargeId ? { ...c, status: 'pending' as const } : c,
        )
      }
      return next
    })
  }, [])

  const handleVoidCharge = useCallback(async (chargeId: string) => {
    await supabase.from('charges').update({ status: 'void', voided_reason: 'Voided from timeline' }).eq('id', chargeId)
    setChargeMap(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        next[key] = next[key].map(c =>
          c.id === chargeId ? { ...c, status: 'void' as const } : c,
        )
      }
      return next
    })
  }, [])

  const reloadBlockCharges = useCallback(async (blockId: string) => {
    const { data: ch } = await supabase
      .from('charges')
      .select('id, block_id, description, quantity, unit_price, status, source, created_by')
      .eq('block_id', blockId)
      .not('status', 'in', '(void,waived)')
    setChargeMap(prev => ({
      ...prev,
      [blockId]: (ch ?? []) as Charge[],
    }))
  }, [])

  const getNextSequence = useCallback(() => {
    if (blocks.length === 0) return 10
    return Math.max(...blocks.map((b) => b.sequence_order)) + 10
  }, [blocks])

  // Realtime subscriptions — only re-created when encounterId changes
  useEffect(() => {
    fetchBlocksRef.current()

    // Single channel for all postgres_changes (blocks INSERT/UPDATE + block_actions UPDATE)
    channelRef.current = supabase
      .channel(`encounter-rt:${encounterId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'blocks', filter: `encounter_id=eq.${encounterId}` },
        async (payload) => {
          const { data } = await supabase.from('blocks').select('*').eq('id', (payload.new as Block).id).single()
          if (!data) return
          appendBlock(data as Block)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'blocks', filter: `encounter_id=eq.${encounterId}` },
        async (payload) => {
          const { data } = await supabase.from('blocks').select('*').eq('id', (payload.new as Block).id).single()
          if (data) updateBlock(data as Block)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'block_actions', filter: `encounter_id=eq.${encounterId}` },
        async (payload) => {
          const action = payload.new as { result_block_id?: string | null }
          if (!action.result_block_id) return
          const { data } = await supabase
            .from('blocks')
            .select('*')
            .eq('id', action.result_block_id)
            .single()
          if (data) {
            appendBlock(data as Block)
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
          }
        },
      )
      .subscribe()

    // Broadcast channel for lock/unlock (no RLS overhead)
    lockChannelRef.current = supabase
      .channel(`encounter-locks:${encounterId}`)
      .on('broadcast', { event: 'lock' }, ({ payload }) => {
        applyLock(payload.block_id, payload.user_id, payload.user_email)
      })
      .on('broadcast', { event: 'unlock' }, ({ payload }) => {
        releaseLock(payload.block_id)
      })
      .subscribe()

    return () => {
      channelRef.current?.unsubscribe()
      lockChannelRef.current?.unsubscribe()
    }
  }, [encounterId, appendBlock, updateBlock, applyLock, releaseLock])

  // Lock management
  const acquireLock = useCallback(async (blockId: string): Promise<boolean> => {
    if (!user) return false
    const { error } = await supabase
      .from('blocks')
      .update({ locked_by: user.id, locked_at: new Date().toISOString() })
      .eq('id', blockId)
      .is('locked_by', null)
    if (error) return false
    lockChannelRef.current?.send({
      type: 'broadcast',
      event: 'lock',
      payload: { block_id: blockId, user_id: user.id, user_email: user.email ?? user.id },
    })
    applyLock(blockId, user.id, user.email ?? user.id)
    return true
  }, [user, applyLock])

  const releaseLockFn = useCallback(async (blockId: string) => {
    if (!user) return
    await supabase
      .from('blocks')
      .update({ locked_by: null, locked_at: null })
      .eq('id', blockId)
      .eq('locked_by', user.id)
    lockChannelRef.current?.send({
      type: 'broadcast',
      event: 'unlock',
      payload: { block_id: blockId },
    })
    releaseLock(blockId)
  }, [user, releaseLock])

  // Add block — insert block with optional initial content; autoEdit will open it in edit mode
  const handleAddBlock = useCallback(async (
    type: string,
    definitionId?: string,
    initialContent?: Record<string, unknown>,
  ) => {
    if (!user) return
    const authorName = profile?.full_name?.trim() || user.email || 'Unknown'
    const def: BlockDefinition | undefined = definitionId
      ? Object.values(definitionMap).find((d) => d.id === definitionId)
      : definitionMap[type]
    const { data } = await supabase.from('blocks').insert({
      encounter_id: encounterId,
      patient_id: patientId,
      type,
      content: initialContent ?? {},
      state: 'active',
      sequence_order: getNextSequence(),
      author_name: authorName,
      definition_id: definitionId ?? null,
      created_by: user.id,
      visible_to_roles: def?.default_visible_to_roles ?? [],
    }).select().single()
    if (data) {
      const newBlock = data as Block
      appendBlock(newBlock)
      setJustAddedId(newBlock.id)

      if (
        billingEnabled &&
        def?.service_item_id &&
        def.charge_mode &&
        can('billing.charge') &&
        !usesCustomChargeRules(def)
      ) {
        const { data: svc } = await supabase
          .from('service_items')
          .select('*')
          .eq('id', def.service_item_id)
          .single()
        if (svc) {
          const chargeStatus = def.charge_mode === 'confirm' ? 'pending_approval' : 'pending'
          const { data: chargeRow } = await supabase
            .from('charges')
            .insert({
              patient_id: patientId,
              encounter_id: encounterId,
              block_id: newBlock.id,
              service_item_id: svc.id,
              description: svc.name,
              quantity: 1,
              unit_price: svc.default_price,
              status: chargeStatus,
              source: 'block_auto',
              created_by: user.id,
            })
            .select()
            .single()
          if (chargeRow) {
            setChargeMap(prev => ({ ...prev, [newBlock.id]: [chargeRow as Charge] }))
          }
        }
      }
    }
  }, [user, profile, encounterId, patientId, getNextSequence, definitionMap, billingEnabled, can, appendBlock])

  // Edit block: mask old, append new revision
  const handleEditBlock = useCallback(async (
    block: Block,
    newContent: Record<string, unknown>,
  ) => {
    if (!user) return
    const authorName = profile?.full_name?.trim() || user.email || 'Unknown'

    if (block.is_template_seed || block.id === justAddedId) {
      // First fill (template-seeded or freshly added) — update in place, no revision
      await supabase
        .from('blocks')
        .update({
          content: newContent,
          author_name: authorName,
          is_template_seed: false,
          locked_by: null,
          locked_at: null,
        })
        .eq('id', block.id)
      updateBlock({ ...block, content: newContent, author_name: authorName, is_template_seed: false, locked_by: null, locked_at: null })
      setJustAddedId(null)

      const defFirst = resolveBlockDefinition({ ...block, content: newContent })
      const regKeyFirst = defFirst ? registryRenderKey(defFirst) : orphanRegistryRenderKey(block.type)
      if (
        billingEnabled &&
        can('billing.charge') &&
        defFirst &&
        usesCustomChargeRules(defFirst) &&
        (regKeyFirst === 'lab_result' || regKeyFirst === 'radiology_result')
      ) {
        if (regKeyFirst === 'lab_result') {
          await syncLabResultBlockCharges({
            blockId: block.id,
            patientId,
            encounterId,
            userId: user.id,
            definition: defFirst,
            content: newContent as unknown as LabResultContent,
          })
        } else {
          await syncRadiologyResultBlockCharges({
            blockId: block.id,
            patientId,
            encounterId,
            userId: user.id,
            definition: defFirst,
            content: newContent as unknown as RadiologyResultContent,
          })
        }
        const rows = await fetchActiveChargesForBlock(block.id)
        setChargeMap(prev => ({ ...prev, [block.id]: rows }))
      }
      return
    }

    // Normal edit → mask old block + insert new revision
    const nextSeq = getNextSequence()
    await supabase
      .from('blocks')
      .update({ state: 'masked', locked_by: null, locked_at: null })
      .eq('id', block.id)
    maskBlock(block.id)

    const { data } = await supabase.from('blocks').insert({
      encounter_id: encounterId,
      patient_id: patientId,
      type: block.type,
      content: newContent,
      state: 'active',
      sequence_order: nextSeq,
      supersedes_block_id: block.id,
      author_name: authorName,
      definition_id: block.definition_id,
      created_by: user.id,
      visible_to_roles: block.visible_to_roles ?? [],
      share_to_record: block.share_to_record ?? false,
      is_pinned: block.is_pinned ?? false,
    }).select().single()
    if (data) {
      const newBlock = data as Block
      appendBlock(newBlock)
      await supabase.from('charges').update({ block_id: newBlock.id }).eq('block_id', block.id)

      const defNew = resolveBlockDefinition(newBlock)
      const regKeyNew = defNew ? registryRenderKey(defNew) : orphanRegistryRenderKey(newBlock.type)
      if (
        billingEnabled &&
        can('billing.charge') &&
        defNew &&
        usesCustomChargeRules(defNew) &&
        (regKeyNew === 'lab_result' || regKeyNew === 'radiology_result')
      ) {
        if (regKeyNew === 'lab_result') {
          await syncLabResultBlockCharges({
            blockId: newBlock.id,
            patientId,
            encounterId,
            userId: user.id,
            definition: defNew,
            content: newContent as unknown as LabResultContent,
          })
        } else {
          await syncRadiologyResultBlockCharges({
            blockId: newBlock.id,
            patientId,
            encounterId,
            userId: user.id,
            definition: defNew,
            content: newContent as unknown as RadiologyResultContent,
          })
        }
      }

      const rowsNew = await fetchActiveChargesForBlock(newBlock.id)
      setChargeMap(prev => {
        const next = { ...prev }
        delete next[block.id]
        next[newBlock.id] = rowsNew
        return next
      })
    }
    setJustAddedId(null)
  }, [
    user, profile, encounterId, patientId, getNextSequence, justAddedId, updateBlock, maskBlock, appendBlock,
    billingEnabled, can, resolveBlockDefinition,
  ])

  // Discard unsaved (empty, never-saved) block
  const handleDiscard = useCallback(async (blockId: string) => {
    await supabase.from('blocks').delete().eq('id', blockId)
    removeBlock(blockId)
    if (justAddedId === blockId) setJustAddedId(null)
  }, [justAddedId, removeBlock])

  // Hard delete — admin only, permanent
  const handleHardDeleteBlock = useCallback(async (blockId: string) => {
    await supabase.from('blocks').delete().eq('id', blockId)
    removeBlock(blockId)
    if (justAddedId === blockId) setJustAddedId(null)
  }, [justAddedId, removeBlock])

  // Duplicate block — copy content to a new block at end of timeline; auto-opens in edit mode
  const handleDuplicate = useCallback(async (blockId: string) => {
    if (!user) return
    const block = blocks.find(b => b.id === blockId)
    if (!block) return
    const authorName = profile?.full_name?.trim() || user.email || 'Unknown'
    const { data } = await supabase.from('blocks').insert({
      encounter_id:   encounterId,
      patient_id:     patientId,
      type:           block.type,
      content:        block.content,
      state:          'active',
      sequence_order: getNextSequence(),
      author_name:    authorName,
      definition_id:  block.definition_id,
      created_by:     user.id,
      visible_to_roles: block.visible_to_roles ?? [],
    }).select().single()
    if (data) {
      const newBlock = data as Block
      appendBlock(newBlock)
      setJustAddedId(newBlock.id)
    }
  }, [user, profile, blocks, encounterId, patientId, getNextSequence, appendBlock])

  // Mask/unmask an existing block
  const handleMask = useCallback(async (blockId: string) => {
    const block = blocks.find((b) => b.id === blockId)
    if (!block) return
    const newState = block.state === 'masked' ? 'active' : 'masked'
    await supabase.from('blocks').update({ state: newState }).eq('id', blockId)
    if (newState === 'masked') {
      maskBlock(blockId)
    } else {
      updateBlock({ ...block, state: 'active' })
    }
  }, [blocks, maskBlock, updateBlock])

  // View version history
  const handleViewHistory = useCallback(async (block: Block) => {
    setHistoryBlock(block)
    const versions: Block[] = []
    let current = block.supersedes_block_id
    while (current) {
      const { data } = await supabase.from('blocks').select('*').eq('id', current).single()
      if (!data) break
      versions.push(data as Block)
      current = (data as Block).supersedes_block_id
    }
    setBlockVersions(versions)
  }, [])

  const visibleBlocks = useMemo(
    () => showMasked ? blocks : blocks.filter((b) => b.state === 'active'),
    [blocks, showMasked],
  )

  const maskedCount = useMemo(() => blocks.filter((b) => b.state === 'masked').length, [blocks])
  const activeCount = useMemo(() => blocks.filter((b) => b.state === 'active').length, [blocks])
  const pinnedBlocks = useMemo(() => blocks.filter((b) => b.state === 'active' && b.is_pinned), [blocks])

  // ── Merged, day-grouped timeline items ──────────────────────────────────────
  type TimelineItem =
    | { kind: 'day-header'; label: string; key: string }
    | { kind: 'block';      block: Block }
    | { kind: 'audit';      log: AuditEntry }

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: Array<{ ts: string; item: Omit<TimelineItem, 'kind'> & { kind: TimelineItem['kind'] } }> = [
      ...visibleBlocks.map(b => ({ ts: b.created_at, item: { kind: 'block' as const, block: b } })),
      ...auditLogs.map(l  => ({ ts: l.created_at,   item: { kind: 'audit' as const, log: l } })),
    ]
    items.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

    const result: TimelineItem[] = []
    let lastDay = ''
    for (const { ts, item } of items) {
      const dk = dayKey(ts)
      if (dk !== lastDay) {
        result.push({ kind: 'day-header', label: dayLabel(dk), key: dk })
        lastDay = dk
      }
      result.push(item as TimelineItem)
    }
    return result
  }, [visibleBlocks, auditLogs])

  type TimelineDayRow = Extract<TimelineItem, { kind: 'block' | 'audit' }>

  const timelineDayGroups = useMemo(() => {
    const groups: Array<{ dayKey: string; label: string; rows: TimelineDayRow[] }> = []
    for (const item of timelineItems) {
      if (item.kind === 'day-header') {
        groups.push({ dayKey: item.key, label: item.label, rows: [] })
      } else {
        groups[groups.length - 1]?.rows.push(item)
      }
    }
    return groups
  }, [timelineItems])

  const [dayOpenOverrides, setDayOpenOverrides] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setDayOpenOverrides({})
  }, [encounterId])

  const isDaySectionOpen = useCallback(
    (dayKey: string) => {
      if (Object.prototype.hasOwnProperty.call(dayOpenOverrides, dayKey)) {
        return dayOpenOverrides[dayKey]
      }
      // Default expanded so blocks are visible (not only "today")
      return true
    },
    [dayOpenOverrides],
  )

  const toggleDaySection = useCallback((dayKey: string) => {
    setDayOpenOverrides((prev) => {
      const wasOpen = Object.prototype.hasOwnProperty.call(prev, dayKey)
        ? prev[dayKey]
        : true
      return { ...prev, [dayKey]: !wasOpen }
    })
  }, [])

  const scrollToBlock = (blockId: string) => {
    const el = document.getElementById(`block-${blockId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading timeline…
      </div>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Combined toolbar + pinned HUD */}
        <div className="border-b px-3 flex items-center gap-2 bg-background shrink-0 h-8">
          {/* Pinned chips */}
          {pinnedBlocks.length > 0 && (
            <>
              <Pin className="h-3 w-3 text-amber-500 shrink-0" />
              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto min-w-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {pinnedBlocks.map((block) => {
                  const def = resolveBlockDefinition(block)
                  const colors = getDefinitionColors(def?.color ?? 'slate')
                  return (
                    <div
                      key={block.id}
                      role="group"
                      className={cn(
                        'flex items-center gap-1 text-[11px] border rounded-full px-2 py-0.5 bg-background',
                        'whitespace-nowrap shrink-0',
                        colors.border,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => scrollToBlock(block.id)}
                        className="flex items-center gap-1 hover:text-amber-600 transition-colors"
                      >
                        <div className={cn('h-3 w-3 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
                          <FileText className="w-1.5 h-1.5 text-white" />
                        </div>
                        <span className="font-medium">{def?.name ?? block.type}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(block.id)}
                        title="Unpin"
                        className="ml-0.5 text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <PinOff className="h-2 w-2" />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div className="w-px h-4 bg-border shrink-0" />
            </>
          )}

          {/* Block / masked counts */}
          <span className="text-[11px] text-muted-foreground shrink-0 ml-auto">
            {activeCount} block{activeCount !== 1 ? 's' : ''}
            {maskedCount > 0 && (
              <span className="ml-1 text-muted-foreground/60">· {maskedCount} masked</span>
            )}
          </span>

          {maskedCount > 0 && (
            <button
              onClick={() => setShowMasked(!showMasked)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0 transition-colors"
            >
              {showMasked ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showMasked ? 'Hide' : 'Show'} versions
            </button>
          )}
        </div>

        {/* Timeline */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3 w-full min-w-0">
            {timelineItems.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">No blocks yet</p>
                <p className="text-xs mt-1">Add your first block below</p>
              </div>
            ) : (
              timelineDayGroups.map((group) => {
                const open = isDaySectionOpen(group.dayKey)
                return (
                  <div key={`day-${group.dayKey}`} className="space-y-3">
                    <button
                      type="button"
                      onClick={() => toggleDaySection(group.dayKey)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 py-1 select-none text-left rounded-md -mx-1 px-1 hover:bg-muted/50 transition-colors"
                    >
                      <span className="shrink-0 text-muted-foreground/80" aria-hidden>
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="h-px flex-1 bg-border/60 min-w-[1rem]" />
                      <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider shrink-0">
                        {group.label}
                      </span>
                      <div className="h-px flex-1 bg-border/60 min-w-[1rem]" />
                    </button>

                    {open &&
                      group.rows.map((item) => {
                        if (item.kind === 'audit') {
                          return <AuditRow key={`audit-${item.log.id}`} log={item.log} />
                        }

                        const block = item.block
                        return (
                          <div key={block.id} className="w-full min-w-0">
                            {block.state === 'masked' && (
                              <div className="flex items-center gap-1.5 mb-1 px-1 w-full min-w-0">
                                <div className="h-px flex-1 bg-border" />
                                <span className="text-xs text-muted-foreground shrink-0">superseded version</span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                            )}
                            <BlockWrapper
                              block={block}
                              definition={resolveBlockDefinition(block)}
                              encounterId={encounterId}
                              patientId={patientId}
                              lock={lockMap[block.id]}
                              currentUserId={user?.id ?? ''}
                              encounterClosed={encounterStatus === 'closed'}
                              deptName={deptNameMap[block.id]}
                              charges={chargeMap[block.id] ?? null}
                              autoEdit={
                                encounterStatus === 'open' &&
                                (block.is_template_seed === true || block.id === justAddedId)
                              }
                              isUnsaved={block.id === justAddedId}
                              onEdit={handleEditBlock}
                              onDuplicate={handleDuplicate}
                              onDiscard={handleDiscard}
                              onMask={handleMask}
                              onTogglePin={togglePin}
                              onAcquireLock={acquireLock}
                              onReleaseLock={releaseLockFn}
                              onViewHistory={handleViewHistory}
                              canCharge={billingEnabled && can('billing.charge')}
                              billingEnabled={billingEnabled}
                              onRefreshBlockCharges={reloadBlockCharges}
                              onApproveCharge={handleApproveCharge}
                              onVoidCharge={handleVoidCharge}
                              isAdmin={hasRole('admin')}
                              onHardDelete={handleHardDeleteBlock}
                            />
                          </div>
                        )
                      })}
                  </div>
                )
              })
            )}

            {encounterStatus === 'open' && (
              <div className="pt-2">
                <AddBlockMenu onAdd={handleAddBlock} disabled={!can('block.add')} />
              </div>
            )}

            {encounterStatus === 'closed' && (
              <div className="border border-dashed rounded-lg py-3 px-4 text-center text-xs text-muted-foreground">
                Encounter is closed — no new blocks can be added
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Version history modal */}
      <Dialog
        open={!!historyBlock}
        onOpenChange={(o) => {
          if (!o) { setHistoryBlock(null); setBlockVersions([]) }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History ·{' '}
              {historyBlock && (resolveBlockDefinition(historyBlock)?.name ?? historyBlock.type)}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            {blockVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                This is the original version (no prior versions)
              </p>
            ) : (
              <div className="space-y-3 py-1">
                {blockVersions.map((v, i) => (
                  <div key={v.id} className="border rounded-md p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="muted" className="text-xs">
                        Version {blockVersions.length - i}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {v.author_name && `${v.author_name} · `}
                        {formatDateTime(v.created_at)}
                      </span>
                    </div>
                    <VersionPreview block={v} />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
})

export default Timeline

function AuditRow({ log }: { log: AuditEntry }) {
  const actionMeta: Record<string, { icon: React.ReactNode; label: (e: AuditEntry) => string; color: string }> = {
    assignment: {
      icon: <UserCog className="h-3 w-3" />,
      label: (e) => e.new_value
        ? `Assigned to ${e.new_value}`
        : 'Physician unassigned',
      color: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800',
    },
    visibility: {
      icon: <Shield className="h-3 w-3" />,
      label: (e) => `Visibility changed${e.old_value ? ` from ${e.old_value}` : ''} → ${e.new_value ?? '—'}`,
      color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
    },
    status: {
      icon: <CheckCircle className="h-3 w-3" />,
      label: (e) => e.new_value === 'closed' ? 'Encounter closed' : `Status changed to ${e.new_value ?? '—'}`,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
    },
    title: {
      icon: <Type className="h-3 w-3" />,
      label: (e) => `Title changed${e.new_value ? ` to "${e.new_value}"` : ''}`,
      color: 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-700',
    },
  }
  const meta = actionMeta[log.action] ?? {
    icon: <Shield className="h-3 w-3" />,
    label: (e: AuditEntry) => e.action,
    color: 'text-muted-foreground bg-muted border-border',
  }

  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs w-full min-w-0', meta.color)}>
      <div className="shrink-0 mt-0.5">{meta.icon}</div>
      <div className="flex-1 min-w-0 break-words leading-snug">
        <span className="font-medium">{log.actorName ?? 'System'}</span>
        <span className="mx-1 opacity-60">·</span>
        <span>{meta.label(log)}</span>
      </div>
      <span className="shrink-0 opacity-60 text-[10px] whitespace-nowrap pt-0.5">{formatDateTime(log.created_at)}</span>
    </div>
  )
}

function VersionPreview({ block }: { block: Block }) {
  const c = block.content as Record<string, unknown>
  if (block.type === 'hx_physical') {
    return (
      <p className="text-xs text-muted-foreground">
        {(c.chief_complaint as string)
          ? `CC: ${(c.chief_complaint as string).slice(0, 80)}`
          : (c.hpi as string)?.slice(0, 80) || '(empty)'}
      </p>
    )
  }
  if (block.type === 'note') {
    const t = (c.body as string)?.trim()
    return (
      <p className="text-xs text-muted-foreground">
        {t ? t.slice(0, 120) : '(empty)'}
      </p>
    )
  }
  if (block.type === 'med_orders' || block.type === 'meds') {
    const items = (c.items as Array<{ name: string }> | undefined) ?? []
    return (
      <p className="text-xs text-muted-foreground">
        {items.length ? items.map(i => i.name).filter(Boolean).slice(0, 4).join(', ') : '(empty)'}
      </p>
    )
  }
  if (block.type === 'plan') {
    const a = (c.assessment as string | undefined)?.trim()
    return (
      <p className="text-xs text-muted-foreground">
        {a ? a.slice(0, 120) : '(empty)'}
      </p>
    )
  }
  // Custom block: show first non-empty field value
  const first = Object.entries(c).find(([, v]) => v !== null && v !== '' && v !== undefined)
  return first ? (
    <p className="text-xs text-muted-foreground truncate">
      {String(first[0])}: {String(first[1])}
    </p>
  ) : null
}
