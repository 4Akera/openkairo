// Results by section (spec/openCare.md §5.3; the picture "Lab · results by section"), as pure decisions: the grid's columns (each test's
// fields once, in the order the section's tests list them), the values worked out from others (LDL from the lipids, Friedewald; eGFR
// from creatinine, CKD-EPI 2021, adults only), and the change check (a value far from the patient's last within 30 days: check the
// sample before release). Pure (npm run test:lis).

export interface Prev { value: number; at: string }
const DAY = 86_400_000

/** the grid's columns: each field once by key, in the order the tests list them */
export function columnsOf<F extends { key: string }>(tests: { fields: F[] }[]): F[] {
  const out: F[] = []
  for (const t of tests) for (const f of t.fields) if (!out.some((x) => x.key === f.key)) out.push(f)
  return out
}

/** a field the laboratory works out from others, not typed */
export const WORKED_OUT = new Set(['ldl', 'egfr'])
const num = (s: string | undefined) => s !== undefined && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : null
/** LDL = cholesterol − HDL − TG/5 (mg/dL), not when TG is 400 or more; eGFR (CKD-EPI 2021, mL/min/1.73 m²) from creatinine (mg/dL),
 *  age and sex, adults only; none when what it needs is not typed */
export function workedOut(key: string, vals: Record<string, string>, who: { sex: string; age: number }): number | null {
  if (key === 'ldl') {
    const chol = num(vals.chol), hdl = num(vals.hdl), tg = num(vals.tg)
    return chol != null && hdl != null && tg != null && tg < 400 ? Math.round(chol - hdl - tg / 5) : null
  }
  if (key === 'egfr') {
    const scr = num(vals.creat); if (scr == null || scr <= 0 || who.age < 18) return null
    const female = who.sex === 'female'; const k = female ? 0.7 : 0.9; const a = female ? -0.241 : -0.302
    return Math.round(142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** who.age * (female ? 1.012 : 1))
  }
  return null
}

// how far a value may move from the last before it asks for a second look: an absolute step for some tests, else a share of the last
const STEP: Record<string, number> = { hb: 3, k: 1, na: 8, ca: 1.5, inr: 1 }
const SHARE: Record<string, number> = { creat: 0.5, plt: 0.5, wbc: 0.5, tni: 1, alt: 1, ast: 1 }
/** the change check: the last value, how long ago, when the new one moved past its step (or its share, or half) within 30 days */
export function changeOf(key: string, now: number, prev: Prev | undefined, today = Date.now()): { was: number; days: number } | null {
  if (!prev) return null
  const days = Math.round((today - Date.parse(prev.at)) / DAY); if (days > 30 || days < 0) return null
  const moved = Math.abs(now - prev.value)
  const big = STEP[key] != null ? moved >= STEP[key] : prev.value !== 0 && moved / Math.abs(prev.value) >= (SHARE[key] ?? 0.5)
  return big ? { was: prev.value, days } : null
}
