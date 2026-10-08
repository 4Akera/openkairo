// A radiology report as its screens read it: the base's result, its findings and impression as text analytes (LOINC 18782-3, 19005-8),
// a critical one's impression marked AA. Pure.
/** a report's words, by its analyte keys (else its conclusion as the impression) */
export function reportOf(data: Record<string, unknown> | undefined): { findings: string; impression: string; critical: boolean } {
  const as = (data?.analytes as { key: string; text?: string; interpretation?: string }[] | undefined) ?? []
  const imp = as.find((a) => a.key === 'impression')
  return { findings: as.find((a) => a.key === 'findings')?.text ?? '', impression: imp?.text ?? String(data?.conclusion ?? ''), critical: imp?.interpretation === 'AA' }
}

