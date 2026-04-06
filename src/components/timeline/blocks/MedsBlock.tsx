import { useState, useRef } from 'react'
import type { Block, MedsContent, MedItem } from '../../../types'
import { Button, Input } from '../../ui'
import { Loader2, Pill, Plus, X, ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Empty / helpers
// ============================================================

export function emptyMeds(): MedsContent {
  return { meds: [] }
}

function newMed(): MedItem {
  return {
    id:         crypto.randomUUID(),
    name:       '',
    dose:       '',
    route:      '',
    freq:       '',
    duration:   '',
    indication: '',
    status:     'active',
  }
}

// Quick-pick chips for route and frequency
const ROUTE_OPTS = ['PO', 'IV', 'IM', 'SC', 'SL', 'PR', 'INH', 'TOP']
const FREQ_OPTS  = ['OD', 'BD', 'TDS', 'QDS', 'PRN', 'STAT', 'Nocte', 'OM']

const STATUS_CLS: Record<MedItem['status'], string> = {
  active:       'text-foreground',
  held:         'text-amber-600 dark:text-amber-400',
  discontinued: 'text-muted-foreground line-through',
}
const STATUS_BADGE: Record<MedItem['status'], string> = {
  active:       '',
  held:         'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  discontinued: 'bg-muted text-muted-foreground border-border',
}

// ============================================================
// View — compact medication list
// ============================================================

export function MedsView({ block }: { block: Block }) {
  const c = { meds: [], ...(block.content as Partial<MedsContent>) }
  const meds = c.meds.filter(m => m.name.trim())

  if (meds.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No medications recorded.</p>
  }

  const active       = meds.filter(m => m.status === 'active')
  const held         = meds.filter(m => m.status === 'held')
  const discontinued = meds.filter(m => m.status === 'discontinued')

  const MedRow = ({ med }: { med: MedItem }) => (
    <div className={cn('flex items-baseline gap-2 py-0.5', STATUS_CLS[med.status])}>
      <span className="font-medium text-sm min-w-0 shrink-0">{med.name}</span>
      {(med.dose || med.route || med.freq) && (
        <span className="text-xs text-muted-foreground truncate">
          {[med.dose, med.route, med.freq, med.duration].filter(Boolean).join(' · ')}
        </span>
      )}
      {med.indication && (
        <span className="text-[11px] text-muted-foreground/70 italic truncate hidden sm:block">
          ({med.indication})
        </span>
      )}
      {med.status !== 'active' && (
        <span className={cn('text-[10px] font-medium px-1.5 py-0 rounded border shrink-0', STATUS_BADGE[med.status])}>
          {med.status}
        </span>
      )}
    </div>
  )

  return (
    <div className="space-y-2 text-sm">
      {active.length > 0 && (
        <div className="space-y-0.5">
          {active.map(m => <MedRow key={m.id} med={m} />)}
        </div>
      )}
      {held.length > 0 && (
        <div className="space-y-0.5 border-t border-border/40 pt-1.5 mt-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">Held</p>
          {held.map(m => <MedRow key={m.id} med={m} />)}
        </div>
      )}
      {discontinued.length > 0 && (
        <div className="space-y-0.5 border-t border-border/40 pt-1.5 mt-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Discontinued</p>
          {discontinued.map(m => <MedRow key={m.id} med={m} />)}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Edit — fast row-based entry
// ============================================================

interface EditProps {
  block:    Block
  onSave:   (c: MedsContent) => Promise<void>
  onCancel: () => void
}

function MedEditRow({
  med,
  onChange,
  onRemove,
  onEnter,
}: {
  med:      MedItem
  onChange: (m: MedItem) => void
  onRemove: () => void
  onEnter:  () => void
}) {
  const [open, setOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof MedItem, v: string) => onChange({ ...med, [k]: v })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onEnter() }
  }

  return (
    <div className={cn(
      'rounded-lg border bg-card',
      med.status === 'held'         && 'border-amber-200 dark:border-amber-800',
      med.status === 'discontinued' && 'opacity-60',
    )}>
      {/* Main row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Status cycle button */}
        <button
          type="button"
          title="Cycle status: active → held → discontinued"
          onClick={() => {
            const next: MedItem['status'] = med.status === 'active' ? 'held' : med.status === 'held' ? 'discontinued' : 'active'
            onChange({ ...med, status: next })
          }}
          className={cn(
            'shrink-0 h-5 w-5 rounded-full border-2 transition-colors',
            med.status === 'active'       && 'border-emerald-500 bg-emerald-500',
            med.status === 'held'         && 'border-amber-400 bg-amber-400',
            med.status === 'discontinued' && 'border-muted-foreground/40 bg-transparent',
          )}
        />

        {/* Name */}
        <input
          ref={nameRef}
          value={med.name}
          onChange={e => set('name', e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Medication name"
          className="flex-1 min-w-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground focus:outline-none"
        />

        {/* Quick dose */}
        <input
          value={med.dose}
          onChange={e => set('dose', e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Dose"
          className="w-16 bg-transparent text-xs text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none text-right"
        />

        {/* Route chip-selector */}
        <div className="relative shrink-0">
          <select
            value={med.route}
            onChange={e => set('route', e.target.value)}
            className="h-6 text-xs rounded border border-input bg-background px-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer appearance-none pr-5 min-w-[3.5rem]"
          >
            <option value="">Route</option>
            {ROUTE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
            <option value="other">Other</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        </div>

        {/* Freq chip-selector */}
        <div className="relative shrink-0">
          <select
            value={med.freq}
            onChange={e => set('freq', e.target.value)}
            className="h-6 text-xs rounded border border-input bg-background px-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer appearance-none pr-5 min-w-[3.5rem]"
          >
            <option value="">Freq</option>
            {FREQ_OPTS.map(f => <option key={f} value={f}>{f}</option>)}
            <option value="other">Other</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        </div>

        {/* Expand / remove */}
        <button type="button" onClick={() => setOpen(o => !o)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        <button type="button" onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded extras */}
      {open && (
        <div className="border-t border-border/40 px-2 pb-2 pt-1.5 grid grid-cols-2 gap-1.5">
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Route (free text)</p>
            <Input value={med.route} onChange={e => set('route', e.target.value)}
              placeholder="e.g. oral, IV infusion" className="h-6 text-xs" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Frequency (free text)</p>
            <Input value={med.freq} onChange={e => set('freq', e.target.value)}
              placeholder="e.g. twice daily, every 8h" className="h-6 text-xs" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Duration / End date</p>
            <Input value={med.duration} onChange={e => set('duration', e.target.value)}
              placeholder="e.g. 7 days, until review" className="h-6 text-xs" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] text-muted-foreground">Indication</p>
            <Input value={med.indication} onChange={e => set('indication', e.target.value)}
              placeholder="e.g. HTN, pain" className="h-6 text-xs" />
          </div>
        </div>
      )}
    </div>
  )
}

export function MedsEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<MedsContent>
  const [meds, setMeds] = useState<MedItem[]>(
    ex.meds?.length ? ex.meds : [newMed()]
  )
  const [saving, setSaving] = useState(false)

  const addMed = () => setMeds(m => [...m, newMed()])

  const updateMed = (id: string, updated: MedItem) =>
    setMeds(m => m.map(x => x.id === id ? updated : x))

  const removeMed = (id: string) =>
    setMeds(m => m.filter(x => x.id !== id))

  const handleSave = async () => {
    setSaving(true)
    await onSave({ meds: meds.filter(m => m.name.trim()) })
    setSaving(false)
  }

  const hasAny = meds.some(m => m.name.trim())

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /> Active</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400 inline-block" /> Held</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full border-2 border-muted-foreground/40 inline-block" /> D/C'd</span>
        <span className="ml-auto">Click dot to cycle status · ↵ adds next line</span>
      </div>

      {/* Med rows */}
      <div className="space-y-1.5">
        {meds.map((med, i) => (
          <MedEditRow
            key={med.id}
            med={med}
            onChange={updated => updateMed(med.id, updated)}
            onRemove={() => removeMed(med.id)}
            onEnter={() => {
              // If last row, add a new one; otherwise focus next
              if (i === meds.length - 1) addMed()
            }}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" type="button" onClick={addMed}
        className="w-full gap-1.5 h-8 text-xs border-dashed">
        <Plus className="h-3.5 w-3.5" /> Add medication
      </Button>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving || !hasAny} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <Pill className="h-3.5 w-3.5" />
          Save meds
        </Button>
      </div>
    </div>
  )
}
