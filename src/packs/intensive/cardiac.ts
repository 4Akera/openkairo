// Critical care's cardiac rows (spec/openCare.md §5.6, piece I3), on where the department switches them on (unit.ts reads it): the
// heart rhythm, ectopic beats and the ST segment as the base's observations, coded in the pack's own open code system (the base's
// LOINC subset has no rows for them), and the ST elevation's fall in %; chest pain 0–10 as the vitals' pain. The chart's Heart group
// (the rhythm, heart rate, BP, chest pain, ST) and its Bloods (aPTT, troponin, potassium, magnesium from the base's values). Pure.
import type { EntryIn } from '@core/db/rpc'
import type { Concept, Quantity } from '@core/db/shapes.generated'
import type { ServerEntry, ValueRow } from '@core/db/types'
import type { Cell, Group, Row } from './chart'
import { hourOf } from './hours'
import { itemsOf, latestOf } from './items'

/** the pack's code system for the cardiac rows */
export const CARDIAC = 'intensive.cardiac'
/** each kind of row: its code and words */
export const KINDS = { rhythm: 'Heart rhythm', ectopics: 'Ectopic beats', st: 'ST segment', st_fall: 'ST elevation fall' } as const
export type CardiacKind = keyof typeof KINDS
/** [code, words, short], in the card's order */
export const RHYTHMS: [string, string, string][] = [['sr', 'Sinus rhythm', 'SR'], ['sinus_tachy', 'Sinus tachycardia', 'Sinus tachy'],
  ['sinus_brady', 'Sinus bradycardia', 'Sinus brady'], ['af', 'Atrial fibrillation', 'AF'], ['aflutter', 'Atrial flutter', 'AFL'],
  ['svt', 'Supraventricular tachycardia', 'SVT'], ['vt', 'Ventricular tachycardia', 'VT'], ['vf', 'Ventricular fibrillation', 'VF'],
  ['avb1', 'First-degree AV block', 'AVB 1'], ['avb2', 'Second-degree AV block', 'AVB 2'], ['avb3', 'Complete heart block', 'CHB'],
  ['junctional', 'Junctional rhythm', 'Junctional'], ['paced', 'Paced rhythm', 'Paced'], ['asystole', 'Asystole', 'Asystole'], ['other', 'Other rhythm', 'Other']]
export const SINUS = new Set(['sr', 'sinus_tachy', 'sinus_brady'])
export const ECTOPICS: [string, string, string][] = [['ves', 'Ventricular ectopics', 'VEs'], ['aes', 'Atrial ectopics', 'AEs']]
export const ST: [string, string, string][] = [['no_new_change', 'No new change', 'no new change'], ['resolving', 'Resolving', 'resolving'],
  ['resolved', 'Resolved', 'resolved'], ['new_elevation', 'New ST elevation', '↑ new'], ['new_depression', 'New ST depression', '↓ new']]
const LIST: Record<'rhythm' | 'ectopics' | 'st', [string, string, string][]> = { rhythm: RHYTHMS, ectopics: ECTOPICS, st: ST }
const find = (kind: 'rhythm' | 'ectopics' | 'st', code: string | undefined) => LIST[kind].find(([c]) => c === code)

type Data = Record<string, unknown>
const obj = (x: unknown): Data => x && typeof x === 'object' && !Array.isArray(x) ? x as Data : {}
const codingIn = (c: unknown) => (Array.isArray(obj(c).codings) ? obj(c).codings as Data[] : []).find((x) => x.system === CARDIAC)
const num = (x: unknown): number | null => { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; return Number.isFinite(n) ? n : null }

/** an observation's cardiac row: its kind, and its value's code (with the words typed for another rhythm) or its number */
export function cardiacOf(e: Pick<ServerEntry, 'type' | 'data'>): { kind: CardiacKind; code?: string; text?: string; value?: number } | null {
  if (e.type !== 'observation') return null
  const kind = codingIn(e.data?.code)?.code
  if (typeof kind !== 'string' || !(kind in KINDS)) return null
  const v = obj(e.data?.value)
  if (kind === 'st_fall') { const n = num(obj(v.quantity).value); return n === null ? null : { kind, value: n } }
  const code = codingIn(v.concept)?.code; const text = obj(v.concept).text
  return typeof code === 'string' ? { kind: kind as CardiacKind, code, ...(typeof text === 'string' ? { text } : {}) } : null
}

