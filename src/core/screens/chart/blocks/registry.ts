// Which body draws an entry (chart-plan.md §1.3): a pack's own Block for its type; else a pack's Full, inside the shell; else the
// block of its base type (the registry's base_type: a pack's step is a step); else the Fallback. The group blocks (a set's medicines,
// orders, problems, allergies) and each family's icon and plain label. The icons are the model's FAMILY_ICON, as components.
import type { ComponentType } from 'react'
import { Activity, ClipboardList, File, FileText, FlaskConical, HeartOff, ListChecks, Pill, Scissors, Send, ShieldAlert, Stethoscope, Syringe, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Organization } from '../../../db/types'
import { dataOf } from '../../../db/views'
import { rendererFor, type BlockProps } from '../../../renderers'
import { baseOf, family, type BlockGroup, type ChartItem, type Family } from '../model/items'
import { GROUP_WORD, noteKind, typeLabel } from '../model/labels'
import { Alert } from './Alert'
import { Allergies } from './Allergy'
import { Died } from './Died'
import { Fact } from './Fact'
import { Fallback, PackFull } from './Fallback'
import { Given } from './Given'
import { ListReview } from './ListReview'
import { Note } from './Note'
import { Observation } from './Observation'
import { Orders } from './Orders'
import { Prescription } from './Prescription'
import { Problems } from './Problem'
import { Procedure } from './Procedure'
import { Result } from './Result'
import { Score } from './Score'
import { Vitals } from './Vitals'
import type { GroupProps } from './env'

type Types = Organization['types'] | undefined
export const ICON: Record<Family, LucideIcon> = { note: FileText, vitals: Activity, result: FlaskConical, medication: Pill, order: Send, problem: Stethoscope, allergy: ShieldAlert,
  review: ListChecks, given: Syringe, procedure: Scissors, observation: ClipboardList, alert: TriangleAlert, died: HeartOff, other: File }
const CORE: Partial<Record<Family, ComponentType<BlockProps>>> = { note: Note, vitals: Vitals, result: Result, review: ListReview, given: Given, procedure: Procedure,
  observation: Observation, alert: Alert, died: Died }

/** the base facts drawn in the observation family with a block of their own */
const BY_BASE: Record<string, ComponentType<BlockProps>> = { pregnancy: Fact, breastfeeding: Fact, score: Score }
/** a type's body: its pack's Block, its pack's Full, its base type's block, the Fallback (a lookup, never a component made in render) */
export function blockFor(type: string, types: Types): { Body: ComponentType<BlockProps> } {
  const r = rendererFor(type)
  return { Body: r?.Block ?? (r?.Full ? PackFull : BY_BASE[baseOf(type, types)] ?? CORE[family(type, types)] ?? Fallback) }
}
/** a pack's own block stands alone, even where its family is drawn as a group */
export const ownBlock = (type: string) => !!rendererFor(type)?.Block
/** a family whose one line sits in the block's meta line */
export const BARE = new Set<Family>(['review'])
/** the plain word on a block's meta line: a note's kind (a reply when it answers an order), else the registry's label, never a key */
export const labelFor = (i: ChartItem, types: Types) => i.family === 'note' ? noteKind(dataOf(i.entry, 'note', types)?.kind, !!i.answers_order) : typeLabel(i.type, types)

export type GroupKind = Exclude<BlockGroup['kind'], 'single'>
/** the families a set draws as one paper form, even with one member */
export const GROUP_OF: Partial<Record<Family, GroupKind>> = { medication: 'rx', problem: 'problems', allergy: 'allergies', order: 'orders' }
const prescribed = (items: ChartItem[]) => items.some((i) => i.family === 'medication' && i.entry.data?.basis !== 'reported')
export const GROUPS: Record<GroupKind, { icon: LucideIcon; label: (items: ChartItem[]) => string; Body: ComponentType<GroupProps> }> = {
  rx: { icon: Pill, label: (items) => prescribed(items) ? GROUP_WORD.rx : GROUP_WORD.reported, Body: Prescription },
  problems: { icon: Stethoscope, label: () => GROUP_WORD.problems, Body: Problems },
  allergies: { icon: ShieldAlert, label: () => GROUP_WORD.allergies, Body: Allergies },
  orders: { icon: Send, label: (items) => items.length > 1 ? GROUP_WORD.orders : GROUP_WORD.order, Body: Orders },
}
