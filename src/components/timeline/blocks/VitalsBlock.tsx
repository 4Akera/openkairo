import { useState, useCallback } from 'react'
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

// Single-vital flags for PR / RR / Temp
const SIMPLE_FLAGS = [
  { id: 'unmeasured', label: 'Unmeasured' },
]

// SpO2 oxygen delivery — mutually exclusive
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
  { value: 'A', label: 'Alert',              color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'V', label: 'Voice',              color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'P', label: 'Pain',               color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'U', label: 'Unresponsive',       color: 'bg-red-100 text-red-800 border-red-300' },
]

// ============================================================
// Empty / default content (all vitals start as Unmeasured)
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
    rr:   rrMeasured   ? scoreRR(c.resp_rate)                      : 0,
    spo2: spo2Measured ? scoreSpo2(c.spo2)                         : 0,
    o2:   (spo2Measured || !isUnmeasured(c.spo2_flags)) ? scoreOnO2(c.spo2_flags) : 0,
    bp:   bpMeasured   ? scoreBP(c.bp_systolic, c.bp_flags)        : 0,
    pr:   prMeasured   ? scorePR(c.pulse_rate)                     : 0,
    temp: tempMeasured ? scoreTemp(c.temperature, c.temp_unit)     : 0,
    avpu: avpuMeasured ? scoreAVPU(c.avpu)                         : 0,
  }
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0)
  return { total, breakdown, anyMeasured }
}

