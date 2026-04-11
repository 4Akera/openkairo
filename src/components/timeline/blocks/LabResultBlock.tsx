import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Block, BlockDefinition, LabResultContent, LabResult } from '../../../types'
import { supabase } from '../../../lib/supabase'
import { Button, Input, Label, Separator, Textarea } from '../../ui'
import { Loader2, TestTube, Plus, X, Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useEncounterStore } from '../../../stores/encounterStore'
import {
  computeActiveRuleIdsForLabResult,
  getCustomChargeRules,
  partitionLabBillingRules,
  projectedLabBillingTotal,
  usesCustomChargeRules,
} from '../../../lib/blockBilling'
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
// View
// ============================================================

export function LabResultView({ block }: { block: Block }) {
  const c = { ...emptyLabResult(), ...(block.content as Partial<LabResultContent>) }
  const hasAnyResult =
    c.panels.some(pid =>
      (PANEL_MAP[pid]?.tests ?? []).some(t => c.results[`${pid}.${t.id}`]?.value?.trim())
    ) || c.custom_results.some(r => r.value?.trim())

  if (!hasAnyResult) {
    const label =
      c.status === 'collected' ? 'Specimen collected — results pending.' :
      c.status === 'processing' ? 'Analysis in progress — results pending.' :
      'No results recorded.'
    return <p className="text-sm text-muted-foreground italic">{label}</p>
  }

  return (
    <div className="space-y-1.5">
      {hasAnyResult && (
        <div className="space-y-1.5">
          {c.panels.map(pid => (
            <ResultTable key={pid} panelId={pid} results={c.results} />
          ))}

          {/* Custom test results */}
          {c.custom_defs.length > 0 && c.custom_results.some(r => r.value?.trim()) && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Custom Tests</p>
              <table className="w-full text-[11px]">
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
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{c.notes}</p>
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

  const definitions = useEncounterStore(s => s.definitions)
  const definitionMap = useEncounterStore(s => s.definitionMap)
  const [fetchedDef, setFetchedDef] = useState<BlockDefinition | null>(null)

  useEffect(() => {
    if (!block.definition_id) {
      setFetchedDef(null)
      return
    }
    if (definitions.some(d => d.id === block.definition_id)) {
      setFetchedDef(null)
      return
    }
    let cancelled = false
    supabase
      .from('block_definitions')
      .select('*')
      .eq('id', block.definition_id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setFetchedDef(data as BlockDefinition)
      })
    return () => { cancelled = true }
  }, [block.definition_id, definitions])

  const blockDef = useMemo(() => {
    if (block.definition_id) {
      return definitions.find(d => d.id === block.definition_id) ?? fetchedDef ?? null
    }
    return definitionMap[block.type] ?? null
  }, [block.definition_id, block.type, definitions, definitionMap, fetchedDef])

  const billingRules = useMemo(
    () => (blockDef && usesCustomChargeRules(blockDef) ? getCustomChargeRules(blockDef) : []),
    [blockDef],
  )
  const { addOnOnly } = useMemo(() => partitionLabBillingRules(billingRules), [billingRules])
  const extraIds = form.billing_extra_rule_ids ?? []

  const [svcPrices, setSvcPrices] = useState<Record<string, number>>({})
  const [svcPricesLoading, setSvcPricesLoading] = useState(false)
  useEffect(() => {
    if (billingRules.length === 0) {
      setSvcPrices({})
      setSvcPricesLoading(false)
      return
    }
    const ids = [...new Set(billingRules.map(r => r.service_item_id).filter(Boolean))]
    if (ids.length === 0) {
      setSvcPricesLoading(false)
      return
    }
    let cancelled = false
    setSvcPricesLoading(true)
    Promise.resolve(
      supabase
        .from('service_items')
        .select('id, default_price')
        .in('id', ids),
    )
      .then(({ data }) => {
        if (cancelled) return
        const next: Record<string, number> = {}
        for (const row of (data ?? []) as { id: string; default_price: number }[]) {
          next[row.id] = Number(row.default_price) || 0
        }
        setSvcPrices(next)
      })
      .finally(() => {
        if (!cancelled) setSvcPricesLoading(false)
      })
    return () => { cancelled = true }
  }, [billingRules])

  const billingPreviewTotal = useMemo(
    () =>
      billingRules.length === 0
        ? 0
        : projectedLabBillingTotal(billingRules, form.panels, form.billing_extra_rule_ids, svcPrices),
    [billingRules, form.panels, form.billing_extra_rule_ids, svcPrices],
  )

  const activeBillingLineCount = useMemo(() => {
    if (billingRules.length === 0) return 0
    return computeActiveRuleIdsForLabResult(
      form.panels,
      billingRules,
      form.billing_extra_rule_ids,
    ).length
  }, [billingRules, form.panels, form.billing_extra_rule_ids])

  const toggleExtraRule = useCallback((id: string) => {
    setForm(f => {
      const cur = f.billing_extra_rule_ids ?? []
      const has = cur.includes(id)
      return { ...f, billing_extra_rule_ids: has ? cur.filter(x => x !== id) : [...cur, id] }
    })
  }, [])

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

      {billingRules.length > 0 && addOnOnly.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Add-on charges</Label>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Optional lines billed with this result when selected. Panel charges follow the panels you tick above.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {addOnOnly.map(r => {
              const checked = extraIds.includes(r.id)
              const qty = Math.max(1, r.quantity ?? 1)
              const unit = svcPrices[r.service_item_id] ?? 0
              const line = unit * qty
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleExtraRule(r.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                    checked
                      ? 'border-emerald-500/55 bg-emerald-500/[0.12] shadow-sm ring-1 ring-emerald-500/15 dark:bg-emerald-500/10 dark:ring-emerald-400/20'
                      : 'border-border/80 bg-muted/20 hover:border-emerald-400/35 hover:bg-muted/40',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                      checked
                        ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500'
                        : 'border-muted-foreground/25 bg-background',
                    )}
                    aria-hidden
                  >
                    {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-xs font-medium leading-tight text-foreground">{r.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {qty > 1 ? `${qty} × ` : ''}
                      Add-on
                    </span>
                  </span>
                  {unit > 0 && (
                    <span className="shrink-0 text-xs font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                      {line.toFixed(2)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

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

      {billingRules.length > 0 && (
        <div className="rounded-xl border border-emerald-300/60 bg-gradient-to-br from-emerald-50/90 to-emerald-100/40 px-4 py-3 dark:border-emerald-800/70 dark:from-emerald-950/50 dark:to-emerald-950/20">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800/90 dark:text-emerald-300/90">
                Current balance (preview)
              </p>
              <p className="text-[10px] text-emerald-900/70 dark:text-emerald-200/60 mt-0.5">
                {activeBillingLineCount === 0
                  ? 'Select panels or add-ons to include charge lines.'
                  : `${activeBillingLineCount} line${activeBillingLineCount === 1 ? '' : 's'} — posts when you save`}
              </p>
            </div>
            <p className="text-xl font-semibold font-mono tabular-nums tracking-tight text-emerald-900 dark:text-emerald-100 min-w-[5rem] text-right">
              {svcPricesLoading && activeBillingLineCount > 0 ? (
                <span className="text-sm font-normal text-emerald-800/70 dark:text-emerald-200/70">…</span>
              ) : (
                billingPreviewTotal.toFixed(2)
              )}
            </p>
          </div>
        </div>
      )}

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
