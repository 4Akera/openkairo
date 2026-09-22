// Every server call is a function (spec 01). A refusal arrives as its code in error.message.
import { db } from './client'
import type { Database } from './types.generated'
type Fns = Database['public']['Functions']
export type FnName = keyof Fns & string
// refusal codes are the API (spec 01); the client only puts words on them
const WORDS: Record<string, string> = {
  not_allowed: 'You are not allowed to do this here', not_a_member: 'This login belongs to no organization', mfa_required: 'Settings changes need a second factor — turn it on above',
  record_not_open: 'Open the record first', visit_moved: 'Someone moved this visit first — the queue has been refreshed', request_moved: 'Someone moved this request first',
  illegal_move: 'That step is not allowed from here', reason_missing: 'A reason is required', changed_since_read: 'Saved by someone else since you opened it — reload',
  not_found: 'Not found', request_not_found: 'Request not found', already_replaced: 'This entry was already corrected', duplicate: 'Already exists', stale_time: 'The time is in the future',
  author_mismatch: 'The author does not match the signed-in user', wrong_organization: 'Not in this organization', last_administrator: 'The last owner cannot be retired',
}
export class Refusal extends Error {
  constructor(public code: string, public detail?: string) { super(WORDS[code] ?? code.replace(/_/g, ' ')) }
}
export async function rpc<T = unknown>(fn: FnName, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn as never, (args ?? {}) as never)
  if (error) throw new Refusal(error.message, error.details ?? undefined)
  return data as T
}
export { db as _db }