/** what the hour card holds of the cardiac rows, as typed */
export interface CardiacDraft { rhythm?: string; rhythm_text?: string; ectopics?: string; pain?: string; st?: string; st_fall?: string }
const typedNum = (s: string | undefined) => { const t = (s ?? '').trim(); return !t ? undefined : /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : NaN }
/** anything typed or chosen */
export const cardiacTouched = (d: CardiacDraft | undefined) => !!d && Object.values(d).some((v) => typeof v === 'string' && v.trim() !== '')
/** what stops the sign, under its field */
export function cardiacProblems(d: CardiacDraft | undefined): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = []; if (!d) return out
  const pain = typedNum(d.pain); if (pain !== undefined && !(Number.isInteger(pain) && pain >= 0 && pain <= 10)) out.push({ field: 'pain', text: 'Chest pain is 0 to 10' })
  const fall = typedNum(d.st_fall)
  if (fall !== undefined && (Number.isNaN(fall) || fall < 0 || fall > 100)) out.push({ field: 'st_fall', text: Number.isNaN(fall) ? 'A number' : `${fall} % is not plausible` })
  if (d.rhythm === 'other' && !d.rhythm_text?.trim()) out.push({ field: 'rhythm', text: 'Say the rhythm' })
  return out
}
/** the chest pain, for the vitals entry */
export function cardiacPain(d: CardiacDraft | undefined): Quantity | undefined {
  const n = typedNum(d?.pain); return n === undefined || Number.isNaN(n) ? undefined : { value: String(n), unit: '/10', ucum: '{score}' }
}
const concept = (code: string, text: string): Concept => ({ text, codings: [{ system: CARDIAC, code, display: text }] })
/** the hour's cardiac observations, each the base's observation in the pack's system; nothing for a blank */
export function cardiacEntries(d: CardiacDraft | undefined, where: { patientId: string; departmentId: string; stay: string }, id: () => string, at: string): EntryIn[] {
  if (!d) return []
  const base = { patient_id: where.patientId, department_id: where.departmentId, visit_id: where.stay, occurred_at: at, precision: 'minute' }
  const out: EntryIn[] = []
  const word = (kind: 'rhythm' | 'ectopics' | 'st', code: string | undefined) => {
    const w = find(kind, code); if (!w) return
    const text = kind === 'rhythm' && code === 'other' ? d.rhythm_text?.trim() || w[1] : w[1]
    out.push({ id: id(), ...base, type: 'observation', data: { code: concept(kind, KINDS[kind]), value: { concept: concept(w[0], text) } } })
  }
  word('rhythm', d.rhythm); word('ectopics', d.ectopics); word('st', d.st)
  const fall = typedNum(d.st_fall)
  if (fall !== undefined && !Number.isNaN(fall)) out.push({ id: id(), ...base, type: 'observation', data: { code: concept('st_fall', KINDS.st_fall), value: { quantity: { value: String(fall), unit: '%', ucum: '%' } } } })
  return out
}

/** the Bloods: their codes in base.values, words and units */
const BLOODS: [string, string, string, string][] = [['aptt', 'loinc:3173-2', 'aPTT', 's'], ['trop', 'loinc:10839-9', 'Troponin I', 'ng/mL'],
  ['k', 'loinc:2823-3', 'Potassium', 'mmol/L'], ['mg', 'loinc:19123-9', 'Magnesium', 'mmol/L']]
const flagOf = (i: string | null): Cell['flag'] => i === 'L' || i === 'LL' ? 'low' : i === 'H' || i === 'HH' ? 'high' : undefined
export interface CardiacInput { entries: readonly ServerEntry[]; values: readonly ValueRow[]; hours: string[]; needleAt: string | null
  /** the unit's heparin target: the aPTT is flagged against it, else by its interpretation like the other bloods */
  heparin: { low: number; high: number } | null; hr: Row | null; bp: Row | null }

