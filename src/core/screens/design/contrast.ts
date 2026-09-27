// Contrast on /design (design-system.md §2.2, WCAG 2.x relative luminance), from the colours the browser computed for each token
// in each theme: the page proves the stylesheet as it is now, not as it was written down. Pure.
export type RGBA = [number, number, number, number]
export type Values = Record<string, RGBA | null>

const channel = (v: string, pct: string) => pct ? +v / 100 : +v
/** a computed colour: rgb()/rgba() in the comma or the space syntax, or color(srgb …) */
export function parse(css: string): RGBA | null {
  const m = css.trim().match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/)
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : channel(m[4], m[5])]
  const c = css.trim().match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/)
  if (c) return [+c[1] * 255, +c[2] * 255, +c[3] * 255, c[4] == null ? 1 : channel(c[4], c[5])]
  return null
}
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]: RGBA) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
/** a see-through colour laid on the one under it */
const over = (top: RGBA, under: RGBA): RGBA => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1) as RGBA
export function ratio(fg: RGBA, bg: RGBA) {
  const a = lum(fg[3] < 1 ? over(fg, bg) : fg), b = lum(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
/** #0f766e, or rgb(20 26 25 / 0.045) when it is see-through */
export const hex = ([r, g, b, a]: RGBA) => a < 1 ? `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${+a.toFixed(3)})`
  : `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

// What sits on each background and the ratio it needs: text 4.5:1, the focus ring 3:1 (a control's edge, 1.4.11). The §2.2
// table, 53 pairs per theme.
const PLAIN: [string, number][] = [['fg', 4.5], ['muted', 4.5], ['faint', 4.5], ['accent', 4.5], ['danger', 4.5], ['warn', 4.5], ['ok', 4.5], ['info', 4.5], ['focus', 3]]
export const ON: Record<string, [string, number][]> = {
  canvas: PLAIN, surface: PLAIN, raised: PLAIN,
  sunken: [['fg', 4.5], ['muted', 4.5], ['faint', 4.5], ['focus', 3]],
  'accent-soft': [['fg', 4.5], ['muted', 4.5], ['faint', 4.5], ['accent', 4.5]],
  'danger-soft': [['muted', 4.5], ['faint', 4.5], ['danger', 4.5]],
  'warn-soft': [['muted', 4.5], ['faint', 4.5], ['warn', 4.5]],
  'ok-soft': [['faint', 4.5], ['ok', 4.5]],
  'info-soft': [['faint', 4.5], ['info', 4.5]],
  accent: [['accent-fg', 4.5]], 'accent-hover': [['accent-fg', 4.5]],
  danger: [['danger-fg', 4.5]], warn: [['warn-fg', 4.5]], ok: [['ok-fg', 4.5]], info: [['info-fg', 4.5]],
  band: [['accent', 4.5]],
  selection: [['fg', 4.5]],
}
export const PAIRS = Object.entries(ON).flatMap(([bg, on]) => on.map(([fg, min]) => ({ fg, bg, min })))
/** the hairlines: below 3:1 by design (design-system.md §2.2's honest exception), shown but not counted */
export const HAIRLINES = [{ fg: 'line-strong', bg: 'sunken', min: 3 }, { fg: 'line-strong', bg: 'surface', min: 3 }, { fg: 'line', bg: 'surface', min: 3 }]

export type Checked = { fg: string; bg: string; min: number; r: number | null }
export const check = (v: Values, pairs = PAIRS): Checked[] => pairs.map((p) => { const f = v[p.fg], b = v[p.bg]; return { ...p, r: f && b ? ratio(f, b) : null } })
/** every [data-token] under an element, as the browser computed its fill */
export const readTokens = (el: HTMLElement): Values => Object.fromEntries([...el.querySelectorAll<HTMLElement>('[data-token]')]
  .map((n) => [n.dataset.token!, parse(getComputedStyle(n).backgroundColor)]))
