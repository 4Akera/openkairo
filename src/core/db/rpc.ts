// The client's two doors (spec/openCare.md §3.9–§3.10) and the few others (§3.12). Nothing else reaches the server.
// write() returns an outcome, never rows: a refusal or a warning arrives as findings, which the screens put words on.
import { db } from './client'
import type { Json } from './types.generated'
import type { EntryData, SettingData } from './shapes.generated'

// the words for refusal and finding codes (the codes are the API; the client only says them)
const WORDS: Record<string, string> = {
  not_signed_in: 'Sign in first', not_a_member: 'This login belongs to no organization', choose_user: 'Choose which clinic you are working in',
  mfa_required: 'Settings changes need a second factor — turn it on above', not_allowed: 'Your role cannot do this here', not_found: 'Not found',
  bad_shape: 'Something in it is not in the right form', bad_entry: 'Something in it is not in the right form', unknown_type: 'Not a kind of entry this clinic knows',
  pack_off: 'That pack is off in this organization', wrong_patient: 'That belongs to another patient', two_patients: 'One Done is for one patient',
  changed_since_opened: 'Changed by someone else since you opened it — look again', set_changed: 'This was already sent with other content', busy: 'Someone else is writing for this patient — try again',
  unknown_system: 'An unknown code system', wrong_resource: 'That cannot continue this entry', wrong_target: 'That cannot correct this entry', in_the_future: 'The time is in the future',
  already_here: 'Already here: the open visit is used', already_called: 'Someone called this patient first', visit_closed: 'This visit has ended', not_admitted: 'Not admitted',
  already_admitted: 'Already admitted', not_a_visit: 'A stay is not a clinic visit: sign, move a bed or discharge', bed_taken: 'That bed is taken',
  wrong_work: 'Patients are not checked in there', not_served: 'That department does not work for this one',
  same_department: 'Already there', bad_visit: 'Not a move of this visit', unknown_service: 'That service is not offered any more', wrong_department: 'Another department answers it',
  order_closed: 'That order is closed', wrong_answer: 'This order is answered another way', unknown_step: 'Not a step of this service', other_department: 'This patient is in another department', reserved_step: 'The bench uses that word for an order — name the step otherwise', has_answers: 'It has answers already: it stays', already_crossed_out: 'Already crossed out',
  never_private: 'Only notes and results can be private', reason_missing: 'A reason is needed', bad_target: 'That cannot be pointed at', nothing_dispensed: 'Say what was given',
  last_administrator: 'Someone must keep the right to manage people and roles everywhere', self_change: 'You cannot change your own roles or a role you hold',
  cannot_grant: 'You cannot give a right you do not hold everywhere', builtin_role: 'Built-in roles are read-only — copy one to change it', unknown_action: 'Unknown action',
  in_use: 'It has been used, so it stays — retire it instead', name_missing: 'A name is needed', duplicate: 'Already exists', merged: 'That record was merged',
  bad_answer: 'No pack here answers that way', unknown_setting: 'Unknown setting', no_session: 'Sign in again to choose',
  file_missing: 'The file is not in storage: it was named in the record but never uploaded',
  allergy_clash: 'Allergy', allergy_caution: 'Caution', duplicate_medication: 'Already on this medicine', duplicate_class: 'Another medicine of the same class', already_on_list: 'Already on the list',
}
const USED: Record<string, string> = { record: 'the record points at it', services: 'it has services', people: 'people hold roles there', signed_in: 'this person has signed in', places: 'it has beds or rooms', outside: 'every organization keeps one' }
export const words = (code: string) => WORDS[code] ?? code.replace(/_/g, ' ')

export class Refusal extends Error {
  constructor(public code: string, public detail?: string) {
    super(`${words(code)}${code === 'in_use' && detail ? ` (${USED[detail] ?? detail})` : detail && /^(cannot_grant|pack_off|unknown_action|not_allowed|unknown_step|reserved_step)$/.test(code) ? `: ${detail}` : ''}`)
  }
}

export interface Finding { code: string; level: 'refuse' | 'warn' | 'flag' | 'info'; detail?: string; entries?: string[]; confirmed?: boolean; late?: boolean }
export interface Outcome { set_id: string; outcome: 'landed' | 'refused' | 'warn' | 'busy'; entries?: { id: string; item: string; item_version: number }[]; findings: Finding[]; repeat?: boolean; recorded_at?: string }
/** a set the writer refused, or sent back with warnings to confirm (inline cards) */
export class WriteRefused extends Refusal { constructor(public outcome: Outcome) { const f = outcome.findings[0]; super(f?.code ?? outcome.outcome, f?.detail) } }
export class WriteWarned extends Error { constructor(public outcome: Outcome) { super(outcome.findings.map((f) => `${words(f.code)}${f.detail ? `: ${f.detail}` : ''}`).join(' · ')) } }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn as never, args as never)
  if (error) throw new Refusal(error.message, error.details ?? undefined)
  return data as T
}

