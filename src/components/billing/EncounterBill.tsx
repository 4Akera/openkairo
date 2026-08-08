/**
 * EncounterBill — the encounter's running bill as a header chip.
 *
 * Shows the live total of the encounter's charges; tap → line items plus a
 * one-tap "add charge" picker fed by the Service Items price list. Renders
 * nothing when billing is off or the user has no billing access (charges
 * RLS would block the read anyway).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Charge } from '../../types'
import {
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui'
import { cn } from '../../lib/utils'
import { Receipt, Loader2, Plus } from 'lucide-react'

type PriceItem = { id: string; name: string; category: string | null; default_price: number }

const DEAD_STATUSES = new Set(['void', 'waived'])

export function EncounterBill({ encounterId, patientId }: { encounterId: string; patientId: string }) {
  const { user, can, hasBilling } = useAuthStore()
  const { billingEnabled, currencySymbol } = useSettingsStore()

  const [charges, setCharges] = useState<Charge[] | null>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PriceItem[]>([])
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<string | null>(null)

  const canRead = billingEnabled && hasBilling
  const canCharge = canRead && can('billing.charge')

  const fetchCharges = useCallback(async () => {
    const { data } = await supabase
      .from('charges')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: true })
    setCharges((data ?? []) as Charge[])
  }, [encounterId])

  useEffect(() => {
    if (!canRead) return
    void fetchCharges()
  }, [canRead, fetchCharges])

  // Price list, loaded once the dialog first opens
  useEffect(() => {
    if (!open || !canCharge || items.length > 0) return
    supabase
      .from('service_items')
      .select('id,name,category,default_price')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setItems((data ?? []) as PriceItem[]))
  }, [open, canCharge, items.length])

  const live = useMemo(
    () => (charges ?? []).filter(c => !DEAD_STATUSES.has(c.status)),
    [charges],
  )
  const total = live.reduce((sum, c) => sum + c.quantity * c.unit_price, 0)

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter(i =>
      i.name.toLowerCase().includes(needle) || (i.category ?? '').toLowerCase().includes(needle))
  }, [items, q])

  const addCharge = async (item: PriceItem) => {
    if (!user || adding) return
    setAdding(item.id)
    await supabase.from('charges').insert({
      patient_id: patientId,
      encounter_id: encounterId,
      service_item_id: item.id,
      description: item.name,
      quantity: 1,
      unit_price: item.default_price,
      status: 'pending',
      source: 'manual',
      created_by: user.id,
    })
    await fetchCharges()
    setAdding(null)
  }

  if (!canRead || charges === null) return null

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); void fetchCharges() }}
        title="Running bill for this encounter"
        className={cn(
          'flex items-center gap-1 h-9 sm:h-7 px-2.5 rounded-md border text-xs font-medium transition-colors shrink-0',
          total > 0
            ? 'border-emerald-300/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <Receipt className="h-3.5 w-3.5" />
        <span className="font-mono">{currencySymbol}{total.toFixed(2)}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bill</DialogTitle>
            <DialogDescription>Everything charged on this encounter so far.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {live.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">No charges yet.</p>
            ) : (
              <div className="space-y-1">
                {live.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-xs rounded-md border px-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.description}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{c.status.replace('_', ' ')}</p>
                    </div>
                    <span className="font-mono shrink-0">
                      {currencySymbol}{(c.quantity * c.unit_price).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-2 pt-1.5 text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{currencySymbol}{total.toFixed(2)}</span>
                </div>
              </div>
            )}

            {canCharge && (
              <div className="border-t pt-3 space-y-2">
                <Input
                  placeholder="Add a charge — search the price list…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  className="h-8 text-sm"
                />
                <div className="max-h-44 overflow-y-auto rounded-md border divide-y divide-border">
                  {filteredItems.length === 0 ? (
                    <p className="px-3 py-2.5 text-xs text-muted-foreground">
                      {items.length === 0 ? 'No service items — add them in Settings → Service Items.' : 'No matches.'}
                    </p>
                  ) : (
                    filteredItems.slice(0, 30).map(i => (
                      <button
                        key={i.id}
                        type="button"
                        disabled={adding !== null}
                        onClick={() => void addCharge(i)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 transition-colors disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3 text-primary shrink-0" />
                        <span className="flex-1 truncate">
                          {i.name}
                          {i.category && <span className="text-muted-foreground"> · {i.category}</span>}
                        </span>
                        <span className="font-mono shrink-0">
                          {adding === i.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : `${currencySymbol}${Number(i.default_price).toFixed(2)}`}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
