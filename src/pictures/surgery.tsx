// Surgery, theatre and anaesthesia, drawn with the last group (2026-10-08, proposed by Claude, awaiting the owner). clinics.tsx holds the shared parts.
// Three packs, each ticked where its work is done: surgery (the clinic's chart, the operation note), theatre (/op and the operations, the
// theatre list, the WHO checklist) and anaesthesia (the pre-op assessment, the anaesthetic record, recovery's line on the base's board).
// The clinic and the pre-op clinic see Reda Abdelhady (a right inguinal hernia); the theatre's pictures follow Ghada Sharaf through a
// laparoscopic cholecystectomy, from the list to recovery and back to the ward.
import type { ReactNode } from 'react'
import { Printer } from 'lucide-react'
import { Button, Card, Chip, Input, Kbd, ScreenFrame, Tag, Textarea, cn, type ScreenView, type Tone } from '@core/ui'
import { Arabic } from './kit'
import { Ask, Board, Chips, Grid, Keys, Label, Line, Page, Rec, Row, Signed, Table, Under, Unsigned, V, Visit, Word, noop, type Bed, type GridRow, type Pic } from './clinics'
import { Stay } from './stays'

const HESHAM = 'Dr. Hesham Abdelaal', MONA = 'Dr. Mona Tawfik', SHERINE = 'Dr. Sherine Rashad', BASSEM = 'Dr. Bassem Halim', AYMAN = 'Dr. Ayman Barakat', IMAN = 'Iman Zidan'
const reda: [string, string] = ['Reda Abdelhady', '58 y · M · #10412']
const ghada: [string, string] = ['Ghada Sharaf', '45 y · F · #10377 · 78 kg']
const noAllergy = <span className="text-12 text-faint">No known allergies</span>
const theatreTabs = ['Theatre list']
const faint = (t: string) => <span className="text-12 text-faint">{t}</span>

/** the side, as a row says it */
const Side = ({ s }: { s: string }) => <span className="rounded-sm bg-accent-soft px-1 text-11 font-semibold uppercase tracking-wide text-accent">{s}</span>
/** a row of choices in a card: its label, the chips (those in `on` chosen), a hint */
function Choose({ k, opts, on = [], hint, check }: { k: string; opts: string[]; on?: number[]; hint?: ReactNode; check?: boolean }) {
  return <div className="flex flex-wrap items-center gap-1.5 px-1 text-13"><span className="w-32 shrink-0 text-12 text-faint">{k}</span>{opts.map((o, i) => <Chip key={o} on={on.includes(i)} variant={check ? 'check' : 'solid'} onClick={noop}>{o}</Chip>)}{hint && <span className="text-12 text-faint">{hint}</span>}</div>
}
/** a boxed part of a card under the line */
const Box = ({ title, children }: { title: string; children: ReactNode }) => <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5"><Label>{title}</Label>{children}</div>
/** a line inside a box: a small label, then what it says */
const Say = ({ k, children }: { k: string; children: ReactNode }) => <div className="flex flex-wrap items-center gap-1.5 text-13"><span className="w-28 shrink-0 text-12 text-faint">{k}</span>{children}</div>
/** a labelled field of the operation note */
const Field = ({ k, children }: { k: string; children: ReactNode }) => <div className="grid gap-1 px-1"><span className="text-12 text-faint">{k}</span>{children}</div>

// ── 1 · the Surgery clinic: the decision to operate ──
export function SurgClinic() {
  const risks = ['bleeding, bruising', 'wound infection · about 1 in 50', 'the hernia comes back · about 1 in 100', 'groin pain for months · about 1 in 10', 'numbness by the scar', 'harm to the testis · rare', 'trouble passing urine']
  const record = <>
    <Chips on="Surgery" lead={[['Summary'], ['Surgery', '1 before']]} base={[['Problems', '4'], ['Medicines', '6']]} more={4} />
    <Rec title="Summary" folded="BP 136/84 · BMI 32 · HbA1c 7.6 ↑ · aspirin, metformin, empagliflozin" />
    <Rec title="Surgery"><Row k="Before">open appendicectomy 1989 · a general anaesthetic, no problems he knows of</Row><Row k="Planned">none yet</Row></Rec>
    <Rec title="Problems" count={4}><Row k="Today">Right inguinal hernia, reducible {faint('K40.9')}</Row><Row k="Since 2015">Type 2 diabetes {faint('E11.9')}</Row>
      <Row k="Since 2012">Hypertension {faint('I10')}</Row><Row k="2022">Coronary artery disease, a stent to the LAD {faint('I25.1')}</Row></Rec>
    <Rec title="Medicines" count={6} folded="aspirin 75 · metformin 1 g twice · empagliflozin 10 · valsartan 160 · amlodipine 5 · atorvastatin 40" />
    <Rec title="Results" count={3} folded="HbA1c 7.6 % ↑ (Aug) · creatinine 1.0 · Hb 14.2" /></>
  return <Visit dept="Surgery clinic" user={HESHAM} who={reda} where="In consult · 11 min" safety={noAllergy} record={record}>
    <Signed at="10:14" by={HESHAM} title="History and examination"><p>Right groin swelling for 8 months, bigger on standing, aches after work; never stuck, no vomiting.</p>
      <p>Reducible right inguinal swelling with a cough impulse, not into the scrotum; the left side and both testes normal.</p></Signed>
    <Line>/op lichtenstein right</Line>
    <Under>
      <div className="flex flex-wrap items-center gap-3 px-1"><div className="grid min-w-0 flex-1 gap-0.5"><b className="text-14 font-semibold text-fg">Inguinal hernia repair · open, with mesh (Lichtenstein)</b>
          <span className="text-12 text-muted">from the Theatre's operations · usual time 60 min · it has a side, so the side is asked</span></div>
        <div className="grid w-32 place-items-center rounded-lg bg-surface px-2 py-2 text-center ring-2 ring-accent"><span className="text-22 font-bold uppercase tracking-wide text-accent">Right</span><span className="text-12 text-muted">groin</span></div></div>
      <Choose k="Side" opts={['Left', 'Right', 'Both']} on={[1]} hint="typed “right”; with no side typed, the card asks it first" />
      <Choose k="Priority" opts={['Elective', 'Urgent', 'Emergency']} on={[0]} hint="elective: on the list by weeks waiting" />
      <Choose k="Surgeon" opts={[HESHAM, MONA, 'whoever has the list']} on={[0]} />
      <Choose k="Anaesthesia wanted" opts={['General', 'Spinal', 'Local', 'The anaesthetist decides']} on={[3]} />
      <Choose k="Stay" opts={['Day case', 'Admitted']} on={[0]} hint="home the same evening if well" />
      <Box title="Before the operation"><Say k="Tests"><span className="font-mono text-12 text-fg">#preop over 50</span>{['CBC', 'PT/INR', 'creatinine', 'potassium', 'glucose', 'ECG'].map((t) => <Chip key={t} on variant="check" onClick={noop}>{t}</Chip>)}
          {faint("the clinic's preset · HbA1c done in Aug, left out")}</Say>
        <Say k="From his record"><Tag tone="warn">aspirin 75 · stent 2022</Tag><Tag tone="warn">empagliflozin</Tag><Tag>BMI 32</Tag>{faint('for the pre-op clinic to weigh; shown, never a stop')}</Say>
        <Say k="Pre-op clinic"><span className="text-fg">Thu 15 Oct · 10:00</span>{faint('the booking')}</Say></Box>
      <Box title="Consent · the risks told (this operation's list)"><div className="flex flex-wrap gap-1.5">{risks.map((r) => <Chip key={r} on variant="check" onClick={noop}>{r}</Chip>)}</div>
        <p className="flex flex-wrap items-center gap-2 text-13"><Button size="sm" variant="outline"><Printer />Print the form</Button>
          <Arabic className="text-13">إقرار بالموافقة على عملية إصلاح فتق إربي أيمن بشبكة</Arabic><Tag tone="warn" className="ms-auto">signed paper not scanned yet</Tag></p>
        <p className="text-12 text-faint">He signs the printed form; it is scanned into his Documents, and from then the theatre list says “consent”. The anaesthetic's risks are the pre-op clinic's.</p></Box>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the operation, its tests and the booking</Keys></Under>
    <Unsigned n={4}><p className="text-fg">Operation → Theatre · Inguinal hernia repair, open mesh <Side s="right" /> · elective · day case · {HESHAM} · the anaesthetist decides · 7 risks told</p>
      <p className="text-fg">CBC · PT/INR · creatinine · potassium · glucose → Laboratory {faint('5 orders')}</p>
      <p className="text-fg">ECG → Cardiology</p>
      <p className="text-fg">Next visit · Pre-op clinic · Thu 15 Oct 10:00 {faint('the booking')}</p></Unsigned>
    <p className="text-12 text-faint">/op is the theatre pack's order word, offered here because the Theatre works for the Surgery clinic (rule 1); it searches only the Theatre's operations, each with its usual time, whether it has a side and the risks to tell (the Theatre's settings). At Done the case joins the Theatre's To schedule list. The tests are the laboratory's preset; the signed form is a scan in Documents (the base's note, kind scan); the pre-op visit is the bookings pack's. The surgery pack's banner words appear once an operation is planned (“for op · Sun 25 Oct”).</p>
    <Ask n={41}>The operation as the base's order to the Theatre, extended by the theatre pack (the side, the anaesthesia wanted, day case or admitted, the usual time, the risks told), through the order door asked for radiology (§5.5 a): the Theatre answers it with steps (scheduled, sent for, anaesthesia, operating, recovery, back), the clinic's order line says where it stands, and the theatre list is its open orders (drawn). The other way: the surgery pack's own “decision to operate”, not an order; the theatre keeps its list apart, and the chart hears nothing back until the operation note.</Ask></Visit>
}

