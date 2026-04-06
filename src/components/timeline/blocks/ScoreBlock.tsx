import { useState, useMemo } from 'react'
import type { Block } from '../../../types'
import { Button, Label, Separator } from '../../ui'
import { Loader2, Calculator } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoreType = 'gcs' | 'curb65' | 'wells_dvt' | 'wells_pe' | 'heart'

export interface ScoreContent {
  score_type:    ScoreType | null
  inputs:        Record<string, number | string | boolean>
  score:         number | null
  severity:      string | null
  calculated_at: string | null
}

export function emptyScore(): ScoreContent {
  return { score_type: null, inputs: {}, score: null, severity: null, calculated_at: null }
}

// ─── Score definitions ────────────────────────────────────────────────────────

type InputKind =
  | { kind: 'select'; options: { label: string; value: number }[] }
  | { kind: 'boolean'; points: number }

interface InputDef { label: string; def: InputKind }
interface ScoreDef {
  name:        string
  description: string
  inputs:      Record<string, InputDef>
  compute:     (inputs: Record<string, number | string | boolean>) => { score: number; severity: string }
}

const SCORE_DEFS: Record<ScoreType, ScoreDef> = {
  gcs: {
    name: 'GCS — Glasgow Coma Scale',
    description: 'Neurological assessment: eye, verbal, motor',
    inputs: {
      eye: {
        label: 'Eye opening',
        def: { kind: 'select', options: [
          { label: 'Spontaneous (4)', value: 4 },
          { label: 'To voice (3)', value: 3 },
          { label: 'To pain (2)', value: 2 },
          { label: 'None (1)', value: 1 },
        ]},
      },
      verbal: {
        label: 'Verbal response',
        def: { kind: 'select', options: [
          { label: 'Oriented (5)', value: 5 },
          { label: 'Confused (4)', value: 4 },
          { label: 'Words only (3)', value: 3 },
          { label: 'Sounds (2)', value: 2 },
          { label: 'None (1)', value: 1 },
        ]},
      },
      motor: {
        label: 'Motor response',
        def: { kind: 'select', options: [
          { label: 'Obeys commands (6)', value: 6 },
          { label: 'Localises pain (5)', value: 5 },
          { label: 'Withdraws (4)', value: 4 },
          { label: 'Flexion (3)', value: 3 },
          { label: 'Extension (2)', value: 2 },
          { label: 'None (1)', value: 1 },
        ]},
      },
    },
    compute(inp) {
      const s = (Number(inp.eye) || 1) + (Number(inp.verbal) || 1) + (Number(inp.motor) || 1)
      const severity = s >= 13 ? 'Mild' : s >= 9 ? 'Moderate' : 'Severe'
      return { score: s, severity }
    },
  },

  curb65: {
    name: 'CURB-65 (Pneumonia Severity)',
    description: 'Predicts 30-day mortality in CAP',
    inputs: {
      confusion: { label: 'New onset confusion (Urea > 19 mg/dL)',   def: { kind: 'boolean', points: 1 } },
      urea:      { label: 'Urea > 7 mmol/L (BUN > 20 mg/dL)',        def: { kind: 'boolean', points: 1 } },
      rr:        { label: 'Respiratory rate ≥ 30 breaths/min',        def: { kind: 'boolean', points: 1 } },
      bp:        { label: 'SBP < 90 mmHg or DBP ≤ 60 mmHg',          def: { kind: 'boolean', points: 1 } },
      age:       { label: 'Age ≥ 65 years',                           def: { kind: 'boolean', points: 1 } },
    },
    compute(inp) {
      const s = (['confusion', 'urea', 'rr', 'bp', 'age'] as const)
        .reduce((acc, k) => acc + (inp[k] ? 1 : 0), 0)
      const severity = s <= 1 ? 'Low — consider outpatient' : s === 2 ? 'Moderate — consider admission' : 'High — consider ICU'
      return { score: s, severity }
    },
  },

  wells_dvt: {
    name: 'Wells Score — DVT',
    description: 'Pre-test probability of deep vein thrombosis',
    inputs: {
      cancer:       { label: 'Active cancer (treatment within 6 months or palliative)',      def: { kind: 'boolean', points: 1 } },
      paralysis:    { label: 'Paralysis, paresis, or recent plaster immobilisation of leg',  def: { kind: 'boolean', points: 1 } },
      bedridden:    { label: 'Bedridden >3 days or major surgery within 12 weeks',           def: { kind: 'boolean', points: 1 } },
      tenderness:   { label: 'Localised tenderness along deep venous system',                def: { kind: 'boolean', points: 1 } },
      entire_leg:   { label: 'Entire leg swollen',                                           def: { kind: 'boolean', points: 1 } },
      calf:         { label: 'Calf swelling ≥ 3 cm compared to asymptomatic leg',           def: { kind: 'boolean', points: 1 } },
      pitting:      { label: 'Pitting oedema (greater in symptomatic leg)',                  def: { kind: 'boolean', points: 1 } },
      collateral:   { label: 'Collateral superficial veins (non-varicose)',                  def: { kind: 'boolean', points: 1 } },
      alternative:  { label: 'Alternative diagnosis at least as likely as DVT (-2 points)',  def: { kind: 'boolean', points: -2 } },
    },
    compute(inp) {
      const keys = ['cancer','paralysis','bedridden','tenderness','entire_leg','calf','pitting','collateral'] as const
      let s = keys.reduce((acc, k) => acc + (inp[k] ? 1 : 0), 0)
      if (inp.alternative) s -= 2
      const severity = s <= 0 ? 'Low probability' : s <= 2 ? 'Moderate probability' : 'High probability'
      return { score: s, severity }
    },
  },

  wells_pe: {
    name: 'Wells Score — PE',
    description: 'Pre-test probability of pulmonary embolism',
    inputs: {
      dvt_signs:    { label: 'Clinical signs of DVT (+3)',                           def: { kind: 'boolean', points: 3 } },
      pe_likely:    { label: 'PE is #1 diagnosis or equally likely (+3)',            def: { kind: 'boolean', points: 3 } },
      hr:           { label: 'Heart rate > 100 bpm (+1.5)',                          def: { kind: 'boolean', points: 1.5 } },
      immobilised:  { label: 'Immobilisation ≥3 days or surgery within 4 weeks (+1.5)', def: { kind: 'boolean', points: 1.5 } },
      prior_vte:    { label: 'Prior DVT or PE (+1.5)',                               def: { kind: 'boolean', points: 1.5 } },
      haemoptysis:  { label: 'Haemoptysis (+1)',                                     def: { kind: 'boolean', points: 1 } },
      malignancy:   { label: 'Malignancy (on treatment, treated in last 6 months, or palliative) (+1)', def: { kind: 'boolean', points: 1 } },
    },
    compute(inp) {
      const map: Record<string, number> = {
        dvt_signs: 3, pe_likely: 3, hr: 1.5, immobilised: 1.5,
        prior_vte: 1.5, haemoptysis: 1, malignancy: 1,
      }
      const s = Object.entries(map).reduce((acc, [k, pts]) => acc + (inp[k] ? pts : 0), 0)
      const severity = s <= 4 ? 'PE unlikely' : 'PE likely'
      return { score: s, severity }
    },
  },

  heart: {
    name: 'HEART Score (Chest Pain)',
    description: 'Risk stratification for MACE in chest pain patients',
    inputs: {
      history: {
        label: 'History',
        def: { kind: 'select', options: [
          { label: 'Slightly suspicious (0)', value: 0 },
          { label: 'Moderately suspicious (1)', value: 1 },
          { label: 'Highly suspicious (2)', value: 2 },
        ]},
      },
      ecg: {
        label: 'ECG',
        def: { kind: 'select', options: [
          { label: 'Normal (0)', value: 0 },
          { label: 'Non-specific repolarisation (1)', value: 1 },
          { label: 'Significant ST deviation (2)', value: 2 },
        ]},
      },
      age: {
        label: 'Age',
        def: { kind: 'select', options: [
          { label: '< 45 years (0)', value: 0 },
          { label: '45–64 years (1)', value: 1 },
          { label: '≥ 65 years (2)', value: 2 },
        ]},
      },
      risk_factors: {
        label: 'Risk factors',
        def: { kind: 'select', options: [
          { label: 'No known risk factors (0)', value: 0 },
          { label: '1–2 risk factors (1)', value: 1 },
          { label: '≥ 3 or known atherosclerosis (2)', value: 2 },
        ]},
      },
      troponin: {
        label: 'Troponin',
        def: { kind: 'select', options: [
          { label: '≤ normal limit (0)', value: 0 },
          { label: '1–3× normal limit (1)', value: 1 },
          { label: '> 3× normal limit (2)', value: 2 },
        ]},
      },
    },
    compute(inp) {
      const s = ['history', 'ecg', 'age', 'risk_factors', 'troponin']
        .reduce((acc, k) => acc + (Number(inp[k]) || 0), 0)
      const severity = s <= 3 ? 'Low risk — early discharge' : s <= 6 ? 'Moderate risk — observe' : 'High risk — early intervention'
      return { score: s, severity }
    },
  },
}

