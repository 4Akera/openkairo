import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Patient, PatientFieldDefinition, DatePrecision } from '../../types'
import { PATIENT_REAL_COLUMNS } from '../../types'
import { calcAge, formatDateWithPrecision, fullName, getPatientDob } from '../../lib/utils'
import {
  Badge,
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '../ui'
import { ClinicalDatePicker } from '../ui/ClinicalDatePicker'
import { Edit2, Loader2, Camera } from 'lucide-react'

interface Props {
  patient: Patient
  onUpdate: (p: Patient) => void
}

function getFieldValue(patient: Patient, slug: string): string {
  if (PATIENT_REAL_COLUMNS.has(slug)) {
    const col = (patient as unknown as Record<string, unknown>)[slug]
    if (col != null && String(col).trim() !== '') return String(col)
    const cf = patient.custom_fields?.[slug]
    return cf != null ? String(cf) : ''
  }
  return String(patient.custom_fields?.[slug] ?? '')
}

function getDisplayValue(patient: Patient, def: PatientFieldDefinition): string {
  const raw = getFieldValue(patient, def.slug)
  if (!raw) return ''
  if (def.field_type === 'select') {
    return def.options.find(o => o.value === raw)?.label ?? raw
  }
  return raw
}

export default function Demographics({ patient, onUpdate }: Props) {
  const [fieldDefs, setFieldDefs] = useState<PatientFieldDefinition[]>([])
  const [loadingFields, setLoadingFields] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const loadDefs = useCallback(async () => {
    const { data } = await supabase
      .from('patient_field_definitions')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (data) setFieldDefs(data as PatientFieldDefinition[])
    setLoadingFields(false)
  }, [])

  useEffect(() => { loadDefs() }, [loadDefs])

  const openEdit = () => {
    const initial: Record<string, string> = {}
    for (const def of fieldDefs) {
      initial[def.slug] = getFieldValue(patient, def.slug)
      // seed precision — prefer real column, fall back to custom_fields (legacy), then 'full'
      if (def.field_type === 'date') {
        const precKey = `${def.slug}_precision`
        initial[precKey] =
          ((patient as unknown as Record<string, unknown>)[precKey] as string) ??
          (patient.custom_fields?.[precKey] as string) ??
          'full'
      }
    }
    setForm(initial)
    setOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    const realCols: Record<string, unknown> = {}
    const customFields: Record<string, unknown> = { ...(patient.custom_fields ?? {}) }

    for (const [slug, value] of Object.entries(form)) {
      // Skip precision keys — handled explicitly below
      if (slug.endsWith('_precision')) continue
      const trimmed = typeof value === 'string' ? value.trim() : ''
      if (PATIENT_REAL_COLUMNS.has(slug)) {
        realCols[slug] = trimmed || null
        // persist companion precision as a real column
        const precKey = `${slug}_precision`
        if (form[precKey]) realCols[precKey] = form[precKey]
      } else {
        if (trimmed) {
          customFields[slug] = trimmed
        } else {
          delete customFields[slug]
        }
      }
    }

    const { data, error } = await supabase
      .from('patients')
      .update({ ...realCols, custom_fields: customFields })
      .eq('id', patient.id)
      .select()
      .single()

    if (!error && data) {
      onUpdate(data as Patient)
      setOpen(false)
    }
    setSaving(false)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    const ext = file.name.split('.').pop()
    const path = `${patient.id}/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage
      .from('patient-photos')
      .upload(path, file, { upsert: true })
    if (!uploadErr) {
      const { data: urlData } = supabase.storage.from('patient-photos').getPublicUrl(path)
      const { data } = await supabase
        .from('patients')
        .update({ photo_url: urlData.publicUrl })
        .eq('id', patient.id)
        .select()
        .single()
      if (data) onUpdate(data as Patient)
    }
    setUploadingPhoto(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Split fields for view: skip name + DOB (DOB shown once with Age above)
  const viewFields = fieldDefs.filter(
    d => !['first_name', 'last_name', 'date_of_birth'].includes(d.slug)
  )

  const dob = getPatientDob(patient)
  const age = calcAge(dob)

  return (
    <>
      <div className="p-3 space-y-2">
        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          {/* Photo avatar with upload overlay */}
          <div className="relative group shrink-0">
            <div
              className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm overflow-hidden cursor-pointer"
              onClick={() => fileRef.current?.click()}
              title="Change photo"
            >
              {patient.photo_url ? (
                <img
                  src={patient.photo_url}
                  alt={fullName(patient)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{patient.first_name[0]}{patient.last_name[0]}</span>
              )}
            </div>
            <div
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              {uploadingPhoto
                ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                : <Camera className="h-3.5 w-3.5 text-white" />
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{fullName(patient)}</p>
            <p className="text-xs text-muted-foreground font-mono">{patient.mrn}</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={openEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loadingFields ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {/* DOB / Age always first */}
            <div>
              <span className="text-muted-foreground">Age</span>
              <p className="font-medium">{age || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">DOB</span>
              <p className="font-medium">
                {formatDateWithPrecision(
                  dob,
                  patient.date_of_birth_precision
                    ?? (patient.custom_fields?.date_of_birth_precision as DatePrecision)
                )}
              </p>
            </div>

            {/* Dynamic fields */}
            {viewFields.map(def => {
              const val = getDisplayValue(patient, def)
              if (!val) return null
              return (
                <div
                  key={def.slug}
                  className={def.field_type === 'textarea' ? 'col-span-2' : undefined}
                >
                  <span className="text-muted-foreground">{def.label}</span>
                  {def.slug === 'blood_group' ? (
                    <div className="font-medium">
                      <Badge variant="outline" className="text-xs py-0 px-1">{val}</Badge>
                    </div>
                  ) : (
                    <p className="font-medium">{val}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Demographics</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 mt-2 pr-2">
              {/* System name fields side by side */}
              <div className="grid grid-cols-2 gap-3">
                {fieldDefs
                  .filter(d => d.slug === 'first_name' || d.slug === 'last_name')
                  .map(def => (
                    <div key={def.slug} className="space-y-1">
                      <Label>
                        {def.label}
                        {def.is_required && <span className="text-destructive ml-0.5">*</span>}
                      </Label>
                      <Input
                        value={form[def.slug] ?? ''}
                        onChange={e => setForm(f => ({ ...f, [def.slug]: e.target.value }))}
                      />
                    </div>
                  ))}
              </div>

              {/* All other active fields */}
              {fieldDefs
                .filter(d => !['first_name', 'last_name'].includes(d.slug))
                .map(def => (
                  <DynamicField
                    key={def.slug}
                    def={def}
                    value={form[def.slug] ?? ''}
                    precision={form[`${def.slug}_precision`]}
                    onChange={v => setForm(f => ({ ...f, [def.slug]: v }))}
                    onChangePrecision={p =>
                      setForm(f => ({ ...f, [`${def.slug}_precision`]: p ?? 'full' }))
                    }
                  />
                ))}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DynamicField({
  def,
  value,
  precision,
  onChange,
  onChangePrecision,
}: {
  def: PatientFieldDefinition
  value: string
  precision?: string
  onChange: (v: string) => void
  onChangePrecision?: (p: DatePrecision | null) => void
}) {
  return (
    <div className="space-y-1">
      <Label>
        {def.label}
        {def.is_required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {def.field_type === 'date' ? (
        <ClinicalDatePicker
          value={value || null}
          precision={(precision as DatePrecision) || 'full'}
          onChange={(iso, prec) => {
            onChange(iso ?? '')
            onChangePrecision?.(prec)
          }}
        />
      ) : def.field_type === 'select' ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        >
          <option value="">— Select —</option>
          {def.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : def.field_type === 'textarea' ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
        />
      ) : (
        <Input
          type={def.field_type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
