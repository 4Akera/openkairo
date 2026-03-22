/**
 * BlockRegistry
 *
 * The single source of truth for every hardcoded block type.
 * Each entry maps a block slug → { View, Edit, emptyContent }.
 *
 * To add a new block type:
 *   1. Create  src/components/timeline/blocks/MyBlock.tsx
 *              exporting MyBlockView + MyBlockEdit
 *   2. Add an entry below
 *   3. Seed its metadata in supabase/schema.sql (name, icon, color, cap_* flags)
 *
 * Unknown slugs (not in this registry) fall back to DynamicBlock,
 * which renders from the block_definitions.fields JSONB schema.
 */

import type { Block } from '../../types'
import {
  HxPhysicalView,
  HxPhysicalEdit,
  emptyHxPhysical,
  type HxPhysicalContent,
} from './blocks/HxPhysicalBlock'
import {
  VitalsView,
  VitalsEdit,
  emptyVitals,
  type VitalsContent,
} from './blocks/VitalsBlock'
import { NoteView, NoteEdit, emptyNote } from './blocks/NoteBlock'
import { MedsView, MedsEdit, emptyMedOrders } from './blocks/MedsBlock'
import { PlanView, PlanEdit, emptyPlan } from './blocks/PlanBlock'
import type { NoteContent, MedOrdersContent, PlanContent } from '../../types'

// ============================================================
// Registry interface
// ============================================================

export interface EditProps {
  block: Block
  onSave: (content: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}

export interface BlockRenderer {
  /** Renders the read-only view of the block content */
  View: React.ComponentType<{ block: Block }>
  /** Renders the edit form (receives generic onSave to keep BlockWrapper typed simply) */
  Edit: React.ComponentType<EditProps>
  /** Returns an empty content object for new blocks of this type */
  emptyContent: () => Record<string, unknown>
}

// ============================================================
// Built-in adapter components
// (thin wrappers that bridge the typed content ↔ generic callback)
// ============================================================

const HxPhysicalViewAdapter: React.FC<{ block: Block }> = ({ block }) => (
  <HxPhysicalView block={block} />
)

const HxPhysicalEditAdapter: React.FC<EditProps> = ({ block, onSave, onCancel }) => (
  <HxPhysicalEdit
    block={block}
    onSave={(c: HxPhysicalContent) => onSave(c as unknown as Record<string, unknown>)}
    onCancel={onCancel}
  />
)

const VitalsViewAdapter: React.FC<{ block: Block }> = ({ block }) => (
  <VitalsView block={block} />
)

const VitalsEditAdapter: React.FC<EditProps> = ({ block, onSave, onCancel }) => (
  <VitalsEdit
    block={block}
    onSave={(c: VitalsContent) => onSave(c as unknown as Record<string, unknown>)}
    onCancel={onCancel}
  />
)

const NoteViewAdapter: React.FC<{ block: Block }> = ({ block }) => (
  <NoteView block={block} />
)

const NoteEditAdapter: React.FC<EditProps> = ({ block, onSave, onCancel }) => (
  <NoteEdit
    block={block}
    onSave={(c: NoteContent) => onSave(c as unknown as Record<string, unknown>)}
    onCancel={onCancel}
  />
)

const MedsViewAdapter: React.FC<{ block: Block }> = ({ block }) => (
  <MedsView block={block} />
)

const MedsEditAdapter: React.FC<EditProps> = ({ block, onSave, onCancel }) => (
  <MedsEdit
    block={block}
    onSave={(c: MedOrdersContent) => onSave(c as unknown as Record<string, unknown>)}
    onCancel={onCancel}
  />
)

const PlanViewAdapter: React.FC<{ block: Block }> = ({ block }) => (
  <PlanView block={block} />
)

const PlanEditAdapter: React.FC<EditProps> = ({ block, onSave, onCancel }) => (
  <PlanEdit
    block={block}
    onSave={(c: PlanContent) => onSave(c as unknown as Record<string, unknown>)}
    onCancel={onCancel}
  />
)

// ============================================================
// Registry
// ============================================================

export const BLOCK_REGISTRY: Record<string, BlockRenderer> = {
  hx_physical: {
    View: HxPhysicalViewAdapter,
    Edit: HxPhysicalEditAdapter,
    emptyContent: () => emptyHxPhysical() as unknown as Record<string, unknown>,
  },

  vitals: {
    View: VitalsViewAdapter,
    Edit: VitalsEditAdapter,
    emptyContent: () => emptyVitals() as unknown as Record<string, unknown>,
  },

  note: {
    View: NoteViewAdapter,
    Edit: NoteEditAdapter,
    emptyContent: () => emptyNote() as unknown as Record<string, unknown>,
  },

  med_orders: {
    View: MedsViewAdapter,
    Edit: MedsEditAdapter,
    emptyContent: () => emptyMedOrders() as unknown as Record<string, unknown>,
  },

  plan: {
    View: PlanViewAdapter,
    Edit: PlanEditAdapter,
    emptyContent: () => emptyPlan() as unknown as Record<string, unknown>,
  },

  // ── Add new hardcoded block types here ───────────────────────
  // Example:
  // vitals_flow: { View: VitalsFlowView, Edit: VitalsFlowEdit, emptyContent: () => ({...}) },
}

/** Returns true if the slug has a hardcoded renderer */
export function isRegistered(slug: string): boolean {
  return slug in BLOCK_REGISTRY
}
