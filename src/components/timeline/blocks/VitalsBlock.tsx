import { useState, useCallback, useRef, useEffect } from 'react'
import type { Block } from '../../../types'
import { Button, Input, Separator } from '../../ui'
import { Loader2, Activity } from 'lucide-react'
import { cn } from '../../../lib/utils'

// ============================================================
// Content types
// ============================================================

export interface VitalsContent {
  bp_systolic:  number | null
  bp_diastolic: number | null
  pulse_rate:   number | null
  resp_rate:    number | null
  temperature:  number | null
  temp_unit:    'C' | 'F'
  spo2:         number | null
  avpu:         'A' | 'V' | 'P' | 'U' | null

  bp_flags:   string[]
  pr_flags:   string[]
  rr_flags:   string[]
  temp_flags: string[]
  spo2_flags: string[]
}

// ============================================================
// Flag definitions
// ============================================================

const BP_FLAGS = [
  { id: 'unmeasured',   label: 'Unmeasured' },
  { id: 'undetected',   label: 'Undetected' },
  { id: 'cant_measure', label: "Can't measure" },
  { id: 'on_pressor',   label: 'On pressor' },
]

const PR_FLAGS = [
  { id: 'unmeasured',  label: 'Unmeasured' },
  { id: 'irregular',   label: 'Irregular' },
  { id: 'undetected',  label: 'Undetected' },
  { id: 'weak',        label: 'Weak / thready' },
]

const RR_FLAGS = [
  { id: 'unmeasured',  label: 'Unmeasured' },
  { id: 'irregular',   label: 'Irregular' },
  { id: 'agonal',      label: 'Agonal' },
  { id: 'assisted',    label: 'Assisted' },
]

const TEMP_FLAGS = [
  { id: 'unmeasured',   label: 'Unmeasured' },
  { id: 'antipyretic',  label: 'On antipyretic' },
]

const SPO2_DELIVERY = [
  { id: 'unmeasured',    label: 'Unmeasured' },
  { id: 'room_air',      label: 'Room air' },
  { id: 'nasal_cannula', label: 'Nasal cannula' },
  { id: 'simple_mask',   label: 'Simple mask' },
  { id: 'nrb_mask',      label: 'NRB mask' },
  { id: 'cpap_bipap',    label: 'CPAP / BiPAP' },
  { id: 'intubated',     label: 'Intubated' },
]

const AVPU_OPTIONS: { value: 'A' | 'V' | 'P' | 'U'; label: string; color: string }[] = [
  { value: 'A', label: 'Alert',       color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'V', label: 'Voice',       color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'P', label: 'Pain',        color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'U', label: 'Unresponsive',color: 'bg-red-100 text-red-800 border-red-300' },
]

// ============================================================
// Empty / default content
// ============================================================

export function emptyVitals(): VitalsContent {
  return {
    bp_systolic:  null,
    bp_diastolic: null,
    pulse_rate:   null,
    resp_rate:    null,
    temperature:  null,
    temp_unit:    'C',
    spo2:         null,
    avpu:         null,
    bp_flags:     ['unmeasured'],
    pr_flags:     ['unmeasured'],
    rr_flags:     ['unmeasured'],
    temp_flags:   ['unmeasured'],
    spo2_flags:   ['unmeasured'],
  }
}

// ============================================================
// NEWS2 scoring
// ============================================================

interface News2Result {
  total: number
  breakdown: Record<string, number>
  anyMeasured: boolean
}

