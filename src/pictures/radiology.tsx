// Radiology's pictures (2026-10-08, proposed by Claude, awaiting the owner): the doctor's /ct card (the facts before contrast, pregnant
// asked), a walk-in at radiology's bench, the Scan list (one list, by modality), the scan itself (check who and which side, pregnant
// at the door; the contrast given), the Report (the template, the last study of the same part beside it, Sign), a critical finding
// (only a notice, as the lab's), what comes back to the doctor, and radiology's settings (the exams, a few switches).
// Booking a time is the bookings pack's (bench booking, accepted 2026-10-08); paying is billing's row button.
import type { ReactNode } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { Button, Callout, Card, Chip, Input, Kbd, ListRow, ListSection, ScreenFrame, Switch, Tag, Textarea, cn, type RowMark, type ScreenView, type Tone } from '@core/ui'
import { App, Arabic, Label } from './kit'
import { WalkInSteps } from './bench'
import { Chart, Drafts, Keys, Line, Pick, Test, Under } from './order'

const noop = () => undefined
const RAD = { dept: 'Radiology', user: 'Ahmed Saber', tabs: ['Scan', 'Report'] }
const DR = { dept: 'Radiology', user: 'Dr. Mai Farouk', tabs: ['Scan', 'Report'], tab: 'Report' }
const scanViews: ScreenView<string>[] = [{ id: 'todo', label: 'To scan', count: 6, needs: 'warn' }, { id: 'done', label: 'Scanned today', count: 18 }, { id: 'no', label: "Couldn't scan", count: 1 }]
const Kinds = ({ of }: { of: [string, number][] }) => <span className="flex flex-wrap items-center gap-1">{of.map(([k, n], i) =>
  <Chip key={k} shape="pill" on={i === 0} onClick={noop}>{k} <span className="tnum opacity-70">{n}</span></Chip>)}</span>
const kinds = <Kinds of={[['All', 6], ['X-ray', 2], ['Ultrasound', 1], ['CT', 2], ['MRI', 1]]} />
const reportKinds = <Kinds of={[['All', 5], ['X-ray', 2], ['Ultrasound', 1], ['CT', 2]]} />
const walkIn = <Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>
const find = <Input placeholder="Record number or name" className="w-full sm:w-64" readOnly />
const pay = <Button size="sm" variant="outline">Pay</Button>

/** what a row says: the exam, then the side or the contrast in words */
const Exam = ({ tag, children }: { tag?: ReactNode; children: ReactNode }) => <>{tag}<span className="truncate">{children}</span></>
const SIDE = 'rounded-sm bg-accent-soft px-1 text-11 font-semibold uppercase tracking-wide text-accent'

/** the patients waiting to be scanned (the one being scanned may be opened under its row) */
function ToScan({ open, at }: { open?: ReactNode; at?: 'nour' | 'gamal' }) {
  const rows: { id: string; n: string; name: string; age: string; status: ReactNode; who?: string; min: number | null; marks?: RowMark[]; extra?: ReactNode }[] = [
    { id: 'omar', n: '10019', name: 'Omar Khaled', age: '61 M', status: <Exam tag={<Tag tone="danger">stat</Tag>}>CT brain · without contrast</Exam>, who: 'General Practice', min: 6 },
    { id: 'hoda', n: '10044', name: 'Hoda Samy', age: '63 F', status: <Exam tag={<Tag>portable</Tag>}>X-ray chest</Exam>, who: 'Medical Ward · Bed 3', min: 14 },
    { id: 'nour', n: '10077', name: 'Nour Hany', age: '27 F', status: <Exam tag={<Tag tone="info">walk-in</Tag>}>X-ray knee <span className={SIDE}>left</span></Exam>,
      who: 'Dr. Karim Adel · outside', min: 9, marks: [{ key: 'preg', word: 'ask pregnant', tone: 'warn' }] },
    { id: 'gamal', n: '10007', name: 'Gamal Eid', age: '47 M', status: <Exam>CT abdomen & pelvis · with contrast</Exam>, who: 'General Practice', min: 22,
      marks: [{ key: 'c', word: 'eGFR 28 · metformin', tone: 'danger' }] },
    { id: 'mona', n: '10231', name: 'Mona Adel', age: '34 F', status: <Exam tag={<Tag tone="info">walk-in</Tag>}>US abdomen</Exam>, min: 4,
      marks: [{ key: 'pay', word: 'Waiting for payment', tone: 'warn' }], extra: pay },
    { id: 'samy', n: '10102', name: 'Samy Lotfy', age: '52 M', status: <Exam>MRI lumbar spine</Exam>, who: 'General Practice', min: null, marks: [{ key: 'b', word: 'Booked 11:30', tone: 'info' }] },
  ]
  return <Card><ul>{rows.map((r) => <ListRow key={r.id} number={r.n} name={r.name} age={r.age} status={r.status} who={r.who} minutes={r.min} marks={r.marks} extra={r.extra}
    selected={r.id === at} below={r.id === at ? open : undefined} />)}</ul></Card>
}

