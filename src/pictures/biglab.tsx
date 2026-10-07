// A large lab (owner, 2026-10-07: separate switches under "Large lab", all off for a small lab): its settings, collection chairs
// with patients called by number, tubes scanned in as they arrive, and results that come from the analysers — normal ones released
// by themselves, people seeing only what a rule stopped.
import { Megaphone, Printer, RotateCcw, ScanLine } from 'lucide-react'
import { Button, Card, Fieldset, FormRow, Input, Kbd, ListRow, ListSection, ScreenFrame, Segmented, Switch, Tag, cn, type ScreenView } from '@core/ui'
import { App, Label, Tube } from './kit'

const LAB = { dept: 'Laboratory', user: 'Karim Fawzy', tabs: ['Collect', 'Receive', 'Results'] }
const noop = () => undefined
const scan = (placeholder: string) => <Input placeholder={placeholder} className="w-full sm:w-72" readOnly />

export function LabSettings() {
  return <App dept="Laboratory" user="Amira Lotfy">
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-4">
      <p className="text-18 font-semibold text-fg">Settings · Departments · Laboratory</p>
      <Fieldset title="Large lab · each one on its own">
        <FormRow label="Sample labels" hint="Printed barcode labels for each tube, or a number written by hand."><Segmented aria-label="Sample labels" value="print" onChange={noop}
          options={[['write', 'Written number'], ['print', <>Printed barcode<Printer /></>]]} /></FormRow>
        <FormRow label="Scan to receive" hint="Tubes are scanned in as they arrive; a rejected one goes back for a new sample."><Switch checked onChange={noop} label="Scan to receive" /></FormRow>
        <FormRow label="Collection chairs" hint="Each chair has its own list; patients are called to a chair by number."><Input readOnly value="4" className="w-20 text-end" /></FormRow>
        <FormRow label="Results from analysers" hint="Results come in from the machines; people check them."><span className="flex items-center gap-3"><Switch checked onChange={noop} label="Results from analysers" />
          <span className="text-13 text-muted">3 connected · Sysmex XN-550, Cobas c311, Architect i1000</span></span></FormRow>
        <FormRow label="Release normal results by themselves" hint="No flag, no big change from the last result, the analyser says all is well: it goes out. Anything else waits for a person.">
          <Switch checked onChange={noop} label="Release normal results by themselves" /></FormRow>
        <FormRow label="Second person checks" hint="A senior approves what a person released (To check)."><Switch checked={false} onChange={noop} label="Second person checks" /></FormRow>
        <FormRow label="Turnaround targets" hint="A sample waiting past its target turns amber.">
          <span className="flex flex-wrap gap-2 text-13">{[['Haematology', '60'], ['Chemistry', '120'], ['Hormones', '240'], ['Urine & stool', '60']].map(([s, m]) =>
            <span key={s} className="inline-flex items-center gap-1.5"><span className="text-muted">{s}</span><Input dense readOnly value={m} className="w-14 text-end" /><span className="text-faint">min</span></span>)}</span></FormRow>
      </Fieldset>
      <p className="text-12 text-faint">All off: a small lab — numbers written on the tubes, results typed in the grid, released by whoever typed them.</p>
    </div>
  </App>
}

