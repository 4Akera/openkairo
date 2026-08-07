import { describe, it, expect } from 'vitest'
import { blockVisibilitySummary } from '../blockVisibility'
import type { BlockDefinition } from '../../types'

const ROLES = [
  { slug: 'physician', name: 'Physician' },
  { slug: 'nurse', name: 'Nurse' },
]

function def(over: Partial<BlockDefinition> = {}) {
  return {
    active: true,
    is_dept_only: false,
    visible_to_roles: [] as string[],
    config: {},
    ...over,
  }
}

describe('blockVisibilitySummary', () => {
  it('inactive wins over everything', () => {
    expect(blockVisibilitySummary(def({ active: false, visible_to_roles: ['physician'] }), ROLES))
      .toBe('Off — hidden everywhere')
  })

  it('dept-only blocks are portal-only', () => {
    expect(blockVisibilitySummary(def({ is_dept_only: true }), ROLES))
      .toBe('Department portal only')
  })

  it('dept result blocks are portal-only even without the flag', () => {
    expect(blockVisibilitySummary(def({ config: { dept_role: 'result' } }), ROLES))
      .toBe('Department portal only')
  })

  it('no role restriction means all clinical staff', () => {
    expect(blockVisibilitySummary(def(), ROLES)).toBe('All clinical staff')
  })

  it('role slugs resolve to display names', () => {
    expect(blockVisibilitySummary(def({ visible_to_roles: ['physician', 'nurse'] }), ROLES))
      .toBe('Physician, Nurse')
  })

  it('unknown slugs fall back to the slug itself', () => {
    expect(blockVisibilitySummary(def({ visible_to_roles: ['midwife'] }), ROLES))
      .toBe('midwife')
  })
})
