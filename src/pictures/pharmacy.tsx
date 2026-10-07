// The pharmacy's pictures: the list of prescriptions (marks for what needs the pharmacist), and the check before giving — real
// amounts, Arabic directions, an allergy that asks the doctor, an out-of-stock medicine given as another brand or partly owed.
import type { ReactNode } from 'react'
import { MessageSquare, Plus, TriangleAlert } from 'lucide-react'
import { Badge, Button, Callout, Card, Chip, Input, Kbd, ListRow, ScreenFrame, Tag, cn, type ScreenView } from '@core/ui'
import { App, Arabic } from './kit'

const RX = { dept: 'Pharmacy', user: 'Dr. Reem Hamdy', tabs: ['Dispensing'] }
const noop = () => undefined
const views: ScreenView<string>[] = [{ id: 'give', label: 'To give', count: 4, needs: 'warn' }, { id: 'prep', label: 'Prepared', count: 2 }, { id: 'owed', label: 'Owed', count: 3 },
  { id: 'done', label: 'Given today', count: 18 }]
const find = <Input placeholder="Record number or name" className="w-full sm:w-72" readOnly />
const walkIn = <Button size="sm" variant="outline"><Plus />Walk-in<Kbd className="ms-1">N</Kbd></Button>

function List({ open }: { open?: ReactNode }) {
  return <Card><ul>
    <ListRow number="10007" name="Gamal Eid" age="47 M" selected={!!open} status={<span className="truncate">Augmentin 1 g, Cidophage 500, Nexium 40</span>}
      marks={[{ key: 'a', word: 'allergy', tone: 'danger' }, { key: 's', word: '1 out of stock', tone: 'warn' }]}
      actions={<Button size="sm" variant="outline">Check</Button>} minutes={6} />
    {open}
    <ListRow number="10044" name="Hoda Samy" age="63 F" status={<span className="truncate">Concor 5, Lasix 40</span>} marks={[{ key: 'w', word: 'Ward · Bed 3' }]}
      actions={<Button size="sm">Give all 2</Button>} minutes={9} />
    <ListRow number="10063" name="Salma Fathy" age="8 F" status={<span className="truncate">Augmentin 457 suspension</span>} marks={[{ key: 'k', word: 'child · 24 kg', tone: 'info' }]}
      actions={<Button size="sm" variant="outline">Check</Button>} minutes={11} />
    <ListRow number="10031" name="Youssef Nabil" age="34 M" status={<span className="truncate">Panadol Extra, Antinal 200</span>} marks={[{ key: 'x', word: 'walk-in', tone: 'info' }]}
      actions={<Button size="sm">Give all 2</Button>} minutes={2} />
  </ul></Card>
}

export function RxList() {
  return <App {...RX}>
    <ScreenFrame views={views} view="give" onView={noop} search={find} action={walkIn}>
      <List />
      <p className="text-12 text-faint">A row with nothing to check gives in one click (Give all). Allergy, interaction, duplicate, dose or out of stock: Check opens the row.
        Owed: patients to come back for the rest. From the ward: a nurse collects.</p>
    </ScreenFrame>
  </App>
}

/** one medicine in the check: what was written, what to hand over, the directions, and what needs the pharmacist */
function Medicine({ name, written, give, arabic, children, state }: { name: string; written: string; give: ReactNode; arabic: string; children?: ReactNode; state: 'ok' | 'stop' | 'swap' }) {
  return <div className={cn('grid gap-2 rounded-lg border bg-surface p-3', state === 'stop' ? 'border-danger' : state === 'swap' ? 'border-warn' : 'border-line')}>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="text-14 font-semibold text-fg">{name}</span><span className="text-13 text-muted">{written}</span>
      <span className="ms-auto text-13 text-fg">Give: <b className="font-semibold">{give}</b></span></div>
    <Arabic className="text-muted">{arabic}</Arabic>
    {children}
  </div>
}

export function RxCheck() {
  return <App {...RX}>
    <ScreenFrame views={views} view="give" onView={noop} search={find} action={walkIn}>
      <List open={<li className="grid gap-3 border-t border-line bg-sunken p-4">
        <div className="flex flex-wrap items-center gap-2 text-13"><Badge tone="danger" icon={TriangleAlert}>Penicillin · rash</Badge><span className="text-muted">84 kg · eGFR 52 (creatinine 1.4, 3 Oct) · already takes Tenofovir 300</span>
          <span className="ms-auto text-12 text-faint">from Dr. Ali Hassan · General Practice · 10:24</span></div>
        <Medicine name="Augmentin 1 g" written="1 tablet twice a day · 7 days" give="2 strips (14 tablets)" arabic="قرص واحد مرتين يومياً بعد الأكل لمدة ٧ أيام" state="stop">
          <Callout tone="danger" title="Allergy: penicillin (rash)">Augmentin is amoxicillin, a penicillin. Ask the doctor, or give it anyway with a reason.</Callout>
          <div className="flex gap-2"><Button size="sm" variant="outline"><MessageSquare />Ask the doctor</Button><Button size="sm" variant="ghost">Give anyway…</Button></div>
        </Medicine>
        <Medicine name="Cidophage 500" written="1 tablet three times a day · 30 days" give="3 boxes of 30" arabic="قرص واحد ٣ مرات يومياً مع الأكل" state="swap">
          <div className="flex flex-wrap items-center gap-1.5 text-13"><Tag tone="warn">out of stock</Tag><span className="text-muted">Same medicine (metformin 500):</span>
            <Chip on onClick={noop}>Glucophage 500 · 12 boxes</Chip><Chip onClick={noop}>Metformin Pharco 500 · 4 boxes</Chip>
            <span className="text-faint">or</span><Chip onClick={noop}>Give 1 box now, owe 2</Chip></div>
          <p className="text-12 text-faint">eGFR 52: metformin is fine (stop below 30). The record keeps what was really given.</p>
        </Medicine>
        <Medicine name="Nexium 40" written="1 tablet before breakfast · 30 days" give="2 boxes of 14 (28 days)" arabic="قرص واحد قبل الفطار بنص ساعة" state="ok" />
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-13 text-muted">Given to</span><Chip on onClick={noop}>Gamal · the patient</Chip><Chip onClick={noop}>A relative…</Chip>
          <span className="ms-auto flex items-center gap-2"><span className="text-12 text-faint">Augmentin waits for the doctor</span>
            <Button size="sm">Give 2<Kbd className="ms-1">↵</Kbd></Button></span>
        </div>
      </li>} />
    </ScreenFrame>
  </App>
}
