// Today (billing.today, spec §5.4, the bill-today picture): Taken today (and the receipts), Cash (in the drawer, with the float), Card,
// Waived (the discounts and their reasons), Given back; a row a cashier and a row a department whose work was paid (each payment's total,
// its discount taken off, shared among its lines, so the rows add up to what was taken less what was given back); this desk's, or the
// whole clinic's for whoever reads every desk's accounts. A day's numbers stay as they were: a refund on a later day is that day's. Close the drawer: the float plus the cash taken since the last closing is what
// is expected, counted against what is there; a difference needs its reason; the closing is a new row, never edited.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { packOp } from '@core/db/rpc'
import { useDepartment } from '@core/hooks/organization'
import { nameOf } from '@core/db/views'
import type { ScreenProps } from '@core/screens/registry'
import { Button, Callout, Card, Input, Kbd, ScreenFrame, Segmented, Spinner, Tag, cn, errorText, hm } from '@core/ui'
import { KEY, useBillingDone, useBillingLive } from './hooks'
import { cents, drawerWords, egp, signed, wire } from './money'
import { LABEL } from './words'

type N = number | string
interface Drawer { since: string | null; float: N; cash: N; receipts: number; expected: N }
interface Day { day: string; all: boolean; taken: N; receipts: number; cash: N; card: N; cards: number; given_back: N; refunds: number; waived: N; discounts: number
  reasons: { reason: string | null; count: number; amount: N }[]; cashiers: { user_id: string; by: string | null; receipts: number; cash: N; card: N; waived: N; given_back: N }[]
  departments: { department_id: string; amount: N; lines: number }[]; drawer: Drawer | null; desk: string
  closings: { id: string; by: string | null; at: string; float: N; cash: N; expected: N; counted: N; difference: N; reason: string | null }[] }

export function Today({ dept }: ScreenProps) {
  const { org, can } = useDepartment(); useBillingLive(org?.organization.id)
  const [all, setAll] = useState(false); const whole = all && can('read:billing.accounts')
  const q = useQuery({ queryKey: [KEY, 'day', dept.id, whole], refetchInterval: 60_000, queryFn: () => packOp<Day>('billing.day', dept.id, whole ? { all: true } : {}) })
  const d = q.data
  const tile = (label: string, value: number, hint?: string, tone?: string) => <div className="grid gap-0.5 rounded-lg border border-line bg-surface p-3">
    <span className={LABEL}>{label}</span><span className={cn('text-20 font-semibold tnum', tone ?? 'text-fg')}>{egp(value)}</span>{hint && <span className="text-12 text-muted">{hint}</span>}</div>
  return <ScreenFrame action={can('read:billing.accounts') && <Segmented aria-label="Whose totals" value={all ? 'all' : 'desk'} onChange={(v) => setAll(v === 'all')}
      options={[['desk', 'This desk'], ['all', 'Whole clinic']]} size="sm" />}>
    {q.isLoading ? <Spinner label="Adding up the day" /> : q.error ? <Callout tone="danger" title="Not loaded">{errorText(q.error)}</Callout> : d && <>
      <div className="grid gap-3 sm:grid-cols-5">
        {tile('Taken today', signed(d.taken), `${d.receipts} receipt${d.receipts === 1 ? '' : 's'}`)}
        {tile('Cash', signed(d.cash), whole ? 'every drawer' : d.drawer ? `in my drawer: ${egp(signed(d.drawer.expected))} with the float` : 'given back included')}
        {tile('Card', signed(d.card), `${d.cards} payment${d.cards === 1 ? '' : 's'}`)}
        {tile('Waived', signed(d.waived), d.discounts ? `${d.discounts} · ${d.reasons.map((r) => r.reason).join(', ')}` : 'nothing waived')}
        {tile('Given back', signed(d.given_back), `${d.refunds} refund${d.refunds === 1 ? '' : 's'}`, signed(d.given_back) ? 'text-warn' : undefined)}
      </div>
      <Card className="overflow-x-auto"><table className="w-full text-13"><thead><tr className="border-b border-line text-11 uppercase tracking-[0.06em] text-faint">
        {['Cashier', 'Receipts', 'Cash', 'Card', 'Waived', 'Given back'].map((h, i) => <th key={h} className={cn('px-4 py-2 font-medium', i ? 'text-end' : 'text-start')}>{h}</th>)}</tr></thead>
        <tbody>{d.cashiers.length ? d.cashiers.map((c) => <tr key={c.user_id} className="border-t border-line"><td className="px-4 py-2 text-fg">{c.by ?? '…'}</td>
          {[String(c.receipts), egp(signed(c.cash)), egp(signed(c.card)), egp(signed(c.waived)), egp(signed(c.given_back))].map((x, i) => <td key={i} className="px-4 py-2 text-end tnum text-muted">{x}</td>)}</tr>)
          : <tr><td colSpan={6} className="px-4 py-3 text-center text-faint">Nothing taken yet today.</td></tr>}</tbody></table></Card>
      {d.departments.length > 0 && <Card className="p-4"><p className={cn(LABEL, 'pb-2')}>Whose work was paid</p>
        <ul className="grid gap-1 text-13">{d.departments.map((x) => <li key={x.department_id} className="flex justify-between gap-3"><span className="text-fg">{nameOf(org, x.department_id) ?? '…'}</span>
          <span className="tnum text-muted">{egp(signed(x.amount))}</span></li>)}</ul></Card>}
      {!whole && d.drawer && can('write:billing.payment') && <CloseDrawer departmentId={dept.id} drawer={d.drawer} who={org?.me.name ?? ''} />}
      {d.closings.length > 0 && <Card className="p-4"><p className={cn(LABEL, 'pb-2')}>Drawers closed today</p>
        <ul className="grid gap-1 text-13">{d.closings.map((c) => { const w = drawerWords(signed(c.expected), signed(c.counted))
          return <li key={c.id} className="flex flex-wrap items-baseline gap-x-3"><span className="w-12 text-faint tnum">{hm(c.at)}</span><span className="text-fg">{c.by ?? '…'}</span>
            <span className="text-muted tnum">{egp(signed(c.expected))} expected · {egp(signed(c.counted))} counted</span>
            {w && <Tag tone={w.tone}>{w.word}</Tag>}{c.reason && <span className="text-12 text-muted">{c.reason}</span>}</li> })}</ul></Card>}
    </>}
  </ScreenFrame>
}