function news2Risk(total: number): { label: string; color: string; bg: string } {
  if (total <= 4) return { label: 'Low',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' }
  if (total <= 6) return { label: 'Medium', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' }
  return             { label: 'High',   color: 'text-red-700',     bg: 'bg-red-50 border-red-200' }
}

// ============================================================
// Shared UI helpers
// ============================================================

const ALL_FLAG_LABELS: Record<string, string> = Object.fromEntries(
  [...BP_FLAGS, ...SPO2_DELIVERY, ...SIMPLE_FLAGS].map(f => [f.id, f.label])
)

/** Multi-select checkbox pill flags (BP) */
function FlagCheckboxes({
  flags,
  selected,
  onChange,
}: {
  flags: { id: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const toggle = (id: string) => {
    if (id === 'unmeasured') { onChange(['unmeasured']); return }
    const without = selected.filter(f => f !== 'unmeasured' && f !== id)
    onChange(selected.includes(id) ? without : [...without, id])
  }
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(f => (
        <button
          key={f.id}
          type="button"
          onClick={() => toggle(f.id)}
          className={cn(
            'text-[11px] px-2 py-0.5 rounded border transition-colors',
            selected.includes(f.id)
              ? f.id === 'unmeasured'
                ? 'bg-slate-200 border-slate-400 text-slate-700 font-semibold'
                : 'bg-primary/15 border-primary/50 text-primary font-semibold'
              : 'border-border/60 text-muted-foreground hover:bg-accent',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

/** Mutually-exclusive radio pill flags (SpO2 delivery) */
function FlagRadio({
  flags,
  selected,
  onChange,
}: {
  flags: { id: string; label: string }[]
  selected: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(f => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={cn(
            'text-[11px] px-2 py-0.5 rounded border transition-colors',
            selected === f.id
              ? f.id === 'unmeasured'
                ? 'bg-slate-200 border-slate-400 text-slate-700 font-semibold'
                : 'bg-primary/15 border-primary/50 text-primary font-semibold'
              : 'border-border/60 text-muted-foreground hover:bg-accent',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

// Small numeric input
function NumInput({
  value,
  onChange,
  placeholder,
  step,
  className,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  step?: string
  className?: string
}) {
  return (
    <Input
      type="number"
      step={step ?? '1'}
      placeholder={placeholder ?? '—'}
      value={value ?? ''}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
      className={cn('h-7 w-24 text-center text-sm', className)}
    />
  )
}

// ============================================================
// View
// ============================================================

function VitalRow({
  label,
  value,
  unit,
  flags,
  skipFlags = ['unmeasured'],
}: {
  label: string
  value: string | null
  unit?: string
  flags: string[]
  skipFlags?: string[]
}) {
  const unmeasured = flags.includes('unmeasured')
  const visibleFlags = flags.filter(f => !skipFlags.includes(f))

  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">{label}</span>
      {unmeasured ? (
        <span className="text-xs text-muted-foreground italic">—</span>
      ) : (
        <>
          <span className="text-sm font-semibold tabular-nums">{value ?? '—'}</span>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          {visibleFlags.map(f => (
            <span key={f} className="text-[10px] px-1.5 py-0 rounded border border-border bg-muted text-muted-foreground">
              {ALL_FLAG_LABELS[f] ?? f}
            </span>
          ))}
        </>
      )}
    </div>
  )
}

export function VitalsView({ block }: { block: Block }) {
  const c = { ...emptyVitals(), ...(block.content as Partial<VitalsContent>) }
  const news2 = computeNews2(c)
  const risk  = news2Risk(news2.total)

  const bpStr = (!c.bp_flags.includes('unmeasured') && c.bp_systolic !== null && c.bp_diastolic !== null)
    ? `${c.bp_systolic}/${c.bp_diastolic}`
    : null

  const avpuOpt = AVPU_OPTIONS.find(o => o.value === c.avpu)

  return (
    <div className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-x-6">
        <VitalRow label="BP"   value={bpStr}
          unit="mmHg" flags={c.bp_flags}
          skipFlags={['unmeasured']} />
        <VitalRow label="PR"   value={c.pulse_rate !== null ? String(c.pulse_rate) : null}
          unit="bpm"  flags={c.pr_flags} />
        <VitalRow label="RR"   value={c.resp_rate !== null ? String(c.resp_rate) : null}
          unit="/min" flags={c.rr_flags} />
        <VitalRow label="Temp" value={c.temperature !== null ? String(c.temperature) : null}
          unit={`°${c.temp_unit}`} flags={c.temp_flags} />
        <VitalRow label="SpO₂" value={c.spo2 !== null ? `${c.spo2}%` : null}
          flags={c.spo2_flags} skipFlags={['unmeasured', 'room_air']} />
        <div className="flex items-baseline gap-2 py-0.5">
          <span className="text-xs font-semibold text-muted-foreground w-10 shrink-0">AVPU</span>
          {c.avpu ? (
            <span className={cn('text-[11px] px-2 py-0 rounded border font-semibold', avpuOpt?.color)}>
              {avpuOpt?.label ?? c.avpu}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </div>
      </div>

      {news2.anyMeasured && (
        <>
          <Separator />
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
        </>
      )}
    </div>
  )
}

// ============================================================
// Edit
// ============================================================

// Compact vital row: label | input+unit | flags — defined at module level to keep stable identity
function VRow({ label, input, flags }: { label: string; input: React.ReactNode; flags: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_auto_1fr] items-center gap-3 py-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 shrink-0">{input}</div>
      <div>{flags}</div>
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
    <div className="space-y-1">
      <VRow
        label="Blood Pressure"
        input={
          <>
            <NumInput value={form.bp_systolic}  onChange={v => setNum('bp_systolic', 'bp_flags', v)} placeholder="Sys" className="w-20" />
            <span className="text-muted-foreground text-sm">/</span>
            <NumInput value={form.bp_diastolic} onChange={v => setNum('bp_diastolic', 'bp_flags', v)} placeholder="Dia" className="w-20" />
            <span className="text-xs text-muted-foreground">mmHg</span>
          </>
        }
        flags={
          <FlagCheckboxes flags={BP_FLAGS} selected={form.bp_flags}
            onChange={next => setFlags('bp_flags', next)} />
        }
      />

      <VRow
        label="Pulse Rate"
        input={
          <>
            <NumInput value={form.pulse_rate} onChange={v => setNum('pulse_rate', 'pr_flags', v)} placeholder="—" />
            <span className="text-xs text-muted-foreground">bpm</span>
          </>
        }
        flags={
          <FlagCheckboxes flags={SIMPLE_FLAGS} selected={form.pr_flags}
            onChange={next => setFlags('pr_flags', next)} />
        }
      />

      <VRow
        label="Resp. Rate"
        input={
          <>
            <NumInput value={form.resp_rate} onChange={v => setNum('resp_rate', 'rr_flags', v)} placeholder="—" />
            <span className="text-xs text-muted-foreground">/min</span>
          </>
        }
        flags={
          <FlagCheckboxes flags={SIMPLE_FLAGS} selected={form.rr_flags}
            onChange={next => setFlags('rr_flags', next)} />
        }
      />

      <VRow
        label="Temperature"
        input={
          <>
            <NumInput value={form.temperature} onChange={v => setNum('temperature', 'temp_flags', v)}
              placeholder="—" step="0.1" className="w-20" />
            <select
              className="h-7 text-xs border border-input rounded px-1 bg-background"
              value={form.temp_unit}
              onChange={e => setForm(f => ({ ...f, temp_unit: e.target.value as 'C' | 'F' }))}
            >
              <option value="C">°C</option>
              <option value="F">°F</option>
            </select>
          </>
        }
        flags={
          <FlagCheckboxes flags={SIMPLE_FLAGS} selected={form.temp_flags}
            onChange={next => setFlags('temp_flags', next)} />
        }
      />

      <VRow
        label="SpO₂"
        input={
          <>
            <NumInput value={form.spo2}
              onChange={v => setForm(f => ({
                ...f, spo2: v,
                spo2_flags: v !== null ? f.spo2_flags.filter(x => x !== 'unmeasured') : f.spo2_flags,
              }))}
              placeholder="—" className="w-20" />
            <span className="text-xs text-muted-foreground">%</span>
          </>
        }
        flags={
          <FlagRadio flags={SPO2_DELIVERY} selected={form.spo2_flags[0] ?? 'unmeasured'} onChange={setSpo2Flag} />
        }
      />

      <Separator className="my-2" />

      <div className="grid grid-cols-[6rem_1fr] items-center gap-3 py-1">
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

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Record Vitals
        </Button>
      </div>
    </div>
  )
}
