/**
 * ServiceItemPicker — THE way a charge line is chosen anywhere in the app:
 * search the price list, tap an item, it's charged; the picker stays open
 * for the next tap. Used by the encounter bill chip and the Billing page.
 * `allowCustom` adds a one-line free-text escape hatch (description +
 * price) for things that aren't in the price list.
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '../ui'
import { Loader2, Plus } from 'lucide-react'

export type ChargeLine = {
  service_item_id: string | null
  description: string
  unit_price: number
}

type PriceItem = { id: string; name: string; category: string | null; default_price: number }

export function ServiceItemPicker({
  onPick,
  allowCustom = false,
  currencySymbol = '',
  autoFocus = false,
}: {
  onPick: (line: ChargeLine) => void | Promise<void>
  allowCustom?: boolean
  currencySymbol?: string
  autoFocus?: boolean
}) {
  const [items, setItems] = useState<PriceItem[] | null>(null)
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [customOpen, setCustomOpen] = useState(false)
  const [customDesc, setCustomDesc] = useState('')
  const [customPrice, setCustomPrice] = useState('')

  useEffect(() => {
    supabase
      .from('service_items')
      .select('id,name,category,default_price')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setItems((data ?? []) as PriceItem[]))
  }, [])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items ?? []
    return (items ?? []).filter(i =>
      i.name.toLowerCase().includes(needle) || (i.category ?? '').toLowerCase().includes(needle))
  }, [items, q])

  const pick = async (line: ChargeLine, busyKey: string) => {
    if (busyId) return
    setBusyId(busyKey)
    await onPick(line)
    setBusyId(null)
  }

  const customPriceNum = parseFloat(customPrice) || 0

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search the price list…"
        value={q}
        onChange={e => setQ(e.target.value)}
        className="h-8 text-sm"
        autoFocus={autoFocus}
      />
      <div className="max-h-56 overflow-y-auto rounded-md border divide-y divide-border">
        {items === null ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            {items.length === 0 ? 'No service items — add them in Settings → Service Items.' : 'No matches.'}
          </p>
        ) : (
          filtered.slice(0, 30).map(i => (
            <button
              key={i.id}
              type="button"
              disabled={busyId !== null}
              onClick={() => void pick(
                { service_item_id: i.id, description: i.name, unit_price: i.default_price },
                i.id,
              )}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent/50 transition-colors disabled:opacity-50"
            >
              <Plus className="h-3 w-3 text-primary shrink-0" />
              <span className="flex-1 truncate">
                {i.name}
                {i.category && <span className="text-muted-foreground"> · {i.category}</span>}
              </span>
              <span className="font-mono shrink-0">
                {busyId === i.id
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : `${currencySymbol}${Number(i.default_price).toFixed(2)}`}
              </span>
            </button>
          ))
        )}
      </div>

      {allowCustom && (
        customOpen ? (
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <Input
                placeholder="Custom charge description"
                value={customDesc}
                onChange={e => setCustomDesc(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={customPrice}
              onChange={e => setCustomPrice(e.target.value)}
              className="h-8 text-sm w-24 font-mono"
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={busyId !== null || !customDesc.trim() || customPriceNum <= 0}
              onClick={async () => {
                await pick(
                  { service_item_id: null, description: customDesc.trim(), unit_price: customPriceNum },
                  'custom',
                )
                setCustomDesc('')
                setCustomPrice('')
              }}
            >
              {busyId === 'custom' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setCustomOpen(true)}
          >
            Not in the list? Custom charge…
          </button>
        )
      )}
    </div>
  )
}