function scoreRR(rr: number | null): number {
  if (rr === null) return 0
  if (rr <= 8)  return 3
  if (rr <= 11) return 1
  if (rr <= 20) return 0
  if (rr <= 24) return 2
  return 3
}
function scoreSpo2(spo2: number | null): number {
  if (spo2 === null) return 0
  if (spo2 <= 91) return 3
  if (spo2 <= 93) return 2
  if (spo2 <= 95) return 1
  return 0
}
function scoreOnO2(spo2Flags: string[]): number {
  const onO2 = spo2Flags.some(f => ['nasal_cannula','simple_mask','nrb_mask','cpap_bipap','intubated'].includes(f))
  return onO2 ? 3 : 0
}
function scoreBP(sys: number | null, bpFlags: string[]): number {
  if (bpFlags.includes('on_pressor')) return 3
  if (sys === null) return 0
  if (sys <= 90)  return 3
  if (sys <= 100) return 2
  if (sys <= 110) return 1
  if (sys <= 219) return 0
  return 3
}
function scorePR(pr: number | null): number {
  if (pr === null) return 0
  if (pr <= 40)  return 3
  if (pr <= 50)  return 1
  if (pr <= 90)  return 0
  if (pr <= 110) return 1
  if (pr <= 130) return 2
  return 3
}
function scoreTemp(t: number | null, unit: 'C' | 'F'): number {
  if (t === null) return 0
  const c = unit === 'F' ? (t - 32) * 5 / 9 : t
  if (c <= 35.0) return 3
  if (c <= 36.0) return 1
  if (c <= 38.0) return 0
  if (c <= 39.0) return 1
  return 2
}
function scoreAVPU(avpu: string | null): number {
  return avpu === 'A' || avpu === null ? 0 : 3
}

export function computeNews2(c: VitalsContent): News2Result {
  const isUnmeasured = (flags: string[]) => flags.includes('unmeasured')

  const rrMeasured   = !isUnmeasured(c.rr_flags)
  const spo2Measured = !isUnmeasured(c.spo2_flags) && c.spo2 !== null
  const bpMeasured   = !isUnmeasured(c.bp_flags) && (c.bp_systolic !== null || c.bp_flags.includes('on_pressor'))
  const prMeasured   = !isUnmeasured(c.pr_flags)   && c.pulse_rate   !== null
  const tempMeasured = !isUnmeasured(c.temp_flags) && c.temperature  !== null
  const avpuMeasured = c.avpu !== null

  const anyMeasured = rrMeasured || spo2Measured || bpMeasured || prMeasured || tempMeasured || avpuMeasured

  const breakdown: Record<string, number> = {
    rr:   rrMeasured   ? scoreRR(c.resp_rate)                   : 0,
    spo2: spo2Measured ? scoreSpo2(c.spo2)                      : 0,
    o2:   (spo2Measured || !isUnmeasured(c.spo2_flags)) ? scoreOnO2(c.spo2_flags) : 0,
    bp:   bpMeasured   ? scoreBP(c.bp_systolic, c.bp_flags)     : 0,
    pr:   prMeasured   ? scorePR(c.pulse_rate)                  : 0,
    temp: tempMeasured ? scoreTemp(c.temperature, c.temp_unit)  : 0,
    avpu: avpuMeasured ? scoreAVPU(c.avpu)                      : 0,
  }
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0)
  return { total, breakdown, anyMeasured }
}

