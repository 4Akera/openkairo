// Code 128 (ISO/IEC 15417), the barcode a specimen label carries and a scanner types back (spec/openCare.md §3.13 Printing, (p5)): pure,
// no dependency. Code set B for text (ASCII 32–126), code set C for runs of digits (two a symbol), the modulo-103 check, the stop.
// A symbol is three bars and three spaces, eleven modules wide (the stop thirteen, its last bar two); the bars of a symbol add up to
// an even number of modules. npm run test:print checks the table against the published patterns and known encodings.

/** each value's widths, bar first: 0–102 the data, 103–105 Start A, B, C, 106 the stop */
const WIDTHS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const
export const START_B = 104
export const START_C = 105
export const CODE_C = 99      // in set B: go to set C
export const CODE_B = 100     // in set C: go to set B
export const STOP = 106
/** the quiet zone each side, in modules (at least ten) */
export const QUIET = 10

/** a value's widths (bar, space, bar, …) */
export const widthsOf = (value: number): string => {
  const w = WIDTHS[value]
  if (w === undefined) throw new RangeError(`Code 128 has no value ${value}`)
  return w
}
/** a value's modules: 1 a bar, 0 a space (eleven; the stop thirteen) */
export const modulesOf = (value: number) => [...widthsOf(value)].map((n, i) => (i % 2 ? '0' : '1').repeat(Number(n))).join('')
/** the number of values the table holds (107) */
export const VALUES = WIDTHS.length

const digit = (c: string) => c >= '0' && c <= '9'
/** how many digits run from i */
const digitsFrom = (s: string, i: number) => { let n = 0; while (i + n < s.length && digit(s[i + n])) n++; return n }
/** a character of set B: its value (ASCII 32–126 → 0–94) */
function inB(c: string): number {
  const code = c.charCodeAt(0)
  if (code < 32 || code > 126) throw new RangeError(`Code 128 set B cannot carry "${c}"`)
  return code - 32
}

export interface Encoded { text: string; values: number[]; check: number; modules: string }
/** the symbols for a text: set C where digits run long enough to save width (four or more at the start or the end, six or more in the
 *  middle, an even count), set B for the rest; then the check (the start plus each value times its place, modulo 103) and the stop */
export function encode128(text: string): Encoded {
  if (!text.length) throw new RangeError('Code 128 needs at least one character')
  const values: number[] = []
  let set: 'B' | 'C'
  let i = 0
  const lead = digitsFrom(text, 0)
  if (lead >= 4 || (lead === text.length && lead % 2 === 0)) { set = 'C'; values.push(START_C) } else { set = 'B'; values.push(START_B) }
  while (i < text.length) {
    if (set === 'C') {
      const run = digitsFrom(text, i)
      if (run >= 2) { values.push(Number(text.slice(i, i + 2))); i += 2; continue }
      values.push(CODE_B); set = 'B'; continue
    }
    const run = digitsFrom(text, i)
    const atEnd = i + run === text.length
    if (run >= 6 || (run >= 4 && atEnd)) {
      if (run % 2) { values.push(inB(text[i])); i++ }   // an odd run: its first digit in B, the rest two a symbol
      values.push(CODE_C); set = 'C'; continue
    }
    values.push(inB(text[i])); i++
  }
  const check = values.reduce((sum, v, k) => sum + v * Math.max(1, k), 0) % 103
  const all = [...values, check, STOP]
  return { text, values, check, modules: all.map(modulesOf).join('') }
}

/** read modules back into text (the test's own reader: the start, each symbol, the check, the stop); null when they do not scan */
export function decode128(modules: string): string | null {
  const byPattern = new Map(Array.from({ length: VALUES }, (_, v) => [modulesOf(v), v]))
  if (!modules.endsWith(modulesOf(STOP))) return null
  const body = modules.slice(0, -modulesOf(STOP).length)
  if (body.length % 11) return null
  const vals: number[] = []
  for (let k = 0; k < body.length; k += 11) { const v = byPattern.get(body.slice(k, k + 11)); if (v === undefined) return null; vals.push(v) }
  const check = vals.pop()!
  if (vals.reduce((sum, v, k) => sum + v * Math.max(1, k), 0) % 103 !== check) return null
  let set = vals[0] === START_C ? 'C' : vals[0] === START_B ? 'B' : null; let out = ''
  if (!set) return null
  for (const v of vals.slice(1)) {
    if (set === 'B') { if (v === CODE_C) set = 'C'; else if (v < 95) out += String.fromCharCode(v + 32); else return null }
    else if (v === CODE_B) set = 'B'; else if (v < 100) out += String(v).padStart(2, '0'); else return null
  }
  return out
}
