// The pharmacy pack's client (spec/openCare.md §5): dispensing is one click. A medication the doctor sent is an order to the pharmacy;
// its Dispensing screen, in place of the bench, shows what to give (the pack's own table, pharmacy.queue). Give all writes
// pharmacy.dispense — the pack's type that extends the base's step — straight from the medication. Not given takes a one-word reason.
// Its section in the chart (Pharmacy) lists what was dispensed; its banner word and its row mark say what waits to be collected.
// It says what the core may not: where a prescription is sent and the words on a medicine there, its last step, what its rows carry.
import { registerRenderer, registerReplyForm } from '@core/renderers'
import { registerScreen } from '@core/screens/registry'
import { ANYONE, registerSection } from '@core/screens/chart/sections'
import { KV, Tag } from '@core/ui'
import { Dispensing } from './Dispensing'
import { Check, toDispense, type Dispense } from './Check'
import { registerBannerWords } from '@core/screens/chart/words'
import { registerRowMark } from '@core/screens/marks'
import { registerSend } from '@core/screens/visit/send'
import { registerWords } from '@core/db/words'
import { collectMark, collectWords, suppliedLine, suppliedOf, suppliedWord } from './dispensed'
import { Supplied } from './Section'
import { ANSWER, DONE, QUEUE_DETAILS, REFUSALS, SEND_WORDS } from './answers'

registerReplyForm<Dispense>(ANSWER, {
  action: 'write:pharmacy.dispense',
  automatic: true,                      // a prescription the doctor sends; nobody orders dispensing by hand
  quick: 'Give all',                    // a row with nothing to check (no warning): as written, in one click
  done: DONE,
  details: QUEUE_DETAILS,             // what to give, on each request, from its own table
  Editor: Check,                      // the pharmacist's check (Check.tsx): amount, directions in Arabic, warnings, another brand, part, not given
  toWrite: toDispense,
})
// where a prescription is sent, and the words on a medicine sent here: the composer's chip, the medicine list, the prescription block
registerSend(ANSWER, SEND_WORDS)
registerWords(REFUSALS)
// its one screen for the work sent to it, in place of the bench (declared pharmacy.dispensing, replaces base.bench)
registerScreen('pharmacy.dispensing', Dispensing)
// its section in the chart: for anyone, shown in a department that uses the pack and wherever the patient has dispenses
registerSection({ key: 'pharmacy.dispensed', title: 'Pharmacy', types: ['pharmacy.dispense'], fit: ANYONE, Body: Supplied,
  word: (x) => suppliedWord(suppliedOf(x.own)), summary: (x) => suppliedLine(suppliedOf(x.own, x.rec)) })
// its banner word, only where the department uses the pharmacy: a supply prepared and waiting, "1 to collect"
registerBannerWords({ key: 'pharmacy.collect', types: ['pharmacy.dispense'], words: (x) => collectWords(suppliedOf(x.own)) })
// its mark on the clinic queue where the department uses the pharmacy, for whoever reads its orders: a prescription prepared, "Rx to collect"
registerRowMark('pharmacy', collectMark)
type Given = { drug: { text: string }; dose?: { value: string; unit?: string }; quantity?: { value: string } }
const amount = (i: Given) => [`${i.dose?.value ?? ''}${i.dose?.unit ? ` ${i.dose.unit}` : ''}`.trim(), i.quantity && `× ${i.quantity.value}`].filter(Boolean).join(' ')
// the dispense in the record, with no colour of its own: a word for the state (Given ok, Not given warn), the lines as label and value
registerRenderer('pharmacy.dispense', {
  Full: ({ data }) => { const items = ((data.pharmacy as { items?: Given[] } | undefined)?.items) ?? []
    return <div className="grid gap-1.5 text-13">{data.status === 'cancelled' ? <p><Tag tone="warn">Not given</Tag> <span className="text-muted">{String(data.reason ?? '')}</span></p>
      : <><p><Tag tone="ok">Given</Tag></p><KV dense items={items.map((i) => [i.drug.text, amount(i)])} /></>}
      {typeof data.note === 'string' && data.note && <p className="text-muted">{data.note}</p>}</div> },
})
export const key = 'pharmacy'
