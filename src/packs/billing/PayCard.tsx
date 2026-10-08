// The payment card (spec §5.4, the bill-pay picture), folded out under the patient's row, never over it: each line ticked, with where and
// when it came from (a sending department's lines as one line); untick one to leave it for later; a line priced At the order comes with
// an empty price to type; Add a discount (D) with a reason from the clinic's list; Cash (received, change) or Card; one key takes it (↵).
// A row of a department that prices its own work may hand its lines (handed): they are paid here, at its counter, with what the row knew
// billing held of their orders (basis), so a payment or a bill sent since refuses it. What was paid for work not done (a void charge or
// sent line) is said under the lines, to give back from its receipt, even where nothing else is owed.
import { useMemo, useState, type KeyboardEvent } from 'react'
import { Banknote, CreditCard, Percent, Receipt as ReceiptIcon } from 'lucide-react'
import { packOp } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import { nameOf } from '@core/db/views'
import { settingIn } from '@core/screens/settings/form/model'
import { Button, Callout, Chip, Input, Kbd, Spinner, cn, errorText, hm } from '@core/ui'
import { useBillingDone, useLines } from './hooks'
import { LABEL } from './words'
import { blankCard, cardLines, cardSum, egp, isTicked, payArgs, type Card, type Handed } from './money'

export interface Paid { payment_id: string; receipt: string; total: number; change: number | null; method: 'cash' | 'card' }

export function PayCard({ departmentId, patientId, who, handed, basis, onPaid }: { departmentId: string; patientId: string; who: string; handed?: Handed[]
  basis?: Record<string, string>; onPaid: (p: Paid) => void }) {
  const { org } = useDepartment(); const done = useBillingDone()
  const q = useLines(departmentId, patientId)
  const [card, setCard] = useState<Card>(blankCard); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null)
  const lines = useMemo(() => q.data ? cardLines(q.data, (id) => nameOf(org, id), hm, handed ?? [], departmentId) : [], [q.data, org, handed, departmentId])
  const s = cardSum(lines, card)
  const reasons = (settingIn(org, 'billing.reasons', org?.organization.id).reasons ?? []) as string[]
  const set = (x: Partial<Card>) => { setCard((c) => ({ ...c, ...x })); setError(null) }
  const take = async () => {
    if (s.problem || busy) return
    setBusy(true); setError(null)
    try {
      const r = await packOp<{ payment_id: string; receipt: string; total: number; change: number | null }>('billing.pay', departmentId, payArgs(patientId, lines, card, basis))
      await done(); onPaid({ ...r, method: card.method })
    } catch (x) { setError(x); void q.refetch() } finally { setBusy(false) }
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void take() }
    else if ((e.key === 'd' || e.key === 'D') && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); set({ discount: card.discount ?? { amount: '', reason: null } }) }
  }
  if (q.isLoading) return <div className="p-4"><Spinner label="Loading what is owed" /></div>
  if (q.error) return <Callout tone="danger" title="Not loaded">{errorText(q.error)}</Callout>
  const back = (q.data?.back ?? []).map((b) => <p key={`${b.item}:${b.payment_id}`} className="text-12 text-warn">
    {b.name ?? `Visit · ${nameOf(org, b.department_id) ?? ''}`} was paid on {b.receipt} and will not be done: give it back from that receipt.</p>)
  if (!lines.length) return <div className="grid gap-1 px-4 py-3"><p className="text-13 text-muted">Nothing is owed here now.</p>{back}</div>
  return <div className="grid gap-3 p-4" onKeyDown={keys}>
    <div className="grid gap-0.5">
      <p className={cn(LABEL, 'pb-1')}>{who} · what is owed</p>
      {lines.map((l) => { const on = isTicked(card, l.key)
        return <div key={l.key} className={cn('grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,12rem)_7rem] items-baseline gap-3 py-1.5 text-13', !on && 'text-faint')}>
          <input type="checkbox" checked={on} onChange={(e) => set({ ticked: { ...card.ticked, [l.key]: e.target.checked } })} aria-label={l.words} className="size-4 accent-[var(--accent)]" />
          <span className={cn('truncate', on ? 'text-fg' : 'text-muted')}>{l.words}</span>
          <span className="truncate text-12 text-muted">{l.source}</span>
          {l.open ? <Input dense inputMode="decimal" placeholder="price" value={card.typed[l.key] ?? ''} disabled={!on} aria-label={`${l.words}: the price`}
              onChange={(e) => set({ typed: { ...card.typed, [l.key]: e.target.value } })} className="w-28 justify-self-end text-end tnum" />
            : <span className={cn('text-end tnum', on ? 'text-fg' : 'text-faint')}>{egp(l.price ?? 0)}</span>}
        </div> })}
      {back}
      <div className="flex flex-wrap items-baseline gap-3 border-t border-line pt-2 text-13">
        <span className="text-muted">Discount</span>
        {!card.discount ? <Chip onClick={() => set({ discount: { amount: '', reason: null } })}><Percent className="size-3" />Add a discount<Kbd className="ms-1">D</Kbd></Chip>
          : <span className="flex flex-wrap items-center gap-1.5">
            <Input dense autoFocus inputMode="decimal" value={card.discount.amount} aria-label="Discount amount" onChange={(e) => set({ discount: { ...card.discount!, amount: e.target.value } })}
              className="w-24 text-end tnum" />
            {reasons.map((r) => <Chip key={r} on={card.discount!.reason === r} onClick={() => set({ discount: { ...card.discount!, reason: r } })}>{r}</Chip>)}
            {!reasons.length && <span className="text-12 text-faint">No reasons set (Settings → Packs → Billing)</span>}
            <Button size="sm" variant="ghost" onClick={() => set({ discount: null })}>No discount</Button></span>}
        <span className="ms-auto text-14 font-semibold text-fg tnum">Total {egp(s.total)}</span>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
      <Chip on={card.method === 'cash'} onClick={() => set({ method: 'cash' })}><Banknote className="size-3.5" />Cash</Chip>
      <Chip on={card.method === 'card'} onClick={() => set({ method: 'card', received: '' })}><CreditCard className="size-3.5" />Card</Chip>
      {card.method === 'cash' && <><span className="ms-3 text-13 text-muted">Received</span>
        <Input dense inputMode="decimal" placeholder={egp(s.total)} value={card.received} onChange={(e) => set({ received: e.target.value })} aria-label="Cash received" className="w-28 text-end tnum" />
        {s.change !== null && s.change >= 0 && <span className="text-13 text-ok tnum">change {egp(s.change)}</span>}</>}
      <Button className="ms-auto" loading={busy} disabled={!!s.problem} onClick={() => void take()}>
        <ReceiptIcon />Take {egp(s.total)} · {card.method === 'cash' ? 'Cash' : 'Card'}<Kbd className="ms-1">↵</Kbd></Button>
    </div>
    {(s.problem || !!error) && <p className={cn('text-12', error ? 'text-danger' : 'text-muted')}>{error ? errorText(error) : s.problem}</p>}
    <p className="text-12 text-faint">Untick a line to leave it for later: only what is ticked is paid, and only that stops waiting.</p>
  </div>
}
