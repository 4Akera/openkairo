// The pictures, one per address (/pictures.html#rx-check): a line on top says which picture and what it shows, then the screen.
import { useEffect, useState, type ComponentType } from 'react'
import { LabCollect, LabCritical, LabResults, LabWalkIn } from './lab'
import { RxCheck, RxList } from './pharmacy'
import { DoctorSide } from './doctor'
import { BenchWalkIn } from './bench'
import { RxCount, RxReceive, RxSettings, RxStock } from './stock'
import { LabAnalysers, LabChairs, LabReceive, LabSettings } from './biglab'
import { OrderAsk, OrderList, OrderScan, OrderSet, OrderTyping, OrderWhere } from './order'
import { RadBack, RadContrast, RadCritical, RadList, RadOrder, RadReport, RadScan, RadSettings, RadWalkIn } from './radiology'
import { StoreArrived, StoreSend, StoreSetup, StoreStock } from './store'
import { BookBench, BookCalls, BookConsult, BookDesk, BookDiary, BookQueue, BookSettings, BookToday, BookWalkIn } from './bookings'

import { StaysMap, WardBoard, WardDischarge, WardFluids, WardHandover, WardObs, WardRound, WardSettings, WardSheet } from './ward'
import { ErBoard, ErTriage, ErWhereTo } from './er'
import { CcuChart, IcuBoard, IcuChart, IcuGoals } from './icu'
import { LabourBirth, LabourBoard, LabourPartograph } from './labour'
import { HdSchedule, HdSession, HdUnit } from './dialysis'

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
  { id: 'store-stock', title: 'Main store · its stock', note: 'A department with Stock only; Send beside Receive and Count; Low at pharmacies shows what to send without being asked.', Page: StoreStock },
  { id: 'store-send', title: 'Main store · sending to a pharmacy', note: 'One step: to a pharmacy, lines with the first batch to expire and what the pharmacy has; sent is there.', Page: StoreSend },
  { id: 'store-arrived', title: 'Pharmacy · what came from the store', note: 'In its movements beside a supplier\'s delivery and what was given; nothing to confirm.', Page: StoreArrived },
  { id: 'store-setup', title: 'Main store · its setup and the products', note: 'A setup of its own (pharmacy pack, Keep stock, no dispensing); the products one list for the clinic, a minimum per place.', Page: StoreSetup },
  { id: 'rad-order', title: 'Radiology · the doctor orders a CT', note: '/ct with +c, urgent and the question; the facts before contrast shown, never a stop; pregnant optional here.', Page: RadOrder },
  { id: 'rad-walkin', title: 'Radiology · a walk-in', note: 'The bench\'s two steps; what for is /xr /us /ct /mri plus the exams asked for most, and what to tell the patient.', Page: RadWalkIn },
  { id: 'rad-list', title: 'Radiology · the Scan list', note: 'One list for every room, by kind; ward beds, walk-ins, the marks to act on, booked times.', Page: RadList },
  { id: 'rad-scan', title: 'Radiology · scanning', note: 'Who (two identifiers), which side (big), pregnant asked at the door, the views; Scanned in one key.', Page: RadScan },
  { id: 'rad-contrast', title: 'Radiology · scanning with contrast', note: 'eGFR, metformin, allergies from the record; under 30 the radiologist decides; the contrast given and any reaction go into the record.', Page: RadContrast },
  { id: 'rad-report', title: 'Radiology · the report', note: 'To report beside the report: the last study of the same part, a template, findings and impression, Sign.', Page: RadReport },
  { id: 'rad-critical', title: 'Radiology · a critical finding', note: 'Only a notice, as the lab\'s: tell the doctor now, then Sign.', Page: RadCritical },
  { id: 'rad-back', title: 'Radiology · what comes back to the doctor', note: 'To review: critical first; the report in the chart, impression first; a film-only X-ray asks for the doctor\'s reading.', Page: RadBack },
  { id: 'rad-settings', title: 'Radiology · settings', note: 'The exams (side, contrast, what to tell the patient, film only) and three switches.', Page: RadSettings },
  { id: 'doctor', title: "Doctor · what comes back", note: 'To review: the pharmacy\'s questions beside the results; Answer opens the chart, where the question is a card.', Page: DoctorSide },
  { id: 'book-desk', title: 'Bookings · the desk books', note: 'Book beside Send on the patient card: where, with whom (last doctor first), a session by number or by time, a note.', Page: BookDesk },
  { id: 'book-consult', title: 'Bookings · /book in the consult', note: '/book 3m: the nearest free places with the same doctor; Done saves it with the visit. Not a record entry.', Page: BookConsult },
  { id: 'book-today', title: 'Bookings · Booked today at the desk', note: 'Everyone expected across the clinics and benches it checks in for; Here is the ordinary check-in.', Page: BookToday },
  { id: 'book-calls', title: "Bookings · tomorrow's calls", note: 'The desk phones each booking and marks what they said; SMS and WhatsApp later.', Page: BookCalls },
  { id: 'book-queue', title: 'Bookings · the queue', note: 'Booked patients go in at their number or time; walk-ins fill the gaps (the core change you approved).', Page: BookQueue },
  { id: 'book-diary', title: 'Bookings · the clinic\'s Diary', note: 'A column per session; each place free, booked, here, seen, missed, walk-in or cancelled; Move and Cancel with a reason.', Page: BookDiary },
  { id: 'book-bench', title: 'Bookings · Radiology books a CT', note: 'The doctor\'s order waits in To book; Book folds out the CT room\'s times and what to tell the patient. A missed one: Book again.', Page: BookBench },
  { id: 'book-walkin', title: 'Bookings · a walk-in at Radiology', note: 'Who, what for, then when: Now (always offered) or a time; booked, the order is made now.', Page: BookWalkIn },
  { id: 'book-settings', title: 'Bookings · a clinic\'s settings', note: 'Sessions (by time or number, doctor or anyone, overbook and walk-in places), leave and closed days, what to tell the patient.', Page: BookSettings },
  { id: 'stay-map', title: 'Beds · who ticks what', note: 'Ward, ER, ICU, CCU, labour ward, dialysis: one board, one shared ward-nursing pack, four small packs on top; the department\'s pack order says whose two buttons a tile shows. Q1.', Page: StaysMap },
  { id: 'ward-board', title: 'Ward · the board', note: 'The base\'s tiles; the ward pack\'s line (NEWS2, obs due, a dose late, the balance) and, on the ward, its two buttons, Give and Obs.', Page: WardBoard },
  { id: 'ward-round', title: 'Ward · the drug round', note: 'Every dose due on the ward at this round; clean ones in one key; the facts beside a dose; a high-alert one asks who checked. Q4.', Page: WardRound },
  { id: 'ward-sheet', title: 'Ward · the treatment sheet and /rx in a stay', note: 'Drug × hour from the prescriptions and every given; a new /rx takes the ward\'s times and asks about the first dose.', Page: WardSheet },
  { id: 'ward-obs', title: 'Ward · obs and NEWS2', note: '/v asks air or oxygen and ACVPU, the server scores it, the ward\'s response as a notice, the next obs due. Q5.', Page: WardObs },
  { id: 'ward-fluids', title: 'Ward · fluid balance', note: '/in and /out, by the ward\'s shifts; the day\'s balance against the doctor\'s target; urine per kg per hour.', Page: WardFluids },
  { id: 'ward-handover', title: 'Ward · handover', note: 'A row per bed: the facts from the record, then what happened and what to do next. Q11.', Page: WardHandover },
  { id: 'ward-discharge', title: 'Ward · the discharge letter', note: 'Discharge folds out the letter: diagnoses, what was done, medicines for home, follow-up, words for the patient. Q12.', Page: WardDischarge },
  { id: 'ward-settings', title: 'Ward · settings', note: 'Dose times, the NEWS2 response, the high-alert list, the shifts.', Page: WardSettings },
  { id: 'er-triage', title: 'ER · triage at the door', note: 'Arrived, what brings them, vitals, five levels with a time to the doctor, police case; a resus bay offered first. Q6.', Page: ErTriage },
  { id: 'er-board', title: 'ER · the board', note: 'Bays and cubicles are the base\'s places, the chairs its “no bed” list (not triaged first, then by level); red when past the level\'s time. Q2.', Page: ErBoard },
  { id: 'er-where', title: 'ER · where the patient goes', note: 'The base\'s Discharge in the ER: home, a ward (its free beds), ICU, CCU, theatre, another facility, left, died; at Sign the ER stay ends and the ward\'s starts. Q3.', Page: ErWhereTo },
  { id: 'icu-board', title: 'ICU · the board', note: 'Critical care\'s words first (ventilated and the day, the infusion that holds the pressure, MAP, SOFA), then the ward pack\'s late dose; ICU chart and Goals on each tile, by the pack order.', Page: IcuBoard },
  { id: 'icu-chart', title: 'ICU · the hourly chart', note: 'Hours across: vitals, ventilator, infusions, in and out, bloods; carried settings faint; one column typed and signed each hour, the signer on the last row. Q7.', Page: IcuChart },
  { id: 'icu-goals', title: 'ICU · SOFA and the daily goals', note: 'The morning round: SOFA from the record, checked and scored by the server; the FAST HUGS BID goals, each line asked about; one Sign for both. Q8.', Page: IcuGoals },
  { id: 'ccu-chart', title: 'CCU · the same chart, its own rows', note: 'Rhythm, chest pain, ST fall after lysis, heparin by aPTT; the times from pain to needle and the angiography plan. Q14.', Page: CcuChart },
  { id: 'labour-board', title: 'Labour ward · the board', note: 'Delivery beds, postnatal beds and cots: G/P, weeks, cervix and hours, the alert line; after birth ObGyn\'s MEOWS (triggers); the baby her own tile.', Page: LabourBoard },
  { id: 'labour-partograph', title: 'Labour ward · the partograph', note: 'The cervix and the head against the alert and action lines; the baby\'s heart, liquor and moulding, contractions, the mother, the drugs; past the alert line only a notice. Q9.', Page: LabourPartograph },
  { id: 'labour-birth', title: 'Labour ward · the birth', note: 'Who delivered, how, perineum, third stage, blood loss; the baby: sex, weight, Apgar, breathing, vitamin K and hepatitis B, his own record and a cot beside her; twins in the same Done. Q10.', Page: LabourBirth },
  { id: 'hd-unit', title: 'Dialysis · the unit today', note: 'Shift 2 at 14:10, chairs on the base\'s board: time left, fluid off against the target, last BP. Who is due is the pack\'s own rows from the schedule; Start = Admit here, End = Discharge (Q2).', Page: HdUnit },
  { id: 'hd-session', title: 'Dialysis · the session', note: 'Before (weights, access, the fluid to take off), the standing prescription with the dry weight, readings every 30 min (arterial, venous, TMP), events, the unit\'s drugs.', Page: HdSession },
  { id: 'hd-schedule', title: 'Dialysis · the schedule and monthly bloods', note: 'Each chair\'s two patients by day (Sat/Mon/Wed, Sun/Tue/Thu); a one-off move keeps the pattern; HBV and HCV chairs apart; Kt/V, URR, Hb, virology due. Q13.', Page: HdSchedule },
]

export function Pictures() {
  const [id, setId] = useState(() => location.hash.slice(1))
  useEffect(() => { const f = () => setId(location.hash.slice(1)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const i = LIST.findIndex((p) => p.id === id)
  if (i < 0) return <div className="mx-auto grid max-w-2xl gap-3 p-6 text-14">
    <p className="text-18 font-semibold text-fg">Pictures · pharmacy, laboratory, radiology, bookings and the departments of beds</p>
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
