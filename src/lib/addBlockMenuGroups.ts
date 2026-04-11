import type { BlockDefinition } from '../types'

/** Registry-ish key for grouping (handles variants / copies). */
function defGroupKey(def: BlockDefinition): string {
  const r = def.registry_slug?.trim()
  const base = (r || def.slug).replace(/__copy\d*$/, '')
  return base
}

const GROUP_ORDER = [
  'clinical',
  'monitoring',
  'procedures',
  'labs',
  'imaging',
  'pharmacy',
  'media',
  'other',
] as const

export type AddBlockMenuGroupId = (typeof GROUP_ORDER)[number]

const GROUP_LABELS: Record<AddBlockMenuGroupId, string> = {
  clinical: 'Notes & documentation',
  monitoring: 'Vitals & scores',
  procedures: 'Procedures & wound care',
  labs: 'Laboratory',
  imaging: 'Imaging & radiology',
  pharmacy: 'Medications & pharmacy',
  media: 'Media & attachments',
  other: 'Other',
}

const SLUG_TO_GROUP: Record<string, AddBlockMenuGroupId> = {
  note: 'clinical',
  hx_physical: 'clinical',
  plan: 'clinical',
  tour: 'clinical',
  nurse_note: 'clinical',
  consultation: 'clinical',
  dc_note: 'clinical',
  vitals: 'monitoring',
  score: 'monitoring',
  pain_assessment: 'monitoring',
  procedure_note: 'procedures',
  anaesthetic_note: 'procedures',
  wound_care: 'procedures',
  lab_order: 'labs',
  lab_result: 'labs',
  radiology_request: 'imaging',
  radiology_result: 'imaging',
  meds: 'pharmacy',
  pharmacy_fulfillment: 'pharmacy',
  media: 'media',
}

export function groupIdForDefinition(def: BlockDefinition): AddBlockMenuGroupId {
  return SLUG_TO_GROUP[defGroupKey(def)] ?? 'other'
}

export interface AddBlockMenuGroupSection {
  id: AddBlockMenuGroupId
  label: string
  defs: BlockDefinition[]
}

/**
 * Partition definitions into ordered sections (by GROUP_ORDER), each sorted by sort_order.
 */
export function groupDefinitionsForAddMenu(defs: BlockDefinition[]): AddBlockMenuGroupSection[] {
  const byGroup = new Map<AddBlockMenuGroupId, BlockDefinition[]>()
  for (const id of GROUP_ORDER) byGroup.set(id, [])

  for (const d of defs) {
    const gid = groupIdForDefinition(d)
    byGroup.get(gid)!.push(d)
  }

  const sections: AddBlockMenuGroupSection[] = []
  for (const id of GROUP_ORDER) {
    const list = byGroup.get(id)!
    if (list.length === 0) continue
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    sections.push({ id, label: GROUP_LABELS[id], defs: list })
  }
  return sections
}

/** Flat list in on-screen order (for keyboard navigation). */
export function flattenGroupedSections(sections: AddBlockMenuGroupSection[]): BlockDefinition[] {
  return sections.flatMap((s) => s.defs)
}
