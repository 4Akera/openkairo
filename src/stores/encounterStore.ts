import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Block, BlockDefinition, BlockLockMap } from '../types'

interface EncounterState {
  blocks: Block[]
  showMasked: boolean
  lockMap: BlockLockMap
  definitions: BlockDefinition[]
  definitionMap: Record<string, BlockDefinition>
  setBlocks: (blocks: Block[]) => void
  appendBlock: (block: Block) => void
  updateBlock: (block: Block) => void
  removeBlock: (blockId: string) => void
  maskBlock: (blockId: string) => void
  setShowMasked: (show: boolean) => void
  setLockMap: (map: BlockLockMap) => void
  applyLock: (blockId: string, userId: string, userEmail: string) => void
  releaseLock: (blockId: string) => void
  setDefinitions: (defs: BlockDefinition[]) => void
  togglePin: (blockId: string) => Promise<void>
}

export const useEncounterStore = create<EncounterState>((set, get) => ({
  blocks: [],
  showMasked: false,
  lockMap: {},
  definitions: [],
  definitionMap: {},

  setBlocks: (blocks) => set({ blocks }),

  appendBlock: (block) =>
    set((state) => {
      if (state.blocks.some(b => b.id === block.id)) return state
      return { blocks: [...state.blocks, block] }
    }),

  updateBlock: (block) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === block.id ? block : b)),
    })),

  removeBlock: (blockId) =>
    set((state) => ({ blocks: state.blocks.filter((b) => b.id !== blockId) })),

  maskBlock: (blockId) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId ? { ...b, state: 'masked' as const } : b,
      ),
    })),

  setShowMasked: (show) => set({ showMasked: show }),

  setLockMap: (map) => set({ lockMap: map }),

  applyLock: (blockId, userId, userEmail) =>
    set((state) => ({
      lockMap: {
        ...state.lockMap,
        [blockId]: { block_id: blockId, locked_by: userId, user_email: userEmail },
      },
    })),

  releaseLock: (blockId) =>
    set((state) => {
      const next = { ...state.lockMap }
      delete next[blockId]
      return { lockMap: next }
    }),

  setDefinitions: (defs) => {
    const map: Record<string, BlockDefinition> = {}
    defs.forEach((d) => { map[d.slug] = d })
    set({ definitions: defs, definitionMap: map })
  },

  togglePin: async (blockId) => {
    const block = get().blocks.find((b) => b.id === blockId)
    if (!block) return
    const newVal = !block.is_pinned
    await supabase.from('blocks').update({ is_pinned: newVal }).eq('id', blockId)
    set((state) => ({
      blocks: state.blocks.map((b) => b.id === blockId ? { ...b, is_pinned: newVal } : b),
    }))
  },
}))