/** who and which side, said aloud before the scan: the two identifiers and the side from the order, big */
function Check({ name, line, side, part }: { name: string; line: string; side?: string; part: string }) {
  return <div className="grid content-start gap-2">
    <Label>Before the scan</Label>
    <p className="text-18 font-semibold text-fg">{name}</p>
    <p className="text-13 text-muted">{line}</p>
    <p className="text-12 text-faint">Ask the name and the birth date; both must match.</p>
    <div className="mt-1 grid place-items-center rounded-lg bg-surface px-2 py-3 text-center ring-2 ring-accent">
      {side && <span className="text-22 font-bold uppercase tracking-wide text-accent">{side}</span>}
      <span className="text-14 text-fg">{part}</span></div>
  </div>
}
const Row = ({ label, children }: { label: string; children: ReactNode }) =>
  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2"><span className="w-28 shrink-0 text-13 font-medium text-fg">{label}</span>{children}</div>
const Done = ({ hint }: { hint: ReactNode }) => <div className="flex flex-wrap items-center gap-2 pt-1">
  <Button size="sm">Scanned<Kbd className="ms-1">↵</Kbd></Button><Button size="sm" variant="ghost">Couldn't scan…</Button>
  <span className="text-12 text-faint">{hint}</span></div>

// ── 1 · the doctor orders ──
export function RadOrder() {
  return <Chart who={['Samia Ibrahim', '46 y · F · #10092']} safety={<span className="text-muted">No known allergies</span>}>
    <Line>/ct abd pelvis +c urgent ? appendicitis</Line>
    <Under>
      <Pick first name="CT abdomen & pelvis · with contrast" code="ctap+c" section="CT" also="fasting 4 hours" />
      <Pick name="CT abdomen & pelvis · without contrast" code="ctap" section="CT" />
      <div className="grid gap-2 border-t border-line px-2 pt-2">
        <Label>Before contrast · from her record</Label>
        <div className="flex flex-wrap items-center gap-1.5 text-13"><Tag tone="ok">eGFR 61</Tag><span className="text-muted">creatinine 1.1 · 12 days ago</span>
          <Tag tone="warn">metformin 1 g twice a day</Tag><Tag>no known allergies</Tag></div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="text-13 text-fg">Pregnant?</span>
          <Chip onClick={noop}>Not pregnant</Chip><Chip onClick={noop}>Pregnant</Chip><Chip onClick={noop}>Not sure</Chip>
          <span className="text-12 text-faint">optional here · radiology asks at the door anyway</span></div>
      </div>
      <Keys><Kbd>tab</Kbd> takes the first · words on the line: <span className="font-mono">left right both · +c −c · urgent stat · portable · ? the question</span></Keys>
    </Under>
    <Drafts n={1} to="Radiology">
      <Test name="CT abdomen & pelvis · with contrast" extra={<><Tag tone="warn">urgent</Tag><span className="text-12 text-muted">? appendicitis</span></>} x />
      <p className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-12 text-muted">Tell her: fasting 4 hours <Arabic className="text-13">صائمة ٤ ساعات</Arabic></p>
    </Drafts>
    <p className="text-12 text-faint">The facts are only shown, never a stop: the doctor decides. An eGFR older than 30 days, or none, says “no recent eGFR”.</p>
  </Chart>
}

