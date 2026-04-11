import type { PatientFieldDefinition } from '../types'

/** Name / DOB rows are rendered separately from the dynamic demographics grid. */
export const PATIENT_NAME_HEADER_SLUGS = ['first_name', 'middle_name', 'last_name', 'date_of_birth'] as const

/**
 * Demographics fields with sort_order >= Blood Group are hidden (Blood Group included).
 * Uses the Blood Group row’s sort_order from the loaded definitions.
 */
export function filterPatientFieldsBeforeBloodGroup(defs: PatientFieldDefinition[]): PatientFieldDefinition[] {
  const bg = defs.find(d => d.slug === 'blood_group')
  if (!bg) return defs
  return defs.filter(d => d.sort_order < bg.sort_order)
}
