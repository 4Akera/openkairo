// The record panel's lists (chart-plan.md §3.2): problems, medicines, allergies and alerts, history, what is still waiting, visits and
// stays — from the one record read (every derived table with its source entries) and the facts page. Clinical dates come from the
// entries (occurred_at, partial dates) in the clinic's zone, never from a cut ISO string. Pure.
import type { Allergy, Flag, ListRowData, Medication, OrderRow, Organization, PresenceRow, Problem, ReviewRow, ServerEntry, ServerRecord, TableRead } from '../../../db/types'
import type { Concept, EntryData } from '../../../db/shapes.generated'
import { allergyOf, dataOf, flagOfResult, listReviewOf, medicationOf, nameOf, problemOf, stepOf, userName } from '../../../db/views'
import { ymd } from '../../../ui/time'
import { baseOf, isForMe } from './items'
import { startOf, stayDay } from './encounter'
import { FAMILY_HISTORY, FREQUENCY, PRESENCE_STATE, PROBLEM_STATUS, ROUTE, SOCIAL_HISTORY, stepWord } from './labels'

/** who reads, and where: the reads are made in the chart's department, never the entry's */
export interface ChartCtx { org?: Organization; me: string; departmentId: string; now?: Date }
export type Rec = Pick<ServerRecord, 'tables' | 'hidden'>
type Types = Organization['types'] | undefined
const NONE = { rows: [], entries: {}, patients: {}, withheld: 0 }
const listsOf = (rec: Rec): TableRead<ListRowData> => rec.tables['base.lists'] ?? NONE
const versionsOf = (t: TableRead<ListRowData>, x: ListRowData) => x.source_entries.map((id) => t.entries[id]).filter((e): e is ServerEntry => !!e).sort((a, b) => a.item_version - b.item_version)
const dateOf = (e: ServerEntry | undefined, fallback: string) => ymd(e?.occurred_at ?? fallback)
const codeOf = (c: Concept | undefined) => { const x = c?.codings?.[0]; return x ? `${x.system}:${x.code}` : null }
const OPEN = new Set(['active', 'in-progress', 'on-hold'])

// ── problems ──
const ACTIVE = new Set(['active', 'recurrence', 'relapse'])
export interface ProblemRow extends Problem { first_at: string; changed_at: string; visit_id: string | null; listed_on: string; resolved_on: string | null; diagnosis: boolean; status_word: string }
/** active (chronic ones first: an onset known, the oldest first; then the newest), past (resolved on, newest first), and the encounter
 *  diagnoses (base.lists' own list, so no row is dropped) */
export function problemsOf(rec: Rec, ctx: ChartCtx) {
  const t = listsOf(rec); const types = ctx.org?.types
  const rows = t.rows.filter((x) => x.list === 'problems' || x.list === 'diagnoses').map((x): ProblemRow => {
    const p = problemOf(x, t.entries[x.entry_id], types)
    return { ...p, first_at: x.first_at, changed_at: x.changed_at, visit_id: x.visit_id, listed_on: dateOf(versionsOf(t, x)[0], x.first_at), diagnosis: x.list === 'diagnoses',
      resolved_on: ACTIVE.has(p.status) ? null : p.data?.abatement?.value ?? dateOf(t.entries[x.entry_id], x.changed_at), status_word: PROBLEM_STATUS[p.status] ?? p.status }
  })
  const active = rows.filter((p) => !p.diagnosis && ACTIVE.has(p.status))
    .sort((a, b) => Number(!a.onset_on) - Number(!b.onset_on) || (a.onset_on && b.onset_on ? a.onset_on.localeCompare(b.onset_on) : b.first_at.localeCompare(a.first_at)))
  const past = rows.filter((p) => !p.diagnosis && !ACTIVE.has(p.status)).sort((a, b) => (b.resolved_on ?? '').localeCompare(a.resolved_on ?? ''))
  const diagnoses = rows.filter((p) => p.diagnosis).sort((a, b) => b.first_at.localeCompare(a.first_at))
  return { active, past, diagnoses, review: listReviewOf(t, 'problems', types) }
}

