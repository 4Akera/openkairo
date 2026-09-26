import type { QueueRow } from '../../db/types'

/** The clinic list's words (spec 05, "who is next, and who needs me"): plain, sentence case, one line per patient. */
const SEX: Record<string, string> = { male: 'M', female: 'F', other: 'X' }
export const ageSex = (age: number | null, sex: string) => `${age ?? ''} ${SEX[sex] ?? ''}`.trim()

/** years from a birth date written YYYY-MM-DD, read as a calendar date (no time zone shift) */
export function yearsOld(born: string | null | undefined) {
  if (!born) return null
  const [y, m, d] = born.slice(0, 10).split('-').map(Number); const n = new Date()
  return n.getFullYear() - y - (n.getMonth() + 1 < m || (n.getMonth() + 1 === m && n.getDate() < d) ? 1 : 0)
}

/** "Creatinine" reads "creatinine" inside a sentence; "HbA1c", "TSH", "Hb" and "Chest X-ray"'s X-ray keep their case */
const word = (s: string) => /^[A-Z][a-z]{3,}$/.test(s.split(/\s/)[0]) ? s[0].toLowerCase() + s.slice(1) : s
type Req = QueueRow['requests'][number]
const reqName = (x: Req) => x.service_name ?? (x.to_department_name ? `${x.to_department_name} consult` : 'Consult')
/** sentence case: the first name keeps its capital, the ones after it read inside the sentence */
const sentence = (parts: string[]) => parts.map((s, i) => i ? word(s) : s)

/** what came back for a Back patient: "HbA1c, creatinine" (prescriptions are not results) */
export const backIn = (reqs: Req[]) => sentence([...new Set(reqs.filter((x) => x.type !== 'prescription' && x.replied).map(reqName))]).join(', ')

const STEP: Record<string, string> = { sent: 'sent', started: 'sample taken', held: 'held' }
/** what a patient waiting for results waits for: "HbA1c sample taken · chest X-ray sent". An open prescription never holds a
 *  visit (core.holds), so it is not something the patient waits for here. */
export const pendingWords = (reqs: Req[]) => sentence(reqs.filter((x) => x.is_holding && x.type !== 'prescription').map((x) => `${reqName(x)} ${STEP[x.step] ?? x.step}`)).join(' · ')

/** since when the row has been waiting: arrival, back since present, with a doctor since called */
export const since = (r: QueueRow) => r.band === 'waiting' ? r.arrived_at
  : r.band === 'consult' ? r.called_at ?? r.seen_at ?? r.present_at ?? r.arrived_at : r.present_at ?? r.arrived_at

/** my next patient: my Back patient (or an unclaimed one) first, else the first waiting — the server orders urgent first,
 *  then arrival. A Back patient who belongs to another doctor is never mine. */
export const nextPatient = (rows: QueueRow[], me: string | null | undefined) =>
  rows.find((r) => r.band === 'back' && (r.assignee_id == null || r.assignee_id === me)) ?? rows.find((r) => r.band === 'waiting') ?? null

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
/** the filter: a record number (its first digits) or any words of the name, in any order */
export function matches(p: { record_number: number; given_name: string; family_name: string }, text: string) {
  const t = fold(text.trim()); if (!t) return true
  if (/^#?\d+$/.test(t)) return String(p.record_number).startsWith(t.replace('#', ''))
  const name = fold(`${p.given_name} ${p.family_name}`)
  return t.split(/\s+/).every((w) => name.includes(w))
}
