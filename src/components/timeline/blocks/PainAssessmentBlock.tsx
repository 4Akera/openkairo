import { useState } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Input, Textarea, Separator } from '../../ui'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PainAssessmentContent {
  score:              number | null
  reassessment_score: number | null
  reassessment_time:  string
  location:           string
  character:          string[]
  radiation:          string
  onset:              string
  duration:           string
  aggravating:        string
  relieving:          string
  functional_impact:  string
  intervention:       string
}

export function emptyPainAssessment(): PainAssessmentContent {
  return {
    score: null, reassessment_score: null, reassessment_time: '',
    location: '', character: [], radiation: '', onset: '', duration: '',
    aggravating: '', relieving: '', functional_impact: '', intervention: '',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHARACTER_OPTIONS = [
  'Sharp', 'Dull', 'Burning', 'Stabbing', 'Throbbing',
  'Cramping', 'Aching', 'Shooting', 'Pressure', 'Tingling',
]

function scoreColor(score: number | null): string {
  if (score == null) return 'text-muted-foreground'
  if (score <= 3)    return 'text-emerald-600 dark:text-emerald-400'
  if (score <= 6)    return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function scoreBg(score: number | null): string {
  if (score == null) return 'bg-muted border-border'
  if (score <= 3)    return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
  if (score <= 6)    return 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
  return 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800'
}

function scoreLabel(score: number | null): string {
  if (score == null) return 'Not assessed'
  if (score === 0)   return 'No pain'
  if (score <= 3)    return 'Mild'
  if (score <= 6)    return 'Moderate'
  if (score <= 9)    return 'Severe'
  return 'Worst possible'
}

/** Demo/legacy JSON often stores character as one string; the editor uses string[]. */
function normalizePainCharacter(character: unknown): string[] {
  if (Array.isArray(character)) {
    return character.filter((x): x is string => typeof x === 'string')
  }
  if (typeof character === 'string' && character.trim()) {
    return [character.trim()]
  }
  return []
}

function painCharacterDisplay(character: unknown): string {
  return normalizePainCharacter(character).join(', ')
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function PainAssessmentView({ block }: { block: Block }) {
  const c = block.content as Partial<PainAssessmentContent>

  if (c.score == null && !c.location?.trim()) {
    return <p className="text-sm text-muted-foreground italic">No pain assessment documented.</p>
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Score badges */}
      <div className="flex items-stretch gap-2 flex-wrap">
        <div className={cn('rounded-lg border px-4 py-2 flex items-center gap-3', scoreBg(c.score ?? null))}>
          <p className={cn('text-3xl font-bold tabular-nums', scoreColor(c.score ?? null))}>
            {c.score ?? '—'}
          </p>
          <div>
            <p className="text-xs font-medium">/10</p>
            <p className={cn('text-xs font-semibold', scoreColor(c.score ?? null))}>{scoreLabel(c.score ?? null)}</p>
          </div>
        </div>

        {c.reassessment_score != null && (
          <div className={cn('rounded-lg border px-3 py-2 flex items-center gap-2', scoreBg(c.reassessment_score))}>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">Re-assessment</p>
              <p className={cn('text-2xl font-bold tabular-nums', scoreColor(c.reassessment_score))}>{c.reassessment_score}</p>
            </div>
            {c.reassessment_time && <p className="text-xs text-muted-foreground">{c.reassessment_time}</p>}
          </div>
        )}
      </div>

      {/* Details */}
      {[
        { label: 'Location',          value: c.location },
        { label: 'Character',         value: painCharacterDisplay(c.character) },
        { label: 'Radiation',         value: c.radiation },
        { label: 'Onset',             value: c.onset },
        { label: 'Duration',          value: c.duration },
        { label: 'Aggravating',       value: c.aggravating },
        { label: 'Relieving',         value: c.relieving },
        { label: 'Functional impact', value: c.functional_impact },
        { label: 'Intervention',      value: c.intervention },
      ].filter(s => s.value?.trim()).length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: 'Location',          value: c.location },
            { label: 'Character',         value: painCharacterDisplay(c.character) },
            { label: 'Radiation',         value: c.radiation },
            { label: 'Onset',             value: c.onset },
            { label: 'Duration',          value: c.duration },
            { label: 'Aggravating',       value: c.aggravating },
            { label: 'Relieving',         value: c.relieving },
            { label: 'Functional impact', value: c.functional_impact },
            { label: 'Intervention',      value: c.intervention },
          ].filter(s => s.value?.trim()).map(s => (
            <div key={s.label} className="text-xs">
              <span className="font-semibold text-muted-foreground">{s.label}: </span>
              <span>{s.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Score picker row ─────────────────────────────────────────────────────────

function ScorePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: 11 }, (_, i) => i).map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            'h-9 w-9 rounded-md border text-sm font-bold transition-colors',
            value === n ? cn(scoreBg(n), scoreColor(n), 'border-current font-bold') : 'border-border hover:bg-accent',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: PainAssessmentContent) => Promise<void>
  onCancel: () => void
}

export function PainAssessmentEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<PainAssessmentContent>
  const [form, setForm] = useState<PainAssessmentContent>(() => ({
    ...emptyPainAssessment(),
    ...ex,
    character: normalizePainCharacter(ex.character),
  }))
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof PainAssessmentContent>(k: K, v: PainAssessmentContent[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const toggleChar = (c: string) =>
    setForm(f => ({
      ...f,
      character: f.character.includes(c) ? f.character.filter(x => x !== c) : [...f.character, c],
    }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Initial score */}
      <div className="space-y-1.5">
        <Label>Pain score (0 = no pain, 10 = worst possible)</Label>
        <ScorePicker value={form.score} onChange={v => set('score', v)} />
        {form.score != null && (
          <p className={cn('text-xs font-medium', scoreColor(form.score))}>
            {form.score}/10 — {scoreLabel(form.score)}
          </p>
        )}
      </div>

      <Separator />

      {/* Pain characteristics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1.5">
          <Label>Location</Label>
          <Input placeholder="e.g. Left lower quadrant, radiates to back" value={form.location} onChange={e => set('location', e.target.value)} />
        </div>

        <div className="col-span-2 space-y-1.5">
          <Label>Character</Label>
          <div className="flex flex-wrap gap-1.5">
            {CHARACTER_OPTIONS.map(c => (
              <button key={c} type="button"
                onClick={() => toggleChar(c)}
                className={cn(
                  'px-2.5 py-1 rounded-full border text-xs transition-colors',
                  form.character.includes(c) ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent',
                )}
              >{c}</button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Radiation</Label>
          <Input placeholder="e.g. Down left leg" value={form.radiation} onChange={e => set('radiation', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Onset</Label>
          <Input placeholder="e.g. Sudden, 2 hours ago" value={form.onset} onChange={e => set('onset', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Duration</Label>
          <Input placeholder="e.g. Constant, intermittent" value={form.duration} onChange={e => set('duration', e.target.value)} />
        </div>
      </div>

      {([
        { key: 'aggravating', label: 'Aggravating factors', placeholder: 'e.g. Movement, eating, deep inspiration…' },
        { key: 'relieving',   label: 'Relieving factors',   placeholder: 'e.g. Rest, analgesia, heat…' },
        { key: 'functional_impact', label: 'Functional impact', placeholder: 'e.g. Unable to mobilise, disturbing sleep…' },
        { key: 'intervention', label: 'Intervention given', placeholder: 'e.g. Paracetamol 1g IV, repositioned…' },
      ] as { key: keyof PainAssessmentContent; label: string; placeholder: string }[]).map(f => (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <Textarea rows={1} placeholder={f.placeholder}
            value={form[f.key] as string}
            onChange={e => set(f.key, e.target.value as never)}
          />
        </div>
      ))}

      <Separator />

      {/* Re-assessment */}
      <div className="space-y-2">
        <Label>Re-assessment score</Label>
        <ScorePicker value={form.reassessment_score} onChange={v => set('reassessment_score', v)} />
        {form.reassessment_score != null && (
          <div className="flex items-center gap-2">
            <Input
              className="h-8 w-40 text-sm"
              placeholder="Time of re-assessment"
              value={form.reassessment_time}
              onChange={e => set('reassessment_time', e.target.value)}
            />
            <p className={cn('text-xs font-medium', scoreColor(form.reassessment_score))}>
              {form.reassessment_score}/10 — {scoreLabel(form.reassessment_score)}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save pain assessment
        </Button>
      </div>
    </div>
  )
}
