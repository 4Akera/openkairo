import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import type { Patient, PatientFieldDefinition, DatePrecision } from '../types'
import { PATIENT_REAL_COLUMNS } from '../types'

const PAGE_SIZE = 50

const RECENT_KEY = 'ok_recent_pts'
type RecentEntry = Pick<Patient, 'id' | 'first_name' | 'last_name' | 'mrn'>

function getRecentPatients(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') }
  catch { return [] }
}

export function pushRecentPatient(pt: RecentEntry) {
  const prev = getRecentPatients().filter(p => p.id !== pt.id)
  localStorage.setItem(RECENT_KEY, JSON.stringify([pt, ...prev].slice(0, 6)))
}

const FALLBACK_FIELD_DEFS: PatientFieldDefinition[] = [
  { id: 'fb_first_name',  label: 'First Name',    slug: 'first_name',   field_type: 'text',    options: [], is_required: true,  is_system: true,  sort_order: 10, active: true, created_by: null, created_at: '' },
  { id: 'fb_last_name',   label: 'Last Name',     slug: 'last_name',    field_type: 'text',    options: [], is_required: true,  is_system: true,  sort_order: 20, active: true, created_by: null, created_at: '' },
  { id: 'fb_dob',         label: 'Date of Birth', slug: 'date_of_birth',field_type: 'date',    options: [], is_required: false, is_system: true,  sort_order: 30, active: true, created_by: null, created_at: '' },
  { id: 'fb_gender',      label: 'Gender',        slug: 'gender',       field_type: 'select',  options: [{ value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Non-binary', label: 'Non-binary' }, { value: 'Other', label: 'Other' }], is_required: false, is_system: false, sort_order: 40, active: true, created_by: null, created_at: '' },
  { id: 'fb_blood_group', label: 'Blood Group',   slug: 'blood_group',  field_type: 'select',  options: [{ value: 'A+', label: 'A+' }, { value: 'A-', label: 'A−' }, { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B−' }, { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB−' }, { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O−' }], is_required: false, is_system: false, sort_order: 50, active: true, created_by: null, created_at: '' },
  { id: 'fb_phone',       label: 'Phone',         slug: 'phone',        field_type: 'text',    options: [], is_required: false, is_system: false, sort_order: 60, active: true, created_by: null, created_at: '' },
  { id: 'fb_email',       label: 'Email',         slug: 'email',        field_type: 'text',    options: [], is_required: false, is_system: false, sort_order: 70, active: true, created_by: null, created_at: '' },
  { id: 'fb_address',     label: 'Address',       slug: 'address',      field_type: 'textarea',options: [], is_required: false, is_system: false, sort_order: 80, active: true, created_by: null, created_at: '' },
  { id: 'fb_nationality', label: 'Nationality',   slug: 'nationality',  field_type: 'text',    options: [], is_required: false, is_system: false, sort_order: 90, active: true, created_by: null, created_at: '' },
]

import {
  calcAge, formatDate, formatDateWithPrecision, fullName,
  generateMRN, getPatientDob, getPatientGender, ageToApproxDob, cn,
} from '../lib/utils'
import {
  Button, Input, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../components/ui'
import { ClinicalDatePicker } from '../components/ui/ClinicalDatePicker'
import { Search, UserPlus, ChevronRight, Loader2, Users, Clock } from 'lucide-react'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [patients, setPatients]       = useState<Patient[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount]   = useState(0)
  const [hasMore, setHasMore]         = useState(false)
  const [page, setPage]               = useState(0)

  const [search, setSearch]     = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)

  const [recentPatients, setRecentPatients] = useState<RecentEntry[]>([])

  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)

  const isFirstLoad = useRef(true)
  const requestSeq  = useRef(0)
  const searchRef   = useRef<HTMLInputElement>(null)

  // Field defs for New Patient dialog
  const [fieldDefs, setFieldDefs]     = useState<PatientFieldDefinition[]>([])
  const [loadingDefs, setLoadingDefs] = useState(false)
  const defsLoaded = useRef(false)
  const [form, setForm]               = useState<Record<string, string>>({})
  const [formErrors, setFormErrors]   = useState<Record<string, string>>({})

  // Load recent patients from localStorage
  useEffect(() => {
    setRecentPatients(getRecentPatients())
  }, [])

  // Auto-focus search on mount
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const fetchPatients = useCallback(async (
    q: string,
    mine: boolean,
    openEnc: boolean,
    pageNum: number,
    append: boolean,
  ) => {
    const req = ++requestSeq.current
    if (!append) {
      if (!hasMore || pageNum === 0) setLoading(true)
    } else {
      setLoadingMore(true)
    }

    // For open-encounter filter, first resolve which patient IDs have open encounters
    let openIds: string[] | null = null
    if (openEnc) {
      const { data: encData } = await supabase
        .from('encounters')
        .select('patient_id')
        .eq('status', 'open')
      const ids = [...new Set((encData ?? []).map(e => e.patient_id).filter(Boolean))]
      if (ids.length === 0) {
        if (req !== requestSeq.current) return
        setPatients([])
        setTotalCount(0)
        setHasMore(false)
        setLoading(false)
        setLoadingMore(false)
        return
      }
      openIds = ids
    }

    let query = supabase
      .from('patients')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (q.trim()) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,mrn.ilike.%${q}%,phone.ilike.%${q}%`,
      )
    }
    if (mine && user) {
      query = query.eq('created_by', user.id)
    }
    if (openIds) {
      query = query.in('id', openIds)
    }

    const { data, error, count } = await query
    if (req !== requestSeq.current) return
    if (!error && data) {
      setPatients(prev => append ? [...prev, ...data] : data)
      const total = count ?? 0
      setTotalCount(total)
      setHasMore((pageNum + 1) * PAGE_SIZE < total)
    }
    setLoading(false)
    setLoadingMore(false)
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from page 0 when search/filters change
  useEffect(() => {
    setPage(0)
    const delay = isFirstLoad.current ? 0 : 300
    const timer = setTimeout(() => {
      fetchPatients(search, mineOnly, openOnly, 0, false)
      isFirstLoad.current = false
    }, delay)
    return () => clearTimeout(timer)
  }, [search, mineOnly, openOnly, fetchPatients])

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPatients(search, mineOnly, openOnly, next, true)
  }

  const navigateToPatient = (pt: Patient) => {
    pushRecentPatient({ id: pt.id, first_name: pt.first_name, last_name: pt.last_name, mrn: pt.mrn })
    setRecentPatients(getRecentPatients())
    navigate(`/patients/${pt.id}`)
  }

  // ─── Field defs for New Patient dialog ──────────────────────────────────────

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

  const openDialog = () => {
    setFormErrors({})
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
      if (def.is_required && !form[def.slug]?.trim()) errs[def.slug] = 'Required'
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
      setOpen(false)
      navigate(`/patients/${data.id}`)
    }
    setCreating(false)
  }

  // ─── Derived ────────────────────────────────────────────────────────────────

  const filtersActive = mineOnly || openOnly || search.trim() !== ''
  const showRecent    = !filtersActive && recentPatients.length > 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-base font-semibold">Patients</h1>
          {!loading && (
            <Badge variant="secondary" className="ml-1">
              {filtersActive ? `${patients.length}${hasMore ? '+' : ''} of ${totalCount}` : totalCount}
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={openDialog}>
          <UserPlus className="h-4 w-4" />
          New Patient
        </Button>
      </div>

      {/* Search + filter bar */}
      <div className="px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          {/* Search input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search by name, MRN, or phone…"
              className="pl-8 pr-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs leading-none"
              >
                ✕
              </button>
            )}
          </div>

          {/* Mine only toggle */}
          <button
            onClick={() => setMineOnly(v => !v)}
            className={cn(
              'h-9 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap',
              mineOnly
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            Mine only
          </button>

          {/* Open encounter toggle */}
          <button
            onClick={() => setOpenOnly(v => !v)}
            className={cn(
              'h-9 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap',
              openOnly
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700'
                : 'border-border text-muted-foreground hover:border-emerald-400/40 hover:text-foreground',
            )}
          >
            Open encounter
          </button>
        </div>
      </div>

      {/* Recent patients strip */}
      {showRecent && (
        <div className="px-6 py-2.5 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Clock className="h-3 w-3" />
              Recent
            </span>
            {recentPatients.map(pt => (
              <button
                key={pt.id}
                onClick={() => navigate(`/patients/${pt.id}`)}
                className="flex items-center gap-1.5 text-xs bg-background border border-border rounded-full px-2.5 py-1 hover:border-primary/40 hover:text-primary transition-colors whitespace-nowrap shrink-0"
              >
                <span className="h-4 w-4 rounded-full bg-primary/10 text-primary font-bold text-[9px] flex items-center justify-center shrink-0">
                  {pt.first_name[0]}{pt.last_name[0]}
                </span>
                {pt.first_name} {pt.last_name}
                <span className="text-muted-foreground font-mono text-[10px]">{pt.mrn}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
            <p className="text-sm">{filtersActive ? 'No patients match' : 'No patients yet'}</p>
            {!filtersActive && (
              <Button size="sm" variant="outline" onClick={openDialog}>
                Add first patient
              </Button>
            )}
          </div>
        ) : (
          <>
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
                      onClick={() => navigateToPatient(pt)}
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
                        {pt.blood_group
                          ? <Badge variant="outline">{pt.blood_group}</Badge>
                          : <span className="text-muted-foreground">—</span>}
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

            {/* Load more */}
            {hasMore && (
              <div className="flex flex-col items-center gap-1 py-6">
                <p className="text-xs text-muted-foreground">
                  Showing {patients.length} of {totalCount}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            )}
          </>
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

                {/* All other fields */}
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

// ─── DynamicInput ──────────────────────────────────────────────────────────────

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
