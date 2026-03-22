import { useState } from 'react'
import type { Block } from '../../../types'
import { Textarea, Button, Label, Separator } from '../../ui'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Content types
// ============================================================

export type RosSystemState  = { items: Record<string, boolean>; notes: string }
export type ExamSystemState = { items: Record<string, boolean>; notes: string }

export interface HxPhysicalContent {
  chief_complaint: string
  hpi: string
  ros:  Record<string, RosSystemState>
  exam: Record<string, ExamSystemState>
}

// ============================================================
// Static definitions (symptom & finding labels per system)
// ============================================================

interface SystemDef {
  label: string
  items: string[]
}

export const ROS_DEFS: Record<string, SystemDef> = {
  constitutional: {
    label: 'Constitutional',
    items: ['Fever', 'Chills', 'Fatigue / Malaise', 'Weight loss', 'Night sweats', 'Anorexia', 'Generalized weakness'],
  },
  heent: {
    label: 'HEENT',
    items: ['Headache', 'Vision changes', 'Eye redness / discharge', 'Hearing loss', 'Tinnitus', 'Nasal congestion', 'Epistaxis', 'Sore throat', 'Dysphagia'],
  },
  cardiovascular: {
    label: 'Cardiovascular',
    items: ['Chest pain / tightness', 'Palpitations', 'Dyspnea on exertion', 'Orthopnea', 'PND', 'Leg swelling / Edema', 'Syncope / Pre-syncope', 'Claudication'],
  },
  respiratory: {
    label: 'Respiratory',
    items: ['Cough (dry)', 'Cough (productive)', 'Hemoptysis', 'Shortness of breath', 'Wheezing', 'Stridor'],
  },
  gastrointestinal: {
    label: 'Gastrointestinal',
    items: ['Nausea', 'Vomiting', 'Diarrhea', 'Constipation', 'Abdominal pain', 'Bloating', 'Heartburn / Reflux', 'Hematochezia / Melena', 'Dysphagia'],
  },
  genitourinary: {
    label: 'Genitourinary',
    items: ['Dysuria', 'Urinary frequency', 'Urgency', 'Hematuria', 'Incontinence', 'Nocturia', 'Hesitancy'],
  },
  musculoskeletal: {
    label: 'Musculoskeletal',
    items: ['Joint pain', 'Joint swelling', 'Myalgia', 'Back pain', 'Neck pain', 'Morning stiffness', 'Limited range of motion'],
  },
  neurological: {
    label: 'Neurological',
    items: ['Dizziness / Vertigo', 'Headache', 'Numbness / Tingling', 'Focal weakness', 'Seizures', 'Tremor', 'Memory changes', 'Speech difficulty', 'Ataxia / Incoordination'],
  },
  psychiatric: {
    label: 'Psychiatric',
    items: ['Depression / Low mood', 'Anxiety', 'Insomnia', 'Suicidal ideation', 'Hallucinations', 'Mood swings'],
  },
  skin: {
    label: 'Skin',
    items: ['Rash', 'Pruritus', 'Jaundice', 'Hair loss', 'Nail changes', 'Easy bruising'],
  },
  endocrine: {
    label: 'Endocrine',
    items: ['Polyuria', 'Polydipsia', 'Heat intolerance', 'Cold intolerance', 'Excessive sweating', 'Tremor'],
  },
  hematologic: {
    label: 'Hematologic / Immunologic',
    items: ['Easy bruising', 'Bleeding tendency', 'Lymphadenopathy', 'Frequent infections', 'Pallor'],
  },
}

export const EXAM_DEFS: Record<string, SystemDef> = {
  general: {
    label: 'General',
    items: ['No acute distress', 'Appears well', 'Appears ill', 'In moderate distress', 'In severe distress', 'Alert and oriented', 'Obese', 'Cachexic / Malnourished', 'Diaphoretic', 'Jaundiced', 'Toxic-appearing'],
  },
  heent: {
    label: 'HEENT',
    items: ['Normocephalic / Atraumatic', 'PERRL', 'Scleral icterus', 'Conjunctival pallor', 'Dry mucous membranes', 'Pharyngeal erythema', 'Tonsillar enlargement / Exudate', 'Cervical lymphadenopathy', 'Trachea midline'],
  },
  cardiac: {
    label: 'Cardiac',
    items: ['Regular rate and rhythm', 'S1 S2 normal', 'Systolic murmur', 'Diastolic murmur', 'Pericardial rub', 'S3 gallop', 'S4 gallop', 'JVD elevated', 'Peripheral pulses intact', 'Capillary refill < 2s'],
  },
  respiratory: {
    label: 'Respiratory',
    items: ['Clear to auscultation bilaterally', 'Decreased breath sounds (right)', 'Decreased breath sounds (left)', 'Wheezes', 'Crackles (bilateral)', 'Crackles (right)', 'Crackles (left)', 'Rhonchi', 'Pleural rub', 'Dullness to percussion', 'Stridor', 'Accessory muscle use'],
  },
  abdomen: {
    label: 'Abdomen',
    items: ['Soft', 'Non-tender', 'Non-distended', 'Bowel sounds present', 'Tenderness (RUQ)', 'Tenderness (LUQ)', 'Tenderness (RLQ)', 'Tenderness (LLQ)', 'Guarding', 'Rigidity', 'Rebound tenderness', 'Hepatomegaly', 'Splenomegaly', 'Ascites'],
  },
  obgyn_renal: {
    label: 'OB-GYN / Renal',
    items: ['CVA tenderness (right)', 'CVA tenderness (left)', 'Suprapubic tenderness', 'Cervical motion tenderness', 'Adnexal tenderness (right)', 'Adnexal tenderness (left)', 'Uterus enlarged', 'Bladder palpable'],
  },
  neuro: {
    label: 'Neurological',
    items: ['Alert and oriented x3', 'CN II–XII grossly intact', 'Motor strength 5/5', 'Sensory intact', 'DTRs 2+ symmetric', 'Babinski negative', 'Gait normal', 'Cerebellar intact', 'No meningismus', 'Romberg negative'],
  },
  other: {
    label: 'Other',
    items: ['Bilateral pitting edema', 'Unilateral pitting edema', 'Non-pitting edema', 'Skin warm and dry', 'No rash', 'Petechiae', 'Ecchymosis', 'Clubbing', 'Cyanosis', 'Peripheral lymphadenopathy'],
  },
}

