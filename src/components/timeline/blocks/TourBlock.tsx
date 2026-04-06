import { useState } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Textarea, Separator } from '../../ui'
import { Loader2, Plus, Trash2, CheckSquare, Square } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TourTask {
  id:   string
  text: string
  done: boolean
}

export interface TourContent {
  subjective: string
  objective:  string
  assessment: string
  plan:       string
  tasks:      TourTask[]
}

export function emptyTour(): TourContent {
  return { subjective: '', objective: '', assessment: '', plan: '', tasks: [] }
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function TourView({ block }: { block: Block }) {
  const c = block.content as Partial<TourContent>
  const tasks = c.tasks ?? []
  const sections = [
    { label: 'Subjective',  value: c.subjective },
    { label: 'Objective',   value: c.objective },
    { label: 'Assessment',  value: c.assessment },
    { label: 'Plan',        value: c.plan },
  ].filter(s => s.value?.trim())

  if (sections.length === 0 && tasks.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No ward round note documented.</p>
  }

  const done    = tasks.filter(t => t.done).length
  const pending = tasks.filter(t => !t.done).length

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 gap-3">
        {sections.map(s => (
          <div key={s.label}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{s.label}</p>
            <p className="whitespace-pre-wrap leading-relaxed">{s.value}</p>
          </div>
        ))}
      </div>

      {tasks.length > 0 && (
        <>
          {sections.length > 0 && <Separator />}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
              Tasks
              <span className="ml-1.5 font-normal normal-case">
                {done > 0 && <span className="text-emerald-600">{done} done</span>}
                {done > 0 && pending > 0 && ' · '}
                {pending > 0 && <span className="text-amber-600">{pending} pending</span>}
              </span>
            </p>
            <ul className="space-y-1">
              {tasks.map(t => (
                <li key={t.id} className={cn('flex items-start gap-2 text-xs', t.done && 'text-muted-foreground line-through')}>
                  {t.done
                    ? <CheckSquare className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    : <Square className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />}
                  {t.text}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: TourContent) => Promise<void>
  onCancel: () => void
}

const SOAP_FIELDS: { key: keyof TourContent; label: string; placeholder: string }[] = [
  { key: 'subjective',  label: 'S — Subjective',  placeholder: 'Patient complaints, overnight events, pain score, appetite…' },
  { key: 'objective',   label: 'O — Objective',   placeholder: 'Examination findings, current observations, trending vitals…' },
  { key: 'assessment',  label: 'A — Assessment',  placeholder: 'Clinical impression, progress, changes…' },
  { key: 'plan',        label: 'P — Plan',        placeholder: 'Today\'s management, medication changes, pending results, goals…' },
]

export function TourEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<TourContent>
  const [form, setForm] = useState<TourContent>({
    subjective: existing.subjective ?? '',
    objective:  existing.objective  ?? '',
    assessment: existing.assessment ?? '',
    plan:       existing.plan       ?? '',
    tasks:      existing.tasks      ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [newTask, setNewTask] = useState('')

  const setField = (k: keyof TourContent, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const addTask = () => {
    if (!newTask.trim()) return
    setForm(f => ({
      ...f,
      tasks: [...f.tasks, { id: crypto.randomUUID(), text: newTask.trim(), done: false }],
    }))
    setNewTask('')
  }

  const toggleTask = (id: string) =>
    setForm(f => ({ ...f, tasks: f.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }))

  const removeTask = (id: string) =>
    setForm(f => ({ ...f, tasks: f.tasks.filter(t => t.id !== id) }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {SOAP_FIELDS.map(f => (
        <div key={f.key} className="space-y-1.5">
          <Label className="font-semibold text-xs">{f.label}</Label>
          <Textarea
            rows={2}
            placeholder={f.placeholder}
            value={form[f.key] as string}
            onChange={e => setField(f.key, e.target.value)}
          />
        </div>
      ))}

      <Separator />

      {/* Task list */}
      <div className="space-y-2">
        <Label>Tasks / Action items</Label>
        {form.tasks.length > 0 && (
          <ul className="space-y-1 mb-2">
            {form.tasks.map(t => (
              <li key={t.id} className="flex items-center gap-2 group">
                <button type="button" onClick={() => toggleTask(t.id)} className="shrink-0">
                  {t.done
                    ? <CheckSquare className="h-4 w-4 text-emerald-500" />
                    : <Square className="h-4 w-4 text-muted-foreground hover:text-primary" />}
                </button>
                <span className={cn('flex-1 text-sm', t.done && 'line-through text-muted-foreground')}>{t.text}</span>
                <button
                  type="button"
                  onClick={() => removeTask(t.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            className="flex-1 h-8 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Add task…"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTask())}
          />
          <Button type="button" variant="outline" size="sm" onClick={addTask}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save ward round note
        </Button>
      </div>
    </div>
  )
}
