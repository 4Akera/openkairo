import { useState, useCallback, useMemo } from 'react'
import type { Block, RadiologyRequestContent } from '../../../types'
import { Button, Input, Label, Textarea } from '../../ui'
import { Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  RADIOLOGY_STUDY_MAP,
  RADIOLOGY_MODALITY_OPTS,
  RADIOLOGY_OTHER_MODALITY_KEY,
  radiologyStudiesForModality,
  formatRadiologyCustomLabel,
} from './radiologyShared'

export function emptyRadiologyRequest(): RadiologyRequestContent {
  return {
    studies:            [],
    custom:             [],
    indication:         '',
    contrast_note:      '',
    notes_clinical:     '',
    notes_coordination: '',
  }
}

export function RadiologyRequestView({ block }: { block: Block }) {
  const c = { ...emptyRadiologyRequest(), ...(block.content as Partial<RadiologyRequestContent>) }
  const labels = c.studies.map(id => RADIOLOGY_STUDY_MAP[id]?.label ?? id)
  const customLabels = c.custom.map(formatRadiologyCustomLabel).filter(Boolean)
  const hasStudies = labels.length > 0 || customLabels.length > 0
  const hasMeta =
    !!c.indication?.trim() ||
    !!c.contrast_note?.trim() ||
    !!c.notes_clinical?.trim() ||
    !!c.notes_coordination?.trim()

  if (!hasStudies && !hasMeta) {
    return <p className="text-sm text-muted-foreground italic">No imaging studies selected.</p>
  }

  return (
    <div className="space-y-2 text-sm">
      {c.indication && (
        <p className="text-xs text-muted-foreground italic">{c.indication}</p>
      )}
      {c.contrast_note?.trim() && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground/80">Contrast / allergy: </span>
          {c.contrast_note}
        </p>
      )}
      {(c.notes_clinical?.trim() || c.notes_coordination?.trim()) && (
        <div className="rounded-md border border-border/80 bg-muted/20 px-2.5 py-2 space-y-1.5 text-[11px]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Additional notes</p>
          {c.notes_clinical?.trim() && (
            <div>
              <span className="font-medium text-foreground/80">Clinical context: </span>
              <span className="text-muted-foreground whitespace-pre-wrap">{c.notes_clinical.trim()}</span>
            </div>
          )}
          {c.notes_coordination?.trim() && (
            <div>
              <span className="font-medium text-foreground/80">Coordination: </span>
              <span className="text-muted-foreground whitespace-pre-wrap">{c.notes_coordination.trim()}</span>
            </div>
          )}
        </div>
      )}
      {hasStudies && (
        <div className="flex flex-wrap gap-1">
          {labels.map((l, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground"
            >
              {l}
            </span>
          ))}
          {customLabels.map((l, i) => (
            <span
              key={`c-${i}`}
              className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground"
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

interface EditProps {
  block:    Block
  onSave:   (c: RadiologyRequestContent) => Promise<void>
  onCancel: () => void
}

function StudyChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

export function RadiologyRequestEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<RadiologyRequestContent>
  const [form, setForm] = useState<RadiologyRequestContent>(() => {
    const merged = { ...emptyRadiologyRequest(), ...ex }
    return {
      studies:            merged.studies ?? [],
      indication:         merged.indication ?? '',
      contrast_note:      merged.contrast_note ?? '',
      notes_clinical:     merged.notes_clinical ?? '',
      notes_coordination: merged.notes_coordination ?? '',
      custom:             (merged.custom ?? []).map(row =>
        typeof row === 'object' && row && 'name' in row
          ? { name: String(row.name), modality: 'modality' in row && row.modality != null ? String(row.modality) : undefined }
          : { name: '' },
      ),
    }
  })
  const [saving, setSaving] = useState(false)
  const [selectedModality, setSelectedModality] = useState<string>(
    RADIOLOGY_MODALITY_OPTS[0]?.key ?? 'XR',
  )
  const [otherStudyName, setOtherStudyName] = useState('')
  const [otherModalityLabel, setOtherModalityLabel] = useState('')
  const [otherModalityStudyName, setOtherModalityStudyName] = useState('')
  const [notesOpen, setNotesOpen] = useState(() => {
    const n = ex as Partial<RadiologyRequestContent>
    return !!(n.notes_clinical?.trim() || n.notes_coordination?.trim())
  })

  const studiesInMod = useMemo(
    () => radiologyStudiesForModality(selectedModality),
    [selectedModality],
  )

  const isOtherModality = selectedModality === RADIOLOGY_OTHER_MODALITY_KEY

  const toggleStudy = useCallback((id: string) => {
    setForm(f => {
      const has = f.studies.includes(id)
      return { ...f, studies: has ? f.studies.filter(s => s !== id) : [...f.studies, id] }
    })
  }, [])

  const addCustomUnderModality = () => {
    const name = otherStudyName.trim()
    if (!name || isOtherModality) return
    setForm(f => ({
      ...f,
      custom: [...f.custom, { name, modality: selectedModality }],
    }))
    setOtherStudyName('')
  }

  const addFullyCustomModalityStudy = () => {
    const mod = otherModalityLabel.trim()
    const name = otherModalityStudyName.trim()
    if (!mod || !name) return
    setForm(f => ({
      ...f,
      custom: [...f.custom, { name, modality: mod }],
    }))
    setOtherModalityLabel('')
    setOtherModalityStudyName('')
  }

  const removeCustom = (i: number) =>
    setForm(f => ({ ...f, custom: f.custom.filter((_, j) => j !== i) }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Clinical indication</Label>
          <Input
            placeholder="e.g. Rule out PE, staging, post-op fever…"
            value={form.indication}
            onChange={e => setForm(f => ({ ...f, indication: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Contrast / allergies / pregnancy</Label>
          <Input
            placeholder="e.g. No iodinated contrast — shellfish allergy. Not pregnant."
            value={form.contrast_note}
            onChange={e => setForm(f => ({ ...f, contrast_note: e.target.value }))}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="rounded-md border border-border/80 overflow-hidden">
        <button
          type="button"
          onClick={() => setNotesOpen(o => !o)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/50 transition-colors"
          aria-expanded={notesOpen}
        >
          {notesOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          Additional notes
          {(form.notes_clinical?.trim() || form.notes_coordination?.trim()) && (
            <span className="text-[10px] font-normal text-muted-foreground truncate">— has text</span>
          )}
        </button>
        {notesOpen && (
          <div className="border-t border-border/80 px-3 py-3 space-y-3 bg-muted/10">
            <div className="space-y-1">
              <Label className="text-xs">Clinical context</Label>
              <p className="text-[10px] text-muted-foreground">Comparisons, implants, comorbidities, special clinical context…</p>
              <Textarea
                placeholder="e.g. Compare to CT 2024-01; MRI-conditional pacemaker…"
                value={form.notes_clinical}
                onChange={e => setForm(f => ({ ...f, notes_clinical: e.target.value }))}
                rows={3}
                className="text-sm min-h-0 resize-y"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Coordination / logistics</Label>
              <p className="text-[10px] text-muted-foreground">Ward contact, transport, isolation, callback…</p>
              <Textarea
                placeholder="e.g. Call ward 4B on completion; droplet precautions…"
                value={form.notes_coordination}
                onChange={e => setForm(f => ({ ...f, notes_coordination: e.target.value }))}
                rows={3}
                className="text-sm min-h-0 resize-y"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Modality</Label>
        <div className="flex flex-wrap gap-1.5">
          {RADIOLOGY_MODALITY_OPTS.map(m => (
            <StudyChip
              key={m.key}
              label={m.label}
              active={selectedModality === m.key}
              onClick={() => setSelectedModality(m.key)}
            />
          ))}
          <StudyChip
            label="Other"
            active={isOtherModality}
            onClick={() => setSelectedModality(RADIOLOGY_OTHER_MODALITY_KEY)}
          />
        </div>
      </div>

      {isOtherModality ? (
        <div className="space-y-2 rounded-md border border-border p-3 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            Describe the modality and study when they are not listed above.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Other modality</Label>
              <Input
                placeholder="e.g. Fluoroscopy, PET-MRI…"
                value={otherModalityLabel}
                onChange={e => setOtherModalityLabel(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Study / exam</Label>
              <Input
                placeholder="e.g. Upper GI series…"
                value={otherModalityStudyName}
                onChange={e => setOtherModalityStudyName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-8 text-xs"
            onClick={addFullyCustomModalityStudy}
            disabled={!otherModalityLabel.trim() || !otherModalityStudyName.trim()}
          >
            Add study
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Label className="text-xs">Study</Label>
          <div className="flex flex-wrap gap-1.5">
            {studiesInMod.map(s => (
              <StudyChip
                key={s.id}
                label={s.label}
                active={form.studies.includes(s.id)}
                onClick={() => toggleStudy(s.id)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1 flex-1 min-w-0">
              <Label className="text-xs text-muted-foreground">Other study (this modality)</Label>
              <Input
                placeholder="Exam not listed — describe here"
                value={otherStudyName}
                onChange={e => setOtherStudyName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomUnderModality()
                  }
                }}
                className="h-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 text-xs shrink-0"
              onClick={addCustomUnderModality}
              disabled={!otherStudyName.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      )}

      {(form.studies.length > 0 || form.custom.some(x => formatRadiologyCustomLabel(x))) && (
        <div className="space-y-2">
          <Label className="text-xs">Selected</Label>
          <div className="flex flex-wrap gap-1.5">
            {form.studies.map(id => (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border bg-muted/30"
              >
                {RADIOLOGY_STUDY_MAP[id]?.label ?? id}
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label="Remove study"
                  onClick={() => toggleStudy(id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {form.custom.map((row, i) => {
              const lab = formatRadiologyCustomLabel(row)
              if (!lab) return null
              return (
                <span
                  key={`cust-${i}`}
                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-border bg-muted/30"
                >
                  {lab}
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    aria-label="Remove study"
                    onClick={() => removeCustom(i)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  )
}
