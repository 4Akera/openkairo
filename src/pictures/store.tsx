// The main store (owner, 2026-10-07): a department made from its own setup, using the pharmacy pack with Keep stock on and no
// dispensing — Stock is its one tab. Suppliers' deliveries are received there; the store keeper sends stock on to a pharmacy in one
// step (sent is received: no confirming, no requests). Each line leaves the store and arrives at the pharmacy with its batch and expiry,
// first to expire first; both places' movements say it. The store sees which products are low at the pharmacies, so it can push
// without being asked.
import { PackagePlus, Send, X } from 'lucide-react'
import { Button, Card, Chip, Input, Kbd, ScreenFrame, Tag, cn, type ScreenView } from '@core/ui'
import { App, Label } from './kit'

const STORE = { dept: 'Main store', user: 'Samir Adel', tabs: ['Stock'], tab: 'Stock' }
const RX = { dept: 'Pharmacy', user: 'Hesham Ragab', tabs: ['Dispensing', 'Stock'], tab: 'Stock' }
const noop = () => undefined
const find = <Input placeholder="Product, active ingredient or barcode" className="w-full sm:w-72" readOnly />
const storeViews: ScreenView<string>[] = [{ id: 'all', label: 'All', count: 214 }, { id: 'low', label: 'Low', count: 2, needs: 'warn' }, { id: 'exp', label: 'Expiring', count: 3, needs: 'warn' },
  { id: 'out', label: 'Out of stock', count: 0 }, { id: 'ph', label: 'Low at pharmacies', count: 3, needs: 'warn' }]
const head = (cols: string[]) => <thead><tr className="border-b border-line text-11 uppercase tracking-[0.06em] text-faint">
  {cols.map((h, i) => <th key={i} className={cn('px-4 py-2 font-medium', i === 0 ? 'text-start' : 'text-end')}>{h}</th>)}</tr></thead>
const move = (when: string, what: string, n: string, tone: 'in' | 'out' | 'count', detail: string, who: string) =>
  <div key={when + what} className="grid grid-cols-[7rem_9rem_4.5rem_minmax(0,1fr)_8rem] items-baseline gap-3 py-1 text-13">
    <span className="text-muted tnum">{when}</span><span className="text-fg">{what}</span>
    <span className={cn('text-end tnum', tone === 'in' ? 'text-ok' : tone === 'out' ? 'text-fg' : 'text-warn')}>{n}</span>
    <span className="truncate text-muted">{detail}</span><span className="text-end text-12 text-faint">{who}</span></div>

/** 1 · the main store's Stock: its own counts, the pharmacies' low ones as a view, Send beside Receive and Count */
export function StoreStock() {
  const rows: [string, string, string, string, string, [string, 'warn' | 'danger'] | null][] = [
    ['Augmentin 1 g', 'Amoxicillin + clavulanic acid · tablet · box of 14', '96 boxes', '40 boxes', 'AUG2309 · Feb 2027', ['low at Pharmacy', 'warn']],
    ['Cidophage 500', 'Metformin · tablet · box of 30', '150 boxes', '60 boxes', 'CD5512 · Aug 2027', ['out at Pharmacy', 'danger']],
    ['Glucophage 500', 'Metformin · tablet · box of 30', '320 boxes', '60 boxes', '23K114 · Jun 2027', null],
    ['Nexium 40', 'Esomeprazole · tablet · box of 14', '70 boxes', '30 boxes', 'NX4471 · Nov 2026', ['expiring', 'warn']],
    ['Panadol Extra', 'Paracetamol + caffeine · tablet · box of 24', '600 boxes', '100 boxes', 'PX0912 · Mar 2028', null]]
  return <App {...STORE}>
    <ScreenFrame views={storeViews} view="all" onView={noop} search={find}
      action={<><Button size="sm" variant="outline"><PackagePlus />Receive</Button><Button size="sm"><Send />Send</Button><Button size="sm" variant="outline">Count</Button></>}>
      <Card className="overflow-x-auto"><table className="w-full text-13">{head(['Product', 'In the store', 'Minimum', 'First to expire', ''])}
        <tbody>{rows.flatMap(([b, w, hand, min, exp, tag], i) => [
          <tr key={b} className={cn('border-t border-line', i === 2 && 'bg-hover')}>
            <td className="px-4 py-2"><span className="font-medium text-fg">{b}</span> <span className="text-12 text-muted">{w}</span></td>
            <td className="px-4 py-2 text-end tnum text-fg">{hand}</td><td className="px-4 py-2 text-end tnum text-muted">{min}</td>
            <td className="px-4 py-2 text-end tnum text-muted">{exp}</td><td className="px-4 py-2 text-end">{tag && <Tag tone={tag[1]}>{tag[0]}</Tag>}</td></tr>,
          i === 2 && <tr key="m" className="bg-sunken"><td colSpan={5} className="px-4 py-3"><Label className="pb-1">Glucophage 500 · its movements</Label>
            {move('7 Oct 11:40', 'Sent to Pharmacy', '− 20', 'out', 'batch 23K114 · Jun 2027', 'Samir Adel')}
            {move('6 Oct 09:15', 'Received', '+ 200', 'in', 'Ibn Sina Pharma · INV-55821 · batch 23K114 · Jun 2027', 'Samir Adel')}
            {move('1 Oct 14:02', 'Counted', '− 2', 'count', 'damaged boxes', 'Samir Adel')}</td></tr>])}</tbody></table></Card>
      <p className="text-12 text-faint">The main store: Stock is its only tab (no dispensing). Low at pharmacies lists what a pharmacy has under its minimum, so the store sends before it runs out.</p>
    </ScreenFrame>
  </App>
}

