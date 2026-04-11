import type { FC } from 'react'
import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { BlockChargeRule, BlockDefinition } from '../../../types'
import { Button } from '../../ui'
import { PANELS } from '../../timeline/blocks/labShared'
import { RADIOLOGY_STUDIES } from '../../timeline/blocks/radiologyShared'

export type BillingRulesEditorProps = {
  form: Partial<BlockDefinition>
  set: (patch: Partial<BlockDefinition>) => void
  allServiceItems?: { id: string; name: string; code: string; default_price: number }[]
}

function newRuleId() {
  return `rule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function patchBillingRules(
  form: Partial<BlockDefinition>,
  set: (patch: Partial<BlockDefinition>) => void,
  next: BlockChargeRule[],
) {
  set({
    config: {
      ...(form.config ?? {}),
      billing: {
        ...(form.config?.billing ?? {}),
        strategy: 'custom_rules',
        rules: next,
      },
    },
  })
}

const PANEL_IDS = new Set(PANELS.map(p => p.id))

function partitionLabRules(rules: BlockChargeRule[]) {
  const byPanel = new Map<string, BlockChargeRule>()
  const other: BlockChargeRule[] = []
  for (const r of rules) {
    const pid = r.match_panel_id?.trim()
    if (pid && PANEL_IDS.has(pid)) {
      if (!byPanel.has(pid)) byPanel.set(pid, { ...r, match_panel_id: pid })
      else other.push(r)
    } else {
      other.push(r)
    }
  }
  return { byPanel, other }
}

function rebuildLabRulesSimple(
  byPanel: Map<string, BlockChargeRule>,
  other: BlockChargeRule[],
  allServiceItems?: { id: string; name: string; default_price: number; code: string }[],
): BlockChargeRule[] {
  const svcName = (id: string) => allServiceItems?.find(s => s.id === id)?.name ?? ''
  const out: BlockChargeRule[] = []
  for (const p of PANELS) {
    const r = byPanel.get(p.id)
    if (r?.service_item_id?.trim()) {
      out.push({
        ...r,
        id: r.id || newRuleId(),
        match_panel_id: p.id,
        quantity: Math.max(1, r.quantity ?? 1),
        label: r.label?.trim() || svcName(r.service_item_id) || p.label,
      })
    }
  }
  out.push(
    ...other.map(r => ({
      ...r,
      match_panel_id: null,
      quantity: Math.max(1, r.quantity ?? 1),
    })),
  )
  return out
}

/** One charge line per catalogue panel (optional) + optional add-on lines. */
export function LabPanelsBillingRulesEditor({ form, set, allServiceItems }: BillingRulesEditorProps) {
  const rules = form.config?.billing?.rules ?? []

  const { byPanel, other } = useMemo(() => partitionLabRules(rules), [rules])

  const svcName = (id: string) => allServiceItems?.find(s => s.id === id)?.name ?? ''

  const commit = (nextBy: Map<string, BlockChargeRule>, nextOther: BlockChargeRule[]) => {
    patchBillingRules(form, set, rebuildLabRulesSimple(nextBy, nextOther, allServiceItems))
  }

  const setPanelEnabled = (panelId: string, enabled: boolean) => {
    const next = new Map(byPanel)
    const rest = [...other]
    if (!enabled) {
      next.delete(panelId)
      commit(next, rest)
      return
    }
    const firstSvc = allServiceItems?.[0]?.id ?? ''
    const sn = svcName(firstSvc)
    next.set(panelId, {
      id: newRuleId(),
      label: sn || PANELS.find(p => p.id === panelId)?.label || panelId,
      service_item_id: firstSvc,
      quantity: 1,
      match_panel_id: panelId,
    })
    commit(next, rest)
  }

  const updatePanelRule = (panelId: string, patch: Partial<BlockChargeRule>) => {
    const next = new Map(byPanel)
    const cur = next.get(panelId)
    if (!cur) return
    const merged = { ...cur, ...patch }
    if (patch.service_item_id !== undefined && !merged.label?.trim()) {
      merged.label = svcName(String(patch.service_item_id)) || merged.label
    }
    next.set(panelId, merged)
    commit(next, [...other])
  }

  const addOn = () => {
    const firstSvc = allServiceItems?.[0]
    const { byPanel: bp, other: oth } = partitionLabRules(rules)
    commit(bp, [
      ...oth,
      {
        id: newRuleId(),
        label: firstSvc?.name ?? 'Add-on',
        service_item_id: firstSvc?.id ?? '',
        quantity: 1,
        match_panel_id: null,
      },
    ])
  }

  const updateOther = (index: number, patch: Partial<BlockChargeRule>) => {
    const next = other.map((r, i) => (i === index ? { ...r, ...patch } : r))
    const rebuilt = rebuildLabRulesSimple(byPanel, next, allServiceItems)
    patchBillingRules(form, set, rebuilt)
  }

  const removeOther = (index: number) => {
    patchBillingRules(
      form,
      set,
      rebuildLabRulesSimple(byPanel, other.filter((_, i) => i !== index), allServiceItems),
    )
  }

  const hasDupes = other.some(
    r => r.match_panel_id?.trim() && PANEL_IDS.has(r.match_panel_id.trim()),
  )

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground">
        Configure one fee line per lab panel when that panel is selected on the result block. Add-ons have no panel — staff tick them in the result editor.
      </p>

      {hasDupes && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30 px-2 py-1.5">
          Extra rules that share a panel with an assigned row appear below — remove or merge them.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">By panel</p>
        <div className="space-y-2 max-h-[min(50vh,22rem)] overflow-y-auto pr-1">
          {PANELS.map(panel => {
            const r = byPanel.get(panel.id)
            const enabled = !!r
            return (
              <div
                key={panel.id}
                className="rounded-lg border bg-card p-2.5 space-y-2"
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 w-3.5 h-3.5 shrink-0 rounded border-border"
                    checked={enabled}
                    onChange={e => setPanelEnabled(panel.id, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight">{panel.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{panel.id}</p>
                  </div>
                </label>
                {enabled && r && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6 border-l-2 border-muted">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Service item</label>
                      <select
                        value={r.service_item_id}
                        onChange={e => updatePanelRule(panel.id, { service_item_id: e.target.value })}
                        className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                      >
                        <option value="">Select…</option>
                        {(allServiceItems ?? []).map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.default_price.toFixed(2)} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={r.quantity ?? 1}
                        onChange={e =>
                          updatePanelRule(panel.id, {
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-medium text-muted-foreground">Charge line label</label>
                      <input
                        value={r.label}
                        onChange={e => updatePanelRule(panel.id, { label: e.target.value })}
                        className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                        placeholder="Shown on invoice / billing"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Optional add-ons
        </p>
        <p className="text-[10px] text-muted-foreground">
          Not tied to a panel — user enables each add-on in the lab result block.
        </p>
        {other.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No add-ons</p>
        ) : (
          <div className="space-y-2">
            {other.map((rule, index) => (
              <AddonRuleRow
                key={rule.id}
                rule={rule}
                allServiceItems={allServiceItems}
                onChange={patch => updateOther(index, patch)}
                onRemove={() => removeOther(index)}
              />
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addOn}>
          <Plus className="h-3 w-3" /> Add add-on line
        </Button>
      </div>

      {rules.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Enable at least one panel or add an add-on, or switch billing to a single service item.
        </p>
      )}
    </div>
  )
}

const RADIOLOGY_STUDY_IDS = new Set(RADIOLOGY_STUDIES.map(s => s.id))

function partitionRadiologyRules(rules: BlockChargeRule[]) {
  const byStudy = new Map<string, BlockChargeRule>()
  const other: BlockChargeRule[] = []
  for (const r of rules) {
    const sid = r.match_panel_id?.trim()
    if (sid && RADIOLOGY_STUDY_IDS.has(sid)) {
      if (!byStudy.has(sid)) byStudy.set(sid, { ...r, match_panel_id: sid })
      else other.push(r)
    } else {
      other.push(r)
    }
  }
  return { byStudy, other }
}

function rebuildRadiologyRulesSimple(
  byStudy: Map<string, BlockChargeRule>,
  other: BlockChargeRule[],
  allServiceItems?: { id: string; name: string; default_price: number; code: string }[],
): BlockChargeRule[] {
  const svcName = (id: string) => allServiceItems?.find(s => s.id === id)?.name ?? ''
  const out: BlockChargeRule[] = []
  for (const s of RADIOLOGY_STUDIES) {
    const r = byStudy.get(s.id)
    if (r?.service_item_id?.trim()) {
      out.push({
        ...r,
        id: r.id || newRuleId(),
        match_panel_id: s.id,
        quantity: Math.max(1, r.quantity ?? 1),
        label: r.label?.trim() || svcName(r.service_item_id) || s.label,
      })
    }
  }
  out.push(
    ...other.map(r => ({
      ...r,
      match_panel_id: null,
      quantity: Math.max(1, r.quantity ?? 1),
    })),
  )
  return out
}

/** One charge line per catalog imaging study (optional) + optional add-on lines — mirrors lab_panels. */
export function RadiologyStudiesBillingRulesEditor({ form, set, allServiceItems }: BillingRulesEditorProps) {
  const rules = form.config?.billing?.rules ?? []

  const { byStudy, other } = useMemo(() => partitionRadiologyRules(rules), [rules])

  const svcName = (id: string) => allServiceItems?.find(s => s.id === id)?.name ?? ''

  const commit = (nextBy: Map<string, BlockChargeRule>, nextOther: BlockChargeRule[]) => {
    patchBillingRules(form, set, rebuildRadiologyRulesSimple(nextBy, nextOther, allServiceItems))
  }

  const setStudyEnabled = (studyId: string, enabled: boolean) => {
    const next = new Map(byStudy)
    const rest = [...other]
    if (!enabled) {
      next.delete(studyId)
      commit(next, rest)
      return
    }
    const firstSvc = allServiceItems?.[0]?.id ?? ''
    const sn = svcName(firstSvc)
    const st = RADIOLOGY_STUDIES.find(x => x.id === studyId)
    next.set(studyId, {
      id: newRuleId(),
      label: sn || st?.label || studyId,
      service_item_id: firstSvc,
      quantity: 1,
      match_panel_id: studyId,
    })
    commit(next, rest)
  }

  const updateStudyRule = (studyId: string, patch: Partial<BlockChargeRule>) => {
    const next = new Map(byStudy)
    const cur = next.get(studyId)
    if (!cur) return
    const merged = { ...cur, ...patch }
    if (patch.service_item_id !== undefined && !merged.label?.trim()) {
      merged.label = svcName(String(patch.service_item_id)) || merged.label
    }
    next.set(studyId, merged)
    commit(next, [...other])
  }

  const addOn = () => {
    const firstSvc = allServiceItems?.[0]
    const { byStudy: bs, other: oth } = partitionRadiologyRules(rules)
    commit(bs, [
      ...oth,
      {
        id: newRuleId(),
        label: firstSvc?.name ?? 'Add-on',
        service_item_id: firstSvc?.id ?? '',
        quantity: 1,
        match_panel_id: null,
      },
    ])
  }

  const updateOther = (index: number, patch: Partial<BlockChargeRule>) => {
    const next = other.map((r, i) => (i === index ? { ...r, ...patch } : r))
    const rebuilt = rebuildRadiologyRulesSimple(byStudy, next, allServiceItems)
    patchBillingRules(form, set, rebuilt)
  }

  const removeOther = (index: number) => {
    patchBillingRules(
      form,
      set,
      rebuildRadiologyRulesSimple(byStudy, other.filter((_, i) => i !== index), allServiceItems),
    )
  }

  const hasDupes = other.some(
    r => r.match_panel_id?.trim() && RADIOLOGY_STUDY_IDS.has(r.match_panel_id.trim()),
  )

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground">
        Configure one fee line per imaging study when that study is selected on the result block. Add-ons have no study — staff tick them in the result editor.
      </p>

      {hasDupes && (
        <p className="text-[10px] text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30 px-2 py-1.5">
          Extra rules that share a study with an assigned row appear below — remove or merge them.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">By study</p>
        <div className="space-y-2 max-h-[min(50vh,22rem)] overflow-y-auto pr-1">
          {RADIOLOGY_STUDIES.map(study => {
            const r = byStudy.get(study.id)
            const enabled = !!r
            return (
              <div
                key={study.id}
                className="rounded-lg border bg-card p-2.5 space-y-2"
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 w-3.5 h-3.5 shrink-0 rounded border-border"
                    checked={enabled}
                    onChange={e => setStudyEnabled(study.id, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight">
                      {study.modality} · {study.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">{study.id}</p>
                  </div>
                </label>
                {enabled && r && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6 border-l-2 border-muted">
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Service item</label>
                      <select
                        value={r.service_item_id}
                        onChange={e => updateStudyRule(study.id, { service_item_id: e.target.value })}
                        className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                      >
                        <option value="">Select…</option>
                        {(allServiceItems ?? []).map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} — {s.default_price.toFixed(2)} ({s.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        value={r.quantity ?? 1}
                        onChange={e =>
                          updateStudyRule(study.id, {
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-medium text-muted-foreground">Charge line label</label>
                      <input
                        value={r.label}
                        onChange={e => updateStudyRule(study.id, { label: e.target.value })}
                        className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
                        placeholder="Shown on invoice / billing"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Optional add-ons
        </p>
        <p className="text-[10px] text-muted-foreground">
          Not tied to a catalog study — user enables each add-on in the radiology result block.
        </p>
        {other.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">No add-ons</p>
        ) : (
          <div className="space-y-2">
            {other.map((rule, index) => (
              <AddonRuleRow
                key={rule.id}
                rule={rule}
                allServiceItems={allServiceItems}
                onChange={patch => updateOther(index, patch)}
                onRemove={() => removeOther(index)}
              />
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addOn}>
          <Plus className="h-3 w-3" /> Add add-on line
        </Button>
      </div>

      {rules.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Enable at least one study or add an add-on, or switch billing to a single service item.
        </p>
      )}
    </div>
  )
}

function AddonRuleRow({
  rule,
  allServiceItems,
  onChange,
  onRemove,
}: {
  rule: BlockChargeRule
  allServiceItems?: { id: string; name: string; code: string; default_price: number }[]
  onChange: (p: Partial<BlockChargeRule>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Line label</label>
          <input
            value={rule.label}
            onChange={e => onChange({ label: e.target.value })}
            className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground">Service item</label>
          <select
            value={rule.service_item_id}
            onChange={e => onChange({ service_item_id: e.target.value })}
            className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
          >
            <option value="">Select…</option>
            {(allServiceItems ?? []).map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.default_price.toFixed(2)} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="w-24">
          <label className="text-[10px] font-medium text-muted-foreground">Qty</label>
          <input
            type="number"
            min={1}
            value={rule.quantity ?? 1}
            onChange={e =>
              onChange({ quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
            }
            className="mt-0.5 w-full h-8 text-xs rounded-md border border-border bg-background px-2"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3 mr-1" /> Remove
        </Button>
      </div>
    </div>
  )
}

export const BILLING_SETTINGS_UI_REGISTRY: Record<string, FC<BillingRulesEditorProps>> = {
  lab_panels:        LabPanelsBillingRulesEditor,
  radiology_studies: RadiologyStudiesBillingRulesEditor,
}

export const BILLING_SETTINGS_UI_OPTIONS: { value: string; label: string }[] = [
  { value: 'lab_panels',        label: 'Lab result (per-panel + add-ons)' },
  { value: 'radiology_studies', label: 'Radiology result (per study + add-ons)' },
]

export type ResolvedBillingSettingsUi = {
  Editor: FC<BillingRulesEditorProps> | null
  effectiveKey: string | null
  problem: 'missing_key' | 'unknown_key' | null
}

export function resolveBillingSettingsUi(key: string | null | undefined): ResolvedBillingSettingsUi {
  const k = key?.trim()
  if (!k) {
    return { Editor: null, effectiveKey: null, problem: 'missing_key' }
  }
  const Registered = BILLING_SETTINGS_UI_REGISTRY[k]
  if (Registered) {
    return { Editor: Registered, effectiveKey: k, problem: null }
  }
  return { Editor: null, effectiveKey: k, problem: 'unknown_key' }
}