// ── medicines ──
export interface MedLine { drug: string; strength: string | null; dose: string | null; route: string | null; route_words: string | null; frequency: string | null
  frequency_words: string | null; prn: string | null; days: number | null; quantity: string | null; instructions: string | null }
/** a prescription line's parts, with the plain words beside the codes (BD · twice a day) */
export function medLine(d: EntryData['medication'] | undefined): MedLine {
  const dos = d?.dosage; const q = dos?.dose; const f = dos?.timing?.code ?? null
  return { drug: d?.drug.text ?? '', strength: d?.strength ?? null, dose: q ? `${q.value}${q.unit ? ` ${q.unit}` : ''}` : dos?.text ?? null, route: dos?.route ?? null,
    route_words: dos?.route ? ROUTE[dos.route] ?? dos.route : null, frequency: f, frequency_words: f ? FREQUENCY[f] ?? f : dos?.timing?.text ?? null,
    prn: dos?.as_needed ? `when needed${dos.as_needed_for ? ` for ${dos.as_needed_for}` : ''}` : null, days: d?.duration_days ?? null,
    quantity: d?.quantity ? `${d.quantity.value}${d.quantity.unit ? ` ${d.quantity.unit}` : ''}` : null, instructions: d?.instructions ?? null }
}
/** the dose as a prescription reads it: 500 mg BD (the route when not by mouth) */
export const doseText = (l: MedLine) => [l.dose, l.route && l.route !== 'oral' ? l.route : null, l.frequency].filter(Boolean).join(' ')
/** a change: 500 mg BD → 1 g BD; nothing when the dose stayed */
export const changeText = (before: MedLine, now: MedLine) => doseText(before) !== doseText(now) ? `${doseText(before)} → ${doseText(now)}` : null
export interface MedRow extends Medication { first_at: string; changed_at: string; visit_id: string | null; stopped_on: string | null; status_reason: string | null
  reported: boolean; before: Medication | null; line: MedLine; pharmacy: { order: OrderRow; step: string; word: string; open: boolean } | null }
/** current (active, on hold) · reported (the patient takes it: nothing writes these yet, so an empty state until a path exists) · past */
export function medicinesOf(rec: Rec, ctx: ChartCtx) {
  const t = listsOf(rec); const types = ctx.org?.types; const orders = rec.tables['base.orders']?.rows ?? []
  const rows = t.rows.filter((x) => x.list === 'medications').map((x): MedRow => {
    const vs = versionsOf(t, x); const latest = t.entries[x.entry_id]; const m = medicationOf(x, latest, types)
    const prev = vs.filter((v) => v.item_version < (m.version ?? 1) && dataOf(v, 'medication', types)).at(-1)
    const o = orders.filter((r) => r.about_item === x.item).sort((a, b) => b.ordered_at.localeCompare(a.ordered_at))[0]
    return { ...m, started_on: m.data?.started?.value ?? dateOf(vs[0], x.first_at), first_at: x.first_at, changed_at: x.changed_at, visit_id: x.visit_id,
      stopped_on: m.status === 'stopped' || m.status === 'completed' ? dateOf(latest, x.changed_at) : null, status_reason: m.data?.status_reason ?? null, reported: m.basis === 'reported',
      before: prev ? medicationOf(x, prev, types) : null, line: medLine(m.data), pharmacy: o ? { order: o, step: stepOf(o), word: stepWord(stepOf(o)), open: OPEN.has(o.status) } : null }
  })
  const now = rows.filter((m) => m.status === 'active' || m.status === 'on-hold').sort((a, b) => a.drug_name.localeCompare(b.drug_name))
  return { current: now.filter((m) => !m.reported), reported: now.filter((m) => m.reported),
    past: rows.filter((m) => m.stopped_on).sort((a, b) => (b.stopped_on ?? '').localeCompare(a.stopped_on ?? '')), review: listReviewOf(t, 'medications', types) }
}