const collectViews: ScreenView<string>[] = [{ id: 'todo', label: 'To collect', count: 46, needs: 'warn' }, { id: 'done', label: 'Collected', count: 312 }, { id: 'no', label: "Couldn't collect", count: 3 }]
const chairs = <Segmented aria-label="Chair" value="2" onChange={noop} options={[['all', 'All chairs'], ['1', 'Chair 1'], ['2', 'Chair 2 · me'], ['3', 'Chair 3'], ['4', 'Chair 4']]} />
export function LabChairs() {
  return <App {...LAB}>
    <ScreenFrame views={collectViews} view="todo" onView={noop} filters={chairs} search={scan('Scan a request or type')}>
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="grid gap-1"><Label>Chair 2 · now</Label>
          <p className="flex flex-wrap items-baseline gap-3"><span className="font-mono text-22 font-semibold text-fg">#148</span><span className="text-16 font-medium text-fg">Mona Adel</span>
            <span className="text-13 text-muted">34 F · CBC, Lipid profile, HbA1c, FBS</span></p>
          <p className="flex flex-wrap items-center gap-2 text-12 text-muted"><Tube c="purple" />CBC · HbA1c <Tube c="yellow" />Lipid profile <Tube c="grey" />FBS · fasting ✓</p></div>
        <div className="flex flex-wrap gap-2"><Button><Printer />Collected · 3 labels<Kbd className="ms-1">↵</Kbd></Button><Button variant="outline"><Megaphone />Call #149</Button></div>
      </Card>
      <Card><ul>
        <ListSection title="Waiting for a chair · the next 5 of 46" />
        {[['#149', '10019', 'Omar Khaled', '61 M', 'Potassium, Sodium, Creatinine', 'stat', 7], ['#150', '10007', 'Gamal Eid', '47 M', 'HbA1c, ALT, AST', '', 12],
          ['#151', '10301', 'Rania Samir', '26 F', 'CBC, TSH, Ferritin', 'walk-in', 14], ['#152', '10302', 'Mahmoud Fathy', '55 M', 'Lipid profile, FBS', 'walk-in', 15],
          ['#153', '10052', 'Ahmed Tarek', '29 M', 'Urine analysis', '', 31]].map(([t, n, name, age, tests, tag, m]) =>
          <ListRow key={String(t)} number={n} name={name} age={age} next={t === '#149'} status={<><span className="font-mono text-12 font-semibold text-fg">{t}</span>
            {tag && <Tag tone={tag === 'stat' ? 'danger' : 'info'}>{tag}</Tag>}<span className="truncate">{tests}</span></>} minutes={Number(m)} />)}
      </ul></Card>
      <p className="text-12 text-faint">The waiting-room screen shows "#148 → Chair 2". Stat requests jump the line. Only what is next is listed; a scan finds anyone.</p>
    </ScreenFrame>
  </App>
}

const receiveViews: ScreenView<string>[] = [{ id: 'wait', label: 'Not arrived', count: 34, needs: 'warn' }, { id: 'in', label: 'Received today', count: 280 }, { id: 'rej', label: 'Rejected', count: 2, needs: 'danger' }]
export function LabReceive() {
  return <App {...LAB} tab="Receive">
    <ScreenFrame views={receiveViews} view="in" onView={noop}>
      <Card className="grid gap-2 p-4 ring-1 ring-accent-line">
        <div className="flex h-14 items-center gap-3 rounded-lg border border-accent bg-surface px-4"><ScanLine className="size-5 text-accent" />
          <span className="text-16 text-faint">Scan a tube…</span><Kbd className="ms-auto">ready</Kbd></div>
        <p className="text-12 text-faint">Each scan marks the tube received and says where it goes. A beep for an unknown, late or already-received tube.</p>
      </Card>
      <Card><ul>
        <ListSection title="Just scanned" />
        {[['S-1007-0147', 'Mona Adel', 'purple', 'CBC · HbA1c', 'Haematology', '09:14', null], ['S-1007-0147', 'Mona Adel', 'yellow', 'Lipid profile', 'Chemistry', '09:14', null],
          ['S-1007-0151', 'Rania Samir', 'purple', 'CBC', 'Haematology', '09:13', 'haemolysed'], ['S-1007-0139', 'Omar Khaled', 'yellow', 'K, Na, Creatinine', 'Chemistry · stat', '09:12', null]]
          .map(([s, name, c, tests, to, at, bad], i) => <li key={i} className={cn('flex items-center gap-3 border-t border-line px-4 py-2 text-13', bad && 'bg-danger-soft')}>
            <span className="w-12 text-12 text-faint tnum">{at}</span><Tube c={c as 'purple' | 'yellow'} /><span className="w-28 font-mono text-12 text-muted">{s}</span>
            <span className="w-32 font-medium text-fg">{name}</span><span className="min-w-0 flex-1 truncate text-fg">{tests}</span>
            {bad ? <><Tag tone="danger">rejected · {bad}</Tag><span className="text-12 text-muted">back to Collect: new sample</span></>
              : <><span className="text-12 text-muted">→ {to}</span><Tag tone="ok">received</Tag><Button size="sm" variant="ghost">Reject…</Button></>}</li>)}
      </ul></Card>
    </ScreenFrame>
  </App>
}