// ── 2 · the Theatre's own screen: today's list by room, and To schedule ──
interface Case { at: string; who: string; age: string; op: string; side?: string; team: [string, string]; asa: string; state: string; tone?: Tone; since: string; parts: number; next?: string; tag?: ReactNode }
const Parts = ({ n }: { n: number }) => <span className="flex gap-1">{['In', 'Time out', 'Out'].map((p, i) =>
  <span key={p} className={cn('whitespace-nowrap rounded-sm px-1 text-11', i < n ? 'bg-ok-soft font-medium text-ok' : 'text-faint ring-1 ring-inset ring-line')}>{i < n && '✓ '}{p}</span>)}</span>
const cols: [string, string][] = [['Time', '3.5rem'], ['Patient', '9rem'], ['Operation', ''], ['Surgeon · anaesthetist', '10rem'], ['ASA', '2.75rem'], ['Where it stands', '12.5rem'], ['Checklist', '10.5rem'], ['', '6.5rem']]
const td = 'px-2 py-2'
function Room({ head, sub, rows }: { head: string; sub: string; rows: Case[] }) {
  return <Card className="overflow-x-auto">
    <p className="flex flex-wrap items-baseline gap-2 px-3 pt-3"><b className="text-14 font-semibold text-fg">{head}</b><span className="text-12 text-muted">{sub}</span></p>
    <table className="mt-1 w-full table-fixed border-collapse text-13"><colgroup>{cols.map(([h, w]) => <col key={h} style={w ? { width: w } : undefined} />)}</colgroup>
      <thead><tr>{cols.map(([h]) => <th key={h} className="px-2 py-1.5 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.who} className="border-t border-line align-top"><td className={cn(td, 'font-mono text-12 text-muted tnum')}>{r.at}</td><td className={td}><span className="block font-medium text-fg">{r.who}</span><span className="text-12 text-muted">{r.age}</span></td>
        <td className={td}><span className="flex flex-wrap items-center gap-1.5 text-fg">{r.tag}{r.op}{r.side && <Side s={r.side} />}</span></td><td className={cn(td, 'text-12')}><span className="block text-fg">{r.team[0]}</span><span className="text-muted">{r.team[1]}</span></td><td className={cn(td, 'text-fg tnum')}>{r.asa}</td>
        <td className={td}><Tag tone={r.tone}>{r.state}</Tag><span className="block text-12 text-muted">{r.since}</span></td><td className={td}><Parts n={r.parts} /></td><td className={cn(td, 'text-end')}>{r.next && <Button size="sm" variant="outline">{r.next}</Button>}</td>
      </tr>)}</tbody></table></Card>
}
export function TheatreList() {
  const t1: Case[] = [ { at: '08:30', who: 'Ghada Sharaf', age: '45 F', op: 'Laparoscopic cholecystectomy', team: [HESHAM, SHERINE], asa: 'II', state: 'recovery', tone: 'ok', since: 'Bay 1 since 09:55 · knife 08:55–09:40', parts: 3 },
    { at: '10:15', who: 'Amr Nassar', age: '36 M', op: 'Inguinal hernia repair, open mesh', side: 'right', team: [MONA, SHERINE], asa: 'I', state: 'anaesthesia', tone: 'info', since: 'spinal at 10:22', parts: 1, next: 'Time out' },
    { at: '11:45', who: 'Samah Eldib', age: '39 F', op: 'Excision of breast lump', side: 'left', team: [MONA, SHERINE], asa: 'I', state: 'sent for', tone: 'accent', since: '10:25 · Surgical Ward, Bed 4', parts: 0, next: 'Arrived' },
    { at: '13:00', who: 'Zeinab Mahran', age: '50 F', op: 'Total thyroidectomy', team: [HESHAM, SHERINE], asa: 'II', state: 'waiting', since: 'Surgical Ward, Bed 9 · fasting since 06:00', parts: 0, next: 'Send for' },]
  const t2: Case[] = [ { at: '08:30', who: 'Yara Abdelsalam', age: '7 F · 23 kg', op: 'Closed reduction and K-wires, supracondylar fracture', side: 'left', team: [AYMAN, BASSEM], asa: 'I', state: 'recovery', tone: 'ok', since: 'Bay 3 since 09:40', parts: 3 },
    { at: '10:00', who: 'Fawzy Darwish', age: '34 M', op: 'Plate fixation, distal radius fracture', side: 'right', team: [AYMAN, BASSEM], asa: 'I', state: 'operating', tone: 'info', since: 'knife 10:12', parts: 2, next: 'Sign out' },
    { at: '12:00', who: 'Atef Zaher', age: '66 M', op: 'Total knee replacement', side: 'left', team: [AYMAN, BASSEM], asa: 'III', state: 'waiting', since: 'Orthopaedic Ward, Bed 2 · 2 units cross-matched', parts: 0, next: 'Send for' },]
  const er: Case[] = [{ at: '—', who: 'Ziad Hafez', age: '23 M', op: 'Laparoscopic appendicectomy', tag: <Tag tone="danger">emergency</Tag>, team: [MONA, BASSEM], asa: 'I E', state: 'waiting', tone: 'warn', since: 'from the ER at 10:10 · Theatre 2 next, about 11:15', parts: 0, next: 'Send for' }]
  const who = (n: string, a: string) => <b key="n" className="font-medium">{n} <span className="font-normal text-muted">{a}</span></b>
  const fit = (t: string, warn?: boolean) => <span key="f" className={warn ? 'text-warn' : 'text-ok'}>{t}</span>
  const sched = (on?: boolean) => <Button key="b" size="sm" variant={on ? 'primary' : 'outline'}>Schedule</Button>
  const toDo: ReactNode[][] = [ [who('Aya Shehata', '29 F'), 'Laparoscopic cholecystectomy', <Tag key="p" tone="warn">urgent</Tag>, HESHAM, '1 wk', fit('fit · ASA I'), 'scanned', 'admitted', sched(true)],
    [who('Kamal Fouda', '47 M'), 'Haemorrhoidectomy', 'elective', MONA, '14 wk', fit('fit · ASA I'), 'scanned', 'day case', sched()],
    [who('Hamed Sakr', '70 M'), <span key="o">Inguinal hernia repair, open mesh <Side s="left" /></span>, 'elective', HESHAM, '11 wk', fit('not yet · Hb 9.8', true), 'scanned', 'admitted', sched()],
    [who('Nagwa Sabry', '52 F'), 'Umbilical hernia repair, mesh', 'elective', MONA, '6 wk', fit('fit · ASA II'), fit('to scan', true), 'day case', sched()],
    [who('Reda Abdelhady', '58 M'), <span key="o">Inguinal hernia repair, open mesh <Side s="right" /></span>, 'elective', HESHAM, '1 day', 'booked 15 Oct', fit('to scan', true), 'day case', sched()],]
  const slots: [string, string, boolean][] = [['Sat 10 Oct · Theatre 1', '1 h 50 free · from 12:40', true], ['Mon 12 Oct · Theatre 1', '3 h free · from 11:30', false], ['Thu 15 Oct · Theatre 1', '1 h 20 free · from 13:10', false]]
  return <Page dept="Theatre" user={IMAN} tabs={theatreTabs}>
    <ScreenFrame filters={<span className="flex flex-wrap gap-1.5">{['All rooms', 'Theatre 1', 'Theatre 2', 'Theatre 3'].map((r, i) => <Chip key={r} shape="pill" on={i === 0} onClick={noop}>{r}</Chip>)}</span>} date={<span className="flex items-center gap-2 text-14"><Button size="sm" variant="ghost">←</Button><b className="font-semibold text-fg">Thu 8 Oct · today · 10:30</b><Button size="sm" variant="ghost">→</Button></span>} action={<Button size="sm" variant="outline"><Printer />Print the list</Button>}>
      <Room head="Emergency · not yet in a room" sub="an /op marked emergency, from the ER's Where to or a ward" rows={er} />
      <Room head="Theatre 1 · General surgery" sub={`${HESHAM}'s list · 08:30–14:30 · 4 cases · 5 h 10 of 6 h booked`} rows={t1} />
      <Room head="Theatre 2 · Orthopaedics" sub={`${AYMAN}'s list · 08:30–14:30 · 3 cases`} rows={t2} />
      <Card className="flex flex-wrap items-baseline gap-2 px-3 py-2.5"><span aria-hidden className="text-11 text-faint">›</span><b className="text-14 font-semibold text-fg">Theatre 3 · Gynaecology</b><span className="text-12 text-muted">Dr. Lamiaa Nasr's list · 3 cases · 1 in recovery, 1 operating, 1 waiting</span></Card>
      <Card className="grid gap-1 p-3"><p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">To schedule</b><span className="text-12 text-muted">5 · by priority, then weeks waiting</span></p>
        <Table head={['Patient', 'Operation', 'Priority', 'Surgeon', 'Waiting', 'Pre-op', 'Consent', 'Stay', '']} rows={toDo} />
        <div className="grid gap-2 rounded-lg border border-line bg-sunken p-3"><p className="text-13 text-fg"><b className="font-medium">Aya Shehata</b> · usual time 75 min · sessions of {HESHAM}'s with that much free:</p>
          <div className="flex flex-wrap gap-2">{slots.map(([d, f, on]) => <button key={d} type="button" className={cn('grid rounded-lg px-3 py-1.5 text-start ring-1', on ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface ring-line')}><span className="text-13 font-medium text-fg">{d}</span><span className="text-12 text-muted">{f}</span></button>)}</div>
          <div className="flex flex-wrap items-center gap-2"><Button size="sm">Schedule · Sat 10 Oct · Theatre 1 · 12:40<Kbd className="ms-1">↵</Kbd></Button>{faint('the case leaves To schedule; her chart\'s order line reads “scheduled Sat 10 Oct”; the desk phones her')}</div></div></Card>
      <p className="text-12 text-faint">The theatre pack's own screen and the Theatre's only one for this work (rule 4). Each case is an /op order; where it stands is the Theatre's step on it, one key a step (Send for, Arrived, the three checklist parts, Out), the times from the anaesthetic record. ASA is the pre-op's; Pre-op and Consent are read from the record and only shown: a case not ready can still be scheduled. The rooms and their sessions are the theatre pack's settings.</p>
      <Ask n={42}>The theatre list as the theatre pack's own screen: rooms with sessions (a surgeon's list on a day), cases put in order by each operation's usual time, emergencies on top until a room takes them (drawn). The other way: the bookings pack's diary, each theatre a room of a bench with sessions by time, a case booked like a CT (the booking names the /op order); one diary for the clinic, but a booking holds a time, not a running order the list can shift as the day goes.</Ask></ScreenFrame></Page>
}

// ── 3 · the pre-op assessment ──
const fit2 = (t: string) => <span key="c" className="text-ok">{t}</span>
export function AnaesPreop() {
  const stop: ReactNode[][] = [['Aspirin 75 mg', fit2('continue, also on the day'), 'antiplatelet with a stent: continue'], ['Metformin 1 g twice', 'no dose on the morning of the operation', 'metformin: omit on the day'],
    ['Empagliflozin 10 mg', <b key="e" className="font-medium text-warn">stop 3 days before</b>, 'SGLT2 inhibitors: 3 days'], ['Valsartan 160 mg', 'no dose on the morning', 'ACE inhibitors, ARBs: omit on the day'],
    ['Amlodipine 5 mg', 'take on the morning with a sip of water', 'continue'], ['Atorvastatin 40 mg', 'continue', 'continue']]
  const record = <>
    <Chips on="Anaesthesia" lead={[['Summary'], ['Anaesthesia', 'today']]} base={[['Problems', '4'], ['Medicines', '6']]} more={4} />
    <Rec title="Summary" folded="BP 138/82 · BMI 32 · aspirin · for an inguinal hernia repair, right" />
    <Rec title="Anaesthesia"><Row k="Operation">Inguinal hernia repair, open mesh <Side s="right" /> · day case · the anaesthetist decides · {HESHAM}, 7 Oct</Row>
      <Row k="Before">general anaesthetic 1989 (appendicectomy), no problems · none in the family</Row></Rec>
    <Rec title="Results" count={8}><Table head={['Test', 'Result', 'When']} rows={[['Hb · platelets', '14.1 · 246', '12 Oct'], ['PT · INR', '12.8 s · 1.0', '12 Oct'], ['Creatinine · eGFR', '1.0 · 85', '12 Oct'], ['Potassium', '4.6', '12 Oct'],
        ['Glucose', <V key="g" f="high">152</V>, '12 Oct'], ['HbA1c', <V key="h" f="high">7.6 %</V>, 'Aug'], ['ECG', 'sinus 74 · Q in III, aVF as in 2022', '12 Oct']]} /></Rec></>
  return <Visit dept="Pre-op clinic" user={SHERINE} who={reda} where="In consult · pre-op · 16 min" safety={noAllergy} words={<Word>for op · hernia, right</Word>} record={record}>
    <Line>/preop</Line>
    <Under><p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Pre-op assessment · inguinal hernia repair, right · day case</b><span className="text-muted">not scheduled yet</span></p>
      <div className="grid gap-x-6 gap-y-0.5 px-1 sm:grid-cols-2"><Row k="Heart">stent 2022 · no chest pain · two floors without stopping (4 METs or more)</Row><Row k="Lungs">stopped smoking 2022 · no cough, no wheeze</Row>
        <Row k="Sleep" tone="warn">snores loudly · no pauses seen · not sleepy by day</Row><Row k="Diabetes">tablets only · HbA1c 7.6 · no lows</Row>
        <Row k="Bleeding">none · no blood thinner but aspirin</Row><Row k="Teeth, reflux">upper denture, removable · no reflux</Row></div>
      <Choose k="Airway · Mallampati" opts={['I', 'II', 'III', 'IV']} on={[2]} hint="mouth opening 4 cm · thyromental 6.5 cm · neck moves fully · neck 43 cm" />
      <Choose k="ASA" opts={['I', 'II', 'III', 'IV', 'V', 'VI', 'E']} on={[2]} hint="a class the anaesthetist chooses, not a score: heart disease with a stent" />
      <div className="grid gap-2 sm:grid-cols-2"><Box title="RCRI · /score rcri"><p className="flex items-baseline gap-2"><b className="text-18 font-semibold text-fg tnum">1</b><span className="text-13 text-fg">class II · about 1 in 100 (Lee 1999)</span></p>
          <p className="text-12 text-muted">heart disease yes · high-risk operation, heart failure, stroke, insulin, creatinine over 2: no</p></Box>
        <Box title="STOP-BANG · /score stopbang"><p className="flex items-baseline gap-2"><b className="text-18 font-semibold text-warn tnum">5</b><span className="text-13 text-warn">of 8 · high risk (2008)</span></p>
          <p className="text-12 text-muted">snores, pressure, over 50, neck over 40 cm, male yes · tired, seen to stop, BMI over 35 (32) no</p></Box></div>
      <Box title="His medicines before the operation · from the clinic's list"><Table head={['Medicine', 'What to do', 'The rule']} rows={stop} first="10.5rem" />
        <p className="text-12 text-faint">The list is the clinic's (a setting): warfarin 5 days · clopidogrel 5–7 days · apixaban, rivaroxaban 2 days · metformin on the day · SGLT2 inhibitors 3 days · ACE inhibitors and ARBs on the day. The dates are written when the case is scheduled. Shown only; the anaesthetist changes any line.</p>
        <p className="grid gap-0.5"><span className="text-12 text-muted">Printed for him:</span><Arabic>لا تأخذ الميتفورمين ولا الفالسارتان صباح يوم العملية. أوقف الإمباجليفلوزين قبل العملية بثلاثة أيام. استمر على الأسبرين. لا أكل قبل العملية بست ساعات، والماء مسموح حتى ساعتين قبلها.</Arabic></p></Box>
      <Choose k="Plan" opts={['General · LMA', 'General · tube', 'Spinal', 'Local and sedation']} on={[2]} hint="heavy bupivacaine 0.5 % 3 mL · LMA if it fails · least opioid" />
      <Choose k="Verdict" opts={['Fit', 'Not yet']} on={[0]} hint="fit for spinal as a day case; if general, one night with oximetry (STOP-BANG 5)" />
      <Choose k="Anaesthesia consent" check opts={['headache after a spinal · about 1 in 100', 'low blood pressure', 'the spinal may not work: a general', 'lasting nerve damage · very rare']} on={[0, 1, 2, 3]} />
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the assessment · the two scores were typed on the line before</Keys></Under>
    <Unsigned n={4}><p className="text-fg">Pre-op assessment · ASA III · Mallampati III · fit · spinal planned · day case · his medicines before the operation</p>
      <p className="text-fg">RCRI 1 · class II (Lee 1999)</p><p className="text-fg">STOP-BANG 5 · high risk (2008)</p><p className="text-fg">Anaesthesia consent · 4 risks told · the signed form to scan</p></Unsigned>
    <p className="text-12 text-faint">The pre-op is the anaesthesia pack's own entry (what matters from the history, the airway, ASA, the plan, fit or not yet, what to stop); RCRI and STOP-BANG are the base's score through /score, declared tables the server adds up; the tests are the base's results. “Fit” fills the theatre list's Pre-op column. The same card works on a ward, the evening before.</p>
    <Ask n={43}>The medicines to stop as part of the pre-op entry and the patient's printed sheet, his medicine list left as it is until the day (drawn). The other way: each written into the medicine list as a change (held from a date, started again after), so the ward's drug round knows by itself — a base change, since a medicine cannot be held from a future date today.</Ask></Visit>
}
// ── 4 · the WHO Surgical Safety Checklist on the case ──
type Item = [said: ReactNode, who: string, not?: string]
function Part({ title, when, items, signed, children }: { title: string; when: string; items: Item[]; signed?: string; children?: ReactNode }) {
  return <Card className={cn('grid content-start gap-2 p-3', !signed && 'ring-1 ring-accent-line')}>
    <p className="flex flex-wrap items-baseline gap-2"><b className="text-14 font-semibold text-fg">{title}</b><span className="text-12 text-faint">{when}</span></p>
    <ul className="grid gap-1.5">{items.map(([s, who, not], i) => <li key={i} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-1.5 text-13"><span aria-hidden className={not ? 'text-warn' : 'text-ok'}>{not ? '✕' : '✓'}</span><span><span className="text-fg">{s}</span>{not && <span className="block text-12 text-warn">not done · {not}</span>}<span className="block text-11 text-faint">{who}</span></span></li>)}</ul>
    {children}
    {signed ? <p className="border-t border-line pt-2 text-12 text-muted">Signed {signed}</p>
      : <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2"><Button size="sm">Sign out<Kbd className="ms-1">⌘↵</Kbd></Button>{faint('by the three who said it')}</div>}</Card>
}
export function TheatreChecklist() {
  const signIn: Item[] = [['Name, birth date, operation and consent confirmed with her', IMAN], ['Site marked: no side', IMAN], ['Anaesthesia machine and drugs checked', SHERINE], ['Pulse oximeter on and working', SHERINE],
    ['Allergy: none known', IMAN], ['Difficult airway or aspiration risk: no · Mallampati II', SHERINE], ['Blood loss over 500 mL expected: no · group and save done', SHERINE]]
  const timeOut: Item[] = [['Everyone said their name and role', 'all three'], ['Patient, operation, where the cut will be', HESHAM], ['Antibiotic in the last 60 min: cefazolin 2 g at 08:45', `${SHERINE} · from the record`],
    ['Surgeon: the critical steps, about 45 min, little blood loss', HESHAM], ['Anaesthetist: no concerns', SHERINE], ['Sterility indicators checked · camera and insufflator ready', IMAN], ['Imaging on the screen', HESHAM, 'the ultrasound is a paper report in her file']]
  const signOut: Item[] = [['Operation as done: laparoscopic cholecystectomy', IMAN], ['Equipment problems: none', IMAN], ['For recovery: sickness risk, dexamethasone and ondansetron given', SHERINE]]
  const ok = (v: string) => <span key="k" className="text-ok">{v} ✓</span>
  return <Page dept="Theatre" user={IMAN} tabs={theatreTabs}>
    <ScreenFrame><Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
        <span className="text-18 font-semibold text-fg">{ghada[0]}</span><span className="text-13 text-muted tnum">{ghada[1]}</span><span className="text-14 text-fg">Laparoscopic cholecystectomy</span><Tag>no side</Tag>
        <span className="text-13 text-muted">Theatre 1 · case 1 · scrub {IMAN}</span><Tag tone="info" className="ms-auto">operating · skin closed 09:40</Tag></Card>
      <div className="grid gap-3 lg:grid-cols-3"><Part title="Sign in" when="before induction · 08:37" items={signIn} signed={`08:37 · ${IMAN}, ${SHERINE}`} />
        <Part title="Time out" when="before the cut · 08:53" items={timeOut} signed={`08:53 · ${HESHAM}, ${SHERINE}, ${IMAN}`} />
        <Part title="Sign out" when="before she leaves · now" items={signOut}>
          <Table head={['Count', 'Before', 'Added', 'After']} rows={[['Swabs', '5', '0', ok('5')], ['Needles', '2', '0', ok('2')], ['Instruments · lap set 1', '32', '0', ok('32')]]} />
          <div className="grid gap-0.5 text-13"><span className="text-12 text-faint">Specimen</span><span className="flex flex-wrap items-center gap-1.5 text-fg">gallbladder, in formalin · label read aloud <Tag tone="accent">/lab histo → Laboratory</Tag></span></div>
          <div className="grid gap-0.5 text-13"><span className="text-12 text-faint">Implants</span><span className="text-fg">titanium clips ML · 3 left in, 5 used · lot 24K118</span></div></Part></div>
      <p className="text-12 text-faint">Each part is the theatre pack's own entry, signed by who said it, when it is said. The antibiotic and its time are read from the anaesthetic record's given; the specimen is a /lab order to the Laboratory's histopathology, signed with Sign out; the implants and their lot are kept here and the operation note reads them. A part not done says why; nothing waits for it, and a count that does not add up is a notice for the surgeon, never a stop. The items are WHO's 2009 list, which the clinic may add to (a setting).</p>
      <Ask n={44}>Each part (Sign in, Time out, Sign out) its own signed set, at the moment it is said, by those who said it (drawn): the list shows how far the case has come, and a time out signed after the knife shows as late. The other way: one checklist ticked as the case goes and signed once at the end; fewer signatures, but nothing is written until she leaves.</Ask></ScreenFrame></Page>
}

// ── 5 · the anaesthetic record: a 5-minute grid ──
const kept = (v: string) => <span className="text-faint">{v}</span>
const NUM = '①②③④⑤⑥⑦⑧⑨⑩⑪'
export function AnaesRecord() {
  const times = ['08:40', '08:45', '08:50', '08:55', '09:00', '09:05', '09:10', '09:15', '09:20', '09:25', '09:30', '09:35', '09:40', '09:45', '09:50']
  const at = (cells: Record<number, ReactNode>) => times.map((_, i) => cells[i] ?? '')
  const ev = (t: string) => <span className="text-14 text-accent">{t}</span>
  const rows: GridRow[] = [ { label: 'Events', cells: at({ 0: ev('①②'), 2: ev('③'), 3: ev('④⑤'), 10: ev('⑥⑦'), 12: ev('⑧⑨'), 13: ev('⑩'), 14: ev('⑪') }) },
    { group: 'Vitals', label: 'Heart rate', cells: ['84', '92', '76', '74', '88', '84', '80', '78', '76', '76', '74', '76', '80', '94', '88'] },
    { label: 'BP', unit: 'mmHg', cells: ['136/82', { v: '96/54', f: 'low' }, '112/66', '124/76', '146/90', '138/84', '128/78', '122/74', '120/72', '118/70', '120/72', '116/70', '124/76', '142/86', '136/82'] },
    { label: 'SpO₂', unit: '%', cells: ['100', '99', '99', '99', '98', '98', '99', '99', '99', '99', '99', '99', '99', '98', '98'] },
    { label: 'EtCO₂', unit: 'mmHg', cells: ['', '33', '34', '35', '39', '41', '40', '38', '37', '37', '36', '35', '36', '38', ''] },
    { label: 'Temperature', unit: '°C', cells: at({ 0: '36.6', 6: '36.4', 12: '36.2' }) },
    { group: 'Gas', label: 'Sevoflurane', unit: '%', cells: ['', '2.0', kept('2.0'), kept('2.0'), '2.2', kept('2.2'), '2.0', kept('2.0'), kept('2.0'), kept('2.0'), '1.8', '1.5', 'off', '', ''] },
    { label: 'FiO₂', cells: times.map((_, i) => i === 0 ? '1.0' : i === 1 ? '0.5' : i <= 11 ? kept('0.5') : i === 12 ? '1.0' : i === 13 ? kept('1.0') : '') },
    { group: 'Drugs', label: 'Fentanyl', unit: 'mcg', cells: at({ 0: '100', 8: '50' }) }, { label: 'Propofol', unit: 'mg', cells: at({ 0: '150' }) },
    { label: 'Rocuronium', unit: 'mg', cells: at({ 0: '50', 8: '10' }) }, { label: 'Ephedrine', unit: 'mg', cells: at({ 1: '6' }) }, { label: 'Cefazolin', unit: 'g', cells: at({ 1: '2' }) },
    { label: 'Dexamethasone', unit: 'mg', cells: at({ 1: '8' }) }, { label: 'Paracetamol', unit: 'g', cells: at({ 10: '1' }) }, { label: 'Ondansetron', unit: 'mg', cells: at({ 11: '4' }) },
    { label: 'Neostigmine · atropine', unit: 'mg', cells: at({ 12: '2.5 · 1' }) },
    { group: 'In and out', label: "Ringer's lactate", unit: 'mL', cells: at({ 1: '200', 4: '400', 8: '600', 12: '800', 14: '900' }) }, { label: 'Blood loss', unit: 'mL', cells: at({ 14: '30' }) },]
  const stamps: [string, string][] = [['In theatre', '08:35'], ['Anaesthesia start', '08:38'], ['Knife to skin', '08:55'], ['End of surgery', '09:40'], ['Anaesthesia end', '09:50']]
  const events = ['08:41 induction', '08:43 tube 7.0 cuffed, 21 cm at the lips · Mac 3 · grade 1 · first try', '08:53 time out', '08:55 knife to skin', '08:57 CO₂ in · 12 mmHg', '09:32 gallbladder out, in a bag', '09:34 CO₂ out', '09:40 skin closed', '09:42 reversal', '09:47 tube out, awake', '09:50 anaesthesia end']
  const drugs: [string, string][] = [['Propofol 150 mg', '1.9 mg/kg'], ['Fentanyl 100 + 50 mcg', '1.9 mcg/kg in all'], ['Rocuronium 50 + 10 mg', '0.6 mg/kg to intubate'], ['Cefazolin 2 g', '10 min before the knife'],
    ['Ephedrine 6 mg', 'for BP 96/54 after induction'], ['Dexamethasone 8 mg · ondansetron 4 mg', 'against sickness'], ['Paracetamol 1 g', 'over 15 min'], ['Neostigmine 2.5 mg · atropine 1 mg', 'reversal at 09:42']]
  return <Stay dept="Theatre" user={SHERINE} who={ghada} where="Theatre 1 · case 1 · out in 2 min" safety={noAllergy} words={<><Tag>ASA II</Tag><Tag tone="info">GA · tube 7.0</Tag></>} actions={<Button size="sm">Sign the record<Kbd className="ms-1">⌘↵</Kbd></Button>} wide>
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line bg-surface px-3 py-2 text-13"><b className="font-semibold text-fg">Laparoscopic cholecystectomy · general, tube</b>{stamps.map(([k, v]) => <span key={k} className="flex items-baseline gap-1.5 border-s border-line ps-2"><span className="text-muted">{k}</span><b className="font-semibold text-fg tnum">{v}</b></span>)}
      {faint('to the theatre list and the operation note')}</div>
    <div className="flex flex-wrap items-center gap-2"><Label>Anaesthetic record · every 5 min</Label><span className="ms-auto text-12 text-faint">the 09:50 column is being typed</span></div>
    <Grid times={times} rows={rows} now={14} first="12rem" />
    <p className="text-12 text-faint">Faint: a setting carried on from the column before, not typed again. Ringer's lactate: the total so far. Urine: no catheter, passed at 08:15.</p>
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="grid content-start gap-1 p-3"><Label>Events</Label><ol className="grid gap-0.5 text-13 text-fg">{events.map((e, i) => <li key={e} className="flex gap-1.5"><span className="text-accent">{NUM[i]}</span><span className="tnum">{e}</span></li>)}</ol></Card>
      <Card className="grid content-start gap-1 p-3"><Label>Drugs · for 78 kg</Label>{drugs.map(([d, w]) => <p key={d} className="flex flex-wrap items-baseline justify-between gap-x-2 text-13"><span className="text-fg">{d}</span><span className="text-12 text-muted">{w}</span></p>)}
        <p className="text-12 text-faint">Each dose is the base's given with its time; the dose per kg is shown, never a stop.</p></Card>
      <Card className="grid content-start gap-1 p-3"><Label>Airway, breathing, agent, fluids</Label><Row k="Airway">tube 7.0 cuffed · 21 cm · cuff 24 cmH₂O</Row><Row k="Breathing">volume control 450 mL × 12, × 14 from 09:05 (EtCO₂ 41)</Row>
        <Row k="Agent">sevoflurane in O₂ and air · 2 L/min</Row><Row k="Warming">forced air from 08:40</Row><Row k="In · out">Ringer's lactate 900 mL · blood loss 30 mL · no urine catheter</Row></Card></div>
    <Keys><Kbd>tab</Kbd> down the column · a blank keeps the last setting · <Kbd>↵</Kbd> the next column · a drug typed on a column takes its time · values typed today, a monitor feed later</Keys>
    <p className="text-12 text-faint">Each 5-minute column is the anaesthesia pack's type extending the base's vitals (heart rate, BP, SpO₂ and temperature are the base's keys; EtCO₂, the agent and FiO₂ the pack's); each drug is the base's given; the events, the airway, the fluids and the times are the record's own. Signed by the anaesthetist; the times move the case on the theatre list.</p>
    <Ask n={45}>The whole record as one set: the columns typed as the case goes (kept as drafts on this machine, as the composer's are), signed once by the anaesthetist at the end (drawn). The other way: each value its own entry, written as it is typed (as ICU Q7's other way), the record only drawing them by 5 minutes; nothing waits for the end, so a crash or a change of anaesthetist loses nothing, but each value is a signature.</Ask></Stay>
}

// ── 6 · the operation note, written in theatre ──
export function SurgOpnote() {
  const record = <>
    <Chips on="Surgery" lead={[['Summary'], ['Surgery', 'today']]} base={[['Problems', '2'], ['Medicines', '1']]} more={4} />
    <Rec title="Summary" folded="78 kg · ASA II · levothyroxine 100 · one night, home tomorrow" />
    <Rec title="Surgery"><Row k="Today">Laparoscopic cholecystectomy · Theatre 1 · knife 08:55, closed 09:40</Row><Row k="Decided">3 Sep · {HESHAM} · elective · one night · consent scanned 3 Sep</Row>
      <Row k="Why">biliary colic three times since May · US 20 Aug: many stones, wall 3 mm, CBD 5 mm</Row><Row k="Anaesthesia">general, tube · ASA II · {SHERINE}</Row>
      <Row k="Checklist">Sign in 08:37 · Time out 08:53 · Sign out 09:42</Row><Row k="Sent">gallbladder → Histopathology</Row><Row k="Implants">titanium clips ML · 3 left in · lot 24K118</Row></Rec>
    <Rec title="Problems" count={2} folded="Gallstones with biliary colic (K80.2) · Hypothyroidism (E03.9)" />
    <Rec title="Results" count={5} folded="liver tests normal 20 Aug · Hb 12.9 · TSH 2.1" /></>
  const steps = ["1. Open entry at the umbilicus, CO₂ 12 mmHg; 10 mm epigastric and two 5 mm right subcostal ports.", "2. Omentum freed from Hartmann's pouch.", "3. Calot's triangle opened; the critical view of safety seen.",
    '4. Cystic duct (2 + 1 clips) and artery (1 + 1) clipped and divided.', '5. Gallbladder off the liver bed with diathermy; no bile spilled; bed dry.', '6. Gallbladder out in a bag through the umbilicus.'].join('\n')
  return <Visit dept="Theatre" user={HESHAM} who={ghada} where="Theatre 1 · skin closed 09:40" safety={noAllergy} words={<Word>op today · lap chole</Word>} record={record} actions={<Button size="sm">Sign<Kbd className="ms-1">⌘↵</Kbd></Button>}>
    <Line>/opnote</Line>
    <Under><p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">Operation note · Laparoscopic cholecystectomy</b><span className="text-muted">{HESHAM}'s template for this operation · every line editable</span></p>
      <div className="grid gap-x-6 gap-y-0.5 px-1 sm:grid-cols-2"><Row k="Surgeon">{HESHAM}</Row><Row k="Assistant">Dr. Islam Gaber, resident</Row><Row k="Anaesthetist">{SHERINE} · general, tube</Row><Row k="Times">08:55–09:40 · 45 min</Row></div>
      <Field k="Why"><Input readOnly value="Symptomatic gallstones: biliary colic three times since May; many stones on ultrasound." /></Field>
      <Field k="Findings"><Textarea readOnly dense minRows={2} value="Distended gallbladder with many small stones; omentum stuck to Hartmann's pouch; cystic duct 4 mm, one cystic artery; liver normal." /></Field>
      <Field k="Steps · from the template"><Textarea readOnly dense minRows={6} value={steps} /></Field>
      <Field k="Closure"><Input readOnly value="Umbilical sheath 0 polyglactin; skin 3-0 subcuticular; bupivacaine 0.25 % 20 mL to the ports." /></Field>
      <Choose k="Blood loss" opts={['30 mL · from the record']} on={[0]} /><Choose k="Drain" opts={['None', 'Subhepatic 14 Fr']} on={[0]} />
      <Choose k="Complications" opts={['None', 'Bile spilled', 'Stones spilled', 'Bleeding', 'Converted to open']} on={[0]} />
      <Box title="From Sign out"><Say k="Specimen"><span className="text-fg">gallbladder → Histopathology</span>{faint('the /lab order, already signed')}</Say><Say k="Implants"><span className="text-fg">titanium clips ML · 3 left in · lot 24K118</span></Say></Box>
      <Keys><Kbd>tab</Kbd> the next part <Kbd>↵</Kbd> adds the note · <span className="font-mono">#postop lap chole</span> brings his post-op lines, each removable</Keys></Under>
    <Unsigned n={7} sign="Sign"><p className="text-fg">Procedure · Laparoscopic cholecystectomy · 08:55–09:40 · done · for gallstones (K80.2)</p>
      <p className="text-fg">Operation note · findings, six steps, closure · blood loss 30 mL · no drain · no complications</p>
      <p className="text-fg">Paracetamol 1 g IV every 6 hours · 48 hours</p><p className="text-fg">Ketorolac 30 mg IV every 8 hours · 48 hours</p><p className="text-fg">Ondansetron 4 mg IV every 8 hours if sick</p>
      <p className="text-fg">Plan · obs every 30 min for 2 hours, then every 4 hours · sips at 2 hours, light food tonight · walk this evening with help · home tomorrow if eating, walking, pain controlled</p>
      <p className="text-fg">Next visit · Surgery clinic · Thu 22 Oct · with the histopathology {faint('the booking')}</p></Unsigned>
    <p className="text-12 text-faint">The operation is the base's procedure (what, when from the anaesthetic record, why, done); the note is the surgery pack's operation note, a type extending the base's note (surgeon, assistant, findings, steps, closure, drain, complications; the specimen and the implants read from Sign out). The template is the surgeon's own for each operation (a setting); his post-op preset brings the base's /rx lines, a plan note and the bookings pack's next visit.</p>
    <Ask n={46}>The post-op orders signed by the surgeon with the note, in theatre (drawn): the ward finds them on her treatment sheet when she arrives. The other way: they go to the ward as drafts that the ward's doctor signs — a core change, since drafts live only on the writer's machine today and an order has no “draft” state.</Ask></Visit>
}

// ── 7 · Recovery: bays on the base's board ──
export function TheatreRecovery() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All bays', count: 5 }, { id: 'in', label: 'In', count: 3 }, { id: 'ready', label: 'Ready for the ward', count: 1 }, { id: 'free', label: 'Free', count: 2 }]
  const beds: Bed[] = [ { name: 'Bay 1', who: { name: 'Ghada Sharaf', sexAge: 'F 45', day: 1, clinician: SHERINE, reason: 'laparoscopic cholecystectomy', urgent: false }, line: ['in 30 min', { text: 'Aldrete 8 → 10', tone: 'ok' }, 'pain 2', { text: 'ready for the ward', tone: 'ok' }], buttons: ['Aldrete', 'Record'] },
    { name: 'Bay 2', who: { name: 'Marwa Shalaby', sexAge: 'F 33', day: 1, clinician: 'Dr. Karim Ashour', reason: 'laparoscopic ovarian cystectomy, right', urgent: false }, line: ['in 5 min', { text: 'Aldrete 6', tone: 'warn' }, 'O₂ 4 L/min', 'drowsy', 'pain 3'], buttons: ['Aldrete', 'Record'] },
    { name: 'Bay 3', who: { name: 'Yara Abdelsalam', sexAge: 'F 7', day: 1, clinician: BASSEM, reason: 'K-wires, left elbow', urgent: false }, line: ['in 45 min', 'Aldrete 9', 'pain 4', { text: 'vomited 10:05', tone: 'warn' }], buttons: ['Aldrete', 'Record'] },
    { name: 'Bay 4' }, { name: 'Bay 5' },]
  const ald: ReactNode[][] = [['Activity · moves all four limbs', '2', '2', '2'], ['Breathing · deep breaths, coughs', '2', '2', '2'], ['Circulation · BP within 20 of before', '2', '2', '2'],
    ['Conscious · fully awake', '1', '2', '2'], ['SpO₂ · over 92 % on air', '1', '1', '2'], [<b key="t" className="font-semibold">Total</b>, '8', '9', <b key="n" className="font-semibold text-ok">10</b>]]
  const ticks: ReactNode[][] = [['Surgery clinic', '✓ section, words', '/op offered', '—', '—'], ['Pre-op clinic', '—', '—', '✓ the pre-op', '—'], ['Theatre', '✓ the operation note', '✓ the list, the checklist', '✓ the record', '—'],
    ['Recovery', '—', '—', '✓ the tile line', '✓ doses, obs'], ['Surgical Ward', '✓ post-op day', '—', '✓ pre-op on the ward', '✓']]
  return <Page dept="Recovery" user="Rehab Seif" tabs={['Bays']}>
    <ScreenFrame views={views} view="all" onView={noop}>
      <Board beds={beds} />
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line"><p className="flex flex-wrap items-baseline gap-2"><Label>Discharge · Bay 1 · Ghada Sharaf</Label><span className="text-13 text-muted">back to Surgical Ward · Bed 6, where she came from</span></p>
        <div className="grid gap-4 md:grid-cols-2">
          <Table head={['Aldrete (1995)', '09:55', '10:10', '10:25']} rows={ald} />
          <div className="grid content-start gap-1 text-13"><Row k="From theatre">general, tube · fentanyl 150 mcg · paracetamol 1 g at 09:30 · dexamethasone, ondansetron · ports numbed · no drain</Row>
            <Row k="Now">BP 128/76 · pulse 78 · SpO₂ 96 % on air · pain 2 · no sickness</Row><Row k="Next">paracetamol at 15:30 · the surgeon's post-op orders are signed</Row>
            <div className="mt-2 rounded-lg bg-info-soft px-3 py-2 text-13 text-fg ring-1 ring-inset ring-info-line"><b className="font-medium text-info">What the ward will see.</b> At Sign her Recovery stay ends (Bay 1 frees) and the ward's goes on from it in Bed 6 (the stay passing back, beds Q3): the operation note, the post-op orders and every dose given in theatre and here go with her.</div></div></div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><Button>Sign · back to Surgical Ward, Bed 6<Kbd className="ms-1">⌘↵</Kbd></Button>{faint('an Aldrete under 9 shows a notice here, never a stop: the nurse decides · a day case goes home from here with the same card')}</div></Card>
      <p className="text-12 text-faint">The base's board: recovery bays are places. Anaesthesia's line: minutes since she came in, Aldrete (the base's score, a declared table the server adds up), pain (the base's vitals key), sickness (the base's observation, said only when there is some), and “ready for the ward” at 9 or more, in words. Its two buttons: Aldrete (the /score card with her obs) and Record (the anaesthetic record). Discharge is the base's.</p>
      <Card className="grid gap-1 p-3"><Label>Who ticks what</Label><Table head={['Department', 'Surgery', 'Theatre', 'Anaesthesia', 'Ward nursing']} rows={ticks} first="10rem" /></Card>
      <Ask n={47}>Three packs, each ticked where its work is done: Surgery (the chart's section and banner words, the operation note, post-op presets), Theatre (/op and the operations, the theatre list, the checklist) and Anaesthesia (the pre-op, the record, recovery's line, the Anaesthetist role) (drawn). A clinic with no theatre still uses Surgery. The other way: one Theatre pack holding all of it, ticked by every one of these departments; one switch, but the surgery clinic carries the theatre's parts.</Ask>
      <Ask n={48}>Recovery as a department of places: bays on the base's board, her stay passing to Recovery and back (Q3's base change) (drawn). The other way: recovery only a state on the theatre list (“recovery · Bay 1”), the patient never leaving the ward's stay and the Aldrete written on the case: no move and no change needed, but no board of who lies in which bay.</Ask></ScreenFrame></Page>
}

export const SURGERY: Pic[] = [
  { id: 'surg-clinic', title: 'Surgery clinic · the decision to operate', note: '/op under the line: the operation from the Theatre\'s list with its usual time, the side big, priority, surgeon, the anaesthesia wanted, day case, the pre-op tests, the risks told, the pre-op visit; it lands on To schedule. Q41.', Page: SurgClinic },
  { id: 'theatre-list', title: 'Theatre · the theatre list', note: 'The theatre pack\'s own screen: today\'s cases by room, each with its side, team, ASA, where it stands and the checklist parts done; emergencies on top; To schedule with pre-op and consent. Q42.', Page: TheatreList },
  { id: 'anaes-preop', title: 'Anaesthesia · the pre-op assessment', note: '/preop in the Pre-op clinic: the history that matters, the airway, ASA, RCRI and STOP-BANG through /score, his medicines against the clinic\'s stop list, the plan, fit or not yet, the consent. Q43.', Page: AnaesPreop },
  { id: 'theatre-checklist', title: 'Theatre · the WHO checklist', note: 'Sign in, Time out and Sign out, each ticked with who said it and signed when said; the counts, the specimen as a /lab order, the implants with their lot. Q44.', Page: TheatreChecklist },
  { id: 'anaes-record', title: 'Anaesthesia · the anaesthetic record', note: 'A 5-minute grid (vitals, EtCO₂, the agent, drugs at their times, fluids), the numbered events, doses per kg, the times that move the theatre list; signed by the anaesthetist. Q45.', Page: AnaesRecord },
  { id: 'surg-opnote', title: 'Surgery · the operation note', note: '/opnote in theatre: the surgeon\'s template for the operation, findings, steps, closure, drain, complications, the specimen and implants from Sign out; the post-op lines from his preset. Q46.', Page: SurgOpnote },
  { id: 'theatre-recovery', title: 'Recovery · the bays', note: 'The base\'s board with anaesthesia\'s line (Aldrete 8 → 10, pain, ready for the ward at 9+), its two buttons, and the base\'s Discharge back to the ward; who ticks what. Q47, Q48.', Page: TheatreRecovery },]