// ── allergies ──
export interface AllergyRow extends Allergy { ruled_out: boolean; high_risk: boolean; recorded_on: string }
/** active ones; the others (ruled out, inactive, resolved) fold as "Ruled out / inactive"; checked (a review) or not asked */
export function allergiesOf(rec: Rec, ctx: ChartCtx) {
  const t = listsOf(rec); const types = ctx.org?.types
  const rows = t.rows.filter((x) => x.list === 'allergies').map((x): AllergyRow => { const a = allergyOf(x, t.entries[x.entry_id], types)
    return { ...a, ruled_out: a.certainty === 'refuted', high_risk: a.data?.criticality === 'high', recorded_on: dateOf(versionsOf(t, x)[0], x.first_at) } })
  const active = rows.filter((a) => a.status === 'active' && !a.ruled_out).sort((a, b) => Number(b.high_risk) - Number(a.high_risk) || a.substance_name.localeCompare(b.substance_name))
  const review = listReviewOf(t, 'allergies', types)
  return { active, other: rows.filter((a) => !active.includes(a)), review, nka: !active.length && !!review, asked: active.length > 0 || !!review }
}

// ── facts: alerts, procedures, observations (the facts page: nothing derives them) ──
export interface FactRow { item: string; entry: ServerEntry; text: string; code: string | null; status: string | null; when: string | null; value: string | null; note: string | null }
/** each fact item's latest version; an item whose latest is a cross-out is gone */
export function factsOf(entries: ServerEntry[], types?: Types): ServerEntry[] {
  const latest = new Map<string, ServerEntry>()
  for (const e of entries) { const was = latest.get(e.item); if (!was || e.item_version > was.item_version) latest.set(e.item, e) }
  return [...latest.values()].filter((e) => baseOf(e.type, types) !== 'crossed_out' && !e.hidden).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
}
export function alertsOf(facts: ServerEntry[], types?: Types, now = new Date()) {
  const rows = factsOf(facts, types).filter((e) => baseOf(e.type, types) === 'alert').map((e): FactRow => { const d = dataOf(e, 'alert', types)
    const over = !!d?.period?.end && Date.parse(d.period.end) < now.getTime()
    return { item: e.item, entry: e, text: d?.concept.text ?? e.line, code: codeOf(d?.concept), status: d?.status === 'active' && !over ? 'active' : 'inactive', when: d?.period?.start ?? e.occurred_at, value: null, note: d?.note ?? null } })
  return { active: rows.filter((a) => a.status === 'active'), inactive: rows.filter((a) => a.status !== 'active') }
}
const valueWords = (v: EntryData['observation']['value'] | undefined) => !v ? null : v.quantity ? `${v.quantity.value}${v.quantity.unit ?? v.quantity.ucum ? ` ${v.quantity.unit ?? v.quantity.ucum}` : ''}`
  : v.concept?.text ?? v.text ?? v.date?.value ?? (v.boolean === undefined ? null : v.boolean ? 'Yes' : 'No')
/** operations and procedures (newest first), and observations by code: family history, social history (smoking, alcohol, occupation,
 *  housing), everything else */
export function historyOf(facts: ServerEntry[], types?: Types) {
  const f = factsOf(facts, types)
  const procedures = f.filter((e) => baseOf(e.type, types) === 'procedure').map((e): FactRow => { const d = dataOf(e, 'procedure', types)
    return { item: e.item, entry: e, text: d?.concept.text ?? e.line, code: codeOf(d?.concept), status: d?.status ?? null, when: d?.performed?.value ?? null, value: d?.body_site?.text ?? null, note: d?.outcome ?? d?.note ?? null } })
    .sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''))
  const obs = f.filter((e) => baseOf(e.type, types) === 'observation').map((e): FactRow => { const d = dataOf(e, 'observation', types)
    return { item: e.item, entry: e, text: d?.code.text ?? e.line, code: codeOf(d?.code), status: d?.interpretation ?? null, when: ymd(e.occurred_at), value: valueWords(d?.value), note: d?.note ?? null } })
  return { procedures, family: obs.filter((o) => FAMILY_HISTORY.has(o.code ?? '')), social: obs.filter((o) => SOCIAL_HISTORY.has(o.code ?? '')),
    other: obs.filter((o) => !FAMILY_HISTORY.has(o.code ?? '') && !SOCIAL_HISTORY.has(o.code ?? '')) }
}

