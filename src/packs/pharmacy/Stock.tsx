// Stock (pharmacy.stock, spec/openCare.md §5.3; the pictures "Pharmacy · stock / receiving a delivery / a stock-take" and "Main store"):
// a tab of a place that keeps stock — a pharmacy, or a main store (its only tab). It lists the products this place keeps, of the
// clinic's one list. Its views are counted filters — All, Low (below this place's minimum), Expiring (a batch within 90 days), Out of
// stock, and in a place that does not dispense (the store) Low at pharmacies (what another place has under its minimum); a product's
// row folds out its minimum here and its last movements (received, sent, arrived, counted, given — given from the dispense records).
// Receive (a delivery: supplier, invoice, then lines of product, batch, expiry, boxes), Send (to another place that keeps stock, in one
// step: lines of product, the batch first to expire, boxes), Count (counted against what is on hand, each difference with a reason)
// and New product open as cards above the list, never over it. Writes go through the pack's door (public.pack_op); products and
// minimums through the settings door.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus, Plus, Send, X } from 'lucide-react'
import { packOp, writeSetting } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import { settingIn } from '@core/screens/settings/form/model'
import type { Department, Organization } from '@core/db/types'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ScreenFrame, Select, Spinner, Tag, cn, errorText, shortDate, type ScreenView } from '@core/ui'
import { batchFor, boxesToMinimum, inBoxes, lowAt, stateOf, type Elsewhere, type Product, type StockRead } from './shelf'
import { keepStock } from './settings'
import { chargesHere } from '@core/screens/rows'
import { withPrices } from './pricing'

type View = 'all' | 'low' | 'expiring' | 'out' | 'away'
const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
const STATE = { out: ['danger', 'out of stock'], low: ['warn', 'low'], expiring: ['warn', 'expiring'] } as const
const KIND: Record<string, string> = { received: 'Received', counted: 'Counted', expired: 'Expired', damaged: 'Damaged', given: 'Given', sent: 'Sent to', arrived: 'From' }
/** the other places that keep stock (the pack used there, Keep stock on) */
const stockPlaces = (org: Organization | undefined, here: string): Department[] => (org?.allDepartments ?? []).filter((d) => d.id !== here && d.packs.includes('pharmacy') && keepStock(org, d.id))
/** this place's minimums (boxes, by product); one more set, or changed */
const minimumsOf = (org: Organization | undefined, here: string) => (settingIn(org, 'pharmacy.minimums', here).minimums ?? {}) as Record<string, number>
async function setMinimum(org: Organization | undefined, here: string, product: string, boxes: number) {
  await writeSetting({ key: 'pharmacy.minimums', owner_id: here, data: { minimums: { ...minimumsOf(org, here), [product]: boxes } } })
}
const month = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'

/** the pharmacy's products with what is on hand (and, with a product named, its movements) */
export function useStock(departmentId: string, product?: string | null, enabled = true) {
  return useQuery({ queryKey: ['pharmacy.stock', departmentId, product ?? null], enabled: enabled && !!departmentId, refetchInterval: 30_000,
    queryFn: () => packOp<StockRead>('pharmacy.stock', departmentId, product ? { product } : {}) })
}

