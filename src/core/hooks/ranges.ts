// Ranges by sex and age live on the service's fields (settings, spec/openCare.md §4.6): the bench picks the one that fits the patient,
// and the interpretation it writes (and copies with the range) is what the review loop reads.
import type { ServiceField } from '../db/types'
/** the field with the range that fits this patient: a sex-and-age row beats a sex row beats the field's own */
export function fitField(f: ServiceField, sex: string, age: number): ServiceField {
  const rs = f.ranges.filter((r) => (!r.gender || r.gender === sex) && (r.age_low == null || age >= r.age_low) && (r.age_high == null || age < r.age_high))
    .sort((a, b) => Number(!!b.gender) - Number(!!a.gender) || Number(b.age_low != null || b.age_high != null) - Number(a.age_low != null || a.age_high != null))
  const r = rs[0]; if (!r) return f
  return { ...f, reference_low: r.low ?? f.reference_low, reference_high: r.high ?? f.reference_high, critical_low: r.critical_low ?? f.critical_low, critical_high: r.critical_high ?? f.critical_high }
}
