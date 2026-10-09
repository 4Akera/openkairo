// Billing → Prices (billing.prices, spec §5.4; owner, 2026-10-08, D27: billing's own page, apart from Settings → Services): each
// department that uses billing, its Pay first (as on the department's card: its priced work waits for payment, a soft check), its visit
// fee (charged at check-in there: owner, 2026-10-08) and each of its services — a price, At the order (the cashier types it on the payment card), or
// none (free, and it never waits). A price is the setting of the thing it prices, kept with who changed it and when; a change is for
// later orders only. Written by whoever sets prices in that department.
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { writeSetting } from '@core/db/rpc'
import { mayIn } from '@core/db/views'
import { useDepartment } from '@core/hooks/organization'
import type { Department, Organization, Service, SettingRow } from '@core/db/types'
import { Button, Card, Empty, Input, ScreenFrame, Segmented, Switch, cn, errorText } from '@core/ui'
import { cents, wire } from './money'
import { LABEL } from './words'

type Mode = 'price' | 'order' | 'free'
type PriceData = { service_id: string; price?: string; at_order?: boolean }
const billed = (org: Organization | undefined) => (org?.allDepartments ?? []).filter((d) => d.packs.includes('billing') && d.work !== 'outside')

export function Prices() {
  const { org } = useDepartment()
  const [find, setFind] = useState('')
  const f = find.trim().toLowerCase()
  const services = (d: Department) => (org?.services ?? []).filter((s) => s.department_id === d.id).sort((a, b) => a.name.localeCompare(b.name))
  // a department that sees patients has its visit fee; one with services, their prices; a bench its Pay first (a desk with none of
  // these has nothing to price)
  const depts = billed(org).filter((d) => d.work === 'visits' || d.work === 'bench' || services(d).length > 0)
  return <ScreenFrame search={<Input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a service" aria-label="Find a service" className="w-full sm:w-64" />}>
    {!depts.length ? <Card><Empty>No department uses billing yet. Tick it on a department (Settings → Departments → Packs used here).</Empty></Card>
      : depts.map((d) => <DepartmentPrices key={d.id} org={org} dept={d} services={services(d).filter((s) => !f || s.name.toLowerCase().includes(f) || s.code.toLowerCase().includes(f))} />)}
    <p className="text-12 text-faint">No price: the service is free and never waits. At the order: the cashier types its price on the payment card. A new price is for orders after it.</p>
  </ScreenFrame>
}

function DepartmentPrices({ org, dept, services }: { org: Organization | undefined; dept: Department; services: Service[] }) {
  const may = mayIn(org, 'write:billing.prices', dept.id)
  const prices = (org?.settings ?? []).filter((s) => s.key === 'billing.price') as (SettingRow & { data: PriceData })[]
  const fee = (org?.settings ?? []).find((s) => s.key === 'billing.visit_fee' && s.owner_id === dept.id) as (SettingRow & { data: { amount: string } }) | undefined
  return <Card className="overflow-x-auto">
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5"><span className="text-14 font-semibold text-fg">{dept.name}</span>
      {!may && <span className="text-12 text-faint">read-only for your role</span>}
      <PayFirst org={org} dept={dept} may={may} /></div>
    {(dept.work === 'visits' || fee) && <FeeRow dept={dept} row={fee} may={may} />}
    {services.length ? <ul>{services.map((s) => <PriceRow key={s.id} service={s} row={prices.find((p) => p.data.service_id === s.id)} may={may} />)}</ul>
      : <p className="px-4 py-3 text-13 text-faint">{dept.work === 'visits' ? 'No services of its own.' : 'No services here.'}</p>}
  </Card>
}

function useSave() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [saved, setSaved] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setSaved(false)
    try { await fn(); await qc.invalidateQueries({ queryKey: ['organization'] }); setSaved(true) } catch (x) { setError(x) } finally { setBusy(false) }
  }
  return { busy, error, saved, run }
}

/** Pay first in a department (the setting on its card): its priced work waits for payment, per order, until paid or gone ahead anyway */
function PayFirst({ org, dept, may }: { org: Organization | undefined; dept: Department; may: boolean }) {
  const on = !!((org?.settings ?? []).find((s) => s.key === 'billing.pay_first' && s.owner_id === dept.id)?.data as { on?: boolean } | undefined)?.on
  const s = useSave()
  return <span className="ms-auto flex items-center gap-2 text-13">
    <Switch checked={on} disabled={!may || s.busy} label={`${dept.name}: Pay first`}
      onChange={(v) => void s.run(() => writeSetting({ key: 'billing.pay_first', owner_id: dept.id, data: { on: v } }))} />
    <span className={on ? 'text-fg' : 'text-muted'}>Pay first</span>
    <span className="text-12 text-faint">{on ? 'its priced work waits for payment' : 'pay after, at the cashier'}</span>
    {!!s.error && <span className={cn(LABEL, 'text-danger normal-case')}>{errorText(s.error)}</span>}
  </span>
}

