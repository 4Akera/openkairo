/**
 * MedsBlock → patient-level medication list sync.
 *
 * Deliberately additive-only: saving a meds block ADDS active medications
 * that the patient's master list doesn't know yet (matched by normalized
 * name, any status). It never updates or discontinues master-list rows —
 * the patient record UI stays the authority for those actions.
 */
import { supabase } from './supabase'
import type { MedItem } from '../types'

export function normalizeMedName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Pure decision: which block meds are missing from the master list. */
export function medsToAdd(
  blockMeds: Pick<MedItem, 'name' | 'status'>[],
  existingNames: string[],
): Pick<MedItem, 'name' | 'status'>[] {
  const known = new Set(existingNames.map(normalizeMedName))
  const seen = new Set<string>()
  return blockMeds.filter(m => {
    if (m.status !== 'active') return false
    const key = normalizeMedName(m.name)
    if (key === '' || known.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Insert missing active meds into patient_medications. Returns count added. */
export async function syncMedsToPatientList(
  patientId: string,
  meds: MedItem[],
  prescriber: string | null,
): Promise<number> {
  const { data: existing, error } = await supabase
    .from('patient_medications')
    .select('medication_name')
    .eq('patient_id', patientId)
  if (error) {
    console.error('meds sync: could not load master list:', error.message)
    return 0
  }

  const missing = medsToAdd(meds, (existing ?? []).map(r => r.medication_name as string))
  if (missing.length === 0) return 0

  const byName = new Map(meds.map(m => [normalizeMedName(m.name), m]))
  const rows = missing.map(m => {
    const full = byName.get(normalizeMedName(m.name))!
    return {
      patient_id: patientId,
      medication_name: full.name.trim(),
      dosage: full.dose.trim() || null,
      frequency: full.freq.trim() || null,
      route: full.route.trim() || null,
      status: 'active',
      prescriber,
      notes: full.indication.trim() ? `Indication: ${full.indication.trim()}` : null,
      start_date: new Date().toISOString().slice(0, 10),
    }
  })

  const { error: insErr } = await supabase.from('patient_medications').insert(rows)
  if (insErr) {
    console.error('meds sync: insert failed:', insErr.message)
    return 0
  }
  return rows.length
}
