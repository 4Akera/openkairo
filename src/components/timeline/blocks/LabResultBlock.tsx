import { useState, useCallback } from 'react'
import type { Block, LabResultContent, LabResult } from '../../../types'
import { Button, Input, Label, Separator, Textarea } from '../../ui'
import { Loader2, TestTube, Plus, X, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  PANELS, PANEL_MAP,
  flagColor, flagRowBg, FlagBadge,
  ResultRow, ResultTable,
} from './labShared.tsx'

// ============================================================
// Empty
// ============================================================

export function emptyLabResult(): LabResultContent {
  return {
    panels:         [],
    custom_defs:    [],
    results:        {},
    custom_results: [],
    notes:          '',
    status:         'collected',
    reported_at:    null,
  }
}

// ============================================================
// Status tracker
// ============================================================

const STATUS_STEPS: { key: LabResultContent['status']; label: string }[] = [
  { key: 'collected',  label: 'Collected'  },
  { key: 'processing', label: 'Processing' },
  { key: 'resulted',   label: 'Resulted'   },
  { key: 'verified',   label: 'Verified'   },
]

function StatusTracker({ status }: { status: LabResultContent['status'] }) {
  const idx = STATUS_STEPS.findIndex(s => s.key === status)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATUS_STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div className={cn(
            'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded',
            i < idx   ? 'text-muted-foreground' :
            i === idx ? (status === 'verified'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
              : 'bg-primary/10 text-primary')
            : 'text-muted-foreground/40',
          )}>
            {i === idx && status === 'verified' && <CheckCircle2 className="h-2.5 w-2.5" />}
            {i === idx && status !== 'verified' && <Clock className="h-2.5 w-2.5 animate-pulse" />}
            {s.label}
          </div>
          {i < STATUS_STEPS.length - 1 && (
            <div className={cn('h-px w-3 shrink-0', i < idx ? 'bg-border' : 'bg-border/30')} />
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================
// View
// ============================================================

export function LabResultView({ block }: { block: Block }) {
  const c = { ...emptyLabResult(), ...(block.content as Partial<LabResultContent>) }
  const hasAnyResult =
    c.panels.some(pid =>
      (PANEL_MAP[pid]?.tests ?? []).some(t => c.results[`${pid}.${t.id}`]?.value?.trim())
    ) || c.custom_results.some(r => r.value?.trim())

  if (!hasAnyResult && c.status === 'collected') {
    return <p className="text-sm text-muted-foreground italic">Specimen collected — results pending.</p>
  }

  return (
    <div className="space-y-3 text-sm">
      <StatusTracker status={c.status} />

      {hasAnyResult && (
        <div className="space-y-3">
          {c.panels.map(pid => (
            <ResultTable key={pid} panelId={pid} results={c.results} />
          ))}

          {/* Custom test results */}
          {c.custom_defs.length > 0 && c.custom_results.some(r => r.value?.trim()) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Custom Tests</p>
              <table className="w-full text-xs">
                <tbody>
                  {c.custom_defs.map((def, i) => {
                    const r = c.custom_results[i]
                    if (!r?.value?.trim()) return null
                    return (
                      <tr key={i} className={cn('border-b border-border/30 last:border-0', flagRowBg(r.flag))}>
                        <td className="py-0.5 pr-3 text-muted-foreground">{def.name}</td>
                        <td className={cn('py-0.5 pr-2 text-right tabular-nums', flagColor(r.flag))}>{r.value}</td>
                        <td className="py-0.5 pr-3 text-muted-foreground">{def.unit}</td>
                        <td className="py-0.5 text-muted-foreground/70">
                          {def.ref_low && def.ref_high ? `${def.ref_low}–${def.ref_high}` :
                           def.ref_high ? `≤ ${def.ref_high}` : '—'}
                        </td>
                        <td className="py-0.5 pl-1"><FlagBadge flag={r.flag} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {c.notes?.trim() && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Notes</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{c.notes}</p>
            </div>
          )}
          {c.reported_at && (
            <p className="text-[10px] text-muted-foreground">
              Reported {new Date(c.reported_at).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// Edit — result entry form
// ============================================================

interface EditProps {
  block:    Block
  onSave:   (c: LabResultContent) => Promise<void>
  onCancel: () => void
}

function PanelChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

export function LabResultEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<LabResultContent>
  const [form, setForm] = useState<LabResultContent>({ ...emptyLabResult(), ...ex })
  const [saving, setSaving] = useState(false)

  const togglePanel = useCallback((id: string) => {
    setForm(f => {
      const has = f.panels.includes(id)
      return { ...f, panels: has ? f.panels.filter(p => p !== id) : [...f.panels, id] }
    })
  }, [])

  const setResult = useCallback((key: string, r: LabResult) => {
    setForm(f => ({ ...f, results: { ...f.results, [key]: r } }))
  }, [])

  const setCustomResult = useCallback((i: number, r: LabResult) => {
    setForm(f => {
      const arr = [...(f.custom_results ?? [])]
      arr[i] = r
      return { ...f, custom_results: arr }
    })
  }, [])

  const addCustomDef = () => {
    setForm(f => ({
      ...f,
      custom_defs:    [...f.custom_defs, { name: '', unit: '', ref_low: '', ref_high: '' }],
      custom_results: [...(f.custom_results ?? []), { value: '', flag: '', comment: '' }],
    }))
  }

  const removeCustomDef = (i: number) => {
    setForm(f => ({
      ...f,
      custom_defs:    f.custom_defs.filter((_, j) => j !== i),
      custom_results: (f.custom_results ?? []).filter((_, j) => j !== i),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    await onSave({
      ...form,
      reported_at: !form.reported_at ? new Date().toISOString() : form.reported_at,
    })
    setSaving(false)
  }

  const hasPanels = form.panels.length > 0 || form.custom_defs.some(d => d.name.trim())

  return (
    <div className="space-y-4">

      {/* Status */}
      <div className="space-y-1.5">
        <Label className="text-xs">Status</Label>
        <div className="flex gap-1 flex-wrap">
          {STATUS_STEPS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setForm(f => ({ ...f, status: s.key }))}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors',
                form.status === s.key
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:bg-accent',
              )}
            >{s.label}</button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Panel selector */}
      <div className="space-y-2">
        <Label className="text-xs">Panels</Label>
        <div className="flex flex-wrap gap-1.5">
          {PANELS.map(p => (
            <PanelChip
              key={p.id}
              label={p.id.toUpperCase()}
              active={form.panels.includes(p.id)}
              onClick={() => togglePanel(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom test defs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Custom tests</Label>
          <Button variant="ghost" size="sm" type="button" onClick={addCustomDef} className="h-6 text-xs gap-1 px-2">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        {form.custom_defs.length > 0 && (
          <div className="space-y-1.5">
            {form.custom_defs.map((def, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_5rem_5rem_auto] gap-1.5 items-center">
                <Input placeholder="Test name" value={def.name}
                  onChange={e => setForm(f => { const d = [...f.custom_defs]; d[i] = { ...d[i], name: e.target.value }; return { ...f, custom_defs: d } })}
                  className="h-7 text-xs" />
                <Input placeholder="Unit" value={def.unit}
                  onChange={e => setForm(f => { const d = [...f.custom_defs]; d[i] = { ...d[i], unit: e.target.value }; return { ...f, custom_defs: d } })}
                  className="h-7 text-xs" />
                <Input placeholder="Low" value={def.ref_low}
                  onChange={e => setForm(f => { const d = [...f.custom_defs]; d[i] = { ...d[i], ref_low: e.target.value }; return { ...f, custom_defs: d } })}
                  className="h-7 text-xs" />
                <Input placeholder="High" value={def.ref_high}
                  onChange={e => setForm(f => { const d = [...f.custom_defs]; d[i] = { ...d[i], ref_high: e.target.value }; return { ...f, custom_defs: d } })}
                  className="h-7 text-xs" />
                <Button variant="ghost" size="icon" type="button" onClick={() => removeCustomDef(i)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Result entry tables */}
      {hasPanels && (
        <>
          <Separator />
          <div className="space-y-4">
            {form.panels.map(pid => {
              const panel = PANEL_MAP[pid]
              if (!panel) return null
              return (
                <div key={pid}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{panel.label}</p>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-left text-[10px] font-semibold text-muted-foreground pb-0.5 pr-3 w-36">Test</th>
                        <th className="text-center text-[10px] font-semibold text-muted-foreground pb-0.5 pr-1.5">Value</th>
                        <th className="text-left text-[10px] font-semibold text-muted-foreground pb-0.5 pr-3">Unit</th>
                        <th className="text-left text-[10px] font-semibold text-muted-foreground pb-0.5">Ref range</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {panel.tests.map(test => {
                        const key = `${pid}.${test.id}`
                        const result: LabResult = form.results[key] ?? { value: '', flag: '', comment: '' }
                        return (
                          <ResultRow key={key} test={test} result={result} onChange={r => setResult(key, r)} />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })}

            {/* Custom result entry */}
            {form.custom_defs.filter(d => d.name.trim()).length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Custom Tests</p>
                <table className="w-full">
                  <tbody>
                    {form.custom_defs.map((def, i) => {
                      if (!def.name.trim()) return null
                      const result: LabResult = (form.custom_results ?? [])[i] ?? { value: '', flag: '', comment: '' }
                      return (
                        <ResultRow
                          key={i}
                          test={{
                            id: `cu${i}`, name: def.name, unit: def.unit,
                            ref_low:  def.ref_low  ? parseFloat(def.ref_low)  : null,
                            ref_high: def.ref_high ? parseFloat(def.ref_high) : null,
                          }}
                          result={result}
                          onChange={r => setCustomResult(i, r)}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Reporting notes */}
      <div className="space-y-1">
        <Label className="text-xs">Reporting notes</Label>
        <Textarea
          rows={2}
          placeholder="Interpretation, comments, recommended follow-up…"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="text-sm resize-none"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" type="button" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="button" disabled={saving || !hasPanels} onClick={handleSave}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <TestTube className="h-3.5 w-3.5" />
          Save results
        </Button>
      </div>
    </div>
  )
}