function news2Risk(total: number): { label: string; color: string; bg: string } {
  if (total <= 4) return { label: 'Low',    color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800' }
  if (total <= 6) return { label: 'Medium', color: 'text-amber-700 dark:text-amber-400',     bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800' }
  return             { label: 'High',   color: 'text-red-700 dark:text-red-400',       bg: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800' }
}

// ============================================================
// Clinical interpretation hints
// ============================================================

interface Hint { text: string; color: string }

function prHint(val: number | null): Hint | null {
  if (val === null) return null
  if (val <= 40)  return { text: 'Bradycardic', color: 'text-red-600' }
  if (val <= 50)  return { text: 'Low', color: 'text-amber-600' }
  if (val <= 90)  return { text: 'Normal', color: 'text-emerald-600' }
  if (val <= 110) return { text: 'Tachycardic', color: 'text-amber-600' }
  if (val <= 130) return { text: 'Rapid', color: 'text-amber-600' }
  return { text: 'Very rapid', color: 'text-red-600' }
}

function rrHint(val: number | null): Hint | null {
  if (val === null) return null
  if (val <= 8)  return { text: 'Very low', color: 'text-red-600' }
  if (val <= 11) return { text: 'Low', color: 'text-amber-600' }
  if (val <= 20) return { text: 'Normal', color: 'text-emerald-600' }
  if (val <= 24) return { text: 'Elevated', color: 'text-amber-600' }
  return { text: 'High', color: 'text-red-600' }
}

function spo2Hint(val: number | null): Hint | null {
  if (val === null) return null
  if (val <= 91) return { text: 'Critical', color: 'text-red-600' }
  if (val <= 93) return { text: 'Low', color: 'text-red-500' }
  if (val <= 95) return { text: 'Borderline', color: 'text-amber-600' }
  return { text: 'Normal', color: 'text-emerald-600' }
}

function bpHint(sys: number | null, bpFlags: string[]): Hint | null {
  if (bpFlags.includes('on_pressor')) return { text: 'On pressor', color: 'text-red-600' }
  if (sys === null) return null
  if (sys <= 90)  return { text: 'Hypotensive', color: 'text-red-600' }
  if (sys <= 100) return { text: 'Low', color: 'text-amber-600' }
  if (sys <= 110) return { text: 'Low-normal', color: 'text-amber-500' }
  if (sys <= 140) return { text: 'Normal', color: 'text-emerald-600' }
  if (sys <= 180) return { text: 'Elevated', color: 'text-amber-600' }
  if (sys <= 219) return { text: 'Stage 2', color: 'text-red-500' }
  return { text: 'Crisis', color: 'text-red-600' }
}

function tempHint(val: number | null, unit: 'C' | 'F'): Hint | null {
  if (val === null) return null
  const c = unit === 'F' ? (val - 32) * 5 / 9 : val
  if (c <= 35.0) return { text: 'Hypothermic', color: 'text-red-600' }
  if (c <= 36.0) return { text: 'Low', color: 'text-amber-600' }
  if (c <= 38.0) return { text: 'Normal', color: 'text-emerald-600' }
  if (c <= 39.0) return { text: 'Febrile', color: 'text-amber-600' }
  return { text: 'High fever', color: 'text-red-600' }
}

function HintBadge({ hint }: { hint: Hint | null }) {
  if (!hint) return null
  return <span className={cn('text-[11px] font-medium', hint.color)}>{hint.text}</span>
}

// ============================================================
// Shared UI helpers
// ============================================================

const ALL_FLAG_LABELS: Record<string, string> = Object.fromEntries(
  [...BP_FLAGS, ...PR_FLAGS, ...RR_FLAGS, ...TEMP_FLAGS, ...SPO2_DELIVERY].map(f => [f.id, f.label])
)

/** Compact dropdown for flag selection (single value) */
function FlagSelect({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-7 text-xs rounded border border-input bg-background px-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
    >
      {options.map(o => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  )
}

// ============================================================
// BP combined input ("120/80")
// ============================================================

function formatBpRaw(sys: number | null, dia: number | null): string {
  if (sys !== null && dia !== null) return `${sys}/${dia}`
  if (sys !== null) return `${sys}`
  return ''
}

interface BpInputProps {
  systolic: number | null
  diastolic: number | null
  onChangeSys: (v: number | null) => void
  onChangeDia: (v: number | null) => void
  onNext: () => void
  inputRef?: React.Ref<HTMLInputElement>
}

function BpInput({ systolic, diastolic, onChangeSys, onChangeDia, onNext, inputRef }: BpInputProps) {
  const [raw, setRaw] = useState(() => formatBpRaw(systolic, diastolic))
  const isEditing = useRef(false)

  // Sync when external changes reset values (e.g. flags → null)
  useEffect(() => {
    if (!isEditing.current) {
      setRaw(formatBpRaw(systolic, diastolic))
    }
  }, [systolic, diastolic])

  const parse = (val: string) => {
    if (val.includes('/')) {
      const [s, d] = val.split('/')
      onChangeSys(s.trim() !== '' ? Number(s.trim()) : null)
      onChangeDia(d.trim() !== '' ? Number(d.trim()) : null)
    } else {
      onChangeSys(val.trim() !== '' ? Number(val.trim()) : null)
      onChangeDia(null)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setRaw(val)
    parse(val)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); onNext() }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={() => { isEditing.current = true }}
      onBlur={() => {
        isEditing.current = false
        // Normalise display on blur
        setRaw(formatBpRaw(systolic, diastolic))
      }}
      placeholder="120/80"
      className="h-8 w-28 rounded border border-input bg-background px-2 text-center text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

// Standard numeric input for single-value vitals
function NumInput({
  value,
  onChange,
  onNext,
  placeholder,
  step,
  className,
  inputRef,
}: {
  value: number | null
  onChange: (v: number | null) => void
  onNext?: () => void
  placeholder?: string
  step?: string
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onNext) { e.preventDefault(); onNext() }
  }
  return (
    <Input
      ref={inputRef}
      type="number"
      step={step ?? '1'}
      placeholder={placeholder ?? '—'}
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      onKeyDown={handleKeyDown}
      className={cn('h-8 w-24 text-center text-sm', className)}
    />
  )
}

// ============================================================
// View — card grid with color-coded values
// ============================================================

function scoreTextColor(score: number): string {
  if (score >= 3) return 'text-red-600 dark:text-red-400'
  if (score >= 1) return 'text-amber-600 dark:text-amber-400'
  return ''
}

function scoreCardBg(score: number, unmeasured: boolean): string {
  if (unmeasured) return 'bg-muted/30 border-border/50'
  if (score >= 3) return 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800'
  if (score >= 1) return 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800'
  return 'bg-card border-border'
}

function VitalCard({
  label,
  value,
  unit,
  score,
  flags,
  skipFlags = ['unmeasured'],
}: {
  label: string
  value: string | null
  unit?: string
  score: number
  flags: string[]
  skipFlags?: string[]
}) {
  const unmeasured = flags.includes('unmeasured')
  const visibleFlags = flags.filter(f => !skipFlags.includes(f))

  return (
    <div className={cn('rounded border px-2 py-1 min-w-0 overflow-hidden', scoreCardBg(score, unmeasured))}>
      <div className="flex items-baseline gap-1 flex-nowrap overflow-hidden">
        <span className="text-[10px] font-semibold text-muted-foreground shrink-0">{label}</span>
        {unmeasured ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <>
            <span className={cn('text-xs font-semibold tabular-nums shrink-0', scoreTextColor(score))}>
              {value ?? '—'}
            </span>
            {unit && <span className="text-[10px] text-muted-foreground shrink-0">{unit}</span>}
            {visibleFlags.map(f => (
              <span key={f} className="text-[9px] italic text-muted-foreground truncate min-w-0">
                {ALL_FLAG_LABELS[f] ?? f}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export function VitalsView({ block }: { block: Block }) {
  const c = { ...emptyVitals(), ...(block.content as Partial<VitalsContent>) }
  const news2 = computeNews2(c)
  const risk  = news2Risk(news2.total)

  const bpStr = (!c.bp_flags.includes('unmeasured') && c.bp_systolic !== null && c.bp_diastolic !== null)
    ? `${c.bp_systolic}/${c.bp_diastolic}`
    : (!c.bp_flags.includes('unmeasured') && c.bp_systolic !== null)
      ? `${c.bp_systolic}`
      : null

  const avpuOpt = AVPU_OPTIONS.find(o => o.value === c.avpu)
  const avpuUnmeasured = c.avpu === null
  const avpuScore = news2.breakdown.avpu ?? 0

  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <VitalCard
          label="BP"
          value={bpStr}
          unit="mmHg"
          score={news2.breakdown.bp}
          flags={c.bp_flags}
          skipFlags={['unmeasured']}
        />
        <VitalCard
          label="PR"
          value={c.pulse_rate !== null ? String(c.pulse_rate) : null}
          unit="bpm"
          score={news2.breakdown.pr}
          flags={c.pr_flags}
        />
        <VitalCard
          label="RR"
          value={c.resp_rate !== null ? String(c.resp_rate) : null}
          unit="/min"
          score={news2.breakdown.rr}
          flags={c.rr_flags}
        />
        <VitalCard
          label="Temp"
          value={c.temperature !== null ? String(c.temperature) : null}
          unit={`°${c.temp_unit}`}
          score={news2.breakdown.temp}
          flags={c.temp_flags}
        />
        <VitalCard
          label="SpO₂"
          value={c.spo2 !== null ? `${c.spo2}%` : null}
          score={news2.breakdown.spo2 + (news2.breakdown.o2 ?? 0)}
          flags={c.spo2_flags}
          skipFlags={['unmeasured', 'room_air']}
        />
        {/* AVPU card */}
        <div className={cn('rounded border px-2 py-1 overflow-hidden', scoreCardBg(avpuScore, avpuUnmeasured))}>
          <div className="flex items-baseline gap-1 flex-nowrap overflow-hidden">
            <span className="text-[10px] font-semibold text-muted-foreground shrink-0">AVPU</span>
            {avpuUnmeasured ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <span className={cn('text-xs font-semibold truncate', scoreTextColor(avpuScore))}>
                {avpuOpt?.label ?? c.avpu}
              </span>
            )}
          </div>
        </div>
      </div>

      {news2.anyMeasured && (
        <div className={cn('rounded border px-3 py-1.5 flex items-center justify-between', risk.bg)}>
          <div className="flex items-center gap-1.5">
            <Activity className={cn('h-3.5 w-3.5', risk.color)} />
            <span className={cn('text-xs font-semibold', risk.color)}>NEWS2</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-bold', risk.color)}>{news2.total}</span>
            <span className={cn('text-[11px] font-semibold px-1.5 py-0 rounded border', risk.color, risk.bg)}>
              {risk.label} Risk
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Edit — keyboard-navigable form
// ============================================================

function VRow({
  label,
  input,
  flags,
}: {
  label: string
  input: React.ReactNode
  flags: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[7rem_auto_1fr] items-start gap-3 py-1">
      <span className="text-xs font-medium text-muted-foreground pt-1.5">{label}</span>
      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">{input}</div>
      <div className="pt-0.5">{flags}</div>
    </div>
  )
}

interface EditProps {
  block: Block
  onSave: (c: VitalsContent) => Promise<void>
  onCancel: () => void
}

export function VitalsEdit({ block, onSave, onCancel }: EditProps) {
  const [form, setForm] = useState<VitalsContent>({
    ...emptyVitals(),
    ...(block.content as Partial<VitalsContent>),
  })
  const [saving, setSaving] = useState(false)

  // Ordered refs for keyboard focus advancement
  const refs = {
    bp:   useRef<HTMLInputElement>(null),
    pr:   useRef<HTMLInputElement>(null),
    rr:   useRef<HTMLInputElement>(null),
    temp: useRef<HTMLInputElement>(null),
    spo2: useRef<HTMLInputElement>(null),
  }
  const focusOrder = ['bp', 'pr', 'rr', 'temp', 'spo2'] as const
  const advance = (from: typeof focusOrder[number]) => {
    const idx = focusOrder.indexOf(from)
    const next = focusOrder[idx + 1]
    if (next) refs[next].current?.focus()
  }

  const setNum = useCallback((
    field: keyof VitalsContent,
    flagField: keyof VitalsContent,
    val: number | null,
  ) => {
    setForm(f => {
      const flags = (f[flagField] as string[])
      const clearedFlags = val !== null ? flags.filter(x => x !== 'unmeasured') : flags
      return { ...f, [field]: val, [flagField]: clearedFlags }
    })
  }, [])

  const setFlags = useCallback((flagField: keyof VitalsContent, next: string[]) => {
    setForm(f => ({ ...f, [flagField]: next }))
  }, [])

  const setSpo2Flag = useCallback((id: string) => {
    setForm(f => ({
      ...f,
      spo2_flags: [id],
      spo2: id === 'unmeasured' ? null : f.spo2,
    }))
  }, [])

  const news2 = computeNews2(form)
  const risk  = news2Risk(news2.total)

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="space-y-0.5">
      {/* Blood Pressure */}
      <VRow
        label="Blood Pressure"
        input={
          <>
            <BpInput
              inputRef={refs.bp}
              systolic={form.bp_systolic}
              diastolic={form.bp_diastolic}
              onChangeSys={v => setNum('bp_systolic',  'bp_flags', v)}
              onChangeDia={v => setNum('bp_diastolic', 'bp_flags', v)}
              onNext={() => advance('bp')}
            />
            <span className="text-xs text-muted-foreground">mmHg</span>
            <HintBadge hint={bpHint(form.bp_systolic, form.bp_flags)} />
          </>
        }
        flags={
          <FlagSelect
            options={BP_FLAGS}
            value={
              form.bp_flags.includes('unmeasured')   ? 'unmeasured'   :
              form.bp_flags.includes('undetected')   ? 'undetected'   :
              form.bp_flags.includes('cant_measure') ? 'cant_measure' :
              form.bp_flags.includes('on_pressor')   ? 'on_pressor'   : 'unmeasured'
            }
            onChange={id => {
              setFlags('bp_flags', [id])
              if (id === 'unmeasured') {
                setForm(f => ({ ...f, bp_systolic: null, bp_diastolic: null }))
              }
            }}
          />
        }
      />

      {/* Pulse Rate */}
      <VRow
        label="Pulse Rate"
        input={
          <>
            <NumInput
              inputRef={refs.pr}
              value={form.pulse_rate}
              onChange={v => setNum('pulse_rate', 'pr_flags', v)}
              onNext={() => advance('pr')}
            />
            <span className="text-xs text-muted-foreground">bpm</span>
            <HintBadge hint={prHint(form.pulse_rate)} />
          </>
        }
        flags={
          <FlagSelect options={PR_FLAGS} value={form.pr_flags[0] ?? 'unmeasured'}
            onChange={id => setFlags('pr_flags', [id])} />
        }
      />

      {/* Respiratory Rate */}
      <VRow
        label="Resp. Rate"
        input={
          <>
            <NumInput
              inputRef={refs.rr}
              value={form.resp_rate}
              onChange={v => setNum('resp_rate', 'rr_flags', v)}
              onNext={() => advance('rr')}
            />
            <span className="text-xs text-muted-foreground">/min</span>
            <HintBadge hint={rrHint(form.resp_rate)} />
          </>
        }
        flags={
          <FlagSelect options={RR_FLAGS} value={form.rr_flags[0] ?? 'unmeasured'}
            onChange={id => setFlags('rr_flags', [id])} />
        }
      />

      {/* Temperature */}
      <VRow
        label="Temperature"
        input={
          <>
            <div className="flex h-8 rounded border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
              <input
                ref={refs.temp}
                type="number"
                step="0.1"
                placeholder="—"
                value={form.temperature ?? ''}
                onChange={e => setNum('temperature', 'temp_flags', e.target.value ? Number(e.target.value) : null)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); advance('temp') } }}
                className="w-16 text-center text-sm bg-background px-2 border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <select
                value={form.temp_unit}
                onChange={e => setForm(f => ({ ...f, temp_unit: e.target.value as 'C' | 'F' }))}
                className="text-[11px] bg-muted border-l border-input px-1 text-muted-foreground focus:outline-none cursor-pointer"
              >
                <option value="C">°C</option>
                <option value="F">°F</option>
              </select>
            </div>
            <HintBadge hint={tempHint(form.temperature, form.temp_unit)} />
          </>
        }
        flags={
          <FlagSelect options={TEMP_FLAGS} value={form.temp_flags[0] ?? 'unmeasured'}
            onChange={id => setFlags('temp_flags', [id])} />
        }
      />

      {/* SpO₂ */}
      <VRow
        label="SpO₂"
        input={
          <>
            <NumInput
              inputRef={refs.spo2}
              value={form.spo2}
              onChange={v => setForm(f => ({
                ...f, spo2: v,
                spo2_flags: v !== null ? f.spo2_flags.filter(x => x !== 'unmeasured') : f.spo2_flags,
              }))}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <HintBadge hint={spo2Hint(form.spo2)} />
          </>
        }
        flags={
          <FlagSelect
            options={SPO2_DELIVERY}
            value={form.spo2_flags[0] ?? 'unmeasured'}
            onChange={setSpo2Flag}
          />
        }
      />

      <Separator className="my-2" />

      {/* AVPU */}
      <div className="grid grid-cols-[7rem_1fr] items-center gap-3 py-1">
        <span className="text-xs font-medium text-muted-foreground">AVPU</span>
        <div className="flex gap-1.5">
          {AVPU_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, avpu: f.avpu === opt.value ? null : opt.value }))}
              className={cn(
                'text-xs px-2.5 py-0.5 rounded border font-medium transition-colors',
                form.avpu === opt.value ? opt.color : 'border-border/60 text-muted-foreground hover:bg-accent',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live NEWS2 */}
      {news2.anyMeasured && (
        <div className={cn('rounded border px-3 py-1.5 flex items-center justify-between mt-2', risk.bg)}>
          <div className="flex items-center gap-1.5">
            <Activity className={cn('h-3.5 w-3.5', risk.color)} />
            <span className={cn('text-xs font-semibold', risk.color)}>NEWS2</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-bold', risk.color)}>{news2.total}</span>
            <span className={cn('text-[11px] font-semibold px-1.5 py-0 rounded border', risk.color, risk.bg)}>
              {risk.label} Risk
            </span>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Record Vitals
        </Button>
      </div>
    </div>
  )
}