// ─── Severity colour ──────────────────────────────────────────────────────────

function severityClass(severity: string | null): string {
  if (!severity) return 'text-muted-foreground'
  const s = severity.toLowerCase()
  if (s.includes('low') || s.includes('mild') || s.includes('unlikely') || s.includes('outpatient') || s.includes('early discharge'))
    return 'text-emerald-600 dark:text-emerald-400'
  if (s.includes('moderate') || s.includes('observe'))
    return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

function severityBg(severity: string | null): string {
  if (!severity) return 'bg-muted'
  const s = severity.toLowerCase()
  if (s.includes('low') || s.includes('mild') || s.includes('unlikely') || s.includes('outpatient') || s.includes('early discharge'))
    return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
  if (s.includes('moderate') || s.includes('observe'))
    return 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
  return 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800'
}

// ─── View ─────────────────────────────────────────────────────────────────────

export function ScoreView({ block }: { block: Block }) {
  const c = block.content as Partial<ScoreContent>
  if (!c.score_type || c.score == null) {
    return <p className="text-sm text-muted-foreground italic">No score calculated.</p>
  }

  const def = SCORE_DEFS[c.score_type]
  if (!def) return null

  return (
    <div className="space-y-3 text-sm">
      <div className={cn('rounded-lg border p-3 flex items-center gap-3', severityBg(c.severity ?? null))}>
        <div className="text-center shrink-0">
          <p className={cn('text-3xl font-bold tabular-nums', severityClass(c.severity ?? null))}>{c.score}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">score</p>
        </div>
        <div>
          <p className="font-semibold">{def.name}</p>
          {c.severity && <p className={cn('text-xs font-medium mt-0.5', severityClass(c.severity))}>{c.severity}</p>}
          {c.calculated_at && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Calculated {new Date(c.calculated_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Input summary */}
      {c.inputs && Object.keys(c.inputs).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Inputs</p>
          <div className="space-y-1">
            {Object.entries(def.inputs).map(([key, inputDef]) => {
              const val = c.inputs![key]
              const d = inputDef.def
              if (d.kind === 'boolean') {
                if (!val) return null
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>{inputDef.label}</span>
                    {d.points !== 1 && d.points !== -2 && (
                      <span className="text-muted-foreground">(+{d.points})</span>
                    )}
                    {d.points === -2 && <span className="text-muted-foreground">(−2)</span>}
                  </div>
                )
              } else {
                const opt = d.options.find(o => o.value === Number(val))
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{inputDef.label}:</span>
                    <span>{opt?.label ?? val?.toString() ?? '—'}</span>
                  </div>
                )
              }
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Edit ─────────────────────────────────────────────────────────────────────

interface EditProps {
  block:    Block
  onSave:   (c: ScoreContent) => Promise<void>
  onCancel: () => void
}

export function ScoreEdit({ block, onSave, onCancel }: EditProps) {
  const existing = block.content as Partial<ScoreContent>
  const [scoreType, setScoreType] = useState<ScoreType | null>(existing.score_type ?? null)
  const [inputs, setInputs]       = useState<Record<string, number | string | boolean>>(existing.inputs ?? {})
  const [saving, setSaving]       = useState(false)

  const def = scoreType ? SCORE_DEFS[scoreType] : null

  const computed = useMemo(() => {
    if (!def) return null
    try { return def.compute(inputs) } catch { return null }
  }, [def, inputs])

  const setInput = (key: string, val: number | string | boolean) =>
    setInputs(prev => ({ ...prev, [key]: val }))

  const handleTypeChange = (t: ScoreType) => {
    setScoreType(t)
    setInputs({})
  }

  const handleSave = async () => {
    if (!scoreType || !computed) return
    setSaving(true)
    await onSave({
      score_type:    scoreType,
      inputs,
      score:         computed.score,
      severity:      computed.severity,
      calculated_at: new Date().toISOString(),
    })
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* Score type selector */}
      <div className="space-y-1.5">
        <Label>Score type</Label>
        <div className="grid grid-cols-1 gap-1">
          {(Object.entries(SCORE_DEFS) as [ScoreType, ScoreDef][]).map(([key, d]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleTypeChange(key)}
              className={cn(
                'text-left px-3 py-2 rounded-md border text-sm transition-colors',
                scoreType === key
                  ? 'border-primary bg-primary/5 text-primary font-medium'
                  : 'border-border hover:bg-accent',
              )}
            >
              <span className="font-medium">{d.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{d.description}</span>
            </button>
          ))}
        </div>
      </div>

      {def && (
        <>
          <Separator />

          {/* Inputs */}
          <div className="space-y-3">
            {Object.entries(def.inputs).map(([key, inputDef]) => {
              const d = inputDef.def
              if (d.kind === 'boolean') {
                const checked = Boolean(inputs[key])
                return (
                  <label key={key} className="flex items-start gap-3 cursor-pointer group">
                    <div
                      className={cn(
                        'mt-0.5 h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                        checked ? 'bg-primary border-primary' : 'border-border group-hover:border-primary/50',
                      )}
                      onClick={() => setInput(key, !checked)}
                    >
                      {checked && <div className="h-2 w-2 rounded-sm bg-white dark:bg-black" />}
                    </div>
                    <span className="text-sm leading-tight">{inputDef.label}</span>
                  </label>
                )
              } else {
                return (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{inputDef.label}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {d.options.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setInput(key, opt.value)}
                          className={cn(
                            'px-2.5 py-1 rounded-md border text-xs transition-colors',
                            Number(inputs[key]) === opt.value
                              ? 'border-primary bg-primary/10 text-primary font-medium'
                              : 'border-border hover:bg-accent',
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              }
            })}
          </div>

          {/* Live result */}
          {computed && (
            <>
              <Separator />
              <div className={cn('rounded-lg border p-3 flex items-center gap-3', severityBg(computed.severity))}>
                <div className="text-center shrink-0">
                  <p className={cn('text-3xl font-bold tabular-nums', severityClass(computed.severity))}>{computed.score}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">score</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">{def.name}</p>
                  <p className={cn('text-xs font-medium mt-0.5', severityClass(computed.severity))}>{computed.severity}</p>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving || !computed} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <Calculator className="h-3.5 w-3.5" />
          Save score
        </Button>
      </div>
    </div>
  )
}