// ── 2 · a walk-in at radiology ──
export function RadWalkIn() {
  const top = [['X-ray chest', false], ['US abdomen', true], ['US pelvis', false], ['X-ray knee', false], ['X-ray L-spine', false], ['CT brain', false]] as const
  return <App {...RAD}>
    <ScreenFrame views={scanViews} view="todo" onView={noop} filters={kinds} search={find} action={walkIn}>
      <WalkInSteps query="0122 450" people={[['10231', 'Mona Adel', '34 F', '0122 450 1187', 'last here 2 Aug'], ['10260', 'Mona Adel Saad', '58 F', '0122 450 9032', 'never here']]}
        picked={['Mona Adel', '34 F']} asked="Dr. Samir Fouad · Nasr City clinic" start="Start · US abdomen"
        what={<div className="grid gap-2">
          <Input value="/us abd" readOnly className="font-mono" />
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Asked for most:</span>
            {top.map(([t, on]) => <Chip key={t} on={on} variant="check" onClick={noop}>{t}</Chip>)}</div>
          <p className="flex flex-wrap items-center gap-2 text-12 text-muted">US abdomen: fasting 6 hours <Arabic className="text-13">صائمة ٦ ساعات</Arabic></p>
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">When:</span><Chip on onClick={noop}>Now</Chip><Chip onClick={noop}>Book a time</Chip>
            <span className="text-12 text-faint">a time comes with the bookings pack</span></div>
        </div>} />
      <ToScan />
    </ScreenFrame>
  </App>
}

// ── 3 · the Scan list ──
export function RadList() {
  return <App {...RAD}>
    <ScreenFrame views={scanViews} view="todo" onView={noop} filters={kinds} search={find} action={walkIn}>
      <ToScan />
      <p className="text-12 text-faint">One list for every room, stat first, then by waiting; a kind chip narrows it to one room's work. A ward patient says the bed
        (portable: go to them). Booked patients join at their time. The marks are each pack's: pregnant to ask, the facts before contrast, billing's payment.</p>
    </ScreenFrame>
  </App>
}

// ── 4 · scanning: who, which side, pregnant ──
export function RadScan() {
  return <App {...RAD}>
    <ScreenFrame views={scanViews} view="todo" onView={noop} filters={kinds} search={find} action={walkIn}>
      <ToScan at="nour" open={<div className="grid gap-4 border-t border-line bg-sunken p-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <Check name="Nour Hany" line="#10077 · 27 F · born 3 May 1999" side="Left" part="knee · AP and lateral" />
        <div className="grid content-start gap-2">
          <Label>Asked here</Label>
          <Row label="Pregnant?"><Chip on onClick={noop}>Not pregnant</Chip><Chip onClick={noop}>Pregnant</Chip><Chip onClick={noop}>Not sure</Chip>
            <span className="ms-auto text-12 text-faint">women 12–50 · X-ray and CT</span></Row>
          <Row label="Views"><Chip on variant="check" onClick={noop}>AP</Chip><Chip on variant="check" onClick={noop}>Lateral</Chip><Chip variant="check" onClick={noop}>Skyline</Chip></Row>
          <p className="text-12 text-muted">What she says goes into her record, so the next department sees it too. Pregnant or not sure: ask the radiologist, or Couldn't scan.</p>
          <Done hint="goes to Report · Couldn't: refused, pregnant, not fasting, left, machine down" />
        </div>
      </div>} />
    </ScreenFrame>
  </App>
}

// ── 5 · scanning with contrast ──
export function RadContrast() {
  return <App {...RAD}>
    <ScreenFrame views={scanViews} view="todo" onView={noop} filters={kinds} search={find} action={walkIn}>
      <ToScan at="gamal" open={<div className="grid gap-4 border-t border-line bg-sunken p-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <Check name="Gamal Eid" line="#10007 · 47 M · born 12 Jan 1979" part="CT abdomen & pelvis · with contrast" />
        <div className="grid content-start gap-2">
          <Label>Before contrast · from his record</Label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-13">
            <Tag tone="danger">eGFR 28</Tag><span className="text-muted">creatinine 2.6 · 3 days ago</span><Tag tone="warn">metformin 1 g twice a day</Tag><Tag>no known allergies</Tag></div>
          <Callout tone="warn" title="eGFR under 30: the radiologist decides on contrast">
            If given: stop metformin for 48 hours, then check creatinine. <Arabic className="ms-1 text-13">أوقف الميتفورمين ٤٨ ساعة ثم حلل الكرياتينين</Arabic></Callout>
          <Label className="pt-1">Asked here</Label>
          <Row label="Radiologist"><Chip on onClick={noop}>Contrast agreed</Chip><Chip onClick={noop}>Without contrast</Chip>
            <span className="ms-auto text-12 text-faint">Dr. Mai Farouk · 10:05</span></Row>
          <Row label="Fasting 4 h?"><Chip on onClick={noop}>Yes</Chip><Chip onClick={noop}>No</Chip></Row>
          <Row label="Contrast given"><Input readOnly value="Omnipaque 350" className="w-40" /><Input readOnly value="80" className="w-16 text-end" /><span className="text-13 text-muted">mL · IV</span>
            <Input readOnly placeholder="lot (optional)" className="w-32" /></Row>
          <Row label="Reaction"><Chip on onClick={noop}>None</Chip><Chip onClick={noop}>Mild</Chip><Chip onClick={noop}>Moderate</Chip><Chip onClick={noop}>Severe</Chip>
            <span className="ms-auto text-12 text-faint">a reaction is added to his allergies</span></Row>
          <Done hint="the contrast goes into his record as given · goes to Report" />
        </div>
      </div>} />
    </ScreenFrame>
  </App>
}

