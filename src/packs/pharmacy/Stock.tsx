// Stock (pharmacy.stock, spec/openCare.md §5.3; the pictures "Pharmacy · stock / receiving a delivery / a stock-take"): a tab of the
// pharmacy only where it keeps stock. Its views are counted filters — All, Low (below the product's minimum), Expiring (a batch within
// 90 days), Out of stock; a product's row folds out its last movements (received, counted, given — given from the dispense records).
// Receive (a delivery: supplier, invoice, then lines of product, batch, expiry, boxes), Count (counted against what is on hand, each
// difference with a reason) and New product open as cards above the list, never over it. Writes go through the pack's door
// (public.pack_op), products through the settings door.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus, Plus, X } from 'lucide-react'
import { packOp, writeSetting } from '@core/db/rpc'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Chip, Empty, Input, Kbd, ScreenFrame, Select, Spinner, Tag, cn, errorText, shortDate, type ScreenView } from '@core/ui'
import { batchFor, inBoxes, stateOf, type Product, type StockRead } from './shelf'

type View = 'all' | 'low' | 'expiring' | 'out'
const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
const STATE = { out: ['danger', 'out of stock'], low: ['warn', 'low'], expiring: ['warn', 'expiring'] } as const
const KIND: Record<string, string> = { received: 'Received', counted: 'Counted', expired: 'Expired', damaged: 'Damaged', given: 'Given' }
const month = (iso?: string) => iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'

/** the pharmacy's products with what is on hand (and, with a product named, its movements) */
export function useStock(departmentId: string, product?: string | null, enabled = true) {
  return useQuery({ queryKey: ['pharmacy.stock', departmentId, product ?? null], enabled: enabled && !!departmentId, refetchInterval: 30_000,
    queryFn: () => packOp<StockRead>('pharmacy.stock', departmentId, product ? { product } : {}) })
}

export function Stock({ dept }: ScreenProps) {
  const qc = useQueryClient(); const q = useStock(dept.id)
  const [view, setView] = useState<View>('all'); const [find, setFind] = useState(''); const [open, setOpen] = useState<string | null>(null)
  const [card, setCard] = useState<'receive' | 'count' | 'product' | null>(null); const [said, setSaid] = useState<string | null>(null)
  const products = q.data?.products ?? []
  const f = find.trim().toLowerCase()
  const matches = (p: Product) => !f || [p.brand, p.generic, p.barcode, p.eda_code].some((x) => x?.toLowerCase().includes(f))
  const of = (v: View) => products.filter((p) => matches(p) && (v === 'all' || stateOf(p) === v))
  const views: ScreenView<View>[] = [{ id: 'all', label: 'All', count: of('all').length }, { id: 'low', label: 'Low', count: of('low').length, needs: 'warn' },
    { id: 'expiring', label: 'Expiring', count: of('expiring').length, needs: 'warn' }, { id: 'out', label: 'Out of stock', count: of('out').length, needs: 'danger' }]
  const shown = of(view)
  const done = (words: string) => { setCard(null); setSaid(words); void qc.invalidateQueries({ queryKey: ['pharmacy.stock', dept.id] }) }
  const pick = (c: 'receive' | 'count' | 'product') => { setCard(card === c ? null : c); setSaid(null) }
  return <ScreenFrame views={views} view={view} onView={setView}
    search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Product, active ingredient or barcode" className="w-full sm:w-72" />}
    action={<><Button size="sm" variant="outline" aria-expanded={card === 'receive'} onClick={() => pick('receive')}><PackagePlus />Receive</Button>
      <Button size="sm" variant="outline" aria-expanded={card === 'count'} onClick={() => pick('count')}>Count</Button>
      <Button size="sm" variant="ghost" aria-expanded={card === 'product'} onClick={() => pick('product')}><Plus />Product</Button></>}
    notice={said && <Callout key={said} tone="accent" icon={false} role="status">✓ {said}</Callout>}>
    {card === 'receive' && <Receive departmentId={dept.id} products={products} onClose={() => setCard(null)} onDone={done} onNew={() => setCard('product')} />}
    {card === 'count' && <Count departmentId={dept.id} products={shown.length ? shown : products} onClose={() => setCard(null)} onDone={done} />}
    {card === 'product' && <NewProduct departmentId={dept.id} onClose={() => setCard(null)} onDone={done} />}
    {q.isLoading ? <Spinner label="Loading the stock" /> : q.error ? <Callout tone="danger" title="Not loaded">{errorText(q.error)}</Callout>
      : !products.length ? <Card><Empty action={<Button size="sm" onClick={() => setCard('product')}><Plus />Add the first product</Button>}>No products yet. Add the products this pharmacy stocks, then receive a delivery.</Empty></Card>
      : <Card className="overflow-x-auto"><table className="w-full text-13">
        <thead><tr className="border-b border-line text-11 uppercase tracking-[0.06em] text-faint">
          {['Product', 'On hand', 'Minimum', 'First to expire', ''].map((h, i) => <th key={i} className={cn('px-4 py-2 font-medium', i === 0 ? 'text-start' : 'text-end')}>{h}</th>)}</tr></thead>
        <tbody>{shown.length ? shown.flatMap((p) => { const st = stateOf(p); const first = batchFor(p, 1)
          return [<tr key={p.id} onClick={() => setOpen(open === p.id ? null : p.id)} className={cn('cursor-pointer border-t border-line hover:bg-hover', open === p.id && 'rail bg-hover')}>
            <td className="px-4 py-2"><span className="font-medium text-fg">{p.brand}</span> <span className="text-12 text-muted">{[p.generic, p.form, `box of ${p.pack_size}`].filter(Boolean).join(' · ')}</span></td>
            <td className={cn('px-4 py-2 text-end tnum', st === 'out' ? 'font-semibold text-danger' : st === 'low' ? 'font-semibold text-warn' : 'text-fg')}>{inBoxes(p.on_hand, p.pack_size)}</td>
            <td className="px-4 py-2 text-end text-muted tnum">{p.minimum != null ? `${p.minimum} boxes` : '—'}</td>
            <td className="px-4 py-2 text-end text-muted tnum">{first ? `${first.batch} · ${month(first.expiry)}` : '—'}</td>
            <td className="px-4 py-2 text-end">{st && <Tag tone={STATE[st][0]}>{STATE[st][1]}</Tag>}</td></tr>,
            open === p.id && <tr key={`${p.id} moves`} className="bg-sunken"><td colSpan={5} className="px-4 py-3"><Moves departmentId={dept.id} product={p} /></td></tr>] })
          : <tr><td colSpan={5}><Empty>{f ? 'No match here.' : 'Nothing here.'}</Empty></td></tr>}</tbody>
      </table></Card>}
    <p className="text-12 text-faint">Given comes from the dispense records themselves; received and counted are this pharmacy's own rows, only ever added to.</p>
  </ScreenFrame>
}

