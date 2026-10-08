// Prices (spec/openCare.md §5.4, owner 2026-10-08: a department's own work is priced in its own pack's settings): the clinic's products
// with their price per box, and per strip where they are sold in strips — a card above Dispensing's list (never over it), opened from
// its toolbar only where a pack the pharmacy uses declares that it charges; no Keep stock needed. Each row saves its product (the
// clinic's one list, pharmacy.product, through the settings door, with who and when in its history). Plain numbers: the currency is not
// the pharmacy's to say.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { writeSetting } from '@core/db/rpc'
import type { Organization } from '@core/db/types'
import { Button, Card, Empty, Input, Kbd, cn, errorText } from '@core/ui'
import { productsOf, withPrices, type PricedProduct } from './pricing'

const LABEL = 'text-11 font-semibold uppercase tracking-[0.06em] text-faint'
const shown = (n: number | undefined) => n === undefined ? '' : String(n)

export function Prices({ org, onClose }: { org: Organization | undefined; onClose: () => void }) {
  const products = productsOf(org)
  return <Card className="grid gap-3 p-4 ring-1 ring-accent-line" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
    <div className="flex items-center gap-2"><p className={LABEL}>Prices · the clinic's products</p>
      <span className="text-12 text-faint">per box, and per strip where it is sold in strips; empty is free</span>
      <button type="button" onClick={onClose} aria-label="Close" className="ms-auto inline-flex items-center gap-1 rounded-md px-1 text-faint hover:text-fg focus-ring"><Kbd>esc</Kbd><X className="size-3.5" /></button></div>
    {products.length ? <ul className="grid gap-1.5">{products.map((p) => <PriceRow key={p.id} p={p} />)}</ul>
      : <Empty>No products on the clinic's list yet: add them where the stock is kept.</Empty>}
  </Card>
}

function PriceRow({ p }: { p: PricedProduct }) {
  const qc = useQueryClient()
  const [box, setBox] = useState(shown(p.price_box)); const [strip, setStrip] = useState(shown(p.price_strip)); const [size, setSize] = useState(shown(p.strip_size))
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [saved, setSaved] = useState(false)
  const next = withPrices(p, box, strip, size)
  const changed = box !== shown(p.price_box) || strip !== shown(p.price_strip) || size !== shown(p.strip_size)
  const save = async () => { if (!next) return; setBusy(true); setError(null)
    try { await writeSetting({ key: 'pharmacy.product', thing_id: p.id, data: next }); setSaved(true); void qc.invalidateQueries({ queryKey: ['organization'] }) }
    catch (x) { setError(x) } finally { setBusy(false) } }
  return <li className="grid grid-cols-[minmax(0,14rem)_auto_auto_auto_minmax(0,1fr)] items-center gap-2 text-13 max-sm:grid-cols-2">
    <span className="truncate font-medium text-fg">{p.brand} <span className="font-normal text-faint">box of {p.pack_size}</span></span>
    <label className="flex items-center gap-1.5 text-muted">Box<Input dense inputMode="decimal" value={box} onChange={(e) => { setBox(e.target.value); setSaved(false) }} aria-label={`${p.brand}: price a box`} className="w-20 text-end tnum" /></label>
    <label className="flex items-center gap-1.5 text-muted">Strip of<Input dense inputMode="numeric" value={size} onChange={(e) => { setSize(e.target.value); setSaved(false) }} aria-label={`${p.brand}: units in a strip`} className="w-12 text-end tnum" /></label>
    <label className="flex items-center gap-1.5 text-muted">at<Input dense inputMode="decimal" value={strip} onChange={(e) => { setStrip(e.target.value); setSaved(false) }} aria-label={`${p.brand}: price a strip`} className={cn('w-20 text-end tnum', strip && !size && 'border-warn')} /></label>
    <span className="flex items-center gap-2">
      {changed && <Button size="sm" variant="outline" loading={busy} disabled={!next} onClick={() => void save()}>Save</Button>}
      {changed && !next && <span className="text-12 text-warn">{strip.trim() && !size.trim() ? 'a strip price needs the strip\'s size' : 'a price is a number, 2 decimals at most'}</span>}
      {saved && !changed && <span className="text-12 text-ok">✓ saved</span>}
      {!!error && <span className="text-12 text-danger">{errorText(error)}</span>}</span>
  </li>
}
