// What the pharmacy tells the core about its answer (spec/openCare.md §5.2), so the core never names it: where a prescription is sent
// and the words on a medicine there (visit/send.ts), its last step on an order, what each request carries on its Dispensing screen
// (from its own table, pharmacy.queue), and the words of its refusal. Pure: index.tsx registers them, a node test reads them.
import type { SendWords } from '@core/screens/visit/send'
import type { ReplyDetails } from '@core/renderers'

export const ANSWER = 'pharmacy.dispense'
export const DONE = 'Dispensed'
export const SEND_WORDS: SendWords = { to: 'pharmacy', field: 'Pharmacy', chip: 'Send to pharmacy', sends: 'The pharmacy gets it on Done',
  keeps: 'Not sent — on the medication list only; the patient may buy it outside', send: 'Send to the pharmacy', draft: 'To the pharmacy', sent: 'Sent to the pharmacy',
  at: (step) => `Pharmacy: ${step}`, open: 'at the pharmacy', done: 'Dispensed', notDone: 'Not given', stopped: 'Not dispensed' }
// what to give, on each request: the medication its order is about, where the reader holds read:pharmacy.queue
export const QUEUE_DETAILS: ReplyDetails = { table: 'pharmacy.queue', action: 'read:pharmacy.queue', where: (departmentId) => ({ department_id: departmentId }),
  of: (r) => ({ item: String(r.item), details: { drug: { name: r.drug }, dose: r.dose, frequency: r.timing, duration_days: r.duration_days, quantity: r.quantity,
    medication_item: r.medication_item, instructions: r.instructions, warnings: r.warnings ?? [], owed: r.owed, status: r.status } }) }
export const REFUSALS: Record<string, string> = { nothing_dispensed: 'Say what was given' }
