// Tones, flags and class merging (design-system.md §4.1). Pure: no window, so a node test may import it directly.
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// the stock merge reads text-13 as a text colour and drops it beside text-muted; taught the scale, it keeps both and still merges
// real conflicts (text-12 text-14 → text-14, z-sticky z-overlay → z-overlay)
const merge = extendTailwindMerge<'rail'>({ extend: {
  theme: { text: ['11', '12', '13', '14', '16', '18', '22'] },                    // font sizes, not colours
  classGroups: { z: [{ z: ['raised', 'sticky', 'popover', 'overlay', 'toast'] }], duration: [{ duration: ['fast', 'base', 'slow'] }], rail: ['rail', 'rail-danger'] },
} })
export const cn = (...i: ClassValue[]) => merge(clsx(i))

export type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'info'
/** no tone is neutral (the old names brand, red, amber, blue and green are gone: build plan step 4) */
export const toTone = (t: Tone | null | undefined): Tone => t ?? 'neutral'
/** the classes of a tone, for a pack or a kit component that needs them in a map */
export const TONE: Record<Tone, { text: string; soft: string; line: string; solid: string; onSolid: string }> = {
  neutral: { text: 'text-muted',  soft: 'bg-sunken',      line: 'ring-line',        solid: 'bg-line-strong', onSolid: 'text-fg' },
  accent:  { text: 'text-accent', soft: 'bg-accent-soft', line: 'ring-accent-line', solid: 'bg-accent',      onSolid: 'text-accent-fg' },
  danger:  { text: 'text-danger', soft: 'bg-danger-soft', line: 'ring-danger-line', solid: 'bg-danger',      onSolid: 'text-danger-fg' },
  warn:    { text: 'text-warn',   soft: 'bg-warn-soft',   line: 'ring-warn-line',   solid: 'bg-warn',        onSolid: 'text-warn-fg' },
  ok:      { text: 'text-ok',     soft: 'bg-ok-soft',     line: 'ring-ok-line',     solid: 'bg-ok',          onSolid: 'text-ok-fg' },
  info:    { text: 'text-info',   soft: 'bg-info-soft',   line: 'ring-info-line',   solid: 'bg-info',        onSolid: 'text-info-fg' },
}

export type Flag = 'normal' | 'low' | 'high' | 'abnormal' | 'critical'
/** a value's flag as text classes: same name, same meaning as before, tokens inside */
export const flagClass = (f: string | null | undefined) => f === 'critical' ? 'text-danger font-semibold' : f === 'low' || f === 'high' || f === 'abnormal' ? 'text-warn' : 'text-muted'
export const flagTone = (f: string | null | undefined): Tone => f === 'critical' ? 'danger' : f === 'low' || f === 'high' || f === 'abnormal' ? 'warn' : 'neutral'
/** the glyph that goes with the colour, always (colour alone fails colour-blind readers) */
export const flagMark = (f: string | null | undefined) => ({ low: '↓', high: '↑', critical: '‼', abnormal: '*' } as Record<string, string>)[f ?? ''] ?? ''
export const flagWord = (f: string | null | undefined) => ({ low: 'Low', high: 'High', critical: 'Critical', abnormal: 'Abnormal' } as Record<string, string>)[f ?? ''] ?? ''
/** a result analyte's own interpretation keeps the direction the Flag loses (views.ts interp() maps LL, HH and AA all to 'critical') */
export const interpMark = (i: string | null | undefined) => ({ L: '↓', H: '↑', LL: '↓‼', HH: '↑‼', A: '*', AA: '‼', POS: '+' } as Record<string, string>)[i ?? ''] ?? ''
export const interpWord = (i: string | null | undefined) => ({ L: 'Low', H: 'High', LL: 'Critically low', HH: 'Critically high', A: 'Abnormal', AA: 'Critical', POS: 'Positive', NEG: 'Negative', N: 'Normal' } as Record<string, string>)[i ?? ''] ?? ''
/** the change against the value before: a trend, never a flag, so it never uses the flag arrows (a normal rising value is not "High") */
export const trendMark = (now: number | null | undefined, before: number | null | undefined) => now == null || before == null ? '' : now > before ? '↗' : now < before ? '↘' : '→'
/** moved from Settings.tsx as it is: titles (Dr, Prof, Mr, Mrs, Ms) are skipped, so "Dr. Ali Hassan" is AH */
export const initials = (name: string) => name.split(/\s+/).filter((w) => w && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
