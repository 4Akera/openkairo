import { describe, it, expect } from 'vitest'
import { canAccessEncounter, type EncounterAccessInput } from '../encounterAccess'

const ME = 'user-me'
const OTHER = 'user-other'

function enc(over: Partial<EncounterAccessInput> = {}): EncounterAccessInput {
  return { visibility: 'staff', assigned_to: null, created_by: null, ...over }
}

const clinician = { userId: ME, roleSlugs: ['physician'], canAddBlocks: true }

describe('canAccessEncounter', () => {
  it('denies everything without block.add, even for admins on staff rows', () => {
    expect(canAccessEncounter(enc(), { ...clinician, canAddBlocks: false })).toBe(false)
    expect(
      canAccessEncounter(enc(), { userId: ME, roleSlugs: ['admin'], canAddBlocks: false }),
    ).toBe(false)
  })

  it('staff visibility is open to any clinical staff', () => {
    expect(canAccessEncounter(enc(), clinician)).toBe(true)
    expect(canAccessEncounter(enc(), { userId: undefined, roleSlugs: [], canAddBlocks: true })).toBe(true)
  })

  it('admin passes private and restricted', () => {
    const admin = { userId: OTHER, roleSlugs: ['admin'], canAddBlocks: true }
    expect(canAccessEncounter(enc({ visibility: 'private', assigned_to: ME }), admin)).toBe(true)
    expect(canAccessEncounter(enc({ visibility: 'restricted' }), admin)).toBe(true)
  })

  it('assigned user passes private', () => {
    expect(canAccessEncounter(enc({ visibility: 'private', assigned_to: ME }), clinician)).toBe(true)
    expect(canAccessEncounter(enc({ visibility: 'private', assigned_to: OTHER }), clinician)).toBe(false)
  })

  it('creator retains access to private (receptionist who registered it)', () => {
    const receptionist = { userId: ME, roleSlugs: ['receptionist'], canAddBlocks: true }
    expect(
      canAccessEncounter(enc({ visibility: 'private', assigned_to: OTHER, created_by: ME }), receptionist),
    ).toBe(true)
  })

  it('restricted admits listed roles and denies others', () => {
    const restricted = enc({ visibility: 'restricted', visible_to_roles: ['physician'] })
    expect(canAccessEncounter(restricted, clinician)).toBe(true)
    expect(
      canAccessEncounter(restricted, { userId: ME, roleSlugs: ['nurse'], canAddBlocks: true }),
    ).toBe(false)
  })

  it('restricted with an empty role list admits only assigned/creator/admin', () => {
    const restricted = enc({ visibility: 'restricted', visible_to_roles: [] })
    expect(canAccessEncounter(restricted, clinician)).toBe(false)
    expect(canAccessEncounter({ ...restricted, assigned_to: ME }, clinician)).toBe(true)
  })

  it('never matches null assignee/creator against a missing userId', () => {
    const anon = { userId: undefined, roleSlugs: ['physician'], canAddBlocks: true }
    expect(canAccessEncounter(enc({ visibility: 'private' }), anon)).toBe(false)
  })
})
