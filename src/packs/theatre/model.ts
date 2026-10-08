// The theatre pack's words and arithmetic (spec/openCare.md §5.7; the pictures #surg-clinic, #theatre-list, #theatre-checklist): the
// Theatre's operations (usual time, a side asked, the risks to tell) and its rooms and sessions as its settings hold them; where a case
// stands from the Theatre's steps on it; the order a room's cases go in; the sessions with room enough for a case's usual time; the
// WHO checklist's items (2009). Pure: a node test imports it.

export interface Operation { code: string; usual_min?: number; side?: boolean; risks?: string[] }
export interface Room { name: string; specialty?: string }
export type Weekday = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri'
export interface Session { room: string; weekday: Weekday; from: string; to: string; surgeon?: string }
type SettingsOrg = { settings: { key: string; thing_id: string; data: Record<string, unknown> }[] }
const setting = <T,>(org: SettingsOrg | null | undefined, key: string, dept: string) => (org?.settings.find((s) => s.key === key && s.thing_id === dept)?.data ?? {}) as Partial<T>
export const operationsOf = (org: SettingsOrg | null | undefined, dept: string): Operation[] => setting<{ operations: Operation[] }>(org, 'theatre.operations', dept).operations ?? []
export const roomsOf = (org: SettingsOrg | null | undefined, dept: string): { rooms: Room[]; sessions: Session[] } => {
  const s = setting<{ rooms: Room[]; sessions: Session[] }>(org, 'theatre.rooms', dept); return { rooms: s.rooms ?? [], sessions: s.sessions ?? [] }
}

// ── the Theatre's steps on an operation, in order ──
export const STEPS = ['scheduled', 'sent_for', 'arrived', 'anaesthetic', 'operating', 'recovery', 'back'] as const
export type StepKey = typeof STEPS[number]
export const STEP_WORD: Record<StepKey, string> = { scheduled: 'waiting', sent_for: 'sent for', arrived: 'arrived', anaesthetic: 'under anaesthetic', operating: 'operating', recovery: 'recovery', back: 'back to the ward' }
export const STEP_TONE: Partial<Record<StepKey, 'ok' | 'info' | 'accent' | 'warn'>> = { sent_for: 'accent', arrived: 'accent', anaesthetic: 'info', operating: 'info', recovery: 'ok', back: 'ok' }
export type Part = 'sign_in' | 'time_out' | 'sign_out'
export const PARTS: [Part, string, string][] = [['sign_in', 'Sign in', 'before induction'], ['time_out', 'Time out', 'before the cut'], ['sign_out', 'Sign out', 'before the patient leaves']]
/** what the list's button does next on a case, from where it stands and the parts signed: Send for, Arrived, Sign in, Time out, Sign out, Out, Back */
export function nextOf(step: StepKey | null, parts: Set<Part>): { word: string; step?: StepKey; part?: Part } | null {
  if (!step) return { word: 'Schedule' }
  if (step === 'scheduled') return { word: 'Send for', step: 'sent_for' }
  if (step === 'sent_for') return { word: 'Arrived', step: 'arrived' }
  if (!parts.has('sign_in')) return { word: 'Sign in', part: 'sign_in' }
  if (!parts.has('time_out')) return { word: 'Time out', part: 'time_out' }
  if (!parts.has('sign_out')) return { word: 'Sign out', part: 'sign_out' }
  if (step !== 'recovery' && step !== 'back') return { word: 'Out', step: 'recovery' }
  if (step === 'recovery') return { word: 'Back', step: 'back' }
  return null
}
/** a part signed moves the case on: Sign in → the anaesthetic, Time out → operating */
export const STEP_OF_PART: Partial<Record<Part, StepKey>> = { sign_in: 'anaesthetic', time_out: 'operating' }

// ── the order of a room's day, and To schedule ──
export interface Slot { room?: string | null; starts?: string | null; position?: number | null }
export const byPosition = <T extends { slot: Slot | null }>(cases: T[]) => [...cases].sort((a, b) =>
  (a.slot?.position ?? 999) - (b.slot?.position ?? 999) || String(a.slot?.starts ?? '').localeCompare(String(b.slot?.starts ?? '')))
