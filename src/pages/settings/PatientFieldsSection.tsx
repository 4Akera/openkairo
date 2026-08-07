import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Loader2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { PatientFieldDefinition, PatientFieldOption } from '../../types'
import {
  Button, Input,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Label,
} from '../../components/ui'
import { cn } from '../../lib/utils'
import { filterPatientFieldsBeforeBloodGroup } from '../../lib/patientFieldVisibility'

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

export function PatientFieldsSection() {
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
