// The pharmacy's stock (owner, 2026-10-07: part of the pharmacy pack, switched on by its setting "Keep stock"; a small table of the
// pack's own for what comes in, moves and is counted; what is given is the dispense records, never copied: on hand = received −
// given − adjusted), and the pharmacy's settings (Keep stock, Prepare first, counselling).
import { ChevronDown, PackagePlus, ScanLine } from 'lucide-react'
import { Button, Card, Chip, Fieldset, FormRow, Input, Kbd, ScreenFrame, Segmented, Switch, Tag, Textarea, cn, type ScreenView } from '@core/ui'
import { App, Label } from './kit'

const RX = { dept: 'Pharmacy', user: 'Dr. Reem Hamdy', tabs: ['Dispensing', 'Stock'], tab: 'Stock' }
const noop = () => undefined
const views: ScreenView<string>[] = [{ id: 'all', label: 'All', count: 214 }, { id: 'low', label: 'Low', count: 6, needs: 'warn' }, { id: 'exp', label: 'Expiring', count: 4, needs: 'warn' },
  { id: 'out', label: 'Out of stock', count: 2, needs: 'danger' }]
const place = <Segmented aria-label="Where" value="ph" onChange={noop} options={[['ph', 'Pharmacy'], ['store', 'Main store']]} />
const find = <Input placeholder="Product, active ingredient or scan a box" className="w-full sm:w-72" readOnly />
const actions = <><Button size="sm" variant="outline"><PackagePlus />Receive</Button><Button size="sm" variant="outline">Count</Button></>

type Row = { brand: string; what: string; hand: string; min: string; exp: string; state?: ['warn' | 'danger', string] }
const products: Row[] = [
  { brand: 'Cidophage 500', what: 'metformin · tablet · box of 30', hand: '0', min: '20 boxes', exp: '—', state: ['danger', 'out of stock'] },
  { brand: 'Augmentin 1 g', what: 'amoxicillin + clavulanate · tablet · box of 14', hand: '8 boxes', min: '15 boxes', exp: 'AUG2309 · Jan 2027', state: ['warn', 'low'] },
  { brand: 'Glucophage 500', what: 'metformin · tablet · box of 30', hand: '12 boxes', min: '10 boxes', exp: '23K114 · May 2027' },
  { brand: 'Nexium 40', what: 'esomeprazole · tablet · box of 14', hand: '31 boxes + 5', min: '10 boxes', exp: 'NX4471 · Nov 2026', state: ['warn', 'expires in 5 weeks'] },
  { brand: 'Concor 5', what: 'bisoprolol · tablet · box of 30', hand: '44 boxes', min: '10 boxes', exp: 'C5-778 · Sep 2028' },
  { brand: 'Panadol Extra', what: 'paracetamol + caffeine · tablet · box of 24', hand: '120 boxes', min: '30 boxes', exp: 'PX0912 · Mar 2028' },
]
export function RxStock() {
  return <App {...RX}>
    <ScreenFrame views={views} view="all" onView={noop} filters={place} search={find} action={actions}>
      <Card className="overflow-x-auto"><table className="w-full text-13">
        <thead><tr className="border-b border-line text-11 uppercase tracking-[0.06em] text-faint">
          {['Product', 'On hand', 'Minimum', 'First to expire', ''].map((h, i) => <th key={i} className={cn('px-4 py-2 font-medium', i === 0 ? 'text-start' : i === 4 ? '' : 'text-end')}>{h}</th>)}</tr></thead>
        <tbody>{products.flatMap((p, i) => [
          <tr key={p.brand} className={cn('border-t border-line', i === 2 && 'rail bg-hover')}>
            <td className="px-4 py-2"><span className="font-medium text-fg">{p.brand}</span> <span className="text-12 text-muted">{p.what}</span></td>
            <td className={cn('px-4 py-2 text-end tnum', p.state?.[0] === 'danger' ? 'font-semibold text-danger' : p.state?.[1] === 'low' ? 'font-semibold text-warn' : 'text-fg')}>{p.hand}</td>
            <td className="px-4 py-2 text-end text-muted tnum">{p.min}</td>
            <td className="px-4 py-2 text-end text-muted tnum">{p.exp}</td>
            <td className="px-4 py-2 text-end">{p.state && <Tag tone={p.state[0]}>{p.state[1]}</Tag>}</td>
          </tr>,
          i === 2 && <tr key="moves" className="bg-sunken"><td colSpan={5} className="px-4 py-3">
            <Label className="pb-1.5">Glucophage 500 · this week</Label>
            <ul className="grid gap-1 text-13 tnum">{[
              ['7 Oct 10:40', 'Given', '− 3 boxes', 'Gamal Eid · instead of Cidophage · batch 23K114', 'from the dispense'],
              ['6 Oct 13:05', 'Given', '− 1 box', 'Hoda Samy · Medical Ward', 'from the dispense'],
              ['5 Oct 09:12', 'Received', '+ 20 boxes', 'Ibn Sina Pharma · INV-55821 · batch 23K114 · May 2027', 'Hesham Ragab'],
              ['4 Oct 18:30', 'Counted', '− 1 box', 'shelf B · 1 box damaged', 'Dr. Reem Hamdy'],
            ].map(([at, what, n, why, by]) => <li key={at} className="grid grid-cols-[7.5rem_5rem_6rem_minmax(0,1fr)_9rem] gap-2">
              <span className="text-faint">{at}</span><span className="text-fg">{what}</span><span className={cn('text-end', n.startsWith('+') ? 'text-ok' : 'text-fg')}>{n}</span>
              <span className="truncate text-muted">{why}</span><span className="text-end text-12 text-faint">{by}</span></li>)}</ul>
          </td></tr>,
        ])}</tbody>
      </table></Card>
      <p className="text-12 text-faint">Given comes from the dispense records themselves (nothing copied); received, moved and counted are the pack's small table, only ever added to.</p>
    </ScreenFrame>
  </App>
}

