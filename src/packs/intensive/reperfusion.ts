// The reperfusion record (spec/openCare.md §5.6, piece I3): the STEMI's times as the CCU reports them (pain, the door, the first ECG,
// the needle or the balloon), often at the ER or another hospital, read by the strip above the chart against the department's targets
// (intensive.cardiac: first ECG within 10 min of the door; door to needle 30, door to balloon 90). A target met is ✓, one missed ✕ with its
// minutes: a fact, never a stop. "Into CCU" is the stay's own start, never copied. One record a stay; an edit is a version that changes it.
// The pack's own type intensive.reperfusion, awaiting the owner. Pure: npm run test:intensive.
import type { EntryIn } from '@core/db/rpc'
import type { IntensiveReperfusion } from '@core/db/shapes.generated'
import type { Organization, ServerEntry } from '@core/db/types'
import { settingIn } from '@core/screens/settings/form/model'
import { hm, ymd } from '@core/ui/time'
import { clinicInstant } from './hours'

export type Reperfusion = IntensiveReperfusion
type Diagnosis = Reperfusion['diagnosis']; type Way = NonNullable<Reperfusion['reperfusion']>
type Angio = NonNullable<Reperfusion['angiography']>; type Killip = NonNullable<Reperfusion['killip']>
/** the words, as the server's line says them */
export const DIAGNOSES: [Diagnosis, string][] = [['stemi_anterior', 'Anterior STEMI'], ['stemi_inferior', 'Inferior STEMI'], ['stemi_lateral', 'Lateral STEMI'],
  ['stemi_posterior', 'Posterior STEMI'], ['stemi_other', 'STEMI'], ['nstemi', 'NSTEMI']]
export const REPERFUSION: [Way, string][] = [['lysis', 'lysis'], ['primary_pci', 'primary PCI'], ['none', 'no reperfusion']]
export const ANGIO: [Angio, string][] = [['within_24h', 'within 24 h of lysis'], ['rescue_now', 'rescue now'], ['elective', 'elective'],
  ['not_planned', 'not planned'], ['done', 'done']]
export const KILLIP: [Killip, string][] = [['i', 'I'], ['ii', 'II'], ['iii', 'III'], ['iv', 'IV']]
export const LYTICS = ['Tenecteplase', 'Alteplase', 'Reteplase', 'Streptokinase']
const words = <K extends string>(list: [K, string][], k: K | undefined) => list.find(([c]) => c === k)?.[1]
export const killipWords = (k: string | undefined) => words(KILLIP, k as Killip)

/** the minutes from one instant to another */
export const minutes = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000)
/** '6 min', '1 h 48', '2 h' */
export function duration(min: number): string {
  if (Math.abs(min) < 60) return `${min} min`
  const h = Math.trunc(min / 60); const m = Math.abs(min % 60)
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
}

/** the strip's head: "Anterior STEMI · lysis (tenecteplase)" */
export function headline(d: Reperfusion): string {
  const way = d.reperfusion === 'lysis' && d.lytic?.text ? `lysis (${d.lytic.text.toLowerCase()})` : words(REPERFUSION, d.reperfusion)
  return [words(DIAGNOSES, d.diagnosis), way].filter(Boolean).join(' · ')
}
export interface StripItem { label: string; at: string | null; words?: string; met?: boolean }
export interface Targets { ecg_minutes: number; needle_minutes: number; balloon_minutes: number }
/** the department's targets (intensive.cardiac), with the shape's defaults */
export function targetsOf(org: Organization | undefined, deptId: string): Targets {
  const s = settingIn(org, 'intensive.cardiac', deptId)
  return { ecg_minutes: s.ecg_minutes ?? 10, needle_minutes: s.needle_minutes ?? 30, balloon_minutes: s.balloon_minutes ?? 90 }
}
/** the strip's items, in order: pain, the door, the first ECG, the needle or the balloon, into the unit, angiography, Killip */
export function strip(d: Reperfusion, into: { at: string; name: string }, t: Targets, now: string): StripItem[] {
  const out: StripItem[] = []
  if (d.pain_at) out.push({ label: 'Pain began', at: d.pain_at })
  if (d.door_at) out.push({ label: 'At the door', at: d.door_at })
  if (d.ecg_at) { const n = d.door_at ? minutes(d.door_at, d.ecg_at) : null
    out.push({ label: 'First ECG', at: d.ecg_at, ...(n !== null ? { words: `${n} min · target ${t.ecg_minutes}`, met: n <= t.ecg_minutes } : {}) }) }
  if ((d.reperfusion === 'lysis' || d.reperfusion === 'primary_pci') && d.needle_at) {
    const lysis = d.reperfusion === 'lysis'; const what = lysis ? 'needle' : 'balloon'; const target = lysis ? t.needle_minutes : t.balloon_minutes
    const door = d.door_at ? minutes(d.door_at, d.needle_at) : null
    const parts = [d.ecg_at && `ECG to ${what} ${minutes(d.ecg_at, d.needle_at)} min`, door !== null && `door to ${what} ${door} min`,
      d.pain_at && `pain to ${what} ${duration(minutes(d.pain_at, d.needle_at))}`].filter(Boolean)
    out.push({ label: lysis ? 'Lysis' : 'Primary PCI', at: d.needle_at, ...(parts.length ? { words: parts.join(' · ') } : {}), ...(door !== null ? { met: door <= target } : {}) })
  }
  out.push({ label: `Into ${into.name}`, at: into.at })
  if (d.angiography) {
    const by = d.angiography_by; const day = by ? ymd(by) : null
    const when = by ? `by ${hm(by)}${day === ymd(new Date(Date.parse(now) + 86_400_000).toISOString()) ? ' tomorrow' : day !== ymd(now) ? ` ${day}` : ''}` : null
    out.push({ label: 'Angiography', at: null, words: [when, d.angiography === 'within_24h' ? '2–24 h after lysis' : words(ANGIO, d.angiography)].filter(Boolean).join(' · ') })
  }
  if (d.killip) out.push({ label: 'Killip', at: null, words: killipWords(d.killip) })
  return out
}

