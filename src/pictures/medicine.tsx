// Internal medicine: the shared chronic-care pack, cardiology, nephrology, respiratory, drawn with the last group (2026-10-08, proposed by
// Claude, awaiting the owner). clinics.tsx holds the shared parts. Chronic care is ticked by internal medicine, every branch and family
// medicine: the conditions come from the problem list, each with the clinic's targets and checks; the three small packs on top add only
// what is their own (ECG and echo, heart failure; the kidney's stage and the renal list; spirometry, asthma and COPD control). None of
// them needs a record type of its own but one (a patient's own target): the base's results, observations, vitals, orders and scores
// carry the rest. The file is dense on purpose: seven pictures under the 300-line limit, so sibling elements share a line.
import { Fragment, type ReactNode } from 'react'
import { Paperclip, Plus, TriangleAlert } from 'lucide-react'
import { AnalyteTable, Badge, Button, Card, Chip, Input, Kbd, LineChart, ListRow, ScreenFrame, Sparkline, Tag, Textarea, cn, type ScreenView } from '@core/ui'
import { App, Arabic } from './kit'
import { Ask, Chips, Keys, Label, Line, Page, Rec, Row, Table, Under, Unsigned, V, Visit, Word, noop, type Pic } from './clinics'

const none = <span className="text-12 text-faint">No known allergies</span>
const Foot = ({ children }: { children: ReactNode }) => <p className="text-12 text-faint">{children}</p>
const Draft = ({ children, by }: { children: ReactNode; by?: string }) => <p className="text-fg">{children}{by && <span className="text-12 text-faint"> {by}</span>}</p>
const Title = ({ children, sub }: { children: ReactNode; sub: ReactNode }) => <p className="flex flex-wrap items-center gap-2 px-1 text-13"><b className="text-14 font-semibold text-fg">{children}</b><span className="text-muted">{sub}</span></p>
const K = ({ children }: { children: ReactNode }) => <span className="w-28 shrink-0 text-12 text-faint">{children}</span>
const Faint = ({ children }: { children: ReactNode }) => <span className="text-12 text-faint">{children}</span>
/** a field of a card: its label, its choices (one on, or several with check), a note after them */
const Pick = ({ k, options, on, note, check }: { k: string; options: string[]; on: number | number[]; note?: ReactNode; check?: boolean }) =>
  <div className="flex flex-wrap items-center gap-1.5 text-13"><K>{k}</K>{options.map((o, i) => <Chip key={o} on={[on].flat().includes(i)} variant={check ? 'check' : 'solid'} onClick={noop}>{o}</Chip>)}{note && <span className="text-12 text-muted">{note}</span>}</div>
/** a boxed group inside the card under the line; a file kept with the entry (the tracing, the printout) */
const Box = ({ title, children }: { title: ReactNode; children: ReactNode }) => <div className="grid gap-1.5 rounded-lg border border-line bg-surface p-2.5"><Label>{title}</Label>{children}</div>
const File = ({ k, name, about }: { k: string; name: string; about: string }) => <p className="flex flex-wrap items-center gap-2 text-13"><K>{k}</K>
  <span className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 ring-1 ring-line"><Paperclip className="size-3.5 text-faint" />{name}<Faint>{about}</Faint></span></p>

// ── the chronic-care section's parts: a condition, a measure against its target with its trend, a check and when it was done, a test due ──
const COLS = 'grid grid-cols-[5.5rem_minmax(0,1fr)_3.75rem] gap-2 py-0.5 text-13'
const Cond = ({ name, code, since }: { name: string; code: string; since: string }) => <p className="flex items-baseline gap-2 border-t border-line pt-2 text-13 first:border-t-0 first:pt-0">
  <span className="font-semibold text-fg">{name}</span><span className="font-mono text-12 text-faint">{code}</span><span className="ms-auto text-12 text-faint">{since}</span></p>
const Measure = ({ k, v, f, target, at, trend, band }: { k: string; v: string; f?: 'high' | 'low'; target: string; at: string; trend?: number[]; band?: { low?: number; high?: number } }) =>
  <div className={cn(COLS, 'items-center')}><Faint>{k}</Faint><span className="min-w-0"><V f={f}>{v}</V> <span className="text-12 text-muted">target {target}</span> <Faint>· {at}</Faint></span>
    {trend ? <Sparkline points={trend.map((value, i) => ({ at: i, value, flag: i === trend.length - 1 ? f : undefined }))} band={band} width={60} height={18} label={`${k}: ${trend.join(', ')}`} /> : <span />}</div>
const Check = ({ what, last, due }: { what: string; last: string; due?: boolean }) => <p className={cn(COLS, 'items-baseline')}><Faint>{what}</Faint><span className="min-w-0 text-muted">{last}</span>
  {due ? <Tag tone="warn" className="justify-self-start">due</Tag> : <span className="text-12 text-ok">✓ done</span>}</p>
const Test = ({ due, name, when, order }: { due?: boolean; name: string; when: string; order?: boolean }) => <p className="flex flex-wrap items-center gap-2 text-13">
  {due ? <Tag tone="warn">due</Tag> : <Tag>not due</Tag>}<span className="text-fg">{name}</span><span className="text-muted">{when}</span>{order !== undefined && <Chip onClick={noop} className="ms-auto" on={order}>Order</Chip>}</p>

