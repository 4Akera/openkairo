import { useState } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Input, Textarea, Separator } from '../../ui'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcedureNoteContent {
  procedure_name:  string
  indication:      string
  operator:        string
  assistant:       string
  consent:         'verbal' | 'written' | 'implied' | ''
  site:            string
  laterality:      'left' | 'right' | 'bilateral' | 'na' | ''
  technique:       string
  findings:        string
  specimens:       string
  complications:   string
  condition_after: string
}

export function emptyProcedureNote(): ProcedureNoteContent {
  return {
    procedure_name: '', indication: '', operator: '', assistant: '',
    consent: '', site: '', laterality: '', technique: '',
    findings: '', specimens: '', complications: '', condition_after: '',
  }
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function ProcedureNoteView({ block }: { block: Block }) {
  const c = block.content as Partial<ProcedureNoteContent>

  if (!c.procedure_name?.trim()) {
    return <p className="text-sm text-muted-foreground italic">No procedure note documented.</p>
  }

  const meta = [
    c.operator      && `Operator: ${c.operator}`,
    c.assistant     && `Assistant: ${c.assistant}`,
    c.consent       && `Consent: ${c.consent}`,
    c.laterality && c.laterality !== 'na' && `Side: ${c.laterality}`,
  ].filter(Boolean)

  const proseSections = [
    { label: 'Indication',         value: c.indication },
    { label: 'Site',               value: c.site },
    { label: 'Technique',          value: c.technique },
    { label: 'Findings',           value: c.findings },
    { label: 'Specimens sent',     value: c.specimens },
    { label: 'Complications',      value: c.complications },
    { label: 'Condition after',    value: c.condition_after },
  ].filter(s => s.value?.trim())

  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-semibold text-base">{c.procedure_name}</p>
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">{meta.join(' · ')}</p>
        )}
      </div>

      {proseSections.length > 0 && <Separator />}

      <div className="grid grid-cols-1 gap-3">
        {proseSections.map(s => (
          <div key={s.label}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{s.label}</p>
            <p className="whitespace-pre-wrap leading-relaxed">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: ProcedureNoteContent) => Promise<void>
  onCancel: () => void
}

const CONSENT_OPTS  = [{ v: 'written', l: 'Written' }, { v: 'verbal', l: 'Verbal' }, { v: 'implied', l: 'Implied' }]
const LATERAL_OPTS  = [{ v: 'left', l: 'Left' }, { v: 'right', l: 'Right' }, { v: 'bilateral', l: 'Bilateral' }, { v: 'na', l: 'N/A' }]

export function ProcedureNoteEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<ProcedureNoteContent>
  const [form, setForm] = useState<ProcedureNoteContent>({ ...emptyProcedureNote(), ...ex })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof ProcedureNoteContent, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Header fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Procedure name *</Label>
          <Input placeholder="e.g. Central venous line insertion" value={form.procedure_name} onChange={e => set('procedure_name', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Operator</Label>
          <Input placeholder="Name / grade" value={form.operator} onChange={e => set('operator', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Assistant</Label>
          <Input placeholder="Name / grade" value={form.assistant} onChange={e => set('assistant', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Consent</Label>
          <div className="flex gap-1.5 flex-wrap">
            {CONSENT_OPTS.map(o => (
              <button key={o.v} type="button"
                onClick={() => set('consent', form.consent === o.v ? '' : o.v)}
                className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
                  form.consent === o.v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'
                )}>{o.l}</button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Laterality</Label>
          <div className="flex gap-1.5 flex-wrap">
            {LATERAL_OPTS.map(o => (
              <button key={o.v} type="button"
                onClick={() => set('laterality', form.laterality === o.v ? '' : o.v)}
                className={cn('px-2.5 py-1 rounded-md border text-xs transition-colors',
                  form.laterality === o.v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-accent'
                )}>{o.l}</button>
            ))}
          </div>
        </div>
      </div>

      <Separator />

      {/* Prose sections */}
      {([
        { key: 'indication',      label: 'Indication', rows: 2, placeholder: 'Clinical indication for procedure…' },
        { key: 'site',            label: 'Site / approach', rows: 1, placeholder: 'e.g. Right internal jugular vein, anterior approach' },
        { key: 'technique',       label: 'Technique', rows: 4, placeholder: 'Step-by-step description of procedure…' },
        { key: 'findings',        label: 'Findings', rows: 2, placeholder: 'Intraoperative / procedural findings…' },
        { key: 'specimens',       label: 'Specimens sent', rows: 1, placeholder: 'e.g. Tissue for histology, MC&S…' },
        { key: 'complications',   label: 'Complications', rows: 2, placeholder: 'None / describe…' },
        { key: 'condition_after', label: 'Condition after procedure', rows: 2, placeholder: 'Patient\'s condition and observations post-procedure…' },
      ] as { key: keyof ProcedureNoteContent; label: string; rows: number; placeholder: string }[]).map(f => (
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
        <Button size="sm" type="button" disabled={saving || !form.procedure_name.trim()} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save procedure note
        </Button>
      </div>
    </div>
  )
}
