// Sending a medicine on (spec/openCare.md §5.2): a pack that answers prescriptions registers, by the type that answers them, the words
// of its send chip and of a medicine's state there ("Send to …", "Sent", "Given"). The core names no pack: a prescription goes to the
// service a registered answer serves that works for this department, and every word on a medicine comes from here. Pure.
import { worksFor } from '../../db/views'
import type { Organization, Service } from '../../db/types'

export interface SendWords {
  to: string                          // where it goes, after an arrow in a line: "→ <to>"
  field: string                       // the prescription card's row
  chip: string                        // its chip
  sends: string                       // under the chip, on: what happens at Done
  keeps: string                       // under the chip, off
  send: string                        // the medicine list's button
  draft: string                       // a draft's state
  sent: string                        // sent, not yet started
  at: (step: string) => string        // where it has got to (a step's word)
  open: string                        // the Summary's short mark while it is open there
  done: string                        // answered: given
  notDone: string                     // answered: not given
  stopped: string                     // cancelled or refused before an answer
}
/** the words when no pack speaks for the service (a sample page, an answer type no pack registered) */
export const PLAIN_SEND: SendWords = { to: 'sent', field: 'Send', chip: 'Send', sends: 'Sent on Done', keeps: 'Not sent — on the medication list only', send: 'Send',
  draft: 'To send', sent: 'Sent', at: (step) => step, open: 'sent', done: 'Done', notDone: 'Not done', stopped: 'Cancelled' }

const senders = new Map<string, SendWords>()
/** a pack's answer type that prescriptions are sent to, with its words; once per type */
export function registerSend(replyType: string, words: SendWords): boolean {
  if (senders.has(replyType)) { console.error(`openCare: ${replyType} sends already`); return false }
  senders.set(replyType, words); return true
}
export const sendsTo = (replyType: string | null | undefined) => !!replyType && senders.has(replyType)
/** the words of the service an order went to: its pack's, else the plain ones */
export const sendWordsOf = (org: Pick<Organization, 'services'> | undefined | null, serviceId: string | null | undefined): SendWords =>
  senders.get(org?.services.find((s) => s.id === serviceId)?.reply_type ?? '') ?? PLAIN_SEND

/** where a prescription from this department goes: the first service a registered answer serves that works for it, with its words */
export function sendTarget(org: Pick<Organization, 'services' | 'allDepartments'> | undefined | null, departmentId: string | null | undefined): { service: Service; words: SendWords } | null {
  const service = (org?.services ?? []).find((x) => sendsTo(x.reply_type) && !!x.department_id && worksFor(org ?? undefined, x.department_id, departmentId))
  return service ? { service, words: senders.get(service.reply_type)! } : null
}
