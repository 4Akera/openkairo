import { useState, useCallback } from 'react'
import type { Block, LabOrderContent } from '../../../types'
import { Button, Input, Label } from '../../ui'
import { Loader2, FlaskConical, Plus, X } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { PANELS, PANEL_MAP } from './labShared.tsx'

// ============================================================
// Empty
// ============================================================

export function emptyLabOrder(): LabOrderContent {
  return {
    panels:     [],
    custom:     [],
    indication: '',
    urgency:    '',
    specimen:   'venous blood',
  }
}

// ============================================================
// Constants
// ============================================================

const URGENCY_OPTS = [
  { v: 'routine', l: 'Routine' },
  { v: 'urgent',  l: 'Urgent'  },
  { v: 'stat',    l: 'STAT'    },
]

const SPECIMEN_OPTS = [
  'Venous blood', 'Arterial blood', 'Capillary blood',
  'Urine', 'CSF', 'Pleural fluid', 'Ascitic fluid', 'Wound swab', 'Sputum', 'Other',
]

// ============================================================
// View — shows what was ordered
// ============================================================

export function LabOrderView({ block }: { block: Block }) {
  const c = { ...emptyLabOrder(), ...(block.content as Partial<LabOrderContent>) }

  const urgencyColor =
    c.urgency === 'stat'   ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
    c.urgency === 'urgent' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
    c.urgency === 'routine'? 'bg-muted text-muted-foreground' : ''

  const panelLabels  = c.panels.map(id => PANEL_MAP[id]?.label ?? id)
  const hasCustom    = c.custom.some(cu => cu.name.trim())

  if (c.panels.length === 0 && !hasCustom) {
    return <p className="text-sm text-muted-foreground italic">No panels selected.</p>
  }

  return (
    <div className="space-y-2 text-sm">
      {/* Urgency + specimen + indication row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {c.urgency && (
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', urgencyColor)}>
            {c.urgency.toUpperCase()}
          </span>
        )}
        {c.specimen && <span className="text-muted-foreground">{c.specimen}</span>}
        {c.indication && <span className="text-muted-foreground italic">· {c.indication}</span>}
      </div>

      {/* Panel chips */}
      <div className="flex flex-wrap gap-1">
        {panelLabels.map((l, i) => (
          <span key={i} className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
            {l}
          </span>
        ))}
        {c.custom.filter(cu => cu.name.trim()).map((cu, i) => (
          <span key={`cu-${i}`} className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground">
            {cu.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Edit — order form only
// ============================================================

interface EditProps {
  block:    Block
  onSave:   (c: LabOrderContent) => Promise<void>
  onCancel: () => void
}

function PanelChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-xs px-2.5 py-1 rounded-md border transition-colors',
        active ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent',
      )}
    >
      {label}
    </button>
  )
}

export function LabOrderEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<LabOrderContent>
  const [form, setForm] = useState<LabOrderContent>({ ...emptyLabOrder(), ...ex })
  const [saving, setSaving] = useState(false)

  const togglePanel = useCallback((id: string) => {
    setForm(f => {
      const has = f.panels.includes(id)
      return { ...f, panels: has ? f.panels.filter(p => p !== id) : [...f.panels, id] }
    })
  }, [])

  const addCustom = () =>
    setForm(f => ({ ...f, custom: [...f.custom, { name: '', unit: '', ref_low: '', ref_high: '' }] }))

  const removeCustom = (i: number) =>
    setForm(f => ({ ...f, custom: f.custom.filter((_, j) => j !== i) }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">

      {/* Urgency + Specimen */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Urgency</Label>
          <div className="flex gap-1.5">
            {URGENCY_OPTS.map(o => (
              <button
                key={o.v}
                type="button"
                onClick={() => setForm(f => ({ ...f, urgency: f.urgency === o.v ? '' : o.v as LabOrderContent['urgency'] }))}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-md border transition-colors',
                  form.urgency === o.v
                    ? o.v === 'stat'   ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 font-semibold'
                    : o.v === 'urgent' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 font-semibold'
                    : 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:bg-accent',
                )}
              >{o.l}</button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Specimen</Label>
          <select
            value={form.specimen}
            onChange={e => setForm(f => ({ ...f, specimen: e.target.value }))}
            className="h-8 w-full text-xs rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {SPECIMEN_OPTS.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
        </div>

        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Clinical indication</Label>
          <Input
            placeholder="e.g. Sepsis workup, thyroid monitoring…"
            value={form.indication}
            onChange={e => setForm(f => ({ ...f, indication: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Panel selection */}
      <div className="space-y-2">
        <Label className="text-xs">Panels</Label>
        <div className="flex flex-wrap gap-1.5">
          {PANELS.map(p => (
            <PanelChip
              key={p.id}
              label={p.id.toUpperCase()}
              active={form.panels.includes(p.id)}
              onClick={() => togglePanel(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom tests */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Custom tests</Label>
          <Button variant="ghost" size="sm" type="button" onClick={addCustom} className="h-6 text-xs gap-1 px-2">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        {form.custom.length > 0 && (
          <div className="space-y-1.5">
            {form.custom.map((cu, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_5rem_5rem_auto] gap-1.5 items-center">
                <Input placeholder="Test name" value={cu.name}
                  onChange={e => setForm(f => { const c = [...f.custom]; c[i] = { ...c[i], name: e.target.value }; return { ...f, custom: c } })}
                  className="h-7 text-xs" />
                <Input placeholder="Unit" value={cu.unit}
                  onChange={e => setForm(f => { const c = [...f.custom]; c[i] = { ...c[i], unit: e.target.value }; return { ...f, custom: c } })}
                  className="h-7 text-xs" />
                <Input placeholder="Low" value={cu.ref_low}
                  onChange={e => setForm(f => { const c = [...f.custom]; c[i] = { ...c[i], ref_low: e.target.value }; return { ...f, custom: c } })}
                  className="h-7 text-xs" />
                <Input placeholder="High" value={cu.ref_high}
                  onChange={e => setForm(f => { const c = [...f.custom]; c[i] = { ...c[i], ref_high: e.target.value }; return { ...f, custom: c } })}
                  className="h-7 text-xs" />
                <Button variant="ghost" size="icon" type="button" onClick={() => removeCustom(i)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving || (form.panels.length === 0 && !form.custom.some(c => c.name.trim()))} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <FlaskConical className="h-3.5 w-3.5" />
          Place order
        </Button>
      </div>
    </div>
  )
}
