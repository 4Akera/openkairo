import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Patient, PatientFieldDefinition, DatePrecision } from '../types'
import { PATIENT_REAL_COLUMNS } from '../types'
import { pushRecentPatient, getRecentEncounters } from '../lib/recentItems'
import type { RecentEncounterEntry } from '../lib/recentItems'

const PAGE_SIZE = 50

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

import {
  calcAge, formatDate, formatDateTime, formatDateWithPrecision, fullName,
  generateMRN, getPatientDob, getPatientGender, ageToApproxDob, cn,
} from '../lib/utils'
import { parseSearchQuery } from '../lib/patientSearch'
import {
  Button, Input, Label, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  ScrollArea,
} from '../components/ui'
import { ClinicalDatePicker } from '../components/ui/ClinicalDatePicker'
import { Search, UserPlus, ChevronRight, Loader2, Users, AlertTriangle, SlidersHorizontal, Check, Clock, Activity } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { nameFormat } = useSettingsStore()

  const [patients, setPatients]       = useState<Patient[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [totalCount, setTotalCount]   = useState(0)
  const [hasMore, setHasMore]         = useState(false)
  const [page, setPage]               = useState(0)

  const [search, setSearch]           = useState('')
  const [mineOnly, setMineOnly]       = useState(false)
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [openOnly, setOpenOnly]       = useState(false)

  const [recentEncounters, setRecentEncounters] = useState<RecentEncounterEntry[]>(() => getRecentEncounters())
  const [mobileTab, setMobileTab] = useState<'patients' | 'recent'>('patients')
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

  // Duplicate detection
  const [dupMatches, setDupMatches] = useState<Patient[]>([])
  const [dupTotal, setDupTotal]     = useState(0)
  const [dupLoading, setDupLoading] = useState(false)
  const dupSeq = useRef(0)

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
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const fetchPatients = useCallback(async (
    q: string,
    mine: boolean,
    assigned: boolean,
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

    const { tokens, year } = parseSearchQuery(q)

    const { data, error } = await supabase.rpc('search_patients', {
      p_tokens:         tokens && tokens.length > 0 ? tokens : null,
      p_year:           year,
      p_created_by:     mine && user ? user.id : null,
      p_assigned_to:    assigned && user ? user.id : null,
      p_open_encounter: openEnc,
      p_limit:          PAGE_SIZE,
      p_offset:         pageNum * PAGE_SIZE,
    })

    if (req !== requestSeq.current) return
    if (!error && data) {
      type Row = Patient & { total_count: number }
      const rows = data as Row[]
      const total = rows[0]?.total_count ?? 0
      const pts = rows.map(({ total_count: _tc, ...pt }) => pt as Patient)
      setPatients(prev => append ? [...prev, ...pts] : pts)
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
      fetchPatients(search, mineOnly, assignedToMe, openOnly, 0, false)
      isFirstLoad.current = false
    }, delay)
    return () => clearTimeout(timer)
  }, [search, mineOnly, assignedToMe, openOnly, fetchPatients])

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    fetchPatients(search, mineOnly, assignedToMe, openOnly, next, true)
  }

  const navigateToPatient = (pt: Patient) => {
    pushRecentPatient({ id: pt.id, first_name: pt.first_name, middle_name: pt.middle_name, last_name: pt.last_name, mrn: pt.mrn })
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
    setDupMatches([]); setDupTotal(0)
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

  const filtersActive = mineOnly || assignedToMe || openOnly || search.trim() !== ''

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
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
          <span className="hidden sm:inline">New Patient</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* Mobile-only tab strip */}
      <div className="md:hidden flex border-b bg-card shrink-0">
        {([
          { id: 'patients', label: 'Patients', icon: <Users className="h-4 w-4" /> },
          { id: 'recent',   label: 'Recent',   icon: <Clock  className="h-4 w-4" /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => { setMobileTab(tab.id); if (tab.id === 'recent') setRecentEncounters(getRecentEncounters()) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2.5 text-sm font-medium border-b-2 transition-colors',
              mobileTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon}{tab.label}
            {tab.id === 'recent' && recentEncounters.length > 0 && (
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                {recentEncounters.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body: patients list + recent sidebar */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: patients ───────────────────────────────────────────────── */}
        <div className={cn('flex-1 flex-col overflow-hidden', mobileTab === 'patients' ? 'flex' : 'hidden md:flex')}>

      {/* Search + filter bar */}
      <div className="px-4 sm:px-6 py-3 border-b bg-card shrink-0">
        {/* Single search + filter row */}
        <div className="flex items-center gap-2">
          {/* Search input — full width on mobile, capped on desktop */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={searchRef}
              placeholder="Search by name, MRN, or phone…"
              className="pl-8 pr-8 h-10"
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

          {/* Filter dropdown */}
          {(() => {
            const activeCount = [mineOnly, assignedToMe, openOnly].filter(Boolean).length
            return (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    className={cn(
                      'relative h-10 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5',
                      activeCount > 0
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground',
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                    {activeCount > 0 && (
                      <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                        {activeCount}
                      </span>
                    )}
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-[180px] rounded-lg border bg-card shadow-md p-1 text-sm text-card-foreground animate-in fade-in-0 zoom-in-95"
                  >
                    {([
                      { label: 'Open encounter', active: openOnly,     toggle: () => setOpenOnly(v => !v) },
                      { label: 'Assigned encounter', active: assignedToMe, toggle: () => setAssignedToMe(v => !v) },
                      { label: 'Created by me',  active: mineOnly,     toggle: () => setMineOnly(v => !v) },
                    ] as const).map(({ label, active, toggle }) => (
                      <DropdownMenu.Item
                        key={label}
                        onSelect={e => { e.preventDefault(); toggle() }}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 cursor-pointer select-none outline-none hover:bg-accent focus:bg-accent"
                      >
                        <span className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border transition-colors shrink-0',
                          active ? 'bg-primary border-primary' : 'border-border',
                        )}>
                          {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </span>
                        {label}
                      </DropdownMenu.Item>
                    ))}

                    {activeCount > 0 && (
                      <>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                          onSelect={e => { e.preventDefault(); setMineOnly(false); setAssignedToMe(false); setOpenOnly(false) }}
                          className="flex items-center rounded-md px-2.5 py-1.5 cursor-pointer select-none outline-none text-muted-foreground hover:bg-accent focus:bg-accent text-xs"
                        >
                          Clear all filters
                        </DropdownMenu.Item>
                      </>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )
          })()}
        </div>
      </div>

      {/* Patient list */}
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
            {/* Mobile card list (< sm) */}
            <div className="sm:hidden divide-y divide-border">
              {patients.map((pt) => {
                const dob = getPatientDob(pt)
                const gen = getPatientGender(pt)
                return (
                  <button
                    key={pt.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                    onClick={() => navigateToPatient(pt)}
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                      {pt.first_name[0]}{nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{fullName(pt, nameFormat)}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {pt.mrn}
                        {(calcAge(dob) || gen) && (
                          <span className="font-sans ml-1.5">
                            · {calcAge(dob) || '—'}{gen ? ` · ${gen}` : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                )
              })}
            </div>

            {/* Desktop table (sm+) */}
            <table className="hidden sm:table w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left px-6 py-2.5 font-medium">Patient</th>
                  <th className="text-left px-4 py-2.5 font-medium">MRN</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Age / Gender</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">DOB</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Registered</th>
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
                            {pt.first_name[0]}{nameFormat === 'three' && pt.middle_name ? pt.middle_name[0] : pt.last_name[0]}
                          </div>
                          <span className="font-medium">{fullName(pt, nameFormat)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{pt.mrn}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {calcAge(dob) || '—'}{gen ? ` · ${gen}` : ''}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{formatDate(dob)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                        {pt.updated_at !== pt.created_at ? (
                          <span title={`Created: ${formatDateTime(pt.created_at)}`}>
                            {formatDateTime(pt.updated_at)}
                            <span className="ml-1 text-[10px] opacity-60">upd</span>
                          </span>
                        ) : (
                          formatDateTime(pt.created_at)
                        )}
                      </td>
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

        </div>{/* end left column */}

        {/* ── Mobile: Recent Encounters full panel ──────────────────────────── */}
        {mobileTab === 'recent' && (
          <div className="flex flex-col flex-1 overflow-hidden md:hidden">
            <ScrollArea className="flex-1">
              {recentEncounters.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 px-4 text-center">
                  <Clock className="h-8 w-8 opacity-25" />
                  <p className="text-sm">No recently visited encounters</p>
                  <p className="text-xs opacity-60">Encounters you open will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {recentEncounters.map(enc => (
                    <button
                      key={enc.encounterId}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                      onClick={() => navigate(`/patients/${enc.patientId}/encounters/${enc.encounterId}`)}
                    >
                      <div className={cn(
                        'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                        enc.status === 'open' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground',
                      )}>
                        <Activity className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{enc.patientName}</p>
                        <p className="text-xs text-muted-foreground truncate">{enc.title || 'Encounter'} · <span className="font-mono">{enc.mrn}</span></p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full', enc.status === 'open' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                          {enc.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(enc.visitedAt)}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                  <div className="py-3 text-center">
                    <button
                      onClick={() => { localStorage.removeItem('ok_recent_encounters'); setRecentEncounters([]) }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear history
                    </button>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ── Desktop: Recent Encounters sidebar ───────────────────────────── */}
        <div className="hidden md:flex flex-col w-64 border-l bg-card shrink-0 overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Encounters
            </div>
            {recentEncounters.length > 0 && (
              <button
                onClick={() => { localStorage.removeItem('ok_recent_encounters'); setRecentEncounters([]) }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <ScrollArea className="flex-1">
            {recentEncounters.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2 px-4 text-center">
                <Clock className="h-7 w-7 opacity-25" />
                <p className="text-xs">Encounters you open will appear here</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentEncounters.map(enc => (
                  <button
                    key={enc.encounterId}
                    className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                    onClick={() => navigate(`/patients/${enc.patientId}/encounters/${enc.encounterId}`)}
                  >
                    <div className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                      enc.status === 'open'
                        ? 'bg-emerald-500/10 text-emerald-700'
                        : 'bg-muted text-muted-foreground',
                    )}>
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-snug">{enc.patientName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{enc.title || 'Encounter'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={cn(
                          'text-[10px] font-medium px-1 py-px rounded',
                          enc.status === 'open'
                            ? 'bg-emerald-500/10 text-emerald-700'
                            : 'bg-muted text-muted-foreground',
                        )}>
                          {enc.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(enc.visitedAt)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

      </div>{/* end body flex row */}
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
                {/* name fields: 2 or 3 depending on format */}
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

                {/* All other fields */}
                {fieldDefs
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

                {/* ── Duplicate warning ──────────────────────────────── */}
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
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={onSubmit} disabled={creating}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    Create Patient
                  </Button>
                </div>              </div>
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