// ── still waiting ──
export interface ReviewLine { row: ReviewRow; entry: ServerEntry | undefined; name: string; critical: boolean; flag: Flag | null }
export interface OrderLine { row: OrderRow; name: string; to: string | null; step: string; word: string; since: string; medicine: string | null }
/** results to review for me or my department (critical first, then the newest), orders out (the oldest first; a dispense order names its
 *  medicine), and whether this visit waits for results */
export function waitingOf(rec: Rec, ctx: ChartCtx, visit?: Pick<PresenceRow, 'state'> | null) {
  const rv = rec.tables['base.review']; const o = rec.tables['base.orders']; const t = listsOf(rec); const types = ctx.org?.types
  const reviews = (rv?.rows ?? []).filter((r) => isForMe(r, ctx.me, ctx.departmentId)).map((r): ReviewLine => { const e = rv!.entries[r.entry_id]
    return { row: r, entry: e, name: (dataOf(e, 'result', types)?.service?.name ?? e?.line) || 'Result', critical: r.critical, flag: e && !e.hidden ? flagOfResult(e, types) : null } })
    .sort((a, b) => Number(b.critical) - Number(a.critical) || b.row.at.localeCompare(a.row.at))
  const orders = (o?.rows ?? []).filter((x) => OPEN.has(x.status)).sort((a, b) => a.ordered_at.localeCompare(b.ordered_at)).map((x): OrderLine => {
    const med = x.about_item ? t.rows.find((y) => y.item === x.about_item) : undefined
    return { row: x, name: x.service_name ?? 'Order', to: nameOf(ctx.org, x.to_department_id), step: stepOf(x), word: stepWord(stepOf(x)), since: x.ordered_at,
      medicine: med ? medicationOf(med, t.entries[med.entry_id], types).drug_name : null }
  })
  return { reviews, orders, pending: visit?.state === 'pending' }
}

// ── visits and stays ──
export interface VisitLine { id: string; row: PresenceRow; kind: 'visit' | 'stay'; department_id: string; department: string; locked: boolean; who: string | null; reason: string | null
  state_word: string; start: string; end: string | null; days: number | null; bed: string | null; new_there: string[]; orders: number; open: boolean; current: boolean }
/** every visit and stay, the newest first by when it began (clinical time); what was new there (problems, diagnoses, medicines started);
 *  a department whose private notes are hidden from the reader is locked */
export function visitsOf(rec: Rec, ctx: ChartCtx, currentId?: string | null): VisitLine[] {
  const p = rec.tables['base.presence']; const t = listsOf(rec); const types = ctx.org?.types; const now = (ctx.now ?? new Date()).toISOString()
  return (p?.rows ?? []).map((row): VisitLine => {
    const start = startOf(row, p); const open = !['done', 'left', 'discharged'].includes(row.state)
    const there = t.rows.filter((x) => x.visit_id === row.item && ['problems', 'diagnoses', 'medications'].includes(x.list))
      .map((x) => x.list === 'medications' ? medicationOf(x, t.entries[x.entry_id], types).drug_name : problemOf(x, t.entries[x.entry_id], types).name).filter(Boolean)
    const who = row.assigned_id ?? (row.state === 'called' || row.state === 'with' ? row.called_by : null) ?? row.seen_by
    return { id: row.item, row, kind: row.kind, department_id: row.department_id, department: nameOf(ctx.org, row.department_id) ?? '', reason: row.reason,
      locked: rec.hidden.some((h) => h.department_id === row.department_id && h.items > 0), who: userName(ctx.org, who), state_word: PRESENCE_STATE[row.state] ?? row.state,
      start, end: row.ended_at, days: row.kind === 'stay' ? stayDay(start, row.ended_at ?? now) : null, bed: ctx.org?.places.find((x) => x.id === row.place_id)?.name ?? null,
      new_there: there, orders: row.orders, open, current: row.item === currentId }
  }).sort((a, b) => b.start.localeCompare(a.start) || b.row.last_at.localeCompare(a.row.last_at))
}
