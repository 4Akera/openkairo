import { useState, useCallback } from 'react'
import type { Block, HxPhysicalContent, RosItemState, RosSystemState, ExamItemState, ExamSystemState } from '../../../types'
import { Textarea, Button, Label, Separator, Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui'
import { ChevronDown, ChevronRight, Loader2, RotateCcw, CheckCheck } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Static data ─────────────────────────────────────────────────────────────

interface SystemDef { label: string; items: string[] }

export const ROS_DEFS: Record<string, SystemDef> = {
  constitutional:   { label: 'Constitutional',        items: ['Fever', 'Chills', 'Fatigue / Malaise', 'Weight loss', 'Night sweats', 'Anorexia', 'Generalized weakness'] },
  heent:            { label: 'HEENT',                 items: ['Headache', 'Vision changes', 'Eye redness / discharge', 'Hearing loss', 'Tinnitus', 'Nasal congestion', 'Epistaxis', 'Sore throat', 'Dysphagia'] },
  cardiovascular:   { label: 'Cardiovascular',        items: ['Chest pain / tightness', 'Palpitations', 'Dyspnea on exertion', 'Orthopnea', 'PND', 'Leg swelling / Edema', 'Syncope / Pre-syncope', 'Claudication'] },
  respiratory:      { label: 'Respiratory',           items: ['Cough (dry)', 'Cough (productive)', 'Hemoptysis', 'Shortness of breath', 'Wheezing', 'Stridor'] },
  gastrointestinal: { label: 'Gastrointestinal',      items: ['Nausea', 'Vomiting', 'Diarrhea', 'Constipation', 'Abdominal pain', 'Bloating', 'Heartburn / Reflux', 'Hematochezia / Melena'] },
  genitourinary:    { label: 'Genitourinary',         items: ['Dysuria', 'Urinary frequency', 'Urgency', 'Hematuria', 'Incontinence', 'Nocturia', 'Hesitancy'] },
  musculoskeletal:  { label: 'Musculoskeletal',       items: ['Joint pain', 'Joint swelling', 'Myalgia', 'Back pain', 'Neck pain', 'Morning stiffness', 'Limited range of motion'] },
  neurological:     { label: 'Neurological',          items: ['Dizziness / Vertigo', 'Headache', 'Numbness / Tingling', 'Focal weakness', 'Seizures', 'Tremor', 'Memory changes', 'Speech difficulty', 'Ataxia / Incoordination'] },
  psychiatric:      { label: 'Psychiatric',           items: ['Depression / Low mood', 'Anxiety', 'Insomnia', 'Suicidal ideation', 'Hallucinations', 'Mood swings'] },
  skin:             { label: 'Skin',                  items: ['Rash', 'Pruritus', 'Jaundice', 'Hair loss', 'Nail changes', 'Easy bruising'] },
  endocrine:        { label: 'Endocrine',             items: ['Polyuria', 'Polydipsia', 'Heat intolerance', 'Cold intolerance', 'Excessive sweating'] },
  hematologic:      { label: 'Hematologic / Immune',  items: ['Easy bruising', 'Bleeding tendency', 'Lymphadenopathy', 'Frequent infections', 'Pallor'] },
}

export const EXAM_DEFS: Record<string, SystemDef> = {
  general:     { label: 'General',         items: ['No acute distress', 'Appears well', 'Appears ill', 'In moderate distress', 'In severe distress', 'Alert and oriented', 'Obese', 'Cachexic / Malnourished', 'Diaphoretic', 'Jaundiced', 'Toxic-appearing'] },
  heent:       { label: 'HEENT',           items: ['Normocephalic / Atraumatic', 'PERRL', 'Scleral icterus', 'Conjunctival pallor', 'Dry mucous membranes', 'Pharyngeal erythema', 'Tonsillar enlargement / Exudate', 'Cervical lymphadenopathy', 'Trachea midline'] },
  cardiac:     { label: 'Cardiac',         items: ['Regular rate and rhythm', 'S1 S2 normal', 'Systolic murmur', 'Diastolic murmur', 'Pericardial rub', 'S3 gallop', 'S4 gallop', 'JVD elevated', 'Peripheral pulses intact', 'Capillary refill < 2s'] },
  respiratory: { label: 'Respiratory',     items: ['Clear to auscultation bilaterally', 'Decreased breath sounds (right)', 'Decreased breath sounds (left)', 'Wheezes', 'Crackles (bilateral)', 'Crackles (right)', 'Crackles (left)', 'Rhonchi', 'Pleural rub', 'Dullness to percussion', 'Stridor', 'Accessory muscle use'] },
  abdomen:     { label: 'Abdomen',         items: ['Soft', 'Non-tender', 'Non-distended', 'Bowel sounds present', 'Tenderness (RUQ)', 'Tenderness (LUQ)', 'Tenderness (RLQ)', 'Tenderness (LLQ)', 'Guarding', 'Rigidity', 'Rebound tenderness', 'Hepatomegaly', 'Splenomegaly', 'Ascites'] },
  obgyn_renal: { label: 'OB-GYN / Renal', items: ['CVA tenderness (right)', 'CVA tenderness (left)', 'Suprapubic tenderness', 'Cervical motion tenderness', 'Adnexal tenderness (right)', 'Adnexal tenderness (left)', 'Uterus enlarged', 'Bladder palpable'] },
  neuro:       { label: 'Neurological',    items: ['Alert and oriented x3', 'CN II–XII grossly intact', 'Motor strength 5/5', 'Sensory intact', 'DTRs 2+ symmetric', 'Babinski negative', 'Gait normal', 'Cerebellar intact', 'No meningismus', 'Romberg negative'] },
  other:       { label: 'Other',           items: ['Bilateral pitting edema', 'Unilateral pitting edema', 'Non-pitting edema', 'Skin warm and dry', 'No rash', 'Petechiae', 'Ecchymosis', 'Clubbing', 'Cyanosis', 'Peripheral lymphadenopathy'] },
}

// "Normal" preset items per exam system — used for "Mark Normal" and green colouring
const EXAM_NORMALS: Record<string, string[]> = {
  general:     ['No acute distress', 'Appears well', 'Alert and oriented'],
  heent:       ['Normocephalic / Atraumatic', 'PERRL', 'Trachea midline'],
  cardiac:     ['Regular rate and rhythm', 'S1 S2 normal', 'Peripheral pulses intact', 'Capillary refill < 2s'],
  respiratory: ['Clear to auscultation bilaterally'],
  abdomen:     ['Soft', 'Non-tender', 'Non-distended', 'Bowel sounds present'],
  obgyn_renal: [],
  neuro:       ['Alert and oriented x3', 'CN II–XII grossly intact', 'Motor strength 5/5', 'Sensory intact', 'DTRs 2+ symmetric', 'Gait normal', 'Cerebellar intact', 'Babinski negative'],
  other:       ['Skin warm and dry', 'No rash'],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyRos(): Record<string, RosSystemState> {
  return Object.fromEntries(Object.keys(ROS_DEFS).map(k => [k, { items: {}, notes: '' }]))
}
function emptyExam(): Record<string, ExamSystemState> {
  return Object.fromEntries(Object.keys(EXAM_DEFS).map(k => [k, { items: {}, notes: '' }]))
}
export function emptyHxPhysical(): HxPhysicalContent {
  return { chief_complaint: '', hpi: '', ros: emptyRos(), ros_notes: '', exam: emptyExam(), exam_notes: '' }
}

function mergeRos(saved: Record<string, unknown>): Record<string, RosSystemState> {
  const base = emptyRos()
  for (const key of Object.keys(base)) {
    const s = saved[key] as Partial<RosSystemState> | undefined
    if (!s) continue
    const normalised: Record<string, RosItemState> = {}
    for (const [item, val] of Object.entries(s.items ?? {})) {
      if (val === 'positive' || val === true)  normalised[item] = 'positive'
      else if (val === 'denied')               normalised[item] = 'denied'
    }
    base[key] = { items: normalised, notes: s.notes ?? '' }
  }
  return base
}

function mergeExam(saved: Record<string, unknown>): Record<string, ExamSystemState> {
  const base = emptyExam()
  for (const key of Object.keys(base)) {
    const s = saved[key] as Partial<ExamSystemState> | undefined
    if (!s) continue
    const normalised: Record<string, ExamItemState> = {}
    for (const [item, val] of Object.entries(s.items ?? {})) {
      // handle legacy boolean (true → present, false → absent)
      if (val === 'present' || val === true)  normalised[item] = 'present'
      else if (val === 'absent' || val === false) normalised[item] = 'absent'
    }
    base[key] = { items: normalised, notes: s.notes ?? '' }
  }
  return base
}

// ─── Shared cycling pill ─────────────────────────────────────────────────────

/**
 * Generic cycling pill used by both ROS and Exam panels.
 * `state` is the current value; `states` defines the cycle order and
 * `colorFn` maps a state to a Tailwind class string.
 */
function CyclePill<T extends string>({
  label,
  state,
  states,
  colorFn,
  prefix,
  onClick,
}: {
  label:   string
  state:   T | undefined
  states:  T[]
  colorFn: (s: T) => string
  prefix?: (s: T) => string | null
  onClick: () => void
}) {
  const isSet = state !== undefined
  return (
    <button
      type="button"
      onClick={onClick}
      title={!isSet ? 'Not documented — click to set' : `${state} — click to cycle`}
      className={cn(
        'inline-flex items-center gap-0.5 px-2 py-0.5 rounded border text-[11px] transition-colors text-left',
        isSet ? colorFn(state!) : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {isSet && prefix && prefix(state!) && (
        <span className="mr-0.5 font-bold leading-none">{prefix(state!)}</span>
      )}
      {label}
    </button>
  )
}

// ─── ROS system panel ─────────────────────────────────────────────────────────

const ROS_STATES: RosItemState[] = ['positive', 'denied']

function rosColor(s: RosItemState): string {
  return s === 'positive'
    ? 'bg-amber-50 border-amber-300 text-amber-800 font-semibold dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400'
    : 'bg-slate-100 border-slate-300 text-slate-500 dark:bg-slate-800/60 dark:border-slate-600 dark:text-slate-400'
}
function rosPrefix(s: RosItemState): string | null {
  return s === 'denied' ? '–' : null
}

function RosSystemPanel({
  systemKey, def, state, onChange,
}: {
  systemKey: string; def: SystemDef; state: RosSystemState
  onChange: (key: string, patch: Partial<RosSystemState>) => void
}) {
  const positiveCount = Object.values(state.items).filter(v => v === 'positive').length
  const deniedCount   = Object.values(state.items).filter(v => v === 'denied').length
  const totalCount    = positiveCount + deniedCount
  const [open, setOpen] = useState(totalCount > 0 || !!state.notes)

  const cycle = (item: string) => {
    const cur = state.items[item]
    const idx = cur === undefined ? 0 : (ROS_STATES.indexOf(cur) + 1)
    const next = idx < ROS_STATES.length ? ROS_STATES[idx] : undefined
    const newItems = { ...state.items }
    if (next === undefined) delete newItems[item]
    else newItems[item] = next
    onChange(systemKey, { items: newItems })
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {def.label}
          {totalCount > 0 && (
            <span className="ml-1 flex gap-1">
              {positiveCount > 0 && <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 text-[10px] px-1.5 font-medium">{positiveCount}+</span>}
              {deniedCount   > 0 && <span className="rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 text-[10px] px-1.5 font-medium">{deniedCount}–</span>}
            </span>
          )}
        </button>
        {totalCount > 0 && (
          <button type="button" onClick={() => onChange(systemKey, { items: {} })} title="Clear all" className="pr-2.5 text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className={cn('px-3 pb-3 space-y-2', !open && 'hidden')}>
        <p className="text-[10px] text-muted-foreground pt-1">
          Once = <span className="text-amber-700 dark:text-amber-400 font-semibold">positive</span> · twice = <span className="text-slate-500 font-semibold">denied</span> · thrice = clear
        </p>
        <div className="flex flex-wrap gap-1.5">
          {def.items.map(item => (
            <CyclePill
              key={item}
              label={item}
              state={state.items[item]}
              states={ROS_STATES}
              colorFn={rosColor}
              prefix={rosPrefix}
              onClick={() => cycle(item)}
            />
          ))}
        </div>
        <input
          type="text"
          placeholder="Notes for this system…"
          value={state.notes}
          onChange={e => onChange(systemKey, { notes: e.target.value })}
          className="w-full text-xs border border-input rounded px-2 py-1 bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}

// ─── Exam system panel ────────────────────────────────────────────────────────

const EXAM_STATES: ExamItemState[] = ['present', 'absent']

function examColor(item: string, s: ExamItemState, normals: string[]): string {
  if (s === 'absent') return 'bg-slate-100 border-slate-300 text-slate-500 dark:bg-slate-800/60 dark:border-slate-600 dark:text-slate-400'
  // present — green if it's a normal finding, amber if it's a notable/abnormal one
  return normals.includes(item)
    ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-400'
    : 'bg-amber-50 border-amber-300 text-amber-800 font-semibold dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400'
}

function ExamSystemPanel({
  systemKey, def, state, onChange,
}: {
  systemKey: string; def: SystemDef; state: ExamSystemState
  onChange: (key: string, patch: Partial<ExamSystemState>) => void
}) {
  const normals = EXAM_NORMALS[systemKey] ?? []
  const presentCount = Object.values(state.items).filter(v => v === 'present').length
  const absentCount  = Object.values(state.items).filter(v => v === 'absent').length
  const totalCount   = presentCount + absentCount
  const [open, setOpen] = useState(totalCount > 0 || !!state.notes)

  const cycle = (item: string) => {
    const cur = state.items[item]
    const idx = cur === undefined ? 0 : (EXAM_STATES.indexOf(cur) + 1)
    const next = idx < EXAM_STATES.length ? EXAM_STATES[idx] : undefined
    const newItems = { ...state.items }
    if (next === undefined) delete newItems[item]
    else newItems[item] = next
    onChange(systemKey, { items: newItems })
  }

  const markNormal = () => {
    const next: Record<string, ExamItemState> = {}
    normals.forEach(n => { next[n] = 'present' })
    onChange(systemKey, { items: next })
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex flex-1 items-center gap-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          {def.label}
          {totalCount > 0 && (
            <span className="ml-1 flex gap-1">
              {presentCount > 0 && <span className="rounded-full bg-primary/10 text-primary text-[10px] px-1.5 font-medium">{presentCount}✓</span>}
              {absentCount  > 0 && <span className="rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 text-[10px] px-1.5 font-medium">{absentCount}–</span>}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 pr-2.5">
          {normals.length > 0 && (
            <button
              type="button"
              onClick={markNormal}
              title="Mark all normal findings as present"
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40 transition-colors"
            >
              <CheckCheck className="h-3 w-3" /> Normal
            </button>
          )}
          {totalCount > 0 && (
            <button type="button" onClick={() => onChange(systemKey, { items: {} })} title="Clear all" className="text-muted-foreground hover:text-foreground transition-colors">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className={cn('px-3 pb-3 space-y-2', !open && 'hidden')}>
        <p className="text-[10px] text-muted-foreground pt-1">
          Once = <span className="text-emerald-700 dark:text-emerald-400 font-semibold">present</span> · twice = <span className="text-slate-500 font-semibold">absent</span> · thrice = clear · <span className="text-amber-700 dark:text-amber-400 font-semibold">amber</span> = notable finding
        </p>
        <div className="flex flex-wrap gap-1.5">
          {def.items.map(item => (
            <CyclePill
              key={item}
              label={item}
              state={state.items[item]}
              states={EXAM_STATES}
              colorFn={(s) => examColor(item, s, normals)}
              prefix={(s) => s === 'absent' ? '–' : null}
              onClick={() => cycle(item)}
            />
          ))}
        </div>
        <input
          type="text"
          placeholder="Notes for this system…"
          value={state.notes}
          onChange={e => onChange(systemKey, { notes: e.target.value })}
          className="w-full text-xs border border-input rounded px-2 py-1 bg-background placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  )
}

// ─── Tab completion indicators ────────────────────────────────────────────────

function tabHasHistory(f: HxPhysicalContent) {
  return !!(f.chief_complaint || f.hpi)
}
function tabHasRos(f: HxPhysicalContent) {
  return Object.values(f.ros).some(sys => Object.keys(sys.items).length > 0 || sys.notes) || !!f.ros_notes
}
function tabHasExam(f: HxPhysicalContent) {
  return Object.values(f.exam).some(sys => Object.keys(sys.items).length > 0 || sys.notes) || !!f.exam_notes
}

function TabDot({ filled }: { filled: boolean }) {
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', filled ? 'bg-primary' : 'bg-transparent')} />
}

// ─── View ─────────────────────────────────────────────────────────────────────

function ViewCollapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide py-0.5 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {label}
      </button>
      {open && <div className="mt-1.5 pl-1">{children}</div>}
    </div>
  )
}

export function HxPhysicalView({ block }: { block: Block }) {
  const c = block.content as Partial<HxPhysicalContent>
  const ros  = c.ros  ?? {}
  const exam = c.exam ?? {}

  const rosSystems = Object.entries(ROS_DEFS).filter(([key]) => {
    const sys = ros[key]; if (!sys) return false
    return Object.keys(sys.items).length > 0 || sys.notes
  })
  const examSystems = Object.entries(EXAM_DEFS).filter(([key]) => {
    const sys = exam[key]; if (!sys) return false
    return Object.keys(sys.items).length > 0 || sys.notes
  })

  return (
    <div className="space-y-3.5 text-sm">

      {/* CC */}
      {c.chief_complaint && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Chief Complaint</p>
          <p className="font-medium leading-snug">{c.chief_complaint}</p>
        </div>
      )}

      {/* HPI */}
      {c.hpi && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">History of Present Illness</p>
          <p className="whitespace-pre-wrap leading-relaxed text-foreground/90">{c.hpi}</p>
        </div>
      )}

      {/* ROS */}
      {(rosSystems.length > 0 || c.ros_notes) && (
        <div>
          <Separator className="mb-2" />
          <ViewCollapsible label={`Review of Systems (${rosSystems.length} system${rosSystems.length !== 1 ? 's' : ''})`}>
            <div className="space-y-1.5 mt-1">
              {rosSystems.map(([key, def]) => {
                const sys = ros[key]!
                const positives = def.items.filter(i => sys.items[i] === 'positive')
                const denied    = def.items.filter(i => sys.items[i] === 'denied')
                return (
                  <div key={key} className="rounded border px-3 py-2 text-xs space-y-0.5">
                    <span className="font-semibold text-foreground">{def.label}</span>
                    {positives.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {positives.map(i => (
                          <span key={i} className="inline-flex items-center px-1.5 py-0 rounded border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800 font-medium">{i}</span>
                        ))}
                      </div>
                    )}
                    {denied.length > 0 && (
                      <p className="text-muted-foreground mt-0.5"><span className="font-medium">Denied:</span> {denied.join(', ')}</p>
                    )}
                    {sys.notes && <p className="text-muted-foreground italic">{sys.notes}</p>}
                  </div>
                )
              })}
              {c.ros_notes && (
                <div className="rounded border px-3 py-2 text-xs bg-muted/30">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Additional ROS Notes</p>
                  <p className="whitespace-pre-wrap">{c.ros_notes}</p>
                </div>
              )}
            </div>
          </ViewCollapsible>
        </div>
      )}

      {/* Physical Exam */}
      {(examSystems.length > 0 || c.exam_notes) && (
        <div>
          <Separator className="mb-2" />
          <ViewCollapsible label={`Physical Examination (${examSystems.length} system${examSystems.length !== 1 ? 's' : ''})`}>
            <div className="space-y-1.5 mt-1">
              {examSystems.map(([key, def]) => {
                const sys = exam[key]!
                const normals = EXAM_NORMALS[key] ?? []
                const present = def.items.filter(i => sys.items[i] === 'present')
                const absent  = def.items.filter(i => sys.items[i] === 'absent')
                const presentNormal   = present.filter(i =>  normals.includes(i))
                const presentAbnormal = present.filter(i => !normals.includes(i))
                return (
                  <div key={key} className="rounded border px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">{def.label}: </span>
                    {presentNormal.length > 0   && <span className="text-emerald-700 dark:text-emerald-400">{presentNormal.join(', ')}</span>}
                    {presentNormal.length > 0 && presentAbnormal.length > 0 && <span className="text-muted-foreground">; </span>}
                    {presentAbnormal.length > 0 && <span className="text-amber-700 dark:text-amber-400 font-medium">{presentAbnormal.join(', ')}</span>}
                    {absent.length > 0 && (
                      <p className="text-muted-foreground mt-0.5"><span className="font-medium">Absent:</span> {absent.join(', ')}</p>
                    )}
                    {sys.notes && <p className="text-muted-foreground mt-0.5 italic">{sys.notes}</p>}
                  </div>
                )
              })}
              {c.exam_notes && (
                <div className="rounded border px-3 py-2 text-xs bg-muted/30">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Additional Exam Notes</p>
                  <p className="whitespace-pre-wrap">{c.exam_notes}</p>
                </div>
              )}
            </div>
          </ViewCollapsible>
        </div>
      )}

      {!c.chief_complaint && !c.hpi && rosSystems.length === 0 && examSystems.length === 0 && (
        <p className="text-muted-foreground italic text-xs">No history and physical documented.</p>
      )}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block: Block
  onSave: (c: HxPhysicalContent) => Promise<void>
  onCancel: () => void
}

export function HxPhysicalEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<HxPhysicalContent>
  const [form, setForm] = useState<HxPhysicalContent>({
    chief_complaint: existing.chief_complaint ?? '',
    hpi:             existing.hpi             ?? '',
    ros:             mergeRos(existing.ros  ?? {}),
    ros_notes:       existing.ros_notes       ?? '',
    exam:            mergeExam(existing.exam  ?? {}),
    exam_notes:      existing.exam_notes      ?? '',
  })
  const [saving, setSaving] = useState(false)

  const patchRos = useCallback((key: string, patch: Partial<RosSystemState>) => {
    setForm(f => ({ ...f, ros: { ...f.ros, [key]: { ...f.ros[key], ...patch } } }))
  }, [])

  const patchExam = useCallback((key: string, patch: Partial<ExamSystemState>) => {
    setForm(f => ({ ...f, exam: { ...f.exam, [key]: { ...f.exam[key], ...patch } } }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs defaultValue="history" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="history" className="gap-1.5 text-xs">
            History <TabDot filled={tabHasHistory(form)} />
          </TabsTrigger>
          <TabsTrigger value="ros" className="gap-1.5 text-xs">
            ROS <TabDot filled={tabHasRos(form)} />
          </TabsTrigger>
          <TabsTrigger value="exam" className="gap-1.5 text-xs">
            Exam <TabDot filled={tabHasExam(form)} />
          </TabsTrigger>
        </TabsList>

        {/* ── History ──────────────────────────────────────────── */}
        <TabsContent value="history" className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>Chief Complaint</Label>
            <input
              type="text"
              placeholder="Primary reason for visit…"
              value={form.chief_complaint}
              onChange={e => setForm(f => ({ ...f, chief_complaint: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <Label>History of Present Illness</Label>
            <Textarea
              rows={6}
              placeholder="Onset, duration, character, associated symptoms, modifying factors…"
              value={form.hpi}
              onChange={e => setForm(f => ({ ...f, hpi: e.target.value }))}
            />
          </div>
        </TabsContent>

        {/* ── ROS ──────────────────────────────────────────────── */}
        <TabsContent value="ros" className="space-y-2 pt-2">
          <p className="text-[11px] text-muted-foreground px-0.5">
            Click once = <span className="font-semibold text-amber-700 dark:text-amber-400">positive</span> · twice = <span className="font-semibold text-slate-500">denied</span> · thrice = clear
          </p>
          {Object.entries(ROS_DEFS).map(([key, def]) => (
            <RosSystemPanel key={key} systemKey={key} def={def} state={form.ros[key]} onChange={patchRos} />
          ))}
          <Separator />
          <div className="space-y-1.5">
            <Label>Additional ROS Notes</Label>
            <Textarea
              rows={3}
              placeholder="Any ROS findings that don't fit the systems above…"
              value={form.ros_notes}
              onChange={e => setForm(f => ({ ...f, ros_notes: e.target.value }))}
            />
          </div>
        </TabsContent>

        {/* ── Exam ─────────────────────────────────────────────── */}
        <TabsContent value="exam" className="space-y-2 pt-2">
          <p className="text-[11px] text-muted-foreground px-0.5">
            Once = <span className="font-semibold text-emerald-700 dark:text-emerald-400">present</span> · twice = <span className="font-semibold text-slate-500">absent</span> · thrice = clear · <span className="font-semibold text-amber-700 dark:text-amber-400">amber</span> = notable finding · use <span className="font-semibold">Normal</span> button to pre-fill normals
          </p>
          {Object.entries(EXAM_DEFS).map(([key, def]) => (
            <ExamSystemPanel key={key} systemKey={key} def={def} state={form.exam[key]} onChange={patchExam} />
          ))}
          <Separator />
          <div className="space-y-1.5">
            <Label>Additional Exam Notes</Label>
            <Textarea
              rows={3}
              placeholder="Any exam findings that don't fit the systems above…"
              value={form.exam_notes}
              onChange={e => setForm(f => ({ ...f, exam_notes: e.target.value }))}
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-1 border-t">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save H&P
        </Button>
      </div>
    </div>
  )
}
