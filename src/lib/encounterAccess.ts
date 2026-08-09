/**
 * ONE encounter-access predicate for the client — mirrors the
 * `encounter_select` RLS policy (can_access_encounter() + the creator
 * grant) in supabase/schema.sql. Every UI gate on "can this user open
 * this encounter" goes through here; never restate visibility logic at
 * a call site.
 *
 * block.add is required because opening an encounter means reading its
 * blocks, and block_staff_access demands the clinical permission even on
 * staff-visibility encounters.
 *
 * roleSlugs must come from authStore (get_my_role_slugs), which already
 * expands the role hierarchy — so a plain includes() matches the SQL
 * has_role_in() semantics.
 */
export type EncounterAccessInput = {
  visibility: string
  assigned_to: string | null
  created_by: string | null
  visible_to_roles?: string[] | null
}

export type EncounterAccessContext = {
  userId: string | undefined
  roleSlugs: string[]
  /** can('block.add') from authStore */
  canAddBlocks: boolean
}

/**
 * The two visibility states any surface may offer. 'restricted' is legacy —
 * nothing creates it anymore; existing rows keep their role lists honored
 * by canAccessEncounter and display as Sensitive.
 */
export const VISIBILITY_OPTIONS = [
  { value: 'staff',   label: 'Everyone',  desc: 'Any clinical staff can open' },
  { value: 'private', label: 'Sensitive', desc: 'Assigned physician, creator & admins' },
] as const

export type VisibilityValue = (typeof VISIBILITY_OPTIONS)[number]['value']

/** Display label for any stored visibility, legacy 'restricted' included. */
export function visibilityLabel(v: string | null | undefined): string {
  return v === 'staff' ? 'Everyone' : 'Sensitive'
}

/** Collapse a stored visibility (template default or encounter row) to an offerable state. */
export function normalizeVisibility(v: string | null | undefined): VisibilityValue {
  return v === 'staff' ? 'staff' : 'private'
}

/**
 * Gate for an encounter row the server ALREADY returned (RLS admitted it).
 * Extends canAccessEncounter with the grant the client cannot derive
 * locally — a break-the-glass open: holding a non-staff row plus clinical
 * permission means some server-side arm admitted this user. Never use for
 * rows that did not come through RLS.
 */
export function canViewServedEncounter(
  enc: EncounterAccessInput,
  ctx: EncounterAccessContext,
): boolean {
  return canAccessEncounter(enc, ctx) || (ctx.canAddBlocks && enc.visibility !== 'staff')
}

export function canAccessEncounter(
  enc: EncounterAccessInput,
  ctx: EncounterAccessContext,
): boolean {
  if (!ctx.canAddBlocks) return false
  if (enc.visibility === 'staff') return true
  if (ctx.roleSlugs.includes('admin')) return true
  if (ctx.userId && enc.assigned_to === ctx.userId) return true
  // The creator retains access — a receptionist who registered a private
  // encounter for a physician must still be able to open it (matches RLS).
  if (ctx.userId && enc.created_by === ctx.userId) return true
  if (enc.visibility === 'restricted') {
    return enc.visible_to_roles?.some((r) => ctx.roleSlugs.includes(r)) ?? false
  }
  return false
}
