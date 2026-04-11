import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, Search,
  User, Blocks, ChevronDown, ChevronUp, X, GripVertical, Check,
  ShieldCheck, Users, Shield, Globe, LayoutTemplate, Building2,
  ChevronLeft, ChevronRight, Eye, EyeOff, Edit2, FileText,
  ClipboardList, Stethoscope, Activity, Heart, Brain,
  TestTube, Zap, Clock, AlertTriangle, ArrowRight, Camera,
  BarChart2, Clipboard, FlaskConical, Pill, Star, Layers, CheckCheck, Pin, Settings2, Calendar, Sun, Moon, Info, Copy,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as adminApi from '../lib/adminUsers'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { DateFormat, TimeFormat } from '../stores/settingsStore'
import { useThemeStore } from '../stores/themeStore'
import type { BlockDefinition, FieldDef, FieldType, Role, UserWithRoles, Permission, EncounterTemplate, TemplateBlock, PatientFieldDefinition, PatientFieldOption, Department, DepartmentMember, DepartmentBlockType, UserBlockTemplate } from '../types'
import { PERMISSIONS, PERMISSION_LABELS } from '../types'
import type { NameFormat } from '../types'
import {
  Button, Input, Badge, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea, Label,
} from '../components/ui'
import { cn, getDefinitionColors } from '../lib/utils'
import { DynamicBlockEdit } from '../components/timeline/DynamicBlock'
import { BLOCK_REGISTRY, registryRenderKey } from '../components/timeline/BlockRegistry'
import { BlockDefinitionSpecialConfig } from '../components/settings/BlockDefinitionSpecialConfig'
import { BILLING_SETTINGS_UI_OPTIONS } from '../components/settings/billing/BillingRulesEditors'
import { blockDefinitionHasCharging } from '../lib/blockBilling'
import { filterPatientFieldsBeforeBloodGroup } from '../lib/patientFieldVisibility'
import type { Block } from '../types'

// ============================================================
// Icon + color options
// ============================================================

const ICON_OPTIONS = [
  { value: 'file-text', label: 'Note', Icon: FileText },
  { value: 'clipboard-list', label: 'List', Icon: ClipboardList },
  { value: 'stethoscope', label: 'Exam', Icon: Stethoscope },
  { value: 'activity', label: 'Activity', Icon: Activity },
  { value: 'heart', label: 'Heart', Icon: Heart },
  { value: 'brain', label: 'Brain', Icon: Brain },
  { value: 'test-tube', label: 'Lab', Icon: TestTube },
  { value: 'zap', label: 'Action', Icon: Zap },
  { value: 'clock', label: 'Time', Icon: Clock },
  { value: 'alert-triangle', label: 'Alert', Icon: AlertTriangle },
  { value: 'arrow-right', label: 'Transfer', Icon: ArrowRight },
  { value: 'camera', label: 'Camera', Icon: Camera },
  { value: 'bar-chart-2', label: 'Chart', Icon: BarChart2 },
  { value: 'clipboard', label: 'Clipboard', Icon: Clipboard },
  { value: 'flask-conical', label: 'Flask', Icon: FlaskConical },
  { value: 'pill', label: 'Pill', Icon: Pill },
  { value: 'star', label: 'Star', Icon: Star },
  { value: 'layers', label: 'Layers', Icon: Layers },
  { value: 'check-check', label: 'Ack', Icon: CheckCheck },
]

const COLOR_OPTIONS = [
  'blue', 'purple', 'green', 'amber', 'red', 'slate',
  'cyan', 'orange', 'pink', 'indigo', 'teal',
]

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'section_header', label: '── Section Header ──' },
]

const CAPABILITIES: { key: keyof BlockDefinition; label: string; desc: string }[] = [
  { key: 'cap_media',       label: 'Media',       desc: 'Allow file & photo attachments' },
  { key: 'cap_time_series', label: 'Time Series',  desc: 'Recurring timestamped entries (e.g. vitals, DKA)' },
  { key: 'cap_immutable',   label: 'Immutable',    desc: 'Block cannot be edited after creation' },
  { key: 'cap_co_sign',     label: 'Co-Sign',      desc: 'Requires a second provider co-signature' },
  { key: 'cap_required',    label: 'Required',     desc: 'Must be completed before the encounter can close' },
]

// ============================================================
// Field Builder
// ============================================================

function FieldBuilder({
  fields,
  onChange,
  label = 'Fields',
}: {
  fields: FieldDef[]
  onChange: (fields: FieldDef[]) => void
  label?: string
}) {
  const addField = () => {
    const id = `field_${Date.now()}`
    onChange([...fields, { id, label: '', type: 'text' }])
  }

  const update = (index: number, patch: Partial<FieldDef>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  const remove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
        <Button size="sm" variant="outline" onClick={addField} className="h-6 text-xs gap-1">
          <Plus className="w-3 h-3" /> Add Field
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">
          No fields yet. Click "Add Field" to start.
        </p>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => (
          <FieldRow
            key={index}
            field={field}
            onChange={(patch) => update(index, patch)}
            onRemove={() => remove(index)}
          />
        ))}
      </div>
    </div>
  )
}

