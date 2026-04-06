import { useState } from 'react'
import type { Block, DCNoteContent } from '../../../types'
import { Button, Input, Label, Separator, Textarea } from '../../ui'
import { Loader2, FileText, Plus, X } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Empty
// ============================================================

export function emptyDCNote(): DCNoteContent {
  return {
    diagnoses:        [],
    admission_reason: '',
    hospital_course:  '',
    condition:        '',
    discharge_meds:   [],
    instructions:     '',
    followup:         '',
    pending:          '',
  }
}

// ============================================================
// Helpers
// ============================================================

const CONDITION_OPTS: { v: DCNoteContent['condition']; l: string; cls: string }[] = [
  { v: 'improved',  l: 'Improved',  cls: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' },
  { v: 'stable',    l: 'Stable',    cls: 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' },
  { v: 'critical',  l: 'Critical',  cls: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' },
  { v: 'deceased',  l: 'Deceased',  cls: 'border-slate-400 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' },
]

function conditionBadge(condition: DCNoteContent['condition']) {
  const opt = CONDITION_OPTS.find(o => o.v === condition)
  if (!opt || !condition) return null
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border', opt.cls)}>
      {opt.l}
    </span>
  )
}

// ============================================================
// View
// ============================================================

export function DCNoteView({ block }: { block: Block }) {
  const c = { ...emptyDCNote(), ...(block.content as Partial<DCNoteContent>) }

  const primaries   = c.diagnoses.filter(d => d.primary)
  const secondaries = c.diagnoses.filter(d => !d.primary)
  const activeMeds  = c.discharge_meds.filter(m => m.name.trim())
  const isEmpty     = !primaries.length && !c.admission_reason && !c.hospital_course

  if (isEmpty) {
    return <p className="text-sm text-muted-foreground italic">No discharge note documented.</p>
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Diagnoses + condition */}
      {(c.diagnoses.length > 0 || c.condition) && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Diagnoses</p>
            {conditionBadge(c.condition)}
          </div>
          {primaries.length > 0 && (
            <ol className="space-y-0.5">
              {primaries.map((d, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold text-primary shrink-0">Primary</span>
                  <span className="font-medium">{d.text}</span>
                </li>
              ))}
            </ol>
          )}
          {secondaries.length > 0 && (
            <ol className="space-y-0.5 pl-1">
              {secondaries.map((d, i) => (
                <li key={i} className="flex items-baseline gap-2 text-muted-foreground">
                  <span className="text-[10px] shrink-0">{i + 1}.</span>
                  <span>{d.text}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {c.admission_reason && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Reason for Admission</p>
          <p className="whitespace-pre-wrap">{c.admission_reason}</p>
        </div>
      )}

      {c.hospital_course && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Hospital Course</p>
          <p className="whitespace-pre-wrap text-foreground/90">{c.hospital_course}</p>
        </div>
      )}

      {activeMeds.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Discharge Medications</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left font-semibold text-muted-foreground pb-0.5 pr-3">Medication</th>
                <th className="text-left font-semibold text-muted-foreground pb-0.5 pr-2">Dose</th>
                <th className="text-left font-semibold text-muted-foreground pb-0.5 pr-2">Route</th>
                <th className="text-left font-semibold text-muted-foreground pb-0.5">Frequency</th>
              </tr>
            </thead>
            <tbody>
              {activeMeds.map((m, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  <td className="py-0.5 pr-3 font-medium">{m.name}</td>
                  <td className="py-0.5 pr-2 text-muted-foreground">{m.dose}</td>
                  <td className="py-0.5 pr-2 text-muted-foreground">{m.route}</td>
                  <td className="py-0.5 text-muted-foreground">{m.freq}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.instructions && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Instructions</p>
          <p className="whitespace-pre-wrap text-foreground/90">{c.instructions}</p>
        </div>
      )}

      {c.followup && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Follow-up</p>
          <p className="whitespace-pre-wrap">{c.followup}</p>
        </div>
      )}

      {c.pending && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Pending Results</p>
          <p className="whitespace-pre-wrap text-amber-700 dark:text-amber-300">{c.pending}</p>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

interface EditProps {
  block:    Block
  onSave:   (c: DCNoteContent) => Promise<void>
  onCancel: () => void
}

function DiagnosisRow({
  diag,
  onChange,
  onRemove,
}: {
  diag: { text: string; primary: boolean }
  onChange: (d: { text: string; primary: boolean }) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange({ ...diag, primary: !diag.primary })}
        className={cn(
          'shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-semibold transition-colors',
          diag.primary
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/50',
        )}
      >
        {diag.primary ? '1°' : '2°'}
      </button>
      <Input
        value={diag.text}
        onChange={e => onChange({ ...diag, text: e.target.value })}
        placeholder="Diagnosis…"
        className="h-7 text-sm flex-1"
      />
      <Button variant="ghost" size="icon" type="button" onClick={onRemove}
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

function DischargeMedRow({
  med,
  onChange,
  onRemove,
}: {
  med: { name: string; dose: string; route: string; freq: string; notes: string }
  onChange: (m: typeof med) => void
  onRemove: () => void
}) {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-1.5 items-center">
      <Input placeholder="Medication" value={med.name}
        onChange={e => onChange({ ...med, name: e.target.value })}
        className="h-7 text-xs" />
      <Input placeholder="Dose" value={med.dose}
        onChange={e => onChange({ ...med, dose: e.target.value })}
        className="h-7 text-xs" />
      <Input placeholder="Route" value={med.route}
        onChange={e => onChange({ ...med, route: e.target.value })}
        className="h-7 text-xs" />
      <Input placeholder="Frequency" value={med.freq}
        onChange={e => onChange({ ...med, freq: e.target.value })}
        className="h-7 text-xs" />
      <Button variant="ghost" size="icon" type="button" onClick={onRemove}
        className="h-7 w-7 text-muted-foreground hover:text-destructive">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

export function DCNoteEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<DCNoteContent>
  const [form, setForm] = useState<DCNoteContent>({ ...emptyDCNote(), ...ex })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof DCNoteContent>(k: K, v: DCNoteContent[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const addDiagnosis = (primary = false) =>
    setForm(f => ({ ...f, diagnoses: [...f.diagnoses, { text: '', primary }] }))

  const updateDiag = (i: number, d: { text: string; primary: boolean }) =>
    setForm(f => { const a = [...f.diagnoses]; a[i] = d; return { ...f, diagnoses: a } })

  const removeDiag = (i: number) =>
    setForm(f => ({ ...f, diagnoses: f.diagnoses.filter((_, j) => j !== i) }))

  const addMed = () =>
    setForm(f => ({ ...f, discharge_meds: [...f.discharge_meds, { name: '', dose: '', route: '', freq: '', notes: '' }] }))

  const updateMed = (i: number, m: DCNoteContent['discharge_meds'][number]) =>
    setForm(f => { const a = [...f.discharge_meds]; a[i] = m; return { ...f, discharge_meds: a } })

  const removeMed = (i: number) =>
    setForm(f => ({ ...f, discharge_meds: f.discharge_meds.filter((_, j) => j !== i) }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">

      {/* Diagnoses */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Diagnoses</Label>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" type="button" onClick={() => addDiagnosis(true)}
              className="h-6 text-xs gap-1 px-2">
              <Plus className="h-3 w-3" /> Primary
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={() => addDiagnosis(false)}
              className="h-6 text-xs gap-1 px-2">
              <Plus className="h-3 w-3" /> Secondary
            </Button>
          </div>
        </div>
        {form.diagnoses.length > 0 ? (
          <div className="space-y-1.5">
            {form.diagnoses.map((d, i) => (
              <DiagnosisRow key={i} diag={d}
                onChange={nd => updateDiag(i, nd)}
                onRemove={() => removeDiag(i)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic text-center py-2 border border-dashed rounded">
            No diagnoses added — click Primary or Secondary above.
          </p>
        )}
      </div>

      {/* Condition at discharge */}
      <div className="space-y-1">
        <Label className="text-xs">Condition at discharge</Label>
        <div className="flex gap-1.5 flex-wrap">
          {CONDITION_OPTS.map(o => (
            <button
              key={o.v}
              type="button"
              onClick={() => set('condition', form.condition === o.v ? '' : o.v)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors',
                form.condition === o.v ? o.cls : 'border-border hover:bg-accent text-muted-foreground',
              )}
            >{o.l}</button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Admission + course */}
      <div className="space-y-1">
        <Label className="text-xs">Reason for admission</Label>
        <Textarea rows={2} placeholder="Chief complaint and reason for hospitalisation…"
          value={form.admission_reason}
          onChange={e => set('admission_reason', e.target.value)}
          className="resize-none text-sm" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Hospital course</Label>
        <Textarea rows={4} placeholder="Key events, investigations, procedures, treatments, and response…"
          value={form.hospital_course}
          onChange={e => set('hospital_course', e.target.value)}
          className="resize-none text-sm" />
      </div>

      <Separator />

      {/* Discharge medications */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Discharge medications</Label>
          <Button variant="ghost" size="sm" type="button" onClick={addMed}
            className="h-6 text-xs gap-1 px-2">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        {form.discharge_meds.length > 0 && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-1.5 px-0.5">
              {['Medication','Dose','Route','Frequency',''].map((h, i) => (
                <p key={i} className="text-[10px] font-semibold text-muted-foreground">{h}</p>
              ))}
            </div>
            {form.discharge_meds.map((m, i) => (
              <DischargeMedRow key={i} med={m}
                onChange={nm => updateMed(i, nm)}
                onRemove={() => removeMed(i)} />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Instructions + follow-up + pending */}
      <div className="space-y-1">
        <Label className="text-xs">Patient instructions</Label>
        <Textarea rows={2} placeholder="Activity, diet, wound care, warning signs to watch for…"
          value={form.instructions}
          onChange={e => set('instructions', e.target.value)}
          className="resize-none text-sm" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Follow-up plan</Label>
        <Textarea rows={2} placeholder="Clinic appointments, GP review, specialist follow-up…"
          value={form.followup}
          onChange={e => set('followup', e.target.value)}
          className="resize-none text-sm" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Pending results / outstanding tasks</Label>
        <Textarea rows={2} placeholder="Awaiting cultures, biopsy, specialist opinion…"
          value={form.pending}
          onChange={e => set('pending', e.target.value)}
          className="resize-none text-sm" />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <FileText className="h-3.5 w-3.5" />
          Save D/C note
        </Button>
      </div>
    </div>
  )
}
