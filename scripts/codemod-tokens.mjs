// openCare design system — the token sweep (design-system.md §5.4 and appendix, build plan 2.0).
//   node scripts/codemod-tokens.mjs [dir=src] [--dry]
// Rewrites raw Tailwind palette, size, radius, shadow and z classes to the design-system utilities, keeping every variant
// prefix (hover:, group-hover:, data-[highlighted]:, disabled:, placeholder: …) and every /alpha suffix.
// Skips src/core/ui (the kit is rewritten by hand). Prints what it changed and what it left for a person to decide.
// Idempotent: a second run changes nothing. Run it --dry first, then one directory group at a time.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.argv[2] ?? 'src'
const dry = process.argv.includes('--dry')

// base utility (no prefix, no alpha) → design-system utility; '' deletes the class
const MAP = {
  // text
  'text-neutral-900': 'text-fg', 'text-neutral-800': 'text-fg',
  'text-neutral-700': 'text-muted', 'text-neutral-600': 'text-muted',
  'text-neutral-500': 'text-faint', 'text-neutral-400': 'text-faint', 'text-neutral-300': 'text-faint',
  'text-white': 'text-accent-fg',                                   // every use sits on bg-teal-800 (checked); on a danger fill the kit says text-danger-fg
  'text-teal-700': 'text-accent', 'text-teal-800': 'text-accent', 'text-teal-900': 'text-accent',
  'text-red-600': 'text-danger', 'text-red-700': 'text-danger', 'text-red-800': 'text-danger',
  'text-amber-700': 'text-warn', 'text-amber-800': 'text-warn', 'text-amber-900': 'text-warn',
  'text-sky-800': 'text-info', 'text-violet-800': 'text-info',
  // backgrounds
  'bg-white': 'bg-surface',
  'bg-neutral-50': 'bg-sunken', 'bg-neutral-100': 'bg-sunken', 'bg-neutral-300': 'bg-line-strong',
  'bg-black': 'bg-overlay',                                          // bg-black/30 → bg-overlay (alpha dropped below)
  'bg-teal-50': 'bg-accent-soft',
  'bg-teal-600': 'bg-accent', 'bg-teal-700': 'bg-accent', 'bg-teal-800': 'bg-accent', 'bg-teal-900': 'bg-accent-hover',
  'bg-red-50': 'bg-danger-soft', 'bg-red-700': 'bg-danger', 'bg-red-800': 'bg-danger',
  'bg-amber-50': 'bg-warn-soft', 'bg-amber-500': 'bg-warn',
  'bg-sky-50': 'bg-info-soft', 'bg-violet-50': 'bg-info-soft',
  // borders, dividers, rings, outlines
  'border-neutral-100': 'border-line', 'border-neutral-200': 'border-line', 'border-neutral-300': 'border-line-strong', 'border-neutral-400': 'border-faint',
  'border-teal-100': 'border-accent-line', 'border-teal-200': 'border-accent-line', 'border-teal-300': 'border-accent-line', 'border-teal-700': 'border-accent',
  'border-red-400': 'border-danger', 'border-red-500': 'border-danger',
  'border-amber-100': 'border-warn-line', 'border-amber-300': 'border-warn-line', 'border-amber-400': 'border-warn',
  'border-t-teal-700': 'border-t-accent',
  'border-white': '',                                                // border-white/40 on a Kbd inside a primary button: the Kbd uses currentColor
  'divide-neutral-100': 'divide-line', 'divide-neutral-200': 'divide-line',
  'ring-neutral-200': 'ring-line', 'ring-neutral-400': 'ring-line-strong',
  'ring-teal-200': 'ring-accent-line', 'ring-teal-300': 'ring-accent-line', 'ring-teal-400': 'ring-accent-line',
  'ring-teal-600': 'ring-accent', 'ring-teal-700': 'ring-accent', 'ring-teal-800': 'ring-accent',
  'ring-red-200': 'ring-danger-line', 'ring-red-300': 'ring-danger-line',
  'ring-amber-200': 'ring-warn-line', 'ring-sky-200': 'ring-info-line',
  'outline-teal-700': 'outline-focus',
  'fill-teal-700': 'fill-accent', 'fill-amber-600': 'fill-warn', 'fill-neutral-600': 'fill-muted',
  'shadow-teal-900': '',                                             // coloured shadow on the old primary button
  // type scale: seven sizes named by their pixels
  'text-[10px]': 'text-11', 'text-[10.5px]': 'text-11', 'text-[11px]': 'text-11', 'text-[11.5px]': 'text-11',
  'text-xs': 'text-12', 'text-[12px]': 'text-12', 'text-[12.5px]': 'text-12',
  'text-[13px]': 'text-13', 'text-[13.5px]': 'text-13',
  'text-sm': 'text-14', 'text-[14px]': 'text-14',
  'text-[15px]': 'text-16', 'text-base': 'text-16',
  'text-lg': 'text-18', 'text-xl': 'text-22', 'text-2xl': 'text-22',
  // radius, shadow, layers
  'rounded': 'rounded-sm', 'shadow': 'shadow-sm', 'shadow-lg': 'shadow-md', 'shadow-xl': 'shadow-md', 'shadow-2xl': 'shadow-md',
  'z-10': 'z-raised', 'z-30': 'z-sticky', 'z-40': 'z-popover', 'z-50': 'z-popover',
  // the selected row's bar
  'shadow-[inset_3px_0_0_var(--color-teal-700)]': 'rail',
}
// alpha is kept (bg-teal-50/50 → bg-accent-soft/50) except where the token already carries it
const DROP_ALPHA = new Set(['bg-overlay', 'bg-sunken', 'border-line', ''])
// under these prefixes a neutral 50/100 background is the hover tint, not a well
const HOVERISH = /^(hover|data-\[highlighted\]|group-hover|focus-visible|active):$/

