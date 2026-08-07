import { useState } from 'react'
import {
  Plus, ChevronDown, ChevronUp, X, GripVertical,
  FileText, ClipboardList, Stethoscope, Activity, Heart, Brain,
  TestTube, Zap, Clock, AlertTriangle, ArrowRight, Camera,
  BarChart2, Clipboard, FlaskConical, Pill, Star, Layers, CheckCheck,
} from 'lucide-react'
import type { BlockDefinition, FieldDef, FieldType } from '../../types'
import { Button, Input } from '../../components/ui'

// ============================================================
// Icon + color options
// ============================================================

export const ICON_OPTIONS = [
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

export const COLOR_OPTIONS = [
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

export const CAPABILITIES: { key: keyof BlockDefinition; label: string; desc: string }[] = [
  { key: 'cap_media',       label: 'Media',       desc: 'Allow file & photo attachments' },
  { key: 'cap_time_series', label: 'Time Series',  desc: 'Recurring timestamped entries (e.g. vitals, DKA)' },
  { key: 'cap_immutable',   label: 'Immutable',    desc: 'Block cannot be edited after creation' },
  { key: 'cap_co_sign',     label: 'Co-Sign',      desc: 'Requires a second provider co-signature' },
  { key: 'cap_required',    label: 'Required',     desc: 'Must be completed before the encounter can close' },
]

// ============================================================
// Field Builder
// ============================================================

export function FieldBuilder({
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