// ── 6 · the report ──
const reportViews: ScreenView<string>[] = [{ id: 'todo', label: 'To report', count: 5, needs: 'warn' }, { id: 'draft', label: 'Drafts', count: 1 }, { id: 'done', label: 'Signed today', count: 23 }]
const toReport: [string, string, ReactNode, string, boolean?][] = [
  ['omar', 'Omar Khaled', <><Tag tone="danger">stat</Tag>CT brain</>, '8 min'],
  ['gamal', 'Gamal Eid', 'CT abdomen & pelvis +C', '14 min', true],
  ['tarek', 'Tarek Nabil', 'X-ray lumbar spine', '25 min'],
  ['nour', 'Nour Hany', <>X-ray knee <span className={SIDE}>left</span></>, '31 min'],
  ['rania', 'Rania Said', 'US pelvis', '40 min'],
]
function Worklist({ at }: { at: string }) {
  return <Card className="self-start"><ul>
    <ListSection title="To report" count={toReport.length} />
    {toReport.map(([id, name, exam, ago]) => <li key={id} className={cn('grid gap-0.5 border-t border-line px-3 py-2 text-13', id === at && 'rail bg-hover')}>
      <span className="flex items-center gap-2"><span className="font-medium text-fg">{name}</span><span className="ms-auto text-12 text-faint tnum">{ago}</span></span>
      <span className="flex items-center gap-1.5 truncate text-muted">{exam}</span></li>)}
  </ul></Card>
}
function Head({ name, line, exam, from }: { name: string; line: string; exam: ReactNode; from: string }) {
  return <div className="flex flex-wrap items-start gap-3">
    <div className="grid min-w-0 flex-1 gap-0.5">
      <p className="flex flex-wrap items-baseline gap-2"><span className="text-18 font-semibold text-fg">{name}</span><span className="text-13 text-muted">{line}</span></p>
      <p className="text-14 font-medium text-fg">{exam}</p>
      <p className="text-12 text-muted">{from}</p>
    </div>
    <Button size="sm" variant="outline" disabled title="later: the clinic's image viewer"><ExternalLink />Images<span className="text-11 text-faint">later</span></Button>
  </div>
}
const FINDINGS = `Liver normal in size and density, no focal lesion.
Gallbladder, pancreas and spleen unremarkable.
Right kidney: moderate hydronephrosis down to a 7 mm stone in the lower right ureter, 2 cm above the bladder. Perinephric stranding.
Left kidney normal; no stone.
Appendix normal. No free fluid, no collection. No enlarged lymph nodes.
Lung bases clear.`
const IMPRESSION = `1. Right lower ureteric stone, 7 mm, with moderate hydronephrosis.
2. No appendicitis.`
export function RadReport() {
  return <App {...DR}>
    <ScreenFrame views={reportViews} view="todo" onView={noop} filters={reportKinds} search={find}>
      <div className="grid gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
        <Worklist at="gamal" />
        <Card className="grid content-start gap-3 p-4">
          <Head name="Gamal Eid" line="47 M · #10007" exam="CT abdomen & pelvis · with contrast · ? right loin pain, blood in urine"
            from="Dr. Ali Hassan · General Practice · scanned 10:12 by Ahmed Saber · Omnipaque 350, 80 mL, no reaction · eGFR 28, contrast agreed by Dr. Mai Farouk" />
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-13">
            <span className="text-12 font-semibold uppercase tracking-[0.06em] text-faint">Before</span>
            <span className="text-fg">US abdomen · 3 Mar · Dr. Mai Farouk</span><span className="min-w-0 flex-1 truncate text-muted">“Right renal stone 6 mm, mild hydronephrosis.”</span>
            <Chip on variant="check" onClick={noop}>Compared</Chip></div>
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Template:</span>
            {['Normal CT abdomen', 'Renal colic', 'Appendicitis'].map((t, i) => <Chip key={t} on={i === 1} onClick={noop}>{t}</Chip>)}
            <span className="text-12 text-faint">or type <span className="font-mono">#</span> and its name</span></div>
          <label className="grid gap-1"><Label>Findings</Label><Textarea readOnly value={FINDINGS} minRows={8} /></label>
          <label className="grid gap-1"><Label>Impression · what the doctor reads first</Label><Textarea readOnly value={IMPRESSION} minRows={2} className="font-medium" /></label>
          <div className="flex flex-wrap items-center gap-2">
            <Button>Sign<Kbd className="ms-1">⌘↵</Kbd></Button><Button variant="ghost">Save draft</Button>
            <Chip onClick={noop}>Critical…</Chip>
            <span className="text-12 text-faint">Signed, it goes to Dr. Ali Hassan's To review and into the chart.</span></div>
        </Card>
      </div>
    </ScreenFrame>
  </App>
}

