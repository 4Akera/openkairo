import { describe, it, expect } from 'vitest'
import { findAllergyConflicts } from '../allergyCheck'

const ALLERGIES = [
  { allergen: 'Penicillin', severity: 'severe' },
  { allergen: 'NSAIDs (ibuprofen)', severity: 'moderate' },
  { allergen: 'Latex', severity: null },
]

describe('findAllergyConflicts', () => {
  it('matches exact allergen name case-insensitively', () => {
    expect(findAllergyConflicts('penicillin', ALLERGIES).map(a => a.allergen))
      .toEqual(['Penicillin'])
  })

  it('matches when the med name extends the allergen', () => {
    expect(findAllergyConflicts('Penicillin V 500mg', ALLERGIES).map(a => a.allergen))
      .toEqual(['Penicillin'])
  })

  it('matches when the allergen extends the med token', () => {
    expect(findAllergyConflicts('ibuprofen', ALLERGIES).map(a => a.allergen))
      .toEqual(['NSAIDs (ibuprofen)'])
  })

  it('no match for unrelated meds', () => {
    expect(findAllergyConflicts('Paracetamol 1g', ALLERGIES)).toEqual([])
  })

  it('ignores short noisy tokens', () => {
    expect(findAllergyConflicts('po qds', ALLERGIES)).toEqual([])
    expect(findAllergyConflicts('', ALLERGIES)).toEqual([])
  })
})
