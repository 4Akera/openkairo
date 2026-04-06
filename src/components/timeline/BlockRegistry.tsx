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
import { VitalsView, VitalsEdit, emptyVitals, type VitalsContent } from './blocks/VitalsBlock'
import { NoteView, NoteEdit, emptyNote } from './blocks/NoteBlock'
import type { NoteContent } from '../../types'
import { HxPhysicalView, HxPhysicalEdit, emptyHxPhysical } from './blocks/HxPhysicalBlock'
import type { HxPhysicalContent } from '../../types'
import { PlanView, PlanEdit, emptyPlan } from './blocks/PlanBlock'
import type { PlanContent } from '../../types'
import { LabOrderView, LabOrderEdit, emptyLabOrder } from './blocks/LabOrderBlock'
import type { LabOrderContent, LabResultContent, NurseNoteContent, ConsultationContent, DCNoteContent, MedsContent } from '../../types'
import { LabResultView, LabResultEdit, emptyLabResult } from './blocks/LabResultBlock'
import { NurseNoteView, NurseNoteEdit, emptyNurseNote } from './blocks/NurseNoteBlock'
import { ConsultationView, ConsultationEdit, emptyConsultation } from './blocks/ConsultationBlock'
import { DCNoteView, DCNoteEdit, emptyDCNote } from './blocks/DCNoteBlock'
import { MedsView, MedsEdit, emptyMeds } from './blocks/MedsBlock'
import { MediaView, MediaEdit, emptyMedia, type MediaContent } from './blocks/MediaBlock'
import { ScoreView, ScoreEdit, emptyScore, type ScoreContent } from './blocks/ScoreBlock'
import { TourView, TourEdit, emptyTour, type TourContent } from './blocks/TourBlock'
import { ProcedureNoteView, ProcedureNoteEdit, emptyProcedureNote, type ProcedureNoteContent } from './blocks/ProcedureNoteBlock'
import { AnaestheticNoteView, AnaestheticNoteEdit, emptyAnaesthetic, type AnaestheticContent } from './blocks/AnaestheticNoteBlock'
import { PainAssessmentView, PainAssessmentEdit, emptyPainAssessment, type PainAssessmentContent } from './blocks/PainAssessmentBlock'
import { WoundCareView, WoundCareEdit, emptyWoundCare, type WoundCareContent } from './blocks/WoundCareBlock'

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
// Adapter helpers (bridge typed content ↔ generic callback)
// ============================================================

function makeAdapter<C>(
  ViewComp: React.ComponentType<{ block: Block }>,
  EditComp: React.ComponentType<{ block: Block; onSave: (c: C) => Promise<void>; onCancel: () => void }>,
  empty: () => C,
): BlockRenderer {
  const View: React.FC<{ block: Block }> = ({ block }) => <ViewComp block={block} />
  const Edit: React.FC<EditProps> = ({ block, onSave, onCancel }) => (
    <EditComp
      block={block}
      onSave={(c: C) => onSave(c as unknown as Record<string, unknown>)}
      onCancel={onCancel}
    />
  )
  return {
    View,
    Edit,
    emptyContent: () => empty() as unknown as Record<string, unknown>,
  }
}

// ============================================================
// Registry
// ============================================================

export const BLOCK_REGISTRY: Record<string, BlockRenderer> = {
  vitals:           makeAdapter<VitalsContent>(VitalsView, VitalsEdit, emptyVitals),
  note:             makeAdapter<NoteContent>(NoteView, NoteEdit, emptyNote),
  hx_physical:      makeAdapter<HxPhysicalContent>(HxPhysicalView, HxPhysicalEdit, emptyHxPhysical),
  plan:             makeAdapter<PlanContent>(PlanView, PlanEdit, emptyPlan),
  media:            makeAdapter<MediaContent>(MediaView, MediaEdit, emptyMedia),
  score:            makeAdapter<ScoreContent>(ScoreView, ScoreEdit, emptyScore),
  tour:             makeAdapter<TourContent>(TourView, TourEdit, emptyTour),
  procedure_note:   makeAdapter<ProcedureNoteContent>(ProcedureNoteView, ProcedureNoteEdit, emptyProcedureNote),
  anaesthetic_note: makeAdapter<AnaestheticContent>(AnaestheticNoteView, AnaestheticNoteEdit, emptyAnaesthetic),
  pain_assessment:  makeAdapter<PainAssessmentContent>(PainAssessmentView, PainAssessmentEdit, emptyPainAssessment),
  wound_care:       makeAdapter<WoundCareContent>(WoundCareView, WoundCareEdit, emptyWoundCare),
  lab_order:        makeAdapter<LabOrderContent>(LabOrderView, LabOrderEdit, emptyLabOrder),
  lab_result:       makeAdapter<LabResultContent>(LabResultView, LabResultEdit, emptyLabResult),
  nurse_note:       makeAdapter<NurseNoteContent>(NurseNoteView, NurseNoteEdit, emptyNurseNote),
  consultation:     makeAdapter<ConsultationContent>(ConsultationView, ConsultationEdit, emptyConsultation),
  dc_note:          makeAdapter<DCNoteContent>(DCNoteView, DCNoteEdit, emptyDCNote),
  meds:             makeAdapter<MedsContent>(MedsView, MedsEdit, emptyMeds),

  // ── Add new hardcoded block types here ───────────────────────
}

/** Returns true if the slug has a hardcoded renderer */
export function isRegistered(slug: string): boolean {
  return slug in BLOCK_REGISTRY
}
