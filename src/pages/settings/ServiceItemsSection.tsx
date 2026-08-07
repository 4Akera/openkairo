import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, Loader2, Check, Layers } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  Button, Input, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Label,
} from '../../components/ui'
import { cn } from '../../lib/utils'

// ============================================================
// Service Items Section (billing.manage_fees)
// ============================================================

const SERVICE_ITEM_UNCATEGORIZED = 'Uncategorized'

type ServiceItemRow = {
  id: string
  code: string
  name: string
  category: string | null
  default_price: number
  active: boolean
  sort_order: number
}

export function ServiceItemsSection() {
  const [items, setItems] = useState<ServiceItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ id?: string; code: string; name: string; category: string; default_price: string; active: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('service_items').select('*').order('sort_order')
    setItems((data ?? []) as ServiceItemRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const existingCategories = useMemo(() => {
    const s = new Set<string>()
    for (const i of items) {
      const t = i.category?.trim()
      if (t) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [items])

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, ServiceItemRow[]>()
    for (const item of items) {
      const raw = item.category?.trim()
      const key = raw && raw.length > 0 ? raw : SERVICE_ITEM_UNCATEGORIZED
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === SERVICE_ITEM_UNCATEGORIZED) return 1
      if (b === SERVICE_ITEM_UNCATEGORIZED) return -1
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    })
    return keys.map(category => ({ category, items: map.get(category)! }))
  }, [items])

  const openNew = () => setEditing({ code: '', name: '', category: '', default_price: '', active: true })
  const openEdit = (item: ServiceItemRow) => setEditing({
    id: item.id, code: item.code, name: item.name, category: item.category ?? '', default_price: String(item.default_price), active: item.active,
  })

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    if (editing.id) {
      await supabase.from('service_items').update({
        code: editing.code, name: editing.name, category: editing.category || null,
        default_price: parseFloat(editing.default_price) || 0, active: editing.active,
      }).eq('id', editing.id)
    } else {
      await supabase.from('service_items').insert({
        code: editing.code, name: editing.name, category: editing.category || null,
        default_price: parseFloat(editing.default_price) || 0, active: editing.active,
      })
    }
    setSaving(false)
    setEditing(null)
    fetchItems()
  }

  const handleDelete = async (item: ServiceItemRow) => {
    if (!confirm(`Delete "${item.name}"? Any block definitions linked to this item will have their service item cleared.`)) return
    const { error } = await supabase.from('service_items').delete().eq('id', item.id)
    if (error) { alert(error.message); return }
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold mb-1">Service Items</h2>
          <p className="text-xs text-muted-foreground">Fee schedule for charges. Link these to block definitions for auto-charging.</p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> New Item
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
          No service items yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-5">
          {groupedByCategory.map(({ category, items: sectionItems }) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 px-0.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category === SERVICE_ITEM_UNCATEGORIZED ? 'Uncategorized' : category}
                </h3>
                <Badge variant="secondary" className="text-[9px] py-0 h-4 font-medium tabular-nums">
                  {sectionItems.length}
                </Badge>
              </div>
              <div className="border rounded-lg divide-y overflow-hidden bg-card">
                {sectionItems.map(item => (
                  <div key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5', !item.active && 'opacity-50')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{item.name}</p>
                        <span className="text-[10px] font-mono text-muted-foreground">{item.code}</span>
                      </div>
                    </div>
                    <p className="text-sm font-mono shrink-0 tabular-nums">{item.default_price.toFixed(2)}</p>
                    {!item.active && <Badge variant="muted" className="text-[10px] py-0">Inactive</Badge>}
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0" onClick={() => openEdit(item)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0 hover:text-red-500" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / New dialog */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit Service Item' : 'New Service Item'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} placeholder="LAB-CBC" />
                </div>
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <Input type="number" value={editing.default_price} onChange={e => setEditing({ ...editing, default_price: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Complete Blood Count" />
              </div>
              <div className="space-y-1.5">
                <Label>Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  value={editing.category}
                  onChange={e => setEditing({ ...editing, category: e.target.value })}
                  placeholder="e.g. Laboratory, Imaging, Consultation"
                  list="service-item-categories"
                  autoComplete="off"
                />
                <datalist id="service-item-categories">
                  {existingCategories.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Items with the same category are grouped together on this page. Leave empty for &quot;Uncategorized&quot;.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} className="rounded" />
                <span className="text-sm">Active</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !editing.code || !editing.name}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