/** one read through the one door out; every read is logged by the server */
export const read = <T = unknown>(query: Record<string, unknown>) => call<T>('read', { p_query: query as Json })

// An entry's data is its type's declared shape (shapes.generated.ts, from the registry, spec §3.8): a key the shape does not name, or
// a value outside an enum, is a compile error here rather than bad_shape at Done.
/** a type and its data, before the entry around it is known (a pack's answer, a visit's move); one member per type */
export type EntryBody<K extends keyof EntryData = keyof EntryData> = K extends keyof EntryData ? { type: K; data: EntryData[K] } : never
interface EntryHead { id: string; type_version?: number; patient_id: string; department_id: string; visit_id?: string | null; occurred_at?: string; precision?: string
  replaces?: string | null; refers_to?: string | null; relation?: 'answers' | 'changes' | 'about' | null }
/** one entry of a set: a union over the types, so a set of several types still checks each entry's data against its own shape */
export type EntryIn<K extends keyof EntryData = keyof EntryData> = EntryHead & EntryBody<K>
/** one entry of a type a builder takes as a parameter (move('called', …)); assignable to EntryIn once the type is known */
export type EntryOf<K extends keyof EntryData> = EntryHead & { type: K; data: EntryData[K] }
export interface SetIn { set_id: string; made_at?: string; entries: EntryIn[]; confirmed?: string[]; seen?: Record<string, number> }
/** one Done through the one door in: landed, or a refusal (WriteRefused), warnings to confirm (WriteWarned), or busy (retried here) */
export async function write(set: SetIn): Promise<Outcome> {
  const body = { ...set, made_at: set.made_at ?? new Date().toISOString(), entries: set.entries.map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== null))) }
  for (let tries = 0; ; tries++) {
    const o = await call<Outcome>('write', { p_set: body as unknown as Json })
    if (o.outcome === 'landed') return o
    if (o.outcome === 'busy' && tries < 3) { await new Promise((r) => setTimeout(r, 400 * (tries + 1))); continue }
    if (o.outcome === 'warn') throw new WriteWarned(o)
    throw new WriteRefused(o)
  }
}

// the other doors
export const save = (what: 'organization' | 'site' | 'department' | 'place' | 'user' | 'role', row: Record<string, unknown>) => call<{ id: string; key?: string; unassigned?: number }>('save', { p_what: what, p_row: row as Json })
export const remove = (what: 'department' | 'place' | 'user' | 'role', id: string) => call<{ deleted: string }>('remove', { p_what: what, p_id: id })
export const savePatient = (p: Record<string, unknown>) => call<{ patient: unknown; findings: Finding[]; created: boolean }>('save_patient', { p: p as Json })
export const mergePatients = (p: Record<string, unknown>) => call<{ survivor: string }>('merge_patients', { p: p as Json })
/** a setting's data is its key's declared shape (shapes.generated.ts) */
export const writeSetting = <K extends keyof SettingData>(p: { key: K; owner_id?: string | null; thing_id?: string | null; data?: SettingData[K]; retired?: boolean }) =>
  call<{ id: string; thing_id: string }>('write_setting', { p: p as unknown as Json })
export const myUsers = () => call<{ id: string; organization_id: string; organization: string; name: string }[]>('my_users', {})
export const chooseUser = (userId: string) => call<{ user_id: string; organization_id: string }>('choose_user', { p_user_id: userId })
export const erasePatient = (p: { patient_id: string; reason: string }) => call('erase_patient', { p: p as unknown as Json })
/** a file of an entry: read() says where it is (the reader may see the entry; the read is logged), then a link that lasts two minutes */
export async function fileLink(entryId: string, sha256: string, departmentId: string): Promise<string> {
  const f = await read<{ bucket: string; path: string }>({ shape: 'file', entry_id: entryId, sha256, department_id: departmentId })
  const { data, error } = await db.storage.from(f.bucket).createSignedUrl(f.path, 120)
  if (error || !data?.signedUrl) throw new Refusal('file_missing')
  return data.signedUrl
}
export { db as _db }
