// Emergency's refusals in words (spec/openCare.md §5.6): the codes of its triage's and its decision's checks, and of its free beds' read
// (wrong_target and not_allowed are the core's). Pure.
export const REFUSALS: Record<string, string> = {
  triage_mismatch: 'The level and its code differ — choose the level again',
  not_in_stay: 'Written only for a patient still in this department',
  unknown_destination: 'Choose where the patient goes: another department of beds here',
  facility_missing: 'Say which facility',
  not_leaving: 'Left before being seen, against advice or died is signed as the patient leaves',
  too_many: 'Too many departments at once',
}
