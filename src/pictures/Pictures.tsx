// The pictures, one per address (/pictures.html#rx-check): a line on top says which picture and what it shows, then the screen.
import { useEffect, useState, type ComponentType } from 'react'
import { LabCollect, LabCritical, LabResults, LabWalkIn } from './lab'
import { RxCheck, RxList } from './pharmacy'
import { DoctorSide } from './doctor'
import { BenchWalkIn } from './bench'
import { RxCount, RxReceive, RxSettings, RxStock } from './stock'
import { LabAnalysers, LabChairs, LabReceive, LabSettings } from './biglab'
import { OrderAsk, OrderList, OrderScan, OrderSet, OrderTyping, OrderWhere } from './order'

const LIST: { id: string; title: string; note: string; Page: ComponentType }[] = [
  { id: 'bench-walkin', title: 'Any bench · a walk-in', note: 'Two steps: first who (search, or New patient), then what for (this room\'s services); who asked folded.', Page: BenchWalkIn },
  { id: 'lab-walkin', title: 'Lab · a walk-in', note: 'The same two steps; what for is the doctor\'s /order line plus the six tests asked for most.', Page: LabWalkIn },
  { id: 'lab-collect', title: 'Lab · collecting', note: 'Tubes by colour, the sample number to write on them, Collected in one key.', Page: LabCollect },
  { id: 'lab-results', title: 'Lab · results by section', note: 'Many patients in one grid; flags as you type; the change check; LDL worked out.', Page: LabResults },
  { id: 'lab-critical', title: 'Lab · a critical value', note: 'Only a notice: tell the doctor, then Release. Logging the call comes later.', Page: LabCritical },
  { id: 'rx-list', title: 'Pharmacy · the list', note: 'What waits, with marks for what needs the pharmacist; simple rows give in one click.', Page: RxList },
  { id: 'rx-check', title: 'Pharmacy · the check', note: 'Real amounts, Arabic directions, the allergy asks the doctor, out of stock: another brand or owed.', Page: RxCheck },
  { id: 'rx-settings', title: 'Pharmacy · settings', note: 'Keep stock (on here) and Prepare first (off by default) are the pharmacy\'s own switches.', Page: RxSettings },
  { id: 'rx-stock', title: 'Pharmacy · stock', note: 'Low, expiring, out of stock; a product\'s week: given from the dispenses, received and counted from the pack\'s table.', Page: RxStock },
  { id: 'rx-receive', title: 'Pharmacy · receiving a delivery', note: 'Supplier, invoice, then lines: product, batch, expiry, boxes; scanning a box fills them.', Page: RxReceive },
  { id: 'rx-count', title: 'Pharmacy · a stock-take', note: 'Counted against expected; each difference with a reason, as a new row.', Page: RxCount },
  { id: 'lab-settings', title: 'Large lab · settings', note: 'Each switch on its own; all off is a small lab.', Page: LabSettings },
  { id: 'lab-chairs', title: 'Large lab · collection chairs', note: 'My chair, the patient called by number, labels printed at Collected; only the next few listed.', Page: LabChairs },
  { id: 'lab-receive', title: 'Large lab · scan to receive', note: 'One scan box; each tube received and routed; a rejected tube goes back for a new sample.', Page: LabReceive },
  { id: 'lab-analysers', title: 'Large lab · results from analysers', note: 'Normal results go out by themselves; people see only what a rule stopped.', Page: LabAnalysers },
  { id: 'order-list', title: 'Ordering · the / list', note: '/lab is the laboratory pack\'s word, under its own name; offered because the Laboratory works for this department.', Page: OrderList },
  { id: 'order-typing', title: 'Ordering · typing /lab', note: 'Only the lab\'s tests, each with its code, section and tube; tab takes the first.', Page: OrderTyping },
  { id: 'order-ask', title: 'Ordering · a word that fits more than one', note: 'Never guessed: the draft asks which, and Sign waits for it.', Page: OrderAsk },
  { id: 'order-set', title: 'Ordering · a preset, stat and the question', note: 'A preset\'s name brings its tests, each removable; the lab adds the tubes and fasting; stat and ? the question are the only extras.', Page: OrderSet },
  { id: 'order-where', title: 'Ordering · where /lab is not offered', note: 'Typed in a department the Laboratory does not serve, it says where it orders from.', Page: OrderWhere },
  { id: 'order-scan', title: 'Ordering · later, radiology', note: 'A radiology pack would bring /xr /us /ct, each its section: the same card.', Page: OrderScan },
  { id: 'doctor', title: "Doctor · what comes back", note: 'To review: the pharmacy\'s questions beside the results; Answer opens the chart, where the question is a card.', Page: DoctorSide },
]

export function Pictures() {
  const [id, setId] = useState(() => location.hash.slice(1))
  useEffect(() => { const f = () => setId(location.hash.slice(1)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const i = LIST.findIndex((p) => p.id === id)
  if (i < 0) return <div className="mx-auto grid max-w-2xl gap-3 p-6 text-14">
    <p className="text-18 font-semibold text-fg">Pictures · pharmacy and laboratory</p>
    <p className="text-muted">Made-up patients, the real kit. Nothing here is built yet.</p>
    <ol className="grid gap-1.5">{LIST.map((p, n) => <li key={p.id}><a className="text-accent hover:underline" href={`#${p.id}`}>{n + 1}. {p.title}</a> <span className="text-muted">— {p.note}</span></li>)}</ol>
  </div>
  const P = LIST[i]
  return <div className="min-h-screen bg-canvas text-fg">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line bg-sunken px-4 py-2 text-13">
      <span className="font-semibold text-fg">Picture {i + 1} of {LIST.length} · {P.title}</span><span className="text-muted">{P.note}</span>
      <span className="ms-auto flex gap-3 text-12">{i > 0 && <a className="text-accent" href={`#${LIST[i - 1].id}`}>← back</a>}{i < LIST.length - 1 && <a className="text-accent" href={`#${LIST[i + 1].id}`}>next →</a>}</span>
    </div>
    <P.Page />
  </div>
}
