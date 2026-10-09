// The ward's answer to NEWS2 (spec/openCare.md §5.6, W1): five levels, decided as the server decides them (bedside.level) — 7 or more,
// 5–6, a 3 in any one sign, 0, else 1–4 — and for each, how often the obs are due and whom to tell, from the department's setting
// bedside.response (RCP 2017 as its defaults; a level the ward saves replaces RCP's whole). From them, the line under the cards once the
// server has added NEWS2 up: RCP's words for the level, then when the next obs are due. Pure: npm run test:ward2.
import type { Ctx } from '@core/screens/visit/parse'
import { tableOf, type ScoreParams } from '@core/screens/visit/score'
import { settingIn } from '@core/screens/settings/form/model'
import { hm, ymd } from '@core/ui/time'
import type { ObsNote } from './line'

export type Level = 'zero' | 'low' | 'single' | 'medium' | 'high'
export const LEVELS: readonly Level[] = ['zero', 'low', 'single', 'medium', 'high']
export interface Rule { every: number; tell?: string }
export type Rules = Record<Level, Rule>
/** RCP 2017, as bedside.rcp_response() and the setting's shape say it */
export const RCP_2017: Rules = { zero: { every: 720 }, low: { every: 240, tell: 'the nurse in charge' }, single: { every: 60, tell: 'the doctor caring for the patient' },
  medium: { every: 60, tell: 'the doctor now' }, high: { every: 30, tell: 'the doctor now · think of ICU' } }
/** the server's rule (bedside.level): the band first, then a 3 in any one sign, then 0, else low */
export const levelOf = (total: number, band: string | undefined, threes: number): Level =>
  band === 'high' ? 'high' : band === 'medium' ? 'medium' : threes > 0 ? 'single' : total === 0 ? 'zero' : 'low'
const okEvery = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 15 && (n as number) <= 1440
/** the ward's rules: each level as saved, else the shape's defaults (settingIn), else RCP's; a level saved with no tell has none */
export function rulesIn(org: Parameters<typeof settingIn>[0], departmentId: string | null | undefined): Rules {
  const s: Partial<Record<Level, Partial<Rule>>> = settingIn(org, 'bedside.response', departmentId)
  const out = {} as Rules
  for (const k of LEVELS) {
    const r = s[k]; const tell = r ? r.tell?.trim() : RCP_2017[k].tell
    out[k] = { every: okEvery(r?.every) ? r.every : RCP_2017[k].every, ...(tell ? { tell } : {}) }
  }
  return out
}
/** "every 30 min", "every hour", "every 4 hours", "every 1 h 30 min" */
export const everyWords = (min: number) => min % 60 ? (min < 60 ? `every ${min} min` : `every ${Math.floor(min / 60)} h ${min % 60} min`)
  : min === 60 ? 'every hour' : `every ${min / 60} hours`
/** "15:06", or "tomorrow 01:30" when it falls on the next clinic day (every is at most 24 h); a time due a moment before midnight and
 *  read just after it is still not yet overdue (under a minute): its time alone, never "tomorrow" */
export function dueTime(due: number, now: number): string {
  const iso = new Date(due).toISOString(); return `${ymd(iso) > ymd(new Date(now).toISOString()) ? 'tomorrow ' : ''}${hm(iso)}`
}
/** the line under the cards, once the server has added NEWS2 up: the ward's response for its level, in RCP's words ("at least",
 *  "watch continuously"), then when the next obs are due from now */
export function ruleNote(p: ScoreParams, ctx: Pick<Ctx, 'scores'>, rules: Rules, now: number): ObsNote {
  const r = p.result!; const t = r.total ?? 0; const threes = r.items.filter((i) => i.points === 3)
  const level = levelOf(t, r.band?.key, threes.length); const rule = rules[level]; const obs = `obs at least ${everyWords(rule.every)}`
  const then = `${rule.tell ? `; tell ${rule.tell}` : ''} · next obs due ${dueTime(now + rule.every * 60_000, now)}`
  switch (level) {
    case 'high': return { text: `NEWS2 ${t} · high · emergency response: watch continuously (${obs})${then}`, tone: 'danger' }
    case 'medium': return { text: `NEWS2 ${t} · medium · urgent response: ${obs}${then}`, tone: 'warn' }
    case 'single': { const table = tableOf(ctx.scores, p.score, p.version)
      return { text: `3 in one sign (${threes.map((i) => table?.items.find((x) => x.key === i.key)?.labels.en || i.key).join(', ')}) · ${obs}${then}`, tone: 'warn' } }
    case 'zero': return { text: `NEWS2 0 · ${obs}${then}` }
    default: return { text: `NEWS2 ${t} · low · ${obs}${then}` }
  }
}
// the composer's note reaches the ward's rules through a hook the app sets (ward2.ts), since its Ctx carries no settings; unset (the
// node tests), none: the note keeps RCP's own words
let rulesHook: (departmentId: string) => Rules | undefined = () => undefined
export function setRulesHook(h: (departmentId: string) => Rules | undefined) { rulesHook = h }
export function useWardRules(departmentId: string): Rules | undefined { return rulesHook(departmentId) }
