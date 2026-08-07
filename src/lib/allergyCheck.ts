/**
 * Allergy cross-check for prescribing: does a medication name look like a
 * recorded allergen? Deliberately conservative substring matching — this is
 * a safety net that surfaces the chart's own allergy list at the moment of
 * prescribing, not a drug-interaction engine.
 */

export interface AllergyRef {
  allergen: string
  severity: string | null
  reaction?: string | null
}

/** Tokens shorter than this are too noisy to match ("po", "of"). */
const MIN_TOKEN = 4

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= MIN_TOKEN)
}

/**
 * Allergies whose allergen plausibly matches the medication name: any token
 * of one contained in a token of the other (so "Penicillin V" matches
 * allergen "penicillin", and allergen "penicillins" matches "penicillin").
 */
export function findAllergyConflicts(medName: string, allergies: AllergyRef[]): AllergyRef[] {
  const medTokens = tokens(medName)
  if (medTokens.length === 0) return []
  return allergies.filter(a => {
    const allergenTokens = tokens(a.allergen)
    return allergenTokens.some(at =>
      medTokens.some(mt => mt.includes(at) || at.includes(mt)),
    )
  })
}