/** close my drawer: what is expected (the float and the cash since my last closing), what was counted, a reason for a difference */
function CloseDrawer({ departmentId, drawer, who }: { departmentId: string; drawer: Drawer; who: string }) {
  const done = useBillingDone()
  const [open, setOpen] = useState(false); const [counted, setCounted] = useState(''); const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [said, setSaid] = useState<string | null>(null)
  const expected = signed(drawer.expected); const c = cents(counted); const w = drawerWords(expected, c)
  const ready = c !== null && (w?.difference === 0 || reason.trim().length > 0)
  const close = async () => {
    if (!ready || busy) return
    setBusy(true); setError(null)
    // what was counted as the card read it (1,250 is 1250.00), never the letters typed
    try { await packOp('billing.close', departmentId, { counted: wire(c!), ...(reason.trim() ? { reason: reason.trim() } : {}) }); setSaid(`Closed: ${w?.word}`); setOpen(false); setCounted(''); setReason(''); await done() }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  return <Card className={cn('grid gap-3 p-4', open && 'ring-1 ring-accent-line')}>
    <div className="flex flex-wrap items-center gap-3 text-13"><span className={LABEL}>{who} · cash drawer</span>
      <span className="text-muted">Float {egp(signed(drawer.float))} + cash taken {egp(signed(drawer.cash))} = <b className="font-semibold text-fg">{egp(expected)} expected</b></span>
      {!open && <Button size="sm" className="ms-auto" onClick={() => { setOpen(true); setSaid(null) }}>Close the drawer</Button>}
      {said && <Tag tone="ok">{said}</Tag>}</div>
    {open && <div className="flex flex-wrap items-center gap-2 text-13" onKeyDown={(e) => { if (e.key === 'Enter') void close(); if (e.key === 'Escape') setOpen(false) }}>
      <span className="text-muted">Counted</span><Input dense autoFocus inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} aria-label="Cash counted" className="w-28 text-end tnum" />
      {w && <Tag tone={w.tone}>{w.word}</Tag>}
      {w && w.difference !== 0 && <Input dense value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (needed for a difference)" aria-label="Why it differs" className="w-72" />}
      <Button className="ms-auto" loading={busy} disabled={!ready} onClick={() => void close()}>Close<Kbd className="ms-1">↵</Kbd></Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>}
    {!!error && <p className="text-12 text-danger">{errorText(error)}</p>}
    <p className="text-12 text-muted">As a stock-take: counted against expected, a difference with its reason, kept as a new row; a closed drawer is never edited.</p>
  </Card>
}
