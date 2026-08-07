/**
 * Front Desk — today's patient queue across every queue in the facility.
 *
 * One adaptive view for every clinic shape:
 *  - No stages configured  → a single arrival-ordered list.
 *  - Stages configured     → the same list grouped by stage.
 *  - No bookings ever made → the Upcoming section simply never renders.
 *  - Patient-facing departments exist → a queue switcher appears.
 *
 * Queue rendering itself lives in VisitQueue (shared with department pages).
 */
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useVisitQueue } from '../hooks/useVisits'
import { checkInVisit, bookVisit } from '../lib/visits'
import { parseSearchQuery } from '../lib/patientSearch'
import { CreatePatientDialog } from '../components/patients/CreatePatientDialog'
import { VisitQueue } from '../components/visits/VisitQueue'
import type { Department, Patient } from '../types'
import { fullName } from '../lib/utils'
import {
  Button, Input, Badge, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui'
import { ClipboardList, UserPlus, Search, Loader2, CalendarPlus } from 'lucide-react'

const GENERAL_QUEUE = 'general'

export default function FrontDeskPage() {
  const { user, hasRole } = useAuthStore()
  const { nameFormat, flowStages } = useSettingsStore()
  const { visits, profileNames, loading } = useVisitQueue()

  const [patientDepts, setPatientDepts] = useState<Department[]>([])
  const [deptFilter, setDeptFilter] = useState<string>('all')

  // Check-in dialog state — name-first: search, tap, done. Physician and
  // reason are assigned inline on the queue row afterwards (VisitQueue).
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [mode, setMode] = useState<'now' | 'book'>('now')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [deptId, setDeptId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [newPatientOpen, setNewPatientOpen] = useState(false)

  useEffect(() => {
    supabase
      .from('departments')
      .select('*')
      .eq('active', true)
      .eq('can_receive_patients', true)
      .order('sort_order')
      .then(({ data }) => setPatientDepts((data ?? []) as Department[]))
  }, [])

  // Patient search inside the check-in dialog (debounced)
  useEffect(() => {
    if (!checkInOpen || selectedPatient) return
    const q = search.trim()
    if (q === '') { setSearchResults([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      const { tokens, year } = parseSearchQuery(q)
      const { data } = await supabase.rpc('search_patients', {
        p_tokens: tokens && tokens.length > 0 ? tokens : null,
        p_year: year,
        p_created_by: null,
        p_assigned_to: null,
        p_open_encounter: false,
        p_limit: 8,
        p_offset: 0,
      })
      type Row = Patient & { total_count: number }
      setSearchResults(((data ?? []) as Row[]).map(({ total_count: _tc, ...pt }) => pt as Patient))
      setSearching(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [search, checkInOpen, selectedPatient])

  const firstStage = flowStages[0] ?? null

  const openCheckIn = (bookMode: 'now' | 'book' = 'now') => {
    setMode(bookMode)
    setSearch('')
    setSearchResults([])
    setSelectedPatient(null)
    setDeptId(deptFilter !== 'all' && deptFilter !== GENERAL_QUEUE ? deptFilter : '')
    setScheduledAt('')
    setCheckInOpen(true)
  }

  /** 'now' mode: tapping a patient checks them in immediately — no more fields. */
  const handlePickPatient = async (pt: Patient) => {
    if (mode === 'book') { setSelectedPatient(pt); return }
    if (saving) return
    setSaving(true)
    await checkInVisit({ patientId: pt.id, departmentId: deptId || null, stage: firstStage })
    setSaving(false)
    setCheckInOpen(false)
  }

  const handleBook = async () => {
    if (!selectedPatient || !scheduledAt) return
    setSaving(true)
    await bookVisit({
      patientId: selectedPatient.id,
      departmentId: deptId || null,
      scheduledAt: new Date(scheduledAt).toISOString(),
    })
    setSaving(false)
    setCheckInOpen(false)
  }

  const filtered = useMemo(() => {
    if (deptFilter === 'all') return visits
    if (deptFilter === GENERAL_QUEUE) return visits.filter(v => !v.department_id)
    return visits.filter(v => v.department_id === deptFilter)
  }, [visits, deptFilter])

  const activeCount = filtered.filter(v => v.arrived_at && !v.finished_at).length

  const canUse = hasRole('receptionist') || hasRole('admin') || hasRole('physician') || hasRole('nurse')

  if (!user) return null
  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <ClipboardList className="h-8 w-8 opacity-30" />
        <p className="text-sm">Front Desk is available to clinical and reception staff</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-card px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="h-5 w-5 text-muted-foreground shrink-0" />
          <h1 className="text-base font-semibold truncate">Front Desk</h1>
          {!loading && activeCount > 0 && (
            <Badge variant="secondary" className="ml-1">{activeCount} in queue</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Queue switcher — only rendered for multi-clinic institutions */}
          {patientDepts.length > 0 && (
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All queues</SelectItem>
                <SelectItem value={GENERAL_QUEUE}>General</SelectItem>
                {patientDepts.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => openCheckIn('book')}>
            <CalendarPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Book</span>
          </Button>
          <Button size="sm" onClick={() => openCheckIn('now')}>
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Check in</span>
          </Button>
        </div>
      </div>

      <VisitQueue
        visits={filtered}
        profileNames={profileNames}
        loading={loading}
        emptyAction={
          <Button size="sm" variant="outline" onClick={() => openCheckIn('now')}>
            Check in the first patient
          </Button>
        }
      />

      {/* ── Check-in / booking dialog ── */}
      <Dialog open={checkInOpen} onOpenChange={setCheckInOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'book' ? 'Book a visit' : 'Check in a patient'}</DialogTitle>
            <DialogDescription>
              {mode === 'book'
                ? 'Pick the patient, pick a time — done.'
                : 'Tap a patient to put them in the queue. Assign a physician or add a reason on the queue row afterwards.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Patient picker */}
            {selectedPatient && mode === 'book' ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{fullName(selectedPatient, nameFormat)}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedPatient.mrn}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedPatient(null); setSearch('') }}>
                  Change
                </Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    autoFocus
                    placeholder="Search by name, MRN, or phone…"
                    className="pl-8"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                {search.trim() !== '' && (
                  <div className="mt-1 rounded-lg border divide-y divide-border overflow-hidden max-h-56 overflow-y-auto">
                    {searching ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-muted-foreground">No matches</div>
                    ) : (
                      searchResults.map(pt => (
                        <button
                          key={pt.id}
                          disabled={saving}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/50 transition-colors disabled:opacity-50"
                          onClick={() => void handlePickPatient(pt)}
                        >
                          <span className="text-sm truncate">{fullName(pt, nameFormat)}</span>
                          <span className="text-xs text-muted-foreground font-mono shrink-0 ml-2">
                            {saving && mode === 'now' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : pt.mrn}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                <button
                  className="mt-1.5 text-xs text-primary hover:underline"
                  onClick={() => setNewPatientOpen(true)}
                >
                  + New patient
                </button>
              </div>
            )}

            {patientDepts.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Queue</Label>
                <Select value={deptId || GENERAL_QUEUE} onValueChange={v => setDeptId(v === GENERAL_QUEUE ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENERAL_QUEUE}>General</SelectItem>
                    {patientDepts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === 'book' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">When</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setCheckInOpen(false)}>Cancel</Button>
                  <Button
                    disabled={!selectedPatient || saving || !scheduledAt}
                    onClick={() => void handleBook()}
                  >
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Book visit
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CreatePatientDialog
        open={newPatientOpen}
        onOpenChange={setNewPatientOpen}
        onCreated={pt => { setNewPatientOpen(false); void handlePickPatient(pt) }}
      />
    </div>
  )
}