// ============================================================
// Helpers
// ============================================================

function emptyRos(): Record<string, RosSystemState> {
  const result: Record<string, RosSystemState> = {}
  for (const key of Object.keys(ROS_DEFS)) {
    result[key] = { items: {}, notes: '' }
  }
  return result
}

function emptyExam(): Record<string, ExamSystemState> {
  const result: Record<string, ExamSystemState> = {}
  for (const key of Object.keys(EXAM_DEFS)) {
    result[key] = { items: {}, notes: '' }
  }
  return result
}

export function emptyHxPhysical(): HxPhysicalContent {
  return { chief_complaint: '', hpi: '', ros: emptyRos(), exam: emptyExam() }
}

function mergeRos(saved: Record<string, RosSystemState>): Record<string, RosSystemState> {
  const base = emptyRos()
  for (const key of Object.keys(base)) {
    base[key] = { ...base[key], ...(saved[key] ?? {}) }
  }
  return base
}

function mergeExam(saved: Record<string, ExamSystemState>): Record<string, ExamSystemState> {
  const base = emptyExam()
  for (const key of Object.keys(base)) {
    base[key] = { ...base[key], ...(saved[key] ?? {}) }
  }
  return base
}

// ============================================================
// Shared sub-components
// ============================================================

function SectionToggle({
  label,
  open,
  onToggle,
  badge,
}: {
  label: string
  open: boolean
  onToggle: () => void
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide py-0.5 hover:text-foreground transition-colors"
    >
      {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 rounded-full bg-primary/10 text-primary text-[10px] px-1.5 py-0 font-medium">
          {badge}
        </span>
      )}
    </button>
  )
}

// ============================================================
// View
// ============================================================