/** a time on the card: "HH:MM", today or yesterday; the instant it was read from, kept while it is not retyped */
export interface TimeDraft { hm?: string; yesterday?: boolean; iso?: string }
export type TimeKey = 'pain' | 'door' | 'ecg' | 'needle'
export const TIME_KEYS: [TimeKey, 'pain_at' | 'door_at' | 'ecg_at' | 'needle_at'][] = [['pain', 'pain_at'], ['door', 'door_at'], ['ecg', 'ecg_at'], ['needle', 'needle_at']]
export interface ReperfusionDraft { diagnosis?: Diagnosis; reperfusion?: Way; lytic?: string; angiography?: Angio; killip?: Killip; note?: string
  times: Partial<Record<TimeKey, TimeDraft>>
  /** the angiography's choice and time the record holds: the time is kept while a rescue or an elective one stays chosen */
  angiography_was?: Angio; angiography_by?: string }
/** the card's draft from the record (an edit), or empty */
export function draftOf(d: Reperfusion | null, now: string): ReperfusionDraft {
  if (!d) return { times: {} }
  const times: ReperfusionDraft['times'] = {}
  for (const [k, f] of TIME_KEYS) { const iso = d[f]; if (iso) times[k] = { hm: hm(iso), yesterday: ymd(iso) !== ymd(now), iso } }
  return { diagnosis: d.diagnosis, reperfusion: d.reperfusion, lytic: d.lytic?.text, angiography: d.angiography, killip: d.killip, note: d.note, times,
    angiography_was: d.angiography, angiography_by: d.angiography_by }
}
const instantOf = (t: TimeDraft | undefined, now: string): string | null | undefined =>
  !t?.hm?.trim() ? undefined : t.iso ?? clinicInstant(t.hm.trim(), t.yesterday ? 1 : 0, now)
/** what stops the sign, under its field: the diagnosis; each time HH:MM, in order and not still to come; lysis with its drug and time */
export function reperfusionProblems(x: ReperfusionDraft, now: string): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = []
  if (!x.diagnosis) out.push({ field: 'diagnosis', text: 'Choose the diagnosis' })
  let prev: string | null = null
  for (const [k] of TIME_KEYS) {
    const at = instantOf(x.times[k], now); if (at === undefined) continue
    if (at === null) { out.push({ field: k, text: 'A time, HH:MM' }); continue }
    if (prev && at < prev) out.push({ field: k, text: 'Before the time above it' })
    else if (Date.parse(at) > Date.parse(now) + 5 * 60_000) out.push({ field: k, text: 'Later than now: yesterday?' })
    prev = at
  }
  if (x.reperfusion === 'lysis' && !x.lytic) out.push({ field: 'lytic', text: 'Which drug' })
  if (x.reperfusion === 'lysis' && !x.times.needle?.hm?.trim()) out.push({ field: 'needle', text: 'The needle\'s time' })
  return out
}
/** the type's data from the card's draft: a needle or balloon time only with lysis or a primary PCI; "within 24 h" sets the angiography's
 *  time to the needle + 24 h, a rescue or elective one keeps the record's while its choice stands, the others have none */
export function reperfusionData(x: ReperfusionDraft, now: string): Reperfusion {
  const d: Reperfusion = { diagnosis: x.diagnosis ?? 'stemi_other' }
  const reperfused = x.reperfusion === 'lysis' || x.reperfusion === 'primary_pci'
  for (const [k, f] of TIME_KEYS) { const at = instantOf(x.times[k], now); if (at && (k !== 'needle' || reperfused)) d[f] = at }
  if (x.reperfusion) d.reperfusion = x.reperfusion
  if (x.reperfusion === 'lysis' && x.lytic) d.lytic = { text: x.lytic }
  if (x.angiography) d.angiography = x.angiography
  if (x.angiography === 'within_24h' && d.needle_at) d.angiography_by = new Date(Date.parse(d.needle_at) + 24 * 3600_000).toISOString()
  else if ((x.angiography === 'rescue_now' || x.angiography === 'elective') && x.angiography === x.angiography_was && x.angiography_by) d.angiography_by = x.angiography_by
  if (x.killip) d.killip = x.killip
  if (x.note?.trim()) d.note = x.note.trim()
  return d
}
/** the record: its first version, or a version that changes the latest (with the version it was typed against) */
export function reperfusionEntry(data: Reperfusion, latest: ServerEntry | null, where: { patientId: string; departmentId: string; stay: string }, id: () => string, at: string):
  { entry: EntryIn; seen: Record<string, number> } {
  const entry: EntryIn = { id: id(), patient_id: where.patientId, department_id: where.departmentId, visit_id: where.stay, occurred_at: at, precision: 'minute',
    type: 'intensive.reperfusion', data, ...(latest ? { refers_to: latest.id, relation: 'changes' as const } : {}) }
  return { entry, seen: latest ? { [latest.item]: latest.item_version } : {} }
}
