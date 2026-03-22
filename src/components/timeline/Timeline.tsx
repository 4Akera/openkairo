import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useEncounterStore } from '../../stores/encounterStore'
import type { Block, BlockDefinition } from '../../types'
import { ScrollArea, Button, Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui'
import { Loader2, Eye, EyeOff, History, Pin, PinOff, FileText } from 'lucide-react'
import BlockWrapper from './BlockWrapper'
import AddBlockMenu from './AddBlockMenu'
import { formatDateTime, getDefinitionColors, cn } from '../../lib/utils'

interface Props {
  encounterId: string
  patientId: string
  encounterStatus: 'open' | 'closed'
  encounterPortalVisible: boolean
}

export default function Timeline({ encounterId, patientId, encounterStatus, encounterPortalVisible }: Props) {
  const { user, profile } = useAuthStore()
  const {
    blocks, setBlocks, appendBlock, updateBlock,
    removeBlock, maskBlock,
    showMasked, setShowMasked,
    lockMap, applyLock, releaseLock,
    definitionMap, setDefinitions,
    togglePin,
  } = useEncounterStore()

  const [loading, setLoading] = useState(true)
  const [historyBlock, setHistoryBlock] = useState<Block | null>(null)
  const [blockVersions, setBlockVersions] = useState<Block[]>([])
  const [justAddedId, setJustAddedId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  // scrollAreaRef reserved for future auto-scroll use
  void useRef<HTMLDivElement>(null)
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

  // Fetch blocks
  const fetchBlocks = useCallback(async () => {
    const { data } = await supabase
      .from('blocks')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('sequence_order', { ascending: true })
    if (data) setBlocks(data as Block[])
    setLoading(false)
  }, [encounterId, setBlocks])

  const getNextSequence = useCallback(() => {
    if (blocks.length === 0) return 10
    return Math.max(...blocks.map((b) => b.sequence_order)) + 10
  }, [blocks])

  // Realtime subscriptions
  useEffect(() => {
    fetchBlocks()

    channelRef.current = supabase
      .channel(`encounter-blocks:${encounterId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'blocks', filter: `encounter_id=eq.${encounterId}` },
        (payload) => {
          appendBlock(payload.new as Block)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'blocks', filter: `encounter_id=eq.${encounterId}` },
        (payload) => updateBlock(payload.new as Block),
      )
      .subscribe()

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
  }, [encounterId, fetchBlocks, appendBlock, updateBlock, applyLock, releaseLock])

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

  // Add block — insert empty block directly; autoEdit will open it in edit mode
  const handleAddBlock = useCallback(async (
    type: string,
    definitionId?: string,
  ) => {
    if (!user) return
    const authorName = profile?.full_name?.trim() || user.email || 'Unknown'
    const def: BlockDefinition | undefined = definitionId
      ? Object.values(definitionMap).find((d) => d.id === definitionId)
      : definitionMap[type]
    const { data } = await supabase.from('blocks').insert({
      encounter_id: encounterId,
      type,
      content: {},
      state: 'active',
      sequence_order: getNextSequence(),
      author_name: authorName,
      definition_id: definitionId ?? null,
      created_by: user.id,
      visible_to_roles: def?.default_visible_to_roles ?? [],
      portal_visible: def?.default_portal_visible ?? true,
    }).select().single()
    if (data) setJustAddedId((data as Block).id)
  }, [user, profile, encounterId, getNextSequence, definitionMap])

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
      setJustAddedId(null)
      return
    }

    // Normal edit → mask old block + insert new revision
    const nextSeq = getNextSequence()
    await supabase
      .from('blocks')
      .update({ state: 'masked', locked_by: null, locked_at: null })
      .eq('id', block.id)

    await supabase.from('blocks').insert({
      encounter_id: encounterId,
      type: block.type,
      content: newContent,
      state: 'active',
      sequence_order: nextSeq,
      supersedes_block_id: block.id,
      author_name: authorName,
      definition_id: block.definition_id,
      created_by: user.id,
    })
    setJustAddedId(null)
  }, [user, profile, encounterId, getNextSequence, justAddedId])

  // Discard unsaved (empty, never-saved) block
  const handleDiscard = useCallback(async (blockId: string) => {
    await supabase.from('blocks').delete().eq('id', blockId)
    removeBlock(blockId)
    if (justAddedId === blockId) setJustAddedId(null)
  }, [justAddedId, removeBlock])

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

  const visibleBlocks = showMasked
    ? blocks
    : blocks.filter((b) => b.state === 'active')

  const maskedCount = blocks.filter((b) => b.state === 'masked').length
  const activeCount = blocks.filter((b) => b.state === 'active').length
  const pinnedBlocks = blocks.filter((b) => b.state === 'active' && b.is_pinned)

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
        {/* Toolbar */}
        <div className="border-b px-4 py-2 flex items-center justify-between bg-background shrink-0">
          <span className="text-xs text-muted-foreground">
            {activeCount} block{activeCount !== 1 ? 's' : ''}
            {maskedCount > 0 && (
              <span className="ml-1 text-muted-foreground/60">· {maskedCount} masked</span>
            )}
          </span>
          {maskedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMasked(!showMasked)}
              className="text-xs h-7"
            >
              {showMasked
                ? <EyeOff className="h-3.5 w-3.5 mr-1" />
                : <Eye className="h-3.5 w-3.5 mr-1" />}
              {showMasked ? 'Hide' : 'Show'} all versions
            </Button>
          )}
        </div>

        {/* Pinned HUD */}
        {pinnedBlocks.length > 0 && (
          <div className="border-b bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
            <Pin className="h-3 w-3 text-amber-500 shrink-0" />
            <div className="flex items-center gap-2 flex-nowrap">
              {pinnedBlocks.map((block) => {
                const def = definitionMap[block.type]
                const colors = getDefinitionColors(def?.color ?? 'slate')
                return (
                  <button
                    key={block.id}
                    onClick={() => scrollToBlock(block.id)}
                    className={cn(
                      'flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 bg-background',
                      'hover:border-amber-400 hover:bg-amber-50 transition-colors whitespace-nowrap shrink-0',
                      colors.border,
                    )}
                  >
                    <div className={cn('h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0', colors.iconBg)}>
                      <FileText className="w-2 h-2 text-white" />
                    </div>
                    <span className="font-medium">{def?.name ?? block.type}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(block.id) }}
                      title="Unpin"
                      className="ml-0.5 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <PinOff className="h-2.5 w-2.5" />
                    </button>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {visibleBlocks.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="text-sm">No blocks yet</p>
                <p className="text-xs mt-1">Add your first block below</p>
              </div>
            ) : (
              visibleBlocks.map((block) => (
                <div key={block.id}>
                  {block.state === 'masked' && (
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">superseded version</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <BlockWrapper
                    block={block}
                    definition={definitionMap[block.type]}
                    encounterId={encounterId}
                    patientId={patientId}
                    lock={lockMap[block.id]}
                    currentUserId={user?.id ?? ''}
                    encounterClosed={encounterStatus === 'closed'}
                    encounterPortalVisible={encounterPortalVisible}
                    autoEdit={
                      encounterStatus === 'open' &&
                      (block.is_template_seed === true || block.id === justAddedId)
                    }
                    isUnsaved={block.id === justAddedId}
                    onEdit={handleEditBlock}
                    onDiscard={handleDiscard}
                    onMask={handleMask}
                    onTogglePin={togglePin}
                    onAcquireLock={acquireLock}
                    onReleaseLock={releaseLockFn}
                    onViewHistory={handleViewHistory}
                  />
                </div>
              ))
            )}

            {encounterStatus === 'open' && (
              <div className="pt-2">
                <AddBlockMenu onAdd={handleAddBlock} />
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
              {historyBlock && (definitionMap[historyBlock.type]?.name ?? historyBlock.type)}
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
  if (block.type === 'med_orders') {
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