/** a product's last movements, newest first */
function Moves({ departmentId, product }: { departmentId: string; product: Product }) {
  const q = useStock(departmentId, product.id)
  if (q.isLoading) return <Spinner label="Loading" />
  const moves = q.data?.moves ?? []
  return <div className="grid gap-1.5"><p className={LABEL}>{product.brand} · its movements</p>
    {moves.length ? <ul className="grid gap-1 text-13 tnum">{moves.map((m, i) => <li key={i} className="grid grid-cols-[8rem_5.5rem_5.5rem_minmax(0,1fr)_9rem] gap-2">
      <span className="text-faint">{shortDate(m.at)} {new Date(m.at).toTimeString().slice(0, 5)}</span><span className="text-fg">{KIND[m.kind] ?? m.kind}</span>
      <span className={cn('text-end', m.units > 0 ? 'text-ok' : 'text-fg')}>{m.units > 0 ? `+ ${m.units}` : `− ${-m.units}`}</span>
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
/** a product this pharmacy stocks: brand, active ingredient, strength, form, pack size, minimum (in boxes) */
function NewProduct({ departmentId, onClose, onDone }: { departmentId: string; onClose: () => void; onDone: (said: string) => void }) {
  const [p, setP] = useState({ brand: '', generic: '', strength: '', form: 'tablet', pack_size: '', minimum: '', barcode: '' })
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const set = (x: Partial<typeof p>) => setP((v) => ({ ...v, ...x }))
  const ok = p.brand.trim() && Number(p.pack_size) >= 1
  const save = async () => {
    setBusy(true); setError(null)
    try {
      await writeSetting({ key: 'pharmacy.product', owner_id: departmentId, data: { brand: p.brand.trim(), pack_size: Number(p.pack_size), form: p.form as never,
        ...(p.generic.trim() ? { generic: p.generic.trim() } : {}), ...(p.strength.trim() ? { strength: p.strength.trim() } : {}),
        ...(p.minimum.trim() ? { minimum: Number(p.minimum) } : {}), ...(p.barcode.trim() ? { barcode: p.barcode.trim() } : {}) } })
      onDone(`${p.brand.trim()} added`)
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
    {!!error && <Callout tone="danger" title="Not added">{errorText(error)}</Callout>}
    <div className="flex items-center gap-2 border-t border-line pt-3"><Button onClick={() => void save()} disabled={!ok} loading={busy}>Add the product</Button>
      <span className="text-12 text-faint">Below its minimum it reads low; the box size turns tablets into boxes.</span></div>
  </Card>
}
