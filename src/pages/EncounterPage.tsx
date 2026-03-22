import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEncounterStore } from '../stores/encounterStore'
import { useAuthStore } from '../stores/authStore'
import type { Patient, Encounter } from '../types'
import { fullName, calcAge, getPatientDob, getPatientGender, cn } from '../lib/utils'
import {
  Button, Badge, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  TooltipProvider,
} from '../components/ui'
import {
  ArrowLeft, Activity, CheckCircle2, XCircle, Loader2,
  Lock, Users, Globe, Eye, ChevronDown,
} from 'lucide-react'
import Timeline from '../components/timeline/Timeline'
import PatientRecord from '../components/patient-record/PatientRecord'

const VISIBILITY_OPTIONS = [
  { value: 'staff',      label: 'All Staff',  Icon: Globe,  desc: 'Visible to everyone' },
  { value: 'restricted', label: 'Restricted', Icon: Users,  desc: 'Selected roles only' },
  { value: 'private',    label: 'Private',    Icon: Lock,   desc: 'Only me' },
] as const

const ROLE_OPTIONS = ['physician', 'nurse', 'receptionist', 'admin']

export default function EncounterPage() {
  const { patientId, encounterId } = useParams<{ patientId: string; encounterId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { setBlocks, setLockMap, setDefinitions } = useEncounterStore()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  // Visibility popover state
  const [visPopoverOpen, setVisPopoverOpen] = useState(false)
  const [editVisibility, setEditVisibility] = useState<'staff' | 'restricted' | 'private'>('staff')
  const [editVisibleToRoles, setEditVisibleToRoles] = useState<string[]>([])
  const [savingVis, setSavingVis] = useState(false)

  const fetchData = useCallback(async () => {
    if (!patientId || !encounterId) return
    const [{ data: pt }, { data: enc }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).single(),
      supabase.from('encounters').select('*').eq('id', encounterId).single(),
    ])
    if (pt) setPatient(pt)
    if (enc) {
      setEncounter(enc)
      setEditVisibility(enc.visibility ?? 'staff')
      setEditVisibleToRoles(enc.visible_to_roles ?? [])
    }
    setLoading(false)
  }, [patientId, encounterId])

  useEffect(() => {
    setBlocks([])
    setLockMap({})
    setDefinitions([])
    fetchData()
  }, [fetchData, setBlocks, setLockMap])

  useEffect(() => {
    if (!encounterId) return
    supabase
      .from('blocks')
      .select('id, locked_by')
      .eq('encounter_id', encounterId)
      .not('locked_by', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, any> = {}
        data.forEach(b => { map[b.id] = { block_id: b.id, locked_by: b.locked_by, user_email: b.locked_by } })
        setLockMap(map)
      })
  }, [encounterId, setLockMap])

  const handleCloseEncounter = async () => {
    if (!encounterId) return
    setClosing(true)
    const { data, error } = await supabase
      .from('encounters')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', encounterId)
      .select()
      .single()
    if (!error && data) { setEncounter(data); setConfirmClose(false) }
    setClosing(false)
  }

  const handleSaveVisibility = async () => {
    if (!encounterId) return
    setSavingVis(true)
    const { data, error } = await supabase
      .from('encounters')
      .update({
        visibility: editVisibility,
        visible_to_roles: editVisibility === 'restricted' ? editVisibleToRoles : [],
      })
      .eq('id', encounterId)
      .select()
      .single()
    if (!error && data) { setEncounter(data) }
    setSavingVis(false)
    setVisPopoverOpen(false)
  }

  const handleTogglePortal = async () => {
    if (!encounter || !encounterId) return
    const turningOn = !encounter.portal_visible
    const { data } = await supabase
      .from('encounters')
      .update({ portal_visible: turningOn })
      .eq('id', encounterId)
      .select()
      .single()
    if (data) setEncounter(data)
    // When turning portal on, default all active blocks to portal-visible
    if (turningOn) {
      await supabase
        .from('blocks')
        .update({ portal_visible: true })
        .eq('encounter_id', encounterId)
        .eq('state', 'active')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading encounter…
      </div>
    )
  }

  if (!patient || !encounter) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <XCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Encounter not found</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patients
        </Button>
      </div>
    )
  }

  const patientDob = getPatientDob(patient)
  const patientGender = getPatientGender(patient)
  const isCreator = encounter.created_by === user?.id
  const visOpt = VISIBILITY_OPTIONS.find(o => o.value === encounter.visibility) ?? VISIBILITY_OPTIONS[0]
  const VisIcon = visOpt.Icon

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Encounter Header */}
        <header className="border-b bg-card px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/patients/${patientId}`)}
              className="h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-5 shrink-0" />

            {/* Patient identity */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {patient.first_name[0]}{patient.last_name[0]}
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">{fullName(patient)}</p>
                <p className="text-xs text-muted-foreground leading-none mt-0.5">
                  {patient.mrn} · {calcAge(patientDob) || '—'}{patientGender ? ` · ${patientGender}` : ''}
                </p>
              </div>
            </div>

            <Separator orientation="vertical" className="h-5 shrink-0" />

            {/* Encounter info */}
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground truncate">
                {encounter.title ?? `Encounter #${encounter.id.slice(0, 8).toUpperCase()}`}
              </p>
              <Badge variant={encounter.status === 'open' ? 'success' : 'muted'}>
                {encounter.status === 'open' ? 'Open' : 'Closed'}
              </Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Visibility control (creator only) */}
            {isCreator && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 gap-1.5 text-xs',
                    encounter.visibility === 'private'    && 'text-rose-600',
                    encounter.visibility === 'restricted' && 'text-amber-600',
                    encounter.visibility === 'staff'      && 'text-muted-foreground',
                  )}
                  onClick={() => setVisPopoverOpen(o => !o)}
                >
                  <VisIcon className="h-3.5 w-3.5" />
                  {visOpt.label}
                  <ChevronDown className="h-3 w-3" />
                </Button>

                {visPopoverOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border bg-card shadow-lg p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Visibility</p>
                    <div className="space-y-1">
                      {VISIBILITY_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setEditVisibility(opt.value)}
                          className={cn(
                            'w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-left transition-colors',
                            editVisibility === opt.value
                              ? 'bg-primary/5 text-primary'
                              : 'hover:bg-accent',
                          )}
                        >
                          <opt.Icon className="h-3.5 w-3.5 shrink-0" />
                          <div>
                            <p className="font-medium text-xs">{opt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {editVisibility === 'restricted' && (
                      <div className="space-y-1.5 border-t pt-2">
                        <p className="text-[11px] text-muted-foreground">Accessible to:</p>
                        <div className="flex flex-wrap gap-1">
                          {ROLE_OPTIONS.map(role => (
                            <button
                              key={role}
                              type="button"
                              onClick={() =>
                                setEditVisibleToRoles(prev =>
                                  prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role],
                                )
                              }
                              className={cn(
                                'text-[11px] px-2 py-0.5 rounded border capitalize transition-colors',
                                editVisibleToRoles.includes(role)
                                  ? 'border-primary/50 bg-primary/5 text-primary font-medium'
                                  : 'border-border text-muted-foreground hover:border-primary/30',
                              )}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 border-t pt-2">
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setVisPopoverOpen(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-6 text-xs" onClick={handleSaveVisibility} disabled={savingVis}>
                        {savingVis && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Portal toggle — available to creator on any encounter */}
            {isCreator && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTogglePortal}
                className={cn(
                  'h-7 gap-1.5 text-xs',
                  encounter.portal_visible
                    ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                    : 'text-muted-foreground',
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                {encounter.portal_visible ? 'Portal: On' : 'Portal: Off'}
              </Button>
            )}

            {encounter.status === 'open' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmClose(true)}
                className="text-xs h-7 gap-1.5 text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Close Encounter
              </Button>
            )}
          </div>
        </header>

        {/* Three-pane body */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {encounterId && patientId && (
              <Timeline
                encounterId={encounterId}
                patientId={patientId}
                encounterStatus={encounter.status}
                encounterPortalVisible={encounter.portal_visible}
              />
            )}
          </div>
          <div className="w-80 shrink-0 overflow-hidden">
            <PatientRecord
              patient={patient}
              onPatientUpdate={setPatient}
              encounterId={encounterId}
            />
          </div>
        </div>
      </div>

      {/* Close encounter confirmation */}
      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Encounter?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will mark the encounter as closed. No new blocks can be added.
            The encounter will remain viewable.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmClose(false)}>Cancel</Button>
            <Button
              onClick={handleCloseEncounter}
              disabled={closing}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Close Encounter
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
