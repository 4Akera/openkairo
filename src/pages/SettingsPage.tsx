import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2,
  User, Blocks, ChevronDown, ChevronUp, X, GripVertical, Check,
  ShieldCheck, Users, Shield, Globe, LayoutTemplate,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import * as adminApi from '../lib/adminUsers'
import { useAuthStore } from '../stores/authStore'
import type { BlockDefinition, FieldDef, FieldType, Role, UserWithRoles, Permission, EncounterTemplate, TemplateBlock, PatientFieldDefinition, PatientFieldOption } from '../types'
import { PERMISSIONS, PERMISSION_LABELS } from '../types'
import {
  Button, Input, Badge, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  ScrollArea, Label,
} from '../components/ui'
import { cn, getDefinitionColors } from '../lib/utils'
import {
  FileText, ClipboardList, Stethoscope, Activity, Heart, Brain,
  TestTube, Zap, Clock, AlertTriangle, ArrowRight, Camera,
  BarChart2, Clipboard, FlaskConical, Pill, Star, Layers, CheckCheck, Pin,
} from 'lucide-react'

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
// Example blocks seeded on "Load Examples"
// ============================================================

function exampleDefs(userId: string): Omit<BlockDefinition, 'id' | 'created_at'>[] {
  return [
    {
      name: 'Consultation Request',
      slug: `consult_${userId.slice(0, 8)}`,
      icon: 'arrow-right',
      color: 'indigo',
      description: 'Request a specialist consultation',
      cap_media: false, cap_time_series: false,
      cap_immutable: false, cap_co_sign: true, cap_required: false,
      fields: [
        { id: 'specialty', label: 'Specialty', type: 'select', required: true, options: [
          { value: 'cardiology', label: 'Cardiology' },
          { value: 'neurology', label: 'Neurology' },
          { value: 'gastro', label: 'Gastroenterology' },
          { value: 'ortho', label: 'Orthopedics' },
          { value: 'psych', label: 'Psychiatry' },
          { value: 'other', label: 'Other' },
        ]},
        { id: 'urgency', label: 'Urgency', type: 'select', required: true, options: [
          { value: 'routine', label: 'Routine' },
          { value: 'urgent', label: 'Urgent' },
          { value: 'emergent', label: 'Emergent' },
        ]},
        { id: 'reason', label: 'Reason for Consultation', type: 'textarea', required: true, rows: 2 },
        { id: 'clinical_summary', label: 'Clinical Summary', type: 'textarea', rows: 3 },
        { id: 'callback', label: 'Callback Number', type: 'text' },
      ] as FieldDef[],
      time_series_fields: [],
      config: {},
      is_builtin: false,
      active: true,
      sort_order: 100,
      created_by: userId,
      is_universal: false,
      visible_to_roles: [],
      default_visible_to_roles: [],
      default_portal_visible: true,
    },
    {
      name: 'Fluid Balance Log',
      slug: `fluid_balance_${userId.slice(0, 8)}`,
      icon: 'activity',
      color: 'cyan',
      description: 'Track fluid intake and output over time',
      cap_media: false, cap_time_series: true,
      cap_immutable: true, cap_co_sign: false, cap_required: false,
      fields: [
        { id: 'start_time', label: 'Start Time', type: 'datetime', required: true },
        { id: 'target_balance', label: 'Target Balance', type: 'text', placeholder: 'e.g. Even or -500 mL' },
      ] as FieldDef[],
      time_series_fields: [
        { id: 'section_in', label: 'Intake', type: 'section_header' },
        { id: 'intake_type', label: 'Route', type: 'select', options: [
          { value: 'oral', label: 'Oral' },
          { value: 'iv', label: 'IV' },
          { value: 'ngt', label: 'NGT' },
          { value: 'other', label: 'Other' },
        ]},
        { id: 'intake_ml', label: 'Intake', type: 'number', unit: 'mL' },
        { id: 'section_out', label: 'Output', type: 'section_header' },
        { id: 'output_type', label: 'Type', type: 'select', options: [
          { value: 'urine', label: 'Urine' },
          { value: 'drain', label: 'Drain' },
          { value: 'stool', label: 'Stool' },
          { value: 'other', label: 'Other' },
        ]},
        { id: 'output_ml', label: 'Output', type: 'number', unit: 'mL' },
        { id: 'notes', label: 'Notes', type: 'text' },
      ] as FieldDef[],
      config: {},
      is_builtin: false,
      active: true,
      sort_order: 110,
      created_by: userId,
      is_universal: false,
      visible_to_roles: [],
      default_visible_to_roles: [],
      default_portal_visible: true,
    },
  ]
}

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
  name: '', slug: '', icon: 'file-text', color: 'blue', description: '',
  cap_media: false, cap_time_series: false,
  cap_immutable: false, cap_co_sign: false, cap_required: false,
  fields: [], time_series_fields: [], config: {},
  is_builtin: false, is_universal: false, visible_to_roles: [],
  default_visible_to_roles: [], default_portal_visible: true,
  active: true, sort_order: 100,
}

