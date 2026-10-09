// A pack's step in the desk's New patient (spec/openCare.md §5.8, the owner 2026-10-08, Q49; core change C4): a pack on for the clinic
// may ask one more thing as a patient is registered — the family pack's "join a family file or start one" (its setting
// family.ask_at_new_patient), as bookings' walk-in part asks when. The core registers the patient as it does today, then hands the
// pack the new patient and what its part chose; what the pack says joins the desk's words. Once per pack. Pure: a node test imports it.
import type { ComponentType } from 'react'
import type { Organization, PatientHit } from '../db/types'
import { isPackKey } from '../screens/marks'

/** what the form has typed so far (the family name and phone help find a household) */
export interface NewPatientSeed { given: string; family: string; phone: string }
export interface NewPatientStepProps { org: Organization; seed: NewPatientSeed; value: unknown; onChange: (v: unknown) => void }
export interface NewPatientStep {
  /** is the step asked in this clinic now (its own setting); the pack must also be on for the clinic */
  show: (org: Organization) => boolean
  Part: ComponentType<NewPatientStepProps>
  /** what still stops Register (a file to choose that is not chosen), or nothing */
  missing?: (value: unknown) => string | null
  /** after the patient is registered: the pack does its own with them (joins the household); what to add to the desk's words */
  after: (value: unknown, patient: PatientHit, org: Organization) => Promise<string | null>
}
export interface NewPatientStepDef extends NewPatientStep { pack: string }

const steps: NewPatientStepDef[] = []
/** a pack's step in New patient; once per pack */
export function registerNewPatientStep(pack: string, step: NewPatientStep): boolean {
  if (!isPackKey(pack)) { console.error(`openCare: a New patient step belongs to a pack: ${pack}`); return false }
  if (steps.some((s) => s.pack === pack)) { console.error(`openCare: ${pack}'s New patient step is taken`); return false }
  steps.push({ ...step, pack }); return true
}
export const newPatientStepDefs = (): readonly NewPatientStepDef[] => steps
/** the steps asked here: each pack on for the clinic whose step says it is asked (one that fails is left out) */
export function newPatientStepsFor(list: readonly NewPatientStepDef[], org: Organization | undefined): NewPatientStepDef[] {
  if (!org) return []
  return list.filter((s) => { if (!org.packs.some((p) => p.key === s.pack && p.enabled)) return false
    try { return s.show(org) } catch (e) { console.error(`openCare: the New patient step of ${s.pack} failed`, e); return false } })
}
