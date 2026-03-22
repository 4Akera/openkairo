import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Patient, PatientFieldDefinition, DatePrecision } from '../types'
import { PATIENT_REAL_COLUMNS } from '../types'
import {
  calcAge, formatDate, formatDateWithPrecision, fullName,
  generateMRN, getPatientDob, getPatientGender, ageToApproxDob, cn,
} from '../lib/utils'
import {
  Button,
  Input,
  Label,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
} from '../components/ui'
import { ClinicalDatePicker } from '../components/ui/ClinicalDatePicker'
import { Search, UserPlus, ChevronRight, Loader2, Users } from 'lucide-react'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const isFirstLoad = useRef(true)
  const hasLoadedOnce = useRef(false)
  const requestSeq = useRef(0)

  // Dynamic field definitions (loaded lazily on first dialog open)
  const [fieldDefs, setFieldDefs] = useState<PatientFieldDefinition[]>([])
  const [loadingDefs, setLoadingDefs] = useState(false)
  const defsLoaded = useRef(false)

  // Form state: keyed by field slug
  const [form, setForm] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const fetchPatients = useCallback(async (q = '') => {
    const req = ++requestSeq.current
    if (!hasLoadedOnce.current) setLoading(true)
    let query = supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false })

    if (q.trim()) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,mrn.ilike.%${q}%`
      )
    }

    const { data, error } = await query
    if (req !== requestSeq.current) return
    if (!error && data) setPatients(data)
    hasLoadedOnce.current = true
    setLoading(false)
  }, [])

  useEffect(() => {
    const delay = isFirstLoad.current ? 0 : 300
    const timer = setTimeout(() => {
      fetchPatients(search)
      isFirstLoad.current = false
    }, delay)
    return () => clearTimeout(timer)
  }, [search, fetchPatients])

  const loadDefs = useCallback(async () => {
    if (defsLoaded.current) return
    setLoadingDefs(true)
    const { data } = await supabase
      .from('patient_field_definitions')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (data) {
      setFieldDefs(data as PatientFieldDefinition[])
      const initial: Record<string, string> = {}
      for (const d of data as PatientFieldDefinition[]) {
        initial[d.slug] = ''
        // initialise companion precision key for date fields
        if (d.field_type === 'date') initial[`${d.slug}_precision`] = 'full'
      }
      setForm(initial)
    }
    defsLoaded.current = true
    setLoadingDefs(false)
  }, [])

  const openDialog = () => {
    setFormErrors({})
    // Reset values; keep precision keys at 'full'
    setForm(prev =>
      Object.fromEntries(
        Object.keys(prev).map(k => [k, k.endsWith('_precision') ? 'full' : ''])
      )
    )
    setOpen(true)
    loadDefs()
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    for (const def of fieldDefs) {
      if (def.is_required && !form[def.slug]?.trim()) {
        errs[def.slug] = 'Required'
      }
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
      if (slug.endsWith('_precision')) continue // handled explicitly below
      const trimmed = value.trim()
      if (!trimmed) continue
      if (PATIENT_REAL_COLUMNS.has(slug)) {
        realCols[slug] = trimmed
        // persist companion precision for date columns
        const precKey = `${slug}_precision`
        if (form[precKey]) realCols[precKey] = form[precKey]
      } else {
        customFields[slug] = trimmed
      }
    }

    const { data, error } = await supabase
      .from('patients')
      .insert({
        ...realCols,
        custom_fields: customFields,
        mrn: generateMRN(),
        created_by: user.id,
      })
      .select()
      .single()

    if (!error && data) {
      setOpen(false)
      navigate(`/patients/${data.id}`)
    }
    setCreating(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">Patients</h1>
          <Badge variant="secondary" className="ml-1">{patients.length}</Badge>
        </div>
        <Button size="sm" onClick={openDialog}>
          <UserPlus className="h-4 w-4" />
          New Patient
        </Button>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b bg-card shrink-0">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or MRN…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading patients…
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <Users className="h-8 w-8 opacity-30" />
            <p className="text-sm">{search ? 'No patients found' : 'No patients yet'}</p>
            {!search && (
              <Button size="sm" variant="outline" onClick={openDialog}>
                Add first patient
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                <th className="text-left px-6 py-2.5 font-medium">Patient</th>
                <th className="text-left px-4 py-2.5 font-medium">MRN</th>
                <th className="text-left px-4 py-2.5 font-medium">Age / Gender</th>
                <th className="text-left px-4 py-2.5 font-medium">Blood Group</th>
                <th className="text-left px-4 py-2.5 font-medium">DOB</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {patients.map((pt) => {
                const dob = getPatientDob(pt)
                const gen = getPatientGender(pt)
                return (
                  <tr
                    key={pt.id}
                    className="hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/patients/${pt.id}`)}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                          {pt.first_name[0]}{pt.last_name[0]}
                        </div>
                        <span className="font-medium">{fullName(pt)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{pt.mrn}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {calcAge(dob) || '—'}{gen ? ` · ${gen}` : ''}
                    </td>
                    <td className="px-4 py-3">
                      {pt.blood_group ? (
                        <Badge variant="outline">{pt.blood_group}</Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(dob)}</td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </ScrollArea>

      {/* Create Patient Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Patient</DialogTitle>
          </DialogHeader>

          {loadingDefs ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading fields…
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 mt-2 pr-1">
                {/* first_name + last_name always side by side */}
                <div className="grid grid-cols-2 gap-3">
                  {fieldDefs
                    .filter(d => d.slug === 'first_name' || d.slug === 'last_name')
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
                          placeholder={def.slug === 'first_name' ? 'Jane' : 'Smith'}
                        />
                        {formErrors[def.slug] && (
                          <p className="text-xs text-destructive">{formErrors[def.slug]}</p>
                        )}
                      </div>
                    ))}
                </div>

                {/* All other active fields (except first_name / last_name) */}
                {fieldDefs
                  .filter(d => d.slug !== 'first_name' && d.slug !== 'last_name')
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

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
    </div>
  )
}

// ─── DobInput ─────────────────────────────────────────────────────────────────
// Special date-of-birth input with two modes:
//   "Date" – ClinicalDatePicker (year/month/day with precision)
//   "Age"  – enter age in years/months/days → back-calculates approx DOB

function DobInput({
  value,
  precision,
  onChange,
  onChangePrecision,
}: {
  value: string
  precision: DatePrecision
  onChange: (v: string) => void
  onChangePrecision: (p: DatePrecision) => void
}) {
  const [mode, setMode]     = useState<'date' | 'age'>('date')
  const [ageVal, setAgeVal] = useState('')
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
      {/* Mode toggle */}
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
            onChange={e => {
              setAgeVal(e.target.value)
              applyAge(e.target.value, ageUnit)
            }}
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

// ─── DynamicInput ──────────────────────────────────────────────────────────────

function DynamicInput({
  def,
  value,
  precision,
  onChange,
  onChangePrecision,
}: {
  def: PatientFieldDefinition
  value: string
  precision?: DatePrecision
  onChange: (v: string) => void
  onChangePrecision?: (p: DatePrecision) => void
}) {
  if (def.field_type === 'date') {
    // date_of_birth gets the full DobInput (with age-entry mode)
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
    // Other date fields get a plain ClinicalDatePicker
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
