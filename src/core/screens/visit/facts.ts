// The base facts the banner shows in every department (spec/openCare.md §5.1 rule 3), written from the composer like any line:
//   /preg · /preg 12w · /preg lmp 2026-08-01 · /preg no · /preg end delivered     pregnant or not (an LMP or the weeks), or its end
//   /bf · /bf no · /bf end                                                        breastfeeding or not, or its end
//   /alert dnr · /alert hbv · /alert hcv · /alert fall · /alert <words> · /alert end dnr    a base alert, or its end (never naming HIV)
// A fact already standing is changed by the new line (one current pregnancy, one breastfeeding); ending changes it once. Pure: the
// commands are registered in parse.ts with core's others, the cards are FactCards.tsx.
import type { Organization, ServerEntry } from '../../db/types'
import { ALERT_KINDS, alertWord, breastfeedingOf, namesHiv, pregnancyOf, pregnancyWords, type AlertKind } from '../chart/model/facts'
import { alertsOf } from '../chart/model/record'
import type { Ctx, Parsed, Result } from './parse'

/** a fact standing now: its latest entry (an end or a change refers to it), its data, its words */
export interface Standing { entry_id: string; data: Record<string, unknown>; words: string; code?: string | null }
export interface StandingFacts { pregnancy: Standing | null; breastfeeding: Standing | null; alerts: Standing[] }
export const NO_FACTS: StandingFacts = { pregnancy: null, breastfeeding: null, alerts: [] }
/** this patient's standing facts, from the facts page */
export function standingOf(facts: ServerEntry[] | undefined, types: Organization['types'] | undefined, today: string, now?: Date): StandingFacts {
  const p = pregnancyOf(facts, types, today); const b = breastfeedingOf(facts, types)
  return { pregnancy: p ? { entry_id: p.entry.id, data: { ...p.data }, words: pregnancyWords(p) } : null,
    breastfeeding: b ? { entry_id: b.entry.id, data: { ...b.data }, words: b.breastfeeding ? 'Breastfeeding' : 'Not breastfeeding' } : null,
    alerts: alertsOf(facts ?? [], types, now).active.map((a) => ({ entry_id: a.entry.id, data: a.entry.data ?? {}, words: alertWord(a.text, a.code), code: a.code })) }
}

const NO = /^(no|not|n|neg|negative)$/i; const YES = /^(yes|y|pos|positive|pregnant|breastfeeding)$/i; const END = /^end(ed)?$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/
/** a real day (YYYY-MM-DD): 2025-02-30 and 2025-13-01 are not */
export const isDay = (v: string) => { if (!DAY.test(v)) return false; const t = Date.parse(`${v}T00:00Z`); return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v }
/** the word on a draft's badge */
export const KIND = { pregnancy: 'pregnancy', breastfeeding: 'feeding', alert: 'alert' } as const
const end = (fn: 'pregnancy' | 'breastfeeding' | 'alert', s: Standing, reason: string | null): Parsed =>
  ({ function: fn, kind: KIND[fn], params: { action: 'end', entry_id: s.entry_id, was: s.data, words: s.words, reason }, line: '' })
const lined = (p: Parsed): Result => ({ ok: [{ ...p, line: factLine(p) }] })

export function pregnancy(rest: string, ctx: Pick<Ctx, 'facts'>): Result {
  const ws = rest.trim().split(/\s+/).filter(Boolean); const now = ctx.facts?.pregnancy ?? null
  if (END.test(ws[0] ?? '')) return now ? lined(end('pregnancy', now, ws.slice(1).join(' ') || null)) : { error: 'No pregnancy is recorded to end' }
  let pregnant = true; let weeks: number | null = null; let lmp: string | null = null
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i].toLowerCase(); const m = w.match(/^(\d{1,2})(w|wk|wks|weeks?)?$/)
    if (NO.test(w)) pregnant = false
    else if (YES.test(w)) continue
    else if (w === 'lmp' && DAY.test(ws[i + 1] ?? '')) lmp = ws[++i]
    else if (DAY.test(w)) lmp = w
    else if (m && (m[2] || /^(w|wk|wks|weeks?)$/i.test(ws[i + 1] ?? ''))) { weeks = Number(m[1]); if (!m[2]) i++ }
    else return { error: `“${ws[i]}”: try /preg 12w · /preg lmp 2026-08-01 · /preg no · /preg end delivered` }
  }
  if (!pregnant && (weeks != null || lmp)) return { error: 'Not pregnant takes no dates' }
  if (weeks != null && lmp) return { error: 'The LMP or the weeks, not both' }
  if (lmp && !isDay(lmp)) return { error: `${lmp} is not a day` }
  return lined({ function: 'pregnancy', kind: KIND.pregnancy, params: { action: 'record', pregnant, weeks, lmp, entry_id: now?.entry_id ?? null }, line: '' })
}

