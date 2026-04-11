import { useState } from 'react'
import type { Block, PharmacyFulfillmentContent, PharmacyFulfillmentItem } from '../../../types'
import { Button, Input, Textarea, Label, Separator } from '../../ui'
import { Loader2, Plus, X, PackageCheck, PackageX, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Empty
// ============================================================

export function emptyPharmacyFulfillment(): PharmacyFulfillmentContent {
  return { items: [], notes: '' }
}

function emptyItem(): PharmacyFulfillmentItem {
  return { name: '', quantity: '', dispensed: false, out_of_stock: false, note: '' }
}

// ============================================================
// View
// ============================================================

export function PharmacyFulfillmentView({ block }: { block: Block }) {
  const c = { ...emptyPharmacyFulfillment(), ...(block.content as Partial<PharmacyFulfillmentContent>) }

  if (c.items.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No items recorded.</p>
  }

  const allDispensed   = c.items.length > 0 && c.items.every(i => i.dispensed)
  const hasOutOfStock  = c.items.some(i => i.out_of_stock)

  return (
    <div className="space-y-3 text-sm">
      {/* Summary badge */}
      <div className="flex items-center gap-2">
        {allDispensed && !hasOutOfStock && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full dark:bg-green-950/30 dark:text-green-400 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3" /> Fully dispensed
          </span>
        )}
        {hasOutOfStock && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            <AlertTriangle className="h-3 w-3" /> Partial — items out of stock
          </span>
        )}
      </div>

      {/* Item table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Medication / Item</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Qty</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-28">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {c.items.map((item, idx) => (
              <tr key={idx} className={cn(item.out_of_stock && 'bg-amber-50/50 dark:bg-amber-950/10')}>
                <td className="px-3 py-2">
                  <p className="font-medium">{item.name || <span className="italic text-muted-foreground">—</span>}</p>
                  {item.note && <p className="text-[10px] text-muted-foreground mt-0.5">{item.note}</p>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{item.quantity || '—'}</td>
                <td className="px-3 py-2">
                  {item.out_of_stock ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                      <PackageX className="h-3 w-3" /> Out of stock
                    </span>
                  ) : item.dispensed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400">
                      <PackageCheck className="h-3 w-3" /> Dispensed
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {c.notes && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{c.notes}</p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

export function PharmacyFulfillmentEdit({
  block,
  onSave,
  onCancel,
}: {
  block: Block
  onSave: (c: PharmacyFulfillmentContent) => Promise<void>
  onCancel: () => void
}) {
  const init = { ...emptyPharmacyFulfillment(), ...(block.content as Partial<PharmacyFulfillmentContent>) }
  const [items, setItems]   = useState<PharmacyFulfillmentItem[]>(init.items.length > 0 ? init.items : [emptyItem()])
  const [notes, setNotes]   = useState(init.notes)
  const [saving, setSaving] = useState(false)

  const updateItem = (idx: number, patch: Partial<PharmacyFulfillmentItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ items, notes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Items */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">Dispensed Items</Label>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-md border bg-muted/20 p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Medication / Item</Label>
                      <Input
                        value={item.name}
                        onChange={e => updateItem(idx, { name: e.target.value })}
                        placeholder="e.g. Amoxicillin 500 mg"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Quantity</Label>
                      <Input
                        value={item.quantity}
                        onChange={e => updateItem(idx, { quantity: e.target.value })}
                        placeholder="e.g. 21"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  {/* Status toggles */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.dispensed}
                        onChange={e => updateItem(idx, { dispensed: e.target.checked, out_of_stock: e.target.checked ? false : item.out_of_stock })}
                        className="rounded border-border accent-green-600"
                      />
                      <span className="text-xs text-green-700 dark:text-green-400 font-medium">Dispensed</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.out_of_stock}
                        onChange={e => updateItem(idx, { out_of_stock: e.target.checked, dispensed: e.target.checked ? false : item.dispensed })}
                        className="rounded border-border accent-amber-600"
                      />
                      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Out of stock</span>
                    </label>
                  </div>
                  {/* Per-item note */}
                  <Input
                    value={item.note}
                    onChange={e => updateItem(idx, { note: e.target.value })}
                    placeholder="Optional note (substitution, partial, etc.)"
                    className="h-7 text-xs text-muted-foreground"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="mt-0.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  disabled={items.length === 1}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full h-8 text-xs" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" /> Add Item
        </Button>
      </div>

      <Separator />

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Pharmacist Notes</Label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Substitutions, counselling notes, interactions…"
          rows={3}
          className="text-sm resize-none"
        />
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}
