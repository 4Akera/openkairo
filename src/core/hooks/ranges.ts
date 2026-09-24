// Ranges by sex and age (spec amendments 2026-09-23 · 3): the server flags every value on write; the screens use the same pick to flag as you type.
import { useQuery } from '@tanstack/react-query'
import { rpc } from '../db/rpc'
import type { FieldRange, ServiceField } from '../db/types'
export function useRanges(organizationId: string | null) {
  return useQuery({ queryKey: ['ranges', organizationId], queryFn: () => rpc<FieldRange[]>('read_ranges', { organization_id: organizationId }), enabled: !!organizationId, staleTime: 300_000 })
}
/** the field with the range that fits this patient: a sex-and-age row beats a sex row beats the field's own */
export function fitField(f: ServiceField, serviceId: string, ranges: FieldRange[], sex: string, age: number): ServiceField {
  const rs = ranges.filter((r) => r.service_id === serviceId && r.position === f.position && (!r.sex || r.sex === sex) && (r.age_low == null || age >= r.age_low) && (r.age_high == null || age < r.age_high))
    .sort((a, b) => Number(!!b.sex) - Number(!!a.sex) || Number(b.age_low != null || b.age_high != null) - Number(a.age_low != null || a.age_high != null))
  const r = rs[0]; if (!r) return f
  return { ...f, reference_low: r.reference_low ?? f.reference_low, reference_high: r.reference_high ?? f.reference_high, critical_low: r.critical_low ?? f.critical_low, critical_high: r.critical_high ?? f.critical_high }
}
