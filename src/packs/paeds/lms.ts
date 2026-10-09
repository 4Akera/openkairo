// The WHO LMS sums, as the server's paeds.measure does them (spec/openCare.md §5.7): L, M and S at a point between two rows of a
// loaded table (by age in months, or length to half a centimetre), and the z-score by the LMS method with the WHO's restricted way past
// ±3. The record keeps the server's; the line under /v shows the same sums for values being typed. Pure.
export type Lms = [number, number, number]
export type Sex = 'm' | 'f'
const key = (ind: string, sex: Sex, x: number) => `${ind}.${sex}.${ind === 'wfl' ? x.toFixed(1) : String(Math.round(x))}`
/** L, M and S at x, in proportion between the rows either side; null outside the loaded table */
export function lmsAt(tables: Map<string, Lms>, ind: string, sex: Sex, x: number): Lms | null {
  const step = ind === 'wfl' ? 0.5 : 1; const lo = Math.floor(x / step) * step; const f = (x - lo) / step
  const a = tables.get(key(ind, sex, lo)); if (!a) return null
  if (f < 1e-9) return a
  const b = tables.get(key(ind, sex, lo + step)); if (!b) return null
  return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])]
}
/** the z-score, two decimals */
export function zOf(v: number, [l, m, s]: Lms): number {
  let z = l === 0 ? Math.log(v / m) / s : ((v / m) ** l - 1) / (l * s)
  if (z > 3) { const sd3 = m * (1 + l * s * 3) ** (1 / l); const sd2 = m * (1 + l * s * 2) ** (1 / l); z = 3 + (v - sd3) / (sd3 - sd2) }
  else if (z < -3) { const sd3 = m * (1 + l * s * -3) ** (1 / l); const sd2 = m * (1 + l * s * -2) ** (1 / l); z = -3 + (v - sd3) / (sd2 - sd3) }
  return Math.round(z * 100) / 100
}
