// Emergency's two triage scales (spec/openCare.md §5.6): the same five levels and words on both, each level with its time to the
// doctor. The Australasian Triage Scale (ACEM P06) is the clinic's by default; the Manchester Triage System (3rd edition) the other,
// its five categories and times only. A triage keeps the scale it was made on; the clinic's setting changes only new triages. The
// versions are the ones migration 18 declares for the two code systems, written on each triage. Pure: npm run test:casualty.
import { settingIn } from '@core/screens/settings/form/model'
import type { Organization } from '@core/db/types'

export type Scale = 'ats' | 'mts'
export type Level = 1 | 2 | 3 | 4 | 5
export const LEVELS: Level[] = [1, 2, 3, 4, 5]
export const LEVEL_WORDS: Record<Level, string> = { 1: 'Immediate', 2: 'Very urgent', 3: 'Urgent', 4: 'Standard', 5: 'Non-urgent' }
/** each scale: its name, its edition (the code system's version) and the minutes to the doctor at each level */
export const SCALES: Record<Scale, { name: 'Australasian' | 'Manchester'; version: string; minutes: Record<Level, number> }> = {
  ats: { name: 'Australasian', version: 'P06', minutes: { 1: 0, 2: 10, 3: 30, 4: 60, 5: 120 } },
  mts: { name: 'Manchester', version: '3', minutes: { 1: 0, 2: 10, 3: 60, 4: 120, 5: 240 } },
}

export const isLevel = (n: unknown): n is Level => typeof n === 'number' && LEVELS.includes(n as Level)
export const isScale = (s: unknown): s is Scale => s === 'ats' || s === 'mts'
/** "2 · Very urgent" */
export const levelWord = (n: Level) => `${n} · ${LEVEL_WORDS[n]}`
/** a level's state colour: 1–2 danger, 3 warn, 4–5 none (the word always says it) */
export const toneOf = (n: Level): 'danger' | 'warn' | undefined => n <= 2 ? 'danger' : n === 3 ? 'warn' : undefined
/** the minutes to the doctor at a level, on a scale */
export const targetOf = (s: Scale, n: Level) => SCALES[s].minutes[n]
/** "doctor at once" for a level with no minutes, else "doctor within 10 min" */
export const timeWords = (s: Scale, n: Level) => { const m = targetOf(s, n); return m === 0 ? 'doctor at once' : `doctor within ${m} min` }
/** the clinic's scale (its setting; the Australasian until it is changed) */
export const scaleOf = (org: Organization | undefined): Scale => { const s = settingIn(org, 'casualty.scale', org?.organization.id).scale; return isScale(s) ? s : 'ats' }