export function Stock({ dept }: ScreenProps) {
  const qc = useQueryClient(); const q = useStock(dept.id); const { org } = useDepartment()
  const [view, setView] = useState<View>('all'); const [find, setFind] = useState(''); const [open, setOpen] = useState<string | null>(null)
  const [card, setCard] = useState<'receive' | 'send' | 'count' | 'product' | null>(null); const [said, setSaid] = useState<string | null>(null)
  const all = q.data?.products ?? []; const products = all.filter((p) => p.kept); const elsewhere = q.data?.elsewhere ?? []
  const places = stockPlaces(org, dept.id); const placeName = (id?: string) => org?.allDepartments.find((d) => d.id === id)?.name ?? 'another place'
  const store = !dept.screens.includes('pharmacy.dispensing') && places.length > 0   // a place that does not dispense: it supplies the others
  const f = find.trim().toLowerCase()
  const matches = (p: Product) => !f || [p.brand, p.generic, p.barcode, p.eda_code].some((x) => x?.toLowerCase().includes(f))
  const of = (v: View) => (v === 'away' ? all : products).filter((p) => matches(p) && (v === 'all' || (v === 'away' ? lowAt(p, elsewhere).length > 0 : stateOf(p) === v)))
  const views: ScreenView<View>[] = [{ id: 'all', label: 'All', count: of('all').length }, { id: 'low', label: 'Low', count: of('low').length, needs: 'warn' },
    { id: 'expiring', label: 'Expiring', count: of('expiring').length, needs: 'warn' }, { id: 'out', label: 'Out of stock', count: of('out').length, needs: 'danger' },
    ...(store ? [{ id: 'away' as const, label: 'Low at pharmacies', count: of('away').length, needs: 'warn' as const }] : [])]
  const shown = of(view)
  const done = (words: string) => { setCard(null); setSaid(words); void qc.invalidateQueries({ queryKey: ['pharmacy.stock'] }); void qc.invalidateQueries({ queryKey: ['organization'] }) }
  const pick = (c: 'receive' | 'send' | 'count' | 'product') => { setCard(card === c ? null : c); setSaid(null) }
  return <ScreenFrame views={views} view={view} onView={setView}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Product, active ingredient or barcode" className="w-full sm:w-72" />}
    action={<><Button size="sm" variant="outline" aria-expanded={card === 'receive'} onClick={() => pick('receive')}><PackagePlus />Receive</Button>
      {places.length > 0 && <Button size="sm" variant={store ? 'primary' : 'outline'} aria-expanded={card === 'send'} onClick={() => pick('send')}><Send />Send</Button>}
      <Button size="sm" variant="outline" aria-expanded={card === 'count'} onClick={() => pick('count')}>Count</Button>
      <Button size="sm" variant="ghost" aria-expanded={card === 'product'} onClick={() => pick('product')}><Plus />Product</Button></>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {card === 'receive' && <Receive departmentId={dept.id} products={all} onClose={() => setCard(null)} onDone={done} onNew={() => setCard('product')} />}
    {card === 'send' && <SendCard departmentId={dept.id} places={places} products={products.filter((p) => p.on_hand > 0)} elsewhere={elsewhere} onClose={() => setCard(null)} onDone={done} />}
    {card === 'count' && <Count departmentId={dept.id} products={shown.length ? shown : products} onClose={() => setCard(null)} onDone={done} />}
    {card === 'product' && <NewProduct org={org} departmentId={dept.id} charges={chargesHere(dept)} onClose={() => setCard(null)} onDone={done} />}
    {q.isLoading ? <Spinner label="Loading the stock" /> : q.error ? <Callout tone="danger" title="Not loaded">{errorText(q.error)}</Callout>
      : !products.length && !shown.length ? <Card><Empty action={<Button size="sm" onClick={() => setCard('product')}><Plus />Add the first product</Button>}>No products kept here yet. Add the products this place stocks, then receive a delivery.</Empty></Card>
      : <Card className="overflow-x-auto"><table className="w-full text-13">
        <thead><tr className="border-b border-line text-11 uppercase tracking-[0.06em] text-faint">
          {['Product', 'On hand', 'Minimum', 'First to expire', ''].map((h, i) => <th key={i} className={cn('px-4 py-2 font-medium', i === 0 ? 'text-start' : 'text-end')}>{h}</th>)}</tr></thead>
        <tbody>{shown.length ? shown.flatMap((p) => { const st = stateOf(p); const first = batchFor(p, 1); const away = view === 'away' ? lowAt(p, elsewhere)[0] : undefined
          return [<tr key={p.id} onClick={() => setOpen(open === p.id ? null : p.id)} className={cn('cursor-pointer border-t border-line hover:bg-hover', open === p.id && 'rail bg-hover')}>
            <td className="px-4 py-2"><span className="font-medium text-fg">{p.brand}</span> <span className="text-12 text-muted">{[p.generic, p.form, `box of ${p.pack_size}`].filter(Boolean).join(' · ')}</span></td>
            <td className={cn('px-4 py-2 text-end tnum', st === 'out' ? 'font-semibold text-danger' : st === 'low' ? 'font-semibold text-warn' : 'text-fg')}>{inBoxes(p.on_hand, p.pack_size)}</td>
            <td className="px-4 py-2 text-end text-muted tnum">{p.minimum != null ? `${p.minimum} boxes` : '—'}</td>
            <td className="px-4 py-2 text-end text-muted tnum">{first ? `${first.batch} · ${month(first.expiry)}` : '—'}</td>
            <td className="px-4 py-2 text-end">{away ? <Tag tone={away.units <= 0 ? 'danger' : 'warn'}>{away.units <= 0 ? 'out' : 'low'} at {placeName(away.department_id)}</Tag>
              : st && <Tag tone={STATE[st][0]}>{STATE[st][1]}</Tag>}</td></tr>,
            open === p.id && <tr key={`${p.id} moves`} className="bg-sunken"><td colSpan={5} className="px-4 py-3"><Moves org={org} departmentId={dept.id} product={p} placeName={placeName} onSaid={done} /></td></tr>] })
          : <tr><td colSpan={5}><Empty>{f ? 'No match here.' : 'Nothing here.'}</Empty></td></tr>}</tbody>
      </table></Card>}
    <p className="text-12 text-faint">{store ? 'The main store: Stock is its only tab. Low at pharmacies lists what a pharmacy has under its minimum, so the store sends before it runs out.'
      : 'Given comes from the dispense records themselves; received, sent, arrived and counted are this place\'s own rows, only ever added to.'}</p>
  </ScreenFrame>
}

/** a product's minimum here, and its last movements, newest first */
function Moves({ org, departmentId, product, placeName, onSaid }: { org: Organization | undefined; departmentId: string; product: Product; placeName: (id?: string) => string; onSaid: (w: string) => void }) {
  const q = useStock(departmentId, product.id)
  const [min, setMin] = useState(product.minimum != null ? String(product.minimum) : ''); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  if (q.isLoading) return <Spinner label="Loading" />
  const moves = q.data?.moves ?? []
  const save = async () => { setBusy(true); setError(null)
    try { await setMinimum(org, departmentId, product.id, Number(min)); onSaid(`${product.brand}: minimum here ${Number(min)} boxes`) } catch (x) { setError(x) } finally { setBusy(false) } }
  return <div className="grid gap-1.5">
    <div className="flex flex-wrap items-center gap-2 pb-1 text-13"><span className="text-muted">Minimum here</span>
      <Input dense inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} aria-label={`${product.brand}: minimum here, in boxes`} className="w-16 text-end tnum" />
      <span className="text-muted">boxes</span>
      {min.trim() !== '' && Number(min) !== product.minimum && Number.isInteger(Number(min)) && Number(min) >= 0 &&
        <Button size="sm" variant="outline" loading={busy} onClick={() => void save()}>Save</Button>}
      {!!error && <span className="text-12 text-danger">{errorText(error)}</span>}</div>
    <p className={LABEL}>{product.brand} · its movements</p>
    {moves.length ? <ul className="grid gap-1 text-13 tnum">{moves.map((m, i) => <li key={i} className="grid grid-cols-[8rem_9rem_7.5rem_minmax(0,1fr)_9rem] gap-2">
      <span className="text-faint">{shortDate(m.at)} {new Date(m.at).toTimeString().slice(0, 5)}</span>
      <span className="truncate text-fg">{m.kind === 'sent' || m.kind === 'arrived' ? `${KIND[m.kind]} ${placeName(m.other)}` : KIND[m.kind] ?? m.kind}</span>
      <span className={cn('text-end', m.units > 0 ? 'text-ok' : 'text-fg')}>{m.units > 0 ? '+ ' : '− '}{inBoxes(Math.abs(m.units), product.pack_size)}</span>
      <span className="truncate text-muted">{[m.supplier, m.invoice, m.batch && `batch ${m.batch}`, m.expiry && month(m.expiry), m.reason].filter(Boolean).join(' · ') || (m.kind === 'given' ? 'from the dispense' : '')}</span>
      <span className="text-end text-12 text-faint">{m.by ?? ''}</span></li>)}</ul> : <p className="text-13 text-faint">Nothing has moved yet.</p>}</div>
}