const lines: [string, string, string, string, ['warn', string] | null][] = [
  ['Glucophage 500 · box of 30', '23K114', 'May 2027', '40', null],
  ['Augmentin 1 g · box of 14', 'AUG2311', 'Jan 2027', '20', ['warn', 'expires in 3 months']],
  ['Concor 5 · box of 30', 'C5-781', 'Sep 2028', '25', null],
]
export function RxReceive() {
  return <App {...RX}>
    <ScreenFrame views={views} view="all" onView={noop} filters={place} search={find} action={actions}>
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
        <div className="flex flex-wrap items-center gap-2"><Label>Receive a delivery</Label><span className="text-12 text-faint">into</span>
          <Segmented aria-label="Into" value="store" onChange={noop} options={[['store', 'Main store'], ['ph', 'Pharmacy']]} size="sm" /></div>
        <div className="flex flex-wrap gap-2"><Input readOnly value="Ibn Sina Pharma" className="w-56" /><Input readOnly value="INV-55821" className="w-40 font-mono" /><Input readOnly value="7 Oct 2026" className="w-36" /></div>
        <table className="w-full text-13 tnum"><thead><tr className="text-11 uppercase tracking-[0.06em] text-faint">
          {['Product', 'Batch', 'Expiry', 'Boxes', ''].map((h) => <th key={h} className="px-1 pb-1 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>{lines.map(([p, b, e, n, w]) => <tr key={p}>
            <td className="p-1"><Input dense readOnly value={p} /></td><td className="p-1"><Input dense readOnly value={b} className="w-28 font-mono" /></td>
            <td className="p-1"><Input dense readOnly value={e} className={cn('w-28', w && 'border-warn')} /></td><td className="p-1"><Input dense readOnly value={n} className="w-20 text-end" /></td>
            <td className="p-1">{w && <Tag tone="warn">{w[1]}</Tag>}</td></tr>)}
            <tr><td className="p-1"><span className="flex h-8 items-center gap-2 rounded-md border border-dashed border-line-strong px-2 text-faint"><ScanLine className="size-4" />Type a product or scan a box</span></td><td colSpan={4} /></tr>
          </tbody></table>
        <div className="flex items-center gap-2 border-t border-line pt-3"><Button>Receive 3 lines · 85 boxes<Kbd className="ms-1">↵</Kbd></Button>
          <span className="text-12 text-faint">Scanning a box fills the product, and its batch and expiry when the barcode carries them.</span></div>
      </Card>
    </ScreenFrame>
  </App>
}

const counted: [string, string, string, number, string | null][] = [
  ['Concor 5', '44 boxes', '44', 0, null], ['Nexium 40', '31 boxes', '30', -1, 'Damaged'], ['Panadol Extra', '120 boxes', '122', 2, 'Miscount'], ['Glucophage 500', '12 boxes', '', 0, null],
]
export function RxCount() {
  return <App {...RX}>
    <ScreenFrame views={views} view="all" onView={noop} filters={place} search={find} action={actions}>
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
        <div className="flex flex-wrap items-center gap-2"><Label>Count · Pharmacy · shelf B</Label><span className="text-12 text-faint">3 of 4 counted</span>
          <Button size="sm" variant="ghost" className="ms-auto">Shelf B<ChevronDown /></Button></div>
        <ul className="grid gap-1.5">{counted.map(([p, exp, got, d, why]) => <li key={p} className="grid grid-cols-[minmax(0,12rem)_8rem_6rem_4rem_minmax(0,1fr)] items-center gap-3 text-13 tnum">
          <span className="font-medium text-fg">{p}</span><span className="text-muted">expected {exp}</span>
          <Input dense readOnly value={got} placeholder="count" className="text-end" />
          <span className={cn('text-end', d < 0 ? 'font-semibold text-danger' : d > 0 ? 'font-semibold text-warn' : 'text-faint')}>{got === '' ? '' : d === 0 ? '✓' : d > 0 ? `+${d}` : d}</span>
          <span className="flex flex-wrap gap-1.5">{d !== 0 && ['Damaged', 'Expired', 'Miscount', 'Missing'].map((w) => <Chip key={w} on={w === why} onClick={noop}>{w}</Chip>)}</span></li>)}</ul>
        <div className="flex items-center gap-2 border-t border-line pt-3"><Button>Save the count<Kbd className="ms-1">↵</Kbd></Button>
          <span className="text-12 text-faint">Each difference is a new row with its reason; nothing already written changes.</span></div>
      </Card>
    </ScreenFrame>
  </App>
}

export function RxSettings() {
  return <App dept="Pharmacy" user="Amira Lotfy">
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-4">
      <p className="text-18 font-semibold text-fg">Settings · Packs · Pharmacy</p>
      <Fieldset title="Pharmacy">
        <FormRow label="Keep stock" hint="Products, deliveries, counts and the Stock screen. Each Give takes from the stock, first to expire first."><Switch checked onChange={noop} label="Keep stock" /></FormRow>
        <FormRow label="Prepare first" hint="To give → Prepared → Given, when one person prepares and another hands over (and for wards)."><Switch checked={false} onChange={noop} label="Prepare first" /></FormRow>
        <FormRow label="Counselling note" hint="Shown to whoever gives."><Textarea readOnly value="Ask about allergies. Explain how and when to take each medicine." minRows={2} /></FormRow>
      </Fieldset>
      <p className="text-12 text-faint">The automatic form from the pack's declared settings (rule 7); late after N minutes shows only with Prepare first.</p>
    </div>
  </App>
}