const resultViews: ScreenView<string>[] = [{ id: 'check', label: 'To check', count: 28, needs: 'warn' }, { id: 'auto', label: 'Released by themselves', count: 396 },
  { id: 'hand', label: 'Typed by hand', count: 6 }, { id: 'late', label: 'Late', count: 2, needs: 'danger' }]
const machines: [string, string, string, boolean][] = [['Sysmex XN-550', 'Haematology', '212 today', true], ['Cobas c311', 'Chemistry', '486 today', true], ['Architect i1000', 'Hormones', 'last message 14 min ago', false]]
export function LabAnalysers() {
  return <App {...LAB} tab="Results">
    <ScreenFrame views={resultViews} view="check" onView={noop} search={scan('Sample number, record number or name')}>
      <div className="grid gap-2 sm:grid-cols-3">{machines.map(([m, s, n, ok]) => <Card key={m} className={cn('flex items-center gap-2 px-3 py-2 text-13', !ok && 'ring-1 ring-warn')}>
        <span className={cn('size-2 rounded-full', ok ? 'bg-ok' : 'bg-warn')} /><span className="font-medium text-fg">{m}</span><span className="text-12 text-muted">{s}</span>
        <span className={cn('ms-auto text-12', ok ? 'text-faint' : 'text-warn')}>{n}</span></Card>)}</div>
      <Card><ul>
        <ListSection title="Stopped by a rule · a person decides" count={28} />
        {[['10019', 'Omar Khaled', '61 M', 'Potassium 6.9 mmol/L ‼', 'critical', 'danger', 'Cobas c311', 'Release'],
          ['10231', 'Mona Adel', '34 F', 'Hb 7.4 g/dL ↓', 'big change · 12.9 on 1 Oct', 'warn', 'Sysmex XN-550', 'Repeat'],
          ['10007', 'Gamal Eid', '47 M', 'Glucose 412 mg/dL ↑', 'above the limit for release by itself', 'warn', 'Cobas c311', 'Release'],
          ['10301', 'Rania Samir', '26 F', 'TSH 0.02 mIU/L ↓', 'flagged', 'warn', 'Architect i1000', 'Release'],
          ['10302', 'Mahmoud Fathy', '55 M', 'Platelets 38 ×10⁹/L ↓', 'analyser says: clumps?', 'warn', 'Sysmex XN-550', 'Repeat']]
          .map(([n, name, age, value, why, tone, m, act]) => <ListRow key={n} number={n} name={name} age={age}
            status={<><span className={cn('font-semibold', tone === 'danger' ? 'text-danger' : 'text-warn')}>{value}</span><Tag tone={tone as 'danger' | 'warn'}>{why}</Tag></>}
            actions={<><span className="text-11 text-faint">{m}</span>{act === 'Repeat' ? <Button size="sm" variant="outline"><RotateCcw />Repeat</Button> : null}
              <Button size="sm" variant={tone === 'danger' ? 'danger' : act === 'Repeat' ? 'ghost' : 'primary'}>Release</Button></>} />)}
      </ul></Card>
      <p className="text-12 text-faint">396 normal results went out by themselves today; each says so in the record. A critical still shows its notice before Release.</p>
    </ScreenFrame>
  </App>
}
