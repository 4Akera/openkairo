import { useState } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Input, Textarea, Separator } from '../../ui'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type WoundType      = 'surgical' | 'traumatic' | 'pressure' | 'diabetic' | 'vascular' | 'other' | ''
export type WoundExudate   = 'none' | 'low' | 'moderate' | 'heavy' | ''
export type ExudateType    = 'serous' | 'sanguineous' | 'purulent' | 'mixed' | ''

export interface WoundCareContent {
  site:          string
  wound_type:    WoundType
  stage:         string
  size:          string
  appearance:    string[]
  exudate:       WoundExudate
  exudate_type:  ExudateType
  periwound:     string
  dressing_used: string
  next_change:   string
  notes:         string
}

export function emptyWoundCare(): WoundCareContent {
  return {
    site: '', wound_type: '', stage: '', size: '', appearance: [],
    exudate: '', exudate_type: '', periwound: '', dressing_used: '',
    next_change: '', notes: '',
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WOUND_TYPES: { v: WoundType; l: string }[] = [
  { v: 'surgical',   l: 'Surgical' },
  { v: 'traumatic',  l: 'Traumatic' },
  { v: 'pressure',   l: 'Pressure' },
  { v: 'diabetic',   l: 'Diabetic' },
  { v: 'vascular',   l: 'Vascular' },
  { v: 'other',      l: 'Other' },
]

const APPEARANCE_OPTIONS = [
  'Granulating', 'Epithelialising', 'Sloughy', 'Necrotic', 'Infected',
  'Healthy', 'Haemorrhagic', 'Fibrinous',
]

const APPEARANCE_COLORS: Record<string, string> = {
  Granulating:    'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400',
  Epithelialising:'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-400',
  Sloughy:        'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400',
  Necrotic:       'border-stone-400 bg-stone-100 text-stone-700 dark:bg-stone-800/40 dark:border-stone-600 dark:text-stone-300',
  Infected:       'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400',
  Healthy:        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400',
  Haemorrhagic:   'border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400',
  Fibrinous:      'border-yellow-300 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-400',
}

const EXUDATE_LEVELS: { v: WoundExudate; l: string }[] = [
  { v: 'none',     l: 'None' },
  { v: 'low',      l: 'Low' },
  { v: 'moderate', l: 'Moderate' },
  { v: 'heavy',    l: 'Heavy' },
]

const EXUDATE_TYPES: { v: ExudateType; l: string }[] = [
  { v: 'serous',        l: 'Serous' },
  { v: 'sanguineous',   l: 'Sanguineous' },
  { v: 'purulent',      l: 'Purulent' },
  { v: 'mixed',         l: 'Mixed' },
]

// ─── View ─────────────────────────────────────────────────────────────────────

export function WoundCareView({ block }: { block: Block }) {
  const c = block.content as Partial<WoundCareContent>

  if (!c.site?.trim() && !c.wound_type) {
    return <p className="text-sm text-muted-foreground italic">No wound care note documented.</p>
  }

  const exudateText = [c.exudate, c.exudate_type].filter(Boolean).join(' — ')

  return (
    <div className="space-y-3 text-sm">
      {/* Header */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {c.site       && <span className="font-semibold">{c.site}</span>}
        {c.wound_type && <span className="px-2 py-0.5 rounded-full border bg-muted text-xs capitalize">{c.wound_type}</span>}
        {c.stage      && <span className="px-2 py-0.5 rounded-full border bg-muted text-xs">Stage: {c.stage}</span>}
        {c.size       && <span className="px-2 py-0.5 rounded-full border bg-muted text-xs">{c.size} cm</span>}
      </div>

      {/* Appearance pills */}
      {(Array.isArray(c.appearance) ? c.appearance : []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(Array.isArray(c.appearance) ? c.appearance : []).map(a => (
            <span key={a} className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', APPEARANCE_COLORS[a] ?? 'border-border bg-muted')}>
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Details grid */}
      {[
        { label: 'Exudate',      value: exudateText },
        { label: 'Periwound',    value: c.periwound },
        { label: 'Dressing',     value: c.dressing_used },
        { label: 'Next change',  value: c.next_change },
        { label: 'Notes',        value: c.notes },
      ].filter(s => s.value?.trim()).length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: 'Exudate',     value: exudateText },
            { label: 'Periwound',   value: c.periwound },
            { label: 'Dressing',    value: c.dressing_used },
            { label: 'Next change', value: c.next_change },
          ].filter(s => s.value?.trim()).map(s => (
            <div key={s.label} className="text-xs">
              <span className="font-semibold text-muted-foreground">{s.label}: </span>
              <span>{s.value}</span>
            </div>
          ))}
          {c.notes?.trim() && (
            <div className="col-span-2 text-xs">
              <span className="font-semibold text-muted-foreground">Notes: </span>
              <span className="whitespace-pre-wrap">{c.notes}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: WoundCareContent) => Promise<void>
  onCancel: () => void
}

export function WoundCareEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<WoundCareContent>
  const [form, setForm] = useState<WoundCareContent>({
    ...emptyWoundCare(),
    ...ex,
    appearance: Array.isArray(ex.appearance) ? ex.appearance : [],
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof WoundCareContent, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const toggleApp = (a: string) =>
    setForm(f => ({
      ...f,
      appearance: f.appearance.includes(a) ? f.appearance.filter(x => x !== a) : [...f.appearance, a],
    }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Site + type */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Wound site</Label>
          <Input placeholder="e.g. Left lateral malleolus, sacrum" value={form.site} onChange={e => set('site', e.target.value)} />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Wound type</Label>
          <div className="flex flex-wrap gap-1.5">
            {WOUND_TYPES.map(o => (
              <button key={o.v} type="button"
                onClick={() => set('wound_type', form.wound_type === o.v ? '' : o.v)}
                className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
                  form.wound_type === o.v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'
                )}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Stage / classification</Label>
          <Input placeholder="e.g. Stage 2, Grade III" value={form.stage} onChange={e => set('stage', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Size (cm)</Label>
          <Input placeholder="e.g. 3 × 2 × 0.5" value={form.size} onChange={e => set('size', e.target.value)} />
        </div>
      </div>

      <Separator />

      {/* Appearance */}
      <div className="space-y-1.5">
        <Label>Wound bed appearance</Label>
        <div className="flex flex-wrap gap-1.5">
          {APPEARANCE_OPTIONS.map(a => (
            <button key={a} type="button"
              onClick={() => toggleApp(a)}
              className={cn(
                'px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                form.appearance.includes(a) ? (APPEARANCE_COLORS[a] ?? 'border-primary bg-primary/10 text-primary') : 'border-border hover:bg-accent',
              )}
            >{a}</button>
          ))}
        </div>
      </div>

      {/* Exudate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Exudate amount</Label>
          <div className="flex flex-wrap gap-1.5">
            {EXUDATE_LEVELS.map(o => (
              <button key={o.v} type="button"
                onClick={() => set('exudate', form.exudate === o.v ? '' : o.v)}
                className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
                  form.exudate === o.v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'
                )}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Exudate type</Label>
          <div className="flex flex-wrap gap-1.5">
            {EXUDATE_TYPES.map(o => (
              <button key={o.v} type="button"
                onClick={() => set('exudate_type', form.exudate_type === o.v ? '' : o.v)}
                className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
                  form.exudate_type === o.v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'
                )}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      {([
        { key: 'periwound',     label: 'Periwound skin', rows: 1, placeholder: 'e.g. Maceration, erythema, induration, intact…' },
        { key: 'dressing_used', label: 'Dressing used',  rows: 1, placeholder: 'e.g. Aquacel Ag Extra + foam secondary' },
        { key: 'next_change',   label: 'Next dressing change', rows: 1, placeholder: 'e.g. 3 days, or as needed' },
        { key: 'notes',         label: 'Additional notes', rows: 2, placeholder: 'Odour, patient tolerance, referrals…' },
      ] as { key: keyof WoundCareContent; label: string; rows: number; placeholder: string }[]).map(f => (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <Textarea rows={f.rows} placeholder={f.placeholder}
            value={form[f.key] as string}
            onChange={e => set(f.key, e.target.value)}
          />
        </div>
      ))}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save wound care note
        </Button>
      </div>
    </div>
  )
}