type Line = { product_id: string; batch: string; expiry: string; boxes: string }
const blank = (): Line => ({ product_id: '', batch: '', expiry: '', boxes: '' })
/** a delivery: supplier, invoice, then lines; a batch expiring within six months is pointed out */
function Receive({ departmentId, products, onClose, onDone, onNew }: { departmentId: string; products: Product[]; onClose: () => void; onDone: (said: string) => void; onNew: () => void }) {
  const [supplier, setSupplier] = useState(''); const [invoice, setInvoice] = useState(''); const [lines, setLines] = useState<Line[]>([blank()])
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const set = (i: number, x: Partial<Line>) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, ...x } : l))
  const ready = lines.filter((l) => l.product_id && Number(l.boxes) > 0)
  const [now] = useState(() => Date.now())   // the card's moment: a batch's months to expiry count from it
  const soon = (e: string) => { const t = Date.parse(`${e}-28`); return t && t - now < 183 * 86_400_000 ? Math.max(0, Math.round((t - now) / (30 * 86_400_000))) : null }
  const receive = async () => {
    setBusy(true); setError(null)
    try { await packOp('pharmacy.stock_write', departmentId, { do: 'receive', supplier, invoice, lines: ready.map((l) => ({ ...l, boxes: Number(l.boxes) })) })
      onDone(`Received ${ready.length} ${ready.length === 1 ? 'line' : 'lines'} · ${ready.reduce((n, l) => n + Number(l.boxes), 0)} boxes`) }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  return <Card className="grid gap-3 p-4 ring-1 ring-accent-line" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex items-center gap-2"><p className={LABEL}>Receive a delivery</p>
      <button type="button" onClick={onClose} aria-label="Close" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
    <div className="flex flex-wrap gap-2"><Input autoFocus value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier" className="w-56" />
      <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Invoice number" className="w-40 font-mono" /></div>
    <div className="grid gap-1.5">{lines.map((l, i) => { const s = l.expiry ? soon(l.expiry) : null
      return <div key={i} className="flex flex-wrap items-center gap-2">
        <Select value={l.product_id} onChange={(e) => set(i, { product_id: e.target.value })} aria-label="Product" className="w-72">
          <option value="">Product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.brand} · box of {p.pack_size}</option>)}</Select>
        <Input value={l.batch} onChange={(e) => set(i, { batch: e.target.value })} placeholder="Batch" aria-label="Batch" className="w-32 font-mono" />
        <Input type="month" value={l.expiry} onChange={(e) => set(i, { expiry: e.target.value })} aria-label="Expiry" className={cn('w-40', s !== null && 'border-warn')} />
        <Input inputMode="numeric" value={l.boxes} onChange={(e) => set(i, { boxes: e.target.value })} placeholder="Boxes" aria-label="Boxes" className="w-24 text-end" />
        {s !== null && <Tag tone="warn">expires in {s} {s === 1 ? 'month' : 'months'}</Tag>}
        {lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove the line" className="rounded-md p-1 text-faint hover:text-fg focus-ring"><X className="size-3.5" /></button>}
      </div> })}
      <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setLines([...lines, blank()])} className="justify-self-start rounded-sm text-13 text-accent hover:underline focus-ring">+ Another line</button>
        <button type="button" onClick={onNew} className="rounded-sm text-13 text-accent hover:underline focus-ring">A product not on the list…</button></div></div>
    {!!error && <Callout tone="danger" title="Not received">{errorText(error)}</Callout>}
    <div className="flex items-center gap-2 border-t border-line pt-3"><Button onClick={() => void receive()} disabled={!ready.length} loading={busy}>
      Receive {ready.length} {ready.length === 1 ? 'line' : 'lines'} · {ready.reduce((n, l) => n + Number(l.boxes), 0)} boxes</Button>
      <span className="text-12 text-faint">A batch already expired is refused; nothing is kept unless every line can be.</span></div>
  </Card>
}