// a string that reads as a class list: lowercase utility-shaped words, at least one with a dash (eslint/tokens-only.js classy())
const classy = (s) => { const w = s.trim().split(/\s+/); return w.length > 0 && w.every((x) => /^[a-z0-9:\-[\]/.%_()#,'&>*@!=]+$/.test(x)) && w.some((x) => x.includes('-')) }
// the bare words (rounded, shadow) are also English: they are rewritten only inside a class list, never in prose. The text
// around a match is the quoted piece of the line it sits in (or the whole line inside a multi-line class list), less any ${…}.
const BARE = new Set(['rounded', 'shadow'])
const around = (line, at) => {
  const flat = line.replace(/\$\{[^}]*\}/g, (m) => ' '.repeat(m.length))     // same length, so `at` still points at the match
  let start = 0, end = flat.length
  for (let i = 0; i < flat.length; i++) if (/["'`]/.test(flat[i])) { if (i < at) start = i + 1; else { end = i; break } }
  return flat.slice(start, end)
}

const TOKEN = /(?<=^|[\s"'`{(])((?:[a-z0-9-]+(?:-\[[^\]\s]+\])?:)*)(-?)([a-z0-9]+(?:-[a-z0-9]+)*(?:-\[[^\]\s]+\])?|[a-z]+-\[[^\]\s]+\])(\/\d+)?(?=$|[\s"'`})])/g

const changes = []; const decide = []
function rewrite(file, src) {
  const lines = src.split('\n')
  return lines.map((line, i) => line.replace(TOKEN, (all, prefix, neg, base, alpha, at) => {
    if (!(base in MAP)) return all
    if (BARE.has(base) && !classy(around(line, at))) return all
    alpha ??= ''
    let to = MAP[base]
    const lastPrefix = prefix.match(/([a-z0-9-]+(?:-\[[^\]]+\])?:)$/)?.[1] ?? ''
    if ((base === 'bg-neutral-50' || base === 'bg-neutral-100') && HOVERISH.test(lastPrefix)) to = 'bg-hover'
    if (base === 'bg-neutral-50' && !prefix && /min-h-screen/.test(line)) to = 'bg-canvas'                  // the page itself
    if (base === 'z-50' && /fixed inset-0/.test(line)) to = 'z-overlay'                                   // the ⌘K scrim
    if (base === 'bg-white' && !alpha && /Menu\.Content|shadow-(lg|xl|2xl)/.test(line)) to = 'bg-raised'   // menus, the palette: raised
    if (base === 'bg-white' && /<img|qr/i.test(line)) to = 'bg-paper'                                       // a QR code stays on white
    if (base === 'bg-white' && alpha === '/20') { to = 'bg-accent-fg'; decide.push(`${file}:${i + 1} a hand-made kbd on a primary button: use <Kbd>`) }
    if (base === 'text-white' && !/bg-teal-(6|7|8|9)00/.test(line)) decide.push(`${file}:${i + 1} text-white not on a teal fill`)
    if (base === 'text-violet-800' || base === 'bg-violet-50') decide.push(`${file}:${i + 1} ${base}: the result type colour (→ info, or drop colour for a neutral kind label)`)
    const out = to === '' ? '\u0000' : `${prefix}${neg}${to}${DROP_ALPHA.has(to) || to === 'bg-hover' ? '' : alpha}`
    changes.push(`${file}:${i + 1}  ${all} → ${to === '' ? '(removed)' : out}`)
    return out
  }).replace(/ \u0000|\u0000 ?/g, '')).join('\n')
}

function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n); const s = statSync(p)
    if (s.isDirectory()) { if (!/node_modules|core\/ui$/.test(p)) walk(p) }
    else if (/\.(tsx?|jsx?)$/.test(n) && !/generated|catalog\/data\.ts$/.test(p)) {
      const src = readFileSync(p, 'utf8'); const out = rewrite(relative(root, p), src)
      if (out !== src && !dry) writeFileSync(p, out)
    }
  }
}
walk(root)
console.log(changes.join('\n'))
console.log(`\n${changes.length} classes rewritten`)
if (decide.length) console.log(`\nFor a person to decide:\n${decide.join('\n')}`)
