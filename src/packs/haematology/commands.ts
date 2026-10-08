// Haematology's words on the line (spec/openCare.md §5.7), where the department ticks the pack: /inr (today's INR, the base's result with no
// order, and the INR clinic's week), /inrplan (the reason and the target), /programme (a transfusion programme). Pure.
import { registerCommand } from '@core/screens/visit/commands'
import type { ReactNode } from 'react'
import type { Ctx, Parsed, Result } from '@core/screens/visit/parse'
import { total } from './inr'

const ymd = (d: Date) => d.toISOString().slice(0, 10)
/** today's INR as the base's result: no order, LOINC 6301-6, against the patient's target, by finger prick unless said */
export function inrResult(inr: number, target: { low: number; high: number } | null, method = 'finger prick'): Record<string, unknown> {
  return { status: 'final', code: { text: `INR · ${method}`, codings: [{ system: 'loinc', code: '6301-6', display: 'INR' }] },
    analytes: [{ key: 'inr', name: 'INR', code: { system: 'loinc', code: '6301-6', display: 'INR' }, value: { value: String(inr) }, method,
      ...(target ? { interpretation: inr < target.low ? 'L' : inr > target.high ? 'H' : 'N', range: { low: { value: String(target.low) }, high: { value: String(target.high) } } } : {}) }] }
}
export interface WeekParams { days: number[]; was?: number; inr?: number; missed?: string; food?: string; bleeding?: string; suggested?: number; used_suggestion?: boolean; next_inr?: string }
export const weekLine = (q: WeekParams) => `Warfarin · ${total(q.days)} mg a week${q.was != null && q.was !== total(q.days) ? `, was ${q.was}` : ''}${q.next_inr ? ` · next INR ${q.next_inr}` : ''}`
/** /inr 1.7 [lab] → the result and the week (the week starts as it stands; the card shows the clinic's suggestion and the doctor decides) */
export function parseInr(rest: string, week: number[] | null, target: { low: number; high: number } | null, now = new Date()): Result {
  const w = rest.trim().toLowerCase().split(/\s+/).filter(Boolean); if (!w.length) return null
  const n = Number(w[0].replace(',', '.')); if (!Number.isFinite(n) || n < 0.5 || n > 15) return { error: 'Type the INR: /inr 1.7' }
  const method = w.includes('lab') ? 'laboratory' : 'finger prick'
  const days = week ?? [0, 0, 0, 0, 0, 0, 0]; const next = new Date(now.getTime() + 7 * 86_400_000)
  const q: WeekParams = { days, was: total(days), inr: n, missed: 'none', food: 'as usual', bleeding: 'none', next_inr: ymd(next) }
  return { ok: [{ function: 'result', kind: 'result', params: inrResult(n, target, method), line: `INR ${n} · ${method}${target ? ` · target ${target.low}–${target.high}` : ''}` },
    { function: 'haematology.week', kind: 'week', params: q as unknown as Record<string, unknown>, line: weekLine(q) }] }
}
/** /inrplan af rheumatic ms ; 2-3 warfarin 5 */
export function parsePlan(rest: string): Result {
  const [reason, more = ''] = rest.split(';').map((x) => x.trim()); if (!reason) return null
  const t = more.match(/(\d(?:\.\d)?)\s*[-–]\s*(\d(?:\.\d)?)/); const tab = more.match(/\b(\d(?:\.\d)?)\s*(?:mg)?\s*$/)
  const target = t ? { low: Number(t[1]), high: Number(t[2]) } : { low: 2, high: 3 }
  if (target.low >= target.high) return { error: 'The target is from–to: 2-3' }
  const p: Parsed = { function: 'haematology.plan', kind: 'plan', params: { reason, target, medicine: /warfarin|marevan/i.test(more) || !more ? 'warfarin' : more.replace(t?.[0] ?? '', '').trim() || 'warfarin',
    tablet_mg: tab && !t?.[0].endsWith(tab[1]) ? Number(tab[1]) : 5, status: 'active' }, line: `INR clinic · ${reason} · target ${target.low}–${target.high}` }
  return { ok: [p] }
}
const NEEDS: Record<string, string> = { leuco: 'leucodepleted', leucodepleted: 'leucodepleted', kell: 'Rh and Kell matched', irradiated: 'irradiated', washed: 'washed' }
/** /programme every 3 weeks hb 9.5-10.5 leuco kell ; thalassaemia major */
export function parseProgramme(rest: string): Result {
  const [main, condition] = rest.split(';').map((x) => x.trim()); if (!main) return null
  const every = main.match(/every\s+(\d+)/i); const hb = main.match(/hb\s*(\d+(?:\.\d)?)\s*[-–]\s*(\d+(?:\.\d)?)/i)
  if (!every || !hb) return { error: 'Type: every 3 weeks hb 9.5-10.5 leuco kell' }
  const needs = [...new Set(main.toLowerCase().split(/\s+/).flatMap((w) => NEEDS[w] ? [NEEDS[w]] : []))]
  const params = { every_weeks: Number(every[1]), hb: { low: Number(hb[1]), high: Number(hb[2]) }, needs, ...(condition ? { condition } : {}), status: 'active' }
  return { ok: [{ function: 'haematology.programme', kind: 'programme', params, line: `Transfusion programme · every ${every[1]} weeks · Hb before ${hb[1]}–${hb[2]}${needs.length ? ` · ${needs.join(', ')}` : ''}` }] }
}

/** the card reads her week and target once her entries are read (the line is pure: it starts the week empty, the card fills it) */
export function registerCommands(inrNote?: (items: Parsed[], ctx: Ctx) => ReactNode) {
  registerCommand({ name: 'inr', pack: 'haematology', title: 'INR', label: 'INR clinic — today\'s INR and the week', example: '/inr 1.7 · /inr 2.4 lab', action: 'write:haematology.week', writes: ['result', 'haematology.week'],
    parse: (rest) => parseInr(rest, null, null), ...(inrNote ? { note: inrNote } : {}) })
  registerCommand({ name: 'inrplan', pack: 'haematology', title: 'INR plan', label: 'INR clinic — the reason and the target', example: '/inrplan AF with rheumatic mitral stenosis ; 2-3 warfarin 5',
    action: 'write:haematology.plan', writes: ['haematology.plan'], parse: (rest) => parsePlan(rest) })
  registerCommand({ name: 'programme', pack: 'haematology', title: 'Transfusion programme', label: 'A transfusion programme — every, the Hb before, what the red cells need', example: '/programme every 3 weeks hb 9.5-10.5 leuco kell ; thalassaemia major',
    action: 'write:haematology.programme', writes: ['haematology.programme'], parse: (rest) => parseProgramme(rest) })
}