const REASONS = ['Damaged', 'Expired', 'Miscount', 'Missing']
/** a count: what is on hand against what is counted (in units); each difference with a reason, as a new row */
function Count({ departmentId, products, onClose, onDone }: { departmentId: string; products: Product[]; onClose: () => void; onDone: (said: string) => void }) {
  const [counted, setCounted] = useState<Record<string, string>>({}); const [why, setWhy] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const lines = products.filter((p) => counted[p.id]?.trim() !== undefined && counted[p.id]?.trim() !== '')
  const save = async () => {
    setBusy(true); setError(null)
    try { const r = await packOp<{ rows: number }>('pharmacy.stock_write', departmentId, { do: 'count', lines: lines.map((p) => ({ product_id: p.id, units: Number(counted[p.id]), reason: why[p.id] })) })
      onDone(`Counted ${lines.length} · ${r.rows} ${r.rows === 1 ? 'difference' : 'differences'} written`) }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  return <Card className="grid gap-3 p-4 ring-1 ring-accent-line" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex items-center gap-2"><p className={LABEL}>Count</p><span className="text-12 text-faint">{lines.length} of {products.length} counted · in units (tablets, bottles)</span>
      <button type="button" onClick={onClose} aria-label="Close" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
    <ul className="grid gap-1.5">{products.map((p) => { const c = counted[p.id] ?? ''; const d = c.trim() === '' ? null : Number(c) - p.on_hand
      return <li key={p.id} className="grid grid-cols-[minmax(0,12rem)_9rem_6rem_4rem_minmax(0,1fr)] items-center gap-3 text-13 tnum">
        <span className="truncate font-medium text-fg">{p.brand}</span><span className="text-muted">expected {p.on_hand} · {inBoxes(p.on_hand, p.pack_size)}</span>
        <Input dense inputMode="numeric" value={c} onChange={(e) => setCounted((x) => ({ ...x, [p.id]: e.target.value }))} placeholder="count" aria-label={`${p.brand}: counted`} className="text-end" />
        <span className={cn('text-end', d == null ? '' : d < 0 ? 'font-semibold text-danger' : d > 0 ? 'font-semibold text-warn' : 'text-faint')}>{d == null ? '' : d === 0 ? '✓' : d > 0 ? `+${d}` : d}</span>
        <span className="flex flex-wrap gap-1.5">{d != null && d !== 0 && REASONS.map((w) => <Chip key={w} on={why[p.id] === w} onClick={() => setWhy((x) => ({ ...x, [p.id]: w }))}>{w}</Chip>)}</span></li> })}</ul>
    {!!error && <Callout tone="danger" title="Not saved">{errorText(error)}</Callout>}
    <div className="flex items-center gap-2 border-t border-line pt-3"><Button onClick={() => void save()} disabled={!lines.length} loading={busy}>Save the count</Button>
      <span className="text-12 text-faint">Each difference is a new row with its reason; nothing already written changes.</span></div>
  </Card>
}

const FORMS = ['tablet', 'capsule', 'syrup', 'suspension', 'injection', 'cream', 'drops', 'inhaler', 'sachet', 'other']
/** a product on the clinic's one list (brand, active ingredient, strength, form, pack size, barcode), kept here with its minimum (boxes);
 *  where a pack used here charges, its prices too (per box, per strip: spec §5.4) */
function NewProduct({ org, departmentId, charges, onClose, onDone }: { org: Organization | undefined; departmentId: string; charges: boolean; onClose: () => void; onDone: (said: string) => void }) {
  const [p, setP] = useState({ brand: '', generic: '', strength: '', form: 'tablet', pack_size: '', minimum: '', barcode: '', box: '', strip: '', size: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const set = (x: Partial<typeof p>) => setP((v) => ({ ...v, ...x }))
  const data = withPrices({ id: '', brand: p.brand.trim(), pack_size: Number(p.pack_size), form: p.form, ...(p.generic.trim() ? { generic: p.generic.trim() } : {}),
    ...(p.strength.trim() ? { strength: p.strength.trim() } : {}), ...(p.barcode.trim() ? { barcode: p.barcode.trim() } : {}) }, charges ? p.box : '', charges ? p.strip : '', charges ? p.size : '')
  const ok = p.brand.trim() && Number(p.pack_size) >= 1 && !!data
  const save = async () => {
    if (!data) return; setBusy(true); setError(null)
    try {
      const made = await writeSetting({ key: 'pharmacy.product', data })
      await setMinimum(org, departmentId, made.thing_id, p.minimum.trim() ? Number(p.minimum) : 0)   // kept here from now on
      onDone(`${p.brand.trim()} added to the clinic's products, kept here`)
    } catch (x) { setError(x) } finally { setBusy(false) }
  }
  return <Card className="grid gap-3 p-4 ring-1 ring-accent-line" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex items-center gap-2"><p className={LABEL}>A product</p>
      <button type="button" onClick={onClose} aria-label="Close" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
    <div className="flex flex-wrap gap-2">
      <Input autoFocus value={p.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="Brand and strength (Glucophage 500)" className="w-64" />
      <Input value={p.generic} onChange={(e) => set({ generic: e.target.value })} placeholder="Active ingredient (metformin)" className="w-56" />
      <Select value={p.form} onChange={(e) => set({ form: e.target.value })} aria-label="Form" className="w-36">{FORMS.map((f) => <option key={f} value={f}>{f}</option>)}</Select>
      <Input inputMode="numeric" value={p.pack_size} onChange={(e) => set({ pack_size: e.target.value })} placeholder="Box of (30)" aria-label="Units in a box" className="w-28 text-end" />
      <Input inputMode="numeric" value={p.minimum} onChange={(e) => set({ minimum: e.target.value })} placeholder="Minimum boxes" aria-label="Minimum, in boxes" className="w-32 text-end" />
      <Input value={p.barcode} onChange={(e) => set({ barcode: e.target.value })} placeholder="Barcode (optional)" className="w-44 font-mono" />
    </div>
    {charges && <div className="flex flex-wrap items-center gap-2 text-13 text-muted">Price a box<Input inputMode="decimal" value={p.box} onChange={(e) => set({ box: e.target.value })} aria-label="Price a box" className="w-24 text-end tnum" />
      · sold in strips of<Input inputMode="numeric" value={p.size} onChange={(e) => set({ size: e.target.value })} aria-label="Units in a strip" className="w-16 text-end tnum" />
      at<Input inputMode="decimal" value={p.strip} onChange={(e) => set({ strip: e.target.value })} aria-label="Price a strip" className="w-24 text-end tnum" />
      <span className="text-12 text-faint">empty is free; a strip price needs its size</span></div>}
    {!!error && <Callout tone="danger" title="Not added">{errorText(error)}</Callout>}
    <div className="flex items-center gap-2 border-t border-line pt-3"><Button onClick={() => void save()} disabled={!ok} loading={busy}>Add the product</Button>
      <span className="text-12 text-faint">One list for the clinic; the minimum is this place's (below it, it reads low). The box size turns tablets into boxes.</span></div>
  </Card>
}

type SendLine = { product_id: string; batch: string; boxes: string }
/** Send: to another place that keeps stock, in one step — lines of product, the batch first to expire (changeable), boxes; what is here
 *  and what the place has against its minimum beside each; what that place is low on can be added at once */
function SendCard({ departmentId, places, products, elsewhere, onClose, onDone }: { departmentId: string; places: Department[]; products: Product[]; elsewhere: Elsewhere[]
  onClose: () => void; onDone: (said: string) => void }) {
  const [to, setTo] = useState(places[0]?.id ?? ''); const [lines, setLines] = useState<SendLine[]>([])
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const byId = (id: string) => products.find((p) => p.id === id)
  const there = (pid: string) => elsewhere.find((e) => e.department_id === to && e.product_id === pid)
  const low = products.filter((p) => lowAt(p, elsewhere).some((e) => e.department_id === to) && !lines.some((l) => l.product_id === p.id))
  const lineFor = (p: Product, boxes: number): SendLine => ({ product_id: p.id, batch: batchFor(p, boxes * p.pack_size)?.batch ?? '', boxes: String(boxes) })
  const set = (i: number, x: Partial<SendLine>) => setLines((ls) => ls.map((l, j) => { if (j !== i) return l; const n = { ...l, ...x }; const p = byId(n.product_id)
    return x.product_id && p ? { ...n, batch: batchFor(p, Math.max(1, Number(n.boxes) || 1) * p.pack_size)?.batch ?? '' } : n }))
  const ready = lines.filter((l) => l.product_id && l.batch && Number(l.boxes) > 0)
  const boxes = ready.reduce((n, l) => n + Number(l.boxes), 0); const name = places.find((d) => d.id === to)?.name ?? 'there'
  const send = async () => {
    setBusy(true); setError(null)
    try { await packOp('pharmacy.stock_write', departmentId, { do: 'send', to, lines: ready.map((l) => ({ product_id: l.product_id, batch: l.batch, boxes: Number(l.boxes) })) })
      onDone(`Sent ${boxes} ${boxes === 1 ? 'box' : 'boxes'} · ${ready.length} ${ready.length === 1 ? 'line' : 'lines'} to ${name}`) }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  return <Card className="grid gap-3 p-4 ring-1 ring-accent-line" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex flex-wrap items-center gap-2"><p className={LABEL}>Send to</p>
      {places.map((d) => <Chip key={d.id} on={to === d.id} onClick={() => setTo(d.id)}>{d.name}</Chip>)}
      {low.length > 0 && <button type="button" onClick={() => setLines([...lines, ...low.map((p) => lineFor(p, boxesToMinimum(there(p.id)!, p.pack_size)))])}
        className="ms-3 rounded-sm text-13 text-accent hover:underline focus-ring">+ What {name} is low on · {low.length}</button>}
      <button type="button" onClick={onClose} aria-label="Close" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
    {lines.length > 0 && <div className="grid gap-1.5">{lines.map((l, i) => { const p = byId(l.product_id); const t = p ? there(p.id) : undefined
      return <div key={i} className="flex flex-wrap items-center gap-2 text-13">
        <Select value={l.product_id} onChange={(e) => set(i, { product_id: e.target.value })} aria-label="Product" className="w-60">
          <option value="">Product…</option>{products.map((x) => <option key={x.id} value={x.id}>{x.brand} · box of {x.pack_size}</option>)}</Select>
        <Select value={l.batch} onChange={(e) => set(i, { batch: e.target.value })} aria-label="Batch" className="w-48 font-mono" disabled={!p}>
          {(p?.batches ?? []).map((b) => <option key={b.batch} value={b.batch}>{b.batch} · {month(b.expiry)}</option>)}</Select>
        <Input inputMode="numeric" value={l.boxes} onChange={(e) => set(i, { boxes: e.target.value })} placeholder="Boxes" aria-label="Boxes" className="w-20 text-end tnum" />
        {p && <span className="text-12 text-faint tnum">{inBoxes(p.on_hand, p.pack_size)} here</span>}
        {p && <span className={cn('text-12 tnum', t && t.units < t.minimum * p.pack_size ? (t.units <= 0 ? 'text-danger' : 'text-warn') : 'text-muted')}>
          {t ? `${name} has ${inBoxes(t.units, p.pack_size)} · minimum ${t.minimum}` : `${name} keeps no minimum of it`}</span>}
        <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove the line" className="rounded-md p-1 text-faint hover:text-fg focus-ring"><X className="size-3.5" /></button>
      </div> })}</div>}
    <button type="button" onClick={() => setLines([...lines, { product_id: '', batch: '', boxes: '' }])} className="justify-self-start rounded-sm text-13 text-accent hover:underline focus-ring">+ A line</button>
    {!!error && <Callout tone="danger" title="Not sent">{errorText(error)}</Callout>}
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3"><Button onClick={() => void send()} disabled={!ready.length || !to} loading={busy}>
      <Send />Send {boxes} {boxes === 1 ? 'box' : 'boxes'} · {ready.length} {ready.length === 1 ? 'line' : 'lines'}</Button>
      <span className="text-12 text-faint">One step: it leaves here and is at {name} at once, batch and expiry with it. The batch is the first to expire; change it if the shelf says otherwise.</span></div>
  </Card>
}
