import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Block, BlockDefinition, RadiologyResultContent } from '../../../types'
import { supabase } from '../../../lib/supabase'
import { Button, Label, Separator, Textarea } from '../../ui'
import { Loader2, Check } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useEncounterStore } from '../../../stores/encounterStore'
import {
  computeActiveRuleIdsForRadiologyResult,
  getCustomChargeRules,
  partitionRadiologyBillingRules,
  projectedRadiologyBillingTotal,
  usesCustomChargeRules,
} from '../../../lib/blockBilling'
import { RADIOLOGY_STUDIES, RADIOLOGY_STUDY_MAP, formatRadiologyCustomLabel } from './radiologyShared'

export function emptyRadiologyResult(): RadiologyResultContent {
  return {
    studies:          [],
    custom_defs:      [],
    technique:        '',
    findings:         '',
    impression:       '',
    recommendations:  '',
  }
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

export function RadiologyResultView({ block }: { block: Block }) {
  const c = { ...emptyRadiologyResult(), ...(block.content as Partial<RadiologyResultContent>) }
  const studyLabels = [
    ...c.studies.map(id => RADIOLOGY_STUDY_MAP[id]?.label ?? id),
    ...c.custom_defs.map(d => formatRadiologyCustomLabel(d)).filter(Boolean),
  ]
  const hasNarrative = !!(c.findings?.trim() || c.impression?.trim() || c.recommendations?.trim() || c.technique?.trim())

  if (!hasNarrative && studyLabels.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No report text entered.</p>
  }

  return (
    <div className="space-y-2 text-sm">
      {studyLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {studyLabels.map((l, i) => (
            <span
              key={i}
              className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/40 text-muted-foreground"
            >
              {l}
            </span>
          ))}
        </div>
      )}
      {c.technique?.trim() && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Technique</p>
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{c.technique}</p>
        </div>
      )}
      {c.findings?.trim() && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Findings</p>
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{c.findings}</p>
        </div>
      )}
      {c.impression?.trim() && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Impression</p>
          <p className="text-[11px] font-medium whitespace-pre-wrap">{c.impression}</p>
        </div>
      )}
      {c.recommendations?.trim() && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Recommendations</p>
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{c.recommendations}</p>
        </div>
      )}
    </div>
  )
}

interface EditProps {
  block:    Block
  onSave:   (c: RadiologyResultContent) => Promise<void>
  onCancel: () => void
}

export function RadiologyResultEdit({ block, onSave, onCancel }: EditProps) {
  const ex = block.content as Partial<RadiologyResultContent>
  const [form, setForm] = useState<RadiologyResultContent>(() => {
    const merged = { ...emptyRadiologyResult(), ...ex }
    return {
      studies:                merged.studies ?? [],
      custom_defs:            merged.custom_defs ?? [],
      technique:              merged.technique ?? '',
      findings:               merged.findings ?? '',
      impression:             merged.impression ?? '',
      recommendations:        merged.recommendations ?? '',
      billing_extra_rule_ids: merged.billing_extra_rule_ids ?? [],
    }
  })
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
  const { addOnOnly } = useMemo(() => partitionRadiologyBillingRules(billingRules), [billingRules])
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
        : projectedRadiologyBillingTotal(
            billingRules,
            form.studies,
            form.billing_extra_rule_ids,
            svcPrices,
          ),
    [billingRules, form.studies, form.billing_extra_rule_ids, svcPrices],
  )

  const activeBillingLineCount = useMemo(() => {
    if (billingRules.length === 0) return 0
    return computeActiveRuleIdsForRadiologyResult(
      form.studies,
      billingRules,
      form.billing_extra_rule_ids,
    ).length
  }, [billingRules, form.studies, form.billing_extra_rule_ids])

  const toggleExtraRule = useCallback((id: string) => {
    setForm(f => {
      const cur = f.billing_extra_rule_ids ?? []
      const has = cur.includes(id)
      return { ...f, billing_extra_rule_ids: has ? cur.filter(x => x !== id) : [...cur, id] }
    })
  }, [])

  const toggleStudy = useCallback((id: string) => {
    setForm(f => {
      const has = f.studies.includes(id)
      return { ...f, studies: has ? f.studies.filter(s => s !== id) : [...f.studies, id] }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const hasCustomFromOrder = form.custom_defs.some(d => d.name.trim())

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Studies (catalog)</Label>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Tick each study reported; billing lines follow your org rules for selected studies.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {RADIOLOGY_STUDIES.map(s => (
            <StudyChip
              key={s.id}
              label={`${s.modality} · ${s.label}`}
              active={form.studies.includes(s.id)}
              onClick={() => toggleStudy(s.id)}
            />
          ))}
        </div>
      </div>

      {hasCustomFromOrder && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Also requested (not in catalog)</Label>
          <div className="flex flex-wrap gap-1">
            {form.custom_defs.filter(d => d.name.trim()).map((d, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground"
              >
                {formatRadiologyCustomLabel(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {billingRules.length > 0 && (
        <div className="rounded-lg border border-border/80 bg-muted/15 px-3 py-2 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Billing preview</p>
            {svcPricesLoading ? (
              <span className="text-[10px] text-muted-foreground">Loading prices…</span>
            ) : (
              <span className="text-xs font-mono tabular-nums text-emerald-800 dark:text-emerald-300">
                {activeBillingLineCount} line{activeBillingLineCount === 1 ? '' : 's'} · {billingPreviewTotal.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}

      {billingRules.length > 0 && addOnOnly.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Add-on charges</Label>
          <p className="text-[10px] text-muted-foreground leading-snug">
            Optional lines billed with this result when selected. Study charges follow the catalog studies you tick above.
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

      <Separator />

      <div className="space-y-1">
        <Label className="text-xs">Technique</Label>
        <Textarea
          rows={2}
          placeholder="e.g. CT chest with IV contrast, 1 mm slices…"
          value={form.technique}
          onChange={e => setForm(f => ({ ...f, technique: e.target.value }))}
          className="text-sm min-h-0"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Findings</Label>
        <Textarea
          rows={5}
          placeholder="Structured findings…"
          value={form.findings}
          onChange={e => setForm(f => ({ ...f, findings: e.target.value }))}
          className="text-sm min-h-0"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Impression</Label>
        <Textarea
          rows={3}
          placeholder="Summary impression…"
          value={form.impression}
          onChange={e => setForm(f => ({ ...f, impression: e.target.value }))}
          className="text-sm min-h-0"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Recommendations (optional)</Label>
        <Textarea
          rows={2}
          placeholder="Follow-up imaging, clinical correlation…"
          value={form.recommendations}
          onChange={e => setForm(f => ({ ...f, recommendations: e.target.value }))}
          className="text-sm min-h-0"
        />
      </div>

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