/** 2 · Send: inline, under the toolbar — to a pharmacy, then lines; each takes the first to expire, what the pharmacy has beside it */
export function StoreSend() {
  const lines: [string, string, string, string, string][] = [
    ['Augmentin 1 g', 'AUG2309 · Feb 2027', '20', '96 in the store', 'Pharmacy has 8 · minimum 15'],
    ['Cidophage 500', 'CD5512 · Aug 2027', '30', '150 in the store', 'Pharmacy has none · minimum 20'],
    ['Glucophage 500', '23K114 · Jun 2027', '10', '320 in the store', 'Pharmacy has 12 · minimum 10']]
  return <App {...STORE}>
    <ScreenFrame views={storeViews} view="ph" onView={noop} search={find}
      action={<><Button size="sm" variant="outline"><PackagePlus />Receive</Button><Button size="sm" aria-expanded><Send />Send</Button><Button size="sm" variant="outline">Count</Button></>}>
      <Card className="grid gap-3 p-4 ring-1 ring-accent-line">
        <div className="flex flex-wrap items-center gap-2"><Label>Send to</Label><Chip on onClick={noop}>Pharmacy</Chip><Chip onClick={noop}>Inpatient pharmacy</Chip>
          <span className="ms-auto text-12 text-muted">From Low at pharmacies: 3 products below their minimum</span></div>
        <table className="w-full text-13">{head(['Product', 'Batch (first to expire)', 'Boxes', '', 'At the pharmacy', ''])}
          <tbody>{lines.map(([p, batch, n, have, there]) => <tr key={p} className="border-t border-line">
            <td className="py-1.5 pe-3 font-medium text-fg">{p}</td><td className="py-1.5 pe-3 text-end text-muted tnum">{batch}</td>
            <td className="py-1.5 pe-3 text-end"><Input dense readOnly value={n} className="ms-auto w-16 text-end tnum" /></td>
            <td className="py-1.5 pe-3 text-end text-12 text-faint">{have}</td><td className={cn('py-1.5 pe-3 text-end text-12', there.includes('none') ? 'text-danger' : there.includes('has 8') ? 'text-warn' : 'text-muted')}>{there}</td>
            <td className="py-1.5 text-end"><X className="ms-auto size-3.5 text-faint" /></td></tr>)}</tbody></table>
        <div className="flex flex-wrap items-center gap-2"><Input readOnly placeholder="Add a product or scan a box…" className="w-72" />
          <span className="text-12 text-faint">The batch is the first to expire; change it on the line if the shelf says otherwise.</span>
          <Button className="ms-auto"><Send />Send 60 boxes · 3 lines<Kbd className="ms-1">↵</Kbd></Button></div>
        <p className="text-12 text-muted">One step: what is sent is at the pharmacy at once — it leaves the store and arrives there, batch and expiry with it.</p>
      </Card>
    </ScreenFrame>
  </App>
}

