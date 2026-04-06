import { useState } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Input, Textarea, Separator } from '../../ui'
import { Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnaestheticType = 'GA' | 'spinal' | 'epidural' | 'regional' | 'sedation' | 'local' | ''
export type AsaGrade        = '' | '1' | '2' | '3' | '4' | '5' | '5E'
export type AirwayGrade     = '' | 'easy' | 'difficult' | 'failed'

export interface AnaestheticContent {
  type:            AnaestheticType
  asa_grade:       AsaGrade
  airway:          AirwayGrade
  intubation:      string
  induction:       string
  maintenance:     string
  reversal:        string
  fluids:          string
  blood_loss_ml:   string
  urine_output_ml: string
  duration_min:    string
  complications:   string
  recovery_notes:  string
}

export function emptyAnaesthetic(): AnaestheticContent {
  return {
    type: '', asa_grade: '', airway: '', intubation: '',
    induction: '', maintenance: '', reversal: '', fluids: '',
    blood_loss_ml: '', urine_output_ml: '', duration_min: '',
    complications: '', recovery_notes: '',
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_OPTS: { v: AnaestheticType; l: string }[] = [
  { v: 'GA',       l: 'General' },
  { v: 'spinal',   l: 'Spinal' },
  { v: 'epidural', l: 'Epidural' },
  { v: 'regional', l: 'Regional' },
  { v: 'sedation', l: 'Sedation' },
  { v: 'local',    l: 'Local' },
]

const ASA_OPTS: { v: AsaGrade; l: string }[] = [
  { v: '1',  l: 'ASA I' },
  { v: '2',  l: 'ASA II' },
  { v: '3',  l: 'ASA III' },
  { v: '4',  l: 'ASA IV' },
  { v: '5',  l: 'ASA V' },
  { v: '5E', l: 'ASA V Emergency' },
]

const AIRWAY_OPTS: { v: AirwayGrade; l: string; cls: string }[] = [
  { v: 'easy',      l: 'Easy',    cls: 'text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400' },
  { v: 'difficult', l: 'Difficult', cls: 'text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400' },
  { v: 'failed',    l: 'Failed',  cls: 'text-rose-700 border-rose-300 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400' },
]

// ─── View ─────────────────────────────────────────────────────────────────────

export function AnaestheticNoteView({ block }: { block: Block }) {
  const c = block.content as Partial<AnaestheticContent>

  if (!c.type && !c.induction?.trim()) {
    return <p className="text-sm text-muted-foreground italic">No anaesthetic note documented.</p>
  }

  const airwayOpt = AIRWAY_OPTS.find(a => a.v === c.airway)

  return (
    <div className="space-y-3 text-sm">
      {/* Header badges */}
      <div className="flex flex-wrap gap-1.5">
        {c.type      && <span className="px-2 py-0.5 rounded-full border bg-muted text-xs font-medium capitalize">{c.type === 'GA' ? 'General Anaesthesia' : c.type}</span>}
        {c.asa_grade && <span className="px-2 py-0.5 rounded-full border bg-muted text-xs">ASA {c.asa_grade}</span>}
        {airwayOpt   && <span className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', airwayOpt.cls)}>{airwayOpt.l} airway</span>}
        {c.duration_min && <span className="px-2 py-0.5 rounded-full border bg-muted text-xs">{c.duration_min} min</span>}
      </div>

      {/* Numeric summary */}
      {(c.blood_loss_ml || c.urine_output_ml || c.fluids) && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {c.fluids          && <span><span className="font-medium text-foreground">Fluids:</span> {c.fluids}</span>}
          {c.blood_loss_ml   && <span><span className="font-medium text-foreground">EBL:</span> {c.blood_loss_ml} mL</span>}
          {c.urine_output_ml && <span><span className="font-medium text-foreground">UO:</span> {c.urine_output_ml} mL</span>}
        </div>
      )}

      {/* Prose */}
      {[
        { label: 'Intubation / airway device', value: c.intubation },
        { label: 'Induction agents',           value: c.induction },
        { label: 'Maintenance',                value: c.maintenance },
        { label: 'Reversal',                   value: c.reversal },
        { label: 'Complications',              value: c.complications },
        { label: 'Recovery notes',             value: c.recovery_notes },
      ].filter(s => s.value?.trim()).map(s => (
        <div key={s.label}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{s.label}</p>
          <p className="whitespace-pre-wrap leading-relaxed">{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: AnaestheticContent) => Promise<void>
  onCancel: () => void
}

function OptPills<T extends string>({
  opts, value, onChange, label
}: {
  opts: { v: T; l: string; cls?: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1.5 flex-wrap">
        {opts.map(o => (
          <button key={o.v} type="button"
            onClick={() => onChange(value === o.v ? '' as T : o.v)}
            className={cn(
              'px-2.5 py-1 rounded-md border text-xs transition-colors',
              value === o.v && o.cls ? o.cls :
              value === o.v ? 'border-primary bg-primary/10 text-primary font-medium' :
              'border-border hover:bg-accent'
            )}
          >{o.l}</button>
        ))}
      </div>
    </div>
  )
}

export function AnaestheticNoteEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<AnaestheticContent>
  const [form, setForm] = useState<AnaestheticContent>({ ...emptyAnaesthetic(), ...ex })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof AnaestheticContent, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        <OptPills label="Anaesthetic type"  opts={TYPE_OPTS}   value={form.type}      onChange={v => set('type', v)} />
        <OptPills label="ASA physical status" opts={ASA_OPTS} value={form.asa_grade}  onChange={v => set('asa_grade', v)} />
        <OptPills label="Airway"            opts={AIRWAY_OPTS} value={form.airway}     onChange={v => set('airway', v)} />
      </div>

      <Separator />

      {/* Prose */}
      {([
        { key: 'intubation',  label: 'Intubation / airway device', rows: 1, placeholder: 'e.g. ETT 7.5 cuffed, Grade I view, easy laryngoscopy' },
        { key: 'induction',   label: 'Induction agents & doses',   rows: 2, placeholder: 'e.g. Propofol 150 mg, Fentanyl 100 mcg, Rocuronium 50 mg' },
        { key: 'maintenance', label: 'Maintenance',                rows: 2, placeholder: 'e.g. Sevoflurane 2% in O2/air, TIVA Propofol 5 mg/kg/h' },
        { key: 'reversal',    label: 'Reversal / extubation',      rows: 1, placeholder: 'e.g. Neostigmine 2.5 mg + Atropine 1.2 mg, extubated awake' },
        { key: 'fluids',      label: 'IV fluids',                  rows: 1, placeholder: 'e.g. 1000 mL Hartmann\'s solution' },
      ] as { key: keyof AnaestheticContent; label: string; rows: number; placeholder: string }[]).map(f => (
        <div key={f.key} className="space-y-1.5">
          <Label>{f.label}</Label>
          <Textarea rows={f.rows} placeholder={f.placeholder}
            value={form[f.key] as string}
            onChange={e => set(f.key, e.target.value)}
          />
        </div>
      ))}

      {/* Numeric row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">EBL (mL)</Label>
          <Input type="number" min={0} placeholder="0" value={form.blood_loss_ml} onChange={e => set('blood_loss_ml', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Urine output (mL)</Label>
          <Input type="number" min={0} placeholder="0" value={form.urine_output_ml} onChange={e => set('urine_output_ml', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Duration (min)</Label>
          <Input type="number" min={0} placeholder="0" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} />
        </div>
      </div>

      {([
        { key: 'complications',   label: 'Complications',   rows: 2, placeholder: 'None / describe…' },
        { key: 'recovery_notes',  label: 'Recovery notes',  rows: 2, placeholder: 'PACU observations, analgesia plan, discharge criteria…' },
      ] as { key: keyof AnaestheticContent; label: string; rows: number; placeholder: string }[]).map(f => (
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
          Save anaesthetic note
        </Button>
      </div>
    </div>
  )
}
