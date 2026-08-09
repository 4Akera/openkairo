import { useState, useEffect, useMemo } from 'react'
import { Loader2, Check, FileText, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import * as adminApi from '../../lib/adminUsers'
import { useAuthStore } from '../../stores/authStore'
import type { BlockDefinition, FieldDef, Role } from '../../types'
import {
  Button, Input, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../../components/ui'
import { cn, getDefinitionColors } from '../../lib/utils'
import { SearchSelect } from '../../components/ui/SearchSelect'
import { BlockDefinitionSpecialConfig } from '../../components/settings/BlockDefinitionSpecialConfig'
import { BILLING_SETTINGS_UI_OPTIONS } from '../../components/settings/billing/BillingRulesEditors'
import { ICON_OPTIONS, COLOR_OPTIONS, CAPABILITIES, FieldBuilder } from './blockFieldEditors'

// ============================================================
// Block Definition Form (create / edit)
// ============================================================

const EMPTY_DEF: Partial<BlockDefinition> = {
  name: '', slug: '', registry_slug: null, icon: 'file-text', color: 'blue', description: '',
  cap_media: false, cap_time_series: false,
  cap_immutable: false, cap_co_sign: false, cap_required: false,
  fields: [], time_series_fields: [], config: {},
  is_builtin: false, is_universal: false, is_dept_only: false, visible_to_roles: [],
  default_visible_to_roles: [],
  service_item_id: null, charge_mode: null,
  active: true, sort_order: 100,
}

function ManualBlockFeesSetting({
  form,
  set,
}: {
  form: Partial<BlockDefinition>
  set: (patch: Partial<BlockDefinition>) => void
}) {
  const checked = form.config?.billing?.allow_manual_block_fees === true
  return (
    <label
      className={cn(
        'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
        checked
          ? 'border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
          : 'border-border hover:border-primary/30',
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 w-3.5 h-3.5 shrink-0"
        checked={checked}
        onChange={(e) =>
          set({
            config: {
              ...(form.config ?? {}),
              billing: {
                ...(form.config?.billing ?? {}),
                allow_manual_block_fees: e.target.checked,
              },
            },
          })
        }
      />
      <div>
        <p className="text-xs font-medium">Manual fee lines on block</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          When org billing is on, staff can open “Additional fees” on each timeline entry to add catalogue or custom lines tied to that block.
        </p>
      </div>
    </label>
  )
}

/** Built-in lab_result ships with empty config in schema; prime billing so Settings shows the per-panel rules UI. */
function applyLabResultBillingDefaults(def: BlockDefinition, isBuiltin: boolean): Partial<BlockDefinition> {
  if (!isBuiltin || def.slug !== 'lab_result') return { ...def }
  const b = def.config?.billing
  if (b?.strategy === 'single_service') return { ...def }
  if (!b?.strategy) {
    return {
      ...def,
      config: {
        ...def.config,
        billing: {
          supports_custom_rules: true,
          settings_ui: b?.settings_ui?.trim() || 'lab_panels',
          strategy: 'custom_rules',
          rules: Array.isArray(b?.rules) ? b.rules : [],
        },
      },
      charge_mode: def.charge_mode ?? 'auto',
    }
  }
  if (b.strategy === 'custom_rules') {
    return {
      ...def,
      config: {
        ...def.config,
        billing: {
          supports_custom_rules: true,
          settings_ui: b.settings_ui?.trim() || 'lab_panels',
          strategy: 'custom_rules',
          rules: Array.isArray(b.rules) ? b.rules : [],
        },
      },
      charge_mode: def.charge_mode ?? 'auto',
    }
  }
  return { ...def }
}

/** Built-in radiology_result: per-catalog-study rules UI (same pattern as lab_result). */
function applyRadiologyResultBillingDefaults(def: BlockDefinition, isBuiltin: boolean): Partial<BlockDefinition> {
  if (!isBuiltin || def.slug !== 'radiology_result') return { ...def }
  const b = def.config?.billing
  if (b?.strategy === 'single_service') return { ...def }
  if (!b?.strategy) {
    return {
      ...def,
      config: {
        ...def.config,
        billing: {
          supports_custom_rules: true,
          settings_ui: b?.settings_ui?.trim() || 'radiology_studies',
          strategy: 'custom_rules',
          rules: Array.isArray(b?.rules) ? b.rules : [],
        },
      },
      charge_mode: def.charge_mode ?? 'auto',
    }
  }
  if (b.strategy === 'custom_rules') {
    return {
      ...def,
      config: {
        ...def.config,
        billing: {
          supports_custom_rules: true,
          settings_ui: b.settings_ui?.trim() || 'radiology_studies',
          strategy: 'custom_rules',
          rules: Array.isArray(b.rules) ? b.rules : [],
        },
      },
      charge_mode: def.charge_mode ?? 'auto',
    }
  }
  return { ...def }
}

function applyBuiltinBillingDefaults(def: BlockDefinition, isBuiltin: boolean): Partial<BlockDefinition> {
  if (!isBuiltin) return { ...def }
  if (def.slug === 'lab_result') return applyLabResultBillingDefaults(def, true)
  if (def.slug === 'radiology_result') return applyRadiologyResultBillingDefaults(def, true)
  return { ...def }
}

export function BlockDefinitionModal({
  initial,
  isStandard,
  isBuiltin,
  allRoles,
  allServiceItems,
  allDefs,
  onClose,
  onSaved,
}: {
  initial?: BlockDefinition
  isStandard?: boolean
  isBuiltin?: boolean
  allRoles?: Role[]
  allServiceItems?: { id: string; name: string; code: string; default_price: number }[]
  /** For duplicate slug checks / special panels */
  allDefs?: BlockDefinition[]
  onClose: () => void
  onSaved: (def: BlockDefinition) => void
}) {
  const { user } = useAuthStore()
  const [form, setForm] = useState<Partial<BlockDefinition>>(() =>
    initial
      ? applyBuiltinBillingDefaults(initial, !!isBuiltin)
      : { ...EMPTY_DEF, is_universal: !!isStandard, visible_to_roles: [] },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTsFields, setShowTsFields] = useState(!!initial?.cap_time_series)
  // Progressive disclosure: name/icon/fields is all most blocks need — the
  // capability/department/billing/role machinery stays behind one expander.
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (!initial) return
    setForm(applyBuiltinBillingDefaults(initial, !!isBuiltin))
    setShowTsFields(!!initial.cap_time_series)
  }, [initial, isBuiltin])

  const blockAddRoles = useMemo(
    () => (allRoles ?? []).filter((r) => r.permissions.includes('block.add')),
    [allRoles],
  )
  const isDeptResultBlock = form.config?.dept_role === 'result'

  const set = (patch: Partial<BlockDefinition>) => setForm((f) => ({ ...f, ...patch }))

  const showCustomBilling =
    form.config?.billing?.supports_custom_rules === true ||
    (!!isBuiltin && (initial?.slug === 'lab_result' || initial?.slug === 'radiology_result'))

  const capsLocked = !!(initial?.is_builtin || (initial?.registry_slug && initial.registry_slug.trim()))

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const handleSave = async () => {
    if (!form.name?.trim()) { setError('Name is required'); return }
    if (!form.slug?.trim()) { setError('Slug is required'); return }
    const isCustomBilling = form.config?.billing?.strategy === 'custom_rules'
    if (form.config?.billing?.supports_custom_rules === true) {
      const ui = form.config.billing.settings_ui?.trim()
      if (!ui) {
        setError(
          'Select a rules admin UI (e.g. Lab result per-panel), or turn off “supports custom multi-line billing”.',
        )
        return
      }
    }
    if (isCustomBilling) {
      if (!form.charge_mode) {
        setError('Select a charge mode (auto or confirm) for custom charge rules.')
        return
      }
      if (!(form.config?.billing?.rules?.length)) {
        setError('Add at least one charge rule, or switch to a single service item.')
        return
      }
    }
    setSaving(true)
    setError(null)

    const builtinCustomRulesLegacy =
      isBuiltin &&
      (initial?.slug === 'lab_result' || initial?.slug === 'radiology_result') &&
      form.config?.billing?.strategy === 'custom_rules'
        ? {
            supports_custom_rules: true as const,
            settings_ui:
              initial?.slug === 'radiology_result'
                ? form.config?.billing?.settings_ui?.trim() || 'radiology_studies'
                : form.config?.billing?.settings_ui?.trim() || 'lab_panels',
          }
        : {}
    const configForSave = {
      ...(form.config ?? {}),
      billing: { ...(form.config?.billing ?? {}), ...builtinCustomRulesLegacy },
    }

    const serviceItemId = isCustomBilling ? null : (form.service_item_id ?? null)
    const chargeMode = isCustomBilling ? form.charge_mode : (form.service_item_id ? form.charge_mode : null)

    // For built-in blocks: only update billing fields, visibility and dept flag
    if (isBuiltin && initial) {
      const res = await adminApi.updateStandardBlock(initial.id, {
        service_item_id: serviceItemId,
        charge_mode: chargeMode,
        is_dept_only: form.is_dept_only ?? false,
        visible_to_roles: form.visible_to_roles ?? [],
        default_visible_to_roles: form.default_visible_to_roles ?? [],
        name: form.name?.trim() || initial.name,
        icon: form.icon ?? initial.icon,
        color: form.color ?? initial.color,
        description: form.description?.trim() ?? null,
        config: configForSave,
      })
      setSaving(false)
      if (res.error) { setError(res.error); return }
      onSaved(res.data!)
      return
    }

    const payload = {
      ...form,
      config: configForSave,
      service_item_id: serviceItemId,
      charge_mode: chargeMode,
      created_by: user?.id,
    } as Omit<BlockDefinition, 'id' | 'created_at'>

    if (isStandard) {
      // Standard blocks go through service-role client
      const res = initial
        ? await adminApi.updateStandardBlock(initial.id, payload)
        : await adminApi.createStandardBlock(payload)
      setSaving(false)
      if (res.error) { setError(res.error); return }
      onSaved(res.data!)
      return
    }

    let result
    if (initial) {
      result = await supabase
        .from('block_definitions')
        .update(payload)
        .eq('id', initial.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('block_definitions')
        .insert(payload)
        .select()
        .single()
    }

    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data as BlockDefinition)
  }

  const colors = getDefinitionColors(form.color ?? 'slate')
  const selectedIcon = ICON_OPTIONS.find((i) => i.value === form.icon)
  const IconComp = selectedIcon?.Icon ?? FileText

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[92vh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <div className={cn('h-6 w-6 rounded flex items-center justify-center', colors.iconBg)}>
              <IconComp className="w-3 h-3 text-white" />
            </div>
            {isBuiltin ? `Billing — ${initial?.name ?? 'Built-in Block'}` : (initial ? 'Edit Block Type' : 'New Block Type')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-5 py-1">

            {/* ── Built-in notice + billing-only form ── */}
            {isBuiltin && (
              <>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 flex items-start gap-2">
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border bg-slate-100 border-slate-300 text-slate-600 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400 shrink-0 mt-0.5">Built-in</span>
                  <p className="text-xs text-muted-foreground">
                    Slug and capabilities are fixed. You can customize the display name, icon, color, description, department routing, billing, and visibility.
                  </p>
                </div>

                <section className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Display</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Name</label>
                      <Input
                        value={form.name ?? ''}
                        onChange={(e) => set({ name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Slug (read-only)</label>
                      <Input value={form.slug ?? ''} readOnly className="mt-1 font-mono text-sm opacity-70 cursor-not-allowed" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Description</label>
                    <Input
                      value={form.description ?? ''}
                      onChange={(e) => set({ description: e.target.value })}
                      placeholder="Shown in the Add Block menu"
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Icon</label>
                      <div className="flex flex-wrap gap-1.5">
                        {ICON_OPTIONS.map(({ value, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => set({ icon: value })}
                            className={cn(
                              'p-1.5 rounded border transition-colors',
                              form.icon === value
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border hover:border-primary/50',
                            )}
                            title={value}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                      <div className="flex flex-wrap gap-1.5">
                        {COLOR_OPTIONS.map((color) => {
                          const c = getDefinitionColors(color)
                          return (
                            <button
                              key={color}
                              type="button"
                              onClick={() => set({ color })}
                              className={cn(
                                'w-6 h-6 rounded-full border-2 transition-all',
                                c.iconBg,
                                form.color === color ? 'border-foreground scale-110' : 'border-transparent',
                              )}
                              title={color}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Billing — built-in blocks */}
                <section className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Billing</p>
                  <p className="text-[10px] text-muted-foreground">
                    {showCustomBilling
                      ? 'This block type supports custom multi-line billing. Pick the rules admin UI, then single vs custom. Header shows total; billing lists each line.'
                      : 'Link one service item to charge when this block is added.'}
                  </p>

                  {showCustomBilling && (
                    <div className="space-y-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2">
                      <p className="text-[10px] font-medium text-muted-foreground">Rules admin UI</p>
                      <p className="text-[10px] text-muted-foreground">
                        Stored on the block definition — drives which editor loads for charge rules.
                      </p>
                      <select
                        value={form.config?.billing?.settings_ui ?? ''}
                        onChange={e => {
                          const v = e.target.value.trim()
                          set({
                            config: {
                              ...(form.config ?? {}),
                              billing: {
                                ...(form.config?.billing ?? {}),
                                settings_ui: v || null,
                              },
                            },
                          })
                        }}
                        className="w-full h-8 text-xs rounded-lg border border-border bg-background px-2"
                      >
                        <option value="">— Select —</option>
                        {BILLING_SETTINGS_UI_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {!form.config?.billing?.settings_ui?.trim() && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          Select a rules UI (required). Without it, no rules editor is shown until you choose one and save.
                        </p>
                      )}
                    </div>
                  )}

                  {showCustomBilling ? (
                    <>
                      <div className="flex gap-2">
                        {([
                          { key: 'single' as const, label: 'Single service', desc: 'One catalog item when the block is added' },
                          { key: 'custom' as const, label: 'Custom rules', desc: 'Multiple lines from rules (lab saves sync charges)' },
                        ]).map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            title={opt.desc}
                            onClick={() => {
                              if (opt.key === 'single') {
                                set({
                                  config: {
                                    ...(form.config ?? {}),
                                    billing: {
                                      ...form.config?.billing,
                                      strategy: 'single_service',
                                      rules: [],
                                    },
                                  },
                                })
                              } else {
                                set({
                                  service_item_id: null,
                                  charge_mode: form.charge_mode ?? 'auto',
                                  config: {
                                    ...(form.config ?? {}),
                                    billing: {
                                      ...form.config?.billing,
                                      strategy: 'custom_rules',
                                      rules: form.config?.billing?.rules?.length
                                        ? form.config.billing.rules
                                        : [],
                                    },
                                  },
                                })
                              }
                            }}
                            className={cn(
                              'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                              (form.config?.billing?.strategy === 'custom_rules') === (opt.key === 'custom')
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40',
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {form.config?.billing?.strategy !== 'custom_rules' ? (
                        <div className="space-y-2 pt-1">
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-medium text-muted-foreground">Service Item</p>
                            <SearchSelect
                              items={(allServiceItems ?? []).map(s => ({
                                value: s.id, label: s.name, hint: `${s.default_price.toFixed(2)} · ${s.code}`,
                              }))}
                              value={form.service_item_id ?? ''}
                              onSelect={v => set({ service_item_id: v || null })}
                              placeholder="None — no charge on block creation"
                              clearLabel="None — no charge on block creation"
                              searchPlaceholder="Search service items…"
                              className="w-full rounded-lg"
                            />
                          </div>
                          {form.service_item_id && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-medium text-muted-foreground">Charge Mode</p>
                              <div className="flex gap-2">
                                {([
                                  { value: 'auto', label: 'Auto', desc: 'Charge created immediately with a badge on the block' },
                                  { value: 'confirm', label: 'Confirm', desc: 'Charge created as pending approval (blue badge)' },
                                ] as const).map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    title={opt.desc}
                                    onClick={() => set({ charge_mode: opt.value })}
                                    className={cn(
                                      'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                                      form.charge_mode === opt.value
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-muted-foreground hover:border-primary/40',
                                    )}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {form.charge_mode === 'auto' && 'Charge is created automatically. A green badge shows the amount on the block.'}
                                {form.charge_mode === 'confirm' && 'Charge awaits approval from a billing user. Blue badge shown on the block.'}
                                {!form.charge_mode && 'Select a charge mode.'}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1">
                          <p className="text-[10px] font-medium text-muted-foreground">Charge mode (all lines)</p>
                          <div className="flex gap-2">
                            {([
                              { value: 'auto', label: 'Auto', desc: 'Lines post as approved' },
                              { value: 'confirm', label: 'Confirm', desc: 'Lines await billing approval' },
                            ] as const).map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                title={opt.desc}
                                onClick={() => set({ charge_mode: opt.value })}
                                className={cn(
                                  'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                                  form.charge_mode === opt.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/40',
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Configure rules below. Lab result blocks sync charges when results are saved.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground">Service Item</p>
                        <select
                          value={form.service_item_id ?? ''}
                          onChange={e => set({ service_item_id: e.target.value || null })}
                          className="w-full h-8 text-xs rounded-lg border border-border bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">None — no charge on block creation</option>
                          {(allServiceItems ?? []).map((s) => (
                            <option key={s.id} value={s.id}>{s.name} — {s.default_price.toFixed(2)} ({s.code})</option>
                          ))}
                        </select>
                      </div>
                      {form.service_item_id && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-medium text-muted-foreground">Charge Mode</p>
                          <div className="flex gap-2">
                            {([
                              { value: 'auto', label: 'Auto', desc: 'Charge created immediately with a badge on the block' },
                              { value: 'confirm', label: 'Confirm', desc: 'Charge created as pending approval (blue badge)' },
                            ] as const).map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                title={opt.desc}
                                onClick={() => set({ charge_mode: opt.value })}
                                className={cn(
                                  'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                                  form.charge_mode === opt.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/40',
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {form.charge_mode === 'auto' && 'Charge is created automatically. A green badge shows the amount on the block.'}
                            {form.charge_mode === 'confirm' && 'Charge awaits approval from a billing user. Blue badge shown on the block.'}
                            {!form.charge_mode && 'Select a charge mode.'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <ManualBlockFeesSetting form={form} set={set} />
                </section>

                <Separator />

                {/* Department-only toggle */}
                <section className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Access</p>
                  <label className={cn(
                    'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                    form.is_dept_only ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/30' : 'border-border hover:border-primary/30',
                  )}>
                    <input
                      type="checkbox"
                      className="mt-0.5 w-3.5 h-3.5 shrink-0"
                      checked={!!form.is_dept_only}
                      onChange={(e) => set({ is_dept_only: e.target.checked })}
                    />
                    <div>
                      <p className="text-xs font-medium">Department use only</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Hidden from the "Add Block" menu. Only usable as an order or result block linked to a department service.
                      </p>
                    </div>
                  </label>
                </section>

                <Separator />

                <section className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Department routing</p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">Department role</p>
                    <div className="flex gap-2">
                      {([
                        { value: '', label: 'None', desc: 'Regular block' },
                        { value: 'order', label: 'Order', desc: 'Doctor places on timeline; "Send to dept" button appears' },
                        { value: 'result', label: 'Result', desc: 'Department staff fills in from their workspace' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value || 'none'}
                          type="button"
                          title={opt.desc}
                          onClick={() => set({ config: { ...(form.config ?? {}), dept_role: opt.value || undefined } })}
                          className={cn(
                            'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                            (form.config?.dept_role ?? '') === opt.value
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:border-primary/40',
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {form.config?.dept_role === 'order' && 'Doctors can add this block to an encounter. A "Send to department" action will appear on the block.'}
                      {form.config?.dept_role === 'result' && 'Created by department staff in their workspace when fulfilling an order or doing a direct entry.'}
                      {!form.config?.dept_role && 'Standard block — no department routing.'}
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Role gating for encounter Add Block menu — not applicable to dept result blocks */}
                {blockAddRoles.length > 0 && (
                  isDeptResultBlock ? (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Block is created by department staff in their department workspace — role access is controlled by department membership.
                    </p>
                  ) : (
                    <section className="space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Can Add</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Leave all unchecked to allow every role with block-add permission.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {blockAddRoles.map((role) => {
                          const active = (form.visible_to_roles ?? []).includes(role.slug)
                          return (
                            <label
                              key={role.id}
                              className={cn(
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                                active
                                  ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                                  : 'border-border hover:border-primary/30',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="w-3 h-3"
                                checked={active}
                                onChange={(e) => {
                                  const curr = form.visible_to_roles ?? []
                                  set({
                                    visible_to_roles: e.target.checked
                                      ? [...curr, role.slug]
                                      : curr.filter((s) => s !== role.slug),
                                  })
                                }}
                              />
                              {role.name}
                            </label>
                          )
                        })}
                      </div>
                    </section>
                  )
                )}

                <BlockDefinitionSpecialConfig form={form} set={set} allDefs={allDefs} slug={initial?.slug} allServiceItems={allServiceItems} />

                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={onClose}>Cancel</Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </Button>
                </div>
              </>
            )}

            {/* ── Full form for non-built-in blocks ── */}
            {!isBuiltin && (<>

            {/* ── Basic Info ── */}
            <section className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Basic Info</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Name *</label>
                  <Input
                    value={form.name ?? ''}
                    onChange={(e) => set({ name: e.target.value, slug: initial ? form.slug : autoSlug(e.target.value) })}
                    placeholder="e.g. Consultation Request"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Slug * (unique, no spaces)</label>
                  <Input
                    value={form.slug ?? ''}
                    onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                    placeholder="consultation_request"
                    readOnly={!!initial}
                    className={cn('mt-1 font-mono text-sm', initial && 'opacity-70 cursor-not-allowed')}
                  />
                </div>
              </div>

              {isStandard && initial?.registry_slug?.trim() && (
                <div>
                  <label className="text-xs text-muted-foreground">Renderer key (read-only)</label>
                  <Input
                    value={initial.registry_slug}
                    readOnly
                    className="mt-1 font-mono text-sm opacity-70 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Stored on blocks as your unique slug; the timeline uses this registry key for view/edit.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <Input
                  value={form.description ?? ''}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="Brief description shown in the Add Block menu"
                  className="mt-1"
                />
              </div>

              {/* Icon + Color */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Icon</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ICON_OPTIONS.map(({ value, Icon }) => (
                      <button
                        key={value}
                        onClick={() => set({ icon: value })}
                        className={cn(
                          'p-1.5 rounded border transition-colors',
                          form.icon === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50',
                        )}
                        title={value}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((color) => {
                      const c = getDefinitionColors(color)
                      return (
                        <button
                          key={color}
                          onClick={() => set({ color })}
                          className={cn(
                            'w-6 h-6 rounded-full border-2 transition-all',
                            c.iconBg,
                            form.color === color ? 'border-foreground scale-110' : 'border-transparent',
                          )}
                          title={color}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* ── Advanced expander: capabilities / departments / billing / roles ── */}
            <button
              type="button"
              onClick={() => setShowAdvanced(a => !a)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <SlidersHorizontal className="h-3 w-3" />
              Advanced options
              <span className="font-normal opacity-60">— capabilities, departments, billing, role access</span>
            </button>

            {showAdvanced && (<>

            {/* ── Capabilities ── */}
            <section className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Capabilities</p>
              {capsLocked && (
                <p className="text-[10px] text-muted-foreground">
                  Locked for system built-ins and for variants that share a built-in renderer.
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {CAPABILITIES.map(({ key, label, desc }) => (
                  <label
                    key={key}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-2 transition-colors',
                      capsLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer',
                      form[key] ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30',
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={capsLocked}
                      checked={!!(form[key] as boolean)}
                      onChange={(e) => {
                        set({ [key]: e.target.checked } as Partial<BlockDefinition>)
                        if (key === 'cap_time_series') setShowTsFields(e.target.checked)
                      }}
                      className="mt-0.5 w-3.5 h-3.5"
                    />
                    <div>
                      <p className="text-xs font-medium leading-tight">{label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <Separator />

            {/* ── Department-only flag ── */}
            <section className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Access</p>
              <label className={cn(
                'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                form.is_dept_only ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-700 dark:bg-indigo-950/30' : 'border-border hover:border-primary/30',
              )}>
                <input
                  type="checkbox"
                  className="mt-0.5 w-3.5 h-3.5 shrink-0"
                  checked={!!form.is_dept_only}
                  onChange={(e) => set({ is_dept_only: e.target.checked })}
                />
                <div>
                  <p className="text-xs font-medium">Department use only</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Hidden from the "Add Block" menu. Only usable as an order or result block linked to a department service.
                  </p>
                </div>
              </label>

              {/* dept_role selector — only relevant for dept blocks */}
              <div className="space-y-1.5 pt-0.5">
                <p className="text-[10px] font-medium text-muted-foreground">Department role</p>
                <div className="flex gap-2">
                  {([
                    { value: '', label: 'None', desc: 'Regular block' },
                    { value: 'order', label: 'Order', desc: 'Doctor places on timeline; "Send to dept" button appears' },
                    { value: 'result', label: 'Result', desc: 'Department staff fills in from their workspace' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.desc}
                      onClick={() => set({ config: { ...(form.config ?? {}), dept_role: opt.value || undefined } })}
                      className={cn(
                        'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                        (form.config?.dept_role ?? '') === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {form.config?.dept_role === 'order' && 'Doctors can add this block to an encounter. A "Send to department" action will appear on the block.'}
                  {form.config?.dept_role === 'result' && 'Created by department staff in their workspace when fulfilling an order or doing a direct entry.'}
                  {!form.config?.dept_role && 'Standard block — no department routing.'}
                </p>
              </div>
            </section>

            <Separator />

            {/* ── Billing ── */}
            <section className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Billing</p>

              <label
                className={cn(
                  'flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors',
                  form.config?.billing?.supports_custom_rules
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border hover:border-primary/30',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 w-3.5 h-3.5 shrink-0"
                  checked={!!form.config?.billing?.supports_custom_rules}
                  onChange={(e) => {
                    const on = e.target.checked
                    set({
                      config: {
                        ...(form.config ?? {}),
                        billing: on
                          ? {
                              ...form.config?.billing,
                              supports_custom_rules: true,
                              settings_ui: form.config?.billing?.settings_ui ?? null,
                              strategy: form.config?.billing?.strategy ?? 'single_service',
                              rules: form.config?.billing?.rules ?? [],
                            }
                          : {
                              ...form.config?.billing,
                              supports_custom_rules: false,
                              settings_ui: null,
                              strategy: 'single_service',
                              rules: [],
                            },
                      },
                    })
                  }}
                />
                <div>
                  <p className="text-xs font-medium">Supports custom multi-line billing</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Enables admin rules UI and single vs custom charge modes. Pick a rules admin UI below when this is on.
                  </p>
                </div>
              </label>

              <p className="text-[10px] text-muted-foreground">
                {showCustomBilling
                  ? 'Pick the rules admin UI (stored on the definition), then single vs custom. Header shows total; billing lists each line.'
                  : 'Single service item when the block is added.'}
              </p>

              {showCustomBilling && (
                <div className="space-y-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-muted-foreground">Rules admin UI</p>
                  <p className="text-[10px] text-muted-foreground">
                    Required when custom billing is supported. Must match a registered editor (see codebase registry).
                  </p>
                  <select
                    value={form.config?.billing?.settings_ui ?? ''}
                    onChange={e => {
                      const v = e.target.value.trim()
                      set({
                        config: {
                          ...(form.config ?? {}),
                          billing: {
                            ...(form.config?.billing ?? {}),
                            settings_ui: v || null,
                          },
                        },
                      })
                    }}
                    className="w-full h-8 text-xs rounded-lg border border-border bg-background px-2"
                  >
                    <option value="">— Select —</option>
                    {BILLING_SETTINGS_UI_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {!form.config?.billing?.settings_ui?.trim() && (
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      Select a rules UI before saving (e.g. Lab result per-panel).
                    </p>
                  )}
                </div>
              )}

              {showCustomBilling ? (
                <>
                  <div className="flex gap-2">
                    {([
                      { key: 'single' as const, label: 'Single service', desc: 'One catalog item when the block is added' },
                      { key: 'custom' as const, label: 'Custom rules', desc: 'Multiple lines from configured rules' },
                    ]).map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        title={opt.desc}
                        onClick={() => {
                          if (opt.key === 'single') {
                            set({
                              config: {
                                ...(form.config ?? {}),
                                billing: {
                                  ...form.config?.billing,
                                  strategy: 'single_service',
                                  rules: [],
                                },
                              },
                            })
                          } else {
                            set({
                              service_item_id: null,
                              charge_mode: form.charge_mode ?? 'auto',
                              config: {
                                ...(form.config ?? {}),
                                billing: {
                                  ...form.config?.billing,
                                  strategy: 'custom_rules',
                                  rules: form.config?.billing?.rules?.length ? form.config.billing.rules : [],
                                },
                              },
                            })
                          }
                        }}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                          (form.config?.billing?.strategy === 'custom_rules') === (opt.key === 'custom')
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {form.config?.billing?.strategy !== 'custom_rules' ? (
                    <div className="space-y-2 pt-1">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground">Service Item</p>
                        <select
                          value={form.service_item_id ?? ''}
                          onChange={e => set({ service_item_id: e.target.value || null })}
                          className="w-full h-8 text-xs rounded-lg border border-border bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="">None</option>
                          {(allServiceItems ?? []).map((s: { id: string; name: string; code: string; default_price: number }) => (
                            <option key={s.id} value={s.id}>{s.name} — {s.default_price.toFixed(2)} ({s.code})</option>
                          ))}
                        </select>
                      </div>
                      {form.service_item_id && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-medium text-muted-foreground">Charge Mode</p>
                          <div className="flex gap-2">
                            {([
                              { value: 'auto', label: 'Auto', desc: 'Charge created immediately when block is added' },
                              { value: 'confirm', label: 'Confirm', desc: 'Charge created as pending approval' },
                            ] as const).map(opt => (
                              <button
                                key={opt.value}
                                type="button"
                                title={opt.desc}
                                onClick={() => set({ charge_mode: opt.value })}
                                className={cn(
                                  'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                                  form.charge_mode === opt.value
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:border-primary/40',
                                )}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {form.charge_mode === 'auto' && 'Charge is created automatically with a badge on the block.'}
                            {form.charge_mode === 'confirm' && 'Charge awaits approval from a billing user before becoming active.'}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] font-medium text-muted-foreground">Charge mode (all lines)</p>
                      <div className="flex gap-2">
                        {([
                          { value: 'auto', label: 'Auto', desc: 'Lines post as approved' },
                          { value: 'confirm', label: 'Confirm', desc: 'Lines await billing approval' },
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            title={opt.desc}
                            onClick={() => set({ charge_mode: opt.value })}
                            className={cn(
                              'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                              form.charge_mode === opt.value
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40',
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Add rules in Special settings below. Lab result types sync when results are saved.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium text-muted-foreground">Service Item</p>
                    <select
                      value={form.service_item_id ?? ''}
                      onChange={e => set({ service_item_id: e.target.value || null })}
                      className="w-full h-8 text-xs rounded-lg border border-border bg-background px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="">None</option>
                      {(allServiceItems ?? []).map((s: { id: string; name: string; code: string; default_price: number }) => (
                        <option key={s.id} value={s.id}>{s.name} — {s.default_price.toFixed(2)} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                  {form.service_item_id && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-medium text-muted-foreground">Charge Mode</p>
                      <div className="flex gap-2">
                        {([
                          { value: 'auto', label: 'Auto', desc: 'Charge created immediately when block is added' },
                          { value: 'confirm', label: 'Confirm', desc: 'Charge created as pending approval' },
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            title={opt.desc}
                            onClick={() => set({ charge_mode: opt.value })}
                            className={cn(
                              'flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors',
                              form.charge_mode === opt.value
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-muted-foreground hover:border-primary/40',
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {form.charge_mode === 'auto' && 'Charge is created automatically with a badge on the block.'}
                        {form.charge_mode === 'confirm' && 'Charge awaits approval from a billing user before becoming active.'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <ManualBlockFeesSetting form={form} set={set} />
            </section>

            <Separator />

            {/* ── Encounter role gating (who can add this block type; hidden for dept result) ── */}
            {blockAddRoles.length > 0 && (
              isDeptResultBlock ? (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Block is created by department staff in their department workspace — role access is controlled by department membership.
                </p>
              ) : (
                <>
                  {isStandard && (
                    <>
                      <section className="space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Can Add
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Which roles can add this block type. Leave all unchecked to allow every role with block-add permission.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {blockAddRoles.map((role) => {
                            const active = (form.visible_to_roles ?? []).includes(role.slug)
                            return (
                              <label
                                key={role.id}
                                className={cn(
                                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                                  active
                                    ? 'border-primary/50 bg-primary/10 text-primary font-medium'
                                    : 'border-border hover:border-primary/30',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="w-3 h-3"
                                  checked={active}
                                  onChange={(e) => {
                                    const curr = form.visible_to_roles ?? []
                                    set({
                                      visible_to_roles: e.target.checked
                                        ? [...curr, role.slug]
                                        : curr.filter((s) => s !== role.slug),
                                    })
                                  }}
                                />
                                {role.name}
                              </label>
                            )
                          })}
                        </div>
                      </section>
                    </>
                  )}
                </>
              )
            )}

            </>)} {/* end advanced options */}

            <Separator />

            {/* ── Fields ── */}
            <section>
              <FieldBuilder
                fields={(form.fields as FieldDef[]) ?? []}
                onChange={(f) => set({ fields: f })}
                label="Static Fields (set once at block creation)"
              />
            </section>

            {/* ── Time Series Fields ── */}
            {(form.cap_time_series || showTsFields) && (
              <>
                <Separator />
                <section>
                  <FieldBuilder
                    fields={(form.time_series_fields as FieldDef[]) ?? []}
                    onChange={(f) => set({ time_series_fields: f })}
                    label="Entry Fields (repeated over time)"
                  />
                </section>
              </>
            )}

            <BlockDefinitionSpecialConfig form={form} set={set} allDefs={allDefs} slug={form.slug} allServiceItems={allServiceItems} />

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            </>)} {/* end !isBuiltin */}
          </div>
        </ScrollArea>

        {!isBuiltin && (
          <div className="flex justify-end gap-2 pt-3 border-t mt-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Block Type'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