/** 3 · at the pharmacy: what came from the store, in its movements beside a supplier's delivery and what was given */
export function StoreArrived() {
  const views: ScreenView<string>[] = [{ id: 'all', label: 'All', count: 8 }, { id: 'low', label: 'Low', count: 0 }, { id: 'exp', label: 'Expiring', count: 1, needs: 'warn' }, { id: 'out', label: 'Out of stock', count: 0 }]
  return <App {...RX}>
    <ScreenFrame views={views} view="all" onView={noop} search={find}
      action={<><Button size="sm" variant="outline"><PackagePlus />Receive</Button><Button size="sm" variant="outline">Count</Button></>}>
      <Card className="overflow-x-auto"><table className="w-full text-13">{head(['Product', 'On hand', 'Minimum', 'First to expire', ''])}
        <tbody>
          <tr className="border-t border-line bg-hover"><td className="px-4 py-2"><span className="font-medium text-fg">Augmentin 1 g</span> <span className="text-12 text-muted">Amoxicillin + clavulanic acid · tablet · box of 14</span></td>
            <td className="px-4 py-2 text-end tnum text-fg">28 boxes</td><td className="px-4 py-2 text-end tnum text-muted">15 boxes</td><td className="px-4 py-2 text-end tnum text-muted">AUG2309 · Feb 2027</td><td /></tr>
          <tr className="bg-sunken"><td colSpan={5} className="px-4 py-3"><Label className="pb-1">Augmentin 1 g · its movements</Label>
            {move('7 Oct 11:40', 'From main store', '+ 20', 'in', 'batch AUG2309 · Feb 2027', 'Samir Adel')}
            {move('7 Oct 10:05', 'Given', '− 1', 'out', 'Samia Fathallah · 1 box', 'Hesham Ragab')}
            {move('2 Oct 12:30', 'Received', '+ 10', 'in', 'Ibn Sina Pharma · INV-55790 · batch AUG2309', 'Hesham Ragab')}</td></tr>
        </tbody></table></Card>
      <p className="text-12 text-faint">A pharmacy may still receive from a supplier itself (a clinic with no store). What the store sent needs nothing more here.</p>
    </ScreenFrame>
  </App>
}

/** 4 · the store is a department from its own setup; the products are one list for the clinic, each place its own minimum */
export function StoreSetup() {
  return <App dept="Settings" user="Amira Lotfy">
    <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-4">
      <p className="text-18 font-semibold text-fg">Settings · Departments · + Department</p>
      <Card className="grid gap-3 p-4">
        <Label>Start from a setup</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {[['Pharmacy', 'Dispensing and Stock; gives prescriptions', false], ['Main store', 'Stock only: receives from suppliers, sends to the pharmacies', true], ['Laboratory', 'Collect and Results', false]].map(([t, d, on]) =>
            <div key={String(t)} className={cn('grid gap-1 rounded-lg border p-3', on ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
              <span className="text-14 font-medium text-fg">{t}</span><span className="text-12 text-muted">{d}</span>
              {on && <span className="text-11 text-faint">Uses Pharmacy · Keep stock on · no dispensing · the store keeper's</span>}</div>)}</div>
      </Card>
      <Card className="grid gap-2 p-4">
        <Label>Products · one list for the clinic</Label>
        <table className="w-full text-13">{head(['Product', 'Pack', 'Minimum · Main store', 'Minimum · Pharmacy'])}
          <tbody>{[['Augmentin 1 g', 'box of 14', '40', '15'], ['Glucophage 500', 'box of 30', '60', '10'], ['Panadol Extra', 'box of 24', '100', '30']].map(([p, pk, a, b]) =>
            <tr key={p} className="border-t border-line"><td className="py-1.5 font-medium text-fg">{p}</td><td className="py-1.5 text-end text-muted">{pk}</td>
              <td className="py-1.5 text-end"><Input dense readOnly value={a} className="ms-auto w-16 text-end tnum" /></td>
              <td className="py-1.5 text-end"><Input dense readOnly value={b} className="ms-auto w-16 text-end tnum" /></td></tr>)}</tbody></table>
        <p className="text-12 text-muted">Today each pharmacy has its own product list. With a store, a box sent must be the same product at both ends: one list for the clinic, a minimum for each place that keeps stock.</p>
      </Card>
    </div>
  </App>
}