// ── 7 · a critical finding ──
export function RadCritical() {
  return <App {...DR}>
    <ScreenFrame views={reportViews} view="todo" onView={noop} filters={reportKinds} search={find}>
      <div className="grid gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
        <Worklist at="omar" />
        <Card className="grid content-start gap-3 p-4">
          <Head name="Omar Khaled" line="61 M · #10019" exam={<span className="flex items-center gap-2"><Tag tone="danger">stat</Tag>CT brain · without contrast · ? fell, drowsy</span>}
            from="Dr. Ali Hassan · General Practice · scanned 10:31 by Ahmed Saber" />
          <label className="grid gap-1"><Label>Impression</Label><Textarea readOnly minRows={2} className="font-medium"
            value={'1. Acute right subdural haematoma, 9 mm, with 6 mm midline shift.\n2. No fracture.'} /></label>
          <Callout tone="danger" title="Critical: tell Dr. Ali Hassan now">Phone General Practice, then sign. It reaches the doctor's To review as critical at once.</Callout>
          <div className="flex flex-wrap items-center gap-2"><Button variant="danger">Sign · critical<Kbd className="ms-1">⌘↵</Kbd></Button>
            <span className="text-12 text-faint">The same notice as the lab's. A walk-in: tell the patient or the doctor who asked. Logging the call comes later.</span></div>
        </Card>
      </div>
    </ScreenFrame>
  </App>
}

// ── 8 · what comes back to the doctor ──
export function RadBack() {
  const views: ScreenView<string>[] = [{ id: 'queue', label: 'Queue', count: 6 }, { id: 'review', label: 'To review', count: 3, needs: 'danger' }]
  const items: [string, Tone, string, string, string, string][] = [
    ['Omar Khaled', 'danger', 'critical', 'CT brain: acute right subdural haematoma, 9 mm, midline shift', 'signed 10:44 · Dr. Mai Farouk', 'Reviewed'],
    ['Gamal Eid', 'info', 'radiology', 'CT abdomen & pelvis: right lower ureteric stone 7 mm, moderate hydronephrosis', 'signed 10:48 · Dr. Mai Farouk', 'Reviewed'],
    ['Hoda Samy', 'neutral', 'film only', 'X-ray chest · no report asked: the films are with the patient', 'scanned 10:20 · Ahmed Saber', 'Your reading'],
  ]
  return <App dept="General Practice" user="Dr. Ali Hassan">
    <ScreenFrame views={views} view="review" onView={noop} search={<Input placeholder="Record number or name" className="w-full sm:w-72" readOnly />}>
      <Card className="overflow-hidden ring-1 ring-danger-line"><ul>
        <ListSection title="To review" count={items.length} />
        {items.map(([name, tone, why, line, by, act], i) => <li key={name} className={cn('flex items-center gap-3 border-t border-line px-4 py-2 text-13', i === 1 && 'rail bg-hover')}>
          <span className="w-32 shrink-0 truncate font-medium text-fg">{name}</span><Tag tone={tone}>{why}</Tag>
          <span className={cn('min-w-0 flex-1 truncate', tone === 'danger' ? 'font-semibold text-danger' : 'text-fg')}>{line}</span>
          <span className="shrink-0 text-12 text-faint">{by}</span><Button size="sm" variant={act === 'Reviewed' ? 'ghost' : 'outline'}>{act}</Button></li>)}
      </ul></Card>
      <Label className="pt-2">In Gamal Eid's chart, under Results</Label>
      <Card className="grid gap-3 p-4">
        <p className="flex flex-wrap items-center gap-2 text-13"><span className="text-14 font-semibold text-fg">CT abdomen & pelvis · with contrast</span>
          <span className="text-muted">Radiology · Dr. Mai Farouk · today 10:48</span><Button size="sm" variant="ghost" className="ms-auto" disabled><ExternalLink />Images · later</Button></p>
        <div className="grid gap-1 rounded-lg bg-sunken px-3 py-2"><Label>Impression</Label>
          <p className="whitespace-pre-line text-14 font-medium text-fg">{IMPRESSION}</p></div>
        <details className="text-13"><summary className="cursor-pointer text-accent">Findings · compared with US abdomen 3 Mar · Omnipaque 350, 80 mL</summary>
          <p className="mt-2 whitespace-pre-line text-muted">{FINDINGS}</p></details>
        <p className="text-12 text-faint">The order's line in the chart follows it: ordered 09:40 · scanned 10:12 · reported 10:48. An X-ray with no report asked is the doctor's own reading (film only).</p>
      </Card>
    </ScreenFrame>
  </App>
}

