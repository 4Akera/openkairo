import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEncounterStore } from '../stores/encounterStore'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { Patient, Encounter, Charge } from '../types'
import { fullName, calcAge, getPatientDob, getPatientGender, cn } from '../lib/utils'
import {
  Button, Badge, Separator,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  TooltipProvider,
} from '../components/ui'
import {
  ArrowLeft, Activity, CheckCircle2, XCircle, Loader2,
  Lock, Users, Globe, ChevronDown, ShieldCheck, UserCircle, ClipboardList,
  AlertTriangle, Settings2, Search, X, Check, DollarSign, Ban,
} from 'lucide-react'
import PatientRecord from '../components/patient-record/PatientRecord'
import Timeline from '../components/timeline/Timeline'
import { pushRecentEncounter } from '../lib/recentItems'

const VISIBILITY_OPTIONS = [
  { value: 'staff',      label: 'All Staff',  Icon: Globe,  desc: 'Visible to everyone' },
  { value: 'restricted', label: 'Restricted', Icon: Users,  desc: 'Selected roles only' },
  { value: 'private',    label: 'Private',    Icon: Lock,   desc: 'Only me' },
] as const

const ROLE_OPTIONS = ['physician', 'nurse', 'receptionist', 'admin']

export default function EncounterPage() {
  const { patientId, encounterId } = useParams<{ patientId: string; encounterId: string }>()
  const navigate = useNavigate()
  const { user, hasRole, roleSlugs, can } = useAuthStore()
  const { nameFormat } = useSettingsStore()
  const { setBlocks, setLockMap, setDefinitions, blocks, definitionMap } = useEncounterStore()

  const [patient, setPatient] = useState<Patient | null>(null)
  const [encounter, setEncounter] = useState<Encounter | null>(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [encounterCharges, setEncounterCharges] = useState<Charge[]>([])
  const [loadingCharges, setLoadingCharges] = useState(false)
  const { billingEnabled } = useSettingsStore()

  // Visibility popover state
  const [visPopoverOpen, setVisPopoverOpen] = useState(false)
  const [editVisibility, setEditVisibility] = useState<'staff' | 'restricted' | 'private'>('staff')
  const [editVisibleToRoles, setEditVisibleToRoles] = useState<string[]>([])
  const [savingVis, setSavingVis] = useState(false)

  // Settings popover state
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)
  const [editAssignedTo, setEditAssignedTo] = useState('')
  const [savingAssignment, setSavingAssignment] = useState(false)
  const [physicians, setPhysicians] = useState<{ id: string; full_name: string }[]>([])
  const [physicianSearch, setPhysicianSearch] = useState('')
  const [physicianDropOpen, setPhysicianDropOpen] = useState(false)

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<'timeline' | 'record'>('timeline')

  const fetchData = useCallback(async () => {
    if (!patientId || !encounterId) return
    const [{ data: pt }, { data: enc }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', patientId).single(),
      supabase.from('encounters').select('*').eq('id', encounterId).single(),
    ])
    if (pt) setPatient(pt)
    if (enc) {
      // Fetch assigned doctor name if needed
      let assignedProfile: { full_name: string } | null = null
      if (enc.assigned_to) {
        const { data: ap } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', enc.assigned_to)
          .single()
        if (ap) assignedProfile = ap
      }
      setEncounter({ ...enc, assigned_profile: assignedProfile })
      setEditVisibility(enc.visibility ?? 'staff')
      setEditVisibleToRoles(enc.visible_to_roles ?? [])
    }
    if (pt && enc) {
      pushRecentEncounter({
        encounterId: enc.id,
        patientId:   pt.id,
        patientName: [pt.first_name, pt.middle_name, pt.last_name].filter(Boolean).join(' '),
        mrn:         pt.mrn,
        title:       enc.title ?? null,
        status:      enc.status as 'open' | 'closed',
        visitedAt:   new Date().toISOString(),
      })
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

  // Cap-required: find active blocks whose definitions are marked required but have empty content
  function isContentEmpty(content: Record<string, unknown>): boolean {
    return Object.values(content).every(v => {
      if (v === null || v === undefined || v === '') return true
      if (Array.isArray(v)) return v.length === 0
      if (typeof v === 'object') return isContentEmpty(v as Record<string, unknown>)
      return false
    })
  }

  const requiredIncomplete = blocks
    .filter(b => {
      if (b.state !== 'active') return false
      const def = definitionMap[b.type]
      if (!def?.cap_required) return false
      return isContentEmpty(b.content as Record<string, unknown>)
    })
    .map(b => definitionMap[b.type]?.name ?? b.type)

  const openCloseDialog = async () => {
    setConfirmClose(true)
    if (billingEnabled && encounterId) {
      setLoadingCharges(true)
      const { data } = await supabase
        .from('charges')
        .select('*')
        .eq('encounter_id', encounterId)
        .order('created_at', { ascending: true })
      setEncounterCharges((data ?? []) as Charge[])

      // Auto-add physician encounter fee if assigned and the physician has a fee configured
      if (encounter?.assigned_to) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('encounter_fee')
          .eq('id', encounter.assigned_to)
          .single()
        if (prof?.encounter_fee && prof.encounter_fee > 0) {
          const existing = (data ?? []) as Charge[]
          const alreadyHasFee = existing.some(c => c.source === 'encounter_close' && c.status !== 'void')
          if (!alreadyHasFee && can('billing.charge')) {
            const { data: feeCharge } = await supabase
              .from('charges')
              .insert({
                patient_id: patientId!,
                encounter_id: encounterId,
                description: `Encounter Fee — ${encounter.assigned_profile?.full_name ?? 'Physician'}`,
                quantity: 1,
                unit_price: prof.encounter_fee,
                status: 'pending',
                source: 'encounter_close',
                created_by: user!.id,
              })
              .select()
              .single()
            if (feeCharge) {
              setEncounterCharges(prev => [...prev, feeCharge as Charge])
            }
          }
        }
      }
      setLoadingCharges(false)
    }
  }

  const handleVoidEncounterCharge = async (chargeId: string) => {
    await supabase.from('charges').update({ status: 'void', voided_reason: 'Voided during encounter close' }).eq('id', chargeId)
    setEncounterCharges(prev => prev.map(c => c.id === chargeId ? { ...c, status: 'void' as const } : c))
  }

  const handleApproveEncounterCharge = async (chargeId: string) => {
    await supabase.from('charges').update({ status: 'pending' }).eq('id', chargeId).eq('status', 'pending_approval')
    setEncounterCharges(prev => prev.map(c => c.id === chargeId ? { ...c, status: 'pending' as const } : c))
  }

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

  const openSettings = async () => {
    if (!encounter) return
    setEditTitle(encounter.title ?? '')
    setEditAssignedTo(encounter.assigned_to ?? '')
    setPhysicianSearch('')
    setPhysicianDropOpen(false)
    setSettingsOpen(true)
    // Fetch physicians list
    const { data } = await supabase.rpc('get_users_with_roles')
    if (data) {
      const list = (data as { id: string; full_name: string; role_slugs: string[] }[])
        .filter(u => u.role_slugs?.includes('physician'))
        .map(u => ({ id: u.id, full_name: u.full_name }))
      setPhysicians(list)
    }
  }

  const handleSaveTitle = async () => {
    if (!encounterId || !encounter) return
    const trimmed = editTitle.trim() || null
    if (trimmed === (encounter.title ?? null)) return
    setSavingTitle(true)
    const { data } = await supabase
      .from('encounters')
      .update({ title: trimmed })
      .eq('id', encounterId)
      .select()
      .single()
    if (data) setEncounter(data)
    setSavingTitle(false)
  }

  const handleSaveAssignment = async (physicianId: string) => {
    if (!encounterId) return
    setSavingAssignment(true)
    const { data } = await supabase
      .from('encounters')
      .update({ assigned_to: physicianId || null })
      .eq('id', encounterId)
      .select()
      .single()
    if (data) {
      // Attach assigned profile name
      let assignedProfile: { full_name: string } | null = null
      if (physicianId) {
        const { data: ap } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', physicianId)
          .single()
        if (ap) assignedProfile = ap
      }
      setEncounter({ ...data, assigned_profile: assignedProfile })
    }
    setSavingAssignment(false)
    setPhysicianDropOpen(false)
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
  const isAssigned = encounter.assigned_to === user?.id
  const canManage = isAssigned || hasRole('physician') || hasRole('admin')

  // View access: must have block.add permission; private/restricted are further gated
  const canView = (() => {
    if (!can('block.add')) return false
    if (encounter.visibility === 'staff') return true
    if (isAssigned || hasRole('physician') || hasRole('admin')) return true
    if (isCreator && !encounter.assigned_to) return true
    if (encounter.visibility === 'restricted') {
      return encounter.visible_to_roles?.some(r => roleSlugs.includes(r)) ?? false
    }
    return false
  })()

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Access Restricted</p>
        <p className="text-xs text-muted-foreground text-center max-w-xs">
          This encounter is private. Only the assigned physician and authorized staff can view it.
        </p>
        <Button variant="outline" onClick={() => navigate(`/patients/${patientId}`)}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patient
        </Button>
      </div>
    )
  }
  const visOpt = VISIBILITY_OPTIONS.find(o => o.value === encounter.visibility) ?? VISIBILITY_OPTIONS[0]
  const VisIcon = visOpt.Icon

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Encounter Header */}
        <header className="border-b bg-card px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/patients/${patientId}`)}
              className="min-h-10 min-w-10 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <Separator orientation="vertical" className="h-5 shrink-0 hidden sm:block" />

            {/* Patient identity */}
            <div className="flex items-center gap-2 shrink-0 min-w-0">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {patient.first_name[0]}{nameFormat === 'three' && patient.middle_name ? patient.middle_name[0] : patient.last_name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold leading-none truncate max-w-[110px] sm:max-w-none">{fullName(patient, nameFormat)}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-none mt-0.5 hidden sm:block">
                  {patient.mrn} · {calcAge(patientDob) || '—'}{patientGender ? ` · ${patientGender}` : ''}
                </p>
                {/* Mobile: MRN only */}
                <p className="text-[10px] text-muted-foreground leading-none mt-0.5 sm:hidden">
                  {patient.mrn}{patientGender ? ` · ${patientGender}` : ''}
                </p>
              </div>
            </div>

            <Separator orientation="vertical" className="h-5 shrink-0 hidden sm:block" />

            {/* Encounter info (desktop) */}
            <div className="items-center gap-2 min-w-0 hidden sm:flex">
              <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground truncate">
                {encounter.title ?? `Encounter #${encounter.id.slice(0, 8).toUpperCase()}`}
              </p>
              <Badge variant={encounter.status === 'open' ? 'success' : 'muted'}>
                {encounter.status === 'open' ? 'Open' : 'Closed'}
              </Badge>
              {encounter.assigned_profile?.full_name && (
                <span className="text-xs text-primary/70 whitespace-nowrap hidden lg:inline">
                  → {encounter.assigned_profile.full_name}
                </span>
              )}
            </div>
            {/* Mobile: title + status badge */}
            <div className="sm:hidden flex items-center gap-1.5 shrink-0 min-w-0">
              <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                {encounter.title ?? `Enc #${encounter.id.slice(0, 6).toUpperCase()}`}
              </p>
              <Badge variant={encounter.status === 'open' ? 'success' : 'muted'} className="shrink-0">
                {encounter.status === 'open' ? 'Open' : 'Closed'}
              </Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Encounter Settings popover */}
            {canManage && encounter.status === 'open' && (
              <div className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openSettings}
                  title="Encounter settings"
                  className="h-7 gap-1 text-xs text-muted-foreground"
                >
                  <Settings2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>

                {settingsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-card shadow-xl overflow-visible flex flex-col max-h-[min(480px,calc(100vh-80px))]">
                      {/* Header */}
                      <div className="px-4 py-3 border-b bg-muted/30 rounded-t-xl">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-primary" />
                          <p className="text-xs font-semibold">Encounter Settings</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Edit title and assignment</p>
                      </div>

                      <div className="p-3 space-y-4 overflow-y-auto flex-1 min-h-0 bg-card">
                        {/* Title */}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Title</p>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); handleSaveTitle() } }}
                              onBlur={handleSaveTitle}
                              placeholder="Encounter title (optional)"
                              className="flex-1 text-xs rounded-lg border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            {savingTitle && <Loader2 className="h-3.5 w-3.5 animate-spin self-center text-muted-foreground" />}
                          </div>
                        </div>

                        {/* Assigned to */}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Assigned Physician</p>
                          <div className="relative">
                            <div className="relative flex items-center">
                              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              <input
                                type="text"
                                placeholder="Search physician…"
                                value={physicianDropOpen
                                  ? physicianSearch
                                  : (physicians.find(p => p.id === editAssignedTo)?.full_name
                                    ?? (encounter.assigned_profile?.full_name || ''))}
                                onFocus={() => { setPhysicianSearch(''); setPhysicianDropOpen(true) }}
                                onChange={e => setPhysicianSearch(e.target.value)}
                                className="w-full text-xs rounded-lg border border-border bg-background pl-8 pr-7 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                              {savingAssignment
                                ? <Loader2 className="absolute right-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                : editAssignedTo && !physicianDropOpen
                                  ? (
                                    <button
                                      type="button"
                                      onClick={() => { setEditAssignedTo(''); handleSaveAssignment('') }}
                                      className="absolute right-2 text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                            </div>

                            {physicianDropOpen && (
                              <>
                                <div className="fixed inset-0 z-[90]" onClick={() => setPhysicianDropOpen(false)} />
                                <div className="absolute z-[100] mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                                  <div className="max-h-40 overflow-y-auto">
                                    <button
                                      type="button"
                                      onClick={() => { setEditAssignedTo(''); handleSaveAssignment('') }}
                                      className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent/60 transition-colors italic"
                                    >
                                      — No assignment —
                                    </button>
                                    {physicians
                                      .filter(p => p.full_name.toLowerCase().includes(physicianSearch.toLowerCase()))
                                      .map(p => (
                                        <button
                                          key={p.id}
                                          type="button"
                                          onClick={() => { setEditAssignedTo(p.id); handleSaveAssignment(p.id) }}
                                          className={cn(
                                            'w-full px-3 py-2 text-left text-xs hover:bg-accent/60 transition-colors flex items-center gap-2',
                                            editAssignedTo === p.id && 'bg-accent/40',
                                          )}
                                        >
                                          <UserCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                          <span className="flex-1">{p.full_name}</span>
                                          {editAssignedTo === p.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                                        </button>
                                      ))}
                                    {physicians.filter(p => p.full_name.toLowerCase().includes(physicianSearch.toLowerCase())).length === 0 && (
                                      <p className="px-3 py-2 text-xs text-muted-foreground italic">No physicians match</p>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Footer */}
                      <div className="px-3 pb-3 flex justify-end gap-1.5 rounded-b-xl bg-card">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSettingsOpen(false)}>
                          Cancel
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={() => setSettingsOpen(false)}>
                          Done
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Combined Privacy / Visibility dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (canManage) {
                    setEditVisibility(encounter.visibility ?? 'staff')
                    setEditVisibleToRoles(encounter.visible_to_roles ?? [])
                    setVisPopoverOpen(o => !o)
                  }
                }}
                title={canManage ? 'Manage visibility & privacy' : `Visibility: ${visOpt.label}`}
                className={cn(
                  'h-7 gap-1 text-xs',
                  encounter.visibility === 'private'    && 'border-rose-200 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:border-rose-900',
                  encounter.visibility === 'restricted' && 'border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-900',
                  encounter.visibility === 'staff'      && 'text-muted-foreground',
                  !canManage                  && 'cursor-default pointer-events-none',
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Privacy</span>
                <span className="flex items-center gap-1">
                  <VisIcon className="h-3 w-3" />
                  <span className="hidden md:inline">{visOpt.label}</span>
                </span>
                {canManage && <ChevronDown className="h-3 w-3 opacity-60" />}
              </Button>

              {visPopoverOpen && canManage && (
                <>
                  {/* backdrop */}
                  <div className="fixed inset-0 z-40" onClick={() => setVisPopoverOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-card shadow-xl overflow-hidden flex flex-col max-h-[min(480px,calc(100vh-80px))]">
                    {/* Header */}
                    <div className="px-4 py-3 border-b bg-muted/30">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <p className="text-xs font-semibold">Privacy & Visibility</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Controls who can see this encounter</p>
                    </div>

                    <div className="p-3 space-y-4 overflow-y-auto flex-1 min-h-0">
                      {/* Visibility section */}
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-0.5">Staff Visibility</p>
                        <div className="space-y-0.5">
                          {VISIBILITY_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setEditVisibility(opt.value)}
                              className={cn(
                                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                                editVisibility === opt.value
                                  ? 'bg-primary/8 ring-1 ring-primary/20'
                                  : 'hover:bg-accent/60',
                              )}
                            >
                              <div className={cn(
                                'h-7 w-7 rounded-md flex items-center justify-center shrink-0 transition-colors',
                                editVisibility === opt.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                              )}>
                                <opt.Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-xs font-medium', editVisibility === opt.value && 'text-primary')}>{opt.label}</p>
                                <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                              </div>
                              {editVisibility === opt.value && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Role chips — only when restricted */}
                      {editVisibility === 'restricted' && (
                        <div className="space-y-1.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 px-3 py-2.5">
                          <p className="text-[11px] font-medium text-amber-800 dark:text-amber-400">Accessible to these roles:</p>
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
                                  'text-[11px] px-2.5 py-1 rounded-full border capitalize transition-all font-medium',
                                  editVisibleToRoles.includes(role)
                                    ? 'border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700'
                                    : 'border-border text-muted-foreground hover:border-amber-300 hover:text-amber-700',
                                )}
                              >
                                {role}
                              </button>
                            ))}
                          </div>
                          {editVisibleToRoles.length === 0 && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-500 italic">Select at least one role</p>
                          )}
                        </div>
                      )}

                    </div>
                    {/* Footer */}
                    <div className="px-3 pb-3 flex justify-end gap-1.5">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setVisPopoverOpen(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={handleSaveVisibility} disabled={savingVis || (editVisibility === 'restricted' && editVisibleToRoles.length === 0)}>
                        {savingVis && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {encounter.status === 'open' && canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={openCloseDialog}
                className="text-xs h-7 gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Close Encounter</span>
                <span className="sm:hidden">Close</span>
              </Button>
            )}
          </div>
        </header>

        {/* Mobile tab bar */}
        <div className="md:hidden flex border-b bg-card shrink-0">
          <button
            onClick={() => setMobileTab('timeline')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors',
              mobileTab === 'timeline'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground',
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Timeline
          </button>
          <button
            onClick={() => setMobileTab('record')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors',
              mobileTab === 'record'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground',
            )}
          >
            <UserCircle className="h-3.5 w-3.5" />
            Patient Info
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          <div className={cn(
            'flex-1 overflow-hidden',
            mobileTab !== 'timeline' && 'hidden md:block',
          )}>
            {encounterId && patientId && (
              <Timeline
                encounterId={encounterId}
                patientId={patientId}
                encounterStatus={encounter.status}
              />
            )}
          </div>
          <div className={cn(
            'w-full md:w-80 shrink-0 overflow-hidden',
            mobileTab !== 'record' && 'hidden md:block',
          )}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close Encounter?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              This will mark the encounter as closed. No new blocks can be added.
              The encounter will remain viewable.
            </p>

            {requiredIncomplete.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                    Required blocks are incomplete
                  </p>
                </div>
                <ul className="space-y-0.5 pl-5 list-disc">
                  {requiredIncomplete.map(name => (
                    <li key={name} className="text-xs text-amber-700 dark:text-amber-400">{name}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-600 dark:text-amber-500">
                  You can still close, but these blocks will be left empty.
                </p>
              </div>
            )}

            {/* Billing Review */}
            {billingEnabled && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    Billing Review
                  </p>
                </div>

                {loadingCharges ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : encounterCharges.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No charges for this encounter.</p>
                ) : (
                  <>
                    <div className="space-y-1">
                      {encounterCharges.map(c => (
                        <div
                          key={c.id}
                          className={cn(
                            'flex items-center gap-2 text-xs rounded-md px-2 py-1.5 bg-white/60 dark:bg-white/5 border',
                            c.status === 'void' ? 'opacity-40 border-red-200' :
                            c.status === 'pending_approval' ? 'border-blue-200' : 'border-emerald-200/50',
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={cn('font-medium truncate', c.status === 'void' && 'line-through')}>
                              {c.description}
                            </p>
                            {c.source !== 'manual' && (
                              <p className="text-[10px] text-muted-foreground">{c.source.replace('_', ' ')}</p>
                            )}
                          </div>
                          {c.status === 'pending_approval' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-blue-50 border-blue-200 text-blue-700 font-semibold dark:bg-blue-950/30 dark:text-blue-400 shrink-0">
                              Pending Approval
                            </span>
                          )}
                          {c.status === 'pending_insurance' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-purple-50 border-purple-200 text-purple-700 font-semibold dark:bg-purple-950/30 dark:text-purple-400 shrink-0">
                              Insurance
                            </span>
                          )}
                          {c.status === 'pending' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold dark:bg-emerald-950/30 dark:text-emerald-400 shrink-0">
                              Pending Payment
                            </span>
                          )}
                          <span className={cn(
                            'font-mono text-xs shrink-0',
                            c.status === 'void' ? 'line-through text-muted-foreground' : 'text-emerald-700 dark:text-emerald-400',
                          )}>
                            {(c.quantity * c.unit_price).toFixed(2)}
                          </span>
                          {/* Approve pending_approval — billing users only */}
                          {c.status === 'pending_approval' && can('billing.charge') && (
                            <button
                              type="button"
                              onClick={() => handleApproveEncounterCharge(c.id)}
                              title="Approve charge"
                              className={cn(
                                'h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-all border',
                                'bg-emerald-100 text-emerald-600 border-emerald-300',
                                'hover:bg-emerald-500 hover:text-white hover:border-emerald-500 hover:scale-110',
                                'dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700',
                              )}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </button>
                          )}
                          {/* Cancel — any non-final status, billing users */}
                          {c.status !== 'void' && c.status !== 'paid' && can('billing.charge') && (
                            <button
                              type="button"
                              onClick={() => handleVoidEncounterCharge(c.id)}
                              title="Cancel charge"
                              className={cn(
                                'h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-all border',
                                'bg-red-50 text-red-400 border-red-200',
                                'hover:bg-red-500 hover:text-white hover:border-red-500 hover:scale-110',
                                'dark:bg-red-950/30 dark:text-red-400 dark:border-red-800',
                              )}
                            >
                              <Ban className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const active = encounterCharges.filter(c => c.status !== 'void' && c.status !== 'waived' && c.status !== 'pending_approval')
                      const total = active.reduce((sum, c) => sum + c.quantity * c.unit_price, 0)
                      return total > 0 ? (
                        <div className="flex justify-between items-center pt-1 border-t border-emerald-200/50 text-xs">
                          <span className="font-medium text-emerald-800 dark:text-emerald-300">Total</span>
                          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{total.toFixed(2)}</span>
                        </div>
                      ) : null
                    })()}
                  </>
                )}
              </div>
            )}
          </div>

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
