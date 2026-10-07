// The laboratory's pictures: a walk-in (the bench's two steps, with the /order line and the tests asked for most), the collection room (tubes by colour, the sample number), results
// typed by section in one grid (ranges, the change check, a calculated LDL), and a critical value's notice to tell the doctor
// (owner, 2026-10-07: only a notice; logging the call comes later).
import type { ReactNode } from 'react'
import { Plus, TriangleAlert } from 'lucide-react'
import { Button, Callout, Card, Chip, Input, Kbd, ListRow, ListSection, ScreenFrame, Tag, cn, flagMark, type ScreenView } from '@core/ui'
import { App, Label, Tube, type TubeColour } from './kit'
import { WalkInSteps } from './bench'

const LAB = { dept: 'Laboratory', user: 'Karim Fawzy', tabs: ['Collect', 'Results'] }
const noop = () => undefined
const collectViews: ScreenView<string>[] = [{ id: 'todo', label: 'To collect', count: 5, needs: 'warn' }, { id: 'done', label: 'Collected', count: 12 }, { id: 'no', label: "Couldn't collect", count: 1 }]
const walkIn = <Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>
const find = <Input placeholder="Sample number, record number or name" className="w-full sm:w-72" readOnly />

/** the patients waiting to give a sample (the first one may be opened) */
function ToCollect({ open }: { open?: ReactNode }) {
  return <Card><ul>
    <ListRow number="10231" name="Mona Adel" age="34 F" selected={!!open} status={<><Tag tone="info">walk-in</Tag><span className="truncate">CBC, Lipid profile, HbA1c, Fasting glucose</span></>}
      actions={<><Button size="sm">Collected</Button><Button size="sm" variant="ghost">Couldn't</Button></>} minutes={4} />
    {open}
    <ListRow number="10019" name="Omar Khaled" age="61 M" status={<><Tag tone="danger">stat</Tag><span className="truncate">Potassium, Sodium, Creatinine, Urea</span></>}
      who="General Practice" minutes={7} />
    <ListRow number="10007" name="Gamal Eid" age="47 M" status={<span className="truncate">HbA1c, ALT, AST</span>} who="General Practice" minutes={12} />
    <ListRow number="10044" name="Hoda Samy" age="63 F" status={<><Tag>at the ward</Tag><span className="truncate">CBC, CRP</span></>} who="Medical Ward · Bed 3" minutes={18} />
    <ListRow number="10052" name="Ahmed Tarek" age="29 M" status={<span className="truncate">Urine analysis</span>} who="General Practice" minutes={31} />
  </ul></Card>
}

export function LabWalkIn() {
  const top = [['CBC', true], ['Lipid profile', true], ['HbA1c', true], ['Fasting glucose', true], ['KFT', false], ['Urine analysis', false]] as const
  return <App {...LAB}>
    <ScreenFrame views={collectViews} view="todo" onView={noop} search={find} action={walkIn}>
      <WalkInSteps query="0100 234" people={[['10231', 'Mona Adel', '34 F', '0100 234 5678', 'last here 2 Aug'], ['10240', 'Mona Adel Fahmy', '29 F', '0100 234 1190', 'never here']]}
        picked={['Mona Adel', '34 F']} asked="Dr. Samir Fouad · Nasr City clinic" start="Start · 4 tests"
        what={<div className="grid gap-2">
          <Input value="/order cbc, lipid profile, hba1c, fbs" readOnly className="font-mono" />
          <div className="flex flex-wrap items-center gap-1.5"><span className="text-12 text-faint">Asked for most:</span>
            {top.map(([t, on]) => <Chip key={t} on={on} variant="check" onClick={noop}>{t}</Chip>)}</div>
          <p className="flex flex-wrap items-center gap-1.5 text-12 text-muted">3 tubes · <Tube c="purple" /> purple <Tube c="yellow" /> yellow <Tube c="grey" /> grey · fasting asked at collection</p>
        </div>} />
      <ToCollect />
    </ScreenFrame>
  </App>
}

const tubes: [TubeColour, string, string][] = [['purple', 'Purple · EDTA', 'CBC · HbA1c'], ['yellow', 'Yellow · gel', 'Lipid profile'], ['grey', 'Grey · fluoride', 'Fasting glucose']]
export function LabCollect() {
  return <App {...LAB}>
    <ScreenFrame views={collectViews} view="todo" onView={noop} search={find} action={walkIn}>
      <ToCollect open={<li className="grid gap-4 border-t border-line bg-sunken p-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="grid content-start gap-1">
          <Label>Sample number</Label>
          <p className="font-mono text-22 font-semibold tracking-wide text-fg">S-1007-0147</p>
          <p className="text-12 text-muted">Write it on each tube. Labels come with printing.</p>
        </div>
        <div className="grid gap-2">
          <Label>Tubes · 3</Label>
          {tubes.map(([c, name, tests]) => <div key={c} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <Tube c={c} className="h-5 w-3.5" /><span className="w-32 text-13 font-medium text-fg">{name}</span><span className="text-13 text-muted">{tests}</span>
            {c === 'grey' && <span className="ms-auto flex items-center gap-1.5 text-12 text-muted">Fasting 8 h? <Chip on onClick={noop}>Yes</Chip><Chip onClick={noop}>No</Chip></span>}</div>)}
          <div className="flex flex-wrap items-center gap-2 pt-1"><Button size="sm">Collected · 3 tubes<Kbd className="ms-1">↵</Kbd></Button><Button size="sm" variant="ghost">Couldn't collect…</Button>
            <span className="text-12 text-faint">Couldn't: refused · no vein · not fasting · left — the doctor sees why</span></div>
        </div>
      </li>} />
    </ScreenFrame>
  </App>
}

// ── results by section ──
type Flag = 'high' | 'low' | 'critical' | null
const cols = [['FBS', 'mg/dL', '70–100'], ['Urea', 'mg/dL', '15–45'], ['Creat.', 'mg/dL', '0.6–1.2'], ['K', 'mmol/L', '3.5–5.1'], ['ALT', 'U/L', '≤ 40'],
  ['Chol.', 'mg/dL', '< 200'], ['TG', 'mg/dL', '< 150'], ['HDL', 'mg/dL', '> 40'], ['LDL', 'mg/dL', '< 130']] as const
type Cell = [string, Flag] | null
const rows: { n: string; name: string; sample: string; tag?: ReactNode; cells: Cell[]; act: ReactNode; note?: ReactNode }[] = [
  { n: '10231', name: 'Mona Adel', sample: 'S-0147', tag: <Tag tone="info">walk-in</Tag>,
    cells: [['126', 'high'], null, null, null, null, ['238', 'high'], ['190', 'high'], ['38', 'low'], ['162', 'high']], act: <Button size="sm">Release</Button> },
  { n: '10019', name: 'Omar Khaled', sample: 'S-0139', tag: <Tag tone="danger">stat</Tag>,
    cells: [null, ['98', 'high'], ['3.9', 'high'], ['6.9', 'critical'], null, null, null, null, null], act: <Button size="sm" variant="danger">Release</Button>,
    note: <span className="flex items-center gap-1.5"><TriangleAlert className="size-3.5 text-warn" /><b className="font-medium text-warn">Change check:</b> creatinine was 1.0 on 3 Oct (4 days ago). Check the sample (haemolysed? wrong patient?) before release.</span> },
  { n: '10007', name: 'Gamal Eid', sample: 'S-0141', cells: [null, null, null, null, ['62', 'high'], null, null, null, null], act: <Button size="sm">Release</Button> },
  { n: '10052', name: 'Ahmed Tarek', sample: 'S-0150', cells: [['92', null], ['31', null], ['0.9', null], ['4.2', null], null, null, null, null, null], act: <Button size="sm" variant="outline">Typing…</Button> },
]
const CELL = { high: 'border-line font-semibold text-warn', low: 'border-line font-semibold text-warn', critical: 'border-danger bg-danger-soft font-semibold text-danger' }
const value = (c: Cell, calc: boolean) => !c ? <span className="text-faint">·</span>
  : <span className={cn('inline-flex h-8 w-[4.5rem] items-center justify-end gap-1 rounded-md border bg-surface px-2 tnum', c[1] ? CELL[c[1]] : 'border-line text-fg', calc && 'border-dashed')}>
    {c[0]}{c[1] && <span aria-hidden className="text-11">{flagMark(c[1])}</span>}</span>
const resultViews: ScreenView<string>[] = [{ id: 'haem', label: 'Haematology', count: 3 }, { id: 'chem', label: 'Chemistry', count: 4, needs: 'danger' }, { id: 'horm', label: 'Hormones', count: 1 },
  { id: 'urine', label: 'Urine & stool', count: 2 }, { id: 'check', label: 'To check', count: 2, needs: 'warn' }]
export function LabResults() {
  return <App {...LAB} tab="Results">
    <ScreenFrame views={resultViews} view="chem" onView={noop} search={find}>
      <Card className="overflow-x-auto"><table className="w-full text-13 tnum">
        <thead><tr className="border-b border-line text-start align-bottom">
          <th className="px-3 py-2 text-start text-11 font-medium uppercase tracking-[0.06em] text-faint">Patient · sample</th>
          {cols.map(([t, u, r]) => <th key={t} className="px-1.5 py-2 text-end font-normal"><span className="block text-12 font-semibold text-fg">{t}{t === 'LDL' && <span className="ms-1 text-11 font-normal text-faint">calc</span>}</span>
            <span className="block text-11 text-faint">{u}</span><span className="block text-11 text-faint">{r}</span></th>)}
          <th className="px-3 py-2" />
        </tr></thead>
        <tbody>{rows.flatMap((r) => [
          <tr key={r.n} className={cn('border-t border-line', r.note && 'bg-hover')}>
            <td className="px-3 py-2"><span className="flex items-center gap-2"><span className="font-medium text-fg">{r.name}</span>{r.tag}</span>
              <span className="font-mono text-11 text-faint">#{r.n} · {r.sample}</span></td>
            {r.cells.map((c, i) => <td key={i} className="px-1.5 py-2 text-end">{value(c, i === 8)}</td>)}
            <td className="px-3 py-2 text-end">{r.act}</td>
          </tr>,
          r.note && <tr key={`${r.n} note`} className="bg-hover"><td colSpan={cols.length + 2} className="px-3 pb-2 text-12 text-muted">{r.note}</td></tr>,
        ])}</tbody>
      </table></Card>
      <p className="text-12 text-faint">Type down a column or across a row (↵ next, Tab across); ranges by age and sex; LDL is worked out from cholesterol, TG and HDL;
        a second person's check (To check) is a lab setting.</p>
    </ScreenFrame>
  </App>
}

export function LabCritical() {
  return <App {...LAB} tab="Results">
    <ScreenFrame views={resultViews} view="chem" onView={noop} search={find}>
      <Card><ul>
        <ListSection title="Chemistry · critical" />
        <ListRow number="10019" name="Omar Khaled" age="61 M" selected status={<><Tag tone="danger">critical</Tag><span className="truncate">Potassium 6.9 mmol/L ‼ (3.5–5.1) · Creatinine 3.9 ↑</span></>}
          who="General Practice · Dr. Ali Hassan" minutes={22} />
        <li className="grid gap-3 border-t border-line bg-sunken p-4">
          <Callout tone="danger" title="Critical: tell Dr. Ali Hassan now">Potassium 6.9 mmol/L. Phone General Practice, then release.</Callout>
          <div className="flex flex-wrap items-center gap-2"><Button variant="danger">Release<Kbd className="ms-1">↵</Kbd></Button>
            <span className="text-12 text-muted">It reaches the doctor's To review as critical at once.</span></div>
          <p className="text-12 text-faint">A walk-in: tell the patient or the doctor who asked. Logging the call (who, when, read back) can come later.</p>
        </li>
      </ul></Card>
    </ScreenFrame>
  </App>
}
