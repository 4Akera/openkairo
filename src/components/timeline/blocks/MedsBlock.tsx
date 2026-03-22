import { useState } from 'react'
import type { Block, MedOrdersContent, MedOrderItem } from '../../../types'
import { Button, Label, Input, Textarea } from '../../ui'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Helpers
// ============================================================

const ROUTES = ['PO', 'IV', 'IM', 'SC', 'SL', 'INH', 'TOP', 'PR', 'NG', 'Other']
const FREQUENCIES = ['Once', 'BID', 'TID', 'QID', 'Q6H', 'Q8H', 'Q12H', 'QD', 'QOD', 'PRN', 'Continuous', 'Other']
const STATUS_LABELS: Record<MedOrderItem['status'], string> = {
  prescribed:    'Prescribed',
  held:          'Held',
  discontinued:  'Discontinued',
}
const STATUS_COLORS: Record<MedOrderItem['status'], string> = {
  prescribed:   'bg-emerald-100 text-emerald-800',
  held:         'bg-amber-100 text-amber-800',
  discontinued: 'bg-rose-100 text-rose-800',
}

function newItem(): MedOrderItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    dose: '',
    route: 'PO',
    frequency: 'QD',
    instructions: '',
    status: 'prescribed',
  }
}

export function emptyMedOrders(): MedOrdersContent {
  return { items: [], notes: '' }
}

// ============================================================
// View
// ============================================================

export function MedsView({ block }: { block: Block }) {
  const c = block.content as Partial<MedOrdersContent>
  const items = c.items ?? []
  const notes = (c.notes ?? '').trim()

  if (items.length === 0 && !notes) {
    return <p className="text-sm text-muted-foreground italic">No medications ordered.</p>
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="divide-y divide-border/60">
          {items.map(item => (
            <div key={item.id} className="py-2 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{item.name || '—'}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {[item.dose, item.route, item.frequency].filter(Boolean).join(' · ')}
                </span>
                {item.instructions && (
                  <p className="text-xs text-muted-foreground mt-0.5 italic">{item.instructions}</p>
                )}
              </div>
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0', STATUS_COLORS[item.status])}>
                {STATUS_LABELS[item.status]}
              </span>
            </div>
          ))}
        </div>
      )}
      {notes && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-2">{notes}</p>
      )}
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

interface EditProps {
  block: Block
  onSave: (c: MedOrdersContent) => Promise<void>
  onCancel: () => void
}

export function MedsEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<MedOrdersContent>
  const [items, setItems] = useState<MedOrderItem[]>(
    existing.items?.length ? existing.items : []
  )
  const [notes, setNotes] = useState(existing.notes ?? '')
  const [saving, setSaving] = useState(false)

  const addItem = () => setItems(prev => [...prev, newItem()])

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(i => i.id !== id))

  const patchItem = (id: string, patch: Partial<MedOrderItem>) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))

  const handleSave = async () => {
    setSaving(true)
    await onSave({ items, notes })
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Med rows */}
      <div className="space-y-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-3 border border-dashed rounded-md">
            No medications added yet.
          </p>
        )}

        {items.map((item, idx) => (
          <MedRow
            key={item.id}
            item={item}
            index={idx}
            onChange={patch => patchItem(item.id, patch)}
            onRemove={() => removeItem(item.id)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={addItem}
        >
          <Plus className="h-3.5 w-3.5" />
          Add medication
        </Button>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs">Notes / reconciliation remarks</Label>
        <Textarea
          rows={2}
          className="resize-none text-sm"
          placeholder="Allergy cautions, substitutions, patient counselling notes…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save medications
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// MedRow — module-level to preserve focus (no inner component defs)
// ============================================================

function MedRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: MedOrderItem
  index: number
  onChange: (patch: Partial<MedOrderItem>) => void
  onRemove: () => void
}) {
  return (
    <div className="border rounded-lg p-3 space-y-2.5 bg-muted/20">
      {/* Row header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
          aria-label="Remove medication"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Name + dose */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Drug name *</Label>
          <Input
            value={item.name}
            placeholder="e.g. Amoxicillin"
            className="h-8 text-sm"
            onChange={e => onChange({ name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dose</Label>
          <Input
            value={item.dose}
            placeholder="e.g. 500 mg"
            className="h-8 text-sm"
            onChange={e => onChange({ dose: e.target.value })}
          />
        </div>
      </div>

      {/* Route + frequency + status */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Route</Label>
          <select
            value={item.route}
            onChange={e => onChange({ route: e.target.value })}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Frequency</Label>
          <select
            value={item.frequency}
            onChange={e => onChange({ frequency: e.target.value })}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <select
            value={item.status}
            onChange={e => onChange({ status: e.target.value as MedOrderItem['status'] })}
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="prescribed">Prescribed</option>
            <option value="held">Held</option>
            <option value="discontinued">Discontinued</option>
          </select>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-1">
        <Label className="text-xs">Special instructions</Label>
        <Input
          value={item.instructions}
          placeholder="e.g. Take with food, avoid sun exposure…"
          className="h-8 text-sm"
          onChange={e => onChange({ instructions: e.target.value })}
        />
      </div>
    </div>
  )
}