const RANK: Record<string, number> = { stat: 0, asap: 1, urgent: 1, routine: 2 }
/** To schedule: by priority, then weeks waiting (the longest first) */
export const toSchedule = <T extends { priority: string; ordered_at: string }>(cases: T[]) => [...cases].sort((a, b) => (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2) || a.ordered_at.localeCompare(b.ordered_at))
export const waiting = (orderedAt: string, now = Date.now()) => { const d = Math.max(0, Math.floor((now - Date.parse(orderedAt)) / 86_400_000)); return d < 7 ? `${d} day${d === 1 ? '' : 's'}` : `${Math.floor(d / 7)} wk` }
export const priorityWord = (p: string) => p === 'stat' ? 'emergency' : p === 'routine' ? 'elective' : p

// ── the sessions with room enough ──
const DAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const mins = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
export interface Free { day: string; weekday: Weekday; room: string; from: string; free: number; starts: string; surgeon?: string }
/** the next sessions (from tomorrow, two weeks ahead) of this surgeon, or with no surgeon named, in which the usual time fits after
 *  what is booked there that day; at most n. booked: minutes booked by room and day ("Theatre 1|2026-10-10") */
export function freeSessions(sessions: Session[], usual: number, booked: Map<string, number>, surgeon: string | null, from = new Date(), n = 3): Free[] {
  const out: Free[] = []
  for (let i = 1; i <= 14 && out.length < n; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i); const day = d.toISOString().slice(0, 10); const wd = DAYS[d.getDay()]
    for (const s of sessions.filter((x) => x.weekday === wd && (!surgeon || !x.surgeon || x.surgeon === surgeon))) {
      const used = booked.get(`${s.room}|${day}`) ?? 0; const free = mins(s.to) - mins(s.from) - used
      if (free >= usual && out.length < n) out.push({ day, weekday: wd, room: s.room, from: hhmm(mins(s.from) + used), free, starts: `${day}T${hhmm(mins(s.from) + used)}:00`, ...(s.surgeon ? { surgeon: s.surgeon } : {}) })
    }
  }
  return out
}
export const freeWords = (f: Free) => `${f.free >= 60 ? `${Math.floor(f.free / 60)} h${f.free % 60 ? ` ${f.free % 60}` : ''}` : `${f.free} min`} free · from ${f.from}`
export const dayWords = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// ── the WHO Surgical Safety Checklist (2009): each part's items, and who says each ──
export interface Item { key: string; text: string; who: 'nurse' | 'surgeon' | 'anaesthetist' | 'all' }
export const WHO_ITEMS: Record<Part, Item[]> = {
  sign_in: [
    { key: 'identity', text: 'Name, birth date, operation and consent confirmed with the patient', who: 'nurse' },
    { key: 'site', text: 'Site marked', who: 'nurse' },
    { key: 'machine', text: 'Anaesthetic machine and drugs checked', who: 'anaesthetist' },
    { key: 'oximeter', text: 'Pulse oximeter on and working', who: 'anaesthetist' },
    { key: 'allergy', text: 'Allergies known', who: 'nurse' },
    { key: 'airway', text: 'Difficult airway or aspiration risk considered', who: 'anaesthetist' },
    { key: 'blood', text: 'Blood loss over 500 mL (7 mL/kg in a child) considered, blood available', who: 'anaesthetist' }],
  time_out: [
    { key: 'team', text: 'Everyone said their name and role', who: 'all' },
    { key: 'confirm', text: 'Patient, operation, where the cut will be', who: 'surgeon' },
    { key: 'antibiotic', text: 'Antibiotic given in the last 60 min', who: 'anaesthetist' },
    { key: 'surgeon', text: 'Surgeon: the critical steps, how long, the blood loss expected', who: 'surgeon' },
    { key: 'anaesthetist', text: 'Anaesthetist: any concerns', who: 'anaesthetist' },
    { key: 'sterility', text: 'Sterility indicators checked · equipment ready', who: 'nurse' },
    { key: 'imaging', text: 'Imaging on the screen', who: 'surgeon' }],
  sign_out: [
    { key: 'done', text: 'The operation as done', who: 'nurse' },
    { key: 'counts', text: 'Swabs, needles and instruments counted', who: 'nurse' },
    { key: 'specimen', text: 'Specimen labelled, the label read aloud', who: 'nurse' },
    { key: 'equipment', text: 'Equipment problems', who: 'nurse' },
    { key: 'recovery', text: 'For recovery: the key concerns', who: 'anaesthetist' }],
}
export interface Count { what: string; before?: number; added?: number; after?: number }
/** a count adds up when what was there before and added is what is there after: a notice for the surgeon, never a stop */
export const countOff = (c: Count) => c.after != null && c.before != null && c.before + (c.added ?? 0) !== c.after
export const SIDE_WORD = (s?: string | null) => s && s !== 'none' ? s : null
