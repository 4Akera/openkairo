// The Print button every printout is offered with (spec/openCare.md §3.13 Printing): a person's button, never automatic; its key P
// where the screen says so (keyed); once printed, Print again — a reprint of the same thing, marked as one. A print that cannot be logged
// or drawn says why under it and prints nothing.
import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button, Kbd, errorText } from '../ui'
import { usePrintKey } from './key'

export function PrintButton({ label, print, printed = false, keyed = false, size = 'sm', variant = 'outline', className }: {
  label: string; print: () => Promise<unknown>; printed?: boolean; keyed?: boolean
  size?: 'sm' | 'md'; variant?: 'primary' | 'outline' | 'ghost'; className?: string }) {
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(printed); const [error, setError] = useState<unknown>(null)
  const go = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try { const r = await print() as { printed?: boolean } | undefined; if (r?.printed !== false) setDone(true) }
    catch (x) { setError(x) } finally { setBusy(false) }
  }
  usePrintKey(() => void go(), keyed)
  return <span className={className}>
    <Button size={size} variant={variant} loading={busy} onClick={() => void go()}><Printer />{done || printed ? 'Print again' : label}{keyed && <Kbd className="ms-1">P</Kbd>}</Button>
    {!!error && <span role="alert" className="ms-2 text-12 text-danger">Not printed: {errorText(error)}</span>}
  </span>
}