// ── 1 · the chronic-care section in a Diabetes clinic chart, and /review dm ──
const DMC = 'Diabetes clinic', IMAN = 'Dr. Iman Sherif'
export function ChronicVisit() {
  const record = <>
    <Chips on="Chronic care" lead={[['Summary'], ['Chronic care', '3 due', 'warn']]} base={[['Problems', '3'], ['Medicines', '4']]} more={4} />
    <Rec title="Summary" folded="BP 146/90 ↑ · HbA1c 8.2 ↑ · metformin, gliclazide, lisinopril, atorvastatin · last here 12 Aug" />
    <Rec title="Chronic care" right={<Faint>from the problem list</Faint>}>
      <Cond name="Type 2 diabetes" code="E11" since="since 2014" /><Measure k="HbA1c" v="8.2 %" f="high" target="< 7" at="12 Aug" trend={[7.1, 7.4, 7.9, 8.2]} band={{ high: 7 }} />
      <Measure k="LDL" v="112 mg/dL" f="high" target="< 70" at="12 Aug" trend={[131, 118, 112]} band={{ high: 70 }} />
      <Check what="Eyes" last="2 Aug 2025 · no retinopathy · 14 months" due /><Check what="Feet" last="2 Aug 2025 · low risk · 14 months" due />
      <Check what="Urine ACR" last="20 Jul 2025 · 24 mg/g · 15 months" due /><Check what="Flu vaccine" last="given 21 Sep · this season" />
      <Cond name="Hypertension" code="I10" since="since 2016" /><Measure k="BP" v="146/90" f="high" target="< 130/80" at="today" trend={[134, 138, 141, 146]} band={{ high: 130 }} />
      <Check what="K, creatinine" last="12 Aug · K 4.7 · creatinine 1.55" />
      <Cond name="CKD stage 3a" code="N18.3" since="since 2024" /><Measure k="eGFR" v="52" target="a fall under 5 a year" at="12 Aug" trend={[58, 55, 52]} />
      <p className="py-0.5 text-12 text-faint">Urine ACR is diabetes's check too: counted once.</p>
    </Rec>
    <Rec title="Problems" count={3} folded="Type 2 diabetes (E11) · Hypertension (I10) · CKD stage 3a (N18.3)" />
    <Rec title="Medicines" count={4} folded="Cidophage 1 g twice · Diamicron MR 60 once · lisinopril 10 once · Ator 20 at night" />
  </>
  return <Visit dept={DMC} user={IMAN} who={['Ashraf Mokhtar', '58 y · M · #10512']} where="In consult · 9 min" safety={none}
    words={<><Word tone="warn">HbA1c 8.2 ↑</Word><Word tone="warn">3 checks due</Word></>} plus={1} record={record}>
    <Line>/review dm</Line>
    <Under>
      <Title sub="last 2 Aug 2025, 14 months ago · the clinic's checks">Diabetes · the yearly review</Title>
      <Box title="Feet">
        <Pick k="Monofilament" options={['felt everywhere', 'not felt somewhere']} on={1} note="left big toe · 1 of 4 sites" /><Pick k="Pulses" options={['all felt', 'weak or absent']} on={1} note="left posterior tibial weak" />
        <Pick k="Skin" options={['healthy', 'dry, cracked', 'callus', 'ulcer', 'deformity']} on={2} check note="under the left 1st toe joint" /><Pick k="Foot risk" options={['low', 'moderate', 'high', 'active ulcer']} on={1} note="low in 2025" />
      </Box>
      <Box title="Eyes · last 2 Aug 2025, no retinopathy"><Pick k="Today" options={['seen here (fundus)', 'referred to Ophthalmology', 'brings an outside report']} on={1} /></Box>
      <Box title="Tests · due by the clinic's checks"><Test due name="Urine albumin/creatinine ratio" when="last 20 Jul 2025 · every 12 months" order />
        <Test name="HbA1c" when="12 Aug · next 12 Nov (3 months while off target)" order={false} /><Test name="Lipids · kidney function" when="12 Aug · next Aug 2027" /></Box>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the review and the chips taken · each is taken or left; nothing waits for it</Keys>
    </Under>
    <Unsigned n={4}><Draft>Diabetes review · feet: moderate risk (left big toe not felt, left posterior tibial weak, callus) · eyes: referred</Draft>
      <Draft>Fundus examination · Ophthalmology · ? diabetic retinopathy</Draft><Draft>Urine albumin/creatinine ratio · Laboratory</Draft><Draft by="the booking">Next visit · 3 months · Thu 7 Jan · Diabetes clinic</Draft></Unsigned>
    <Foot>Tell him: <Arabic className="text-13">افحص رجليك كل يوم، وما تمشيش حافي حتى في البيت</Arabic></Foot>
    <Foot>Chronic care adds one type only (a patient's own target, Q30): the measures are the base's latest results and vitals by code, the review writes the base's observations (feet, eyes), the tests and the referral are the base's orders. A check is done when an entry with one of its codes is written.</Foot>
    <Ask n={28}>A register worked out from the problem list (drawn): Ashraf is on diabetes, hypertension and CKD because his list says E11, I10 and N18.3, with no step to join, and he leaves one when the problem is marked resolved? Or registers the clinic joins by hand (Enrol in diabetes care), so a problem on the list does not put a patient on one?</Ask>
  </Visit>
}

// ── 2 · the clinic's own list of its chronic patients, and the targets and checks (settings) ──
type LRow = [n: string, name: string, age: string, conds: string, off: ReactNode, due: string, last: string, next?: string]
const people: LRow[] = [
  ['10431', 'Nagwa Tawfik', '66 F', 'diabetes · hypertension', <><V f="high">BP 158/96</V> · <V f="high">HbA1c 9.1</V></>, 'eyes (2 years) · feet', '3 Mar'], ['10463', 'Reda Hassanein', '52 M', 'hypertension', <V f="high">BP 148/92</V>, 'K, creatinine', '30 Jul'],
  ['10377', 'Ibrahim Shehata', '49 M', 'diabetes', <><V f="high">HbA1c 10.4</V> · <V f="high">LDL 141</V></>, 'urine ACR', '22 Jun'], ['10398', 'Adel Barakat', '71 M', 'diabetes · CKD 4 · heart failure', <V f="high">BP 136/84</V>, 'urine ACR · Hb', '1 Sep', '1 Dec'],
  ['10512', 'Ashraf Mokhtar', '58 M', 'diabetes · hypertension · CKD 3a', <><V f="high">HbA1c 8.2</V> · <V f="high">BP 146/90</V> · <V f="high">LDL 112</V></>, 'eyes · feet · urine ACR', 'today', '7 Jan'],
  ['10422', 'Fawzia Darwish', '81 F', 'diabetes · hypertension', <><V f="high">BP 156/88</V> <Faint>her own target &lt; 150/90</Faint></>, '—', '28 Sep', '28 Dec'],
  ['10405', 'Wafaa Abdelmoneim', '60 F', 'diabetes · asthma', <><V f="high">HbA1c 7.3</V> · <V f="low">ACT 17</V></>, 'inhaler technique', '18 Aug', '18 Nov'],
  ['10722', 'Fatma Zahran', '55 F', 'diabetes', <V f="high">HbA1c 7.6</V>, 'feet', '14 Sep', '14 Dec'], ['10721', 'Sanaa Ghali', '63 F', 'diabetes · hypertension', <V f="high">LDL 96</V>, '—', '5 Oct', '5 Jan'],
]
const conditions: [string, string, string, string][] = [
  ['Diabetes', 'E10–E14', 'HbA1c < 7 % · BP < 130/80 · LDL < 70 mg/dL', 'HbA1c 3 months (6 on target) · eyes, feet, urine ACR, lipids, kidney function 12 months · flu vaccine each autumn'],
  ['Hypertension', 'I10–I15', 'BP < 130/80', 'K and creatinine, lipids 12 months'], ['CKD', 'N18', 'BP < 130/80 · eGFR fall < 5 a year', 'eGFR and K 6 months (G3b and over: 3) · urine ACR, Hb 12 months'],
  ['Heart failure', 'I50', '—', 'weight each visit · K and creatinine 6 months · flu vaccine each autumn'], ['Asthma', 'J45', 'ACT 20 or more', 'ACT each visit · inhaler technique, action plan 12 months'],
  ['COPD', 'J44', 'CAT under 10', 'CAT each visit · spirometry, inhaler technique 12 months · flu each autumn · pneumococcal once'],
]
export function ChronicList() {
  const views: ScreenView<string>[] = [{ id: 'off', label: 'Off target', count: 41, needs: 'warn' }, { id: 'over', label: 'Checks overdue', count: 27, needs: 'warn' }, { id: 'all', label: 'All', count: 312 }]
  const kinds: [string, number][] = [['Any condition', 312], ['Diabetes', 248], ['Hypertension', 171], ['CKD', 58], ['Heart failure', 9], ['Asthma', 6], ['COPD', 4]]
  const th = 'px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint', td = 'px-3 py-2'
  return <Page dept={DMC} user={IMAN} tabs={['Queue', 'Diary', 'Chronic care']} tab="Chronic care">
    <ScreenFrame views={views} view="off" onView={noop} search={<Input readOnly placeholder="Record number or name" className="w-full sm:w-56" />} action={<Button size="sm" variant="outline">Print the list</Button>}
      filters={<span className="flex flex-wrap items-center gap-1">{kinds.map(([k, n], i) => <Chip key={k} shape="pill" on={i === 0} onClick={noop}>{k} <span className="tnum opacity-70">{n}</span></Chip>)}</span>}>
      <Card className="overflow-x-auto"><table className="w-full text-13 tnum">
        <thead><tr className="border-b border-line">{['Patient', 'Conditions', 'Off target', 'Checks due', 'Last here', 'Next visit'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>{people.map(([n, name, age, conds, off, due, last, next]) => <tr key={n} className={cn('border-t border-line', name === 'Ashraf Mokhtar' && 'bg-accent-soft/50')}>
          <td className={td}><span className="me-2 font-mono text-12 text-faint">{n}</span><span className="font-medium text-fg">{name}</span> <span className="text-12 text-muted">{age}</span></td><td className={cn(td, 'text-muted')}>{conds}</td>
          <td className={td}>{off}</td><td className={td}>{due === '—' ? <span className="text-faint">—</span> : <span className="text-warn">{due}</span>}</td><td className={cn(td, 'text-muted')}>{last}</td>
          <td className={td}>{next ? <span className="text-fg">{next}</span> : <Tag tone="warn">none booked</Tag>}</td></tr>)}</tbody>
      </table><p className="border-t border-line px-3 py-2 text-12 text-faint">Patients seen in this clinic in the last 18 months whose problem list has a condition below · none booked first (the ones to phone), then by last here · a row opens the chart · the next visit is the bookings pack's.</p></Card>
      <Card className="grid gap-2 p-4">
        <p className="flex flex-wrap items-baseline gap-2"><span className="text-14 font-semibold text-fg">Chronic care · the conditions, their targets and checks</span><span className="text-12 text-muted">Settings → Packs → Chronic care · for the whole clinic</span></p>
        <Table head={['Condition', 'From the problem list', 'Targets', 'Checks · how often']} first="9rem" rows={conditions.map(([c, codes, t, k]) => [<span className="font-medium">{c}</span>, <span className="font-mono text-12">{codes}</span>, t, <span className="text-muted">{k}</span>])} />
        <Foot>A small table the platform draws (rule 7); a change counts from the moment it is saved. The codes are the register: a problem with one of them puts the patient on it. The list's window (18 months) is each department's own.</Foot>
      </Card>
      <Foot>The list is the pack's own screen (a list of work that is not places); its mark on the queue is one word, "3 due". Fawzia's target is her own, written in her chart by her doctor (the pack's one type, a target with its reason: "81, falls"), and it wins over the clinic's.</Foot>
      <Ask n={29}>The clinic's own list of its chronic patients (off target, checks overdue, a chip per condition, none booked first) as a Chronic care tab in each department that ticks the pack, on day one (drawn)? Or later, with day one only the section and the review in each chart?</Ask>
      <Ask n={30}>Targets and checks set once for the whole clinic (drawn), with a patient's own target written in the chart when the doctor decides (Fawzia, 81: BP &lt; 150/90)? Or each department its own (the Diabetes clinic's HbA1c &lt; 7, an elderly clinic's &lt; 8), so the same patient may be off target in one and on it in the other?</Ask>
    </ScreenFrame>
  </Page>
}

// ── 3 · cardiology: the ECG read in the clinic, the echo ordered ──
const CARDIO = 'Cardiology clinic', WAEL = 'Dr. Wael Ghoneim'
export function CardioEcg() {
  const record = <>
    <Chips on="Heart" lead={[['Summary'], ['Heart', 'no echo yet'], ['Chronic care', '1 off target', 'warn']]} base={[]} more={6} />
    <Rec title="Summary" folded="BP 138/86 · pulse 108 irregular · amlodipine 5 mg · from General Practice: palpitations 3 weeks, breathless on stairs" />
    <Rec title="Heart"><Label>ECGs</Label>
      <Table head={['Date', 'Rhythm', 'Rate', 'PR', 'QRS', 'QTc', 'Axis']} rows={[['14 Mar 2025', 'sinus', '78', '164', '92', '418', '+30°'],
        [<span className="text-accent">today · draft</span>, <span className="font-medium text-warn">AF</span>, <V f="high">108</V>, '—', '96', '452', '+20°']]} />
      <Row k="Echo">none yet · <span className="text-accent">ordered today (draft)</span></Row><Row k="Holter">none</Row>
    </Rec>
    <Rec title="Chronic care" folded="BP 138/86 ↑ · target < 130/80" /><Rec title="Problems" count={1} folded="Hypertension (I10) · since 2019" />
  </>
  return <Visit dept={CARDIO} user={WAEL} who={['Kamal Abdelrahman', '64 y · M · #10527']} where="In consult · 11 min" safety={none} words={<Word>No echo yet</Word>} record={record}>
    <Line>/ecg af 108 qrs 96 qtc 452 axis 20</Line>
    <Under>
      <Title sub="read by the cardiologist · a result with no order">ECG · 12 leads · today 10:40</Title><Pick k="Rhythm" options={['sinus', 'AF', 'flutter', 'paced', 'other']} on={1} />
      <div className="grid gap-x-6 sm:grid-cols-2"><Row k="Rate"><V f="high">108</V> /min <Faint>ventricular</Faint></Row><Row k="PR">— <Faint>none in AF</Faint></Row>
        <Row k="QRS">96 ms</Row><Row k="QTc">452 ms <Faint>the machine's (Bazett)</Faint></Row><Row k="Axis">+20° <Faint>normal</Faint></Row></div>
      <Pick k="ST and T" options={['no acute change', 'ST elevation', 'ST depression', 'T inversion', 'LVH', 'BBB']} on={0} check />
      <label className="grid gap-1"><Faint>Conclusion</Faint><Textarea readOnly minRows={2} value="Atrial fibrillation, ventricular rate 108. No acute ST change. Was sinus rhythm 78 on 14 Mar 2025." /></label>
      <File k="Tracing" name="ecg-08-oct.jpg" about="photo of the paper · 1.4 MB" /><Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the ECG · the tracing is the result's file; another can be attached</Keys>
    </Under>
    <Unsigned n={4}><Draft>ECG · AF 108 · QRS 96 · QTc 452 · axis +20° · no acute change · tracing attached</Draft><Draft>Atrial fibrillation (I48) · problem list</Draft>
      <Draft>Concor 2.5 mg · once a day · 30 days</Draft><Draft by="from /echo ? lv function, new af">Echo · transthoracic · Echo room · ? LV function, new AF</Draft></Unsigned>
    <Foot>The ECG is the base's result (LOINC 11524-6) with no order, each measure an analyte (rate 8867-4, PR 8625-6, QRS 8633-0, QTc 8636-3, axis 8632-2), the rhythm,
      ST-T and conclusion as text, the tracing its file. Cardiology brings only /ecg and its card, and /echo, offered where the Echo room works for this clinic.</Foot>
  </Visit>
}

// ── 4 · cardiology: the echo, answered at the Echo room's bench ──
const echoMeasures = [
  { name: 'LV end-diastolic diameter', value: 61, unit: 'mm', flag: 'high', low: 42, high: 58 }, { name: 'LV end-systolic diameter', value: 50, unit: 'mm', flag: 'high', low: 25, high: 40 },
  { name: 'Septum (IVSd)', value: 10, unit: 'mm', low: 6, high: 10 }, { name: 'Posterior wall', value: 10, unit: 'mm', low: 6, high: 10 },
  { name: 'Ejection fraction (biplane)', value: 38, unit: '%', flag: 'low', low: 52, high: 72 }, { name: 'LA volume index', value: 44, unit: 'mL/m²', flag: 'high', high: 34 },
  { name: 'TAPSE', value: 18, unit: 'mm', low: 17 }, { name: 'E/e′ average', value: 15, unit: '', flag: 'high', high: 14 }, { name: 'PASP', value: 42, unit: 'mmHg', flag: 'high', high: 35 },
]
const CONCLUSION = '1. Dilated left ventricle, global hypokinesia, EF 38 % (biplane).\n2. Moderate functional mitral regurgitation; dilated left atrium.\n3. PASP 42 mmHg. No pericardial effusion.'
export function CardioEcho() {
  const views: ScreenView<string>[] = [{ id: 'todo', label: 'To do', count: 3, needs: 'warn' }, { id: 'doing', label: 'In progress', count: 1 }, { id: 'done', label: 'Done today', count: 6 }]
  const report = <div className="grid gap-3 border-t border-line bg-sunken px-4 py-3">
    <p className="flex flex-wrap items-center gap-2 text-13"><span className="text-12 font-semibold uppercase tracking-[0.06em] text-faint">Asked</span><span className="text-fg">Echo · transthoracic · ? LV function, new AF</span>
      <span className="text-muted">Dr. Wael Ghoneim · Cardiology clinic · 10:52</span><Faint>· before: no echo · ECG today AF 108, no acute change</Faint></p>
    <div className="grid gap-4 md:grid-cols-2">
      <div className="grid content-start gap-1"><Label>Measured · each with its range</Label><AnalyteTable dense nameHead="Measure" rows={echoMeasures} /></div>
      <div className="grid content-start gap-2">
        <Pick k="Wall motion" options={['normal', 'global hypokinesia', 'regional']} on={1} /><Pick k="Mitral" options={['normal', 'mild MR', 'moderate MR', 'severe MR']} on={2} note="functional" />
        <Pick k="Aortic" options={['normal', 'sclerosis', 'stenosis', 'regurgitation']} on={0} note="trileaflet" /><Pick k="Tricuspid" options={['normal', 'mild TR', 'moderate TR', 'severe TR']} on={1} />
        <Pick k="Pericardium" options={['no effusion', 'small', 'moderate', 'large']} on={0} /><Row k="Rhythm">AF through the study, 96–110 /min</Row>
        <label className="grid gap-1"><Label>Conclusion · what the doctor reads first</Label><Textarea readOnly minRows={3} className="font-medium" value={CONCLUSION} /></label>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2"><Button size="sm">Sign<Kbd className="ms-1">⌘↵</Kbd></Button><Button size="sm" variant="ghost">Save draft</Button><Button size="sm" variant="ghost" disabled>Clips · later</Button>
      <Faint>Signed, it goes to Dr. Wael Ghoneim's To review and into the chart's Heart section, the conclusion first.</Faint></div>
  </div>
  return <App dept="Echo room" user="Dr. Rasha Nabil">
    <ScreenFrame views={views} view="todo" onView={noop} search={<Input readOnly placeholder="Record number or name" className="w-full sm:w-64" />} action={<Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>}>
      <Card><ul>
        <ListRow number="10527" name="Kamal Abdelrahman" age="64 M" status={<><Tag tone="info">echo now</Tag><span className="truncate">Echo · ? LV function, new AF</span></>} who="Cardiology clinic" minutes={25} selected below={report} />
        <ListRow number="10538" name="Heba Abdelwahab" age="31 F" status={<span className="truncate">Echo · ? murmur · pregnant 24 w</span>} who="ObGyn clinic" minutes={12} />
        <ListRow number="10519" name="Mostafa Kandil" age="70 M" status={<><Tag>at the ward</Tag><span className="truncate">Echo · ? aortic stenosis</span></>} who="Medical Ward · Bed 6" minutes={40} />
      </ul></Card>
      <Foot>The Echo room is a bench department, the base's list (To do, In progress, Done today; a walk-in as at any bench); the report is the base's result answering the order,
        each measure an analyte with its range (EF LOINC 10230-1), the valves and the conclusion as text. Cardiology brings the form; paying is billing's.</Foot>
      <Ask n={31}>The ECG read and written in the clinic by the cardiologist, a result with no order, and the echo done in an Echo room that answers the doctor's /echo order (both drawn)? Or the echo written in the clinic too, by the cardiologist who did it in his own room (no Echo room)? Or both at benches, an ECG room's technician recording and the cardiologist reading from his To review? A result written in the clinic with no order is the base's outside result: /ecg would be the first command to write one.</Ask>
    </ScreenFrame>
  </App>
}

// ── 5 · cardiology: the heart failure clinic ──
const hfGroups: [string, ReactNode, string, ReactNode][] = [
  ['ACEi · ARB · ARNI', 'Entresto 49/51 mg twice a day', 'target 97/103 mg twice', <Tag>half</Tag>], ['Beta-blocker', 'Concor 5 mg once a day', 'target 10 mg once', <Tag>half</Tag>],
  ['MRA', <span className="text-warn">not on</span>, 'spironolactone, target 50 mg once', <Tag tone="warn">not on</Tag>], ['SGLT2 inhibitor', 'Forxiga 10 mg once a day', 'target 10 mg once', <Tag tone="ok">at target</Tag>],
]
export function CardioHf() {
  const weights = [73.8, 70.6, 70.2, 71.4]
  const record = <>
    <Chips on="Heart failure" lead={[['Summary'], ['Heart failure', 'NYHA II'], ['Chronic care', '1 due', 'warn']]} base={[]} more={6} />
    <Rec title="Summary" folded="BP 108/66 · pulse 72 · K 4.9 · eGFR 48 · Entresto, Concor, Forxiga, Lasix, Eliquis · last here 2 Sep" />
    <Rec title="Heart failure" right={<Faint>from the problem list · I50</Faint>}>
      <Row k="EF"><V f="low">30 %</V> <Faint>echo 7 Jul · Echo room</Faint></Row><Row k="NYHA">II today · III on 2 Sep</Row>
      <div className="flex items-center gap-2 py-0.5 text-13"><span className="w-24 shrink-0 text-12 text-faint">Weight</span><span className="min-w-0 flex-1"><V f="high">71.4 kg</V> <span className="text-12 text-muted">dry 70 kg (2 Sep) · +1.4</span></span>
        <Sparkline points={weights.map((value, i) => ({ at: i, value, flag: i === 3 ? 'high' : undefined }))} band={{ low: 69.5, high: 70.5 }} width={64} height={20} label={`Weight: ${weights.join(', ')} kg`} /></div>
      <Label className="pt-2">The four medicines</Label>
      {hfGroups.map(([g, m, t, tag]) => <div key={g} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-line py-1 text-13"><Faint>{g}</Faint>
        <span className="min-w-0 text-fg">{m} <span className="block text-12 text-faint">{t}</span></span>{tag}</div>)}
      <Row k="Beside them">K 4.9 · creatinine 1.2 · eGFR 48 · 12 Sep</Row><Row k="For fluid">Lasix 40 mg each morning</Row>
      <Row k="AF">CHA₂DS₂-VASc 5 · 2 Sep · Eliquis 5 mg twice a day <Faint>the server's table (2010), /chadsvasc</Faint></Row>
    </Rec>
    <Rec title="Problems" count={4} folded="Heart failure, EF 30 % (I50.1) · AF (I48) · Hypertension (I10) · Type 2 diabetes (E11)" />
  </>
  return <Visit dept={CARDIO} user={WAEL} who={['Zeinab Abou Zeid', '72 y · F · #10533']} where="In consult · heart failure · 8 min" safety={none}
    words={<><Word tone="warn">+1.4 kg over dry</Word><Word>NYHA II</Word></>} plus={1} record={record}>
    <Line>/hf nyha 2 wt 71.4 oedema ankles</Line>
    <Under>
      <Title sub="the weight goes into the base's vitals">Heart failure visit</Title><Pick k="NYHA" options={['I', 'II', 'III', 'IV']} on={1} note="ordinary activity: breathless" />
      <Row k="Weight"><V f="high">71.4 kg</V> <span className="text-muted">1.4 over the dry weight 70 kg · +1.2 since 2 Sep</span></Row>
      <Pick k="Oedema" options={['none', 'ankles', 'to the knees', 'higher']} on={1} /><Pick k="Lying flat" options={['flat', '2 pillows or more', 'wakes breathless']} on={0} />
      <Box title="Beside the four medicines · shown, never a stop">
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-13 text-fg tnum"><span>BP 108/66</span><span>pulse 72 · AF</span><span>K 4.9 <Faint>(3.5–5.0)</Faint></span><span>creatinine 1.2 · eGFR 48</span><Faint>12 Sep</Faint></p>
        <p className="text-13 text-muted">ARNI and beta-blocker at half the target · MRA not on · SGLT2 inhibitor at target</p></Box>
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds the visit · <span className="font-mono">/chadsvasc</span> scores again; the server adds it up</Keys>
    </Under>
    <Unsigned n={4}><Draft>Heart failure visit · NYHA II · 71.4 kg, 1.4 over dry · ankle oedema · lies flat</Draft><Draft>Aldactone 25 mg · once a day · 30 days</Draft>
      <Draft>Kidney function, potassium · Laboratory · ? K a week after spironolactone</Draft><Draft by="the booking">Next visit · 2 weeks · Thu 22 Oct · Cardiology clinic</Draft></Unsigned>
    <Foot>Tell her: <Arabic className="text-13">وزني نفسك كل يوم الصبح، ولو وزنك زاد ٢ كيلو في ٣ أيام كلّمي العيادة</Arabic></Foot>
    <Foot>No type of its own: NYHA is the base's observation, the weight its vitals, the dry weight an observation the doctor sets (the last stands), EF the last echo's result; the four groups are read from the medication list by ATC class (C09, C07, C03DA, A10BK). CHA₂DS₂-VASc is a declared table written through /score.</Foot>
    <Ask n={32}>The four medicine groups with each medicine's target dose as the cardiology pack's setting (drawn: a small table the clinic edits, starting from the ESC 2021 doses),
      so the section says "half" and "at target"? Or only on or not on, with no target doses to keep?</Ask>
  </Visit>
}

// ── 6 · nephrology: the stage, the fall, the panel, and the renal list under /rx ──
const G = [['G1', '≥ 90'], ['G2', '60–89'], ['G3a', '45–59'], ['G3b', '30–44'], ['G4', '15–29'], ['G5', '< 15']], A = [['A1', '< 30'], ['A2', '30–300'], ['A3', '> 300']]
const RISK = [[0, 1, 2], [0, 1, 2], [1, 2, 3], [2, 3, 3], [3, 3, 3], [3, 3, 3]]   // KDIGO 2012: low, moderately increased, high, very high
const RISK_BG = ['bg-ok-soft', 'bg-warn-soft', 'bg-warn-line', 'bg-danger-line'], RISK_WORD = ['low', 'moderate', 'high', 'very high']
const Head = ({ k, r, center }: { k: string; r: string; center?: boolean }) => <span className={cn('text-11 text-faint', center && 'text-center')}><b className="font-semibold text-fg">{k}</b> {r}</span>
/** the KDIGO grid: eGFR down, ACR (mg/g) across, each square its risk in colour and word; the patient's square now, and a year ago */
const Kdigo = ({ now, before }: { now: [number, number]; before: [number, number] }) => <div className="grid grid-cols-[5rem_repeat(3,minmax(0,1fr))] items-center gap-0.5 text-12">
  <span className="text-11 text-faint">ACR mg/g →</span>{A.map(([a, r]) => <Head key={a} k={a} r={r} center />)}
  {G.map(([g, r], i) => <Fragment key={g}><Head k={g} r={r} />{A.map(([a], j) => { const here = now[0] === i && now[1] === j, was = before[0] === i && before[1] === j
    return <span key={a} className={cn('grid h-7 place-items-center rounded-sm text-11', RISK_BG[RISK[i][j]], here ? 'font-semibold text-fg ring-2 ring-fg' : was ? 'font-medium text-fg outline-2 -outline-offset-2 outline-dashed outline-fg' : 'text-muted')}>
      {here ? 'now · 3 Oct' : was ? 'Oct 2025' : RISK_WORD[RISK[i][j]]}</span> })}</Fragment>)}</div>
const egfr = [['2024-10-10', 48], ['2025-04-14', 44], ['2025-10-05', 41], ['2026-02-09', 36], ['2026-06-08', 31], ['2026-10-03', 28]] as const
export function RenalCkd() {
  const panel: [ReactNode, ReactNode][] = [[<V f="low">Hb 9.6 g/dL</V>, <>ferritin 85 · <V f="low">TSAT 16 %</V> · iron not on · ESA not on</>], ['Calcium 8.9 mg/dL', 'corrected for albumin 3.8'],
    [<V f="high">Phosphate 5.1 mg/dL</V>, 'no binder'], [<V f="high">PTH 188 pg/mL</V>, 'vitamin D not checked'], [<V f="low">Bicarbonate 19 mmol/L</V>, 'not on bicarbonate'], [<V f="high">Potassium 5.3 mmol/L</V>, 'on losartan 100']]
  const record = <>
    <Chips on="Kidneys" lead={[['Summary'], ['Kidneys', 'G4 A3', 'danger'], ['Chronic care', '2 off target', 'warn']]} base={[]} more={6} />
    <Rec title="Summary" folded="BP 142/86 ↑ · eGFR 28 ↓ · K 5.3 ↑ · Cidophage, insulin glargine, losartan, amlodipine, Forxiga, Ator" />
    <Rec title="Kidneys" right={<Faint>diabetic kidney disease · since 2021</Faint>}>
      <Kdigo now={[4, 2]} before={[3, 1]} /><p className="pb-1 pt-1.5 text-12 text-faint">Worked out from the latest eGFR and ACR (KDIGO 2012); a year ago G3b A2.</p>
      <LineChart label="eGFR · mL/min/1.73 m² · CKD-EPI 2021 · 41 a year ago, 28 now" height={130} points={egfr.map(([at, value]) => ({ at, value, flag: 'low' }))} />
      <Row k="ACR"><V f="high">420 mg/g</V> <Faint>260 a year ago · 3 Oct</Faint></Row><Row k="BP"><V f="high">142/86</V> <Faint>target &lt; 130/80 · today</Faint></Row>
      <Label className="pt-2">The CKD panel · 3 Oct</Label><Table head={['Test', 'Beside it']} first="11.5rem" rows={panel.map(([t, b]) => [t, <span className="text-muted">{b}</span>])} />
      <Row k="Dialysis">not near yet · the talk, the fistula and hepatitis B vaccine come first; at the first session the dialysis pack takes over</Row>
    </Rec>
    <Rec title="Problems" count={3} folded="Type 2 diabetes (E11) · Hypertension (I10) · CKD stage 3 (N18.3)" />
  </>
  return <Visit dept="Nephrology clinic" user="Dr. Medhat Sorour" who={['Saeed El-Gammal', '67 y · M · #10541']} where="In consult · 14 min" safety={none}
    words={<><Word tone="danger">CKD G4 A3</Word><Word tone="warn">eGFR 28 ↓</Word></>} plus={1} record={record}>
    <Line>/rx metformin 500 bd 30d</Line>
    <Under>
      <div className="grid gap-2 rounded-md bg-surface px-3 py-2.5"><p className="flex flex-wrap items-center gap-2 text-13"><Badge tone="accent" className="w-20 justify-center">prescription</Badge>
        <span className="font-medium text-fg">Metformin 500 mg · oral · twice a day · 30 days</span><Faint>Cidophage 500 · repeat</Faint></p>
        <Pick k="How often" options={['OD', 'BD', 'TDS', 'QDS']} on={1} /><Pick k="Days" options={['7', '14', '30', '90']} on={2} /></div>
      <p className="flex flex-wrap items-center gap-2 rounded-md bg-warn-soft px-3 py-2 text-13 text-warn ring-1 ring-inset ring-warn-line"><TriangleAlert aria-hidden className="size-4 shrink-0" />
        <span>eGFR 28 (3 Oct): metformin — the clinic's renal list says stop under 30</span><span className="ms-auto text-11 text-faint">Nephrology · the renal list</span></p>
      <Keys><Kbd>↵</Kbd> adds it as typed · the line is a notice: nothing waits for it, the doctor decides</Keys>
    </Under>
    <Unsigned n={4}><Draft>CKD stage 4 (N18.4) · changes CKD stage 3 (N18.3)</Draft><Draft>Sodamint 500 mg · three times a day · 30 days</Draft>
      <Draft>Ferrous sulphate 200 mg · once a day · 3 months</Draft><Draft>Kidney function, potassium, CBC · Laboratory · ? before the next visit</Draft></Unsigned>
    <Foot>Nephrology adds no record type: the stage is read from the base's latest eGFR and ACR, the panel from its results; the renal list is its setting (a medicine by ingredient or ATC class, the eGFR under which it speaks, what it says: metformin halve under 45, stop under 30).</Foot>
    <Ask n={33}>The renal list speaking on a line under the base's /rx card as the medicine is typed (drawn)? That is a core change, the same as paediatrics' dose line: a pack may add one line to the base's prescription card, a notice, never a stop. Or no core change: the renal facts only in the Kidneys section, the doctor reading them himself before he prescribes?</Ask>
  </Visit>
}

// ── 7 · respiratory: spirometry, COPD control, the inhaler, the action plan ──
const plan: ['ok' | 'warn' | 'danger', string, string][] = [['ok', 'every day', 'كل يوم: ألتيبرو كبسولة واحدة الصبح، وفاركولين بختين لما تنهج'],
  ['warn', 'worse', 'لو النهجان زاد أو البلغم كتر أو لونه اتغيّر: فاركولين بختين كل ٤ ساعات، وابدأ بريدنيزولون ٤٠ مجم الصبح ٥ أيام، وكلّم العيادة'],
  ['danger', 'emergency', 'لو مش قادر تتكلم من النهجان، أو شفايفك زرقا، أو مش قادر تنام: روح الطوارئ على طول']]
const spiro: ReactNode[][] = [['FEV1 · L', '1.62', <V f="low">1.72</V>, '+0.10 · +6 %', '3.05', '2.30', '56 %', '−2.9'],
  ['FVC · L', '2.86', <V f="low">2.98</V>, '+0.12 · +4 %', '3.98', '3.07', '75 %', '−1.8'], ['FEV1/FVC', '0.57', <V f="low">0.58</V>, '—', '0.77', '0.65', '—', '−2.6']]
const Said = ({ tag, tone, children, aside }: { tag: string; tone?: 'warn'; children: ReactNode; aside?: string }) =>
  <p className="flex flex-wrap items-center gap-2"><Tag tone={tone}>{tag}</Tag><span className="text-fg">{children}</span>{aside && <Faint>{aside}</Faint>}</p>
export function ChestSpiro() {
  const record = <>
    <Chips on="Chest" lead={[['Summary'], ['Chest', 'GOLD E', 'warn'], ['Chronic care', '1 due', 'warn']]} base={[]} more={6} />
    <Rec title="Summary" folded="SpO₂ 94 % · ex-smoker, 40 pack-years · Ultibro, Farcolin · admitted in Feb with a flare" />
    <Rec title="Chest" right={<Faint>COPD (J44.9) · since 2021</Faint>}>
      <Row k="Smoking">ex-smoker · 40 pack-years · stopped 2023</Row><Row k="GOLD group"><Tag tone="warn">E</Tag> 2 Sep · CAT 18 · mMRC 2 · 2 flares, 1 in hospital</Row>
      <Label className="pt-2">Flares · last 12 months</Label>
      <Table head={['When', 'Treated with', 'Where']} rows={[['Feb 2026', 'prednisolone · Augmentin', 'admitted 4 days'], ['Nov 2025', 'prednisolone 5 days', 'at home']]} />
      <Row k="Spirometry">Oct 2025 · FEV1 1.78 L (58 %) · FEV1/FVC 0.59 after bronchodilator</Row><Row k="Inhalers">Ultibro Breezhaler 1 capsule each morning · Farcolin 2 puffs when needed, about 3 times a week</Row>
      <Row k="Technique" tone="warn">2 Sep · Breezhaler: breathed out into it · shown again</Row><Row k="Eosinophils">180 /µL · 12 Sep</Row>
      <Row k="Vaccines">flu 21 Sep ✓ · pneumococcal <span className="text-warn">never · due</span></Row><Label className="pt-2">His action plan · Arabic · printed 2 Sep</Label>
      {plan.map(([tone, w, ar]) => <p key={w} className="flex items-start gap-2 py-0.5"><Tag tone={tone} className="mt-0.5 w-20 shrink-0 justify-center">{w}</Tag><Arabic className="text-13">{ar}</Arabic></p>)}
    </Rec>
  </>
  return <Visit dept="Chest clinic" user="Dr. Dalia Mostafa" who={['Abdelhamid Mansy', '61 y · M · #10548']} where="In consult · 12 min" safety={none}
    words={<><Word tone="warn">GOLD E</Word><Word>CAT 18</Word></>} plus={1} record={record}>
    <Line>/spiro fev1 1.62 fvc 2.86 post 1.72 2.98</Line>
    <Under>
      <Title sub="170 cm · 61 y · male · GLI-2012">Spirometry · before and after salbutamol 400 µg</Title>
      <Table head={['', 'Before', 'After', 'Change', 'Predicted', 'LLN', '% pred.', 'z']} first="6rem" rows={spiro} className="rounded-md bg-surface" />
      <div className="grid gap-1 px-1 text-13"><Said tag="obstruction" tone="warn">FEV1/FVC 0.58 after, under the LLN 0.65 (and under 0.70)</Said>
        <Said tag="not reversible" aside="reversible: 200 mL and 12 %">+100 mL, +6 %</Said><Said tag="GOLD 2" tone="warn" aside="was 58 % in Oct 2025">FEV1 56 % of predicted (50–79)</Said></div>
      <Pick k="Quality" options={['A', 'B', 'C', 'not acceptable']} on={0} note="3 good blows, repeatable" /><File k="Printout" name="spiro-08-oct.pdf" about="the curve · 220 KB" />
      <Keys><Kbd>tab</Kbd> the next field <Kbd>↵</Kbd> adds it · the predicted values, LLN and z come from the server as you type</Keys>
    </Under>
    <Unsigned n={4}><Draft>Spirometry · after bronchodilator FEV1 1.72 L (56 %) · FEV1/FVC 0.58 · not reversible · GOLD 2</Draft><Draft by="the server's table · GOLD group stays E (2 flares)">CAT 17 · from /cat</Draft>
      <Draft>Inhaler technique · Breezhaler · correct today</Draft><Draft>Pneumococcal vaccine · Prevenar 13 · Vaccination room</Draft></Unsigned>
    <Foot>Spirometry is the base's result (FEV1 20150-9, FVC 19870-5, FEV1/FVC 19926-5, before and after as their own analytes), the printout its file. CAT, mMRC, ACT and GOLD's group (two items: symptoms, flares → A, B, E) are declared tables through /score; the technique is the base's observation, the plan a note in Arabic the pack prints. For asthma the section shows ACT and the reversibility instead of GOLD.</Foot>
    <Ask n={34}>Predicted values, LLN and z-scores worked out by the server from GLI-2012 (drawn: a reference list imported like the WHO growth charts, so every spirometer reads the same)? Or typed from the spirometer's printout, as most clinics read them today, with no reference list to keep?</Ask>
  </Visit>
}

export const MEDICINE: Pic[] = [
  { id: 'chronic-visit', title: 'Chronic care · the section and /review dm', note: 'In a Diabetes clinic chart: each condition from the problem list, its measures against the clinic\'s targets with a trend, the checks due; the yearly review under the line (feet, eyes, the due tests as chips). Q28.', Page: ChronicVisit },
  { id: 'chronic-list', title: 'Chronic care · the clinic\'s list and its settings', note: 'Who is off target or overdue, a chip per condition, none booked first; the conditions with their codes, targets and checks as one small table. Q29, Q30.', Page: ChronicList },
  { id: 'cardio-ecg', title: 'Cardiology · the ECG in the clinic', note: '/ecg: rhythm, rate, PR, QRS, QTc, axis, ST-T, the conclusion and the tracing as a file, written by the cardiologist as the base\'s result; the echo ordered with /echo. Q31.', Page: CardioEcg },
  { id: 'cardio-echo', title: 'Cardiology · the echo at the Echo room', note: 'A bench department answering /echo: the measures with their ranges, wall motion, valves, the conclusion; Sign sends it to the doctor\'s To review. Q31.', Page: CardioEcho },
  { id: 'cardio-hf', title: 'Cardiology · the heart failure clinic', note: 'NYHA, the weight against the dry weight, EF from the last echo, the four medicine groups against their target doses with K and creatinine beside them, CHA₂DS₂-VASc. Q32.', Page: CardioHf },
  { id: 'renal-ckd', title: 'Nephrology · CKD', note: 'The KDIGO grid (now and a year ago), eGFR over time, ACR, BP, the CKD panel; the renal list speaks on a line under /rx, never a stop. Q33.', Page: RenalCkd },
  { id: 'chest-spiro', title: 'Respiratory · spirometry and COPD', note: '/spiro before and after a bronchodilator with GLI-2012\'s predicted and LLN; GOLD\'s group, the flares, the inhaler technique, the action plan in Arabic. Q34.', Page: ChestSpiro },
]