function BlockDefinitionModal({
  initial,
  isStandard,
  allRoles,
  onClose,
  onSaved,
}: {
  initial?: BlockDefinition
  isStandard?: boolean
  allRoles?: Role[]
  onClose: () => void
  onSaved: (def: BlockDefinition) => void
}) {
  const { user } = useAuthStore()
  const [form, setForm] = useState<Partial<BlockDefinition>>(
    initial
      ? { ...initial }
      : { ...EMPTY_DEF, is_universal: !!isStandard, visible_to_roles: [] },
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTsFields, setShowTsFields] = useState(!!initial?.cap_time_series)

  const set = (patch: Partial<BlockDefinition>) => setForm((f) => ({ ...f, ...patch }))

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const handleSave = async () => {
    if (!form.name?.trim()) { setError('Name is required'); return }
    if (!form.slug?.trim()) { setError('Slug is required'); return }
    setSaving(true)
    setError(null)

    const payload = { ...form, created_by: user?.id } as Omit<BlockDefinition, 'id' | 'created_at'>

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
            <div className={cn('h-6 w-6 rounded-full flex items-center justify-center', colors.iconBg)}>
              <IconComp className="w-3 h-3 text-white" />
            </div>
            {initial ? 'Edit Block Type' : 'New Block Type'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="space-y-5 py-1">

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
                    className="mt-1 font-mono text-sm"
                  />
                </div>
              </div>

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
              <div className="grid grid-cols-2 gap-2">
                {CAPABILITIES.map(({ key, label, desc }) => (
                  <label
                    key={key}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border p-2 cursor-pointer transition-colors',
                      form[key] ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30',
                    )}
                  >
                    <input
                      type="checkbox"
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

            {/* ── Role Visibility (standard blocks only) ── */}
            {isStandard && allRoles && allRoles.length > 0 && (
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
                    {allRoles.map((role) => {
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

            {/* ── Default Block Privacy ── */}
            {allRoles && allRoles.length > 0 && (
              <>
                <Separator />
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
                    {allRoles.map((role) => {
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
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5"
                      checked={!!form.default_portal_visible}
                      onChange={(e) => set({ default_portal_visible: e.target.checked })}
                    />
                    <span>Visible in patient portal by default</span>
                  </label>
                </section>
              </>
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

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-3 border-t mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Block Type'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Block Definition Card
// ============================================================

function BlockDefCard({
  def,
  onEdit,
  onDelete,
  onToggle,
}: {
  def: BlockDefinition
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const colors = getDefinitionColors(def.color)
  const IconComp = ICON_OPTIONS.find((i) => i.value === def.icon)?.Icon ?? FileText

  const caps = [
    def.cap_media && 'Media',
    def.cap_time_series && 'Series',
    def.cap_immutable && 'Immutable',
    def.cap_co_sign && 'Co-Sign',
    def.cap_required && 'Required',
  ].filter(Boolean) as string[]

  return (
    <div className={cn(
      'flex items-start gap-3 p-3 rounded-lg border border-l-4 transition-opacity',
      colors.border,
      !def.active && 'opacity-50',
    )}>
      <div className={cn('h-8 w-8 rounded-md flex items-center justify-center shrink-0', colors.iconBg)}>
        <IconComp className="w-4 h-4 text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{def.name}</p>
          {!def.active && <Badge variant="muted" className="text-[10px] py-0">Inactive</Badge>}
        </div>
        <p className="text-[10px] font-mono text-muted-foreground">{def.slug}</p>
        {def.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{def.description}</p>
        )}
        {caps.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {caps.map((c) => (
              <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-muted border text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={onToggle} title={def.active ? 'Deactivate' : 'Activate'}>
          {def.active
            ? <ToggleRight className="w-4 h-4 text-green-600" />
            : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} title="Delete"
          className="hover:text-red-500">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// Custom Blocks Section
// ============================================================

function CustomBlocksSection() {
  const { user } = useAuthStore()
  const [defs, setDefs] = useState<BlockDefinition[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BlockDefinition | 'new' | undefined>()
  const [seeding, setSeeding] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const [{ data }, { data: rolesData }] = await Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .eq('is_builtin', false)
        .eq('created_by', user.id)
        .order('sort_order', { ascending: true }),
      supabase.from('roles').select('*').order('name'),
    ])
    if (data) setDefs(data as BlockDefinition[])
    if (rolesData) setAllRoles(rolesData as Role[])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const handleSaved = (def: BlockDefinition) => {
    setDefs((prev) => {
      const exists = prev.find((d) => d.id === def.id)
      return exists ? prev.map((d) => (d.id === def.id ? def : d)) : [...prev, def]
    })
    setEditing(undefined)
  }

  const handleDelete = async (def: BlockDefinition) => {
    if (!confirm(`Delete "${def.name}"? This cannot be undone.`)) return
    await supabase.from('block_definitions').delete().eq('id', def.id)
    setDefs((prev) => prev.filter((d) => d.id !== def.id))
  }

  const handleToggle = async (def: BlockDefinition) => {
    const { data } = await supabase
      .from('block_definitions')
      .update({ active: !def.active })
      .eq('id', def.id)
      .select()
      .single()
    if (data) setDefs((prev) => prev.map((d) => (d.id === def.id ? data as BlockDefinition : d)))
  }

  const loadExamples = async () => {
    if (!user) return
    setSeeding(true)
    const examples = exampleDefs(user.id)
    for (const ex of examples) {
      const exists = defs.some((d) => d.slug === ex.slug)
      if (!exists) {
        const { data } = await supabase.from('block_definitions').insert(ex).select().single()
        if (data) setDefs((prev) => [...prev, data as BlockDefinition])
      }
    }
    setSeeding(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">My Block Types</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Custom block types only visible to you. They appear in the Add Block menu inside encounters.
          </p>
        </div>
        <div className="flex gap-2">
          {defs.length === 0 && !loading && (
            <Button variant="outline" size="sm" onClick={loadExamples} disabled={seeding}>
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
              Load Examples
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="w-3.5 h-3.5" /> New Block Type
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : defs.length === 0 ? (
        <div className="border border-dashed rounded-lg py-10 text-center text-muted-foreground space-y-2">
          <Blocks className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-sm">No custom block types yet</p>
          <p className="text-xs">Create one or load the examples to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {defs.map((def) => (
            <BlockDefCard
              key={def.id}
              def={def}
              onEdit={() => setEditing(def)}
              onDelete={() => handleDelete(def)}
              onToggle={() => handleToggle(def)}
            />
          ))}
        </div>
      )}

      {editing !== undefined && (
        <BlockDefinitionModal
          initial={editing !== 'new' ? editing : undefined}
          allRoles={allRoles}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ============================================================
// Standard Blocks Section (admin)
// ============================================================

function StandardBlocksSection() {
  const [defs, setDefs] = useState<BlockDefinition[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BlockDefinition | 'new' | undefined>()

  const load = useCallback(async () => {
    const [defsRes, rolesRes] = await Promise.all([
      supabase
        .from('block_definitions')
        .select('*')
        .eq('is_universal', true)
        .order('sort_order', { ascending: true }),
      supabase.from('roles').select('*').order('sort_order'),
    ])
    if (defsRes.data) setDefs(defsRes.data as BlockDefinition[])
    if (rolesRes.data) setAllRoles(rolesRes.data as Role[])
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
            if (!confirm(`Delete standard block "${def.name}"? This will remove it from all users' menus.`)) return
    const res = await adminApi.deleteStandardBlock(def.id)
    if (res.error) { alert(res.error); return }
    setDefs((prev) => prev.filter((d) => d.id !== def.id))
  }

  const handleToggle = async (def: BlockDefinition) => {
    const res = await adminApi.updateStandardBlock(def.id, { active: !def.active })
    if (!res.error && res.data) setDefs((prev) => prev.map((d) => (d.id === def.id ? res.data! : d)))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Standard Block Types</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admin-created blocks visible to all users (or filtered by role). They appear in the "Standard Blocks" section of the Add Block menu.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus className="w-3.5 h-3.5" /> New Standard Block
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : defs.length === 0 ? (
        <div className="border border-dashed rounded-lg py-10 text-center text-muted-foreground space-y-2">
          <Globe className="w-8 h-8 mx-auto opacity-40" />
          <p className="text-sm">No standard blocks yet.</p>
          <p className="text-xs">Create your first standard block type for all providers to use.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {defs.map((def) => (
            <div key={def.id} className="relative">
              <BlockDefCard
                def={def}
                onEdit={() => setEditing(def)}
                onDelete={() => handleDelete(def)}
                onToggle={() => handleToggle(def)}
              />
              {def.visible_to_roles.length > 0 && (
                <div className="absolute top-2 right-28 flex gap-1">
                  {def.visible_to_roles.map((slug) => (
                    <span key={slug} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700">
                      {allRoles.find((r) => r.slug === slug)?.name ?? slug}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <BlockDefinitionModal
          initial={editing !== 'new' ? editing : undefined}
          isStandard
          allRoles={allRoles}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      )}
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

  const systemDefs = allDefs.filter((d) => d.is_builtin)
  const standardDefs = allDefs.filter((d) => d.is_universal && !d.is_builtin)
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
                      <p className="text-xs font-medium">Standard Template</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Visible to all users with encounter creation permission (optionally filtered by role below).
                      </p>
                    </div>
                  </label>

                  {form.is_universal && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Role filter — leave all unchecked to show to everyone:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {allRoles.map((role) => {
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
              {form.default_visibility === 'restricted' && allRoles.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2">Roles that can view this encounter:</p>
                  <div className="flex flex-wrap gap-2">
                    {allRoles.map((role) => {
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
                          <button onClick={() => toggleBlockDef(def ?? { slug: b.slug } as BlockDefinition)} className="text-muted-foreground hover:text-red-500 ml-0.5">
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
                { label: 'System Blocks', items: systemDefs },
                { label: 'Standard Blocks', items: standardDefs },
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
                Standard Templates
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
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700">Standard</span>
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
  const { user, profile, updateProfile } = useAuthStore()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setName(profile?.full_name ?? '') }, [profile])

  const handleSave = async () => {
    setSaving(true)
    await updateProfile({ full_name: name.trim() })
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
          <Input value={profile?.role ?? 'admin'} readOnly className="mt-1 bg-muted text-muted-foreground capitalize" />
        </div>
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
const TAB_CLS = "rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-10 gap-1.5 text-sm"

function RoleModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Role
  onClose: () => void
  onSaved: (role: Role) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set((initial?.permissions ?? []) as Permission[]),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const toggle = (p: Permission) =>
    setSelected((prev) => { const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s })

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    if (!slug.trim()) { setError('Slug is required'); return }
    setSaving(true); setError(null)
    const payload = { name: name.trim(), slug: slug.trim(), description: description.trim(), permissions: [...selected] as Permission[] }
    const result = initial
      ? await adminApi.updateRole(initial.id, payload)
      : await adminApi.createRole(payload)
    setSaving(false)
    if (result.error) { setError(result.error); return }
    onSaved(result.data!)
  }

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

            <Separator />

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Permissions</p>
              {PERM_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">{cat}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PERMISSIONS.filter((p) => PERMISSION_LABELS[p].category === cat).map((perm) => (
                      <label
                        key={perm}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer text-xs transition-colors',
                          selected.has(perm)
                            ? 'border-primary/50 bg-primary/5 text-foreground'
                            : 'border-border text-muted-foreground hover:border-primary/30',
                        )}
                      >
                        <input type="checkbox" checked={selected.has(perm)} onChange={() => toggle(perm)} className="w-3.5 h-3.5 shrink-0" />
                        {PERMISSION_LABELS[perm].label}
                      </label>
                    ))}
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
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Role | 'new' | undefined>()

  useEffect(() => {
    supabase.from('roles').select('*').order('sort_order')
      .then(({ data }) => { if (data) setRoles(data as Role[]); setLoading(false) })
  }, [])

  const handleSaved = (role: Role) =>
    setRoles((prev) => prev.find((r) => r.id === role.id) ? prev.map((r) => r.id === role.id ? role : r) : [...prev, role])

  const handleDelete = async (role: Role) => {
    if (role.is_system || !confirm(`Delete role "${role.name}"?`)) return
    const res = await adminApi.deleteRole(role.id)
    if (res.error) { alert(res.error); return }
    setRoles((prev) => prev.filter((r) => r.id !== role.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Roles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Define what each role can do. System roles cannot be deleted.</p>
        </div>
        <Button size="sm" onClick={() => setEditing('new')}>
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
                {!role.is_system && (
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(role)} className="hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== undefined && (
        <RoleModal
          initial={editing !== 'new' ? editing : undefined}
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
      // Update display name in profiles table
      await supabase.from('profiles').update({ full_name: fullName }).eq('id', initial.id)
      if (password.trim()) {
        const res = await adminApi.resetPassword(initial.id, password)
        if (res.error) { setError(res.error); setSaving(false); return }
      }
      onSaved({ ...initial, full_name: fullName })
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
  currentUserId,
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
      : await adminApi.assignRole(targetUser.id, role.id, currentUserId)

    if (!res.error) {
      const newIds   = hasRole ? targetUser.role_ids.filter((id) => id !== role.id) : [...targetUser.role_ids, role.id]
      const newSlugs = hasRole ? targetUser.role_slugs.filter((s) => s !== role.slug) : [...targetUser.role_slugs, role.slug]
      const newNames = hasRole ? targetUser.role_names.filter((_, i) => targetUser.role_ids[i] !== role.id) : [...targetUser.role_names, role.name]
      onUpdated({ ...targetUser, role_ids: newIds, role_slugs: newSlugs, role_names: newNames })
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
          {users.map((u) => {
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
          {fields.map(f => (
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
// Settings Page
// ============================================================

export default function SettingsPage() {
  const { can } = useAuthStore()
  const isAdmin = can('admin.manage_users')
  const canManageBlocks = can('admin.manage_blocks')
  const canTemplates = can('template.create')

  return (
    <div className="h-full flex flex-col">
      <header className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage your profile{isAdmin ? ', block types, roles, and users' : canTemplates ? ' and templates' : ''}
        </p>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="profile" className="h-full flex flex-col">
          <div className="border-b px-6 shrink-0">
            <TabsList className="h-10 bg-transparent p-0 gap-0">
              <TabsTrigger value="profile" className={TAB_CLS}>
                <User className="w-3.5 h-3.5" /> Profile
              </TabsTrigger>
              <TabsTrigger value="blocks" className={TAB_CLS}>
                <Blocks className="w-3.5 h-3.5" /> My Blocks
              </TabsTrigger>
              {canTemplates && (
                <TabsTrigger value="templates" className={TAB_CLS}>
                  <LayoutTemplate className="w-3.5 h-3.5" /> Templates
                </TabsTrigger>
              )}
              {canManageBlocks && (
                <TabsTrigger value="standard" className={TAB_CLS}>
                  <Globe className="w-3.5 h-3.5" /> Standard Blocks
                </TabsTrigger>
              )}
              {isAdmin && (
                <>
                  <TabsTrigger value="patient-fields" className={TAB_CLS}>
                    <User className="w-3.5 h-3.5" /> Patient Fields
                  </TabsTrigger>
                  <TabsTrigger value="roles" className={TAB_CLS}>
                    <ShieldCheck className="w-3.5 h-3.5" /> Roles
                  </TabsTrigger>
                  <TabsTrigger value="users" className={TAB_CLS}>
                    <Users className="w-3.5 h-3.5" /> Users
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          <TabsContent value="profile" className="flex-1 overflow-auto p-6 mt-0">
            <ProfileSection />
          </TabsContent>

          <TabsContent value="blocks" className="flex-1 overflow-auto p-6 mt-0">
            <CustomBlocksSection />
          </TabsContent>

          {canTemplates && (
            <TabsContent value="templates" className="flex-1 overflow-auto p-6 mt-0">
              <TemplatesSection />
            </TabsContent>
          )}

          {canManageBlocks && (
            <TabsContent value="standard" className="flex-1 overflow-auto p-6 mt-0">
              <StandardBlocksSection />
            </TabsContent>
          )}

          {isAdmin && (
            <>
              <TabsContent value="patient-fields" className="flex-1 overflow-auto p-6 mt-0">
                <PatientFieldsSection />
              </TabsContent>
              <TabsContent value="roles" className="flex-1 overflow-auto p-6 mt-0">
                <RolesSection />
              </TabsContent>
              <TabsContent value="users" className="flex-1 overflow-auto p-6 mt-0">
                <UsersSection />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  )
}
