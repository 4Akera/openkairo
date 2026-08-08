/**
 * CheckInDialog — the "+ Patient" one-motion arrival, shared by the Front
 * Desk's add and book flows. Search, tap, done: in 'now' mode a tap puts the
 * patient in the queue immediately; 'book' mode adds only a "when" field.
 * No match → an inline mini-form (name + phone) creates AND queues in one
 * motion. Physician and reason are assigned on the queue row afterwards.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { checkInVisit, bookVisit } from '../../lib/visits'
import { parseSearchQuery } from '../../lib/patientSearch'
import type { Department, Patient } from '../../types'
import { fullName, generateMRN } from '../../lib/utils'
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui'
import { Search, Loader2, UserPlus } from 'lucide-react'

const GENERAL_QUEUE = 'general'

export function CheckInDialog({
  open,
  onOpenChange,
  mode,
  patientDepts = [],
  fixedDepartmentId,
  initialDeptId = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'now' | 'book'
  /** Patient-facing departments for the queue selector; ignored when fixedDepartmentId is set */
  patientDepts?: Department[]
  /** Lock the target queue (clinic Patients tab) — hides the queue selector */
  fixedDepartmentId?: string
  /** Pre-selected queue when the selector is shown ('' = general) */
  initialDeptId?: string
}) {
  const { user } = useAuthStore()
  const { nameFormat, flowStages } = useSettingsStore()

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [deptId, setDeptId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  // Inline new-patient mini-form (shown when the search finds nobody)
  const [newOpen, setNewOpen] = useState(false)
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const firstStage = flowStages[0] ?? null
  const targetDeptId = fixedDepartmentId ?? (deptId || null)

  // Reset on open
  useEffect(() => {
    if (!open) return
    setSearch('')
    setSearchResults([])
    setSelectedPatient(null)
    setDeptId(initialDeptId)
    setScheduledAt('')
    setNewOpen(false)
    setNewFirst(''); setNewLast(''); setNewPhone('')
  }, [open, initialDeptId])

  // Debounced patient search
  useEffect(() => {
    if (!open || selectedPatient) return
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
  }, [search, open, selectedPatient])

  /** 'now' mode: tapping a patient checks them in immediately. */
  const handlePickPatient = async (pt: Patient) => {
    if (mode === 'book') { setSelectedPatient(pt); return }
    if (saving) return
    setSaving(true)
    await checkInVisit({ patientId: pt.id, departmentId: targetDeptId, stage: firstStage })
    setSaving(false)
    onOpenChange(false)
  }

  /** Prefill the mini-form from what was typed: first token → first name. */
  const openNewForm = () => {
    const tokens = search.trim().split(/\s+/).filter(Boolean)
    setNewFirst(tokens[0] ?? '')
    setNewLast(tokens.slice(1).join(' '))
    setNewOpen(true)
  }

  /** One motion: create the patient, then straight into the queue (or booking). */
  const handleCreateAndQueue = async () => {
    if (!newFirst.trim() || !newLast.trim() || saving || !user) return
    setSaving(true)
    const { data, error } = await supabase
      .from('patients')
      .insert({
        first_name: newFirst.trim(),
        last_name: newLast.trim(),
        phone: newPhone.trim() || null,
        mrn: generateMRN(),
        created_by: user.id,
      })
      .select()
      .single()
    if (error || !data) { setSaving(false); return }
    const pt = data as Patient
    if (mode === 'book') {
      setSelectedPatient(pt)
      setNewOpen(false)
      setSaving(false)
      return
    }
    await checkInVisit({ patientId: pt.id, departmentId: targetDeptId, stage: firstStage })
    setSaving(false)
    onOpenChange(false)
  }

  const handleBook = async () => {
    if (!selectedPatient || !scheduledAt) return
    setSaving(true)
    await bookVisit({
      patientId: selectedPatient.id,
      departmentId: targetDeptId,
      scheduledAt: new Date(scheduledAt).toISOString(),
    })
    setSaving(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'book' ? 'Book a visit' : 'Add a patient'}</DialogTitle>
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
                {newOpen ? (
                  <div className="mt-2 rounded-lg border p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <UserPlus className="h-3.5 w-3.5 text-primary" /> New patient
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        autoFocus
                        placeholder="First name *"
                        value={newFirst}
                        onChange={e => setNewFirst(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Last name *"
                        value={newLast}
                        onChange={e => setNewLast(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Input
                      placeholder="Phone (optional)"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleCreateAndQueue() }}
                      className="h-8 text-sm"
                    />
                    <div className="flex justify-end gap-2 pt-0.5">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNewOpen(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={saving || !newFirst.trim() || !newLast.trim()}
                        onClick={() => void handleCreateAndQueue()}
                      >
                        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                        {mode === 'book' ? 'Create patient' : 'Add to queue'}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Everything else (DOB, details) can be filled on the patient page later.
                    </p>
                  </div>
                ) : (
                  <button className="mt-1.5 text-xs text-primary hover:underline" onClick={openNewForm}>
                    {search.trim() ? <>+ New patient: “{search.trim()}”</> : '+ New patient'}
                  </button>
                )}
              </div>
            )}

            {!fixedDepartmentId && patientDepts.length > 0 && (
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
                  <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
    </>
  )
}