// ── 9 · radiology's settings ──
const exams: [string, string, string, string, ReactNode, string][] = [
  ['X-ray chest', 'X-ray', '—', '—', '—', 'if the doctor asks'],
  ['X-ray knee', 'X-ray', 'asks', '—', '—', 'always'],
  ['US abdomen', 'Ultrasound', '—', '—', <>fasting 6 h · <Arabic className="text-13">صائم ٦ ساعات</Arabic></>, 'always'],
  ['US pelvis', 'Ultrasound', '—', '—', <>full bladder · <Arabic className="text-13">مثانة ممتلئة</Arabic></>, 'always'],
  ['CT brain', 'CT', '—', 'without', '—', 'always'],
  ['CT abdomen & pelvis', 'CT', '—', 'with or without', <>fasting 4 h · <Arabic className="text-13">صائم ٤ ساعات</Arabic></>, 'always'],
  ['MRI lumbar spine', 'MRI', '—', 'optional', <>no metal · <Arabic className="text-13">بدون معادن</Arabic></>, 'always'],
]
export function RadSettings() {
  const sw: [string, string, boolean, boolean?][] = [
    ['Ask pregnant at the door', 'Women 12–50, before an X-ray or a CT. Off only where another place always asks.', true],
    ['Report in two steps', 'A resident or a typist writes; a radiologist signs. Off: the radiologist writes and signs in one step.', false],
    ['Images viewer', 'A link from each study to the clinic\'s image viewer (PACS), when the clinic has one.', false, true],
  ]
  return <App dept="Settings" user="Dr. Mai Farouk">
    <div className="mx-auto grid w-full max-w-5xl gap-3 px-4 py-4">
      <p className="text-13 text-muted">Settings → Departments → <b className="font-medium text-fg">Radiology</b> · Radiology pack</p>
      <Card className="overflow-x-auto"><table className="w-full text-13">
        <thead><tr className="border-b border-line text-start">{['Exam', 'Kind', 'Side', 'Contrast', 'Tell the patient', 'Report'].map((h) =>
          <th key={h} className="px-3 py-2 text-start text-11 font-semibold uppercase tracking-[0.06em] text-faint">{h}</th>)}</tr></thead>
        <tbody>{exams.map(([e, k, s, c, p, r]) => <tr key={e} className="border-t border-line">
          <td className="px-3 py-2 font-medium text-fg">{e}</td><td className="px-3 py-2 text-muted">{k}</td><td className="px-3 py-2 text-muted">{s}</td>
          <td className="px-3 py-2 text-muted">{c}</td><td className="px-3 py-2 text-muted">{p}</td>
          <td className="px-3 py-2">{r === 'if the doctor asks' ? <Tag tone="warn">if the doctor asks</Tag> : <span className="text-muted">{r}</span>}</td></tr>)}</tbody>
      </table>
        <p className="border-t border-line px-3 py-2 text-12 text-faint">The starter setup brings ~30 common exams; each is a service of this department, so prices are billing's (Billing → Prices).
          Templates are the department's presets.</p></Card>
      <Card className="grid gap-0">{sw.map(([t, d, on, later]) => <div key={t} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
        <div className="grid flex-1 gap-0.5"><span className="flex items-center gap-2 text-14 font-medium text-fg">{t}{later && <span className="text-11 text-faint">later</span>}</span>
          <span className="text-12 text-muted">{d}</span></div>
        <Switch checked={on} onChange={noop} label={t} disabled={later} /></div>)}</Card>
    </div>
  </App>
}
