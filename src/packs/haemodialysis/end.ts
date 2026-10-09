// End (spec/openCare.md §5.6, D2c): one Done at the end of a session — the base's vitals (the weight after, required, with the BP and
// pulse), the session changed to completed (or stopped early, with a reason) with the fluid taken off (the last reading's, editable),
// the needle sites, an outcome and the time it came off the machine (now, or the time typed when signing late), and the base's
// Discharge (home) in the same set. A stay whose session is not on (none, or ended already) is discharged with the vitals alone. Pure:
// npm run test:haemodialysis.
import { draftEntries, move, newId } from '@core/db/entries'
import type { EntryIn } from '@core/db/rpc'
import type { PresenceRow } from '@core/db/types'
import { hm } from '@core/ui/time'
import { bpOf, UF_MAX_L } from './reading'
import { kg, type SessionData, type SessionNow } from './session'

/** the needle sites (several), then words */
export const NEEDLES: [string, string][] = [['dry', 'Dry, no bleeding'], ['bled', 'Bled, pressure held'], ['haematoma', 'Haematoma']]
export interface EndIn {
  patientId: string; departmentId: string; stay: Pick<PresenceRow, 'item' | 'patient_id' | 'latest_entry'>
  /** the session as it stands now (left out of the set unless it is in progress) */
  session: Pick<SessionNow, 'entry_id' | 'status' | 'data'> | null
  weight: number | null; bp?: string; pulse?: number | null
  /** the fluid taken off, mL */
  removed?: number | null
  needles?: string[]; needleWords?: string
  /** ended early: stopped, with a reason */
  stopped?: boolean; reason?: string; outcome?: string
  /** when it came off the machine (ISO); default now */
  ended?: string | null
}
/** the needles' words: the chips in order, then the nurse's words */
export const needlesText = (keys: readonly string[] = [], words = '') =>
  [...NEEDLES.filter(([k]) => keys.includes(k)).map(([, w]) => w), ...(words.trim() ? [words.trim()] : [])].join(', ')
/** what keeps End from being signed */
export function endProblems(x: Pick<EndIn, 'weight' | 'bp' | 'removed' | 'stopped' | 'reason' | 'ended' | 'session'>): string[] {
  const out: string[] = []
  if (x.weight == null || !Number.isFinite(x.weight) || x.weight <= 0) out.push('Needs the weight after')
  if (x.bp?.trim() && !bpOf(x.bp)) out.push('BP as 118/72')
  // as the reading card: litres from 0 to 10 (a larger number is the machine's millilitres typed)
  if (x.removed != null && (!Number.isFinite(x.removed) || x.removed < 0 || x.removed > UF_MAX_L * 1000)) out.push('Taken off in litres, e.g. 2.8')
  if (x.stopped && !x.reason?.trim()) out.push('Needs why it ended early')
  const began = Date.parse(x.session?.data.performed?.value ?? '')
  if (x.ended && Number.isFinite(began) && Date.parse(x.ended) < began) out.push('It came off before it began: check the time')
  return out
}
/** the Taken off field's first value: the last reading's uf as it was written (mL → L, not rounded); none: blank */
export const offPreset = (uf: number | null | undefined): number | null => uf != null && Number.isFinite(uf) ? uf / 1000 : null
/** the time typed ("13:05", the clinic's) as the last such minute at or before now; blank: now; not a time: null */
export function endedAt(typed: string, now = Date.now()): string | null {
  const t = typed.trim(); const at = new Date(Math.floor(now / 60_000) * 60_000)
  if (!t) return new Date(now).toISOString()
  const m = t.match(/^(\d{1,2}):(\d{2})$/); if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  const [h, mm] = hm(at.toISOString()).split(':').map(Number)
  const back = ((h * 60 + mm) - (Number(m[1]) * 60 + Number(m[2])) + 1440) % 1440
  return new Date(at.getTime() - back * 60_000).toISOString()
}
/** End in one set: the vitals, the session completed (or stopped), the base's discharged changing the stay's latest entry */
export function endSet(x: EndIn): EntryIn[] {
  if (endProblems(x).length || x.weight == null) return []
  const bp = bpOf(x.bp)
  const out: EntryIn[] = draftEntries({ id: newId(), function: 'vitals', params: { systolic: bp?.sys, diastolic: bp?.dia, pulse: x.pulse ?? undefined, weight: x.weight } },
    { patientId: x.patientId, departmentId: x.departmentId, visitId: x.stay.item })
  const s = x.session
  if (s && s.status === 'in-progress') {
    const was = s.data; const needles = needlesText(x.needles, x.needleWords)
    const data: SessionData = { ...was, status: x.stopped ? 'stopped' : 'completed',
      ...(x.stopped && x.reason?.trim() ? { reason: x.reason.trim() } : {}), ...(x.outcome?.trim() ? { outcome: x.outcome.trim() } : {}),
      haemodialysis: { ...was.haemodialysis, ...(x.removed != null && Number.isFinite(x.removed) ? { removed: { value: String(Math.max(0, Math.round(x.removed))), unit: 'mL', ucum: 'mL' } } : {}),
        ...(needles ? { needles } : {}), ended: x.ended || new Date().toISOString() } }
    out.push({ id: newId(), type: 'haemodialysis.session', patient_id: x.patientId, department_id: x.departmentId, visit_id: x.stay.item, refers_to: s.entry_id, relation: 'changes', data })
  }
  out.push(move('discharged', { id: x.stay.item, patient_id: x.stay.patient_id, latest_entry: x.stay.latest_entry }, x.departmentId, { disposition: 'home' }))
  return out
}
/** the weight after against the dry weight: "72.6 kg: 0.6 above dry", "71.6 kg: 0.4 under dry" (amber), "72.0 kg: at dry" */
export function endWords(post: number | null | undefined, dry: number | null | undefined): { text: string; tone?: 'warn' } | null {
  if (post == null || !Number.isFinite(post)) return null
  if (dry == null || !Number.isFinite(dry)) return { text: `${kg(post)} kg` }
  const d = Math.round((post - dry) * 10) / 10
  return d < 0 ? { text: `${kg(post)} kg: ${kg(-d)} under dry`, tone: 'warn' } : { text: `${kg(post)} kg: ${d === 0 ? 'at dry' : `${kg(d)} above dry`}` }
}
