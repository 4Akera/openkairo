// Ward nursing's going home (spec/openCare.md §5.6, W3b): /home's card, drafted from the stay — where to, the diagnoses, what was done,
// each medicine on the list to continue, stop (with a reason) or change (a new dose as /rx reads it) and new ones as /rx reads them,
// the follow-up and the words for the patient in Egyptian Arabic from the ward's own phrases. The patient's own medicines (reported)
// start on Continue; those prescribed in this stay start undecided ("n to decide", a fact, never a stop). Sign writes one set: the
// letter (the base's note, kind discharge), the medicine changes (the base's medication, as the core drafts them), a ward medicine kept
// signed again in this visit, and the base's discharge while the stay is still admitted. Pure: npm run test:home.
import { draftEntries, move, newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { EntryData } from '@core/db/shapes.generated'
import type { Medication, Organization, PresenceRow, RecordView, Service } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import { parse, type Ctx, type Parsed, type Result } from '@core/screens/visit/parse'
import { ymd } from '@core/ui/time'

export const HOME = 'bedside.home'
export type To = 'home' | 'other-hcf' | 'aadvice' | 'oth'
/** where to, its words, and the words /home takes for it */
export const TO: readonly [To, string, readonly string[]][] = [['home', 'Home', ['home']], ['other-hcf', 'Another facility', ['facility', 'transfer', 'hcf']],
  ['aadvice', 'Left against advice', ['lama', 'dama', 'against']], ['oth', 'Other', ['other']]]
export type Keep = 'continue' | 'stop' | 'change'
/** keep unset: not decided yet (a medicine prescribed in this stay starts so; one the patient reported starts on Continue); Change counts
 *  as decided only once its new dose is read (change set); started_on: the list item's start, for a course's days left */
export interface HomeMed { id: string; entry_id?: string; name: string; how: string; keep?: Keep; reported: boolean; reason?: string
  change?: Record<string, unknown>; change_line?: string; data?: EntryData['medication']; started_on?: string }
export interface HomeNew { line: string; params: Record<string, unknown> }
/** send_to: where /rx sends from this ward (the core's sendTarget(org, department).service), resolved by the card; none: nothing sent */
export interface HomeParams { to: To; diagnoses: string; done: string; meds: HomeMed[]; added: HomeNew[]; follow: string; words: string
  send_to?: Service | null }

const toWords = (to: unknown) => TO.find(([k]) => k === to)?.[1] ?? 'Home'
/** "40 mg · OD · oral · 5 days"; a PRN one "200 mcg · PRN wheeze · inhaled", with its schedule when it has one ("q4h PRN wheeze"); a
 *  dose given in words alone ("by the sliding scale") as written; empty parts left out */
export function medHow(m: Pick<Medication, 'dose_number' | 'dose_unit' | 'frequency' | 'prn' | 'prn_reason_text' | 'route' | 'duration_days' | 'data'>): string {
  const dose = m.dose_number != null ? `${m.dose_number}${m.dose_unit ? ` ${m.dose_unit}` : ''}` : m.data?.dosage?.text?.trim() || null
  const when = m.prn ? [m.frequency && m.frequency !== 'PRN' ? m.frequency : null, 'PRN', m.prn_reason_text].filter(Boolean).join(' ') : m.frequency
  const days = m.duration_days ? `${m.duration_days} day${m.duration_days === 1 ? '' : 's'}` : null
  return [dose, when, m.route, days].filter((x): x is string => !!x && !!String(x).trim()).join(' · ')
}
/** the card drafted from the stay: the list's active medicines as they stood, the problems' names */
export function emptyHome(ctx: Pick<Ctx, 'problems' | 'record'>, to: To = 'home'): Parsed[] {
  const meds: HomeMed[] = (ctx.record?.medications ?? []).filter((m) => m.status === 'active').map((m) => {
    const reported = m.data?.basis === 'reported'
    return { id: m.id, ...(m.entry_id ? { entry_id: m.entry_id } : {}), name: m.drug_name, how: medHow(m), reported, ...(reported ? { keep: 'continue' as const } : {}),
      ...(m.data ? { data: m.data } : {}), ...(m.started_on ? { started_on: m.started_on } : {}) }
  })
  const params: HomeParams = { to, diagnoses: (ctx.problems ?? []).map((p) => p.name).filter(Boolean).join(' · '), done: '', meds, added: [], follow: '', words: '' }
  return [{ function: HOME, kind: 'Going home', action: 'write:discharged', params: params as unknown as Record<string, unknown>, line: homeLine(params) }]
}
/** /home alone; /home facility · lama · other start on that one; a death or hospice is the base's Discharge */
export function parseHome(rest: string, ctx: Pick<Ctx, 'problems' | 'record'>): Result {
  const w = rest.trim().toLowerCase()
  if (!w) return { ok: emptyHome(ctx) }
  const to = TO.find(([, , words]) => words.includes(w))
  if (to) return { ok: emptyHome(ctx, to[0]) }
  if (['died', 'dead', 'death', 'hospice'].includes(w)) return { error: 'A death or hospice is the base’s Discharge → Died or Hospice, not Going home' }
  return { error: 'Going home: /home, or /home facility · lama · other' }
}
/** not decided yet: no choice, or Change with no new dose read (nothing would be written for it) */
const undecided = (m: HomeMed) => !m.keep || (m.keep === 'change' && !m.change)
const changed = (m: HomeMed) => m.keep === 'change' && !!m.change
/** the medicines not decided yet: a fact shown, never a stop */
export const toDecide = (q: Partial<HomeParams>) => (q.meds ?? []).filter(undecided).length
/** a course prescribed here (its days set): the days still to take, counted from the list item's start to today on the clinic's
 *  calendar, at least one; none for the patient's own, or without a course or a start. A ward medicine kept is signed again for these
 *  days only, so the printout never gives the whole course again */
export function daysLeft(m: Pick<HomeMed, 'data' | 'started_on' | 'reported'>, now: number): number | null {
  const d = m.data?.duration_days
  if (m.reported || !d || !m.started_on || !/^\d{4}-\d{2}-\d{2}$/.test(m.started_on)) return null
  const gone = Math.round((Date.parse(ymd(new Date(now).toISOString())) - Date.parse(m.started_on)) / 86_400_000)
  return Math.max(1, d - Math.max(0, gone))
}
const leftWords = (n: number | null) => n == null ? null : `${n} day${n === 1 ? '' : 's'} left`
/** "Going home · Home · 3 kept · 1 stopped · 1 changed · 1 new · 2 to decide"; "no medicines" when there are none at all */
export function homeLine(q: Partial<HomeParams>): string {
  const meds = q.meds ?? []; const added = q.added ?? []
  const n = (k: Keep) => meds.filter((m) => m.keep === k).length
  const parts = [[n('continue'), 'kept'], [n('stop'), 'stopped'], [meds.filter(changed).length, 'changed'], [added.length, 'new'], [toDecide(q), 'to decide']] as const
  const words = meds.length || added.length ? parts.filter(([c]) => c > 0).map(([c, w]) => `${c} ${w}`) : ['no medicines']
  return ['Going home', toWords(q.to), ...words].join(' · ')
}
/** a new medicine as /rx reads it here (its send as typed: on with `send`) */
export function addMed(text: string, ctx: Ctx): { ok: HomeNew } | { error: string } {
  const usage = { error: 'Type the medicine as /rx reads it: cefuroxime 500 bd 5d' }
  if (!text.trim()) return usage
  const r = parse(`/rx ${text.trim()}`, ctx)
  if (r && 'error' in r) return r
  const p = r?.ok.find((x) => x.function === 'medication')
  return p ? { ok: { line: p.line, params: { ...p.params, action: 'start' } } } : usage
}
/** a medicine changed: the new dose as /rx reads it, a new version of the item that keeps what it was (its name as written, its ATC
 *  code, its route when none is typed) */
export function changeOf(m: HomeMed, text: string, ctx: Ctx): HomeMed | { error: string } {
  const r = addMed(`${m.name} ${text}`, ctx)
  if ('error' in r) return r
  const p = r.ok.params; const read = String((p.drug as { name?: string } | undefined)?.name ?? '')
  const name = m.data?.drug.text || m.name; const atc = m.data?.drug.codings?.find((c) => c.system === 'atc')?.code
  const line = read && r.ok.line.startsWith(read) ? `${name}${r.ok.line.slice(read.length)}` : r.ok.line
  return { ...m, keep: 'change', change: { ...p, drug: { ...(p.drug as object), name, ...(atc ? { code: `atc:${atc}` } : {}) }, route: p.route ?? m.data?.dosage?.route ?? null,
    action: 'change', medication_id: m.id }, change_line: line }
}
/** the letter: the diagnoses, what was done, the medicines for home, the follow-up and the words for the patient, each when it has words;
 *  with now, a ward course kept says its days left ("7 days; 5 days left") */
export function homeText(q: HomeParams, now?: number): string {
  const meds = q.meds ?? []
  const how = (m: HomeMed) => [m.how || null, now == null ? null : leftWords(daysLeft(m, now))].filter(Boolean).join('; ')
  const med = [...meds.filter((m) => m.keep === 'continue').map((m) => `continue ${m.name}${how(m) ? ` (${how(m)})` : ''}`),
    ...meds.filter((m) => m.keep === 'stop').map((m) => `stop ${m.name}${m.reason?.trim() ? ` (${m.reason.trim()})` : ''}`),
    ...meds.filter(changed).map((m) => `changed ${m.change_line ?? m.name}`),
    ...(q.added ?? []).map((a) => `new ${a.line}`),
    ...(toDecide(q) ? [`not decided: ${meds.filter(undecided).map((m) => m.name).join(', ')}`] : [])]
  const line = (head: string, v: string | undefined) => v?.trim() ? `${head}: ${v.trim()}` : null
  return [line('Diagnoses', q.diagnoses), line('What was done', q.done), `Medicines for home: ${med.length ? med.join(' · ') : 'none'}`, line('Follow-up', q.follow),
    q.words?.trim() ? `For the patient:\n${q.words.trim()}` : null].filter((x): x is string => !!x).join('\n')
}
/** the one set: the letter, a ward medicine kept (signed again in this visit for its days left; one with no data at hand is not, as it
 *  would lose its dose), each stopped, changed and new medicine, and the discharge while the stay is still admitted */
export function homeEntries(q: HomeParams, w: { patientId: string; departmentId: string; visitId: string },
  stay: Pick<PresenceRow, 'item' | 'patient_id' | 'latest_entry' | 'state'>, now: number): EntryIn[] {
  const meds = q.meds ?? []
  const dataOf = (m: HomeMed) => { const left = m.keep === 'continue' && m.data ? daysLeft(m, now) : null
    return left != null && m.data ? { ...m.data, duration_days: left } : m.data }
  const record = { medications: meds.map((m) => ({ id: m.id, entry_id: m.entry_id, data: dataOf(m) })) } as unknown as RecordView
  // where /rx sends from this ward, as the card resolved it: sendTarget inside draftEntries finds it again (worksFor with no
  // departments answers yes; the card already chose it for this department)
  const org = q.send_to ? ({ services: [q.send_to], allDepartments: [] } as unknown as Organization) : null
  const at = { patientId: w.patientId, departmentId: w.departmentId, visitId: w.visitId, record, org }
  const med = (params: Record<string, unknown>) => draftEntries({ id: newId(), function: 'medication', params }, at)
  const out: EntryIn[] = [{ id: newId(), type: 'note', patient_id: w.patientId, department_id: w.departmentId, visit_id: w.visitId, data: { kind: 'discharge', text: homeText(q, now) } },
    ...meds.filter((m) => m.keep === 'continue' && !m.reported && m.data).flatMap((m) => med({ action: 'repeat', medication_id: m.id, drug: { name: m.name } })),
    ...meds.filter((m) => m.keep === 'stop').flatMap((m) => med({ action: 'stop', medication_id: m.id, drug: { name: m.name }, stop_reason_text: m.reason?.trim() || null })),
    ...meds.filter(changed).flatMap((m) => med(m.change!)),
    ...(q.added ?? []).flatMap((a) => med({ ...a.params, action: 'start' }))]
  if (stay.state === 'admitted') out.push(move('discharged', { id: stay.item, patient_id: stay.patient_id, latest_entry: stay.latest_entry }, w.departmentId, { disposition: q.to }))
  return out
}
/** the ward's words for the patient (bedside.home_words), the ones with a name and words */
export function phrasesIn(org: Parameters<typeof settingIn>[0], departmentId: string | null | undefined): { label: string; ar: string }[] {
  const p = (settingIn(org, 'bedside.home_words', departmentId) as { phrases?: unknown }).phrases
  return Array.isArray(p) ? p.filter((x): x is { label: string; ar: string } => !!x && typeof x.label === 'string' && !!x.label.trim() && typeof x.ar === 'string' && !!x.ar.trim()) : []
}
/** a phrase added to the box: a blank line between; the same phrase twice is not added again */
export const addWords = (box: string, ar: string) => !box.trim() ? ar : box.includes(ar) ? box : `${box}\n\n${ar}`
