// The client's two doors (spec/openCare.md §3.9–§3.10) and the few others (§3.12). Nothing else reaches the server.
// write() returns an outcome, never rows: a refusal or a warning arrives as findings, which the screens put words on.
import { db } from './client'
import type { Json } from './types.generated'
import type { EntryData, SettingData } from './shapes.generated'
import type { SetupAnswer } from './types'
import { USED, words } from './words'
export { registerWords, words } from './words'

export class Refusal extends Error {
  /** field: the setting's field a refusal names (its path, rows.2.dose), so the form shows it there (§5.1 rule 7) */
  constructor(public code: string, public detail?: string, public field?: string) {
    super(`${words(code)}${code === 'in_use' && detail ? ` (${USED[detail] ?? detail})` : detail && /^(cannot_grant|pack_off|unknown_action|not_allowed|unknown_step|reserved_step)$/.test(code) ? `: ${detail}` : ''}`)
  }
}

export interface Finding { code: string; level: 'refuse' | 'warn' | 'flag' | 'info'; detail?: string; entries?: string[]; confirmed?: boolean; late?: boolean }
export interface Outcome { set_id: string; outcome: 'landed' | 'refused' | 'warn' | 'busy'; entries?: { id: string; item: string; item_version: number }[]; findings: Finding[]; repeat?: boolean; recorded_at?: string; patients?: { id: string; number: number }[] }
/** a set the writer refused, or sent back with warnings to confirm (inline cards) */
export class WriteRefused extends Refusal { constructor(public outcome: Outcome) { const f = outcome.findings[0]; super(f?.code ?? outcome.outcome, f?.detail) } }
export class WriteWarned extends Error { constructor(public outcome: Outcome) { super(outcome.findings.map((f) => `${words(f.code)}${f.detail ? `: ${f.detail}` : ''}`).join(' · ')) } }

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn as never, args as never)
  if (error) throw new Refusal(error.message, error.details ?? undefined, error.hint || undefined)
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
/** a newborn a set makes (the owner's Q10, 2026-10-08): a new record, its mother the patient of the set's first entry, named by an
 *  entry of the same set; made only when the whole set lands */
export interface NewPatient { id: string; mother: string; full_name: string; gender: 'male' | 'female' | 'other' | 'unknown'; birth_date: string; department_id: string }
export interface SetIn { set_id: string; made_at?: string; entries: EntryIn[]; confirmed?: string[]; seen?: Record<string, number>; patients?: NewPatient[] }
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
/** a starter setup on a department (§5.2): without apply, the parts it would add and how the department differs; with apply (true:
 *  every part to add, or a list), it makes the department when new and adds those, never overwriting what staff changed */
export const runSetup = (p: { setup: string; department_id?: string; name?: string; site_id?: string | null; position?: number; apply?: true | string[] }) =>
  call<SetupAnswer>('setup', { p: p as unknown as Json })
export const myUsers = () => call<{ id: string; organization_id: string; organization: string; name: string }[]>('my_users', {})
export const chooseUser = (userId: string) => call<{ user_id: string; organization_id: string }>('choose_user', { p_user_id: userId })
/** Retry (Settings → Packs): a pack's failed and parked work queued again in the background */
export const retryPack = (pack: string) => call<{ pack: string; requeued: number }>('retry_pack', { p: { pack } as Json })
/** a pack's own operation on a table of its own that holds no entries (spec §5.3: a stock kept by a pack): the door checks the action.
 *  purpose: why the patients it names are read — the read log's default is PATADMIN, for a pack's own data; a pack reading the record
 *  for care says TREAT (the owner's C1, 2026-10-08) */
export const packOp = <T = unknown>(op: string, departmentId: string, args: Record<string, unknown> = {}, purpose?: string) =>
  call<T>('pack_op', { p: { op, department_id: departmentId, args, ...(purpose ? { purpose } : {}) } as unknown as Json })
export const erasePatient = (p: { patient_id: string; reason: string }) => call('erase_patient', { p: p as unknown as Json })
/** a file of an entry: read() says where it is (the reader may see the entry; the read is logged), then a link that lasts two minutes */
export async function fileLink(entryId: string, sha256: string, departmentId: string, purpose: { purpose: string; reason?: string } = { purpose: 'TREAT' }): Promise<string> {
  const f = await read<{ bucket: string; path: string }>({ shape: 'file', entry_id: entryId, sha256, department_id: departmentId, ...purpose })
  const { data, error } = await db.storage.from(f.bucket).createSignedUrl(f.path, 120)
  if (error || !data?.signedUrl) throw new Refusal('file_missing')
  return data.signedUrl
}
export { db as _db }