export function HxPhysicalView({ block }: { block: Block }) {
  const c = block.content as HxPhysicalContent
  const [rosOpen, setRosOpen] = useState(false)
  const [examOpen, setExamOpen] = useState(false)

  const rosSystems = Object.entries(ROS_DEFS).filter(([key]) => {
    const sys = c.ros?.[key]
    if (!sys) return false
    const hasChecked = Object.values(sys.items).some(Boolean)
    return hasChecked || sys.notes
  })

  const examSystems = Object.entries(EXAM_DEFS).filter(([key]) => {
    const sys = c.exam?.[key]
    if (!sys) return false
    const hasChecked = Object.values(sys.items).some(Boolean)
    return hasChecked || sys.notes
  })

  return (
    <div className="space-y-4 text-sm">
      {/* CC */}
      {c.chief_complaint && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Chief Complaint</p>
          <p className="whitespace-pre-wrap leading-relaxed">{c.chief_complaint}</p>
        </div>
      )}

      {/* HPI */}
      {c.hpi && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">History of Present Illness</p>
          <p className="whitespace-pre-wrap leading-relaxed">{c.hpi}</p>
        </div>
      )}

      {/* ROS */}
      {rosSystems.length > 0 && (
        <div>
          <SectionToggle
            label="Review of Systems"
            open={rosOpen}
            onToggle={() => setRosOpen(o => !o)}
            badge={rosSystems.length}
          />
          {rosOpen && (
            <div className="mt-2 space-y-2">
              {rosSystems.map(([key, def]) => {
                const sys = c.ros?.[key]
                if (!sys) return null
                const positives = def.items.filter(item => sys.items[item])
                return (
                  <div key={key} className="rounded border px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">{def.label}: </span>
                    {positives.length > 0 && (
                      <span className="text-destructive">{positives.join(', ')}</span>
                    )}
                    {sys.notes && (
                      <p className="text-muted-foreground mt-0.5">{sys.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Physical Exam */}
      {examSystems.length > 0 && (
        <div>
          <Separator className="my-1" />
          <SectionToggle
            label="Physical Examination"
            open={examOpen}
            onToggle={() => setExamOpen(o => !o)}
            badge={examSystems.length}
          />
          {examOpen && (
            <div className="mt-2 space-y-2">
              {examSystems.map(([key, def]) => {
                const sys = c.exam?.[key]
                if (!sys) return null
                const present = def.items.filter(item => sys.items[item])
                return (
                  <div key={key} className="rounded border px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">{def.label}: </span>
                    {present.length > 0 && (
                      <span>{present.join(', ')}</span>
                    )}
                    {sys.notes && (
                      <p className="text-muted-foreground mt-0.5">{sys.notes}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Edit — sub-components
// ============================================================

function CheckboxGrid({
  def,
  systemKey,
  state,
  onChange,
}: {
  def: SystemDef
  systemKey: string
  state: RosSystemState | ExamSystemState
  onChange: (key: string, patch: Partial<RosSystemState>) => void
}) {
  const checkedCount = Object.values(state.items).filter(Boolean).length
  const [open, setOpen] = useState(checkedCount > 0 || !!state.notes)

  const toggleItem = (item: string) => {
    onChange(systemKey, { items: { ...state.items, [item]: !state.items[item] } })
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <SectionToggle
        label={def.label}
        open={open}
        onToggle={() => setOpen(o => !o)}
        badge={checkedCount}
      />
      {/* Always keep rendered so checkbox state isn't lost on collapse */}
      <div className={cn('px-3 pb-3 space-y-2', !open && 'hidden')}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1">
          {def.items.map((item) => (
            <label
              key={item}
              className="flex items-center gap-2 text-xs cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={!!state.items[item]}
                onChange={() => toggleItem(item)}
                className="h-3.5 w-3.5 rounded border-border accent-primary shrink-0"
              />
              <span className={cn(
                'leading-snug transition-colors',
                state.items[item] ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground',
              )}>
                {item}
              </span>
            </label>
          ))}
        </div>
        <div>
          <input
            type="text"
            placeholder="Additional notes…"
            value={state.notes}
            onChange={e => onChange(systemKey, { notes: e.target.value })}
            className="w-full text-xs border border-input rounded px-2 py-1 bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

interface EditProps {
  block: Block
  onSave: (c: HxPhysicalContent) => Promise<void>
  onCancel: () => void
}

export function HxPhysicalEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<HxPhysicalContent>
  const [form, setForm] = useState<HxPhysicalContent>({
    chief_complaint: existing.chief_complaint ?? '',
    hpi: existing.hpi ?? '',
    ros:  mergeRos(existing.ros  ?? {}),
    exam: mergeExam(existing.exam ?? {}),
  })
  const [saving, setSaving] = useState(false)
  const [rosOpen, setRosOpen] = useState(true)
  const [examOpen, setExamOpen] = useState(true)

  const patchRos = (key: string, patch: Partial<RosSystemState>) =>
    setForm(f => ({ ...f, ros: { ...f.ros, [key]: { ...f.ros[key], ...patch } } }))

  const patchExam = (key: string, patch: Partial<ExamSystemState>) =>
    setForm(f => ({ ...f, exam: { ...f.exam, [key]: { ...f.exam[key], ...patch } } }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      {/* ── History ───────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Chief Complaint</Label>
          <Textarea
            rows={2}
            className="resize-none"
            placeholder="Primary reason for visit…"
            value={form.chief_complaint}
            onChange={e => setForm(f => ({ ...f, chief_complaint: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>History of Present Illness</Label>
          <Textarea
            rows={4}
            className="resize-none"
            placeholder="Onset, duration, character, associated symptoms, modifying factors…"
            value={form.hpi}
            onChange={e => setForm(f => ({ ...f, hpi: e.target.value }))}
          />
        </div>
      </div>

      {/* ── ROS ───────────────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setRosOpen(o => !o)}
          className="flex items-center gap-1.5 w-full text-left text-sm font-semibold mb-2 hover:text-primary transition-colors"
        >
          {rosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Review of Systems
        </button>
        {rosOpen && (
          <div className="space-y-2 pl-1">
            {Object.entries(ROS_DEFS).map(([key, def]) => (
              <CheckboxGrid
                key={key}
                def={def}
                systemKey={key}
                state={form.ros[key]}
                onChange={patchRos}
              />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Physical Exam ─────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setExamOpen(o => !o)}
          className="flex items-center gap-1.5 w-full text-left text-sm font-semibold mb-2 hover:text-primary transition-colors"
        >
          {examOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Physical Examination
        </button>
        {examOpen && (
          <div className="space-y-2 pl-1">
            {Object.entries(EXAM_DEFS).map(([key, def]) => (
              <CheckboxGrid
                key={key}
                def={def}
                systemKey={key}
                state={form.exam[key]}
                onChange={patchExam}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save H&P
        </Button>
      </div>
    </div>
  )
}
