/**
 * One phrase for "who sees this block" — collapses the scattered gates
 * (active, dept-only, dept result role, visible_to_roles) into a single
 * human-readable status for the Settings UI.
 */
import type { BlockDefinition } from '../types'

/** Minimal role shape needed to resolve slugs to display names. */
type RoleRef = { slug: string; name: string }

export function blockVisibilitySummary(
  def: Pick<BlockDefinition, 'active' | 'is_dept_only' | 'visible_to_roles' | 'config'>,
  allRoles: RoleRef[],
): string {
  if (!def.active) return 'Off — hidden everywhere'
  if (def.is_dept_only || def.config?.dept_role === 'result') {
    return 'Department workspace only'
  }
  const slugs = def.visible_to_roles ?? []
  if (slugs.length === 0) return 'All clinical staff'
  const names = slugs.map(s => allRoles.find(r => r.slug === s)?.name ?? s)
  return names.join(', ')
}