export function breastfeeding(rest: string, ctx: Pick<Ctx, 'facts'>): Result {
  const w = rest.trim().toLowerCase(); const now = ctx.facts?.breastfeeding ?? null
  if (END.test(w)) return now ? lined(end('breastfeeding', now, null)) : { error: 'No breastfeeding is recorded to end' }
  if (w && !NO.test(w) && !YES.test(w)) return { error: `“${rest.trim()}”: try /bf · /bf no · /bf end` }
  return lined({ function: 'breastfeeding', kind: KIND.breastfeeding, params: { action: 'record', breastfeeding: !NO.test(w), entry_id: now?.entry_id ?? null }, line: '' })
}

const KIND_WORDS: [RegExp, AlertKind][] = [[/^(dnr|do not resuscitate|dnar)$/i, 'dnr'], [/^(isolation )?(hbv|hep(atitis)? ?b)$/i, 'isolation_hbv'],
  [/^(isolation )?(hcv|hep(atitis)? ?c)$/i, 'isolation_hcv'], [/^(falls?|fall risk)$/i, 'fall_risk']]
export const kindOf = (words: string): AlertKind | null => KIND_WORDS.find(([re]) => re.test(words.trim()))?.[1] ?? null
export const kindWord = (k: string) => ALERT_KINDS.find(([key]) => key === k)?.[1] ?? 'Other'
const HIV = 'An alert shows in every department, so it never names HIV or AIDS — standard precautions need no alert'

export function alert(rest: string, ctx: Pick<Ctx, 'facts'>): Result {
  const t = rest.trim(); const ws = t.split(/\s+/)
  if (END.test(ws[0] ?? '')) {
    const which = ws.slice(1).join(' '); const all = ctx.facts?.alerts ?? []; const k = which ? kindOf(which) : null
    const hit = !which ? (all.length === 1 ? all[0] : null) : all.find((a) => (k && a.code === `local.alert:${k}`) || a.words.toLowerCase().includes(which.toLowerCase()))
    if (!all.length) return { error: 'No alert is standing to end' }
    return hit ? lined(end('alert', hit, null)) : { error: `Which alert? ${all.map((a) => `/alert end ${a.words.toLowerCase()}`).join(' · ')}` }
  }
  if (namesHiv(t)) return { error: HIV }
  if (!t) return null
  const k = kindOf(t)
  return lined({ function: 'alert', kind: KIND.alert, params: { action: 'add', kind: k ?? 'other', text: k ? kindWord(k) : t[0].toUpperCase() + t.slice(1) }, line: '' })
}

/** the empty cards: a fresh fact, or the standing one changed */
export const emptyPregnancy = (ctx: Pick<Ctx, 'facts'>): Parsed[] => [{ function: 'pregnancy', kind: KIND.pregnancy, action: 'write:pregnancy', line: 'Pregnant', params: { action: 'record', pregnant: true, weeks: null, lmp: null, entry_id: ctx.facts?.pregnancy?.entry_id ?? null } }]
export const emptyBreastfeeding = (ctx: Pick<Ctx, 'facts'>): Parsed[] => [{ function: 'breastfeeding', kind: KIND.breastfeeding, action: 'write:breastfeeding', line: 'Breastfeeding', params: { action: 'record', breastfeeding: true, entry_id: ctx.facts?.breastfeeding?.entry_id ?? null } }]
export const emptyAlert = (): Parsed[] => [{ function: 'alert', kind: KIND.alert, action: 'write:alert', line: 'Alert', params: { action: 'add', kind: null, text: '' } }]

type Q = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** a fact draft's one line, from its fields */
export function factLine(p: Pick<Parsed, 'function' | 'params'>): string {
  const q = p.params as Q
  if (q.action === 'end') return p.function === 'alert' ? `End alert: ${q.words}` : `End: ${q.words}${q.reason ? ` — ${q.reason}` : ''}`
  if (p.function === 'pregnancy') return [pregnancyWords({ pregnant: !!q.pregnant, weeks: q.pregnant ? q.weeks ?? null : null }), q.pregnant && q.lmp ? `LMP ${q.lmp}` : null].filter(Boolean).join(' · ')
  if (p.function === 'breastfeeding') return q.breastfeeding ? 'Breastfeeding' : 'Not breastfeeding'
  return q.text ? `Alert: ${q.text}` : 'Alert'
}
/** what a fact draft still needs before it can be added */
export function factMissing(p: Pick<Parsed, 'function' | 'params'>, today: string): string | null {
  const q = p.params as Q
  if (q.action === 'end') return null
  if (p.function === 'alert') return !String(q.text ?? '').trim() ? 'Say what the alert is' : namesHiv(q.text) ? HIV : null
  if (p.function !== 'pregnancy' || !q.pregnant) return null
  if (q.weeks != null && (!Number.isInteger(q.weeks) || q.weeks < 0 || q.weeks > 45)) return 'Weeks are 0 to 45'
  if (q.lmp && (!isDay(q.lmp) || q.lmp > today)) return 'The LMP is a day, not after today'
  return null
}