/** the Heart group (rhythm, heart rate, BP, chest pain, ST) and the Bloods */
export function cardiacGroups(x: CardiacInput): Group[] {
  const index = new Map(x.hours.map((h, i) => [h, i])); const col = (iso: string) => index.get(hourOf(iso))
  // each hour's latest of each cardiac kind, and every rhythm in time order (for "new")
  const at = x.hours.map(() => new Map<CardiacKind, { code?: string; text?: string; value?: number; at: string }>())
  const pain = x.hours.map((): { v: number; at: string } | null => null)
  // another rhythm is told apart by its words, so two different "other" rhythms are a change
  const same = (c: { code?: string; text?: string }) => c.code === 'other' ? `other:${c.text ?? ''}` : c.code ?? ''
  const rhythms: { at: string; code: string }[] = []
  for (const it of itemsOf(x.entries)) {
    const e = latestOf(it)
    if (it.type === 'vitals') { const p = num(obj(obj(e.data).pain).value); const i = col(e.occurred_at)
      if (p !== null && i !== undefined && (!pain[i] || pain[i]!.at <= e.occurred_at)) pain[i] = { v: p, at: e.occurred_at }; continue }
    const c = cardiacOf(e); if (!c) continue
    if (c.kind === 'rhythm' && c.code) rhythms.push({ at: e.occurred_at, code: same(c) })
    const i = col(e.occurred_at); if (i === undefined) continue
    const was = at[i].get(c.kind); if (!was || was.at <= e.occurred_at) at[i].set(c.kind, { ...c, at: e.occurred_at })
  }
  rhythms.sort((a, b) => a.at.localeCompare(b.at))
  const rhythm: Row = { key: 'rhythm', label: 'Rhythm', cells: at.map((m): Cell | null => {
    const r = m.get('rhythm'); if (!r?.code) return null
    const w = find('rhythm', r.code); let text = r.code === 'other' ? r.text ?? 'Other' : w?.[2] ?? r.code
    const ect = m.get('ectopics'); const e = find('ectopics', ect?.code); if (e) text += ` · ${e[2]}`
    const before = [...rhythms].reverse().find((y) => y.at < r.at)
    if (before && before.code !== same(r)) text += ' · new'
    return { text }
  }) }
  const chest: Row = { key: 'pain', label: 'Chest pain', unit: '0–10', cells: pain.map((p) => p ? { text: String(p.v) } : null) }
  const st: Row = { key: 'st', label: 'ST', cells: at.map((m): Cell | null => {
    const fall = m.get('st_fall')
    if (fall?.value !== undefined) {
      const after = x.needleAt ? Math.round((Date.parse(fall.at) - Date.parse(x.needleAt)) / 60_000) : null
      return { text: `↓ ${fall.value} %${after !== null && after >= 0 ? ` at ${after} min` : ''}` }
    }
    const w = find('st', m.get('st')?.code); return w ? { text: w[2] } : null
  }) }
  const heart: Group = { key: 'heart', title: 'Heart', rows: [rhythm, ...(x.hr ? [x.hr] : []), ...(x.bp ? [x.bp] : []), chest, st] }
  // the bloods: the latest value of each in its hour
  const rows = BLOODS.map(([key, code, label, unit]): Row => {
    const best = x.hours.map((): ValueRow | null => null)
    for (const v of x.values) { if (v.code !== code) continue; const i = col(v.at); if (i !== undefined && (!best[i] || best[i]!.at <= v.at)) best[i] = v }
    return { key, label, unit, cells: best.map((v): Cell | null => {
      if (!v) return null
      const n = Number(v.value)
      // the target's seconds are whole, as the table's steps: 70.5 is still in 50–70's step, so high starts at 71
      const flag = key === 'aptt' && x.heparin ? (n < x.heparin.low ? 'low' as const : n >= x.heparin.high + 1 ? 'high' as const : undefined) : flagOf(v.interpretation)
      return { text: String(n), ...(flag ? { flag } : {}) }
    }) }
  })
  return [heart, { key: 'bloods', title: 'Bloods', rows }]
}