/** a department's visit fee: an amount, or none */
function FeeRow({ dept, row, may }: { dept: Department; row?: SettingRow & { data: { amount: string } }; may: boolean }) {
  const [amount, setAmount] = useState(row?.data.amount ?? ''); const s = useSave()
  const c = amount.trim() ? cents(amount) : null; const changed = (c === null ? '' : wire(c)) !== (row ? wire(cents(row.data.amount) ?? 0) : '')
  const bad = !!amount.trim() && (c === null || c > 1_000_000_000)
  const save = () => s.run(() => c === null
    ? writeSetting({ key: 'billing.visit_fee', owner_id: dept.id, thing_id: row!.thing_id, retired: true })
    : writeSetting({ key: 'billing.visit_fee', owner_id: dept.id, thing_id: row?.thing_id ?? null, data: { amount: wire(c) } }))
  return <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-13">
    <span className="w-56 text-fg">Visit fee</span><span className="text-12 text-muted">charged when a patient is checked in here</span>
    <Input dense inputMode="decimal" value={amount} disabled={!may} placeholder="no fee" aria-label={`${dept.name}: visit fee`} onChange={(e) => setAmount(e.target.value)}
      className={cn('ms-auto w-28 text-end tnum', bad && 'ring-danger')} />
    <SaveBit s={s} show={may && changed && !bad && (c !== null || !!row)} onSave={save} />
  </div>
}

/** a service's price: a price, At the order, or none */
function PriceRow({ service, row, may }: { service: Service; row?: SettingRow & { data: PriceData }; may: boolean }) {
  const was: Mode = !row ? 'free' : row.data.at_order ? 'order' : 'price'
  const [mode, setMode] = useState<Mode>(was); const [amount, setAmount] = useState(row?.data.price ?? ''); const s = useSave()
  const c = cents(amount); const bad = mode === 'price' && (c === null || c > 1_000_000_000)
  const changed = mode !== was || (mode === 'price' && c !== cents(row?.data.price ?? ''))
  const save = () => s.run(() => mode === 'free'
    ? writeSetting({ key: 'billing.price', owner_id: service.department_id, thing_id: row!.thing_id, retired: true })
    : writeSetting({ key: 'billing.price', owner_id: service.department_id, thing_id: row?.thing_id ?? null,
        data: mode === 'order' ? { service_id: service.id, at_order: true } : { service_id: service.id, price: wire(c!) } }))
  return <li className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2 text-13 first:border-t-0">
    <span className="w-56 truncate text-fg">{service.name}</span><span className="text-12 text-faint">{[service.code, service.section_name].filter(Boolean).join(' · ')}</span>
    <span className="ms-auto flex items-center gap-2">
      <Segmented aria-label={`${service.name}: price`} size="sm" value={mode} onChange={(m) => may && setMode(m)}
        options={[['price', 'Price'], ['order', 'At the order'], ['free', 'None']]} />
      {mode === 'price' ? <Input dense inputMode="decimal" value={amount} disabled={!may} onChange={(e) => setAmount(e.target.value)} aria-label={`${service.name}: the price`}
          placeholder="0.00" className={cn('w-28 text-end tnum', bad && amount.trim() && 'ring-danger')} />
        : <span className="w-28 text-end text-12 text-muted">{mode === 'order' ? 'typed at the cashier' : 'free'}</span>}
      <SaveBit s={s} show={may && changed && !bad && !(mode === 'free' && !row)} onSave={save} /></span>
  </li>
}

function SaveBit({ s, show, onSave }: { s: ReturnType<typeof useSave>; show: boolean; onSave?: () => void }) {
  return <span className="flex w-24 items-center justify-end gap-2">
    {show && onSave ? <Button size="sm" variant="outline" loading={s.busy} onClick={onSave}>Save</Button>
      : s.saved && !show ? <span className="text-12 text-ok">Saved</span> : null}
    {!!s.error && <span className={cn(LABEL, 'text-danger normal-case')}>{errorText(s.error)}</span>}
  </span>
}
