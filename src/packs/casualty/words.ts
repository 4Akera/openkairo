// Emergency's refusals in words (spec/openCare.md §5.6): the two codes of its triage check. Pure.
export const REFUSALS: Record<string, string> = {
  triage_mismatch: 'The level and its code differ — choose the level again',
  not_in_stay: 'Triage is written for a patient in this department',
}
