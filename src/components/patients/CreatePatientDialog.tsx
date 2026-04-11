import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import type { Patient, PatientFieldDefinition, DatePrecision } from '../../types'
import { PATIENT_REAL_COLUMNS } from '../../types'
import {
  formatDate, formatDateWithPrecision, fullName,
  generateMRN, getPatientDob, ageToApproxDob, cn,
} from '../../lib/utils'
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../ui'
import { ClinicalDatePicker } from '../ui/ClinicalDatePicker'
import { Loader2, AlertTriangle } from 'lucide-react'
import { filterPatientFieldsBeforeBloodGroup } from '../../lib/patientFieldVisibility'

const FALLBACK_FIELD_DEFS: PatientFieldDefinition[] = [
  { id: 'fb_first_name',  label: 'First Name',    slug: 'first_name',   field_type: 'text',    options: [], is_required: true,  is_system: true,  sort_order: 10, active: true, created_by: null, created_at: '' },
  { id: 'fb_middle_name', label: 'Middle Name',   slug: 'middle_name',  field_type: 'text',    options: [], is_required: false, is_system: true,  sort_order: 15, active: true, created_by: null, created_at: '' },
  { id: 'fb_last_name',   label: 'Last Name',     slug: 'last_name',    field_type: 'text',    options: [], is_required: true,  is_system: true,  sort_order: 20, active: true, created_by: null, created_at: '' },
  { id: 'fb_dob',         label: 'Date of Birth', slug: 'date_of_birth',field_type: 'date',    options: [], is_required: false, is_system: true,  sort_order: 30, active: true, created_by: null, created_at: '' },
  { id: 'fb_gender',      label: 'Gender',        slug: 'gender',       field_type: 'select',  options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Non-binary', label: 'Non-binary' }, { value: 'Other', label: 'Other' }], is_required: false, is_system: false, sort_order: 40, active: true, created_by: null, created_at: '' },
  { id: 'fb_blood_group', label: 'Blood Group',   slug: 'blood_group',  field_type: 'select',  options: [{ value: 'A+', label: 'A+' }, { value: 'A-', label: 'A−' }, { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B−' }, { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB−' }, { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O−' }], is_required: false, is_system: false, sort_order: 50, active: true, created_by: null, created_at: '' },
  { id: 'fb_phone',       label: 'Phone',         slug: 'phone',        field_type: 'text',    options: [], is_required: false, is_system: false, sort_order: 60, active: true, created_by: null, created_at: '' },
  { id: 'fb_email',       label: 'Email',         slug: 'email',        field_type: 'text',    options: [], is_required: false, is_system: false, sort_order: 70, active: true, created_by: null, created_at: '' },
  { id: 'fb_address',     label: 'Address',       slug: 'address',      field_type: 'textarea',options: [], is_required: false, is_system: false, sort_order: 80, active: true, created_by: null, created_at: '' },
  { id: 'fb_nationality', label: 'Nationality',   slug: 'nationality',  field_type: 'text',    options: [], is_required: false, is_system: false, sort_order: 90, active: true, created_by: null, created_at: '' },
]

export function CreatePatientDialog({
  open,
  onOpenChange,
  onCreated,
  title = 'New Patient',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (patient: Patient) => void
  title?: string
}) {
  const { user } = useAuthStore()
  const { nameFormat } = useSettingsStore()

  const [fieldDefs, setFieldDefs]     = useState<PatientFieldDefinition[]>([])
  const [loadingDefs, setLoadingDefs] = useState(false)
  const defsLoaded = useRef(false)
  const [form, setForm]               = useState<Record<string, string>>({})
  const [formErrors, setFormErrors]   = useState<Record<string, string>>({})
  const [creating, setCreating]       = useState(false)

  const [dupMatches, setDupMatches] = useState<Patient[]>([])
  const [dupTotal, setDupTotal]     = useState(0)
  const [dupLoading, setDupLoading] = useState(false)
  const dupSeq = useRef(0)

  const loadDefs = useCallback(async () => {
    if (defsLoaded.current) return
    setLoadingDefs(true)
    const { data } = await supabase
      .from('patient_field_definitions')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    const defs = (data && data.length > 0) ? (data as PatientFieldDefinition[]) : FALLBACK_FIELD_DEFS
    setFieldDefs(defs)
    const initial: Record<string, string> = {}
    for (const d of defs) {
      initial[d.slug] = ''
      if (d.field_type === 'date') initial[`${d.slug}_precision`] = 'full'
    }
    setForm(initial)
    defsLoaded.current = true
    setLoadingDefs(false)
  }, [])

  const formFieldDefs = useMemo(() => filterPatientFieldsBeforeBloodGroup(fieldDefs), [fieldDefs])

  useEffect(() => {
    if (!open) return
    setFormErrors({})
    setDupMatches([]); setDupTotal(0)
    setForm(prev =>
      Object.fromEntries(
        Object.keys(prev).map(k => [k, k.endsWith('_precision') ? 'full' : '']),
      ),
    )
    loadDefs()
  }, [open, loadDefs])

  useEffect(() => {
    if (!open) return
    const first = (form['first_name'] ?? '').trim()
    const last  = (form['last_name']  ?? '').trim()
    if (first.length < 2 || last.length < 2) {
      setDupMatches([]); setDupTotal(0); return
    }
    const dob  = (form['date_of_birth'] ?? '').trim()
    const year = dob ? new Date(dob).getFullYear() : null
    const t = setTimeout(async () => {
      const req = ++dupSeq.current
      setDupLoading(true)
      const { data } = await supabase.rpc('search_patients', {
        p_tokens: [first, last],
        p_year:   year,
        p_limit:  5,
        p_offset: 0,
      })
      if (req !== dupSeq.current) return
      type Row = Patient & { total_count: number }
      const rows = (data ?? []) as Row[]
      setDupMatches(rows.map(({ total_count: _tc, ...pt }) => pt as Patient))
      setDupTotal(rows[0]?.total_count ?? 0)
      setDupLoading(false)
    }, 500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form['first_name'], form['last_name'], form['date_of_birth'], open])

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    const check = (def: PatientFieldDefinition) => {
      if (def.is_required && !form[def.slug]?.trim()) errs[def.slug] = 'Required'
    }
    for (const def of fieldDefs) {
      if (def.slug === 'middle_name' && nameFormat !== 'three') continue
      if (def.slug === 'first_name' || def.slug === 'last_name' || def.slug === 'middle_name') {
        check(def)
        continue
      }
      if (!formFieldDefs.some(f => f.slug === def.slug)) continue
      check(def)
    }
    setFormErrors(errs)
    return Object.keys(errs).length === 0
  }

  const onSubmit = async () => {
    if (!user || !validate()) return
    setCreating(true)
    const realCols: Record<string, unknown> = {}
    const customFields: Record<string, unknown> = {}
    for (const [slug, value] of Object.entries(form)) {
      if (slug.endsWith('_precision')) continue
      const trimmed = value.trim()
      if (!trimmed) continue
      if (PATIENT_REAL_COLUMNS.has(slug)) {
        realCols[slug] = trimmed
        const precKey = `${slug}_precision`
        if (form[precKey]) realCols[precKey] = form[precKey]
      } else {
        customFields[slug] = trimmed
      }
    }
    const { data, error } = await supabase
      .from('patients')
      .insert({ ...realCols, custom_fields: customFields, mrn: generateMRN(), created_by: user.id })
      .select()
      .single()
    if (!error && data) {
      onOpenChange(false)
      onCreated(data as Patient)
    }
    setCreating(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loadingDefs ? (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading fields…
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 mt-2 pr-1">
              <div className={cn('grid gap-3', nameFormat === 'three' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
                {fieldDefs
                  .filter(d => d.slug === 'first_name' || (nameFormat === 'three' && d.slug === 'middle_name') || d.slug === 'last_name')
                  .map(def => (
                    <div key={def.slug} className="space-y-1.5">
                      <Label>
                        {def.label}
                        {def.is_required && <span className="text-destructive ml-0.5">*</span>}
                      </Label>
                      <Input
                        value={form[def.slug] ?? ''}
                        onChange={e => {
                          setForm(f => ({ ...f, [def.slug]: e.target.value }))
                          if (formErrors[def.slug]) setFormErrors(e2 => ({ ...e2, [def.slug]: '' }))
                        }}
                        placeholder={def.slug === 'first_name' ? 'Jane' : def.slug === 'middle_name' ? 'Marie' : 'Smith'}
                      />
                      {formErrors[def.slug] && (
                        <p className="text-xs text-destructive">{formErrors[def.slug]}</p>
                      )}
                    </div>
                  ))}
              </div>

              {formFieldDefs
                .filter(d => d.slug !== 'first_name' && d.slug !== 'middle_name' && d.slug !== 'last_name')
                .map(def => (
                  <div key={def.slug} className="space-y-1.5">
                    <Label>
                      {def.label}
                      {def.is_required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <DynamicInput
                      def={def}
                      value={form[def.slug] ?? ''}
                      precision={
                        def.field_type === 'date'
                          ? (form[`${def.slug}_precision`] as DatePrecision ?? 'full')
                          : undefined
                      }
                      onChange={v => {
                        setForm(f => ({ ...f, [def.slug]: v }))
                        if (formErrors[def.slug]) setFormErrors(e => ({ ...e, [def.slug]: '' }))
                      }}
                      onChangePrecision={p =>
                        setForm(f => ({ ...f, [`${def.slug}_precision`]: p }))
                      }
                    />
                    {formErrors[def.slug] && (
                      <p className="text-xs text-destructive">{formErrors[def.slug]}</p>
                    )}
                  </div>
                ))}

              {(dupLoading || dupMatches.length > 0) && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    {dupLoading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    <p className="text-sm font-medium">
                      {dupLoading
                        ? 'Checking for existing patients…'
                        : `${dupTotal} similar patient${dupTotal !== 1 ? 's' : ''} already exist${dupTotal === 1 ? 's' : ''}`}
                    </p>
                  </div>

                  {!dupLoading && dupMatches.length > 0 && (
                    <ul className="space-y-0.5">
                      {dupMatches.map(pt => {
                        const dob = getPatientDob(pt)
                        return (
                          <li key={pt.id}>
                            <button
                              type="button"
                              onClick={() => window.open(`/patients/${pt.id}`, '_blank')}
                              className="w-full text-left flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-amber-500/10 transition-colors group"
                            >
                              <div className="h-6 w-6 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-700 dark:text-amber-400 font-semibold text-[10px] shrink-0">
                                {pt.first_name[0]}{nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}
                              </div>
                              <span className="text-sm font-medium text-foreground flex-1 truncate">
                                {fullName(pt, nameFormat)}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0 font-mono">
                                {pt.mrn}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {formatDate(dob) || '—'}
                              </span>
                              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0">
                                ↗
                              </span>
                            </button>
                          </li>
                        )
                      })}
                      {dupTotal > 5 && (
                        <li className="text-xs text-muted-foreground px-2 pt-1">
                          + {dupTotal - 5} more with similar name
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={onSubmit} disabled={creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Patient
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DobInput({
  value, precision, onChange, onChangePrecision,
}: {
  value: string
  precision: DatePrecision
  onChange: (v: string) => void
  onChangePrecision: (p: DatePrecision) => void
}) {
  const [mode, setMode]       = useState<'date' | 'age'>('date')
  const [ageVal, setAgeVal]   = useState('')
  const [ageUnit, setAgeUnit] = useState<'years' | 'months' | 'days'>('years')

  const applyAge = (val: string, unit: 'years' | 'months' | 'days') => {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0) return
    const { iso, precision: prec } = ageToApproxDob(n, unit)
    onChange(iso)
    onChangePrecision(prec)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {(['date', 'age'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'text-xs px-2.5 py-1 rounded-md border transition-colors',
              mode === m
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:bg-accent border-input',
            )}
          >
            {m === 'date' ? 'Date of birth' : 'Enter age'}
          </button>
        ))}
      </div>

      {mode === 'date' ? (
        <ClinicalDatePicker
          value={value || null}
          precision={precision}
          onChange={(iso, prec) => {
            onChange(iso ?? '')
            onChangePrecision(prec ?? 'full')
          }}
        />
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={ageVal}
            className="w-20"
            onChange={e => { setAgeVal(e.target.value); applyAge(e.target.value, ageUnit) }}
          />
          <select
            value={ageUnit}
            onChange={e => {
              const u = e.target.value as typeof ageUnit
              setAgeUnit(u)
              applyAge(ageVal, u)
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="years">Years old</option>
            <option value="months">Months old</option>
            <option value="days">Days old</option>
          </select>
          {value && (
            <span className="text-xs text-muted-foreground">
              ≈ {formatDateWithPrecision(value, precision)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function DynamicInput({
  def, value, precision, onChange, onChangePrecision,
}: {
  def: PatientFieldDefinition
  value: string
  precision?: DatePrecision
  onChange: (v: string) => void
  onChangePrecision?: (p: DatePrecision) => void
}) {
  if (def.field_type === 'date') {
    if (def.slug === 'date_of_birth') {
      return (
        <DobInput
          value={value}
          precision={precision ?? 'full'}
          onChange={onChange}
          onChangePrecision={onChangePrecision ?? (() => {})}
        />
      )
    }
    return (
      <ClinicalDatePicker
        value={value || null}
        precision={precision ?? 'full'}
        onChange={(iso, prec) => {
          onChange(iso ?? '')
          onChangePrecision?.(prec ?? 'full')
        }}
      />
    )
  }
  if (def.field_type === 'select') {
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="">— Select —</option>
        {def.options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }
  if (def.field_type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    )
  }
  return (
    <Input
      type={def.field_type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}
