import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Patient } from '../types'
import { pushRecentPatientId, getRecentEncounterRefs } from '../lib/recentItems'
import { CreatePatientDialog } from '../components/patients/CreatePatientDialog'

type RecentEncounterDisplay = {
  encounterId: string
  patientId:   string
  patientName: string
  mrn:         string
  title:       string | null
  status:      'open' | 'closed'
  /** ISO time shown as “time ago” (visit time for recent, updated_at for assigned) */
  visitedAt:   string
}


const PAGE_SIZE = 50

import {
  calcAge, formatDate, formatDateTime, fullName,
  getPatientDob, getPatientGender, cn,
} from '../lib/utils'
import { parseSearchQuery } from '../lib/patientSearch'
import {
  Button, Input, Badge,
  ScrollArea,
} from '../components/ui'
import { Search, UserPlus, ChevronRight, Loader2, Users, SlidersHorizontal, Check, Clock, Activity, UserCheck } from 'lucide-react'
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

  const [assignedEncounters, setAssignedEncounters] = useState<RecentEncounterDisplay[]>([])
  const [recentEncounters, setRecentEncounters] = useState<RecentEncounterDisplay[]>([])
  const [mobileTab, setMobileTab] = useState<'patients' | 'recent'>('patients')
  const [open, setOpen]       = useState(false)

  const isFirstLoad = useRef(true)
  const requestSeq  = useRef(0)
  const searchRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  type Pt = { first_name: string; middle_name: string | null; last_name: string; mrn: string }
  type EncRow = {
    id: string
    title: string | null
    status: string
    patient_id: string
    updated_at?: string
    patients: Pt | Pt[] | null
  }

  function patientNameFromRow(enc: EncRow): string {
    const ptRaw = enc.patients
    const pt = Array.isArray(ptRaw) ? ptRaw[0] ?? null : ptRaw
    return [pt?.first_name, pt?.middle_name, pt?.last_name].filter(Boolean).join(' ') || 'Unknown'
  }

  function patientMrnFromRow(enc: EncRow): string {
    const ptRaw = enc.patients
    const pt = Array.isArray(ptRaw) ? ptRaw[0] ?? null : ptRaw
    return pt?.mrn ?? ''
  }

  // Recent (session) + encounters assigned to current user (DB, RLS)
  const loadEncounterSidebar = useCallback(async () => {
    const refs = getRecentEncounterRefs()
    const ids = refs.map(r => r.encounterId)

    const [assignedRes, recentRes] = await Promise.all([
      user?.id
        ? supabase
            .from('encounters')
            .select('id, title, status, patient_id, updated_at, patients(first_name, middle_name, last_name, mrn)')
            .eq('assigned_to', user.id)
            .eq('status', 'open')
        : Promise.resolve({ data: null as EncRow[] | null, error: null }),
      ids.length
        ? supabase
            .from('encounters')
            .select('id, title, status, patient_id, patients(first_name, middle_name, last_name, mrn)')
            .in('id', ids)
        : Promise.resolve({ data: null as EncRow[] | null, error: null }),
    ])
    const assignedData = assignedRes.data
    const recentByIdData = recentRes.data

    const normStatus = (s: string): 'open' | 'closed' =>
      s === 'open' || s === 'closed' ? s : 'open'

    if (user?.id && assignedData) {
      const rows = [...(assignedData as EncRow[])].sort((a, b) => {
        const ta = new Date(a.updated_at ?? 0).getTime()
        const tb = new Date(b.updated_at ?? 0).getTime()
        return tb - ta
      })
      setAssignedEncounters(
        rows.map(enc => ({
          encounterId: enc.id,
          patientId:   enc.patient_id,
          patientName: patientNameFromRow(enc),
          mrn:         patientMrnFromRow(enc),
          title:       enc.title ?? null,
          status:      normStatus(enc.status),
          visitedAt:   enc.updated_at ?? new Date().toISOString(),
        })),
      )
    } else {
      setAssignedEncounters([])
    }

    if (!refs.length) {
      setRecentEncounters([])
      return
    }
    if (!recentByIdData) {
      setRecentEncounters([])
      return
    }
    const map = Object.fromEntries((recentByIdData as EncRow[]).map(e => [e.id, e]))
    setRecentEncounters(
      refs.map(ref => {
        const enc = map[ref.encounterId]
        if (!enc) return null
        return {
          encounterId: ref.encounterId,
          patientId:   ref.patientId,
          patientName: patientNameFromRow(enc),
          mrn:         patientMrnFromRow(enc),
          title:       enc.title ?? null,
          status:      ref.status,
          visitedAt:   ref.visitedAt,
        }
      }).filter(Boolean) as RecentEncounterDisplay[],
    )
  }, [user?.id])

  const clearRecentHistory = useCallback(() => {
    sessionStorage.removeItem('ok_recent_encounters')
    void loadEncounterSidebar()
  }, [loadEncounterSidebar])

  useEffect(() => { loadEncounterSidebar() }, [loadEncounterSidebar])

  const assignedIds = useMemo(
    () => new Set(assignedEncounters.map(e => e.encounterId)),
    [assignedEncounters],
  )
  const recentOnlyEncounters = useMemo(
    () => recentEncounters.filter(e => !assignedIds.has(e.encounterId)),
    [recentEncounters, assignedIds],
  )
  const sidebarTotalCount = assignedEncounters.length + recentOnlyEncounters.length

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
    pushRecentPatientId(pt.id)
    navigate(`/patients/${pt.id}`)
  }

  const openDialog = () => { setOpen(true) }

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
            onClick={() => { setMobileTab(tab.id); if (tab.id === 'recent') loadEncounterSidebar() }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 min-h-[44px] py-2.5 text-sm font-medium border-b-2 transition-colors',
              mobileTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon}{tab.label}
            {tab.id === 'recent' && sidebarTotalCount > 0 && (
              <span className="flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                {sidebarTotalCount}
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

        {/* ── Mobile: Recent + assigned encounters ─────────────────────────── */}
        {mobileTab === 'recent' && (
          <div className="flex flex-col flex-1 overflow-hidden md:hidden">
            <ScrollArea className="flex-1">
              {sidebarTotalCount === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 px-4 text-center">
                  <Clock className="h-8 w-8 opacity-25" />
                  <p className="text-sm">No encounters here yet</p>
                  <p className="text-xs opacity-60">Open encounters assigned to you and ones you open show up here</p>
                </div>
              ) : (
                <div>
                  {assignedEncounters.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        <UserCheck className="h-3.5 w-3.5" />
                        Assigned to me
                      </div>
                      <div className="divide-y divide-border border-b border-border">
                        {assignedEncounters.map(enc => (
                          <button
                            key={enc.encounterId}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                            onClick={() => navigate(`/patients/${enc.patientId}/encounters/${enc.encounterId}`)}
                          >
                            <div className={cn(
                              'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                              enc.status === 'open' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground',
                            )}>
                              <UserCheck className="h-4 w-4" />
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
                      </div>
                    </div>
                  )}
                  {recentOnlyEncounters.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        <Clock className="h-3.5 w-3.5" />
                        Recently opened
                      </div>
                      <div className="divide-y divide-border">
                        {recentOnlyEncounters.map(enc => (
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
                      </div>
                    </div>
                  )}
                  {recentEncounters.length > 0 && (
                    <div className="py-3 text-center">
                      <button
                        type="button"
                        onClick={clearRecentHistory}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear recent history
                      </button>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* ── Desktop: assigned + recent encounters sidebar ───────────────── */}
        <div className="hidden md:flex flex-col w-64 border-l bg-card shrink-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Encounters
            </div>
            {recentEncounters.length > 0 && (
              <button
                type="button"
                onClick={clearRecentHistory}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <ScrollArea className="flex-1">
            {sidebarTotalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2 px-4 text-center">
                <Clock className="h-7 w-7 opacity-25" />
                <p className="text-xs">Open assigned and recently opened encounters appear here</p>
              </div>
            ) : (
              <div>
                {assignedEncounters.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 px-4 pt-2.5 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <UserCheck className="h-3 w-3" />
                      Assigned
                    </div>
                    <div className="divide-y divide-border border-b border-border">
                      {assignedEncounters.map(enc => (
                        <button
                          key={enc.encounterId}
                          type="button"
                          className="w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent/50 active:bg-accent transition-colors text-left"
                          onClick={() => navigate(`/patients/${enc.patientId}/encounters/${enc.encounterId}`)}
                        >
                          <div className={cn(
                            'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                            enc.status === 'open'
                              ? 'bg-emerald-500/10 text-emerald-700'
                              : 'bg-muted text-muted-foreground',
                          )}>
                            <UserCheck className="h-3.5 w-3.5" />
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
                  </div>
                )}
                {recentOnlyEncounters.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 px-4 pt-2.5 pb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      <Clock className="h-3 w-3" />
                      Recent
                    </div>
                    <div className="divide-y divide-border">
                      {recentOnlyEncounters.map(enc => (
                        <button
                          key={enc.encounterId}
                          type="button"
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
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

      </div>{/* end body flex row */}
      <CreatePatientDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={data => navigate(`/patients/${data.id}`)}
      />
    </div>
  )
}