function FieldRow({
  field,
  onChange,
  onRemove,
}: {
  field: FieldDef
  onChange: (patch: Partial<FieldDef>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const needsOptions = field.type === 'select' || field.type === 'multiselect'

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
        <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
        <Input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Field label"
          className="h-6 text-xs flex-1"
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          className="h-6 text-xs px-1 rounded border border-border bg-background w-32 shrink-0"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button onClick={() => setExpanded((p) => !p)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-red-500">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded options */}
      {expanded && field.type !== 'section_header' && (
        <div className="px-3 py-2 space-y-2 border-t border-border/50 bg-background">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Field ID (slug)</label>
              <Input
                value={field.id}
                onChange={(e) => onChange({ id: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="field_id"
                className="h-6 text-xs mt-0.5"
              />
            </div>
            {field.type === 'number' && (
              <div>
                <label className="text-[10px] text-muted-foreground">Unit</label>
                <Input
                  value={field.unit ?? ''}
                  onChange={(e) => onChange({ unit: e.target.value })}
                  placeholder="e.g. mmHg"
                  className="h-6 text-xs mt-0.5"
                />
              </div>
            )}
            {field.type === 'textarea' && (
              <div>
                <label className="text-[10px] text-muted-foreground">Rows</label>
                <Input
                  type="number"
                  value={field.rows ?? 3}
                  onChange={(e) => onChange({ rows: Number(e.target.value) })}
                  className="h-6 text-xs mt-0.5"
                  min={2}
                  max={10}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={!!field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="w-3.5 h-3.5"
              />
              Required
            </label>
          </div>

          {needsOptions && (
            <OptionsEditor
              options={field.options ?? []}
              onChange={(opts) => onChange({ options: opts })}
            />
          )}
        </div>
      )}
    </div>
  )
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string }[]
  onChange: (opts: { value: string; label: string }[]) => void
}) {
  const add = () => onChange([...options, { value: '', label: '' }])
  const update = (i: number, patch: Partial<{ value: string; label: string }>) =>
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground">Options</p>
        <button onClick={add} className="text-[10px] text-primary hover:underline">+ Add option</button>
      </div>
      {options.map((opt, i) => (
        <div key={i} className="flex gap-1 items-center">
          <Input
            value={opt.label}
            onChange={(e) => update(i, { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
            placeholder="Label"
            className="h-5 text-xs flex-1"
          />
          <Input
            value={opt.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="value"
            className="h-5 text-xs w-24"
          />
          <button onClick={() => remove(i)} className="text-muted-foreground hover:text-red-500 shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}

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

function BlockDefinitionModal({
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

  useEffect(() => {
    if (!initial) return
    setForm(applyBuiltinBillingDefaults(initial, !!isBuiltin))
    setShowTsFields(!!initial.cap_time_series)
  }, [initial?.id, isBuiltin])

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
                        { value: 'result', label: 'Result', desc: 'Department staff fills in via portal' },
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
                      {form.config?.dept_role === 'result' && 'Created by department staff via the portal when fulfilling an order or doing a direct entry.'}
                      {!form.config?.dept_role && 'Standard block — no department routing.'}
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Role gating for encounter Add Block menu — not applicable to dept result blocks */}
                {blockAddRoles.length > 0 && (
                  isDeptResultBlock ? (
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Block is created by department staff via the portal — role access is controlled by department membership.
                    </p>
                  ) : (
                    <>
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

                      <Separator />

                      <section className="space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Default View</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            When added to an encounter, the block will start restricted to these roles. Leave all unchecked for all staff.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {blockAddRoles.map((role) => {
                            const active = (form.default_visible_to_roles ?? []).includes(role.slug)
                            return (
                              <label
                                key={role.id}
                                className={cn(
                                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                                  active
                                    ? 'border-amber-500/60 bg-amber-50 text-amber-700 font-medium'
                                    : 'border-border hover:border-amber-300',
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="w-3 h-3"
                                  checked={active}
                                  onChange={(e) => {
                                    const curr = form.default_visible_to_roles ?? []
                                    set({
                                      default_visible_to_roles: e.target.checked
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
                    { value: 'result', label: 'Result', desc: 'Department staff fills in via portal' },
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
                  {form.config?.dept_role === 'result' && 'Created by department staff via the portal when fulfilling an order or doing a direct entry.'}
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

            {/* ── Encounter role gating (standard: Role Visibility + default privacy; hidden for dept result) ── */}
            {blockAddRoles.length > 0 && (
              isDeptResultBlock ? (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Block is created by department staff via the portal — role access is controlled by department membership.
                </p>
              ) : (
                <>
                  {isStandard && (
                    <>
                      <section className="space-y-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Role Visibility
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Leave all unchecked to show this block to every role that can add blocks.
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
                      <Separator />
                    </>
                  )}

                  <section className="space-y-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Default Block Privacy
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        When this block type is added to an encounter, it will start with these privacy settings. Staff can still change them per-block.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {blockAddRoles.map((role) => {
                        const active = (form.default_visible_to_roles ?? []).includes(role.slug)
                        return (
                          <label
                            key={role.id}
                            className={cn(
                              'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                              active
                                ? 'border-amber-500/60 bg-amber-50 text-amber-700 font-medium'
                                : 'border-border hover:border-amber-300',
                            )}
                          >
                            <input
                              type="checkbox"
                              className="w-3 h-3"
                              checked={active}
                              onChange={(e) => {
                                const curr = form.default_visible_to_roles ?? []
                                set({
                                  default_visible_to_roles: e.target.checked
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
              )
            )}

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

// ============================================================
// Block Preferences — system + standard block picker
// ============================================================

function QuickAccessSection() {
  const { preferredBlocks, updatePreferredBlocks, roleSlugs } = useAuthStore()
  const [allDefs, setAllDefs]   = useState<BlockDefinition[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(preferredBlocks))
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => { setSelected(new Set(preferredBlocks)) }, [preferredBlocks])

  useEffect(() => {
    Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .eq('is_builtin', true)
        .eq('active', true)
        .eq('is_dept_only', false)
        .order('sort_order', { ascending: true }),
      supabase
        .from('block_definitions')
        .select('*')
        .eq('is_universal', true)
        .eq('active', true)
        .eq('is_dept_only', false)
        .not('is_builtin', 'is', true)
        .order('sort_order', { ascending: true }),
    ]).then(([sys, std]) => {
      const merged = [
        ...((sys.data ?? []) as BlockDefinition[]),
        ...((std.data ?? []) as BlockDefinition[]),
      ].filter((d) =>
        d.visible_to_roles.length === 0 || d.visible_to_roles.some((r: string) => roleSlugs.includes(r)),
      )
      setAllDefs(merged)
      setLoading(false)
    })
  }, [roleSlugs])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const save = async () => {
    setSaving(true)
    await updatePreferredBlocks([...selected])
    setSaving(false)
  }

  const isDirty = JSON.stringify([...selected].sort()) !== JSON.stringify([...preferredBlocks].sort())

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Block Preferences</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose which system blocks appear in your Add Block menu. Leave all unchecked to show every block.
          </p>
        </div>
        {isDirty && (
          <Button size="sm" onClick={save} disabled={saving} className="shrink-0">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Save
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : allDefs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No blocks available yet.</p>
      ) : (
        <div className="space-y-4">
          {allDefs.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {allDefs.map(def => (
                <BlockToggleCard key={def.id} def={def} on={selected.has(def.id)} onToggle={toggle} />
              ))}
            </div>
          )}
        </div>
      )}

      {selected.size > 0 && (
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          Clear selection (show all blocks)
        </button>
      )}
    </div>
  )
}

function BlockToggleCard({
  def,
  on,
  onToggle,
}: {
  def: BlockDefinition
  on: boolean
  onToggle: (id: string) => void
}) {
  const colors = getDefinitionColors(def.color)
  return (
    <button
      type="button"
      onClick={() => onToggle(def.id)}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all',
        on
          ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border hover:border-primary/30 hover:bg-accent/40',
      )}
    >
      <div className={cn('h-7 w-7 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
        <span className="text-white text-[10px] font-bold">{def.name[0]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{def.name}</p>
        {def.description && (
          <p className="text-[10px] text-muted-foreground truncate">{def.description}</p>
        )}
      </div>
      <div className={cn(
        'h-4 w-4 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors',
        on ? 'bg-primary border-primary' : 'border-muted-foreground/40',
      )}>
        {on && <CheckCheck className="h-2.5 w-2.5 text-white" />}
      </div>
    </button>
  )
}

// ============================================================
// Block Templates Section
// ============================================================

function makeSyntheticBlock(def: BlockDefinition, content: Record<string, unknown>): Block {
  return {
    id: 'template-preview',
    encounter_id: null,
    department_id: null,
    department_block_type_id: null,
    patient_id: null,
    type: def.slug,
    content,
    state: 'active',
    sequence_order: 0,
    supersedes_block_id: null,
    locked_by: null,
    locked_at: null,
    author_name: null,
    definition_id: def.id,
    is_template_seed: true,
    is_pinned: false,
    visible_to_roles: [],
    share_to_record: false,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function BlockTemplatesSection() {
  const { user, roleSlugs, preferredBlocks } = useAuthStore()
  const [defs, setDefs]               = useState<BlockDefinition[]>([])
  const [templates, setTemplates]     = useState<UserBlockTemplate[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedDef, setSelectedDef] = useState<BlockDefinition | null>(null)
  const [modalOpen, setModalOpen]     = useState(false)
  const [editing, setEditing]         = useState<UserBlockTemplate | null>(null)
  const [tplName, setTplName]         = useState('')
  const [tplContent, setTplContent]   = useState<Record<string, unknown>>({})
  const [tplDefault, setTplDefault]   = useState(false)
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .eq('active', true)
        .eq('is_dept_only', false)
        .order('sort_order'),
      supabase
        .from('user_block_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order'),
    ]).then(([defsRes, tplRes]) => {
      const allDefs = (defsRes.data ?? []) as BlockDefinition[]
      const filtered = allDefs.filter((d) => {
        if (d.is_dept_only) return false
        if (d.visible_to_roles.length > 0 && !d.visible_to_roles.some((r) => roleSlugs.includes(r))) return false
        if (preferredBlocks.length > 0 && !preferredBlocks.includes(d.id)) return false
        return true
      })
      setDefs(filtered)
      setTemplates((tplRes.data ?? []) as UserBlockTemplate[])
      setLoading(false)
    })
  }, [user, roleSlugs, preferredBlocks])

  const openNew = (def: BlockDefinition) => {
    setSelectedDef(def)
    setEditing(null)
    setTplName('')
    setTplDefault(false)
    const registry = BLOCK_REGISTRY[registryRenderKey(def)]
    if (registry) {
      setTplContent(registry.emptyContent())
    } else {
      const init: Record<string, unknown> = {}
      def.fields.forEach((f) => {
        if (f.type === 'checkbox') init[f.id] = false
        else if (f.type === 'multiselect') init[f.id] = []
        else if (f.type !== 'section_header') init[f.id] = ''
      })
      setTplContent(init)
    }
    setModalOpen(true)
  }

  const openEdit = (tpl: UserBlockTemplate, def: BlockDefinition) => {
    setSelectedDef(def)
    setEditing(tpl)
    setTplName(tpl.name)
    setTplContent(tpl.content)
    setTplDefault(tpl.is_default)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!user || !selectedDef || !tplName.trim()) return
    setSaving(true)

    // If setting as default, clear any existing default for this def first
    if (tplDefault) {
      await supabase
        .from('user_block_templates')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('definition_id', selectedDef.id)
        .neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000')
      setTemplates((prev) =>
        prev.map((t) =>
          t.definition_id === selectedDef.id && t.id !== editing?.id
            ? { ...t, is_default: false }
            : t,
        ),
      )
    }

    if (editing) {
      const { data } = await supabase
        .from('user_block_templates')
        .update({ name: tplName.trim(), content: tplContent, is_default: tplDefault })
        .eq('id', editing.id)
        .select().single()
      if (data) setTemplates((prev) => prev.map((t) => t.id === editing.id ? data as UserBlockTemplate : t))
    } else {
      const { data } = await supabase
        .from('user_block_templates')
        .insert({ user_id: user.id, definition_id: selectedDef.id, name: tplName.trim(), content: tplContent, is_default: tplDefault, sort_order: templates.length })
        .select().single()
      if (data) setTemplates((prev) => [...prev, data as UserBlockTemplate])
    }
    setSaving(false)
    setModalOpen(false)
  }

  const handleDelete = async (tpl: UserBlockTemplate) => {
    await supabase.from('user_block_templates').delete().eq('id', tpl.id)
    setTemplates((prev) => prev.filter((t) => t.id !== tpl.id))
  }

  const handleToggleDefault = async (tpl: UserBlockTemplate) => {
    const next = !tpl.is_default
    // Clear existing default for this def if enabling
    if (next) {
      await supabase
        .from('user_block_templates')
        .update({ is_default: false })
        .eq('user_id', user!.id)
        .eq('definition_id', tpl.definition_id)
      setTemplates((prev) =>
        prev.map((t) => t.definition_id === tpl.definition_id ? { ...t, is_default: false } : t),
      )
    }
    await supabase.from('user_block_templates').update({ is_default: next }).eq('id', tpl.id)
    setTemplates((prev) => prev.map((t) => t.id === tpl.id ? { ...t, is_default: next } : t))
  }

  const templatesByDef = templates.reduce<Record<string, UserBlockTemplate[]>>((acc, t) => {
    ;(acc[t.definition_id] ??= []).push(t)
    return acc
  }, {})

  const defsWithTemplates = defs.filter((d) => (templatesByDef[d.id]?.length ?? 0) > 0)
  const defsWithout       = defs.filter((d) => (templatesByDef[d.id]?.length ?? 0) === 0)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Content Templates</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pre-fill block content when adding to an encounter. Mark a template as <strong>Auto-apply</strong> to skip the picker and add instantly.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      ) : defs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No block types available.</p>
      ) : (
        <div className="space-y-3">
          {/* Blocks that already have templates */}
          {defsWithTemplates.map((def) => {
            const colors = getDefinitionColors(def.color)
            const tpls   = templatesByDef[def.id] ?? []
            return (
              <div key={def.id} className="border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2 bg-muted/30 border-b">
                  <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
                    <FileText className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-xs font-medium flex-1">{def.name}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => openNew(def)}>
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
                <div className="divide-y">
                  {tpls.map((tpl) => (
                    <div key={tpl.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-xs">{tpl.name}</span>
                        {tpl.is_default && (
                          <span className="ml-1.5 text-[9px] px-1.5 py-px rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                            Auto-apply
                          </span>
                        )}
                      </div>
                      {/* Auto-apply toggle */}
                      <button
                        title={tpl.is_default ? 'Disable auto-apply' : 'Set as auto-apply'}
                        onClick={() => handleToggleDefault(tpl)}
                        className={cn(
                          'p-1 rounded text-xs transition-colors shrink-0',
                          tpl.is_default
                            ? 'text-primary hover:text-primary/70'
                            : 'text-muted-foreground/40 hover:text-muted-foreground',
                        )}
                      >
                        <Zap className={cn('w-3.5 h-3.5', tpl.is_default && 'fill-current')} />
                      </button>
                      <button onClick={() => openEdit(tpl, def)} className="text-muted-foreground hover:text-foreground p-1 rounded">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(tpl)} className="text-muted-foreground hover:text-red-500 p-1 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Add template to a block that doesn't have any yet */}
          {defsWithout.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Add template for</p>
              <div className="flex flex-wrap gap-1.5">
                {defsWithout.map((def) => {
                  const colors = getDefinitionColors(def.color)
                  return (
                    <button
                      key={def.id}
                      onClick={() => openNew(def)}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs border rounded-md hover:border-primary/60 hover:bg-primary/5 transition-all"
                    >
                      <div className={cn('h-4 w-4 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
                        <span className="text-white text-[8px] font-bold">{def.name[0]}</span>
                      </div>
                      {def.name}
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Template editor modal */}
      {modalOpen && selectedDef && (() => {
        const registry = BLOCK_REGISTRY[registryRenderKey(selectedDef)]
        const hasFields = selectedDef.fields.length > 0

        // For registry blocks: the block editor's own Save button drives the flow
        if (registry) {
          const syntheticBlock = makeSyntheticBlock(selectedDef, tplContent)
          const handleRegistrySave = async (content: Record<string, unknown>) => {
            if (!user || !tplName.trim()) return
            setSaving(true)
            // Clear existing default if needed
            if (tplDefault) {
              await supabase
                .from('user_block_templates')
                .update({ is_default: false })
                .eq('user_id', user.id)
                .eq('definition_id', selectedDef.id)
                .neq('id', editing?.id ?? '00000000-0000-0000-0000-000000000000')
              setTemplates((prev) =>
                prev.map((t) =>
                  t.definition_id === selectedDef.id && t.id !== editing?.id
                    ? { ...t, is_default: false } : t,
                ),
              )
            }
            if (editing) {
              const { data } = await supabase
                .from('user_block_templates')
                .update({ name: tplName.trim(), content, is_default: tplDefault })
                .eq('id', editing.id)
                .select().single()
              if (data) setTemplates((prev) => prev.map((t) => t.id === editing.id ? data as UserBlockTemplate : t))
            } else {
              const { data } = await supabase
                .from('user_block_templates')
                .insert({ user_id: user.id, definition_id: selectedDef.id, name: tplName.trim(), content, is_default: tplDefault, sort_order: templates.length })
                .select().single()
              if (data) setTemplates((prev) => [...prev, data as UserBlockTemplate])
            }
            setSaving(false)
            setModalOpen(false)
          }

          return (
            <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false) }}>
              <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="text-sm">
                    {editing ? 'Edit Template' : 'New Template'} — {selectedDef.name}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-3 py-2">
                  {/* Name + auto-apply row */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Label className="text-xs">Template Name</Label>
                      <Input
                        className="mt-1"
                        placeholder="e.g. Routine Vitals, Standard SOAP…"
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="shrink-0 pt-5">
                      <button
                        type="button"
                        onClick={() => setTplDefault((v) => !v)}
                        title={tplDefault ? 'Disable auto-apply' : 'Enable auto-apply'}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all',
                          tplDefault
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/30',
                        )}
                      >
                        <Zap className={cn('w-3.5 h-3.5', tplDefault && 'fill-current')} />
                        Auto-apply
                      </button>
                    </div>
                  </div>
                  {!tplName.trim() && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">Enter a template name before saving.</p>
                  )}
                  {/* Block's own editor — its Save button finalises the template */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-3 py-1.5 bg-muted/30 border-b">
                      <p className="text-[10px] text-muted-foreground">Fill in the content below, then click <strong>Save</strong> to save the template.</p>
                    </div>
                    <div className={cn('p-4', !tplName.trim() && 'pointer-events-none opacity-50')}>
                      <registry.Edit
                        block={syntheticBlock}
                        onSave={handleRegistrySave}
                        onCancel={() => setModalOpen(false)}
                      />
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )
        }

        // DynamicBlock or no-editor fallback
        return (
          <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false) }}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-sm">
                  {editing ? 'Edit Template' : 'New Template'} — {selectedDef.name}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto space-y-4 py-2">
                <div>
                  <Label className="text-xs">Template Name</Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. Routine Follow-up, Post-op Note…"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                  />
                </div>

                {/* Auto-apply toggle */}
                <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium">Auto-apply</p>
                    <p className="text-[11px] text-muted-foreground">Skip the template picker and add this block instantly.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTplDefault((v) => !v)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                      tplDefault ? 'bg-primary' : 'bg-muted',
                    )}
                  >
                    <span className={cn(
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                      tplDefault ? 'translate-x-4' : 'translate-x-0',
                    )} />
                  </button>
                </div>

                <div>
                  <Label className="text-xs">Pre-filled Content</Label>
                  {hasFields ? (
                    <div className="mt-1 border rounded-lg p-3">
                      <DynamicBlockEdit
                        definition={selectedDef}
                        content={tplContent}
                        onChange={setTplContent}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground italic border rounded-lg p-3 bg-muted/20">
                      This block has no configurable fields. The template will act as a quick-add shortcut.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !tplName.trim()}>
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {saving ? 'Saving…' : 'Save Template'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}

// ============================================================
// My Blocks Section (user preferences & templates — no block-type creation)
// ============================================================

function CustomBlocksSection() {
  return (
    <div className="space-y-6">
      {/* ── Quick Access (preferred standard blocks) ── */}
      <QuickAccessSection />

      <Separator />

      {/* ── Content Templates ── */}
      <BlockTemplatesSection />
    </div>
  )
}

// ============================================================
// Reusable block visibility card (used in StandardBlocksSection)
// ============================================================

function BlockVisibilityCard({
  def,
  allRoles,
  savingRoles,
  onToggleActive,
  onToggleRole,
  onToggleDefaultRole,
  onEdit,
  onDelete,
  onDuplicate,
  isBuiltin = false,
}: {
  def: BlockDefinition
  allRoles: Role[]
  savingRoles: string | null
  onToggleActive: () => void
  onToggleRole: (slug: string) => void
  onToggleDefaultRole: (slug: string) => void
  onEdit?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  isBuiltin?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const colors      = getDefinitionColors(def.color)
  const visibleRoles = def.visible_to_roles        ?? []
  const defaultRoles = def.default_visible_to_roles ?? []
  const blockAddRoles = allRoles.filter((r) => r.permissions.includes('block.add'))
  const isDeptResultDef = def.config?.dept_role === 'result'
  /** Built-ins and registry variants use Edit for roles/billing — same compact header as built-in */
  const showInlineRoleExpand = !isBuiltin && !def.registry_slug?.trim()

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden transition-opacity', !def.active && 'opacity-60')}>
      {/* ── Compact header row (always visible) ── */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-2 select-none transition-colors',
          showInlineRoleExpand && 'cursor-pointer hover:bg-accent/30',
        )}
        onClick={showInlineRoleExpand ? () => setExpanded((e) => !e) : undefined}
        role={showInlineRoleExpand ? 'button' : undefined}
        tabIndex={showInlineRoleExpand ? 0 : undefined}
        onKeyDown={showInlineRoleExpand ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((x) => !x)
          }
        } : undefined}
      >
        {!showInlineRoleExpand ? (
          <span className="w-3 shrink-0" aria-hidden />
        ) : (
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}

        <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', colors.iconBg)}>
          <span className="text-white text-[9px] font-bold">{def.name[0]}</span>
        </div>

        <span className="text-xs font-medium flex-1 truncate">{def.name}</span>

        {/* Summary badges */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          {isBuiltin && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
              Built-in
            </span>
          )}
          {!isBuiltin && !!def.registry_slug?.trim() && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-300">
              Variant
            </span>
          )}
          {blockDefinitionHasCharging(def) && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400">
              $ charged
            </span>
          )}
          {!def.active && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-muted border-border text-muted-foreground">
              Disabled
            </span>
          )}
          {visibleRoles.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border bg-primary/5 border-primary/30 text-primary">
              {visibleRoles.length} role{visibleRoles.length !== 1 ? 's' : ''}
            </span>
          )}
          <Button
            variant="ghost" size="sm"
            className="h-5 text-[10px] px-1.5 ml-1"
            onClick={onToggleActive}
            title={def.active ? 'Disable' : 'Enable'}
          >
            {def.active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          {onDuplicate && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5" onClick={onDuplicate} title="Duplicate as new block type">
              <Copy className="h-3 w-3" />
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5" onClick={onEdit} title="Edit">
              <Edit2 className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5 text-destructive hover:text-destructive" onClick={onDelete} title="Delete">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Expanded controls (custom slugs only; built-ins & variants use the edit modal) ── */}
      {expanded && showInlineRoleExpand && (
        isDeptResultDef ? (
          <div className="border-t bg-muted/30 px-3 py-2">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Block is created by department staff via the portal — role access is controlled by department membership.
            </p>
          </div>
        ) : (
          <>
            <div className="border-t bg-muted/30 px-3 py-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-24">
                {savingRoles === `${def.id}:vis`
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" />
                  : 'Can add:'}
              </span>
              {blockAddRoles.map(role => {
                const on = visibleRoles.includes(role.slug)
                return (
                  <button key={role.id} type="button" disabled={savingRoles !== null}
                    onClick={() => onToggleRole(role.slug)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                      on ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                         : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    {role.name}
                  </button>
                )
              })}
              {visibleRoles.length === 0 && <span className="text-[10px] text-muted-foreground italic">Everyone</span>}
            </div>

            <div className="border-t bg-muted/20 px-3 py-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-24">
                {savingRoles === `${def.id}:def`
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin inline" />
                  : 'Default view:'}
              </span>
              {blockAddRoles.map(role => {
                const on = defaultRoles.includes(role.slug)
                return (
                  <button key={role.id} type="button" disabled={savingRoles !== null}
                    onClick={() => onToggleDefaultRole(role.slug)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full border transition-colors capitalize',
                      on ? 'bg-amber-100 border-amber-300 text-amber-700 font-medium dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400'
                         : 'border-border text-muted-foreground hover:border-amber-300 hover:text-foreground',
                    )}
                  >
                    {role.name}
                  </button>
                )
              })}
              {defaultRoles.length === 0 && <span className="text-[10px] text-muted-foreground italic">All staff</span>}
            </div>
          </>
        )
      )}
    </div>
  )
}

// ============================================================
// Standard Blocks Section (admin)
// ============================================================

function StandardBlocksSection() {
  const { user } = useAuthStore()
  const [defs, setDefs] = useState<BlockDefinition[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [serviceItemsList, setServiceItemsList] = useState<{ id: string; name: string; code: string; default_price: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BlockDefinition | 'new' | undefined>()
  const [savingRoles, setSavingRoles] = useState<string | null>(null)  // def.id being saved

  const [dupSource, setDupSource] = useState<BlockDefinition | null>(null)
  const [dupSlug, setDupSlug] = useState('')
  const [dupName, setDupName] = useState('')
  const [dupError, setDupError] = useState<string | null>(null)
  const [dupSaving, setDupSaving] = useState(false)

  const load = useCallback(async () => {
    const [defsRes, rolesRes, svcRes] = await Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .or('is_builtin.eq.true,is_universal.eq.true')
        .order('sort_order', { ascending: true }),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('service_items').select('id, name, code, default_price').eq('active', true).order('sort_order'),
    ])
    if (defsRes.data) setDefs(defsRes.data as BlockDefinition[])
    if (rolesRes.data) setAllRoles(rolesRes.data as Role[])
    if (svcRes.data) setServiceItemsList(svcRes.data as typeof serviceItemsList)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaved = (def: BlockDefinition) => {
    setDefs((prev) => {
      const exists = prev.find((d) => d.id === def.id)
      return exists ? prev.map((d) => (d.id === def.id ? def : d)) : [...prev, def]
    })
    setEditing(undefined)
  }

  const handleDelete = async (def: BlockDefinition) => {
    if (def.is_builtin) {
      if (!window.confirm(
        'DESTRUCTIVE ACTION — SYSTEM BUILT-IN\n\n'
        + 'You are about to delete a core block type from the database. This is almost never appropriate in production.\n\n'
        + 'Likely consequences:\n'
        + '• Patient timelines and department portals may error or show broken blocks\n'
        + '• Templates, orders, charges, and automation tied to this slug can fail\n'
        + '• Foreign keys may block the delete, or orphans may be left if constraints differ\n\n'
        + 'There is no undo. Prefer leaving built-ins alone or using a duplicate + disable workflow.\n\n'
        + 'Click OK only for a controlled fix (e.g. bad seed / dev reset).',
      )) return
      if (!window.confirm(
        'Second confirmation: Delete this built-in block definition anyway?\n\n'
        + 'If you are not 100% sure, click Cancel now.',
      )) return
      const typed = window.prompt(
        `Final step — type the block name exactly (case-sensitive) to delete:\n\n"${def.name}"`,
      )
      if (typed !== def.name) return
    } else if (def.registry_slug?.trim()) {
      if (!window.confirm(
        `PERMANENT DELETE — VARIANT: "${def.name}"\n\n`
        + 'This removes the definition row. Existing blocks that use this type slug may become hard to edit, '
        + 'mis-render, or lose their schema in the UI. Department services and templates referencing it can break.\n\n'
        + 'Safer option: disable the block (eye icon) so it stays out of menus but history stays coherent.\n\n'
        + 'Delete permanently?',
      )) return
    } else if (!window.confirm(
      `PERMANENT DELETE — CUSTOM BLOCK: "${def.name}"\n\n`
      + 'It will be removed from every user\'s Add Block menu. Encounters that already contain this block type '
      + 'may show a missing-editor warning until settings_ui is fixed; data in those blocks is not automatically deleted.\n\n'
      + 'Disabling is usually enough. Continue with full delete?',
    )) {
      return
    }
    const res = await adminApi.deleteStandardBlock(def.id)
    if (res.error) { alert(res.error); return }
    setDefs((prev) => prev.filter((d) => d.id !== def.id))
  }

  const openDuplicateModal = (def: BlockDefinition) => {
    const taken = new Set(defs.map((d) => d.slug))
    let candidate = `${def.slug}__copy`
    let n = 1
    while (taken.has(candidate)) {
      n += 1
      candidate = `${def.slug}__copy${n}`
    }
    setDupSource(def)
    setDupSlug(candidate)
    setDupName(`${def.name} (copy)`)
    setDupError(null)
  }

  const closeDuplicateModal = () => {
    setDupSource(null)
    setDupSlug('')
    setDupName('')
    setDupError(null)
    setDupSaving(false)
  }

  const confirmDuplicate = async () => {
    if (!user || !dupSource) return
    const slug = dupSlug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!slug) {
      setDupError('Slug is required.')
      return
    }
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
      setDupError('Slug must start with a letter and use only lowercase letters, numbers, and underscores.')
      return
    }
    if (defs.some((d) => d.slug === slug)) {
      setDupError('That slug is already in use.')
      return
    }
    const nameTrim = dupName.trim()
    if (!nameTrim) {
      setDupError('Display name is required.')
      return
    }
    setDupSaving(true)
    setDupError(null)
    try {
      const maxSort = defs.length ? Math.max(...defs.map((d) => d.sort_order)) : 0
      const { id: _id, created_at: _ca, ...rest } = dupSource
      const payload: Omit<BlockDefinition, 'id' | 'created_at'> = {
        ...rest,
        slug,
        name: nameTrim,
        registry_slug: registryRenderKey(dupSource),
        is_builtin: false,
        is_universal: true,
        sort_order: maxSort + 10,
        created_by: user.id,
      }
      const res = await adminApi.createStandardBlock(payload)
      if (res.error) {
        setDupError(res.error)
        return
      }
      if (res.data) setDefs((prev) => [...prev, res.data!])
      closeDuplicateModal()
    } finally {
      setDupSaving(false)
    }
  }

  const handleToggleActive = async (def: BlockDefinition) => {
    const res = await adminApi.updateStandardBlock(def.id, { active: !def.active })
    if (!res.error && res.data) setDefs((prev) => prev.map((d) => (d.id === def.id ? res.data! : d)))
  }

  const handleToggleRole = async (def: BlockDefinition, slug: string) => {
    setSavingRoles(`${def.id}:vis`)
    const current = def.visible_to_roles ?? []
    const next = current.includes(slug) ? current.filter(r => r !== slug) : [...current, slug]
    const res = await adminApi.updateStandardBlock(def.id, { visible_to_roles: next })
    if (!res.error && res.data) setDefs((prev) => prev.map((d) => (d.id === def.id ? res.data! : d)))
    setSavingRoles(null)
  }

  const handleToggleDefaultRole = async (def: BlockDefinition, slug: string) => {
    setSavingRoles(`${def.id}:def`)
    const current = def.default_visible_to_roles ?? []
    const next = current.includes(slug) ? current.filter(r => r !== slug) : [...current, slug]
    const res = await adminApi.updateStandardBlock(def.id, { default_visible_to_roles: next })
    if (!res.error && res.data) setDefs((prev) => prev.map((d) => (d.id === def.id ? res.data! : d)))
    setSavingRoles(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Block Library</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            All block types available org-wide. Custom block types: click the row to set role access inline.
            Built-ins and variants: use Edit for roles, billing, and visibility.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> New Block Type
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {defs.length === 0 ? (
            <div className="border border-dashed rounded-lg py-8 text-center text-muted-foreground space-y-1">
              <Globe className="w-7 h-7 mx-auto opacity-40" />
              <p className="text-sm">No block types found.</p>
            </div>
          ) : (
            defs.map(def => (
              <BlockVisibilityCard
                key={def.id}
                def={def}
                allRoles={allRoles}
                savingRoles={savingRoles}
                onToggleActive={() => handleToggleActive(def)}
                onToggleRole={(slug) => handleToggleRole(def, slug)}
                onToggleDefaultRole={(slug) => handleToggleDefaultRole(def, slug)}
                onEdit={() => setEditing(def)}
                onDuplicate={() => openDuplicateModal(def)}
                onDelete={() => handleDelete(def)}
                isBuiltin={def.is_builtin}
              />
            ))
          )}
        </div>
      )}

      {editing !== undefined && (
        <BlockDefinitionModal
          initial={editing !== 'new' ? editing : undefined}
          isStandard
          isBuiltin={editing !== 'new' && editing.is_builtin}
          allRoles={allRoles}
          allServiceItems={serviceItemsList}
          allDefs={defs}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}

      <Dialog open={!!dupSource} onOpenChange={(o) => { if (!o && !dupSaving) closeDuplicateModal() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate block type</DialogTitle>
          </DialogHeader>
          {dupSource && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Copying from <span className="font-medium text-foreground">{dupSource.name}</span>
                {' · '}
                Renderer <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">{registryRenderKey(dupSource)}</code>
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">New slug (unique)</Label>
                <Input
                  value={dupSlug}
                  onChange={(e) => {
                    setDupSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                    setDupError(null)
                  }}
                  placeholder="e.g. lab_result_icu"
                  className="font-mono text-sm"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Display name</Label>
                <Input
                  value={dupName}
                  onChange={(e) => { setDupName(e.target.value); setDupError(null) }}
                  placeholder="Shown in Add Block menu"
                />
              </div>
              {dupError && <p className="text-xs text-destructive">{dupError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={closeDuplicateModal} disabled={dupSaving}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={confirmDuplicate} disabled={dupSaving || !dupSlug.trim() || !dupName.trim()}>
                  {dupSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Create duplicate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Templates Section
// ============================================================

interface TemplateFormState {
  name: string
  description: string
  is_universal: boolean
  visible_to_roles: string[]
  blocks: TemplateBlock[]
  default_visibility: 'staff' | 'restricted' | 'private'
  default_visible_to_roles: string[]
}

const EMPTY_TEMPLATE: TemplateFormState = {
  name: '', description: '', is_universal: false,
  visible_to_roles: [], blocks: [],
  default_visibility: 'staff', default_visible_to_roles: [],
}

function TemplateModal({
  initial,
  allRoles,
  allDefs,
  canMakeStandard,
  currentUserId,
  onClose,
  onSaved,
}: {
  initial?: EncounterTemplate
  allRoles: Role[]
  allDefs: BlockDefinition[]
  canMakeStandard: boolean
  currentUserId: string
  onClose: () => void
  onSaved: (t: EncounterTemplate) => void
}) {
  const [form, setForm] = useState<TemplateFormState>(
    initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          is_universal: initial.is_universal,
          visible_to_roles: initial.visible_to_roles,
          blocks: initial.blocks,
          default_visibility: initial.default_visibility ?? 'staff',
          default_visible_to_roles: initial.default_visible_to_roles ?? [],
        }
      : { ...EMPTY_TEMPLATE },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only physician roles (and sub-roles) are valid targets for template visibility
  const physicianRoles = useMemo(
    () => allRoles.filter((r) => r.slug === 'physician' || r.slug.endsWith('_physician') || r.slug.startsWith('physician_')),
    [allRoles],
  )

  const blockAddRoles = useMemo(
    () => allRoles.filter((r) => r.permissions.includes('block.add')),
    [allRoles],
  )

  const setF = (patch: Partial<TemplateFormState>) => setForm((f) => ({ ...f, ...patch }))

  const toggleBlockDef = (def: BlockDefinition) => {
    const exists = form.blocks.find((b) => b.slug === def.slug)
    if (exists) {
      setF({ blocks: form.blocks.filter((b) => b.slug !== def.slug) })
    } else {
      setF({
        blocks: [
          ...form.blocks,
          { slug: def.slug, definition_id: def.id, pin: false, sort_order: (form.blocks.length + 1) * 10 },
        ],
      })
    }
  }

  const togglePin = (slug: string) => {
    setF({ blocks: form.blocks.map((b) => b.slug === slug ? { ...b, pin: !b.pin } : b) })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (form.blocks.length === 0) { setError('Add at least one block to the template'); return }
    setSaving(true)
    setError(null)

    const payload = {
      ...form,
      created_by: currentUserId,
    }

    if (form.is_universal) {
      const res = initial
        ? await adminApi.updateTemplate(initial.id, payload)
        : await adminApi.createTemplate(payload as Parameters<typeof adminApi.createTemplate>[0])
      setSaving(false)
      if (res.error) { setError(res.error); return }
      onSaved(res.data!)
      return
    }

    // Personal template — normal client
    let result
    if (initial) {
      result = await supabase.from('encounter_templates').update(payload).eq('id', initial.id).select().single()
    } else {
      result = await supabase.from('encounter_templates').insert(payload).select().single()
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved(result.data as EncounterTemplate)
  }

  const systemDefs = allDefs.filter((d) => d.is_builtin || d.is_universal)
  const customDefs = allDefs.filter((d) => !d.is_builtin && !d.is_universal)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[90vh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4" />
            {initial ? 'Edit Template' : 'New Template'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-5 py-1">

            {/* Basic Info */}
            <section className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Basic Info
              </p>
              <div>
                <label className="text-xs text-muted-foreground">Template Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setF({ name: e.target.value })}
                  placeholder="e.g. ICU Morning Round"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <Input
                  value={form.description}
                  onChange={(e) => setF({ description: e.target.value })}
                  placeholder="Brief description"
                  className="mt-1"
                />
              </div>
            </section>

            <Separator />

            {/* Standard toggle (admin only) */}
            {canMakeStandard && (
              <>
                <section className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Visibility
                  </p>
                  <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-3.5 h-3.5"
                      checked={form.is_universal}
                      onChange={(e) => setF({ is_universal: e.target.checked })}
                    />
                    <div>
                      <p className="text-xs font-medium">Shared Template</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Shared with all physicians across the practice (optionally filtered by role below).
                      </p>
                    </div>
                  </label>

                  {form.is_universal && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Role filter — leave all unchecked to show to everyone:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {physicianRoles.map((role) => {
                          const active = form.visible_to_roles.includes(role.slug)
                          return (
                            <label
                              key={role.id}
                              className={cn(
                                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                                active ? 'border-primary/50 bg-primary/10 text-primary font-medium' : 'border-border hover:border-primary/30',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="w-3 h-3"
                                checked={active}
                                onChange={(e) => {
                                  const curr = form.visible_to_roles
                                  setF({
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
                    </div>
                  )}
                </section>
                <Separator />
              </>
            )}

            {/* Default Encounter Privacy */}
            <section className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Default Encounter Privacy
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  When a new encounter is created from this template, it will start with this visibility. Clinicians can still change it during creation.
                </p>
              </div>
              <div className="flex gap-2">
                {(['staff', 'restricted', 'private'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setF({ default_visibility: opt, default_visible_to_roles: opt !== 'restricted' ? [] : form.default_visible_to_roles })}
                    className={cn(
                      'flex-1 text-xs py-1.5 rounded-lg border capitalize transition-colors',
                      form.default_visibility === opt
                        ? 'border-primary/60 bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-primary/30',
                    )}
                  >
                    {opt === 'staff' ? 'All Staff' : opt === 'restricted' ? 'Restricted' : 'Private'}
                  </button>
                ))}
              </div>
              {form.default_visibility === 'restricted' && blockAddRoles.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2">Roles that can view this encounter:</p>
                  <div className="flex flex-wrap gap-2">
                    {blockAddRoles.map((role) => {
                      const active = form.default_visible_to_roles.includes(role.slug)
                      return (
                        <label
                          key={role.id}
                          className={cn(
                            'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-colors',
                            active ? 'border-amber-500/60 bg-amber-50 text-amber-700 font-medium' : 'border-border hover:border-amber-300',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="w-3 h-3"
                            checked={active}
                            onChange={(e) => {
                              const curr = form.default_visible_to_roles
                              setF({
                                default_visible_to_roles: e.target.checked
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
                </div>
              )}
            </section>

            <Separator />

            {/* Block Selector */}
            <section className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Blocks
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Select blocks to include. Toggle the pin icon to auto-pin a block in the encounter header.
                </p>
              </div>

              {/* Selected blocks */}
              {form.blocks.length > 0 && (
                <div className="space-y-1 mb-3">
                  <p className="text-[10px] text-muted-foreground font-medium">Selected ({form.blocks.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {form.blocks.map((b) => {
                      const def = allDefs.find((d) => d.slug === b.slug)
                      return (
                        <div key={b.slug} className="flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 bg-primary/5 border-primary/30">
                          <span>{def?.name ?? b.slug}</span>
                          <button
                            title={b.pin ? 'Pinned (click to unpin)' : 'Not pinned (click to pin)'}
                            onClick={() => togglePin(b.slug)}
                            className={cn('ml-0.5', b.pin ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-400')}
                          >
                            <Pin className="w-2.5 h-2.5" />
                          </button>
                          <button onClick={() => toggleBlockDef(def ?? ({ slug: b.slug, registry_slug: null } as BlockDefinition))} className="text-muted-foreground hover:text-red-500 ml-0.5">
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Available block pickers by section */}
              {[
                { label: 'Block Library', items: systemDefs },
                { label: 'My Custom Blocks', items: customDefs },
              ].filter((s) => s.items.length > 0).map((section) => (
                <div key={section.label}>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">{section.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.items.map((def) => {
                      const selected = !!form.blocks.find((b) => b.slug === def.slug)
                      const colors = getDefinitionColors(def.color)
                      return (
                        <button
                          key={def.id}
                          onClick={() => toggleBlockDef(def)}
                          className={cn(
                            'flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 transition-colors',
                            selected
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/40',
                          )}
                        >
                          <div className={cn('h-4 w-4 rounded-sm flex items-center justify-center shrink-0', colors.iconBg)}>
                            <span className="text-[8px] text-white font-bold">{def.name[0]}</span>
                          </div>
                          {def.name}
                          {selected && <Check className="w-3 h-3 ml-0.5" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </ScrollArea>

        <div className="shrink-0 pt-4 border-t flex items-center justify-between gap-3">
          {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {initial ? 'Save Changes' : 'Create Template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TemplatesSection() {
  const { user, can } = useAuthStore()
  const [templates, setTemplates] = useState<EncounterTemplate[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [allDefs, setAllDefs] = useState<BlockDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EncounterTemplate | 'new' | undefined>()
  const canMakeStandard = can('admin.manage_templates')

  const load = useCallback(async () => {
    if (!user) return
    const [tmplRes, rolesRes, defsRes] = await Promise.all([
      supabase
        .from('encounter_templates')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('block_definitions').select('*').eq('active', true).order('sort_order'),
    ])
    if (tmplRes.data) setTemplates(tmplRes.data as EncounterTemplate[])
    if (rolesRes.data) setAllRoles(rolesRes.data as Role[])
    if (defsRes.data) setAllDefs(defsRes.data as BlockDefinition[])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const handleSaved = (t: EncounterTemplate) => {
    setTemplates((prev) => {
      const exists = prev.find((x) => x.id === t.id)
      return exists ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]
    })
    setEditing(undefined)
  }

  const handleDelete = async (t: EncounterTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return
    if (t.is_universal) {
      const res = await adminApi.deleteTemplate(t.id)
      if (res.error) { alert(res.error); return }
    } else {
      await supabase.from('encounter_templates').delete().eq('id', t.id)
    }
    setTemplates((prev) => prev.filter((x) => x.id !== t.id))
  }

  const myTemplates = templates.filter((t) => !t.is_universal)
  const standardTemplates = templates.filter((t) => t.is_universal)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Encounter Templates</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pre-built sets of blocks that auto-populate a new encounter's timeline.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> New Template
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : templates.length === 0 ? (
        <div className="border border-dashed rounded-lg py-10 text-center text-muted-foreground space-y-2">
          <LayoutTemplate className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-sm">No templates yet.</p>
          <p className="text-xs">Create a template to speed up encounter creation.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {standardTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Shared Templates
              </p>
              {standardTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  allRoles={allRoles}
                  allDefs={allDefs}
                  canDelete={canMakeStandard}
                  onEdit={() => setEditing(t)}
                  onDelete={() => handleDelete(t)}
                />
              ))}
            </div>
          )}
          {myTemplates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                My Templates
              </p>
              {myTemplates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  allRoles={allRoles}
                  allDefs={allDefs}
                  canDelete
                  onEdit={() => setEditing(t)}
                  onDelete={() => handleDelete(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editing !== undefined && (
        <TemplateModal
          initial={editing !== 'new' ? editing : undefined}
          allRoles={allRoles}
          allDefs={allDefs}
          canMakeStandard={canMakeStandard}
          currentUserId={user!.id}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function TemplateCard({
  template,
  allRoles,
  allDefs,
  canDelete,
  onEdit,
  onDelete,
}: {
  template: EncounterTemplate
  allRoles: Role[]
  allDefs: BlockDefinition[]
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border">
      <div className="h-8 w-8 rounded-md bg-indigo-100 flex items-center justify-center shrink-0">
        <LayoutTemplate className="w-4 h-4 text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{template.name}</p>
          {template.is_universal && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700">Shared</span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {template.blocks.map((b) => {
            const def = allDefs.find((d) => d.slug === b.slug)
            return (
              <span key={b.slug} className={cn(
                'flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border',
                b.pin ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-muted border-border text-muted-foreground',
              )}>
                {b.pin && <Pin className="w-2 h-2 shrink-0" />}{def?.name ?? b.slug}
              </span>
            )
          })}
        </div>
        {template.is_universal && template.visible_to_roles.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {template.visible_to_roles.map((slug) => (
              <span key={slug} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-50 border text-muted-foreground">
                {allRoles.find((r) => r.slug === slug)?.name ?? slug}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {canDelete && (
          <Button variant="ghost" size="icon-sm" onClick={onDelete} className="hover:text-red-500" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Profile Section
// ============================================================

function ProfileSection() {
  const { user, profile, updateProfile, roleNames, hasRole } = useAuthStore()
  const { billingEnabled } = useSettingsStore()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [encounterFee, setEncounterFee] = useState(String(profile?.encounter_fee ?? ''))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(profile?.full_name ?? '')
    setEncounterFee(profile?.encounter_fee != null ? String(profile.encounter_fee) : '')
  }, [profile])

  const handleSave = async () => {
    setSaving(true)
    await updateProfile({ full_name: name.trim() })
    if (billingEnabled && hasRole('physician')) {
      const fee = parseFloat(encounterFee)
      await supabase.from('profiles').update({ encounter_fee: isNaN(fee) ? null : fee }).eq('id', user!.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-semibold">Profile</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your name appears on every block you create.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Full Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Jane Smith"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <Input value={user?.email ?? ''} readOnly className="mt-1 bg-muted text-muted-foreground" />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Role</label>
          <Input
            value={roleNames.length > 0 ? roleNames.join(', ') : '—'}
            readOnly
            className="mt-1 bg-muted text-muted-foreground"
          />
        </div>

        {billingEnabled && hasRole('physician') && (
          <div>
            <label className="text-xs text-muted-foreground">Encounter Fee</label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Auto-added as a charge when you close an encounter assigned to you.
            </p>
            <Input
              type="number"
              value={encounterFee}
              onChange={(e) => setEncounterFee(e.target.value)}
              placeholder="0.00"
              className="mt-1"
            />
          </div>
        )}
      </div>

      <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : null}
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Profile'}
      </Button>
    </div>
  )
}

// ============================================================
// Role Management
// ============================================================

const PERM_CATEGORIES = [...new Set(PERMISSIONS.map((p) => PERMISSION_LABELS[p].category))]


function RoleModal({
  initial,
  allRoles,
  roleParentsMap,
  onClose,
  onSaved,
}: {
  initial?: Role
  allRoles: Role[]
  roleParentsMap: Record<string, string>  // child_slug → parent_slug
  onClose: () => void
  onSaved: (role: Role) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set((initial?.permissions ?? []) as Permission[]),
  )
  const [parentSlug, setParentSlug] = useState<string>(
    initial ? (roleParentsMap[initial.slug] ?? '') : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  // Permissions from the selected parent role (must stay on the child row; not removable in UI)
  const parentRole = useMemo(() => allRoles.find((r) => r.slug === parentSlug), [allRoles, parentSlug])
  const inheritedPerms = useMemo(
    () => new Set((parentRole?.permissions ?? []) as Permission[]),
    [parentRole],
  )

  // Always merge parent permissions into selection when a parent is chosen
  useEffect(() => {
    if (!parentSlug) return
    const parent = allRoles.find((r) => r.slug === parentSlug)
    if (!parent) return
    const inherited = parent.permissions as Permission[]
    setSelected((prev) => new Set([...inherited, ...prev]))
  }, [parentSlug, allRoles])

  const toggle = (p: Permission) => {
    if (parentSlug && inheritedPerms.has(p)) return
    setSelected((prev) => {
      const s = new Set(prev)
      s.has(p) ? s.delete(p) : s.add(p)
      return s
    })
  }

  const handleParentChange = (slug: string) => {
    setParentSlug(slug)
    if (slug) {
      const parent = allRoles.find((r) => r.slug === slug)
      if (parent) {
        setSelected((prev) => new Set([...(parent.permissions as Permission[]), ...prev]))
      }
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!slug.trim()) { setError('Slug is required'); return }
    setSaving(true); setError(null)
    const parentPerms = (parentRole?.permissions ?? []) as Permission[]
    const mergedPerms = [...new Set([...parentPerms, ...selected])] as Permission[]
    const payload = { name: name.trim(), slug: slug.trim(), description: description.trim(), permissions: mergedPerms }
    const result = initial
      ? await adminApi.updateRole(initial.id, payload)
      : await adminApi.createRole(payload)
    if (result.error) { setSaving(false); setError(result.error); return }

    const savedRole = result.data!
    const childSlug = savedRole.slug

    // Sync role_parents: remove old entry then insert new one if a parent is chosen
    await supabase.from('role_parents').delete().eq('child_slug', childSlug)
    if (parentSlug) {
      await supabase.from('role_parents').insert({ child_slug: childSlug, parent_slug: parentSlug })
    }

    setSaving(false)
    onSaved(savedRole)
  }

  // Roles available as parents (all roles except the role being edited)
  const parentOptions = allRoles.filter((r) => !initial || r.slug !== initial.slug)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl h-[88vh] !flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            {initial ? 'Edit Role' : 'New Role'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name *</label>
                <Input
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (!initial) setSlug(autoSlug(e.target.value)) }}
                  placeholder="e.g. Senior Physician"
                  className="mt-1"
                  disabled={initial?.is_system}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Slug * (unique, no spaces)</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="senior_physician"
                  className="mt-1 font-mono text-sm"
                  disabled={initial?.is_system}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What can this role do?" className="mt-1" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Inherits from (optional)</label>
              <select
                value={parentSlug}
                onChange={(e) => handleParentChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">— None —</option>
                {parentOptions.map((r) => (
                  <option key={r.id} value={r.slug}>{r.name}</option>
                ))}
              </select>
              {parentRole && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Role slug hierarchy uses <span className="font-medium">{parentRole.name}</span> for visibility checks.
                  All of that role&apos;s permissions are required on this role and <span className="font-medium">cannot be turned off</span> below; you may add extra permissions.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Permissions</p>
              {PERM_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{cat}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PERMISSIONS.filter((p) => PERMISSION_LABELS[p].category === cat).map((perm) => {
                      const isInherited = inheritedPerms.has(perm)
                      const locked = !!parentSlug && isInherited
                      const checked = locked || selected.has(perm)
                      return (
                        <label
                          key={perm}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors',
                            locked ? 'cursor-default opacity-90' : 'cursor-pointer',
                            checked
                              ? 'border-primary/50 bg-primary/5 text-foreground'
                              : 'border-border text-muted-foreground hover:border-primary/30',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked}
                            onChange={() => toggle(perm)}
                            className="w-3.5 h-3.5 shrink-0 disabled:cursor-not-allowed"
                          />
                          <span className="flex-1">{PERMISSION_LABELS[perm].label}</span>
                          {locked && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600 shrink-0">from parent</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{error}</p>}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-3 border-t mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Role'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RolesSection() {
  const [roles, setRoles] = useState<Role[]>([])
  const [roleParentsMap, setRoleParentsMap] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Role | 'new' | undefined>()

  const loadRoles = useCallback(async () => {
    const [rolesRes, parentsRes] = await Promise.all([
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('role_parents').select('child_slug, parent_slug'),
    ])
    if (rolesRes.data) setRoles(rolesRes.data as Role[])
    if (parentsRes.data) {
      const map: Record<string, string> = {}
      for (const row of parentsRes.data) map[row.child_slug] = row.parent_slug
      setRoleParentsMap(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadRoles() }, [loadRoles])

  const handleSaved = (role: Role) => {
    setRoles((prev) => prev.find((r) => r.id === role.id) ? prev.map((r) => r.id === role.id ? role : r) : [...prev, role])
    // Re-fetch role_parents to pick up any changes made during save
    loadRoles()
  }

  const handleDelete = async (role: Role) => {
    const sysWarn = role.is_system
      ? '\n\nThis is a system role. If it is still used for visibility, privacy, or templates, deleting it can break access until you reconfigure those settings.'
      : ''
    if (!confirm(`Delete role "${role.name}"?${sysWarn}`)) return
    const res = await adminApi.deleteRole(role.id)
    if (res.error) { alert(res.error); return }
    setRoles((prev) => prev.filter((r) => r.id !== role.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Roles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define what each role can do. System roles can be deleted.
          </p>
          <div className="mt-2 flex gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-snug">
              <span className="font-medium text-foreground">How roles fit together.</span>{' '}
              Permissions control what actions someone can take (billing, templates, adding blocks, and so on).
              Role <span className="font-mono text-[10px]">slug</span> values are separate: they drive who can see restricted encounters,
              block privacy, shared templates, and department routing. A user's effective access is the combination of both—permissions
              plus slug-based visibility—so the two layers together form the full privacy model.
            </p>
          </div>
          <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/25 px-2.5 py-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
            <p className="text-[11px] text-amber-900/90 dark:text-amber-200/90 leading-snug">
              <span className="font-medium">Warning:</span> Removing roles that are already in use can break access and behaviour.
              The app relies on role slugs internally for encounter visibility, block privacy, templates, and department routing—deleting
              or renaming a role users still depend on may leave people unable to see encounters or shared content until you fix assignments
              and configuration.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} className="shrink-0 self-start">
          <Plus className="w-3.5 h-3.5" /> New Role
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="flex items-start gap-3 p-3 rounded-lg border">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{role.name}</p>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{role.slug}</span>
                  {role.is_system && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">system</span>}
                  {roleParentsMap[role.slug] && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-600">
                      inherits {roles.find((r) => r.slug === roleParentsMap[role.slug])?.name ?? roleParentsMap[role.slug]}
                    </span>
                  )}
                </div>
                {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {role.permissions.map((p) => (
                    <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 border border-primary/10 text-primary/80">{p}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(role)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(role)} className="hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <RoleModal
          initial={editing !== 'new' ? editing : undefined}
          allRoles={roles}
          roleParentsMap={roleParentsMap}
          onClose={() => setEditing(undefined)}
          onSaved={(role) => { handleSaved(role); setEditing(undefined) }}
        />
      )}
    </div>
  )
}

// ============================================================
// User Management
// ============================================================

function UserModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: UserWithRoles
  onClose: () => void
  onSaved: (u: UserWithRoles) => void
}) {
  const [email, setEmail] = useState(initial?.email ?? '')
  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!email.trim()) { setError('Email is required'); return }
    if (!initial && !password.trim()) { setError('Password is required for new users'); return }
    setSaving(true); setError(null)

    if (initial) {
      // Update display name via admin RPC (profiles_update RLS blocks cross-user updates)
      const profileRes = await adminApi.updateProfile(initial.id, fullName.trim())
      if (profileRes.error) { setError(profileRes.error); setSaving(false); return }
      if (password.trim()) {
        const res = await adminApi.resetPassword(initial.id, password)
        if (res.error) { setError(res.error); setSaving(false); return }
      }
      onSaved({ ...initial, full_name: fullName.trim() })
    } else {
      const res = await adminApi.createUser(email.trim(), password, fullName.trim())
      if (res.error) { setError(res.error); setSaving(false); return }
      onSaved({
        id: res.data!.id, email: email.trim(), full_name: fullName.trim(),
        created_at: new Date().toISOString(), role_ids: [], role_slugs: [], role_names: [],
      })
    }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {initial ? 'Edit User' : 'Add User'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <label className="text-xs text-muted-foreground">Full Name</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. Jane Smith" className="mt-1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email {initial && '(read-only)'}</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1" readOnly={!!initial} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              {initial ? 'New Password (leave blank to keep current)' : 'Password *'}
            </label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={initial ? '••••••••' : 'Min 6 characters'} className="mt-1" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : initial ? 'Save' : 'Create User'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RolePills({
  targetUser,
  allRoles,
  currentUserId: _currentUserId,
  onUpdated,
}: {
  targetUser: UserWithRoles
  allRoles: Role[]
  currentUserId: string
  onUpdated: (u: UserWithRoles) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (role: Role) => {
    setBusy(role.id)
    const hasRole = targetUser.role_ids.includes(role.id)
    const res = hasRole
      ? await adminApi.removeRole(targetUser.id, role.id)
      : await adminApi.assignRole(targetUser.id, role.id)

    if (!res.error) {
      const newIds   = hasRole ? targetUser.role_ids.filter((id) => id !== role.id) : [...targetUser.role_ids, role.id]
      const newSlugs = hasRole ? targetUser.role_slugs.filter((s) => s !== role.slug) : [...targetUser.role_slugs, role.slug]
      const newNames = hasRole ? targetUser.role_names.filter((_, i) => targetUser.role_ids[i] !== role.id) : [...targetUser.role_names, role.name]
      onUpdated({ ...targetUser, role_ids: newIds, role_slugs: newSlugs, role_names: newNames })
    } else {
      alert(res.error)
    }
    setBusy(null)
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {allRoles.map((role) => {
        const active = targetUser.role_ids.includes(role.id)
        return (
          <button
            key={role.id}
            disabled={!!busy}
            onClick={() => toggle(role)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors',
              active ? 'bg-primary/10 border-primary/40 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40',
              busy === role.id && 'opacity-50',
            )}
          >
            {busy === role.id ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : active ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
            {role.name}
          </button>
        )
      })}
    </div>
  )
}

function UsersSection() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<UserWithRoles | 'new' | undefined>()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) => {
      const name = (u.full_name ?? '').toLowerCase()
      const email = (u.email ?? '').toLowerCase()
      const roles = [
        ...(u.role_names ?? []),
        ...(u.role_slugs ?? []),
      ].join(' ').toLowerCase()
      const id = u.id.toLowerCase()
      return name.includes(q) || email.includes(q) || roles.includes(q) || id.includes(q)
    })
  }, [users, userSearch])

  useEffect(() => {
    Promise.all([
      supabase.rpc('get_users_with_roles'),
      supabase.from('roles').select('*').order('sort_order'),
    ]).then(([{ data: uData }, { data: rData }]) => {
      if (uData) setUsers(uData as UserWithRoles[])
      if (rData) setAllRoles(rData as Role[])
      setLoading(false)
    })
  }, [])

  const upsertUser = (u: UserWithRoles) =>
    setUsers((prev) => prev.find((x) => x.id === u.id) ? prev.map((x) => x.id === u.id ? u : x) : [...prev, u])

  const handleDelete = async (u: UserWithRoles) => {
    if (!confirm(`Delete user "${u.email}"? This cannot be undone.`)) return
    setDeleting(u.id)
    const res = await adminApi.deleteUser(u.id)
    if (res.error) { alert(res.error) } else { setUsers((prev) => prev.filter((x) => x.id !== u.id)) }
    setDeleting(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Users</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Create accounts and assign roles. Click a role pill to toggle.</p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> Add User
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search by name, email, role, or ID…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              className="h-8 pl-8 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            {userSearch.trim() && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
                {filteredUsers.length}/{users.length}
              </span>
            )}
          </div>
          {userSearch.trim() && filteredUsers.length === 0 && users.length > 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center border rounded-lg border-dashed">
              No users match “{userSearch.trim()}”.
            </p>
          ) : null}
          {filteredUsers.map((u) => {
            const initials = u.full_name?.trim()
              ? u.full_name.trim().split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
              : u.email[0].toUpperCase()
            const isSelf = u.id === currentUser?.id
            return (
              <div key={u.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-xs font-bold text-primary relative">
                  {initials}
                  {isSelf && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-emerald-400 border-2 border-background rounded-full" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{u.full_name || '(no name)'}</p>
                    {isSelf && <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">you</span>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{u.email}</p>
                  <RolePills targetUser={u} allRoles={allRoles} currentUserId={currentUser?.id ?? ''} onUpdated={upsertUser} />
                </div>
                <div className="flex gap-0.5 shrink-0 mt-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(u)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button
                    variant="ghost" size="icon-sm"
                    onClick={() => handleDelete(u)}
                    disabled={isSelf || deleting === u.id}
                    className="hover:text-red-500 disabled:opacity-30"
                  >
                    {deleting === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing !== undefined && (
        <UserModal
          initial={editing !== 'new' ? editing : undefined}
          onClose={() => setEditing(undefined)}
          onSaved={(u) => { upsertUser(u); setEditing(undefined) }}
        />
      )}
    </div>
  )
}

// ============================================================
// Patient Fields Section (admin: manage demographics field schema)
// ============================================================

const PATIENT_FIELD_TYPES: { value: PatientFieldDefinition['field_type']; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'date',     label: 'Date' },
  { value: 'select',   label: 'Dropdown' },
  { value: 'textarea', label: 'Text Area' },
]

function PatientFieldsSection() {
  const [fields, setFields] = useState<PatientFieldDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<PatientFieldDefinition | 'new' | undefined>()

  const listFields = useMemo(() => filterPatientFieldsBeforeBloodGroup(fields), [fields])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('patient_field_definitions')
      .select('*')
      .order('sort_order', { ascending: true })
    if (data) setFields(data as PatientFieldDefinition[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (f: PatientFieldDefinition) => {
    if (f.is_system) return
    if (!confirm(`Remove field "${f.label}" from all patient records?`)) return
    await supabase.from('patient_field_definitions').delete().eq('id', f.id)
    setFields(prev => prev.filter(x => x.id !== f.id))
  }

  const handleToggle = async (f: PatientFieldDefinition) => {
    if (f.is_system) return
    const { data } = await supabase
      .from('patient_field_definitions')
      .update({ active: !f.active })
      .eq('id', f.id)
      .select()
      .single()
    if (data) setFields(prev => prev.map(x => x.id === f.id ? data as PatientFieldDefinition : x))
  }

  const handleSaved = (f: PatientFieldDefinition) => {
    setFields(prev => {
      const exists = prev.find(x => x.id === f.id)
      return exists ? prev.map(x => x.id === f.id ? f : x) : [...prev, f]
    })
    setEditing(undefined)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Patient Demographics Fields</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define what information is collected for each patient. System fields cannot be deleted.
            Fields from Blood Group downward are hidden here and on patient demographics (schema order).
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> Add Field
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-1">
          {listFields.map(f => (
            <div
              key={f.id}
              className={cn(
                'flex items-center justify-between rounded-lg border px-3 py-2 gap-3',
                !f.active && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium">{f.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded">{f.slug}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {PATIENT_FIELD_TYPES.find(t => t.value === f.field_type)?.label}
                    </span>
                    {f.is_required && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-600">Required</span>
                    )}
                    {f.is_system && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">System</span>
                    )}
                    {!f.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Hidden</span>
                    )}
                  </div>
                  {f.options.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {f.options.map(o => o.label).join(' · ')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!f.is_system && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={f.active ? 'Hide field' : 'Show field'}
                    onClick={() => handleToggle(f)}
                  >
                    {f.active ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(f)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                {!f.is_system && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hover:text-destructive"
                    onClick={() => handleDelete(f)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <PatientFieldModal
          initial={editing !== 'new' ? editing : undefined}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function PatientFieldModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: PatientFieldDefinition
  onClose: () => void
  onSaved: (f: PatientFieldDefinition) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [fieldType, setFieldType] = useState<PatientFieldDefinition['field_type']>(initial?.field_type ?? 'text')
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false)
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 999))
  const [options, setOptions] = useState<PatientFieldOption[]>(initial?.options ?? [])
  const [saving, setSaving] = useState(false)

  const isNew = !initial

  const autoSlug = (lbl: string) =>
    lbl.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

  const handleLabelChange = (v: string) => {
    setLabel(v)
    if (isNew) setSlug(autoSlug(v))
  }

  const addOption = () => setOptions(prev => [...prev, { value: '', label: '' }])
  const removeOption = (i: number) => setOptions(prev => prev.filter((_, idx) => idx !== i))
  const patchOption = (i: number, patch: Partial<PatientFieldOption>) =>
    setOptions(prev => prev.map((o, idx) => idx === i ? { ...o, ...patch } : o))

  const handleSave = async () => {
    if (!label.trim() || !slug.trim()) return
    setSaving(true)
    const payload = {
      label: label.trim(),
      slug: slug.trim(),
      field_type: fieldType,
      is_required: isRequired,
      sort_order: parseInt(sortOrder) || 999,
      options: fieldType === 'select' ? options.filter(o => o.value.trim()) : [],
      active: initial?.active ?? true,
      is_system: initial?.is_system ?? false,
    }
    if (isNew) {
      const { data, error } = await supabase
        .from('patient_field_definitions')
        .insert(payload)
        .select()
        .single()
      if (!error && data) onSaved(data as PatientFieldDefinition)
    } else {
      const { data, error } = await supabase
        .from('patient_field_definitions')
        .update(payload)
        .eq('id', initial!.id)
        .select()
        .single()
      if (!error && data) onSaved(data as PatientFieldDefinition)
    }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add Patient Field' : `Edit: ${initial?.label}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label>Label *</Label>
            <Input value={label} onChange={e => handleLabelChange(e.target.value)} placeholder="e.g. Nationality" />
          </div>
          <div className="space-y-1">
            <Label>Slug * <span className="text-[10px] text-muted-foreground">(key in patient data)</span></Label>
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="e.g. nationality"
              disabled={initial?.is_system}
              className="font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Field type</Label>
              <select
                value={fieldType}
                onChange={e => setFieldType(e.target.value as PatientFieldDefinition['field_type'])}
                disabled={initial?.is_system}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                {PATIENT_FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Sort order</Label>
              <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} />
            Required field
          </label>

          {fieldType === 'select' && (
            <div className="space-y-2">
              <Label>Options</Label>
              {options.map((opt, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input
                    value={opt.value}
                    placeholder="value"
                    className="h-7 text-xs font-mono"
                    onChange={e => patchOption(i, { value: e.target.value })}
                  />
                  <Input
                    value={opt.label}
                    placeholder="label"
                    className="h-7 text-xs"
                    onChange={e => patchOption(i, { label: e.target.value })}
                  />
                  <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0" onClick={() => removeOption(i)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addOption} className="gap-1">
                <Plus className="w-3 h-3" /> Add option
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving || !label.trim() || !slug.trim()} onClick={handleSave}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isNew ? 'Add Field' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// DepartmentsSection
// ============================================================

/** Staff row from `profiles` (used in department member picker). */
type DeptMemberProfile = { id: string; full_name: string; role: string }

function DepartmentMembersPicker({
  deptId,
  deptMembers,
  allUsers,
  onToggle,
}: {
  deptId: string
  deptMembers: string[]
  allUsers: DeptMemberProfile[]
  onToggle: (deptId: string, userId: string) => void
}) {
  const [q, setQ] = useState('')

  const displayedUsers = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = allUsers
    if (needle) {
      list = allUsers.filter(u => {
        const name = (u.full_name ?? '').toLowerCase()
        const role = (u.role ?? '').toLowerCase()
        return name.includes(needle) || role.includes(needle) || u.id.toLowerCase().includes(needle)
      })
    } else {
      list = [...allUsers].sort((a, b) => {
        const aIn = deptMembers.includes(a.id) ? 0 : 1
        const bIn = deptMembers.includes(b.id) ? 0 : 1
        if (aIn !== bIn) return aIn - bIn
        return (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
      })
    }
    return list
  }, [allUsers, deptMembers, q])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Search by name, profile role, or user ID…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="h-8 pl-8 pr-14 text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums">
          {displayedUsers.length}/{allUsers.length}
        </span>
      </div>
      <ScrollArea className="h-36 rounded-md border bg-background/50">
        <div className="flex flex-wrap gap-1.5 p-2">
          {displayedUsers.map(u => {
            const isMember = deptMembers.includes(u.id)
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => onToggle(deptId, u.id)}
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors max-w-full',
                  isMember ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/30',
                )}
                title={u.id}
              >
                {isMember && <Check className="h-2.5 w-2.5 shrink-0" />}
                <span className="truncate">{u.full_name?.trim() || u.id.slice(0, 8)}</span>
                {u.role && u.role !== 'user' && (
                  <span className="text-[9px] opacity-70 truncate max-w-[5rem]">({u.role})</span>
                )}
              </button>
            )
          })}
          {allUsers.length === 0 && (
            <span className="text-xs text-muted-foreground italic px-1 py-2">No users found</span>
          )}
          {allUsers.length > 0 && displayedUsers.length === 0 && (
            <span className="text-xs text-muted-foreground italic px-1 py-2">No matches for “{q.trim()}”.</span>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

const DEPT_COLORS = ['slate','blue','indigo','violet','purple','pink','rose','red','orange','amber','yellow','lime','green','emerald','teal','cyan']
const DEPT_ICON_OPTIONS = [
  { value: 'building-2', label: 'Building' },
  { value: 'test-tube', label: 'Lab' },
  { value: 'camera', label: 'Radiology' },
  { value: 'pill', label: 'Pharmacy' },
  { value: 'heart-pulse', label: 'Cardiology' },
  { value: 'brain', label: 'Neurology' },
  { value: 'stethoscope', label: 'Clinic' },
  { value: 'activity', label: 'ICU' },
  { value: 'users', label: 'Nursing' },
  { value: 'flask-conical', label: 'Microbiology' },
]

function DepartmentsSection() {
  const { user } = useAuthStore()
  const [departments, setDepartments] = useState<Department[]>([])
  const [allUsers, setAllUsers]       = useState<DeptMemberProfile[]>([])
  const [members, setMembers]         = useState<Record<string, string[]>>({})
  const [blockTypes, setBlockTypes]   = useState<Record<string, DepartmentBlockType[]>>({}) // deptId → block types
  const [blockDefs, setBlockDefs]     = useState<BlockDefinition[]>([])
  const [loading, setLoading]         = useState(true)
  const [editingDept, setEditingDept] = useState<Department | null | 'new'>(null)
  const [savingDept, setSavingDept]   = useState(false)

  const [form, setForm] = useState({
    name: '', slug: '', description: '',
    icon: 'building-2', color: 'slate',
    can_receive_orders: true, can_create_direct: true, active: true,
  })

  // per-department block type inline editor
  const [editingBT, setEditingBT] = useState<{ deptId: string; bt: DepartmentBlockType | null } | null>(null)
  const [btForm, setBtForm]       = useState({ name: '', description: '', order_block_def_id: '', entry_block_def_id: '', built_in_type: '', active: true })
  const [savingBT, setSavingBT]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: depts }, { data: mems }, { data: users }, { data: defs }, { data: bts }] = await Promise.all([
      supabase.from('departments').select('*').order('sort_order').order('name'),
      supabase.from('department_members').select('*'),
      supabase.from('profiles').select('id,full_name,role'),
      supabase.from('block_definitions').select('id,name,slug').eq('active', true).order('name'),
      supabase.from('department_block_types').select('*').order('sort_order').order('name'),
    ])
    if (depts) setDepartments(depts as Department[])
    if (mems) {
      const map: Record<string, string[]> = {}
      ;(mems as DepartmentMember[]).forEach(m => {
        if (!map[m.department_id]) map[m.department_id] = []
        map[m.department_id].push(m.user_id)
      })
      setMembers(map)
    }
    if (users) setAllUsers(users as DeptMemberProfile[])
    if (defs) setBlockDefs(defs as unknown as BlockDefinition[])
    if (bts) {
      const map: Record<string, DepartmentBlockType[]> = {}
      ;(bts as DepartmentBlockType[]).forEach(bt => {
        if (!map[bt.department_id]) map[bt.department_id] = []
        map[bt.department_id].push(bt)
      })
      setBlockTypes(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Department CRUD ──────────────────────────────────────────

  const openNewDept = () => {
    setEditingDept('new')
    setForm({ name:'', slug:'', description:'', icon:'building-2', color:'slate', can_receive_orders:true, can_create_direct:true, active:true })
  }

  const openEditDept = (dept: Department) => {
    setEditingDept(dept)
    setForm({ name:dept.name, slug:dept.slug, description:dept.description??'', icon:dept.icon, color:dept.color, can_receive_orders:dept.can_receive_orders, can_create_direct:dept.can_create_direct, active:dept.active })
  }

  const cancelDept = () => setEditingDept(null)

  const saveDept = async () => {
    if (!form.name.trim() || !form.slug.trim()) return
    setSavingDept(true)
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_'),
      description: form.description.trim() || null,
      icon: form.icon, color: form.color,
      can_receive_orders: form.can_receive_orders,
      can_create_direct: form.can_create_direct,
      active: form.active,
      created_by: user?.id,
    }
    if (editingDept && editingDept !== 'new') {
      await supabase.from('departments').update(payload).eq('id', editingDept.id)
    } else {
      await supabase.from('departments').insert(payload)
    }
    setSavingDept(false)
    setEditingDept(null)
    load()
  }

  const deleteDept = async (id: string) => {
    if (!confirm('Delete this department? All block types and member assignments will be removed.')) return
    await supabase.from('departments').delete().eq('id', id)
    load()
  }

  const toggleMember = async (deptId: string, userId: string) => {
    const cur = members[deptId] ?? []
    if (cur.includes(userId)) {
      await supabase.from('department_members').delete().eq('department_id', deptId).eq('user_id', userId)
    } else {
      await supabase.from('department_members').insert({ department_id: deptId, user_id: userId })
    }
    load()
  }

  // ── Block Type CRUD ──────────────────────────────────────────

  const openNewBT = (deptId: string) => {
    setEditingBT({ deptId, bt: null })
    setBtForm({ name:'', description:'', order_block_def_id:'', entry_block_def_id:'', built_in_type:'', active:true })
  }

  const openEditBT = (bt: DepartmentBlockType) => {
    setEditingBT({ deptId: bt.department_id, bt })
    setBtForm({ name:bt.name, description:bt.description??'', order_block_def_id:bt.order_block_def_id??'', entry_block_def_id:bt.entry_block_def_id??'', built_in_type:bt.built_in_type??'', active:bt.active })
  }

  const cancelBT = () => setEditingBT(null)

  const saveBT = async () => {
    if (!editingBT || !btForm.name.trim()) return
    setSavingBT(true)
    const payload = {
      department_id:      editingBT.deptId,
      name:               btForm.name.trim(),
      description:        btForm.description.trim() || null,
      order_block_def_id: btForm.order_block_def_id || null,
      entry_block_def_id: btForm.built_in_type ? null : (btForm.entry_block_def_id || null),
      built_in_type:      btForm.built_in_type || null,
      service_item_id:    null,
      active:             btForm.active,
    }
    if (editingBT.bt) {
      await supabase.from('department_block_types').update(payload).eq('id', editingBT.bt.id)
    } else {
      await supabase.from('department_block_types').insert(payload)
    }
    setSavingBT(false)
    setEditingBT(null)
    load()
  }

  const deleteBT = async (id: string) => {
    if (!confirm('Delete this block type?')) return
    await supabase.from('department_block_types').delete().eq('id', id)
    load()
  }

  const isNewDeptOpen = editingDept !== null

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Departments</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create departments, define their services (each with its own order &amp; result block type), and assign staff members.
          </p>
        </div>
        <Button size="sm" onClick={openNewDept}><Plus className="h-3.5 w-3.5" /> New Department</Button>
      </div>

      {/* New/Edit department form */}
      {isNewDeptOpen && (
        <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
          <h3 className="text-sm font-medium">{editingDept === 'new' ? 'New Department' : `Edit: ${(editingDept as Department).name}`}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g,'_') }))} placeholder="Haematology Lab" />
            </div>
            <div className="space-y-1.5">
              <Label>Slug * <span className="text-muted-foreground text-[10px]">(routing key)</span></Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,'') }))} placeholder="haem_lab" className="font-mono text-xs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <select className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}>
                {DEPT_ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <select className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}>
                {DEPT_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.can_receive_orders} onChange={e => setForm(f => ({ ...f, can_receive_orders: e.target.checked }))} className="accent-primary" />
              Can receive orders
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.can_create_direct} onChange={e => setForm(f => ({ ...f, can_create_direct: e.target.checked }))} className="accent-primary" />
              Walk-in / direct entries
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
              Active
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={cancelDept}>Cancel</Button>
            <Button size="sm" onClick={saveDept} disabled={savingDept || !form.name.trim() || !form.slug.trim()}>
              {savingDept && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingDept === 'new' ? 'Create Department' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}

      {departments.length === 0 && !isNewDeptOpen && (
        <p className="text-sm text-muted-foreground text-center py-8">No departments yet. Create one to get started.</p>
      )}

      <div className="space-y-4">
        {departments.map(dept => {
          const deptMembers = members[dept.id] ?? []
          const deptBTs     = blockTypes[dept.id] ?? []
          const isBTEditing = editingBT?.deptId === dept.id

          return (
            <div key={dept.id} className="border rounded-lg overflow-hidden">
              {/* Department header */}
              <div className="flex items-start justify-between gap-2 p-4 bg-muted/10">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{dept.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{dept.slug}</span>
                    {!dept.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  {dept.description && <p className="text-xs text-muted-foreground mt-0.5">{dept.description}</p>}
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    {dept.can_receive_orders && <span>● Receives orders</span>}
                    {dept.can_create_direct && <span>● Walk-in entries</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEditDept(dept)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => deleteDept(dept.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              {/* Block Types */}
              <div className="p-4 border-t space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Services / Block Types ({deptBTs.length})
                  </p>
                  {!isBTEditing && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => openNewBT(dept.id)}>
                      <Plus className="h-3 w-3" /> Add Service
                    </Button>
                  )}
                </div>

                {/* Inline add/edit form for block types */}
                {isBTEditing && (
                  <div className="border rounded-md p-3 space-y-3 bg-muted/20">
                    <p className="text-xs font-medium">{editingBT.bt ? 'Edit Service' : 'New Service'}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Service Name *</Label>
                        <Input value={btForm.name} onChange={e => setBtForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. CBC, Chest X-Ray, Paracetamol" className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Order block <span className="text-muted-foreground">(doctor places)</span></Label>
                        <select className="w-full h-8 px-2 text-xs rounded-md border border-border bg-background" value={btForm.order_block_def_id} onChange={e => setBtForm(f => ({ ...f, order_block_def_id: e.target.value }))}>
                          <option value="">— None —</option>
                          {blockDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Result block <span className="text-muted-foreground">(dept fills in)</span></Label>
                        <select
                          className="w-full h-8 px-2 text-xs rounded-md border border-border bg-background"
                          value={btForm.built_in_type ? `__builtin__${btForm.built_in_type}` : btForm.entry_block_def_id}
                          onChange={e => {
                            const val = e.target.value
                            if (val.startsWith('__builtin__')) {
                              setBtForm(f => ({ ...f, built_in_type: val.replace('__builtin__', ''), entry_block_def_id: '' }))
                            } else {
                              setBtForm(f => ({ ...f, built_in_type: '', entry_block_def_id: val }))
                            }
                          }}
                        >
                          <option value="">— None —</option>
                          <optgroup label="Built-in">
                            {Object.keys(BLOCK_REGISTRY).map(slug => (
                              <option key={slug} value={`__builtin__${slug}`}>
                                {slug.charAt(0).toUpperCase() + slug.slice(1)}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Custom forms">
                            {blockDefs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </optgroup>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={btForm.active} onChange={e => setBtForm(f => ({ ...f, active: e.target.checked }))} className="accent-primary" />
                        Active
                      </label>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cancelBT}>Cancel</Button>
                        <Button size="sm" className="h-7 text-xs" onClick={saveBT} disabled={savingBT || !btForm.name.trim()}>
                          {savingBT && <Loader2 className="h-3 w-3 animate-spin" />}
                          {editingBT.bt ? 'Save' : 'Add'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {deptBTs.length === 0 && !isBTEditing ? (
                  <p className="text-xs text-muted-foreground italic">No services defined yet. Add one to enable ordering and walk-in entries.</p>
                ) : (
                  <div className="space-y-1.5">
                    {deptBTs.map(bt => {
                      const orderDef = blockDefs.find(d => d.id === bt.order_block_def_id)
                      const entryDef = blockDefs.find(d => d.id === bt.entry_block_def_id)
                      return (
                        <div key={bt.id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-md border bg-background">
                          <div className="flex-1 min-w-0">
                            <span className={cn('font-medium', !bt.active && 'line-through text-muted-foreground')}>{bt.name}</span>
                            <div className="flex gap-3 mt-0.5 text-muted-foreground flex-wrap">
                              <span>Order: <span className="text-foreground">{orderDef?.name ?? '—'}</span></span>
                              <span>Result: <span className="text-foreground">
                                {bt.built_in_type
                                  ? `${bt.built_in_type.charAt(0).toUpperCase() + bt.built_in_type.slice(1)} ★`
                                  : (entryDef?.name ?? '—')}
                              </span></span>
                            </div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={() => openEditBT(bt)}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon-sm" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteBT(bt.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Members — searchable + scrollable for large orgs */}
              <div className="p-4 border-t">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                  Members ({deptMembers.length})
                </p>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Search to find staff quickly. Checked = in this department.
                </p>
                <DepartmentMembersPicker
                  deptId={dept.id}
                  deptMembers={deptMembers}
                  allUsers={allUsers}
                  onToggle={toggleMember}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Service Items Section (billing.manage_fees)
// ============================================================

const SERVICE_ITEM_UNCATEGORIZED = 'Uncategorized'

type ServiceItemRow = {
  id: string
  code: string
  name: string
  category: string | null
  default_price: number
  active: boolean
  sort_order: number
}

function ServiceItemsSection() {
  const [items, setItems] = useState<ServiceItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<{ id?: string; code: string; name: string; category: string; default_price: string; active: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('service_items').select('*').order('sort_order')
    setItems((data ?? []) as ServiceItemRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const existingCategories = useMemo(() => {
    const s = new Set<string>()
    for (const i of items) {
      const t = i.category?.trim()
      if (t) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [items])

  const groupedByCategory = useMemo(() => {
    const map = new Map<string, ServiceItemRow[]>()
    for (const item of items) {
      const raw = item.category?.trim()
      const key = raw && raw.length > 0 ? raw : SERVICE_ITEM_UNCATEGORIZED
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === SERVICE_ITEM_UNCATEGORIZED) return 1
      if (b === SERVICE_ITEM_UNCATEGORIZED) return -1
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    })
    return keys.map(category => ({ category, items: map.get(category)! }))
  }, [items])

  const openNew = () => setEditing({ code: '', name: '', category: '', default_price: '', active: true })
  const openEdit = (item: ServiceItemRow) => setEditing({
    id: item.id, code: item.code, name: item.name, category: item.category ?? '', default_price: String(item.default_price), active: item.active,
  })

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    if (editing.id) {
      await supabase.from('service_items').update({
        code: editing.code, name: editing.name, category: editing.category || null,
        default_price: parseFloat(editing.default_price) || 0, active: editing.active,
      }).eq('id', editing.id)
    } else {
      await supabase.from('service_items').insert({
        code: editing.code, name: editing.name, category: editing.category || null,
        default_price: parseFloat(editing.default_price) || 0, active: editing.active,
      })
    }
    setSaving(false)
    setEditing(null)
    fetchItems()
  }

  const handleDelete = async (item: ServiceItemRow) => {
    if (!confirm(`Delete "${item.name}"? Any block definitions linked to this item will have their service item cleared.`)) return
    const { error } = await supabase.from('service_items').delete().eq('id', item.id)
    if (error) { alert(error.message); return }
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold mb-1">Service Items</h2>
          <p className="text-xs text-muted-foreground">Fee schedule for charges. Link these to block definitions for auto-charging.</p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5" /> New Item
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
          No service items yet. Create one to get started.
        </p>
      ) : (
        <div className="space-y-5">
          {groupedByCategory.map(({ category, items: sectionItems }) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 px-0.5">
                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {category === SERVICE_ITEM_UNCATEGORIZED ? 'Uncategorized' : category}
                </h3>
                <Badge variant="secondary" className="text-[9px] py-0 h-4 font-medium tabular-nums">
                  {sectionItems.length}
                </Badge>
              </div>
              <div className="border rounded-lg divide-y overflow-hidden bg-card">
                {sectionItems.map(item => (
                  <div key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5', !item.active && 'opacity-50')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{item.name}</p>
                        <span className="text-[10px] font-mono text-muted-foreground">{item.code}</span>
                      </div>
                    </div>
                    <p className="text-sm font-mono shrink-0 tabular-nums">{item.default_price.toFixed(2)}</p>
                    {!item.active && <Badge variant="muted" className="text-[10px] py-0">Inactive</Badge>}
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0" onClick={() => openEdit(item)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-6 w-6 shrink-0 hover:text-red-500" onClick={() => handleDelete(item)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / New dialog */}
      <Dialog open={!!editing} onOpenChange={o => { if (!o) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit Service Item' : 'New Service Item'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} placeholder="LAB-CBC" />
                </div>
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <Input type="number" value={editing.default_price} onChange={e => setEditing({ ...editing, default_price: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Complete Blood Count" />
              </div>
              <div className="space-y-1.5">
                <Label>Category <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  value={editing.category}
                  onChange={e => setEditing({ ...editing, category: e.target.value })}
                  placeholder="e.g. Laboratory, Imaging, Consultation"
                  list="service-item-categories"
                  autoComplete="off"
                />
                <datalist id="service-item-categories">
                  {existingCategories.map(c => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Items with the same category are grouped together on this page. Leave empty for &quot;Uncategorized&quot;.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} className="rounded" />
                <span className="text-sm">Active</span>
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !editing.code || !editing.name}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// General Section (admin)
// ============================================================

function SettingStatus({ saving, saved, error }: { saving: boolean; saved: boolean; error: string | null }) {
  if (!saving && !saved && !error) return null
  return (
    <p className={cn('mt-2 text-xs', saved ? 'text-emerald-600' : error ? 'text-destructive' : 'text-muted-foreground')}>
      {saving ? 'Saving…' : saved ? 'Saved' : error}
    </p>
  )
}

function useSettingState() {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<{ error: string | null }>) => {
    setSaving(true); setSaved(false); setError(null)
    const res = await fn()
    setSaving(false)
    if (res.error) setError(res.error)
    else { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return { saving, saved, error, run }
}

function GeneralSection() {
  const {
    nameFormat, updateNameFormat,
    facilityName, updateFacilityName,
    dateFormat, updateDateFormat,
    timeFormat, updateTimeFormat,
    billingEnabled, updateBillingEnabled,
    currencySymbol, updateCurrencySymbol,
  } = useSettingsStore()
  const { theme, toggle } = useThemeStore()

  const nameState     = useSettingState()
  const facilityState = useSettingState()
  const dateState     = useSettingState()
  const timeState     = useSettingState()
  const billingState  = useSettingState()
  const currencyState = useSettingState()

  const [facilityDraft, setFacilityDraft] = useState(facilityName)
  const [currencyDraft, setCurrencyDraft] = useState(currencySymbol)

  // Sync drafts when store values load
  useEffect(() => { setFacilityDraft(facilityName) }, [facilityName])
  useEffect(() => { setCurrencyDraft(currencySymbol) }, [currencySymbol])

  const handleFacilitySave = () => {
    facilityState.run(() => updateFacilityName(facilityDraft.trim()))
  }

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h2 className="text-sm font-semibold mb-1">General Settings</h2>
        <p className="text-xs text-muted-foreground">System-wide configuration applied to all users.</p>
      </div>

      <Separator />

      {/* Billing Toggle */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Billing System</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Enable the billing module for charges, payments, deposits, and invoices.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => billingState.run(() => updateBillingEnabled(!billingEnabled))}
            className="relative"
          >
            <div className={cn(
              'h-6 w-11 rounded-full transition-colors',
              billingEnabled ? 'bg-primary' : 'bg-muted-foreground/30',
            )}>
              <div className={cn(
                'absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                billingEnabled ? 'translate-x-6' : 'translate-x-1',
              )} />
            </div>
          </button>
          <span className="text-sm">{billingEnabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <SettingStatus {...billingState} />
      </div>

      <Separator />

      {/* Currency */}
      {billingEnabled && (
        <>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Currency</Label>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Enter the currency symbol to display on charges, receipts, and billing displays.
            </p>
            <div className="flex gap-2">
              <Input
                value={currencyDraft}
                onChange={e => { setCurrencyDraft(e.target.value); currencyState.run(() => Promise.resolve({ error: null })) }}
                onBlur={() => currencyState.run(() => updateCurrencySymbol(currencyDraft.trim() || '$'))}
                onKeyDown={e => e.key === 'Enter' && currencyState.run(() => updateCurrencySymbol(currencyDraft.trim() || '$'))}
                placeholder="e.g. $, €, £, KSh"
                className="max-w-[12rem]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => currencyState.run(() => updateCurrencySymbol(currencyDraft.trim() || '$'))}
                disabled={currencyState.saving || currencyDraft.trim() === currencySymbol}
              >
                {currencyState.saving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : 'Save'}
              </Button>
            </div>
            <SettingStatus {...currencyState} />
          </div>
          <Separator />
        </>
      )}

      {/* Appearance */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Appearance</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Choose your preferred colour scheme. Saved locally in your browser.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'light', label: 'Light', Icon: Sun,  preview: 'bg-white border-slate-200 text-slate-800' },
            { value: 'dark',  label: 'Dark',  Icon: Moon, preview: 'bg-slate-900 border-slate-700 text-slate-100' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => theme !== opt.value && toggle()}
              className={cn(
                'relative flex flex-col gap-2 rounded-lg border-2 p-4 text-left transition-all',
                theme === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {theme === opt.value && (
                <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              {/* Mini preview swatch */}
              <div className={cn('w-full h-10 rounded-md border flex items-center justify-center', opt.preview)}>
                <opt.Icon className="h-4 w-4 opacity-60" />
              </div>
              <span className="text-sm font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Facility Name */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Facility Name</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          The name of your hospital, clinic, or health centre. Displayed throughout the system.
        </p>
        <div className="flex gap-2">
          <Input
            value={facilityDraft}
            onChange={e => { setFacilityDraft(e.target.value); facilityState.run(() => Promise.resolve({ error: null })) }}
            onBlur={handleFacilitySave}
            onKeyDown={e => e.key === 'Enter' && handleFacilitySave()}
            placeholder="e.g. City General Hospital"
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleFacilitySave}
            disabled={facilityState.saving || facilityDraft.trim() === facilityName}
          >
            {facilityState.saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : facilityState.saved
                ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                : 'Save'
            }
          </Button>
        </div>
        <SettingStatus {...facilityState} />
      </div>

      <Separator />

      {/* Patient Name Format */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Patient Name Format</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          How patient names are collected and displayed across the system.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: 'two' as NameFormat,   title: 'Two Names',   description: 'First + Last',              example: 'Jane Smith' },
            { value: 'three' as NameFormat, title: 'Three Names', description: 'First + Middle + Last',     example: 'Jane Marie Smith' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => nameState.run(() => updateNameFormat(opt.value))}
              disabled={nameState.saving}
              className={cn(
                'relative flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-all',
                nameFormat === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {nameFormat === opt.value && (
                <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <span className="text-sm font-medium">{opt.title}</span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
              <span className="mt-1 text-xs font-mono text-foreground/60">{opt.example}</span>
            </button>
          ))}
        </div>
        <SettingStatus {...nameState} />
      </div>

      <Separator />

      {/* Date Format */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Date Display Format</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          How dates are shown throughout the application.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'dd/mm/yyyy' as DateFormat, label: 'DD/MM/YYYY', example: '25/03/2025' },
            { value: 'mm/dd/yyyy' as DateFormat, label: 'MM/DD/YYYY', example: '03/25/2025' },
            { value: 'yyyy-mm-dd' as DateFormat, label: 'YYYY-MM-DD', example: '2025-03-25' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => dateState.run(() => updateDateFormat(opt.value))}
              disabled={dateState.saving}
              className={cn(
                'relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-center transition-all',
                dateFormat === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {dateFormat === opt.value && (
                <span className="absolute top-2 right-2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2 w-2" />
                </span>
              )}
              <span className="text-xs font-semibold">{opt.label}</span>
              <span className="text-[11px] font-mono text-muted-foreground">{opt.example}</span>
            </button>
          ))}
        </div>
        <SettingStatus {...dateState} />
      </div>

      <Separator />

      {/* Time Format */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Time Format</Label>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          How times are displayed across the system.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: '24h' as TimeFormat, title: '24-hour',  example: '14:30' },
            { value: '12h' as TimeFormat, title: '12-hour',  example: '2:30 PM' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => timeState.run(() => updateTimeFormat(opt.value))}
              disabled={timeState.saving}
              className={cn(
                'relative flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-all',
                timeFormat === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40',
              )}
            >
              {timeFormat === opt.value && (
                <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
              <span className="text-sm font-medium">{opt.title}</span>
              <span className="mt-1 text-xs font-mono text-foreground/60">{opt.example}</span>
            </button>
          ))}
        </div>
        <SettingStatus {...timeState} />
      </div>
    </div>
  )
}

// ============================================================
// Settings Page
// ============================================================

const SETTINGS_NAV = (isAdmin: boolean, canManageSettings: boolean, canManageBlocks: boolean, canTemplates: boolean, canBlocks: boolean, canManageFees: boolean) => [
  { id: 'profile',       label: 'Profile',         icon: User,          show: true },
  { id: 'blocks',        label: 'My Blocks',        icon: Blocks,        show: canBlocks },
  { id: 'templates',     label: 'Templates',        icon: LayoutTemplate, show: canTemplates },
  { id: 'standard',      label: 'Block Library',    icon: Globe,         show: canManageBlocks },
  { id: 'patient-fields',label: 'Patient Fields',   icon: User,          show: isAdmin },
  { id: 'roles',         label: 'Roles',            icon: ShieldCheck,   show: isAdmin },
  { id: 'users',         label: 'Users',            icon: Users,         show: isAdmin },
  { id: 'departments',   label: 'Departments',      icon: Building2,     show: isAdmin },
  { id: 'service-items', label: 'Service Items',    icon: Star,          show: canManageFees },
  { id: 'general',       label: 'General',          icon: Settings2,     show: canManageSettings },
].filter(n => n.show)

export default function SettingsPage() {
  const { can, hasRole } = useAuthStore()
  const isAdmin           = can('admin.manage_users')
  const canManageSettings = can('admin.manage_settings')
  const canManageBlocks   = can('admin.manage_blocks')
  const canTemplates      = can('template.create') && hasRole('physician')
  const canBlocks         = can('block.add')
  const canManageFees     = can('billing.manage_fees')

  const nav = SETTINGS_NAV(isAdmin, canManageSettings, canManageBlocks, canTemplates, canBlocks, canManageFees)
  const [active, setActive]       = useState(nav[0]?.id ?? 'profile')
  const [collapsed, setCollapsed] = useState(false)

  const current = nav.find(n => n.id === active)

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Mobile: horizontal scrollable tab strip (< md) ── */}
      <div className="md:hidden flex overflow-x-auto border-b bg-muted/20 shrink-0 no-scrollbar">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 min-h-[44px] text-sm whitespace-nowrap border-b-2 transition-colors shrink-0',
              active === id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Desktop layout: sidebar + content ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

      {/* ── Left sidebar nav (md+) ── */}
      <aside
        className={cn(
          'relative hidden md:flex flex-col border-r bg-muted/20 shrink-0 transition-[width] duration-200 overflow-hidden',
          collapsed ? 'w-[52px]' : 'w-[200px]',
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center border-b px-3 py-4 shrink-0 gap-2',
          collapsed ? 'justify-center' : 'justify-between',
        )}>
          {!collapsed && <span className="text-sm font-semibold">Settings</span>}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={cn(
                'relative w-full flex items-center gap-2.5 px-3 py-3 text-sm transition-colors',
                active === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                collapsed ? 'justify-center' : '',
              )}
              title={collapsed ? label : undefined}
            >
              {active === id && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Section header (desktop only — on mobile the tab strip serves as header) */}
        <header className="hidden md:block border-b px-6 py-4 shrink-0">
          <h1 className="text-sm font-semibold">{current?.label ?? 'Settings'}</h1>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {active === 'profile'        && <ProfileSection />}
          {active === 'blocks'         && canBlocks       && <CustomBlocksSection />}
          {active === 'templates'      && canTemplates    && <TemplatesSection />}
          {active === 'standard'       && canManageBlocks && <StandardBlocksSection />}
          {active === 'patient-fields' && isAdmin         && <PatientFieldsSection />}
          {active === 'roles'          && isAdmin         && <RolesSection />}
          {active === 'users'          && isAdmin         && <UsersSection />}
          {active === 'departments'    && isAdmin         && <DepartmentsSection />}
          {active === 'service-items'  && canManageFees   && <ServiceItemsSection />}
          {active === 'general'        && canManageSettings && <GeneralSection />}
        </div>
      </div>

      </div>
    </div>
  )
}
